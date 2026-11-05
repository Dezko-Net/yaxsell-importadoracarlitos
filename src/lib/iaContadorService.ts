/**
 * iaContadorService.ts
 *
 * El Contador IA — asesor de inteligencia empresarial para Importadora Carlitos.
 *
 * - Memoria permanente en Firestore (colección `ia_contador_memoria`)
 * - Llama a Gemini/Vertex AI via google-auth.ts
 * - Contexto modular según el tipo de análisis
 * - Recomendaciones específicas con impacto en pesos
 *
 * Server-side only.
 */
import { getAdminDb } from './db-server'
import { getGeminiAuthHeaders, buildGeminiUrl } from './google-auth'
import { GEMINI_TEXT_MODELS } from './gemini-models'
import {
  buildBusinessSnapshot,
  snapshotToPromptContext,
  type BusinessSnapshot,
} from './businessIntelligenceService'

// ─── Memoria en Firestore ────────────────────────────────────────────────────

const MEMORIA_COLLECTION = 'ia_contador_memoria'
const MAX_MEMORIA_ENTRIES = 200 // rotación: caen las más viejas

interface MemoriaEntry {
  fecha: string
  sede: string
  tipo: 'analisis_productos' | 'analisis_general' | 'recomendacion'
  resumen: string
  alertas: string[]
  recomendaciones: string[]
  createdAt: number
}

async function guardarMemoria(entry: Omit<MemoriaEntry, 'createdAt'>): Promise<void> {
  try {
    const db = getAdminDb()
    await db.collection(MEMORIA_COLLECTION).add({
      ...entry,
      createdAt: Date.now(),
    })
    // Limpiar entradas viejas si excede el máximo
    const snap = await db.collection(MEMORIA_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(MAX_MEMORIA_ENTRIES + 1)
      .get()
    if (snap.size > MAX_MEMORIA_ENTRIES) {
      const toDelete = snap.docs.slice(MAX_MEMORIA_ENTRIES)
      const batch = db.batch()
      toDelete.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  } catch (err) {
    console.error('[IA Contador] Error guardando memoria:', err)
  }
}

async function cargarMemoriaReciente(sede: string, dias = 7): Promise<MemoriaEntry[]> {
  try {
    const db = getAdminDb()
    const since = Date.now() - dias * 24 * 60 * 60 * 1000
    const snap = await db.collection(MEMORIA_COLLECTION)
      .where('sede', '==', sede)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()
    return snap.docs.map(d => d.data() as MemoriaEntry)
  } catch {
    return []
  }
}

function memoriaToContexto(entries: MemoriaEntry[]): string {
  if (entries.length === 0) return ''
  const lines: string[] = ['--- MEMORIA DE ANÁLISIS ANTERIORES (últimos 7 días) ---']
  for (const e of entries.slice(0, 10)) {
    lines.push(`  [${e.fecha}] ${e.tipo}:`)
    if (e.alertas.length > 0) lines.push(`    Alertas: ${e.alertas.join('; ')}`)
    if (e.recomendaciones.length > 0) lines.push(`    Recomendaciones: ${e.recomendaciones.join('; ')}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_CONTADOR = `Eres el CONTADOR IA — el asesor de inteligencia empresarial de Importadora Carlitos.
Tu ÚNICO PROPÓSITO es que este negocio gane más dinero y no quiebre.

Hablas en español chileno, directo, sin rodeos. Eres brutalmente honesto pero constructivo.
Eres un contador experto en retail chileno que conoce los márgenes ideales (30-40%), los costos
típicos y las estrategias de pricing para mayoristas.

FORMATO OBLIGATORIO (no uses markdown con **, usa HTML):
- Usa <b> para negritas: <b>producto X</b>
- Usa <i> para cursivas
- Usa emojis generosamente: 📊 💰 🚨 ⚠️ 🏆 📈 💸 🎯 ✅ ❌ 🔥 💡 👥 🛒
- Usa saltos de línea dobles entre secciones
- Encabezados con emoji + texto en <b>: 📊 <b>Resumen del Día</b>
- Listas con emojis: 🔹 item / 🔸 item / ✅ item / ❌ item
- Para tablas usa formato simple con emojis separando columnas

REGLAS ABSOLUTAS:
1. SOLO usa datos reales del CONTEXTO entregado. PROHIBIDO inventar SKUs, nombres, cifras.
2. SIEMPRE calcula el impacto en PESOS ($CLP) de cada recomendación.
3. Recomendaciones ESPECÍFICAS: "sube <b>TOALLA HÚMEDA 3B</b> de $500 a $700" — nunca genéricas.
4. PRIORIZA por impacto financiero. Lo que más dinero genera/salva va primero.
5. Si un producto se vendió bajo costo, alerta y recomienda precio mínimo.
6. Si un producto se vendió mucho y rápido, recomienda subir el precio.
7. Compara con ayer y con el promedio de la semana cuando haya datos.
8. Menciona qué cajera vendió más y cuál necesita mejorar.
9. Sé conciso pero completo. No escribas testamentos.
10. Cuando menciones un producto, incluye su SKU entre corchetes: <b>TOALLA HÚMEDA 3B</b> [IDB779].`

const PROMPT_ANALISIS_PRODUCTOS = `Analiza el rendimiento del día y genera un informe ejecutivo.

REGLA CRÍTICA DE FORMATO:
- Cada vez que menciones un producto, SIEMPRE incluye su SKU entre corchetes: [IDB779]
- El SKU va DESPUÉS del nombre: <b>TOALLA HÚMEDA 3B</b> [IDB779]
- NUNCA menciones un producto sin su SKU entre corchetes. Sin excepciones.
- NO menciones más de 6 productos en todo el informe. Solo los más importantes.
- NO repitas el mismo producto en varias secciones. Cada producto se menciona una sola vez.

Genera:

📊 <b>Resumen del Día</b>
🔹 Total vendido, boletas, ganancia, margen
🔹 Comparación con ayer y tendencia

🏆 <b>Producto Estrella</b>
🔹 El producto que MÁS ganancia dejó (con SKU [IDBxxx])
🔹 El producto que más se vendió en cantidad (con SKU [IDBxxx])
Solo 2 productos aquí, no más.

🚨 <b>Alertas</b>
🔹 Solo si hay productos vendidos bajo costo (con SKU [IDBxxx])
🔹 Solo si hay productos con margen muy bajo (con SKU [IDBxxx])
Si no hay alertas, escribe "✅ Sin alertas, todo en orden".

💰 <b>Recomendaciones de Precio</b>
🔹 Solo 2-3 productos que necesitan ajuste de precio (con SKU [IDBxxx])
🔹 Precio sugerido e impacto $ estimado
Si no hay productos que ajustar, escribe "✅ Precios en orden".

👥 <b>Cajeras</b>
🔹 La que más vendió y su promedio
🔹 Si alguna tiene diferencia de caja sospechosa

📈 <b>Conclusión</b>
🔹 2-3 acciones urgentes para mañana`

// ─── Llamada a Gemini ────────────────────────────────────────────────────────

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const headers = await getGeminiAuthHeaders()
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    system_instruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  })

  let res: Response | null = null
  for (const model of GEMINI_TEXT_MODELS) {
    const url = buildGeminiUrl(model)
    res = await fetch(url, {
      method: 'POST',
      headers,
      body,
    })
    if (res.ok) break
    console.warn(`[IA Contador] Modelo ${model} falló (${res.status}), probando siguiente...`)
  }

  if (!res || !res.ok) {
    const errText = res ? await res.text() : 'Todos los modelos fallaron'
    throw new Error(`Error Gemini: ${res?.status || 503} — ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return text
}

// ─── Análisis público ────────────────────────────────────────────────────────

export interface AnalisisResult {
  texto: string
  snapshot: BusinessSnapshot
  alertas: string[]
  recomendaciones: string[]
}

export async function analizarProductosDelDia(sede: string, fecha: string): Promise<AnalisisResult> {
  // 1. Construir snapshot
  const snap = await buildBusinessSnapshot(sede, fecha)

  // 2. Cargar memoria reciente
  const memoria = await cargarMemoriaReciente(sede, 7)
  const memoriaCtx = memoriaToContexto(memoria)

  // 3. Construir contexto
  const contexto = snapshotToPromptContext(snap)
  const userPrompt = `${PROMPT_ANALISIS_PRODUCTOS}\n\n${contexto}\n${memoriaCtx}`

  // 4. Llamar a Gemini
  const texto = await callGemini(SYSTEM_PROMPT_CONTADOR, userPrompt)

  // 5. Extraer alertas y recomendaciones del texto (simple parseo)
  const alertas: string[] = []
  const recomendaciones: string[] = []

  // Buscar líneas con 🚨 o "Alerta" para alertas
  for (const line of texto.split('\n')) {
    const t = line.trim()
    if (t.includes('🚨') || t.toLowerCase().includes('alerta:') || t.toLowerCase().includes('pérdida')) {
      if (t.length > 10 && t.length < 300) alertas.push(t.replace(/[*#]/g, '').trim())
    }
    if (t.includes('💰') || t.toLowerCase().includes('recomend') || t.toLowerCase().includes('sube') || t.toLowerCase().includes('baja el')) {
      if (t.length > 10 && t.length < 300) recomendaciones.push(t.replace(/[*#]/g, '').trim())
    }
  }

  // 6. Guardar en memoria
  await guardarMemoria({
    fecha,
    sede,
    tipo: 'analisis_productos',
    resumen: texto.slice(0, 500),
    alertas: alertas.slice(0, 10),
    recomendaciones: recomendaciones.slice(0, 10),
  })

  return { texto, snapshot: snap, alertas, recomendaciones }
}

export async function chatContador(sede: string, fecha: string, mensaje: string): Promise<string> {
  const snap = await buildBusinessSnapshot(sede, fecha)
  const memoria = await cargarMemoriaReciente(sede, 7)
  const contexto = snapshotToPromptContext(snap)
  const memoriaCtx = memoriaToContexto(memoria)

  const userPrompt = `CONTEXTO DEL NEGOCIO:\n${contexto}\n${memoriaCtx}\n\n--- PREGUNTA DEL DUEÑO ---\n${mensaje}`

  return callGemini(SYSTEM_PROMPT_CONTADOR, userPrompt)
}
