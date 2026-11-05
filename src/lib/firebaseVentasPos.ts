// src/lib/appwriteVentasPos.ts
// Servicio para ventas_pos, caja_sesiones y cortes_caja en Appwrite
import { getServices, ID, Query } from '@/lib/db'
import { getChileDayBounds, shiftDateStr } from '@/lib/chileDate'

export const VENTAS_POS_COLLECTION = 'ventas_pos'
export const CAJA_SESIONES_COLLECTION = 'caja_sesiones'
export const CORTES_CAJA_COLLECTION = 'cortes_caja'

const DB_ID = 'firestore'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface VentaItem {
  sku: string
  nombre: string
  cantidad: number
  precioUnitario: number
  priceField?: string
  priceLabel?: string
  costoUnitario: number
  descuentoPct: number
  subtotal: number
}

export interface VentaPago {
  metodo: string
  monto: number
}

export interface VentaPOSAppwrite {
  $id: string
  sede: string
  cajeroId?: string
  cajeroNombre: string
  vendedorNombre?: string
  vendedorId?: string
  clienteNombre: string
  sesionCajaId: string
  fechaStr: string
  fechaTs: number
  items: VentaItem[]
  pagos: VentaPago[]
  metodoPago?: string
  subtotal: number
  descuentoGlobalPct: number
  descuentoGlobal: number
  total: number
  efectivoPagado: number
  vuelto: number
  estado: string
  modoVenta: string
  tipoComprobante: string
  boletaNumero: number
  debitoOrdenNumero: number | null
  cobradoPorJefe: boolean
  jefeNombre: string
  cobradaEnTs: number | null
  anuladaEnTs: number | null
  anuladaPor: string
  motivoAnulacion: string
  createdAtTs: number
}

export interface CajaGastoAppwrite {
  id: string
  monto: number
  detalle: string
  tipo?: string
  categoria?: string
  usuario: string
  createdAtTs: number
}

export interface SesionCajaAppwrite {
  $id: string
  cajeroId?: string
  parentSessionId?: string
  cierrePor?: string
  cierrePorNombre?: string
  aperturaObservacion?: string
  sede: string
  cajeroNombre: string
  estado: string
  montoApertura: number
  ventasCount: number
  totalVentas: number
  totalEfectivo: number
  totalDebito: number
  totalTransferencia: number
  totalGastos: number
  devolucionesPosTotal?: number
  devolucionesPosEfectivo?: number
  devolucionesPosItemsJson?: string
  gastosItems: CajaGastoAppwrite[]
  aperturaAtTs: number
  cierreAtTs: number | null
  montoCierre: number | null
  fechaStr: string
}

// ─── Serialización ───────────────────────────────────────────────────────────

function serializeVenta(data: any): any {
  const now = Date.now()
  const total = Number(data.total || 0)
  let pagosList = Array.isArray(data.pagos) ? data.pagos : []
  if (pagosList.length === 0 && data.estado !== 'pre_venta' && total > 0) {
    const m = data.metodoPago || (data.debitoOrdenNumero ? 'debito' : 'efectivo')
    pagosList = [{ metodo: m, monto: total }]
  }
  const metodoPagoStr = String(data.metodoPago || (pagosList.length === 1 ? pagosList[0].metodo : (pagosList.length > 1 ? 'mixto' : 'efectivo')))
  return {
    sede: String(data.sede || ''),
    cajeroId: String(data.cajeroId || ''),
    cajeroNombre: String(data.cajeroNombre || ''),
    vendedorNombre: String(data.vendedorNombre || data.vendedoraNombre || data.originVendorName || data.enviadoPorNombre || ''),
    vendedorId: String(data.vendedorId || data.vendedoraId || data.originVendorId || data.enviadoPorId || ''),
    clienteNombre: String(data.clienteNombre || 'Cliente'),
    sesionCajaId: String(data.sesionCajaId || ''),
    fechaStr: String(data.fechaStr || ''),
    fechaTs: data.fechaTs || now,
    items: data.items || [],
    itemsJson: JSON.stringify(data.items || []),
    pagos: pagosList,
    pagosJson: JSON.stringify(pagosList),
    metodoPago: metodoPagoStr,
    subtotal: Number(data.subtotal || 0),
    descuentoGlobalPct: Number(data.descuentoGlobalPct || 0),
    descuentoGlobal: Number(data.descuentoGlobal || 0),
    total: total,
    efectivoPagado: Number(data.efectivoPagado || 0),
    vuelto: Number(data.vuelto || 0),
    estado: String(data.estado || 'completada'),
    modoVenta: String(data.modoVenta || ''),
    tipoComprobante: String(data.tipoComprobante || 'comprobante'),
    boletaNumero: Number(data.boletaNumero || 0),
    debitoOrdenNumero: data.debitoOrdenNumero != null ? Number(data.debitoOrdenNumero) : null,
    cobradoPorJefe: !!data.cobradoPorJefe,
    jefeNombre: String(data.jefeNombre || ''),
    cobradaEnTs: data.cobradaEnTs || null,
    anuladaEnTs: data.anuladaEnTs || null,
    anuladaPor: String(data.anuladaPor || ''),
    motivoAnulacion: String(data.motivoAnulacion || ''),
    createdAtTs: data.createdAtTs || now,
  }
}

function deserializeVenta(d: any): VentaPOSAppwrite {
  let items: VentaItem[] = []
  let pagos: VentaPago[] = []
  if (Array.isArray(d.items)) {
    items = d.items
  } else {
    try { items = JSON.parse(d.itemsJson || '[]') } catch {}
  }
  if (Array.isArray(d.pagos) && d.pagos.length > 0) {
    pagos = d.pagos
  } else {
    try { pagos = JSON.parse(d.pagosJson || '[]') } catch {}
  }

  const totalVenta = Number(d.total || 0)
  const esCompletada = !d.estado || d.estado === 'completada'

  if ((!pagos || pagos.length === 0) && esCompletada && totalVenta > 0) {
    if (d.debitoOrdenNumero) {
      pagos = [{ metodo: 'debito', monto: totalVenta }]
    } else if (d.metodoPago && d.metodoPago !== 'mixto') {
      pagos = [{ metodo: d.metodoPago, monto: totalVenta }]
    } else {
      // Toda venta física completada en el POS que no tenga medio registrado es efectivo
      pagos = [{ metodo: 'efectivo', monto: totalVenta }]
    }
  }

  const derivedMetodo = String(d.metodoPago || (pagos.length > 0 ? (pagos.length === 1 ? pagos[0].metodo : 'mixto') : 'efectivo'))

  return {
    $id: d.$id,
    sede: String(d.sede || ''),
    cajeroId: String(d.cajeroId || ''),
    cajeroNombre: String(d.cajeroNombre || ''),
    vendedorNombre: d.vendedorNombre ? String(d.vendedorNombre) : (d.vendedoraNombre ? String(d.vendedoraNombre) : undefined),
    vendedorId: d.vendedorId ? String(d.vendedorId) : (d.vendedoraId ? String(d.vendedoraId) : undefined),
    clienteNombre: String(d.clienteNombre || 'Cliente'),
    sesionCajaId: String(d.sesionCajaId || ''),
    fechaStr: String(d.fechaStr || ''),
    fechaTs: Number(d.fechaTs || 0),
    items,
    pagos,
    metodoPago: derivedMetodo,
    subtotal: Number(d.subtotal || 0),
    descuentoGlobalPct: Number(d.descuentoGlobalPct || 0),
    descuentoGlobal: Number(d.descuentoGlobal || 0),
    total: totalVenta,
    efectivoPagado: Number(d.efectivoPagado || 0),
    vuelto: Number(d.vuelto || 0),
    estado: String(d.estado || 'completada'),
    modoVenta: String(d.modoVenta || ''),
    tipoComprobante: String(d.tipoComprobante || 'comprobante'),
    boletaNumero: Number(d.boletaNumero || 0),
    debitoOrdenNumero: d.debitoOrdenNumero != null ? Number(d.debitoOrdenNumero) : null,
    cobradoPorJefe: !!d.cobradoPorJefe,
    jefeNombre: String(d.jefeNombre || ''),
    cobradaEnTs: d.cobradaEnTs || null,
    anuladaEnTs: d.anuladaEnTs || null,
    anuladaPor: String(d.anuladaPor || ''),
    motivoAnulacion: String(d.motivoAnulacion || ''),
    createdAtTs: Number(d.createdAtTs || 0),
  }
}

function serializeSesionCaja(data: any): any {
  return {
    sessionId: String(data.id || data.sessionId || ''),
    cajeroId: String(data.cajeroId || ''),
    parentSessionId: String(data.parentSessionId || ''),
    cierrePor: String(data.cierrePor || ''),
    cierrePorNombre: String(data.cierrePorNombre || ''),
    aperturaObservacion: String(data.aperturaObservacion || ''),
    sede: String(data.sede || ''),
    cajeroNombre: String(data.cajeroNombre || ''),
    estado: String(data.estado || 'abierta'),
    montoApertura: Number(data.montoApertura || 0),
    ventasCount: Number(data.ventasCount || 0),
    totalVentas: Number(data.totalVentas || 0),
    totalEfectivo: Number(data.totalEfectivo || 0),
    totalDebito: Number(data.totalDebito || 0),
    totalTransferencia: Number(data.totalTransferencia || 0),
    totalGastos: Number(data.totalGastos || 0),
    devolucionesPosTotal: Number(data.devolucionesPosTotal || 0),
    devolucionesPosEfectivo: Number(data.devolucionesPosEfectivo || 0),
    devolucionesPosItemsJson: String(data.devolucionesPosItemsJson || '[]'),
    gastosItemsJson: JSON.stringify(data.gastosItems || []),
    aperturaAtTs: Number(data.aperturaAtTs || Date.now()),
    cierreAtTs: data.cierreAtTs || null,
    montoCierre: data.montoCierre || null,
    fechaStr: String(data.fechaStr || ''),
  }
}

function deserializeSesionCaja(d: any): SesionCajaAppwrite {
  let gastosItems: CajaGastoAppwrite[] = []
  try { gastosItems = JSON.parse(d.gastosItemsJson || '[]') } catch {}
  return {
    $id: String(d.sessionId || d.$id),
    cajeroId: String(d.cajeroId || ''),
    parentSessionId: String(d.parentSessionId || ''),
    cierrePor: String(d.cierrePor || ''),
    cierrePorNombre: String(d.cierrePorNombre || ''),
    aperturaObservacion: String(d.aperturaObservacion || ''),
    sede: String(d.sede || ''),
    cajeroNombre: String(d.cajeroNombre || ''),
    estado: String(d.estado || 'abierta'),
    montoApertura: Number(d.montoApertura || 0),
    ventasCount: Number(d.ventasCount || 0),
    totalVentas: Number(d.totalVentas || 0),
    totalEfectivo: Number(d.totalEfectivo || 0),
    totalDebito: Number(d.totalDebito || 0),
    totalTransferencia: Number(d.totalTransferencia || 0),
    totalGastos: Number(d.totalGastos || 0),
    devolucionesPosTotal: Number(d.devolucionesPosTotal || 0),
    devolucionesPosEfectivo: Number(d.devolucionesPosEfectivo || 0),
    devolucionesPosItemsJson: String(d.devolucionesPosItemsJson || '[]'),
    gastosItems,
    aperturaAtTs: Number(d.aperturaAtTs || 0),
    cierreAtTs: d.cierreAtTs || null,
    montoCierre: d.montoCierre || null,
    fechaStr: String(d.fechaStr || ''),
  }
}

// ─── Ventas POS ──────────────────────────────────────────────────────────────

export async function createVentaPos(data: any, customId?: string): Promise<string> {
  const { db } = await import('@/lib/firebase')
  const { doc, setDoc } = await import('firebase/firestore')
  const docId = customId || ID.unique()
  await setDoc(doc(db, VENTAS_POS_COLLECTION, docId), {
    ...serializeVenta(data),
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
  })
  return docId
}

export async function updateVentaPos(id: string, updates: any): Promise<void> {
  const { databases } = getServices()
  const serialized: any = {}
  // Serializar itemsJson y pagosJson manteniendo también los arrays
  if (updates.items !== undefined) { serialized.itemsJson = JSON.stringify(updates.items); serialized.items = updates.items; delete updates.items }
  if (updates.pagos !== undefined) { serialized.pagosJson = JSON.stringify(updates.pagos); serialized.pagos = updates.pagos; delete updates.pagos }
  Object.assign(serialized, updates)
  // Mapear timestamps
  if (updates.cobradaEn) { serialized.cobradaEnTs = Date.now(); delete serialized.cobradaEn }
  if (updates.anuladaEn) { serialized.anuladaEnTs = Date.now(); delete serialized.anuladaEn }
  if (updates.createdAt) { serialized.createdAtTs = Date.now(); delete serialized.createdAt }
  if (updates.fecha) { serialized.fechaTs = Date.now(); delete serialized.fecha }
  await databases.updateDocument(DB_ID, VENTAS_POS_COLLECTION, id, serialized)
}

export async function getVentasPosBySedeAndDate(sede: string, fechaStr: string): Promise<VentaPOSAppwrite[]> {
  const { db } = await import('@/lib/firebase')
  const { collection, query, where, getDocs, limit } = await import('firebase/firestore')
  // Filtrar por sede y fechaStr directamente en Firestore y ordenar en memoria (evita requerir índice compuesto manual)
  const q = query(
    collection(db, VENTAS_POS_COLLECTION),
    where('sede', '==', sede),
    where('fechaStr', '==', fechaStr),
    limit(1000)
  )
  const snap = await getDocs(q)
  const all: any[] = snap.docs
    .map((d: any) => ({ $id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0))
  return all.map(deserializeVenta)
}

export async function getVentasPosBySesionCaja(sesionCajaId: string, fechaChile?: string): Promise<VentaPOSAppwrite[]> {
  if (!sesionCajaId) return []
  const { db } = await import('@/lib/firebase')
  const { collection, query, where, getDocsFromServer, limit, and, or } = await import('firebase/firestore')
  const ventas = collection(db, VENTAS_POS_COLLECTION)
  let snap
  if (fechaChile && /^\d{4}-\d{2}-\d{2}$/.test(fechaChile)) {
    const bounds = getChileDayBounds(fechaChile)
    const nextDate = shiftDateStr(fechaChile, 1)
    try {
      // One OR query returns each sale once, while preserving the existing date
      // precedence: fechaStr first, then fechaTs, then createdAtTs for legacy rows.
      const dayQuery = query(
        ventas,
        where('sesionCajaId', '==', sesionCajaId),
        or(
          and(where('fechaStr', '>=', fechaChile), where('fechaStr', '<', nextDate)),
          and(where('fechaTs', '>=', bounds.start), where('fechaTs', '<', bounds.end)),
          and(where('createdAtTs', '>=', bounds.start), where('createdAtTs', '<', bounds.end)),
        ) as any,
      )
      snap = await getDocsFromServer(dayQuery)
    } catch (error) {
      // Until the new composite indexes are deployed, retain the complete
      // session read so the till summary can never silently omit a sale.
      console.warn('[ventas-pos] Consulta por día no disponible; usando sesión completa:', error)
      const fullQuery = query(ventas, where('sesionCajaId', '==', sesionCajaId), limit(1000))
      snap = await getDocsFromServer(fullQuery)
    }
  } else {
    const fullQuery = query(ventas, where('sesionCajaId', '==', sesionCajaId), limit(1000))
    snap = await getDocsFromServer(fullQuery)
  }
  const all: any[] = snap.docs
    .map((d: any) => ({ $id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0))
  return all.map(deserializeVenta)
}

export async function getPreVentasBySede(sede: string): Promise<VentaPOSAppwrite[]> {
  const { db } = await import('@/lib/firebase')
  const { collection, query, where, getDocs, limit } = await import('firebase/firestore')
  const q = query(
    collection(db, VENTAS_POS_COLLECTION),
    where('sede', '==', sede),
    where('estado', '==', 'pre_venta'),
    limit(50)
  )
  const snap = await getDocs(q)
  const all: any[] = snap.docs.map((d: any) => ({ $id: d.id, ...d.data() }))
  const filtered = all
    .sort((a, b) => (Number(b.createdAtTs || 0)) - (Number(a.createdAtTs || 0)))
  return filtered.map(deserializeVenta)
}

export async function getVentaPosById(id: string): Promise<VentaPOSAppwrite | null> {
  const { databases } = getServices()
  try {
    const doc = await databases.getDocument(DB_ID, VENTAS_POS_COLLECTION, id)
    return deserializeVenta(doc)
  } catch {
    return null
  }
}

// ─── Caja Sesiones ───────────────────────────────────────────────────────────

export async function createCajaSesion(data: any, customId?: string): Promise<string> {
  const { db } = await import('@/lib/firebase')
  const { doc, setDoc } = await import('firebase/firestore')
  const docId = customId || ID.unique()
  await setDoc(doc(db, CAJA_SESIONES_COLLECTION, docId), {
    ...serializeSesionCaja(data),
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
  })
  return docId
}

export async function updateCajaSesion(id: string, updates: any): Promise<void> {
  const { databases } = getServices()
  const serialized: any = {}
  Object.assign(serialized, updates)
  if (updates.gastosItems !== undefined) {
    serialized.gastosItemsJson = JSON.stringify(updates.gastosItems)
    delete serialized.gastosItems
  }
  if (updates.aperturaAt) { serialized.aperturaAtTs = Number(updates.aperturaAt) || Date.now(); delete serialized.aperturaAt }
  if (updates.cierreAt) { serialized.cierreAtTs = Date.now(); delete serialized.cierreAt }
  await databases.updateDocument(DB_ID, CAJA_SESIONES_COLLECTION, id, serialized)
}

/** Applies sale/payment deltas atomically so two POS devices cannot overwrite each other's counters. */
export async function adjustCajaSesion(id: string, delta: {
  ventasCount?: number
  totalVentas?: number
  totalEfectivo?: number
  totalDebito?: number
  totalTransferencia?: number
}): Promise<void> {
  if (!id) return
  const { db } = await import('@/lib/firebase')
  const { doc, runTransaction, updateDoc, increment } = await import('firebase/firestore')
  const ref = doc(db, CAJA_SESIONES_COLLECTION, id)
  const fields = ['ventasCount', 'totalVentas', 'totalEfectivo', 'totalDebito', 'totalTransferencia'] as const
  const nonZeroEntries = fields
    .map((field) => [field, Number(delta[field] || 0)] as const)
    .filter(([, amount]) => Number.isFinite(amount) && amount !== 0)

  if (nonZeroEntries.length === 0) return

  // Fast-path de 0 lecturas: si todos los deltas son positivos (ej. al cobrar una venta),
  // FieldValue.increment() es 100% atómico en servidor sin requerir leer el documento en una transacción.
  const allPositive = nonZeroEntries.every(([, amount]) => amount > 0)
  if (allPositive) {
    const atomicUpdates: Record<string, any> = {}
    for (const [field, amount] of nonZeroEntries) {
      atomicUpdates[field] = increment(amount)
    }
    await updateDoc(ref, atomicUpdates)
    return
  }

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error(`No existe la sesión de caja ${id}`)
    const updates: Record<string, number> = {}
    for (const [field, amount] of nonZeroEntries) {
      const current = Number(snapshot.get(field) || 0)
      updates[field] = Math.max(0, current + amount)
    }
    if (Object.keys(updates).length) transaction.update(ref, updates)
  })
}

const cajaSessionDocId = (sede: string, cajeroId?: string) => {
  const owner = String(cajeroId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `active_${sede}_${owner}`
}

export async function getActiveCajaSesion(sede: string, cajeroId?: string): Promise<SesionCajaAppwrite | null> {
  const { databases } = getServices()
  try {
    const pointer = await databases.getDocument(DB_ID, CAJA_SESIONES_COLLECTION, cajaSessionDocId(sede, cajeroId))
    if (!pointer || pointer.estado !== 'abierta') return null
    const sessionId = String(pointer.sessionId || '')
    if (sessionId && sessionId !== pointer.$id) {
      const session = await databases.getDocument(DB_ID, CAJA_SESIONES_COLLECTION, sessionId)
      if (session?.estado === 'abierta') return deserializeSesionCaja(session)
      return null
    }
    return deserializeSesionCaja(pointer)
  } catch {
    return null
  }
}

/** Lee la última sesión asociada al puntero de una cajera, esté abierta o cerrada. */
export async function getCajaSesionActual(sede: string, cajeroId?: string): Promise<SesionCajaAppwrite | null> {
  const { databases } = getServices()
  try {
    const pointer = await databases.getDocument(DB_ID, CAJA_SESIONES_COLLECTION, cajaSessionDocId(sede, cajeroId))
    const sessionId = String(pointer.sessionId || '')
    if (sessionId && sessionId !== pointer.$id) {
      const session = await databases.getDocument(DB_ID, CAJA_SESIONES_COLLECTION, sessionId)
      if (session) return deserializeSesionCaja(session)
    }
    return deserializeSesionCaja(pointer)
  } catch {
    return null
  }
}

export async function setActiveCajaSesion(sede: string, data: any, cajeroId?: string): Promise<void> {
  const { db } = await import('@/lib/firebase')
  const { doc, setDoc } = await import('firebase/firestore')
  const docId = cajaSessionDocId(sede, cajeroId)
  const pointerData = serializeSesionCaja(data)
  // Las sesiones nuevas tienen un documento propio. No duplicar su fecha en el
  // puntero activo: los reportes diarios consultan la colección por fecha.
  // En sesiones antiguas el puntero también es el documento de sesión, así que
  // conservamos ese campo por compatibilidad.
  if (String(data.id || data.sessionId || '') !== docId) pointerData.fechaStr = null
  await setDoc(doc(db, CAJA_SESIONES_COLLECTION, docId), {
    ...pointerData,
    $updatedAt: new Date().toISOString(),
  }, { merge: true })
}

// ─── Cortes de Caja ──────────────────────────────────────────────────────────

export async function createCorteCaja(data: any, customId?: string): Promise<string> {
  const { db } = await import('@/lib/firebase')
  const { doc, setDoc } = await import('firebase/firestore')
  const docId = customId || ID.unique()
  const now = Date.now()
  const serialized: any = {
    sesionCajaId: String(data.sesionCajaId || ''),
    sede: String(data.sede || ''),
    cajeroNombre: String(data.cajeroNombre || ''),
    aperturaAtTs: Number(data.aperturaAtTs || data.aperturaAt) || now,
    cierreAtTs: now,
    fechaCierreStr: String(data.fechaCierreStr || ''),
    horaCierreStr: String(data.horaCierreStr || ''),
    montoApertura: Number(data.montoApertura || 0),
    ventasCount: Number(data.ventasCount || 0),
    totalEfectivo: Number(data.totalEfectivo || 0),
    totalDebito: Number(data.totalDebito || 0),
    totalTransferencia: Number(data.totalTransferencia || 0),
    totalVentas: Number(data.totalVentas || 0),
    totalVueltos: Number(data.totalVueltos || 0),
    efectivoTeorico: Number(data.efectivoTeorico || 0),
    efectivoReal: Number(data.efectivoReal || 0),
    gastos: Number(data.gastos || 0),
    gastosItemsJson: JSON.stringify(data.gastosItems || []),
    anulacionesItemsJson: JSON.stringify({ anulaciones: data.anulacionesItems || [], devoluciones: data.devolucionesItems || [] }),
    totalAnulaciones: Number(data.totalAnulaciones || 0),
    totalDevoluciones: Number(data.totalDevoluciones || 0),
    diferencia: Number(data.diferencia || 0),
    topProductsJson: JSON.stringify(data.topProducts || []),
    costoProductos: Number(data.costoProductos || 0),
    gananciaProductos: Number(data.gananciaProductos || 0),
    createdAtTs: now,
  }
  await setDoc(doc(db, CORTES_CAJA_COLLECTION, docId), {
    ...serialized,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
  })
  return docId
}

// El historial consulta por fecha bajo demanda; el POS consulta por sesión de caja
// solo al abrir el resumen o preparar el cierre. No mantener un listener pasivo
// sobre todas las boletas mientras la pantalla de venta queda abierta.

export function pollPreVentas(
  sede: string,
  callback: (ventas: VentaPOSAppwrite[]) => void,
  _intervalMs?: number,
): () => void {
  let active = true
  let unsubFirestore: (() => void) | null = null

  const start = async () => {
    try {
      const { db } = await import('@/lib/firebase')
      const { collection, query, where, limit, onSnapshot } = await import('firebase/firestore')

      if (!active) return

      const q = query(
        collection(db, VENTAS_POS_COLLECTION),
        where('sede', '==', sede),
        where('estado', '==', 'pre_venta'),
        // El POS ya limita la carga puntual de preventas a 50. Mantener el
        // listener en el mismo rango evita releer preventas históricas sin tope.
        limit(50),
      )

      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          if (!active) return
          const all: any[] = snap.docs.map((d: any) => ({ $id: d.id, ...d.data() }))
          const filtered = all.sort((a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0))
          callback(filtered.map(deserializeVenta))
        },
        (error) => {
          console.error('[pollPreVentas] onSnapshot error:', error)
          // Fallback seguro a una sola lectura si hay error en listener
          if (active) {
            getPreVentasBySede(sede)
              .then((v) => { if (active) callback(v) })
              .catch(() => {})
          }
        }
      )
    } catch (e) {
      console.error('[pollPreVentas] setup error:', e)
    }
  }

  start()

  return () => {
    active = false
    if (unsubFirestore) {
      unsubFirestore()
      unsubFirestore = null
    }
  }
}
