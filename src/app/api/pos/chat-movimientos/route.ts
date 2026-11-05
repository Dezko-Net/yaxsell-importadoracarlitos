import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminDb } from '@/lib/db-server'
import { isAdminEmail } from '@/lib/admin-access'
import { AI_ENABLED } from '@/lib/feature-flags'
import {
  todaySantiago, extractIntent, resolveProducts, summarizeProduct, composeAnswer,
  type ChatTurn, type ProductSummary,
} from '@/lib/posMovimientosChat'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/pos/chat-movimientos   (SOLO LECTURA)
 * Body: { question: string, history?: [{ role: 'user'|'assistant', text: string }] }
 *
 * Chat para la cajera: responde sobre el movimiento de productos (ventas, ingresos,
 * anulaciones, stock) usando UNICAMENTE `stock_movements` + stock actual del producto.
 * No escribe nada, no expone dinero/costos/clientes.
 */

// ── Autorizacion: mismo criterio que el resto del POS (admin o modulo pos) ───
const accessCache = new Map<string, { ok: boolean; at: number }>()
const ACCESS_TTL_MS = 5 * 60 * 1000

async function authorize(req: NextRequest): Promise<{ email: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token)
    const email = String(decoded.email || '').trim().toLowerCase()
    if (!email) return null
    if (isAdminEmail(email)) return { email }
    const cached = accessCache.get(email)
    if (cached && Date.now() - cached.at < ACCESS_TTL_MS) return cached.ok ? { email } : null
    const userId = email.replace(/[^a-z0-9_-]/g, '_')
    const snap = await getAdminDb().collection('erp_users').doc(userId).get()
    const modules: string[] = snap.exists && Array.isArray(snap.data()?.modules) ? snap.data()!.modules : []
    const ok = modules.some(m => ['pos', 'pos_admin', 'admin_supreme'].includes(m))
    accessCache.set(email, { ok, at: Date.now() })
    return ok ? { email } : null
  } catch {
    return null
  }
}

// ── Limite simple por usuario (protege lecturas y costo de IA) ───────────────
const hits = new Map<string, number[]>()
function rateLimited(email: string): boolean {
  const now = Date.now()
  const recent = (hits.get(email) || []).filter(t => now - t < 60_000)
  if (recent.length >= 20) { hits.set(email, recent); return true }
  recent.push(now)
  hits.set(email, recent)
  return false
}

function cleanHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .slice(-6)
    .map((t: any) => ({ role: t.role as 'user' | 'assistant', text: String(t.text).slice(0, 600) }))
}

export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ ok: false, error: 'No disponible' }, { status: 404 })

  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Sesi\u00f3n POS no autorizada' }, { status: 401 })
  if (rateLimited(actor.email)) {
    return NextResponse.json({ ok: false, error: 'Demasiadas preguntas seguidas. Espera un momento.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const question = String(body?.question || '').trim()
  if (question.length < 2) return NextResponse.json({ ok: false, error: 'Escribe tu pregunta' }, { status: 400 })
  if (question.length > 500) return NextResponse.json({ ok: false, error: 'La pregunta es muy larga' }, { status: 400 })
  const history = cleanHistory(body?.history)

  try {
    const today = todaySantiago()
    const intent = await extractIntent(question, history, today)

    if (intent.tipo === 'otro') {
      return NextResponse.json({
        ok: true,
        answer: 'Solo puedo ayudarte con el movimiento de productos: cu\u00e1ntos se vendieron, ingresos, anulaciones y stock. Por ejemplo: "\u00bfcu\u00e1ntas toallas nocturnas Ladysoft 7pcs se vendieron el viernes?"',
        meta: { productos: [] },
      })
    }

    const { matches, exact } = await resolveProducts(intent.producto)
    if (matches.length === 0) {
      return NextResponse.json({
        ok: true,
        answer: 'No encontr\u00e9 ning\u00fan producto con ese nombre. Prueba escribiendo parte del nombre o el SKU (por ejemplo "ladysoft nocturna 7pcs" o "DB-2H2IQW1V").',
        meta: { productos: [] },
      })
    }

    const summaries: ProductSummary[] = await Promise.all(matches.map(p => summarizeProduct(p, intent.desde, intent.hasta)))
    const answer = await composeAnswer(question, summaries, !exact && matches.length > 1)

    return NextResponse.json({
      ok: true,
      answer,
      meta: {
        desde: intent.desde,
        hasta: intent.hasta,
        productos: summaries.map(s => ({ sku: s.sku, nombre: s.nombre })),
      },
    })
  } catch (err: any) {
    console.error('[pos-chat] error:', err)
    return NextResponse.json({ ok: false, error: 'No pude consultar los movimientos. Intenta de nuevo.' }, { status: 500 })
  }
}
