import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminDb } from '@/lib/db-server'

const SUPREME_EMAIL = 'dezkonet@gmail.com'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, displayName, photoURL, role, modules, branchSlugs, trabajadorId, createdBy, defaultModule } = body

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Email y contraseña son obligatorios' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }

    // Verificar que el creador sea el admin supremo
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    let creatorEmail = ''
    if (token) {
      try {
        const decoded = await getAuth().verifyIdToken(token)
        creatorEmail = decoded.email || ''
      } catch { /* ignore */ }
    }
    if (creatorEmail !== SUPREME_EMAIL) {
      return NextResponse.json({ ok: false, error: 'Solo el admin supremo puede crear usuarios' }, { status: 403 })
    }

    // Crear usuario en Firebase Auth
    const userRecord = await getAuth().createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: displayName || email.split('@')[0],
      emailVerified: true,
    })

    // Guardar en erp_users
    const docId = email.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')
    const adminDb = getAdminDb()
    await adminDb.collection('erp_users').doc(docId).set({
      email: email.toLowerCase().trim(),
      displayName: displayName || email.split('@')[0],
      photoURL: photoURL || '',
      role: role || 'trabajador',
      modules: modules || ['erp'],
      branchSlugs: branchSlugs || [],
      trabajadorId: trabajadorId || '',
      hasAccount: true,
      createdAt: Date.now(),
      createdBy: creatorEmail,
      uid: userRecord.uid,
      defaultModule: defaultModule || '',
    })

    return NextResponse.json({ ok: true, uid: userRecord.uid })
  } catch (e: any) {
    console.error('[create-user] error:', e)
    const msg = e?.code === 'auth/email-already-exists'
      ? 'Ya existe un usuario con ese email'
      : e?.code === 'auth/invalid-email'
      ? 'Email inválido'
      : e?.code === 'auth/weak-password'
      ? 'Contraseña demasiado débil (mínimo 6 caracteres)'
      : e?.message || 'Error desconocido'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
