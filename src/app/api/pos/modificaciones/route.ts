import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminDb } from '@/lib/db-server'
import { isAdminEmail } from '@/lib/admin-access'
import { normalizePosAccessLevel, type PosAccessLevel } from '@/lib/posAccessLevels'
import { isSellerCargo } from '@/lib/posSellerRoles'
import { saleBelongsToCashier } from '@/lib/posCashierVisibility'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'
import { getChileDayBounds } from '@/lib/chileDate'

export const dynamic = 'force-dynamic'

type PosAuthActor = {
  email: string
  name: string
  level: PosAccessLevel
  workerId: string
  isSupreme: boolean
  isSeller: boolean
}
const POS_AUTH_TTL = 5 * 60 * 1000
const gPosModAuth = globalThis as unknown as {
  __yaxsellPosReturnsAuth?: Map<string, { actor: PosAuthActor; time: number }>
}
if (!gPosModAuth.__yaxsellPosReturnsAuth) {
  gPosModAuth.__yaxsellPosReturnsAuth = new Map()
}

async function authorize(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token)
    const email = String(decoded.email || '').trim().toLowerCase()
    if (isAdminEmail(email)) {
      return { email, name: email, level: 'alto' as PosAccessLevel, workerId: '', isSupreme: true, isSeller: false }
    }
    const cached = gPosModAuth.__yaxsellPosReturnsAuth!.get(email)
    if (cached && Date.now() - cached.time < POS_AUTH_TTL) return cached.actor
    const db = getAdminDb()
    const userId = email.replace(/[^a-z0-9_-]/g, '_')
    const userSnap = await db.collection('erp_users').doc(userId).get()
    const account = userSnap.exists ? userSnap.data() || {} : {}
    const modules = Array.isArray(account.modules) ? account.modules : []
    if (!modules.some((module: string) => ['pos', 'pos_admin', 'admin_supreme'].includes(module))) return null
    let level = normalizePosAccessLevel(account.nivelAccesoPos, modules.includes('pos_admin'))
    const workerId = String(account.trabajadorId || '')
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
    gPosModAuth.__yaxsellPosReturnsAuth!.set(email, { actor, time: Date.now() })
    return actor
  } catch {
    return null
  }
}

function parseLegacyChangesFromNota(nota: string): Array<{ campo: string; antes: string; despues: string }> {
  const clean = String(nota || '').replace(/^Edición POS:\s*/i, '').trim()
  if (!clean) return []
  const parts = clean.split('·').map(p => p.trim()).filter(Boolean)
  return parts.map(part => {
    if (part.includes('→')) {
      const [left, right] = part.split('→').map(s => s.trim())
      if (left.includes(':')) {
        const [campo, antes] = left.split(':').map(s => s.trim())
        return { campo: campo || 'Campo', antes: antes || '—', despues: right || '—' }
      }
      const tokens = left.split(/\s+/)
      if (tokens.length >= 2 && tokens[0].toUpperCase() === 'SKU') {
        return { campo: 'SKU', antes: tokens.slice(1).join(' '), despues: right || '—' }
      }
      return { campo: left || 'Valor', antes: 'Anterior', despues: right || '—' }
    }
    return { campo: 'Modificación', antes: '—', despues: part }
  })
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0))

export async function GET(req: NextRequest) {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'Sesión POS no autorizada' }, { status: 401 })

  try {
    const sede = String(req.nextUrl.searchParams.get('sede') || 'donbalato-central').trim()
    const startDate = String(req.nextUrl.searchParams.get('startDate') || req.nextUrl.searchParams.get('desde') || '').trim()
    const endDate = String(req.nextUrl.searchParams.get('endDate') || req.nextUrl.searchParams.get('hasta') || '').trim()
    const adminDb = getAdminDb()

    // 1. Consultar movimientos del rango en Firestore. El historial muestra solo
    // el período seleccionado; leer los últimos 350 de toda la vida por tipo y
    // filtrarlos después repetía lecturas de movimientos ajenos al reporte.
    const validRange = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      && startDate <= endDate
    const branchValues = matchBranchSlug(sede, 'donbalato-central') ? [] : branchSlugQueryValues(sede)
    const loadMovementType = (tipo: string) => {
      let query = adminDb.collection('stock_movements').where('tipo', '==', tipo)
      if (validRange) {
        if (branchValues.length) query = query.where('sede', 'in', branchValues) as typeof query
        const from = getChileDayBounds(startDate).start
        const until = getChileDayBounds(endDate).end
        query = query.where('fechaTs', '>=', from).where('fechaTs', '<', until) as typeof query
      }
      return query.limit(350).get()
    }
    let edicionSnap: any
    let emergenciaSnap: any
    try {
      ;[edicionSnap, emergenciaSnap] = await Promise.all([
        loadMovementType('edicion'),
        loadMovementType('precio_emergencia'),
      ])
    } catch (error) {
      // Local indexes may not yet be deployed. Keep the old bounded behavior so
      // the report still works while logging that its read reduction is inactive.
      console.warn('[POS modificaciones] Índice de rango no disponible; usando consulta compatible:', error)
      ;[edicionSnap, emergenciaSnap] = await Promise.all([
        adminDb.collection('stock_movements').where('tipo', '==', 'edicion').limit(350).get(),
        adminDb.collection('stock_movements').where('tipo', '==', 'precio_emergencia').limit(350).get(),
      ])
    }

    const productEdits: any[] = []
    const emergencyLogs: any[] = []

    for (const doc of edicionSnap.docs) {
      const d = doc.data() || {}
      const docSede = d.sede || 'donbalato-central'
      if (sede && !matchBranchSlug(docSede, sede)) continue
      const ts = Number(d.fechaTs || 0) || Date.now()
      const cambios = Array.isArray(d.cambios) && d.cambios.length > 0
        ? d.cambios
        : parseLegacyChangesFromNota(d.nota || '')
      productEdits.push({
        id: `mov_ed_${doc.id}`,
        movementId: doc.id,
        sede: docSede,
        tipo: 'edicion_producto',
        tipoLabel: 'Edición de Producto',
        sku: String(d.sku || ''),
        skuAnterior: d.skuAnterior || null,
        nombreProducto: String(d.nombre || d.sku || 'Producto'),
        cajeroNombre: String(d.usuario || 'Cajera POS'),
        rolUsuario: String(d.rolUsuario || 'Nivel Alto'),
        nota: String(d.nota || 'Edición rápida desde POS'),
        cambios,
        codigo_barra: d.codigo_barra || '',
        packageQty: d.packageQty || '',
        createdAtTs: ts,
        fechaStr: String(d.fecha || ''),
      })
    }

    for (const doc of emergenciaSnap.docs) {
      const d = doc.data() || {}
      const docSede = d.sede || 'donbalato-central'
      if (sede && !matchBranchSlug(docSede, sede)) continue
      const ts = Number(d.fechaTs || 0) || Date.now()
      const precioOrig = Number(d.precioOriginal || 0)
      const precioEmerg = Number(d.precioEmergencia || 0)
      const costoUni = Number(d.costoUnitario || 0)
      const qty = Math.max(1, Number(d.cantidad || 1))
      const gananciaEstimada = (precioEmerg - costoUni) * qty
      const cambios = Array.isArray(d.cambios) && d.cambios.length > 0
        ? d.cambios
        : [
            {
              campo: 'Precio Emergencia (Borrador / Personalizado)',
              antes: precioOrig > 0 ? fmtCLP(precioOrig) : 'Sin precio (Borrador)',
              despues: fmtCLP(precioEmerg),
            },
          ]
      emergencyLogs.push({
        id: `mov_em_${doc.id}`,
        movementId: doc.id,
        saleId: d.ventaId || null,
        boletaNumero: d.boletaNumero || null,
        sede: docSede,
        tipo: 'precio_emergencia',
        tipoLabel: 'Precio de Emergencia',
        sku: String(d.sku || ''),
        nombreProducto: String(d.nombre || d.sku || 'Producto'),
        cajeroNombre: String(d.usuario || 'Cajera Nivel Alto'),
        rolUsuario: String(d.rolUsuario || 'Nivel Alto'),
        nota: String(d.nota || 'Precio personalizado autorizado'),
        precioOriginal: precioOrig,
        precioEmergencia: precioEmerg,
        costoUnitario: costoUni,
        cantidad: qty,
        montoInvolucrado: precioEmerg * qty,
        gananciaGenerada: gananciaEstimada,
        cambios,
        createdAtTs: ts,
        fechaStr: String(d.fecha || ''),
      })
    }

    // 2. Consultar ventas_pos para capturar ventas reales cobradas con precio_emergencia + ediciones de boleta
    let salesSnap: any
    if (startDate && startDate === endDate) {
      let salesQuery = adminDb.collection('ventas_pos')
      const singleDateBranchValues = branchValues.length ? branchValues : branchSlugQueryValues(sede)
      if (singleDateBranchValues.length) salesQuery = salesQuery.where('sede', 'in', singleDateBranchValues) as typeof salesQuery
      try {
        salesSnap = await salesQuery.where('fechaStr', '==', startDate).limit(350).get()
      } catch (error) {
        console.warn('[POS modificaciones] Índice de sucursal pendiente; consultando el día y filtrando localmente:', error)
        salesSnap = await adminDb.collection('ventas_pos').where('fechaStr', '==', startDate).limit(350).get()
      }
    } else if (startDate && endDate) {
      let query = adminDb.collection('ventas_pos')
      if (branchValues.length) query = query.where('sede', 'in', branchValues) as typeof query
      try {
        salesSnap = await query
          .where('fechaStr', '>=', startDate)
          .where('fechaStr', '<=', endDate)
          .limit(450)
          .get()
      } catch (error) {
        console.warn('[POS modificaciones] Índice de sucursal pendiente; consultando el rango y filtrando localmente:', error)
        salesSnap = await adminDb.collection('ventas_pos')
          .where('fechaStr', '>=', startDate)
          .where('fechaStr', '<=', endDate)
          .limit(450)
          .get()
      }
    } else {
      salesSnap = await adminDb.collection('ventas_pos')
        .where('sede', '==', sede)
        .limit(250)
        .get()
        .catch(() => ({ docs: [] }))
    }

    const salesDocs = (salesSnap?.docs || []).filter((d: any) => {
      const s = d.data()?.sede || 'donbalato-central'
      return matchBranchSlug(s, sede)
    })

    const saleEmergencyRecords: any[] = []
    const saleEditRecords: any[] = []

    for (const sDoc of salesDocs) {
      const sale = sDoc.data() || {}
      let rawItems: any[] = []
      if (Array.isArray(sale.items)) {
        rawItems = sale.items
      } else if (typeof sale.itemsJson === 'string') {
        try { rawItems = JSON.parse(sale.itemsJson) } catch {}
      }

      const saleTs = Number(sale.fechaTs || sale.createdAtTs || 0) || Date.now()

      // Items vendidos con precio de emergencia en esta boleta
      rawItems.forEach((it: any, idx: number) => {
        if (it?.priceField === 'precio_emergencia' || it?.esPrecioEmergencia === true) {
          const qty = Math.max(1, Number(it.cantidad || 1))
          const pUnit = Number(it.precioUnitario || 0)
          const cUnit = Number(it.costoUnitario || 0)
          const pCat = Number(it.precioCatalogoRef || 0)
          const sub = Number(it.subtotal || pUnit * qty)
          const ganancia = sub - cUnit * qty
          saleEmergencyRecords.push({
            id: `venta_em_${sDoc.id}_${idx}`,
            saleId: sDoc.id,
            boletaNumero: sale.boletaNumero || 0,
            sede: sale.sede || sede,
            tipo: 'precio_emergencia',
            subtipo: 'venta_cerrada',
            tipoLabel: 'Venta con Precio Emergencia',
            sku: String(it.sku || ''),
            nombreProducto: String(it.nombre || it.sku || 'Producto'),
            cajeroNombre: String(sale.cajeroNombre || 'Cajera POS'),
            clienteNombre: String(sale.clienteNombre || 'Cliente'),
            rolUsuario: 'Nivel Alto',
            precioOriginal: pCat,
            precioEmergencia: pUnit,
            costoUnitario: cUnit,
            cantidad: qty,
            montoInvolucrado: sub,
            gananciaGenerada: ganancia,
            nota: `Vendido en Boleta ${sale.boletaNumero ? `#${sale.boletaNumero}` : `#${sDoc.id.slice(-6).toUpperCase()}`} · ${qty} u. × ${fmtCLP(pUnit)} (Ganancia: ${fmtCLP(ganancia)})`,
            cambios: [
              {
                campo: 'Precio Vendido (Personalizado)',
                antes: pCat > 0 ? fmtCLP(pCat) : 'Borrador / Sin lista',
                despues: `${fmtCLP(pUnit)} (${qty} uds = ${fmtCLP(sub)})`,
              },
              {
                campo: 'Ganancia Registrada',
                antes: `Costo: ${fmtCLP(cUnit)} c/u`,
                despues: `Ganancia neta: ${fmtCLP(ganancia)}`,
              },
            ],
            createdAtTs: saleTs,
            fechaStr: String(sale.fechaStr || ''),
            estadoVenta: sale.estado || 'completada',
          })
        }
      })

      // Ediciones realizadas a la boleta (cambio de método de pago, etc.)
      if (Array.isArray(sale.historialEdiciones) && sale.historialEdiciones.length > 0) {
        sale.historialEdiciones.forEach((ed: any, edIdx: number) => {
          const edTs = Number(ed.editadoEn || ed.editadoAt || saleTs)
          saleEditRecords.push({
            id: `venta_ed_${sDoc.id}_${edIdx}`,
            saleId: sDoc.id,
            boletaNumero: sale.boletaNumero || 0,
            sede: sale.sede || sede,
            tipo: 'edicion_boleta',
            tipoLabel: 'Edición de Boleta',
            sku: sale.boletaNumero ? `BOLETA #${sale.boletaNumero}` : `#${sDoc.id.slice(-6).toUpperCase()}`,
            nombreProducto: `Boleta ${sale.boletaNumero ? `#${sale.boletaNumero}` : `#${sDoc.id.slice(-6).toUpperCase()}`} (${sale.clienteNombre || 'Cliente'})`,
            cajeroNombre: String(ed.editadoPor || sale.cajeroNombre || 'Cajera'),
            rolUsuario: 'Cajera / Admin',
            montoInvolucrado: Number(sale.total || 0),
            nota: String(ed.razon || ed.motivo || 'Modificación de método de pago en boleta'),
            cambios: [
              {
                campo: 'Método de Pago / Boleta',
                antes: String(ed.metodoAnterior || 'Original'),
                despues: String(ed.metodoNuevo || sale.metodoPago || 'Actualizado'),
              },
            ],
            createdAtTs: edTs,
            fechaStr: String(sale.fechaStr || ''),
          })
        })
      }
    }

    let records = [...saleEmergencyRecords, ...emergencyLogs, ...productEdits, ...saleEditRecords]
      .sort((a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0))

    if (!actor.isSupreme && actor.level !== 'alto') {
      records = records.filter((record: any) =>
        saleBelongsToCashier(record, { id: actor.workerId, name: actor.name })
      )
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
        const fStr = r.fechaStr ? String(r.fechaStr).slice(0, 10) : ''
        if (!rDate && !fStr) return true
        return inBounds(rDate) || inBounds(fStr)
      })
    }

    return NextResponse.json({ ok: true, records })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'No se pudieron cargar las modificaciones y precios especiales' },
      { status: 500 }
    )
  }
}
