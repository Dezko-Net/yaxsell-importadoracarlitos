import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminDb } from '@/lib/db-server'
import { isAdminEmail } from '@/lib/admin-access'
import { modulesForPosAccessLevel, normalizePosAccessLevel, type PosAccessLevel } from '@/lib/posAccessLevels'
import { isSellerCargo, normalizePosSellerRole, type PosSellerRole } from '@/lib/posSellerRoles'
import { workerCanAccessBranch } from '@/lib/posBranchAccess'

export const dynamic = 'force-dynamic'

const norm = (value: unknown) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const docIdForEmail = (email: string) => email.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')
const ROLES = new Set(['Cajera', 'Cajero', 'Vendedora', 'Vendedor'])
const POS_CARGO_NAMES = new Set(['cajera', 'cajero', 'vendedora', 'vendedor'])
function mergePosCargo(cargo: string, current: unknown): string[] {
  const existing = Array.isArray(current) ? current.map(value => String(value || '').trim()).filter(Boolean) : []
  const retained = existing.filter(value => !POS_CARGO_NAMES.has(norm(value)))
  return [cargo, ...retained.filter(value => norm(value) !== norm(cargo))]
}
function genderGroup(value: unknown, role?: unknown): 'mujer' | 'hombre' | null {
  const gender = norm(value)
  if (['mujer', 'femenino', 'female', 'f'].includes(gender)) return 'mujer'
  if (['hombre', 'masculino', 'male', 'm'].includes(gender)) return 'hombre'
  const currentRole = norm(role)
  if (['cajera', 'vendedora'].includes(currentRole)) return 'mujer'
  if (['cajero', 'vendedor'].includes(currentRole)) return 'hombre'
  return null
}
const roleMatchesGender = (role: string, gender: 'mujer' | 'hombre' | null) =>
  gender === 'mujer' ? role === 'Cajera' || role === 'Vendedora'
    : gender === 'hombre' ? role === 'Cajero' || role === 'Vendedor'
      : false

async function authorize(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token)
    const email = String(decoded.email || '').trim().toLowerCase()
    if (isAdminEmail(email)) return { email, isSupreme: true }
    const userId = docIdForEmail(email)
    const snap = await getAdminDb().collection('erp_users').doc(userId).get()
    const user = snap.exists ? snap.data() || {} : {}
    const modules: string[] = Array.isArray(user.modules) ? user.modules : []
    let level = normalizePosAccessLevel(user.nivelAccesoPos, modules.includes('pos_admin'))
    let cargo = String(user.role || '')
    if (user.trabajadorId) {
      const worker = await getAdminDb().collection('trabajadores_erp').doc(String(user.trabajadorId)).get()
      if (worker.exists) {
        const data = worker.data() || {}
        cargo = String(data.cargo || cargo)
        level = isSellerCargo(cargo) ? 'bajo' : normalizePosAccessLevel(data.nivelAccesoPos, data.puedeGestionarCaja)
      }
    } else if (user.displayName) {
      const workerSnap = await getAdminDb().collection('trabajadores_erp').where('nombre', '==', user.displayName).limit(1).get()
      if (!workerSnap.empty) {
        const data = workerSnap.docs[0].data()
        cargo = String(data.cargo || cargo)
        level = isSellerCargo(cargo) ? 'bajo' : normalizePosAccessLevel(data.nivelAccesoPos, data.puedeGestionarCaja)
      }
    }
    // El nivel operativo vigente es la autorización; `modules` puede quedar
    // desactualizado respecto de la ficha del trabajador.
    return !isSellerCargo(cargo) && level === 'alto' ? { email, isSupreme: false, level } : null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Acceso administrativo requerido' }, { status: 401 })
  const sede = String(req.nextUrl.searchParams.get('sede') || '').trim()
  if (!sede) return NextResponse.json({ ok: false, error: 'Indica la sucursal' }, { status: 400 })
  try {
    const db = getAdminDb()
    const [workersSnap, usersSnap] = await Promise.all([
      db.collection('trabajadores_erp').get(),
      db.collection('erp_users').get(),
    ])
    const accounts = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    const workers = workersSnap.docs
      .filter(doc => doc.id !== '_init' && workerCanAccessBranch(doc.data(), sede))
      .filter(doc => /cajer|vended/i.test(String(doc.data().cargo || '')))
      .map(doc => {
        const data = doc.data()
        const account = accounts.find((user: any) => String(user.trabajadorId || '') === doc.id)
          || accounts.find((user: any) => norm(user.displayName) === norm(data.nombre))
        return {
          id: doc.id,
          nombre: String(data.nombre || ''),
          cargo: String(data.cargo || 'Operativo'),
          cargos: Array.isArray(data.cargos) ? data.cargos : [String(data.cargo || 'Operativo')],
          genero: String(data.genero || data.sexo || ''),
          sede: String(data.sede || sede),
          activo: data.activo !== false,
          posActivo: data.posActivo !== false,
          nivelAccesoPos: isSellerCargo(data.cargo) ? 'bajo' : normalizePosAccessLevel(data.nivelAccesoPos, data.puedeGestionarCaja),
          puedeGestionarCaja: isSellerCargo(data.cargo) ? false : (typeof data.puedeGestionarCaja === 'boolean' ? data.puedeGestionarCaja : null),
          rolOperativoPos: isSellerCargo(data.cargo) ? normalizePosSellerRole(data.rolOperativoPos) : undefined,
          rolesAdicionales: isSellerCargo(data.cargo) ? [] : (Array.isArray(data.rolesAdicionales) && data.rolesAdicionales.includes('web') ? ['web'] : []),
          telefono: String(data.telefono || ''),
          fotoUrl: String(data.fotoUrl || ''),
          fechaIngreso: String(data.fechaIngreso || ''),
          emailCuenta: String((account as any)?.email || ''),
          rolCuenta: String((account as any)?.role || ''),
          modulosCuenta: Array.isArray((account as any)?.modules) ? (account as any).modules : [],
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return NextResponse.json({ ok: true, workers })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudo cargar el equipo' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Acceso administrativo requerido' }, { status: 401 })
  try {
    const body = await req.json()
    const nombre = String(body.nombre || '').trim().slice(0, 80)
    const sede = String(body.sede || '').trim()
    const cargo = String(body.cargo || 'Cajera').trim()
    const genero = String(body.genero || '').trim()
    const nivelAccesoPos = isSellerCargo(cargo) ? 'bajo' : normalizePosAccessLevel(body.nivelAccesoPos, false)
    const rolOperativoPos: PosSellerRole | null = isSellerCargo(cargo) ? normalizePosSellerRole(body.rolOperativoPos) : null
    const rolesAdicionales = Array.isArray(body.rolesAdicionales) && body.rolesAdicionales.includes('web') && !isSellerCargo(cargo) ? ['web'] : []
    if (!nombre || !sede) return NextResponse.json({ ok: false, error: 'El nombre y la sucursal son obligatorios' }, { status: 400 })
    if (!ROLES.has(cargo)) return NextResponse.json({ ok: false, error: 'Selecciona un rol válido' }, { status: 400 })
    const gender = genderGroup(genero)
    if (!gender) return NextResponse.json({ ok: false, error: 'Selecciona el sexo del trabajador' }, { status: 400 })
    if (!roleMatchesGender(cargo, gender)) return NextResponse.json({ ok: false, error: 'El rol no corresponde al sexo seleccionado' }, { status: 400 })
    const now = Date.now()
    const ref = await getAdminDb().collection('trabajadores_erp').add({
      nombre, sede, cargo, cargos: [cargo], genero, sueldo: 0, fotoUrl: '', activo: true, posActivo: true,
      puedeGestionarCaja: nivelAccesoPos !== 'bajo', nivelAccesoPos, ...(rolOperativoPos ? { rolOperativoPos } : {}), rolesAdicionales, telefono: '', fechaIngreso: new Date().toISOString().slice(0, 10),
      creadoEn: now, creadoPor: actor.email,
    })
    return NextResponse.json({ ok: true, worker: { id: ref.id, nombre, sede, cargo, genero, activo: true, posActivo: true, puedeGestionarCaja: nivelAccesoPos !== 'bajo', nivelAccesoPos, ...(rolOperativoPos ? { rolOperativoPos } : {}), rolesAdicionales, fechaIngreso: new Date().toISOString().slice(0, 10) } })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudo crear el usuario' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Acceso administrativo requerido' }, { status: 401 })
  try {
    const body = await req.json()
    const id = String(body.id || '').trim()
    if (!id || id === '_init') return NextResponse.json({ ok: false, error: 'Trabajador inválido' }, { status: 400 })
    const ref = getAdminDb().collection('trabajadores_erp').doc(id)
    const current = await ref.get()
    if (!current.exists) return NextResponse.json({ ok: false, error: 'No se encontró el usuario' }, { status: 404 })
    const updates: Record<string, unknown> = { actualizadoEn: Date.now(), actualizadoPor: actor.email }
    if (body.nombre !== undefined) {
      const nombre = String(body.nombre || '').trim().slice(0, 80)
      if (!nombre) return NextResponse.json({ ok: false, error: 'El nombre no puede quedar vacío' }, { status: 400 })
      updates.nombre = nombre
    }
    if (body.cargo !== undefined) {
      const cargo = String(body.cargo || '')
      if (!ROLES.has(cargo)) return NextResponse.json({ ok: false, error: 'Selecciona un rol válido' }, { status: 400 })
      const gender = genderGroup(body.genero ?? current.data()?.genero ?? current.data()?.sexo, current.data()?.cargo)
      if (!roleMatchesGender(cargo, gender)) return NextResponse.json({ ok: false, error: 'El rol no corresponde al sexo del trabajador' }, { status: 400 })
      updates.cargo = cargo
      updates.cargos = mergePosCargo(cargo, current.data()?.cargos || [current.data()?.cargo])
    }
    if (body.activo !== undefined) updates.activo = Boolean(body.activo)
    if (body.posActivo !== undefined) updates.posActivo = Boolean(body.posActivo)
    if (body.puedeGestionarCaja === null || typeof body.puedeGestionarCaja === 'boolean') updates.puedeGestionarCaja = body.puedeGestionarCaja
    let levelForAccount: PosAccessLevel | null = null
    const currentWorker = current.data() || {}
    const targetCargo = String(updates.cargo || currentWorker.cargo || '')
    if (body.rolesAdicionales !== undefined) {
      if (!Array.isArray(body.rolesAdicionales)) return NextResponse.json({ ok: false, error: 'Los roles adicionales no son válidos' }, { status: 400 })
      const rolesAdicionales = [...new Set(body.rolesAdicionales.filter((role: unknown) => role === 'web'))]
      if (rolesAdicionales.length && isSellerCargo(targetCargo)) return NextResponse.json({ ok: false, error: 'El rol Web adicional solo está disponible para cajeros' }, { status: 400 })
      updates.rolesAdicionales = rolesAdicionales
    } else if (body.cargo !== undefined && isSellerCargo(targetCargo)) {
      updates.rolesAdicionales = []
    }
    if (isSellerCargo(targetCargo)) {
      const requestedRole = body.rolOperativoPos === undefined ? currentWorker.rolOperativoPos : body.rolOperativoPos
      if (requestedRole !== undefined && !['ayudante_caja', 'cajero_express'].includes(requestedRole)) {
        return NextResponse.json({ ok: false, error: 'Selecciona una modalidad de vendedor válida' }, { status: 400 })
      }
      const sellerRole = normalizePosSellerRole(requestedRole)
      updates.rolOperativoPos = sellerRole
      updates.nivelAccesoPos = 'bajo'
      updates.puedeGestionarCaja = false
      levelForAccount = 'bajo'
    }
    if (body.nivelAccesoPos !== undefined) {
      if (!['bajo', 'medio', 'alto'].includes(body.nivelAccesoPos)) return NextResponse.json({ ok: false, error: 'Selecciona un nivel de permiso válido' }, { status: 400 })
      levelForAccount = isSellerCargo(targetCargo) ? 'bajo' : body.nivelAccesoPos as PosAccessLevel
      updates.nivelAccesoPos = levelForAccount
      updates.puedeGestionarCaja = levelForAccount !== 'bajo'
    }
    if (body.telefono !== undefined) updates.telefono = String(body.telefono || '').trim().slice(0, 30)
    await ref.update(updates)
    if (levelForAccount) {
      const db = getAdminDb()
      const accountDocs = (await db.collection('erp_users').where('trabajadorId', '==', id).limit(1).get()).docs
      const account = accountDocs[0] || (await db.collection('erp_users').get()).docs.find(doc =>
        norm(doc.data().displayName) === norm(updates.nombre ?? current.data()?.nombre),
      )
      if (account && String(account.data().email || '').toLowerCase() !== 'dezkonet@gmail.com') {
        const modules = modulesForPosAccessLevel(account.data().modules, levelForAccount)
        await account.ref.update({ nivelAccesoPos: levelForAccount, modules, updatedAt: Date.now(), updatedBy: actor.email })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudieron guardar los cambios' }, { status: 500 })
  }
}
