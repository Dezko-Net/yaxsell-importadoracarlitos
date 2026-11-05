import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminDb } from '@/lib/db-server'
import { isAdminEmail } from '@/lib/admin-access'

export const dynamic = 'force-dynamic'

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const docIdForEmail = (email: string) => email.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')
const VALID_CARGOS = new Set([
  'cajero', 'cajera', 'jefe de caja', 'jefe de bodega', 'encargado', 'encargada',
  'bodeguero', 'vendedor', 'vendedora', 'reponedor', 'reponedora', 'custodia', 'web',
])

function normalizeCargos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const roles = value.map(item => String(item || '').trim()).filter(Boolean)
  const unique = new Map<string, string>()
  roles.forEach(role => unique.set(normalize(role), role))
  return [...unique.values()]
}

function managedModulesForCargos(cargos: string[], posActivo = true): string[] {
  const normalized = cargos.map(normalize)
  const modules = new Set<string>()
  if (normalized.some(role => role === 'web')) modules.add('web')
  if (posActivo && normalized.some(role => /^(cajer[oa]|vendedor[oa])$/.test(role))) modules.add('pos')
  return [...modules]
}

function cargoMatchesGender(cargo: string, genderValue: unknown): boolean {
  const gender = normalize(genderValue)
  const role = normalize(cargo)
  if (['mujer', 'femenino', 'female', 'f'].includes(gender)) return !['cajero', 'vendedor'].includes(role)
  if (['hombre', 'masculino', 'male', 'm'].includes(gender)) return !['cajera', 'vendedora'].includes(role)
  return true
}

async function authorize(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token)
    const email = String(decoded.email || '').trim().toLowerCase()
    if (isAdminEmail(email)) return { email }
    const account = await getAdminDb().collection('erp_users').doc(docIdForEmail(email)).get()
    const modules: string[] = Array.isArray(account.data()?.modules) ? account.data()!.modules : []
    return modules.includes('erp') || modules.includes('erp_admin') ? { email } : null
  } catch {
    return null
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Necesitas acceso de administración ERP para cambiar cargos.' }, { status: 401 })

  try {
    const body = await req.json()
    const id = String(body.id || '').trim()
    const cargos = normalizeCargos(body.cargos)
    if (!id || id === '_init') return NextResponse.json({ ok: false, error: 'Trabajador inválido.' }, { status: 400 })
    if (!cargos.length) return NextResponse.json({ ok: false, error: 'Cada persona debe conservar al menos un cargo.' }, { status: 400 })
    if (cargos.length > 8) return NextResponse.json({ ok: false, error: 'Puedes asignar hasta ocho cargos.' }, { status: 400 })

    const db = getAdminDb()
    const workerRef = db.collection('trabajadores_erp').doc(id)
    const workerSnap = await workerRef.get()
    if (!workerSnap.exists) return NextResponse.json({ ok: false, error: 'No se encontró el trabajador.' }, { status: 404 })
    const worker = workerSnap.data() || {}
    const storedCargos = normalizeCargos(worker.cargos)
    const previousCargos = normalizeCargos([
      ...(storedCargos.length ? storedCargos : [String(worker.cargo || '')]),
      ...(Array.isArray(worker.rolesAdicionales) && worker.rolesAdicionales.includes('web') ? ['WEB'] : []),
    ])
    const previousRoleKeys = new Set(previousCargos.map(normalize))
    if (cargos.some(role => !VALID_CARGOS.has(normalize(role)) && !previousRoleKeys.has(normalize(role)))) {
      return NextResponse.json({ ok: false, error: 'Uno o más cargos no son válidos.' }, { status: 400 })
    }
    if (cargos.some(role => !cargoMatchesGender(role, worker.genero || worker.sexo) && !previousRoleKeys.has(normalize(role)))) {
      return NextResponse.json({ ok: false, error: 'Los cargos de cajero/vendedor deben coincidir con el género de la persona.' }, { status: 400 })
    }
    const primaryCargo = cargos.find(role => /^(cajer[oa]|vendedor[oa])$/.test(normalize(role)))
      || cargos.find(role => normalize(role) !== 'web')
      || cargos[0]
    const nextManagedModules = managedModulesForCargos(cargos, worker.posActivo !== false)

    let accountSnap = await db.collection('erp_users').where('trabajadorId', '==', id).limit(1).get()
    if (accountSnap.empty && worker.nombre) {
      accountSnap = await db.collection('erp_users').where('displayName', '==', worker.nombre).limit(1).get()
    }
    const accountDoc = accountSnap.docs[0]
    const batch = db.batch()
    const hasWebRole = cargos.some(role => normalize(role) === 'web')
    batch.update(workerRef, {
      cargo: primaryCargo,
      cargos,
      rolesAdicionales: hasWebRole ? ['web'] : [],
      actualizadoEn: Date.now(),
      actualizadoPor: actor.email,
    })
    if (accountDoc && !isAdminEmail(String(accountDoc.data().email || ''))) {
      const account = accountDoc.data()
      const currentModules: string[] = Array.isArray(account.modules) ? account.modules : []
      const previousManagedModules: string[] = Array.isArray(account.cargoManagedModules)
        ? account.cargoManagedModules
        : managedModulesForCargos(previousCargos, worker.posActivo !== false)
      const nextModules = new Set(currentModules.filter(module => !previousManagedModules.includes(module) || nextManagedModules.includes(module)))
      nextManagedModules.forEach(module => nextModules.add(module))
      batch.update(accountDoc.ref, {
        modules: [...nextModules],
        cargoManagedModules: nextManagedModules,
        updatedAt: Date.now(),
        updatedBy: actor.email,
      })
    }
    await batch.commit()

    return NextResponse.json({ ok: true, cargo: primaryCargo, cargos, modules: nextManagedModules })
  } catch (error: any) {
    console.error('[erp/trabajadores/cargos] error:', error)
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudieron guardar los cargos.' }, { status: 500 })
  }
}
