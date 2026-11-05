'use client'

import React, { useEffect, useMemo, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, TrendingUp, TrendingDown, DollarSign, Search,
  LayoutGrid, List as ListIcon, Table as TableIcon, Download, Printer, Target,
  Trophy, Award, AlertTriangle, Sparkles, ShoppingBag, ClipboardList,
  BarChart2, FileText, StickyNote, Share2, ChevronDown, ChevronUp, SortAsc,
  Banknote, CreditCard, ArrowLeftRight, Clock, Flame, Eye, EyeOff
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore'
import { SEDES, SEDE_SLUGS, type SedeSlug } from '@/types'
import { fetchCuadresERP, type CuadreERP } from '@/lib/cuadresErpService'
import { fetchAllFirebaseErpProducts } from '@/lib/firebaseErpService'
import { obtenerGastosQueAfectanGanancia, sumarGastosMercaderia } from '@/lib/gastosProfit'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend,
} from 'recharts'

/* =======================================================================
 *  Tipos
 * ===================================================================== */
interface DayData {
  date: string           // YYYY-MM-DD
  ventas: number
  gastos: number
  mercaderia: number
  ganancia: number
  efectivo: number
  debito: number
  transferencia: number
  unidades: number
  topProducts: { sku: string; name: string; cantidad: number; ventas: number }[]
}

interface SucursalData {
  slug: string
  name: string
  icon: string
  color: string
  days: DayData[]          // ordenado de más reciente [0] a más antiguo [29]
}

type RangeKey = 'hoy' | 'ayer' | '7d' | '30d' | 'mes'
type SortKey = 'ventas' | 'ganancia' | 'margen' | 'nombre'
type ViewKey = 'grid' | 'list' | 'table'

/* =======================================================================
 *  Helpers y config
 * ===================================================================== */
const colorClasses: Record<string, { bg: string; text: string; border: string; light: string; ring: string; chart: string }> = {
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50', ring: 'ring-emerald-300', chart: '#10b981' },
  blue:    { bg: 'bg-blue-500',    text: 'text-blue-600',    border: 'border-blue-200',    light: 'bg-blue-50',    ring: 'ring-blue-300',    chart: '#3b82f6' },
  pink:    { bg: 'bg-pink-500',    text: 'text-pink-600',    border: 'border-pink-200',    light: 'bg-pink-50',    ring: 'ring-pink-300',    chart: '#ec4899' },
  green:   { bg: 'bg-green-500',   text: 'text-green-600',   border: 'border-green-200',   light: 'bg-green-50',   ring: 'ring-green-300',   chart: '#22c55e' },
  amber:   { bg: 'bg-amber-500',   text: 'text-amber-600',   border: 'border-amber-200',   light: 'bg-amber-50',   ring: 'ring-amber-300',   chart: '#f59e0b' },
  violet:  { bg: 'bg-violet-500',  text: 'text-violet-600',  border: 'border-violet-200',  light: 'bg-violet-50',  ring: 'ring-violet-300',  chart: '#8b5cf6' },
  lime:    { bg: 'bg-lime-500',    text: 'text-lime-600',    border: 'border-lime-200',    light: 'bg-lime-50',    ring: 'ring-lime-300',    chart: '#84cc16' },
  orange:  { bg: 'bg-orange-500',  text: 'text-orange-600',  border: 'border-orange-200',  light: 'bg-orange-50',  ring: 'ring-orange-300',  chart: '#f97316' },
}

const getBranchConfig = (slug: string) => {
  const configs: Record<string, { icon: string; color: string }> = {
    'donbalato-central':  { icon: '🏪', color: 'emerald' },
    'chacabuco-08':       { icon: '🏬', color: 'blue' },
    'alameda':            { icon: '🌳', color: 'green' },
    'copiapo':            { icon: '🏜️', color: 'amber' },
    'la-florida':         { icon: '🌺', color: 'pink' },
  }
  return configs[slug] || { icon: '🏪', color: 'emerald' }
}

const formatCompact = (n: number) => {
  if (!isFinite(n)) return '$0'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n))
  return `${sign}$${abs.toLocaleString('es-CL')}`
}

const formatMoney = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL')

const pad = (n: number) => String(n).padStart(2, '0')

const makeDateISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const dateFromISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const weekdayShort = (d: Date) => ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()]

const META_KEY = 'sucursales:metaDiaria'
const NOTES_KEY = 'sucursales:notes'

const Link = ({ to, children, ...rest }: any) => {
  let href = to
  if (href.startsWith('/_admin')) href = href.replace('/_admin', '/cuadres')
  else if (href.startsWith('/cajeras')) href = href.replace('/cajeras', '/cuadres/nuevo')
  return <NextLink href={href} {...rest}>{children}</NextLink>
}

/* =======================================================================
 *  Página Principal de Sucursales
 * ===================================================================== */
export default function SucursalesPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<RangeKey>('hoy')
  const [sucursalesData, setSucursalesData] = useState<SucursalData[]>([])
  const [costsBD, setCostsBD] = useState<Map<string, number>>(new Map())
  const [minus10Flags, setMinus10Flags] = useState<Set<string>>(new Set())

  // UI state
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('ventas')
  const [view, setView] = useState<ViewKey>('grid')
  const [showChart, setShowChart] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [hiddenSedes, setHiddenSedes] = useState<Set<string>>(new Set())
  const [metaDiaria, setMetaDiaria] = useState<number>(500000)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple')

  useEffect(() => {
    setMounted(true)
    try {
      const savedMeta = Number(localStorage.getItem(META_KEY))
      if (savedMeta > 0) setMetaDiaria(savedMeta)
      const savedNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')
      if (savedNotes && typeof savedNotes === 'object') setNotes(savedNotes)
      const savedMode = localStorage.getItem('sucursales:viewMode') as 'simple' | 'advanced'
      if (savedMode) setViewMode(savedMode)
    } catch {}
  }, [])

  const isSimple = viewMode === 'simple'
  useEffect(() => {
    if (mounted) {
      try { localStorage.setItem('sucursales:viewMode', viewMode) } catch {}
    }
  }, [viewMode, mounted])

  /* ---------- Lista dinámica de sucursales ---------- */
  const SUCURSALES = useMemo(() => {
    const rawSlugs = Array.from(new Set(SEDE_SLUGS))
    return rawSlugs.map(slug => {
      const config = getBranchConfig(slug)
      return {
        slug,
        name: SEDES[slug] || slug,
        icon: config.icon,
        color: config.color,
      }
    })
  }, [])

  /* ---------- Carga de costos de productos ---------- */
  useEffect(() => {
    ;(async () => {
      try {
        const prods = await fetchAllFirebaseErpProducts()
        const costs = new Map<string, number>()
        const flags = new Set<string>()
        prods.forEach(p => {
          const sku = String(p.sku || '').trim().toUpperCase()
          if (sku && p.costo_uni > 0) costs.set(sku, p.costo_uni)
        })
        setCostsBD(costs)
        setMinus10Flags(flags)
      } catch (err) {
        console.warn('[Sucursales] Error cargando costos:', err)
      }
    })()
  }, [])

  /* ---------- Carga de 30 días para todas las sedes ---------- */
  useEffect(() => {
    let cancel = false
    const load = async () => {
      setLoading(true)
      try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayStr = makeDateISO(today)

        // 1. Cargar cuadres históricos de Firestore (últimos 3 meses)
        const cuadresHist = await fetchCuadresERP(3)
        const cuadresMap = new Map<string, CuadreERP>()
        cuadresHist.forEach(c => {
          if (c.sede && c.fecha) {
            cuadresMap.set(`${c.sede}__${c.fecha}`, c)
          }
        })

        // 2. Cargar sesión de caja activa de hoy si existe (para donbalato-central y chacabuco-08)
        const activeSessionsMap = new Map<string, any>()
        if (db) {
          try {
            await Promise.all(
              SUCURSALES.map(async (suc) => {
                const docRef = doc(db!, 'caja_sesiones', `active_${suc.slug}`)
                const snap = await getDoc(docRef)
                if (snap.exists()) {
                  activeSessionsMap.set(suc.slug, snap.data())
                }
              })
            )
          } catch (e) {
            console.warn('[Sucursales] No se pudieron cargar sesiones activas:', e)
          }
        }

        const tasks = SUCURSALES.map(async suc => {
          const days: DayData[] = []

          // Generar los últimos 30 días de más reciente [0] a más antiguo [29]
          for (let i = 0; i < 30; i++) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            const dateStr = makeDateISO(d)
            const isToday = dateStr === todayStr

            let ventas = 0
            let gastos = 0
            let mercaderia = 0
            let ganancia = 0
            let efectivo = 0
            let debito = 0
            let transferencia = 0
            let totUnidades = 0
            const tops: DayData['topProducts'] = []

            // A) Verificar si hay cuadre registrado en cuadres_erp
            const cuadre = cuadresMap.get(`${suc.slug}__${dateStr}`)
            if (cuadre) {
              efectivo = Number(cuadre.montos?.efectivoSistema) || Number(cuadre.montos?.efectivoReal) || 0
              debito = Number(cuadre.montos?.debitoSistema) || Number(cuadre.montos?.debitoReal) || 0
              transferencia = Number(cuadre.montos?.transferencias) || 0
              ventas = efectivo + debito + transferencia || Number(cuadre.calculos?.totalBruto) || 0
              const gastosDetalleTotal = Array.isArray(cuadre.gastos)
                ? cuadre.gastos.reduce((sum, gasto) => sum + (Number(gasto?.monto) || 0), 0)
                : 0
              const gastosTotales = Number(cuadre.calculos?.gastosTotales) || gastosDetalleTotal
              const mercaderiaDetalle = sumarGastosMercaderia(cuadre.gastos)
              mercaderia = mercaderiaDetalle || Number(cuadre.calculos?.gastosMercaderia) || 0
              gastos = Math.max(0, gastosTotales - mercaderia)
              const gastosGanancia = obtenerGastosQueAfectanGanancia(cuadre)

              let totVentasC = 0, totCostosC = 0
              if (Array.isArray(cuadre.topProducts)) {
                cuadre.topProducts.forEach(p => {
                  const sku = String(p.sku || '').trim().toUpperCase()
                  const cantidad = Number(p.cantidadVendida) || 0
                  const ventasBrutas = Number(p.ventasBrutas) || 0
                  const costoUnitBD = costsBD.get(sku) || (cantidad > 0 ? (Number(p.costoNeto) || 0) / cantidad : 0)
                  const costoNeto = costoUnitBD * cantidad
                  totUnidades += cantidad
                  if (costoUnitBD > 0) {
                    totVentasC += ventasBrutas
                    totCostosC += costoNeto
                  }
                  tops.push({
                    sku,
                    name: String(p.nombre || sku),
                    cantidad,
                    ventas: ventasBrutas,
                  })
                })
              }
              ganancia = (totVentasC > 0 ? totVentasC - totCostosC : ventas * 0.35) - gastosGanancia
            } else if (isToday && activeSessionsMap.has(suc.slug)) {
              // B) Si es hoy y no hay cuadre cerrado, usamos la sesión activa de POS
              const active = activeSessionsMap.get(suc.slug)
              efectivo = Number(active?.totalEfectivo) || 0
              debito = Number(active?.totalDebito) || 0
              transferencia = Number(active?.totalTransferencia) || 0
              ventas = Number(active?.totalVentas) || (efectivo + debito + transferencia)
              gastos = 0
              mercaderia = 0
              ganancia = ventas * 0.35
              totUnidades = Number(active?.ventasCount) || 0
            }

            tops.sort((a, b) => b.cantidad - a.cantidad)

            days.push({
              date: dateStr,
              ventas,
              gastos,
              mercaderia,
              ganancia: Math.round(ganancia),
              efectivo,
              debito,
              transferencia,
              unidades: totUnidades,
              topProducts: tops.slice(0, 5),
            })
          }

          return { ...suc, days } as SucursalData
        })

        const results = await Promise.all(tasks)
        if (!cancel) setSucursalesData(results)
      } catch (err) {
        console.error('[Sucursales] Error procesando datos:', err)
      } finally {
        if (!cancel) setLoading(false)
      }
    }

    load()
    return () => { cancel = true }
  }, [costsBD, minus10Flags, SUCURSALES])

  /* ---------- Cambio de meta ---------- */
  useEffect(() => {
    if (mounted) {
      try { localStorage.setItem(META_KEY, String(metaDiaria)) } catch {}
    }
  }, [metaDiaria, mounted])

  useEffect(() => {
    if (mounted) {
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)) } catch {}
    }
  }, [notes, mounted])

  /* ---------- Selección de días según rango ---------- */
  const rangeDays = (s: SucursalData): DayData[] => {
    const all = s.days
    switch (range) {
      case 'hoy':  return all.slice(0, 1)
      case 'ayer': return all.slice(1, 2)
      case '7d':   return all.slice(0, 7)
      case '30d':  return all.slice(0, 30)
      case 'mes': {
        const now = new Date()
        const y = now.getFullYear(), m = now.getMonth()
        return all.filter(d => {
          const dt = dateFromISO(d.date)
          return dt.getFullYear() === y && dt.getMonth() === m
        })
      }
    }
  }

  /* ---------- Métricas agregadas por sede según rango ---------- */
  const sedeMetrics = useMemo(() => {
    return sucursalesData.map(s => {
      const days = rangeDays(s)
      const ventas   = days.reduce((a, x) => a + x.ventas, 0)
      const gastos   = days.reduce((a, x) => a + x.gastos, 0)
      const mercaderia = days.reduce((a, x) => a + x.mercaderia, 0)
      const ganancia = days.reduce((a, x) => a + x.ganancia, 0)
      const efectivo = days.reduce((a, x) => a + x.efectivo, 0)
      const debito   = days.reduce((a, x) => a + x.debito, 0)
      const transferencia = days.reduce((a, x) => a + x.transferencia, 0)
      const unidades = days.reduce((a, x) => a + x.unidades, 0)
      const ticket   = unidades > 0 ? ventas / unidades : 0
      const margen   = ventas > 0 ? (ganancia / ventas) * 100 : 0

      // Delta vs ayer (solo hoy) o vs periodo anterior
      const prevDays = (() => {
        if (range === 'hoy')  return s.days.slice(1, 2)
        if (range === 'ayer') return s.days.slice(2, 3)
        if (range === '7d')   return s.days.slice(7, 14)
        return []
      })()
      const prevVentas = prevDays.reduce((a, x) => a + x.ventas, 0)
      const deltaPct = prevVentas > 0 ? ((ventas - prevVentas) / prevVentas) * 100 : null

      // Sparkline 7d
      const spark = s.days.slice(0, 7).map(d => d.ventas).reverse()

      // Top productos agregados
      const prodMap = new Map<string, { name: string; cantidad: number; ventas: number }>()
      days.forEach(d => d.topProducts.forEach(p => {
        const ex = prodMap.get(p.sku) || { name: p.name, cantidad: 0, ventas: 0 }
        ex.cantidad += p.cantidad
        ex.ventas += p.ventas
        prodMap.set(p.sku, ex)
      }))
      const topProducts = Array.from(prodMap.entries())
        .map(([sku, v]) => ({ sku, ...v }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 3)

      // Anomalía: ventas del día < 50% del promedio 7d previos
      const avg7 = s.days.slice(1, 8).reduce((a, x) => a + x.ventas, 0) / 7
      const anomaly =
        range === 'hoy' &&
        avg7 > 0 &&
        ventas > 0 &&
        ventas < avg7 * 0.5

      // Forecast: si es hoy, proyectar por hora transcurrida del día
      const now = new Date()
      const hoursPassed = Math.max(1, now.getHours() + now.getMinutes() / 60)
      const forecast =
        range === 'hoy' && hoursPassed > 0 && hoursPassed < 22
          ? ventas / (hoursPassed / 14)
          : null

      return {
        ...s,
        ventas, gastos, mercaderia, ganancia, efectivo, debito, transferencia,
        unidades, ticket, margen, deltaPct, spark, topProducts,
        anomaly, forecast, avg7,
      }
    })
  }, [sucursalesData, range])

  /* ---------- Filtros / Orden ---------- */
  const visibleSedes = useMemo(() => {
    const filtered = sedeMetrics.filter(s =>
      !hiddenSedes.has(s.slug) &&
      (q.trim() === '' || s.name.toLowerCase().includes(q.toLowerCase()))
    )
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'ventas':   return b.ventas - a.ventas
        case 'ganancia': return b.ganancia - a.ganancia
        case 'margen':   return b.margen - a.margen
        case 'nombre':   return a.name.localeCompare(b.name)
      }
    })
    return sorted
  }, [sedeMetrics, hiddenSedes, q, sortBy])

  /* ---------- KPIs Globales ---------- */
  const totals = useMemo(() => {
    const ventas   = visibleSedes.reduce((a, s) => a + s.ventas, 0)
    const gastos   = visibleSedes.reduce((a, s) => a + s.gastos, 0)
    const mercaderia = visibleSedes.reduce((a, s) => a + s.mercaderia, 0)
    const ganancia = visibleSedes.reduce((a, s) => a + s.ganancia, 0)
    const unidades = visibleSedes.reduce((a, s) => a + s.unidades, 0)
    const ticket   = unidades > 0 ? ventas / unidades : 0
    const margen   = ventas > 0 ? (ganancia / ventas) * 100 : 0
    const metaTotal = metaDiaria * Math.max(1, visibleSedes.length) *
      (range === '7d' ? 7 : range === '30d' ? 30 : range === 'mes' ? new Date().getDate() : 1)
    const cumplimiento = metaTotal > 0 ? (ventas / metaTotal) * 100 : 0
    return { ventas, gastos, mercaderia, ganancia, unidades, ticket, margen, metaTotal, cumplimiento }
  }, [visibleSedes, metaDiaria, range])

  /* ---------- Ranking Top 3 ---------- */
  const rankVentas = useMemo(() =>
    [...sedeMetrics].sort((a, b) => b.ventas - a.ventas).slice(0, 3),
  [sedeMetrics])
  const rankMargen = useMemo(() =>
    [...sedeMetrics]
      .filter(s => s.ventas > 0)
      .sort((a, b) => b.margen - a.margen)
      .slice(0, 3),
  [sedeMetrics])

  /* ---------- Datos para BarChart ---------- */
  const chartData = useMemo(() =>
    visibleSedes.map(s => ({
      name: s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name,
      Ventas: Math.round(s.ventas),
      'Gastos operacionales': Math.round(s.gastos),
      'Mercadería anotada': Math.round(s.mercaderia),
      Ganancia: Math.round(s.ganancia),
      color: colorClasses[s.color]?.chart || '#10b981',
    })),
  [visibleSedes])

  /* ---------- Heatmap: sedes × últimos 7 días ---------- */
  const heatmap = useMemo(() => {
    const days: string[] = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      days.push(makeDateISO(d))
    }
    const maxV = Math.max(1, ...sucursalesData.flatMap(s => s.days.slice(0, 7).map(d => d.ventas)))
    const rows = visibleSedes.map(s => ({
      name: s.name,
      color: s.color,
      cells: days.map(iso => {
        const found = s.days.find(d => d.date === iso)
        const v = found?.ventas || 0
        return { iso, v, intensity: v / maxV }
      }),
    }))
    return { days, rows, maxV }
  }, [sucursalesData, visibleSedes])

  /* ---------- Acciones ---------- */
  const handleExportCSV = () => {
    const header = ['Sucursal', 'Ventas', 'Gastos operacionales', 'Mercadería anotada (no gasto)', 'Ganancia', 'Margen%', 'Unidades', 'TicketProm', 'ΔvsAnterior%']
    const lines = visibleSedes.map(s => [
      s.name,
      Math.round(s.ventas),
      Math.round(s.gastos),
      Math.round(s.mercaderia),
      Math.round(s.ganancia),
      s.margen.toFixed(1),
      s.unidades,
      Math.round(s.ticket),
      s.deltaPct == null ? '' : s.deltaPct.toFixed(1),
    ].join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sucursales_${range}_${makeDateISO(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSedeVisible = (slug: string) => {
    setHiddenSedes(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 print:bg-white" style={{ animation: 'sp_pageIn 0.4s ease-out' }}>
      <style>{`
        @keyframes sp_float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes sp_drift { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(8px,-6px) scale(1.15)} }
        @keyframes sp_bubble { 0%,100%{transform:translateY(0) scale(1);opacity:0.6} 50%{transform:translateY(-6px) scale(1.2);opacity:1} }
        @keyframes sp_pageIn { 0%{opacity:0;transform:translateY(12px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes sp_sparkDraw { from{stroke-dashoffset:200} to{stroke-dashoffset:0} }
        @media print { .no-print { display:none !important } .print-break { page-break-after: always } }
      `}</style>

      {/* =================== HEADER =================== */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-green-500 to-teal-500 px-4 pt-5 pb-10 print:hidden">
        <div className="absolute bottom-0 left-0 right-0 h-24 z-20 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(248,250,252,0.6) 50%, rgba(248,250,252,1) 100%)' }} />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: `${2 + (i * 11 + 3) % 94}%`, top: `${3 + (i * 17 + 5) % 90}%`,
              width: `${2 + (i % 5) * 1.5}px`, height: `${2 + (i % 5) * 1.5}px`,
              background: `radial-gradient(circle, rgba(255,255,255,${0.3 + (i % 3) * 0.15}), rgba(255,255,255,0.05))`,
              boxShadow: `0 0 ${3 + (i % 3) * 3}px rgba(255,255,255,0.25)`,
              animation: `sp_float ${2.5 + (i % 6) * 0.6}s ease-in-out ${(i * 0.2) % 4}s infinite`,
            }} />
          ))}
        </div>

        <div className="relative z-10 max-w-[1500px] mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.push('/erp-dashboard')} className="p-2 rounded-xl bg-white/20 backdrop-blur-sm active:scale-95 transition border border-white/10" title="Volver al Dashboard">
              <ArrowLeft size={18} className="text-white" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-white">Sucursales Importadora Carlitos</h1>
              <p className="text-emerald-100 text-[10px]">Panel multi-sede · ventas, gastos, ganancia y analítica en tiempo real</p>
            </div>
            <div className="p-2.5 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20">
              <Building2 size={20} className="text-white" />
            </div>
          </div>

          {/* Selector de rango + Toggle de vista */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-0.5 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full p-0.5 text-xs">
              {([
                { k: 'hoy',  label: 'Hoy' },
                { k: 'ayer', label: 'Ayer' },
                { k: '7d',   label: '7 días' },
                { k: '30d',  label: '30 días' },
                { k: 'mes',  label: 'Mes actual' },
              ] as { k: RangeKey; label: string }[]).map(r => (
                <button key={r.k}
                  className={`px-3.5 py-1.5 rounded-full font-medium transition ${range === r.k ? 'bg-white text-emerald-700 shadow-sm' : 'text-white/80 hover:text-white'}`}
                  onClick={() => setRange(r.k)}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Toggle Vista Simple / Avanzada */}
            <div className="inline-flex items-center gap-0.5 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full p-0.5 text-xs ml-auto">
              <button
                onClick={() => setViewMode('simple')}
                className={`px-3 py-1.5 rounded-full font-medium transition ${isSimple ? 'bg-white text-emerald-700 shadow-sm' : 'text-white/80 hover:text-white'}`}
                title="Vista simplificada">
                Simple
              </button>
              <button
                onClick={() => setViewMode('advanced')}
                className={`px-3 py-1.5 rounded-full font-medium transition ${!isSimple ? 'bg-white text-emerald-700 shadow-sm' : 'text-white/80 hover:text-white'}`}
                title="Vista avanzada">
                Avanzada
              </button>
            </div>
          </div>

          {/* Totales */}
          {!loading && (
            <div className={`grid gap-2.5 mt-4 ${isSimple ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 md:grid-cols-7'}`}>
              <KpiTile icon={<TrendingUp size={11} />} color="emerald" label="Ventas"    value={formatCompact(totals.ventas)} />
              <KpiTile icon={<TrendingDown size={11} />} color="rose"    label="Gastos operacionales"    value={formatCompact(totals.gastos)} />
              <KpiTile icon={<ShoppingBag size={11} />} color="teal" label="Mercadería aparte" value={formatCompact(totals.mercaderia)} />
              <KpiTile icon={<DollarSign size={11} />}  color={totals.ganancia >= 0 ? 'amber' : 'red'} label="Ganancia" value={formatCompact(totals.ganancia)} />
              {!isSimple && (
                <>
                  <KpiTile icon={<ShoppingBag size={11} />}  color="violet"  label="Unidades"  value={totals.unidades.toLocaleString('es-CL')} />
                  <KpiTile icon={<Banknote size={11} />}     color="blue"    label="Ticket Prom." value={formatCompact(totals.ticket)} />
                  <KpiTile icon={<Sparkles size={11} />}     color="teal"    label="Margen %"  value={`${totals.margen.toFixed(1)}%`} />
                </>
              )}
            </div>
          )}

          {/* Gauge meta — solo modo avanzado */}
          {!loading && !isSimple && (
            <div className="mt-3 rounded-xl bg-white/95 dark:bg-slate-800/95 border border-white/60 dark:border-slate-700 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Target size={14} className="text-emerald-600" />
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Meta del periodo</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatCompact(totals.metaTotal)}</span>
                  <input
                    type="number"
                    value={metaDiaria}
                    onChange={e => setMetaDiaria(Number(e.target.value) || 0)}
                    className="w-24 text-[10px] px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:bg-slate-700 dark:text-white"
                    title="Meta diaria por sede (CLP)"
                  />
                  <span className="text-[9px] text-slate-400">meta/sede/día</span>
                </div>
                <span className={`text-xs font-bold ${totals.cumplimiento >= 100 ? 'text-emerald-600' : totals.cumplimiento >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {totals.cumplimiento.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${totals.cumplimiento >= 100 ? 'bg-gradient-to-r from-emerald-400 to-green-500' : totals.cumplimiento >= 70 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-rose-400 to-red-500'}`}
                  style={{ width: `${Math.min(100, totals.cumplimiento)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =================== TOOLBAR =================== */}
      {isSimple ? (
        <div className="max-w-[1500px] mx-auto px-3 sm:px-6 -mt-4 relative z-10 no-print">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar sucursal..."
                className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[1500px] mx-auto px-3 sm:px-6 -mt-4 relative z-10 no-print">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar sucursal..."
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              <SortAsc size={12} className="text-slate-400 ml-1.5" />
              {(['ventas', 'ganancia', 'margen', 'nombre'] as SortKey[]).map(s => (
                <button key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-1 text-[11px] rounded-md capitalize transition ${sortBy === s ? 'bg-emerald-500 text-white shadow-sm font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600'}`}>
                  {s}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              {([
                { k: 'grid',  icon: <LayoutGrid size={13} /> },
                { k: 'list',  icon: <ListIcon size={13} /> },
                { k: 'table', icon: <TableIcon size={13} /> },
              ] as { k: ViewKey; icon: any }[]).map(v => (
                <button key={v.k}
                  onClick={() => setView(v.k)}
                  className={`px-2 py-1 rounded-md transition ${view === v.k ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600'}`}>
                  {v.icon}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowChart(v => !v)}
              className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <BarChart2 size={12} /> Gráfico {showChart ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              onClick={() => setShowHeatmap(v => !v)}
              className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <Flame size={12} /> Heatmap {showHeatmap ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            <div className="ml-auto flex items-center gap-1">
              <button onClick={handleExportCSV} className="px-2.5 py-1.5 text-[11px] rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1 font-bold">
                <Download size={12} /> CSV
              </button>
              <button onClick={() => window.print()} className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 text-slate-600 dark:text-slate-300">
                <Printer size={12} /> Imprimir
              </button>
            </div>
          </div>

          {/* Filtros rápidos de sedes */}
          {sucursalesData.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sucursalesData.map(s => {
                const cc = colorClasses[s.color] || colorClasses.green
                const hidden = hiddenSedes.has(s.slug)
                return (
                  <button key={s.slug}
                    onClick={() => toggleSedeVisible(s.slug)}
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-medium flex items-center gap-1 transition ${hidden ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through' : `${cc.light} ${cc.text} ${cc.border}`}`}>
                    {hidden ? <EyeOff size={10} /> : <Eye size={10} />}
                    <span>{s.icon}</span>
                    {s.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =================== RANKINGS =================== */}
      {!isSimple && !loading && sedeMetrics.length > 0 && (
        <div className="max-w-[1500px] mx-auto px-3 sm:px-6 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <RankingCard title="Top por ventas" icon={<Trophy size={14} />} items={rankVentas} fmt={s => formatCompact(s.ventas)} />
          <RankingCard title="Top por margen" icon={<Award size={14} />}  items={rankMargen} fmt={s => `${s.margen.toFixed(1)}%`} />
        </div>
      )}

      {/* =================== BARCHART (RECHARTS) =================== */}
      {!isSimple && !loading && showChart && chartData.length > 0 && mounted && (
        <div className="max-w-[1500px] mx-auto px-3 sm:px-6 mt-4">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><BarChart2 size={14} className="text-emerald-600" /> Comparativo por sede</h3>
              <span className="text-[10px] text-slate-400">{range.toUpperCase()}</span>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Ventas"   fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Gastos operacionales" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Mercadería anotada" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Ganancia" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* =================== HEATMAP =================== */}
      {!isSimple && !loading && showHeatmap && heatmap.rows.length > 0 && (
        <div className="max-w-[1500px] mx-auto px-3 sm:px-6 mt-4">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><Flame size={14} className="text-orange-500" /> Heatmap · últimos 7 días</h3>
              <span className="text-[10px] text-slate-400">Intensidad: ventas / máx = {formatCompact(heatmap.maxV)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left pl-1 pb-1 font-normal">Sede</th>
                    {heatmap.days.map(iso => {
                      const d = dateFromISO(iso)
                      return (
                        <th key={iso} className="text-center pb-1 font-normal text-[10px]">
                          <div>{weekdayShort(d)}</div>
                          <div className="text-[9px] text-slate-400">{d.getDate()}/{d.getMonth() + 1}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.rows.map(row => {
                    const cc = colorClasses[row.color] || colorClasses.green
                    return (
                      <tr key={row.name}>
                        <td className="pl-1 py-0.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{row.name}</td>
                        {row.cells.map(c => {
                          const alpha = 0.08 + c.intensity * 0.85
                          return (
                            <td key={c.iso} className="px-0.5 py-0.5">
                              <div
                                className="h-7 rounded-md flex items-center justify-center text-[9px] font-semibold text-white/90 transition hover:scale-105"
                                style={{ backgroundColor: `rgba(16,185,129,${alpha})` }}
                                title={`${row.name} · ${c.iso} · ${formatMoney(c.v)}`}>
                                {c.v > 0 ? formatCompact(c.v).replace('$', '') : ''}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================== LISTADO DE SEDES =================== */}
      <div className="max-w-[1500px] mx-auto px-3 sm:px-6 pt-4 pb-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="h-3 w-12 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-3">
                  {[0, 1, 2].map(j => (
                    <div key={j} className="flex justify-between">
                      <div className="h-3 w-14 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : visibleSedes.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 text-sm">
            Sin resultados. Revisa los filtros o la búsqueda.
          </div>
        ) : view === 'table' ? (
          <TableView sedes={visibleSedes} range={range} />
        ) : (
          <div className={view === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'grid grid-cols-1 gap-3'}>
            {visibleSedes.map(s => (
              <SedeCard
                key={s.slug}
                sede={s as any}
                range={range}
                view={view}
                note={notes[s.slug] || ''}
                editing={editingNote === s.slug}
                onStartEdit={() => setEditingNote(s.slug)}
                onSaveNote={(v) => { setNotes(p => ({ ...p, [s.slug]: v })); setEditingNote(null) }}
                onCancelNote={() => setEditingNote(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* =======================================================================
 *  Subcomponentes
 * ===================================================================== */

function KpiTile({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
  const palette: Record<string, { grad: string; text: string; rgba: string }> = {
    emerald: { grad: 'from-emerald-50/60',  text: 'text-emerald-600',  rgba: '16,185,129' },
    rose:    { grad: 'from-rose-50/60',     text: 'text-rose-600',     rgba: '244,63,94' },
    amber:   { grad: 'from-amber-50/60',    text: 'text-amber-600',    rgba: '245,158,11' },
    red:     { grad: 'from-red-50/60',      text: 'text-red-600',      rgba: '220,38,38' },
    violet:  { grad: 'from-violet-50/60',   text: 'text-violet-600',   rgba: '139,92,246' },
    blue:    { grad: 'from-blue-50/60',     text: 'text-blue-600',     rgba: '59,130,246' },
    teal:    { grad: 'from-teal-50/60',     text: 'text-teal-600',     rgba: '20,184,166' },
  }
  const p = palette[color] || palette.emerald
  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-white/60 dark:border-slate-700 p-3 relative overflow-hidden shadow-sm">
      <div className={`absolute inset-0 bg-gradient-to-br ${p.grad} to-transparent pointer-events-none`} />
      <div className="relative z-10">
        <div className={`flex items-center gap-1.5 mb-1 ${p.text}`}>
          {icon}
          <p className="text-[9px] font-bold uppercase tracking-wider">{label}</p>
        </div>
        <p className="text-base lg:text-lg font-black text-slate-800 dark:text-white tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function RankingCard({ title, icon, items, fmt }: { title: string; icon: any; items: any[]; fmt: (s: any) => string }) {
  const medals = [
    { emoji: '🥇', label: '1°', cardBg: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-800', border: 'border-amber-200 dark:border-amber-800', badgeBg: 'bg-amber-400', badgeText: 'text-white', valueText: 'text-amber-700 dark:text-amber-300', valueBg: 'bg-amber-100/60 dark:bg-amber-900/40' },
    { emoji: '🥈', label: '2°', cardBg: 'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/40 dark:to-slate-800', border: 'border-slate-200 dark:border-slate-700', badgeBg: 'bg-slate-300', badgeText: 'text-slate-800', valueText: 'text-slate-700 dark:text-slate-200', valueBg: 'bg-slate-100 dark:bg-slate-700' },
    { emoji: '🥉', label: '3°', cardBg: 'bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-slate-800', border: 'border-orange-200 dark:border-orange-800', badgeBg: 'bg-orange-400', badgeText: 'text-white', valueText: 'text-orange-700 dark:text-orange-300', valueBg: 'bg-orange-100/60 dark:bg-orange-900/40' },
  ]
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600">
          {icon}
        </span>
        {title}
      </h3>
      <div className="space-y-2">
        {items.map((s, i) => {
          const m = medals[i] || medals[2]
          const cc = colorClasses[s.color] || colorClasses.green
          return (
            <div
              key={s.slug}
              className={`relative flex items-center gap-3 p-3 rounded-xl border ${m.border} ${m.cardBg} transition hover:shadow-md`}
            >
              <div className="flex flex-col items-center justify-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full ${m.badgeBg} ${m.badgeText} flex items-center justify-center shadow-sm text-base`}>
                  {m.emoji}
                </div>
                <span className="text-[9px] font-black text-slate-500 mt-0.5">{m.label}</span>
              </div>

              <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${cc.light} dark:bg-slate-700 border ${cc.border} flex items-center justify-center text-xl shadow-sm`}>
                {s.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-slate-800 dark:text-white truncate mb-0.5">{s.name}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    <ShoppingBag size={9} className="text-violet-500" />
                    {s.unidades.toLocaleString('es-CL')} uds
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    <Banknote size={9} className="text-blue-500" />
                    {formatCompact(s.ticket)}
                  </span>
                </div>
              </div>

              <div className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl ${m.valueBg} ${m.valueText} text-right`}>
                <div className="text-base font-black tabular-nums leading-tight">
                  {fmt(s)}
                </div>
              </div>
            </div>
          )
        })}
        {items.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-6">Sin datos para mostrar</div>
        )}
      </div>
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null
  const w = 110, h = 30, pad = 2
  const max = Math.max(1, ...data)
  const min = Math.min(0, ...data)
  const points = data.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1)
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const areaPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color})`} />
      <polyline
        points={points}
        fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      />
      {data.map((v, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1)
        const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 2 : 0} fill={color} />
      })}
    </svg>
  )
}

function MixDonut({ efectivo, debito, transferencia }: { efectivo: number; debito: number; transferencia: number }) {
  const total = efectivo + debito + transferencia
  if (total <= 0) return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
      <span className="h-6 w-6 rounded-full border-2 border-dashed border-slate-200" /> sin ventas
    </div>
  )
  const r = 12, c = 2 * Math.PI * r
  const seg = (val: number) => (val / total) * c
  const s1 = seg(efectivo)
  const s2 = seg(debito)
  const s3 = seg(transferencia)
  const cx = 14, cy = 14
  return (
    <div className="flex items-center gap-2">
      <svg width={28} height={28} viewBox="0 0 28 28">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10b981" strokeWidth={4}
          strokeDasharray={`${s1} ${c - s1}`} transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3b82f6" strokeWidth={4}
          strokeDasharray={`${s2} ${c - s2}`}
          strokeDashoffset={-s1}
          transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#8b5cf6" strokeWidth={4}
          strokeDasharray={`${s3} ${c - s3}`}
          strokeDashoffset={-(s1 + s2)}
          transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      <div className="flex flex-col gap-0.5 text-[9px]">
        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300"><Banknote size={9} className="text-emerald-600" /> {Math.round((efectivo / total) * 100)}%</span>
        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300"><CreditCard size={9} className="text-blue-600" /> {Math.round((debito / total) * 100)}%</span>
        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300"><ArrowLeftRight size={9} className="text-violet-600" /> {Math.round((transferencia / total) * 100)}%</span>
      </div>
    </div>
  )
}

interface SedeCardProps {
  sede: any
  range: RangeKey
  view: ViewKey
  note: string
  editing: boolean
  onStartEdit: () => void
  onSaveNote: (v: string) => void
  onCancelNote: () => void
}

function SedeCard({ sede, range, view, note, editing, onStartEdit, onSaveNote, onCancelNote }: SedeCardProps) {
  const cc = colorClasses[sede.color] || colorClasses.green
  const [noteDraft, setNoteDraft] = useState(note)
  useEffect(() => { setNoteDraft(note) }, [note, editing])

  const margenPct = sede.ventas > 0 ? Math.abs(Math.round((sede.ganancia / sede.ventas) * 100)) : 0
  const isList = view === 'list'

  const handleShare = async () => {
    const text = `${sede.icon} ${sede.name}\nVentas: ${formatMoney(sede.ventas)}\nGastos operacionales: ${formatMoney(sede.gastos)}\nMercadería anotada aparte: ${formatMoney(sede.mercaderia)}\nGanancia: ${formatMoney(sede.ganancia)}\nMargen: ${sede.margen.toFixed(1)}%`
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: sede.name, text })
      else { await navigator.clipboard.writeText(text); alert('Resumen copiado al portapapeles') }
    } catch {}
  }

  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border ${cc.border} dark:border-slate-700 shadow-sm hover:shadow-lg transition-all hover:-translate-y-0.5 ${isList ? 'p-4' : 'p-5'}`}>
      <div className={`absolute -top-6 -right-6 w-28 h-28 ${cc.bg} opacity-15 rounded-full blur-2xl group-hover:opacity-25 transition-opacity`} />

      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl">{sede.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 dark:text-white truncate">{sede.name}</h3>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className={`text-[10px] ${cc.text} font-medium`}>{rangeLabel(range)}</span>
              {sede.deltaPct != null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sede.deltaPct >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                  {sede.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(sede.deltaPct).toFixed(0)}%
                </span>
              )}
              {sede.anomaly && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-0.5">
                  <AlertTriangle size={10} /> anomalía
                </span>
              )}
            </div>
          </div>
          {sede.ventas > 0 && (
            <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-1.5 ${cc.light} dark:bg-slate-700 ${cc.text}`}>
              <span className="text-lg font-black leading-none">{margenPct}%</span>
              <span className="text-[9px] font-medium opacity-70 leading-tight">margen</span>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-2 mb-3">
          <div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">7 días</div>
            <Sparkline data={sede.spark} color={cc.chart} />
          </div>
          <MixDonut efectivo={sede.efectivo} debito={sede.debito} transferencia={sede.transferencia} />
        </div>

        <div className="space-y-2">
          <Row label="Ventas"   icon={<TrendingUp size={12} />}   value={formatCompact(sede.ventas)} strong />
          <Row label="Gastos operacionales" icon={<TrendingDown size={12} />} value={`-${formatCompact(sede.gastos)}`} color="text-rose-600" />
          <Row label="Mercadería anotada aparte" icon={<ShoppingBag size={12} />} value={formatCompact(sede.mercaderia)} color="text-cyan-700 dark:text-cyan-300" />
          <Row label="Unidades" icon={<ShoppingBag size={12} />}  value={sede.unidades.toLocaleString('es-CL')} />
          <Row label="Ticket"   icon={<Banknote size={12} />}     value={formatCompact(sede.ticket)} />
          <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1"><DollarSign size={12} />Ganancia</span>
            <span className={`text-xl font-black ${sede.ganancia >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCompact(sede.ganancia)}</span>
          </div>
          {sede.forecast != null && range === 'hoy' && (
            <div className="flex items-center justify-between bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-lg px-2 py-1">
              <span className="text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-1"><Clock size={10} />Proyección fin día</span>
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">{formatCompact(sede.forecast)}</span>
            </div>
          )}
        </div>

        {sede.topProducts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1">
              <Flame size={10} className="text-orange-400" /> Top productos
            </div>
            <div className="space-y-1">
              {sede.topProducts.map((p: any, i: number) => (
                <div key={p.sku} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-4 h-4 flex items-center justify-center rounded-full text-white text-[9px] font-bold ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : 'bg-orange-400'}`}>{i + 1}</span>
                    <span className="truncate text-slate-700 dark:text-slate-300">{p.name}</span>
                  </span>
                  <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">{p.cantidad} uds</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          {editing ? (
            <div className="space-y-1">
              <textarea
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="Nota del día..."
                className="w-full text-[11px] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:bg-slate-700 dark:text-white"
              />
              <div className="flex gap-1 justify-end">
                <button onClick={onCancelNote} className="text-[10px] px-2 py-0.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
                <button onClick={() => onSaveNote(noteDraft)} className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500 text-white">Guardar</button>
              </div>
            </div>
          ) : (
            <button
              onClick={onStartEdit}
              className="w-full flex items-center gap-1.5 text-left text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition">
              <StickyNote size={11} className="text-amber-500 shrink-0" />
              {note ? <span className="truncate italic">{note}</span> : <span className="italic text-slate-400">Añadir nota del día…</span>}
            </button>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1.5 flex-wrap">
          <Link to={`/erp?sede=${sede.slug}`} className="text-[10px] px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 flex items-center gap-1 font-semibold">
            <ClipboardList size={10} /> Cuadre
          </Link>
          <Link to={`/pos-admin/${sede.slug}`} className="text-[10px] px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 flex items-center gap-1 font-semibold">
            <BarChart2 size={10} /> POS
          </Link>
          <button onClick={handleShare} className="ml-auto text-[10px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1">
            <Share2 size={10} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, icon, value, color, strong }: { label: string; icon: any; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">{icon}{label}</span>
      <span className={`text-sm ${strong ? 'font-bold' : 'font-semibold'} ${color || 'text-slate-700 dark:text-slate-200'}`}>{value}</span>
    </div>
  )
}

function TableView({ sedes, range }: { sedes: any[]; range: RangeKey }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Sede</th>
              <th className="text-right px-3 py-2 font-semibold">Ventas</th>
              <th className="text-right px-3 py-2 font-semibold">Gastos operacionales</th>
              <th className="text-right px-3 py-2 font-semibold text-cyan-700 dark:text-cyan-300">Mercadería aparte</th>
              <th className="text-right px-3 py-2 font-semibold">Ganancia</th>
              <th className="text-right px-3 py-2 font-semibold">Margen</th>
              <th className="text-right px-3 py-2 font-semibold">Unid.</th>
              <th className="text-right px-3 py-2 font-semibold">Ticket</th>
              <th className="text-right px-3 py-2 font-semibold">Δ</th>
              <th className="text-center px-3 py-2 font-semibold">7 días</th>
              <th className="text-center px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sedes.map((s, i) => {
              const cc = colorClasses[s.color] || colorClasses.green
              return (
                <tr key={s.slug} className={`border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-700/50 ${i % 2 ? 'bg-slate-50/20 dark:bg-slate-700/20' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{s.icon}</span>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-white">{s.name}</div>
                        <div className={`text-[9px] ${cc.text}`}>{rangeLabel(range)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums font-semibold text-slate-800 dark:text-slate-200">{formatCompact(s.ventas)}</td>
                  <td className="text-right px-3 py-2 tabular-nums text-rose-600">-{formatCompact(s.gastos)}</td>
                  <td className="text-right px-3 py-2 tabular-nums text-cyan-700 dark:text-cyan-300">{formatCompact(s.mercaderia)}</td>
                  <td className={`text-right px-3 py-2 tabular-nums font-bold ${s.ganancia >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCompact(s.ganancia)}</td>
                  <td className="text-right px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">{s.margen.toFixed(1)}%</td>
                  <td className="text-right px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">{s.unidades.toLocaleString('es-CL')}</td>
                  <td className="text-right px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">{formatCompact(s.ticket)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {s.deltaPct == null ? <span className="text-slate-300 dark:text-slate-600">—</span> :
                      <span className={`font-bold ${s.deltaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {s.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(s.deltaPct).toFixed(0)}%
                      </span>
                    }
                  </td>
                  <td className="px-3 py-1">
                    <Sparkline data={s.spark} color={cc.chart} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Link to={`/erp?sede=${s.slug}`} className="p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Cuadre"><ClipboardList size={12} /></Link>
                      <Link to={`/pos-admin/${s.slug}`} className="p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600" title="POS"><BarChart2 size={12} /></Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function rangeLabel(r: RangeKey): string {
  switch (r) {
    case 'hoy':  return 'Hoy'
    case 'ayer': return 'Ayer'
    case '7d':   return 'Últimos 7 días'
    case '30d':  return 'Últimos 30 días'
    case 'mes':  return 'Mes actual'
  }
}
