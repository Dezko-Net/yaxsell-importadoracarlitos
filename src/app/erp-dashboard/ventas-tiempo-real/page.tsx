'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react'
import NextLink from 'next/link'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  Timestamp,
} from 'firebase/firestore'
import { db, authReady } from '@/lib/firebase'
import { DEFAULT_SEDE, SEDE_SLUGS, SEDES, type SedeSlug } from '@/types'
import { DEFAULT_COMPANY_CONFIG, openReceiptPrintWindow } from '@/lib/posReceipt'
import type { ReceiptCompanyConfig } from '@/lib/posReceipt'
import { formatEmbalajeBoletaLabel, formatProductCodeLabel } from '@/lib/embalajeHelper'
import { useLiveDataVisibility } from '@/hooks/useLiveDataVisibility'
import {
  Activity,
  TrendingUp,
  DollarSign,
  MapPin,
  Clock,
  Search,
  Filter,
  Eye,
  Printer,
  RefreshCw,
  Zap,
  ArrowLeft,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  User,
  ShoppingBag,
} from 'lucide-react'

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface ItemVenta {
  sku?: string
  nombre: string
  cantidad: number
  precioUnitario?: number
  subtotal: number
  costoUnitario?: number
}

interface PagoVenta {
  metodo: string
  monto: number
}

interface VentaPOS {
  id: string
  sede: string
  cajeroNombre?: string
  cajeroEmail?: string
  sesionCajaId?: string
  fecha?: any // Timestamp | { toDate: () => Date } | string
  fechaStr?: string
  items?: ItemVenta[]
  subtotal?: number
  descuentoGlobalPct?: number
  descuentoGlobal?: number
  total: number
  pagos?: PagoVenta[]
  efectivoPagado?: number
  vuelto?: number
  estado?: 'completada' | 'anulada' | string
  boletaNumero?: number | string
  debitoOrdenNumero?: number | string
  createdAt?: any
}

// ─── Formateadores ──────────────────────────────────────────────────────────
const fmtCLP = (n: number): string => {
  if (!isFinite(n)) return '$0'
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

const getFechaDate = (val: any): Date | null => {
  if (!val) return null
  if (typeof val?.toDate === 'function') return val.toDate()
  if (val?.seconds) return new Date(val.seconds * 1000)
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

const formatHora = (val: any): string => {
  const d = getFechaDate(val)
  if (!d) return '--:--:--'
  return d.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const formatFecha = (val: any): string => {
  const d = getFechaDate(val)
  if (!d) return '--/--/----'
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const formatRelativeTime = (val: any): string => {
  const d = getFechaDate(val)
  if (!d) return ''
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diffSec < 15) return '¡Recién!'
  if (diffSec < 60) return `Hace ${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Hace ${diffHours}h`
  return formatFecha(val)
}

const getVentaPagosSafe = (v: any): PagoVenta[] => {
  if (Array.isArray(v?.pagos) && v.pagos.length > 0) return v.pagos
  const total = Number(v?.total || 0)
  const metodo = v?.metodoPago || (v?.debitoOrdenNumero ? 'debito' : 'efectivo')
  return [{ metodo, monto: total }]
}

const SEDE_BADGES: Record<string, { label: string; cls: string; bgSoft: string }> = {
  'donbalato-central': {
    label: 'Importadora Carlitos Central',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    bgSoft: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  'chacabuco-08': {
    label: 'Chacabuco 08',
    cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    bgSoft: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  'alameda': {
    label: 'Alameda',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    bgSoft: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  'copiapo': {
    label: 'Copiapó',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    bgSoft: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
}

const getSedeBadge = (slug: string) => {
  return (
    SEDE_BADGES[slug] || {
      label: SEDES[slug as SedeSlug] || slug,
      cls: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      bgSoft: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    }
  )
}

export default function VentasTiempoRealPage() {
  const liveDataVisible = useLiveDataVisibility()
  const [ventas, setVentas] = useState<VentaPOS[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Control de modo: Radar en Vivo (onSnapshot) vs Manual/Pausado (getDocs)
  const [radarActivo, setRadarActivo] = useState(true)
  const [batchLimit, setBatchLimit] = useState<number>(20) // Paginación inicial limpia (20 en 20)
  const [lastSaleAlertId, setLastSaleAlertId] = useState<string | null>(null)

  // Filtros
  const [filtroSede, setFiltroSede] = useState<string>('todas')
  const [filtroMetodo, setFiltroMetodo] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'completada' | 'anulada'>('completada')
  const [filtroCajera, setFiltroCajera] = useState<string>('todas')
  const [searchQuery, setSearchQuery] = useState('')

  // Paginación en cliente sobre el conjunto descargado
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Modal de detalle
  const [selectedVenta, setSelectedVenta] = useState<VentaPOS | null>(null)
  const [empresaConfig, setEmpresaConfig] = useState<ReceiptCompanyConfig>(DEFAULT_COMPANY_CONFIG)

  const isFirstLoad = useRef(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        await authReady
        if (!db) return
        const snap = await getDoc(doc(db, 'config_pos', 'empresa'))
        if (active && snap.exists()) setEmpresaConfig({ ...DEFAULT_COMPANY_CONFIG, ...(snap.data() as ReceiptCompanyConfig) })
      } catch (error) {
        console.warn('No se pudo cargar la configuración de boleta:', error)
      }
    })()
    return () => { active = false }
  }, [])

  // Cargar / Suscribir a Firestore
  useEffect(() => {
    if (!liveDataVisible) return
    let unsub = () => {}
    let active = true

    const connectToVentas = async () => {
      try {
        await authReady
        if (!active || !db) return

        setLoading(true)
        setError(null)

        const colRef = collection(db, 'ventas_pos')
        const q = query(colRef, orderBy('createdAtTs', 'desc'), limit(batchLimit))

        if (radarActivo) {
          // MODO RADAR EN VIVO: onSnapshot con cuota acotada (batchLimit)
          unsub = onSnapshot(
            q,
            (snap) => {
              if (!active) return
              const items: VentaPOS[] = snap.docs.map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
              }))

              // Detectar si entró una venta nueva para animarla
              if (!isFirstLoad.current && items.length > 0 && items[0].id !== lastSaleAlertId) {
                setLastSaleAlertId(items[0].id)
                setTimeout(() => setLastSaleAlertId(null), 3000)
              }
              isFirstLoad.current = false

              setVentas(items)
              setLoading(false)
            },
            (err) => {
              console.error('Error onSnapshot ventas_pos:', err)
              if (active) {
                setError('Error en conexión en vivo. Intenta recargar o pasar a modo manual.')
                setLoading(false)
              }
            }
          )
        } else {
          // MODO HISTORIAL MANUAL: solo una lectura puntual (0 consumo de fondo)
          const snap = await getDocs(q)
          if (!active) return
          const items: VentaPOS[] = snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as any),
          }))
          setVentas(items)
          setLoading(false)
        }
      } catch (err: any) {
        console.error('Error cargando ventas_pos:', err)
        if (active) {
          setError(err?.message || 'Error cargando ventas')
          setLoading(false)
        }
      }
    }

    connectToVentas()

    return () => {
      active = false
      unsub()
    }
  }, [radarActivo, batchLimit, liveDataVisible])

  // Recarga manual
  const handleManualRefresh = async () => {
    if (!db) return
    setRefreshing(true)
    try {
      const q = query(collection(db, 'ventas_pos'), orderBy('createdAtTs', 'desc'), limit(batchLimit))
      const snap = await getDocs(q)
      const items: VentaPOS[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }))
      setVentas(items)
    } catch (e: any) {
      console.error(e)
    } finally {
      setRefreshing(false)
    }
  }

  // Lista de cajeras encontradas en los datos
  const listaCajeras = useMemo(() => {
    const set = new Set<string>()
    ventas.forEach((v) => {
      const name = v.cajeroNombre?.trim()
      if (name) set.add(name)
    })
    return Array.from(set).sort()
  }, [ventas])

  // Fecha de hoy en formato YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  // Métricas del conjunto de datos del día de hoy
  const metricsToday = useMemo(() => {
    const todaySales = ventas.filter((v) => {
      if (v.estado === 'anulada') return false
      if (v.fechaStr && v.fechaStr === todayStr) return true
      const d = getFechaDate(v.fecha)
      if (d) {
        return d.toISOString().split('T')[0] === todayStr
      }
      return false
    })

    const totalHoy = todaySales.reduce((sum, v) => sum + (v.total || 0), 0)
    const ticketsHoy = todaySales.length
    const ticketPromedio = ticketsHoy > 0 ? Math.round(totalHoy / ticketsHoy) : 0

    // Pagos en efectivo vs digital hoy
    let efectivoHoy = 0
    let digitalHoy = 0
    todaySales.forEach((v) => {
      getVentaPagosSafe(v).forEach((p) => {
        const met = (p.metodo || '').toLowerCase()
        if (met === 'efectivo') efectivoHoy += p.monto || 0
        else digitalHoy += p.monto || 0
      })
    })

    // Desglose por sede
    const bySede: Record<string, { count: number; total: number }> = {}
    todaySales.forEach((v) => {
      const s = v.sede || 'desconocida'
      if (!bySede[s]) bySede[s] = { count: 0, total: 0 }
      bySede[s].count += 1
      bySede[s].total += v.total || 0
    })

    return {
      todaySales,
      totalHoy,
      ticketsHoy,
      ticketPromedio,
      efectivoHoy,
      digitalHoy,
      bySede,
    }
  }, [ventas, todayStr])

  // Filtrado de ventas
  const filteredVentas = useMemo(() => {
    return ventas.filter((v) => {
      // Filtro Sede
      if (filtroSede !== 'todas' && v.sede !== filtroSede) return false

      // Filtro Estado
      if (filtroEstado !== 'todas' && (v.estado || 'completada') !== filtroEstado) return false

      // Filtro Cajera
      if (filtroCajera !== 'todas' && v.cajeroNombre !== filtroCajera) return false

      // Filtro Método de Pago
      if (filtroMetodo !== 'todos') {
        const hasMetodo = getVentaPagosSafe(v).some(
          (p) => (p.metodo || '').toLowerCase() === filtroMetodo.toLowerCase()
        )
        if (!hasMetodo) return false
      }

      // Búsqueda libre
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const idMatch = v.id.toLowerCase().includes(q)
        const boletaMatch = String(v.boletaNumero || '').toLowerCase().includes(q)
        const cajeroMatch = (v.cajeroNombre || '').toLowerCase().includes(q)
        const itemMatch = (v.items || []).some((it) =>
          (it.nombre || '').toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q)
        )
        if (!idMatch && !boletaMatch && !cajeroMatch && !itemMatch) return false
      }

      return true
    })
  }, [ventas, filtroSede, filtroEstado, filtroCajera, filtroMetodo, searchQuery])

  // Paginación sobre la lista filtrada
  const totalPages = Math.ceil(filteredVentas.length / itemsPerPage) || 1
  const paginatedVentas = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredVentas.slice(start, start + itemsPerPage)
  }, [filteredVentas, currentPage, itemsPerPage])

  // Reset page al cambiar filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [filtroSede, filtroEstado, filtroCajera, filtroMetodo, searchQuery, batchLimit])

  // Imprimir comprobante
  const handlePrint = (v: VentaPOS) => {
    const sedeName = SEDES[v.sede as SedeSlug] || v.sede || 'Importadora Carlitos'
    const items = (v.items || []).map((it) => ({
      sku: it.sku,
      nombre: it.nombre,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario || 0,
      subtotal: it.subtotal,
      embalajeQty: (it as any).embalajeQty,
      packageQty: (it as any).packageQty,
    }))
    const pagos = getVentaPagosSafe(v).map((p) => ({
      metodo: p.metodo,
      monto: p.monto,
    }))
    const fechaHora = formatFecha(v.fecha) + ' ' + formatHora(v.fecha)

    openReceiptPrintWindow(
      {
        tipoComprobante: 'comprobante',
        folio: typeof v.boletaNumero === 'number' ? v.boletaNumero : undefined,
        fechaHora,
        cajeraNombre: v.cajeroNombre || 'Cajera',
        sedeNombre: sedeName,
        items,
        total: v.total,
        efectivoPagado: Number(v.efectivoPagado || 0),
        pagos,
        metodoPago: (v as any).metodoPago || (pagos.length > 0 ? pagos[0].metodo : 'efectivo'),
        descuentoGlobal: v.descuentoGlobal,
        vuelto: v.vuelto,
        debitoOrdenNumero: v.debitoOrdenNumero ?? null,
        ordenDebito: v.debitoOrdenNumero ? String(v.debitoOrdenNumero) : undefined,
      },
      empresaConfig
    )
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── Encabezado Principal ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <NextLink
              href="/erp-dashboard"
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
              title="Volver al Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </NextLink>
            <div className="relative">
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold shadow-xs ${
                  radarActivo
                    ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-500/20'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Activity className={`h-5 w-5 ${radarActivo ? 'animate-pulse text-rose-500' : ''}`} />
              </div>
              {radarActivo && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Ventas en Tiempo Real
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    radarActivo
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      radarActivo ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                    }`}
                  />
                  {radarActivo ? 'Radar En Vivo (Streaming)' : 'Modo Historial (Pausado)'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Monitoreo continuo de tickets emitidos desde el POS en Importadora Carlitos Central.
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Consumo Inteligente de Lecturas */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Switch Modo Radar vs Historial */}
          <button
            type="button"
            onClick={() => setRadarActivo(!radarActivo)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs transition border ${
              radarActivo
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
            }`}
            title="Activa o desactiva la escucha continua de Firebase para ahorrar lecturas"
          >
            <Zap className={`h-4 w-4 ${radarActivo ? 'fill-rose-500 text-rose-500' : ''}`} />
            {radarActivo ? 'Pausar Radar' : 'Activar Radar En Vivo'}
          </button>

          {/* Límite de carga para optimizar cuota de Firestore */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700 text-xs font-medium">
            <span className="px-2 text-slate-500 dark:text-slate-400">Límite:</span>
            {[20, 50, 100].map((lim) => (
              <button
                key={lim}
                onClick={() => setBatchLimit(lim)}
                className={`px-2.5 py-1 rounded-lg transition ${
                  batchLimit === lim
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Traer últimas ${lim} ventas de Firestore`}
              >
                {lim}
              </button>
            ))}
          </div>

          {/* Botón Refrescar Manual */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
            title="Consultar ventas recientes ahora"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ─── Banner Informativo de Optimización ─── */}
      <div className="rounded-xl p-3 bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent border border-emerald-500/20 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Optimización Activa:</strong> Esta vista consulta únicamente las últimas{' '}
            <strong>{batchLimit} ventas</strong>. Al estar en modo radar, solo suma 1 lectura por cada venta real nueva que registre una cajera.
          </span>
        </div>
        <div className="text-right text-[11px] text-slate-500 shrink-0 hidden sm:block">
          Colección: <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">ventas_pos</code> (db: donbalato)
        </div>
      </div>

      {/* ─── Tarjetas de Resumen Rápido (KPIs Hoy) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Facturado Hoy */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Ventas Hoy
            </span>
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {fmtCLP(metricsToday.totalHoy)}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Calendar className="h-3.5 w-3.5 text-emerald-500" />
            <span>En {metricsToday.ticketsHoy} tickets emitidos hoy</span>
          </div>
        </div>

        {/* Tickets Hoy & Promedio */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ticket Promedio
            </span>
            <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {fmtCLP(metricsToday.ticketPromedio)}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShoppingBag className="h-3.5 w-3.5 text-sky-500" />
            <span>Gasto medio por cliente</span>
          </div>
        </div>

        {/* Efectivo vs Digital */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Medios de Pago Hoy
            </span>
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <Banknote className="h-3 w-3 text-emerald-500" /> Efectivo:
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {fmtCLP(metricsToday.efectivoHoy)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <Smartphone className="h-3 w-3 text-blue-500" /> Débito / Tarj:
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {fmtCLP(metricsToday.digitalHoy)}
              </span>
            </div>
          </div>
        </div>

        {/* Desglose por Sede */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Por Sucursal Hoy
            </span>
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <MapPin className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1.5">
            {Object.keys(metricsToday.bySede).length === 0 ? (
              <p className="text-xs text-slate-400 italic">Sin ventas hoy todavía</p>
            ) : (
              Object.entries(metricsToday.bySede).map(([s, data]) => {
                const b = getSedeBadge(s)
                return (
                  <div key={s} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[120px]">
                      {b.label}:
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {fmtCLP(data.total)} ({data.count})
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Barra de Filtros y Búsqueda ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Buscador libre */}
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por boleta, cajera, producto..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtro Sede */}
          <div>
            <select
              value={filtroSede}
              onChange={(e) => setFiltroSede(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="todas">Todas las sedes</option>
              {SEDE_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {SEDES[slug] || slug}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Método de Pago */}
          <div>
            <select
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="todos">Todos los pagos</option>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>

          {/* Filtro Estado */}
          <div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="completada">Completadas</option>
              <option value="anulada">Anuladas</option>
              <option value="todas">Todos los estados</option>
            </select>
          </div>
        </div>

        {/* Fila secundaria: Cajera y Conteo de Resultados */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
          <div className="flex items-center gap-2">
            <span>Filtrar por cajera:</span>
            <select
              value={filtroCajera}
              onChange={(e) => setFiltroCajera(e.target.value)}
              className="py-1 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="todas">Todas las cajeras</option>
              {listaCajeras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Mostrando <strong>{paginatedVentas.length}</strong> de{' '}
              <strong>{filteredVentas.length}</strong> ventas filtradas (de {ventas.length} cargadas)
            </span>
            {(filtroSede !== 'todas' ||
              filtroMetodo !== 'todos' ||
              filtroEstado !== 'completada' ||
              filtroCajera !== 'todas' ||
              searchQuery) && (
              <button
                onClick={() => {
                  setFiltroSede('todas')
                  setFiltroMetodo('todos')
                  setFiltroEstado('completada')
                  setFiltroCajera('todas')
                  setSearchQuery('')
                }}
                className="text-emerald-600 hover:text-emerald-700 font-semibold underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Tabla / Feed de Ventas en Vivo ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mx-auto" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Conectando con el canal de ventas del POS...
            </p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <button
              onClick={handleManualRefresh}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700"
            >
              Reintentar
            </button>
          </div>
        ) : filteredVentas.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Activity className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
              No se encontraron ventas con los filtros actuales
            </p>
            <p className="text-xs text-slate-500">
              Prueba cambiando la sede, el método de pago o limpiando la búsqueda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Hora / Fecha</th>
                  <th className="py-3 px-4 font-semibold">Sucursal</th>
                  <th className="py-3 px-4 font-semibold">Cajera</th>
                  <th className="py-3 px-4 font-semibold">Boleta / ID</th>
                  <th className="py-3 px-4 font-semibold">Productos</th>
                  <th className="py-3 px-4 font-semibold">Método de Pago</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold text-center">Estado</th>
                  <th className="py-3 px-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedVentas.map((venta) => {
                  const isNew = venta.id === lastSaleAlertId
                  const badge = getSedeBadge(venta.sede)
                  const itemsCount = (venta.items || []).reduce((acc, it) => acc + (it.cantidad || 1), 0)
                  const isAnulada = venta.estado === 'anulada'

                  return (
                    <tr
                      key={venta.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition duration-150 ${
                        isNew
                          ? 'bg-rose-500/15 dark:bg-rose-500/20 animate-pulse'
                          : isAnulada
                          ? 'opacity-60 bg-rose-50/30 dark:bg-rose-950/10'
                          : ''
                      }`}
                    >
                      {/* Hora / Fecha */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatHora(venta.fecha)}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <span>{formatFecha(venta.fecha)}</span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {formatRelativeTime(venta.fecha)}
                          </span>
                        </div>
                      </td>

                      {/* Sucursal */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badge.cls}`}
                        >
                          <MapPin className="h-3 w-3" />
                          {badge.label}
                        </span>
                      </td>

                      {/* Cajera */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {venta.cajeroNombre || 'Sin cajero'}
                        </div>
                      </td>

                      {/* Boleta / ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {venta.boletaNumero ? `#${venta.boletaNumero}` : venta.id.slice(0, 8)}
                        </div>
                        {venta.debitoOrdenNumero && (
                          <div className="text-[10px] font-mono text-slate-400">
                            Ref: {venta.debitoOrdenNumero}
                          </div>
                        )}
                      </td>

                      {/* Productos */}
                      <td className="py-3.5 px-4 max-w-xs truncate">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {venta.items && venta.items.length > 0
                            ? venta.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')
                            : 'Sin ítems detallados'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {itemsCount} {itemsCount === 1 ? 'unidad' : 'unidades'} en total
                        </div>
                      </td>

                      {/* Método de Pago */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {(() => {
                            const pgs = getVentaPagosSafe(venta)
                            if (pgs.length === 0) {
                              return <span className="text-slate-400 italic">No especificado</span>
                            }
                            return pgs.map((p, idx) => {
                              const m = (p.metodo || '').toLowerCase()
                              const isEfectivo = m === 'efectivo'
                              return (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                    isEfectivo
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                      : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                                  }`}
                                >
                                  {isEfectivo ? (
                                    <Banknote className="h-3 w-3" />
                                  ) : (
                                    <CreditCard className="h-3 w-3" />
                                  )}
                                  {p.metodo.toUpperCase()}: {fmtCLP(p.monto)}
                                </span>
                              )
                            })
                          })()}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div
                          className={`text-sm font-black ${
                            isAnulada
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {fmtCLP(venta.total || 0)}
                        </div>
                        {venta.descuentoGlobal && venta.descuentoGlobal > 0 ? (
                          <div className="text-[10px] text-rose-500 font-medium">
                            Desc: -{fmtCLP(venta.descuentoGlobal)}
                          </div>
                        ) : null}
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isAnulada
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {isAnulada ? (
                            <>
                              <X className="h-3 w-3" /> Anulada
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Completada
                            </>
                          )}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedVenta(venta)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Ver Detalle Completo"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrint(venta)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Imprimir comprobante interno"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Paginador del Cliente ─── */}
        {!loading && filteredVentas.length > 0 && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> (
              {filteredVentas.length} ventas en lista)
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(Math.max(0, currentPage - 3), currentPage + 2)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`h-7 w-7 rounded-lg font-semibold transition ${
                      currentPage === p
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal de Detalle de Venta ─── */}
      {selectedVenta && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabecera del modal */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Venta {selectedVenta.boletaNumero ? `#${selectedVenta.boletaNumero}` : selectedVenta.id.slice(0, 8)}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {formatFecha(selectedVenta.fecha)} {formatHora(selectedVenta.fecha)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVenta(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="p-4 space-y-4 overflow-y-auto text-xs">
              {/* Metadatos */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 text-[10px] block">SUCURSAL</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {getSedeBadge(selectedVenta.sede).label}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">CAJERA</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedVenta.cajeroNombre || 'Sin cajero'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">ESTADO</span>
                  <span
                    className={`font-semibold ${
                      selectedVenta.estado === 'anulada' ? 'text-rose-500' : 'text-emerald-500'
                    }`}
                  >
                    {selectedVenta.estado === 'anulada' ? 'Anulada' : 'Completada'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">REF. DÉBITO</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {selectedVenta.debitoOrdenNumero || '—'}
                  </span>
                </div>
              </div>

              {/* Lista de productos */}
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2">
                  Productos Vendidos ({(selectedVenta.items || []).length})
                </h4>
                <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {(selectedVenta.items || []).map((it, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {it.nombre}
                          {it && formatEmbalajeBoletaLabel(it) ? (
                            <strong className="font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 text-[11px] ml-1.5">
                              {formatEmbalajeBoletaLabel(it).trim()}
                            </strong>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formatProductCodeLabel(it) || `SKU: ${it.sku || 'N/A'}`} • Cantidad: {it.cantidad} × {fmtCLP(it.precioUnitario || 0)}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {fmtCLP(it.subtotal || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desglose de Pago y Totales */}
              <div className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>{fmtCLP(selectedVenta.subtotal || selectedVenta.total)}</span>
                </div>
                {selectedVenta.descuentoGlobal && selectedVenta.descuentoGlobal > 0 ? (
                  <div className="flex justify-between text-rose-500">
                    <span>Descuento global:</span>
                    <span>-{fmtCLP(selectedVenta.descuentoGlobal)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Cobrado:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {fmtCLP(selectedVenta.total)}
                  </span>
                </div>

                {/* Métodos de Pago */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Desglose de Pago
                  </span>
                  {getVentaPagosSafe(selectedVenta).map((p, idx) => (
                    <div key={idx} className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span className="capitalize">{p.metodo}:</span>
                      <span className="font-semibold">{fmtCLP(p.monto)}</span>
                    </div>
                  ))}
                  {selectedVenta.vuelto && selectedVenta.vuelto > 0 ? (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span>Vuelto entregado:</span>
                      <span>{fmtCLP(selectedVenta.vuelto)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Pie del modal */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800/30">
              <button
                type="button"
                onClick={() => setSelectedVenta(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => handlePrint(selectedVenta)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shadow-xs"
              >
                <Printer className="h-4 w-4" />
                Imprimir comprobante interno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
