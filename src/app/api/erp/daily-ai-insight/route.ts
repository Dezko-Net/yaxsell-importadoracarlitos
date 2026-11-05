import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED } from '@/lib/feature-flags';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';
import { GEMINI_TEXT_MODELS as MODELS } from '@/lib/gemini-models';

export const dynamic = 'force-dynamic';

const COLLECTION_NAME = 'erp_daily_ai_insights';
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE';
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';
const FIREBASE_DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '(default)';

interface HistoryDay {
  fecha: string;
  label: string;
  ventas: number;
  gastos?: number;
  ganancia: number;
  margenPct: number;
}

interface TopProductInput {
  sku: string;
  nombre: string;
  cantidad: number;
  ventas: number;
  costoNeto: number;
  imageUrl?: string;
}

export interface PriceRecommendation {
  sku: string;
  nombre: string;
  imageUrl?: string;
  precioActual: number;
  costo: number;
  margenActualPct: number;
  precioSugerido: number;
  margenSugeridoPct: number;
  gananciaExtraEstimada: number;
  unidadesVendidas: number;
  motivo: string;
}

// ── Firestore REST Helpers (100% fiables en serverless y local) ──────────────
function decodeFirestoreValue(v: any): any {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return Boolean(v.booleanValue);
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if (v.mapValue !== undefined) {
    const obj: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      obj[k] = decodeFirestoreValue(val);
    }
    return obj;
  }
  return undefined;
}

function decodeFirestoreDoc(doc: any): Record<string, any> {
  const docId = doc.name ? doc.name.split('/').pop() : '';
  const obj: Record<string, any> = { id: docId, $id: docId };
  if (doc.fields) {
    for (const [k, val] of Object.entries(doc.fields)) {
      obj[k] = decodeFirestoreValue(val);
    }
  }
  return obj;
}

function encodeFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = encodeFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function encodeFirestoreDoc(obj: Record<string, any>): { fields: Record<string, any> } {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && k !== '$id' && k !== 'id') {
      fields[k] = encodeFirestoreValue(v);
    }
  }
  return { fields };
}

async function getStoredDailyInsight(fecha: string): Promise<Record<string, any> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/${COLLECTION_NAME}/${fecha}?key=${FIREBASE_API_KEY}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return decodeFirestoreDoc(data);
  } catch (err) {
    console.warn('[daily-ai-insight] Error leyendo REST insight:', err);
    return null;
  }
}

async function saveStoredDailyInsight(fecha: string, data: Record<string, any>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/${COLLECTION_NAME}/${fecha}?key=${FIREBASE_API_KEY}`;
  const encoded = encodeFirestoreDoc(data);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encoded),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[daily-ai-insight] Error guardando insight en Firestore:', res.status, errText);
    }
  } catch (err) {
    console.error('[daily-ai-insight] Excepción guardando insight:', err);
  }
}

// Cache en memoria del catálogo de imágenes para no sobrecargar Firestore
let cachedCatalogImageMap: Map<string, string> | null = null;
let lastImageMapFetch = 0;

async function fetchProductImageMap(): Promise<Map<string, string>> {
  if (cachedCatalogImageMap && Date.now() - lastImageMapFetch < 300000) {
    return cachedCatalogImageMap;
  }
  const map = new Map<string, string>();
  try {
    let pageToken = '';
    do {
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/products?key=${FIREBASE_API_KEY}&pageSize=300${pageParam}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const docs = (data.documents || []).map(decodeFirestoreDoc);
      for (const p of docs) {
        const img = p.imageUrl || p.IMAGEURL || p.image || (Array.isArray(p.images) ? p.images[0] : null);
        if (!img) continue;
        const sku = String(p.sku || p.SKU || '').trim().toUpperCase();
        const barcode = String(p.codigo_barra || p.BARCODE || '').trim().toUpperCase();
        const name = String(p.NAME || p.nombre || p.name || '').trim().toUpperCase();
        const id = String(p.id || p.$id || '').trim().toUpperCase();
        if (sku) map.set(sku, img);
        if (barcode) map.set(barcode, img);
        if (name) map.set(name, img);
        if (id) map.set(id, img);
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  } catch (err) {
    console.warn('[daily-ai-insight] Error fetching catalog image map:', err);
  }
  cachedCatalogImageMap = map;
  lastImageMapFetch = Date.now();
  return map;
}

async function enrichRecommendationsWithImages(
  recs: PriceRecommendation[]
): Promise<{ enriched: PriceRecommendation[]; hasChanges: boolean }> {
  let hasChanges = false;
  const needsLookup = recs.some((r) => !r.imageUrl);
  if (!needsLookup) return { enriched: recs, hasChanges: false };

  const imageMap = await fetchProductImageMap();
  const enriched = recs.map((r) => {
    if (r.imageUrl) return r;
    const skuKey = String(r.sku || '').trim().toUpperCase();
    const nameKey = String(r.nombre || '').trim().toUpperCase();
    const foundImg = imageMap.get(skuKey) || imageMap.get(nameKey) || null;
    if (foundImg) {
      hasChanges = true;
      return { ...r, imageUrl: foundImg };
    }
    return r;
  });

  return { enriched, hasChanges };
}

// ── GET: Obtiene análisis del día si ya existe ─────────────────────────────
export async function GET(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ success: false, error: 'IA desactivada' }, { status: 404 });
  try {
    const { searchParams } = new URL(req.url);
    const fecha = searchParams.get('fecha') || getSantiagoDate();

    let insight = await getStoredDailyInsight(fecha);
    if (insight && Array.isArray(insight.priceRecommendations)) {
      const { enriched, hasChanges } = await enrichRecommendationsWithImages(insight.priceRecommendations);
      if (hasChanges) {
        insight = { ...insight, priceRecommendations: enriched };
        saveStoredDailyInsight(fecha, insight).catch(() => {});
      }
    }
    return NextResponse.json({ success: true, insight });
  } catch (error: any) {
    console.error('[daily-ai-insight] Error GET:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── POST: Genera y persiste el análisis diario ──────────────────────────────
export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ success: false, error: 'IA desactivada' }, { status: 404 });
  try {
    const body = await req.json();
    const {
      fecha = getSantiagoDate(),
      ventas = 0,
      gastos = 0,
      ganancia = 0,
      margenPct = 0,
      historyDays = [] as HistoryDay[],
      topProducts = [] as TopProductInput[],
      isPreliminary = false,
      force = false,
    } = body;

    // Si ya existe y no se fuerza recálculo, retornamos el guardado
    if (!force) {
      let existing = await getStoredDailyInsight(fecha);
      if (existing) {
        if (existing.commentary && (!existing.isPreliminary || isPreliminary)) {
          if (Array.isArray(existing.priceRecommendations)) {
            const { enriched, hasChanges } = await enrichRecommendationsWithImages(existing.priceRecommendations);
            if (hasChanges) {
              existing = { ...existing, priceRecommendations: enriched };
              saveStoredDailyInsight(fecha, existing).catch(() => {});
            }
          }
          return NextResponse.json({ success: true, insight: existing, cached: true });
        }
      }
    }

    // 1. Calcular promedio de margen histórico de los 5-7 días
    const validHistory = (historyDays || []).filter((d: HistoryDay) => d.fecha !== fecha && d.ventas > 0);
    const avgMargin = validHistory.length > 0
      ? validHistory.reduce((acc: number, d: HistoryDay) => acc + (d.margenPct || 0), 0) / validHistory.length
      : margenPct;

    // 2. Generar recomendaciones de precios inteligentes
    const priceRecommendations = await buildPriceRecommendations(topProducts);

    // 3. Generar comentario con Gemini (con fallback algorítmico robusto)
    const commentary = await generateAiCommentary({
      fecha,
      ventas,
      gastos,
      ganancia,
      margenPct,
      avgMargin,
      historyDays: validHistory,
      topProducts,
      priceRecommendations,
      isPreliminary,
    });

    const insightData = {
      fecha,
      generatedAt: new Date().toISOString(),
      timestamp: Date.now(),
      ventas: Math.round(ventas),
      gastos: Math.round(gastos),
      ganancia: Math.round(ganancia),
      margenPct: Number(margenPct.toFixed(1)),
      avgMarginPreviousDays: Number(avgMargin.toFixed(1)),
      commentary,
      historyDays: historyDays.slice(-7),
      priceRecommendations,
      isPreliminary: Boolean(isPreliminary),
    };

    await saveStoredDailyInsight(fecha, insightData);

    return NextResponse.json({ success: true, insight: insightData, cached: false });
  } catch (error: any) {
    console.error('[daily-ai-insight] Error POST:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── Algoritmo de recomendación de precios ───────────────────────────────────
async function buildPriceRecommendations(
  topProducts: TopProductInput[]
): Promise<PriceRecommendation[]> {
  const recommendations: PriceRecommendation[] = [];
  const imageMap = await fetchProductImageMap();

  // Analizar productos vendidos hoy
  for (const item of (topProducts || []).slice(0, 15)) {
    if (!item.cantidad || item.cantidad <= 0) continue;
    const precioActual = Math.round(item.ventas / item.cantidad);
    const costoUnitario = Math.round(item.costoNeto / item.cantidad);
    if (costoUnitario <= 0 || precioActual <= 0) continue;

    const margenActual = ((precioActual - costoUnitario) / precioActual) * 100;

    // Recomendamos subir precio si el margen es menor a 28% o si el volumen es alto con margen < 30%
    if (margenActual < 28) {
      const targetMargin = Math.min(38, Math.max(32, margenActual + 14));
      const rawPrecioSugerido = Math.round(costoUnitario / (1 - targetMargin / 100));
      const precioSugerido = roundToCommercialPrice(rawPrecioSugerido);

      if (precioSugerido > precioActual) {
        const margenSugerido = ((precioSugerido - costoUnitario) / precioSugerido) * 100;
        const gananciaExtraUnidad = precioSugerido - precioActual;
        const rotacionMensualEstimada = Math.max(item.cantidad * 20, 20);
        const gananciaExtraEstimada = Math.round(gananciaExtraUnidad * rotacionMensualEstimada);

        let motivo = '';
        if (margenActual < 16) {
          motivo = `Margen crítico (${margenActual.toFixed(1)}%). El costo absorbe casi toda la venta. Ajuste urgente sugerido.`;
        } else if (item.cantidad >= 4) {
          motivo = `Alta rotación (${item.cantidad} hoy) con margen comprimido (${margenActual.toFixed(1)}%). Demanda inelástica.`;
        } else {
          motivo = `Margen de ${margenActual.toFixed(1)}% está por debajo del estándar óptimo (35%). Admite incremento sin perder competitividad.`;
        }

        const skuKey = String(item.sku || '').trim().toUpperCase();
        const nameKey = String(item.nombre || '').trim().toUpperCase();
        const img = item.imageUrl || imageMap.get(skuKey) || imageMap.get(nameKey) || undefined;

        recommendations.push({
          sku: item.sku || 'SIN-SKU',
          nombre: item.nombre || 'Producto Importadora Carlitos',
          imageUrl: img,
          precioActual,
          costo: costoUnitario,
          margenActualPct: Number(margenActual.toFixed(1)),
          precioSugerido,
          margenSugeridoPct: Number(margenSugerido.toFixed(1)),
          gananciaExtraEstimada,
          unidadesVendidas: item.cantidad,
          motivo,
        });
      }
    }
  }

  // Si tenemos pocas recomendaciones de hoy, consultamos productos del catálogo vía REST
  if (recommendations.length < 5) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/products?key=${FIREBASE_API_KEY}&pageSize=40`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const docs = (data.documents || []).map(decodeFirestoreDoc);

        for (const p of docs) {
          if (recommendations.length >= 7) break;
          const sku = p.sku || p.id;
          if (recommendations.some(r => r.sku === sku)) continue;

          const costo = Number(p.costo_uni || p.cost || 0);
          const precio = Number(p.precio_venta_1 || p.price || 0);
          if (costo > 500 && precio > costo) {
            const m = ((precio - costo) / precio) * 100;
            if (m < 25) {
              const rawSug = Math.round(costo / (1 - 0.35));
              const precioSugerido = roundToCommercialPrice(rawSug);
              if (precioSugerido > precio) {
                const margenSugerido = ((precioSugerido - costo) / precioSugerido) * 100;
                const gananciaExtraEstimada = (precioSugerido - precio) * 25;
                const pImg = p.imageUrl || p.IMAGEURL || p.image || (Array.isArray(p.images) && p.images[0]) || imageMap.get(String(sku).toUpperCase()) || undefined;
                recommendations.push({
                  sku,
                  nombre: p.nombre || p.name || 'Producto Importadora Carlitos',
                  imageUrl: pImg,
                  precioActual: precio,
                  costo,
                  margenActualPct: Number(m.toFixed(1)),
                  precioSugerido,
                  margenSugeridoPct: Number(margenSugerido.toFixed(1)),
                  gananciaExtraEstimada,
                  unidadesVendidas: Math.max(1, Number((p.stock || 0) > 10 ? 8 : 3)),
                  motivo: `Margen en catálogo de solo ${m.toFixed(1)}%. Ajustar a $${precioSugerido.toLocaleString('es-CL')} eleva la rentabilidad al ${margenSugerido.toFixed(1)}%.`,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[daily-ai-insight] Error al buscar productos adicionales:', err);
    }
  }

  // Ordenar por mayor ganancia extra estimada
  return recommendations.sort((a, b) => b.gananciaExtraEstimada - a.gananciaExtraEstimada).slice(0, 8);
}

// ── Redondeo comercial chileno ($990, $1.490, $1.990, etc.) ───────────────────
function roundToCommercialPrice(raw: number): number {
  if (raw <= 1000) {
    return Math.round(raw / 50) * 50;
  }
  if (raw <= 5000) {
    const rem = raw % 1000;
    if (rem < 350) return Math.floor(raw / 1000) * 1000 - 10; // ej 1990
    if (rem < 750) return Math.floor(raw / 1000) * 1000 + 490; // ej 1490
    return Math.floor(raw / 1000) * 1000 + 990; // ej 1990
  }
  return Math.ceil(raw / 100) * 100;
}

// ── Generador de análisis con IA (Gemini + fallback analítico) ────────────────
async function generateAiCommentary(data: {
  fecha: string;
  ventas: number;
  gastos: number;
  ganancia: number;
  margenPct: number;
  avgMargin: number;
  historyDays: HistoryDay[];
  topProducts: TopProductInput[];
  priceRecommendations: PriceRecommendation[];
  isPreliminary?: boolean;
}): Promise<string> {
  const {
    fecha,
    ventas,
    gastos,
    ganancia,
    margenPct,
    avgMargin,
    historyDays,
    topProducts,
    priceRecommendations,
    isPreliminary,
  } = data;

  const diffFromAvg = margenPct - avgMargin;
  const historyText = historyDays
    .map(d => `${d.label || d.fecha}: ${d.margenPct.toFixed(1)}%`)
    .join(', ');

  const topItemsText = (topProducts || [])
    .slice(0, 5)
    .map(p => `${p.nombre} (${p.cantidad} unids, $${p.ventas.toLocaleString('es-CL')})`)
    .join('; ');

  const systemInstruction = `Eres BALATO AI, el asesor financiero y analista de rentabilidad del e-commerce y tiendas físicas Importadora Carlitos en Chile.
Tu rol es entregar un reporte ejecutivo ultra conciso, agudo y directo para el dueño del negocio.
Analiza con precisión por qué el margen de hoy cerró en ${margenPct.toFixed(1)}% frente a las ventas y gastos.
Tono: Inteligente, comercial, realista, directo al grano (sin rodeos, sin fórmulas matemáticas evidentes, con visión estratégica de margen).
Formato: Máximo 2 párrafos concisos (entre 70 y 110 palabras en total). No pongas títulos ni saludos. Ve directo al grano.`;

  const userPrompt = `Fecha: ${fecha} ${isPreliminary ? '(Cierre preliminar durante el turno)' : '(Cierre oficial del día)'}
- Ventas brutas: $${ventas.toLocaleString('es-CL')}
- Gastos operativos: $${gastos.toLocaleString('es-CL')}
- Ganancia neta final: $${ganancia.toLocaleString('es-CL')}
- Margen neto hoy: ${margenPct.toFixed(1)}%
- Promedio últimos días: ${avgMargin.toFixed(1)}% (Variación hoy: ${diffFromAvg >= 0 ? '+' : ''}${diffFromAvg.toFixed(1)}%)
- Historial reciente: [${historyText}]
- Top productos vendidos hoy: [${topItemsText || 'Ventas generales'}]
- Productos con margen bajo detectados: ${priceRecommendations.length} productos identificados.

Instrucción:
Explica el por qué exacto de este ${margenPct.toFixed(1)}% de margen hoy. ¿Fue por el peso de los gastos fijos/operativos, o por el mix de productos de bajo margen vendidos? Compara con el ${avgMargin.toFixed(1)}% de los días previos y da una recomendación puntual de acción sobre los precios o control de gastos para mañana.`;

  try {
    const geminiHeaders = await getGeminiAuthHeaders();
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      system_instruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 350,
      },
    };

    for (const model of MODELS) {
      try {
        const url = buildGeminiUrl(model);
        const res = await fetch(url, {
          method: 'POST',
          headers: geminiHeaders,
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const resJson = await res.json();
          const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim().length > 30) {
            return candidateText.trim();
          }
        }
      } catch (callErr) {
        console.warn(`[daily-ai-insight] Error llamando modelo ${model}:`, callErr);
      }
    }
  } catch (err) {
    console.warn('[daily-ai-insight] Error general en Gemini, usando generador analítico:', err);
  }

  // ── Fallback Analítico Heurístico de Alta Precisión ────────────────────────
  return buildHeuristicAnalysis(ventas, gastos, ganancia, margenPct, avgMargin, priceRecommendations);
}

function buildHeuristicAnalysis(
  ventas: number,
  gastos: number,
  ganancia: number,
  margenPct: number,
  avgMargin: number,
  priceRecommendations: PriceRecommendation[]
): string {
  const diff = margenPct - avgMargin;
  const gastoRatio = ventas > 0 ? (gastos / ventas) * 100 : 0;

  let analisis = '';
  if (diff < -3) {
    analisis = `El margen de hoy cerró en un ${margenPct.toFixed(1)}%, ubicándose ${Math.abs(diff).toFixed(1)} puntos por debajo del promedio semanal (${avgMargin.toFixed(1)}%). La compresión se debe principalmente al mix de venta cargado en artículos de bajo margen comercial y a que los gastos operativos absorbieron un ${gastoRatio.toFixed(1)}% de los ingresos totales.`;
  } else if (diff > 3) {
    analisis = `Excelente jornada de rentabilidad: el margen alcanzó un ${margenPct.toFixed(1)}%, superando en +${diff.toFixed(1)} puntos el promedio reciente (${avgMargin.toFixed(1)}%). La alta rotación de productos con mejor markup y un control eficiente de los gastos de caja (${gastoRatio.toFixed(1)}% de las ventas) impulsaron la ganancia final a $${ganancia.toLocaleString('es-CL')}.`;
  } else {
    analisis = `El margen de hoy se mantuvo estable en ${margenPct.toFixed(1)}%, alineado con el ritmo habitual de la semana (${avgMargin.toFixed(1)}%). Con ventas de $${ventas.toLocaleString('es-CL')} y gastos por $${gastos.toLocaleString('es-CL')}, la operación sostuvo un rendimiento constante.`;
  }

  let accion = '';
  if (priceRecommendations.length > 0) {
    const topRec = priceRecommendations[0];
    accion = ` Para elevar la rentabilidad mañana, sugiero ajustar el precio de ${priceRecommendations.length} productos de alta salida, comenzando por "${topRec.nombre}", cuyo margen actual (${topRec.margenActualPct}%) admite un incremento a $${topRec.precioSugerido.toLocaleString('es-CL')} para capturar mayor margen neto.`;
  } else {
    accion = ` Para los próximos días se recomienda priorizar la exhibición de artículos con markup superior al 35% y mantener acotados los egresos de caja.`;
  }

  return `${analisis}${accion}`;
}

// ── Helper de fecha en zona horaria chilena ──────────────────────────────────
function getSantiagoDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
