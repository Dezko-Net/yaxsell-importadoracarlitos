'use client'

import React, { useEffect, useMemo, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { collection, doc, getDoc, getDocs, query, where, limit, type QueryConstraint } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DEFAULT_SEDE, SEDE_SLUGS, SEDES, type SedeSlug } from '@/types'
import { fetchCuadresERP, type CuadreERP } from '@/lib/cuadresErpService'
import { fetchAllFirebaseErpProducts } from '@/lib/firebaseErpService'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'
import { obtenerGastosQueAfectanGanancia } from '@/lib/gastosProfit'
import {
  ArrowLeft, Bell, AlertTriangle, AlertCircle, CheckCircle2, Clock, DollarSign,
  Package, TrendingDown, Building2, Search, ChevronRight, ChevronDown,
  FileWarning, Wallet, Receipt, Activity, RefreshCw, ClipboardList,
  ShieldAlert, BadgeAlert, Zap
} from 'lucide-react'

// Alerta del ERP (resumen automático multi-sede)
type ErpAlertLevel = 'critical' | 'warning' | 'info'
type ErpAlertKind =
  | 'cuadre_pendiente'
  | 'diferencia_caja'
  | 'gastos_altos'
  | 'sin_ventas'
  | 'ganancia_negativa'

interface ErpAlert {
  id: string
  level: ErpAlertLevel
  kind: ErpAlertKind
  sede: string
  sedeLabel: string
  title: string
  description: string
  amount?: number
  ref?: string // fecha referencia
  action?: { label: string; to: string }
}

const formatCLP = (n: number): string => {
  if (!isFinite(n)) return '$0'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`
}

const Link = ({ to, children, ...rest }: any) => {
  let href = to
  if (href.startsWith('/_admin')) href = href.replace('/_admin', '/cuadres')
  else if (href.startsWith('/cajeras')) href = href.replace('/cajeras', '/cuadres/nuevo')
  return <NextLink href={href} {...rest}>{children}</NextLink>
}

// Analiza un cuadre o reporte diario y genera alertas si hay anomalías
function analyzeDayReport(
  data: any,
  slug: string,
  label: string,
  fecha: string,
  refLabel: 'hoy' | 'ayer',
  out: ErpAlert[],
  th: { DIFF_THRESHOLD: number; DIFF_CRITICAL: number; GASTOS_RATIO_WARN: number; GASTOS_RATIO_CRIT: number }
) {
  const calc = data?.calculos || {}
  const totalBruto = Number(calc?.totalBruto) || 0
  const totalNeto = Number(calc?.totalNeto) || 0
  const gastosQueAfectanGanancia = obtenerGastosQueAfectanGanancia(data)
  const diffEf = Number(calc?.diferenciaEfectivo) || 0
  const diffDeb = Number(calc?.diferenciaDebito) || 0
  const diffTotal = Number(calc?.diferenciaTotal) || (diffEf + diffDeb)

  // Diferencia de caja
  const absDiff = Math.abs(diffTotal)
  if (absDiff > th.DIFF_THRESHOLD) {
    const isCrit = absDiff > th.DIFF_CRITICAL
    const signo = diffTotal > 0 ? 'faltante' : 'sobrante'
    out.push({
      id: `diff-${slug}-${fecha}`,
      level: isCrit ? 'critical' : 'warning',
      kind: 'diferencia_caja',
      sede: slug,
      sedeLabel: label,
      title: `Diferencia de caja (${refLabel})`,
      description: `${label} presenta ${signo} de ${formatCLP(absDiff)} el ${fecha}. Efectivo: ${formatCLP(diffEf)} · Débito: ${formatCLP(diffDeb)}.`,
      amount: absDiff,
      ref: fecha,
      action: { label: 'Revisar cuadre', to: `/erp?sede=${slug}` },
    })
  }

  // Sin ventas en el día con cuadre enviado
  if (totalBruto === 0 && (data?.estado === 'enviado' || data?.estado === 'cerrado')) {
    out.push({
      id: `sinventas-${slug}-${fecha}`,
      level: refLabel === 'hoy' ? 'info' : 'warning',
      kind: 'sin_ventas',
      sede: slug,
      sedeLabel: label,
      title: `Sin ventas registradas (${refLabel})`,
      description: `${label} tiene cuadre enviado el ${fecha} pero con $0 en ventas. Verificar.`,
      ref: fecha,
    })
    return
  }

  // Ratio gastos / ventas
  if (totalBruto > 0 && gastosQueAfectanGanancia > 0) {
    const ratio = gastosQueAfectanGanancia / totalBruto
    if (ratio >= th.GASTOS_RATIO_WARN) {
      const isCrit = ratio >= th.GASTOS_RATIO_CRIT
      out.push({
        id: `gastos-${slug}-${fecha}`,
        level: isCrit ? 'critical' : 'warning',
        kind: 'gastos_altos',
        sede: slug,
        sedeLabel: label,
        title: `Gastos que afectan la ganancia elevados (${refLabel})`,
        description: `${label} · Los gastos que afectan la ganancia suman ${formatCLP(gastosQueAfectanGanancia)} (${(ratio * 100).toFixed(0)}% de las ventas brutas de ${formatCLP(totalBruto)}). Las compras de mercadería anotadas aparte no se incluyen.`,
        amount: gastosQueAfectanGanancia,
        ref: fecha,
        action: { label: 'Ver cuadre', to: `/erp?sede=${slug}` },
      })
    }
  }

  // Ganancia negativa
  if (totalNeto < 0) {
    out.push({
      id: `gananeg-${slug}-${fecha}`,
      level: 'critical',
      kind: 'ganancia_negativa',
      sede: slug,
      sedeLabel: label,
      title: `Caja neta negativa (${refLabel})`,
      description: `${label} · Las salidas de caja superan los ingresos por ${formatCLP(Math.abs(totalNeto))} el ${fecha}. Este monto es de caja, no una medición de ganancia; puede incluir compras de mercadería.`,
      amount: Math.abs(totalNeto),
      ref: fecha,
    })
  }
}

export default function AlertasPage() {
  const router = useRouter()
  const [sede, setSede] = useState<string>(DEFAULT_SEDE)
  const [desde, setDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const [slowMaxUnits, setSlowMaxUnits] = useState(2)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [rows, setRows] = useState<
    Array<{
      sku: string
      nombre: string
      stock: number
      sold: number
      lastSaleDate: string | null
      daysSinceLastSale: number | null
    }>
  >([])

  // Alertas automáticas del ERP (todas las sedes)
  const [erpAlerts, setErpAlerts] = useState<ErpAlert[]>([])
  const [loadingErp, setLoadingErp] = useState(true)
  const [filterLevel, setFilterLevel] = useState<'todas' | ErpAlertLevel>('todas')
  const [showStockSection, setShowStockSection] = useState(false)

  const sedeOptions = useMemo(() => Array.from(new Set(SEDE_SLUGS)), [])
  const sedeLabel = SEDES[sede] || sede

  // Carga automática de alertas ERP (multi-sede)
  const loadErpAlerts = async () => {
    setLoadingErp(true)
    try {
      const today = new Date(Date.now() - 3 * 60 * 60 * 1000)
      const yday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      const todayStr = today.toISOString().slice(0, 10)
      const ydayStr = yday.toISOString().slice(0, 10)
      const found: ErpAlert[] = []

      const DIFF_THRESHOLD = 5000        // > $5.000 = warning
      const DIFF_CRITICAL = 30000        // > $30.000 = critical
      const GASTOS_RATIO_WARN = 0.30     // 30% de ventas = warning
      const GASTOS_RATIO_CRIT = 0.50     // 50% de ventas = critical

      // Cargar cuadres recientes desde Firestore
      const cuadres = await fetchCuadresERP(1)
      const cuadresMap = new Map<string, CuadreERP>()
      cuadres.forEach(c => {
        if (c.sede && c.fecha) {
          cuadresMap.set(`${c.sede}__${c.fecha}`, c)
        }
      })

      // Cargar sesiones de caja activas de hoy
      const activeSessionsMap = new Map<string, any>()
      if (db) {
        try {
          await Promise.all(
            sedeOptions.map(async (slug) => {
              const docRef = doc(db!, 'caja_sesiones', `active_${slug}`)
              const snap = await getDoc(docRef)
              if (snap.exists()) {
                activeSessionsMap.set(slug, snap.data())
              }
            })
          )
        } catch (err) {
          console.warn('[Alertas] Error cargando sesiones:', err)
        }
      }

      for (const slug of sedeOptions) {
        const label = SEDES[slug] || slug

        // Cuadre de HOY
        const cuadreHoy = cuadresMap.get(`${slug}__${todayStr}`)
        const sessionHoy = activeSessionsMap.get(slug)

        if (cuadreHoy) {
          analyzeDayReport(cuadreHoy, slug, label, todayStr, 'hoy', found, { DIFF_THRESHOLD, DIFF_CRITICAL, GASTOS_RATIO_WARN, GASTOS_RATIO_CRIT })
        } else if (sessionHoy) {
          // Sesión activa sin cuadre cerrado
          const ventasHoy = Number(sessionHoy.totalVentas) || 0
          if (ventasHoy === 0 && today.getHours() >= 14) {
            found.push({
              id: `sinventas-session-${slug}-${todayStr}`,
              level: 'warning',
              kind: 'sin_ventas',
              sede: slug,
              sedeLabel: label,
              title: `Sesión activa sin ventas`,
              description: `${label} tiene caja abierta hoy pero registra $0 en ventas.`,
              ref: todayStr,
            })
          }
        } else if (today.getHours() >= 12 && SEDE_SLUGS.includes(slug as SedeSlug)) {
          found.push({
            id: `cuadre-${slug}-${todayStr}`,
            level: 'info',
            kind: 'cuadre_pendiente',
            sede: slug,
            sedeLabel: label,
            title: `Caja sin abrir o cuadre pendiente`,
            description: `${label} no registra sesión de caja activa ni corte para hoy (${todayStr}).`,
            ref: todayStr,
            action: { label: 'Crear cuadre', to: `/cuadres/nuevo` },
          })
        }

        // Cuadre de AYER
        const cuadreAyer = cuadresMap.get(`${slug}__${ydayStr}`)
        if (cuadreAyer) {
          analyzeDayReport(cuadreAyer, slug, label, ydayStr, 'ayer', found, { DIFF_THRESHOLD, DIFF_CRITICAL, GASTOS_RATIO_WARN, GASTOS_RATIO_CRIT })
        } else if (SEDE_SLUGS.includes(slug as SedeSlug)) {
          found.push({
            id: `cuadre-ayer-${slug}-${ydayStr}`,
            level: 'warning',
            kind: 'cuadre_pendiente',
            sede: slug,
            sedeLabel: label,
            title: `Sin cuadre de ayer`,
            description: `${label} no tiene corte cerrado para el día de ayer (${ydayStr}).`,
            ref: ydayStr,
            action: { label: 'Completar corte', to: `/cuadres/nuevo` },
          })
        }
      }

      // Ordenar: critical → warning → info
      const weight: Record<ErpAlertLevel, number> = { critical: 0, warning: 1, info: 2 }
      found.sort((a, b) => weight[a.level] - weight[b.level])
      setErpAlerts(found)
    } catch (e) {
      console.error('[Alertas] Error cargando ERP alerts:', e)
    } finally {
      setLoadingErp(false)
    }
  }

  useEffect(() => { loadErpAlerts() }, [])

  // Análisis de stock estancado / lento movimiento
  const analyzeStock = async () => {
    setLoading(true)
    setMsg('')
    try {
      // 1. Cargar productos desde catálogo maestro
      const products = await fetchAllFirebaseErpProducts()
      const productNameBySku = new Map<string, string>()
      const stockBySku = new Map<string, number>()

      products.forEach(p => {
        const sku = String(p.sku || '').trim().toUpperCase()
        if (sku) {
          productNameBySku.set(sku, p.nombre || sku)
          stockBySku.set(sku, p.stock || 0)
        }
      })

      // 2. Cargar ventas del rango en ventas_pos si hay db
      const soldBySku = new Map<string, number>()
      const lastSaleDateBySku = new Map<string, string>()

      if (db) {
        try {
          const constraints: QueryConstraint[] = [
            where('fechaStr', '>=', desde),
            where('fechaStr', '<=', hasta),
          ]
          // Keep the central store's legacy documents without `sede`; for other
          // branches restrict the read at Firestore instead of discarding rows later.
          if (!matchBranchSlug(sede, 'donbalato-central')) {
            constraints.unshift(where('sede', 'in', branchSlugQueryValues(sede)))
          }
          constraints.push(limit(1000))
          const qVentas = query(collection(db, 'ventas_pos'), ...constraints)
          let snapV
          try {
            snapV = await getDocs(qVentas)
          } catch (error) {
            if (matchBranchSlug(sede, 'donbalato-central')) throw error
            console.warn('[Alertas] Índice por sucursal pendiente; consultando el rango y filtrando localmente:', error)
            snapV = await getDocs(query(
              collection(db, 'ventas_pos'),
              where('fechaStr', '>=', desde),
              where('fechaStr', '<=', hasta),
              limit(1000)
            ))
          }
          snapV.forEach(d => {
            const data: any = d.data()
            if (sede && !matchBranchSlug(data.sede || 'donbalato-central', sede)) return
            const fechaStr = data.fechaStr
            let items: any[] = []
            if (typeof data.itemsJson === 'string') {
              try { items = JSON.parse(data.itemsJson) } catch {}
            } else if (Array.isArray(data.items)) {
              items = data.items
            }
            items.forEach(it => {
              const sku = String(it.sku || it.SKU || '').trim().toUpperCase()
              const qty = Number(it.cantidad || it.quantity) || 1
              if (sku) {
                soldBySku.set(sku, (soldBySku.get(sku) || 0) + qty)
                lastSaleDateBySku.set(sku, fechaStr)
              }
            })
          })
        } catch (err) {
          console.warn('[Alertas] No se pudieron consultar ventas_pos:', err)
        }
      }

      // 3. Preparar tabla unificada
      const allSkus = Array.from(new Set([...Array.from(stockBySku.keys()), ...Array.from(soldBySku.keys())]))
      const todayDate = new Date()
      const out: Array<{
        sku: string
        nombre: string
        stock: number
        sold: number
        lastSaleDate: string | null
        daysSinceLastSale: number | null
      }> = []

      for (const sku of allSkus) {
        const stock = stockBySku.get(sku) || 0
        const sold = soldBySku.get(sku) || 0
        const lastSaleDate = lastSaleDateBySku.get(sku) || null
        const daysSince = lastSaleDate ? Math.round((todayDate.getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)) : null
        const nombre = productNameBySku.get(sku) || sku
        out.push({ sku, nombre, stock, sold, lastSaleDate, daysSinceLastSale: daysSince })
      }

      out.sort((a, b) => (b.sold || 0) - (a.sold || 0))
      setRows(out)
      setMsg(`Análisis completado para ${out.length} productos en ${sedeLabel}.`)
    } catch (e: any) {
      setRows([])
      setMsg('Error analizando: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  // Contadores ERP + filtrado
  const erpCounts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 }
    erpAlerts.forEach(a => { c[a.level]++ })
    return c
  }, [erpAlerts])

  const visibleErpAlerts = useMemo(() => {
    let list = erpAlerts
    if (filterLevel !== 'todas') list = list.filter(a => a.level === filterLevel)
    const q = String(search || '').trim().toLowerCase()
    if (q) {
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.sedeLabel.toLowerCase().includes(q)
      )
    }
    return list
  }, [erpAlerts, filterLevel, search])

  const filteredRows = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const sku = (r.sku || '').toLowerCase()
      const nombre = (r.nombre || '').toLowerCase()
      return sku.includes(q) || nombre.includes(q)
    })
  }, [rows, search])

  const stock0NoMove = useMemo(() => filteredRows.filter((r) => r.stock === 0 && (r.sold || 0) === 0), [filteredRows])
  const stockIntactoNoMove = useMemo(() => filteredRows.filter((r) => r.stock > 0 && (r.sold || 0) === 0), [filteredRows])
  const slowMovers = useMemo(
    () =>
      filteredRows
        .filter((r) => r.stock > 0 && (r.sold || 0) <= (Number(slowMaxUnits) || 0))
        .sort((a, b) => (b.stock || 0) - (a.stock || 0)),
    [filteredRows, slowMaxUnits]
  )

  const totalAlerts = erpAlerts.length
  const healthScore = totalAlerts === 0 ? 100 : Math.max(0, 100 - (erpCounts.critical * 15 + erpCounts.warning * 5 + erpCounts.info * 1))
  const healthColor = healthScore >= 80 ? 'emerald' : healthScore >= 50 ? 'amber' : 'rose'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-5 px-4 sm:px-6">
      <div className="max-w-[1400px] mx-auto">
        {/* ================= HEADER ================= */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => router.push('/erp-dashboard')}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            title="Volver al Dashboard"
          >
            <ArrowLeft size={16} className="text-slate-700 dark:text-slate-200" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Centro de Alertas & Anomalías</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold">
                <span className={`w-1.5 h-1.5 rounded-full ${loadingErp ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                {loadingErp ? 'Analizando' : 'En vivo'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Auditoría automática de cuadres, diferencias de caja, gastos y stock estancado.</p>
          </div>
          <div className="flex-1" />
          <button
            onClick={loadErpAlerts}
            disabled={loadingErp}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm"
          >
            <RefreshCw size={13} className={`${loadingErp ? 'animate-spin text-emerald-600' : 'text-slate-600 dark:text-slate-300'}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {/* ================= HEALTH + KPIs ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {/* Health Score Card */}
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${
            healthColor === 'emerald' ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400' :
            healthColor === 'amber' ? 'bg-gradient-to-br from-amber-500 to-orange-500 border-amber-400' :
            'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400'
          }`}>
            <div className="p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-90">Salud del ERP</span>
                <ShieldAlert size={16} className="opacity-80" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tabular-nums">{healthScore}</span>
                <span className="text-xl font-bold opacity-70">/100</span>
              </div>
              <div className="text-[11px] font-semibold opacity-90 mt-1">
                {healthScore >= 80 ? 'Todo bajo control' : healthScore >= 50 ? 'Atención requerida' : 'Acción inmediata'}
              </div>
              <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${healthScore}%` }} />
              </div>
            </div>
          </div>

          {/* Críticas */}
          <KpiStat
            label="Críticas"
            value={erpCounts.critical}
            subtitle="Acción inmediata"
            icon={<AlertCircle size={16} />}
            accent="rose"
            active={filterLevel === 'critical'}
            onClick={() => setFilterLevel(filterLevel === 'critical' ? 'todas' : 'critical')}
          />
          {/* Advertencias */}
          <KpiStat
            label="Advertencias"
            value={erpCounts.warning}
            subtitle="Revisar pronto"
            icon={<AlertTriangle size={16} />}
            accent="amber"
            active={filterLevel === 'warning'}
            onClick={() => setFilterLevel(filterLevel === 'warning' ? 'todas' : 'warning')}
          />
          {/* Informativas */}
          <KpiStat
            label="Informativas"
            value={erpCounts.info}
            subtitle="Para revisión"
            icon={<Bell size={16} />}
            accent="blue"
            active={filterLevel === 'info'}
            onClick={() => setFilterLevel(filterLevel === 'info' ? 'todas' : 'info')}
          />
        </div>

        {/* ================= LISTA DE ALERTAS ERP ================= */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Activity size={16} className="text-slate-700 dark:text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Alertas detectadas</h3>
              {filterLevel !== 'todas' && (
                <button
                  onClick={() => setFilterLevel('todas')}
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 underline"
                >
                  limpiar filtro
                </button>
              )}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en alertas o sedes..."
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 dark:text-white"
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tabular-nums">
              {visibleErpAlerts.length} de {erpAlerts.length}
            </span>
          </div>

          {loadingErp ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-slate-400 text-sm font-medium">
                <RefreshCw size={16} className="animate-spin text-emerald-500" /> Analizando todas las sucursales...
              </div>
            </div>
          ) : visibleErpAlerts.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
              <div className="text-sm font-bold text-slate-800 dark:text-white">
                {erpAlerts.length === 0 ? '¡Todo en orden!' : 'Sin alertas en este filtro'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {erpAlerts.length === 0 ? 'No se detectaron situaciones críticas ni desfases en ninguna sucursal.' : 'Prueba otro filtro para ver más resultados.'}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {visibleErpAlerts.map(a => (
                <AlertRow key={a.id} alert={a} />
              ))}
            </div>
          )}
        </div>

        {/* ================= ANÁLISIS DE INVENTARIO (Colapsable) ================= */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowStockSection(v => !v)}
            className="w-full px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Package size={16} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Auditoría de Stock & Lento Movimiento</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Detecta productos estancados, sin ventas o capital congelado.</p>
              </div>
            </div>
            {showStockSection ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </button>

          {showStockSection && (
            <div className="p-4">
              {/* Filtros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-end mb-4">
                <div className="lg:col-span-3">
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-1">SUCURSAL</label>
                  <select
                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-700 dark:text-white"
                    value={sede}
                    onChange={(e) => setSede(e.target.value)}
                  >
                    {sedeOptions.map((s) => <option key={s} value={s}>{SEDES[s] || s}</option>)}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-1">DESDE</label>
                  <input type="date" className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 dark:bg-slate-700 dark:text-white"
                    value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="lg:col-span-2">
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-1">HASTA</label>
                  <input type="date" className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 dark:bg-slate-700 dark:text-white"
                    value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
                <div className="lg:col-span-2">
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-1">VENTA LENTA ≤</label>
                  <div className="flex items-center gap-1">
                    <input className="w-16 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 dark:bg-slate-700 dark:text-white" value={slowMaxUnits}
                      onChange={(e) => setSlowMaxUnits(Number(e.target.value) || 0)} inputMode="numeric" />
                    <span className="text-[10px] text-slate-500">uds</span>
                  </div>
                </div>
                <div className="lg:col-span-3">
                  <button type="button" className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-bold transition shadow-sm disabled:opacity-50"
                    disabled={loading} onClick={analyzeStock}>
                    {loading ? 'Analizando...' : 'Analizar inventario'}
                  </button>
                </div>
              </div>

              {msg && <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 font-medium">ℹ️ {msg}</div>}

              {/* Resultados en tarjetas mini */}
              {rows.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <StockMiniCard color="rose" icon={<AlertCircle size={14} />} label="Stock = 0 sin ventas" count={stock0NoMove.length} />
                  <StockMiniCard color="amber" icon={<AlertTriangle size={14} />} label="Con stock sin ventas" count={stockIntactoNoMove.length} />
                  <StockMiniCard color="emerald" icon={<Clock size={14} />} label="Venta lenta" count={slowMovers.length} />
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <StockDetails title={`Stock = 0 · sin ventas`} count={stock0NoMove.length} color="rose" items={stock0NoMove} showStock={false} showSold={false} />
                <StockDetails title={`Con stock · sin ventas`} count={stockIntactoNoMove.length} color="amber" items={stockIntactoNoMove} showStock showSold={false} />
                <StockDetails title={`Venta lenta (≤ ${slowMaxUnits})`} count={slowMovers.length} color="emerald" items={slowMovers} showStock showSold />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------- Componentes auxiliares -------------------- */

function KpiStat({ label, value, subtitle, icon, accent, active, onClick }: {
  label: string; value: number; subtitle: string; icon: any;
  accent: 'rose' | 'amber' | 'blue';
  active: boolean; onClick: () => void;
}) {
  const styles = {
    rose: { icon: 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400', value: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-400' },
    amber: { icon: 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400', value: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-400' },
    blue: { icon: 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400', value: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-400' },
  }[accent]
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4 transition hover:shadow-md ${active ? `ring-2 ${styles.ring}` : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${styles.icon} flex items-center justify-center`}>{icon}</div>
      </div>
      <div className={`text-4xl font-black tabular-nums ${styles.value}`}>{value}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">{subtitle}</div>
    </button>
  )
}

const KIND_LABEL: Record<ErpAlertKind, string> = {
  cuadre_pendiente: 'Cuadre pendiente',
  diferencia_caja: 'Diferencia de caja',
  gastos_altos: 'Gastos altos',
  sin_ventas: 'Sin ventas',
  ganancia_negativa: 'Pérdida',
}

function AlertRow({ alert }: { alert: ErpAlert }) {
  const level = alert.level
  const config = level === 'critical'
    ? { accent: 'bg-rose-500', iconBg: 'bg-rose-100 dark:bg-rose-950/50', iconText: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800' }
    : level === 'warning'
    ? { accent: 'bg-amber-500', iconBg: 'bg-amber-100 dark:bg-amber-950/50', iconText: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800' }
    : { accent: 'bg-blue-500', iconBg: 'bg-blue-100 dark:bg-blue-950/50', iconText: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800' }

  const kindIcon = alert.kind === 'cuadre_pendiente' ? <FileWarning size={14} />
    : alert.kind === 'diferencia_caja' ? <Wallet size={14} />
    : alert.kind === 'gastos_altos' ? <Receipt size={14} />
    : alert.kind === 'sin_ventas' ? <TrendingDown size={14} />
    : alert.kind === 'ganancia_negativa' ? <BadgeAlert size={14} />
    : <Zap size={14} />

  return (
    <div className="group flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition relative">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.accent}`} />
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${config.iconBg} ${config.iconText} flex items-center justify-center ml-1`}>
        {kindIcon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${config.badge}`}>
            {KIND_LABEL[alert.kind] || alert.kind}
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
            <Building2 size={10} /> {alert.sedeLabel}
          </span>
          {alert.ref && (
            <span className="text-[10px] text-slate-400 font-mono">{alert.ref}</span>
          )}
        </div>
        <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{alert.title}</div>
        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">{alert.description}</div>
      </div>
      {alert.action && (
        <Link to={alert.action.to} className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-bold hover:bg-slate-700 dark:hover:bg-slate-600 transition shadow-xs">
          {alert.action.label}
          <ChevronRight size={11} />
        </Link>
      )}
    </div>
  )
}

function StockMiniCard({ color, icon, label, count }: { color: 'rose' | 'amber' | 'emerald'; icon: any; label: string; count: number }) {
  const cfg = color === 'rose' ? { bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', num: 'text-rose-900 dark:text-rose-100', iconBg: 'bg-rose-500' }
    : color === 'amber' ? { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', num: 'text-amber-900 dark:text-amber-100', iconBg: 'bg-amber-500' }
    : { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', num: 'text-emerald-900 dark:text-emerald-100', iconBg: 'bg-emerald-500' }
  return (
    <div className={`rounded-xl ${cfg.bg} border ${cfg.border} p-3 flex items-center gap-3`}>
      <div className={`w-8 h-8 rounded-lg ${cfg.iconBg} text-white flex items-center justify-center shadow-sm`}>{icon}</div>
      <div className="flex-1">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>{label}</div>
        <div className={`text-xl font-black tabular-nums ${cfg.num}`}>{count.toLocaleString('es-CL')}</div>
      </div>
    </div>
  )
}

function StockDetails({ title, count, color, items, showStock, showSold }: {
  title: string; count: number; color: 'rose' | 'amber' | 'emerald';
  items: Array<{ sku: string; nombre: string; stock: number; sold: number; lastSaleDate: string | null }>;
  showStock: boolean; showSold: boolean;
}) {
  const cfg = color === 'rose' ? { border: 'border-rose-200 dark:border-rose-800', head: 'bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200' }
    : color === 'amber' ? { border: 'border-amber-200 dark:border-amber-800', head: 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200' }
    : { border: 'border-emerald-200 dark:border-emerald-800', head: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200' }
  return (
    <details className={`rounded-xl border ${cfg.border} overflow-hidden bg-white dark:bg-slate-800`}>
      <summary className={`cursor-pointer select-none ${cfg.head} px-3 py-2 text-xs font-bold flex items-center justify-between`}>
        <span>{title}</span>
        <span className="tabular-nums">{count.toLocaleString('es-CL')}</span>
      </summary>
      <div className="max-h-[380px] overflow-auto">
        <table className="min-w-full text-[11px]">
          <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="text-left px-3 py-1.5 font-semibold">SKU</th>
              <th className="text-left px-3 py-1.5 font-semibold">Nombre</th>
              {showStock && <th className="text-right px-3 py-1.5 font-semibold">Stock</th>}
              {showSold && <th className="text-right px-3 py-1.5 font-semibold">Vend.</th>}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 100).map((r, idx) => (
              <tr key={r.sku} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-700/30'}>
                <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200 font-mono">{r.sku}</td>
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.nombre || '—'}</td>
                {showStock && <td className="px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">{r.stock.toLocaleString('es-CL')}</td>}
                {showSold && <td className="px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">{(r.sold || 0).toLocaleString('es-CL')}</td>}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400 text-center" colSpan={2 + (showStock ? 1 : 0) + (showSold ? 1 : 0)}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  )
}
