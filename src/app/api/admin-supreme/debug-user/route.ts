import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminDb } from '@/lib/db-server'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ ok: false, error: 'Email requerido' }, { status: 400 })

    const emailLower = email.toLowerCase().trim()
    const results: any = { email: emailLower }

    // 1. Verificar si existe en Firebase Auth
    try {
      const userRecord = await getAuth().getUserByEmail(emailLower)
      results.authExists = true
      results.uid = userRecord.uid
      results.displayName = userRecord.displayName
      results.emailVerified = userRecord.emailVerified
    } catch (e: any) {
      results.authExists = false
      results.authError = e?.code || e?.message
    }

    // 2. Verificar si existe en erp_users
    const docId = emailLower.replace(/[^a-z0-9_-]/g, '_')
    const adminDb = getAdminDb()
    const snap = await adminDb.collection('erp_users').doc(docId).get()
    if (snap.exists) {
      const data = snap.data() as any
      results.erpUserExists = true
      results.erpUserDocId = docId
      results.erpUserData = {
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        modules: data.modules,
        branchSlugs: data.branchSlugs,
        hasAccount: data.hasAccount,
        trabajadorId: data.trabajadorId,
      }
    } else {
      results.erpUserExists = false
      results.erpUserDocId = docId
    }

    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error' }, { status: 500 })
  }
}
