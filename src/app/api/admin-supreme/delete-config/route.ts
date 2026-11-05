import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/db-server'

const ERP_CONFIG_COLLECTION = 'erp_config'

export async function POST() {
  try {
    const adminDb = getAdminDb()
    await adminDb.collection(ERP_CONFIG_COLLECTION).doc('config').delete()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[admin-supreme/delete-config] error:', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
