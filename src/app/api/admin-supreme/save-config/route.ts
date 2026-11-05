import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/db-server'

export const dynamic = 'force-dynamic'

const ERP_CONFIG_COLLECTION = 'erp_config'
const gErpCfg = globalThis as unknown as {
  __yaxsellErpConfigCache?: { data: string; time: number } | null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data } = body as { data: string }

    if (!data) {
      return NextResponse.json({ ok: false, error: 'Missing data' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    await adminDb.collection(ERP_CONFIG_COLLECTION).doc('config').set({
      docId: 'config',
      data,
      updatedAt: Date.now(),
    }, { merge: true })

    // Sincronizar también en config_pos/empresa si viene empresa en el payload
    try {
      const parsed = JSON.parse(data)
      if (parsed.empresa) {
        await adminDb.collection('config_pos').doc('empresa').set(parsed.empresa, { merge: true })
      }
    } catch {}

    gErpCfg.__yaxsellErpConfigCache = { data, time: Date.now() }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[admin-supreme/save-config] error:', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
