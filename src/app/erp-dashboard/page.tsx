'use client'

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot, ReferenceLine
} from 'recharts'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package,
  MessageCircle, Brain, FileText, ArrowRight,
  Building2, Clock, AlertTriangle, Zap,
  ChevronRight, RefreshCw, Menu, X, Home, Calendar,
  ClipboardList, Boxes, Database, Calculator, Search,
  ShoppingCart, BarChart2, Activity, Star, Trophy, Bug, Trash2,
  Loader2, Bell, Receipt, Landmark, Link2,
  Shield, Copy, Split, Wallet, Target, Flame, Sparkles, PieChart as PieIcon, BarChart3, Radar as RadarIcon
} from 'lucide-react'
import { DEMO_WORKERS } from '@/data/demoWorkers'
import type { SedeSlug } from '@/types'
// [APPWRITE] Servicios de datos reales del ERP Yaxsel
import { fetchCuadresERP } from '@/lib/cuadresErpService'
import type { CuadreERP } from '@/lib/cuadresErpService'
import { fetchAllFirebaseErpProducts } from '@/lib/firebaseErpService'
import { obtenerGastosQueAfectanGanancia } from '@/lib/gastosProfit'
import { fetchTrabajadoresERP } from '@/lib/trabajadoresErpService'
import type { TrabajadorERP } from '@/lib/trabajadoresErpService'
import BalatoAiSpeechBubble from '@/components/erp/BalatoAiSpeechBubble'
import MarginHistoryChartCard from '@/components/erp/MarginHistoryChartCard'
import { useLiveDataVisibility } from '@/hooks/useLiveDataVisibility'

// ============================================================================
// SHIMS DE MIGRACIÓN (SOLO-VISUAL)
// Reemplazan Firebase / react-router-dom / auth / runtimeConfig del proyecto
// original Asistora. No hay lógica real: fuerzan modo demo para renderizar el
// diseño. La conexión a Appwrite se hará en una etapa posterior.
// ============================================================================

// react-router-dom → Next.js
// Mapa de rutas del ERP original (Asistora) → rutas reales de Yaxsel.
// Lo no mapeado cae al dashboard para evitar 404 (features aún sin equivalente).
function mapRoute(to?: string): string {
  if (!to) return '/erp-dashboard'
  const path = to.split('?')[0]
  const MAP: Record<string, string> = {
    '/': '/erp-dashboard',
    '/_admin': '/cuadres',
    '/admin': '/cuadres',
    '/pos-admin': '/pos-admin',
    // El destino depende del nivel POS y del cargo de la cuenta activa.
    '/pos': '/pos-acceso',
    '/dashboard-login': '/admin/login',
    '/inventario': '/inventario',
    '/base-datos': '/inventario',
    '/control-datos': '/inventario',
    '/cajeras': '/cuadres/nuevo',                        // Realizar Corte → nuevo cuadre
    '/planilla-unificada': '/erp-dashboard/planilla-unificada',  // Trabajadores → Planilla Unificada
    '/informe-general-trabajadores': '/erp-dashboard/equipo',
    '/analisis-cajeras': '/erp-dashboard/equipo',
    '/gastos': '/erp-dashboard/gastos',
    '/gastos-externos': '/erp-dashboard/gastos-externos',
    '/revision-costos': '/erp-dashboard/revision-costos',
    '/revision-precios': '/erp-dashboard/revision-precios',
    '/adelantos-personal': '/erp-dashboard/planilla-unificada',
  }
  if (MAP[path]) return MAP[path]
  if (path.startsWith('/top-products') || path.startsWith('/ganancias')) return '/cuadres'
  // IA (Cerebro IA / Chat IA / CONTADOR IA / ASIS) → módulo Yaxbot IA de Yaxsel
  if (path.startsWith('/whatsapp')) return '/admin/ia/whatsapp'
  if (/^\/(chat-ia|cerebro-ia|ia-consultor|asis-monitor|telegram)/.test(path)) return '/admin/ia'
  if (/^\/(alameda|copiapo|la-florida)$/.test(path)) return '/cuadres/nuevo'  // "hacer corte" de una sede → nuevo cuadre
  return '/erp-dashboard'
}
const Link = ({ to, children, ...rest }: any) => <NextLink href={mapRoute(to)} {...rest}>{children}</NextLink>
function useNavigate() {
  const router = useRouter()
  return useCallback((path: string) => { try { router.push(mapRoute(path)) } catch {} }, [router])
}

import { db } from '@/lib/firebase'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  updateDoc,
  getDocsFromServer,
} from 'firebase/firestore'

// useAuth → auth real de Firebase
import { useAuth } from '@/hooks/useAuth'
import { isAdminEmail } from '@/lib/admin-access'

// runtimeConfig → configuración cargada dinámicamente desde Appwrite (erp_config)
interface RuntimeBranchConfig { slug: SedeSlug; name: string; region: string; icon: string; color: string; active: boolean; imageUrl: string; managerEmail: string }
const DEFAULT_BRANDING = { companyLogoUrl: '/avatar.png', companyIconUrl: '/avatar.png', defaultUserAvatarUrl: '/avatar.png', titleColor: '#10b981' }
const DEFAULT_OWNER = { displayName: 'Administrador', email: 'dexkonet@gmail.com', photoURL: '/avatar.png' }
const DEFAULT_BRANCHES: RuntimeBranchConfig[] = [
  { slug: 'donbalato-central', name: 'Importadora Carlitos Central', region: 'Santiago', icon: '🏪', color: 'blue', active: true, imageUrl: '', managerEmail: '' },
]
const getDefaultRuntimeConfig = () => ({
  companyName: 'Yaxsel', legalName: 'Yaxsel', companyDescription: 'ERP Yaxsel',
  supremeAdminEmail: DEFAULT_OWNER.email, branding: DEFAULT_BRANDING, ownerProfile: DEFAULT_OWNER,
  firebase: { projectId: 'importadora-carlitos' }, branches: DEFAULT_BRANCHES, sparkMode: false,
})
async function loadRuntimeConfig() {
  try {
    const res = await fetch(`/api/admin-supreme/load-config?_t=${Date.now()}`)
    if (!res.ok) return getDefaultRuntimeConfig()
    const json = await res.json()
    if (!json.ok || !json.data) return getDefaultRuntimeConfig()
    const parsed = JSON.parse(json.data)
    const base = getDefaultRuntimeConfig()
    return {
      ...base,
      companyName: parsed.companyName || base.companyName,
      legalName: parsed.legalName || parsed.companyName || base.legalName,
      companyDescription: parsed.companyDescription || base.companyDescription,
      supremeAdminEmail: parsed.supremeAdminEmail || base.supremeAdminEmail,
      sparkMode: parsed.sparkMode ?? base.sparkMode,
      branding: { ...base.branding, ...(parsed.branding || {}) },
      ownerProfile: { ...base.ownerProfile, ...(parsed.ownerProfile || {}) },
      firebase: { ...base.firebase, ...(parsed.firebase || {}) },
      branches: Array.isArray(parsed.branches) && parsed.branches.length > 0 ? parsed.branches : base.branches,
    }
  } catch { return getDefaultRuntimeConfig() }
}
const getFirebaseProjectId = () => 'importadora-carlitos'
// [APPWRITE] Demo apagado: los datos ahora vienen de Appwrite (cuadres_erp)
const isRuntimeDemoProject = () => false

const DEFAULT_AVATAR = '/avatar.png'
// Config dinámica — se carga en el componente
const firebaseProjectId = getFirebaseProjectId()
const CLOUD_FUNCTIONS_BASE_URL = `https://us-central1-${firebaseProjectId}.cloudfunctions.net`
const IS_DEMO_PROJECT = isRuntimeDemoProject()
const DEMO_PROFILE_CACHE_KEY = `asistora_demo_profile_${firebaseProjectId}`

// Cache keys (bump version cuando agregues nuevos campos a SucursalData para invalidar caches viejos)
const CACHE_KEY = 'dashboard_cache_v4'
const CACHE_EXPIRY = 5 * 60 * 1000 // 5 minutos
const TOP_PRODS_CACHE_KEY = 'dashboard_top_products_v1'
const lastCuadreStatusCheck = { ts: 0, targetDate: '' }
const MEDIA_CACHE_KEY = 'dashboard_media_cache'
const MEDIA_CACHE_EXPIRY = 24 * 60 * 60 * 1000 // 24 horas

// Evitar almacenar imágenes/videos en Base64 dentro de localStorage (satura la cuota de 5MB y rompe la caché de productos del POS)
const cacheMedia = async (url: string): Promise<string> => {
  return url
}

const LOGO_URL = DEFAULT_BRANDING.companyLogoUrl || DEFAULT_BRANDING.companyIconUrl

interface SucursalData {
  slug: string
  name: string
  icon: string
  color: string
  ventas: number
  gastos: number
  ganancia: number
  cuadreEnviado?: boolean
}

interface Trabajador {
  id: string
  nombre: string
  cargo: string
  sucursal: string
  foto?: string
}

interface TopProduct {
  sku: string
  nombre: string
  cantidad: number
  ventas: number
  costoNeto: number
  imageUrl?: string
}

interface WebDashboardOrder {
  id: string
  collection: 'orders' | 'wholesale_orders' | 'vendor_orders'
  parentOrderId?: string
  customerName: string
  orderCode: string
  total: number
  status: string
  componentStatuses?: string[]
  paymentMethod: string
  createdAt: number
  takenByAi: boolean
}

interface DemoProfile {
  companyName: string
  userName: string
}

interface DayData {
  fecha: string     // 'dd/MM'
  fechaFull: string // 'yyyy-MM-dd'
  ventas: number
  gastos: number
  ganancia: number
}

export interface CajeraRanking {
  nombre: string
  ventas: number
  boletas: number
  articulos: number
  ticketPromedio: number
  porcentaje: number
}

export interface TurnoStats {
  totalBoletas: number
  ticketPromedio: number
  totalArticulos: number
}

function getSucursales(config = getDefaultRuntimeConfig()) {
  return (config.branches || []).filter((b) => b.active).map((branch) => ({
    slug: branch.slug,
    name: branch.name,
    icon: branch.icon,
    color: branch.color,
  }))
}

const ACTIVE_BRANCH_SLUGS = new Set<string>(getSucursales().map((branch) => branch.slug))

const DEMO_SUCURSAL_SEEDS: Record<string, { hoy: { ventas: number; gastos: number }; ayer: { ventas: number; gastos: number } }> = {
  'donbalato-central': { hoy: { ventas: 0, gastos: 0 }, ayer: { ventas: 0, gastos: 0 } },
}

const buildDemoMockSucursales = (mode: 'hoy' | 'ayer'): SucursalData[] => getSucursales().map((branch) => {
  const seed = DEMO_SUCURSAL_SEEDS[branch.slug] || { hoy: { ventas: 0, gastos: 0 }, ayer: { ventas: 0, gastos: 0 } }
  const snapshot = seed[mode]
  return {
    ...branch,
    ventas: snapshot.ventas,
    gastos: snapshot.gastos,
    ganancia: snapshot.ventas - snapshot.gastos,
  }
})

const DEMO_MOCK_SUCURSALES: SucursalData[] = buildDemoMockSucursales('hoy')

const DEMO_MOCK_TOP_PRODUCTS: TopProduct[] = [
  { sku: 'ARZ-001', nombre: 'Arroz Grado 2 1KG', cantidad: 186, ventas: 334800, costoNeto: 243000 },
  { sku: 'ACE-900', nombre: 'Aceite Vegetal 900ML', cantidad: 154, ventas: 569800, costoNeto: 421600 },
  { sku: 'AZU-001', nombre: 'Azúcar 1KG', cantidad: 141, ventas: 239700, costoNeto: 181890 },
  { sku: 'PST-500', nombre: 'Pasta Spaghetti 500G', cantidad: 128, ventas: 217600, costoNeto: 163840 },
  { sku: 'ATN-170', nombre: 'Atún Lomitos 170G', cantidad: 93, ventas: 325500, costoNeto: 241800 },
]

const DEMO_MOCK_SUCURSALES_AYER: SucursalData[] = buildDemoMockSucursales('ayer')

const DEMO_MOCK_TOP_PRODUCTS_AYER: TopProduct[] = [
  { sku: 'ARZ-001', nombre: 'Arroz Grado 2 1KG', cantidad: 172, ventas: 309600, costoNeto: 224500 },
  { sku: 'ACE-900', nombre: 'Aceite Vegetal 900ML', cantidad: 149, ventas: 551300, costoNeto: 407900 },
  { sku: 'AZU-001', nombre: 'Azúcar 1KG', cantidad: 133, ventas: 226100, costoNeto: 171500 },
  { sku: 'PST-500', nombre: 'Pasta Spaghetti 500G', cantidad: 119, ventas: 202300, costoNeto: 152200 },
  { sku: 'ATN-170', nombre: 'Atún Lomitos 170G', cantidad: 87, ventas: 304500, costoNeto: 226300 },
]

const DEMO_MOCK_TRABAJADORES: Trabajador[] = [
  ...DEMO_WORKERS.filter((w) => ACTIVE_BRANCH_SLUGS.has(w.sede)).map((w) => ({
    id: w.id,
    nombre: w.nombre,
    cargo: w.cargo,
    sucursal: w.sede,
    foto: w.fotoUrl,
  })),
]

const formatCLP = (n: number) => 
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const formatCompact = (n: number) => formatCLP(n) // Mostrar cifras completas

const colorClasses: Record<string, { bg: string, text: string, border: string, light: string }> = {
  pink: { bg: 'bg-pink-500', text: 'text-pink-600', border: 'border-pink-200', light: 'bg-pink-50' },
  green: { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-200', light: 'bg-green-50' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', light: 'bg-amber-50' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-200', light: 'bg-rose-50' },
  blue: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', light: 'bg-blue-50' },
  violet: { bg: 'bg-violet-500', text: 'text-violet-600', border: 'border-violet-200', light: 'bg-violet-50' },
  indigo: { bg: 'bg-indigo-500', text: 'text-indigo-600', border: 'border-indigo-200', light: 'bg-indigo-50' },
  slate: { bg: 'bg-slate-500', text: 'text-slate-600', border: 'border-slate-200', light: 'bg-slate-50' },
  fuchsia: { bg: 'bg-fuchsia-500', text: 'text-fuchsia-600', border: 'border-fuchsia-200', light: 'bg-fuchsia-50' },
  sky: { bg: 'bg-sky-500', text: 'text-sky-600', border: 'border-sky-200', light: 'bg-sky-50' },
  red: { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-200', light: 'bg-red-50' },
  purple: { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200', light: 'bg-purple-50' },
}

const getChileTodayStr = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

interface ComputeLiveDayStatsParams {
  ventasDocs: any[]
  sesionesDocs: any[]
  importedClosings?: CuadreERP[]
  branches: Array<{ slug: string; name: string; [key: string]: any }>
  activeCosts: Map<string, number>
  activeNames: Map<string, string>
  activeImages: Map<string, string>
}

interface ComputeLiveDayStatsResult {
  sucData: SucursalData[]
  tot: { ventas: number; gastos: number; ganancia: number }
  globalCajeras: CajeraRanking[]
  perSedeCajeras: Record<string, CajeraRanking[]>
  globalTurnoStats: TurnoStats
  perSedeTurnoStats: Record<string, TurnoStats>
  topGlobal: TopProduct[]
  topBySede: Record<string, TopProduct[]>
}

function computeLiveDayStats({
  ventasDocs,
  sesionesDocs,
  importedClosings = [],
  branches,
  activeCosts,
  activeNames,
  activeImages,
}: ComputeLiveDayStatsParams): ComputeLiveDayStatsResult {
  const ventasPorSede: Record<string, number> = {}
  const costosPorSede: Record<string, number> = {}
  const gastosPorSede: Record<string, number> = {}
  branches.forEach(b => {
    ventasPorSede[b.slug] = 0
    costosPorSede[b.slug] = 0
    gastosPorSede[b.slug] = 0
  })

  // 1. Gastos desde caja_sesiones
  sesionesDocs.forEach((d) => {
    const sd = typeof d.data === 'function' ? d.data() : d
    let matchedSlug = branches.find(b => b.slug === sd.sede)?.slug
    if (!matchedSlug) {
      if (branches.length === 1) matchedSlug = branches[0].slug
      else matchedSlug = branches.find(b => b.slug.includes('central') || (sd.sede && b.slug.includes(sd.sede)))?.slug || branches[0]?.slug
    }
    const sede = matchedSlug || 'donbalato-central'

    const gastosSesion = Array.isArray(sd.gastosItems)
      ? sd.gastosItems
      : (() => { try { return JSON.parse(sd.gastosItemsJson || '[]') } catch { return [] } })()
    const gTotalSesion = gastosSesion.length > 0
      ? obtenerGastosQueAfectanGanancia({ gastos: gastosSesion })
      : Number(sd.totalGastos) || 0
    gastosPorSede[sede] = (gastosPorSede[sede] || 0) + gTotalSesion
  })
  let totalGastosGlobal = Object.values(gastosPorSede).reduce((sum, amount) => sum + amount, 0)

  // 2. Ventas desde ventas_pos
  const globalMap = new Map<string, TopProduct>()
  const perSede: Record<string, Map<string, TopProduct>> = {}
  branches.forEach(b => { perSede[b.slug] = new Map<string, TopProduct>() })

  const cajerasGlobalMap = new Map<string, { ventas: number; boletas: number; articulos: number }>()
  const cajerasPerSede: Record<string, Map<string, { ventas: number; boletas: number; articulos: number }>> = {}
  branches.forEach(b => { cajerasPerSede[b.slug] = new Map() })

  let totalVentasGlobal = 0
  let totalCostosGlobal = 0
  let totalBoletasGlobal = 0
  let totalArticulosGlobal = 0
  let totalImportedProfitAdjustment = 0
  const importedProfitAdjustmentBySede: Record<string, number> = {}
  const boletasPorSede: Record<string, number> = {}
  const articulosPorSede: Record<string, number> = {}
  branches.forEach(b => {
    boletasPorSede[b.slug] = 0
    articulosPorSede[b.slug] = 0
  })

  ventasDocs.forEach((d) => {
    const vd = typeof d.data === 'function' ? d.data() : d
    if (vd.estado !== 'completada') return

    let matchedSlug = branches.find(b => b.slug === vd.sede)?.slug
    if (!matchedSlug) {
      if (branches.length === 1) matchedSlug = branches[0].slug
      else matchedSlug = branches.find(b => b.slug.includes('central') || (vd.sede && b.slug.includes(vd.sede)))?.slug || branches[0]?.slug
    }
    const sede = matchedSlug || 'donbalato-central'

    const totalVenta = Number(vd.total) || 0
    ventasPorSede[sede] = (ventasPorSede[sede] || 0) + totalVenta
    totalVentasGlobal += totalVenta

    const cName = String(vd.cajeroNombre || vd.cajeraNombre || vd.cajero || vd.cajera || vd.userName || 'Cajera').trim()
    const smCaj = cajerasPerSede[sede] || (cajerasPerSede[sede] = new Map())
    const sm = perSede[sede] || (perSede[sede] = new Map<string, TopProduct>())

    let items: any[] = []
    try {
      if (Array.isArray(vd.items)) items = vd.items
      else if (typeof vd.itemsJson === 'string') items = JSON.parse(vd.itemsJson)
    } catch {}

    let itemsVentaCount = 0
    items.forEach((it: any) => {
      const sku = String(it.sku || '').trim().toUpperCase()
      const id = String(it.id || '').trim().toUpperCase()
      const barcode = String(it.barcode || it.codigo_barra || '').trim().toUpperCase()
      const nombre = it.nombre || it.name || activeNames.get(sku) || activeNames.get(id) || activeNames.get(barcode) || sku || 'Producto'
      const key = sku || id || nombre
      if (!key) return

      const qty = Number(it.cantidad ?? it.qty) || 0
      itemsVentaCount += qty
      const subt = Number(it.subtotal ?? (qty * (Number(it.precioUnitario ?? it.price) || 0))) || 0

      let costUnit = Number(it.costoUnitario ?? it.cost) || 0
      if (!costUnit) {
        if (sku && activeCosts.has(sku)) costUnit = activeCosts.get(sku) || 0
        else if (id && activeCosts.has(id)) costUnit = activeCosts.get(id) || 0
        else if (barcode && activeCosts.has(barcode)) costUnit = activeCosts.get(barcode) || 0
      }
      const cost = costUnit * qty
      costosPorSede[sede] = (costosPorSede[sede] || 0) + cost
      totalCostosGlobal += cost

      const img = activeImages.get(sku) || activeImages.get(id) || activeImages.get(barcode) || activeImages.get(String(nombre).toUpperCase()) || (it.imageUrl || it.image || undefined)
      const g = globalMap.get(key) || { sku: sku || id, nombre, cantidad: 0, ventas: 0, costoNeto: 0, imageUrl: img }
      if (!g.imageUrl && img) g.imageUrl = img
      g.cantidad += qty
      g.ventas += subt
      g.costoNeto += cost
      globalMap.set(key, g)

      const s = sm.get(key) || { sku: sku || id, nombre, cantidad: 0, ventas: 0, costoNeto: 0, imageUrl: img }
      if (!s.imageUrl && img) s.imageUrl = img
      s.cantidad += qty
      s.ventas += subt
      s.costoNeto += cost
      sm.set(key, s)
    })

    totalArticulosGlobal += itemsVentaCount
    articulosPorSede[sede] = (articulosPorSede[sede] || 0) + itemsVentaCount

    const gCaj = cajerasGlobalMap.get(cName) || { ventas: 0, boletas: 0, articulos: 0 }
    gCaj.ventas += totalVenta
    gCaj.boletas += 1
    gCaj.articulos += itemsVentaCount
    cajerasGlobalMap.set(cName, gCaj)

    const sCaj = smCaj.get(cName) || { ventas: 0, boletas: 0, articulos: 0 }
    sCaj.ventas += totalVenta
    sCaj.boletas += 1
    sCaj.articulos += itemsVentaCount
    smCaj.set(cName, sCaj)

    totalBoletasGlobal += 1
    boletasPorSede[sede] = (boletasPorSede[sede] || 0) + 1
  })

  // Los cierres importados vienen de la caja anterior a ventas_pos. Se suman
  // como una fuente separada; los cierres originados por el POS ya están en
  // ventas_pos y no deben duplicarse.
  importedClosings.forEach((c) => {
    if (c.origenCuadreImportado !== true || c.origenPOS === true) return

    const matchedSlug = branches.find(b => matchBranchSlug(b.slug, c.sede))?.slug
    const sede = matchedSlug || branches[0]?.slug || 'donbalato-central'
    const ventas = Number(c.calculos?.totalBruto)
      || Number(c.montos?.efectivoSistema || 0) + Number(c.montos?.debitoSistema || 0) + Number(c.montos?.transferencias || 0)
    if (ventas <= 0) return

    const gastos = obtenerGastosQueAfectanGanancia(c)
    const analysisProfit = c.analisisProductosRetailbase?.gananciaBruta
    const storedProfit = c.calculos?.gananciaBruta ?? c.gananciaBruta
    const storedCosts = Number(c.calculos?.costoProductos ?? c.costoProductos) || 0
    const gananciaProductos = analysisProfit != null && Number.isFinite(Number(analysisProfit))
      ? Number(analysisProfit)
      : storedProfit != null && Number(storedProfit) !== 0
        ? Number(storedProfit)
        : c.costosProductosDisponibles !== false && storedCosts > 0
          ? ventas - storedCosts
          : 0

    ventasPorSede[sede] = (ventasPorSede[sede] || 0) + ventas
    totalVentasGlobal += ventas
    gastosPorSede[sede] = (gastosPorSede[sede] || 0) + gastos
    totalGastosGlobal += gastos

    // El cálculo en vivo resta ventas, costos y gastos. Como el cierre
    // importado no trae todos los costos por producto, ajustamos el resultado
    // por la ganancia conciliada guardada en ese mismo cierre.
    const profitAdjustment = gananciaProductos - ventas
    importedProfitAdjustmentBySede[sede] = (importedProfitAdjustmentBySede[sede] || 0) + profitAdjustment
    totalImportedProfitAdjustment += profitAdjustment

    const units = Number(c.analisisProductosRetailbase?.unidades) || 0
    totalArticulosGlobal += units
    articulosPorSede[sede] = (articulosPorSede[sede] || 0) + units

    Object.entries(c.montosPorCajera || {}).forEach(([nameRaw, value]) => {
      const nombre = nameRaw.trim()
      if (!nombre) return
      const amount = Number(value.totalBruto)
        || Number(value.efectivoReal || 0) + Number(value.transferencia || 0) + Number(value.debito || 0)
      const count = Number(value.ventasCount) || 0

      const global = cajerasGlobalMap.get(nombre) || { ventas: 0, boletas: 0, articulos: 0 }
      global.ventas += amount
      global.boletas += count
      cajerasGlobalMap.set(nombre, global)

      const byBranch = cajerasPerSede[sede] || (cajerasPerSede[sede] = new Map())
      const branch = byBranch.get(nombre) || { ventas: 0, boletas: 0, articulos: 0 }
      branch.ventas += amount
      branch.boletas += count
      byBranch.set(nombre, branch)

      totalBoletasGlobal += count
      boletasPorSede[sede] = (boletasPorSede[sede] || 0) + count
    })
  })

  const sucData: SucursalData[] = branches.map((b) => {
    const ventas = ventasPorSede[b.slug] || 0
    const costos = costosPorSede[b.slug] || 0
    const gastos = gastosPorSede[b.slug] || 0
    const ganancia = ventas - costos - gastos + (importedProfitAdjustmentBySede[b.slug] || 0)
    return {
      icon: (b as any).icon || '🏪',
      color: (b as any).color || 'blue',
      ...b,
      ventas,
      gastos,
      ganancia,
      cuadreEnviado: false,
    }
  })

  const calcRanking = (map: Map<string, { ventas: number; boletas: number; articulos: number }>, totalVentas: number): CajeraRanking[] => {
    return Array.from(map.entries()).map(([nombre, d]) => ({
      nombre,
      ventas: d.ventas,
      boletas: d.boletas,
      articulos: d.articulos,
      ticketPromedio: d.boletas > 0 ? Math.round(d.ventas / d.boletas) : 0,
      porcentaje: totalVentas > 0 ? Math.round((d.ventas / totalVentas) * 1000) / 10 : 0
    })).sort((a, b) => b.ventas - a.ventas)
  }

  const globalCajeras = calcRanking(cajerasGlobalMap, totalVentasGlobal)
  const perSedeCajeras: Record<string, CajeraRanking[]> = {}
  branches.forEach(b => {
    const sedeSales = (sucData.find(s => s.slug === b.slug)?.ventas) || 0
    perSedeCajeras[b.slug] = calcRanking(cajerasPerSede[b.slug] || new Map(), sedeSales)
  })

  const globalTurnoStats: TurnoStats = {
    totalBoletas: totalBoletasGlobal,
    ticketPromedio: totalBoletasGlobal > 0 ? Math.round(totalVentasGlobal / totalBoletasGlobal) : 0,
    totalArticulos: totalArticulosGlobal
  }
  const perSedeTurnoStats: Record<string, TurnoStats> = {}
  branches.forEach(b => {
    const bCount = boletasPorSede[b.slug] || 0
    const bSales = (sucData.find(s => s.slug === b.slug)?.ventas) || 0
    perSedeTurnoStats[b.slug] = {
      totalBoletas: bCount,
      ticketPromedio: bCount > 0 ? Math.round(bSales / bCount) : 0,
      totalArticulos: articulosPorSede[b.slug] || 0
    }
  })

  const topGlobal = Array.from(globalMap.values()).sort((a, b) => b.cantidad - a.cantidad)
  const topBySede: Record<string, TopProduct[]> = {}
  Object.keys(perSede).forEach((s) => {
    topBySede[s] = Array.from(perSede[s].values()).sort((a, b) => b.cantidad - a.cantidad)
  })

  const gananciaGlobal = totalVentasGlobal - totalCostosGlobal - totalGastosGlobal + totalImportedProfitAdjustment
  const tot = {
    ventas: totalVentasGlobal,
    gastos: totalGastosGlobal,
    ganancia: gananciaGlobal,
  }

  return {
    sucData,
    tot,
    globalCajeras,
    perSedeCajeras,
    globalTurnoStats,
    perSedeTurnoStats,
    topGlobal,
    topBySede,
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isLoggedIn, logout } = useAuth()
  const liveDataVisible = useLiveDataVisibility()

  // ─── Configuración dinámica desde Appwrite ───────────────────────
  const [runtimeAppConfig, setRuntimeAppConfig] = useState(getDefaultRuntimeConfig())
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const config = await loadRuntimeConfig()
      if (!cancelled) {
        setRuntimeAppConfig(config)
        setDemoProfile(prev => ({ ...prev, companyName: config.companyName }))
      }
    })()
    return () => { cancelled = true }
  }, [])
  const runtimeBranding = runtimeAppConfig.branding
  const runtimeOwnerProfile = runtimeAppConfig.ownerProfile
  const SIDEBAR_EXECUTIVE_AVATAR = runtimeOwnerProfile.photoURL || runtimeBranding.defaultUserAvatarUrl
  const COMPANY_LOGO_URL = runtimeBranding.companyLogoUrl || runtimeBranding.companyIconUrl

  const [demoProfile, setDemoProfile] = useState<DemoProfile>({ companyName: getDefaultRuntimeConfig().companyName, userName: 'Usuario Demo' })
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingCompany, setOnboardingCompany] = useState('')
  const [onboardingUser, setOnboardingUser] = useState('')
  const [loading, setLoading] = useState(true)
  const [dateMode, setDateMode] = useState<'hoy' | 'ayer'>('hoy')
  const [dashboardMode, setDashboardMode] = useState<'tienda' | 'web'>('tienda')
  const [webOrdersToday, setWebOrdersToday] = useState<WebDashboardOrder[]>([])
  const [webOrdersLoading, setWebOrdersLoading] = useState(false)
  const [webOrdersRefreshKey, setWebOrdersRefreshKey] = useState(0)
  const [selectedSedeFilter, setSelectedSedeFilter] = useState<string>(() => {
    try { return localStorage.getItem('activeBranch') || 'todas' } catch { return 'todas' }
  })
  const [sucursalesData, setSucursalesData] = useState<SucursalData[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topProductsBySede, setTopProductsBySede] = useState<Record<string, TopProduct[]>>({})
  const [teamTopProductsRange, setTeamTopProductsRange] = useState<'dia' | 'semana' | '7' | '15' | '30'>('dia')
  const [teamTopProductsHistorical, setTeamTopProductsHistorical] = useState<TopProduct[]>([])
  const [teamTopProductsHistoricalBySede, setTeamTopProductsHistoricalBySede] = useState<Record<string, TopProduct[]>>({})
  const [teamTopProductsLoading, setTeamTopProductsLoading] = useState(false)
  const teamTopProductsCacheRef = useRef<{
    today: string
    fetchedAt: number
    byDate: Record<string, { global: TopProduct[]; bySede: Record<string, TopProduct[]> }>
  } | null>(null)
  const [totals, setTotals] = useState({ ventas: 0, gastos: 0, ganancia: 0 })
  const [cajerasRanking, setCajerasRanking] = useState<CajeraRanking[]>([])
  const [cajerasRankingBySede, setCajerasRankingBySede] = useState<Record<string, CajeraRanking[]>>({})
  const [turnoStats, setTurnoStats] = useState<TurnoStats>({ totalBoletas: 0, ticketPromedio: 0, totalArticulos: 0 })
  const [turnoStatsBySede, setTurnoStatsBySede] = useState<Record<string, TurnoStats>>({})
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [monthlyData, setMonthlyData] = useState<DayData[]>([])
  const [monthlyBySede, setMonthlyBySede] = useState<Record<string, { ventas: number; gastos: number; ganancia: number }>>({})
  const [fixedMonthlyBySede, setFixedMonthlyBySede] = useState<Record<string, { sueldos: number; externos: number; total: number }>>({})
  const [dailyBySede, setDailyBySede] = useState<Record<string, DayData[]>>({})
  const [loadingMonthly, setLoadingMonthly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customDateEnd, setCustomDateEnd] = useState('')
  // Hora actual en vivo para la barra de transcurso del día (se refresca cada 10s localmente sin peticiones)
  const [currentChileTime, setCurrentChileTime] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentChileTime(new Date()), 10000)
    return () => clearInterval(timer)
  }, [])
  const todayStr = useMemo(() => getChileTodayStr(), [currentChileTime])
  const latestVentasDocsRef = useRef<any[]>([])
  const latestSesionesDocsRef = useRef<any[]>([])
  const latestImportedClosingsRef = useRef<CuadreERP[]>([])
  const [liveSyncStatus, setLiveSyncStatus] = useState<'paused' | 'syncing' | 'cache' | 'synced' | 'error'>('paused')
  // Estado de cierre de caja por sede (solo hoy) — para mostrar chips de sucursales con cuadres pendientes
  const [cuadreStatusBySede, setCuadreStatusBySede] = useState<Record<string, { sedeName: string; cajeros: { nombre: string; listo: boolean }[] }>>({})

  // Sincronizar selectedSedeFilter con la sede activa del header global
  useEffect(() => {
    const handler = (e: any) => {
      const slug = String(e?.detail || '')
      if (slug) setSelectedSedeFilter(slug)
    }
    window.addEventListener('activeBranchChanged', handler as EventListener)
    // Por si cambia en otra pestaña
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'activeBranch' && e.newValue) setSelectedSedeFilter(e.newValue)
    }
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener('activeBranchChanged', handler as EventListener)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])

  // Valores derivados por sede activa (si hay filtro → muestra solo esa sede)
  const displaySucursalesData = useMemo(() => {
    if (selectedSedeFilter === 'todas') return sucursalesData
    return sucursalesData.filter(s => s.slug === selectedSedeFilter)
  }, [sucursalesData, selectedSedeFilter])

  const displayTotals = useMemo(() => {
    if (selectedSedeFilter === 'todas') return totals
    const suc = sucursalesData.find(s => s.slug === selectedSedeFilter)
    return suc ? { ventas: suc.ventas, gastos: suc.gastos, ganancia: suc.ganancia } : { ventas: 0, gastos: 0, ganancia: 0 }
  }, [totals, sucursalesData, selectedSedeFilter])

  const displayTopProducts = useMemo(() => {
    if (selectedSedeFilter === 'todas') return topProducts
    return (topProductsBySede[selectedSedeFilter] || []).slice(0, 5)
  }, [topProducts, topProductsBySede, selectedSedeFilter])

  const displayTeamTopProducts = useMemo(() => {
    if (teamTopProductsRange === 'dia') return displayTopProducts
    return selectedSedeFilter === 'todas'
      ? teamTopProductsHistorical
      : teamTopProductsHistoricalBySede[selectedSedeFilter] || []
  }, [teamTopProductsRange, displayTopProducts, selectedSedeFilter, teamTopProductsHistorical, teamTopProductsHistoricalBySede])

  const displayTrabajadores = useMemo(() => {
    if (selectedSedeFilter === 'todas') return trabajadores
    return trabajadores.filter(t => t.sucursal === selectedSedeFilter)
  }, [trabajadores, selectedSedeFilter])

  const displayCajeras = useMemo(() => {
    if (selectedSedeFilter === 'todas') return cajerasRanking
    return cajerasRankingBySede[selectedSedeFilter] || []
  }, [cajerasRanking, cajerasRankingBySede, selectedSedeFilter])

  const displayTurnoStats = useMemo(() => {
    if (selectedSedeFilter === 'todas') return turnoStats
    return turnoStatsBySede[selectedSedeFilter] || { totalBoletas: 0, ticketPromedio: 0, totalArticulos: 0 }
  }, [turnoStats, turnoStatsBySede, selectedSedeFilter])

  const displayMonthlyData = useMemo(() => {
    if (selectedSedeFilter === 'todas') return monthlyData
    return dailyBySede[selectedSedeFilter] || []
  }, [monthlyData, dailyBySede, selectedSedeFilter])

  // Progreso de tiempo transcurrido de la tienda (09:00 - 18:00 L-V / 15:00 S-D)
  const dayProgress = useMemo(() => {
    if (dateMode === 'ayer') {
      return {
        pct: 100,
        pctDisplay: 100,
        statusLabel: 'Jornada anterior finalizada',
        subLabel: 'Cierre completado',
        barStyle: { background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)' },
        badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        dotColor: 'bg-emerald-500',
        closeHourText: '06:00 pm',
        openHourText: '09:00 am',
      }
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
      weekday: 'short',
    })
    const parts = formatter.formatToParts(currentChileTime)
    const getVal = (type: string) => parts.find(p => p.type === type)?.value || '0'
    const hour = parseInt(getVal('hour'), 10)
    const minute = parseInt(getVal('minute'), 10)
    const second = parseInt(getVal('second'), 10)
    const currentMin = hour * 60 + minute + second / 60

    const weekdayStr = getVal('weekday')
    const isWeekend = weekdayStr === 'Sat' || weekdayStr === 'Sun'

    const openMin = 9 * 60 // 09:00 AM (540 min)
    const closeHour = isWeekend ? 15 : 18 // 15:00 fines de semana (3pm), 18:00 lunes a viernes (6pm)
    const closeMin = closeHour * 60
    const totalDayMin = closeMin - openMin

    let pct = 0
    let statusLabel = ''
    let subLabel = ''
    let dotColor = 'bg-rose-500'
    let badgeBg = 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'

    if (currentMin < openMin) {
      pct = 0
      const diffMin = Math.round(openMin - currentMin)
      const h = Math.floor(diffMin / 60)
      const m = diffMin % 60
      statusLabel = 'Por abrir · Abre 09:00 am'
      subLabel = h > 0 ? `Faltan ${h}h ${m}m para abrir (Hora chilena)` : `Faltan ${m} min para abrir (Hora chilena)`
      dotColor = 'bg-amber-500'
      badgeBg = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    } else if (currentMin >= closeMin) {
      pct = 100
      statusLabel = `Cerrado · 0 min para cerrar`
      subLabel = `Cerró a las ${closeHour === 15 ? '03:00 pm' : '06:00 pm'} (Hora chilena)`
      dotColor = 'bg-emerald-500'
      badgeBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    } else {
      const elapsed = currentMin - openMin
      pct = Math.min(100, Math.max(0, (elapsed / totalDayMin) * 100))
      const remainingMin = Math.round(closeMin - currentMin)
      const remH = Math.floor(remainingMin / 60)
      const remM = remainingMin % 60

      statusLabel = remH > 0 ? `Faltan ${remH}h ${remM}m para cerrar` : `Faltan ${remM} min para cerrar`
      subLabel = `Cierra a las ${closeHour === 15 ? '03:00 pm' : '06:00 pm'} (Hora chilena)`

      if (pct >= 75) {
        dotColor = 'bg-emerald-500'
        badgeBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      } else if (pct >= 45) {
        dotColor = 'bg-amber-500'
        badgeBg = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      } else {
        dotColor = 'bg-rose-500'
        badgeBg = 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
      }
    }

    // Gradiente dinámico: inicia en rojo y transiciona a naranja, amarillo y verde a medida que se completa
    let bgGradient = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
    if (pct >= 85) {
      bgGradient = 'linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #10b981 100%)'
    } else if (pct >= 60) {
      bgGradient = 'linear-gradient(90deg, #ef4444 0%, #f97316 35%, #eab308 70%, #84cc16 100%)'
    } else if (pct >= 35) {
      bgGradient = 'linear-gradient(90deg, #ef4444 0%, #f97316 45%, #eab308 100%)'
    } else if (pct >= 15) {
      bgGradient = 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'
    }

    return {
      pct: Math.round(pct * 10) / 10,
      pctDisplay: Math.round(pct),
      statusLabel,
      subLabel,
      barStyle: { background: bgGradient },
      badgeBg,
      dotColor,
      closeHourText: `${closeHour === 15 ? '03:00 pm' : '06:00 pm'} (Hora chilena)`,
      openHourText: '09:00 am',
    }
  }, [currentChileTime, dateMode])

  // Onboarding de primer ingreso para demo
  useEffect(() => {
    if (user) return
    if (!IS_DEMO_PROJECT) return
    try {
      const raw = localStorage.getItem(DEMO_PROFILE_CACHE_KEY)
      if (!raw) {
        setOnboardingOpen(true)
        return
      }
      const parsed = JSON.parse(raw) as Partial<DemoProfile>
      const companyName = String(parsed?.companyName || '').trim()
      const userName = String(parsed?.userName || '').trim()
      if (!companyName || !userName) {
        setOnboardingOpen(true)
        return
      }
      setDemoProfile({ companyName, userName })
    } catch {
      setOnboardingOpen(true)
    }
  }, [user])

  useEffect(() => {
    if (user?.email) {
      setDemoProfile({
        companyName: runtimeAppConfig.companyName,
        userName: user.name || user.email.split('@')[0],
      })
      setOnboardingOpen(false)
      return
    }

    if (!isLoggedIn && !authLoading) {
      setDemoProfile({ companyName: runtimeAppConfig.companyName, userName: 'Invitado' })
      setOnboardingOpen(false)
    }
  }, [user, isLoggedIn, authLoading])

  useEffect(() => {
    if (!onboardingOpen) return
    document.body.classList.add('overflow-hidden')
    return () => document.body.classList.remove('overflow-hidden')
  }, [onboardingOpen])

  const submitOnboarding = (e: React.FormEvent) => {
    e.preventDefault()
    const companyName = onboardingCompany.trim()
    const userName = onboardingUser.trim()
    if (!companyName || !userName) return
    const profile: DemoProfile = { companyName, userName }
    setDemoProfile(profile)
    try {
      localStorage.setItem(DEMO_PROFILE_CACHE_KEY, JSON.stringify(profile))
    } catch {
      // ignore cache errors
    }
    setOnboardingOpen(false)
  }

  // Costos, precios e imágenes de productos desde BD
  const [costsBD, setCostsBD] = useState<Map<string, number>>(new Map())
  const [pricesBD, setPricesBD] = useState<Map<string, number>>(new Map())
  const [productNamesBD, setProductNamesBD] = useState<Map<string, string>>(new Map())
  const [productImagesBD, setProductImagesBD] = useState<Map<string, string>>(new Map())
  const [minus10Flags, setMinus10Flags] = useState<Set<string>>(new Set())

  // [APPWRITE] Costos, precios, imágenes y nombres de productos desde la colección `products`
  useEffect(() => {
    let cancelled = false
    async function loadCosts() {
      try {
        const products = await fetchAllFirebaseErpProducts()
        const costMap = new Map<string, number>()
        const priceMap = new Map<string, number>()
        const nameMap = new Map<string, string>()
        const imageMap = new Map<string, string>()
        for (const p of products) {
          const sku = String(p.sku || '').trim().toUpperCase()
          const rawId = String(p.$id || '').trim().toUpperCase()
          const barcode = String(p.codigo_barra || '').trim().toUpperCase()
          const costVal = Math.round(Number(p.costo_uni) || 0)
          const nameVal = String(p.nombre || p.sku || '')
          const imgVal = p.imageUrl || (p as any).IMAGEURL || (p as any).image || ''
          // Precio de referencia = mínimo entre detalle (precio_venta_1) y mayorista (precio_venta_2)
          const candidates = [Number(p.precio_venta_1) || 0, Number(p.precio_venta_2) || 0].filter(n => isFinite(n) && n > 0)
          const pvMin = candidates.length ? Math.min(...candidates) : 0

          if (sku) {
            costMap.set(sku, costVal)
            nameMap.set(sku, nameVal)
            if (pvMin > 0) priceMap.set(sku, Math.round(pvMin))
            if (imgVal) imageMap.set(sku, imgVal)
          }
          if (rawId && rawId !== sku) {
            costMap.set(rawId, costVal)
            if (!nameMap.has(rawId)) nameMap.set(rawId, nameVal)
            if (pvMin > 0 && !priceMap.has(rawId)) priceMap.set(rawId, Math.round(pvMin))
            if (imgVal && !imageMap.has(rawId)) imageMap.set(rawId, imgVal)
          }
          if (barcode && barcode !== sku && barcode !== rawId) {
            costMap.set(barcode, costVal)
            if (!nameMap.has(barcode)) nameMap.set(barcode, nameVal)
            if (pvMin > 0 && !priceMap.has(barcode)) priceMap.set(barcode, Math.round(pvMin))
            if (imgVal && !imageMap.has(barcode)) imageMap.set(barcode, imgVal)
          }
          if (nameVal && imgVal && !imageMap.has(nameVal.toUpperCase())) {
            imageMap.set(nameVal.toUpperCase(), imgVal)
          }
        }
        if (!cancelled) {
          setCostsBD(costMap)
          setPricesBD(priceMap)
          setProductNamesBD(nameMap)
          setProductImagesBD(imageMap)
          setMinus10Flags(new Set()) // sin ajuste_menos10 en Yaxsel
          loadData(false, costMap, nameMap, imageMap)
        }
      } catch (e) {
        console.error('[Dashboard] loadCosts error:', e)
      }
    }
    loadCosts()
    return () => { cancelled = true }
  }, [])

  // Bloquear scroll del body cuando sidebar está abierta
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Guardar en cache
  const saveToCache = (cachePayload: any) => {
    const cacheData = {
      data: { ...cachePayload, importedClosings: latestImportedClosingsRef.current },
      timestamp: Date.now(),
      dateMode,
      branchSlugs: getSucursales(runtimeAppConfig).map(s => s.slug)
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
  }

  // Cargar desde cache
  const loadFromCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (!cached) return null
      const { data, timestamp, dateMode: cachedMode, branchSlugs: cachedSlugs } = JSON.parse(cached)
      // Invalidate cache if branch slugs changed
      const currentSlugs = getSucursales(runtimeAppConfig).map(s => s.slug).sort().join(',')
      const savedSlugs = Array.isArray(cachedSlugs) ? cachedSlugs.sort().join(',') : ''
      if (savedSlugs !== currentSlugs) return null
      // Para el día en curso ('hoy') la suscripción en vivo onSnapshot actualiza en memoria y renueva la caché automáticamente
      const expiry = CACHE_EXPIRY
      if (cachedMode === dateMode && Date.now() - timestamp < expiry) {
        return data
      }
    } catch (e) {
      console.error('Error loading cache:', e)
    }
    return null
  }

  const loadData = async (
    forceRefresh = false,
    costMapParam?: Map<string, number>,
    nameMapParam?: Map<string, string>,
    imageMapParam?: Map<string, string>
  ) => {
    try {
      // La caché global incluye métricas separadas por sucursal, así que también
      // sirve para pintar la selección actual mientras llega su snapshot en vivo.
      if (!forceRefresh) {
        const cached = loadFromCache()
        if (cached) {
          latestImportedClosingsRef.current = Array.isArray(cached.importedClosings) ? cached.importedClosings : []
          if (cached.cajerasRanking) setCajerasRanking(cached.cajerasRanking)
          if (cached.cajerasRankingBySede) setCajerasRankingBySede(cached.cajerasRankingBySede)
          if (cached.turnoStats) setTurnoStats(cached.turnoStats)
          if (cached.turnoStatsBySede) setTurnoStatsBySede(cached.turnoStatsBySede)
          if (cached.sucursalesData) setSucursalesData(cached.sucursalesData)
          if (cached.totals) setTotals(cached.totals)
          if (cached.topProducts?.length) {
            setTopProducts(cached.topProducts)
            setTopProductsBySede(cached.topProductsBySede || {})
          }
          if (cached.lastUpdate) setLastUpdate(new Date(cached.lastUpdate))
          if (dateMode === 'hoy' && dashboardMode === 'tienda') setLiveSyncStatus('cache')
          setLoading(false)
          return
        }
      }

      setLoading(true)
      const activeCosts = costMapParam || costsBD
      const activeNames = nameMapParam || productNamesBD
      const activeImages = imageMapParam || productImagesBD

      const cuadres = await fetchCuadresERP(1)
      const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
      const yDate = new Date()
      yDate.setDate(yDate.getDate() - 1)
      const yStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(yDate)
      const targetDate = dateMode === 'ayer' ? yStr : todayStr

      const dayList = cuadres.filter((c: CuadreERP) => c.fecha === targetDate)
      latestImportedClosingsRef.current = dateMode === 'hoy'
        ? dayList.filter((c: CuadreERP) => c.origenCuadreImportado === true && c.origenPOS !== true)
        : []
      const bruto = (c: CuadreERP) =>
        (Number(c.montos?.efectivoSistema) || 0) +
        (Number(c.montos?.debitoSistema) || 0) +
        (Number(c.montos?.transferencias) || 0)

      const branches = getSucursales(runtimeAppConfig)
      const branchValues = selectedSedeFilter === 'todas' ? [] : branchSlugQueryValues(selectedSedeFilter)
      const globalMap = new Map<string, TopProduct>()
      const perSede: Record<string, Map<string, TopProduct>> = {}
      branches.forEach(b => { perSede[b.slug] = new Map<string, TopProduct>() })

      const cajerasGlobalMap = new Map<string, { ventas: number; boletas: number; articulos: number }>()
      const cajerasPerSede: Record<string, Map<string, { ventas: number; boletas: number; articulos: number }>> = {}
      branches.forEach(b => { cajerasPerSede[b.slug] = new Map() })
      let totalBoletasGlobal = 0
      let totalArticulosGlobal = 0
      const boletasPorSede: Record<string, number> = {}
      const articulosPorSede: Record<string, number> = {}
      branches.forEach(b => {
        boletasPorSede[b.slug] = 0
        articulosPorSede[b.slug] = 0
      })

      let sucData: SucursalData[] = []
      let totalVentasGlobal = 0
      let totalGastosGlobal = 0
      let totalCostosGlobal = 0

      // Para hoy, seguir leyendo ventas_pos aunque ya exista un cierre: puede haber
      // cajeros que reabran caja y continúen vendiendo después de su primer corte.
      // Para ayer usamos el cuadre consolidado como fuente final del día.
      const useCuadreCerrado = dateMode === 'ayer' && dayList.length > 0
      let serverConfirmedSessions = useCuadreCerrado
      let serverConfirmedSales = useCuadreCerrado

      if (useCuadreCerrado) {
        sucData = branches.map((b) => {
          const c = dayList.find((x: CuadreERP) => x.sede === b.slug)
          const ventas = c ? bruto(c) : 0
          const gastos = c ? obtenerGastosQueAfectanGanancia(c) : 0
          let costosSede = 0

          if (c && c.montosPorCajera && typeof c.montosPorCajera === 'object') {
            const smCaj = cajerasPerSede[b.slug] || (cajerasPerSede[b.slug] = new Map())
            Object.entries(c.montosPorCajera).forEach(([cNameRaw, cVal]: [string, any]) => {
              const cName = cNameRaw.trim()
              if (!cName) return
              const vMonto = Number(cVal.totalBruto || (Number(cVal.efectivoReal || 0) + Number(cVal.transferencia || 0) + Number(cVal.debito || 0))) || 0
              const vCount = Number(cVal.ventasCount) || 0

              const g = cajerasGlobalMap.get(cName) || { ventas: 0, boletas: 0, articulos: 0 }
              g.ventas += vMonto
              g.boletas += vCount
              cajerasGlobalMap.set(cName, g)

              const s = smCaj.get(cName) || { ventas: 0, boletas: 0, articulos: 0 }
              s.ventas += vMonto
              s.boletas += vCount
              smCaj.set(cName, s)

              totalBoletasGlobal += vCount
              boletasPorSede[b.slug] = (boletasPorSede[b.slug] || 0) + vCount
            })
          }

          if (c && Array.isArray(c.topProducts)) {
            const sm = perSede[b.slug] || (perSede[b.slug] = new Map<string, TopProduct>())
            c.topProducts.forEach((p) => {
              const q = Number(p.cantidadVendida) || 0
              totalArticulosGlobal += q
              articulosPorSede[b.slug] = (articulosPorSede[b.slug] || 0) + q

              const key = String(p.sku || p.nombre || '')
              if (!key) return
              const skuUpper = String(p.sku || '').trim().toUpperCase()
              const nameUpper = String(p.nombre || '').trim().toUpperCase()
              const img = activeImages.get(skuUpper) || activeImages.get(nameUpper) || undefined
              const g = globalMap.get(key) || { sku: p.sku, nombre: p.nombre, cantidad: 0, ventas: 0, costoNeto: 0, imageUrl: img }
              if (!g.imageUrl && img) g.imageUrl = img
              g.cantidad += q
              g.ventas += Number(p.ventasBrutas) || 0
              g.costoNeto += Number(p.costoNeto) || 0
              globalMap.set(key, g)

              const s = sm.get(key) || { sku: p.sku, nombre: p.nombre, cantidad: 0, ventas: 0, costoNeto: 0, imageUrl: img }
              if (!s.imageUrl && img) s.imageUrl = img
              s.cantidad += q
              s.ventas += Number(p.ventasBrutas) || 0
              s.costoNeto += Number(p.costoNeto) || 0
              sm.set(key, s)

              costosSede += Number(p.costoNeto) || 0
            })
          }

          totalVentasGlobal += ventas
          totalGastosGlobal += gastos
          totalCostosGlobal += costosSede
          const ganancia = ventas - costosSede - gastos

          return { ...b, ventas, gastos, ganancia, cuadreEnviado: !!c }
        })

        if (cajerasGlobalMap.size === 0) {
          try {
            const vRefFallback = collection(db, 'ventas_pos')
            const qFallback = branchValues.length > 0
              ? query(vRefFallback, where('sede', 'in', branchValues), where('fechaStr', '==', targetDate), limit(1000))
              : query(vRefFallback, where('fechaStr', '==', targetDate), limit(1000))
            const fSnap = await getDocs(qFallback)
            fSnap.forEach((d) => {
              const vd = d.data()
              if (vd.estado === 'anulada') return
              const cName = String(vd.cajeroNombre || vd.cajeraNombre || vd.cajero || vd.cajera || vd.userName || 'Cajera').trim()
              const totalVenta = Number(vd.total) || 0
              let matchedSlug = branches.find(b => matchBranchSlug(b.slug, vd.sede))?.slug || branches[0]?.slug || 'donbalato-central'
              const smCaj = cajerasPerSede[matchedSlug] || (cajerasPerSede[matchedSlug] = new Map())

              let items: any[] = []
              try {
                if (Array.isArray(vd.items)) items = vd.items
                else if (typeof vd.itemsJson === 'string') items = JSON.parse(vd.itemsJson)
              } catch {}
              const itemsCount = items.reduce((acc, it) => acc + (Number(it.cantidad ?? it.qty) || 0), 0)

              const g = cajerasGlobalMap.get(cName) || { ventas: 0, boletas: 0, articulos: 0 }
              g.ventas += totalVenta
              g.boletas += 1
              g.articulos += itemsCount
              cajerasGlobalMap.set(cName, g)

              const s = smCaj.get(cName) || { ventas: 0, boletas: 0, articulos: 0 }
              s.ventas += totalVenta
              s.boletas += 1
              s.articulos += itemsCount
              smCaj.set(cName, s)

              totalBoletasGlobal += 1
              boletasPorSede[matchedSlug] = (boletasPorSede[matchedSlug] || 0) + 1
              if (totalArticulosGlobal === 0) {
                totalArticulosGlobal += itemsCount
                articulosPorSede[matchedSlug] = (articulosPorSede[matchedSlug] || 0) + itemsCount
              }
            })
          } catch (e) {
            console.warn('[Dashboard] Fallback ventas_pos for cajeras error:', e)
          }
        }
      } else {
        // CASO B: Turno en curso / Sin cuadre cerrado (en vivo)
        let dayStats: ComputeLiveDayStatsResult

        if (dateMode === 'hoy' && !forceRefresh) {
          // Re-calcular desde la suscripción onSnapshot activa (evita doble lectura con getDocs al montar o en días con 0 ventas)
          dayStats = computeLiveDayStats({
            ventasDocs: latestVentasDocsRef.current,
            sesionesDocs: latestSesionesDocsRef.current,
            importedClosings: latestImportedClosingsRef.current,
            branches,
            activeCosts,
            activeNames,
            activeImages,
          })
        } else {
          // Leer caja_sesiones y ventas_pos (primera carga o refresco forzado)
          let sesionesDocs: any[] = []
          try {
            const qSes = query(
              collection(db, 'caja_sesiones'),
              where('fechaStr', '==', targetDate),
              limit(50)
            )
            const sSnap = await getDocsFromServer(qSes)
            sesionesDocs = sSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            serverConfirmedSessions = true
            if (dateMode === 'hoy') latestSesionesDocsRef.current = sesionesDocs
          } catch (err) {
            console.warn('[Dashboard] Error leyendo caja_sesiones:', err)
          }

          let ventasDocs: any[] = []
          try {
            const vRef = collection(db, 'ventas_pos')
            const qVentas = branchValues.length > 0
              ? query(vRef, where('sede', 'in', branchValues), where('fechaStr', '==', targetDate), limit(1000))
              : query(vRef, where('fechaStr', '==', targetDate), limit(1000))
            const vSnap = await getDocsFromServer(qVentas)
            ventasDocs = vSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            serverConfirmedSales = true
            if (dateMode === 'hoy') latestVentasDocsRef.current = ventasDocs
          } catch (vErr) {
            console.warn('[Dashboard] Error leyendo ventas_pos:', vErr)
          }

          dayStats = computeLiveDayStats({
            ventasDocs,
            sesionesDocs,
            importedClosings: latestImportedClosingsRef.current,
            branches,
            activeCosts,
            activeNames,
            activeImages,
          })
        }

        setCajerasRanking(dayStats.globalCajeras)
        setCajerasRankingBySede(dayStats.perSedeCajeras)
        setTurnoStats(dayStats.globalTurnoStats)
        setTurnoStatsBySede(dayStats.perSedeTurnoStats)
        setSucursalesData(dayStats.sucData)
        setTotals(dayStats.tot)
        if (dayStats.topGlobal.length > 0) {
          setTopProducts(dayStats.topGlobal)
          setTopProductsBySede(dayStats.topBySede)
        }
        setLastUpdate(new Date())
        if (serverConfirmedSales && serverConfirmedSessions && selectedSedeFilter === 'todas') {
          saveToCache({
            cajerasRanking: dayStats.globalCajeras,
            cajerasRankingBySede: dayStats.perSedeCajeras,
            turnoStats: dayStats.globalTurnoStats,
            turnoStatsBySede: dayStats.perSedeTurnoStats,
            sucursalesData: dayStats.sucData,
            totals: dayStats.tot,
            topProducts: dayStats.topGlobal,
            topProductsBySede: dayStats.topBySede,
            lastUpdate: Date.now(),
          })
        }
        setLoading(false)
        if (selectedSedeFilter === 'todas' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erpDashboardRefreshed', {
            detail: { totalVentas: dayStats.tot.ventas, fecha: targetDate }
          }))
        }
        return
      }

      // Calcular rankings y estadísticas de cajeras
      const calcRanking = (map: Map<string, { ventas: number; boletas: number; articulos: number }>, totalVentas: number): CajeraRanking[] => {
        return Array.from(map.entries()).map(([nombre, d]) => ({
          nombre,
          ventas: d.ventas,
          boletas: d.boletas,
          articulos: d.articulos,
          ticketPromedio: d.boletas > 0 ? Math.round(d.ventas / d.boletas) : 0,
          porcentaje: totalVentas > 0 ? Math.round((d.ventas / totalVentas) * 1000) / 10 : 0
        })).sort((a, b) => b.ventas - a.ventas)
      }

      const globalCajeras = calcRanking(cajerasGlobalMap, totalVentasGlobal)
      const perSedeCajeras: Record<string, CajeraRanking[]> = {}
      branches.forEach(b => {
        const sedeSales = (sucData.find(s => s.slug === b.slug)?.ventas) || 0
        perSedeCajeras[b.slug] = calcRanking(cajerasPerSede[b.slug] || new Map(), sedeSales)
      })

      const globalTurnoStats: TurnoStats = {
        totalBoletas: totalBoletasGlobal,
        ticketPromedio: totalBoletasGlobal > 0 ? Math.round(totalVentasGlobal / totalBoletasGlobal) : 0,
        totalArticulos: totalArticulosGlobal
      }
      const perSedeTurnoStats: Record<string, TurnoStats> = {}
      branches.forEach(b => {
        const bCount = boletasPorSede[b.slug] || 0
        const bSales = (sucData.find(s => s.slug === b.slug)?.ventas) || 0
        perSedeTurnoStats[b.slug] = {
          totalBoletas: bCount,
          ticketPromedio: bCount > 0 ? Math.round(bSales / bCount) : 0,
          totalArticulos: articulosPorSede[b.slug] || 0
        }
      })

      setCajerasRanking(globalCajeras)
      setCajerasRankingBySede(perSedeCajeras)
      setTurnoStats(globalTurnoStats)
      setTurnoStatsBySede(perSedeTurnoStats)

      const topGlobal = Array.from(globalMap.values()).sort((a, b) => b.cantidad - a.cantidad)
      const topBySede: Record<string, TopProduct[]> = {}
      Object.keys(perSede).forEach((s) => {
        topBySede[s] = Array.from(perSede[s].values()).sort((a, b) => b.cantidad - a.cantidad)
      })

      const gananciaGlobal = totalVentasGlobal - totalCostosGlobal - totalGastosGlobal
      const tot = {
        ventas: totalVentasGlobal,
        gastos: totalGastosGlobal,
        ganancia: gananciaGlobal,
      }

      setSucursalesData(sucData)
      setTotals(tot)
      if (topGlobal.length > 0) {
        setTopProducts(topGlobal)
        setTopProductsBySede(topBySede)
      }
      setLastUpdate(new Date())
      if (serverConfirmedSales && serverConfirmedSessions && selectedSedeFilter === 'todas') {
        saveToCache({
          cajerasRanking: globalCajeras,
          cajerasRankingBySede: perSedeCajeras,
          turnoStats: globalTurnoStats,
          turnoStatsBySede: perSedeTurnoStats,
          sucursalesData: sucData,
          totals: tot,
          topProducts: topGlobal,
          topProductsBySede: topBySede,
          lastUpdate: Date.now(),
        })
      }
      setLoading(false)
      if (selectedSedeFilter === 'todas' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erpDashboardRefreshed', {
          detail: { totalVentas: totalVentasGlobal, fecha: targetDate }
        }))
      }
    } catch (e) {
      console.error('[Dashboard] loadData error:', e)
      setLoading(false)
    }
  }

  const liveContextRef = useRef({ runtimeAppConfig, costsBD, productNamesBD, productImagesBD })
  useEffect(() => {
    liveContextRef.current = { runtimeAppConfig, costsBD, productNamesBD, productImagesBD }
  }, [runtimeAppConfig, costsBD, productNamesBD, productImagesBD])

  // ─── TIEMPO REAL: onSnapshot para la jornada de hoy (0 polling, 1 lectura por venta nueva) ───
  useEffect(() => {
    if (onboardingOpen || dateMode !== 'hoy' || dashboardMode !== 'tienda' || !liveDataVisible) {
      setLiveSyncStatus('paused')
      return
    }
    if (!db) return

    let active = true
    let salesConfirmedByServer = false
    let sessionsConfirmedByServer = false
    let liveListenerFailed = false
    latestVentasDocsRef.current = []
    latestSesionesDocsRef.current = []
    setLiveSyncStatus('syncing')

    const updateLiveSyncStatus = () => {
      if (liveListenerFailed) {
        setLiveSyncStatus('error')
        return
      }
      const confirmed = salesConfirmedByServer && sessionsConfirmedByServer
      setLiveSyncStatus(confirmed ? 'synced' : 'cache')
    }

    const recomputeLive = () => {
      if (!active) return
      const {
        runtimeAppConfig: cfg,
        costsBD: activeCosts,
        productNamesBD: activeNames,
        productImagesBD: activeImages,
      } = liveContextRef.current
      const branches = getSucursales(cfg)

      const result = computeLiveDayStats({
        ventasDocs: latestVentasDocsRef.current,
        sesionesDocs: latestSesionesDocsRef.current,
        importedClosings: latestImportedClosingsRef.current,
        branches,
        activeCosts,
        activeNames,
        activeImages,
      })

      setCajerasRanking(result.globalCajeras)
      setCajerasRankingBySede(result.perSedeCajeras)
      setTurnoStats(result.globalTurnoStats)
      setTurnoStatsBySede(result.perSedeTurnoStats)
      setSucursalesData(result.sucData)
      setTotals(result.tot)
      setTopProducts(result.topGlobal)
      setTopProductsBySede(result.topBySede)
      setLoading(false)
      if (salesConfirmedByServer && sessionsConfirmedByServer) {
        setLastUpdate(new Date())
        if (selectedSedeFilter === 'todas') {
          saveToCache({
            cajerasRanking: result.globalCajeras,
            cajerasRankingBySede: result.perSedeCajeras,
            turnoStats: result.globalTurnoStats,
            turnoStatsBySede: result.perSedeTurnoStats,
            sucursalesData: result.sucData,
            totals: result.tot,
            topProducts: result.topGlobal,
            topProductsBySede: result.topBySede,
            lastUpdate: Date.now(),
          })
        }
      }
      if (selectedSedeFilter === 'todas' && salesConfirmedByServer && sessionsConfirmedByServer && typeof window !== 'undefined') {
        const totalEfectivo = latestVentasDocsRef.current.reduce((sum: number, sale: any) => {
          if (sale.estado !== 'completada') return sum
          const payments = Array.isArray(sale.pagos) ? sale.pagos : []
          if (payments.length > 0) {
            return sum + payments.reduce((paymentSum: number, payment: any) => {
              const method = String(payment.metodo || payment.forma || '').toLowerCase()
              const amount = Number(payment.monto) || 0
              return (!method.includes('debito') && !method.includes('tarjeta') && !method.includes('redelcom') && !method.includes('transferencia'))
                ? paymentSum + amount
                : paymentSum
            }, 0)
          }
          const method = String(sale.metodoPago || sale.formaPago || sale.metodo || 'efectivo').toLowerCase()
          return (!method.includes('debito') && !method.includes('tarjeta') && !method.includes('redelcom') && !method.includes('transferencia'))
            ? sum + (Number(sale.total) || 0)
            : sum
        }, 0)
        window.dispatchEvent(new CustomEvent('erpDashboardRefreshed', {
          detail: { totalVentas: result.tot.ventas, totalEfectivo, fecha: todayStr }
        }))
      }
    }

    const branchValues = selectedSedeFilter === 'todas' ? [] : branchSlugQueryValues(selectedSedeFilter)
    const qVentas = branchValues.length > 0
      ? query(
          collection(db, 'ventas_pos'),
          where('sede', 'in', branchValues),
          where('fechaStr', '==', todayStr),
          limit(1000)
        )
      : query(
          collection(db, 'ventas_pos'),
          where('fechaStr', '==', todayStr),
          limit(1000)
        )

    const unsubVentas = onSnapshot(qVentas, { includeMetadataChanges: true }, (snapshot) => {
      salesConfirmedByServer = !snapshot.metadata.fromCache
      latestVentasDocsRef.current = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateLiveSyncStatus()
      recomputeLive()
    }, (err) => {
      console.warn('[Dashboard] Error en onSnapshot de ventas_pos:', err)
      if (active) {
        liveListenerFailed = true
        setLiveSyncStatus('error')
      }
    })

    // Las sesiones son un conjunto pequeño (máximo 50) y se leen igual que
    // antes; evitamos exigir un índice nuevo para filtrar esa parte del resumen.
    const qSes = query(
      collection(db, 'caja_sesiones'),
      where('fechaStr', '==', todayStr),
      limit(50)
    )

    const unsubSesiones = onSnapshot(qSes, { includeMetadataChanges: true }, (snapshot) => {
      sessionsConfirmedByServer = !snapshot.metadata.fromCache
      latestSesionesDocsRef.current = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateLiveSyncStatus()
      recomputeLive()
    }, (err) => {
      console.warn('[Dashboard] Error en onSnapshot de caja_sesiones:', err)
      if (active) {
        liveListenerFailed = true
        setLiveSyncStatus('error')
      }
    })

    return () => {
      active = false
      unsubVentas()
      unsubSesiones()
    }
  }, [dateMode, dashboardMode, onboardingOpen, todayStr, liveDataVisible, selectedSedeFilter])

  // Recalcular en memoria (0 lecturas a Firestore) cuando se hidratan costos/nombres de productos
  useEffect(() => {
    if (onboardingOpen || dateMode !== 'hoy' || dashboardMode !== 'tienda') return
    if (latestVentasDocsRef.current.length === 0 && latestSesionesDocsRef.current.length === 0) return
    const branches = getSucursales(runtimeAppConfig)
    const result = computeLiveDayStats({
      ventasDocs: latestVentasDocsRef.current,
      sesionesDocs: latestSesionesDocsRef.current,
      importedClosings: latestImportedClosingsRef.current,
      branches,
      activeCosts: costsBD,
      activeNames: productNamesBD,
      activeImages: productImagesBD,
    })
    setCajerasRanking(result.globalCajeras)
    setCajerasRankingBySede(result.perSedeCajeras)
    setTurnoStats(result.globalTurnoStats)
    setTurnoStatsBySede(result.perSedeTurnoStats)
    setSucursalesData(result.sucData)
    setTotals(result.tot)
    if (result.topGlobal.length > 0) {
      setTopProducts(result.topGlobal)
      setTopProductsBySede(result.topBySede)
    }
  }, [runtimeAppConfig, costsBD, productNamesBD, productImagesBD, dateMode, dashboardMode, onboardingOpen])

  const loadTrabajadores = async () => {
    // ── [APPWRITE] Equipo desde la colección trabajadores_erp ──
    {
      try {
        const items = await fetchTrabajadoresERP()
        const list: Trabajador[] = items
          .filter((t: TrabajadorERP) => t.activo)
          .map((t: TrabajadorERP) => ({
            id: t.$id,
            nombre: t.nombre,
            cargo: t.cargo,
            sucursal: t.sede,
            foto: t.fotoUrl || undefined,
          }))
        setTrabajadores(list)
        return
      } catch (e) {
        console.error('[Dashboard][Appwrite] loadTrabajadores error:', e)
        setTrabajadores([])
        return
      }
    }
  }

  // Carga el estado de cierre de caja de HOY por cada sede: lista los cajeros pendientes/listos
  const loadCuadreStatusToday = async (force = false) => {
    // ── Estado de cuadre por sede y por cajero ──
    try {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const refDate = new Date(Date.now() - 3 * 60 * 60 * 1000)
      if (dateMode === 'ayer') refDate.setDate(refDate.getDate() - 1)
      const targetDate = refDate.toISOString().slice(0, 10)

      // 🔒 Throttling: evitar re-consultar cortes_caja si se consultó hace menos de 10 min para la misma fecha
      const now = Date.now()
      if (!force && lastCuadreStatusCheck.targetDate === targetDate && (now - lastCuadreStatusCheck.ts < 10 * 60 * 1000)) {
        return
      }

      const [cuadres, trabajadores] = await Promise.all([fetchCuadresERP(1), fetchTrabajadoresERP()])

      // Leer cortes_caja para verificar cajeros individuales (acotado a la fecha objetivo)
      let cortesList: any[] = []
      try {
        const qCortes = query(
          collection(db, 'cortes_caja'),
          where('fechaStr', '==', targetDate),
          limit(30)
        )
        const cortesSnap = await getDocs(qCortes)
        cortesSnap.forEach(d => cortesList.push(d.data()))
      } catch (err) {
        console.warn('[Dashboard] Error leyendo cortes_caja con fechaStr, fallback acotado:', err)
        try {
          const qFallback = query(collection(db, 'cortes_caja'), limit(30))
          const fSnap = await getDocs(qFallback)
          fSnap.forEach(d => cortesList.push(d.data()))
        } catch {}
      }

      const result: Record<string, { sedeName: string; cajeros: { nombre: string; listo: boolean }[] }> = {}
      getSucursales(runtimeAppConfig).forEach((suc) => {
        const c = cuadres.find((x: any) => x.sede === suc.slug && x.fecha === targetDate)
        const cajerosListosFromCuadre: string[] = Array.isArray(c?.cajerosListos)
          ? c.cajerosListos
          : (c?.cajeroNombre ? String(c.cajeroNombre).split(',').map(s => s.trim()) : [])

        const cajeros = trabajadores
          .filter((t: TrabajadorERP) => t.activo && t.sede === suc.slug && /cajer/i.test(t.cargo))
          .map((t: TrabajadorERP) => {
            const nombreClean = t.nombre.trim().toLowerCase()
            // 1. ¿Está en cajerosListos del cuadre_erp?
            const inCuadre = cajerosListosFromCuadre.some(cn => {
              const clean = cn.trim().toLowerCase()
              return clean.includes(nombreClean) || nombreClean.includes(clean)
            })
            // 2. ¿Tiene corte individual en cortes_caja para esta sede y fecha?
            const inCortes = cortesList.some(co => {
              if (co.sede !== suc.slug) return false
              const cNombre = String(co.cajeroNombre || '').trim().toLowerCase()
              const matchesName = cNombre.includes(nombreClean) || nombreClean.includes(cNombre)
              if (!matchesName) return false
              const fStr = String(co.fechaStr || co.fecha || co.fechaCierreStr || '')
              return fStr.includes(targetDate) || fStr.includes(targetDate.split('-').reverse().join('-')) || fStr.includes(targetDate.split('-').reverse().join('/'))
            })
            // 3. Fallback: si hay cuadre enviado pero no cajerosListos registrados
            const fallbackCuadre = !!(c && c.estado === 'enviado' && cajerosListosFromCuadre.length === 0)

            const listo = inCuadre || inCortes || fallbackCuadre
            return { nombre: t.nombre, listo }
          })

        if (cajeros.length > 0) {
          result[suc.slug] = { sedeName: suc.name, cajeros }
        }
      })
      lastCuadreStatusCheck.ts = Date.now()
      lastCuadreStatusCheck.targetDate = targetDate
      setCuadreStatusBySede(result)
      return
    } catch (e) {
      console.error('[Dashboard] loadCuadreStatusToday error:', e)
      // No resetear a {} para que el chip no desaparezca por errores transitorios
      return
    }
  }

  const loadMonthlyData = async () => {
    // ── [APPWRITE] Binding real: agregado mensual desde cuadres_erp ──
    {
      try {
        setLoadingMonthly(true)
        const cuadres = await fetchCuadresERP(2)
        const nowCL = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const ym = nowCL.toISOString().slice(0, 7) // 'YYYY-MM'
        const monthList = cuadres.filter((c: CuadreERP) => (c.fecha || '').slice(0, 7) === ym)
        const bruto = (c: CuadreERP) =>
          (Number(c.montos?.efectivoSistema) || 0) + (Number(c.montos?.debitoSistema) || 0) + (Number(c.montos?.transferencias) || 0)
        const dayMap = new Map<string, DayData>()
        const perSedeAcc: Record<string, { ventas: number; gastos: number; ganancia: number }> = {}
        const perSedeDaily: Record<string, DayData[]> = {}
        monthList.forEach((c: CuadreERP) => {
          const ventas = bruto(c)
          const gastosGanancia = obtenerGastosQueAfectanGanancia(c)
          let costos = Number(c.calculos?.costoProductos || c.costoProductos) || 0
          if (costos <= 0 && Array.isArray(c.topProducts) && c.topProducts.length > 0) {
            costos = c.topProducts.reduce((s, p) => s + (Number(p.costoNeto) || 0), 0)
          }
          if (costos <= 0 && ventas > 0) {
            costos = Math.round(ventas * 0.65) // 35% de margen base retail
          }
          const ganancia = Math.max(0, ventas - costos - gastosGanancia)
          const parts = (c.fecha || '').split('-')
          const label = `${parts[2] || ''}/${parts[1] || ''}`
          const dd = dayMap.get(c.fecha) || { fecha: label, fechaFull: c.fecha, ventas: 0, gastos: 0, ganancia: 0 }
          dd.ventas += ventas; dd.gastos += gastosGanancia; dd.ganancia += ganancia
          dayMap.set(c.fecha, dd)
          const acc = perSedeAcc[c.sede] || { ventas: 0, gastos: 0, ganancia: 0 }
          acc.ventas += ventas; acc.gastos += gastosGanancia; acc.ganancia += ganancia
          perSedeAcc[c.sede] = acc
          ;(perSedeDaily[c.sede] = perSedeDaily[c.sede] || []).push({ fecha: label, fechaFull: c.fecha, ventas, gastos: gastosGanancia, ganancia })
        })
        const days = Array.from(dayMap.values()).sort((a, b) => a.fechaFull.localeCompare(b.fechaFull))
        Object.keys(perSedeDaily).forEach((s) => perSedeDaily[s].sort((a, b) => a.fechaFull.localeCompare(b.fechaFull)))
        setMonthlyData(days)
        setDailyBySede(perSedeDaily)
        setMonthlyBySede(perSedeAcc)
        // Gastos fijos (sueldos) por sede desde trabajadores_erp
        const trabajadoresFijos = await fetchTrabajadoresERP()
        const fixedBySede: Record<string, { sueldos: number; externos: number; total: number }> = {}
        trabajadoresFijos.filter((t: TrabajadorERP) => t.activo).forEach((t: TrabajadorERP) => {
          const acc = fixedBySede[t.sede] || { sueldos: 0, externos: 0, total: 0 }
          acc.sueldos += Number(t.sueldo) || 0
          acc.total = acc.sueldos + acc.externos
          fixedBySede[t.sede] = acc
        })
        setFixedMonthlyBySede(fixedBySede)
        setLoadingMonthly(false)
        return
      } catch (e) {
        console.error('[Dashboard][Appwrite] loadMonthlyData error:', e)
        setLoadingMonthly(false)
        return
      }
    }
  }

  useEffect(() => {
    if (onboardingOpen) return
    loadData()
    loadTrabajadores()
    loadCuadreStatusToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, onboardingOpen, runtimeAppConfig])

  useEffect(() => {
    if (dashboardMode !== 'web' || onboardingOpen) return
    let cancelled = false

    const loadWebOrders = async () => {
      setWebOrdersLoading(true)
      try {
        const dateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
        })
        const todayKey = dateFormatter.format(new Date())
        const selectedDate = new Date(`${todayKey}T12:00:00Z`)
        if (dateMode === 'ayer') selectedDate.setUTCDate(selectedDate.getUTCDate() - 1)

        const offsetAtNoon = (date: Date) => {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
          }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
            if (part.type !== 'literal') acc[part.type] = part.value
            return acc
          }, {})
          const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
          return localAsUtc - date.getTime()
        }
        const year = selectedDate.getUTCFullYear()
        const month = selectedDate.getUTCMonth()
        const day = selectedDate.getUTCDate()
        const dayStart = Date.UTC(year, month, day) - offsetAtNoon(new Date(Date.UTC(year, month, day, 12)))
        const nextDay = new Date(Date.UTC(year, month, day + 1, 12))
        const dayEnd = Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate()) - offsetAtNoon(nextDay)

        const fetchOrdersForCollection = async (collectionName: WebDashboardOrder['collection']) => {
          const orders: WebDashboardOrder[] = []
          let cursor: any = null
          let hasMore = true
          while (hasMore && !cancelled) {
            const constraints = [
              where('CREATEDAT', '>=', dayStart),
              where('CREATEDAT', '<', dayEnd),
              orderBy('CREATEDAT', 'desc'),
            ]
            const ordersQuery = cursor
              ? query(collection(db, collectionName), ...constraints, startAfter(cursor), limit(1000))
              : query(collection(db, collectionName), ...constraints, limit(1000))
            const snapshot = await getDocs(ordersQuery)
            if (cancelled) return orders
            snapshot.forEach((orderDoc) => {
              const order = orderDoc.data()
              const paymentMethod = String(order.PAYMENTMETHOD || '').toLowerCase()
              orders.push({
                id: orderDoc.id,
                collection: collectionName,
                parentOrderId: String(order.PARENTORDERID || ''),
                customerName: String(order.CUSTOMERNAME || order.CUSTOMER || 'Cliente sin nombre'),
                orderCode: String(order.ORDERCODE || order.REQCODE || orderDoc.id),
                total: Number(order.TOTAL) || 0,
                status: String(order.STATUS || 'pending').toLowerCase(),
                paymentMethod: String(order.PAYMENTMETHOD || 'No especificado'),
                createdAt: Number(order.CREATEDAT) || 0,
                takenByAi: paymentMethod.includes('yaxbot') || String(order.USERID || '') === 'balatin-whatsapp-guest' || String(order.ORDER_SOURCE || '').toLowerCase() === 'whatsapp',
              })
            })
            hasMore = snapshot.size === 1000
            cursor = snapshot.docs[snapshot.docs.length - 1] || null
          }
          return orders
        }

        const [retailOrders, wholesaleOrders, vendorOrders] = await Promise.all([
          fetchOrdersForCollection('orders'),
          fetchOrdersForCollection('wholesale_orders'),
          fetchOrdersForCollection('vendor_orders'),
        ])
        if (cancelled) return
        // Un carrito puede generar un pedido principal y sub-pedidos por vendor.
        // Agruparlos por pedido raíz suma sus montos sin inflar el número de checkouts.
        const grouped = new Map<string, WebDashboardOrder>()
        const allOrders = [...retailOrders, ...wholesaleOrders, ...vendorOrders]
        const statusRank: Record<string, number> = { pending: 0, pending_stock: 1, paid: 2, processing: 3, payment_review: 4, payment_confirmed: 5, preparing: 6, shipped: 7, delivered: 8 }
        allOrders.forEach(order => {
          const rootId = order.parentOrderId || order.id
          const existing = grouped.get(rootId)
          if (!existing) {
            grouped.set(rootId, { ...order, id: rootId, total: order.total, parentOrderId: undefined, componentStatuses: [order.status] })
            return
          }
          existing.componentStatuses = [...(existing.componentStatuses || [existing.status]), order.status]
          existing.total += order.total
          existing.createdAt = Math.min(existing.createdAt, order.createdAt)
          existing.takenByAi ||= order.takenByAi
          if (order.collection === 'orders' || order.collection === 'wholesale_orders') {
            existing.customerName = order.customerName
            existing.orderCode = order.orderCode
            existing.collection = order.collection
          }
          const activePartStatuses = existing.componentStatuses.filter(status => !['cancelled', 'canceled', 'anulado', 'anulada'].includes(status))
          existing.status = activePartStatuses.length
            ? activePartStatuses.reduce((best, status) => (statusRank[status] ?? 0) > (statusRank[best] ?? 0) ? status : best)
            : 'cancelled'
          if (order.paymentMethod && !existing.paymentMethod.toLowerCase().includes(order.paymentMethod.toLowerCase())) {
            existing.paymentMethod = `${existing.paymentMethod} / ${order.paymentMethod}`
          }
        })
        setWebOrdersToday([...grouped.values()].map(order => { const { componentStatuses: _parts, ...checkoutOrder } = order; return checkoutOrder }).sort((a, b) => b.createdAt - a.createdAt))
      } catch (error) {
        console.error('[ERP Dashboard] Error cargando pedidos web:', error)
        if (!cancelled) setWebOrdersToday([])
      } finally {
        if (!cancelled) setWebOrdersLoading(false)
      }
    }

    void loadWebOrders()
    return () => { cancelled = true }
  }, [dashboardMode, dateMode, onboardingOpen, webOrdersRefreshKey])

  // El ranking de la sección Equipo puede consultar un periodo independiente
  // al resumen Hoy/Ayer. Solo lee ventas históricas cuando se elige un rango.
  useEffect(() => {
    if (teamTopProductsRange === 'dia' || onboardingOpen) {
      setTeamTopProductsLoading(false)
      return
    }

    let cancelled = false
    const loadHistoricalTopProducts = async () => {
      setTeamTopProductsLoading(true)
      try {
        const chileDate = (date: Date) => new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(date)
        const now = new Date()
        const today = chileDate(now)
        const endDateObj = new Date(`${today}T12:00:00Z`)
        const endDate = endDateObj.toISOString().slice(0, 10)
        const startDateObj = new Date(`${endDate}T12:00:00Z`)

        if (teamTopProductsRange === 'semana') {
          const daysSinceMonday = (startDateObj.getUTCDay() + 6) % 7
          startDateObj.setUTCDate(startDateObj.getUTCDate() - daysSinceMonday)
        } else {
          startDateObj.setUTCDate(startDateObj.getUTCDate() - (Number(teamTopProductsRange) - 1))
        }
        const startDate = startDateObj.toISOString().slice(0, 10)

        const branches = getSucursales(runtimeAppConfig)
        const cacheStartDateObj = new Date(`${endDate}T12:00:00Z`)
        cacheStartDateObj.setUTCDate(cacheStartDateObj.getUTCDate() - 29)
        const cacheStartDate = cacheStartDateObj.toISOString().slice(0, 10)
        let cache = teamTopProductsCacheRef.current

        // Al pedir cualquier rango histórico, se obtiene la ventana de 30 días
        // una vez y los demás filtros se calculan desde esta caché en memoria.
        if (!cache || cache.today !== today || Date.now() - cache.fetchedAt > 2 * 60 * 1000) {
          const dailyMaps = new Map<string, {
            global: Map<string, TopProduct>
            bySede: Map<string, Map<string, TopProduct>>
          }>()
          let cursor: any = null
          let hasMore = true

          while (hasMore && !cancelled) {
            const rangeConstraints = [
              where('fechaStr', '>=', cacheStartDate),
              where('fechaStr', '<=', endDate),
              orderBy('fechaStr'),
            ]
            const salesQuery = cursor
              ? query(collection(db, 'ventas_pos'), ...rangeConstraints, startAfter(cursor), limit(1000))
              : query(collection(db, 'ventas_pos'), ...rangeConstraints, limit(1000))
            const snapshot = await getDocs(salesQuery)
            if (cancelled) return

            snapshot.forEach((saleDoc) => {
              const sale = saleDoc.data()
              if (sale.estado !== 'completada') return
              const fecha = String(sale.fechaStr || '')
              if (!fecha) return

              let sede = branches.find((branch) => matchBranchSlug(branch.slug, sale.sede))?.slug
              if (!sede) {
                sede = branches.length === 1
                  ? branches[0].slug
                  : branches.find((branch) => branch.slug.includes('central') || (sale.sede && matchBranchSlug(branch.slug, sale.sede)))?.slug || branches[0]?.slug || 'donbalato-central'
              }
              let items: any[] = []
              try {
                if (Array.isArray(sale.items)) items = sale.items
                else if (typeof sale.itemsJson === 'string') items = JSON.parse(sale.itemsJson)
              } catch {}

              let daily = dailyMaps.get(fecha)
              if (!daily) {
                daily = { global: new Map<string, TopProduct>(), bySede: new Map() }
                dailyMaps.set(fecha, daily)
              }
              let branchMap = daily.bySede.get(sede)
              if (!branchMap) {
                branchMap = new Map<string, TopProduct>()
                daily.bySede.set(sede, branchMap)
              }
              items.forEach((item: any) => {
                const sku = String(item.sku || '').trim().toUpperCase()
                const id = String(item.id || '').trim().toUpperCase()
                const nombre = String(item.nombre || item.name || sku || id || 'Producto')
                const key = sku || id || nombre.toUpperCase()
                const cantidad = Number(item.cantidad ?? item.qty) || 0
                if (!key || cantidad <= 0) return
                const ventas = Number(item.subtotal ?? (cantidad * (Number(item.precioUnitario ?? item.price) || 0))) || 0

                const addToMap = (map: Map<string, TopProduct>) => {
                  const product = map.get(key) || { sku: sku || id, nombre, cantidad: 0, ventas: 0, costoNeto: 0 }
                  product.cantidad += cantidad
                  product.ventas += ventas
                  map.set(key, product)
                }
                addToMap(daily!.global)
                addToMap(branchMap!)
              })
            })

            hasMore = snapshot.size === 1000
            cursor = snapshot.docs[snapshot.docs.length - 1] || null
          }

          if (cancelled) return
          const sortProducts = (map: Map<string, TopProduct>) => Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad)
          const byDate: Record<string, { global: TopProduct[]; bySede: Record<string, TopProduct[]> }> = {}
          dailyMaps.forEach((daily, fecha) => {
            const bySede: Record<string, TopProduct[]> = {}
            daily.bySede.forEach((map, slug) => { bySede[slug] = sortProducts(map) })
            byDate[fecha] = { global: sortProducts(daily.global), bySede }
          })
          cache = { today, fetchedAt: Date.now(), byDate }
          teamTopProductsCacheRef.current = cache
        }

        if (cancelled || !cache) return
        const globalMap = new Map<string, TopProduct>()
        const byBranch = new Map<string, Map<string, TopProduct>>()
        Object.entries(cache.byDate).forEach(([fecha, daily]) => {
          if (fecha < startDate || fecha > endDate) return
          const mergeProducts = (target: Map<string, TopProduct>, products: TopProduct[]) => {
            products.forEach((product) => {
              const key = product.sku || product.nombre.toUpperCase()
              const current = target.get(key) || { ...product, cantidad: 0, ventas: 0 }
              current.cantidad += product.cantidad
              current.ventas += product.ventas
              target.set(key, current)
            })
          }
          mergeProducts(globalMap, daily.global)
          Object.entries(daily.bySede).forEach(([slug, products]) => {
            let branchMap = byBranch.get(slug)
            if (!branchMap) {
              branchMap = new Map<string, TopProduct>()
              byBranch.set(slug, branchMap)
            }
            mergeProducts(branchMap, products)
          })
        })

        const sortProducts = (map: Map<string, TopProduct>) => Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad)
        setTeamTopProductsHistorical(sortProducts(globalMap))
        const sortedByBranch: Record<string, TopProduct[]> = {}
        byBranch.forEach((map, slug) => { sortedByBranch[slug] = sortProducts(map) })
        setTeamTopProductsHistoricalBySede(sortedByBranch)
      } catch (error) {
        console.error('[Dashboard] Error cargando top productos del periodo:', error)
        if (!cancelled) {
          setTeamTopProductsHistorical([])
          setTeamTopProductsHistoricalBySede({})
        }
      } finally {
        if (!cancelled) setTeamTopProductsLoading(false)
      }
    }

    void loadHistoricalTopProducts()
    return () => { cancelled = true }
  }, [teamTopProductsRange, runtimeAppConfig, onboardingOpen])

  // Refrescar estado de cuadres cada 5 min (antes 60s) con guardián de visibilidad
  useEffect(() => {
    if (onboardingOpen) return
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadCuadreStatusToday()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const id = setInterval(() => { loadCuadreStatusToday() }, 5 * 60 * 1000)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [onboardingOpen])

  useEffect(() => {
    if (onboardingOpen) return
    loadMonthlyData()
  }, [onboardingOpen])

  const shortcuts = useMemo(() => [
    { to: '/admin', label: 'Cortes', icon: <ClipboardList size={18} />, color: 'indigo' },
    { to: '/planilla-unificada', label: 'Personal', icon: <Users size={18} />, color: 'blue' },
    { to: '/inventario', label: 'Inventario', icon: <Boxes size={18} />, color: 'violet' },
    { to: '/revision-costos', label: 'Costos', icon: <AlertTriangle size={18} />, color: 'rose' },
    { to: '/whatsapp-gestion', label: 'WhatsApp', icon: <MessageCircle size={18} />, color: 'green' },
    { to: '/telegram-gestion', label: 'Telegram', icon: <MessageCircle size={18} />, color: 'sky' },
    { to: '/informes-generales', label: 'Informes', icon: <FileText size={18} />, color: 'slate' },
    { to: '/top-products', label: 'Top 10', icon: <Trophy size={18} />, color: 'amber' },
    { to: '/erp-dashboard/base-datos', label: 'Base Datos', icon: <Database size={18} />, color: 'emerald' },
  ], [])

  const sidebarLinks = useMemo(() => [
    { to: '/', label: 'Inicio', icon: <Home size={18} />, color: 'blue', desc: 'Dashboard' },
    { to: '/cajeras', label: 'Realizar Corte', icon: <FileText size={18} />, color: 'fuchsia', desc: 'Cierre caja' },
    { to: '/_admin', label: 'Ver Cortes', icon: <ClipboardList size={18} />, color: 'indigo', desc: 'Cuadres enviados' },
    { to: '/admin', label: 'Corregir Corte', icon: <ClipboardList size={18} />, color: 'indigo', desc: 'Editar cuadres' },
    { to: '/admin-supreme', label: 'Admin Supreme', icon: <Shield size={18} />, color: 'purple', desc: 'Panel maestro' },
    { to: '/gastos', label: 'Gastos', icon: <DollarSign size={18} />, color: 'rose', desc: 'Por sucursal' },
    { to: '/gastos-externos', label: 'Gastos Externos', icon: <Receipt size={18} />, color: 'rose', desc: 'Fuera cuadre' },
    { to: '/adelantos-personal', label: 'Adelantos Personal', icon: <DollarSign size={18} />, color: 'amber', desc: 'Préstamos' },
    { to: '/sucursales', label: 'Sucursales', icon: <Building2 size={18} />, color: 'blue', desc: 'Resumen sedes' },
    { to: '/chat-ia', label: 'Chat IA', icon: <Brain size={18} />, color: 'blue', desc: 'Asistente ASIS' },
    { to: '/cerebro-ia', label: 'Cerebro IA', icon: <Brain size={18} />, color: 'violet', desc: 'IA avanzada' },
    { to: '/whatsapp-gestion', label: 'WhatsApp', icon: <MessageCircle size={18} />, color: 'green', desc: 'Contactos' },
    { to: '/whatsapp-config', label: 'WhatsApp Config', icon: <MessageCircle size={18} />, color: 'green', desc: 'Configuración' },
    { to: '/telegram-gestion', label: 'Telegram', icon: <MessageCircle size={18} />, color: 'sky', desc: 'Roles' },
    { to: '/planilla-unificada', label: 'Trabajadores', icon: <Users size={18} />, color: 'indigo', desc: 'Planilla' },
    { to: '/informe-general-trabajadores', label: 'Informe Trabajadores', icon: <Users size={18} />, color: 'indigo', desc: 'General' },
    { to: '/analisis-cajeras', label: 'Análisis Cajeras', icon: <Users size={18} />, color: 'pink', desc: 'Rendimiento' },
    { to: '/roles', label: 'Roles', icon: <Users size={18} />, color: 'purple', desc: 'Gestión usuarios' },
    { to: '/inventario', label: 'Inventario', icon: <Boxes size={18} />, color: 'violet', desc: 'Stock' },
    { to: '/revision-costos', label: 'Rev. Costos', icon: <AlertTriangle size={18} />, color: 'rose', desc: 'Bajo costo' },
    { to: '/revision-precios', label: 'Rev. Precios', icon: <DollarSign size={18} />, color: 'amber', desc: 'Precios bajos' },
    { to: '/correccion-precios', label: 'Corrección Precios', icon: <TrendingDown size={18} />, color: 'rose', desc: 'Costo vs venta' },
    { to: '/comparacion-costos', label: 'Comparación Costos', icon: <TrendingDown size={18} />, color: 'amber', desc: 'Comparar' },
    { to: '/comparacion-logica', label: 'Comparación Lógica', icon: <TrendingDown size={18} />, color: 'amber', desc: 'Lógica costos' },
    { to: '/productos-duplicados', label: 'Productos Duplicados', icon: <Copy size={18} />, color: 'red', desc: 'Duplicados' },
    { to: '/productos-estrella', label: 'Productos Estrella', icon: <Star size={18} />, color: 'amber', desc: 'Mejores' },
    { to: '/clientes-frecuentes', label: 'Clientes Frecuentes', icon: <Users size={18} />, color: 'blue', desc: 'Fidelización' },
    { to: '/informes-generales', label: 'Informes', icon: <FileText size={18} />, color: 'slate', desc: 'Reportes' },
    { to: '/informes', label: 'Informes Clásicos', icon: <FileText size={18} />, color: 'slate', desc: 'Antiguos' },
    { to: '/informes-productos', label: 'Informes Productos', icon: <FileText size={18} />, color: 'slate', desc: 'Por producto' },
    { to: '/informe-mensual', label: 'Informe Mensual', icon: <BarChart2 size={18} />, color: 'green', desc: 'Mes' },
    { to: '/informe-merma', label: 'Informe Merma', icon: <BarChart2 size={18} />, color: 'rose', desc: 'Pérdidas' },
    { to: '/top-products', label: 'Top 10', icon: <Trophy size={18} />, color: 'amber', desc: 'Más vendidos' },
    { to: '/top-producto-dia', label: 'Top del Día', icon: <Trophy size={18} />, color: 'amber', desc: 'Hoy' },
    { to: '/alertas', label: 'Alertas', icon: <Activity size={18} />, color: 'red', desc: 'Anomalías' },
    { to: '/erp-dashboard/base-datos', label: 'Base de Datos', icon: <Database size={18} />, color: 'sky', desc: 'Firebase' },
    { to: '/control-datos', label: 'Control Datos', icon: <Search size={18} />, color: 'indigo', desc: 'Búsqueda' },
    { to: '/depurador', label: 'Depurador', icon: <Bug size={18} />, color: 'rose', desc: 'Debug SKU' },
    { to: '/eliminador-masivo', label: 'Eliminador Masivo', icon: <Trash2 size={18} />, color: 'rose', desc: 'Borrar products' },
    { to: '/comprobador-datos-2', label: 'Comprobador', icon: <Search size={18} />, color: 'cyan', desc: 'Verificación' },
    { to: '/asis-monitor', label: 'ASIS Monitor', icon: <Activity size={18} />, color: 'emerald', desc: 'Estado IA' },
    { to: '/utilidad', label: 'Utilidad', icon: <Calculator size={18} />, color: 'emerald', desc: 'Cálculos' },
    { to: '/analisis-historico', label: 'Análisis', icon: <BarChart2 size={18} />, color: 'purple', desc: 'Histórico' },
    { to: '/ventas-tiempo-real', label: 'Tiempo Real', icon: <Activity size={18} />, color: 'red', desc: 'En vivo' },
    { to: '/control-pedidos', label: 'Pedidos', icon: <ShoppingCart size={18} />, color: 'amber', desc: 'Control' },
    { to: '/pagos-pedidos', label: 'Pagos & Pedidos', icon: <ShoppingCart size={18} />, color: 'blue', desc: 'Plataforma Web' },
    { to: '/separar-ventas', label: 'Separar Ventas', icon: <Split size={18} />, color: 'sky', desc: 'Por método' },
    { to: '/transferencias', label: 'Transferencias', icon: <Landmark size={18} />, color: 'cyan', desc: 'Webhook MP' },
    { to: '/conciliar-transferencias', label: 'Conciliar Transferencias', icon: <Link2 size={18} />, color: 'violet', desc: 'RetailBase' },
    { to: '/ganancias-excel', label: 'Ganancias Excel', icon: <TrendingUp size={18} />, color: 'green', desc: 'Export' },
    { to: '/pos', label: 'POS', icon: <ShoppingCart size={18} />, color: 'fuchsia', desc: 'Según permisos de la cuenta' },
  ], [])

  return (
    <>
    <div className="px-3 sm:px-4 lg:px-6 py-4 pb-24 space-y-5 w-full max-w-none">
      {/* Barra de filtros del Dashboard */}
      <div className="space-y-2 mb-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2">
          <div className="flex items-center justify-self-start">
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <button onClick={() => setDateMode('ayer')} className={`px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all ${dateMode === 'ayer' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Ayer</button>
              <button onClick={() => setDateMode('hoy')} className={`px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all ${dateMode === 'hoy' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Hoy</button>
            </div>
          </div>
          <div className="col-start-2 row-start-1 flex items-center justify-center gap-1 sm:gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-800">
              <button type="button" onClick={() => setDashboardMode('tienda')} aria-pressed={dashboardMode === 'tienda'} className={`rounded-lg border px-2.5 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-wide transition-all ${dashboardMode === 'tienda' ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25' : 'border-transparent text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40'}`}>Tienda</button>
              <button type="button" onClick={() => setDashboardMode('web')} aria-pressed={dashboardMode === 'web'} className={`rounded-lg border px-2.5 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-wide transition-all ${dashboardMode === 'web' ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/25' : 'border-transparent text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/40'}`}>Web</button>
            </div>
          </div>

          <div className="col-start-3 row-start-1 flex items-center justify-self-end gap-1 sm:gap-2">
            {dateMode === 'hoy' && dashboardMode === 'tienda' && liveSyncStatus !== 'paused' && (
              <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-black shadow-xs ${
                liveSyncStatus === 'synced'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : liveSyncStatus === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`} title={
                liveSyncStatus === 'synced'
                  ? 'Ventas y cajas confirmadas por Firestore en tiempo real.'
                  : liveSyncStatus === 'error'
                    ? 'No se pudo confirmar la conexión; lo visible podría venir de la caché.'
                    : 'Mostrando datos locales mientras Firestore confirma la conexión.'
              }>
                <span className={`h-2 w-2 rounded-full ${liveSyncStatus === 'synced' ? 'bg-emerald-500 animate-pulse' : liveSyncStatus === 'error' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                {liveSyncStatus === 'synced' ? 'En vivo' : liveSyncStatus === 'error' ? 'Sin confirmar' : 'Sincronizando'}
              </span>
            )}
            <button
              onClick={() => {
                if (dashboardMode === 'web') setWebOrdersRefreshKey(key => key + 1)
                else {
                  loadData(true)
                  loadCuadreStatusToday(true)
                }
              }}
              disabled={dashboardMode === 'web' ? webOrdersLoading : loading}
              className="flex items-center gap-1 px-2 py-1.5 sm:gap-1.5 sm:px-3 text-[10px] sm:text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all shadow-sm hover:shadow disabled:opacity-60 cursor-pointer"
              title="Actualizar datos en tiempo real"
            >
              <RefreshCw size={13} className={(dashboardMode === 'web' ? webOrdersLoading : loading) ? 'animate-spin' : ''} />
              <span>Actualizar</span>
              {dashboardMode === 'tienda' && lastUpdate && (
                <span className="hidden sm:inline text-[10px] text-emerald-100 font-normal">
                  · {lastUpdate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </button>
            {dashboardMode === 'tienda' && <div className="relative">
              <button onClick={() => setShowDatePicker(!showDatePicker)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700" title="Filtrar por fecha">
                <Calendar size={16} className="text-slate-600 dark:text-slate-400" />
              </button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4 z-50">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">📅 Filtrar por fecha</p>
                  <label className="text-[10px] text-slate-500 font-bold">Desde</label>
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="w-full mt-0.5 mb-2 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <label className="text-[10px] text-slate-500 font-bold">Hasta</label>
                  <input type="date" value={customDateEnd} onChange={e => setCustomDateEnd(e.target.value)} className="w-full mt-0.5 mb-3 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowDatePicker(false); loadData(true) }} className="flex-1 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition-colors">Aplicar</button>
                    <button onClick={() => { setCustomDate(''); setCustomDateEnd(''); setShowDatePicker(false); loadData(true) }} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors">Reset</button>
                  </div>
                </div>
              )}
            </div>}
          </div>
        </div>

        {/* Chips de sucursales con estado de cuadres */}
        {dashboardMode === 'tienda' && Object.keys(cuadreStatusBySede).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {Object.entries(cuadreStatusBySede).map(([slug, info]) => {
              const allListo = info.cajeros.length > 0 && info.cajeros.every(c => c.listo)
              return (
                <div
                  key={slug}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg min-w-0 transition-all ${
                    allListo
                      ? 'bg-emerald-50 border border-emerald-200'
                      : 'bg-amber-50 border border-amber-200'
                  }`}
                  title={allListo ? `${info.sedeName} — todos los cuadres enviados` : `${info.sedeName} — cierre de caja pendiente`}
                >
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap ${
                    allListo ? 'text-emerald-700' : 'text-amber-700'
                  }`}>{info.sedeName}</span>
                  <span className={allListo ? 'text-emerald-300' : 'text-amber-300'}>·</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {info.cajeros.map(c => (
                      <button
                        key={c.nombre}
                        type="button"
                        onClick={() => {
                          if (c.listo) return
                          navigate(`/pos/${slug}?cajera=${encodeURIComponent(c.nombre)}`)
                        }}
                        disabled={c.listo}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                          c.listo
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default shadow-xs'
                            : 'bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200 hover:scale-105 active:scale-95 cursor-pointer'
                        }`}
                        title={c.listo ? `${c.nombre} — cuadre listo` : `Hacer corte de ${c.nombre}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${c.listo ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                        <span className="truncate max-w-[120px]">{c.nombre}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {dashboardMode === 'web' ? (() => {
        const verifiedPaymentStatuses = new Set(['payment_confirmed', 'preparing', 'shipped', 'delivered'])
        const confirmedStatuses = new Set(['paid', 'processing', 'payment_review', 'payment_confirmed', 'preparing', 'shipped', 'delivered'])
        const cancelledStatuses = new Set(['cancelled', 'canceled', 'anulado', 'anulada'])
        const activeOrders = webOrdersToday.filter(order => !cancelledStatuses.has(order.status))
        const confirmedOrders = activeOrders.filter(order => confirmedStatuses.has(order.status))
        const paidOrders = activeOrders.filter(order => verifiedPaymentStatuses.has(order.status))
        const cancelledOrders = webOrdersToday.filter(order => cancelledStatuses.has(order.status))
        const pendingOrders = activeOrders.filter(order => !confirmedStatuses.has(order.status))
        const salesTotal = activeOrders.reduce((sum, order) => sum + order.total, 0)
        const confirmedTotal = confirmedOrders.reduce((sum, order) => sum + order.total, 0)
        const paidTotal = paidOrders.reduce((sum, order) => sum + order.total, 0)
        const aiOrders = webOrdersToday.filter(order => order.takenByAi)
        const paymentMethods = new Map<string, { count: number; total: number }>()
        activeOrders.forEach(order => {
          const method = order.paymentMethod.trim() || 'No especificado'
          const current = paymentMethods.get(method) || { count: 0, total: 0 }
          current.count += 1
          current.total += order.total
          paymentMethods.set(method, current)
        })
        const paymentMethodRows = [...paymentMethods.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 4)
        const customerTotals = new Map<string, { name: string; total: number; count: number }>()
        paidOrders.forEach(order => {
          const key = order.customerName.trim().toLocaleLowerCase('es-CL')
          const current = customerTotals.get(key) || { name: order.customerName, total: 0, count: 0 }
          current.total += order.total
          current.count += 1
          customerTotals.set(key, current)
        })
        const topCustomer = [...customerTotals.values()].sort((a, b) => b.total - a.total)[0]
        const money = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`
        const dateLabel = dateMode === 'hoy' ? 'hoy' : 'ayer'
        const statusLabel: Record<string, string> = {
          pending: 'Pendiente', pending_stock: 'Pendiente de stock', paid: 'Stock confirmado',
          payment_review: 'Pago en revisión', payment_confirmed: 'Pagado', preparing: 'Preparando',
          shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado', canceled: 'Cancelado',
        }
        const metricCards = [
          { label: 'Pedidos recibidos', value: webOrdersToday.length.toLocaleString('es-CL'), detail: `Creados ${dateLabel}`, tone: 'blue' },
          { label: 'Ventas web', value: money(salesTotal), detail: `${activeOrders.length} pedido(s) vigente(s)`, tone: 'emerald' },
          { label: 'Pedidos confirmados', value: money(confirmedTotal), detail: `${confirmedOrders.length} pedido(s) aceptado(s)`, tone: 'cyan' },
          { label: 'Pagos verificados', value: money(paidTotal), detail: `${paidOrders.length} pago(s) confirmado(s)`, tone: 'green' },
          { label: 'Pendientes', value: money(pendingOrders.reduce((sum, order) => sum + order.total, 0)), detail: `${pendingOrders.length} por gestionar`, tone: 'amber' },
          { label: 'Tomados por IA', value: aiOrders.length.toLocaleString('es-CL'), detail: `${money(aiOrders.reduce((sum, order) => sum + order.total, 0))} en pedidos IA`, tone: 'violet' },
          { label: 'Ticket promedio', value: money(activeOrders.length ? salesTotal / activeOrders.length : 0), detail: 'Por pedido no cancelado', tone: 'slate' },
          { label: 'Cancelados', value: cancelledOrders.length.toLocaleString('es-CL'), detail: `${money(cancelledOrders.reduce((sum, order) => sum + order.total, 0))} en pedidos anulados`, tone: 'rose' },
        ]
        const toneClasses: Record<string, string> = {
          blue: 'border-blue-200 bg-blue-50/70 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300',
          emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300',
          cyan: 'border-cyan-200 bg-cyan-50/70 text-cyan-700 dark:bg-cyan-950/30 dark:border-cyan-900 dark:text-cyan-300',
          green: 'border-green-200 bg-green-50/70 text-green-700 dark:bg-green-950/30 dark:border-green-900 dark:text-green-300',
          violet: 'border-violet-200 bg-violet-50/70 text-violet-700 dark:bg-violet-950/30 dark:border-violet-900 dark:text-violet-300',
          amber: 'border-amber-200 bg-amber-50/70 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300',
          slate: 'border-slate-200 bg-slate-50/70 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200',
          rose: 'border-rose-200 bg-rose-50/70 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300',
        }
        return <section className="space-y-4" aria-label="Dashboard de ventas web">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-4 dark:from-indigo-950/40 dark:to-slate-900 dark:border-indigo-900">
            <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Canal online</p><h2 className="text-xl font-black text-slate-800 dark:text-white">Resumen de pedidos web</h2><p className="text-sm text-slate-500">Pedidos creados {dateLabel}. Ventas suma pedidos no cancelados; pagos verificados excluye stock reservado y pagos en revisión.</p></div>
            <ShoppingCart className="text-indigo-500" size={28} />
          </div>
          {webOrdersLoading && <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando pedidos…</div>}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {metricCards.map(card => <div key={card.label} className={`rounded-2xl border p-4 ${toneClasses[card.tone]}`}><p className="text-xs font-bold uppercase tracking-wide opacity-80">{card.label}</p><p className="mt-1 text-2xl font-black tabular-nums">{card.value}</p><p className="mt-1 text-xs opacity-80">{card.detail}</p></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700">
              <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-200">Cliente que más pagó</h3>
              {topCustomer ? <div className="mt-4"><p className="truncate text-lg font-black text-slate-800 dark:text-white">{topCustomer.name}</p><p className="text-2xl font-black text-emerald-600">{money(topCustomer.total)}</p><p className="text-xs text-slate-500">{topCustomer.count} pedido(s) pagado(s) {dateLabel}</p></div> : <p className="mt-4 text-sm text-slate-500">Aún no hay pagos confirmados {dateLabel}.</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700">
              <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-200">Montos por forma de pago</h3>
              {paymentMethodRows.length ? <div className="mt-3 space-y-3">{paymentMethodRows.map(([method, summary]) => <div key={method} className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">{method}</p><p className="text-xs text-slate-400">{summary.count} pedido(s)</p></div><p className="shrink-0 text-sm font-extrabold text-slate-800 dark:text-white">{money(summary.total)}</p></div>)}</div> : <p className="mt-4 text-sm text-slate-500">Sin movimientos {dateLabel}.</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700 lg:col-span-1">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-200">Pedidos recientes</h3><span className="text-xs text-slate-400">{webOrdersToday.length} total</span></div>
              {webOrdersToday.length === 0 && !webOrdersLoading ? <p className="py-6 text-center text-sm text-slate-500">No hay pedidos web {dateLabel}.</p> : <div className="divide-y divide-slate-100 dark:divide-slate-700">{webOrdersToday.slice(0, 8).map(order => <div key={`${order.collection}-${order.id}`} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">{order.customerName}<span className="ml-2 text-xs font-medium text-slate-400">#{order.orderCode}</span></p><p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500"><span>{statusLabel[order.status] || order.status}</span>{order.takenByAi && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">IA</span>}</p></div><span className="shrink-0 text-sm font-extrabold tabular-nums text-slate-800 dark:text-white">{money(order.total)}</span></div>)}</div>}
            </div>
          </div>
        </section>
      })() : <>
        {/* Barra de Transcurso del Día (09:00 a 18:00 L-V / 15:00 S-D) */}
        <div className="rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 p-3 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Clock size={13} className="text-slate-600 dark:text-slate-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Transcurso del día</span>
                  <span className={`w-2 h-2 rounded-full ${dayProgress.dotColor} animate-pulse`} />
                </div>
                <p className="text-[11px] text-slate-400 font-medium truncate">{dayProgress.subLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 rounded-lg text-xs font-black shadow-2xs ${dayProgress.badgeBg}`}>
                {dayProgress.pctDisplay}%
              </span>
            </div>
          </div>

          {/* Barra de progreso con gradiente rojo -> verde según avance */}
          <div className="h-5 rounded-full bg-slate-100 dark:bg-slate-700/70 p-0.5 overflow-hidden relative border border-slate-200/50 dark:border-slate-600/40">
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-out relative"
              style={{
                width: `${Math.max(3, dayProgress.pct)}%`,
                ...dayProgress.barStyle,
              }}
            >
              {/* Onda brillante */}
              <div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.6) 50%, rgba(255,255,255,0) 100%)', backgroundSize: '200% 100%', animation: 'td_shimmer 2.5s ease-in-out infinite' }} />
              {/* Partículas luminosas */}
              {[...Array(10)].map((_, i) => (
                <div key={`tp_bar_${i}`} className="absolute rounded-full" style={{
                  left: `${5 + (i * 9.5) % 90}%`, top: `${15 + (i * 27) % 65}%`,
                  width: `${1.5 + (i % 3) * 0.8}px`, height: `${1.5 + (i % 3) * 0.8}px`,
                  background: 'rgba(255,255,255,0.7)',
                  boxShadow: '0 0 3px rgba(255,255,255,0.8)',
                  animation: `td_float ${1.5 + (i % 4) * 0.4}s ease-in-out ${(i * 0.2) % 2}s infinite alternate`,
                }} />
              ))}
            </div>
          </div>

          {/* Hitos de apertura y cierre */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold px-0.5">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              Abre {dayProgress.openHourText}
            </span>
            <span className="font-bold text-slate-500 dark:text-slate-400">
              {dayProgress.statusLabel}
            </span>
            <span className="flex items-center gap-1">
              Cierra {dayProgress.closeHourText}
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </span>
          </div>
        </div>

        {/* Stats - 2x2 en móvil — cards always visible, only amounts shimmer while loading */}
        <div className="grid grid-cols-2 gap-3">
          {/* Ventas Brutas */}
          <Link to="/sucursales" className="block rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 shadow-sm relative overflow-hidden hover:shadow-md hover:border-emerald-300 transition-all group">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-emerald-50/40 to-transparent dark:from-emerald-900/10" />
              {[...Array(14)].map((_, i) => (
                <div key={`vp_${i}`} className="absolute rounded-full" style={{
                  left: `${8 + (i * 13 + 5) % 80}%`,
                  top: `${10 + (i * 19 + 7) % 70}%`,
                  width: `${3 + (i % 3) * 1.5}px`, height: `${3 + (i % 3) * 1.5}px`,
                  background: `radial-gradient(circle, rgba(52,211,153,${0.45 + (i % 3) * 0.12}), rgba(16,185,129,${0.2 + (i % 3) * 0.08}))`,
                  boxShadow: `0 0 ${3 + (i % 3) * 2}px rgba(16,185,129,0.3)`,
                  animation: `td_float ${3 + (i % 4) * 0.8}s ease-in-out ${(i * 0.3) % 3.5}s infinite alternate`,
                }} />
              ))}
              <div className="absolute top-1/4 left-1/3 h-5 w-5 rounded-full bg-emerald-300/20 blur-md" style={{ animation: 'td_drift 4s ease-in-out infinite' }} />
              <div className="absolute bottom-1/4 right-1/4 h-4 w-4 rounded-full bg-green-300/15 blur-md" style={{ animation: 'td_drift 5s ease-in-out infinite reverse' }} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center border border-emerald-200/50 group-hover:scale-110 transition-transform"><TrendingUp size={14} className="text-emerald-600" /></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ventas Brutas</span>
              </div>
              {loading ? (
                <div className="h-7 w-20 rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-slate-800 dark:text-white">{formatCompact(displayTotals.ventas)}</p>
              )}
            </div>
          </Link>
          {/* Gastos */}
          <Link to="/gastos" className="block rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 shadow-sm relative overflow-hidden hover:shadow-md hover:border-rose-300 transition-all group">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-rose-50/40 to-transparent dark:from-rose-900/10" />
              {[...Array(14)].map((_, i) => (
                <div key={`gp_${i}`} className="absolute rounded-full" style={{
                  left: `${8 + (i * 15 + 3) % 80}%`,
                  top: `${10 + (i * 17 + 11) % 70}%`,
                  width: `${3 + (i % 3) * 1.5}px`, height: `${3 + (i % 3) * 1.5}px`,
                  background: `radial-gradient(circle, rgba(251,113,133,${0.45 + (i % 3) * 0.12}), rgba(244,63,94,${0.2 + (i % 3) * 0.08}))`,
                  boxShadow: `0 0 ${3 + (i % 3) * 2}px rgba(244,63,94,0.3)`,
                  animation: `td_float ${3 + (i % 4) * 0.8}s ease-in-out ${(i * 0.35) % 3.5}s infinite alternate`,
                }} />
              ))}
              <div className="absolute top-1/4 right-1/3 h-5 w-5 rounded-full bg-rose-300/20 blur-md" style={{ animation: 'td_drift 4.5s ease-in-out infinite' }} />
              <div className="absolute bottom-1/4 left-1/4 h-4 w-4 rounded-full bg-red-300/15 blur-md" style={{ animation: 'td_drift 5.5s ease-in-out infinite reverse' }} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-100 to-red-100 dark:from-rose-900/30 dark:to-red-900/30 flex items-center justify-center border border-rose-200/50 group-hover:scale-110 transition-transform"><TrendingDown size={14} className="text-rose-600" /></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gastos</span>
              </div>
              {loading ? (
                <div className="h-7 w-20 rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-slate-800 dark:text-white">{formatCompact(displayTotals.gastos)}</p>
              )}
            </div>
          </Link>
          {/* Ganancia Final */}
          <div className="col-span-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 p-4 shadow-lg relative overflow-hidden cursor-pointer hover:shadow-xl transition-all active:scale-[0.98]"
            onClick={() => navigate('/top-products/productos?global=1')}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {/* Floating particles */}
              {[...Array(20)].map((_, i) => (
                <div key={`gf_${i}`} className="absolute rounded-full" style={{
                  left: `${5 + (i * 11 + 3) % 88}%`,
                  top: `${8 + (i * 17 + 5) % 78}%`,
                  width: `${2 + (i % 4) * 1.5}px`, height: `${2 + (i % 4) * 1.5}px`,
                  background: `radial-gradient(circle, rgba(255,255,255,${0.3 + (i % 3) * 0.15}), rgba(255,255,255,${0.1 + (i % 3) * 0.05}))`,
                  boxShadow: `0 0 ${4 + (i % 3) * 3}px rgba(255,255,255,0.25)`,
                  animation: `td_float ${2.5 + (i % 5) * 0.7}s ease-in-out ${(i * 0.25) % 4}s infinite alternate`,
                }} />
              ))}
              {/* Blur orbs */}
              <div className="absolute top-0 left-1/4 h-12 w-12 rounded-full bg-white/10 blur-xl" style={{ animation: 'td_drift 5s ease-in-out infinite' }} />
              <div className="absolute bottom-0 right-1/3 h-10 w-10 rounded-full bg-emerald-300/15 blur-xl" style={{ animation: 'td_drift 6s ease-in-out infinite reverse' }} />
              <div className="absolute top-1/2 left-2/3 h-8 w-8 rounded-full bg-teal-200/10 blur-lg" style={{ animation: 'td_drift 4s ease-in-out 1s infinite' }} />
              {/* Bubble circles */}
              {[...Array(6)].map((_, i) => (
                <div key={`gb_${i}`} className="absolute rounded-full border border-white/20" style={{
                  left: `${8 + i * 16}%`,
                  bottom: `${5 + (i % 3) * 15}%`,
                  width: `${8 + (i % 3) * 6}px`, height: `${8 + (i % 3) * 6}px`,
                  animation: `td_bubble ${3 + i * 0.6}s ease-in-out ${i * 0.4}s infinite`,
                }} />
              ))}
            </div>
            <div className="flex items-center justify-between relative z-10 gap-3">
              <div className="min-w-0">
                <p className="text-green-100 text-xs font-bold flex items-center gap-1.5">Ganancia Final</p>
                {loading ? (
                  <div className="h-9 w-28 rounded-lg bg-white/20 animate-pulse mt-1" />
                ) : (
                  <p className="text-3xl font-black text-white drop-shadow-sm truncate">{formatCompact(displayTotals.ganancia)}</p>
                )}
                <p className="text-[10px] text-green-200 mt-0.5 truncate">Ventas - Costos - Gastos → Ver detalle</p>
              </div>

              {/* Lado derecho: Porcentaje de ganancia + Icono */}
              <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-green-100 uppercase tracking-wider block">
                    Margen
                  </span>
                  {loading ? (
                    <div className="h-7 w-16 rounded-lg bg-white/20 animate-pulse mt-0.5" />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-black text-white drop-shadow-sm tracking-tight block">
                      {displayTotals.ventas > 0
                        ? `${((displayTotals.ganancia / displayTotals.ventas) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </span>
                  )}
                  <span className="text-[9px] text-green-200 font-medium block">
                    s/ ventas
                  </span>
                </div>
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg flex-shrink-0">
                  <DollarSign size={26} className="text-white drop-shadow-sm" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Balato AI: Notificación / Diálogo estilo Genshin del Personaje */}
        <BalatoAiSpeechBubble
          totals={displayTotals}
          monthlyData={displayMonthlyData}
          topProducts={displayTopProducts}
          loading={loading}
        />

        {/* Historial de Margen: Cuadro Gráfico Ordenado (Mobile-first) */}
        <MarginHistoryChartCard
          totals={displayTotals}
          monthlyData={displayMonthlyData}
          loading={loading}
        />

        {/* Micro-KPIs Operativos del Turno */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Boletas Emitidas */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 sm:p-3 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-200/50 dark:border-blue-700/50 flex-shrink-0">
                <Receipt size={13} className="text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                Boletas
              </span>
            </div>
            {loading ? (
              <div className="h-6 w-12 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mt-0.5" />
            ) : (
              <p className="text-base sm:text-lg font-black text-slate-800 dark:text-white leading-tight">
                {displayTurnoStats.totalBoletas.toLocaleString('es-CL')}
              </p>
            )}
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              {dateMode === 'hoy' ? 'Emitidas hoy' : 'En el cuadre'}
            </p>
          </div>

          {/* Ticket Promedio */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 sm:p-3 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center border border-violet-200/50 dark:border-violet-700/50 flex-shrink-0">
                <Calculator size={13} className="text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                Ticket Prom.
              </span>
            </div>
            {loading ? (
              <div className="h-6 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mt-0.5" />
            ) : (
              <p className="text-base sm:text-lg font-black text-slate-800 dark:text-white leading-tight truncate">
                {formatCompact(displayTurnoStats.ticketPromedio)}
              </p>
            )}
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              Por boleta
            </p>
          </div>

          {/* Artículos Vendidos */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 sm:p-3 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center border border-emerald-200/50 dark:border-emerald-700/50 flex-shrink-0">
                <Boxes size={13} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                Artículos
              </span>
            </div>
            {loading ? (
              <div className="h-6 w-12 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mt-0.5" />
            ) : (
              <p className="text-base sm:text-lg font-black text-slate-800 dark:text-white leading-tight truncate">
                {displayTurnoStats.totalArticulos.toLocaleString('es-CL')}
              </p>
            )}
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              Unidades POS
            </p>
          </div>
        </div>

        {/* Top Cajeras del Turno */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3.5 sm:p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-500 flex items-center justify-center shadow-sm flex-shrink-0">
                <Trophy size={16} className="text-white drop-shadow-sm" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-1.5 truncate">
                  Top Cajeras del Turno
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {displayCajeras.length > 0
                    ? `${displayCajeras.length} cajeras activas · Ordenado por ventas`
                    : 'Sin registros de caja'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {dateMode === 'hoy' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En Vivo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                  🏁 Cuadre
                </span>
              )}
            </div>
          </div>

          {/* Lista de Cajeras */}
          {loading ? (
            <div className="space-y-2.5 py-1">
              {[0, 1, 2].map(i => (
                <div key={`skel_caj_${i}`} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                    <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </div>
              ))}
            </div>
          ) : displayCajeras.length === 0 ? (
            <div className="py-6 text-center">
              <Users size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                No hay ventas registradas de cajeras para este día.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayCajeras.map((caj, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                const barGradients = [
                  'linear-gradient(90deg, #f59e0b 0%, #10b981 100%)', // 1st: Gold -> Emerald
                  'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)', // 2nd: Blue -> Cyan
                  'linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%)', // 3rd: Violet -> Purple
                  'linear-gradient(90deg, #64748b 0%, #94a3b8 100%)', // Others
                ]
                const barGradient = barGradients[idx] || barGradients[3]

                return (
                  <div
                    key={`caj_${caj.nombre}_${idx}`}
                    className={`p-2.5 sm:p-3 rounded-xl border transition-all ${
                      idx === 0
                        ? 'bg-gradient-to-r from-amber-50/50 via-emerald-50/20 to-transparent dark:from-amber-950/20 dark:via-emerald-950/10 dark:to-transparent border-amber-200/70 dark:border-amber-700/40 shadow-sm'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700/60 hover:border-slate-200'
                    }`}
                  >
                    {/* Header de la cajera: posición, nombre y monto */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 text-base leading-none" title={`Puesto #${idx + 1}`}>
                          {medal ? (
                            medal
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center">
                              #{idx + 1}
                            </span>
                          )}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white truncate">
                          {caj.nombre}
                        </span>
                        {idx === 0 && (
                          <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Líder
                          </span>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight">
                          {formatCLP(caj.ventas)}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 ml-1.5">
                          {caj.porcentaje.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Barra de progreso de participación sobre ventas totales */}
                    <div className="w-full bg-slate-200/70 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, Math.max(5, caj.porcentaje))}%`,
                          background: barGradient,
                        }}
                      />
                    </div>

                    {/* Detalle operativo: Boletas, Ticket Promedio y Artículos */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Receipt size={11} className="text-slate-400" />
                        <b>{caj.boletas}</b> {caj.boletas === 1 ? 'boleta' : 'boletas'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calculator size={11} className="text-slate-400" />
                        Prom. <b>{formatCompact(caj.ticketPromedio)}</b>
                      </span>
                      {caj.articulos > 0 && (
                        <span className="flex items-center gap-1">
                          <Boxes size={11} className="text-slate-400" />
                          <b>{caj.articulos.toLocaleString('es-CL')}</b> uds
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Producto más vendido - Clickeable */}
        {loading ? (
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out infinite' }} />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-36 rounded-full bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.1s infinite' }} />
                <div className="h-3.5 w-48 rounded-full bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.2s infinite' }} />
                <div className="h-2.5 w-28 rounded-full bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.3s infinite' }} />
              </div>
            </div>
          </div>
        ) : displayTopProducts.length > 0 && (
          <Link 
            to="/top-producto-dia"
            className="group relative overflow-hidden block rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md hover:border-amber-300 transition-all"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-amber-50/30 to-transparent dark:from-amber-900/10" />
              {[...Array(22)].map((_, i) => {
                const symbols = ['✦', '★', '✧', '⭐', '✦', '★', '✧', '·', '★', '✦']
                const size = i % 4 === 0 ? 14 : i % 3 === 0 ? 10 : i % 2 === 0 ? 7 : 5
                return (
                  <div key={`tp_${i}`} className="absolute select-none" style={{
                    left: `${3 + (i * 11 + 7) % 92}%`,
                    top: `${5 + (i * 17 + 3) % 85}%`,
                    fontSize: `${size}px`,
                    color: `rgba(251,191,36,${0.3 + (i % 4) * 0.12})`,
                    textShadow: `0 0 ${size}px rgba(245,158,11,${0.3 + (i % 3) * 0.15}), 0 0 ${size * 2}px rgba(251,191,36,0.1)`,
                    animation: `td_float ${3 + (i % 6) * 0.6}s ease-in-out ${(i * 0.2) % 4}s infinite alternate`,
                    transform: `rotate(${(i * 37) % 360}deg)`,
                  }}>{symbols[i % symbols.length]}</div>
                )
              })}
              <div className="absolute top-1/4 right-1/4 h-10 w-10 rounded-full bg-amber-300/20 blur-xl" style={{ animation: 'td_drift 4s ease-in-out infinite' }} />
              <div className="absolute bottom-1/4 left-1/3 h-8 w-8 rounded-full bg-yellow-300/15 blur-lg" style={{ animation: 'td_drift 5s ease-in-out infinite reverse' }} />
              <div className="absolute top-1/2 left-1/2 h-6 w-6 rounded-full bg-orange-200/10 blur-md" style={{ animation: 'td_drift 3.5s ease-in-out 1s infinite' }} />
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg shadow-amber-200/40" style={{ boxShadow: '0 0 12px rgba(251,191,36,0.4), 0 4px 12px rgba(245,158,11,0.3)' }}>
                <Trophy size={22} className="text-white drop-shadow-sm" />
                <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none" style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.25) 55%, transparent 65%)', backgroundSize: '250% 100%', animation: 'trophyShine 6s ease-in-out infinite' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold text-amber-600/80 uppercase tracking-wider">Producto más vendido del día</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight mt-0.5">{displayTopProducts[0]?.nombre || 'N/A'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{displayTopProducts[0]?.cantidad || 0} uds</span>
                  <span className="text-[10px] text-slate-400">vendidas</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-amber-500 transition-colors" />
            </div>
          </Link>
        )}

        {/* Producto con menos ganancia & Producto con más pérdida */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map(i => (
              <div key={`skel_mp${i}`} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out infinite' }} />
                  <div className="h-2.5 w-20 rounded-full bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.1s infinite' }} />
                </div>
                <div className="h-3 w-full rounded-full bg-slate-200 mb-2" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.2s infinite' }} />
                <div className="h-2.5 w-24 rounded-full bg-slate-200 mb-1.5" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.3s infinite' }} />
                <div className="h-2 w-16 rounded-full bg-slate-200" style={{ animation: 'td_shimmer 1.5s ease-in-out 0.4s infinite' }} />
              </div>
            ))}
          </div>
        ) : displayTopProducts.length > 0 && (() => {
          const withMargin = displayTopProducts.map(p => {
            const sku = String(p.sku || '').trim().toUpperCase()
            const cantidad = p.cantidad || 0
            const ventasBrutas = p.ventas || 0
            const costoNetoReporte = p.costoNeto || 0
            const costoUnitBD = costsBD.get(sku) || 0
            const base = costoUnitBD > 0 ? costoUnitBD : (cantidad > 0 ? Math.round(costoNetoReporte / cantidad) : 0)
            const applyAdj = minus10Flags.has(sku)
            const costoUnit = Math.round(base * (applyAdj ? 0.81 : 1))
            const costoNeto = costoUnit * cantidad
            const margen = ventasBrutas - costoNeto
            const pct = ventasBrutas > 0 ? (margen / ventasBrutas) * 100 : 0
            return { ...p, margen, pct, costoNeto }
          }).filter(p => p.cantidad > 0 && (p.costoNeto > 0 || p.ventas > 0))

          const leastProfit = [...withMargin].filter(p => p.margen >= 0).sort((a, b) => a.pct - b.pct)[0]
          const mostLoss = [...withMargin].filter(p => p.margen < 0).sort((a, b) => a.margen - b.margen)[0]

          return (
            <div className="grid grid-cols-2 gap-3">
              {leastProfit && (
                <Link to="/revision-precios" className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md hover:border-orange-300 transition-all">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-orange-50/40 to-transparent dark:from-orange-900/10" />
                    {[...Array(14)].map((_, i) => (
                      <div key={`lp_${i}`} className="absolute rounded-full" style={{
                        left: `${8 + (i * 14 + 5) % 80}%`,
                        top: `${10 + (i * 21 + 7) % 70}%`,
                        width: `${3 + (i % 3) * 1.5}px`, height: `${3 + (i % 3) * 1.5}px`,
                        background: `radial-gradient(circle, rgba(249,115,22,${0.4 + (i % 3) * 0.1}), rgba(234,88,12,${0.15 + (i % 3) * 0.06}))`,
                        boxShadow: `0 0 ${3 + (i % 3) * 2}px rgba(249,115,22,0.25)`,
                        animation: `td_float ${3 + (i % 4) * 0.8}s ease-in-out ${(i * 0.3) % 3.5}s infinite alternate`,
                      }} />
                    ))}
                    <div className="absolute top-1/4 left-1/3 h-6 w-6 rounded-full bg-orange-300/20 blur-md" style={{ animation: 'td_drift 4s ease-in-out infinite' }} />
                    <div className="absolute bottom-1/4 right-1/4 h-5 w-5 rounded-full bg-orange-200/15 blur-md" style={{ animation: 'td_drift 5s ease-in-out infinite reverse' }} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center border border-orange-200/50 group-hover:scale-110 transition-transform">
                        <TrendingDown size={16} className="text-orange-500" />
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Menos ganancia</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight truncate" title={leastProfit.nombre}>{leastProfit.nombre}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-600">{leastProfit.pct.toFixed(1)}%</span>
                      <span className="text-[9px] text-slate-400">margen</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">{leastProfit.cantidad} uds · {formatCompact(leastProfit.ventas)} ventas</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 group-hover:text-orange-500 transition-colors">→ Rev. Precios</p>
                  </div>
                </Link>
              )}
              {mostLoss ? (
                <Link to="/revision-costos" className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md hover:border-red-300 transition-all">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-red-50/40 to-transparent dark:from-red-900/10" />
                    {[...Array(14)].map((_, i) => (
                      <div key={`ml_${i}`} className="absolute rounded-full" style={{
                        left: `${8 + (i * 15 + 3) % 80}%`,
                        top: `${10 + (i * 19 + 11) % 70}%`,
                        width: `${3 + (i % 3) * 1.5}px`, height: `${3 + (i % 3) * 1.5}px`,
                        background: `radial-gradient(circle, rgba(248,113,113,${0.45 + (i % 3) * 0.12}), rgba(220,38,38,${0.2 + (i % 3) * 0.08}))`,
                        boxShadow: `0 0 ${3 + (i % 3) * 2}px rgba(220,38,38,0.3)`,
                        animation: `td_float ${3 + (i % 4) * 0.8}s ease-in-out ${(i * 0.35) % 3.5}s infinite alternate`,
                      }} />
                    ))}
                    <div className="absolute top-1/4 right-1/3 h-6 w-6 rounded-full bg-red-300/20 blur-md" style={{ animation: 'td_drift 4.5s ease-in-out infinite' }} />
                    <div className="absolute bottom-1/4 left-1/4 h-5 w-5 rounded-full bg-rose-300/15 blur-md" style={{ animation: 'td_drift 5.5s ease-in-out infinite reverse' }} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-100 to-rose-100 dark:from-red-900/30 dark:to-rose-900/30 flex items-center justify-center border border-red-200/50 group-hover:scale-110 transition-transform">
                        <AlertTriangle size={16} className="text-red-600" />
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Más pérdida</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight truncate" title={mostLoss.nombre}>{mostLoss.nombre}</p>
                    <p className="text-[10px] text-red-600 font-semibold mt-1">Pérdida: {formatCLP(Math.abs(mostLoss.margen))}</p>
                    <p className="text-[9px] text-slate-400 mt-1 group-hover:text-red-500 transition-colors">→ Rev. Costos</p>
                  </div>
                </Link>
              ) : (() => {
                const dbLossProducts: { sku: string; nombre: string; costo: number; precio: number; perdida: number }[] = []
                const seenProds = new Set<string>()
                costsBD.forEach((costo, sku) => {
                  const nombre = productNamesBD.get(sku) || sku
                  if (seenProds.has(nombre)) return
                  seenProds.add(nombre)
                  const precio = pricesBD.get(sku) || 0
                  if (costo > 0 && precio > 0 && costo > precio) {
                    dbLossProducts.push({ sku, nombre, costo, precio, perdida: costo - precio })
                  }
                })
                dbLossProducts.sort((a, b) => b.perdida - a.perdida)
                const worstDbLoss = dbLossProducts[0]

                if (worstDbLoss) {
                  return (
                    <Link to="/revision-costos" className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md hover:border-red-300 transition-all">
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-red-50/40 to-transparent dark:from-red-900/10" />
                        {[...Array(14)].map((_, i) => (
                          <div key={`db_${i}`} className="absolute rounded-full" style={{
                            left: `${8 + (i * 15 + 3) % 80}%`, top: `${10 + (i * 19 + 11) % 70}%`,
                            width: `${3 + (i % 3) * 1.5}px`, height: `${3 + (i % 3) * 1.5}px`,
                            background: `radial-gradient(circle, rgba(248,113,113,${0.45 + (i % 3) * 0.12}), rgba(220,38,38,${0.2 + (i % 3) * 0.08}))`,
                            boxShadow: `0 0 ${3 + (i % 3) * 2}px rgba(220,38,38,0.3)`,
                            animation: `td_float ${3 + (i % 4) * 0.8}s ease-in-out ${(i * 0.35) % 3.5}s infinite alternate`,
                          }} />
                        ))}
                        <div className="absolute top-1/4 right-1/3 h-6 w-6 rounded-full bg-red-300/20 blur-md" style={{ animation: 'td_drift 4.5s ease-in-out infinite' }} />
                        <div className="absolute bottom-1/4 left-1/4 h-5 w-5 rounded-full bg-rose-300/15 blur-md" style={{ animation: 'td_drift 5.5s ease-in-out infinite reverse' }} />
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-100 to-rose-100 dark:from-red-900/30 dark:to-rose-900/30 flex items-center justify-center border border-red-200/50 group-hover:scale-110 transition-transform">
                            <AlertTriangle size={16} className="text-red-600" />
                          </div>
                          <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Pérdida en BD</span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight truncate" title={worstDbLoss.nombre}>{worstDbLoss.nombre}</p>
                        <p className="text-[10px] text-red-600 font-semibold mt-1">-{formatCLP(worstDbLoss.perdida)}/ud</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">Sin pérdidas hoy · {dbLossProducts.length} en BD</p>
                        <p className="text-[9px] text-slate-400 mt-0.5 group-hover:text-red-500 transition-colors">→ Rev. Costos</p>
                      </div>
                    </Link>
                  )
                }

                return (
                  <Link to="/revision-costos" className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-emerald-50/40 to-transparent dark:from-emerald-900/10" />
                      {[...Array(14)].map((_, i) => (
                        <div key={`np_${i}`} className="absolute rounded-full" style={{
                          left: `${8 + (i * 15 + 3) % 80}%`, top: `${10 + (i * 19 + 11) % 70}%`,
                          width: `${3 + (i % 3) * 1.5}px`, height: `${3 + (i % 3) * 1.5}px`,
                          background: `radial-gradient(circle, rgba(52,211,153,${0.45 + (i % 3) * 0.12}), rgba(16,185,129,${0.2 + (i % 3) * 0.08}))`,
                          boxShadow: `0 0 ${3 + (i % 3) * 2}px rgba(16,185,129,0.3)`,
                          animation: `td_float ${3 + (i % 4) * 0.8}s ease-in-out ${(i * 0.35) % 3.5}s infinite alternate`,
                        }} />
                      ))}
                      <div className="absolute top-1/3 left-1/4 h-6 w-6 rounded-full bg-emerald-300/20 blur-md" style={{ animation: 'td_drift 4s ease-in-out infinite' }} />
                      <div className="absolute bottom-1/4 right-1/4 h-5 w-5 rounded-full bg-green-300/15 blur-md" style={{ animation: 'td_drift 5s ease-in-out infinite reverse' }} />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center border border-emerald-200/50 group-hover:scale-110 transition-transform">
                          <AlertTriangle size={16} className="text-emerald-600" />
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Pérdidas</span>
                      </div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 leading-tight">Sin pérdidas en BD</p>
                      <p className="text-[10px] text-slate-500 mt-1">Ningún producto con costo {'>'} precio</p>
                      <p className="text-[9px] text-slate-400 mt-1 group-hover:text-emerald-500 transition-colors">→ Rev. Costos</p>
                    </div>
                  </Link>
                )
              })()}
            </div>
          )
        })()}

        {/* Accesos Rápidos - Scroll horizontal, 2 filas */}
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-3">
            <Zap size={16} className="text-amber-400" /> Accesos Rápidos
          </h2>
          <div className="overflow-x-auto pb-2 -mx-4 px-4" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
            <div className="grid grid-rows-2 grid-flow-col gap-2 w-max" style={{WebkitOverflowScrolling: 'touch'}}>
              {shortcuts.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border ${colorClasses[item.color]?.border} hover:shadow-md transition-all min-w-[120px]`}
                >
                  <div className={`p-1.5 rounded-lg ${colorClasses[item.color]?.light} ${colorClasses[item.color]?.text}`}>
                    {item.icon}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Equipo - Scroll horizontal */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Users size={16} className="text-indigo-400" /> Equipo
            </h2>
            <Link to="/planilla-unificada" className="text-xs text-blue-600 flex items-center gap-1">Equipo <ChevronRight size={14} /></Link>
          </div>
          {loading ? (
            <div className="overflow-x-auto pb-2 -mx-4 px-4" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
              <div className="flex gap-3 w-max">
                {[0,1,2,3,4,5].map(i => (
                  <div key={`skel_eq${i}`} className="flex flex-col items-center p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-[80px]">
                    <div className="w-12 h-12 rounded-full bg-slate-200 mb-2" style={{ animation: `td_shimmer 1.5s ease-in-out ${i * 0.15}s infinite` }} />
                    <div className="h-2.5 w-14 rounded-full bg-slate-200" style={{ animation: `td_shimmer 1.5s ease-in-out ${0.1 + i * 0.15}s infinite` }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto pb-2 -mx-4 px-4" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
            <div className="flex gap-3 w-max" style={{WebkitOverflowScrolling: 'touch'}}>
              {displayTrabajadores.length > 0 ? (
                displayTrabajadores.map((t) => (
                  <Link
                    key={t.id}
                    to={`/trabajador/${t.sucursal}/${t.id}`}
                    className="flex flex-col items-center p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all min-w-[80px]"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 mb-2">
                      {t.foto ? (
                        <img src={t.foto} alt={t.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-slate-400">
                          {t.nombre.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[70px]">
                      {t.nombre.split(' ')[0]}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="py-6 text-center text-slate-400 w-full">
                  <Users size={24} className="mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Sin trabajadores</p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Top Productos */}
        {loading ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Star size={16} className="text-amber-400" /> Top Productos
              </h2>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
              {[0,1,2,3,4].map(i => (
                <div key={`skel_tp${i}`} className={`flex items-center gap-3 px-4 py-3 ${i < 4 ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}>
                  <div className="w-6 h-6 rounded-full bg-slate-200" style={{ animation: `td_shimmer 1.5s ease-in-out ${i * 0.1}s infinite` }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded-full bg-slate-200" style={{ animation: `td_shimmer 1.5s ease-in-out ${0.1 + i * 0.1}s infinite` }} />
                    <div className="h-2 w-20 rounded-full bg-slate-200" style={{ animation: `td_shimmer 1.5s ease-in-out ${0.2 + i * 0.1}s infinite` }} />
                  </div>
                  <div className="text-right space-y-1">
                    <div className="h-3.5 w-8 rounded-full bg-slate-200 ml-auto" style={{ animation: `td_shimmer 1.5s ease-in-out ${0.15 + i * 0.1}s infinite` }} />
                    <div className="h-2 w-6 rounded-full bg-slate-200 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Star size={16} className="text-amber-400" /> Top Productos
              </h2>
              <Link to="/top-products" className="text-xs text-blue-600 flex items-center gap-1">Ver más <ChevronRight size={14} /></Link>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2 mb-1" aria-label="Periodo del ranking de productos">
              {([
                ['dia', dateMode === 'ayer' ? 'Ayer' : 'Hoy'],
                ['semana', 'Esta semana'],
                ['7', '7 días'],
                ['15', '15 días'],
                ['30', '30 días'],
              ] as const).map(([period, label]) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={teamTopProductsRange === period}
                  onClick={() => setTeamTopProductsRange(period)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                    teamTopProductsRange === period
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
              {teamTopProductsLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Cargando ventas del periodo…
                </div>
              ) : displayTeamTopProducts.length > 0 ? (
                displayTeamTopProducts.slice(0, 5).map((p, i, list) => (
                  <div key={p.sku || `${p.nombre}-${i}`} className={`flex items-center gap-3 px-4 py-3 ${i !== list.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{p.nombre}</p>
                      <p className="text-[10px] text-slate-500">{p.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">{p.cantidad}</p>
                      <p className="text-[10px] text-slate-500">uds</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-xs text-slate-500">No hay ventas completadas en este periodo.</div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ ANALYTICS CHARTS MENSUAL ═══════════════ */}
        {(() => {
          const fmtK = (v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`
          const COLORS_SEDES = ['#10b981','#6366f1','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
          const SUCURSALES = getSucursales(runtimeAppConfig)

          // Spinner mientras carga datos mensuales
          if (loadingMonthly) return (
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 shadow-sm flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Cargando datos mensuales…</p>
            </div>
          )

          if (displayMonthlyData.length === 0) return null

          // Resumen mensual: usa monthlyBySede si hay sede seleccionada, sino totales globales
          const mTotals = selectedSedeFilter !== 'todas' && monthlyBySede[selectedSedeFilter]
            ? monthlyBySede[selectedSedeFilter]
            : displayMonthlyData.reduce((a, d) => ({ ventas: a.ventas + d.ventas, gastos: a.gastos + d.gastos, ganancia: a.ganancia + d.ganancia }), { ventas: 0, gastos: 0, ganancia: 0 })
          const margen = mTotals.ventas > 0 ? Math.round((mTotals.ganancia / mTotals.ventas) * 100) : 0
          const margenColor = margen >= 30 ? '#10b981' : margen >= 15 ? '#f59e0b' : '#ef4444'

          // Datos por sede desde monthlyBySede (filtrado si hay sede activa)
          const sedeBarData = SUCURSALES
            .filter(s => selectedSedeFilter === 'todas' || s.slug === selectedSedeFilter)
            .map((s, i) => {
              const acc = monthlyBySede[s.slug] || { ventas: 0, gastos: 0, ganancia: 0 }
              return {
                name: s.name.length > 8 ? s.name.slice(0,7)+'…' : s.name,
                fullName: s.name,
                slug: s.slug,
                Ventas: acc.ventas,
                Gastos: acc.gastos,
                Ganancia: acc.ganancia,
                color: COLORS_SEDES[i % COLORS_SEDES.length],
              }
            }).filter(s => s.Ventas > 0 || s.Ganancia > 0)

          // Pie: participación de ventas mensual por sede
          const pieData = sedeBarData.map((s, i) => ({ name: s.fullName, value: s.Ventas, fill: s.color }))

          // Radar multidimensional mensual
          const maxV = Math.max(...sedeBarData.map(s => s.Ventas), 1)
          const maxG = Math.max(...sedeBarData.map(s => s.Gastos), 1)
          const maxGan = Math.max(...sedeBarData.map(s => s.Ganancia), 1)
          const radarData = [
            { axis: 'Ventas', ...Object.fromEntries(sedeBarData.map(s => [s.fullName, Math.round(s.Ventas/maxV*100)])) },
            { axis: 'Gastos', ...Object.fromEntries(sedeBarData.map(s => [s.fullName, Math.round(s.Gastos/maxG*100)])) },
            { axis: 'Ganancia', ...Object.fromEntries(sedeBarData.map(s => [s.fullName, Math.round(s.Ganancia/maxGan*100)])) },
            { axis: 'Eficiencia', ...Object.fromEntries(sedeBarData.map(s => [s.fullName, s.Ventas > 0 ? Math.round(s.Ganancia/s.Ventas*100) : 0])) },
            { axis: 'Costo%', ...Object.fromEntries(sedeBarData.map(s => [s.fullName, s.Ventas > 0 ? Math.round(s.Gastos/s.Ventas*100) : 0])) },
          ]

          // Datos para tendencia: solo los días con ventas > 0 (oculta domingos/feriados/futuros sin datos)
          const trendData = displayMonthlyData.filter(d => d.ventas > 0)

          // Mejor / peor día de ventas
          const daysWithSales = trendData.filter(d => d.ventas > 0)
          const bestDay = daysWithSales.length ? daysWithSales.reduce((a, b) => b.ventas > a.ventas ? b : a) : null
          const worstDay = daysWithSales.length ? daysWithSales.reduce((a, b) => b.ventas < a.ventas ? b : a) : null

          // Obtener nombre del día de la semana desde fecha (formato dd/MM)
          const getDayName = (fecha: string) => {
            try {
              const [dd, MM] = fecha.split('/').map(Number)
              const date = new Date(new Date().getFullYear(), MM - 1, dd)
              return date.toLocaleDateString('es-CL', { weekday: 'long' })
            } catch { return '' }
          }

          // Comparativa últimos 7 días vs 7 previos
          const last7 = trendData.slice(-7)
          const prev7 = trendData.slice(-14, -7)
          const sum7 = (arr: any[], key: string) => arr.reduce((s, d) => s + (d[key] || 0), 0)
          const calcTrend = (key: string) => {
            const a = sum7(last7, key), b = sum7(prev7, key)
            if (b <= 0) return { pct: 0, up: a > 0 }
            const pct = Math.round(((a - b) / b) * 100)
            return { pct, up: pct >= 0 }
          }
          const trendVentas = calcTrend('ventas')
          const trendGastos = calcTrend('gastos')
          const trendGanancia = calcTrend('ganancia')

          // Proyección fin de mes (basada en promedio diario actual)
          const _today = new Date()
          const diasActuales = trendData.length
          const diasEnMes = new Date(_today.getFullYear(), _today.getMonth() + 1, 0).getDate()
          const avgDiario = diasActuales > 0 ? mTotals.ventas / diasActuales : 0
          const proyeccionVentas = Math.round(avgDiario * diasEnMes)

          // Gastos fijos del mes completo (sueldos + externos) para sede seleccionada o todas
          const fixedTotalsFull = (selectedSedeFilter !== 'todas'
            ? [fixedMonthlyBySede[selectedSedeFilter]].filter(Boolean)
            : Object.values(fixedMonthlyBySede))
            .reduce((acc, f) => ({
              sueldos: acc.sueldos + (f?.sueldos || 0),
              externos: acc.externos + (f?.externos || 0),
              total: acc.total + (f?.total || 0),
            }), { sueldos: 0, externos: 0, total: 0 })

          // Separar gastos variables (operativos del día) vs fijos (prorrateados en mTotals.gastos)
          const proratioCal = diasEnMes > 0 ? diasActuales / diasEnMes : 0
          const gastosFijosYaContados = Math.round(fixedTotalsFull.total * proratioCal)
          const gastosVariablesActuales = Math.max(0, mTotals.gastos - gastosFijosYaContados)

          // Proyección de gastos variables a fin de mes (según ritmo actual)
          const avgGastoVariableDiario = diasActuales > 0 ? gastosVariablesActuales / diasActuales : 0
          const gastosVariablesProyectados = Math.round(avgGastoVariableDiario * diasEnMes)

          // Proyección total de gastos fin de mes = variables proyectados + fijos completos
          const proyeccionGastos = gastosVariablesProyectados + fixedTotalsFull.total

          // Proyección de ganancia fin de mes: ganancia bruta proyectada (ventas − costos) − gastos proyectados
          const gananciaBrutaActual = mTotals.ganancia + mTotals.gastos
          const avgGananciaBrutaDiaria = diasActuales > 0 ? gananciaBrutaActual / diasActuales : 0
          const proyeccionGananciaBruta = Math.round(avgGananciaBrutaDiaria * diasEnMes)
          const proyeccionGananciaFinal = proyeccionGananciaBruta - proyeccionGastos

          // Tooltips
          const TooltipCustom = ({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null
            const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0)
            return (
              <div className="relative overflow-hidden rounded-xl border border-white/70 bg-white/90 backdrop-blur-xl shadow-2xl shadow-slate-900/10 p-2.5 text-xs min-w-[140px]">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-slate-50/40" />
                <p className="relative font-black text-slate-800 mb-1.5 pb-1.5 border-b border-slate-100">{label}</p>
                <div className="relative space-y-1">
                  {payload.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm" style={{ background: p.color || p.fill || p.stroke, boxShadow: `0 0 6px ${p.color || p.fill || p.stroke}80` }} />
                        <span className="text-slate-500 truncate">{p.name}</span>
                      </div>
                      <span className="font-black text-slate-800 tabular-nums">{fmtK(Number(p.value) || 0)}</span>
                    </div>
                  ))}
                </div>
                {payload.length > 1 && total > 0 && (
                  <div className="relative mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Total</span>
                    <span className="font-black text-slate-700 tabular-nums">{fmtK(total)}</span>
                  </div>
                )}
              </div>
            )
          }

          const PieTooltipCustom = ({ active, payload }: any) => {
            if (!active || !payload?.length) return null
            const total = pieData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-xl p-3 text-xs">
                <p className="font-bold" style={{ color: payload[0].payload.fill }}>{payload[0].name}</p>
                <p className="text-slate-700 font-bold">{fmtK(payload[0].value)}</p>
                <p className="text-slate-400">{total > 0 ? Math.round(payload[0].value/total*100) : 0}% del total mensual</p>
              </div>
            )
          }

          // Resumen cards mensuales
          const now = new Date()
          const mesLabel = now.toLocaleString('es-CL', { month: 'long', year: 'numeric' })

          return (
            <div className="space-y-4">

              {/* Header mensual */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30 flex-shrink-0">
                    <BarChart2 size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-700 dark:text-white">Análisis Mensual</p>
                    <p className="text-[10px] text-slate-400 capitalize truncate">{mesLabel} · del 1 al {now.getDate()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 sm:flex-none overflow-x-auto scrollbar-none -mx-1 px-1">
                    <div className="inline-flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedSedeFilter('todas')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                          selectedSedeFilter === 'todas'
                            ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Todas
                      </button>
                      {SUCURSALES.map((suc) => (
                        <button
                          key={suc.slug}
                          onClick={() => setSelectedSedeFilter(suc.slug)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                            selectedSedeFilter === suc.slug
                              ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {suc.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => loadMonthlyData()} disabled={loadingMonthly} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 flex-shrink-0" title="Actualizar datos mensuales">
                    <RefreshCw size={12} className={`text-slate-500 ${loadingMonthly ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* KPI cards mensuales */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Ventas', value: mTotals.ventas, icon: <Wallet size={12} />, gradient: 'from-emerald-500 to-teal-500', bg: 'from-emerald-50 to-teal-50/40', border: 'border-emerald-200/70', text: 'text-emerald-700', ring: 'ring-emerald-200/40', stroke: '#10b981', key: 'ventas', trend: trendVentas, positive: true },
                  { label: 'Gastos', value: mTotals.gastos, icon: <TrendingDown size={12} />, gradient: 'from-rose-500 to-pink-500', bg: 'from-rose-50 to-pink-50/40', border: 'border-rose-200/70', text: 'text-rose-700', ring: 'ring-rose-200/40', stroke: '#f43f5e', key: 'gastos', trend: trendGastos, positive: false },
                  { label: 'Ganancia', value: mTotals.ganancia, icon: <TrendingUp size={12} />, gradient: 'from-indigo-500 to-violet-500', bg: 'from-indigo-50 to-violet-50/40', border: 'border-indigo-200/70', text: 'text-indigo-700', ring: 'ring-indigo-200/40', stroke: '#6366f1', key: 'ganancia', trend: trendGanancia, positive: true },
                ].map(card => {
                  // Para gastos, "bajó" es bueno, "subió" es malo
                  const isGood = card.positive ? card.trend.up : !card.trend.up
                  const trendColor = isGood ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-rose-600 bg-rose-50 border-rose-200'
                  const hasTrend = trendData.length > 1
                  return (
                    <div key={card.label} className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${card.bg} border ${card.border} p-2 sm:p-2.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ring-1 ${card.ring}`}>
                      <div className={`pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br ${card.gradient} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
                      <div className="relative flex items-center justify-between mb-0.5">
                        <p className={`text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider ${card.text}`}>{card.label}</p>
                        <div className={`flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br ${card.gradient} text-white shadow-sm`}>{card.icon}</div>
                      </div>
                      <p className="relative text-[13px] sm:text-sm font-black text-slate-800 dark:text-white tabular-nums">{fmtK(card.value)}</p>
                      <div className="relative flex items-center justify-between mt-1 gap-1">
                        {hasTrend && card.trend.pct !== 0 && (
                          <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-black px-1 py-0.5 rounded border ${trendColor}`}>
                            {card.trend.up ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                            {Math.abs(card.trend.pct)}%
                          </span>
                        )}
                        {trendData.length > 2 && (
                          <div className="flex-1 h-6 -my-0.5 min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={trendData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                  <linearGradient id={`spark_${card.key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={card.stroke} stopOpacity={0.4} />
                                    <stop offset="100%" stopColor={card.stroke} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey={card.key} stroke={card.stroke} strokeWidth={1.5} fill={`url(#spark_${card.key})`} dot={false} isAnimationActive={false} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Proyección */}
              {diasActuales > 0 && proyeccionVentas > 0 && (
                <div className="relative overflow-hidden rounded-xl border border-sky-200/60 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm">
                  <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-sky-300/20 blur-2xl" />
                  <div className="relative flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/30 flex-shrink-0">
                      <Sparkles size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-sky-900">Proyección fin de mes</p>
                      <p className="text-[9px] text-slate-500">A ritmo actual ({fmtK(Math.round(avgDiario))}/día · {diasActuales}/{diasEnMes} días)</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-sky-700 tabular-nums">{fmtK(proyeccionVentas)}</p>
                      <p className="text-[9px] text-slate-400">ventas estimadas</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Proyección fin de mes · Gastos */}
              {diasActuales > 0 && (proyeccionGastos > 0 || mTotals.gastos > 0) && (
                <div className="relative overflow-hidden rounded-xl border border-rose-200/60 bg-gradient-to-r from-rose-50 via-white to-pink-50 p-2.5 shadow-sm">
                  <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-rose-300/20 blur-2xl" />
                  <div className="relative flex items-center gap-2.5 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30 flex-shrink-0">
                      <TrendingDown size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-rose-900">Proyección fin de mes · Gastos</p>
                      <p className="text-[9px] text-slate-500">Variables proyectados + gastos fijos del mes completo</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-rose-700 tabular-nums">{fmtK(proyeccionGastos)}</p>
                      <p className="text-[9px] text-slate-400">gastos estimados</p>
                    </div>
                  </div>
                  <div className="relative grid grid-cols-2 gap-1.5">
                    <div className="rounded-lg border border-rose-200/50 bg-white/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">Gastos actuales</p>
                      <p className="text-[11px] font-black text-rose-800 tabular-nums">{fmtK(mTotals.gastos)}</p>
                      <p className="text-[8.5px] text-rose-500 mt-0.5">→ proy. {fmtK(proyeccionGastos)}</p>
                    </div>
                    <div className="rounded-lg border border-amber-300/70 bg-gradient-to-br from-amber-50 to-yellow-50 px-2 py-1.5 ring-1 ring-amber-200/60">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-amber-700">{fixedTotalsFull.total > 0 ? 'Fijos mes completo' : 'Proyección total'}</p>
                      <p className="text-[11px] font-black text-amber-800 tabular-nums">{fmtK(fixedTotalsFull.total > 0 ? fixedTotalsFull.total : proyeccionGastos)}</p>
                      <p className="text-[8.5px] text-amber-600 mt-0.5">{fixedTotalsFull.total > 0 ? `Sueldos ${fmtK(fixedTotalsFull.sueldos)} · Externos ${fmtK(fixedTotalsFull.externos)}` : 'Estimado al cierre de mes'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Proyección fin de mes · Ganancias */}
              {diasActuales > 0 && proyeccionVentas > 0 && (
                <div className={`relative overflow-hidden rounded-xl border ${proyeccionGananciaFinal >= 0 ? 'border-emerald-200/60' : 'border-rose-300/60'} bg-gradient-to-r ${proyeccionGananciaFinal >= 0 ? 'from-emerald-50 via-white to-teal-50' : 'from-rose-50 via-white to-pink-50'} p-2.5 shadow-sm`}>
                  <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full ${proyeccionGananciaFinal >= 0 ? 'bg-emerald-300/20' : 'bg-rose-300/20'} blur-2xl`} />
                  <div className="relative flex items-center gap-2.5 mb-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${proyeccionGananciaFinal >= 0 ? 'from-emerald-500 to-teal-500 shadow-emerald-500/30' : 'from-rose-500 to-pink-500 shadow-rose-500/30'} text-white shadow-md flex-shrink-0`}>
                      <TrendingUp size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-bold ${proyeccionGananciaFinal >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>Proyección fin de mes · Ganancias</p>
                      <p className="text-[9px] text-slate-500">Ganancia bruta proyectada − gastos proyectados</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-black tabular-nums ${proyeccionGananciaFinal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtK(proyeccionGananciaFinal)}</p>
                      <p className="text-[9px] text-slate-400">ganancia neta estimada</p>
                    </div>
                  </div>
                  <div className="relative grid grid-cols-2 gap-1.5">
                    <div className="rounded-lg border border-indigo-200/60 bg-white/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-indigo-600">Ganancia bruta proyectada</p>
                      <p className="text-[11px] font-black text-indigo-800 tabular-nums">{fmtK(proyeccionGananciaBruta)}</p>
                    </div>
                    <div className="rounded-lg border border-rose-200/60 bg-white/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">(−) Gastos proyectados</p>
                      <p className="text-[11px] font-black text-rose-800 tabular-nums">{fmtK(proyeccionGastos)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Chart 1: Tendencia diaria — Área 30 días */}
              <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-300/20 to-teal-300/10 blur-3xl" />
                <div className="relative flex items-start sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30 flex-shrink-0">
                      <Activity size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-700 dark:text-white truncate">Tendencia Diaria de Ventas</p>
                      <p className="text-[10px] text-slate-400 capitalize truncate">{new Date().toLocaleString('es-CL',{month:'long'})} · {selectedSedeFilter === 'todas' ? 'todas las sedes' : (SUCURSALES.find(s => s.slug === selectedSedeFilter)?.name || selectedSedeFilter)}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 font-bold border border-emerald-200/60 flex-shrink-0">
                    <TrendingUp size={10} /> Área
                  </span>
                </div>
                {(bestDay || worstDay) && (
                  <div className="relative grid grid-cols-2 gap-2 mb-2">
                    {bestDay && (
                      <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600">Mejor día</p>
                        <p className="text-[11px] font-black text-emerald-800 tabular-nums">{fmtK(bestDay.ventas)} <span className="text-[9px] font-bold text-emerald-600">· {bestDay.fecha} ({getDayName(bestDay.fecha)})</span></p>
                      </div>
                    )}
                    {worstDay && daysWithSales.length > 1 && (
                      <div className="rounded-lg border border-rose-200/60 bg-rose-50/70 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">Peor día</p>
                        <p className="text-[11px] font-black text-rose-800 tabular-nums">{fmtK(worstDay.ventas)} <span className="text-[9px] font-bold text-rose-600">· {worstDay.fecha} ({getDayName(worstDay.fecha)})</span></p>
                      </div>
                    )}
                  </div>
                )}
                <div className="relative h-[200px] sm:h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mGVentas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="mGGanancia" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="mGGastos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={20}
                        tickFormatter={(v: string) => String(v).split('/')[0]}
                      />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip content={<TooltipCustom />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                      <Area type="monotoneX" dataKey="ventas" name="Ventas" stroke="#10b981" strokeWidth={2.5} fill="url(#mGVentas)" dot={{ r: 2.5, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                      <Area type="monotoneX" dataKey="ganancia" name="Ganancia" stroke="#6366f1" strokeWidth={2} fill="url(#mGGanancia)" dot={{ r: 2, fill: '#6366f1', strokeWidth: 0 }} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                      <Area type="monotoneX" dataKey="gastos" name="Gastos" stroke="#f43f5e" strokeWidth={1.5} fill="url(#mGGastos)" dot={false} activeDot={{ r: 3, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                      {bestDay && <ReferenceDot x={bestDay.fecha} y={bestDay.ventas} r={6} fill="#10b981" stroke="#fff" strokeWidth={2.5} ifOverflow="visible" />}
                      {worstDay && daysWithSales.length > 1 && <ReferenceDot x={worstDay.fecha} y={worstDay.ventas} r={5} fill="#f43f5e" stroke="#fff" strokeWidth={2} ifOverflow="visible" />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Barras agrupadas — Acumulado mensual por sede */}
              {sedeBarData.length > 0 && (() => {
                const totalV = sedeBarData.reduce((s, d) => s + d.Ventas, 0)
                const totalGa = sedeBarData.reduce((s, d) => s + d.Ganancia, 0)
                const totalGs = sedeBarData.reduce((s, d) => s + d.Gastos, 0)
                const topSede = [...sedeBarData].sort((a, b) => b.Ventas - a.Ventas)[0]
                const topGanancia = [...sedeBarData].sort((a, b) => b.Ganancia - a.Ganancia)[0]
                const mostEfficient = [...sedeBarData].filter(s => s.Ventas > 0).sort((a, b) => (b.Ganancia/b.Ventas) - (a.Ganancia/a.Ventas))[0]
                const avgVenta = sedeBarData.length > 0 ? Math.round(totalV / sedeBarData.length) : 0
                const sedesRanked = [...sedeBarData].sort((a, b) => b.Ventas - a.Ventas)
                return (
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-300/20 to-violet-300/10 blur-3xl" />
                  <div className="relative flex items-start sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30 flex-shrink-0">
                        <BarChart3 size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 dark:text-white truncate">Acumulado por Sede</p>
                        <p className="text-[10px] text-slate-400 truncate">{sedeBarData.length} sede{sedeBarData.length !== 1 ? 's' : ''} activa{sedeBarData.length !== 1 ? 's' : ''} · prom. {fmtK(avgVenta)}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-100 to-violet-100 text-indigo-700 font-bold border border-indigo-200/60 flex-shrink-0">
                      <BarChart3 size={10} /> Barras
                    </span>
                  </div>

                  {/* Mini KPIs totales */}
                  <div className="relative grid grid-cols-3 gap-1.5 mb-3">
                    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600">Σ Ventas</p>
                      <p className="text-[11px] font-black text-emerald-800 tabular-nums">{fmtK(totalV)}</p>
                    </div>
                    <div className="rounded-lg border border-rose-200/60 bg-rose-50/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">Σ Gastos</p>
                      <p className="text-[11px] font-black text-rose-800 tabular-nums">{fmtK(totalGs)}</p>
                    </div>
                    <div className="rounded-lg border border-indigo-200/60 bg-indigo-50/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-indigo-600">Σ Ganancia</p>
                      <p className="text-[11px] font-black text-indigo-800 tabular-nums">{fmtK(totalGa)}</p>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={220} minHeight={200}>
                    <BarChart data={sedeBarData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barCategoryGap="22%">
                      <defs>
                        <linearGradient id="mBVentas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                        </linearGradient>
                        <linearGradient id="mBGastos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.55} />
                        </linearGradient>
                        <linearGradient id="mBGanancia" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<TooltipCustom />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                      <Bar dataKey="Ventas" fill="url(#mBVentas)" radius={[6,6,0,0]} />
                      <Bar dataKey="Gastos" fill="url(#mBGastos)" radius={[6,6,0,0]} />
                      <Bar dataKey="Ganancia" fill="url(#mBGanancia)" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Top 3 insights */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {topSede && (
                      <div className="rounded-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-teal-50/40 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">🏆 Top en ventas</p>
                        <p className="text-[11px] font-black text-emerald-800 truncate">{topSede.fullName}</p>
                        <p className="text-[9px] text-emerald-600 tabular-nums">{fmtK(topSede.Ventas)} · {totalV > 0 ? Math.round(topSede.Ventas/totalV*100) : 0}%</p>
                      </div>
                    )}
                    {topGanancia && (
                      <div className="rounded-lg border border-indigo-200/60 bg-gradient-to-br from-indigo-50 to-violet-50/40 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">💎 Top ganancia</p>
                        <p className="text-[11px] font-black text-indigo-800 truncate">{topGanancia.fullName}</p>
                        <p className="text-[9px] text-indigo-600 tabular-nums">{fmtK(topGanancia.Ganancia)}</p>
                      </div>
                    )}
                    {mostEfficient && (
                      <div className="rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-yellow-50/40 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">⚡ Más eficiente</p>
                        <p className="text-[11px] font-black text-amber-800 truncate">{mostEfficient.fullName}</p>
                        <p className="text-[9px] text-amber-600 tabular-nums">{mostEfficient.Ventas > 0 ? Math.round(mostEfficient.Ganancia/mostEfficient.Ventas*100) : 0}% margen</p>
                      </div>
                    )}
                  </div>

                  {/* Ranking table */}
                  {sedesRanked.length > 1 && (
                    <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Ranking de sedes</p>
                        <p className="text-[9px] text-slate-400">Ventas · Margen · Participación</p>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {sedesRanked.map((s, i) => {
                          const margen = s.Ventas > 0 ? Math.round(s.Ganancia/s.Ventas*100) : 0
                          const part = totalV > 0 ? Math.round(s.Ventas/totalV*100) : 0
                          const mColor = margen >= 30 ? 'text-emerald-600' : margen >= 15 ? 'text-amber-600' : 'text-rose-600'
                          return (
                            <div key={s.slug} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 text-[9px] font-black text-slate-500 flex-shrink-0">{i+1}</span>
                              <span className="w-1.5 h-4 rounded-full flex-shrink-0" style={{ background: s.color }} />
                              <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate flex-1">{s.fullName}</p>
                              <p className="text-[10px] font-black tabular-nums text-slate-700 dark:text-slate-200 w-16 text-right">{fmtK(s.Ventas)}</p>
                              <p className={`text-[10px] font-black tabular-nums w-10 text-right ${mColor}`}>{margen}%</p>
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                                <div className="h-full rounded-full transition-all" style={{ width: `${part}%`, background: s.color }} />
                              </div>
                              <p className="text-[9px] font-bold text-slate-500 w-8 text-right tabular-nums">{part}%</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                )
              })()}

              {/* Chart 3+4: Pie + Radial gauge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Pie: participación de ventas mensual */}
                {pieData.length > 0 && (() => {
                  const pieTotal = pieData.reduce((s, d) => s + d.value, 0)
                  const pieSorted = [...pieData].sort((a, b) => b.value - a.value)
                  const leader = pieSorted[0]
                  const last = pieSorted[pieSorted.length - 1]
                  const leaderPct = pieTotal > 0 ? Math.round((leader.value / pieTotal) * 100) : 0
                  const lastPct = pieTotal > 0 ? Math.round((last.value / pieTotal) * 100) : 0
                  const concentration = leaderPct
                  const balanceLabel = concentration >= 60 ? 'Alta concentración' : concentration >= 40 ? 'Concentración media' : 'Distribución balanceada'
                  const balanceColor = concentration >= 60 ? 'text-rose-600 bg-rose-50 border-rose-200' : concentration >= 40 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  const gap = leaderPct - lastPct
                  return (
                  <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-pink-300/20 to-rose-300/10 blur-3xl" />
                    <div className="relative flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/30 flex-shrink-0">
                          <PieIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-700 dark:text-white">Distribución Ventas</p>
                          <p className="text-[10px] text-slate-400 truncate">{pieData.length} sede{pieData.length !== 1 ? 's' : ''} · {fmtK(pieTotal)} total</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${balanceColor} flex-shrink-0`}>
                        {balanceLabel}
                      </span>
                    </div>

                    <div className="relative py-4">
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                          <defs>
                            {pieData.map((entry, i) => (
                              <linearGradient key={`pg_${i}`} id={`mPiePP_${i}`} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor={entry.fill} stopOpacity={1} />
                                <stop offset="100%" stopColor={entry.fill} stopOpacity={0.6} />
                              </linearGradient>
                            ))}
                          </defs>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={88}
                            paddingAngle={3} dataKey="value" stroke="#fff" strokeWidth={2}
                            label={({ percent }: any) => percent >= 0.05 ? `${Math.round(percent*100)}%` : ''} labelLine={false}>
                            {pieData.map((_, i) => <Cell key={i} fill={`url(#mPiePP_${i})`} />)}
                          </Pie>
                          <Tooltip content={<PieTooltipCustom />} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Centro del donut */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400">Total</p>
                        <p className="text-sm font-black text-slate-700 dark:text-white tabular-nums">{fmtK(pieTotal)}</p>
                      </div>
                    </div>

                    {/* Detalle por sede */}
                    <div className="mt-3 space-y-1">
                      {pieSorted.map((s, i) => {
                        const pct = pieTotal > 0 ? (s.value / pieTotal) * 100 : 0
                        return (
                          <div key={s.name} className="flex items-center gap-2">
                            <span className="flex h-4 w-4 items-center justify-center rounded text-[8.5px] font-black text-white flex-shrink-0" style={{ background: s.fill }}>{i+1}</span>
                            <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate flex-1">{s.name}</p>
                            <p className="text-[10px] font-black tabular-nums text-slate-700 dark:text-slate-200 w-14 text-right">{fmtK(s.value)}</p>
                            <div className="w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.fill }} />
                            </div>
                            <p className="text-[9px] font-black tabular-nums text-slate-500 w-9 text-right">{Math.round(pct)}%</p>
                          </div>
                        )
                      })}
                    </div>

                    {/* Insights */}
                    {pieSorted.length > 1 && (
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-2 py-1.5">
                          <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600">Líder</p>
                          <p className="text-[10px] font-black text-emerald-800 truncate">{leader.name}</p>
                          <p className="text-[9px] text-emerald-600">{leaderPct}% · {fmtK(leader.value)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200/60 bg-slate-50/70 px-2 py-1.5">
                          <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-600">Brecha</p>
                          <p className="text-[10px] font-black text-slate-800 tabular-nums">{gap} pts</p>
                          <p className="text-[9px] text-slate-500">líder vs último</p>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })()}

                {/* Radial gauge: margen mensual */}
                {(() => {
                  const gastosPct = mTotals.ventas > 0 ? Math.round((mTotals.gastos / mTotals.ventas) * 100) : 0
                  const targetMargen = 30
                  const deltaTarget = margen - targetMargen
                  const costPerSale = mTotals.ventas > 0 ? (mTotals.gastos / mTotals.ventas) : 0
                  const gananciaPorPeso = mTotals.ventas > 0 ? (mTotals.ganancia / mTotals.ventas) : 0
                  return (
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: `${margenColor}22` }} />
                  <div className="relative flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md flex-shrink-0" style={{ background: `linear-gradient(135deg, ${margenColor}, ${margenColor}dd)`, boxShadow: `0 4px 12px ${margenColor}40` }}>
                        <Target size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 dark:text-white">Margen Neto</p>
                        <p className="text-[10px] text-slate-400 truncate">Meta {targetMargen}% · {deltaTarget >= 0 ? '+' : ''}{deltaTarget} pts</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0" style={{ background: `${margenColor}15`, color: margenColor, borderColor: `${margenColor}40` }}>
                      {margen >= 30 ? '🟢' : margen >= 15 ? '🟡' : '🔴'} {margen >= 30 ? 'Excelente' : margen >= 15 ? 'Normal' : 'Bajo'}
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center relative">
                    <ResponsiveContainer width="100%" height={150}>
                      <RadialBarChart cx="50%" cy="75%" innerRadius="58%" outerRadius="88%"
                        startAngle={180} endAngle={0}
                        data={[{ value: 100, fill: '#f1f5f9' }, { value: Math.max(0, Math.min(100, margen)), fill: margenColor }]}>
                        <RadialBar background dataKey="value" cornerRadius={8} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="-mt-10 text-center">
                      <p className="text-4xl font-black tabular-nums" style={{ color: margenColor, textShadow: `0 2px 8px ${margenColor}30` }}>{margen}<span className="text-2xl">%</span></p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Meta: {targetMargen}%</p>
                    </div>
                  </div>

                  {/* Barra comparativa ventas/gastos/ganancia */}
                  <div className="mt-2 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Composición por $100 de venta</p>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                      <div className="h-full transition-all flex items-center justify-center" style={{ width: `${Math.min(100, gastosPct)}%`, background: 'linear-gradient(to right, #f43f5e, #fb7185)' }} title={`Gastos ${gastosPct}%`} />
                      <div className="h-full transition-all flex items-center justify-center" style={{ width: `${Math.max(0, 100 - gastosPct)}%`, background: `linear-gradient(to right, ${margenColor}, ${margenColor}cc)` }} title={`Margen ${margen}%`} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[8.5px] font-bold text-rose-600">Gastos {gastosPct}%</span>
                      <span className="text-[8.5px] font-bold" style={{ color: margenColor }}>Margen {Math.max(0, 100 - gastosPct)}%</span>
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600">Ganancia</p>
                      <p className="text-[11px] font-black text-emerald-800 tabular-nums">{fmtK(mTotals.ganancia)}</p>
                      <p className="text-[8.5px] text-emerald-600">${Math.round(gananciaPorPeso * 100)} / $100</p>
                    </div>
                    <div className="rounded-lg border border-rose-200/60 bg-rose-50/70 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">Costo</p>
                      <p className="text-[11px] font-black text-rose-800 tabular-nums">{fmtK(mTotals.gastos)}</p>
                      <p className="text-[8.5px] text-rose-600">${Math.round(costPerSale * 100)} / $100</p>
                    </div>
                  </div>
                </div>
                )
                })()}
              </div>

              {/* Chart 5: Barras diarias — comparación ventas vs ganancia día a día */}
              {(() => {
                const daysCount = trendData.length
                const avgVentas = daysCount > 0 ? Math.round(trendData.reduce((s: number, d: any) => s + (d.ventas || 0), 0) / daysCount) : 0
                const avgGanancia = daysCount > 0 ? Math.round(trendData.reduce((s: number, d: any) => s + (d.ganancia || 0), 0) / daysCount) : 0
                const avgGastos = daysCount > 0 ? Math.round(trendData.reduce((s: number, d: any) => s + (d.gastos || 0), 0) / daysCount) : 0
                const profitableDays = trendData.filter((d: any) => (d.ganancia || 0) > 0).length
                const lossDays = trendData.filter((d: any) => (d.ganancia || 0) < 0).length
                const profitablePct = daysCount > 0 ? Math.round((profitableDays / daysCount) * 100) : 0
                // Últimos 7 días tendencia
                const last7 = trendData.slice(-7)
                const prev7 = trendData.slice(-14, -7)
                const last7Avg = last7.length > 0 ? last7.reduce((s: number, d: any) => s + (d.ventas || 0), 0) / last7.length : 0
                const prev7Avg = prev7.length > 0 ? prev7.reduce((s: number, d: any) => s + (d.ventas || 0), 0) / prev7.length : 0
                const weekDelta = prev7Avg > 0 ? Math.round(((last7Avg - prev7Avg) / prev7Avg) * 100) : 0
                const trendUp = weekDelta >= 0
                return (
              <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-amber-300/20 to-orange-300/10 blur-3xl" />
                <div className="relative flex items-start sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30 flex-shrink-0">
                      <Calendar size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-700 dark:text-white truncate">Ventas Diarias</p>
                      <p className="text-[10px] text-slate-400 truncate">{daysCount} días · prom. {fmtK(avgVentas)}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0 ${trendUp ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                    {trendUp ? '↗' : '↘'} {trendUp ? '+' : ''}{weekDelta}% sem
                  </span>
                </div>

                {/* Mini KPIs */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-2 py-1.5">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600">Prom./día</p>
                    <p className="text-[10.5px] font-black text-emerald-800 tabular-nums">{fmtK(avgVentas)}</p>
                  </div>
                  <div className="rounded-lg border border-indigo-200/60 bg-indigo-50/70 px-2 py-1.5">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600">Ganancia</p>
                    <p className="text-[10.5px] font-black text-indigo-800 tabular-nums">{fmtK(avgGanancia)}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200/60 bg-rose-50/70 px-2 py-1.5">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-rose-600">Gasto</p>
                    <p className="text-[10.5px] font-black text-rose-800 tabular-nums">{fmtK(avgGastos)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200/60 bg-amber-50/70 px-2 py-1.5">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-amber-600">Rentable</p>
                    <p className="text-[10.5px] font-black text-amber-800 tabular-nums">{profitableDays}/{daysCount}</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={220} minHeight={200}>
                  <BarChart data={trendData} margin={{ top: 4, right: 4, left: -14, bottom: 0 }} barCategoryGap="15%">
                    <defs>
                      <linearGradient id="mDVentas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.45} />
                      </linearGradient>
                      <linearGradient id="mDGanancia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.45} />
                      </linearGradient>
                      <linearGradient id="mDGastos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.floor(trendData.length / 6))} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<TooltipCustom />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    <ReferenceLine y={avgVentas} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `prom ${fmtK(avgVentas)}`, position: 'insideTopRight', fontSize: 9, fill: '#10b981', fontWeight: 700 }} />
                    <Bar dataKey="ventas" name="Ventas" fill="url(#mDVentas)" radius={[4,4,0,0]} />
                    <Bar dataKey="ganancia" name="Ganancia" fill="url(#mDGanancia)" radius={[4,4,0,0]} />
                    <Bar dataKey="gastos" name="Gastos" fill="url(#mDGastos)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Insights del período */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  <div className="rounded-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-teal-50/40 px-2 py-1.5">
                    <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600">Días rentables</p>
                    <p className="text-[11px] font-black text-emerald-800 tabular-nums">{profitableDays} <span className="text-[9px] font-bold text-emerald-600">({profitablePct}%)</span></p>
                  </div>
                  <div className="rounded-lg border border-rose-200/60 bg-gradient-to-br from-rose-50 to-pink-50/40 px-2 py-1.5">
                    <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">Días con pérdida</p>
                    <p className="text-[11px] font-black text-rose-800 tabular-nums">{lossDays}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200/60 bg-gradient-to-br from-slate-50 to-slate-100/40 px-2 py-1.5 col-span-2 sm:col-span-1">
                    <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-600">Tendencia 7d vs prev</p>
                    <p className={`text-[11px] font-black tabular-nums ${trendUp ? 'text-emerald-700' : 'text-rose-700'}`}>{trendUp ? '+' : ''}{weekDelta}%</p>
                  </div>
                </div>
              </div>
                )
              })()}

              {/* Chart 6: Radar multidimensional mensual */}
              {sedeBarData.length >= 2 && (() => {
                // Líder por cada eje
                const axisLeaders = radarData.map(row => {
                  const entries = sedeBarData.map(s => ({ sede: s.fullName, color: s.color, value: Number(row[s.fullName as keyof typeof row] || 0) }))
                  const inverted = row.axis === 'Costo%' || row.axis === 'Gastos'
                  const sorted = [...entries].sort((a, b) => inverted ? a.value - b.value : b.value - a.value)
                  return { axis: row.axis, leader: sorted[0], inverted }
                })
                // Score total por sede: promedio de ejes positivos - promedio de negativos
                const scoreBySede = sedeBarData.map(s => {
                  const ventasN = Number(radarData[0][s.fullName as keyof typeof radarData[0]] || 0)
                  const gastosN = Number(radarData[1][s.fullName as keyof typeof radarData[1]] || 0)
                  const gananciaN = Number(radarData[2][s.fullName as keyof typeof radarData[2]] || 0)
                  const eficN = Number(radarData[3][s.fullName as keyof typeof radarData[3]] || 0)
                  const costoN = Number(radarData[4][s.fullName as keyof typeof radarData[4]] || 0)
                  // score = ventas + ganancia + eficiencia - (gastos + costo%) promediado
                  const score = Math.round((ventasN + gananciaN + eficN - gastosN - costoN) / 3)
                  return { sede: s.fullName, color: s.color, score }
                }).sort((a, b) => b.score - a.score)
                const topOverall = scoreBySede[0]
                return (
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-violet-300/20 to-purple-300/10 blur-3xl" />
                  <div className="relative flex items-start sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/30 flex-shrink-0">
                        <RadarIcon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 dark:text-white truncate">Radar Multidimensional</p>
                        <p className="text-[10px] text-slate-400 truncate">5 dimensiones · {sedeBarData.length} sedes</p>
                      </div>
                    </div>
                    {topOverall && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0" style={{ background: `${topOverall.color}15`, color: topOverall.color, borderColor: `${topOverall.color}40` }}>
                        🏆 {topOverall.sede}
                      </span>
                    )}
                  </div>

                  <ResponsiveContainer width="100%" height={260} minHeight={240}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#64748b' }} />
                      {sedeBarData.map((s) => (
                        <Radar key={s.slug} name={s.fullName} dataKey={s.fullName}
                          stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
                      ))}
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Tooltip content={({ active, payload, label }: any) => active && payload?.length ? (
                        <div className="bg-white/95 border border-slate-200 rounded-xl shadow-xl p-3 text-xs">
                          <p className="font-bold text-slate-700 mb-1">{label}</p>
                          {payload.map((p: any, i: number) => (
                            <div key={i} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.stroke }} /><span className="text-slate-500">{p.name}:</span><span className="font-bold">{p.value}%</span></div>
                          ))}
                        </div>
                      ) : null} />
                    </RadarChart>
                  </ResponsiveContainer>

                  {/* Leyenda ejes */}
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
                    <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">Qué mide cada eje</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-0.5 text-[9px] text-slate-600">
                      <span><b>Ventas:</b> vol. relativo</span>
                      <span><b>Gastos:</b> menor = mejor</span>
                      <span><b>Ganancia:</b> utilidad total</span>
                      <span><b>Eficiencia:</b> margen %</span>
                      <span><b>Costo%:</b> menor = mejor</span>
                    </div>
                  </div>

                  {/* Líder por eje */}
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {axisLeaders.map((a) => (
                      <div key={a.axis} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                        <span className="w-1.5 h-5 rounded-full flex-shrink-0" style={{ background: a.leader.color }} />
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 w-16">{a.axis}</p>
                        <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate flex-1">{a.leader.sede}</p>
                        <p className="text-[10px] font-black tabular-nums" style={{ color: a.leader.color }}>{a.leader.value}{a.axis === 'Eficiencia' || a.axis === 'Costo%' ? '%' : ''}</p>
                        {a.inverted && <span className="text-[8px] text-slate-400">↓</span>}
                      </div>
                    ))}
                  </div>

                  {/* Ranking global de score */}
                  <div className="mt-2 rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/60 to-purple-50/30 px-2.5 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-violet-600 mb-1">Score global (ventas + ganancia + eficiencia − costos)</p>
                    <div className="space-y-1">
                      {scoreBySede.map((s, i) => (
                        <div key={s.sede} className="flex items-center gap-2">
                          <span className="flex h-4 w-4 items-center justify-center rounded text-[8.5px] font-black text-white flex-shrink-0" style={{ background: s.color }}>{i+1}</span>
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate flex-1">{s.sede}</p>
                          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, Math.min(100, s.score))}%`, background: s.color }} />
                          </div>
                          <p className="text-[10px] font-black tabular-nums w-8 text-right" style={{ color: s.color }}>{s.score}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                )
              })()}

              {/* Chart 7: Ranking de rentabilidad mensual */}
              {sedeBarData.length > 0 && (() => {
                const sortedByGan = [...sedeBarData].sort((a, b) => b.Ganancia - a.Ganancia)
                const totalGananciaRk = sedeBarData.reduce((s, d) => s + d.Ganancia, 0)
                const totalVentasRk = sedeBarData.reduce((s, d) => s + d.Ventas, 0)
                const maxGan = Math.max(...sedeBarData.map(x => x.Ganancia), 1)
                const leaderRk = sortedByGan[0]
                const lastRk = sortedByGan[sortedByGan.length - 1]
                const avgMargen = totalVentasRk > 0 ? Math.round((totalGananciaRk / totalVentasRk) * 100) : 0
                const gapRk = leaderRk && lastRk ? leaderRk.Ganancia - lastRk.Ganancia : 0
                const leaderPctRk = totalGananciaRk > 0 ? Math.round((leaderRk.Ganancia / totalGananciaRk) * 100) : 0
                // Mejor margen (eficiencia)
                const bestMargin = [...sedeBarData].filter(s => s.Ventas > 0).sort((a, b) => (b.Ganancia/b.Ventas) - (a.Ganancia/a.Ventas))[0]
                return (
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-yellow-300/20 to-amber-300/10 blur-3xl" />
                  <div className="relative flex items-start sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-amber-500 text-white shadow-md shadow-yellow-500/30 flex-shrink-0">
                        <Trophy size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 dark:text-white truncate">Ranking de Rentabilidad</p>
                        <p className="text-[10px] text-slate-400 truncate">{sedeBarData.length} sedes · Ganancia 30 días</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-700 font-bold border border-amber-200/60 flex-shrink-0">
                      margen prom {avgMargen}%
                    </span>
                  </div>

                  {/* KPIs resumen */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-2 py-1.5">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600">Σ Ganancia</p>
                      <p className="text-[11px] font-black text-emerald-800 tabular-nums">{fmtK(totalGananciaRk)}</p>
                    </div>
                    <div className="rounded-lg border border-indigo-200/60 bg-indigo-50/70 px-2 py-1.5">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600">Líder aporta</p>
                      <p className="text-[11px] font-black text-indigo-800 tabular-nums">{leaderPctRk}%</p>
                    </div>
                    <div className="rounded-lg border border-rose-200/60 bg-rose-50/70 px-2 py-1.5">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-rose-600">Brecha 1º-último</p>
                      <p className="text-[11px] font-black text-rose-800 tabular-nums">{fmtK(gapRk)}</p>
                    </div>
                  </div>

                  <div className="relative space-y-3">
                    {sortedByGan.map((s, i) => {
                      const pct = Math.max(2, Math.round((s.Ganancia / maxGan) * 100))
                      const rankColor = i === 0 ? '#10b981' : i === 1 ? '#6366f1' : i === 2 ? '#f59e0b' : '#94a3b8'
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                      const margen = s.Ventas > 0 ? Math.round(s.Ganancia/s.Ventas*100) : 0
                      const partGan = totalGananciaRk > 0 ? Math.round((s.Ganancia/totalGananciaRk)*100) : 0
                      const mColor = margen >= 30 ? 'text-emerald-600' : margen >= 15 ? 'text-amber-600' : 'text-rose-600'
                      return (
                        <div key={s.slug} className="group/row rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent p-2.5 transition-all hover:border-slate-200 hover:shadow-sm">
                          <div className="flex justify-between text-[10px] mb-1.5">
                            <span className="font-bold text-slate-700 dark:text-white flex items-center gap-1.5 min-w-0">
                              {medal ? (
                                <span className="text-sm flex-shrink-0" style={{ filter: `drop-shadow(0 1px 2px ${rankColor}40)` }}>{medal}</span>
                              ) : (
                                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${rankColor}, ${rankColor}cc)` }}>#{i+1}</span>
                              )}
                              <span className="truncate">{s.fullName}</span>
                            </span>
                            <span className="font-black text-slate-800 dark:text-white tabular-nums flex-shrink-0">{fmtK(s.Ganancia)}</span>
                          </div>
                          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shadow-inner">
                            <div className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${rankColor}, ${rankColor}bb)`, boxShadow: `0 0 8px ${rankColor}60` }}>
                              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)', backgroundSize: '200% 100%', animation: 'td_shimmer 2s ease-in-out infinite' }} />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-slate-500 mt-1.5">
                            <span className="inline-flex items-center gap-1"><Wallet size={9} /> {fmtK(s.Ventas)} ventas</span>
                            <span className="inline-flex items-center gap-1"><TrendingDown size={9} className="text-rose-500" /> {fmtK(s.Gastos)} gasto</span>
                            <span className={`inline-flex items-center gap-1 font-bold ${mColor}`}><Target size={9} /> {margen}% margen</span>
                            <span className="inline-flex items-center gap-1 ml-auto font-bold text-slate-600">{partGan}% del total</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer insights */}
                  {bestMargin && sedeBarData.length > 1 && (
                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-yellow-50/40 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-amber-600">⚡ Mayor margen %</p>
                        <p className="text-[10px] font-black text-amber-800 truncate">{bestMargin.fullName}</p>
                        <p className="text-[9px] text-amber-600 tabular-nums">{bestMargin.Ventas > 0 ? Math.round(bestMargin.Ganancia/bestMargin.Ventas*100) : 0}% · {fmtK(bestMargin.Ganancia)}</p>
                      </div>
                      <div className="rounded-lg border border-rose-200/60 bg-gradient-to-br from-rose-50 to-pink-50/40 px-2 py-1.5">
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-rose-600">⚠ Menor ganancia</p>
                        <p className="text-[10px] font-black text-rose-800 truncate">{lastRk.fullName}</p>
                        <p className="text-[9px] text-rose-600 tabular-nums">{fmtK(lastRk.Ganancia)} · {lastRk.Ventas > 0 ? Math.round(lastRk.Ganancia/lastRk.Ventas*100) : 0}% margen</p>
                      </div>
                    </div>
                  )}
                </div>
                )
              })()}

            </div>
          )
        })()}
        {/* ═══════════════ END CHARTS ═══════════════ */}

        {/* Footer */}
        {lastUpdate && (
          <div className="text-center py-2 text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Clock size={10} /> {lastUpdate.toLocaleTimeString('es-CL')}
          </div>
        )}
      </>}
      </div>

      {/* Onboarding animation keyframes */}
      <style>{`
        @keyframes welcomeDrift { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-12px) translateX(6px)} }
        @keyframes welcomePulse { 0%,100%{opacity:.45;transform:scale(1)} 50%{opacity:.9;transform:scale(1.15)} }
        @keyframes textShine { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
      `}</style>

      {/* Onboarding inmersivo (primer ingreso demo) */}
      {onboardingOpen && (
        <div className="fixed inset-0 z-[80] overflow-hidden">
          <div className="absolute inset-0 bg-white/55 backdrop-blur-2xl" />
          <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-cyan-300/45 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-sky-300/45 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-200/35 blur-3xl" />

          <div className="relative h-full w-full flex items-center justify-center p-4 sm:p-8">
            <form onSubmit={submitOnboarding} className="w-full max-w-4xl grid gap-8 md:grid-cols-[1.15fr_1fr] items-center">
              <div className="relative text-center md:text-left px-2 sm:px-4">
                <div className="pointer-events-none absolute -inset-6">
                  {[...Array(16)].map((_, i) => (
                    <span
                      key={`welcome_particle_${i}`}
                      className="absolute rounded-full"
                      style={{
                        left: `${5 + (i * 17) % 90}%`,
                        top: `${8 + (i * 13) % 82}%`,
                        width: `${3 + (i % 3) * 1.5}px`,
                        height: `${3 + (i % 3) * 1.5}px`,
                        background: i % 2 ? 'rgba(56,189,248,0.55)' : 'rgba(99,102,241,0.45)',
                        boxShadow: '0 0 14px rgba(125,211,252,0.65)',
                        animation: `welcomeDrift ${3 + (i % 5) * 0.7}s ease-in-out ${(i * 0.22) % 2}s infinite alternate, welcomePulse ${1.6 + (i % 4) * 0.35}s ease-in-out ${(i * 0.18) % 1.5}s infinite`
                      }}
                    />
                  ))}
                </div>
                <div className="mx-auto md:mx-0 relative h-44 w-44 rounded-full border border-white/70 bg-white/40 shadow-[0_0_80px_rgba(125,211,252,0.75)] flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.98), rgba(186,230,253,0.55) 42%, rgba(14,165,233,0.22) 100%)' }} />
                  <img src={COMPANY_LOGO_URL || DEFAULT_AVATAR} alt="Importadora Carlitos" className="relative h-32 w-32 rounded-full object-cover border-2 border-white shadow-xl" />
                </div>

                <p className="mt-7 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/55 border border-white/70 text-[11px] font-black tracking-[0.25em] text-sky-700/90 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping" />
                  WELCOME EXPERIENCE
                </p>
                <h2
                  className="mt-3 text-3xl sm:text-5xl font-black leading-[1.05] text-transparent bg-clip-text"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${runtimeBranding.titleColor || '#3b82f6'} 0%, ${runtimeBranding.titleColor ? runtimeBranding.titleColor + 'cc' : '#3b82f6cc'} 30%, ${runtimeBranding.titleColor || '#3b82f6'} 55%, ${runtimeBranding.titleColor ? runtimeBranding.titleColor + '99' : '#3b82f699'} 75%, ${runtimeBranding.titleColor || '#3b82f6'} 100%)`,
                    backgroundSize: '200% 100%',
                    animation: 'textShine 6s linear infinite'
                  }}
                >
                  BIENVENIDO A Importadora Carlitos
                </h2>
                <p className="mt-2 text-base sm:text-xl font-semibold text-sky-800 tracking-wide">BIENVENIDO A LA DEMO</p>
                <p className="mt-3 text-sm sm:text-[15px] text-slate-700/95 max-w-md mx-auto md:mx-0 leading-relaxed">Para una experiencia inmersiva y personalizada, completa tus datos y te preparo el dashboard a tu medida.</p>
              </div>

              <div className="px-2 sm:px-4 md:border-l md:border-white/60 md:pl-8">
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-[11px] font-black tracking-[0.16em] text-slate-700">NOMBRE DE LA EMPRESA</span>
                    <input
                      value={onboardingCompany}
                      onChange={(e) => setOnboardingCompany(e.target.value)}
                      placeholder="Ej: Comercial Andina"
                      className="mt-1.5 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-medium text-slate-800 shadow-[0_10px_30px_rgba(125,211,252,0.25)] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      autoFocus
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-black tracking-[0.16em] text-slate-700">NOMBRE DEL USUARIO</span>
                    <input
                      value={onboardingUser}
                      onChange={(e) => setOnboardingUser(e.target.value)}
                      placeholder="Ej: Carla"
                      className="mt-1.5 w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-medium text-slate-800 shadow-[0_10px_30px_rgba(125,211,252,0.25)] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      required
                    />
                  </label>
                </div>

                <button type="submit" className="mt-6 w-full rounded-2xl bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600 text-white font-black py-3 shadow-lg shadow-sky-400/30 hover:from-sky-600 hover:to-blue-700 transition-all hover:scale-[1.01] active:scale-[0.99]">
                  Entrar a la demo
                </button>

                <p className="mt-3 text-[11px] text-slate-600 text-center">Tus datos se guardan en este navegador para no volver a pedirlos.</p>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
