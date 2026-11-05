import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Filter, type DocumentReference, type DocumentSnapshot, type Query as FirestoreQuery } from 'firebase-admin/firestore'
import { getAdminApp, getAdminDb } from '@/lib/db-server'
import { isAdminEmail } from '@/lib/admin-access'
import { normalizePosAccessLevel, POS_ACCESS_RANK, type PosAccessLevel } from '@/lib/posAccessLevels'
import { restoreCatalogMemoryCacheStock } from '@/lib/catalog-cache'
import { isSellerCargo } from '@/lib/posSellerRoles'
import { saleBelongsToCashier } from '@/lib/posCashierVisibility'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'
import { getChileDayBounds } from '@/lib/chileDate'

export const dynamic = 'force-dynamic'

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

type PosAuthActor = {
  email: string
  name: string
  level: PosAccessLevel
  workerId: string
  isSupreme: boolean
  isSeller: boolean
}
const POS_AUTH_TTL = 5 * 60 * 1000
const gPosReturnsAuth = globalThis as unknown as {
  __yaxsellPosReturnsAuth?: Map<string, { actor: PosAuthActor; time: number }>
}
if (!gPosReturnsAuth.__yaxsellPosReturnsAuth) {
  gPosReturnsAuth.__yaxsellPosReturnsAuth = new Map()
}

async function authorize(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token)
    const email = String(decoded.email || '').trim().toLowerCase()
    if (isAdminEmail(email)) return { email, name: email, level: 'alto' as PosAccessLevel, workerId: '', isSupreme: true, isSeller: false }
    const cached = gPosReturnsAuth.__yaxsellPosReturnsAuth!.get(email)
    if (cached && Date.now() - cached.time < POS_AUTH_TTL) return cached.actor
    const db = getAdminDb()
    const userId = email.replace(/[^a-z0-9_-]/g, '_')
    const userSnap = await db.collection('erp_users').doc(userId).get()
    const account = userSnap.exists ? userSnap.data() || {} : {}
    const modules = Array.isArray(account.modules) ? account.modules : []
    if (!modules.some((module: string) => ['pos', 'pos_admin', 'admin_supreme'].includes(module))) return null
    let level = normalizePosAccessLevel(account.nivelAccesoPos, modules.includes('pos_admin'))
    let workerId = String(account.trabajadorId || '')
    let cargo = String(account.role || '')
    if (account.trabajadorId) {
      const worker = await db.collection('trabajadores_erp').doc(String(account.trabajadorId)).get()
      if (worker.exists) {
        const data = worker.data() || {}
        cargo = String(data.cargo || cargo)
        level = normalizePosAccessLevel(data.nivelAccesoPos, data.puedeGestionarCaja)
      }
    }
    const seller = isSellerCargo(cargo)
    if (seller) level = 'bajo'
    const actor = { email, name: String(account.displayName || email), level, workerId, isSupreme: false, isSeller: seller }
    gPosReturnsAuth.__yaxsellPosReturnsAuth!.set(email, { actor, time: Date.now() })
    return actor
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Sesión POS no autorizada' }, { status: 401 })
  try {
    const saleId = String(req.nextUrl.searchParams.get('saleId') || '').trim()
    const sede = String(req.nextUrl.searchParams.get('sede') || '').trim()
    const startDate = String(req.nextUrl.searchParams.get('startDate') || req.nextUrl.searchParams.get('desde') || '').trim()
    const endDate = String(req.nextUrl.searchParams.get('endDate') || req.nextUrl.searchParams.get('hasta') || '').trim()
    const adminDb = getAdminDb()

    if (!saleId && !sede) return NextResponse.json({ ok: false, error: 'Indica la boleta o sucursal' }, { status: 400 })

    // 1. Consultar devoluciones del rango. Se unen fecha de devolución y fecha
    // de la venta original, porque el historial considera ambas fechas.
    const validRange = !saleId && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      && startDate <= endDate
    let returnDocs: DocumentSnapshot[]
    if (saleId) {
      const returnsSnap = await adminDb.collection('pos_returns').where('saleId', '==', saleId).limit(100).get()
      returnDocs = returnsSnap.docs
    } else if (validRange && sede) {
      const bounds = { start: getChileDayBounds(startDate).start, end: getChileDayBounds(endDate).end }
      const branchValues = branchSlugQueryValues(sede)
      try {
        const returnsSnap = await adminDb.collection('pos_returns')
          .where(Filter.and(
            Filter.where('sede', 'in', branchValues),
            Filter.or(
              Filter.and(
                Filter.where('createdAtTs', '>=', bounds.start),
                Filter.where('createdAtTs', '<', bounds.end),
              ),
              Filter.and(
                Filter.where('saleFechaStr', '>=', startDate),
                Filter.where('saleFechaStr', '<=', endDate),
              ),
            ),
          ))
          .limit(300)
          .get()
        returnDocs = returnsSnap.docs
      } catch (error) {
        console.warn('[POS devoluciones] Índice de rango no disponible; usando consulta compatible:', error)
        const returnsSnap = await adminDb.collection('pos_returns').where('sede', '==', sede).limit(300).get()
        returnDocs = returnsSnap.docs
      }
    } else {
      let returnsQuery: FirestoreQuery = adminDb.collection('pos_returns')
      if (sede) returnsQuery = returnsQuery.where('sede', '==', sede)
      const returnsSnap = await returnsQuery.limit(300).get()
      returnDocs = returnsSnap.docs
    }

    const returnsList = returnDocs.map(doc => {
      const data = doc.data() || {}
      return {
        ...data,
        returnId: doc.id,
        id: doc.id,
        tipo: 'devolucion' as const,
        tipoLabel: 'Devolución',
      }
    })

    // 2. Consultar ventas_pos (para anulaciones y ediciones de cajeras)
    let salesDocs: any[] = []
    if (saleId) {
      const sSnap = await adminDb.collection('ventas_pos').doc(saleId).get()
      if (sSnap.exists) salesDocs = [sSnap]
    } else {
      let salesSnap: any
      if (startDate && startDate === endDate) {
        let salesQuery = adminDb.collection('ventas_pos')
        const branchValues = matchBranchSlug(sede, 'donbalato-central') ? [] : branchSlugQueryValues(sede)
        if (branchValues.length) salesQuery = salesQuery.where('sede', 'in', branchValues) as typeof salesQuery
        try {
          salesSnap = await salesQuery.where('fechaStr', '==', startDate).limit(300).get()
        } catch (error) {
          if (!branchValues.length) throw error
          console.warn('[POS devoluciones] Índice de sucursal pendiente; consultando el día y filtrando localmente:', error)
          salesSnap = await adminDb.collection('ventas_pos').where('fechaStr', '==', startDate).limit(300).get()
        }
      } else if (startDate && endDate) {
        let salesQuery = adminDb.collection('ventas_pos')
        const branchValues = matchBranchSlug(sede, 'donbalato-central') ? [] : branchSlugQueryValues(sede)
        if (branchValues.length) salesQuery = salesQuery.where('sede', 'in', branchValues) as typeof salesQuery
        try {
          salesSnap = await salesQuery
            .where('fechaStr', '>=', startDate)
            .where('fechaStr', '<=', endDate)
            .limit(400)
            .get()
        } catch (error) {
          if (!branchValues.length) throw error
          console.warn('[POS devoluciones] Índice de sucursal pendiente; consultando el rango y filtrando localmente:', error)
          salesSnap = await adminDb.collection('ventas_pos')
            .where('fechaStr', '>=', startDate)
            .where('fechaStr', '<=', endDate)
            .limit(400)
            .get()
        }
      } else {
        salesSnap = await adminDb.collection('ventas_pos')
          .where('sede', '==', sede)
          .limit(200)
          .get()
      }
      salesDocs = (salesSnap?.docs || []).filter((d: any) => {
        const s = d.data()?.sede || 'donbalato-central'
        return matchBranchSlug(s, sede)
      })
    }

    const anulacionesList: any[] = []
    const edicionesList: any[] = []

    for (const sDoc of salesDocs) {
      const sale = sDoc.data() || {}
      let rawItems: any[] = []
      if (Array.isArray(sale.items)) {
        rawItems = sale.items
      } else if (typeof sale.itemsJson === 'string') {
        try { rawItems = JSON.parse(sale.itemsJson) } catch {}
      }

      let rawPagos: any[] = []
      if (Array.isArray(sale.pagos)) {
        rawPagos = sale.pagos
      } else if (typeof sale.pagosJson === 'string') {
        try { rawPagos = JSON.parse(sale.pagosJson) } catch {}
      }

      const resolvedMethod = sale.metodoPago || (rawPagos[0]?.metodo ? rawPagos[0].metodo : (sale.debitoOrdenNumero ? 'debito' : 'efectivo'))

      const saleTs = Number(sale.anuladaAt || sale.anuladaEn || sale.anuladaAtTs || sale.fechaTs || (sale.createdAtTs || 0)) ||
        (sale.fecha?.toDate ? sale.fecha.toDate().getTime() : 0) ||
        (Number(sale.fecha?.seconds) ? Number(sale.fecha.seconds) * 1000 : 0)

      // Anulaciones registradas
      if (sale.estado === 'anulada') {
        anulacionesList.push({
          returnId: `anulacion_${sDoc.id}`,
          id: sDoc.id,
          saleId: sDoc.id,
          sede: sale.sede || sede,
          tipo: 'anulacion' as const,
          tipoLabel: 'Anulación',
          boletaNumero: sale.boletaNumero || 0,
          clienteNombre: sale.clienteNombre || 'Cliente',
          cajeroNombre: sale.cajeroNombre || '',
          createdByName: sale.anuladaPor || sale.cajeroNombre || 'Operador',
          createdBy: sale.anuladaPor || sale.cajeroNombre || 'Operador',
          total: Number(sale.total || 0),
          paymentMethod: resolvedMethod,
          reason: sale.motivoAnulacion || 'Boleta anulada',
          items: rawItems.map((it: any) => ({
            sku: it.sku || '',
            nombre: it.nombre || '',
            quantity: Number(it.cantidad || 1),
            amount: Number(it.subtotal || it.precioUnitario || 0),
            restock: true,
          })),
          createdAtTs: saleTs || Date.now(),
          saleFechaStr: sale.fechaStr || '',
          estado: 'anulada',
        })
      }

      // Ediciones realizadas a la venta
      if (Array.isArray(sale.historialEdiciones) && sale.historialEdiciones.length > 0) {
        sale.historialEdiciones.forEach((ed: any, edIdx: number) => {
          const edTs = Number(ed.editadoEn || ed.editadoAt || sale.fechaTs || 0)
          edicionesList.push({
            returnId: `edicion_${sDoc.id}_${edIdx}`,
            id: sDoc.id,
            saleId: sDoc.id,
            sede: sale.sede || sede,
            tipo: 'edicion' as const,
            tipoLabel: 'Edición',
            boletaNumero: sale.boletaNumero || 0,
            clienteNombre: sale.clienteNombre || 'Cliente',
            cajeroNombre: sale.cajeroNombre || '',
            createdByName: ed.editadoPor || sale.cajeroNombre || 'Cajera',
            createdBy: ed.editadoPor || sale.cajeroNombre || 'Cajera',
            total: Number(sale.total || 0),
            paymentMethod: resolvedMethod,
            reason: ed.razon || ed.motivo || 'Edición de método de pago o datos',
            items: rawItems.map((it: any) => ({
              sku: it.sku || '',
              nombre: it.nombre || '',
              quantity: Number(it.cantidad || 1),
              amount: Number(it.subtotal || it.precioUnitario || 0),
            })),
            createdAtTs: edTs || Date.now(),
            saleFechaStr: sale.fechaStr || '',
            estado: 'editada',
            edicionData: ed,
          })
        })
      }
    }

    let records = [...returnsList, ...anulacionesList, ...edicionesList]
      .sort((a: any, b: any) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0))

    if (!actor.isSupreme && actor.level !== 'alto') {
      if (saleId) {
        const saleSnap = await adminDb.collection('ventas_pos').doc(saleId).get()
        if (!saleSnap.exists || !saleBelongsToCashier(saleSnap.data(), { id: actor.workerId, name: actor.name })) {
          return NextResponse.json({ ok: false, error: 'No tienes acceso a esta boleta' }, { status: 403 })
        }
      } else {
        records = records.filter((record: any) => saleBelongsToCashier(record, { id: actor.workerId, name: actor.name }))
      }
    }

    if (startDate || endDate) {
      const inBounds = (dStr: string) => {
        if (!dStr) return false
        if (startDate && dStr < startDate) return false
        if (endDate && dStr > endDate) return false
        return true
      }
      records = records.filter((r: any) => {
        const ts = Number(r.createdAtTs || 0)
        let rDate = ''
        if (ts > 0) {
          try {
            rDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ts))
          } catch {
            const d = new Date(ts)
            rDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          }
        }
        const sDate = r.saleFechaStr ? String(r.saleFechaStr).slice(0, 10) : ''
        if (!rDate && !sDate) return true
        return inBounds(rDate) || inBounds(sDate)
      })
    }

    if (saleId) {
      const returnedByLine: Record<number, number> = {}
      for (const record of returnsList as any[]) {
        for (const line of (Array.isArray(record.items) ? record.items : [])) {
          const index = Math.trunc(asNumber(line.lineIndex))
          returnedByLine[index] = (returnedByLine[index] || 0) + asNumber(line.quantity)
        }
      }
      return NextResponse.json({ ok: true, records, returnedByLine })
    }

    return NextResponse.json({ ok: true, records })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudieron cargar las devoluciones' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Sesión POS no autorizada' }, { status: 401 })
  if (POS_ACCESS_RANK[actor.level] < POS_ACCESS_RANK.medio) return NextResponse.json({ ok: false, error: 'Tu nivel de permiso no permite registrar devoluciones.' }, { status: 403 })

  try {
    const body = await req.json()
    const returnId = String(body.returnId || '').trim()
    const saleId = String(body.saleId || '').trim()
    const sede = String(body.sede || '').trim()
    const reason = String(body.reason || '').trim()
    const paymentMethod = String(body.paymentMethod || '').trim().toLowerCase()
    const refundSessionId = String(body.refundSessionId || '').trim()
    const requestedItems: Array<{ lineIndex: number; quantity: number; restock: boolean }> = Array.isArray(body.items) ? body.items : []
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(returnId) || !saleId || !sede || !reason || reason.length > 500 || requestedItems.length === 0) {
      return NextResponse.json({ ok: false, error: 'Faltan datos válidos para registrar la devolución' }, { status: 400 })
    }
    if (!['efectivo', 'debito', 'transferencia'].includes(paymentMethod)) {
      return NextResponse.json({ ok: false, error: 'Selecciona un medio de reembolso válido' }, { status: 400 })
    }
    if (!refundSessionId) {
      return NextResponse.json({ ok: false, error: 'Abre una caja en esta sucursal para registrar la devolución en su corte.' }, { status: 409 })
    }

    const adminDb = getAdminDb()
    const saleRef = adminDb.collection('ventas_pos').doc(saleId)
    const returnRef = adminDb.collection('pos_returns').doc(returnId)
    const existingReturn = await returnRef.get()
    if (existingReturn.exists) return NextResponse.json({ ok: true, data: existingReturn.data() })
    const requested = requestedItems
      .map(item => ({ lineIndex: Math.trunc(asNumber(item.lineIndex)), quantity: Math.trunc(asNumber(item.quantity)), restock: item.restock === true }))
      .filter(item => item.quantity > 0)
    if (!requested.length || requested.length > 100) {
      return NextResponse.json({ ok: false, error: 'Selecciona cantidades válidas para devolver' }, { status: 400 })
    }
    if (new Set(requested.map(item => item.lineIndex)).size !== requested.length) {
      return NextResponse.json({ ok: false, error: 'Cada producto debe aparecer una sola vez en la devolución' }, { status: 400 })
    }

    // Resolve stock product docs before the transaction; references are then read and
    // updated together with the return record in one Firestore transaction.
    const saleSnap = await saleRef.get()
    if (!saleSnap.exists) return NextResponse.json({ ok: false, error: 'No se encontró la boleta original' }, { status: 404 })
    const saleData = saleSnap.data() || {}
    const sessionRef = refundSessionId ? adminDb.collection('caja_sesiones').doc(refundSessionId) : null
    let saleItems: any[] = Array.isArray(saleData.items) ? saleData.items : []
    if (!saleItems.length && typeof saleData.itemsJson === 'string') {
      try { saleItems = JSON.parse(saleData.itemsJson) } catch { saleItems = [] }
    }
    const productRefs = new Map<number, DocumentReference>()
    for (const item of requested) {
      if (!item.restock) continue
      const saleLine = saleItems[item.lineIndex]
      if (!saleLine) continue
      const productId = String(saleLine.productId || saleLine.productoId || saleLine.idProducto || '').trim()
      let productRef = productId ? adminDb.collection('products').doc(productId) : null
      if (productRef && !(await productRef.get()).exists) productRef = null
      if (!productRef) {
        const sku = String(saleLine.sku || '').trim()
        if (sku) {
          let productQuery = await adminDb.collection('products').where('SKU', '==', sku).limit(1).get()
          if (productQuery.empty) productQuery = await adminDb.collection('products').where('sku', '==', sku).limit(1).get()
          if (!productQuery.empty) productRef = productQuery.docs[0].ref
        }
      }
      if (!productRef) return NextResponse.json({ ok: false, error: `No pude identificar ${saleLine.nombre || saleLine.sku} para reingresarlo al stock. Desmarca el reingreso o revisa el SKU.` }, { status: 409 })
      productRefs.set(item.lineIndex, productRef)
    }

    const movementRefs = requested.filter(item => item.restock).map(() => adminDb.collection('stock_movements').doc())
    let result: any = null
    let cacheRestorations: Array<{ id?: string; sku?: string; cantidad: number }> = []
    await adminDb.runTransaction(async transaction => {
      const [currentSaleSnap, currentReturnSnap, previousReturnsSnap, sessionSnap] = await Promise.all([
        transaction.get(saleRef),
        transaction.get(returnRef),
        transaction.get(adminDb.collection('pos_returns').where('saleId', '==', saleId)),
        sessionRef ? transaction.get(sessionRef) : Promise.resolve(null),
      ])
      if (currentReturnSnap.exists) {
        result = currentReturnSnap.data()
        return
      }
      if (!currentSaleSnap.exists) throw new Error('No se encontró la boleta original')
      const sale = currentSaleSnap.data() || {}
      if (!matchBranchSlug(sale.sede || 'donbalato-central', sede)) throw new Error('La boleta pertenece a otra sucursal')
      if ((sale.estado || 'completada') !== 'completada') throw new Error('Solo se pueden devolver ventas completadas, no anuladas')
      if (saleSnap.updateTime?.toMillis() !== currentSaleSnap.updateTime?.toMillis()) throw new Error('La boleta cambió mientras se preparaba la devolución. Vuelve a abrirla e inténtalo otra vez.')

      const returnedByLine = new Map<number, number>()
      const returnedByMethod = new Map<string, number>()
      for (const returnDoc of previousReturnsSnap.docs) {
        const previous = returnDoc.data()
        for (const line of (Array.isArray(previous.items) ? previous.items : [])) {
          const index = Math.trunc(asNumber(line.lineIndex))
          returnedByLine.set(index, (returnedByLine.get(index) || 0) + asNumber(line.quantity))
        }
        const method = String(previous.paymentMethod || '').toLowerCase()
        returnedByMethod.set(method, (returnedByMethod.get(method) || 0) + asNumber(previous.total))
      }

      let lines: any[] = Array.isArray(sale.items) ? sale.items : []
      if (!lines.length && typeof sale.itemsJson === 'string') {
        try { lines = JSON.parse(sale.itemsJson) } catch { lines = [] }
      }
      const sumLines = lines.reduce((sum, line) => sum + Math.max(0, asNumber(line.subtotal)), 0)
      const globalDiscount = Math.min(sumLines, Math.max(0, asNumber(sale.descuentoGlobal)))
      const returnLines: any[] = []
      for (const item of requested) {
        const line = lines[item.lineIndex]
        if (!line) throw new Error('La línea seleccionada no existe en la boleta')
        const soldQty = Math.max(0, Math.trunc(asNumber(line.cantidad)))
        const alreadyReturned = returnedByLine.get(item.lineIndex) || 0
        if (item.quantity + alreadyReturned > soldQty) throw new Error(`La cantidad disponible para devolver de ${line.nombre || line.sku} es ${Math.max(0, soldQty - alreadyReturned)}`)
        const lineSubtotal = Math.max(0, asNumber(line.subtotal))
        const lineDiscount = sumLines > 0 ? globalDiscount * (lineSubtotal / sumLines) : 0
        const netLine = Math.max(0, lineSubtotal - lineDiscount)
        const amount = Math.round(netLine * (item.quantity / Math.max(1, soldQty)))
        returnLines.push({
          lineIndex: item.lineIndex,
          sku: String(line.sku || ''),
          nombre: String(line.nombre || line.sku || 'Producto'),
          quantity: item.quantity,
          unitPrice: soldQty > 0 ? Math.round(netLine / soldQty) : 0,
          costUnitario: Math.max(0, asNumber(line.costoUnitario ?? line.costUnitario)),
          amount,
          restock: item.restock,
        })
      }
      const total = returnLines.reduce((sum, line) => sum + line.amount, 0)
      if (total <= 0) throw new Error('El monto de la devolución debe ser mayor a cero')

      let salePayments: any[] = Array.isArray(sale.pagos) ? sale.pagos : []
      if (!salePayments.length && typeof sale.pagosJson === 'string') {
        try { salePayments = JSON.parse(sale.pagosJson) } catch { salePayments = [] }
      }
      if (!salePayments.length) salePayments = [{ metodo: sale.metodoPago || 'efectivo', monto: asNumber(sale.total) }]
      const originalMethodAmount = salePayments.filter(payment => String(payment.metodo || '').toLowerCase() === paymentMethod).reduce((sum, payment) => sum + asNumber(payment.monto), 0)
      const availableMethodAmount = originalMethodAmount - (returnedByMethod.get(paymentMethod) || 0)
      if (total > availableMethodAmount) throw new Error(`El reembolso supera lo disponible por ${paymentMethod} (${Math.max(0, Math.floor(availableMethodAmount))})`)

      if (!sessionRef || !sessionSnap?.exists || String(sessionSnap.data()?.estado || '') !== 'abierta') {
        throw new Error('La caja ya no está abierta. Actualiza el POS y vuelve a registrar la devolución.')
      }
      if (String(sessionSnap.data()?.sede || '') !== sede) throw new Error('La caja abierta pertenece a otra sucursal')

      const stockRefs = returnLines.map((line, index) => line.restock ? productRefs.get(requested[index].lineIndex) : null)
      const uniqueStockRefs = [...new Map(stockRefs.filter(Boolean).map(ref => [ref!.path, ref!])).values()]
      const stockSnaps = await Promise.all(uniqueStockRefs.map(ref => transaction.get(ref)))
      const stockByPath = new Map(stockSnaps.map(snap => [snap.ref.path, snap]))
      const now = Date.now()
      const stockChanges = new Map<string, { ref: DocumentReference; snap: DocumentSnapshot; quantity: number; lines: any[] }>()
      for (let i = 0; i < returnLines.length; i++) {
        const line = returnLines[i]
        if (!line.restock) continue
        const productRef = stockRefs[i]
        const productSnap = productRef ? stockByPath.get(productRef.path) : null
        if (!productRef || !productSnap?.exists) throw new Error(`No se encontró el producto ${line.nombre} en el catálogo`)
        const existing = stockChanges.get(productRef.path)
        stockChanges.set(productRef.path, {
          ref: productRef,
          snap: productSnap,
          quantity: (existing?.quantity || 0) + line.quantity,
          lines: [...(existing?.lines || []), line],
        })
      }
      let movementIndex = 0
      cacheRestorations = []
      for (const change of stockChanges.values()) {
        const product = change.snap.data() || {}
        const currentStock = asNumber(product.STOCK ?? product.stock)
        if (currentStock === 99999) continue
        const nextStock = currentStock + change.quantity
        transaction.update(change.ref, { STOCK: nextStock, stock: nextStock, updatedAt: now })
        const movementRef = movementRefs[movementIndex++]
        transaction.set(movementRef, {
          productId: change.snap.id,
          sku: change.lines[0]?.sku || product.SKU || product.sku || change.snap.id,
          nombre: change.lines[0]?.nombre || 'Producto',
          tipo: 'devolucion',
          stockAnterior: currentStock,
          cantidad: change.quantity,
          stockNuevo: nextStock,
          fechaTs: now,
          fecha: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(now)),
          fechaHora: new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(now)),
          usuario: actor.email,
          nota: `Devolución POS ${String(sale.boletaNumero || saleId)} · ${reason}`,
          returnId,
        })
        cacheRestorations.push({ id: change.snap.id, sku: String(product.SKU || product.sku || change.snap.id).trim(), cantidad: change.quantity, postStock: nextStock } as any)
      }

      const returnRecord = {
        returnId, saleId, sede,
        boletaNumero: asNumber(sale.boletaNumero),
        clienteNombre: String(sale.clienteNombre || 'Cliente'),
        cajeroNombre: String(sale.cajeroNombre || ''),
        cajeroId: String(sale.cajeroId || ''),
        sesionCajaId: String(sale.sesionCajaId || ''),
        refundSessionId: refundSessionId || '',
        saleFechaStr: String(sale.fechaStr || ''),
        items: returnLines,
        total,
        paymentMethod,
        reason,
        createdAtTs: now,
        createdBy: actor.email,
        createdByName: String(body.createdByName || actor.name),
        estado: 'registrada',
        comprobante: { tipo: 'interno', numero: returnId, notaCreditoSii: false },
      }
      transaction.create(returnRef, returnRecord)
      if (sessionRef && sessionSnap?.exists) {
        const session = sessionSnap.data() || {}
        const priorSessionReturns = (() => { try { return JSON.parse(String(session.devolucionesPosItemsJson || '[]')) } catch { return [] } })()
        transaction.update(sessionRef, {
          devolucionesPosTotal: FieldValue.increment(total),
          devolucionesPosEfectivo: FieldValue.increment(paymentMethod === 'efectivo' ? total : 0),
          devolucionesPosItemsJson: JSON.stringify([...priorSessionReturns, { returnId, saleId, boletaNumero: returnRecord.boletaNumero, total, paymentMethod, reason, items: returnLines, createdAtTs: now }]),
        })
      }
      result = returnRecord
    })

    if (cacheRestorations.length) {
      try { restoreCatalogMemoryCacheStock(cacheRestorations) } catch { /* Firestore is authoritative; cache refresh is best effort. */ }
      try {
        const pendingCol = adminDb.collection('stock_pending')
        for (const item of cacheRestorations as any[]) {
          if (!item.sku) continue
          const pRef = pendingCol.doc(item.sku)
          const pSnap = await pRef.get()
          if (pSnap.exists) {
            const curPendiente = asNumber(pSnap.data()?.pendiente)
            if (curPendiente > 0) {
              const targetPending = Math.max(0, -(Number(item.postStock) || 0))
              const nextPendiente = Math.min(curPendiente, targetPending, Math.max(0, curPendiente - item.cantidad))
              await pRef.update({
                pendiente: nextPendiente,
                limpiadoEnTs: Date.now(),
                nota: `Devolución POS: reducción de ${curPendiente - nextPendiente} uds en deuda pendiente.`,
              })
            }
          }
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, data: result })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'No se pudo registrar la devolución' }, { status: 400 })
  }
}
