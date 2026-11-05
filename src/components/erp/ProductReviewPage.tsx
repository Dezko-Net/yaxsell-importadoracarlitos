'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Check, DollarSign, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { clearPosProductsCache, fetchAllFirebaseErpProducts, updateFirebaseErpProduct, type FirebaseErpProduct } from '@/lib/firebaseErpService'

type ReviewMode = 'prices' | 'costs'

const money = (value: number) => `$${Math.round(value || 0).toLocaleString('es-CL')}`
const activeProduct = (p: FirebaseErpProduct) => p.isactive !== false && !p.is_draft && p.status !== 'draft' && p.precio_venta_1 > 0

export default function ProductReviewPage({ mode }: { mode: ReviewMode }) {
  const [products, setProducts] = useState<FirebaseErpProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FirebaseErpProduct | null>(null)
  const [editCost, setEditCost] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const isPrices = mode === 'prices'

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true)
    try {
      const rows = await fetchAllFirebaseErpProducts(force)
      setProducts(rows.filter(activeProduct))
    } catch (error) {
      console.error('[ProductReviewPage] load failed', error)
      setNotice('No se pudieron cargar los productos. Intenta actualizar.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const risks = useMemo(() => products.map(product => {
    const cost = Math.round(Number(product.costo_uni) || 0)
    const price = Math.round(Number(product.precio_venta_1) || 0)
    const profit = price - cost
    const margin = price > 0 ? profit / price * 100 : 0
    return { product, cost, price, profit, margin }
  }), [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es-CL')
    let rows = risks.filter(row => {
      if (isPrices && row.cost <= 0) return false
      if (!isPrices && row.cost > 0 && row.profit >= 0) return false
      const p = row.product
      return !q || [p.nombre, p.sku, p.codigo_barra, p.category].some(v => String(v || '').toLocaleLowerCase('es-CL').includes(q))
    })
    rows = rows.sort((a, b) => isPrices ? a.margin - b.margin || a.profit - b.profit : a.cost === 0 ? 1 : b.cost === 0 ? -1 : a.profit - b.profit)
    return rows
  }, [risks, search, isPrices])

  const lossCount = risks.filter(r => r.cost > 0 && r.profit < 0).length
  const noCostCount = risks.filter(r => r.cost <= 0).length
  const lowMarginCount = risks.filter(r => r.cost > 0 && r.profit >= 0 && r.margin < 15).length

  const startEdit = (product: FirebaseErpProduct) => {
    setSelected(product)
    setEditCost(String(Math.round(Number(product.costo_uni) || 0)))
    setEditPrice(String(Math.round(Number(product.precio_venta_1) || 0)))
    setNotice('')
  }

  const saveEdit = async () => {
    if (!selected) return
    const cost = Number(editCost)
    const price = Number(editPrice)
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) {
      setNotice('Ingresa un costo válido y un precio efectivo mayor que cero.')
      return
    }
    setSaving(true)
    try {
      const ok = await updateFirebaseErpProduct(selected.$id, { sku: selected.sku, costo_uni: Math.round(cost), precio_venta_1: Math.round(price) })
      if (!ok) throw new Error('No se pudo guardar el producto.')
      clearPosProductsCache()
      setProducts(current => current.map(p => p.$id === selected.$id ? { ...p, costo_uni: Math.round(cost), precio_venta_1: Math.round(price) } : p))
      setSelected(null)
      setNotice(`Guardado: ${selected.nombre}`)
    } catch (error) {
      console.error('[ProductReviewPage] update failed', error)
      setNotice('No se pudo guardar el cambio. Revisa la conexión y vuelve a intentar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 sm:p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-5">
        <Link href="/erp-dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft size={16} /> Volver al dashboard
        </Link>

        <header className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-slate-900 ${isPrices ? 'border-amber-200' : 'border-rose-200'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-3 ${isPrices ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                {isPrices ? <DollarSign size={22} /> : <AlertTriangle size={22} />}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Costos y precios</p>
                <h1 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{isPrices ? 'Productos con menor ganancia' : 'Productos con precio bajo su costo'}</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  {isPrices ? 'Ordenados por margen unitario más bajo. El cálculo usa el precio P1 en efectivo y el costo unitario del catálogo.' : 'Productos cuyo precio P1 en efectivo es menor que el costo unitario, más productos que no tienen costo registrado.'}
                </p>
              </div>
            </div>
            <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Metric label="Productos activos" value={risks.length.toLocaleString('es-CL')} />
            <Metric label="Margen menor al 15%" value={lowMarginCount.toLocaleString('es-CL')} tone="amber" />
            <Metric label="Bajo costo / sin costo" value={`${lossCount.toLocaleString('es-CL')} / ${noCostCount.toLocaleString('es-CL')}`} tone="rose" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/erp-dashboard/revision-precios" className={`rounded-lg px-3 py-2 text-xs font-bold ${isPrices ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>Rev. Precios</Link>
            <Link href="/erp-dashboard/revision-costos" className={`rounded-lg px-3 py-2 text-xs font-bold ${!isPrices ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>Rev. Costos</Link>
            <Link href="/erp-dashboard/base-datos" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">Base de datos</Link>
          </div>
        </header>

        {notice && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">{notice}</div>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="relative w-full sm:max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto, SKU o código..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <p className="text-sm text-slate-500">{loading ? 'Cargando productos…' : `${filtered.length.toLocaleString('es-CL')} productos en esta revisión`}</p>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando catálogo</div> : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left">Producto</th><th className="px-3 py-3 text-left">SKU</th>
                    <th className="px-3 py-3 text-right">Costo unitario</th><th className="px-3 py-3 text-right">P1 efectivo</th>
                    <th className="px-3 py-3 text-right">Margen / unidad</th><th className="px-3 py-3 text-right">Margen %</th><th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(({ product, cost, price, profit, margin }) => (
                    <tr key={product.$id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60">
                      <td className="max-w-[360px] px-4 py-3"><div className="truncate font-semibold text-slate-800 dark:text-slate-100" title={product.nombre}>{product.nombre}</div><div className="mt-0.5 text-xs text-slate-400">{product.category || 'Sin categoría'}{product.stock > 0 ? ` · Stock ${product.stock.toLocaleString('es-CL')}` : ''}</div></td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">{product.sku || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{cost ? money(cost) : <span className="font-bold text-rose-600">Sin costo</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{money(price)}</td>
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${profit < 0 ? 'text-rose-600' : profit < 500 ? 'text-amber-600' : 'text-emerald-700'}`}>{profit < 0 ? '−' : '+'}{money(Math.abs(profit))}</td>
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${margin < 0 ? 'text-rose-600' : margin < 15 ? 'text-amber-600' : 'text-emerald-700'}`}>{cost > 0 ? `${margin.toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => startEdit(product)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200">Corregir</button></td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-500">{isPrices ? 'No hay productos para mostrar.' : 'No se encontraron productos con pérdida o sin costo.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setSelected(null) }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Corregir producto</h2><p className="mt-1 text-sm text-slate-500">{selected.nombre} · {selected.sku}</p></div><button onClick={() => setSelected(null)} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button></div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-500">Costo unitario<input type="number" min="0" value={editCost} onChange={e => setEditCost(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-bold text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold text-slate-500">P1 · Efectivo<input type="number" min="1" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-bold text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            </div>
            <p className="mt-3 text-xs text-slate-400">El precio P2 (embalaje) se conserva sin cambios.</p>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setSelected(null)} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button><button onClick={() => void saveEdit()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar</button></div>
          </div>
        </div>}
      </div>
    </main>
  )
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' | 'rose' }) {
  const colors = tone === 'amber' ? 'border-amber-100 bg-amber-50 text-amber-800' : tone === 'rose' ? 'border-rose-100 bg-rose-50 text-rose-800' : 'border-slate-100 bg-slate-50 text-slate-800'
  return <div className={`rounded-xl border px-4 py-3 ${colors}`}><p className="text-xs font-semibold opacity-70">{label}</p><p className="mt-1 text-xl font-black tabular-nums">{value}</p></div>
}
