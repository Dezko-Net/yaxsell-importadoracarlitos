'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Loader2, Download, Package, DollarSign, Percent } from 'lucide-react'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where, limit, type QueryConstraint } from 'firebase/firestore'
import { SEDES, SedeSlug } from '@/types'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0))

const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`

const todayCL = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
const daysAgoCL = (days: number) => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

type ItemRow = {
  sku: string
  nombre: string
  cantidad: number
  ventasBrutas: number
  costo: number
  ganancia: number
  noCosto: boolean
}

type DayRow = {
  fecha: string
  ventas: number
  costo: number
  ganancia: number
  count: number
  items: number
  sinCosto: number
}

export default function GananciasPage() {
  const [loading, setLoading] = useState(false)
  const [sede, setSede] = useState<SedeSlug>('donbalato-central')
  const [fechaDesde, setFechaDesde] = useState(daysAgoCL(6))
  const [fechaHasta, setFechaHasta] = useState(todayCL())
  const [rawVentas, setRawVentas] = useState<any[]>([])

  const loadVentas = async () => {
    setLoading(true)
    try {
      // 🔒 Blindaje: filtrar fechas y estado directamente en Firestore para evitar traer miles de docs
      const constraints: QueryConstraint[] = [
        where('fechaStr', '>=', fechaDesde),
        where('fechaStr', '<=', fechaHasta),
      ]
      // Central has legacy tickets without `sede`; keep that compatibility while
      // avoiding reads from the other branches for branch-specific reports.
      if (!matchBranchSlug(sede, 'donbalato-central')) {
        constraints.unshift(where('sede', 'in', branchSlugQueryValues(sede)))
      }
      constraints.push(limit(2500))
      const q = query(collection(db!, 'ventas_pos'), ...constraints)
      let snap
      try {
        snap = await getDocs(q)
      } catch (error) {
        if (matchBranchSlug(sede, 'donbalato-central')) throw error
        console.warn('[ERP ganancias] Índice por sucursal pendiente; consultando el rango y filtrando localmente:', error)
        snap = await getDocs(query(
          collection(db!, 'ventas_pos'),
          where('fechaStr', '>=', fechaDesde),
          where('fechaStr', '<=', fechaHasta),
          limit(2500)
        ))
      }
      const filtered: any[] = []
      snap.forEach(d => {
        const data = d.data()
        const cSede = data.sede || 'donbalato-central'
        const cEstado = data.estado || 'completada'
        if (cEstado === 'completada' && matchBranchSlug(cSede, sede)) {
          filtered.push({ id: d.id, ...data })
        }
      })
      setRawVentas(filtered)
    } catch (e) {
      console.error('Error cargando ventas:', e)
      setRawVentas([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadVentas() }, [sede, fechaDesde, fechaHasta])

  // Procesar ventas
  const { dayRows, productRows, totals } = useMemo(() => {
    const byDay = new Map<string, DayRow>()
    const byProduct = new Map<string, ItemRow>()

    for (const v of rawVentas) {
      const fecha = String(v.fechaStr || '').slice(0, 10)
      const items: any[] = v.itemsJson ? JSON.parse(v.itemsJson) : (v.items || [])

      let dayVentas = 0, dayCosto = 0, daySinCosto = 0

      for (const item of items) {
        const sku = String(item.sku || '').trim().toUpperCase()
        if (!sku) continue
        const nombre = String(item.nombre || '')
        const cantidad = Number(item.cantidad || 0)
        const ventasBrutas = Number(item.subtotal || 0)
        const costoUnit = Number(item.costoUnitario || 0)
        const costo = Math.round(cantidad * costoUnit)
        const ganancia = Math.round(ventasBrutas - costo)
        const noCosto = costoUnit <= 0

        if (noCosto) daySinCosto++

        dayVentas += ventasBrutas
        dayCosto += costo

        // Por producto
        const cur = byProduct.get(sku) || { sku, nombre, cantidad: 0, ventasBrutas: 0, costo: 0, ganancia: 0, noCosto: false }
        cur.cantidad += cantidad
        cur.ventasBrutas += ventasBrutas
        cur.costo += costo
        cur.ganancia += ganancia
        if (noCosto) cur.noCosto = true
        byProduct.set(sku, cur)
      }

      const dr = byDay.get(fecha) || { fecha, ventas: 0, costo: 0, ganancia: 0, count: 0, items: 0, sinCosto: 0 }
      dr.ventas += dayVentas
      dr.costo += dayCosto
      dr.ganancia += dayVentas - dayCosto
      dr.count += 1
      dr.items += items.length
      dr.sinCosto += daySinCosto
      byDay.set(fecha, dr)
    }

    const dayList = Array.from(byDay.values()).sort((a, b) => b.fecha.localeCompare(a.fecha))
    const productList = Array.from(byProduct.values()).sort((a, b) => b.ganancia - a.ganancia)

    const ventas = dayList.reduce((a, r) => a + r.ventas, 0)
    const costo = dayList.reduce((a, r) => a + r.costo, 0)
    const gan = dayList.reduce((a, r) => a + r.ganancia, 0)
    const count = dayList.reduce((a, r) => a + r.count, 0)
    const sinCosto = productList.filter(p => p.noCosto).length

    return { dayRows: dayList, productRows: productList, totals: { ventas, costo, ganancia: gan, count, sinCosto, margin: ventas > 0 ? (gan / ventas) * 100 : 0 } }
  }, [rawVentas])

  const topCantidad = useMemo(() => [...productRows].sort((a, b) => b.cantidad - a.cantidad).slice(0, 15), [productRows])
  const topGanancia = useMemo(() => [...productRows].sort((a, b) => b.ganancia - a.ganancia).slice(0, 15), [productRows])

  const onExport = async () => {
    const ExcelJS: any = (await import('exceljs')).default || (await import('exceljs'))
    const { saveAs }: any = await import('file-saver')

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Importadora Carlitos ERP'
    wb.created = new Date()

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E55' } }
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } }
    const moneyFmt = '"$"#,##0'

    const ws = wb.addWorksheet('RESUMEN')
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Ventas', key: 'ventas', width: 16 },
      { header: 'Costo', key: 'costo', width: 16 },
      { header: 'Ganancia', key: 'ganancia', width: 16 },
      { header: 'Margen %', key: 'margen', width: 12 },
      { header: 'Boletas', key: 'count', width: 10 },
      { header: 'Items', key: 'items', width: 10 },
      { header: 'Sin costo', key: 'sinCosto', width: 12 },
    ]
    dayRows.forEach(r => {
      ws.addRow({ ...r, margen: r.ventas > 0 ? ((r.ganancia / r.ventas) * 100).toFixed(1) + '%' : '0%' })
    })
    ws.getRow(1).eachCell((c: any) => { c.fill = headerFill; c.font = headerFont; c.alignment = { horizontal: 'center' } })

    const wsDet = wb.addWorksheet('DETALLE')
    wsDet.columns = [
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Nombre', key: 'nombre', width: 40 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Ventas Brutas', key: 'ventasBrutas', width: 16 },
      { header: 'Costo', key: 'costo', width: 16 },
      { header: 'Ganancia', key: 'ganancia', width: 16 },
      { header: 'Margen %', key: 'margen', width: 12 },
      { header: 'Sin costo', key: 'noCosto', width: 10 },
    ]
    productRows.forEach(p => {
      wsDet.addRow({ ...p, margen: p.ventasBrutas > 0 ? ((p.ganancia / p.ventasBrutas) * 100).toFixed(1) + '%' : '0%', noCosto: p.noCosto ? 'SI' : 'NO' })
    })
    wsDet.getRow(1).eachCell((c: any) => { c.fill = headerFill; c.font = headerFont; c.alignment = { horizontal: 'center' } })

    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `ganancias_${fechaDesde}_${fechaHasta}.xlsx`)
  }

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 pb-24 space-y-5 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp size={22} className="text-emerald-600" /> Ganancias POS
            </h1>
            <p className="text-sm text-slate-500">Ventas Brutas &minus; (Cantidad &times; Costo Unitario)</p>
          </div>
        </div>
        <button
          onClick={onExport}
          disabled={loading || productRows.length === 0}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:bg-slate-300"
        >
          <Download size={16} /> Exportar Excel
        </button>
      </div>

        {/* Filtros */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Sucursal</label>
              <select value={sede} onChange={e => setSede(e.target.value as SedeSlug)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {Object.entries(SEDES).map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Desde</label>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Hasta</label>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setFechaDesde(todayCL()); setFechaHasta(todayCL()) }} className="rounded-lg px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">Hoy</button>
              <button onClick={() => { setFechaDesde(daysAgoCL(6)); setFechaHasta(todayCL()) }} className="rounded-lg px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">7 d&iacute;as</button>
              <button onClick={() => { setFechaDesde(daysAgoCL(29)); setFechaHasta(todayCL()) }} className="rounded-lg px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">30 d&iacute;as</button>
            </div>
            {loading && <Loader2 className="animate-spin text-slate-400" size={20} />}
          </div>
        </div>

        {/* Cards de totales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1"><DollarSign size={14} /> Ventas Brutas</div>
            <div className="text-2xl font-bold text-slate-900">{fmtCLP(totals.ventas)}</div>
            <div className="text-xs text-slate-400 mt-1">{totals.count} boletas</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1"><Package size={14} /> Costo Productos</div>
            <div className="text-2xl font-bold text-rose-700">{fmtCLP(totals.costo)}</div>
            <div className="text-xs text-slate-400 mt-1">{productRows.length} SKU</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1"><TrendingUp size={14} /> Ganancia</div>
            <div className={`text-2xl font-bold ${totals.ganancia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCLP(totals.ganancia)}</div>
            <div className="text-xs text-slate-400 mt-1">{totals.sinCosto} sin costo</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1"><Percent size={14} /> Margen</div>
            <div className="text-2xl font-bold text-slate-900">{fmtPct(totals.margin)}</div>
            <div className="text-xs text-slate-400 mt-1">ganancia / ventas</div>
          </div>
        </div>

        {/* Resumen por dia */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm mb-6">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Resumen por D&iacute;a</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4 text-right">Ventas</th>
                  <th className="py-2 pr-4 text-right">Costo</th>
                  <th className="py-2 pr-4 text-right">Ganancia</th>
                  <th className="py-2 pr-4 text-right">Margen</th>
                  <th className="py-2 pr-4 text-right">Boletas</th>
                  <th className="py-2 pr-4 text-right">Sin costo</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map(r => (
                  <tr key={r.fecha} className="border-b hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium">{r.fecha}</td>
                    <td className="py-2 pr-4 text-right">{fmtCLP(r.ventas)}</td>
                    <td className="py-2 pr-4 text-right text-rose-700">{fmtCLP(r.costo)}</td>
                    <td className={`py-2 pr-4 text-right font-semibold ${r.ganancia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCLP(r.ganancia)}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{fmtPct(r.ventas > 0 ? (r.ganancia / r.ventas) * 100 : 0)}</td>
                    <td className="py-2 pr-4 text-right">{r.count}</td>
                    <td className="py-2 pr-4 text-right">{r.sinCosto > 0 ? <span className="text-amber-600 font-semibold">{r.sinCosto}</span> : 0}</td>
                  </tr>
                ))}
                {dayRows.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-slate-400">Sin datos para el per&iacute;odo seleccionado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top productos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Top 15 por Cantidad</h2>
            <div className="overflow-auto max-h-96">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3 text-right">Cant.</th>
                    <th className="py-2 pr-3 text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {topCantidad.map(p => (
                    <tr key={p.sku} className="border-b hover:bg-slate-50">
                      <td className="py-1.5 pr-3 text-xs font-mono text-slate-500">{p.sku}</td>
                      <td className="py-1.5 pr-3 text-xs">{p.nombre}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold">{p.cantidad}</td>
                      <td className={`py-1.5 pr-3 text-right ${p.ganancia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCLP(p.ganancia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Top 15 por Ganancia</h2>
            <div className="overflow-auto max-h-96">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3 text-right">Cant.</th>
                    <th className="py-2 pr-3 text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {topGanancia.map(p => (
                    <tr key={p.sku} className="border-b hover:bg-slate-50">
                      <td className="py-1.5 pr-3 text-xs font-mono text-slate-500">{p.sku}</td>
                      <td className="py-1.5 pr-3 text-xs">{p.nombre}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold">{p.cantidad}</td>
                      <td className={`py-1.5 pr-3 text-right font-semibold ${p.ganancia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCLP(p.ganancia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detalle completo */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm mt-6">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Detalle por Producto ({productRows.length} SKU)</h2>
          <div className="overflow-auto max-h-[600px]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3 text-right">Cantidad</th>
                  <th className="py-2 pr-3 text-right">Ventas</th>
                  <th className="py-2 pr-3 text-right">Costo</th>
                  <th className="py-2 pr-3 text-right">Ganancia</th>
                  <th className="py-2 pr-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map(p => (
                  <tr key={p.sku} className="border-b hover:bg-slate-50">
                    <td className="py-1.5 pr-3 text-xs font-mono text-slate-500">{p.sku}</td>
                    <td className="py-1.5 pr-3 text-xs">{p.nombre} {p.noCosto && <span className="text-amber-600 font-semibold">(sin costo)</span>}</td>
                    <td className="py-1.5 pr-3 text-right">{p.cantidad}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtCLP(p.ventasBrutas)}</td>
                    <td className="py-1.5 pr-3 text-right text-rose-700">{fmtCLP(p.costo)}</td>
                    <td className={`py-1.5 pr-3 text-right font-semibold ${p.ganancia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCLP(p.ganancia)}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{fmtPct(p.ventasBrutas > 0 ? (p.ganancia / p.ventasBrutas) * 100 : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  )
}
