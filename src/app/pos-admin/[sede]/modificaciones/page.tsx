'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { auth, authReady } from '@/lib/firebase'
import { DEFAULT_SEDE, SEDES, type SedeSlug } from '@/types'
import {
  RefreshCw,
  Edit3,
  Zap,
  Package,
  ReceiptText,
  Calendar,
  Search,
  X,
  User,
  ArrowRight,
  Download,
  Eye,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Barcode,
} from 'lucide-react'

type ModificacionKind = 'precio_emergencia' | 'edicion_producto' | 'edicion_boleta'

interface CambioDetalle {
  campo: string
  antes: string
  despues: string
}

interface ModificacionRecord {
  id: string
  movementId?: string
  saleId?: string | null
  boletaNumero?: number | string | null
  sede?: string
  tipo: ModificacionKind
  subtipo?: string
  tipoLabel?: string
  sku: string
  skuAnterior?: string | null
  nombreProducto: string
  cajeroNombre: string
  clienteNombre?: string
  rolUsuario?: string
  nota: string
  precioOriginal?: number
  precioEmergencia?: number
  costoUnitario?: number
  cantidad?: number
  montoInvolucrado?: number
  gananciaGenerada?: number
  codigo_barra?: string
  packageQty?: string
  cambios?: CambioDetalle[]
  createdAtTs: number
  fechaStr?: string
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
    Math.round(n || 0)
  )

const toSantiagoYmd = (date: Date): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(date)
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
}

const formatShortDateTime = (ts?: number, fallbackDate?: string) => {
  const num = Number(ts || 0)
  if (num > 0) {
    try {
      const d = new Date(num)
      const datePart = new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Santiago',
      })
        .format(d)
        .replace('.', '')
      const timePart = new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Santiago',
      }).format(d)
      return { datePart, timePart, full: `${datePart} · ${timePart}` }
    } catch {}
  }
  return {
    datePart: fallbackDate || 'Sin fecha',
    timePart: '',
    full: fallbackDate || 'Sin fecha',
  }
}

export default function PosModificacionesPage() {
  const params = useParams<{ sede: string }>()
  const sede = String(params?.sede || DEFAULT_SEDE) as SedeSlug
  const branchName = SEDES[sede] || sede.replace(/-/g, ' ')

  const [records, setRecords] = useState<ModificacionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<ModificacionRecord | null>(null)

  const { todayStr, yesterdayStr, sevenDaysAgoStr, firstOfMonthStr } = useMemo(() => {
    const today = toSantiagoYmd(new Date())
    const [y, m, d] = today.split('-').map(Number)
    const base = new Date(y, m - 1, d, 12)

    const yest = new Date(base)
    yest.setDate(base.getDate() - 1)

    const week = new Date(base)
    week.setDate(base.getDate() - 6)

    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    return {
      todayStr: today,
      yesterdayStr: toSantiagoYmd(yest),
      sevenDaysAgoStr: toSantiagoYmd(week),
      firstOfMonthStr: monthStart,
    }
  }, [])

  const [fechaDesde, setFechaDesde] = useState<string>(firstOfMonthStr)
  const [fechaHasta, setFechaHasta] = useState<string>(todayStr)
  const [filterTipo, setFilterTipo] = useState<'todos' | ModificacionKind>('todos')
  const [searchTerm, setSearchTerm] = useState('')

  const loadRecords = useCallback(
    async (desde = fechaDesde, hasta = fechaHasta) => {
      setLoading(true)
      setError('')
      try {
        await authReady
        let user = auth.currentUser
        if (!user) {
          user = await new Promise(resolve => {
            const unsub = auth.onAuthStateChanged(u => {
              unsub()
              resolve(u)
            })
            setTimeout(() => {
              unsub()
              resolve(auth.currentUser)
            }, 1500)
          })
        }
        const token = await user?.getIdToken()
        if (!token) throw new Error('Inicia sesión para consultar el registro de modificaciones.')

        const url = new URL('/api/pos/modificaciones', window.location.origin)
        url.searchParams.set('sede', sede)
        if (desde) url.searchParams.set('startDate', desde)
        if (hasta) url.searchParams.set('endDate', hasta)

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'No se pudieron cargar las modificaciones.')
        }
        setRecords(Array.isArray(payload.records) ? payload.records : [])
      } catch (err: any) {
        setError(err?.message || 'Error al consultar las modificaciones.')
      } finally {
        setLoading(false)
      }
    },
    [fechaDesde, fechaHasta, sede]
  )

  useEffect(() => {
    loadRecords(fechaDesde, fechaHasta)
  }, [loadRecords, fechaDesde, fechaHasta])

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return records.filter(r => {
      if (filterTipo !== 'todos' && r.tipo !== filterTipo) return false
      if (!q) return true
      const cambiosStr = (r.cambios || []).map(c => `${c.campo} ${c.antes} ${c.despues}`).join(' ')
      const haystack = `${r.sku} ${r.nombreProducto} ${r.cajeroNombre} ${r.nota} ${r.boletaNumero || ''} ${r.codigo_barra || ''} ${cambiosStr}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [records, filterTipo, searchTerm])

  const stats = useMemo(() => {
    let totalEmergencia = 0
    let totalEdicionesProd = 0
    let totalEdicionesBoleta = 0
    let montoVentasEmergencia = 0
    let gananciaEmergencia = 0

    for (const r of filteredRecords) {
      if (r.tipo === 'precio_emergencia') {
        totalEmergencia++
        montoVentasEmergencia += Number(r.montoInvolucrado || 0)
        gananciaEmergencia += Number(r.gananciaGenerada || 0)
      } else if (r.tipo === 'edicion_producto') {
        totalEdicionesProd++
      } else if (r.tipo === 'edicion_boleta') {
        totalEdicionesBoleta++
      }
    }

    return {
      total: filteredRecords.length,
      totalEmergencia,
      totalEdicionesProd,
      totalEdicionesBoleta,
      montoVentasEmergencia,
      gananciaEmergencia,
    }
  }, [filteredRecords])

  const exportCsv = () => {
    if (filteredRecords.length === 0) return
    const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['Fecha y Hora', 'Tipo', 'SKU', 'Producto', 'Cajera / Autorizado por', 'Detalle / Cambios', 'Precio Emergencia', 'Ganancia', 'Boleta']
    const rows = filteredRecords.map(r => {
      const dt = formatShortDateTime(r.createdAtTs, r.fechaStr).full
      const cambiosTxt = (r.cambios || []).map(c => `${c.campo}: ${c.antes} -> ${c.despues}`).join(' | ') || r.nota
      return [
        dt,
        r.tipoLabel || r.tipo,
        r.sku,
        r.nombreProducto,
        r.cajeroNombre,
        cambiosTxt,
        r.precioEmergencia ? r.precioEmergencia : '',
        r.gananciaGenerada !== undefined ? r.gananciaGenerada : '',
        r.boletaNumero ? `#${r.boletaNumero}` : '',
      ].map(csvEscape).join(';')
    })
    const csv = '\uFEFF' + [headers.map(csvEscape).join(';'), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ediciones_precios_pos_${sede}_${fechaDesde || 'inicio'}_${fechaHasta || 'hoy'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderBadge = (tipo: ModificacionKind, subtipo?: string) => {
    if (tipo === 'precio_emergencia') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
          <Zap size={12} className="text-amber-600 fill-amber-500 shrink-0" />
          {subtipo === 'venta_cerrada' ? 'Venta Precio Emergencia' : 'Precio Emergencia'}
        </span>
      )
    }
    if (tipo === 'edicion_producto') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[11px] font-extrabold text-teal-800">
          <Edit3 size={12} className="text-teal-600 shrink-0" />
          Edición Producto
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-[11px] font-extrabold text-sky-800">
        <ReceiptText size={12} className="text-sky-600 shrink-0" />
        Edición Boleta
      </span>
    )
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Encabezado */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-500">
            <span className="uppercase tracking-wider text-teal-700 font-extrabold">{branchName}</span>
            <span>/</span>
            <span>Auditoría de Caja y Catálogo</span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              loading ? 'bg-amber-50 text-amber-700' : error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : error ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              {loading ? 'Sincronizando…' : error ? 'Atención' : 'En línea'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Ediciones y Precios Especiales
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
            Registro completo de precios de emergencia o borrador aplicados en ventas, y ediciones rápidas de productos (precios, SKU, código de barras, unidades por embalaje) hechas por cajeras de Nivel Alto.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link
            href={`/pos-admin/${sede}/devoluciones`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <RotateCcw size={14} />
            <span>Devoluciones y Anulaciones</span>
          </Link>
          <button
            type="button"
            onClick={() => loadRecords(fechaDesde, fechaHasta)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#087f73] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#06695f] disabled:opacity-50 transition cursor-pointer shadow-xs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </header>

      {/* Tarjetas de resumen KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Total Registros</span>
            <Edit3 size={16} className="text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 tabular-nums">{stats.total}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Modificaciones en el periodo</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
            <span>Precios Emergencia</span>
            <Zap size={16} className="text-amber-600 fill-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-950 tabular-nums">{stats.totalEmergencia}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-amber-800/80">
            Ventas: {fmtCLP(stats.montoVentasEmergencia)}
          </p>
        </div>

        <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-teal-900">
            <span>Ediciones de Producto</span>
            <Package size={16} className="text-teal-700" />
          </div>
          <p className="mt-2 text-2xl font-black text-teal-950 tabular-nums">{stats.totalEdicionesProd}</p>
          <p className="mt-0.5 text-[11px] text-teal-800/80">SKU, código, embalaje o precios</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
            <span>Ganancia Precios Esp.</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-950 tabular-nums">{fmtCLP(stats.gananciaEmergencia)}</p>
          <p className="mt-0.5 text-[11px] text-emerald-800/80">Precio personalizado menos costo</p>
        </div>
      </div>

      {/* Barra de filtros de fecha y búsqueda */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Presets de fecha */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: 'Hoy', d: todayStr, h: todayStr },
              { label: 'Ayer', d: yesterdayStr, h: yesterdayStr },
              { label: '7 días', d: sevenDaysAgoStr, h: todayStr },
              { label: 'Este mes', d: firstOfMonthStr, h: todayStr },
              { label: 'Todo', d: '', h: '' },
            ].map(p => {
              const active = fechaDesde === p.d && fechaHasta === p.h
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setFechaDesde(p.d)
                    setFechaHasta(p.h)
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#087f73] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Rango manual Desde - Hasta */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Calendar size={13} className="text-slate-400" />
              <span>Desde</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Calendar size={13} className="text-slate-400" />
              <span>Hasta</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 outline-none"
              />
            </label>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredRecords.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <Download size={13} />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Pestañas de tipo + Buscador */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'todos', label: `Todos (${records.length})` },
              { id: 'precio_emergencia', label: '⚡ Precios Emergencia' },
              { id: 'edicion_producto', label: '📦 Ediciones de Producto' },
              { id: 'edicion_boleta', label: '🧾 Ediciones de Boleta' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTipo(tab.id as any)}
                className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  filterTipo === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por cajera, SKU, producto…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:border-teal-600 focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Estado de error o carga */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3 text-rose-800 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadRecords(fechaDesde, fechaHasta)}
            className="rounded-xl bg-white border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-2">
          <RefreshCw size={24} className="mx-auto animate-spin text-teal-600" />
          <p className="text-sm font-bold text-slate-700">Cargando historial de modificaciones y precios especiales…</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-2">
          <Edit3 size={32} className="mx-auto text-slate-300" />
          <p className="text-base font-bold text-slate-800">Sin modificaciones en este rango</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cuando una cajera de Nivel Alto edite un producto desde el POS o aplique un precio de emergencia/personalizado en una venta, aparecerá registrado aquí con fecha, hora y detalle.
          </p>
        </div>
      ) : (
        <>
          {/* Tabla Desktop */}
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Fecha / Hora</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Producto / SKU</th>
                    <th className="py-3 px-4">Cajera</th>
                    <th className="py-3 px-4">Qué se modificó (Antes → Después)</th>
                    <th className="py-3 px-4 text-right">Monto / Ganancia</th>
                    <th className="py-3 px-4 text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredRecords.map(r => {
                    const dt = formatShortDateTime(r.createdAtTs, r.fechaStr)
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{dt.datePart}</div>
                          <div className="text-[11px] text-slate-400">{dt.timePart}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {renderBadge(r.tipo, r.subtipo)}
                          {r.boletaNumero ? (
                            <div className="mt-1 text-[10px] font-mono font-bold text-slate-500">
                              Boleta #{r.boletaNumero}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-4 max-w-[220px]">
                          <div className="font-bold text-slate-900 truncate" title={r.nombreProducto}>
                            {r.nombreProducto}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mt-0.5">
                            <span>SKU: {r.sku}</span>
                            {r.skuAnterior && <span className="text-rose-600">(era {r.skuAnterior})</span>}
                            {r.packageQty && <span className="text-sky-700 font-sans font-bold">· {r.packageQty}u/emb</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                            <User size={13} className="text-teal-600 shrink-0" />
                            <span>{r.cajeroNombre}</span>
                          </div>
                          {r.rolUsuario && (
                            <div className="text-[10px] text-slate-400 font-semibold">{r.rolUsuario}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[340px]">
                          {Array.isArray(r.cambios) && r.cambios.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {r.cambios.slice(0, 3).map((c, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-[11px]"
                                >
                                  <strong className="text-slate-700">{c.campo}:</strong>
                                  <span className="text-slate-500 line-through">{c.antes}</span>
                                  <ArrowRight size={10} className="text-slate-400 shrink-0" />
                                  <strong className="text-emerald-700">{c.despues}</strong>
                                </span>
                              ))}
                              {r.cambios.length > 3 && (
                                <span className="text-[10px] font-bold text-teal-700">
                                  +{r.cambios.length - 3} más
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 line-clamp-2">{r.nota}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {r.tipo === 'precio_emergencia' ? (
                            <div>
                              <div className="font-black text-amber-900 tabular-nums">
                                {fmtCLP(r.montoInvolucrado || r.precioEmergencia || 0)}
                              </div>
                              {r.gananciaGenerada !== undefined && (
                                <div className={`text-[10px] font-bold tabular-nums ${r.gananciaGenerada >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  Ganancia: {fmtCLP(r.gananciaGenerada)}
                                </div>
                              )}
                            </div>
                          ) : r.montoInvolucrado ? (
                            <span className="font-bold text-slate-800 tabular-nums">{fmtCLP(r.montoInvolucrado)}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(r)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Ver</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarjetas Mobile */}
          <div className="md:hidden space-y-2.5">
            {filteredRecords.map(r => {
              const dt = formatShortDateTime(r.createdAtTs, r.fechaStr)
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRecord(r)}
                  className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5 active:scale-[0.99] transition cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    {renderBadge(r.tipo, r.subtipo)}
                    <span className="text-[11px] font-bold text-slate-500">{dt.full}</span>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900 leading-snug">{r.nombreProducto}</h3>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 mt-0.5">
                      <span>SKU: {r.sku}</span>
                      {r.boletaNumero ? <span>· Boleta #{r.boletaNumero}</span> : null}
                    </div>
                  </div>

                  {Array.isArray(r.cambios) && r.cambios.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {r.cambios.map((c, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px]"
                        >
                          <strong className="text-slate-700">{c.campo}:</strong>
                          <span className="text-slate-500 line-through">{c.antes}</span>
                          <ArrowRight size={10} className="text-slate-400" />
                          <strong className="text-emerald-700">{c.despues}</strong>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">{r.nota}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                      <User size={13} className="text-teal-600" />
                      {r.cajeroNombre}
                    </span>
                    {r.tipo === 'precio_emergencia' && (
                      <div className="text-right">
                        <span className="font-black text-amber-900">{fmtCLP(r.montoInvolucrado || r.precioEmergencia || 0)}</span>
                        {r.gananciaGenerada !== undefined && (
                          <span className="ml-1.5 text-[10px] font-bold text-emerald-700">
                            (Gan: {fmtCLP(r.gananciaGenerada)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modal de detalle */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                {renderBadge(selectedRecord.tipo, selectedRecord.subtipo)}
                <h2 className="mt-2 text-lg font-black text-slate-900 leading-snug">
                  {selectedRecord.nombreProducto}
                </h2>
                <p className="text-xs font-mono text-slate-500">SKU: {selectedRecord.sku}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="grid h-8 w-8 place-content-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 rounded-2xl p-3.5 border border-slate-200/70">
              <div>
                <span className="text-slate-400 font-semibold block">Realizado por</span>
                <strong className="text-slate-900">{selectedRecord.cajeroNombre}</strong>
                {selectedRecord.rolUsuario && (
                  <span className="block text-[10px] text-teal-700 font-bold">{selectedRecord.rolUsuario}</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Fecha y hora</span>
                <strong className="text-slate-900">
                  {formatShortDateTime(selectedRecord.createdAtTs, selectedRecord.fechaStr).full}
                </strong>
              </div>
              {selectedRecord.codigo_barra && (
                <div>
                  <span className="text-slate-400 font-semibold block">Código de barras</span>
                  <strong className="font-mono text-slate-900">{selectedRecord.codigo_barra}</strong>
                </div>
              )}
              {selectedRecord.packageQty && (
                <div>
                  <span className="text-slate-400 font-semibold block">Unidades por embalaje</span>
                  <strong className="text-sky-800">{selectedRecord.packageQty} uds/caja</strong>
                </div>
              )}
              {selectedRecord.boletaNumero ? (
                <div>
                  <span className="text-slate-400 font-semibold block">Boleta asociada</span>
                  <strong className="font-mono text-slate-900">#{selectedRecord.boletaNumero}</strong>
                </div>
              ) : null}
              {selectedRecord.tipo === 'precio_emergencia' && (
                <div>
                  <span className="text-slate-400 font-semibold block">Ganancia registrada</span>
                  <strong className="text-emerald-700">{fmtCLP(selectedRecord.gananciaGenerada || 0)}</strong>
                </div>
              )}
            </div>

            {Array.isArray(selectedRecord.cambios) && selectedRecord.cambios.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Detalle de modificaciones
                </h3>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                  {selectedRecord.cambios.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white text-xs">
                      <span className="font-bold text-slate-700">{c.campo}</span>
                      <div className="flex items-center gap-2 text-right">
                        <span className="text-slate-400 line-through">{c.antes}</span>
                        <ArrowRight size={12} className="text-slate-400 shrink-0" />
                        <strong className="text-emerald-700 font-extrabold">{c.despues}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3 text-xs text-amber-950">
              <strong className="block text-[11px] uppercase tracking-wider text-amber-800 mb-0.5">
                Nota de auditoría
              </strong>
              {selectedRecord.nota}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {selectedRecord.boletaNumero ? (
                <Link
                  href={`/pos-admin/${sede}/ventas?search=${selectedRecord.boletaNumero}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"
                >
                  <ReceiptText size={14} />
                  <span>Ver boleta #{selectedRecord.boletaNumero}</span>
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
