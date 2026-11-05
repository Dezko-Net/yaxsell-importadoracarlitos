/**
 * Asistente de Inteligencia Artificial para la Base de Datos / ERP de Importadora Carlitos.
 * 
 * Conoce:
 *  1) Todos los costos netos, con IVA, precios de venta (P1..P4) y márgenes de ganancia.
 *  2) Todo el inventario: stock actual, embalajes, cajas, categorías y proveedores.
 *  3) Ventas históricas por fecha: cuándo y cuánto se vendió un día determinado.
 *  4) Auditoría de movimientos: QUIÉN movió el stock (nombre de usuario, ej. Daniel, cajera),
 *     cuándo, motivo/nota, stock anterior y stock resultante.
 */

import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION } from '@/lib/collections';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';
import { GEMINI_TEXT_MODELS } from '@/lib/gemini-models';

const MOVEMENTS_COLLECTION = 'stock_movements';
const PRODUCT_INDEX_TTL_MS = 20 * 60 * 1000; // 20 min caché en memoria
const MOVEMENTS_TTL_MS = 60 * 1000;          // 60 s caché de movimientos
const MAX_PRODUCTS = 6;
const MAX_RANGE_DAYS = 400;
const MAX_LISTED_MOVEMENTS = 50;

// ── Zona Horaria Oficial de Chile (Santiago) ──────────────────────────────
export function todaySantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

export function weekdayEs(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function dateFromTs(ts: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts));
}

function calendarTable(today: string, daysBack = 28): string {
  const rows: string[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const d = addDays(today, -i);
    rows.push(`${d} = ${weekdayEs(d)}${i === 0 ? ' (HOY)' : i === 1 ? ' (AYER)' : ''}`);
  }
  return rows.join('\n');
}

// ── Normalización de Texto ────────────────────────────────────────────────
export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'en', 'del', 'al', 'que', 'se', 'me', 'mi', 'por',
  'para', 'con', 'desde', 'hasta', 'cuantos', 'cuantas', 'cuanto', 'cuanta', 'vendio', 'vendi', 'vendimos', 'vendieron',
  'vendido', 'vendidos', 'venta', 'ventas', 'dia', 'dias', 'ayer', 'hoy', 'anteayer', 'semana', 'pasado', 'pasada', 'mes',
  'stock', 'hay', 'tengo', 'quedan', 'queda', 'movimiento', 'movimientos', 'producto', 'productos', 'unidades', 'unidad',
  'historial', 'ingreso', 'ingresos', 'dime', 'dame', 'necesito', 'saber', 'info', 'informacion', 'le', 'lo', 'es', 'fue',
  'fueron', 'ha', 'han', 'costo', 'costos', 'precio', 'precios', 'margen', 'quien', 'quién', 'nombre', 'cuestion', 'cuestión',
  'ver', 'dime', 'muestra', 'cuanto', 'vale', 'compramos', 'ganancia', 'caja', 'cajas', 'embalaje'
]);

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function queryTokens(text: string): string[] {
  return norm(text).split(' ').filter(t => t && !STOP_WORDS.has(t) && (t.length >= 2 || /^\d$/.test(t)));
}

// ── Índice Completo de Productos de Base de Datos (en memoria) ───────────
export interface DbProductItem {
  id: string;
  sku: string;
  nombre: string;
  nombreNorm: string;
  barcode: string;
  stock: number;
  costo_uni: number;
  costo_con_iva: number;
  precio_venta_1: number;
  precio_venta_2: number;
  precio_venta_3: number;
  precio_venta_4: number;
  margen_p1: number;
  margen_p2: number;
  cantidad_embalaje: string;
  categoria: string;
  subcategoria: string;
  proveedor: string;
  activo: boolean;
  ilimitado: boolean;
}

let dbProductIndex: DbProductItem[] | null = null;
let dbProductIndexAt = 0;
let dbProductIndexInflight: Promise<DbProductItem[]> | null = null;

export async function loadDbProductIndex(): Promise<DbProductItem[]> {
  if (dbProductIndex && Date.now() - dbProductIndexAt < PRODUCT_INDEX_TTL_MS) {
    return dbProductIndex;
  }
  if (dbProductIndexInflight) return dbProductIndexInflight;

  dbProductIndexInflight = (async () => {
    const snap = await getAdminDb().collection(PRODUCTS_COLLECTION).get();
    const items: DbProductItem[] = [];

    snap.forEach((doc: any) => {
      const p = doc.data() || {};
      const nombre = String(p.NAME ?? p.name ?? p.nombre ?? '').trim();
      if (!nombre) return;

      const rawStock = Number(p.STOCK ?? p.stock);
      const stock = Number.isFinite(rawStock) ? rawStock : 0;
      const costoRaw = Number(p.COST ?? p.costo_uni ?? p.costo ?? p.precio_costo_neto);
      const costo_uni = Number.isFinite(costoRaw) && costoRaw > 0 ? Math.round(costoRaw) : 0;
      const costo_con_iva = Math.round(costo_uni * 1.19);

      const p1Raw = Number(p.PRICE ?? p.precio_venta_1 ?? p.precio_detalle);
      const precio_venta_1 = Number.isFinite(p1Raw) && p1Raw > 0 ? Math.round(p1Raw) : 0;

      const p2Raw = Number(p.WHOLESALEPRICE ?? p.precio_venta_2 ?? p.precio_mayorista);
      const precio_venta_2 = Number.isFinite(p2Raw) && p2Raw > 0 ? Math.round(p2Raw) : 0;

      const p3Raw = Number(p.precio_venta_3 ?? p.precio_segundo);
      const precio_venta_3 = Number.isFinite(p3Raw) && p3Raw > 0 ? Math.round(p3Raw) : 0;

      const p4Raw = Number(p.precio_venta_4 ?? p.precio_cuarto);
      const precio_venta_4 = Number.isFinite(p4Raw) && p4Raw > 0 ? Math.round(p4Raw) : 0;

      const margen_p1 = precio_venta_1 > 0 ? Math.round(((precio_venta_1 - costo_uni) / precio_venta_1) * 100) : 0;
      const margen_p2 = precio_venta_2 > 0 ? Math.round(((precio_venta_2 - costo_uni) / precio_venta_2) * 100) : 0;

      const embalaje = String(p.PACKAGE_QTY ?? p.cantidad_embalaje ?? p.packageQty ?? '').trim();
      const proveedor = String(p.BRAND ?? p.SUPPLIER ?? p.proveedor ?? p.supplier ?? '').trim();
      const categoria = String(p.CATEGORYID ?? p.categoria ?? p.category ?? '').trim();
      const subcategoria = String(p.SUBCATEGORYID ?? p.subcategoria ?? p.subcategory ?? '').trim();

      items.push({
        id: doc.id,
        sku: String(p.SKU ?? p.sku ?? doc.id).trim(),
        nombre,
        nombreNorm: norm(nombre),
        barcode: String(p.BARCODE ?? p.barcode ?? '').trim().toLowerCase(),
        stock,
        costo_uni,
        costo_con_iva,
        precio_venta_1,
        precio_venta_2,
        precio_venta_3,
        precio_venta_4,
        margen_p1,
        margen_p2,
        cantidad_embalaje: embalaje,
        categoria,
        subcategoria,
        proveedor,
        activo: (p.ISACTIVE ?? p.isActive ?? p.active) !== false,
        ilimitado: stock >= 99999 || Boolean(p.is_temporary),
      });
    });

    dbProductIndex = items;
    dbProductIndexAt = Date.now();
    return items;
  })().finally(() => {
    dbProductIndexInflight = null;
  });

  return dbProductIndexInflight;
}

export interface DbProductMatch extends DbProductItem {
  score: number;
}

export async function resolveDbProducts(productText: string): Promise<{ matches: DbProductMatch[]; exact: boolean }> {
  const cleanQuery = productText.trim();
  if (!cleanQuery) return { matches: [], exact: false };

  const tokens = queryTokens(cleanQuery);
  const index = await loadDbProductIndex();
  const compact = norm(cleanQuery).replace(/ /g, '');

  const scored: DbProductMatch[] = [];

  for (const p of index) {
    // 1. SKU o Código de barra exacto
    if (compact && (compact === norm(p.sku).replace(/ /g, '') || (p.barcode && compact === p.barcode))) {
      scored.push({ ...p, score: 999 });
      continue;
    }

    // 2. Si el usuario escribió parte del SKU
    if (p.sku && norm(p.sku).includes(compact) && compact.length >= 3) {
      scored.push({ ...p, score: 500 });
      continue;
    }

    if (tokens.length === 0) continue;

    let hits = 0;
    for (const t of tokens) {
      const st = stem(t);
      if (p.nombreNorm.includes(t) || (st.length >= 3 && p.nombreNorm.includes(st))) {
        hits++;
      }
    }

    if (hits > 0) {
      scored.push({ ...p, score: hits });
    }
  }

  if (scored.length === 0) return { matches: [], exact: false };

  scored.sort((a, b) => b.score - a.score || a.nombre.length - b.nombre.length);
  const best = scored[0].score;
  const allTokens = best >= tokens.length || best >= 500;
  const minScore = allTokens ? (best >= 500 ? best : tokens.length) : Math.max(1, Math.ceil(tokens.length / 2));
  const matches = scored.filter(m => m.score >= minScore).slice(0, MAX_PRODUCTS);

  return { matches, exact: allTokens && matches.length === 1 };
}

// ── Consulta y Auditoría de Movimientos por SKU ───────────────────────────
export interface DbMovement {
  fecha: string;
  fechaTs: number;
  fechaHora: string;
  tipo: string;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  usuario: string;
  nota: string;
}

const dbMovementsCache = new Map<string, { at: number; rows: DbMovement[] }>();

export async function loadDbMovements(sku: string): Promise<DbMovement[]> {
  const hit = dbMovementsCache.get(sku);
  if (hit && Date.now() - hit.at < MOVEMENTS_TTL_MS) return hit.rows;

  const snap = await getAdminDb()
    .collection(MOVEMENTS_COLLECTION)
    .where('sku', '==', sku)
    .limit(3000)
    .get();

  const rows: DbMovement[] = snap.docs.map((d: any) => {
    const m = d.data() || {};
    const ts = Number(m.fechaTs) || 0;
    return {
      fecha: String(m.fecha || (ts ? dateFromTs(ts) : '')),
      fechaTs: ts,
      fechaHora: String(m.fechaHora || ''),
      tipo: String(m.tipo || ''),
      cantidad: Number(m.cantidad) || 0,
      stockAnterior: Number(m.stockAnterior) || 0,
      stockNuevo: Number(m.stockNuevo) || 0,
      usuario: String(m.usuario || 'Sistema / Sin especificar').trim(),
      nota: String(m.nota || '').trim(),
    };
  }).sort((a: DbMovement, b: DbMovement) => a.fechaTs - b.fechaTs);

  dbMovementsCache.set(sku, { at: Date.now(), rows });
  return rows;
}

export interface DbGeneralMovement extends DbMovement {
  sku: string;
  nombre: string;
}

export async function loadDbRecentMovements(options?: {
  usuarioFiltro?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}): Promise<DbGeneralMovement[]> {
  const { usuarioFiltro, desde, hasta, limit = 200 } = options || {};
  try {
    const snap = await getAdminDb()
      .collection(MOVEMENTS_COLLECTION)
      .limit(limit)
      .get();

    let rows: DbGeneralMovement[] = snap.docs.map((d: any) => {
      const m = d.data() || {};
      const ts = Number(m.fechaTs) || 0;
      return {
        sku: String(m.sku || ''),
        nombre: String(m.nombre || ''),
        fecha: String(m.fecha || (ts ? dateFromTs(ts) : '')),
        fechaTs: ts,
        fechaHora: String(m.fechaHora || ''),
        tipo: String(m.tipo || ''),
        cantidad: Number(m.cantidad) || 0,
        stockAnterior: Number(m.stockAnterior) || 0,
        stockNuevo: Number(m.stockNuevo) || 0,
        usuario: String(m.usuario || 'Sistema / Sin especificar').trim(),
        nota: String(m.nota || '').trim(),
      };
    }).sort((a, b) => b.fechaTs - a.fechaTs);

    if (desde) rows = rows.filter(r => r.fecha >= desde);
    if (hasta) rows = rows.filter(r => r.fecha <= hasta);
    if (usuarioFiltro) {
      const uNorm = norm(usuarioFiltro);
      rows = rows.filter(r => norm(r.usuario).includes(uNorm));
    }

    return rows;
  } catch (err) {
    console.warn('[db-ai-chat] Error consultando movimientos recientes:', err);
    return [];
  }
}

// ── Resumen Detallado para la IA ──────────────────────────────────────────
export interface DbProductFullSummary {
  sku: string;
  nombre: string;
  stockActual: number;
  activo: boolean;
  ilimitado: boolean;
  costos: {
    costoNetoUnitario: number;
    costoConIva19Pct: number;
    valoracionTotalInventarioNeto: number;
  };
  preciosVenta: {
    detalleP1: number;
    mayoristaP2: number;
    especialP3: number;
    cuartoP4: number;
  };
  margenesGanancia: {
    margenP1Pct: number;
    margenP2Pct: number;
  };
  embalaje: string;
  proveedor: string;
  periodoAuditado: {
    desde: string;
    hasta: string;
  };
  ventas: {
    unidadesVendidasBrutas: number;
    unidadesRestituidas: number;
    unidadesVendidasNetas: number;
    ventasPorDia: Array<{
      fecha: string;
      dia: string;
      unidadesVendidas: number;
      unidadesIngresadas: number;
    }>;
  };
  auditoriaMovimientosYQuienLoMovio: Array<{
    fechaHoraChile: string;
    quienLoMovioNombre: string;
    tipoAccion: string;
    cantidadDelta: number;
    stockAntes: number;
    stockDespues: number;
    motivoONota: string;
  }>;
  ultimoMovimientoRegistrado: string;
}

export async function summarizeProductForDb(
  p: DbProductItem,
  desde: string,
  hasta: string
): Promise<DbProductFullSummary> {
  const all = await loadDbMovements(p.sku);
  const rows = all.filter(m => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta));

  let vendidas = 0;
  let restituidas = 0;
  let ingresadas = 0;
  const dias = new Map<string, { vendidas: number; ingresadas: number }>();

  for (const m of rows) {
    const d = dias.get(m.fecha) || { vendidas: 0, ingresadas: 0 };
    if (m.tipo === 'venta' || m.tipo === 'venta_web') {
      const q = Math.abs(m.cantidad);
      vendidas += q;
      d.vendidas += q;
    } else if (['anulacion', 'devolucion', 'cancelacion_web', 'expiracion_web'].includes(m.tipo)) {
      const q = Math.abs(m.cantidad);
      restituidas += q;
    } else if (['add', 'ingreso_daniel', 'ingreso_manual'].includes(m.tipo)) {
      const q = Math.abs(m.cantidad);
      ingresadas += q;
      d.ingresadas += q;
    }
    dias.set(m.fecha, d);
  }

  const listed = rows.slice(-MAX_LISTED_MOVEMENTS);

  return {
    sku: p.sku,
    nombre: p.nombre,
    stockActual: p.stock,
    activo: p.activo,
    ilimitado: p.ilimitado,
    costos: {
      costoNetoUnitario: p.costo_uni,
      costoConIva19Pct: p.costo_con_iva,
      valoracionTotalInventarioNeto: p.stock * p.costo_uni,
    },
    preciosVenta: {
      detalleP1: p.precio_venta_1,
      mayoristaP2: p.precio_venta_2,
      especialP3: p.precio_venta_3,
      cuartoP4: p.precio_venta_4,
    },
    margenesGanancia: {
      margenP1Pct: p.margen_p1,
      margenP2Pct: p.margen_p2,
    },
    embalaje: p.cantidad_embalaje,
    proveedor: p.proveedor,
    periodoAuditado: { desde, hasta },
    ventas: {
      unidadesVendidasBrutas: vendidas,
      unidadesRestituidas: restituidas,
      unidadesVendidasNetas: vendidas - restituidas,
      ventasPorDia: [...dias.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, v]) => ({
          fecha,
          dia: weekdayEs(fecha),
          unidadesVendidas: v.vendidas,
          unidadesIngresadas: v.ingresadas,
        })),
    },
    auditoriaMovimientosYQuienLoMovio: listed.map(m => ({
      fechaHoraChile: m.fechaHora || m.fecha,
      quienLoMovioNombre: m.usuario || 'Sistema / Sin especificar',
      tipoAccion: m.tipo,
      cantidadDelta: m.cantidad,
      stockAntes: m.stockAnterior,
      stockDespues: m.stockNuevo,
      motivoONota: m.nota || '',
    })),
    ultimoMovimientoRegistrado: all.length ? (all[all.length - 1].fechaHora || all[all.length - 1].fecha) : 'Sin movimientos',
  };
}

// ── Invocación de Modelos Gemini con Fallback ─────────────────────────────
async function callGemini(
  system: string,
  user: string,
  opts: { json?: boolean; maxTokens: number; temperature: number }
): Promise<string> {
  const headers = await getGeminiAuthHeaders();
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    system_instruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  for (const model of GEMINI_TEXT_MODELS) {
    try {
      const res = await fetch(buildGeminiUrl(model), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
      if (text) return text;
    } catch (err) {
      console.warn(`[db-ai-chat] modelo ${model} fallo:`, err);
    }
  }

  throw new Error('Ningun modelo de IA respondio');
}

// ── Extracción Inteligente de Intención ────────────────────────────────────
export interface DbChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface DbIntent {
  tipo: 'consulta_producto' | 'general_costos' | 'general_inventario' | 'auditoria_movimiento' | 'otro';
  producto: string;
  usuarioFiltro?: string;
  desde: string;
  hasta: string;
}

export async function extractDbIntent(
  question: string,
  history: DbChatTurn[],
  today: string
): Promise<DbIntent> {
  const system = `Eres un extractor de intención contable y de base de datos para Importadora Carlitos (ERP).
Debes devolver ÚNICAMENTE un JSON válido sin texto adicional.
Esquema:
{
  "tipo": "consulta_producto" | "general_costos" | "general_inventario" | "auditoria_movimiento" | "otro",
  "producto": string,
  "usuarioFiltro": string (si preguntan por una persona como Daniel, cajera, etc. O vacío),
  "desde": "YYYY-MM-DD",
  "hasta": "YYYY-MM-DD"
}
Reglas:
- "producto": Nombre o SKU del producto al que se refiere la pregunta. Si es un seguimiento (ej: "y cuánto costó?", "y quién lo movió?", "y el viernes?"), tómalo de la conversación previa.
- "usuarioFiltro": Si mencionan a una persona específica (ej. "Daniel", "Yerko", "cajera central"), extráelo.
- Fechas: Hoy es ${today} (${weekdayEs(today)}).
  * "ayer" = ${addDays(today, -1)}
  * "hoy" = ${today}
  * "el viernes pasado" = el viernes anterior más cercano.
  * Si no mencionan fecha específica pero preguntan ventas o movimientos, usa por defecto los últimos 14 días.
  * Si preguntan por una fecha puntual, "desde" y "hasta" son esa misma fecha.`;

  const hist = history
    .slice(-6)
    .map(t => `${t.role === 'user' ? 'Usuario' : 'Asistente'}: ${t.text.slice(0, 300)}`)
    .join('\n');

  const userPrompt = `HOY es ${today} (${weekdayEs(today)}).\nCalendario:\n${calendarTable(today)}\n\n${hist ? `Historial previo:\n${hist}\n\n` : ''}Pregunta del usuario: ${question}`;

  try {
    const raw = await callGemini(system, userPrompt, { json: true, maxTokens: 1024, temperature: 0 });
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);

    let desde = isValidDate(parsed.desde) ? parsed.desde : addDays(today, -14);
    let hasta = isValidDate(parsed.hasta) ? parsed.hasta : today;
    if (hasta > today) hasta = today;
    if (desde > hasta) desde = hasta;

    return {
      tipo: parsed.tipo || 'consulta_producto',
      producto: String(parsed.producto || '').slice(0, 150),
      usuarioFiltro: String(parsed.usuarioFiltro || '').trim(),
      desde,
      hasta,
    };
  } catch (err) {
    console.warn('[db-ai-chat] Falló extractDbIntent con IA, usando fallback:', err);
    return {
      tipo: 'consulta_producto',
      producto: question.slice(0, 100),
      desde: addDays(today, -14),
      hasta: today,
    };
  }
}

// ── Redacción de Respuesta con IA (Gemini) ────────────────────────────────
export async function composeDbAnswer(
  question: string,
  summaries: DbProductFullSummary[],
  usuarioFiltro?: string,
  generalAudit?: DbGeneralMovement[]
): Promise<string> {
  const system = `Eres la Inteligencia Artificial Oficial de la Base de Datos y Auditoría de Importadora Carlitos (ERP Asistora).
Tu rol es asistir a administradores y directivos con información exacta sobre COSTOS, INVENTARIO, VENTAS POR FECHA y AUDITORÍA DE MOVIMIENTOS.

INFORMACIÓN QUE POSEES Y DEBES EXPONER CON PRECISIÓN:
1. COSTOS Y MÁRGENES:
   - Costo unitario neto y costo con IVA (19%).
   - Precios de venta (P1 Detalle, P2 Mayorista, P3 Especial, P4).
   - Márgenes de ganancia exactos en porcentaje (%).
   - Valoración total del inventario disponible en dinero.
2. INVENTARIO REAL:
   - Stock actual en bodega, formato de embalaje (unidades por bulto/caja) y proveedor.
3. VENTAS POR FECHA:
   - Sabes con exactitud cuántas unidades se vendieron en cada día específico consultado (ej. "el viernes se vendieron X unidades").
4. QUIÉN LO MOVIÓ (AUDITORÍA):
   - Conoces el nombre de la persona o usuario que movió el stock (ej: "Daniel", "Cajera", "Admin").
   - Sabes la fecha y hora chilena exacta en que se registró.
   - Sabes qué acción se hizo (ingreso de Daniel, venta POS, ajuste, devolución) y la nota explicativa.

ESTILO DE RESPUESTA:
- Responde en español chileno profesional de negocios, directo al grano, claro, impecable y analítico.
- Usa formato Markdown con viñetas, tablas limpias si son varios datos, y NEGRILLAS para resaltar cifras ($), nombres de personas y cantidades.
- Si te preguntan "quién lo movió", responde directamente destacando en negrita a la persona (ej: "**Daniel** ingresó **50 unidades** el **12 de octubre a las 15:30 hrs** con la nota '*Recepción bodega*'").
- Si te preguntan por costos, muestra el desglose completo de costo neto, con IVA y márgenes de P1 y P2.
- Si no hubo movimientos en el periodo consultado, indícalo claramente y menciona cuándo fue el último movimiento registrado.`;

  const userPrompt = `Pregunta del usuario: ${question}
${usuarioFiltro ? `Filtro de usuario solicitado: ${usuarioFiltro}` : ''}
DATOS DE PRODUCTOS Y AUDITORÍA (JSON):
${JSON.stringify(summaries, null, 2)}
${generalAudit && generalAudit.length > 0 ? `\nMOVIMIENTOS DE AUDITORÍA GENERAL ENCONTRADOS (${generalAudit.length} registros):\n${JSON.stringify(generalAudit.slice(0, 40), null, 2)}` : ''}`;

  try {
    return await callGemini(system, userPrompt, { maxTokens: 2000, temperature: 0.15 });
  } catch (err) {
    console.warn('[db-ai-chat] composeDbAnswer falló, usando fallback determinista:', err);
    return buildDatabasePlainAnswer(summaries, generalAudit);
  }
}

// ── Fallback Determinista Estructurado (si Gemini no responde) ─────────────
export function buildDatabasePlainAnswer(
  summaries: DbProductFullSummary[],
  generalAudit?: DbGeneralMovement[]
): string {
  if (summaries.length === 0) {
    if (generalAudit && generalAudit.length > 0) {
      const lines = ['🔍 **Auditoría de Movimientos Registrados:**\n'];
      generalAudit.slice(0, 20).forEach(m => {
        const delta = m.cantidad > 0 ? `+${m.cantidad}` : `${m.cantidad}`;
        lines.push(`• **${m.usuario}** (${m.tipo}): **${delta} uds** de *${m.nombre || m.sku}* (Stock: ${m.stockAnterior} → ${m.stockNuevo}) el ${m.fechaHora || m.fecha}${m.nota ? ` — "${m.nota}"` : ''}`);
      });
      return lines.join('\n');
    }
    return 'No se encontraron productos ni movimientos coincidentes en la base de datos para responder a esta consulta.';
  }

  return summaries.map(s => {
    const lines: string[] = [];
    lines.push(`📦 **${s.nombre}** (SKU: \`${s.sku}\`)`);
    lines.push(`• **Stock Actual**: **${s.stockActual} unidades** ${s.ilimitado ? '(Ilimitado)' : ''}`);
    if (s.embalaje) lines.push(`• **Embalaje**: ${s.embalaje}`);
    if (s.proveedor) lines.push(`• **Proveedor**: ${s.proveedor}`);

    lines.push(`\n💰 **Costos y Precios**:`);
    lines.push(`• **Costo Neto**: $${s.costos.costoNetoUnitario.toLocaleString('es-CL')} (Con IVA: $${s.costos.costoConIva19Pct.toLocaleString('es-CL')})`);
    lines.push(`• **P1 (Detalle)**: $${s.preciosVenta.detalleP1.toLocaleString('es-CL')} (Margen: **${s.margenesGanancia.margenP1Pct}%**)`);
    lines.push(`• **P2 (Mayorista)**: $${s.preciosVenta.mayoristaP2.toLocaleString('es-CL')} (Margen: **${s.margenesGanancia.margenP2Pct}%**)`);
    if (s.preciosVenta.especialP3 > 0) lines.push(`• **P3 (Especial)**: $${s.preciosVenta.especialP3.toLocaleString('es-CL')}`);
    if (s.preciosVenta.cuartoP4 > 0) lines.push(`• **P4**: $${s.preciosVenta.cuartoP4.toLocaleString('es-CL')}`);
    lines.push(`• **Valor Total Stock Neto**: $${s.costos.valoracionTotalInventarioNeto.toLocaleString('es-CL')}`);

    lines.push(`\n📈 **Ventas en Periodo (${s.periodoAuditado.desde} al ${s.periodoAuditado.hasta})**:`);
    lines.push(`• **Total Vendidas Netas**: **${s.ventas.unidadesVendidasNetas} unidades** (Brutas: ${s.ventas.unidadesVendidasBrutas}, Restituidas: ${s.ventas.unidadesRestituidas})`);
    if (s.ventas.ventasPorDia.length > 0) {
      s.ventas.ventasPorDia.forEach(d => {
        if (d.unidadesVendidas > 0) {
          lines.push(`   - ${d.dia} ${d.fecha}: **${d.unidadesVendidas} uds** vendidas`);
        }
      });
    }

    lines.push(`\n🔍 **Auditoría de Movimientos (Quién lo movió)**:`);
    if (s.auditoriaMovimientosYQuienLoMovio.length === 0) {
      lines.push(`• No se registran movimientos en el rango de fechas consultado.`);
    } else {
      s.auditoriaMovimientosYQuienLoMovio.slice(-10).reverse().forEach(m => {
        const delta = m.cantidadDelta > 0 ? `+${m.cantidadDelta}` : `${m.cantidadDelta}`;
        lines.push(`• **${m.quienLoMovioNombre}** (${m.tipoAccion}): **${delta} uds** (Stock: ${m.stockAntes} → ${m.stockDespues}) el ${m.fechaHoraChile}${m.motivoONota ? ` — *"${m.motivoONota}"*` : ''}`);
      });
    }

    return lines.join('\n');
  }).join('\n\n---\n\n');
}
