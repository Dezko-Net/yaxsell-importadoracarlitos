import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { Filter, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminApp, getAdminDb } from '@/lib/db-server'
import { isAdminEmail } from '@/lib/admin-access'
import { workerCanAccessBranch, matchBranchSlug } from '@/lib/posBranchAccess'
import { getChileDayBounds, shiftDateStr } from '@/lib/chileDate'
import { getSalePagos, getSaleEfectivoNeto } from '@/lib/posSalePayments'

export const dynamic = 'force-dynamic'

const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const safeJson = (value: unknown) => { try { return JSON.parse(String(value || '[]')) } catch { return [] } }
const dateChile = (ts: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ts))
const timeChile = (ts: number) => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ts))
const ownerIdFor = (sede: string, cajeroId: string) => `active_${sede}_${String(cajeroId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')}`

const POS_AUTH_TTL = 5 * 60 * 1000
const WORKER_CASH_PERM_TTL = 10 * 60 * 1000
const gPosCash = globalThis as unknown as {
  __yaxsellPosCashAuth?: Map<string, { actor: any; time: number }>
  __yaxsellPosWorkerCashPerm?: Map<string, { allowed: boolean; time: number }>
}
if (!gPosCash.__yaxsellPosCashAuth) gPosCash.__yaxsellPosCashAuth = new Map()
if (!gPosCash.__yaxsellPosWorkerCashPerm) gPosCash.__yaxsellPosWorkerCashPerm = new Map()

async function authorize(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token)
    const email = String(decoded.email || '').trim().toLowerCase()
    if (isAdminEmail(email)) return { email, name: email, isSupreme: true, nivelAcceso: 'alto' as const }
    const cached = gPosCash.__yaxsellPosCashAuth!.get(email)
    if (cached && Date.now() - cached.time < POS_AUTH_TTL) return cached.actor
    const userId = email.replace(/[^a-z0-9_-]/g, '_')
    const db = getAdminDb()
    const snap = await db.collection('erp_users').doc(userId).get()
    const uData = snap.exists ? snap.data() : null
    let rawLevel = uData?.nivelAccesoPos
    let trabajadorId = uData?.trabajadorId
    if (!trabajadorId && email) {
      const match = await db.collection('trabajadores_erp').where('email', '==', email).limit(1).get()
      if (!match.empty) trabajadorId = match.docs[0].id
    }
    if (trabajadorId) {
      try {
        const trabSnap = await db.collection('trabajadores_erp').doc(trabajadorId).get()
        if (trabSnap.exists) {
          const trabData = trabSnap.data()
          if (trabData?.nivelAccesoPos) rawLevel = trabData.nivelAccesoPos
        }
      } catch {}
    }
    const resolvedLevel = rawLevel === 'alto' ? 'alto' : rawLevel === 'medio' ? 'medio' : 'bajo'
    const modules: string[] = Array.isArray(uData?.modules) ? uData!.modules : []
    if (!modules.some(module => ['pos_admin', 'admin_supreme', 'pos'].includes(module)) && resolvedLevel === 'bajo' && !uData?.role) {
      return null
    }
    const actor = {
      email,
      name: String(uData?.displayName || email),
      isSupreme: false,
      nivelAcceso: resolvedLevel,
    }
    gPosCash.__yaxsellPosCashAuth!.set(email, { actor, time: Date.now() })
    return actor
  } catch { return null }
}

function sessionSummary(session: any, sales: any[]) {
  const completed = sales.filter(sale => String(sale.estado || 'completada') === 'completada')
  const payments = completed.flatMap(sale => getSalePagos(sale))
  const efectivo = completed.reduce((sum, sale) => sum + getSaleEfectivoNeto(sale), 0)
  const debito = payments.filter(p => p.metodo === 'debito').reduce((sum, p) => sum + p.monto, 0)
  const transferencia = payments.filter(p => p.metodo === 'transferencia').reduce((sum, p) => sum + p.monto, 0)
  const vueltos = completed.reduce((sum, sale) => sum + num(sale.vuelto), 0)
  const gastos = Array.isArray(session.gastosItems) ? session.gastosItems : safeJson(session.gastosItemsJson)
  const gastosTotal = gastos.reduce((sum: number, item: any) => sum + num(item.monto), 0)
  const returns = safeJson(session.devolucionesPosItemsJson)
  const returnsTotal = returns.reduce((sum: number, item: any) => sum + num(item.total), 0)
  const returnsCash = num(session.devolucionesPosEfectivo)
  const opening = num(session.montoApertura)
  return {
    ventasCount: completed.length,
    totalVentas: Math.max(0, completed.reduce((sum, sale) => sum + num(sale.total), 0) - returnsTotal),
    totalEfectivo: efectivo,
    totalDebito: debito,
    totalTransferencia: transferencia,
    totalVueltos: vueltos,
    gastosItems: gastos,
    gastos: gastosTotal,
    devolucionesItems: returns.map((item: any) => ({ tipo: 'devolucion', monto: num(item.total), detalle: item.reason || 'Devolución POS', boletaNumero: item.boletaNumero || '' })),
    totalDevoluciones: returnsTotal,
    efectivoTeorico: opening + efectivo - gastosTotal - returnsCash,
  }
}

async function getSessionSales(db: Firestore, sessionId: string, targetDate?: string) {
  const sessionQuery = db.collection('ventas_pos').where('sesionCajaId', '==', sessionId)
  let snap
  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    const bounds = getChileDayBounds(targetDate)
    const nextDate = shiftDateStr(targetDate, 1)
    try {
      // One indexed OR query covers current rows and both legacy timestamp
      // fallbacks while returning a sale only once.
      snap = await sessionQuery.where(Filter.or(
        Filter.and(Filter.where('fechaStr', '>=', targetDate), Filter.where('fechaStr', '<', nextDate)),
        Filter.and(Filter.where('fechaTs', '>=', bounds.start), Filter.where('fechaTs', '<', bounds.end)),
        Filter.and(Filter.where('createdAtTs', '>=', bounds.start), Filter.where('createdAtTs', '<', bounds.end)),
      )).get()
    } catch (error) {
      // Missing indexes must not change cash totals; use the previous exact
      // session scan until Firestore finishes deploying the new indexes.
      console.warn('[pos/cash-management] Consulta de ventas por día no disponible; usando sesión completa:', error)
      snap = await sessionQuery.limit(1500).get()
    }
  } else {
    snap = await sessionQuery.limit(1500).get()
  }
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

// Solo para la vista administrativa: compartir solicitudes simultáneas de
// una sesión. El cierre siempre consulta ventas directamente sin esta caché.
const sessionSalesInFlight = new Map<string, Promise<any[]>>()
async function getSessionSalesForView(db: Firestore, sessionId: string, targetDate: string) {
  const cacheKey = `${sessionId}:${targetDate}`
  const existing = sessionSalesInFlight.get(cacheKey)
  if (existing) return existing
  const pending = getSessionSales(db, sessionId, targetDate)
  sessionSalesInFlight.set(cacheKey, pending)
  try {
    return await pending
  } finally {
    if (sessionSalesInFlight.get(cacheKey) === pending) sessionSalesInFlight.delete(cacheKey)
  }
}

function salesForChileDate(sales: any[], targetDate: string) {
  return sales.filter(sale => {
    const storedDate = String(sale.fechaStr || '').slice(0, 10)
    if (storedDate) return storedDate === targetDate
    const timestamp = num(sale.fechaTs || sale.createdAtTs)
    return timestamp > 0 && dateChile(timestamp) === targetDate
  })
}

async function canManageCashForSession(db: Firestore, session: any, sede: string) {
  const workerId = String(session.cajeroId || '').trim()
  const cajeroNombre = String(session.cajeroNombre || '').trim()
  const permKey = `${workerId}::${cajeroNombre.toLowerCase()}::${sede}`
  const cachedPerm = gPosCash.__yaxsellPosWorkerCashPerm!.get(permKey)
  if (cachedPerm && Date.now() - cachedPerm.time < WORKER_CASH_PERM_TTL) {
    return cachedPerm.allowed
  }

  const workers = db.collection('trabajadores_erp')
  let workerData: any = null

  if (workerId) {
    const workerSnap = await workers.doc(workerId).get()
    if (workerSnap.exists) workerData = workerSnap.data() || null
  }

  // Las sesiones antiguas a veces no guardaban el ID de trabajador correcto.
  // Solo usamos el nombre como respaldo cuando identifica a una sola persona.
  if (!workerData && cajeroNombre) {
    const matches = await workers.where('nombre', '==', cajeroNombre).limit(2).get()
    const sameBranch = matches.docs.filter(doc => !String(doc.data().sede || sede) || String(doc.data().sede || sede) === sede)
    if (sameBranch.length === 1) workerData = sameBranch[0].data()
  }

  if (!workerData || !workerCanAccessBranch(workerData, sede)) {
    gPosCash.__yaxsellPosWorkerCashPerm!.set(permKey, { allowed: false, time: Date.now() })
    return false
  }
  const cargo = String(workerData.cargo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const isCashier = cargo.includes('cajer') || Boolean(workerData.puedeGestionarCaja)
  const isExpressSeller = cargo.includes('vended') && workerData.rolOperativoPos === 'cajero_express' && Boolean(workerData.puedeGestionarCaja)
  const allowed = isCashier || isExpressSeller
  gPosCash.__yaxsellPosWorkerCashPerm!.set(permKey, { allowed, time: Date.now() })
  return allowed
}

export async function GET(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Acceso administrativo requerido' }, { status: 401 })
  const sede = String(req.nextUrl.searchParams.get('sede') || '').trim()
  if (!sede) return NextResponse.json({ ok: false, error: 'Indica la sucursal' }, { status: 400 })
  try {
    const db = getAdminDb()
    const sessionsCol = db.collection('caja_sesiones')
    let recentSessionsSnap: any
    let openSessionDocs: QueryDocumentSnapshot[]
    let sessionDocumentsRead = 0
    let sessionFallback = false
    try {
      recentSessionsSnap = await sessionsCol.where('sede', '==', sede).orderBy('aperturaAtTs', 'desc').limit(150).get()
      sessionDocumentsRead += recentSessionsSnap.size
      const openSnap = await sessionsCol.where('sede', '==', sede).where('estado', '==', 'abierta').get()
      openSessionDocs = openSnap.docs
      sessionDocumentsRead += openSnap.size
    } catch (indexError) {
      console.warn('[pos/cash-management] Índice de sesiones acotadas pendiente; usando límite legado:', indexError)
      recentSessionsSnap = await sessionsCol.where('sede', '==', sede).limit(300).get()
      openSessionDocs = recentSessionsSnap.docs.filter((doc: QueryDocumentSnapshot) => doc.data().estado === 'abierta')
      sessionDocumentsRead = recentSessionsSnap.size
      sessionFallback = true
    }
    // La pantalla necesita todas las sesiones abiertas (incluidas las antiguas)
    // y cierres recientes. Ya no descarga hasta 300 sesiones cerradas antiguas.
    const sessionDocMap = new Map<string, QueryDocumentSnapshot>()
    for (const doc of [...openSessionDocs, ...recentSessionsSnap.docs]) sessionDocMap.set(doc.id, doc)
    const sessionDocs = [...sessionDocMap.values()]
    let salesDocumentsRead = 0
    let workersDocumentsRead = 0

    const activePointers = new Map<string, string>()
    openSessionDocs.forEach(doc => {
      if (doc.id.startsWith(`active_${sede}_`)) {
        const d = doc.data()
        if (d.sessionId && d.estado === 'abierta') {
          const cid = String(d.cajeroId || doc.id.slice(`active_${sede}_`.length))
          activePointers.set(cid, String(d.sessionId))
        }
      }
    })

    const sessions = sessionDocs
      .filter(doc => !doc.id.startsWith('active_') || !String(doc.data().sessionId || '') || String(doc.data().sessionId) === doc.id)
      .map(doc => ({ id: String(doc.data().sessionId || doc.id), docId: doc.id, ...doc.data() }))
    const unique = new Map<string, any>()
    for (const session of sessions) unique.set(session.id, session)
    const today = dateChile(Date.now())
    const ordered = [...unique.values()].sort((a, b) => num(b.aperturaAtTs) - num(a.aperturaAtTs))
    const withSummary = await Promise.all(ordered.slice(0, 120).map(async session => {
      if (session.estado !== 'abierta') return session
      const sales = await getSessionSalesForView(db, session.id, today)
      salesDocumentsRead += sales.length
      return { ...session, resumenActual: sessionSummary(session, salesForChileDate(sales, today)) }
    }))

    // Deduplicar: si un cajero tiene múltiples sesiones abiertas en la misma fecha (por doble clic previo),
    // mantener la activa (con puntero o con ventas) y descartar las vacías para no ensuciar la pantalla administrativa.
    const seenCajeroOpen = new Set<string>()
    const sanitized = withSummary.filter(session => {
      if (session.estado !== 'abierta') return true
      const cajeroKey = String(session.cajeroId || session.cajeroNombre || '').trim().toLowerCase()
      if (!cajeroKey) return true
      const pointerTarget = activePointers.get(cajeroKey) || activePointers.get(String(session.cajeroId || ''))
      const hasSales = (session.resumenActual?.ventasCount || 0) > 0
      const isPointerActive = pointerTarget ? session.id === pointerTarget : true
      if (seenCajeroOpen.has(cajeroKey)) {
        if (!hasSales && !isPointerActive) return false
      }
      seenCajeroOpen.add(cajeroKey)
      return true
    })

    // ─── Ventas pasadas por vendedores a cajeras ───
    const targetDate = String(req.nextUrl.searchParams.get('fecha') || '').trim() || today
    const datesToQuery = new Set<string>([today, targetDate])
    // Solo las sesiones con resumen activo usan ventas pendientes por fecha.
    // Los cierres históricos no participan en esa asociación.
    sanitized.filter(s => Boolean(s.resumenActual)).forEach(s => {
      const f = String(s.fechaStr || (s.aperturaAtTs ? dateChile(s.aperturaAtTs) : '')).trim()
      if (f) datesToQuery.add(f)
    })

    let pendingDocs: any[] = []
    try {
      const datesArr = [...datesToQuery].filter(Boolean)
      const pRef = db.collection('pos_ventas_pendientes').where('sede', '==', sede)
      const pSnap = datesArr.length === 1
        ? await pRef.where('fechaStr', '==', datesArr[0]).get()
        : datesArr.length <= 10
          ? await pRef.where('fechaStr', 'in', datesArr).get()
          : await pRef.limit(400).get()
      pendingDocs = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    } catch (pErr) {
      console.warn('Error al cargar pos_ventas_pendientes en cash-management:', pErr)
    }

    const workerPhotos = new Map<string, string>()
    const workerCargos = new Map<string, string>()
    try {
      const relevantPending = pendingDocs.filter(vp => vp.estado === 'completada' || vp.estado === 'aceptada')
      const workerIds = new Set<string>()
      const workerNames = new Set<string>()
      sanitized.filter(session => Boolean(session.resumenActual)).forEach(session => {
        const id = String(session.cajeroId || '').trim()
        const name = String(session.cajeroNombre || '').trim()
        if (id && !id.includes('/')) workerIds.add(id)
        if (name) workerNames.add(name)
      })
      relevantPending.forEach(vp => {
        const id = String(vp.enviadoPorId || vp.vendedoraId || '').trim()
        const name = String(vp.enviadoPorNombre || vp.vendedoraNombre || '').trim()
        if (id && !id.includes('/')) workerIds.add(id)
        if (name) workerNames.add(name)
      })

      const workers = db.collection('trabajadores_erp')
      const workerDocs = new Map<string, Record<string, any>>()
      const ids = [...workerIds]
      if (ids.length) {
        const snapshots = await db.getAll(...ids.map(id => workers.doc(id)))
        workersDocumentsRead += snapshots.length
        snapshots.forEach(snapshot => {
          if (snapshot.exists) workerDocs.set(snapshot.id, snapshot.data() || {})
        })
      }

      // El nombre solo se consulta para referencias heredadas sin ID. `in`
      // limita cada petición a 30 valores, evitando leer toda la colección.
      const idNames = new Set([...workerDocs.values()].map(worker => String(worker.nombre || '').trim().toLowerCase()).filter(Boolean))
      const namesWithoutId = [...workerNames].filter(name => !idNames.has(name.toLowerCase()))
      for (let offset = 0; offset < namesWithoutId.length; offset += 30) {
        const chunk = namesWithoutId.slice(offset, offset + 30)
        if (!chunk.length) continue
        const matches = await workers.where('nombre', 'in', chunk).get()
        workersDocumentsRead += matches.size
        matches.docs.forEach(doc => workerDocs.set(doc.id, doc.data() || {}))
      }

      workerDocs.forEach((d, id) => {
        if (d.nombre) {
          const key = String(d.nombre).trim().toLowerCase()
          if (d.fotoUrl) workerPhotos.set(key, String(d.fotoUrl))
          if (d.cargo) workerCargos.set(key, String(d.cargo))
        }
        if (d.fotoUrl) workerPhotos.set(id, String(d.fotoUrl))
        if (d.cargo) workerCargos.set(id, String(d.cargo))
      })
    } catch (wErr) {
      console.warn('Error cargando referencias de trabajadores para cash-management:', wErr)
    }

    // Asociar a cada sesión de caja las ventas que le pasaron los vendedores
    sanitized.forEach(session => {
      if (!session.resumenActual) return
      const sCajeroName = String(session.cajeroNombre || '').trim().toLowerCase()
      const sDate = String(session.fechaStr || (session.aperturaAtTs ? dateChile(session.aperturaAtTs) : today)).trim()

      const cashierPending = pendingDocs.filter(vp => {
        const isCompleted = vp.estado === 'completada' || vp.estado === 'aceptada'
        if (!isCompleted) return false
        const matchCashier = String(vp.cajeraNombre || '').trim().toLowerCase() === sCajeroName
        if (!matchCashier) return false
        const vpDate = String(vp.fechaStr || (vp.creadoAtTs ? dateChile(vp.creadoAtTs) : '')).trim()
        return vpDate === sDate || (!vpDate && vp.completadaEnTs && dateChile(vp.completadaEnTs) === sDate)
      })

      const vendorMap = new Map<string, { id: string; nombre: string; cargo: string; fotoUrl: string; count: number; total: number }>()
      cashierPending.forEach(vp => {
        const vName = String(vp.enviadoPorNombre || vp.vendedoraNombre || 'Vendedor').trim()
        const vId = String(vp.enviadoPorId || vp.vendedoraId || '').trim()
        const vKey = vName.toLowerCase()
        const photo = vp.enviadoPorFoto || workerPhotos.get(vKey) || workerPhotos.get(vId) || ''
        const cargo = workerCargos.get(vKey) || workerCargos.get(vId) || 'Vendedor'
        const amount = num(vp.total)

        if (!vendorMap.has(vKey)) {
          vendorMap.set(vKey, { id: vId, nombre: vName, cargo, fotoUrl: photo, count: 0, total: 0 })
        }
        const entry = vendorMap.get(vKey)!
        entry.count += 1
        entry.total += amount
      })

      session.resumenActual.vendedoresPasaron = [...vendorMap.values()].sort((a, b) => b.count - a.count)
    })

    // Calcular ranking global de vendedores que pasaron ventas (del día consultado)
    const topVendorsMap = new Map<string, {
      id: string
      nombre: string
      cargo: string
      fotoUrl: string
      ventasCount: number
      totalVendido: number
      cajerasMap: Map<string, { count: number; total: number }>
    }>()

    pendingDocs.forEach(vp => {
      const isCompleted = vp.estado === 'completada' || vp.estado === 'aceptada'
      if (!isCompleted) return
      const vpDate = String(vp.fechaStr || (vp.creadoAtTs ? dateChile(vp.creadoAtTs) : '')).trim()
      if (vpDate !== targetDate && vpDate !== today) return

      const vName = String(vp.enviadoPorNombre || vp.vendedoraNombre || 'Vendedor').trim()
      const vId = String(vp.enviadoPorId || vp.vendedoraId || '').trim()
      const cName = String(vp.cajeraNombre || 'Cajera').trim()
      const vKey = vName.toLowerCase()
      const photo = vp.enviadoPorFoto || workerPhotos.get(vKey) || workerPhotos.get(vId) || ''
      const cargo = workerCargos.get(vKey) || workerCargos.get(vId) || 'Vendedor'
      const amount = num(vp.total)

      if (!topVendorsMap.has(vKey)) {
        topVendorsMap.set(vKey, {
          id: vId,
          nombre: vName,
          cargo,
          fotoUrl: photo,
          ventasCount: 0,
          totalVendido: 0,
          cajerasMap: new Map(),
        })
      }
      const vEntry = topVendorsMap.get(vKey)!
      vEntry.ventasCount += 1
      vEntry.totalVendido += amount

      if (!vEntry.cajerasMap.has(cName)) {
        vEntry.cajerasMap.set(cName, { count: 0, total: 0 })
      }
      const cEntry = vEntry.cajerasMap.get(cName)!
      cEntry.count += 1
      cEntry.total += amount
    })

    const topVendedores = [...topVendorsMap.values()]
      .map(v => ({
        id: v.id,
        nombre: v.nombre,
        cargo: v.cargo,
        fotoUrl: v.fotoUrl,
        ventasCount: v.ventasCount,
        totalVendido: v.totalVendido,
        ticketPromedio: v.ventasCount > 0 ? Math.round(v.totalVendido / v.ventasCount) : 0,
        cajerasDesglose: [...v.cajerasMap.entries()]
          .map(([cajeraNombre, data]) => ({ cajeraNombre, count: data.count, total: data.total }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.ventasCount - a.ventasCount)

    console.info('[pos/cash-management] documentos consultados', {
      sessions: sessionDocumentsRead,
      uniqueSessions: sessionDocs.length,
      sessionFallback,
      sales: salesDocumentsRead,
      pending: pendingDocs.length,
      workers: workersDocumentsRead,
    })
    return NextResponse.json({ ok: true, sessions: sanitized, topVendedores })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudieron cargar las cajas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Acceso administrativo requerido' }, { status: 401 })
  try {
    const body = await req.json()
    const action = String(body.action || '')
    const sede = String(body.sede || '').trim()
    const sessionId = String(body.sessionId || '').trim()
    const db = getAdminDb()
    if (!sede || !sessionId || !['close', 'reopen'].includes(action)) return NextResponse.json({ ok: false, error: 'Solicitud incompleta' }, { status: 400 })
    const sessionRef = db.collection('caja_sesiones').doc(sessionId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists) return NextResponse.json({ ok: false, error: 'No se encontró esa sesión de caja' }, { status: 404 })
    const session = sessionSnap.data() || {}
    if (!matchBranchSlug(session.sede || '', sede)) return NextResponse.json({ ok: false, error: 'La caja pertenece a otra sucursal' }, { status: 403 })
    if (!await canManageCashForSession(db, session, sede)) {
      return NextResponse.json({ ok: false, error: 'Solo los cajeros y vendedores con rol Cajero express pueden cerrar o reabrir cajas. Verifica el perfil en Usuarios y roles.' }, { status: 403 })
    }

    if (action === 'close') {
      if (session.estado !== 'abierta') return NextResponse.json({ ok: false, error: 'La caja ya está cerrada' }, { status: 409 })
      const efectivoReal = Math.round(num(body.efectivoReal))
      const observacion = String(body.observacion || '').trim().slice(0, 500)
      if (efectivoReal < 0) return NextResponse.json({ ok: false, error: 'Ingresa un efectivo real válido' }, { status: 400 })
      const gastoAdicional = Math.max(0, Math.round(num(body.gastoAdicional)))
      const detalleGastoAdicional = String(body.detalleGastoAdicional || '').trim().slice(0, 120)
      if (gastoAdicional > 0 && !detalleGastoAdicional) return NextResponse.json({ ok: false, error: 'Describe el gasto adicional que informó la cajera.' }, { status: 400 })
      const now = Date.now()
      const fecha = dateChile(now)
      const sales = salesForChileDate(await getSessionSales(db, sessionId, fecha), fecha)
      const summary = sessionSummary(session, sales)
      if (gastoAdicional > 0) {
        summary.gastosItems.push({ monto: gastoAdicional, detalle: detalleGastoAdicional, usuario: actor.name, createdAtTs: Date.now(), origen: 'cierre_administrativo' })
        summary.gastos += gastoAdicional
        summary.efectivoTeorico -= gastoAdicional
      }
      const diferencia = efectivoReal - summary.efectivoTeorico
      const corteRef = db.collection('cortes_caja').doc(`corte_${sessionId}`)
      const ownerId = String(session.cajeroId || (sessionId.startsWith(`active_${sede}_`) ? sessionId.slice(`active_${sede}_`.length) : ''))
      const pointerRef = ownerId ? db.collection('caja_sesiones').doc(ownerId.startsWith('active_') ? ownerId : ownerIdFor(sede, ownerId)) : null
      const auditoriaRef = db.collection('caja_auditoria').doc()
      let cierre: any = null
      await db.runTransaction(async transaction => {
        const [currentSnap, existingCorte, pointerSnap] = await Promise.all([
          transaction.get(sessionRef), transaction.get(corteRef), pointerRef ? transaction.get(pointerRef) : Promise.resolve(null),
        ])
        if (!currentSnap.exists || currentSnap.data()?.estado !== 'abierta') throw new Error('La caja ya no está abierta. Actualiza la página.')
        if (existingCorte.exists) throw new Error('Ya existe un corte para esta sesión. No se duplicó el cierre.')
        const timestamp = new Date(now)
        cierre = {
          id: corteRef.id, sesionCajaId: sessionId, sede, cajeroNombre: String(session.cajeroNombre || 'Cajera'),
          aperturaAt: num(session.aperturaAtTs), aperturaAtTs: num(session.aperturaAtTs), cierreAtTs: now,
          fechaStr: fecha, fechaCierreStr: timestamp.toLocaleDateString('es-CL'), horaCierreStr: timeChile(now),
          montoApertura: num(session.montoApertura), ventasCount: summary.ventasCount, totalVentas: summary.totalVentas,
          totalEfectivo: summary.totalEfectivo, totalDebito: summary.totalDebito, totalTransferencia: summary.totalTransferencia,
          totalVueltos: summary.totalVueltos, efectivoTeorico: summary.efectivoTeorico, efectivoReal, gastos: summary.gastos,
          gastosItems: summary.gastosItems, gastosItemsJson: JSON.stringify(summary.gastosItems),
          devolucionesItems: summary.devolucionesItems, totalDevoluciones: summary.totalDevoluciones,
          diferencia, observacionAdmin: observacion, cerradoPor: actor.email, cierreManual: true,
        }
        transaction.create(corteRef, cierre)
        transaction.update(sessionRef, {
          estado: 'cerrada', cierreAtTs: now, cierreAt: now, cierrePor: actor.email,
          cierrePorNombre: actor.name, montoCierre: efectivoReal, ventasCount: summary.ventasCount,
          totalVentas: summary.totalVentas, totalEfectivo: summary.totalEfectivo,
          totalDebito: summary.totalDebito, totalTransferencia: summary.totalTransferencia,
          totalGastos: summary.gastos,
        })
        if (pointerRef && pointerRef.path !== sessionRef.path && pointerSnap?.exists && String(pointerSnap.data()?.sessionId || '') === sessionId) {
          transaction.update(pointerRef, { estado: 'cerrada', cierreAtTs: now, cierreAt: now, cierrePor: actor.email, cierrePorNombre: actor.name, montoCierre: efectivoReal })
        }
        transaction.create(auditoriaRef, { action: 'close', sede, sessionId, actor: actor.email, actorName: actor.name, efectivoReal, observacion, createdAtTs: now })
      })
      return NextResponse.json({ ok: true, corte: cierre })
    }

    if (action === 'reopen') {
      if (!actor.isSupreme && actor.nivelAcceso !== 'alto') {
        return NextResponse.json({
          ok: false,
          error: 'Solo personal con permiso de nivel Alto o Administrador puede reabrir o reanudar una caja.'
        }, { status: 403 })
      }

      if (session.estado !== 'cerrada') return NextResponse.json({ ok: false, error: 'Solo se puede reabrir una caja cerrada' }, { status: 409 })
      const observacion = String(body.observacion || '').trim().slice(0, 500)
      let cajeroId = String(session.cajeroId || '')
      if (!cajeroId && sessionId.startsWith(`active_${sede}_`)) cajeroId = sessionId.slice(`active_${sede}_`.length)
      if (!cajeroId) return NextResponse.json({ ok: false, error: 'Esta caja antigua no tiene identificador de cajera. No puedo reabrirla sin riesgo de asignarla a otra persona.' }, { status: 409 })
      const pointerRef = db.collection('caja_sesiones').doc(ownerIdFor(sede, cajeroId))
      const corteRef = db.collection('cortes_caja').doc(`corte_${sessionId}`)
      const fechaStr = session.fechaStr || dateChile(num(session.aperturaAtTs) || Date.now())
      const cuadreRef = db.collection('cuadres_erp').doc(`${sede}__${fechaStr}`)
      const now = Date.now()

      await db.runTransaction(async transaction => {
        const [sourceSnap, pointerSnap, corteSnap, cuadreSnap] = await Promise.all([
          transaction.get(sessionRef),
          transaction.get(pointerRef),
          transaction.get(corteRef),
          transaction.get(cuadreRef),
        ])

        if (!sourceSnap.exists || sourceSnap.data()?.estado !== 'cerrada') {
          throw new Error('La caja cambió de estado o ya está abierta. Actualiza la lista.')
        }

        const existingPointer = pointerSnap.exists ? pointerSnap.data() : null
        if (existingPointer && existingPointer.estado === 'abierta' && String(existingPointer.sessionId || '') !== sessionId) {
          throw new Error(`La cajera ${session.cajeroNombre || ''} ya tiene otra caja abierta actualmente (${existingPointer.sessionId}). Debe cerrarla antes de reanudar esta.`)
        }

        // 1. Anular el corte previo en cortes_caja
        if (corteSnap.exists) {
          transaction.update(corteRef, {
            anulado: true,
            estado: 'anulado',
            motivoAnulacion: `Caja reanudada por ${actor.name}${observacion ? `: ${observacion}` : ''}`,
            anuladoAtTs: now,
            anuladoPor: actor.email,
            anuladoPorNombre: actor.name,
          })
        }

        // 2. Revertir registro en cuadres_erp (quitar a la cajera de cajerosListos para que continúe la jornada)
        if (cuadreSnap.exists) {
          const cData = cuadreSnap.data() || {}
          const cajeroKey = String(session.cajeroNombre || '').trim()
          const cajerosListos = Array.isArray(cData.cajerosListos)
            ? cData.cajerosListos.filter((c: string) => c.trim() !== cajeroKey)
            : []
          const montosPorCajera = { ...(cData.montosPorCajera || {}) }
          if (montosPorCajera[cajeroKey]) {
            const row = { ...montosPorCajera[cajeroKey] }
            const sIds = Array.isArray(row.sessionIds) ? row.sessionIds.filter((id: string) => id !== sessionId) : []
            if (sIds.length === 0) {
              delete montosPorCajera[cajeroKey]
            } else {
              row.sessionIds = sIds
              montosPorCajera[cajeroKey] = row
            }
          }
          const remainingRows = Object.values(montosPorCajera)
          const efectivoSistema = remainingRows.reduce((sum: number, r: any) => sum + num(r.efectivo), 0)
          const efectivoRealTot = remainingRows.reduce((sum: number, r: any) => sum + num(r.efectivoReal), 0)
          const debitoTot = remainingRows.reduce((sum: number, r: any) => sum + num(r.debito), 0)
          const transTot = remainingRows.reduce((sum: number, r: any) => sum + num(r.transferencia), 0)
          const totalBrutoTot = remainingRows.reduce((sum: number, r: any) => sum + num(r.totalBruto), 0)
          const difTot = remainingRows.reduce((sum: number, r: any) => sum + num(r.diferencia), 0)

          transaction.update(cuadreRef, {
            cajerosListos,
            montosPorCajera,
            totalBruto: totalBrutoTot,
            efectivoSistema,
            efectivoReal: efectivoRealTot,
            debitoSistema: debitoTot,
            transferencias: transTot,
            diferenciaTotal: difTot,
            updatedAt: new Date().toISOString(),
          })
        }

        // 3. Reanudar la misma sesión en caja_sesiones, conservando ventas, gastos y apertura intactos
        const sessionUpdate = {
          estado: 'abierta',
          cierreAtTs: null,
          cierreAt: null,
          montoCierre: null,
          cierrePor: '',
          cierrePorNombre: '',
          corteAnteriorAnulado: true,
          reanudadaAtTs: now,
          reanudadaAt: now,
          reanudadaPor: actor.email,
          reanudadaPorNombre: actor.name,
          reaperturaObservacion: observacion || 'Reanudación de caja',
        }
        transaction.update(sessionRef, sessionUpdate)

        // 4. Actualizar el puntero activo de la cajera en caja_sesiones
        transaction.set(pointerRef, {
          ...session,
          ...sessionUpdate,
          sessionId,
        }, { merge: true })

        // 5. Registrar en auditoría
        const auditRef = db.collection('caja_auditoria').doc()
        transaction.create(auditRef, {
          action: 'reopen',
          sede,
          sessionId,
          actor: actor.email,
          actorName: actor.name,
          observacion,
          createdAtTs: now,
          detalle: `Caja de ${session.cajeroNombre} reanudada por ${actor.name}. Cierre anterior anulado, ventas y gastos conservados.`,
        })
      })

      return NextResponse.json({
        ok: true,
        message: 'Caja reanudada con éxito. Ventas y gastos restaurados.',
        session: { ...session, id: sessionId, estado: 'abierta', corteAnteriorAnulado: true },
      })
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudo gestionar la caja' }, { status: 400 })
  }
}
