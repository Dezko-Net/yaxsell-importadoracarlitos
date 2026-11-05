import 'server-only';
import { ID, Query } from '@/lib/db';
import { SMART_NOTIFICATIONS_ENABLED } from '@/lib/feature-flags';
import type { Order, OrderStatus } from '@/types/admin';
import {
  getServices,
  getFirebaseConfig,
  NOTIFICATIONS_COLLECTION,
  USERS_COLLECTION,
  createDocument,
  listDocuments,
} from '@/lib/db';
import { GEMINI_TEXT_MODELS } from '@/lib/gemini-models';

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'promo'
  | 'order'
  | 'stock'
  | 'product'
  | 'gift';

export interface CreateNotificationInput {
  title: string;
  message: string;
  type: NotificationType;
  userId?: string;
  broadcast?: boolean;
  link?: string;
  refKey?: string;
}

function buildDataPayload(link?: string, refKey?: string): string | undefined {
  if (!link && !refKey) return undefined;
  return JSON.stringify({ link, refKey });
}

function parseDataField(data?: unknown): { link?: string; refKey?: string } {
  if (!data || typeof data !== 'string') return {};
  try {
    return JSON.parse(data) as { link?: string; refKey?: string };
  } catch {
    return {};
  }
}

export function getNotificationLink(doc: Record<string, unknown>): string | undefined {
  const direct = (doc.link || doc.LINK) as string | undefined;
  if (direct) return direct;
  return parseDataField(doc.data).link;
}

const ORDER_NOTIFY_STATUSES: OrderStatus[] = [
  'paid',
  'payment_confirmed',
  'shipped',
  'delivered',
];

const ORDER_STATUS_COPY: Record<
  OrderStatus,
  { title: string; buildMessage: (code: string) => string } | null
> = {
  pending_stock: {
    title: 'Stock Confirmado',
    buildMessage: (c) => `El stock de tu pedido ${c} está confirmado y reservado. Realiza la transferencia y sube tu comprobante.`,
  },
  pending: {
    title: 'Stock Confirmado',
    buildMessage: (c) => `El stock de tu pedido ${c} está confirmado y reservado. Realiza la transferencia y sube tu comprobante.`,
  },
  processing: {
    title: 'Stock Confirmado',
    buildMessage: (c) => `El stock de tu pedido ${c} está confirmado. Realiza la transferencia y sube tu comprobante.`,
  },
  paid: {
    title: 'Stock Confirmado',
    buildMessage: (c) => `¡Buenas noticias! El stock de tu pedido ${c} está confirmado. Realiza la transferencia y sube tu comprobante.`,
  },
  payment_review: {
    title: 'Revisando Pago',
    buildMessage: (c) => `Hemos recibido tu comprobante de pago para el pedido ${c}. Estamos verificando el pago.`,
  },
  payment_confirmed: {
    title: 'Pago Confirmado',
    buildMessage: (c) => `¡Tu pago del pedido ${c} fue verificado con éxito! Estamos preparando tu pedido.`,
  },
  negotiation: {
    title: 'Negociando',
    buildMessage: (c) => `Tu pedido ${c} está en proceso de negociación. Te contactaremos pronto.`,
  },
  shipped: {
    title: 'Embalado',
    buildMessage: (c) => `Tu pedido ${c} ha sido embalado y está listo para ser entregado a la agencia de transporte.`,
  },
  delivered: {
    title: 'Entregado a Agencia',
    buildMessage: (c) => `¡Tu pedido ${c} fue entregado a la agencia de transporte! Ya está en camino.`,
  },
  cancelled: {
    title: 'Cancelado',
    buildMessage: (c) => `Tu pedido ${c} fue cancelado. Si tienes dudas, contáctanos.`,
  },
};

function normalizeRead(doc: Record<string, unknown>): boolean {
  return !!(doc.isRead ?? doc.read ?? doc.READ);
}

/** Crea notificación vía cliente (admin logueado). */
export async function createNotificationClient(input: CreateNotificationInput) {
  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();
  const payload: Record<string, unknown> = {
    title: input.title,
    message: input.message,
    type: input.type,
    isRead: false,
    userId: input.userId || (input.broadcast ? 'all' : ''),
  };
  const data = buildDataPayload(input.link, input.refKey);
  if (data) payload.data = data;
  return databases.createDocument(databaseId, NOTIFICATIONS_COLLECTION, ID.unique(), payload);
}

/** Crea notificación vía API key (server). */
export async function createNotificationServer(input: CreateNotificationInput) {
  const payload: Record<string, unknown> = {
    title: input.title,
    message: input.message,
    type: input.type,
    isRead: false,
    userId: input.userId || (input.broadcast ? 'all' : ''),
  };
  const data = buildDataPayload(input.link, input.refKey);
  if (data) payload.data = data;
  // Usar 'unique()' para que Appwrite genere el ID automáticamente
  return createDocument(NOTIFICATIONS_COLLECTION, 'unique()', payload);
}

async function existsByRefKey(refKey: string, userId?: string): Promise<boolean> {
  try {
    const needle = `"refKey":"${refKey}"`;
    const queries = [Query.contains('data', needle), Query.limit(5)];
    if (userId) queries.unshift(Query.equal('userId', userId));
    const res = await listDocuments(NOTIFICATIONS_COLLECTION, queries);
    return (res.total ?? res.documents?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function resolveUserIdFromOrder(order: Partial<Order>): Promise<string | null> {
  if (order.USERID && order.USERID !== 'guest') return order.USERID;
  if (!order.CUSTOMEREMAIL) return null;
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const res = await databases.listDocuments(databaseId, USERS_COLLECTION, [
      Query.equal('email', order.CUSTOMEREMAIL),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as { userId?: string } | undefined;
    return doc?.userId || null;
  } catch {
    return null;
  }
}

/** Notifica al cliente cuando cambia el estado del pedido. */
export async function notifyOrderStatusChange(
  order: Partial<Order>,
  previousStatus: OrderStatus | string | undefined,
  newStatus: OrderStatus | string
): Promise<void> {
  if (previousStatus === newStatus) return;
  if (!ORDER_NOTIFY_STATUSES.includes(newStatus as OrderStatus)) return;

  const copy = ORDER_STATUS_COPY[newStatus as OrderStatus];
  if (!copy) return;

  const userId = await resolveUserIdFromOrder(order);

  const code = order.ORDERCODE || order.$id || 'tu pedido';
  const refKey = `order:${order.$id}:${newStatus}`;

  // In-app notification only for registered users (not guests)
  if (userId && !(await existsByRefKey(refKey, userId))) {
    let title = copy.title;
    let message = copy.buildMessage(code);

    if (newStatus === 'shipped' && order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA') {
      title = 'Listo para retirar';
      message = `Tu pedido ${code} está listo para ser retirado en tienda.`;
    }

    try {
      // Try server-side first (works when called from API route), fallback to client
      await createNotificationServer({
        title,
        message,
        type: 'order',
        userId,
        link: `/cuenta/pedidos`,
        refKey,
      });
    } catch {
      try {
        await createNotificationClient({
          title,
          message,
          type: 'order',
          userId,
          link: `/cuenta/pedidos`,
          refKey,
        });
      } catch (e2) {
        console.warn('[notifyOrderStatusChange] In-app notification failed:', e2);
      }
    }
  }

  // ── 2. Send Automatic WhatsApp Notification (works for guests too) ──
  // El checkout y el flujo de WhatsApp entregan al cliente sus instrucciones de pago al reservar el stock.
  // Este manejador se reserva para cambios de estado posteriores.
  if (!order.CUSTOMERPHONE) return;
  if (newStatus === 'paid') return;
  const msgId = `wa_order_${order.$id}_${newStatus}`;
  try {
    const { getWhatsAppDocId, sendWhatsAppTemplate, formatWhatsAppPhone, addToHistory } = await import('@/lib/whatsapp');
    const { getDocument, ADMIN_CHAT_COLLECTION_ID } = await import('@/lib/db');

    const docId = getWhatsAppDocId(msgId, 'assistant');
    let alreadySent = false;
    try {
      await getDocument(ADMIN_CHAT_COLLECTION_ID, docId);
      alreadySent = true;
    } catch {
      alreadySent = false;
    }

    if (!alreadySent) {
      const customerName = order.CUSTOMERNAME ? order.CUSTOMERNAME.split(' ')[0] : '';
      const phone = formatWhatsAppPhone(order.CUSTOMERPHONE);
      const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
      const lang = 'es_CL';

      if (!WA_TOKEN) return;

      // ── Helper: generate AI-enhanced message for status ──
      const STATUS_LABELS: Record<string, string> = {
        pending: 'Stock Confirmado',
        pending_stock: 'Stock Confirmado',
        paid: 'Stock Confirmado',
        payment_confirmed: 'Pago Confirmado',
        shipped: 'Pedido Embalado',
        delivered: 'Entregado a Agencia',
      };

      const generateAIMessage = async (status: string, name: string, orderCode: string): Promise<string> => {
        const fallbackMessages: Record<string, string> = {
          pending: `¡Hola ${name}! 🐾 El stock de tu pedido #${orderCode} está confirmado y reservado. Ya puedes transferir y enviar tu comprobante 📦✨`,
          pending_stock: `¡Hola ${name}! 🐾 El stock de tu pedido #${orderCode} está confirmado y reservado. Ya puedes transferir y enviar tu comprobante 📦✨`,
          paid: `¡Hola ${name}! 🐾 ¡Buenas noticias! El stock de tu pedido #${orderCode} está confirmado ✔️ Ya puedes realizar la transferencia y subir tu comprobante para avanzar 📦✨`,
          payment_confirmed: `¡Hola ${name}! 🐾 Soy Yaxbot de Importadora Carlitos 🇨🇱✨ Te escribo feliz para contarte que tu pago del pedido #${orderCode} fue verificado con éxito. Ahora empezamos a preparar tu pedido con mucho cuidado. ¡Pronto te aviso del avance! �`,
          delivered: `¡Hola ${name}! 🐾 Tu pedido #${orderCode} fue entregado a la agencia de transporte 🚚💨 Te adjunto el comprobante para que puedas rastrear tu envío. ¡Pronto lo tendrás en tus manos! ✨`,
          shipped: `¡Hola ${name}! 🐾 Tu pedido #${orderCode} ya está embaladito y listo para salir 📦✨ En cuanto lo entreguemos a la agencia te mando el comprobante con el código de seguimiento. ¡Miau!`,
        };

        try {
          if (!SMART_NOTIFICATIONS_ENABLED) throw new Error('Smart notifications disabled');
          const { getGeminiAuthHeaders, buildGeminiUrl } = await import(/* webpackIgnore: true */ '@/lib/google-auth');
          const GEMINI_MODELS = GEMINI_TEXT_MODELS;
          const statusLabel = STATUS_LABELS[status] || status;
          const prompt = `Eres Yaxbot, el gato de la suerte y asistente de Importadora Carlitos (tienda de perfumes, ropa y variedad). Escribe un mensaje corto (máx 3 líneas) para notificar a ${name} que su pedido #${orderCode} cambió de estado a: ${statusLabel}. Personalidad: cercana, tranquila, usa emojis felinos con moderación (�✨📦). No inventes información. Sé breve y alegre. Solo el mensaje, sin saludo separado.`;

          const geminiHeaders = await getGeminiAuthHeaders();
          for (const model of GEMINI_MODELS) {
            const url = buildGeminiUrl(model);
            const res = await fetch(url, {
              method: 'POST',
              headers: geminiHeaders,
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
              }),
            });
            if (res.ok) {
              const data = await res.json();
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) return text.replace(/\*+/g, '').trim();
            }
            if (res.status !== 503 && res.status !== 429) break;
          }
        } catch (e) {
          console.warn('[notifyOrderStatusChange] AI message generation failed:', e);
        }

        return fallbackMessages[status] || `¡Hola ${name}! 🐾 Tu pedido #${orderCode} cambió de estado a: ${STATUS_LABELS[status] || status} ✨`;
      };

      // ── Smart 24h window check ──
        const { getLastUserMessageTime } = await import('@/lib/whatsapp');
        const lastUserMsgTime = await getLastUserMessageTime(phone);
        const now = Date.now();
        const WINDOW_MS = 23 * 60 * 60 * 1000; // 23 hours (margin)
        const needsTemplate = !lastUserMsgTime || (now - lastUserMsgTime) > WINDOW_MS;

        // ── Generate AI-enhanced message ──
        const aiMessage = await generateAIMessage(newStatus, customerName, code);

        if (needsTemplate) {
          // Outside 24h window: send template first (opens window), then AI message
          const statusLabel = STATUS_LABELS[newStatus] || newStatus;
          const templateName = 'estado_de_pedido';
          const components = [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: `#${code}` },
                { type: 'text', text: statusLabel }
              ]
            }
          ];

          await sendWhatsAppTemplate(phone, templateName, lang, components, WA_TOKEN);

          // Send AI message after template (window now open)
          try {
            const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
            await sendWhatsAppMessage(phone, aiMessage, WA_TOKEN);
          } catch (e) {
            console.warn('[notifyOrderStatusChange] AI follow-up message failed:', e);
          }
        } else {
          // Inside 24h window: send AI message directly (no template needed)
          try {
            const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
            await sendWhatsAppMessage(phone, aiMessage, WA_TOKEN);
          } catch (e) {
            console.warn('[notifyOrderStatusChange] AI direct message failed:', e);
          }
        }

        const simulatedMessage = `[Notificación de Estado] ${aiMessage}`;
        await addToHistory(phone, 'assistant', simulatedMessage, msgId);

        // ── Send photo for shipped (caja embalada = SHIPPINGPROOFURL) ──
        if (newStatus === 'shipped' && order.SHIPPINGPROOFURL) {
          try {
            const { sendWhatsAppImage } = await import('@/lib/whatsapp');
            const photoCaption = `¡Aquí está tu pedido #${code} todo embaladito y listo! 📦✨`;
            await sendWhatsAppImage(phone, order.SHIPPINGPROOFURL, photoCaption, WA_TOKEN);
          } catch (e) {
            console.warn('[notifyOrderStatusChange] Photo send failed (shipped):', e);
          }
        }

        // ── Send photo for delivered (comprobante de agencia = SHIPPINGPROOFURL or PAYMENTPROOFURL) ──
        if (newStatus === 'delivered') {
          try {
            const { sendWhatsAppImage } = await import('@/lib/whatsapp');
            const trackingInfo = (order as any).TRACKINGNUMBER ? `\n\n📋 N° de seguimiento: ${(order as any).TRACKINGNUMBER}` : '';
            const agency = order.SHIPPINGAGENCY ? `\n🚚 Agencia: ${order.SHIPPINGAGENCY}` : '';
            const photoUrl = order.SHIPPINGPROOFURL || (order as any).AGENCYPROOFURL;
            if (photoUrl) {
              const photoCaption = `¡Tu pedido #${code} fue entregado a la agencia! 🚚💨 Aquí va el comprobante para que rastrees tu envío 👇${trackingInfo}${agency}`;
              await sendWhatsAppImage(phone, photoUrl, photoCaption, WA_TOKEN);
            } else {
              // No photo, just text with tracking info
              const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
              const textMsg = `¡Tu pedido #${code} fue entregado a la agencia! 🚚💨${trackingInfo}${agency}\n\n¡Pronto lo tendrás en tus manos! ✨`;
              await sendWhatsAppMessage(phone, textMsg, WA_TOKEN);
            }
          } catch (e) {
            console.warn('[notifyOrderStatusChange] Photo/text send failed (delivered):', e);
          }
        }
    }
  } catch (e) {
    console.warn('[notifyOrderStatusChange] WhatsApp notif error:', e);
  }
}

/** Oferta activa — broadcast a todos los usuarios logueados. */
export async function notifyTimedOfferActivated(offer: {
  $id: string;
  title?: string;
  productName?: string;
  discountPercentage?: number;
  discountPrice?: number;
}): Promise<void> {
  const refKey = `offer:${offer.$id}:active`;
  if (await existsByRefKey(refKey)) return;

  const name = offer.productName || offer.title || 'producto';
  const pct = offer.discountPercentage ? ` (${offer.discountPercentage}% OFF)` : '';
  const priceVal = offer.discountPrice ? ` a sólo $${new Intl.NumberFormat('es-CL').format(offer.discountPrice)}` : '';

  await createNotificationServer({
    title: '¡Nueva oferta disponible!',
    message: `Aprovecha la oferta en ${name}${priceVal}${pct}.`,
    type: 'promo',
    broadcast: true,
    userId: 'all',
    link: '/ofertas',
    refKey,
  });
}

/** Producto nuevo — broadcast. */
export async function notifyNewProduct(product: {
  $id: string;
  NAME?: string;
}): Promise<void> {
  const refKey = `product:${product.$id}:new`;
  if (await existsByRefKey(refKey)) return;

  await createNotificationServer({
    title: '¡Nuevo producto!',
    message: `Ya está disponible: ${product.NAME || 'un producto nuevo'} en el catálogo.`,
    type: 'product',
    broadcast: true,
    userId: 'all',
    link: `/productos/${product.$id}`,
    refKey,
  });
}

/** Cupón o regalo sin reclamar. */
export async function notifyUnclaimedReward(
  userId: string,
  kind: 'welcome_gift' | 'coupon',
  detail?: string
): Promise<void> {
  const refKey = `${kind}:${userId}`;
  if (await existsByRefKey(refKey, userId)) return;

  const isGift = kind === 'welcome_gift';
  await createNotificationServer({
    title: isGift ? '¡Tienes un regalo de bienvenida!' : '¡Cupón disponible!',
    message: isGift
      ? 'Reclamá tu regalo de bienvenida antes de que expire.'
      : detail || 'Tienes un cupón disponible para tu próxima compra.',
    type: 'gift',
    userId,
    link: isGift ? '/cuenta/regalos' : '/cuenta/regalos',
    refKey,
  });
}

export async function markNotificationRead(documentId: string) {
  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();
  await databases.updateDocument(databaseId, NOTIFICATIONS_COLLECTION, documentId, {
    isRead: true,
  });
}

export function isNotificationUnread(doc: Record<string, unknown>): boolean {
  return !normalizeRead(doc);
}
