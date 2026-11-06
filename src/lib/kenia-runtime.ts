import 'server-only';


import { serverGetDocument, serverUpdateDocument, serverCreateDocument } from './db-server';
import { OWNER_WHATSAPP_PHONE } from '@/lib/store-contact';

export const DEFAULT_ADMIN_PROMPT = `Eres Importadora Carlitos IA, el copiloto administrativo y asistente virtual del negocio Importadora Carlitos por WhatsApp.
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
- "paid" (Stock Confirmado — stock reservado automáticamente; falta que el cliente pague)
- "payment_review" (Revisando Pago)
- "payment_confirmed" (Pago Confirmado — el pago del cliente fue verificado)
- "negotiation" (En negociación)
- "shipped" (Embalado)
- "delivered" (Entregado a Agencia)
- "cancelled" (Cancelado)

IMPORTANTE para no confundir estados:
- "confirmar stock" / "stock confirmado" → usa "paid". El flujo ya no tiene un paso separado de "Pedido Recibido".
- Los estados antiguos "pending", "pending_stock" y "processing" se interpretan como Stock Confirmado al leer pedidos; no los escribas en pedidos nuevos.
- "marcar como pagado" / "pago confirmado" / "pago verificado" → usa "payment_confirmed".

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
  4. El estado del pedido TRADUCIDO AL ESPAÑOL.
- NUNCA uses nombres de estados en inglés en tus textos ni listas.
- Máx 3-4 pedidos por mensaje para no saturar.

## Capacidad de Responder a Clientes (Escalamiento):
Si te consulto sobre qué responderle a un cliente (ej. "Jan, el cliente Juan preguntó X, ¿qué le respondo?") y yo te respondo "Dile que Y", debes generar una respuesta amable para ese cliente y usar el siguiente bloque exacto al final de tu respuesta:
[ACTION:REPLY_CUSTOMER]{"phone":"NUMERO_DEL_CLIENTE", "message":"MENSAJE_REDACTADO_PARA_EL_CLIENTE"}[/ACTION]
(Usa el contexto para saber de qué cliente y número estamos hablando).

## IMPORTANTE:
- Siempre responde de manera cordial, profesional y neutra.
- Si no puedes ejecutar algo, explica qué puede hacerse desde el panel admin web.
- No inventes datos. Solo muestra datos reales de la base de datos.

Los datos de productos y pedidos te serán inyectados en el contexto.`;

export const DEFAULT_CUSTOMER_PROMPT = `Eres Importadora Carlitos, el dueño de Importadora Carlitos en Chile.
Eres un comerciante directo, respetuoso, trabajador, muy atento y resolutivo. Hablas en español chileno natural, educado y cercano como el dueño que atiende y cuida a sus clientes y a su negocio.
¡NUNCA digas que eres un bot, inteligencia artificial o asistente virtual! Atiendes personalmente con la voz y presencia de Importadora Carlitos.

## Saludo personalizado:
- Si en el contexto ves "DATOS DEL CLIENTE" con un nombre, salúdalo con respeto y calidez por su nombre.
- En el primer saludo preséntate como Iván de Importadora Carlitos o Importadora Carlitos.
- Ejemplo correcto: "¡Hola María! Te saluda Iván de Importadora Carlitos. ¿En qué te puedo ayudar hoy?"

## TU FORMA DE HABLAR (VITAL):
- Hombre comerciante, directo, ágil, educado y cercano. Cero rodeos.
- Hablas como dueño de tienda chilena: "¡Hola! Con mucho gusto te ayudo", "Reviso de inmediato en tienda", "Déjame chequear el stock", "Cuenta con eso".
- Frases cortas, claras y al grano.
- Eres súper resolutivo. Si hay un problema o una duda, la resuelves rápido y con soluciones concretas.
- Cero expresiones felinas ni personajes ficticios.
- NO uses markdown para negritas ni cursivas (* o _).
- Máx 3-4 productos/pedidos por mensaje para que sea cómodo de leer en WhatsApp.
- Tu misión: que el cliente reciba la atención directa del dueño, confirme sus pedidos con confianza y compre tranquilo.

## Puedes ayudar con:
- Información de productos (precios por unidad, embalaje, disponibilidad real, descripción)
- Buscar productos por categoría o nombre
- Estado de pedidos y seguimiento de envíos
- Información de la tienda (horarios, envíos, métodos de pago)

## Información de la tienda:
- Tienda: Importadora Carlitos — artículos de hogar, aseo y variedad (parlantes, juguetes, utilidades para la casa, productos varios, etc.)
- NO somos una tienda de belleza ni cosméticos. NUNCA recomiendes maquillaje ni productos de belleza.
- Sitio web: {{SITE_URL}}
- País: Chile
- Horario de atención: Lunes a Viernes de 10am a 7pm. Sábados de 10am a 5pm. Domingos cerrado.
- Envíos y preparación: Los pedidos tomados por la página web toman de 1 a 2 días hábiles en prepararse y salir de la tienda hacia la agencia de despacho.

## 🛍️ MANEJO DE CATÁLOGO Y PRODUCTOS
- No inyectaremos todo el catálogo. Si te preguntan por un producto genérico, recomiéndales la categoría enviando el enlace de la web: {{SITE_URL}}/productos?categoria=NOMBRE_CATEGORIA.
- Si en la conversación ves un código exacto (Ej: L205, K201) o lo detectas en una imagen, tú solo debes escribir esta etiqueta oculta y nada más: [ACTION:SEARCH_SKU]CÓDIGO[/ACTION] (El sistema buscará el link exacto por ti).

## 📦 MANEJO DE PEDIDOS Y RASTREO
Si el cliente pregunta por su pedido, mira su lista de "MIS PEDIDOS ACTIVOS":
- Si tiene varios pedidos, pregúntale cuál quiere revisar.
- **Si el pedido fue enviado por BLUEXPRESS**: Dile que se fue por Bluexpress y dale su link de rastreo exacto: https://www.blue.cl/enviar/seguimiento?n_seguimiento=[TRACKINGNUMBER]
- **Si fue enviado por OTRA agencia (Starken, Varmontt, etc.)**: Envíale la foto de su comprobante: "Aquí tienes la fotito de tu comprobante de envío: [SHIPPINGPROOFURL]". Si también hay número de tracking, dáselo.
- **ALERTA CRÍTICA**: Si el pedido está en estado avanzado (Enviado, Listo para enviar) pero NO tiene tracking (si es Bluexpress) o NO tiene foto de comprobante (si es otra), dile con amabilidad: "Déjame confirmarlo un segundito con el equipo de despacho para darte el dato exacto". Y **DEBES** incluir al final: [ACTION:ASK_ADMIN]Falta información de despacho para el pedido #ORD-XXXX[/ACTION].
- Si el pedido está "En preparación" o "Pagado" y no tiene número aún, explícale de forma amable que el equipo de tienda lo está armando con mucho cuidado.

## ⛔ REGLAS ABSOLUTAS (PROHIBIDO ROMPER):
1. NUNCA inventes nombres de productos ni des información que no sabes. No alucines ni fantasees.
2. NUNCA inventes URLs. Solo usa {{SITE_URL}} y las rutas reales del sitio.
3. NUNCA inventes precios, stock, políticas de envío ni métodos de pago que no estén en tu contexto.
4. Si NO tienes la información que te piden, no inventes. Dile EXACTAMENTE: "Dame un segundito, voy a confirmarlo con el equipo de tienda y te respondo de inmediato". Y añade al final este bloque oculto:
[ACTION:ASK_ADMIN]Resumen de la duda[/ACTION]
5. NUNCA des vueltas ni lo hagas esperar en vano. Si no sabes, pregunta con la acción anterior.
6. RESPUESTAS CORTAS. No escribas párrafos largos. Sé súper directo y al grano.
7. Despídete siempre con amabilidad y disposición para seguir ayudando.

Los datos de productos, categorías y pedidos del cliente te serán inyectados como contexto.`;

export interface KeniaConfig {
  adminPrompt: string;
  customerPrompt: string;
  adminAlertPhone: string;
  tokenLimitPerCustomer: number;
  smartNotifications: boolean;
  messageThresholdForPause: number;
  updatedAt: string;
  isEnabled: boolean;
  debugMode?: boolean;
  blockedPhones: string[];
}

export interface KeniaUsageEntry {
  phone: string;
  totalTokens: number;
  promptTokens: number;
  responseTokens: number;
  messageCount: number;
  blocked: boolean;
  updatedAt: string;
  maintenanceNotified?: boolean;
  maintenanceNotifiedTs?: number;
  hasNoPendingOrders?: boolean;
  testAsClient?: boolean;
  adminTakeover?: boolean;
  escalated?: boolean;
  spamBlocked?: boolean;
  lastMessageTimestamps?: number[];
  welcomeShown?: boolean;
  registerPromptedAt?: number;
  imagesSentToday?: number;
  lastImageSentAt?: number;
  awaitingComprobante?: boolean;
  pendingOrderId?: string;
  isRegistered?: boolean;
  customerName?: string;
  isGuestWithOrders?: boolean;
  lastStallReplyTs?: number;
  awaitingAltPhone?: boolean;
  // Yaxbot catalog flow
  balatinOrderFlow?: boolean;
  balatinStep?: string;
  balatinOrderId?: string;
  balatinOrderCode?: string;
  balatinComprobanteReceived?: boolean;
  balatinDataBuffer?: string;
}

interface KeniaFirebaseConfigData extends KeniaConfig {
  blockedPhones: string[];
}

const THEME_CONFIG_COLLECTION_ID = 'theme_config';
const DOCUMENT_ID = 'kenia_config';

// ── Appwrite-based usage storage (persistent on Vercel) ──
const USAGE_COLLECTION_ID = 'theme_config';
const USAGE_DOC_PREFIX = 'kenia_usage_';

// In-memory cache per serverless invocation (TTL 30s)
const _usageCache = new Map<string, { data: KeniaUsageEntry | null; ts: number }>();
const USAGE_CACHE_TTL = 30000;

async function readUsageFromAppwrite(phone: string): Promise<KeniaUsageEntry | null> {
  const cleaned = normalizePhone(phone);
  const now = Date.now();
  const cached = _usageCache.get(cleaned);
  if (cached && (now - cached.ts < USAGE_CACHE_TTL)) {
    return cached.data;
  }
  try {
    const docId = USAGE_DOC_PREFIX + cleaned;
    const doc = await serverGetDocument(USAGE_COLLECTION_ID, docId);
    if (doc && doc.config) {
      const parsed = JSON.parse(doc.config as string);
      _usageCache.set(cleaned, { data: parsed, ts: now });
      return parsed;
    }
  } catch (e: any) {
    // Document doesn't exist yet - that's OK
    if (!String(e?.message || e).includes('not found') && e?.code !== 404) {
      console.warn('[KeniaUsage] Appwrite read error for', cleaned, ':', e?.message || e);
    }
  }
  _usageCache.set(cleaned, { data: null, ts: now });
  return null;
}

async function writeUsageToAppwrite(phone: string, entry: KeniaUsageEntry): Promise<void> {
  const cleaned = normalizePhone(phone);
  try {
    const docId = USAGE_DOC_PREFIX + cleaned;
    const payload = { NAME: 'kenia_usage', config: JSON.stringify(entry) };
    try {
      await serverGetDocument(USAGE_COLLECTION_ID, docId);
      await serverUpdateDocument(USAGE_COLLECTION_ID, docId, payload);
    } catch {
      await serverCreateDocument(USAGE_COLLECTION_ID, docId, payload);
    }
    _usageCache.set(cleaned, { data: entry, ts: Date.now() });
  } catch (e) {
    console.warn('[KeniaUsage] Appwrite write error for', cleaned, ':', e);
  }
}

function getDefaultConfig(): KeniaConfig {
  return {
    adminPrompt: DEFAULT_ADMIN_PROMPT,
    customerPrompt: DEFAULT_CUSTOMER_PROMPT,
    adminAlertPhone: OWNER_WHATSAPP_PHONE,
    tokenLimitPerCustomer: 15000,
    smartNotifications: true,
    messageThresholdForPause: 10,
    updatedAt: new Date().toISOString(),
    isEnabled: true,
    debugMode: false,
    blockedPhones: [],
  };
}

let _configCache: { data: KeniaFirebaseConfigData; ts: number } | null = null;
const CONFIG_CACHE_TTL = 60000; // 60 seconds

async function fetchConfigFromAppwrite(): Promise<KeniaFirebaseConfigData> {
  const now = Date.now();
  if (_configCache && (now - _configCache.ts < CONFIG_CACHE_TTL)) {
    return _configCache.data;
  }
  try {
    const doc = await serverGetDocument(THEME_CONFIG_COLLECTION_ID, DOCUMENT_ID);
    if (doc && doc.config) {
      const parsed = JSON.parse(doc.config as string);
      const data: KeniaFirebaseConfigData = {
        adminPrompt: parsed.adminPrompt || DEFAULT_ADMIN_PROMPT,
        customerPrompt: parsed.customerPrompt || DEFAULT_CUSTOMER_PROMPT,
        adminAlertPhone: OWNER_WHATSAPP_PHONE,
        tokenLimitPerCustomer: parsed.tokenLimitPerCustomer || 15000,
        smartNotifications: parsed.smartNotifications !== false,
        messageThresholdForPause: parsed.messageThresholdForPause || 10,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        isEnabled: true, // TEMP: force enabled for testing
        debugMode: parsed.debugMode === true,
        blockedPhones: Array.isArray(parsed.blockedPhones) ? parsed.blockedPhones : [],
      };
      _configCache = { data, ts: now };
      return data;
    }
  } catch (e: any) {
    if (String(e?.message || e).includes('not found') || e?.code === 404) {
      try {
        const defaultConfig = getDefaultConfig();
        const data: KeniaFirebaseConfigData = {
          ...defaultConfig,
          blockedPhones: [],
        };
        await serverCreateDocument(THEME_CONFIG_COLLECTION_ID, DOCUMENT_ID, {
          NAME: 'kenia_config',
          config: JSON.stringify(data),
        });
        _configCache = { data, ts: now };
        return data;
      } catch (err) {
        console.error('[KeniaConfig] Failed to auto-create config document in Appwrite:', err);
      }
    } else {
      console.error('[KeniaConfig] Failed to fetch config from Appwrite:', e);
    }
  }
  const fallback = { ...getDefaultConfig(), blockedPhones: [] };
  _configCache = { data: fallback, ts: now };
  return fallback;
}

async function saveConfigToAppwrite(config: KeniaFirebaseConfigData) {
  const payload = { NAME: 'kenia_config', config: JSON.stringify(config) };
  try {
    await serverUpdateDocument(THEME_CONFIG_COLLECTION_ID, DOCUMENT_ID, { config: payload.config });
    _configCache = { data: config, ts: Date.now() };
    return;
  } catch (updateError) {
    try {
      await serverCreateDocument(THEME_CONFIG_COLLECTION_ID, DOCUMENT_ID, payload);
      _configCache = { data: config, ts: Date.now() };
      return;
    } catch (createError) {
      console.error('[KeniaConfig] Failed to upsert config in Appwrite:', createError || updateError);
    }
  }
}

export function normalizePhone(value: string) {
  return String(value || '').replace(/\D/g, '').trim();
}

export function hydratePrompt(template: string, siteUrl: string) {
  return String(template || '').replace(/\{\{SITE_URL\}\}/g, siteUrl);
}

export function estimateTokensFromText(...parts: Array<string | undefined | null>) {
  const chars = parts.filter(Boolean).join(' ').length;
  return Math.max(1, Math.ceil(chars / 4));
}

export async function getKeniaConfig(): Promise<KeniaConfig> {
  const dbConfig = await fetchConfigFromAppwrite();
  return {
    adminPrompt: dbConfig.adminPrompt,
    customerPrompt: dbConfig.customerPrompt,
    adminAlertPhone: dbConfig.adminAlertPhone,
    tokenLimitPerCustomer: dbConfig.tokenLimitPerCustomer,
    smartNotifications: dbConfig.smartNotifications,
    messageThresholdForPause: dbConfig.messageThresholdForPause,
    updatedAt: dbConfig.updatedAt,
    isEnabled: dbConfig.isEnabled,
    debugMode: dbConfig.debugMode,
    blockedPhones: dbConfig.blockedPhones,
  };
}

export async function saveKeniaConfig(partial: Partial<KeniaConfig>): Promise<KeniaConfig> {
  const dbConfig = await fetchConfigFromAppwrite();
  const nextConfig: KeniaFirebaseConfigData = {
    ...dbConfig,
    adminPrompt: partial.adminPrompt ?? dbConfig.adminPrompt,
    customerPrompt: partial.customerPrompt ?? dbConfig.customerPrompt,
    adminAlertPhone: OWNER_WHATSAPP_PHONE,
    tokenLimitPerCustomer: Math.max(1000, Number(partial.tokenLimitPerCustomer ?? dbConfig.tokenLimitPerCustomer) || dbConfig.tokenLimitPerCustomer),
    smartNotifications: partial.smartNotifications ?? dbConfig.smartNotifications,
    messageThresholdForPause: Math.max(1, Number(partial.messageThresholdForPause ?? dbConfig.messageThresholdForPause) || dbConfig.messageThresholdForPause),
    isEnabled: partial.isEnabled ?? dbConfig.isEnabled,
    debugMode: partial.debugMode ?? dbConfig.debugMode ?? false,
    updatedAt: new Date().toISOString(),
  };
  await saveConfigToAppwrite(nextConfig);
  return {
    adminPrompt: nextConfig.adminPrompt,
    customerPrompt: nextConfig.customerPrompt,
    adminAlertPhone: nextConfig.adminAlertPhone,
    tokenLimitPerCustomer: nextConfig.tokenLimitPerCustomer,
    smartNotifications: nextConfig.smartNotifications,
    messageThresholdForPause: nextConfig.messageThresholdForPause,
    isEnabled: nextConfig.isEnabled,
    debugMode: nextConfig.debugMode,
    updatedAt: nextConfig.updatedAt,
    blockedPhones: nextConfig.blockedPhones,
  };
}

export async function getKeniaUsage(phone: string, blockedPhonesOverride?: string[]): Promise<KeniaUsageEntry> {
  const cleaned = normalizePhone(phone);
  // Read from Appwrite (persistent) with in-memory cache
  const entry = await readUsageFromAppwrite(cleaned);
  let isBlocked: boolean;
  if (blockedPhonesOverride) {
    isBlocked = blockedPhonesOverride.includes(cleaned);
  } else {
    const dbConfig = await fetchConfigFromAppwrite();
    // El estado por teléfono también queda guardado en kenia_usage_*; sirve como
    // fallback si el documento global kenia_config aún no pudo crearse.
    isBlocked = dbConfig.blockedPhones.includes(cleaned) || entry?.blocked === true;
  }
  return {
    phone: cleaned,
    totalTokens: entry?.totalTokens || 0,
    promptTokens: entry?.promptTokens || 0,
    responseTokens: entry?.responseTokens || 0,
    messageCount: entry?.messageCount || 0,
    blocked: isBlocked,
    updatedAt: entry?.updatedAt || '',
    maintenanceNotified: entry?.maintenanceNotified || false,
    testAsClient: entry?.testAsClient || false,
    adminTakeover: entry?.adminTakeover || false,
    escalated: entry?.escalated || false,
    spamBlocked: entry?.spamBlocked || false,
    lastMessageTimestamps: entry?.lastMessageTimestamps || [],
    welcomeShown: entry?.welcomeShown || false,
    registerPromptedAt: entry?.registerPromptedAt || 0,
    isRegistered: entry?.isRegistered,
    customerName: entry?.customerName,
    isGuestWithOrders: entry?.isGuestWithOrders,
    awaitingComprobante: entry?.awaitingComprobante,
    pendingOrderId: entry?.pendingOrderId,
    imagesSentToday: entry?.imagesSentToday || 0,
    lastImageSentAt: entry?.lastImageSentAt || 0,
    hasNoPendingOrders: entry?.hasNoPendingOrders,
    balatinOrderFlow: entry?.balatinOrderFlow,
    balatinStep: entry?.balatinStep,
    balatinOrderId: entry?.balatinOrderId,
    balatinOrderCode: entry?.balatinOrderCode,
    balatinComprobanteReceived: entry?.balatinComprobanteReceived,
    balatinDataBuffer: entry?.balatinDataBuffer,
  };
}

export async function setKeniaBlocked(
  phone: string,
  blocked: boolean,
  reason?: 'admin_takeover' | 'spam' | 'manual'
): Promise<KeniaUsageEntry> {
  const cleaned = normalizePhone(phone);
  const dbConfig = await fetchConfigFromAppwrite();
  let blockedPhones = dbConfig.blockedPhones;
  if (blocked) {
    if (!blockedPhones.includes(cleaned)) {
      blockedPhones.push(cleaned);
    }
  } else {
    blockedPhones = blockedPhones.filter(p => p !== cleaned);
  }
  dbConfig.blockedPhones = blockedPhones;
  await saveConfigToAppwrite(dbConfig);
  
  const prevEntry = await readUsageFromAppwrite(cleaned);
  const prev: KeniaUsageEntry = prevEntry || {
    phone: cleaned,
    totalTokens: 0,
    promptTokens: 0,
    responseTokens: 0,
    messageCount: 0,
    blocked: false,
    updatedAt: '',
  };
  const newEntry: KeniaUsageEntry = {
    ...prev,
    phone: cleaned,
    blocked,
    adminTakeover: blocked && reason === 'admin_takeover' ? true : (!blocked ? false : prev.adminTakeover),
    spamBlocked: blocked && reason === 'spam' ? true : (!blocked ? false : prev.spamBlocked),
    escalated: !blocked ? false : prev.escalated,
    updatedAt: new Date().toISOString(),
  };
  await writeUsageToAppwrite(cleaned, newEntry);
  return newEntry;
}

export async function recordKeniaUsage(
  phone: string,
  usage: {
    promptTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
    maintenanceNotified?: boolean;
    maintenanceNotifiedTs?: number;
    testAsClient?: boolean;
    adminTakeover?: boolean;
    escalated?: boolean;
    spamBlocked?: boolean;
    lastMessageTimestamps?: number[];
    welcomeShown?: boolean;
    registerPromptedAt?: number;
    imageSent?: boolean;
    awaitingComprobante?: boolean;
    pendingOrderId?: string;
    isRegistered?: boolean;
    customerName?: string;
    isGuestWithOrders?: boolean;
    lastStallReplyTs?: number;
    awaitingAltPhone?: boolean;
    hasNoPendingOrders?: boolean;
    balatinOrderFlow?: boolean;
    balatinStep?: string;
    balatinOrderId?: string;
    balatinOrderCode?: string;
    balatinComprobanteReceived?: boolean;
    balatinDataBuffer?: string;
  }
): Promise<KeniaUsageEntry> {
  const cleaned = normalizePhone(phone);
  // Read previous entry from Appwrite (persistent)
  const prevEntry = await readUsageFromAppwrite(cleaned);
  const prev: KeniaUsageEntry = prevEntry || {
    phone: cleaned,
    totalTokens: 0,
    promptTokens: 0,
    responseTokens: 0,
    messageCount: 0,
    blocked: false,
    updatedAt: '',
  };
  const promptTokens = Math.max(0, Number(usage.promptTokens || 0));
  const responseTokens = Math.max(0, Number(usage.responseTokens || 0));
  const totalTokens = Math.max(
    promptTokens + responseTokens,
    Number(usage.totalTokens || 0),
    0
  );
  const newEntry: KeniaUsageEntry = {
    ...prev,
    phone: cleaned,
    blocked: prev.blocked ?? false,
    promptTokens: prev.promptTokens + promptTokens,
    responseTokens: prev.responseTokens + responseTokens,
    totalTokens: prev.totalTokens + totalTokens,
    messageCount: prev.messageCount + 1,
    maintenanceNotified: usage.maintenanceNotified ?? prev.maintenanceNotified ?? false,
    testAsClient: usage.testAsClient ?? prev.testAsClient ?? false,
    adminTakeover: usage.adminTakeover ?? prev.adminTakeover ?? false,
    escalated: usage.escalated ?? prev.escalated ?? false,
    spamBlocked: usage.spamBlocked ?? prev.spamBlocked ?? false,
    lastMessageTimestamps: usage.lastMessageTimestamps ?? prev.lastMessageTimestamps ?? [],
    welcomeShown: usage.welcomeShown ?? prev.welcomeShown ?? false,
    registerPromptedAt: usage.registerPromptedAt ?? prev.registerPromptedAt ?? 0,
    imagesSentToday: 0,
    lastImageSentAt: prev.lastImageSentAt || 0,
    awaitingComprobante: usage.awaitingComprobante ?? prev.awaitingComprobante ?? false,
    pendingOrderId: usage.pendingOrderId ?? prev.pendingOrderId,
    isRegistered: usage.isRegistered ?? prev.isRegistered,
    customerName: usage.customerName ?? prev.customerName,
    isGuestWithOrders: usage.isGuestWithOrders ?? prev.isGuestWithOrders,
    lastStallReplyTs: usage.lastStallReplyTs ?? prev.lastStallReplyTs ?? 0,
    awaitingAltPhone: usage.awaitingAltPhone ?? prev.awaitingAltPhone ?? false,
    balatinOrderFlow: usage.balatinOrderFlow ?? prev.balatinOrderFlow,
    balatinStep: usage.balatinStep ?? prev.balatinStep,
    balatinOrderId: usage.balatinOrderId ?? prev.balatinOrderId,
    balatinOrderCode: usage.balatinOrderCode ?? prev.balatinOrderCode,
    balatinComprobanteReceived: usage.balatinComprobanteReceived ?? prev.balatinComprobanteReceived,
    balatinDataBuffer: usage.balatinDataBuffer !== undefined ? usage.balatinDataBuffer : prev.balatinDataBuffer,
    updatedAt: new Date().toISOString(),
  };

  const now = Date.now();
  let currentImagesCount = prev.imagesSentToday || 0;
  if (prev.lastImageSentAt) {
    const lastDate = new Date(prev.lastImageSentAt).toDateString();
    const todayDate = new Date(now).toDateString();
    if (lastDate !== todayDate) {
      currentImagesCount = 0;
    }
  }

  if (usage.imageSent) {
    currentImagesCount += 1;
    newEntry.lastImageSentAt = now;
  }
  newEntry.imagesSentToday = currentImagesCount;

  // Write to Appwrite/Firestore (persistent)
  try {
    await writeUsageToAppwrite(cleaned, newEntry);
  } catch (e) {
    console.warn('[KeniaUsage] write error:', e);
  }
  return newEntry;
}

export async function resetKeniaUsage(phone: string): Promise<void> {
  const cleaned = normalizePhone(phone);
  // Clear from Appwrite by writing a fresh empty entry
  const emptyEntry: KeniaUsageEntry = {
    phone: cleaned,
    totalTokens: 0,
    promptTokens: 0,
    responseTokens: 0,
    messageCount: 0,
    blocked: false,
    updatedAt: new Date().toISOString(),
  };
  await writeUsageToAppwrite(cleaned, emptyEntry);
  _usageCache.delete(cleaned);
}

export async function getKeniaRuntimeSnapshot(): Promise<{ config: KeniaConfig; usage: Record<string, KeniaUsageEntry> }> {
  const dbConfig = await fetchConfigFromAppwrite();
  // Note: We can't list all usage docs from Appwrite easily without a query.
  // Return empty for now - the admin panel reads individual phones on demand.
  const hydratedUsage: Record<string, KeniaUsageEntry> = {};
  return {
    config: {
      adminPrompt: dbConfig.adminPrompt,
      customerPrompt: dbConfig.customerPrompt,
      adminAlertPhone: dbConfig.adminAlertPhone,
      tokenLimitPerCustomer: dbConfig.tokenLimitPerCustomer,
      smartNotifications: dbConfig.smartNotifications,
      messageThresholdForPause: dbConfig.messageThresholdForPause,
      updatedAt: dbConfig.updatedAt,
      isEnabled: dbConfig.isEnabled,
      blockedPhones: dbConfig.blockedPhones,
    },
    usage: hydratedUsage,
  };
}

export async function deleteKeniaPhone(phone: string): Promise<void> {
  const cleaned = normalizePhone(phone);
  const dbConfig = await fetchConfigFromAppwrite();
  dbConfig.blockedPhones = dbConfig.blockedPhones.filter(p => p !== cleaned);
  await saveConfigToAppwrite(dbConfig);
  // Reset usage in Appwrite
  await resetKeniaUsage(cleaned);
}
