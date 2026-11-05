import { NextRequest, NextResponse } from "next/server";
import {
  sendWhatsAppMessage,
  formatWhatsAppPhone,
  sendWhatsAppList,
  sendWhatsAppButtons,
  markAsRead,
  getHistory,
  addToHistory,
  clearHistory,
  getWhatsAppDocId,
} from "@/lib/whatsapp";

export const maxDuration = 60;
import {
  serverListDocuments,
  serverUpdateDocument,
  serverGetDocument,
  serverCreateDocument,
  serverUploadFile,
  getPublicFileUrl,
  getAdminDb,
} from "@/lib/db-server";
import { getAdminAlertPhone, notifyPaymentUploaded } from "@/lib/notify-admin";
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { MEDIA_BUCKET_ID } from "@/lib/db";
import {
  estimateTokensFromText,
  getKeniaConfig,
  getKeniaUsage,
  hydratePrompt,
  recordKeniaUsage,
  setKeniaBlocked,
  resetKeniaUsage,
} from "@/lib/kenia-runtime";
import { getGeminiAuthHeaders, buildGeminiUrl } from "@/lib/google-auth";
import { GEMINI_TEXT_MODELS } from "@/lib/gemini-models";
import {
  PRODUCTS_COLLECTION_ID,
  ORDERS_COLLECTION_ID,
  VENDOR_ORDERS_COLLECTION_ID,
  USERS_COLLECTION_ID,
  CATEGORIES_COLLECTION_ID,
} from "@/lib/db";
import { STORE_SETTINGS_COLLECTION } from "@/lib/db-server";
import { parseShippingData } from "@/lib/shipping-parser";
import { deductStockForOrder, isVendorOrder, isUnlimitedStockEnabled, restoreStockForOrder } from "@/lib/order-stock-service";
import { getOrderInventoryConnectionMode, inventoryStockUpdate } from '@/lib/inventory-mode';
import { getConfiguredOrderExpirationMinutes } from "@/lib/order-expiration-settings";
import { calculatePaymentDeadline } from "@/lib/store-schedule";
import { calculateOrderStockRisk } from "@/lib/stock-risk";
import { PAYMENT_PROOF_GRACE_MS } from "@/lib/payment-deadline";
import { reserveOrderCode, resolveOrderByCode, resolveOrderById } from "@/lib/order-identity";
import { invalidatePosWebReservations } from '@/lib/pos-web-reservations';
import { getPublicSiteUrl } from '@/lib/public-site-url';

// ─── Config ────────────────────────────────────────────────────────────────────
const SITE_URL = getPublicSiteUrl();
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const ENV_ADMINS = process.env.ADMIN_WHATSAPP_NUMBER || "";
const ADMIN_PHONES = ENV_ADMINS.split(",").map((num) => num.replace(/\D/g, "").trim()).filter(Boolean);
const CUSTOMER_SUPPORT_PHONE = (process.env.CUSTOMER_SUPPORT_WHATSAPP_NUMBER || "").replace(/\D/g, "");
const WORKER_WHATSAPP_PHONE = (process.env.WHATSAPP_WORKER_NUMBER || "").replace(/\D/g, "");

async function resolveWebhookOrder(reference: string) {
  const cleanReference = String(reference || '').trim();
  const byId = await resolveOrderById(cleanReference, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
  if (byId.status === 'found') return byId;
  return resolveOrderByCode(cleanReference, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
}
const CUSTOMER_SITE_URL = SITE_URL.replace(/\/+$/, "");
// Número histórico del flujo de confirmación manual; se conserva para compatibilidad con pedidos antiguos.
const STOCK_VERIFIER_PHONE = (process.env.STOCK_VERIFIER_WHATSAPP_NUMBER || "").replace(/\D/g, "");
const PAYMENT_PROOF_ELIGIBLE_STATUSES = new Set([
  "pending",
  "pending_stock",
  "processing",
  "paid",
  "payment_expired",
]);

function hasPaymentProof(order: any): boolean {
  return Boolean(String(order?.PAYMENTPROOFURL || "").trim());
}

function orderTimestamp(order: any): number {
  const raw = order?.UPDATEDAT || order?.CREATEDAT || order?.createdAt || order?.$createdAt;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(raw || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getOrderFromEitherCollection(orderId: string) {
  for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
    try {
      const order = await serverGetDocument(collectionId, orderId);
      return { order, collectionId };
    } catch {}
  }
  return null;
}

async function findLatestOrderAwaitingProof(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const localNumber = digits.startsWith("56") ? digits.slice(2) : digits;
  const variants = Array.from(new Set([
    digits,
    `+${digits}`,
    localNumber,
    `+${localNumber}`,
  ].filter(Boolean)));
  if (!variants.length) return null;

  const db = getAdminDb();
  const matches = await Promise.all([ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID].map(async (collectionId) => {
    const collection = db.collection(collectionId);
    const [byPhone, byLinkedPhone] = await Promise.all([
      collection.where("CUSTOMERPHONE", "in", variants).limit(30).get().catch(() => null),
      collection.where("LINKED_WHATSAPP", "array-contains-any", variants).limit(30).get().catch(() => null),
    ]);
    const docs = new Map<string, any>();
    for (const snapshot of [byPhone, byLinkedPhone]) {
      for (const doc of snapshot?.docs || []) {
        docs.set(doc.id, { $id: doc.id, ...doc.data(), __collectionId: collectionId });
      }
    }
    return Array.from(docs.values());
  }));

  return matches.flat()
    .sort((a, b) => orderTimestamp(b) - orderTimestamp(a))
    .find((order) => PAYMENT_PROOF_ELIGIBLE_STATUSES.has(String(order.STATUS || "pending").toLowerCase()) && !hasPaymentProof(order)) || null;
}

// ─── Helper: Leer datos bancarios desde Firestore ─────────────────────────────
let cachedBankDetails: any = null;
let cachedBankDetailsTime = 0;
const BANK_CACHE_TTL = 30_000; // 30 segundos

async function getBankDetails() {
  const now = Date.now();
  if (cachedBankDetails && (now - cachedBankDetailsTime < BANK_CACHE_TTL)) {
    return cachedBankDetails;
  }
  try {
    const col = getAdminDb().collection(STORE_SETTINGS_COLLECTION);
    const [mainSnap, configSnap] = await Promise.all([
      col.doc("main").get(),
      col.doc("config").get(),
    ]);
    if (mainSnap.exists || configSnap.exists) {
      const doc = {
        ...(configSnap.exists ? configSnap.data() : {}),
        ...(mainSnap.exists ? mainSnap.data() : {}),
      } as any;
      const details = {
        holder: doc.bankAccountHolder || doc.BANKACCOUNTHOLDER || "Importadora Carlitos",
        rut: doc.bankRut || doc.BANKRUT || "78267426-9",
        bank: doc.bankName || doc.BANKNAME || "Banco de Chile",
        type: doc.bankAccountType || doc.BANKACCOUNTTYPE || "Cuenta Corriente",
        account: doc.bankAccountNumber || doc.BANKACCOUNTNUMBER || "4081220201",
        email: doc.bankEmail || doc.BANKEMAIL || "",
      };
      cachedBankDetails = details;
      cachedBankDetailsTime = now;
      return details;
    }
  } catch (e) {
    console.warn("[WhatsApp Webhook] Error leyendo datos bancarios:", e);
  }
  return {
    holder: "Importadora Carlitos",
    rut: "78267426-9",
    bank: "Banco de Chile",
    type: "Cuenta Corriente",
    account: "4081220201",
    email: "contacto@yaxsell.cl",
  };
}

function buildBankMessage(bank: any, orderTotal: number, prefix = "") {
  return `${prefix}Para continuar, haz la transferencia:\n\n *Datos para la transferencia:*\nTitular: ${bank.holder}\nRUT: ${bank.rut}\nBanco: ${bank.bank} (${bank.type})\nCuenta: ${bank.account}\nEmail: ${bank.email}\n\nMonto total: $${orderTotal.toLocaleString("es-CL")}\n\nCuando transfieras, mándame la *foto del comprobante* por aquí. `;
}

// ── In-memory caches to reduce Appwrite calls ──────────────────────────────
let _catCache: { data: any[]; ts: number } | null = null;
const CAT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const _productSearchCache = new Map<string, { data: any[]; ts: number }>();
const PROD_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const _ordersCache = new Map<string, { data: any[]; ts: number }>();
const ORDERS_CACHE_TTL = 30 * 1000; // Keep order answers fresh without re-reading Firestore on every message

let _adminContextCache: {
  data: { recentOrders: any[]; productsRes: any };
  ts: number;
} | null = null;
const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for Admin Context

// ─── Admin system prompt ───────────────────────────────────────────────────────
const ADMIN_PROMPT = `Eres Yaxbot IA, el asistente administrativo de Importadora Carlitos por WhatsApp.
Estás hablando con el DUEÑO/ADMINISTRADOR de la tienda.

## Capacidades de Admin:
- Ver pedidos pendientes de pago, en proceso, en negociación, enviados, entregados, etc.
- Consultar stock de productos.
- Ver resumen de ventas.
- Responder preguntas sobre la tienda y productos.
- Dar consejos de gestión.
- Manipular estados de pedidos (ej: cancelar, poner como pagado, en negociación, en preparación, enviado, entregado, etc.).

## Comandos reconocidos (interpreta variaciones naturales):
- "pedidos pendientes" → muestra los últimos pedidos con estado pendiente de pago
- "pedidos en negociación" → muestra los pedidos que están en estado "En negociación / mod."
- "pedidos de hoy" → pedidos del día
- "stock de [producto]" → consulta stock
- "resumen del día / ventas" → resumen rápido
- "limpiar historial" → borra la conversación
- "cancela el pedido [código/número]" / "marca como pagado el pedido [código/número]" → modifica el estado de un pedido

## Capacidad de Modificar Pedidos:
Si el administrador te pide cancelar, marcar como pagado, despachado, etc., un pedido (ya sea usando el número de pedido tipo "ORD-00051" o la terminación del código tipo "63AD3A"), DEBES generar al final de tu respuesta el siguiente bloque de acción JSON exacto:
[ACTION:UPDATE_ORDER]{"code":"CODIGO_O_NUMERO_PEDIDO","status":"NUEVO_ESTADO"}[/ACTION]

Valores válidos para "status" en la acción JSON:
- "paid" (Stock Confirmado — el stock ya se confirma automáticamente al crear el pedido, falta que el cliente pague)
- "payment_review" (Revisando Pago)
- "payment_confirmed" (Pago Confirmado — el pago del cliente fue verificado)
- "negotiation" (En negociación)
- "shipped" (Embalado)
- "delivered" (Entregado a Agencia)
- "cancelled" (Cancelado)

IMPORTANTE para no confundir estados:
- El stock siempre se confirma automáticamente al crear el pedido; nunca uses "processing" ni "pending_stock".
- "marcar como pagado" / "pago confirmado" / "pago verificado" → usa "payment_confirmed".

Ejemplo de respuesta si piden cancelar:
"Entendido. He procedido a cancelar el pedido #ORD-00051.
[ACTION:UPDATE_ORDER]{\"code\":\"ORD-00051\",\"status\":\"cancelled\"}[/ACTION]"

## Capacidad de Negociación y Faltantes:
- Si el administrador te dice que un producto no hay en un pedido (ej: "en el pedido ORD-00051 no hay los abanicos"), debes generar:
[ACTION:MARK_MISSING]{"code":"ORD-00051","products":["abanicos"]}[/ACTION]
Y preguntar siempre: "¿Deseas que notifique al cliente para que elija reemplazos?"
- Si el administrador te dice que notifiques al cliente (ej: "sí, avísale al cliente de ese pedido"), debes generar:
[ACTION:NOTIFY_NEGOTIATION]{"code":"ORD-00051"}[/ACTION]

## Formato de respuesta:
- Usa emojis con moderación para mayor claridad.
- Sé conciso y directo.
- Para las listas de pedidos, muestra SIEMPRE:
  1. El número de pedido (ORDERCODE, ej: #ORD-00051) en lugar del código de documento.
  2. El nombre real del cliente (CUSTOMERNAME).
  3. El total de la compra en pesos chilenos.
  4. El estado del pedido TRADUCIDO AL ESPAÑOL (ej: 'Stock Confirmado' en lugar de 'paid' o estados antiguos 'pending'/'pending_stock', 'Pago Confirmado' en lugar de 'payment_confirmed', 'Embalado' en lugar de 'shipped', 'Cancelado' en lugar de 'cancelled').
- NUNCA uses nombres de estados en inglés (como 'pending', 'paid', 'shipped') en tus textos ni listas. Menciónalos siempre en español.
- Máx 3-4 pedidos por mensaje para no saturar.

## 🧮 CÁLCULOS Y AGREGACIONES:
- Tienes acceso a estadísticas agregadas de ventas (hoy, ayer, esta semana) en el bloque de contexto.
- Si el usuario te pregunta por montos totales, ventas, sumas de pedidos o conteos, responde usando las estadísticas inyectadas o calcula la suma directamente de los pedidos listados.
- Responde siempre con precisión y claridad al hablar de dinero o cantidades. Si te piden "que sumes", "suma los montos", "suba las cantidades" o "monto total", haz la suma matemática exacta de los montos de los pedidos en cuestión.

## IMPORTANTE:
- Siempre responde en español chileno, amigable y profesional.
- Si no puedes ejecutar algo, explica qué puede hacerse desde el panel admin web.
- No inventes datos. Solo muestra datos reales de la base de datos.

Los datos de productos y pedidos te serán inyectados en el contexto.`;

// ─── Customer system prompt ────────────────────────────────────────────────────
const CUSTOMER_PROMPT = `Eres Importadora Carlitos, el dueño de la tienda Importadora Carlitos en Chile.
Eres un comerciante directo, respetuoso, trabajador, muy atento y resolutivo. Hablas en español chileno natural, educado y cercano como dueño que cuida a sus clientes y a su negocio.
¡NUNCA digas que eres un bot, inteligencia artificial o asistente virtual! Atiendes personalmente como Importadora Carlitos.

## Saludo personalizado:
- Si en el contexto ves "DATOS DEL CLIENTE" con un nombre, salúdalo con respeto y cercanía por su nombre.
- En el primer saludo preséntate como Iván de Importadora Carlitos o Importadora Carlitos.
- Ejemplo correcto: "¡Hola María! Te saluda Iván de Importadora Carlitos. ¿En qué te puedo ayudar hoy?"
- Ejemplo incorrecto: "¡Hola bella! ¿Cómo estás hermosa?"

## TU FORMA DE HABLAR:
- Hombre comerciante, atento, ejecutivo, ágil y cordial. Frases cortas y directas.
- Lenguaje profesional y cercano de dueño de tienda chilena. Cero expresiones ficticias.

## Puedes ayudar con:
- Información de productos (precios, disponibilidad, descripción)
- Buscar productos por categoría o nombre
- Estado de pedidos
- Información de la tienda (horarios, envíos, pagos)
- Reemplazo de productos sin stock (Negociación)

## Negociación de productos faltantes:
Si en el contexto ves que el cliente tiene un pedido en estado "negotiation" (En negociación / mod.) con productos faltantes, debes iniciar o continuar la negociación inmediatamente en tu respuesta (incluso si el cliente solo te saluda, te da una respuesta corta, o pregunta qué pasa):
1. Dile de forma muy carismática y natural que lamentablemente nos quedamos sin stock de esos productos específicos.
2. Explícale que puede reemplazarlos él mismo entrando a los detalles de su pedido desde la página web, o si lo prefiere, tú misma puedes ayudarlo a elegir y hacer los cambios por aquí en el chat.
3. Pregúntale qué prefiere.
4. Solo si te dice explícitamente que prefiere hacerlo él mismo por la web, le envías su enlace: ${SITE_URL}/pedido/ID_DEL_PEDIDO (usa el ID del pedido del contexto).
5. Si te dice que la ayudes tú, muéstrale alternativas disponibles del catálogo y ayúdalo a decidir.

## Información de la tienda:
- Tienda: Importadora Carlitos — artículos de hogar, aseo y variedad (NO somos tienda de belleza ni cosméticos).
- Sitio web: ${SITE_URL}
- País: Chile

## 🛒 CÓMO TOMAR UN PEDIDO POR CHAT (SIN LINKS, SIN FORMULARIOS)
Tú misma tomas los pedidos conversando, como si fueras la cajera. NUNCA envíes al cliente al carrito de la web ni le pidas que llene un formulario. NUNCA digas "no puedo tomar pedidos" — ¡SÍ puedes y DEBES tomarlos! Sigue este flujo EN ESTE ORDEN:
1. Cuando el cliente te diga qué productos quiere (o venga desde el catálogo de WhatsApp con una lista), identifica los productos EXACTOS del catálogo que se te inyecta como contexto (usa su "id" real). Si no tienes el id de un producto porque no está en tu contexto, usa [ACTION:SEARCH_SKU] o pide que te confirme el nombre exacto — NUNCA inventes un id. Si el cliente vino del catálogo con una lista de productos, esos productos DEBERÍAN estar en tu contexto (se buscaron automáticamente). Confírmalos con el cliente.
2. Confirma con el cliente la lista final de productos y cantidades.
3. Pídele su NOMBRE COMPLETO (nada más por ahora, el teléfono ya lo tienes tú automáticamente).
4. En cuanto tengas los productos + el nombre, genera EXACTAMENTE este bloque oculto al final de tu respuesta (no esperes a tener dirección ni nada más):
[ACTION:CREATE_ORDER]{"items":[{"id":"ID_REAL_DEL_PRODUCTO","qty":2}],"customerName":"Nombre Completo"}[/ACTION]
Dile al cliente que registraste su pedido y que el stock quedó confirmado y reservado automáticamente. Envíale los datos de transferencia y explícale el plazo de pago configurado; ya no existe una etapa de espera por confirmación de la cajera.
5. A partir de ahí, tu trabajo es recolectar los datos de envío UNO A LA VEZ de forma conversacional (nunca los pidas todos juntos en una lista fría).
6. Si el cliente escribe un dato incompleto o ambiguo (ej. le falta el número de la casa, o pone una comuna que no existe), pídele amablemente que lo repita o aclare antes de seguir con el siguiente dato.
7. Cada vez que el cliente te dé uno o más datos de envío nuevos, guárdalos de inmediato generando este bloque oculto (solo incluye los campos que el cliente te acaba de dar, no inventes los demás):
[ACTION:UPDATE_SHIPPING]{"address":"Calle 123, depto 4","comuna":"Comuna","region":"Región","shippingAgency":"Starken","customerRut":"12.345.678-9"}[/ACTION]
8. No esperes a tener dirección, comuna o región para pedir el pago: el pedido ya tiene el stock reservado. Pídele que envíe la foto del comprobante por este chat.
9. Cuando el cliente envíe una imagen para un pedido pendiente, el sistema le preguntará si es el comprobante. No afirmes que está recibido, asociado ni en revisión hasta que el cliente confirme "Sí"; si confirma, el sistema lo adjunta y le comparte el enlace de despacho.
10. El stock se confirma automáticamente al crear el pedido. Si por alguna razón un producto no tiene stock, el sistema te avisará y activarás la sección "Negociación de productos faltantes" con ese cliente.

## Información de pago (el stock ya está confirmado al crear el pedido, envía estos datos de inmediato):
- Titular: Importadora Carlitos
- RUT: 78267426-9
- Banco: Banco de Chile (Cuenta Corriente)
- Número de cuenta: 4081220201
- Email: contacto@yaxsell.cl

## ⛔ REGLAS ABSOLUTAS (PROHIBIDO ROMPER):
1. NUNCA inventes nombres de productos. Solo menciona productos que aparezcan EXACTAMENTE en el catálogo que se te inyecta como contexto. Si no hay productos en el contexto, di que puedes mostrarle el catálogo en la web.
2. NUNCA inventes URLs. Solo usa ${SITE_URL} y las rutas reales del sitio (como ${SITE_URL}/productos o ${SITE_URL}/pedido/ID).
3. NUNCA inventes precios, stock, políticas de envío ni métodos de pago que no estén en tu contexto.
4. Si NO tienes la información que el cliente pide (ej: precios por mayor, catálogo completo, info que no está en tu contexto), ADMÍTELO HONESTAMENTE y di algo como: "Esa información la maneja directamente nuestro equipo, déjame conectarte con la persona indicada para que te ayude personalmente" y añade al final: [ACTION:ESCALATE_ADMIN][/ACTION]
5. NUNCA des vueltas ni digas "dame un minutito" o "ya casi lo tengo" si no puedes obtener la información. Si no la tienes, escala inmediatamente.
6. Si el cliente te pide algo por segunda vez y no puedes responderlo, ESCALA INMEDIATAMENTE al admin.
7. Sé cálida, cercana y profesional. Evita respuestas muy largas o robóticas.
8. Termina con una pregunta solo cuando necesites un dato o confirmación concreta; no agregues preguntas genéricas para prolongar la conversación.
- Si hay un problema muy grande que no puedes resolver o manejar con el cliente, dile amablemente que lo conectarás con una persona del equipo para que lo ayude mejor, y DEBES añadir al final de tu respuesta EXACTAMENTE este bloque oculto: [ACTION:ESCALATE_ADMIN][/ACTION]

Los datos de productos y pedidos del cliente te serán inyectados como contexto.`;

// Helper to decide if user message needs Appwrite DB context to save reads
function needsDbContext(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (cleaned.length < 3) return false;

  const pureChitchat =
    /^(hola|buenos\s+dias|buenas\s+tardes|buenas\s+noches|gracias|muchas\s+gracias|adios|chao|ok|okay|listo|perfecto|super|genial|hola\s+ivan|ivan|hola\s+don\s+balato|don\s+balato|hola\s+yexi|yexi|hola\s+balatin|balatin|como\s+estas|cómo\s+estás|que\s+tal|qué\s+tal)$/i;
  return !pureChitchat.test(cleaned);
}

// Helper: detect if a text is a greeting
function isGreeting(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  return (
    /^(hola|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|hi|holi|hola\s+ivan|ivan|hola\s+don\s+balato|don\s+balato|hola\s+yexi|yexi|hola\s+balatin|holaa|hola+a|ola|ola\s+ivan|ola\s+yexi|ola\s+balatin)\b/i.test(
      cleaned,
    ) ||
    /^(hola|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|hi|holi|holaa|ola)$/i.test(
      cleaned,
    )
  );
}

function isNewCatalogOrderRequest(text: string): boolean {
  return /\b(?:quiero|quisiera|me gustar[ií]a)\s+(?:hacer|realizar|crear)\s+(?:este|un|mi)\s+pedido\b|\bquiero\s+comprar\b|\bquiero\s+pedir\s+(?:un|una|el|la|los|las|este|esto)\b/i.test(text);
}

function isOrderStatusRequest(text: string): boolean {
  if (isNewCatalogOrderRequest(text)) return false;
  return /\bpedidos?\b|\bcompras?\b|\b(?:orden|órdenes?)\b|\b[\w]{2,8}-\d{3,10}\b/i.test(text);
}

function customerOrderStatusReply(): string {
  const contactNumber = CUSTOMER_SUPPORT_PHONE ? `+${CUSTOMER_SUPPORT_PHONE}` : "este mismo WhatsApp";
  return `Puedes revisar tus pedidos aquí:\n${CUSTOMER_SITE_URL}/cuenta\n\nSi compraste por la web, inicia sesión con tu cuenta. Si hiciste el pedido por WhatsApp, sincroniza tu número de teléfono en Mi cuenta. Cuando despachemos tu pedido, podrás ver el estado en tu historial. Cuando salga de la tienda, ${contactNumber} te enviará el comprobante de envío.`;
}

function customerSupportReply(): string {
  const contact = CUSTOMER_SUPPORT_PHONE
    ? `Escríbele a *Importadora Carlitos* por WhatsApp: https://wa.me/${CUSTOMER_SUPPORT_PHONE}`
    : `Consulta el WhatsApp de contacto publicado en la tienda.`;
  return `Lo siento, este bot no puede responder esa consulta por ahora. ${contact}\n\nHorario de atención: *10:00 a 18:00 hrs*.`;
}

function customerCatalogReply(): string {
  return `Puedes elegir tus productos y realizar el pedido desde nuestro catálogo:\n${CUSTOMER_SITE_URL}/productos\n\nAl terminar, el bot te ayudará con los datos de pago y el envío del comprobante.`;
}

// Helper: match two phone numbers by comparing last 8 digits
function phonesMatch(a: string, b: string): boolean {
  const cleanA = a.replace(/\D/g, "");
  const cleanB = b.replace(/\D/g, "");
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  const tailA = cleanA.slice(-8);
  const tailB = cleanB.slice(-8);
  return tailA.length === 8 && tailA === tailB;
}

// Helper: look up a registered user by phone in the users collection
async function lookupRegisteredUser(
  phone: string,
): Promise<{ name: string; email: string } | null> {
  try {
    const cleaned = phone.replace(/\D/g, "");
    console.log(
      "[WhatsApp Webhook] lookupRegisteredUser: searching for phone:",
      cleaned,
    );

    let docs: any[] = [];
    try {
      const qPhone1 = cleaned;
      const qPhone2 = cleaned.startsWith("569")
        ? cleaned.slice(2)
        : `56${cleaned}`;
      const qPhone3 = `+${cleaned}`;
      const qPhone = JSON.stringify({
        method: "equal",
        attribute: "phone",
        values: [qPhone1, qPhone2, qPhone3],
      });
      const qLimit = JSON.stringify({ method: "limit", values: [5] });
      const qOrderDesc = JSON.stringify({
        method: "orderDesc",
        attribute: "$createdAt",
      });
      const res = await serverListDocuments(USERS_COLLECTION_ID, [
        qOrderDesc,
        qPhone,
        qLimit,
      ]);
      docs = res.documents || [];
      console.log(
        "[WhatsApp Webhook] lookupRegisteredUser: fetched by phone query",
        docs.length,
      );
    } catch (e) {
      console.warn(
        "[WhatsApp Webhook] lookupRegisteredUser query failed, falling back to 20 limit:",
        e,
      );
      const qLimit20 = JSON.stringify({ method: "limit", values: [20] });
      const qOrderDesc = JSON.stringify({
        method: "orderDesc",
        attribute: "$createdAt",
      });
      const res = await serverListDocuments(USERS_COLLECTION_ID, [
        qOrderDesc,
        qLimit20,
      ]);
      docs = res.documents || [];
    }

    // Search for a matching phone
    for (const doc of docs as any[]) {
      const docPhone = String(doc.phone || "").replace(/\D/g, "");
      if (!docPhone) continue;
      if (phonesMatch(docPhone, cleaned)) {
        const name = doc.name || "";
        const email = doc.email || "";
        console.log(
          "[WhatsApp Webhook] lookupRegisteredUser: MATCH FOUND! name:",
          name,
          "phone:",
          docPhone,
        );
        return { name, email };
      }
    }

    console.log(
      "[WhatsApp Webhook] lookupRegisteredUser: no match found among",
      docs.length,
      "users",
    );
    // Log some sample phones for debugging
    const samplePhones = docs
      .slice(0, 10)
      .map((d: any) => d.phone || "(empty)");
    console.log(
      "[WhatsApp Webhook] lookupRegisteredUser: sample phones in DB:",
      samplePhones,
    );

    return null;
  } catch (e) {
    console.warn("[WhatsApp Webhook] lookupRegisteredUser error:", e);
    return null;
  }
}

// Helper: detect an email address in a text message
function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase().trim() : null;
}

// Helper: detect a Chilean RUT in a text message (formats: 12.345.678-9, 12345678-9, 123456789)
function extractRut(text: string): string | null {
  // Match XX.XXX.XXX-X or XXXXXXXX-X or XXXXXXXX
  const match = text.match(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/i);
  if (!match) return null;
  // Normalize: remove dots, uppercase K, ensure dash
  let rut = match[0].toUpperCase().replace(/\./g, "");
  if (!rut.includes("-") && rut.length >= 2) {
    rut = rut.slice(0, -1) + "-" + rut.slice(-1);
  }
  return rut;
}

// Helper: search orders by customer email
async function findOrdersByEmail(email: string): Promise<any[]> {
  try {
    const qEmail = JSON.stringify({
      method: "equal",
      attribute: "CUSTOMEREMAIL",
      values: [email, email.toLowerCase()],
    });
    const qOrderDesc = JSON.stringify({
      method: "orderDesc",
      attribute: "$createdAt",
    });
    const qLimit = JSON.stringify({ method: "limit", values: [10] });
    const res = await serverListDocuments(ORDERS_COLLECTION_ID, [
      qOrderDesc,
      qEmail,
      qLimit,
    ]);
    return res.documents || [];
  } catch (e) {
    console.warn("[WhatsApp Webhook] findOrdersByEmail error:", e);
    return [];
  }
}

// Helper: search orders by customer RUT
async function findOrdersByRut(rut: string): Promise<any[]> {
  try {
    // Try both with and without dots, normalized
    const rutClean = rut.replace(/\./g, "").toUpperCase();
    const rutWithDots = formatRutWithDots(rutClean);
    const qRut = JSON.stringify({
      method: "equal",
      attribute: "CUSTOMERRUT",
      values: [rutClean, rutWithDots, rut],
    });
    const qOrderDesc = JSON.stringify({
      method: "orderDesc",
      attribute: "$createdAt",
    });
    const qLimit = JSON.stringify({ method: "limit", values: [10] });
    const res = await serverListDocuments(ORDERS_COLLECTION_ID, [
      qOrderDesc,
      qRut,
      qLimit,
    ]);
    return res.documents || [];
  } catch (e) {
    console.warn("[WhatsApp Webhook] findOrdersByRut error:", e);
    return [];
  }
}

// Helper: format RUT with dots (12345678-9 → 12.345.678-9)
function formatRutWithDots(rut: string): string {
  const parts = rut.split("-");
  if (parts.length !== 2) return rut;
  const num = parts[0];
  const dv = parts[1];
  let formatted = "";
  for (let i = num.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) formatted = "." + formatted;
    formatted = num[i] + formatted;
  }
  return formatted + "-" + dv;
}

// Helper: search users by email
async function findUserByEmail(email: string): Promise<any | null> {
  try {
    const qEmail = JSON.stringify({
      method: "equal",
      attribute: "email",
      values: [email, email.toLowerCase()],
    });
    const qLimit = JSON.stringify({ method: "limit", values: [1] });
    const res = await serverListDocuments(USERS_COLLECTION_ID, [
      qEmail,
      qLimit,
    ]);
    return res.documents[0] || null;
  } catch (e) {
    console.warn("[WhatsApp Webhook] findUserByEmail error:", e);
    return null;
  }
}

// Helper: link a WhatsApp phone to found orders and optionally user account
async function linkPhoneToOrdersAndUser(
  fromPhone: string,
  orders: any[],
  userDoc: any | null,
): Promise<{ linkedOrders: number; linkedUser: boolean }> {
  const cleanedFrom = fromPhone.replace(/\D/g, "");
  let linkedOrders = 0;

  for (const order of orders) {
    const currentPhone = String(order.CUSTOMERPHONE || "");
    const cleanCurrent = currentPhone.replace(/\D/g, "");
    if (cleanCurrent !== cleanedFrom) {
      try {
        await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
          CUSTOMERPHONE: `+${cleanedFrom}`,
        });
        linkedOrders++;
      } catch (e) {
        console.warn("[WhatsApp Webhook] Failed to link order", order.$id, e);
      }
    } else {
      linkedOrders++; // Already linked
    }
  }

  let linkedUser = false;
  if (userDoc) {
    const currentPhone = String(userDoc.phone || "");
    const cleanCurrent = currentPhone.replace(/\D/g, "");
    if (cleanCurrent !== cleanedFrom) {
      try {
        await serverUpdateDocument(USERS_COLLECTION_ID, userDoc.$id, {
          phone: `+${cleanedFrom}`,
        });
        linkedUser = true;
      } catch (e) {
        console.warn("[WhatsApp Webhook] Failed to link user", userDoc.$id, e);
      }
    } else {
      linkedUser = true;
    }
  }

  return { linkedOrders, linkedUser };
}

// Link WhatsApp number to orders via LINKED_WHATSAPP (without overwriting CUSTOMERPHONE)
async function linkWhatsappToOrders(
  whatsappPhone: string,
  orders: any[],
): Promise<number> {
  const cleanedWa = whatsappPhone.replace(/\D/g, "");
  let linked = 0;
  for (const order of orders) {
    const existingLinked: string[] = Array.isArray(order.LINKED_WHATSAPP)
      ? order.LINKED_WHATSAPP.map((p: string) => p.replace(/\D/g, ""))
      : [];
    if (existingLinked.includes(cleanedWa)) {
      linked++;
      continue;
    }
    try {
      await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
        LINKED_WHATSAPP: [...existingLinked, `+${cleanedWa}`],
      });
      linked++;
    } catch (e) {
      console.warn(
        "[WhatsApp Webhook] Failed to link WhatsApp to order",
        order.$id,
        e,
      );
    }
  }
  return linked;
}

// Helper: send welcome menu as interactive list
async function sendWelcomeMenu(
  phone: string,
  customerName: string,
  token: string,
  customBody?: string,
) {
  const firstName = customerName.split(" ")[0] || customerName || "amigo";
  const body =
    customBody ||
    "Puedo orientarte con tu pedido y el comprobante, " +
      firstName +
      ". Toca una opción para continuar:";
  await sendWhatsAppList(
    phone,
    {
      header: "🐾 ¡Hola! Soy Yaxbot",
      body,
      footer: "Importadora Carlitos · Hogar, aseo y variedad",
      buttonText: "Opciones de ayuda 🐾",
      sections: [
        {
          title: "Mis funciones",
          rows: [
            {
              id: "func_pedido",
              title: "📦 Ver mi pedido",
              description: "Consulta el estado en Mi cuenta",
            },
            {
              id: "func_comprobante",
              title: "🧾 Subir comprobante",
              description: "Envía o adjunta tu comprobante",
            },
            {
              id: "func_humano",
              title: "👤 Contactar soporte",
              description: "Horario de atención: 10:00 a 18:00",
            },
          ],
        },
      ],
    },
    token,
  );
}

// ─── Webhook verification (GET) ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  if (!VERIFY_TOKEN) return NextResponse.json({ error: 'Falta configurar WHATSAPP_VERIFY_TOKEN' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verificado ✅");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ─── Incoming messages handler (POST) ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  if (!WA_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return NextResponse.json({ error: 'WhatsApp no está configurado para esta tienda' }, { status: 503 });
  }
  try {
    const body = await req.json();

    // Meta sends test pings with empty changes
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const changes = entries.flatMap((entry: any) => Array.isArray(entry?.changes) ? entry.changes : []);
    const statuses = changes.flatMap((change: any) => Array.isArray(change?.value?.statuses) ? change.value.statuses : []);

    // Meta sends delivery receipts separately from inbound messages. Log the
    // outcome (without the recipient phone) so an accepted API request can be
    // distinguished from a delivered, read, or failed WhatsApp message.
    for (const receipt of statuses) {
      const details = {
        messageId: receipt?.id,
        status: receipt?.status,
        timestamp: receipt?.timestamp,
        errors: Array.isArray(receipt?.errors)
          ? receipt.errors.map((error: any) => ({
              code: error?.code,
              title: error?.title,
              message: error?.message,
              details: error?.error_data?.details,
            }))
          : [],
      };
      const line = `[WhatsApp Status] ${JSON.stringify(details)}`;
      if (receipt?.status === "failed") console.error(line);
      else console.info(line);
    }

    const messageChange = changes.find((change: any) => change?.value?.messages?.length);
    const value = messageChange?.value;
    const messages = value?.messages;

    if (!messages?.length) {
      return NextResponse.json({ status: statuses.length ? "statuses_received" : "no_messages", statusCount: statuses.length });
    }

    const msg = messages[0];
    const fromPhone = msg.from as string; // sender's phone number
    const msgId = msg.id as string;
    const msgType = msg.type as string;

    // ── PREVENT WHATSAPP RETRIES (Duplicate msgId lock) ──
    try {
      // getWhatsAppDocId returns u_<hash> (34 chars). We replace u_ with l_ for the lock
      const lockDocId = getWhatsAppDocId(msgId, "user").replace("u_", "l_");
      const { serverGetDocument, serverCreateDocument } =
        await import("@/lib/firebase-server-compat");
      const { ADMIN_CHAT_COLLECTION_ID } = await import("@/lib/firebase-admin-compat");

      try {
        await serverGetDocument(ADMIN_CHAT_COLLECTION_ID, lockDocId);
        // If found, this is a retry from WhatsApp. Ignore it.
        console.log(
          `[WhatsApp] Ignoring duplicate webhook retry for msgId: ${msgId}`,
        );
        return NextResponse.json({ status: "duplicate_ignored" });
      } catch {
        // Create lock
        await serverCreateDocument(ADMIN_CHAT_COLLECTION_ID, lockDocId, {
          userId: `system:lock`,
          senderRole: "admin",
          message: msgId,
          readByUser: true,
          readByAdmin: true,
        });
      }
    } catch (e) {
      console.warn("[WhatsApp] Failed to process lock:", e);
    }

    let userText = "";
    let interactiveId = "";
    let inboundMediaUrl = "";
    let inlineDataParts: any[] = [];

    if (msgType === "text") {
      userText = ((msg.text?.body as string) || "").trim();
    } else if (msgType === "interactive") {
      if (msg.interactive?.type === "list_reply") {
        userText = ((msg.interactive.list_reply?.title as string) || "").trim();
        interactiveId = msg.interactive.list_reply?.id as string;
      } else if (msg.interactive?.type === "button_reply") {
        userText = (
          (msg.interactive.button_reply?.title as string) || ""
        ).trim();
        interactiveId = msg.interactive.button_reply?.id as string;
      }
    } else if (msgType === "button") {
      userText = ((msg.button?.text as string) || "").trim();
      interactiveId = ((msg.button?.payload as string) || "").trim();
    } else if (msgType === "image") {
      const mediaId = msg.image?.id;
      userText = ((msg.image?.caption as string) || "").trim();
      if (!userText) {
        userText =
          "Aquí tienes una imagen que te envío para que me ayudes a identificar productos o resolver dudas.";
      }

      if (mediaId && WA_TOKEN) {
        // Track usage
        const usageRes = await recordKeniaUsage(fromPhone, { imageSent: true });
        const BAN_PROOF_PHONES = ADMIN_PHONES;
        if (
          !BAN_PROOF_PHONES.includes(fromPhone.replace(/\D/g, "")) &&
          (usageRes.imagesSentToday || 0) > 5
        ) {
          await setKeniaBlocked(fromPhone, true);
          await sendWhatsAppMessage(
            fromPhone,
            "¡Miau! 🐾 Ya me enviaste muchas fotitos por hoy y se me llenó la memoria. Dame un momentito que lo reviso con el equipo de tienda para ayudarte bien.",
            WA_TOKEN,
          );
          // Notify admin
          const notifyText = `🚨 *LÍMITE DE FOTOS SUPERADO*\nEl usuario +${fromPhone} intentó enviar más de 5 fotos hoy.\nSe ha bloqueado la IA para este usuario.`;
          for (const admin of ADMIN_PHONES) {
            await sendWhatsAppMessage(admin, notifyText, WA_TOKEN);
          }
          return NextResponse.json({ status: "limit_exceeded" });
        }

        // Fetch image
        try {
          const mediaRes = await fetch(
            `https://graph.facebook.com/v19.0/${mediaId}`,
            {
              headers: { Authorization: `Bearer ${WA_TOKEN}` },
            },
          );
          const mediaData = await mediaRes.json();
          if (mediaData.url) {
            const dlRes = await fetch(mediaData.url, {
              headers: { Authorization: `Bearer ${WA_TOKEN}` },
            });
            const buffer = await dlRes.arrayBuffer();

            const usageState = await getKeniaUsage(fromPhone);
            const currentOrderId =
              usageState.balatinOrderId ||
              (usageState.awaitingComprobante ? usageState.pendingOrderId : null);
            let pendingOrder: any = null;

            if (currentOrderId) {
              const current = await getOrderFromEitherCollection(String(currentOrderId));
              if (
                current &&
                PAYMENT_PROOF_ELIGIBLE_STATUSES.has(String(current.order.STATUS || "pending").toLowerCase()) &&
                !hasPaymentProof(current.order)
              ) {
                pendingOrder = { ...current.order, $id: String(currentOrderId), __collectionId: current.collectionId };
              }
            }
            if (!pendingOrder) {
              pendingOrder = await findLatestOrderAwaitingProof(fromPhone);
            }

            if (pendingOrder) {
              const pendingOrderId = String(pendingOrder.$id || pendingOrder.id || "");
              const orderCode = String(pendingOrder.ORDERCODE || pendingOrderId);
              const customerName = String(
                pendingOrder.CUSTOMERNAME || usageState.customerName || "Cliente",
              ).trim();
              const mimeType = String(msg.image?.mime_type || "image/jpeg");
              const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
              const uploadRes = await serverUploadFile(
                MEDIA_BUCKET_ID,
                buffer,
                `comprobante_pendiente_${Date.now()}.${extension}`,
                mimeType,
              );
              const fileUrl = uploadRes.url || getPublicFileUrl(MEDIA_BUCKET_ID, uploadRes.$id);

              await recordKeniaUsage(fromPhone, {
                balatinOrderFlow: true,
                balatinOrderId: pendingOrderId,
                balatinOrderCode: orderCode,
                balatinStep: "awaiting_proof_confirmation",
                balatinDataBuffer: fileUrl,
                balatinComprobanteReceived: false,
                awaitingComprobante: false,
                customerName,
              });

              const confirmMsg = `Recibí esta imagen para el pedido *#${orderCode}*. ¿Es el comprobante de pago? Responde *Sí* o *No*. Todavía no la adjunto al pedido ni aviso a la cajera hasta que confirmes.`;
              await sendWhatsAppMessage(fromPhone, confirmMsg, WA_TOKEN);
              await addToHistory(fromPhone, "user", `[Imagen recibida]\n${fileUrl}`, msgId);
              await addToHistory(fromPhone, "assistant", confirmMsg, `proof-confirm-${Date.now()}`);
              await markAsRead(msgId, WA_TOKEN);
              return NextResponse.json({ status: "proof_confirmation_required", orderId: pendingOrderId });
            }

            // Si no corresponde a un pedido con pago pendiente, conservar la imagen
            // para que el asistente pueda responder sobre ella y aparezca en el chat.
            try {
              const mediaUpload = await serverUploadFile(MEDIA_BUCKET_ID, buffer, `whatsapp_${Date.now()}.jpg`);
              inboundMediaUrl = mediaUpload.url || getPublicFileUrl(MEDIA_BUCKET_ID, mediaUpload.$id);
              userText = `${userText || "Imagen recibida por WhatsApp"}\n${inboundMediaUrl}`;
            } catch (mediaError) {
              console.warn('[WhatsApp] No se pudo guardar imagen para el panel:', mediaError);
            }
            const base64 = Buffer.from(buffer).toString("base64");
            inlineDataParts.push({
              inline_data: {
                mime_type: msg.image?.mime_type || "image/jpeg",
                data: base64,
              },
            });
          }
        } catch (e) {
          console.error("[WhatsApp Webhook] Failed to download media:", e);
        }
      }
    }

    if (!userText && !interactiveId && inlineDataParts.length === 0) {
      if (
        msgType !== "text" &&
        msgType !== "interactive" &&
        msgType !== "image" &&
        msgType !== "button"
      ) {
        await sendWhatsAppMessage(
          fromPhone,
          "¡Hola! 👋 Por ahora solo puedo procesar mensajes de texto o imágenes. Escríbeme tu consulta y te ayudo enseguida.",
          WA_TOKEN,
        );
      }
      return NextResponse.json({ status: "non_text_ignored" });
    }

    // Deduplication check
    try {
      const { serverGetDocument } = await import("@/lib/firebase-server-compat");
      const { ADMIN_CHAT_COLLECTION_ID } = await import("@/lib/firebase-admin-compat");
      // If we can find the message doc in the database, it means we already processed this message.
      await serverGetDocument(
        ADMIN_CHAT_COLLECTION_ID,
        getWhatsAppDocId(msgId, "user"),
      );
      console.log(
        `[WhatsApp Webhook] Duplicate message ${msgId} detected. Skipping.`,
      );
      return NextResponse.json({ status: "already_processed" });
    } catch (e) {
      // Document not found, proceed.
    }

    const cleanedFrom = fromPhone.replace(/\D/g, "").trim();
    const keniaConfig = await getKeniaConfig();

    const debugMode = keniaConfig.debugMode === true;
    const DEBUG_PHONE = (process.env.WHATSAPP_DEBUG_NUMBER || "").replace(/\D/g, "");
    let isAdmin = ADMIN_PHONES.includes(cleanedFrom);
    if (debugMode && cleanedFrom === DEBUG_PHONE) {
      isAdmin = false;
    }
    console.log(
      `[WhatsApp Webhook] Msg from: ${fromPhone} (cleaned: ${cleanedFrom}) | isAdmin: ${isAdmin} | debugMode: ${debugMode} | Admin list:`,
      ADMIN_PHONES,
    );

    // Obtener uso actual del remitente (se usa en múltiples lugares, por eso se declara aquí)
    const usage = await getKeniaUsage(fromPhone, keniaConfig.blockedPhones);
    const testAsClient = usage.testAsClient === true;

    // Procesar comandos de modo cliente
    if (isAdmin && userText.toUpperCase() === "MODO CLIENTE") {
      await recordKeniaUsage(fromPhone, { testAsClient: true });
      const reply =
        'Yaxbot: Modo cliente activado. Recibirás las respuestas fijas del bot. Escribe "MODO ADMIN" para volver al modo administrador.';
      await sendWhatsAppMessage(fromPhone, reply, WA_TOKEN);
      await addToHistory(fromPhone, "assistant", reply, msgId);
      return NextResponse.json({ status: "mode_client_activated" });
    }

    if (isAdmin && userText.toUpperCase() === "MODO ADMIN") {
      await recordKeniaUsage(fromPhone, { testAsClient: false });
      const reply =
        "Yaxbot: Modo administrador reactivado. Volverás a recibir los reportes y poder ejecutar comandos de administración. 🛡️";
      await sendWhatsAppMessage(fromPhone, reply, WA_TOKEN);
      await addToHistory(fromPhone, "assistant", reply, msgId);
      return NextResponse.json({ status: "mode_admin_activated" });
    }

    // Si está en modo cliente, tratamos a este administrador como un cliente normal
    if (testAsClient) {
      isAdmin = false;
    }

    // Botones de la plantilla alerta_comprobante_pago. El payload incluye el ID
    // del pedido, así que no dependemos del pedido pendiente de una sesión vieja.
    const paymentAction = interactiveId.match(/^PAYMENT_(OK|NO):([\s\S]+)$/i);
    if (paymentAction) {
      const configuredReviewer = formatWhatsAppPhone(await getAdminAlertPhone()).replace(/\D/g, "");
      const isPaymentReviewer = ADMIN_PHONES.includes(cleanedFrom) || cleanedFrom === configuredReviewer;
      if (!isPaymentReviewer) {
        await sendWhatsAppMessage(fromPhone, "Este botón solo puede usarlo el número autorizado para revisar pagos.", WA_TOKEN);
        return NextResponse.json({ status: "payment_review_unauthorized" });
      }

      const decision = paymentAction[1].toUpperCase();
      const orderId = paymentAction[2].trim();
      let paymentOrder: any = null;
      let paymentCollection = ORDERS_COLLECTION_ID;
      for (const collection of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
        try {
          paymentOrder = await serverGetDocument(collection, orderId);
          paymentCollection = collection;
          break;
        } catch {}
      }

      if (!paymentOrder) {
        await sendWhatsAppMessage(fromPhone, `No encontré el pedido asociado a este botón (#${orderId}).`, WA_TOKEN);
        return NextResponse.json({ status: "payment_review_order_not_found" });
      }

      const paymentOrderCode = String(paymentOrder.ORDERCODE || orderId);
      const paymentDb = getAdminDb();
      const primaryRef = paymentDb.collection(paymentCollection).doc(orderId);
      const isVendorPayment = paymentCollection === VENDOR_ORDERS_COLLECTION_ID || Boolean(paymentOrder.IS_VENDOR_ORDER || paymentOrder.VENDOR_ID || paymentOrder.VENDOR_NAME);
      const mirrorCollection = paymentCollection === VENDOR_ORDERS_COLLECTION_ID
        ? ORDERS_COLLECTION_ID
        : VENDOR_ORDERS_COLLECTION_ID;
      const mirrorRef = isVendorPayment ? paymentDb.collection(mirrorCollection).doc(orderId) : null;
      const statusPriority: Record<string, number> = {
        pending: 0,
        pending_stock: 0,
        processing: 1,
        paid: 1,
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
      };
      const transition = await paymentDb.runTransaction(async transaction => {
        const primarySnap = await transaction.get(primaryRef);
        const mirrorSnap = mirrorRef ? await transaction.get(mirrorRef) : null;
        if (!primarySnap.exists) return { kind: "missing" as const };

        const currentOrder = primarySnap.data() || {};
        const mirrorOrder = mirrorSnap?.exists ? mirrorSnap.data() || {} : null;
        const orderCopies = [currentOrder, mirrorOrder].filter(Boolean) as Record<string, any>[];
        if (!orderCopies.some(copy => String(copy.PAYMENTPROOFURL || "").trim())) {
          return { kind: "proof_missing" as const };
        }

        const statuses = orderCopies.map(copy => String(copy.STATUS || "").toLowerCase()).filter(Boolean);
        if (statuses.includes("cancelled")) return { kind: "changed" as const, currentStatus: "cancelled" };

        const advancedStatus = statuses
          .filter(status => (statusPriority[status] ?? -1) >= statusPriority.payment_confirmed)
          .sort((a, b) => statusPriority[b] - statusPriority[a])[0];
        if (advancedStatus) {
          const updates = { STATUS: advancedStatus };
          if (currentOrder.STATUS !== advancedStatus) transaction.update(primaryRef, updates);
          if (mirrorRef && mirrorSnap?.exists && mirrorOrder?.STATUS !== advancedStatus) transaction.update(mirrorRef, updates);
          return { kind: "already_confirmed" as const, order: { $id: orderId, ...(mirrorOrder || {}), ...currentOrder, ...updates } };
        }

        if (!statuses.includes("payment_review")) {
          return { kind: "changed" as const, currentStatus: String(currentOrder.STATUS || "sin estado") };
        }

        if (decision === "NO") {
          const updates = { STATUS: "payment_review" };
          if (currentOrder.STATUS !== "payment_review") transaction.update(primaryRef, updates);
          if (mirrorRef && mirrorSnap?.exists && mirrorOrder?.STATUS !== "payment_review") transaction.update(mirrorRef, updates);
          return { kind: "not_confirmed" as const };
        }

        const updates = { STATUS: "payment_confirmed", UPDATEDAT: Date.now() };
        transaction.update(primaryRef, updates);
        if (mirrorRef && mirrorSnap?.exists) transaction.update(mirrorRef, updates);
        return { kind: "confirmed" as const, order: { $id: orderId, ...(mirrorOrder || {}), ...currentOrder, ...updates } };
      });

      if (transition.kind === "missing") {
        await sendWhatsAppMessage(fromPhone, `No encontré el pedido asociado a este botón (#${orderId}).`, WA_TOKEN);
        return NextResponse.json({ status: "payment_review_order_not_found" });
      }
      if (transition.kind === "proof_missing") {
        await sendWhatsAppMessage(fromPhone, `El pedido #${paymentOrderCode} no tiene un comprobante guardado. No cambié su estado.`, WA_TOKEN);
        return NextResponse.json({ status: "payment_proof_missing" });
      }
      if (transition.kind === "changed") {
        await sendWhatsAppMessage(fromPhone, `No cambié el pedido #${paymentOrderCode}: su estado actual es “${transition.currentStatus}”, no “Revisando Pago”.`, WA_TOKEN);
        return NextResponse.json({ status: "payment_status_changed" });
      }
      if (transition.kind === "already_confirmed") {
        await sendWhatsAppMessage(fromPhone, `El pago del pedido #${paymentOrderCode} ya estaba confirmado.`, WA_TOKEN);
        return NextResponse.json({ status: "payment_already_confirmed" });
      }
      if (transition.kind === "not_confirmed") {
        await sendWhatsAppMessage(
          fromPhone,
          `Recibido. El pago del pedido #${paymentOrderCode} queda en “Revisando Pago”; no se cambió su estado.`,
          WA_TOKEN,
        );
        await addToHistory(fromPhone, "assistant", `El pago de #${paymentOrderCode} no fue confirmado; sigue en revisión.`, msgId);
        return NextResponse.json({ status: "payment_not_confirmed" });
      }

      try {
        const { notifyOrderStatusChange } = await import("@/services/notificationService");
        await notifyOrderStatusChange(transition.order as any, "payment_review", "payment_confirmed");
      } catch (error) {
        console.warn("[WhatsApp Webhook] Customer payment-confirmed notification failed:", error);
      }

      const confirmation = `✅ Pago confirmado para el pedido #${paymentOrderCode}. El estado cambió a Pago Confirmado.`;
      await sendWhatsAppMessage(fromPhone, confirmation, WA_TOKEN);
      await addToHistory(fromPhone, "assistant", confirmation, msgId);
      return NextResponse.json({ status: "payment_confirmed_from_template" });
    }

    // ── YEXI CATALOG FLOW (Flujo 100% Autónomo Importadora Carlitos & Vendors) ────────────
    // Solo iniciar el flujo con el mensaje de pedido generado por el catálogo.
    // Mencionar un código al consultar el estado no debe reiniciar el pedido.
    const catCodeMatch = userText.match(
      /(?:Codigo|C[oó]digo)[:\s]*\*?([A-Za-z0-9_-]{4,20})\*?/i,
    );
    const waCodeMatch = userText.match(/\b(WA-\d{4,10}|[A-Za-z0-9]{2,8}-\d{3,6})\b/i);
    const isCatalogOrderKickoff = /(?:tengo un pedido del cat[aá]logo|quiero realizar este pedido|pedido desde el cat[aá]logo online|pedido de la tienda aliada)/i.test(userText);

    if (isCatalogOrderKickoff && (catCodeMatch || waCodeMatch)) {
      const orderCode = (
        catCodeMatch?.[1] ||
        waCodeMatch?.[1] ||
        waCodeMatch?.[0] ||
        ""
      ).toUpperCase();
      console.log(
        `[Yexi Catalog Flow] Detectado pedido web: ${orderCode} de ${fromPhone}`,
      );

      try {
        const { serverListDocuments, serverUpdateDocument, serverGetDocument } =
          await import("@/lib/firebase-server-compat");
        const lookup = await resolveOrderByCode(orderCode, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);

        if (lookup.status === "ambiguous") {
          const safeReply = `Encontré más de un pedido con el código #${orderCode}, así que no asocié este WhatsApp ni mostré datos de ningún pedido. Envíame el enlace directo de tu pedido o pide al equipo que lo revise.`;
          await sendWhatsAppMessage(fromPhone, safeReply, WA_TOKEN);
          await addToHistory(fromPhone, "assistant", safeReply, `yexi-ambiguous-${Date.now()}`);
          return NextResponse.json({ status: "ambiguous_order_code" });
        }

        if (lookup.status === "found") {
          const order = lookup.match.order as any;
          const orderId = order.$id;

          // Vincular teléfono del cliente al pedido
          try {
            await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
              CUSTOMERPHONE: `+${cleanedFrom}`,
            });
            if (order.IS_VENDOR_ORDER || order.VENDOR_ID) {
              await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, orderId, {
                CUSTOMERPHONE: `+${cleanedFrom}`,
              }).catch(() => {});
            }
          } catch (updErr) {
            console.warn(
              "[Yexi Catalog Flow] Error vinculando teléfono:",
              updErr,
            );
          }

          // Obtener nombre del cliente
          let customerName = (order.CUSTOMERNAME || usage.customerName || "").trim();
          if (!customerName || customerName.toLowerCase() === "cliente") {
            try {
              const qOrderDescPrev = JSON.stringify({
                method: "orderDesc",
                attribute: "$createdAt",
              });
              const qPhonePrev = JSON.stringify({
                method: "contains",
                attribute: "CUSTOMERPHONE",
                values: [cleanedFrom],
              });
              const qLimitPrev = JSON.stringify({
                method: "limit",
                values: [5],
              });
              const prevOrders = await serverListDocuments(
                ORDERS_COLLECTION_ID,
                [qOrderDescPrev, qPhonePrev, qLimitPrev],
              );
              const prevWithName = (prevOrders.documents || []).find(
                (o: any) =>
                  o.CUSTOMERNAME && String(o.CUSTOMERNAME).trim().length >= 2,
              );
              if (prevWithName) {
                customerName = String(prevWithName.CUSTOMERNAME).trim();
              }
            } catch (e) {
              console.warn(
                "[Yexi Catalog Flow] Error buscando nombre previo:",
                e,
              );
            }
          }

          if (customerName && customerName !== order.CUSTOMERNAME) {
            try {
              await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
                CUSTOMERNAME: customerName,
              });
              if (order.IS_VENDOR_ORDER || order.VENDOR_ID) {
                await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, orderId, {
                  CUSTOMERNAME: customerName,
                }).catch(() => {});
              }
            } catch (e) {}
          }

          const orderTotal = Number(order?.TOTAL || order?.SUBTOTAL || 0);
          const displayName = customerName && customerName.toLowerCase() !== "cliente"
            ? customerName
            : "Cliente";

          // Registrar estado en espera de comprobante
          await recordKeniaUsage(fromPhone, {
            isGuestWithOrders: true,
            isRegistered: true,
            customerName: displayName,
            balatinOrderFlow: true,
            balatinOrderId: orderId,
            balatinOrderCode: orderCode,
            balatinStep: "awaiting_payment",
            balatinComprobanteReceived: false,
          });

          // Obtener datos de la cuenta bancaria (del vendor si es pedido de tienda aliada, o central si es Importadora Carlitos)
          const isVendorOrder = Boolean(order.IS_VENDOR_ORDER || order.VENDOR_NAME || order.VENDOR_ID);
          const vendorName = String(order.VENDOR_NAME || "la tienda aliada").trim();

          let bank: any;
          if (isVendorOrder) {
            const bd = order.BANK_DETAILS || {};
            bank = {
              bank: bd.bank || order.VENDOR_BANK_NAME || "Banco Estado",
              type: bd.type || order.VENDOR_BANK_TYPE || "Cuenta Vista / RUT",
              account: bd.number || bd.account || order.VENDOR_BANK_ACCOUNT || "",
              rut: bd.rut || order.VENDOR_BANK_RUT || "",
              holder: bd.holder || order.VENDOR_BANK_HOLDER || vendorName,
              email: bd.email || order.VENDOR_BANK_EMAIL || "",
            };

            // Si el pedido no tenía los datos bancarios completos incrustados, consultar el vendor
            if ((!bank.account || !bank.rut) && order.VENDOR_ID) {
              try {
                const { VENDORS_COLLECTION_ID } = await import("@/lib/db");
                const vDoc = await serverGetDocument(VENDORS_COLLECTION_ID, order.VENDOR_ID);
                if (vDoc) {
                  bank.bank = vDoc.BANK_NAME || bank.bank;
                  bank.type = vDoc.BANK_ACCOUNT_TYPE || bank.type;
                  bank.account = vDoc.BANK_ACCOUNT_NUMBER || bank.account;
                  bank.rut = vDoc.BANK_RUT || bank.rut;
                  bank.holder = vDoc.BANK_ACCOUNT_HOLDER || vDoc.NAME || bank.holder;
                  bank.email = vDoc.BANK_EMAIL || vDoc.STORE_EMAIL || vDoc.EMAIL || bank.email;
                }
              } catch (vErr) {
                console.warn("[Yexi Catalog Flow] Error buscando banco del vendor:", vErr);
              }
            }
          } else {
            bank = await getBankDetails();
          }

          const greeting = displayName !== "Cliente" ? `¡Hola ${displayName}! ` : "¡Hola! ";
          const paymentDeadline = Number(order.EXPIRESAT || order.STATUSDEADLINE || 0);
          const deadlineText = isVendorOrder
            ? "Tienes 24 horas desde que se creó el pedido para enviar el comprobante. Si no recibimos el pago en ese plazo, el pedido se cancelará y el stock volverá a la tienda."
            : paymentDeadline > 0
              ? `La reserva de stock vence el *${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date(paymentDeadline))}*.`
              : "La reserva se mantiene durante el plazo que aparece en el detalle de tu pedido.";

          let confirmStockMsg = "";
          const hasVendorBank = isVendorOrder && Boolean(bank?.account && String(bank.account).trim());
          if (isVendorOrder && hasVendorBank) {
            const emailPart = bank.email ? `\n- Correo: ${bank.email}` : "";
            confirmStockMsg = `${greeting}Te saluda el equipo de Importadora Carlitos. Recibimos tu pedido de la tienda aliada *${vendorName}* con código *#${orderCode}* por un total de *$${orderTotal.toLocaleString("es-CL")}*. El stock está confirmado y reservado.\n\n${deadlineText}\n\n*Datos para transferir a la tienda (${vendorName}):*\n- Banco: ${bank.bank} (${bank.type})\n- N° Cuenta: ${bank.account}\n- RUT: ${bank.rut}\n- Titular: ${bank.holder}${emailPart}\n\nPor favor realiza la transferencia directamente a la cuenta bancaria de la tienda indicada arriba y *envía la foto de tu comprobante por este chat* para que podamos validar tu pago y continuar con el despacho.`;
          } else if (isVendorOrder) {
            const centralBank = await getBankDetails();
            const emailPart = centralBank.email ? `\n- Correo: ${centralBank.email}` : "";
            confirmStockMsg = `${greeting}Te saluda el equipo de Importadora Carlitos. Recibimos tu pedido de la tienda aliada *${vendorName}* con código *#${orderCode}* por un total de *$${orderTotal.toLocaleString("es-CL")}*. El stock está confirmado y reservado.\n\n${deadlineText}\n\n*Datos para transferir:*\n- Banco: ${centralBank.bank} (${centralBank.type})\n- N° Cuenta: ${centralBank.account}\n- RUT: ${centralBank.rut}\n- Titular: ${centralBank.holder}${emailPart}\n\nPor favor realiza la transferencia y *envía la foto de tu comprobante por este chat* para validar tu pago y continuar con el despacho.`;
          } else {
            confirmStockMsg = `${greeting}Te saluda Iván de Importadora Carlitos. El stock de tu pedido *#${orderCode}* por un total de *$${orderTotal.toLocaleString("es-CL")}* está confirmado y reservado.\n\n${deadlineText}\n\n*Datos para transferir:*\n- Banco: ${bank.bank} (${bank.type})\n- N° Cuenta: ${bank.account}\n- RUT: ${bank.rut}\n- Titular: ${bank.holder}\n- Correo: ${bank.email || "contacto@yaxsell.cl"}\n\nPor favor realiza el pago y *envía la foto de tu comprobante por este chat* para validar el pago y continuar con el despacho.`;
          }

          await sendWhatsAppMessage(fromPhone, confirmStockMsg, WA_TOKEN);
          await markAsRead(msgId, WA_TOKEN);
          await addToHistory(fromPhone, "user", userText, msgId);
          await addToHistory(
            fromPhone,
            "assistant",
            confirmStockMsg,
            `yexi-confirm-${Date.now()}`,
          );

          return NextResponse.json({
            status: "yexi_catalog_order_instant_confirmed",
          });
        } else {
          console.warn(`[Yexi Catalog Flow] Pedido ${orderCode} no encontrado en base de datos`);
        }
      } catch (e) {
        console.error("[Yexi Catalog Flow] Error:", e);
      }
    }

    // ── YEXI PASO CONFIRMACIÓN DE COMPROBANTE ("si" o "no") ──────────────────────
    if (
      usage.balatinOrderFlow === true &&
      usage.balatinStep === "awaiting_proof_confirmation"
    ) {
      const customerName = usage.customerName || "Cliente";
      const orderCode = usage.balatinOrderCode || "";
      const pendingOrderId = usage.balatinOrderId;
      const fileUrl = usage.balatinDataBuffer || "";

      const normAns = userText
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "");
      const confirmsProof = ["si", "sii", "siii", "siiii", "sipo", "siclaro", "sicorrecto", "sies", "sieselcomprobante", "correcto", "correctoes", "exacto", "eselcomprobante"].includes(normAns);
      const rejectsProof = ["no", "noes", "noescomprobante", "noeselcomprobante", "incorrecto", "nop", "nopues"].includes(normAns);

      if (confirmsProof) {
        const orderResult = pendingOrderId
          ? await getOrderFromEitherCollection(String(pendingOrderId))
          : null;
        const order = orderResult?.order;
        const orderCollection = orderResult?.collectionId;
        const orderIsEligible = Boolean(
          order &&
          PAYMENT_PROOF_ELIGIBLE_STATUSES.has(String(order.STATUS || "pending").toLowerCase()) &&
          !hasPaymentProof(order),
        );

        if (!pendingOrderId || !fileUrl || !order || !orderCollection || !orderIsEligible) {
          const alreadyHasProof = Boolean(order && hasPaymentProof(order));
          const safeMsg = alreadyHasProof
            ? `El pedido *#${orderCode}* ya tiene un comprobante registrado. El equipo revisará ese pago.`
            : `No pude asociar la imagen a un pedido con pago pendiente. Envíame el código del pedido para revisarlo.`;
          await recordKeniaUsage(fromPhone, {
            balatinStep: alreadyHasProof ? "awaiting_shipping_data" : "awaiting_payment",
            balatinDataBuffer: "",
            balatinComprobanteReceived: alreadyHasProof,
          });
          await sendWhatsAppMessage(fromPhone, safeMsg, WA_TOKEN);
          await addToHistory(fromPhone, "user", userText, msgId);
          await addToHistory(fromPhone, "assistant", safeMsg, `proof-not-attached-${Date.now()}`);
          await markAsRead(msgId, WA_TOKEN);
          return NextResponse.json({ status: "proof_not_attached" });
        }

        try {
          const proofDb = getAdminDb();
          const proofOrderRef = proofDb.collection(orderCollection).doc(String(pendingOrderId));
          const isVendorProof = orderCollection === VENDOR_ORDERS_COLLECTION_ID || Boolean(order.IS_VENDOR_ORDER || order.VENDOR_ID || order.VENDOR_NAME);
          const proofMirrorCollection = orderCollection === VENDOR_ORDERS_COLLECTION_ID
            ? ORDERS_COLLECTION_ID
            : VENDOR_ORDERS_COLLECTION_ID;
          const proofMirrorRef = isVendorProof
            ? proofDb.collection(proofMirrorCollection).doc(String(pendingOrderId))
            : null;
          await proofDb.runTransaction(async transaction => {
            const orderSnap = await transaction.get(proofOrderRef);
            const mirrorSnap = proofMirrorRef ? await transaction.get(proofMirrorRef) : null;
            if (!orderSnap.exists) throw new Error("Pedido no encontrado");

            const freshOrder = orderSnap.data() || {};
            const mirrorOrder = mirrorSnap?.exists ? mirrorSnap.data() || {} : null;
            const copies = [freshOrder, mirrorOrder].filter(Boolean) as Record<string, any>[];
            const stillEligible = copies.every(copy =>
              PAYMENT_PROOF_ELIGIBLE_STATUSES.has(String(copy.STATUS || "pending").toLowerCase()) &&
              !hasPaymentProof(copy),
            );
            if (!stillEligible) throw new Error("El pedido ya tiene comprobante o su pago ya fue confirmado.");

            const updates = {
              PAYMENTPROOFURL: fileUrl,
              STATUS: "payment_review",
              UPDATEDAT: Date.now(),
            };
            transaction.update(proofOrderRef, updates);
            if (proofMirrorRef && mirrorSnap?.exists) transaction.update(proofMirrorRef, updates);
          });
          if (!isVendorProof && orderCollection === ORDERS_COLLECTION_ID) invalidatePosWebReservations();
          await deductStockForOrder(String(pendingOrderId));
          try {
            await notifyPaymentUploaded(orderCode, customerName, fileUrl, String(pendingOrderId));
          } catch (notifErr) {
            console.warn("[WhatsApp Webhook] notifyPaymentUploaded error:", notifErr);
          }
        } catch (e) {
          console.error("[WhatsApp Webhook] Error updating confirmed order:", e);
          const errorMsg = `Recibí tu confirmación, pero no pude registrar el comprobante del pedido *#${orderCode}*. El equipo debe revisarlo.`;
          await sendWhatsAppMessage(fromPhone, errorMsg, WA_TOKEN);
          await addToHistory(fromPhone, "user", userText, msgId);
          await addToHistory(fromPhone, "assistant", errorMsg, `proof-save-error-${Date.now()}`);
          await markAsRead(msgId, WA_TOKEN);
          return NextResponse.json({ status: "proof_save_error" });
        }

        await recordKeniaUsage(fromPhone, {
          balatinOrderFlow: true,
          balatinOrderId: pendingOrderId,
          balatinOrderCode: orderCode,
          balatinComprobanteReceived: true,
          balatinStep: "awaiting_shipping_data",
          balatinDataBuffer: "",
          awaitingComprobante: false,
        });
        _ordersCache.delete(fromPhone.replace(/\D/g, ""));

        const linkMsg = `Listo, asocié el comprobante al pedido *#${orderCode}* y quedó en revisión. Para continuar, completa tus datos de despacho aquí:\n${SITE_URL}/confirmar-pedido?id=${encodeURIComponent(String(pendingOrderId))}`;
        await sendWhatsAppMessage(fromPhone, linkMsg, WA_TOKEN);
        await addToHistory(fromPhone, "user", userText, msgId);
        await addToHistory(fromPhone, "assistant", linkMsg, `proof-confirmed-${Date.now()}`);
        await markAsRead(msgId, WA_TOKEN);
        return NextResponse.json({ status: "proof_confirmed" });

      } else if (rejectsProof) {
        // Dijo que NO es el comprobante
        await recordKeniaUsage(fromPhone, {
          balatinOrderFlow: true,
          balatinOrderId: pendingOrderId,
          balatinOrderCode: orderCode,
          balatinStep: "awaiting_payment",
          balatinDataBuffer: "",
          balatinComprobanteReceived: false,
        });
        const noMsg = `Entendido, no adjuntaré esa imagen al pedido *#${orderCode}*. Cuando tengas el comprobante correcto, envíalo por aquí.`;
        await sendWhatsAppMessage(fromPhone, noMsg, WA_TOKEN);
        await addToHistory(fromPhone, "user", userText, msgId);
        await addToHistory(fromPhone, "assistant", noMsg, `proof-rejected-${Date.now()}`);
        await markAsRead(msgId, WA_TOKEN);
        return NextResponse.json({ status: "proof_rejected" });

      }
    }

    // ── Deep Linking / Auto-Linking Interceptors ──
    const userTextLower = userText.toLowerCase().trim();

    if (userTextLower.startsWith("vincular_pedido ")) {
      const orderId = userText.substring("vincular_pedido ".length).trim();
      if (orderId) {
        try {
          const { serverUpdateDocument, serverGetDocument } =
            await import("@/lib/firebase-server-compat");
          const { ORDERS_COLLECTION_ID } = await import("@/lib/firebase-admin-compat");
          const order = await serverGetDocument(ORDERS_COLLECTION_ID, orderId);
          if (order) {
            const currentPhone = String(order.CUSTOMERPHONE || "");
            const cleanCurrent = currentPhone.replace(/\D/g, "");
            if (cleanCurrent !== cleanedFrom) {
              await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
                CUSTOMERPHONE: `+${cleanedFrom}`,
              });
            }
            await markAsRead(msgId, WA_TOKEN);
            await clearHistory(fromPhone);
            await resetKeniaUsage(fromPhone);
            await setKeniaBlocked(fromPhone, false);

            const replyMsg = `¡Listo! Ya corregí tu número y vinculé tu WhatsApp a tu pedido *#${order.ORDERCODE || orderId}*. Ahora sí estamos conectados y te aviso de cualquier novedad de tu compra. `;
            await sendWhatsAppMessage(fromPhone, replyMsg, WA_TOKEN);
            await addToHistory(fromPhone, "user", userText, msgId);
            await addToHistory(
              fromPhone,
              "assistant",
              replyMsg,
              `link-order-${Date.now()}`,
            );
            return NextResponse.json({ status: "order_linked" });
          }
        } catch (e) {
          console.error("[WhatsApp Webhook] Error vincular_pedido:", e);
        }
      }
    }

    if (userTextLower.startsWith("vincular_cuenta ")) {
      const userId = userText.substring("vincular_cuenta ".length).trim();
      if (userId) {
        try {
          const { serverUpdateDocument, serverGetDocument } =
            await import("@/lib/firebase-server-compat");
          const { USERS_COLLECTION_ID } = await import("@/lib/firebase-admin-compat");
          const userDoc = await serverGetDocument(USERS_COLLECTION_ID, userId);
          if (userDoc) {
            const currentPhone = String(userDoc.phone || "");
            const cleanCurrent = currentPhone.replace(/\D/g, "");
            if (cleanCurrent !== cleanedFrom) {
              await serverUpdateDocument(USERS_COLLECTION_ID, userId, {
                phone: `+${cleanedFrom}`,
              });
            }
            await markAsRead(msgId, WA_TOKEN);
            await clearHistory(fromPhone);
            await resetKeniaUsage(fromPhone);
            await setKeniaBlocked(fromPhone, false);

            const replyMsg = `¡Listo${userDoc.name ? ` ${userDoc.name}` : ""}! Ya corregí tu número y vinculé tu WhatsApp a tu cuenta. Ahora sí estamos conectados y te ayudo con lo que necesites. `;
            await sendWhatsAppMessage(fromPhone, replyMsg, WA_TOKEN);
            await addToHistory(fromPhone, "user", userText, msgId);
            await addToHistory(
              fromPhone,
              "assistant",
              replyMsg,
              `link-account-${Date.now()}`,
            );
            return NextResponse.json({ status: "account_linked" });
          }
        } catch (e) {
          console.error("[WhatsApp Webhook] Error vincular_cuenta:", e);
        }
      }
    }

    // Intercept interactive options before AI
    if (!isAdmin && interactiveId) {
      let interceptReply = "";
      if (interactiveId === "func_pedido") {
        interceptReply = customerOrderStatusReply();
      } else if (interactiveId === "func_comprobante") {
        interceptReply =
          "🧾 Para registrar tu pago, envía la foto del comprobante por este chat. Te preguntaré si esa es la imagen correcta y, al confirmarla, quedará asociada a tu pedido para revisión.";
      } else if (interactiveId === "func_ofertas") {
        interceptReply = customerSupportReply();
      } else if (interactiveId === "func_negociacion") {
        interceptReply = customerSupportReply();
      } else if (interactiveId === "func_humano") {
        const MAIN_ADMIN_PHONE = (
          keniaConfig.adminAlertPhone || ADMIN_PHONES[0] || ""
        ).replace(/\D/g, "");
        const alertMsg = `🚨 *ASISTENCIA REQUERIDA*\n\nEl cliente +${fromPhone} presionó el botón de "Hablar con persona".\n ${SITE_URL}/admin/ia/whatsapp`;
        await sendWhatsAppMessage(MAIN_ADMIN_PHONE, alertMsg, WA_TOKEN);

        await setKeniaBlocked(fromPhone, true, "admin_takeover");
        interceptReply = customerSupportReply();
      }

      if (interceptReply) {
        await sendWhatsAppMessage(fromPhone, interceptReply, WA_TOKEN);
        await addToHistory(fromPhone, "user", userText, msgId);
        await addToHistory(
          fromPhone,
          "assistant",
          interceptReply,
          `intercept-${Date.now()}`,
        );
        return NextResponse.json({ status: "interactive_intercepted" });
      }
    }

    // Intercept "Enviar comprobante" button from Meta templates
    if (
      !isAdmin &&
      msgType === "button" &&
      userText.toLowerCase().includes("comprobante")
    ) {
      try {
        const cleanedPhone = fromPhone.replace(/\D/g, "");
        const qOrderDesc = JSON.stringify({
          method: "orderDesc",
          attribute: "$createdAt",
        });
        const qLimit5 = JSON.stringify({ method: "limit", values: [10] });
        const qPhone = JSON.stringify({
          method: "contains",
          attribute: "CUSTOMERPHONE",
          values: [cleanedPhone, `+${cleanedPhone}`],
        });
        const resOrders = await serverListDocuments(ORDERS_COLLECTION_ID, [
          qOrderDesc,
          qPhone,
          qLimit5,
        ]);

        const myOrders = resOrders.documents || [];
        const pendingOrder = myOrders.find((o: any) =>
          !o.PAYMENTPROOFURL && ["pending", "pending_stock", "processing", "paid", "payment_expired"].includes(o.STATUS),
        );

        if (pendingOrder) {
          const orderId = String(pendingOrder.$id);
          const link = `${SITE_URL}/pedido/${orderId}`;
          const interceptReply = `¡Perfecto! \n\nAquí tienes el link directo a tu pedido donde encontrarás los datos de transferencia y podrás subir el comprobante:\n ${link}\n\nO si prefieres, **puedes enviarme la foto del comprobante de transferencia directamente por aquí mismo** y yo lo adjunto a tu pedido. ¿Qué te parece más fácil? `;

          await recordKeniaUsage(fromPhone, {
            awaitingComprobante: true,
            pendingOrderId: orderId,
          });

          await sendWhatsAppMessage(fromPhone, interceptReply, WA_TOKEN);
          await addToHistory(fromPhone, "user", userText, msgId);
          await addToHistory(
            fromPhone,
            "assistant",
            interceptReply,
            `intercept-comp-${Date.now()}`,
          );
          return NextResponse.json({ status: "comprobante_link_sent" });
        } else {
          // No pending order found
          const interceptReply = customerOrderStatusReply();
          await sendWhatsAppMessage(fromPhone, interceptReply, WA_TOKEN);
          await addToHistory(fromPhone, "user", userText, msgId);
          await addToHistory(
            fromPhone,
            "assistant",
            interceptReply,
            `intercept-comp-${Date.now()}`,
          );
          return NextResponse.json({ status: "no_pending_order_found" });
        }
      } catch (e) {
        console.error("[WhatsApp] Failed to process comprobante button:", e);
      }
    }

    // Intercept Admin clicking "ENVIAR A REVISAR" template button
    if (
      isAdmin &&
      msgType === "button" &&
      userText.toUpperCase().includes("ENVIAR A REVISAR")
    ) {
      try {
        const adminUsage = await getKeniaUsage(fromPhone);
        const orderId = adminUsage.pendingOrderId;
        if (orderId) {
          const { serverGetDocument } = await import("@/lib/firebase-server-compat");
          const { ORDERS_COLLECTION_ID } = await import("@/lib/firebase-admin-compat");
          const orderDoc: any = await serverGetDocument(
            ORDERS_COLLECTION_ID,
            orderId,
          );
          const orderCode = orderDoc.ORDERCODE || orderId;
          const customerName = orderDoc.CUSTOMERNAME || "Cliente";
          const fileUrl = orderDoc.PAYMENTPROOFURL;

          if (fileUrl) {
            const WORKER_PHONE = WORKER_WHATSAPP_PHONE;
            const { sendWhatsAppTemplate } = await import("@/lib/whatsapp");
            const { recordKeniaUsage } = await import("@/lib/kenia-runtime");

            // Set the pendingOrderId for the worker so they can confirm it
            await recordKeniaUsage(WORKER_PHONE, { pendingOrderId: orderId });

            const components = [
              {
                type: "header",
                parameters: [
                  {
                    type: "image",
                    image: { link: fileUrl },
                  },
                ],
              },
              {
                type: "body",
                parameters: [
                  { type: "text", text: String(orderCode) },
                  { type: "text", text: String(customerName) },
                ],
              },
            ];

            await sendWhatsAppTemplate(
              WORKER_PHONE,
              "revision_pago_trabajadora",
              "es",
              components,
              WA_TOKEN,
            );

            const adminReply = `¡Listo! Se ha enviado el comprobante del pedido #${orderCode} a Ana (trabajadora) para su revisión. 👩‍💼💵`;
            await sendWhatsAppMessage(fromPhone, adminReply, WA_TOKEN);
            return NextResponse.json({ status: "sent_to_worker" });
          } else {
            await sendWhatsAppMessage(
              fromPhone,
              `El pedido #${orderCode} no tiene una imagen de comprobante adjunta. `,
              WA_TOKEN,
            );
            return NextResponse.json({ status: "no_proof_image" });
          }
        } else {
          await sendWhatsAppMessage(
            fromPhone,
            `No encontré ningún pedido pendiente de revisión reciente. `,
            WA_TOKEN,
          );
          return NextResponse.json({ status: "no_pending_order_id" });
        }
      } catch (e) {
        console.error("[WhatsApp] Failed to process Admin review button:", e);
      }
    }

    // Botón "CONFIRMAR STOCK" obsoleto: el stock se confirma automáticamente al crear el pedido.
    // Mantenemos el handler para responder educadamente sin cambiar estados ni descontar stock.
    if (
      cleanedFrom === STOCK_VERIFIER_PHONE &&
      msgType === "button" &&
      userText.toUpperCase().includes("CONFIRMAR STOCK")
    ) {
      try {
        await sendWhatsAppMessage(
          fromPhone,
          `El stock de los pedidos nuevos ya se confirma automáticamente al crearse. No se requiere confirmación manual.`,
          WA_TOKEN,
        );
        return NextResponse.json({ status: "stock_confirm_obsolete" });
      } catch (e) {
        console.error("[WhatsApp] Error en botón CONFIRMAR STOCK obsoleto:", e);
      }
    }

    // Intercept Worker clicking "CONFIRMAR PAGO" or "PAGO CONFIRMADO" template button
    const isWorker = Boolean(WORKER_WHATSAPP_PHONE) && cleanedFrom === WORKER_WHATSAPP_PHONE;
    const isConfirmPayment =
      msgType === "button" &&
      (userText.toUpperCase().includes("CONFIRMAR") ||
        userText.toUpperCase().includes("CONFIRMADO") ||
        userText.toUpperCase().includes("REVISADO"));
    if (isWorker && isConfirmPayment) {
      try {
        const workerUsage = await getKeniaUsage(fromPhone);
        const orderId = workerUsage.pendingOrderId;
        if (orderId) {
          const { serverUpdateDocument, serverGetDocument } =
            await import("@/lib/firebase-server-compat");
          const { ORDERS_COLLECTION_ID } = await import("@/lib/firebase-admin-compat");
          const { getAdminAlertPhone } = await import("@/lib/notify-admin");
          const { formatWhatsAppPhone } = await import("@/lib/whatsapp");

          const orderDoc: any = await serverGetDocument(
            ORDERS_COLLECTION_ID,
            orderId,
          );
          const orderCode = orderDoc.ORDERCODE || orderId;

          // El worker confirma el PAGO -> payment_confirmed ("Pago Confirmado").
          // OJO: NO usar 'paid', porque en este proyecto 'paid' = "Stock Confirmado"
          // (paso previo al pago). Escribir 'paid' aquí hacía retroceder el pedido.
          await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
            STATUS: "payment_confirmed",
            UPDATEDAT: Date.now(),
          });

          // Try notifying the customer
          try {
            const { notifyOrderStatusChange } =
              await import("@/services/notificationService");
            await notifyOrderStatusChange(
              orderDoc as any,
              (orderDoc as any).STATUS || "payment_review",
              "payment_confirmed",
            );
          } catch (errNotif) {
            console.warn(
              "[WhatsApp Webhook] Notification to customer error:",
              errNotif,
            );
          }

          // Notify the Admin
          const adminAlertPhone = await getAdminAlertPhone();
          const formattedAdminPhone = formatWhatsAppPhone(adminAlertPhone);
          const adminAlert = `✅ *PAGO CONFIRMADO*\nANA (BINGFEEN) ha verificado y confirmado el pago del pedido #${orderCode}. El estado se ha actualizado a Pago Confirmado.`;
          await sendWhatsAppMessage(formattedAdminPhone, adminAlert, WA_TOKEN);

          // Clear worker usage pendingOrderId
          await recordKeniaUsage(fromPhone, { pendingOrderId: undefined });

          // Reply to worker
          const workerReply = `¡Listo Ana! El pago del pedido #${orderCode} ha sido verificado y el administrador ha sido notificado. ¡Muchas gracias! `;
          await sendWhatsAppMessage(fromPhone, workerReply, WA_TOKEN);

          return NextResponse.json({ status: "payment_confirmed_by_worker" });
        } else {
          await sendWhatsAppMessage(
            fromPhone,
            `No encontré ningún pedido pendiente de confirmación en tus registros. `,
            WA_TOKEN,
          );
          return NextResponse.json({ status: "worker_no_pending_order" });
        }
      } catch (e) {
        console.error("[WhatsApp] Failed to process Worker confirm button:", e);
      }
    }

    // Botones stockok/stockmiss obsoletos: el stock ahora se confirma automáticamente al crear el pedido.
    // Mantenemos el handler solo para responder educadamente si llegan botones antiguos en conversaciones previas,
    // sin cambiar estados ni descontar stock nuevamente.
    if (
      cleanedFrom === STOCK_VERIFIER_PHONE &&
      interactiveId &&
      (interactiveId.startsWith("stockok:") ||
        interactiveId.startsWith("stockmiss:") ||
        interactiveId.startsWith("stockok_") ||
        interactiveId.startsWith("stockmiss_"))
    ) {
      try {
        const separator = interactiveId.includes(":") ? ":" : "_";
        const [, orderRef] = interactiveId.split(separator);

        const idLookup = await resolveOrderById(orderRef, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
        const lookup = idLookup.status === "found"
          ? idLookup
          : await resolveOrderByCode(orderRef, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
        if (lookup.status === "ambiguous") {
          await sendWhatsAppMessage(fromPhone, `No pude identificar de forma segura el pedido #${orderRef}. No se realizó ningún cambio.`, WA_TOKEN);
          return NextResponse.json({ status: "ambiguous_order_code" });
        }
        const order: any = lookup.status === "found" ? lookup.match.order : null;

        const orderCode = order?.ORDERCODE || orderRef;
        await sendWhatsAppMessage(
          fromPhone,
          `El pedido #${orderCode} ya tiene el stock confirmado automáticamente al crearse. No se requiere confirmación manual.`,
          WA_TOKEN,
        );
        return NextResponse.json({ status: "stock_button_obsolete" });
      } catch (e) {
        console.error("[WhatsApp Webhook] Error en stock-button obsoleto:", e);
        return NextResponse.json({ status: "stock_button_error" });
      }
    }

    // Mark as read
    await markAsRead(msgId, WA_TOKEN);

    // Check if Yaxbot is globally disabled
    if (keniaConfig.isEnabled === false) {
      // Debug phone bypasses maintenance when debugMode is active
      if (!(debugMode && cleanedFrom === DEBUG_PHONE)) {
        // Si el admin está en modo cliente, permite bypass del mantenimiento
        if (!testAsClient) {
          if (!isAdmin) {
            // Cliente real: enviar aviso de mantenimiento
            const usageMaint = await getKeniaUsage(fromPhone);
            const now = Date.now();
            const lastMaint = usageMaint.maintenanceNotifiedTs || 0;

            // Responder con el mensaje de "fase de pruebas" (1 vez cada 4 horas para no hacer spam si insisten)
            if (now - lastMaint > 4 * 60 * 60 * 1000) {
              const customerFirstName = usageMaint.customerName
                ? usageMaint.customerName.split(" ")[0]
                : "";
              const supportContact = CUSTOMER_SUPPORT_PHONE
                ? `el soporte de Importadora Carlitos por WhatsApp al *+${CUSTOMER_SUPPORT_PHONE}* (https://wa.me/${CUSTOMER_SUPPORT_PHONE})`
                : `el WhatsApp de contacto publicado en la tienda`;
              const welcomeReply = `Hola${customerFirstName ? " " + customerFirstName : ""}, el bot está pausado temporalmente. Para recibir ayuda, escribe a ${supportContact}.\n\nHorario de atención: *10:00 a 18:00 hrs*.`;

              await addToHistory(fromPhone, "assistant", welcomeReply, msgId);
              await sendWhatsAppMessage(fromPhone, welcomeReply, WA_TOKEN);
              await recordKeniaUsage(fromPhone, { maintenanceNotifiedTs: now });

              // Notificar al humano (asesor)
        const alertMsg = ` *CLIENTE REQUIERE ATENCIÓN*
El cliente +${fromPhone} le escribió a Yaxbot (pero Yaxbot está pausado).
Por favor contáctalo para ayudarle.

👉 Link de WhatsApp: https://wa.me/${fromPhone}`;
              if (ADMIN_PHONES[0]) await sendWhatsAppMessage(ADMIN_PHONES[0], alertMsg, WA_TOKEN);
            }
            return NextResponse.json({ status: "maintenance" });
          }
          // Admin normal (sin modo cliente): pasa libremente, no se bloquea
        }
        // testAsClient === true: bypass total del mantenimiento
      }
    }

    // Handle "limpiar historial" command
    if (userText.toLowerCase().includes("limpiar historial")) {
      await clearHistory(fromPhone);
      await resetKeniaUsage(fromPhone);
      await setKeniaBlocked(fromPhone, false);
      await sendWhatsAppMessage(
        fromPhone,
        "🗑️ Historial borrado y sistema desbloqueado. ¡Empezamos de cero!",
        WA_TOKEN,
      );
      return NextResponse.json({ status: "history_cleared" });
    }

    // El nombre se toma del flujo del pedido si está disponible; no pedimos datos personales por chat.
    let customerName = usage.customerName || "";

    // ── Fetch context from DB ──────────────────────────────────────────────────
    let contextBlock = "";
    if (isAdmin && needsDbContext(userText)) {
      try {
        if (isAdmin) {
          const now = Date.now();
          let recentOrders: any[] = [];
          let productsRes: any = { documents: [] };

          if (
            _adminContextCache &&
            now - _adminContextCache.ts < ADMIN_CACHE_TTL
          ) {
            recentOrders = _adminContextCache.data.recentOrders;
            productsRes = _adminContextCache.data.productsRes;
          } else {
            // Admin: get recent orders (up to 100) + products
            const qOrderDesc = JSON.stringify({
              method: "orderDesc",
              attribute: "$createdAt",
            });
            const qLimit100 = JSON.stringify({
              method: "limit",
              values: [100],
            });
            const qLimit30 = JSON.stringify({ method: "limit", values: [30] });

            const [fetchedOrdersRes, fetchedProductsRes] = await Promise.all([
              serverListDocuments(ORDERS_COLLECTION_ID, [
                qOrderDesc,
                qLimit100,
              ]),
              serverListDocuments(PRODUCTS_COLLECTION_ID, [qLimit30]),
            ]);

            recentOrders = fetchedOrdersRes.documents || [];
            productsRes = fetchedProductsRes || { documents: [] };

            _adminContextCache = {
              data: { recentOrders, productsRes },
              ts: now,
            };
          }

          // Helper to get local date string YYYY-MM-DD in America/Santiago timezone
          const getChileDateStr = (dateInput: string | number | Date) => {
            try {
              return new Date(dateInput).toLocaleDateString("en-CA", {
                timeZone: "America/Santiago",
              });
            } catch {
              return "";
            }
          };

          const todayStr = getChileDateStr(new Date());
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = getChileDateStr(yesterday);
          const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

          const REVENUE_STATUSES = [
            "paid",
            "payment_review",
            "payment_confirmed",
            "negotiation",
            "shipped",
            "delivered",
          ];
          const STATUS_LABELS: Record<string, string> = {
            pending: "Stock Confirmado",
            pending_stock: "Stock Confirmado",
            processing: "Stock Confirmado",
            paid: "Stock Confirmado",
            payment_review: "Revisando Pago",
            payment_confirmed: "Pago Confirmado",
            negotiation: "Negociando",
            shipped: "Embalado",
            delivered: "Entregado a Agencia",
            cancelled: "Cancelado",
          };

          // 1. Calculate sales statistics from the fetched 100 orders
          let countTotalToday = 0;
          let countPaidToday = 0;
          let amountPaidToday = 0;

          let countTotalYesterday = 0;
          let countPaidYesterday = 0;
          let amountPaidYesterday = 0;

          let countTotalWeek = 0;
          let countPaidWeek = 0;
          let amountPaidWeek = 0;

          let countPendingTotal = 0;

          recentOrders.forEach((o: any) => {
            const statusRaw = o.STATUS || o.status || "pending";
            const total = Number(o.total || o.TOTAL || 0);
            const ts =
              o.CREATEDAT ||
              (o.$createdAt ? new Date(o.$createdAt).getTime() : 0);
            const orderDateStr = ts ? getChileDateStr(ts) : "";
            const isPaid = REVENUE_STATUSES.includes(statusRaw);

            if (statusRaw === "pending") {
              countPendingTotal++;
            }

            // Today
            if (orderDateStr && orderDateStr === todayStr) {
              countTotalToday++;
              if (isPaid) {
                countPaidToday++;
                amountPaidToday += total;
              }
            }

            // Yesterday
            if (orderDateStr && orderDateStr === yesterdayStr) {
              countTotalYesterday++;
              if (isPaid) {
                countPaidYesterday++;
                amountPaidYesterday += total;
              }
            }

            // This week (last 7 days)
            if (ts && ts >= oneWeekAgoMs) {
              countTotalWeek++;
              if (isPaid) {
                countPaidWeek++;
                amountPaidWeek += total;
              }
            }
          });

          // 2. Search for a specific order if code is mentioned in userText
          let queriedOrderBlock = "";
          const fullCodeMatch = userText.match(/\b(?:[a-z]{2,8}-\d{2,10}|[a-f0-9]{20})\b/i);
          const numericCodeMatch = userText.match(/\b(\d{2,8})\b/i);
          const potentialCode = fullCodeMatch?.[0] || numericCodeMatch?.[1] || "";
          if (potentialCode) {
            const codeUpper = potentialCode.toUpperCase().trim();
            const acceptedCodes = new Set([codeUpper]);
            if (/^\d+$/.test(codeUpper)) acceptedCodes.add(`ORD-${codeUpper}`);
            let matchedOrder: any = null;
            let ambiguousOrderSearch = false;
            for (const candidateCode of acceptedCodes) {
              const lookup = await resolveWebhookOrder(candidateCode);
              if (lookup.status === "ambiguous") { ambiguousOrderSearch = true; break; }
              if (lookup.status === "found") { matchedOrder = lookup.match.order; break; }
            }

            if (ambiguousOrderSearch) {
              queriedOrderBlock = `\n\n## 🔍 BÚSQUEDA DE PEDIDO AMBIGUA:\nEl código #${codeUpper} aparece más de una vez. No reveles datos de pedidos ni elijas uno. Pide al cliente el enlace directo del pedido o deriva la búsqueda al equipo.`;
            }

            if (matchedOrder) {
              const statusRaw = String(
                matchedOrder.STATUS || matchedOrder.status || "pending",
              ) as string;
              const statusLabel = STATUS_LABELS[statusRaw] || statusRaw;
              const dateStr = matchedOrder.$createdAt
                ? new Date(String(matchedOrder.$createdAt)).toLocaleDateString(
                    "es-CL",
                    { timeZone: "America/Santiago" },
                  )
                : "?";

              queriedOrderBlock = `\n\n## 🔍 PEDIDO CONSULTADO (Coincide con tu búsqueda):
- Código/ID: #${matchedOrder.ORDERCODE || matchedOrder.$id}
- Cliente: ${matchedOrder.CUSTOMERNAME || "Sin nombre"}
- RUT: ${matchedOrder.CUSTOMERRUT || "-"}
- Teléfono: ${matchedOrder.CUSTOMERPHONE || "-"}
- Dirección: ${matchedOrder.ADDRESS || "-"}, ${matchedOrder.COMUNA || "-"}, ${matchedOrder.REGION || "-"}
- Agencia de Envío: ${matchedOrder.SHIPPINGAGENCY || "-"}
- Total: $${Number(matchedOrder.total || matchedOrder.TOTAL || 0).toLocaleString("es-CL")}
- Estado Actual: ${statusLabel} (${statusRaw})
- Fecha: ${dateStr}`;
            }
          }

          // 3. Format recent 15 orders list for context
          const orders = recentOrders.slice(0, 15).map((o: any) => {
            const id =
              o.ORDERCODE ||
              String(o.$id || "")
                .slice(-6)
                .toUpperCase();
            const name = o.CUSTOMERNAME || "Sin nombre";
            const total = o.total || o.TOTAL || 0;
            const statusRaw = String(
              o.STATUS || o.status || "pending",
            ) as string;
            const status = STATUS_LABELS[statusRaw] || statusRaw;
            const date = o.$createdAt
              ? new Date(String(o.$createdAt)).toLocaleDateString("es-CL", {
                  timeZone: "America/Santiago",
                })
              : "?";
            return `#${id} | ${name} | $${Number(total).toLocaleString("es-CL")} | ${status} | ${date}`;
          });

          const products = (productsRes.documents || [])
            .slice(0, 20)
            .map(
              (p: any) =>
                `${p.NAME} | Stock: ${p.STOCK ?? "?"} | Precio: $${p.PRICE ?? "?"}`,
            );

          contextBlock = `\n\n## 📊 ESTADÍSTICAS DE VENTAS (Cálculo automático de la base de datos):
- VENTAS HOY (Pagados/Completados): ${countPaidToday} pedidos | Monto total: $${amountPaidToday.toLocaleString("es-CL")} (Total pedidos recibidos hoy: ${countTotalToday})
- VENTAS AYER (Pagados/Completados): ${countPaidYesterday} pedidos | Monto total: $${amountPaidYesterday.toLocaleString("es-CL")} (Total pedidos recibidos ayer: ${countTotalYesterday})
- VENTAS ESTA SEMANA (Últimos 7 días): ${countPaidWeek} pedidos | Monto total: $${amountPaidWeek.toLocaleString("es-CL")} (Total pedidos recibidos esta semana: ${countTotalWeek})
- TOTAL PEDIDOS PENDIENTES DE PAGO: ${countPendingTotal} pedidos
${queriedOrderBlock}

## 📦 ÚLTIMOS PEDIDOS (Mostrando top 15 más recientes):
${orders.join("\n") || "Sin pedidos."}

## 🛍️ PRODUCTOS (Top 20 en catálogo):
${products.join("\n") || "Sin productos."}`;
        } else {
          // Customer: get products and their own orders
          const lowerText = userText.toLowerCase();
          const keywords = lowerText.split(/\s+/).filter((w) => w.length > 2);

          // Fetch customer's active orders based on fromPhone
          let customerOrdersText = "";
          let myOrders: any[] = [];
          try {
            const now = Date.now();
            const ordersCacheKey = fromPhone.replace(/\D/g, "");
            const cachedOrders = _ordersCache.get(ordersCacheKey);
            if (cachedOrders && now - cachedOrders.ts < ORDERS_CACHE_TTL) {
              myOrders = cachedOrders.data;
            } else {
              const cleanB = fromPhone.replace(/\D/g, "");
              const localB = cleanB.startsWith("56") ? cleanB.slice(2) : cleanB;
              const phoneVariants = Array.from(new Set([
                cleanB,
                `+${cleanB}`,
                localB,
                `+${localB}`,
              ].filter(Boolean)));
              const adminDb = getAdminDb();
              const queriedOrders = await Promise.all(
                [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID].map(async (collectionId) => {
                  const collection = adminDb.collection(collectionId);
                  const [byPhone, byLinkedPhone] = await Promise.all([
                    collection.where("CUSTOMERPHONE", "in", phoneVariants).limit(30).get().catch(() => null),
                    collection.where("LINKED_WHATSAPP", "array-contains-any", phoneVariants).limit(30).get().catch(() => null),
                  ]);
                  const docs = new Map<string, any>();
                  for (const snapshot of [byPhone, byLinkedPhone]) {
                    for (const doc of snapshot?.docs || []) {
                      docs.set(doc.id, {
                        $id: doc.id,
                        ...doc.data(),
                        __collectionId: collectionId,
                      });
                    }
                  }
                  return Array.from(docs.values());
                }),
              );
              const mergedOrders = new Map<string, any>();
              for (const order of queriedOrders.flat()) {
                const id = String(order.$id || "");
                const current = mergedOrders.get(id);
                if (
                  !current ||
                  order.__collectionId === VENDOR_ORDERS_COLLECTION_ID ||
                  order.VENDOR_ID ||
                  order.IS_VENDOR_ORDER
                ) {
                  mergedOrders.set(id || `${order.__collectionId}-${mergedOrders.size}`, order);
                }
              }
              myOrders = Array.from(mergedOrders.values())
                .filter((o: any) => {
                  const oPhone = String(o.CUSTOMERPHONE || "");
                  if (oPhone) {
                    const cleanA = oPhone.replace(/\D/g, "");
                    const cleanB = fromPhone.replace(/\D/g, "");
                    if (cleanA === cleanB) return true;
                    const tailA = cleanA.slice(-8);
                    const tailB = cleanB.slice(-8);
                    if (tailA.length === 8 && tailA === tailB) return true;
                  }
                  const linked: string[] = Array.isArray(o.LINKED_WHATSAPP)
                    ? o.LINKED_WHATSAPP
                    : [];
                  return linked.some((p: string) => phonesMatch(p, fromPhone));
                })
                .sort((a: any, b: any) => orderTimestamp(b) - orderTimestamp(a))
                .slice(0, 5);
              _ordersCache.set(ordersCacheKey, { data: myOrders, ts: now });
            }

            if (myOrders.length > 0) {
              const ordersFormatted = myOrders.map((o: any) => {
                const id = o.$id;
                const code = o.ORDERCODE || id.slice(-6).toUpperCase();
                const rawStatus = o.IS_VENDOR_ORDER && o.STATUS === "payment_expired"
                  ? (o.PAYMENTPROOFURL ? "payment_review" : "paid")
                  : o.STATUS || "pending";
                const STATUS_LABELS: Record<string, string> = {
                  pending: "Stock confirmado, pendiente de pago",
                  pending_stock: "Stock confirmado, pendiente de pago",
                  processing: "Stock confirmado, pendiente de pago",
                  paid: "Stock confirmado, pendiente de pago",
                  payment_expired: "Pago vencido; aún puede enviar comprobante dentro del plazo",
                  payment_review: "Comprobante recibido, pago en revisión",
                  payment_confirmed: "Pago confirmado; pedido en preparación",
                  confirmed: "Pago confirmado; pedido en preparación",
                  assembling: "En preparación",
                  negotiation: "En negociación / modificando",
                  preparing_shipping: "Etiqueta Lista",
                  ready_to_ship: "Listo para enviar",
                  shipped: "Enviado",
                  delivered: "Entregado a agencia de transporte",
                  cancelled: "Cancelado",
                };
                const status = STATUS_LABELS[rawStatus] || rawStatus;
                let missingText = "";
                try {
                  const items = JSON.parse(o.ITEMS || "[]");
                  const missingItems = items.filter(
                    (it: any) => it.missing === true,
                  );
                  if (missingItems.length > 0) {
                    missingText = `\n  ⚠️ PRODUCTOS FALTANTES: ${missingItems.map((it: any) => `${it.qty}x ${it.name}`).join(", ")}`;
                  }
                } catch (e) {}
                const agency = o.SHIPPINGAGENCY
                  ? ` | Agencia: ${o.SHIPPINGAGENCY}`
                  : "";
                const tracking = o.TRACKINGNUMBER
                  ? ` | Seguimiento: ${o.TRACKINGNUMBER}`
                  : "";
                const hasBoxPhoto = o.SHIPPINGPROOFURL
                  ? " | Tiene foto de caja"
                  : "";
                const hasPaymentProof = o.PAYMENTPROOFURL
                  ? " | Tiene comprobante de pago"
                  : "";
                return `- Pedido #${code} (ID: ${id}) | Total: $${o.TOTAL} | Estado: ${status}${agency}${tracking}${hasBoxPhoto}${hasPaymentProof}${missingText}`;
              });
              customerOrdersText = `\n\n## 📦 MIS PEDIDOS ACTIVOS:\n${ordersFormatted.join("\n")}`;
            }
          } catch (e) {
            console.warn("[WhatsApp] Error fetching customer orders:", e);
          }

          // 1. If customer has a negotiation order, fetch similar products for their missing items
          let suggestedProducts: any[] = [];
          const hasNegotiationOrder = myOrders.some(
            (o: any) => o.STATUS === "negotiation",
          );
          if (hasNegotiationOrder) {
            for (const o of myOrders) {
              if (o.STATUS !== "negotiation") continue;
              try {
                const items = JSON.parse(o.ITEMS || "[]");
                const missingItems = items.filter(
                  (it: any) => it.missing === true,
                );
                for (const item of missingItems) {
                  if (item.id) {
                    try {
                      const prod = await serverGetDocument(
                        PRODUCTS_COLLECTION_ID,
                        item.id,
                      );
                      const categoryId = (prod as any).CATEGORYID || "";
                      if (categoryId) {
                        const qCat = JSON.stringify({
                          method: "equal",
                          attribute: "CATEGORYID",
                          values: [categoryId],
                        });
                        const qLimit8 = JSON.stringify({
                          method: "limit",
                          values: [8],
                        });
                        const resSimilar = await serverListDocuments(
                          PRODUCTS_COLLECTION_ID,
                          [qCat, qLimit8],
                        );
                        if (
                          resSimilar.documents &&
                          resSimilar.documents.length > 0
                        ) {
                          suggestedProducts = [
                            ...suggestedProducts,
                            ...resSimilar.documents,
                          ];
                        }
                      }
                    } catch (e) {
                      console.warn(
                        "[WhatsApp Webhook] Could not load similar products for missing item:",
                        e,
                      );
                    }
                  }
                }
              } catch (e) {}
            }
          }

          // 2. Fetch/search catalog products
          let relevantProducts: any[] = [];
          let searched = false;

          // ── Special case: catalog order message → extract product names from lines ──
          const isCatalogOrderMsg =
            /\*\s*Hola\s+Yaxbot!?\s*\*/i.test(userText) ||
            /quiero\s+hacer\s+(este|un|mi)\s+pedido/i.test(userText);
          if (isCatalogOrderMsg) {
            // Extract product names from lines starting with "- " (format: "- PRODUCT NAME\n  QTY x $PRICE = $TOTAL")
            const productLines: string[] = [];
            const lines = userText.split("\n");
            for (const line of lines) {
              const m = line.match(/^\s*-\s+(.+?)\s*$/);
              if (m && !m[1].match(/^\d/)) {
                // Clean the product name: remove trailing price/qty info
                let name = m[1].trim();
                // Remove patterns like "2 x $32.500 = $65.000" that might be on the same line
                name = name.replace(/\d+\s*x\s*\$[\d.]+.*$/i, "").trim();
                if (name.length > 2) productLines.push(name);
              }
            }
            if (productLines.length > 0) {
              console.log(
                "[WhatsApp Webhook] Catalog order detected, searching products:",
                productLines,
              );
              for (const prodName of productLines) {
                try {
                  const qSearch = JSON.stringify({
                    method: "search",
                    attribute: "NAME",
                    values: [prodName],
                  });
                  const qLimit10 = JSON.stringify({
                    method: "limit",
                    values: [10],
                  });
                  const resSearch = await serverListDocuments(
                    PRODUCTS_COLLECTION_ID,
                    [qSearch, qLimit10],
                  );
                  if (resSearch.documents && resSearch.documents.length > 0) {
                    for (const doc of resSearch.documents) {
                      if (!relevantProducts.some((p) => p.$id === doc.$id)) {
                        relevantProducts.push(doc);
                      }
                    }
                    searched = true;
                  }
                } catch (e) {
                  console.warn(
                    "[WhatsApp Webhook] Catalog product search failed for:",
                    prodName,
                    e,
                  );
                }
              }
            }
          }

          if (!searched && keywords.length > 0) {
            try {
              const stopwords = [
                "precios",
                "precio",
                "mayor",
                "catalogo",
                "completo",
                "todos",
                "quiero",
                "saber",
                "imagen",
                "imagenes",
                "fotos",
                "costos",
                "costo",
                "hola",
                "como",
                "estas",
                "bien",
                "gracias",
              ];
              const searchKeywords = keywords.filter(
                (k) => !stopwords.includes(k),
              );
              if (searchKeywords.length > 0) {
                const searchQuery = searchKeywords.join(" ");
                const cacheKey = searchQuery.toLowerCase();
                const now = Date.now();
                const cached = _productSearchCache.get(cacheKey);
                if (cached && now - cached.ts < PROD_CACHE_TTL) {
                  relevantProducts = cached.data;
                  searched = true;
                } else {
                  const qSearch = JSON.stringify({
                    method: "search",
                    attribute: "NAME",
                    values: [searchQuery],
                  });
                  const qLimit25 = JSON.stringify({
                    method: "limit",
                    values: [25],
                  });
                  const resSearch = await serverListDocuments(
                    PRODUCTS_COLLECTION_ID,
                    [qSearch, qLimit25],
                  );
                  if (resSearch.documents && resSearch.documents.length > 0) {
                    relevantProducts = resSearch.documents;
                    searched = true;
                  } else {
                    // Fallback to tags search
                    const qTags = JSON.stringify({
                      method: "search",
                      attribute: "TAGS",
                      values: [searchQuery],
                    });
                    const resTags = await serverListDocuments(
                      PRODUCTS_COLLECTION_ID,
                      [qTags, qLimit25],
                    );
                    if (resTags.documents && resTags.documents.length > 0) {
                      relevantProducts = resTags.documents;
                      searched = true;
                    }
                  }
                  _productSearchCache.set(cacheKey, {
                    data: relevantProducts,
                    ts: now,
                  });
                }
              }
            } catch (searchErr) {
              console.warn(
                "[WhatsApp Webhook] Direct search failed:",
                searchErr,
              );
            }
          }

          // Default fallback: if no products were found via search, we load CATEGORIES instead of 50 products
          let categoriesList: string[] = [];
          if (relevantProducts.length === 0 && suggestedProducts.length === 0) {
            try {
              const now = Date.now();
              let catDocs: any[] = [];
              if (_catCache && now - _catCache.ts < CAT_CACHE_TTL) {
                catDocs = _catCache.data;
              } else {
                const qLimit100 = JSON.stringify({
                  method: "limit",
                  values: [100],
                });
                const catRes = await serverListDocuments(
                  CATEGORIES_COLLECTION_ID,
                  [qLimit100],
                );
                catDocs = catRes.documents || [];
                _catCache = { data: catDocs, ts: now };
              }
              categoriesList = catDocs.map(
                (c: any) => `- ${c.name} (ID: ${c.$id})`,
              );
            } catch (e) {
              console.error("[WhatsApp Webhook] Categories query failed:", e);
            }
          }

          // Merge keeping suggested products at the top and avoiding duplicates
          const finalProducts: any[] = [...suggestedProducts];
          relevantProducts.forEach((p: any) => {
            if (!finalProducts.some((fp) => fp.$id === p.$id)) {
              finalProducts.push(p);
            }
          });

          let contextBlockAdditions = "";
          if (finalProducts.length > 0) {
            const productList = finalProducts.slice(0, 20).map((p: any) => {
              const price = p.CURRENTPRICE || p.PRICE || 0;
              const wholesalePrice = p.WHOLESALEPRICE || 0;
              const stock = p.STOCK ?? 0;
              const stockLabel =
                stock > 0 ? `✅ Disponible (${stock} uds)` : "❌ Sin stock";

              let priceText = `$${Number(price).toLocaleString("es-CL")}`;
              if (wholesalePrice > 0) {
                priceText += ` (Precio por mayor: $${Number(wholesalePrice).toLocaleString("es-CL")})`;
              }
              return `• *${p.NAME}* (id: ${p.$id}) — ${priceText} | ${stockLabel}`;
            });
            contextBlockAdditions = `## 🛍️ PRODUCTOS BUSCADOS (${finalProducts.length} encontrados):\n${productList.join("\n")}`;
          } else if (categoriesList.length > 0) {
            contextBlockAdditions = `## 📁 CATEGORÍAS DISPONIBLES:\n(Recomienda estas categorías enviando el enlace de la tienda según el nombre)\n${categoriesList.join("\n")}`;
          } else {
            contextBlockAdditions = `No se encontraron productos ni categorías.`;
          }

          contextBlock = `${customerOrdersText}\n\n${contextBlockAdditions}\n\nSitio web: ${SITE_URL}`;
        }
      } catch (dbErr) {
        console.warn("[WhatsApp] DB context error:", dbErr);
      }
    }

    // ── Build conversation history for Gemini ─────────────────────────────────
    const history = await getHistory(fromPhone);
    await addToHistory(fromPhone, "user", userText, msgId);

    const nowChileStr = new Date().toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const timeBlock = `\n\n## 📅 FECHA Y HORA ACTUAL (Chile):
- ${nowChileStr}
(Usa esta fecha como referencia absoluta de "hoy" para determinar qué pedidos corresponden a "hoy", "ayer", etc.)`;

    // Números admin que nunca pueden ser baneados/bloqueados (inmune incluso en MODO CLIENTE)
    const BAN_PROOF_PHONES = ADMIN_PHONES;
    const isBanProof = BAN_PROOF_PHONES.includes(cleanedFrom);

    if (!isAdmin) {
      const usageCheck = await getKeniaUsage(
        fromPhone,
        keniaConfig.blockedPhones,
      );

      // Si es un número inmune (admin probando), auto-desbloquear si estaba bloqueado
      if (isBanProof && (usageCheck.blocked || usageCheck.spamBlocked)) {
        await setKeniaBlocked(fromPhone, false);
        usageCheck.blocked = false;
        usageCheck.spamBlocked = false;
      }

      // ── Anti-spam: detectar más de 8 mensajes en 2 minutos ──
      const now = Date.now();
      const recentTimestamps = (usageCheck.lastMessageTimestamps || []).filter(
        (ts: number) => now - ts < 120_000,
      );
      recentTimestamps.push(now);
      await recordKeniaUsage(fromPhone, {
        lastMessageTimestamps: recentTimestamps,
      });

      if (
        !isBanProof &&
        !usageCheck.spamBlocked &&
        recentTimestamps.length > 8
      ) {
        // Auto-bloquear por spam
        await setKeniaBlocked(fromPhone, true, "spam");
        const MAIN_ADMIN_PHONE = (
          keniaConfig.adminAlertPhone || ADMIN_PHONES[0] || ""
        ).replace(/\D/g, "");
        const spamAlert = `🚫 *ALERTA ANTI-SPAM*\nEl número +${fromPhone} fue bloqueado automáticamente por enviar ${recentTimestamps.length} mensajes en menos de 2 minutos.\n\nÚltimo mensaje: "${userText}"\n\n🔗 Revisa en el panel: ${SITE_URL}/admin/ia/whatsapp`;
        await sendWhatsAppMessage(MAIN_ADMIN_PHONE, spamAlert, WA_TOKEN);
        return NextResponse.json({ status: "spam_blocked" });
      }

      if (usageCheck.blocked) {
        // Siempre guardar el mensaje del cliente en el history para que el admin lo vea
        await addToHistory(fromPhone, "user", userText, msgId);

        if (usageCheck.spamBlocked) {
          // Spam: silencio total, no responder nada
          return NextResponse.json({ status: "spam_blocked" });
        }
        if (usageCheck.adminTakeover || usageCheck.escalated) {
          const MAIN_ADMIN_PHONE = (
            keniaConfig.adminAlertPhone || ADMIN_PHONES[0] || ""
          ).replace(/\D/g, "");
          const adminNotif = `📩 *Cliente esperando respuesta*\n+${fromPhone} escribió: "${userText.slice(0, 300)}"\n\n🔗 Conversación: ${SITE_URL}/admin/ia/whatsapp?phone=${encodeURIComponent(fromPhone)}\n💬 WhatsApp: https://wa.me/${fromPhone}`;
          const nowWaiting = Date.now();
          const lastWaitingNotice = usageCheck.lastStallReplyTs || 0;
          if (nowWaiting - lastWaitingNotice > 3 * 60 * 1000) {
            await sendWhatsAppMessage(MAIN_ADMIN_PHONE, adminNotif, WA_TOKEN);
            await recordKeniaUsage(fromPhone, { lastStallReplyTs: nowWaiting });
          }
          return NextResponse.json({ status: "admin_takeover_silent" });
        }
        // Bloqueo normal (manual): NO responder nada, solo guardar mensaje y notificar admin (throttled)
        const nowBlocked = Date.now();
        const lastBlockedTs = usageCheck.lastStallReplyTs || 0;
        const BLOCKED_NOTIFY_COOLDOWN = 3 * 60 * 1000; // 3 min
        if (nowBlocked - lastBlockedTs > BLOCKED_NOTIFY_COOLDOWN) {
          const MAIN_ADMIN_PHONE = (
            keniaConfig.adminAlertPhone || ADMIN_PHONES[0] || ""
          ).replace(/\D/g, "");
          const adminNotifBlocked = `⚠️ *Cliente pausado escribió*\n+${fromPhone}: "${userText}"\n\n🔗 Atiéndelo en: ${SITE_URL}/admin/ia/whatsapp`;
          await sendWhatsAppMessage(
            MAIN_ADMIN_PHONE,
            adminNotifBlocked,
            WA_TOKEN,
          );
          await recordKeniaUsage(fromPhone, { lastStallReplyTs: nowBlocked });
        }

        return NextResponse.json({ status: "blocked" });
      }
    }

    // Las consultas de clientes se resuelven con reglas fijas. Los flujos de
    // pedido del catálogo y comprobante ya fueron procesados arriba; aquí nunca
    // llamamos a Gemini para responder a un cliente.
    if (!isAdmin) {
      let reply: string;
      let status: string;

      if (isNewCatalogOrderRequest(userText)) {
        reply = customerCatalogReply();
        status = "customer_catalog_link_sent";
      } else if (isOrderStatusRequest(userText)) {
        reply = customerOrderStatusReply();
        status = "customer_order_status_link_sent";
      } else if (isGreeting(userText)) {
        const firstName = (customerName || "").trim().split(/\s+/)[0];
        if (!usage.welcomeShown) {
          reply = `¡Hola${firstName ? ` ${firstName}` : ""}! Soy Yaxbot. Puedo ayudarte con el proceso de compra y el comprobante. Para revisar el estado de un pedido, toca *Ver mi pedido*.`;
          await sendWelcomeMenu(fromPhone, customerName || "amigo", WA_TOKEN, reply);
          await addToHistory(fromPhone, "assistant", reply, msgId);
          await recordKeniaUsage(fromPhone, { welcomeShown: true });
          return NextResponse.json({ status: "welcome_menu_sent" });
        }
        const supportContact = CUSTOMER_SUPPORT_PHONE
          ? `escríbele a *Importadora Carlitos* al *+${CUSTOMER_SUPPORT_PHONE}*.`
          : `revisa el WhatsApp de contacto de la tienda.`;
        reply = `¡Hola${firstName ? ` ${firstName}` : ""}! Soy Yaxbot. ${customerOrderStatusReply()}\n\nPara otras consultas, ${supportContact}`;
        status = "customer_greeting_sent";
      } else {
        reply = customerSupportReply();
        status = "customer_support_contact_sent";
      }

      await addToHistory(fromPhone, "assistant", reply, msgId);
      await sendWhatsAppMessage(fromPhone, reply, WA_TOKEN);
      return NextResponse.json({ status });
    }

    // La IA está apagada. Conservamos los flujos automáticos de clientes,
    // pero no enviamos mensajes de administración a Gemini.
    if (!AI_ENABLED) {
      const reply = "La IA está desactivada. Los flujos automáticos de compra y pedidos para clientes siguen activos.";
      await addToHistory(fromPhone, "assistant", reply, msgId);
      await sendWhatsAppMessage(fromPhone, reply, WA_TOKEN);
      return NextResponse.json({ status: "admin_ai_disabled" });
    }

    // ── BALATIN DATA MODE: override prompt for data parsing ────────────────────
    const balatinDataMode = (usage as any)._balatinDataMode === true;
    const balatinOrderId = (usage as any)._balatinOrderId;
    const balatinOrderCode = (usage as any)._balatinOrderCode;

    let basePrompt: string;
    if (balatinDataMode) {
      // Special Yaxbot prompt for parsing shipping data
      basePrompt = `Eres Yaxbot, el gato de la suerte de Importadora Carlitos. Estás ayudando al cliente ${customerName} a completar los datos de envío de su pedido ${balatinOrderCode}.

## TU ÚNICA TAREA AHORA:
El cliente te mandó todos sus datos de envío juntos. Debes EXTRAER los datos y guardarlos con la acción UPDATE_SHIPPING. Luego mostrar un resumen y pedir confirmación.

## Datos obligatorios que necesitas:
1. *RUT* (formato chileno: acepta con o sin puntos, con o sin guión. Ej válidos: 12.345.678-9, 12345678-9, 123456789. Solo recházalo si tiene menos de 7 dígitos antes del dígito verificador)
2. *Nombre completo* (nombres y apellidos) — si ya tienes el nombre del cliente, no lo pidas de nuevo
3. *Dirección* (calle, número, depto/casa)
4. *Comuna*
5. *Región*
6. *Agencia de envío* (Starken, Chilexpress, BluExpress, o "retiro en tienda")
7. Email (correo electrónico) — *OPCIONAL, no obligatorio*

## Cómo responder:
1. Extrae TODOS los datos del mensaje del cliente.
2. Guárdalos con [ACTION:UPDATE_SHIPPING].
3. Muestra un RESUMEN claro con todos los datos extraídos.
4. Si faltan datos obligatorios (RUT, dirección, comuna, región, agencia), dile cuáles faltan. NO pidas email si no lo dio.
5. Si todos los datos obligatorios están completos, pregúntale: "¿Estos datos están correctos? Responde *CORRECTO* para confirmar."
6. NO analices ni valides comprobantes de pago. NO menciones montos.
7. Datos extra (observaciones, instrucciones especiales) → inclúyelos en "observations".

## Formato de la acción (incluye todos los campos que extraíste):
[ACTION:UPDATE_SHIPPING]{"address":"Calle 123, depto 4","comuna":"Santiago","region":"Metropolitana","shippingAgency":"Starken","customerRut":"12.345.678-9","customerName":"Juan Pérez","customerEmail":"juan@email.com","observations":"Timbre 2"}[/ACTION]

## REGLAS:
- NO inventes datos. Solo usa lo que el cliente te escribió.
- NO pidas el teléfono (ya lo tienes).
- Sé cálido y breve. Usa su nombre.
- Acepta el RUT en cualquier formato (con puntos, sin puntos, con guión, sin guión).
- El email es OPCIONAL: si el cliente lo da, lo guardas; si no lo da, NO se lo pidas.
- Cuando tengas todos los datos obligatorios (RUT, dirección, comuna, región, agencia), muestra el resumen y pide confirmación con "CORRECTO".`;
    } else {
      basePrompt = isAdmin
        ? keniaConfig.adminPrompt || ADMIN_PROMPT
        : hydratePrompt(
            keniaConfig.customerPrompt || CUSTOMER_PROMPT,
            SITE_URL,
          );
    }

    if (!isAdmin) {
      basePrompt += `\n\n## ⚠️ REGLA ESTRICTA DE ANTI-ALUCINACIÓN PARA PEDIDOS:\nSi el cliente pregunta por su pedido y la sección "MIS PEDIDOS ACTIVOS" está vacía o no existe en tu contexto, **TIENES ESTRICTAMENTE PROHIBIDO INVENTAR ENLACES O FALTANTES DE STOCK**. Debes responder EXACTAMENTE: "Mmm, estoy buscando con tu número pero no logro encontrar tu pedido activo en el sistema 🥺. Déjame pedirle ayuda al equipo para que lo busquen manualmente, ¡dame unos minutitos! 🐾" y luego **AÑADIR OBLIGATORIAMENTE** al final de tu respuesta: [ACTION:ASK_ADMIN]El cliente pregunta por su pedido pero no encuentro ninguno activo en la base de datos.[/ACTION].`;
      basePrompt += `\n\n## 🔇 REGLA DE CIERRE DE CONVERSACIÓN:\n**NUNCA** hagas preguntas abiertas al final de tu respuesta (Ej: "¿te ayudo con algo más?", "¿qué más necesitas?", "¿cuéntame?"). Responde PUNTUALMENTE lo que te preguntaron y cierra el mensaje. Si el cliente no pregunta nada nuevo, la conversación termina ahí.`;
      basePrompt += `\n\n## 📦 REGLA DE SEGUIMIENTO DE PEDIDOS:\nCuando un cliente pregunte por su pedido, basa tu respuesta **ÚNICAMENTE** en el estado que aparece en "MIS PEDIDOS ACTIVOS". \n**TIENES ESTRICTAMENTE PROHIBIDO:**\n- Inventar que el pedido fue enviado si el estado NO es "Embalado" o "Entregado a agencia".\n- Inventar números de seguimiento que no aparecen en el contexto.\n- Enviar o mencionar URLs de comprobantes o fotos que no estén explícitamente en el contexto.\n\n**Interpreta los estados así:**\n- "Stock Confirmado" → El pedido está registrado, el stock quedó reservado y el cliente todavía debe pagar. Si aparece un cronómetro, sigue activo.\n- "Pago vencido" → El cronómetro de pago llegó a cero. El pedido todavía puede recibir el comprobante hasta cumplir 24 horas desde su creación; usa el contador del sistema; no digas que fue cancelado mientras el pedido no figure como "Cancelado".\n- "Revisando Pago" → El comprobante fue recibido y el pago está pendiente de verificación.\n- "Pago Confirmado" → El pago fue verificado; el equipo prepara el pedido. No digas que ya fue enviado.\n- "Embalado" → El pedido está preparado para despacho o retiro.\n- "Entregado a agencia" → Si hay número de seguimiento, dilo con el enlace de la agencia. Si no hay número, explica que todavía no aparece en el sistema.\n- "Cancelado" → El sistema canceló el pedido; solo afirma que el stock fue devuelto si eso aparece indicado en el pedido.\n- En retiro en tienda, cuando aparezca "Listo para retirar", informa que puede retirarlo.\n- Links de seguimiento por agencia:\n  - BluExpress: https://www.blue.cl/enviar/seguimiento?n_seguimiento=NUMERO\n  - Starken: https://www.starken.cl/seguimiento?n_seguimiento=NUMERO\n  - Chilexpress: https://www.chilexpress.cl/centro-de-ayuda/seguimiento-de-envios\n\n**NUNCA envíes links de comprobantes de pago como si fueran comprobantes de envío.**`;

      if (usage.balatinOrderFlow === true) {
        const flowInstructions: Record<string, string> = {
          awaiting_proof_confirmation: `El cliente acaba de enviar una imagen y todavía debe confirmar si es su comprobante. La imagen NO está adjunta al pedido ni se notificó a la cajera. Si pregunta algo distinto, responde primero esa consulta con los datos reales del pedido y termina recordándole brevemente que después confirme "Sí" o "No" sobre la imagen. No afirmes que recibiste o revisaste el pago. No cambies el paso ni canceles el pedido por una consulta ajena. Si pide cancelar explícitamente, no abras una segunda confirmación de "Sí/No" (podría confundirse con la confirmación del comprobante): informa que pasarás la solicitud al equipo y añade [ACTION:ASK_ADMIN]El cliente solicita cancelar el pedido #${usage.balatinOrderCode || usage.balatinOrderId || "sin código"} mientras hay una imagen de comprobante pendiente; no adjuntar ni revisar la imagen.[/ACTION].`,
          awaiting_payment: `El pedido todavía espera el comprobante. Responde primero lo que el cliente preguntó usando el estado real del pedido. No contestes con un recordatorio genérico como única respuesta ni repitas los datos de pago en cada mensaje. Si preguntó algo ajeno al pedido, añade al final una frase breve: para continuar debe enviar el comprobante por este chat; si ya no quiere seguir, puede pedir que solicitemos la cancelación. No afirmes que ya pagó ni que cancelaste el pedido.`,
          awaiting_shipping_data: `El comprobante ya fue asociado y el pago está en revisión; eso NO significa que el pago esté confirmado ni que el pedido haya sido despachado. Responde las preguntas con el estado real de MIS PEDIDOS ACTIVOS. Si aún faltan datos de despacho y el cliente pregunta cómo continuar, el enlace es ${SITE_URL}/confirmar-pedido?${usage.balatinOrderId ? `id=${encodeURIComponent(String(usage.balatinOrderId))}` : `code=${encodeURIComponent(String(usage.balatinOrderCode || ""))}`}. No respondas siempre con el mismo enlace cuando pregunta otra cosa.`,
          completed: `El flujo automatizado de pedido ya avanzó. Responde consultas de seguimiento según el estado real de MIS PEDIDOS ACTIVOS; no vuelvas a pedir comprobante ni datos que ya consten en el pedido.`,
        };
        const activeFlowInstruction = flowInstructions[String(usage.balatinStep || "")];
        if (activeFlowInstruction) {
          basePrompt += `\n\n## 🤖 FLUJO ACTIVO DEL BOT (PASO: ${usage.balatinStep}):\n${activeFlowInstruction}\n\nSi el mensaje no es una respuesta clara "Sí" o "No" durante la confirmación del comprobante, atiende la consulta normalmente y deja pendiente la confirmación. Nunca canceles ni cambies el estado del pedido por una pregunta no relacionada. Si pide cancelar explícitamente fuera del paso de confirmar comprobante, pregunta si confirma que quiere solicitar la cancelación. Solo si confirma claramente, dile que enviarás la solicitud al equipo y añade [ACTION:ASK_ADMIN]El cliente confirmó que solicita cancelar el pedido #${usage.balatinOrderCode || usage.balatinOrderId || "sin código"}.[/ACTION]. Nunca cambies el estado ni afirmes que ya está cancelado.`;
        }
      }
    }
    const customerNameBlock =
      !isAdmin && customerName
        ? "\n\n## 👤 DATOS DEL CLIENTE:\nNombre: " +
          customerName +
          "\n(Usa su nombre real para saludar. Puedes usar expresiones felinas con moderación, no en cada frase.)"
        : "";
    const systemPrompt =
      basePrompt + timeBlock + contextBlock + customerNameBlock;

    // If Yaxbot data mode with accumulated data, use that instead of just the last message
    const balatinAccumulatedData = (usage as any)._balatinAccumulatedData as
      string | undefined;
    const effectiveUserText =
      balatinDataMode && balatinAccumulatedData
        ? balatinAccumulatedData
        : userText;

    const rawContents = [
      ...history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || "..." }],
      })),
      {
        role: "user",
        parts: [{ text: effectiveUserText || "..." }, ...inlineDataParts],
      },
    ];

    // Fix Gemini history strict alternating rules (must start with user, must alternate user/model)
    const contents: any[] = [];
    for (const msg of rawContents) {
      if (contents.length === 0) {
        if (msg.role === "model") {
          // Prepend a dummy user message so it starts with user
          contents.push({ role: "user", parts: [{ text: "Hola" }] });
        }
        contents.push(msg);
      } else {
        const last = contents[contents.length - 1];
        if (last.role === msg.role) {
          // Combine consecutive messages of the same role
          const lastText = last.parts[0]?.text || "";
          const newText = msg.parts[0]?.text || "";
          last.parts[0].text = lastText + "\n\n" + newText;
          if (msg.parts.length > 1) {
            last.parts.push(...msg.parts.slice(1));
          }
        } else {
          contents.push(msg);
        }
      }
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: isAdmin ? 4096 : 1024,
      },
    };

    // ── Call Gemini ────────────────────────────────────────────────────────────
    let aiReply =
      "¡Miau! 🐾 Tuve un problemita técnico para procesar tu mensaje 🥺. Dame un momentito y vuelve a intentarlo, ¡pronto estaremos conversando! ✨";
    let rawText = "";
    let usageMetadata: any = null;
    const geminiHeaders = await getGeminiAuthHeaders();
    for (const model of GEMINI_MODELS) {
      const url = buildGeminiUrl(model);
      const res = await fetch(url, {
        method: "POST",
        headers: geminiHeaders,
        body: JSON.stringify(geminiBody),
      });
      if (res.ok) {
        const data = await res.json();
        usageMetadata = data?.usageMetadata || null;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          rawText = text;
          aiReply = text
            .replace(/\[ACTION:[^\]]+\][\s\S]*?\[\/ACTION\]/g, "") // strip any action blocks
            .replace(/\*\*(.*?)\*\*/g, "*$1*") // convert **bold** to WA *bold*
            .trim();
          break;
        }
        console.warn(
          `[Gemini] Model ${model} returned OK but no text. Response:`,
          JSON.stringify(data).substring(0, 500),
        );
      } else {
        const errBody = await res.text().catch(() => "no body");
        console.warn(
          `[Gemini] Model ${model} failed with status ${res.status}:`,
          errBody.substring(0, 300),
        );
      }
      if (res.status !== 503 && res.status !== 429) break;
    }

    // If all Gemini models failed, notify admin
    if (!rawText && !isAdmin) {
      try {
        const MAIN_ADMIN_PHONE = (
          keniaConfig.adminAlertPhone || ADMIN_PHONES[0] || ""
        ).replace(/\D/g, "");
        const failAlert = `⚠️ *BALATIN: Error de Gemini*\n\nNo pude responder a +${fromPhone}. Todos los modelos fallaron.\n\nMensaje del cliente: "${userText.substring(0, 100)}"\n\nRevisa el log del servidor para más detalles.`;
        await sendWhatsAppMessage(MAIN_ADMIN_PHONE, failAlert, WA_TOKEN);
      } catch {}
    }

    // ── Action Parsing & Execution (UPDATE_ORDER) ──────────────────────────────
    const actionRegex = /\[ACTION:UPDATE_ORDER\]([\s\S]*?)\[\/ACTION\]/;
    const actionMatch = rawText.match(actionRegex);
    if (actionMatch && isAdmin) {
      try {
        const actionData = JSON.parse(actionMatch[1]);
        const { code, status } = actionData;
        if (code && status) {
          const codeUpper = String(code).toUpperCase().trim();
          const lookup = await resolveWebhookOrder(codeUpper);

          if (lookup.status === "ambiguous") {
            aiReply = `⚠️ No cambié el pedido #${codeUpper}: ese folio está repetido. Indica el ID completo del pedido para elegirlo con seguridad.`;
          } else if (lookup.status === "found") {
            const matchedOrder = lookup.match.order as any;
            const collectionId = lookup.match.collectionId;
            try {
              const oldStatus =
                matchedOrder.STATUS || matchedOrder.status || "pending";
              await serverUpdateDocument(
                collectionId,
                matchedOrder.$id,
                {
                  STATUS: status,
                  UPDATEDAT: Date.now(),
                },
              );
              if (matchedOrder.IS_VENDOR_ORDER || matchedOrder.VENDOR_ID) {
                const mirror = collectionId === VENDOR_ORDERS_COLLECTION_ID ? ORDERS_COLLECTION_ID : VENDOR_ORDERS_COLLECTION_ID;
                await serverUpdateDocument(mirror, matchedOrder.$id, { STATUS: status, UPDATEDAT: Date.now() }).catch(() => {});
              }

              // Try notifying
              try {
                const { notifyOrderStatusChange } =
                  await import("@/services/notificationService");
                await notifyOrderStatusChange(matchedOrder, oldStatus, status);
              } catch (errNotif) {
                console.warn(
                  "[WhatsApp Webhook] Notification error:",
                  errNotif,
                );
              }
              console.log(
                `[WhatsApp Webhook] Order ${matchedOrder.$id} status updated to ${status}`,
              );
            } catch (updateErr: any) {
              console.error(
                "[WhatsApp Webhook] serverUpdateDocument failed:",
                updateErr,
              );
              aiReply = `❌ Hubo un error al intentar actualizar el estado del pedido #${codeUpper} en la base de datos. Detalle: ${updateErr?.message || String(updateErr)}`;
            }
          } else {
            aiReply = `❌ No pude encontrar el pedido #${codeUpper} en la base de datos. Por favor verifica el código e inténtalo de nuevo.`;
          }
        }
      } catch (actionErr) {
        console.error(
          "[WhatsApp Webhook] Action parsing/execution error:",
          actionErr,
        );
        aiReply = `❌ Hubo un error al procesar la acción del pedido. Por favor inténtalo de nuevo.`;
      }
    }
    // ── Action Parsing & Execution (MARK_MISSING) ──────────────────────────────
    const markMissingRegex = /\[ACTION:MARK_MISSING\]([\s\S]*?)\[\/ACTION\]/;
    const markMissingMatch = rawText.match(markMissingRegex);
    if (markMissingMatch && isAdmin) {
      try {
        const actionData = JSON.parse(markMissingMatch[1]);
        const { code, products } = actionData;
        if (code && Array.isArray(products) && products.length > 0) {
          const codeUpper = String(code).toUpperCase().trim();
          const lookup = await resolveWebhookOrder(codeUpper);
          if (lookup.status === "ambiguous") {
            aiReply += `\n⚠️ No actualicé el pedido #${codeUpper}: el folio está repetido. Indica el ID completo para continuar con seguridad.`;
          } else if (lookup.status === "found") {
            const matchedOrder = lookup.match.order as any;
            const collectionId = lookup.match.collectionId;
            const inventoryMode = await getOrderInventoryConnectionMode(matchedOrder);
            let items = [];
            try {
              items = JSON.parse(matchedOrder.ITEMS || "[]");
            } catch (e) {}

            let changed = false;
            for (const prodName of products) {
              const pNameLower = String(prodName).toLowerCase().trim();
              const itemToMark = items.find(
                (i: any) =>
                  i.name.toLowerCase().includes(pNameLower) && !i.missing,
              );
              if (itemToMark) {
                itemToMark.missing = true;
                changed = true;
                if (itemToMark.id) {
                  try {
                    await serverUpdateDocument(
                      PRODUCTS_COLLECTION_ID,
                      itemToMark.id,
                      inventoryStockUpdate(0, inventoryMode, !isVendorOrder(matchedOrder)),
                    );
                  } catch (e) {
                    console.warn(
                      "[WhatsApp] Could not block product stock to 0:",
                      e,
                    );
                  }
                }
              }
            }
            if (changed) {
              await serverUpdateDocument(
                collectionId,
                matchedOrder.$id,
                {
                  ITEMS: JSON.stringify(items),
                  STATUS: "negotiation",
                  UPDATEDAT: Date.now(),
                },
              );
              if (matchedOrder.IS_VENDOR_ORDER || matchedOrder.VENDOR_ID) {
                const mirror = collectionId === VENDOR_ORDERS_COLLECTION_ID ? ORDERS_COLLECTION_ID : VENDOR_ORDERS_COLLECTION_ID;
                await serverUpdateDocument(mirror, matchedOrder.$id, { ITEMS: JSON.stringify(items), STATUS: "negotiation", UPDATEDAT: Date.now() }).catch(() => {});
              }
              console.log(
                `[WhatsApp Webhook] Order ${matchedOrder.$id} marked missing for ${products.join(",")}`,
              );
            } else {
              aiReply += `\n⚠️ (Info interna: No encontré los productos mencionados en el pedido #${codeUpper} que no estuvieran ya marcados).`;
            }
          } else {
            aiReply += `\n❌ (Info interna: No encontré el pedido #${codeUpper} en la base de datos).`;
          }
        }
      } catch (err) {
        console.error("[WhatsApp Webhook] MARK_MISSING parsing error:", err);
      }
    }

    // ── Action Parsing & Execution (NOTIFY_NEGOTIATION) ────────────────────────
    const notifyRegex = /\[ACTION:NOTIFY_NEGOTIATION\]([\s\S]*?)\[\/ACTION\]/;
    const notifyMatch = rawText.match(notifyRegex);
    if (notifyMatch && isAdmin) {
      try {
        const actionData = JSON.parse(notifyMatch[1]);
        const { code } = actionData;
        if (code) {
          const codeUpper = String(code).toUpperCase().trim();
          const lookup = await resolveWebhookOrder(codeUpper);
          if (lookup.status === "ambiguous") {
            aiReply += `\n⚠️ No envié el aviso para #${codeUpper}: el folio está repetido. Indica el ID completo del pedido.`;
          } else if (lookup.status === "found") {
            const matchedOrder = lookup.match.order as any;
            // Llama al cron de negociación internamente pasando el orderId
            const cronUrl = `${SITE_URL}/api/cron/negotiation?secret=${process.env.CRON_SECRET || "negotiation_secret_key_2026"}&orderId=${matchedOrder.$id}`;
            fetch(cronUrl).catch((e) =>
              console.error("[WhatsApp] Cron trigger error:", e),
            );
            console.log(
              `[WhatsApp Webhook] Triggered negotiation cron for order ${matchedOrder.$id}`,
            );
            aiReply += `\n\n✅ Se ha activado la notificación al cliente por WhatsApp para el pedido #${codeUpper}.`;
          } else {
            aiReply += `\n❌ No pude encontrar el pedido #${codeUpper} para notificar.`;
          }
        }
      } catch (err) {
        console.error(
          "[WhatsApp Webhook] NOTIFY_NEGOTIATION parsing error:",
          err,
        );
      }
    }

    // ── Action Parsing & Execution (REPLY_CUSTOMER) ──────────────────────────────
    const replyCustomerRegex =
      /\[ACTION:REPLY_CUSTOMER\]([\s\S]*?)\[\/ACTION\]/;
    const replyCustomerMatch = rawText.match(replyCustomerRegex);
    if (replyCustomerMatch && isAdmin) {
      try {
        const actionData = JSON.parse(replyCustomerMatch[1]);
        const { phone, message } = actionData;
        if (phone && message) {
          const cleanPhone = phone.replace(/\D/g, "");
          await sendWhatsAppMessage(cleanPhone, message, WA_TOKEN);
          await addToHistory(
            cleanPhone,
            "assistant",
            message,
            `admin-reply-${Date.now()}`,
          );
          aiReply += `\n\n✅ Mensaje enviado al cliente (+${cleanPhone}).`;
          console.log(
            `[WhatsApp Webhook] Sent admin reply to ${cleanPhone}: ${message}`,
          );
        }
      } catch (err) {
        console.error("[WhatsApp Webhook] REPLY_CUSTOMER parsing error:", err);
      }
    }

    // ── Action Parsing & Execution (SEARCH_SKU) ──────────────────────────────
    if (!isAdmin) {
      const searchSkuRegex = /\[ACTION:SEARCH_SKU\]([\s\S]*?)\[\/ACTION\]/;
      const searchSkuMatch = rawText.match(searchSkuRegex);
      if (searchSkuMatch) {
        const skuCode = searchSkuMatch[1]?.trim()?.toUpperCase();
        if (skuCode) {
          try {
            const qCode = JSON.stringify({
              method: "equal",
              attribute: "SKU",
              values: [skuCode],
            });
            const qName = JSON.stringify({
              method: "search",
              attribute: "NAME",
              values: [skuCode],
            });
            const resSku = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
              qCode,
              JSON.stringify({ method: "limit", values: [1] }),
            ]);
            let foundProd = resSku.documents?.[0];

            if (!foundProd) {
              const resName = await serverListDocuments(
                PRODUCTS_COLLECTION_ID,
                [qName, JSON.stringify({ method: "limit", values: [1] })],
              );
              foundProd = resName.documents?.[0];
            }

            if (foundProd) {
              const prodLink = `${SITE_URL}/producto/${foundProd.$id}`;
              aiReply =
                `¡Aquí tienes el producto que buscas! 🐾\n*${foundProd.NAME}*\n🔗 ${prodLink}\n\n${aiReply}`.trim();
            } else {
              aiReply =
                `Mmm, busqué el código ${skuCode}, pero no logro encontrar el link exacto 🥺. ${aiReply}`.trim();
            }
          } catch (e) {
            console.error("[WhatsApp Webhook] SEARCH_SKU intercept error:", e);
          }
        }
      }
    }

    // ── Action Parsing & Execution (CREATE_ORDER) ────────────────────────────
    // Yaxbot crea el pedido apenas tiene los productos y el nombre del cliente (no espera dirección/comuna/región).
    // El stock se reserva automáticamente; los datos de envío se completan mientras el cliente paga.
    if (!isAdmin) {
      const createOrderRegex = /\[ACTION:CREATE_ORDER\]([\s\S]*?)\[\/ACTION\]/;
      const createOrderMatch = rawText.match(createOrderRegex);
      if (createOrderMatch) {
        try {
          const orderData = JSON.parse(createOrderMatch[1]);
          const {
            items,
            customerName,
            customerRut,
            address,
            comuna,
            region,
            shippingAgency,
          } = orderData as {
            items: Array<{ id?: string; qty: number }>;
            customerName?: string;
            customerRut?: string;
            address?: string;
            comuna?: string;
            region?: string;
            shippingAgency?: string;
          };

          if (!Array.isArray(items) || items.length === 0 || !customerName) {
            aiReply += `\n⚠️ (Info interna: Faltan datos obligatorios (productos y/o nombre) para crear el pedido — sigue pidiéndolos al cliente).`;
          } else {
            // Resolve real product data from DB to avoid hallucinated prices/names
            const itemsData: Array<{
              id: string;
              sku: string;
              name: string;
              qty: number;
              price: number;
              total: number;
              img: string;
            }> = [];
            const notFoundItems: string[] = [];
            for (const it of items) {
              if (!it.id) continue;
              try {
                const prod: any = await serverGetDocument(
                  PRODUCTS_COLLECTION_ID,
                  it.id,
                );
                const qty = Math.max(1, Number(it.qty) || 1);
                const price = Number(prod.CURRENTPRICE || prod.PRICE || 0);
                // Usar getProductImageUrl para resolver cualquier formato de imagen (Appwrite, Firebase, etc.)
                let prodImg = "";
                try {
                  const { getProductImageUrl } = await import("@/lib/product-images");
                  prodImg = getProductImageUrl(prod) || prod.IMAGEURL || prod.IMAGEURL2 || prod.IMAGEURL3 || "";
                } catch {
                  prodImg = prod.IMAGEURL || prod.IMAGEURL2 || prod.IMAGEURL3 || prod.IMAGEURL4 || prod.IMAGEURL5 || "";
                }
                itemsData.push({
                  id: it.id,
                  sku: prod.SKU || "",
                  name: prod.NAME || "Producto",
                  qty,
                  price,
                  total: price * qty,
                  img: prodImg,
                });
              } catch {
                notFoundItems.push(it.id);
              }
            }

            if (itemsData.length === 0) {
              aiReply += `\n⚠️ (Info interna: No pude encontrar ninguno de los productos por ID para crear el pedido).`;
            } else {
              const now = Date.now();
              const { orderIndex, orderCode } = await reserveOrderCode('BAL', 8);
              const docId = `bal_${now}_${Math.random().toString(36).slice(2, 10)}`;
              const total = itemsData.reduce((sum, i) => sum + i.total, 0);
              const orderStockRisk = calculateOrderStockRisk(itemsData.map(item => ({
                qty: item.qty,
                sku: item.sku,
                name: item.name,
                price: item.price,
              })));
              const configuredWindowMinutes = await getConfiguredOrderExpirationMinutes();
              const expiresAt = configuredWindowMinutes !== null
                ? calculatePaymentDeadline(now, configuredWindowMinutes)
                : orderStockRisk.level === 'verde'
                  ? now + 24 * 60 * 60 * 1000
                  : orderStockRisk.level === 'amarillo'
                    ? now + Math.round(orderStockRisk.deadlineHours * 60 * 60 * 1000)
                    : now + 20 * 60 * 1000;
              const expiresAtText = new Intl.DateTimeFormat("es-CL", {
                timeZone: "America/Santiago",
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(expiresAt));

              const stockMeta = { orderCode, customerName, orderIndex };
              const stockReserved = await deductStockForOrder(docId, itemsData, stockMeta);
              if (!stockReserved && !(await isUnlimitedStockEnabled())) {
                throw new Error('No se pudo reservar el stock de todos los productos del pedido.');
              }
              try {
                await serverCreateDocument(ORDERS_COLLECTION_ID, docId, {
                  USERID: "balatin-whatsapp-guest",
                  ITEMS: JSON.stringify(itemsData),
                  CUSTOMERNAME: customerName,
                  CUSTOMERPHONE: fromPhone,
                  CUSTOMERRUT: customerRut || "",
                  CUSTOMEREMAIL: "",
                  ORDERCODE: orderCode,
                  ORDERINDEX: orderIndex,
                  SUBTOTAL: total,
                  TOTAL: total,
                  STATUS: "paid",
                  EXPIRESAT: expiresAt,
                  EXPIRESATBACKEND: expiresAt + PAYMENT_PROOF_GRACE_MS,
                  EXPIRATIONWINDOWMINUTES: configuredWindowMinutes ?? Math.max(1, Math.round((expiresAt - now) / 60000)),
                  STATUSDEADLINE: expiresAt,
                  STOCKDEDUCTED: true,
                  CREATEDAT: now,
                  PAYMENTMETHOD: "WhatsApp Yaxbot",
                  ORDER_SOURCE: "whatsapp",
                  SHIPPINGAGENCY: shippingAgency || "",
                  REGION: region || "",
                  COMUNA: comuna || "",
                  ADDRESS: address || "",
                  LINKED_WHATSAPP: [fromPhone],
                });
                // deductStockForOrder invalida antes de que exista el documento.
                // Invalida otra vez tras guardar para no dejar una caché vacía
                // construida durante esa pequeña ventana.
                invalidatePosWebReservations();
              } catch (createErr) {
                try { await restoreStockForOrder(docId, itemsData, stockMeta); } catch (restoreErr) {
                  console.error("[WhatsApp Webhook] Could not restore stock after order creation failed:", restoreErr);
                }
                throw createErr;
              }

              aiReply += `\n\n✅ ¡Listo! Registré tu pedido *#${orderCode}* por $${total.toLocaleString("es-CL")}. El stock quedó confirmado y reservado hasta el *${expiresAtText}*; ya puedes transferir y enviarme el comprobante por aquí. 🐾`;
              if (notFoundItems.length > 0) {
                aiReply += `\n(Nota: no pude agregar algunos productos, dime cuáles faltan y los reviso).`;
              }
            }
          }
        } catch (err) {
          console.error(
            "[WhatsApp Webhook] CREATE_ORDER parsing/execution error:",
            err,
          );
          const reason = String((err as any)?.message || err || '');
          aiReply += /stock|reserva|disponible/i.test(reason)
            ? `\n⚠️ No alcancé a reservar todos los productos de tu pedido. Dime si quieres ajustar las cantidades o elegir un reemplazo y lo revisamos juntos.`
            : `\n❌ Hubo un error al registrar tu pedido. Por favor inténtalo de nuevo o dime si necesitas ayuda.`;
        }
      }
    }

    // ── Action Parsing & Execution (UPDATE_SHIPPING) ─────────────────────────
    // Yaxbot usa esto para completar dirección/comuna/región/agencia/RUT mientras el pago está pendiente.
    if (!isAdmin) {
      const updateShippingRegex =
        /\[ACTION:UPDATE_SHIPPING\]([\s\S]*?)\[\/ACTION\]/;
      const updateShippingMatch = rawText.match(updateShippingRegex);
      let shippingWasSaved = false;

      if (updateShippingMatch) {
        try {
          const shipData = JSON.parse(updateShippingMatch[1]);
          const {
            address,
            comuna,
            region,
            shippingAgency,
            customerRut,
            customerEmail,
            customerName: shipCustomerName,
            observations,
          } = shipData as {
            address?: string;
            comuna?: string;
            region?: string;
            shippingAgency?: string;
            customerRut?: string;
            customerEmail?: string;
            customerName?: string;
            observations?: string;
          };

          // Use balatinOrderId directly if in Yaxbot flow, otherwise search by phone
          let targetOrder: any = null;
          const balatinOId =
            (usage as any)._balatinOrderId || usage.balatinOrderId;
          if (balatinOId) {
            try {
              const { serverGetDocument } =
                await import("@/lib/firebase-server-compat");
              targetOrder = await serverGetDocument(
                ORDERS_COLLECTION_ID,
                balatinOId,
              );
            } catch (e) {
              console.warn(
                "[UPDATE_SHIPPING] Could not fetch order by balatinOrderId, falling back to phone search:",
                e,
              );
            }
          }
          if (!targetOrder) {
            const cleanedPhone = fromPhone.replace(/\D/g, "");
            const qOrderDesc = JSON.stringify({
              method: "orderDesc",
              attribute: "$createdAt",
            });
            const qPhone = JSON.stringify({
              method: "contains",
              attribute: "CUSTOMERPHONE",
              values: [cleanedPhone],
            });
            const qLimit5 = JSON.stringify({ method: "limit", values: [5] });
            const resOrders = await serverListDocuments(ORDERS_COLLECTION_ID, [
              qOrderDesc,
              qPhone,
              qLimit5,
            ]);
            const myOrders = resOrders.documents || [];
            targetOrder = myOrders.find((o: any) =>
              ["pending", "pending_stock", "processing", "paid", "payment_expired", "payment_review"].includes(o.STATUS),
            );
          }

          if (!targetOrder) {
            aiReply += `\n⚠️ (Info interna: No encontré un pedido activo de este cliente para actualizar sus datos de envío).`;
          } else {
            const updates: Record<string, any> = {};
            if (address) updates.ADDRESS = address;
            if (comuna) updates.COMUNA = comuna;
            if (region) updates.REGION = region;
            if (shippingAgency) updates.SHIPPINGAGENCY = shippingAgency;
            if (customerRut) updates.CUSTOMERRUT = customerRut;
            if (customerEmail) updates.CUSTOMEREMAIL = customerEmail;
            if (shipCustomerName) {
              updates.CUSTOMERNAME = shipCustomerName;
              // Also save to usage for future orders
              await recordKeniaUsage(fromPhone, {
                customerName: shipCustomerName,
                isRegistered: true,
              });
            }
            if (observations) updates.OBSERVATIONS = observations;
            if (Object.keys(updates).length > 0) {
              await serverUpdateDocument(
                ORDERS_COLLECTION_ID,
                targetOrder.$id,
                updates,
              );
              shippingWasSaved = true;
            }
          }
        } catch (err) {
          console.error(
            "[WhatsApp Webhook] UPDATE_SHIPPING parsing/execution error:",
            err,
          );
        }
      }

      // ── FALLBACK: If AI showed a summary but didn't include the UPDATE_SHIPPING tag,
      //    parse the summary from aiReply and save the data anyway ──
      if (!shippingWasSaved && (usage as any)._balatinDataMode === true) {
        try {
          const balatinOId =
            (usage as any)._balatinOrderId || usage.balatinOrderId;
          if (balatinOId) {
            // Parse RUT from the AI reply
            const rutMatch = aiReply.match(/RUT[:\s]*\*?([\d.]+-[\dkK])\*?/i);
            // Parse address
            const addrMatch = aiReply.match(
              /Direcci[oó]n[:\s]*\*?([^*\n•]+)\*?/i,
            );
            // Parse comuna
            const comunaMatch = aiReply.match(/Comuna[:\s]*\*?([^*\n•]+)\*?/i);
            // Parse region
            const regionMatch = aiReply.match(
              /Regi[oó]n[:\s]*\*?([^*\n•]+)\*?/i,
            );
            // Parse agency
            const agencyMatch = aiReply.match(
              /Agencia(?:\s+de\s+env[ií]o)?[:\s]*\*?([^*\n•]+)\*?/i,
            );

            const updates: Record<string, any> = {};
            if (rutMatch) updates.CUSTOMERRUT = rutMatch[1].trim();
            if (addrMatch) updates.ADDRESS = addrMatch[1].trim();
            if (comunaMatch) updates.COMUNA = comunaMatch[1].trim();
            if (regionMatch) updates.REGION = regionMatch[1].trim();
            if (agencyMatch) updates.SHIPPINGAGENCY = agencyMatch[1].trim();

            if (Object.keys(updates).length > 0) {
              await serverUpdateDocument(
                ORDERS_COLLECTION_ID,
                balatinOId,
                updates,
              );
              console.log(
                "[UPDATE_SHIPPING Fallback] Saved from AI summary:",
                updates,
              );
            }
          }
        } catch (e) {
          console.warn(
            "[UPDATE_SHIPPING Fallback] Could not parse AI summary:",
            e,
          );
        }
      }
    }

    const lastAssistantReply = [...history]
      .reverse()
      .find((message) => message.role === "assistant")?.content || "";
    const normalizeReply = (value: string) =>
      value.toLowerCase().replace(/[\s\W]+/g, " ").trim();
    const repeatedReplyDetected =
      !isAdmin &&
      Boolean(lastAssistantReply) &&
      normalizeReply(lastAssistantReply) === normalizeReply(aiReply);
    if (repeatedReplyDetected) {
      aiReply =
        "Recibí tu mensaje. Voy a pedirle ayuda al equipo para revisar tu caso y no te haré seguir repitiendo la información.";
    }

    // Save assistant reply to history
    await addToHistory(fromPhone, "assistant", aiReply, msgId);

    if (!isAdmin) {
      const promptTokens =
        Number(usageMetadata?.promptTokenCount || 0) ||
        estimateTokensFromText(
          systemPrompt,
          ...history.map((m) => m.content),
          userText,
        );
      const responseTokens =
        Number(usageMetadata?.candidatesTokenCount || 0) ||
        estimateTokensFromText(aiReply);
      const totalTokens =
        Number(usageMetadata?.totalTokenCount || 0) ||
        promptTokens + responseTokens;
      await recordKeniaUsage(fromPhone, {
        promptTokens,
        responseTokens,
        totalTokens,
      });
    }

    // ── Send reply to WhatsApp ─────────────────────────────────────────────────
    await sendWhatsAppMessage(fromPhone, aiReply, WA_TOKEN);

    // ── Report to main admin if from customer ────────────────────────────────
    if (!isAdmin) {
      const MAIN_ADMIN_PHONE = (
        keniaConfig.adminAlertPhone || ADMIN_PHONES[0] || ""
      ).replace(/\D/g, "");
      const askAdminRegex = /\[ACTION:ASK_ADMIN\]([\s\S]*?)\[\/ACTION\]/;
      const askAdminMatch = rawText.match(askAdminRegex);
      const escalateRegex = /\[ACTION:ESCALATE_ADMIN\]([\s\S]*?)\[\/ACTION\]/;

      if (askAdminMatch || repeatedReplyDetected) {
        const questionSummary = repeatedReplyDetected
          ? `La respuesta del bot se estaba repitiendo. Último mensaje del cliente: "${userText.slice(0, 240)}"`
          : askAdminMatch?.[1]?.trim() || "Tiene una duda que no puedo responder";
        const customerNameDisp = customerName
          ? `${customerName} (+${fromPhone})`
          : `+${fromPhone}`;
        const conversationLink = `${SITE_URL}/admin/ia/whatsapp?phone=${encodeURIComponent(fromPhone)}`;
        const alertMsg = `🚨 *BALATIN NECESITA AYUDA*\n\nEl cliente ${customerNameDisp} me preguntó esto y no sé qué decirle:\n"${questionSummary}"\n\n¿Qué le digo? (Respóndeme "dile que..." y yo le paso el mensaje tal cual )\n\n🔗 *Abrir conversación:* ${conversationLink}\n💬 *Hablar por WhatsApp:* https://wa.me/${fromPhone}`;
        await setKeniaBlocked(fromPhone, true, "admin_takeover");
        await recordKeniaUsage(fromPhone, { escalated: true });
        await sendWhatsAppMessage(MAIN_ADMIN_PHONE, alertMsg, WA_TOKEN);
      } else if (escalateRegex.test(rawText)) {
        // Fallback for old prompt structure
        await setKeniaBlocked(fromPhone, true, "admin_takeover");
        await recordKeniaUsage(fromPhone, { escalated: true });

        const lastMsgs = (await getHistory(fromPhone))
          .slice(-4)
          .map(
            (m) =>
              `${m.role === "user" ? "👤" : "🤖"} ${m.content.slice(0, 120)}`,
          )
          .join("\n");
        const alertMsg = `🚨 *BALATIN NECESITA AYUDA*\n\nEl cliente +${fromPhone} tiene un caso que no puedo resolver.\n\n📋 *Últimos mensajes:*\n${lastMsgs}\n\n💬 *Mi última respuesta:*\n"${aiReply.slice(0, 200)}"\n\n⚡ Yaxbot se desactivó para este cliente. Responde desde el panel:\n ${SITE_URL}/admin/ia/whatsapp`;
        await sendWhatsAppMessage(MAIN_ADMIN_PHONE, alertMsg, WA_TOKEN);
      } else if (keniaConfig.smartNotifications) {
        // Smart notifications: only notify on key events, not every message
        // usage (line 655) + 1 for current message (recordKeniaUsage at 1529 already incremented)
        const msgCount = (usage.messageCount || 0) + 1;
        const threshold = keniaConfig.messageThresholdForPause || 25;

        if (msgCount === 1) {
          // New conversation started
          const notifyMsg = `🆕 *Nueva conversación iniciada*\nCliente: +${fromPhone}\nMensaje: "${userText.slice(0, 150)}"\n\n🤖 Yaxbot está atendiendo. Te avisaré si necesito ayuda.\n ${SITE_URL}/admin/ia/whatsapp`;
          await sendWhatsAppMessage(MAIN_ADMIN_PHONE, notifyMsg, WA_TOKEN);
        } else if (
          msgCount >= threshold &&
          !usage.adminTakeover &&
          !usage.balatinOrderFlow
        ) {
          // Threshold reached — pause Yaxbot and ask admin what to do
          // (skip if user is in Yaxbot order flow — they're paying, don't interrupt)
          await setKeniaBlocked(fromPhone, true, "admin_takeover");
          const pauseMsg = `⏸️ *Conversación larga detectada*\n\nCliente: +${fromPhone}\nMensajes intercambiados: ${msgCount}\n\nHe estado conversando con esta persona por un tiempo. ¿Qué quieres que haga?\n\n *Devolver a Yaxbot* → responde "continuar"\n🚫 *Bloquear* → responde "bloquear"\n *Tomar control* → responde "tomar"\n\n ${SITE_URL}/admin/ia/whatsapp`;
          await sendWhatsAppMessage(MAIN_ADMIN_PHONE, pauseMsg, WA_TOKEN);
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("[WhatsApp webhook] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
