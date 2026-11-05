import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { sendWhatsAppMessage, addToHistory } from '@/lib/whatsapp';
import { recordKeniaUsage } from '@/lib/kenia-runtime';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';
import { invalidatePosWebReservations } from '@/lib/pos-web-reservations';

export const dynamic = 'force-dynamic';

const ORDER_STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  pending_stock: 0,
  paid: 1,
  processing: 1,
  payment_expired: 2,
  payment_review: 3,
  payment_confirmed: 4,
  confirmed: 4,
  preparing: 5,
  preparing_shipping: 5,
  ready_to_ship: 5,
  negotiation: 5,
  shipped: 6,
  delivered: 7,
  cancelled: 8,
};

function resolveShippingUpdateStatus(statuses: string[], hasProof: boolean): string {
  const normalized = statuses.map(status => String(status || '').toLowerCase()).filter(Boolean);
  const known = normalized.filter(status => status in ORDER_STATUS_PRIORITY);
  const furthest = known.sort((a, b) => ORDER_STATUS_PRIORITY[b] - ORDER_STATUS_PRIORITY[a])[0];
  const unknownStatus = normalized.find(status => !(status in ORDER_STATUS_PRIORITY));

  // Los datos de despacho no deben hacer retroceder un pedido que ya avanzó.
  if (furthest && ORDER_STATUS_PRIORITY[furthest] >= ORDER_STATUS_PRIORITY.payment_review) return furthest;
  if (unknownStatus) return unknownStatus;
  if (hasProof) return 'payment_review';
  if (normalized.includes('payment_expired')) return 'payment_expired';
  return 'paid';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, orderCode, customerName, customerRut, customerEmail, region, comuna, address, additionalInfo, shippingAgency } = body as {
      orderId?: string;
      orderCode: string;
      customerName?: string;
      customerRut?: string;
      customerEmail?: string;
      region: string;
      comuna: string;
      address: string;
      additionalInfo?: string;
      shippingAgency?: string;
    };

    if ((!orderId && !orderCode) || !region || !comuna || !address) {
      return NextResponse.json({ error: 'Faltan datos de envío' }, { status: 400 });
    }

    const lookup = orderId
      ? await resolveOrderById(orderId, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') {
      return NextResponse.json({ error: 'Ese número corresponde a más de un pedido. Abre el enlace directo de tu pedido para guardar tus datos.', code: 'AMBIGUOUS_ORDER_CODE' }, { status: 409 });
    }
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const { order, collectionId } = lookup.match as any;

    const customerFields = {
      ...(customerName?.trim() ? { CUSTOMERNAME: customerName.trim() } : {}),
      ...(customerRut?.trim() ? { CUSTOMERRUT: customerRut.trim() } : {}),
      ...(customerEmail?.trim() ? { CUSTOMEREMAIL: customerEmail.trim() } : {}),
    };
    const shippingFields = {
      ...customerFields,
      REGION: region,
      COMUNA: comuna,
      ADDRESS: address,
      ADDITIONALINFO: additionalInfo || '',
      SHIPPINGAGENCY: shippingAgency || '',
    };

    // Leer estado y guardar los datos en una sola transacción. El formulario puede
    // quedar abierto horas: una confirmación hecha por caja mientras tanto debe
    // ganar y no ser reemplazada por el estado obsoleto del formulario.
    const db = getAdminDb();
    const orderRef = db.collection(collectionId).doc(order.$id);
    const isVendor = collectionId === VENDOR_ORDERS_COLLECTION_ID || Boolean(order.IS_VENDOR_ORDER || order.VENDOR_ID);
    const mirrorCollection = collectionId === VENDOR_ORDERS_COLLECTION_ID
      ? ORDERS_COLLECTION_ID
      : VENDOR_ORDERS_COLLECTION_ID;
    const mirrorRef = isVendor ? db.collection(mirrorCollection).doc(order.$id) : null;

    const orderForNotify = await db.runTransaction(async transaction => {
      const freshSnap = await transaction.get(orderRef);
      const mirrorSnap = mirrorRef ? await transaction.get(mirrorRef) : null;
      if (!freshSnap.exists) throw new Error('Pedido no encontrado');

      const freshOrder = freshSnap.data() || {};
      const mirrorOrder = mirrorSnap?.exists ? mirrorSnap.data() || {} : null;
      const nextStatus = resolveShippingUpdateStatus(
        [freshOrder.STATUS, mirrorOrder?.STATUS].filter(Boolean),
        Boolean(freshOrder.PAYMENTPROOFURL || mirrorOrder?.PAYMENTPROOFURL),
      );
      const updates = { ...shippingFields, STATUS: nextStatus, UPDATEDAT: Date.now() };

      transaction.update(orderRef, updates);
      if (mirrorRef && mirrorSnap?.exists) transaction.update(mirrorRef, updates);
      return { ...freshOrder, ...updates };
    });

    // Enviar mensaje de confirmación por WhatsApp al cliente desde el bot de Iván
    const phoneToNotify = orderForNotify.CUSTOMERPHONE || order.CUSTOMERPHONE || '';
    if (phoneToNotify) {
      const confirmationMsg = `Sus datos fueron recibidos con exito, el numero de soporte se comunicara para informarle el estado de su pedido ni bien salga, tambien puede ver el estado de su pedido en ${request.nextUrl.origin}/productos en la pestana mis pedidos en mi cuenta.`;
      try {
        // Esperar el envío antes de responder: una tarea .then() sin await puede
        // quedar cortada cuando Vercel cierra la función serverless.
        await sendWhatsAppMessage(phoneToNotify, confirmationMsg);
        await addToHistory(phoneToNotify, 'assistant', confirmationMsg);
        await recordKeniaUsage(phoneToNotify, { balatinStep: 'completed' });
        console.info('[shipping-data] WhatsApp confirmation accepted:', JSON.stringify({ orderId: order.$id }));
      } catch (err) {
        console.error('[shipping-data] Error enviando WhatsApp de confirmación:', err);
      }
    }

    // Invalidar la caché del badge "Pagar tu pedido" (my-orders-status).
    try { revalidateTag('orders'); } catch {}
    // SHIPPINGAGENCY define si los pedidos ya despachados siguen reservando
    // stock para retiro en tienda.
    if (!isVendor && collectionId === ORDERS_COLLECTION_ID) invalidatePosWebReservations();

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API catalogo/shipping-data] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al guardar datos de envío' }, { status: 500 });
  }
}
