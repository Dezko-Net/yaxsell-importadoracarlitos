'use client'

import React, { useEffect, useState, useMemo, useRef } from 'react'
import NextLink from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import type { SedeSlug } from '@/types'
// [APPWRITE] Ventas de hoy reales
import { fetchCuadresERP } from '@/lib/cuadresErpService'
import type { CuadreERP } from '@/lib/cuadresErpService'

// 🔒 Blindaje global a nivel de módulo: caché de totales de ventas/efectivo de hoy
// Evita miles de lecturas redundantes en Firestore entre re-renders y navegaciones
const globalVentasHoyCache = {
  ts: 0,
  total: 0,
  efectivo: 0,
  dateStr: '',
}
// El dashboard principal publica cifras nuevas desde su listener en vivo.
// En las demás secciones, el respaldo del encabezado puede quedar en caché 1h.
const VENTAS_HOY_TTL = 60 * 60 * 1000 // 1 hora

// ============================================================================
// SHIMS DE MIGRACIÓN (mismos que erp-dashboard/page.tsx): reemplazan
// Firebase / react-router-dom / auth / runtimeConfig del original Asistora.
// ============================================================================
// Mapa de rutas del ERP original (Asistora) → rutas reales de Yaxsel.
// Lo no mapeado cae al dashboard para evitar 404 (features aún sin equivalente).
function mapRoute(to?: string): string {
  if (!to) return '/erp-dashboard'
  const path = to.split('?')[0]
  const MAP: Record<string, string> = {
    '/': '/erp-dashboard',
    '/sucursales': '/erp-dashboard/sucursales',
    '/alertas': '/erp-dashboard/alertas',
    '/ventas-tiempo-real': '/erp-dashboard/ventas-tiempo-real',
    '/_admin': '/cuadres',                 // Ver Cortes / Cuadres
    '/admin': '/cuadres',                  // Corregir Corte
    '/pos-admin': '/pos-admin',
    // Resuelve el destino según la cuenta: POS-admin para niveles autorizados,
    // terminal POS para nivel bajo y perfiles de vendedor.
    '/pos': '/pos-acceso',
    '/admin-supreme': '/admin-supreme',
    '/dashboard-login': '/admin/login',
    '/inventario': '/erp-dashboard/base-datos',
    '/base-datos': '/erp-dashboard/base-datos',
    '/control-datos': '/erp-dashboard/base-datos',
    '/rastreador-ilimitados': '/erp-dashboard/rastreador-ilimitados',
    '/historial-stock': '/erp-dashboard/historial-stock',
    '/cajeras': '/cuadres/nuevo',                        // Realizar Corte → nuevo cuadre
    '/planilla-unificada': '/erp-dashboard/planilla-unificada',  // Trabajadores → Planilla Unificada
    '/informe-general-trabajadores': '/erp-dashboard/equipo',
    '/analisis-cajeras': '/erp-dashboard/equipo',
    '/gastos': '/erp-dashboard/gastos',
    '/gastos-externos': '/erp-dashboard/gastos-externos',
    '/informe-mensual': '/erp-dashboard/informe-mensual',
    '/erp-dashboard/informe-mensual': '/erp-dashboard/informe-mensual',
    '/erp-dashboard/ganancias': '/erp-dashboard/ganancias',
    '/erp-dashboard/contador-ia': '/erp-dashboard/contador-ia',
    '/revision-costos': '/erp-dashboard/revision-costos',
    '/revision-precios': '/erp-dashboard/revision-precios',
    '/erp-dashboard/revision-costos': '/erp-dashboard/revision-costos',
    '/erp-dashboard/revision-precios': '/erp-dashboard/revision-precios',
  }
  if (MAP[path]) return MAP[path]
  if (path.startsWith('/top-products')) return '/cuadres'
  if (path === '/ganancias' || path.startsWith('/ganancias')) return '/erp-dashboard/ganancias'
  // IA (CONTADOR IA / Cerebro IA / ASIS) → módulo Yaxbot IA de Yaxsel
  if (path.startsWith('/whatsapp')) return '/admin/ia/whatsapp'
  if (/^\/(chat-ia|cerebro-ia|ia-consultor|asis-monitor|telegram)/.test(path)) return '/admin/ia'
  if (/^\/(alameda|copiapo|la-florida)$/.test(path)) return '/cuadres/nuevo'  // "hacer corte" de una sede → nuevo cuadre
  return '/erp-dashboard'
}
const Link = ({ to, children, ...rest }: any) => <NextLink href={mapRoute(to)} {...rest}>{children}</NextLink>
function useNavigate() {
  const r = useRouter()
  return React.useCallback((path: string, opts?: { replace?: boolean }) => {
    const dest = mapRoute(path)
    try { opts?.replace ? r.replace(dest) : r.push(dest) } catch {}
  }, [r])
}
function useLocation() { return { pathname: usePathname() || '/' } }

import { db, auth } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore'
import { fetchAllFirebaseErpProducts } from '@/lib/firebaseErpService'

// useAuth → auth real de Firebase
import { useAuth } from '@/hooks/useAuth'
import { isAdminEmail } from '@/lib/admin-access'
import { useServiceModules } from '@/hooks/useServiceModules'
import { getErpUserByEmail, getRedirectForModules, type AppModule } from '@/lib/erpUserService'
import { isSellerCargo } from '@/lib/posSellerRoles'
import { normalizePosAccessLevel } from '@/lib/posAccessLevels'

// runtimeConfig → configuración cargada dinámicamente desde Appwrite (erp_config)
interface RuntimeBranchConfig { slug: SedeSlug; name: string; region: string; icon: string; color: string; active: boolean; imageUrl: string; managerEmail: string }
const DEFAULT_BRANDING = { companyLogoUrl: '/avatar.png', companyIconUrl: '/avatar.png', defaultUserAvatarUrl: '/avatar.png', titleColor: '#3b82f6' }
const DEFAULT_OWNER = { displayName: 'Importadora Carlitos', email: '', photoURL: '/avatar.png' }
const DEFAULT_BRANCHES: RuntimeBranchConfig[] = [
  { slug: 'donbalato-central', name: 'Importadora Carlitos Central', region: 'Santiago', icon: '🏪', color: 'blue', active: true, imageUrl: '', managerEmail: '' },
]
const getDefaultRuntimeConfig = () => ({
  companyName: 'Importadora Carlitos', legalName: 'Importadora Carlitos Mayorista', companyDescription: 'Importadora Carlitos - Tienda Oficial y Mayorista',
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
import {
  Home, FileText, ClipboardList, DollarSign, Users, Brain,
  MessageCircle, Boxes, AlertTriangle, TrendingDown, Database,
  Search, Bug, Trash2, Activity, Calculator, BarChart2, ShoppingCart,
  Trophy, Receipt, Landmark, Link2, TrendingUp, X, Menu,
  Building2, Shield, Copy, Split, Star, FlaskConical, UserCircle, History, LayoutDashboard,
  Bell, Plus, ChevronDown, ChevronRight, LogOut, Sun, Moon, Settings, Wallet, MapPin,
  Zap, CheckCircle2, Circle, Command as CommandIcon, Store
} from 'lucide-react'

// Configuración dinámica — se carga en el componente desde Appwrite

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
  cyan: { bg: 'bg-cyan-500', text: 'text-cyan-600', border: 'border-cyan-200', light: 'bg-cyan-50' },
}

export default function ErpDashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading: authLoading, isLoggedIn, logout } = useAuth()
  const { modules: services, ready: servicesReady } = useServiceModules()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  interface ErpUserSessionInfo {
    displayName: string
    email: string
    photoURL: string
    role: string
    modules: AppModule[]
    branchSlugs: string[]
    isPosOnly: boolean
  }

  const [erpUserInfo, setErpUserInfo] = useState<ErpUserSessionInfo | null>(null)

  // Cargar info de erp_users al montar
  useEffect(() => {
    if (!isLoggedIn || !user?.email) { setErpUserInfo(null); return }
    let cancelled = false

    ;(async () => {
      try {
        const isSup = isAdminEmail(user.email)
        const info = await getErpUserByEmail(user.email!, true)
        let displayName = info?.displayName || user.name || user.email!.split('@')[0]
        let photoURL = info?.photoURL || auth.currentUser?.photoURL || ''
        let role = isSup ? 'Administrador' : (info?.role || 'Trabajador')
        const modules = isSup
          ? (['erp', 'pos', 'pos_admin', 'erp_admin', 'admin_supreme', 'base_datos', 'web'] as AppModule[])
          : ((info?.modules as AppModule[]) || ['erp'])
        const branchSlugs = info?.branchSlugs || []
        let isPosOnly = !info?.modules?.includes('web') && (isSellerCargo(info?.role) || /cajer/i.test(String(info?.role || '')) || Boolean(info?.nivelAccesoPos))
        let canAccessDatabase = !isSellerCargo(info?.role) && (
          modules.includes('base_datos') ||
          normalizePosAccessLevel(info?.nivelAccesoPos, info?.modules?.includes('pos_admin')) !== 'bajo'
        )

        // Buscar trabajador vinculado para foto y cargo si no los tiene
        try {
          const { fetchTrabajadorERP, normalizeTrabajadorCargos } = await import('@/lib/trabajadoresErpService')
          // Leer el documento vinculado directamente; fetchTrabajadoresERP puede devolver
          // el nivel POS guardado en caché local durante varias horas.
          const trab = await fetchTrabajadorERP(info?.trabajadorId, displayName)
          if (trab) {
            if (!photoURL && trab.fotoUrl) photoURL = trab.fotoUrl
            if (trab.cargo && !isSup) role = trab.cargo
            const workerCargo = trab.cargo || role
            const workerLevel = isSellerCargo(workerCargo)
              ? 'bajo'
              : normalizePosAccessLevel(trab.nivelAccesoPos, trab.puedeGestionarCaja)
            canAccessDatabase = !isSellerCargo(workerCargo) && (canAccessDatabase || workerLevel !== 'bajo')
            const cargos = normalizeTrabajadorCargos(trab.cargos, trab.cargo || role)
            const hasWebRole = cargos.some((cargo: string) => cargo.toLocaleLowerCase('es') === 'web')
            if (!isSup) isPosOnly = !hasWebRole && !info?.modules?.includes('web') && (isSellerCargo(trab.cargo || role) || /cajer/i.test(String(trab.cargo || role)) || Boolean(info?.nivelAccesoPos))
            if (trab.nombre && !info?.displayName) displayName = trab.nombre
          }
        } catch {}

        if (!cancelled) {
          setErpUserInfo({
            displayName,
            email: user.email!,
            photoURL,
            role,
            modules: isPosOnly && !isSup ? (canAccessDatabase ? ['base_datos'] : []) : modules,
            branchSlugs,
            isPosOnly: isPosOnly && !isSup,
          })
        }
      } catch (err) {
        console.error('[Layout] Error cargando erpUserInfo:', err)
        if (!cancelled) {
          setErpUserInfo({
            displayName: user.name || user.email!.split('@')[0],
            email: user.email!,
            photoURL: auth.currentUser?.photoURL || '',
            role: isAdminEmail(user.email) ? 'Administrador' : 'Trabajador',
            modules: isAdminEmail(user.email) ? (['erp', 'pos', 'pos_admin', 'erp_admin', 'admin_supreme', 'base_datos', 'web'] as AppModule[]) : [],
            branchSlugs: [],
            isPosOnly: false,
          })
        }
      }
    })()

    return () => { cancelled = true }
  }, [isLoggedIn, user?.email, user?.name])

  // Guard simple: si no está logueado, al login
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      window.location.href = '/admin/login'
    }
  }, [authLoading, isLoggedIn])

  // Guard: si está logueado pero no tiene módulo ERP, al login
  useEffect(() => {
    if (!authLoading && isLoggedIn && erpUserInfo !== null) {
      if (erpUserInfo.isPosOnly && !isAdminEmail(user?.email || '')) {
        const hasDatabaseOnly = erpUserInfo.modules.includes('base_datos')
        if (hasDatabaseOnly) {
          if (location.pathname !== '/erp-dashboard/base-datos') {
            window.location.replace('/erp-dashboard/base-datos')
          }
        } else {
          window.location.replace('/pos-acceso')
        }
        return
      }
      const hasFullErp = erpUserInfo?.modules?.includes('erp') || erpUserInfo?.modules?.includes('erp_admin') || erpUserInfo?.modules?.includes('admin_supreme') || isAdminEmail(user?.email || '')
      const hasDatabaseOnly = erpUserInfo?.modules?.includes('base_datos')
      if (!hasFullErp && hasDatabaseOnly && location.pathname !== '/erp-dashboard/base-datos') {
        window.location.replace('/erp-dashboard/base-datos')
      } else if (!hasFullErp && !hasDatabaseOnly) {
        const destination = erpUserInfo?.modules?.includes('web') ? '/admin/dashboard' : '/admin/login'
        window.location.replace(destination)
      }
    }
  }, [authLoading, isLoggedIn, erpUserInfo, user?.email, location.pathname])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // ─── Configuración dinámica desde Appwrite ───────────────────────
  const [configLoaded, setConfigLoaded] = useState(false)
  const [runtimeAppConfig, setRuntimeAppConfig] = useState(getDefaultRuntimeConfig())
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const config = await loadRuntimeConfig()
      if (!cancelled) { setRuntimeAppConfig(config); setConfigLoaded(true) }
    })()
    return () => { cancelled = true }
  }, [])
  const runtimeBranding = runtimeAppConfig.branding
  const runtimeOwnerProfile = runtimeAppConfig.ownerProfile
  const COMPANY_LOGO_URL = runtimeBranding.companyLogoUrl || runtimeBranding.companyIconUrl
  const companyName = runtimeAppConfig.companyName || ''

  // ─── Command Palette ──────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const paletteInputRef = React.useRef<HTMLInputElement>(null)

  const isSupreme = isAdminEmail(user?.email)
  const userName = erpUserInfo?.displayName || user?.name || (isSupreme ? runtimeOwnerProfile.displayName : '') || user?.email?.split('@')[0] || 'Usuario'
  const userRole = isSupreme ? 'Administrador' : (erpUserInfo?.role || 'Trabajador')
  const userEmail = user?.email || erpUserInfo?.email || ''

  // Foto de perfil del usuario logueado:
  // Si tiene foto propia (erp_users, trabajador, auth.currentUser), se usa esa.
  // Si es admin supremo sin foto en su cuenta, se usa la del ownerProfile configurado en erp_config.
  // Se aprovecha caché en localStorage para pintar la foto instantáneamente sin skeleton.
  const cachedAvatar = typeof window !== 'undefined' ? (localStorage.getItem('erp_user_avatar_cache') || '') : ''
  const userAvatar =
    erpUserInfo?.photoURL ||
    auth.currentUser?.photoURL ||
    (isSupreme ? (runtimeOwnerProfile.photoURL || '') : '') ||
    cachedAvatar ||
    ''

  // Persistir avatar en caché para cargas instantáneas posteriores
  useEffect(() => {
    if (userAvatar && typeof window !== 'undefined') {
      try { localStorage.setItem('erp_user_avatar_cache', userAvatar) } catch {}
    }
  }, [userAvatar])

  // Resetear estado de error del avatar cuando cambia la URL
  useEffect(() => {
    setAvatarError(false)
  }, [userAvatar])

  // Fecha actual en formato YYYY-MM-DD para link de Ganancias
  const todayDate = new Date().toISOString().split('T')[0]
  const gananciasLink = '/erp-dashboard/ganancias'

  // ─── Header extras ─────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(new Date())
  const [notifOpen, setNotifOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [atajosOpen, setAtajosOpen] = useState(false)
  const [ventasHoy, setVentasHoy] = useState<any[]>([])
  const [totalVentasHoy, setTotalVentasHoy] = useState(0)
  const [totalEfectivoHoy, setTotalEfectivoHoy] = useState(0)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('theme') === 'dark' } catch { return false }
  })
  const [activeBranch, setActiveBranch] = useState<string>(() => {
    try { return localStorage.getItem('activeBranch') || 'todas' } catch { return 'todas' }
  })

  const branches = useMemo(() => (runtimeAppConfig.branches || []).filter((b: any) => b.active), [runtimeAppConfig])
  const activeBranchLabel = activeBranch === 'todas' ? 'Todas las sedes' : (branches.find(b => b.slug === activeBranch)?.name || 'Todas')

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Persistir sede activa
  useEffect(() => {
    try { localStorage.setItem('activeBranch', activeBranch) } catch {}
    window.dispatchEvent(new CustomEvent('activeBranchChanged', { detail: activeBranch }))
  }, [activeBranch])

  // Tema claro/oscuro
  useEffect(() => {
    try {
      if (darkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark') }
      else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light') }
    } catch {}
  }, [darkMode])

  // Obtener ventas y total de efectivo de hoy desde cuadres y ventas_pos
  useEffect(() => {
    let cancelled = false
    const bruto = (c: CuadreERP) =>
      (Number(c.montos?.efectivoSistema) || 0) + (Number(c.montos?.debitoSistema) || 0) + (Number(c.montos?.transferencias) || 0)

    const run = async () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        const runStartedAt = Date.now()
        const nowCL = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const todayStr = nowCL.toISOString().slice(0, 10)
        const now = Date.now()

        // 🔒 1. Usar caché en memoria si está vigente y es del mismo día (incluso si total === 0)
        if (
          globalVentasHoyCache.ts > 0 &&
          globalVentasHoyCache.dateStr === todayStr &&
          (now - globalVentasHoyCache.ts < VENTAS_HOY_TTL)
        ) {
          if (!cancelled) {
            setTotalVentasHoy(globalVentasHoyCache.total)
            setTotalEfectivoHoy(globalVentasHoyCache.efectivo)
          }
          return
        }

        const cuadres = await fetchCuadresERP(1)
        // Si el listener de ventas del dashboard publicó un snapshot mientras
        // cargábamos los cuadres, reutilizarlo y saltar el getDocs de hasta 1.000 ventas.
        if (globalVentasHoyCache.dateStr === todayStr && globalVentasHoyCache.ts > runStartedAt) {
          if (!cancelled) {
            setTotalVentasHoy(globalVentasHoyCache.total)
            setTotalEfectivoHoy(globalVentasHoyCache.efectivo)
          }
          return
        }
        const dayCuadres = cuadres.filter((c: CuadreERP) => c.fecha === todayStr && c.estado === 'enviado' && bruto(c) > 0)
        let total = dayCuadres.reduce((s, c) => s + bruto(c), 0)
        let efectivo = dayCuadres.reduce((s, c) => s + (Number(c.montos?.efectivoReal || c.montos?.efectivoSistema) || 0), 0)

        // Si no hay cuadre formalmente enviado, consultar ventas_pos en vivo (autoridad real de tienda)
        if (total === 0 || efectivo === 0) {
          try {
            const vRef = collection(db, 'ventas_pos')
            const qV = query(vRef, where('fechaStr', '==', todayStr), limit(1000))
            const vSnap = await getDocs(qV)
            let vTotal = 0
            let vEf = 0
            vSnap.forEach(d => {
              const vd = d.data()
              if (vd.estado !== 'completada') return
              const t = Number(vd.total) || 0
              vTotal += t

              if (Array.isArray(vd.pagos) && vd.pagos.length > 0) {
                vd.pagos.forEach((p: any) => {
                  const met = String(p.metodo || p.forma || '').toLowerCase()
                  const m = Number(p.monto) || 0
                  if (!met.includes('debito') && !met.includes('tarjeta') && !met.includes('redelcom') && !met.includes('transferencia')) {
                    vEf += m
                  }
                })
              } else {
                const met = String(vd.metodoPago || vd.formaPago || vd.metodo || 'efectivo').toLowerCase()
                if (!met.includes('debito') && !met.includes('tarjeta') && !met.includes('redelcom') && !met.includes('transferencia')) {
                  vEf += t
                }
              }
            })
            if (vTotal > 0) total = vTotal
            if (vEf > 0) efectivo = vEf
          } catch (err) {
            console.warn('[Layout] Error en ventas_pos en vivo:', err)
          }
        }

        // Guardar en caché global
        globalVentasHoyCache.total = total
        globalVentasHoyCache.efectivo = efectivo
        globalVentasHoyCache.dateStr = todayStr
        globalVentasHoyCache.ts = Date.now()

        if (!cancelled) {
          setTotalVentasHoy(total)
          setTotalEfectivoHoy(efectivo)
        }
      } catch (e) {
        console.error('[Layout] ventasHoy / efectivoHoy error:', e)
      }
    }

    run()
    const onManualRefresh = (ev?: Event) => {
      const detail = (ev as CustomEvent)?.detail
      const nowCL = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (detail && detail.fecha === nowCL && typeof detail.totalVentas === 'number') {
        // Reutilizar el dato recién calculado por page.tsx sin volver a leer 1.000 docs de ventas_pos
        globalVentasHoyCache.total = detail.totalVentas
        if (typeof detail.totalEfectivo === 'number') {
          globalVentasHoyCache.efectivo = detail.totalEfectivo
        }
        globalVentasHoyCache.dateStr = nowCL
        globalVentasHoyCache.ts = Date.now()
        if (!cancelled) {
          setTotalVentasHoy(detail.totalVentas)
          if (typeof detail.totalEfectivo === 'number') {
            setTotalEfectivoHoy(detail.totalEfectivo)
          }
        }
        return
      }
      if (Date.now() - globalVentasHoyCache.ts >= VENTAS_HOY_TTL) {
        run()
      }
    }
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (Date.now() - globalVentasHoyCache.ts >= VENTAS_HOY_TTL) {
          run()
        }
      }
    }
    window.addEventListener('erpDashboardRefreshed', onManualRefresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const id = setInterval(run, 15 * 60 * 1000) // cada 15 min (antes 5 min)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('erpDashboardRefreshed', onManualRefresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [runtimeAppConfig.branches])

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-hdr-dropdown]') && !t.closest('[data-hdr-trigger]')) {
        setNotifOpen(false); setAvatarOpen(false); setPlusOpen(false); setBranchOpen(false); setAtajosOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Notificaciones reales desde Firestore
  type NotifItem = { id: string; icon: React.ReactNode; color: string; title: string; desc: string; time: string; unread: boolean; to?: string }
  const [notifications, setNotifications] = useState<NotifItem[]>([])

  const lastNotifFetchRef = useRef<number>(0)
  const refreshNotificationsRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!db) return
    let cancelled = false

    const loadNotifications = async (force = false) => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        const now = Date.now()
        if (!force && now - lastNotifFetchRef.current < 10 * 60_000) return
        lastNotifFetchRef.current = now
        const items: NotifItem[] = []
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
        const branches = (runtimeAppConfig.branches || []).filter((b: any) => b.active !== false)

        // 1) Cuadres pendientes de hoy por sede
        const { doc, getDoc } = await import('firebase/firestore')
        await Promise.all(branches.map(async (suc) => {
          try {
            const slugCandidates = suc.slug === 'web-tiendas-3b-chile' ? ['web-tiendas-3b-chile', 'web'] : [suc.slug]
            const cajerosMap: Record<string, any> = {}
            for (const slug of slugCandidates) {
              try {
                const parcialSnap = await getDoc(doc(db!, 'cuadre_parcial', `${slug}_${today}`))
                if (parcialSnap.exists()) {
                  const map = parcialSnap.data()?.cajeros || {}
                  Object.entries(map).forEach(([k, v]) => { cajerosMap[k] = v })
                }
              } catch {}
            }
            // Si no hay ninguna entrada para la sede hoy, notificar
            if (Object.keys(cajerosMap).length === 0) {
              items.push({
                id: `cuadre_${suc.slug}`,
                icon: <AlertTriangle size={14} />,
                color: 'rose',
                title: 'Cuadre pendiente',
                desc: `${suc.name} no ha iniciado el cuadre de hoy`,
                time: 'hoy',
                unread: true,
                to: '/_admin',
              })
            } else {
              // Revisar cajeras pendientes
              const pendientes = Object.entries(cajerosMap).filter(([_, v]: any) => {
                const s = v?.status
                return s !== 'completed' && s !== 'submitted' && s !== 'absent' && s !== 'no_caja' && !v?.completedAt
              })
              if (pendientes.length > 0) {
                items.push({
                  id: `cuadre_pend_${suc.slug}`,
                  icon: <AlertTriangle size={14} />,
                  color: 'amber',
                  title: 'Cajeras pendientes',
                  desc: `${suc.name}: ${pendientes.length} cajera(s) sin cerrar`,
                  time: 'hoy',
                  unread: true,
                  to: '/_admin',
                })
              }
            }
          } catch {}
        }))

        // 2) Stock bajo y Precios en pérdida (usando caché local de productos, 0 lecturas)
        try {
          const prods = await fetchAllFirebaseErpProducts(false)
          let perdidas = 0
          let stockBajoCount = 0
          prods.forEach((x: any) => {
            const stk = Number(x?.stock ?? x?.STOCK ?? 0)
            if (stk > 0 && stk < 5) stockBajoCount++
            const costo = Number(x?.costo_uni ?? x?.COST) || 0
            const precio = Number(x?.precio_venta_2 || x?.precio_mayorista || x?.WHOLESALEPRICE) || 0
            if (costo > 0 && precio > 0 && costo >= precio) perdidas++
          })
          if (stockBajoCount > 0) {
            items.push({
              id: 'stock_bajo',
              icon: <Boxes size={14} />,
              color: 'amber',
              title: 'Stock bajo',
              desc: `${stockBajoCount} producto(s) con menos de 5 unidades`,
              time: 'ahora',
              unread: false,
              to: '/base-datos',
            })
          }
          if (perdidas > 0) {
            items.push({
              id: 'precios_perdida',
              icon: <TrendingDown size={14} />,
              color: 'red',
              title: 'Precios en pérdida',
              desc: `${perdidas} producto(s) con costo ≥ precio`,
              time: 'ahora',
              unread: true,
              to: '/correccion-precios',
            })
          }
        } catch {}

        if (!cancelled) setNotifications(items)
      } catch (e) {
        console.warn('[Notif] error:', e)
      }
    }

    refreshNotificationsRef.current = () => { void loadNotifications(false) }

    // Cargar solo al montar si la ventana está activa
    loadNotifications(false)

    // Actualizar con throttle al refrescar el ERP
    const onManualRefresh = () => { loadNotifications(false) }
    window.addEventListener('erpDashboardRefreshed', onManualRefresh)
    return () => {
      cancelled = true
      refreshNotificationsRef.current = null
      window.removeEventListener('erpDashboardRefreshed', onManualRefresh)
    }
  }, [runtimeAppConfig.branches])

  // Al abrir la campana, reutilizar la misma carga y su límite de 10 minutos.
  useEffect(() => {
    if (notifOpen) refreshNotificationsRef.current?.()
  }, [notifOpen])

  const unreadCount = notifications.filter(n => n.unread).length

  // Cerrar sidebar/palette/dropdowns al cambiar de página
  useEffect(() => { setSidebarOpen(false); setPaletteOpen(false); setPaletteQuery(''); setNotifOpen(false); setAvatarOpen(false); setPlusOpen(false); setBranchOpen(false); setAtajosOpen(false) }, [location.pathname])

  // Abrir palette al escribir cualquier letra desde cualquier parte
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable
      if (isInput) return
      if (e.key === 'Escape') { setPaletteOpen(false); setPaletteQuery(''); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length === 1 && /[a-zA-Zà-ÿ0-9 ]/.test(e.key)) {
        setPaletteQuery(prev => prev + e.key)
        setPaletteOpen(true)
        setPaletteIndex(0)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (paletteOpen) setTimeout(() => paletteInputRef.current?.focus(), 30)
  }, [paletteOpen])

  // Hover zone: abrir sidebar solo cuando el mouse toca la esquina superior izquierda
  // Deshabilitado en /erp-dashboard/base-datos que tiene su propia cortina
  useEffect(() => {
    if (location.pathname === '/erp-dashboard/base-datos') return;
    const handleMouseMove = (e: MouseEvent) => {
      const xOpen = window.innerWidth * 0.02
      const yMid = window.innerHeight * 0.5
      const yRange = window.innerHeight * 0.10
      const closeThreshold = window.innerWidth * 0.15
      if (e.clientX <= xOpen && Math.abs(e.clientY - yMid) <= yRange && !sidebarOpen) {
        setSidebarOpen(true)
      } else if (e.clientX > closeThreshold && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [sidebarOpen, location.pathname])

  // Bloquear scroll del body cuando sidebar está abierta
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const navLinks = useMemo(() => [
    // ── GENERAL ──
    { section: 'General' },
    { to: '/', label: 'Inicio', icon: <Home size={18} />, color: 'blue', desc: 'Dashboard' },
    { to: '/sucursales', label: 'Sucursales', icon: <Building2 size={18} />, color: 'blue', desc: 'Resumen sedes' },
    { to: '/alertas', label: 'Alertas', icon: <Activity size={18} />, color: 'red', desc: 'Anomalías' },
    { to: '/ventas-tiempo-real', label: 'Tiempo Real', icon: <Activity size={18} />, color: 'red', desc: 'En vivo' },
    // ── CUADRES ──
    { section: 'Cuadres' },
    { to: '/cajeras', label: 'Realizar Corte', icon: <FileText size={18} />, color: 'fuchsia', desc: 'Cierre caja' },
    { to: '/_admin', label: 'Ver Cortes', icon: <ClipboardList size={18} />, color: 'indigo', desc: 'Cuadres enviados' },
    { to: '/admin', label: 'Corregir Corte', icon: <ClipboardList size={18} />, color: 'indigo', desc: 'Editar cuadres' },
    // ── GASTOS ──
    { section: 'Gastos' },
    { to: '/gastos', label: 'Gastos', icon: <DollarSign size={18} />, color: 'rose', desc: 'Por sucursal' },
    { to: '/gastos-externos', label: 'Gastos Externos', icon: <Receipt size={18} />, color: 'rose', desc: 'Fuera cuadre' },
    { to: '/adelantos-personal', label: 'Adelantos Personal', icon: <DollarSign size={18} />, color: 'amber', desc: 'Préstamos' },
    // ── PERSONAL ──
    { section: 'Personal' },
    { to: '/planilla-unificada', label: 'Trabajadores', icon: <Users size={18} />, color: 'indigo', desc: 'Planilla' },
    { to: '/informe-general-trabajadores', label: 'Informe Trabajadores', icon: <Users size={18} />, color: 'indigo', desc: 'General' },
    { to: '/analisis-cajeras', label: 'Análisis Cajeras', icon: <Users size={18} />, color: 'pink', desc: 'Rendimiento' },
    { to: '/roles', label: 'Roles', icon: <Users size={18} />, color: 'purple', desc: 'Gestión usuarios' },
    { to: '/clientes-frecuentes', label: 'Clientes Frecuentes', icon: <UserCircle size={18} />, color: 'blue', desc: 'Fidelización' },
    // ── CATÁLOGOS EMPRENDEDOR ──
    { section: 'Gestión de Catálogos' },
    { to: '/admin-catalogos', label: 'Catálogos', icon: <Store size={18} />, color: 'emerald', desc: 'Panel Master SaaS' },
    // ── INVENTARIO & PRODUCTOS ──
    { section: 'Inventario & Productos' },
    { to: '/inventario', label: 'Inventario', icon: <Boxes size={18} />, color: 'violet', desc: 'Stock' },
    { to: '/rastreador-ilimitados', label: 'Rastreador Ilimitados', icon: <AlertTriangle size={18} />, color: 'amber', desc: 'Stock ilimitado' },
    { to: '/historial-stock', label: 'Historial Stock', icon: <History size={18} />, color: 'indigo', desc: 'Movimientos' },
    { to: '/productos-estrella', label: 'Productos Estrella', icon: <Star size={18} />, color: 'amber', desc: 'Mejores' },
    { to: '/productos-duplicados', label: 'Productos Duplicados', icon: <Copy size={18} />, color: 'red', desc: 'Duplicados' },
    // ── COSTOS & PRECIOS ──
    { section: 'Costos & Precios' },
    { to: '/revision-costos', label: 'Rev. Costos', icon: <AlertTriangle size={18} />, color: 'rose', desc: 'Bajo costo' },
    { to: '/revision-precios', label: 'Rev. Precios', icon: <DollarSign size={18} />, color: 'amber', desc: 'Precios bajos' },
    { to: '/correccion-precios', label: 'Corrección Precios', icon: <TrendingDown size={18} />, color: 'rose', desc: 'Costo vs venta' },
    { to: '/comparacion-costos', label: 'Comparación Costos', icon: <TrendingDown size={18} />, color: 'amber', desc: 'Comparar' },
    { to: '/comparacion-logica', label: 'Comparación Lógica', icon: <TrendingDown size={18} />, color: 'amber', desc: 'Lógica costos' },
    { to: '/revision-costos-history', label: 'Historial Costos', icon: <History size={18} />, color: 'amber', desc: 'Revisión histórica' },
    // ── VENTAS & PEDIDOS ──
    { section: 'Ventas & Pedidos' },
    { to: '/top-products', label: 'Top 10', icon: <Trophy size={18} />, color: 'amber', desc: 'Más vendidos' },
    { to: '/top-10-cajeras', label: 'Top Cajeras', icon: <Trophy size={18} />, color: 'pink', desc: 'Ranking cajeras' },
    { to: '/top-10-sucursales', label: 'Top Sucursales', icon: <Trophy size={18} />, color: 'violet', desc: 'Ranking sedes' },
    { to: '/top-producto-dia', label: 'Top del Día', icon: <Trophy size={18} />, color: 'amber', desc: 'Hoy' },
    { to: '/control-pedidos', label: 'Pedidos', icon: <ShoppingCart size={18} />, color: 'amber', desc: 'Control' },
    { to: '/pagos-pedidos', label: 'Pagos & Pedidos', icon: <ShoppingCart size={18} />, color: 'blue', desc: 'Plataforma Web' },
    { to: '/separar-ventas', label: 'Separar Ventas', icon: <Split size={18} />, color: 'sky', desc: 'Por método' },
    { to: '/transferencias', label: 'Transferencias', icon: <Landmark size={18} />, color: 'cyan', desc: 'Webhook MP' },
    { to: '/analisis-productos', label: 'Análisis Productos', icon: <Search size={18} />, color: 'sky', desc: 'Por producto' },
    // ── INFORMES ──
    { section: 'Informes' },
    { to: '/informes-generales', label: 'Informes', icon: <FileText size={18} />, color: 'slate', desc: 'Reportes' },
    { to: '/informe-mensual', label: 'Informe Mensual', icon: <BarChart2 size={18} />, color: 'green', desc: 'Mes' },
    { to: '/informe-merma', label: 'Informe Merma', icon: <BarChart2 size={18} />, color: 'rose', desc: 'Pérdidas' },
    { to: '/analisis-historico', label: 'Análisis Histórico', icon: <BarChart2 size={18} />, color: 'purple', desc: 'Histórico' },
    { to: '/ganancias-excel', label: 'Ganancias Excel', icon: <TrendingUp size={18} />, color: 'green', desc: 'Export' },
    { to: '/erp-dashboard/ganancias', label: 'Ganancias POS', icon: <TrendingUp size={18} />, color: 'emerald', desc: 'Ganancias reales' },
    { to: '/utilidad', label: 'Utilidad', icon: <Calculator size={18} />, color: 'emerald', desc: 'Cálculos' },
    // ── IA & COMUNICACIONES ──
    { section: 'IA & Comunicaciones' },
    { to: '/erp-dashboard/contador-ia', label: 'Contador IA', icon: <Brain size={18} />, color: 'violet', desc: 'Asesor financiero IA' },
    { to: '/chat-ia', label: 'Chat IA', icon: <Brain size={18} />, color: 'blue', desc: 'Asistente ASIS' },
    { to: '/cerebro-ia', label: 'Cerebro IA', icon: <Brain size={18} />, color: 'violet', desc: 'IA avanzada' },
    { to: '/asis-monitor', label: 'ASIS Monitor', icon: <Activity size={18} />, color: 'emerald', desc: 'Estado IA' },
    { to: '/whatsapp-gestion', label: 'WhatsApp', icon: <MessageCircle size={18} />, color: 'green', desc: 'Contactos' },
    { to: '/whatsapp-config', label: 'WhatsApp Config', icon: <MessageCircle size={18} />, color: 'green', desc: 'Configuración' },
    { to: '/telegram-gestion', label: 'Telegram', icon: <MessageCircle size={18} />, color: 'sky', desc: 'Roles' },
    // ── BASE DE DATOS ──
    { section: 'Base de Datos' },
    { to: '/erp-dashboard/base-datos', label: 'Base de Datos', icon: <Database size={18} />, color: 'sky', desc: 'Firebase' },
    { to: '/control-datos', label: 'Control Datos', icon: <Search size={18} />, color: 'indigo', desc: 'Búsqueda' },
    { to: '/depurador', label: 'Depurador', icon: <Bug size={18} />, color: 'rose', desc: 'Debug SKU' },
    { to: '/eliminador-masivo', label: 'Eliminador Masivo', icon: <Trash2 size={18} />, color: 'rose', desc: 'Borrar products' },
    { to: '/comprobador-datos-2', label: 'Comprobador', icon: <Search size={18} />, color: 'cyan', desc: 'Verificación' },
    // ── ADMINISTRACIÓN ──
    { section: 'Administración' },
    { to: '/admin-supreme', label: 'Admin Supreme', icon: <Shield size={18} />, color: 'purple', desc: 'Panel maestro' },
    { to: '/pos-admin', label: 'Dashboard POS', icon: <LayoutDashboard size={18} />, color: 'fuchsia', desc: 'Admin POS' },
    { to: '/pos', label: 'POS', icon: <ShoppingCart size={18} />, color: 'fuchsia', desc: 'Punto de venta' },
  ], [])

  const sidebarLinks = useMemo(() => navLinks.filter(link => !('to' in link) || !link.to || !['/pos', '/pos-admin'].includes(link.to) || (servicesReady && services.pos)), [navLinks, servicesReady, services.pos])

  type RouteStatus = 'exists' | 'shared' | 'missing'

  const getRouteAudit = (to: string): {
    status: RouteStatus
    badge: string
    badgeCls: string
    boxCls: string
    iconBg: string
    textCls: string
    descCls: string
  } => {
    // Páginas con ruta real y operativa en Next.js
    const REAL_PAGES = new Set([
      '/',
      '/sucursales',
      '/alertas',
      '/ventas-tiempo-real',
      '/_admin',
      '/cajeras',
      '/planilla-unificada',
      '/inventario',
      '/base-datos',
      '/erp-dashboard/base-datos',
      '/chat-ia',
      '/whatsapp-gestion',
      '/admin-supreme',
      '/pos-admin',
      '/pos',
      '/gastos',
      '/gastos-externos',
      '/rastreador-ilimitados',
      '/historial-stock',
    ])

    // Páginas que redirigen a otra vista existente (alias)
    const SHARED_PAGES = new Set([
      '/admin',
      '/informe-general-trabajadores',
      '/analisis-cajeras',
      '/control-datos',
      '/cerebro-ia',
      '/asis-monitor',
      '/telegram-gestion',
      '/whatsapp-config',
      '/top-products',
      '/ganancias-excel',
    ])

    if (REAL_PAGES.has(to)) {
      return {
        status: 'exists',
        badge: '✓ Existe',
        badgeCls: 'bg-emerald-600 text-white font-bold',
        boxCls: 'bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-950/40 dark:border-emerald-700/40 hover:bg-emerald-500/20 hover:border-emerald-500/60 shadow-xs',
        iconBg: 'bg-emerald-600 text-white shadow-xs',
        textCls: 'text-emerald-950 dark:text-emerald-100 font-bold',
        descCls: 'text-emerald-700/90 dark:text-emerald-400 font-medium',
      }
    }

    if (SHARED_PAGES.has(to)) {
      return {
        status: 'shared',
        badge: '⇄ Alias',
        badgeCls: 'bg-amber-500 text-white font-bold',
        boxCls: 'bg-amber-500/10 border-amber-500/30 dark:bg-amber-950/40 dark:border-amber-700/40 hover:bg-amber-500/20 hover:border-amber-500/60 shadow-xs',
        iconBg: 'bg-amber-500 text-white shadow-xs',
        textCls: 'text-amber-950 dark:text-amber-100 font-bold',
        descCls: 'text-amber-700/90 dark:text-amber-400 font-medium',
      }
    }

    return {
      status: 'missing',
      badge: '✕ Falta',
      badgeCls: 'bg-rose-500/90 text-white font-bold',
      boxCls: 'bg-rose-500/10 border-rose-500/30 dark:bg-rose-950/40 dark:border-rose-700/40 hover:bg-rose-500/20 hover:border-rose-500/60 shadow-xs',
      iconBg: 'bg-rose-500 text-white shadow-xs',
      textCls: 'text-rose-950 dark:text-rose-200 font-medium',
      descCls: 'text-rose-600/90 dark:text-rose-400 font-medium',
    }
  }

  const paletteResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim()
    if (!q) return sidebarLinks.filter(l => 'to' in l) as Array<{to:string;label:string;icon:React.ReactNode;color:string;desc:string}>
    return (sidebarLinks.filter(l => 'to' in l) as Array<{to:string;label:string;icon:React.ReactNode;color:string;desc:string}>)
      .filter(l => l.label.toLowerCase().includes(q) || l.desc.toLowerCase().includes(q))
  }, [paletteQuery, sidebarLinks])

  const auditCounts = useMemo(() => {
    let exist = 0, shared = 0, missing = 0
    sidebarLinks.forEach(l => {
      if ('to' in l && l.to) {
        const audit = getRouteAudit(l.to)
        if (audit.status === 'exists') exist++
        else if (audit.status === 'shared') shared++
        else missing++
      }
    })
    return { exist, shared, missing }
  }, [sidebarLinks])

  // Guard visual: si está cargando auth, mostrar loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-700 animate-spin" />
          <p className="text-sm text-slate-500">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 relative">
      {/* Sidebar (móvil + desktop) — oculto en base-datos que tiene su propia cortina */}
      {location.pathname !== '/erp-dashboard/base-datos' && (
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
        <aside className={`custom-safe-area absolute left-0 top-0 bottom-0 w-80 bg-white dark:bg-slate-800 shadow-xl transform transition-transform duration-300 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Header fijo — Perfil Usuario */}
          <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-600 shadow-md flex items-center justify-center shrink-0" style={{ boxShadow: '0 0 4px rgba(147,51,234,0.12), 0 0 8px rgba(147,51,234,0.06)' }}>
                <div className="absolute inset-0 rounded-2xl border border-purple-300/30" />
                {userAvatar && !avatarLoaded && !avatarError ? (
                  <div className="absolute inset-0 animate-pulse bg-slate-200/60" />
                ) : (
                  <span className="text-2xl font-black text-white select-none">
                    {(userName || '?')[0].toUpperCase()}
                  </span>
                )}
                {userAvatar && !avatarError && (
                  <img
                    src={userAvatar}
                    alt={userName}
                    className="absolute inset-0 h-full w-full object-cover"
                    onLoad={() => setAvatarLoaded(true)}
                    onError={() => { setAvatarLoaded(false); setAvatarError(true) }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 truncate" style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", letterSpacing: '0.02em' }}>{userName}</span>
                </div>
                <span className="relative inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full text-white overflow-hidden shadow-lg mt-1" style={{background:'linear-gradient(135deg,#06b6d4 0%,#2563eb 60%,#4f46e5 100%)',backgroundSize:'300% 300%',animation:'lavaFlow 3s ease infinite'}}>
                  <span className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-white/30 top-0.5 left-1 animate-ping" style={{animationDuration:'2s'}} />
                  </span>
                  {userRole}
                </span>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0" aria-label="Cerrar menú">
              <X size={20} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Barra de Auditoría de Páginas */}
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shadow-xs animate-pulse" /> {auditCounts.exist} Existen
            </span>
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block shadow-xs" /> {auditCounts.shared} Alias
            </span>
            <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
              <span className="h-2 w-2 rounded-full bg-rose-500 inline-block shadow-xs" /> {auditCounts.missing} Faltan
            </span>
          </div>

          {/* Contenido scrolleable */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
            {sidebarLinks.map((link, i) => {
              if ('section' in link) {
                return (
                  <div key={`section-${i}`} className="pt-3 pb-1 px-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{link.section}</span>
                  </div>
                )
              }
              const isRouteActive = location.pathname === link.to || location.pathname === mapRoute(link.to)
              const audit = getRouteAudit(link.to)
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all border ${audit.boxCls} ${isRouteActive ? 'ring-2 ring-blue-500 shadow-md scale-[1.01]' : ''}`}
                >
                  <div className={`p-1.5 rounded-lg ${audit.iconBg} transition-transform group-hover:scale-110 flex-shrink-0`}>
                    {link.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs ${audit.textCls} truncate`}>{link.label}</div>
                    <div className={`text-[10px] ${audit.descCls} truncate`}>{link.desc}</div>
                  </div>
                  <span className={`text-[8.5px] px-1.5 py-0.5 rounded-md ${audit.badgeCls} shadow-xs tracking-wider flex-shrink-0`}>
                    {audit.badge}
                  </span>
                </Link>
              )
            })}
          </nav>
          {/* Cerrar sesión */}
          <div className="flex-shrink-0 p-3 border-t border-slate-200 dark:border-slate-700">
            <button onClick={async () => { await logout(); navigate('/dashboard-login', { replace: true }) }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition group">
              <div className="p-2 rounded-lg bg-red-50 text-red-500 group-hover:bg-red-100"><X size={18} /></div>
              <span className="text-sm font-medium text-red-600">Cerrar sesión</span>
            </button>
          </div>
        </aside>
      </div>
      )}

      {/* Command Palette */}
      {paletteOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4" onClick={() => { setPaletteOpen(false); setPaletteQuery('') }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={e => { setPaletteQuery(e.target.value); setPaletteIndex(0) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(i => Math.min(i + 1, paletteResults.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(i => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter' && paletteResults[paletteIndex]) { navigate(paletteResults[paletteIndex].to); setPaletteOpen(false); setPaletteQuery('') }
                  if (e.key === 'Escape') { setPaletteOpen(false); setPaletteQuery('') }
                  if (e.key === 'Backspace' && paletteQuery === '') { setPaletteOpen(false) }
                }}
                placeholder="Buscar en el sistema..."
                className="flex-1 bg-transparent text-base text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
                autoComplete="off"
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-md border border-slate-200 dark:border-slate-600">ESC</kbd>
            </div>
            {/* Results */}
            <div className="max-h-[55vh] overflow-y-auto py-2" style={{scrollbarWidth:'none'}}>
              {paletteResults.length === 0 && (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">Sin resultados para "{paletteQuery}"</div>
              )}
              {paletteResults.map((link, i) => {
                const cc = colorClasses[link.color] || colorClasses.slate
                return (
                  <button
                    key={link.to}
                    onClick={() => { navigate(link.to); setPaletteOpen(false); setPaletteQuery('') }}
                    onMouseEnter={() => setPaletteIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                      i === paletteIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${cc.light} ${cc.text} shrink-0`}>{link.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{link.label}</div>
                      <div className="text-[11px] text-slate-400">{link.desc}</div>
                    </div>
                    {i === paletteIndex && (
                      <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-500 rounded shrink-0">↵</kbd>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes logo_spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes logo_spinRev  { from{transform:rotate(360deg)} to{transform:rotate(0deg)} }
        @keyframes logo_pulse    { 0%{box-shadow:0 0 0 0 var(--logo-color-a)} 70%{box-shadow:0 0 0 7px var(--logo-color-b)} 100%{box-shadow:0 0 0 0 var(--logo-color-b)} }
        @keyframes logo_float    { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.05) translateY(-1px)} }
        @keyframes logo_conic    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes logo_shimmer  { 0%{transform:translateX(-120%) rotate(20deg);opacity:0} 40%{opacity:0.8} 100%{transform:translateX(120%) rotate(20deg);opacity:0} }
        @keyframes logo_orbit1   { from{transform:rotate(0deg) translateX(34px) rotate(0deg)} to{transform:rotate(360deg) translateX(34px) rotate(-360deg)} }
        @keyframes logo_orbit2   { from{transform:rotate(120deg) translateX(34px) rotate(-120deg)} to{transform:rotate(480deg) translateX(34px) rotate(-480deg)} }
        @keyframes logo_orbit3   { from{transform:rotate(240deg) translateX(34px) rotate(-240deg)} to{transform:rotate(600deg) translateX(34px) rotate(-600deg)} }
        @keyframes logo_blink    { 0%,100%{opacity:0.4;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.3)} }

        @keyframes hdr_drift_h   { 0%{transform:translateX(-20px)} 50%{transform:translateX(calc(100vw + 20px))} 100%{transform:translateX(-20px)} }
        @keyframes hdr_drift_r   { 0%{transform:translateX(calc(100vw + 20px))} 50%{transform:translateX(-20px)} 100%{transform:translateX(calc(100vw + 20px))} }
        @keyframes hdr_floatY    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes hdr_twinkle   { 0%,100%{opacity:0.2;transform:scale(0.7)} 50%{opacity:1;transform:scale(1.3)} }
        @keyframes hdr_shooting  { 0%{transform:translateX(-10%) translateY(0) rotate(18deg);opacity:0} 8%{opacity:1} 40%{opacity:1} 55%{transform:translateX(120%) translateY(30px) rotate(18deg);opacity:0} 100%{opacity:0} }
        @keyframes hdr_blob      { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(15px,-5px) scale(1.08)} 66%{transform:translate(-10px,4px) scale(0.95)} }
        @keyframes hdr_lineFlow  { 0%{stroke-dashoffset:200;opacity:0.2} 50%{opacity:0.5} 100%{stroke-dashoffset:0;opacity:0.2} }
        @keyframes hdr_ripple    { 0%{transform:scale(0);opacity:0.7} 100%{transform:scale(4);opacity:0} }
        @keyframes hdr_zigzag    { 0%{transform:translate(0,0)} 25%{transform:translate(40vw,-6px)} 50%{transform:translate(60vw,8px)} 75%{transform:translate(85vw,-4px)} 100%{transform:translate(110vw,0)} }
        @keyframes hdr_nebula    { 0%{transform:rotate(0deg) scale(1);opacity:0.3} 50%{opacity:0.55} 100%{transform:rotate(360deg) scale(1.1);opacity:0.3} }
        @keyframes hdr_aurora    { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes hdr_hexPulse  { 0%,100%{opacity:0.08} 50%{opacity:0.22} }
        @keyframes hdr_dna       { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(6px) rotate(180deg)} }
        @keyframes hdr_scanline  { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes hdr_comet     { 0%{transform:translateX(-15%) translateY(0px);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateX(120%) translateY(-8px);opacity:0} }
        @keyframes hdr_orbitX    { from{transform:rotate(0deg) translateX(80px) rotate(0deg)} to{transform:rotate(360deg) translateX(80px) rotate(-360deg)} }
        @keyframes td_float      { 0%,100%{transform:translateY(0px) translateX(0px);opacity:0.6} 50%{transform:translateY(-10px) translateX(5px);opacity:1} }
        @keyframes td_drift      { 0%,100%{transform:translate(0,0)} 50%{transform:translate(10px,-10px)} }
        @keyframes td_bubble     { 0%,100%{transform:scale(1);opacity:0.3} 50%{transform:scale(1.4);opacity:0.6} }
        @keyframes td_shimmer    { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 shadow-sm">
        {/* =============== Partículas del header =============== */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>

          {/* grid de hexágonos neutro (oculto en móvil) */}
          <svg className="absolute inset-0 w-full h-full hidden sm:block" style={{ animation: 'hdr_hexPulse 4s ease-in-out infinite' }}>
            <defs>
              <pattern id="hdrHex" x="0" y="0" width="28" height="24" patternUnits="userSpaceOnUse">
                <polygon points="14,1 26,7 26,18 14,24 2,18 2,7" fill="none" stroke="#94a3b8" strokeOpacity="0.18" strokeWidth="0.4" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hdrHex)" />
          </svg>



          {/* estrellas titilando — 20 desktop, 8 mobile — azul, verde, gris (ocultas en móvil) */}
          <div className="hidden sm:block">
            {Array.from({ length: 20 }).map((_, i) => {
              if (isMobile && i >= 8) return null
            const ptColors = [
              ['rgba(59,130,246,0.95)','rgba(59,130,246,0.7)'],   // azul
              ['rgba(34,197,94,0.95)','rgba(34,197,94,0.7)'],     // verde
              ['rgba(148,163,184,0.9)','rgba(148,163,184,0.6)'],  // gris
            ]
            const [bg, sh] = ptColors[i % 3]
            return (
              <div key={`tw_${i}`} className="absolute rounded-full" style={{
                left: `${(i * 79 + 5) % 98}%`,
                top: `${10 + (i * 43 + 7) % 75}%`,
                width: `${1 + (i % 3)}px`,
                height: `${1 + (i % 3)}px`,
                background: bg,
                animation: `hdr_twinkle ${1.8 + (i % 5) * 0.5}s ease-in-out ${(i * 0.17) % 3}s infinite`,
              }} />
            )
          })}
          </div>

          {/* orbes flotando — 10 desktop, 4 mobile — azul, verde, gris (ocultos en móvil) */}
          <div className="hidden sm:block">
            {Array.from({ length: 10 }).map((_, i) => {
              if (isMobile && i >= 4) return null
            const orbColors = [
              'radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)',
              'radial-gradient(circle, rgba(34,197,94,0.4), transparent 70%)',
              'radial-gradient(circle, rgba(148,163,184,0.35), transparent 70%)',
            ]
            return (
              <div key={`orb_${i}`} className="absolute rounded-full" style={{
                left: `${(i * 53 + 12) % 95}%`,
                top: `${15 + (i * 31) % 65}%`,
                width: `${4 + (i % 3) * 2}px`,
                height: `${4 + (i % 3) * 2}px`,
                background: orbColors[i % 3],
                filter: 'blur(1px)',
                animation: `hdr_floatY ${3 + (i % 4)}s ease-in-out ${(i * 0.3) % 2}s infinite`,
              }} />
            )
          })}
          </div>

          {/* partículas derivando — 6 desktop, 3 mobile — azul, verde, gris */}
          {Array.from({ length: 6 }).map((_, i) => {
            if (isMobile && i >= 3) return null
            const driftColors = [
              ['rgba(59,130,246,0.8)','rgba(59,130,246,0.6)'],
              ['rgba(34,197,94,0.8)','rgba(34,197,94,0.6)'],
              ['rgba(148,163,184,0.7)','rgba(148,163,184,0.5)'],
            ]
            const [bg, sh] = driftColors[i % 3]
            return (
              <div key={`drift_${i}`} className="absolute rounded-full" style={{
                top: `${15 + i * 14}%`,
                width: `${2 + (i % 2)}px`,
                height: `${2 + (i % 2)}px`,
                background: bg,
                opacity: 0.6,
                animation: `${i % 2 === 0 ? 'hdr_drift_h' : 'hdr_drift_r'} ${14 + (i % 4) * 4}s linear ${i * 1.5}s infinite`,
              }} />
            )
          })}

          {/* estrellas fugaces — azul y verde */}
          <div className="absolute top-[15%] left-0 h-px w-24" style={{
            background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.9), transparent)',
            animation: 'hdr_shooting 7s ease-in 2s infinite',
          }} />
          <div className="absolute top-[60%] left-0 h-px w-20" style={{
            background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent)',
            animation: 'hdr_shooting 10s ease-in 6s infinite',
          }} />

          {/* ripples — azul, verde, azul (ocultos en móvil) */}
          {[
            { left: '18%', top: '40%', delay: '0s',   color: 'rgba(59,130,246,0.6)' },
            { left: '58%', top: '30%', delay: '1.5s',  color: 'rgba(34,197,94,0.6)' },
            { left: '82%', top: '60%', delay: '3s',    color: 'rgba(59,130,246,0.5)' },
          ].map((r, i) => (
            <div key={`rip_${i}`} className="absolute rounded-full border hidden sm:block" style={{
              left: r.left, top: r.top, width: '8px', height: '8px',
              borderColor: r.color,
              animation: `hdr_ripple 4s ease-out ${r.delay} infinite`,
            }} />
          ))}

          {/* luciérnagas — 4 desktop, 2 mobile — azul y verde */}
          {[0, 1, 2, 3].map(i => {
            if (isMobile && i >= 2) return null
            const zzC = i % 2 === 0
              ? ['rgba(59,130,246,0.9)','rgba(59,130,246,0.6)']
              : ['rgba(34,197,94,0.9)','rgba(34,197,94,0.6)']
            return (
              <div key={`zz_${i}`} className="absolute rounded-full hidden sm:block" style={{
                top: `${20 + i * 18}%`, left: 0,
                width: '3px', height: '3px',
                background: zzC[0],
                animation: `hdr_zigzag ${18 + i * 3}s linear ${i * 4}s infinite`,
              }} />
            )
          })}


          {/* DNA helix — 8 desktop, 4 mobile — azul y verde alternado */}
          {Array.from({ length: 8 }).map((_, i) => {
            if (isMobile && i >= 4) return null
            return (
              <div key={`dna_${i}`} className="absolute rounded-full hidden sm:block" style={{
                left: `${35 + i * 4}%`,
                top: '50%',
                width: '2px', height: '2px',
                background: i % 2 === 0 ? 'rgba(59,130,246,0.8)' : 'rgba(34,197,94,0.8)',
                animation: `hdr_dna ${2.5 + (i % 3) * 0.3}s ease-in-out ${i * 0.15}s infinite`,
              }} />
            )
          })}

        </div>
        <div className="relative px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          {/* Izquierda: menu + logo + empresa */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition flex-shrink-0">
              <Menu size={22} className="text-slate-600 dark:text-slate-400" />
            </button>
            <Link to="/admin-supreme" className="flex items-center gap-2 sm:gap-4 hover:opacity-90 transition-opacity min-w-0">
              {configLoaded ? (
                <div className="relative flex-shrink-0 group w-10 h-10 sm:w-12 sm:h-12" style={{
                  '--logo-color': runtimeBranding.titleColor || '#3b82f6',
                  '--logo-color-a': `${runtimeBranding.titleColor || '#3b82f6'}88`,
                  '--logo-color-b': `${runtimeBranding.titleColor || '#3b82f6'}00`,
                } as React.CSSProperties}>

                  {/* capa 2: anillo SVG giratorio (arco principal) */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 68 68" style={{animation:'logo_spin 5s linear infinite'}}>
                    <defs>
                      <linearGradient id="logoRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor={runtimeBranding.titleColor || '#3b82f6'} stopOpacity="1" />
                        <stop offset="50%"  stopColor={runtimeBranding.titleColor || '#3b82f6'} stopOpacity="0.5" />
                        <stop offset="100%" stopColor={runtimeBranding.titleColor || '#3b82f6'} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <circle cx="34" cy="34" r="32" fill="none" stroke="url(#logoRingGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="80 140" />
                  </svg>

                  {/* capa 3: anillo contrario, punteado */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 68 68" style={{animation:'logo_spinRev 8s linear infinite'}}>
                    <circle cx="34" cy="34" r="30" fill="none" stroke={runtimeBranding.titleColor || '#3b82f6'} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 6" />
                  </svg>


                  {/* capa 5: imagen con shimmer */}
                  <div className="absolute inset-1 rounded-full overflow-hidden border-2 border-white/80 shadow-lg bg-white">
                    <img src={COMPANY_LOGO_URL} alt="Logo empresa" className="h-full w-full object-cover" />
                </div>

                {/* capa 6: 3 partículas orbitando (ocultas en móvil) */}
                <div className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-none">
                  {[
                    { anim: 'logo_orbit1 3.2s linear infinite', blink: 'logo_blink 2.0s ease-in-out infinite' },
                    { anim: 'logo_orbit2 3.2s linear infinite', blink: 'logo_blink 2.0s ease-in-out 0.7s infinite' },
                    { anim: 'logo_orbit3 3.2s linear infinite', blink: 'logo_blink 2.0s ease-in-out 1.4s infinite' },
                  ].map((p, i) => (
                    <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2 hidden sm:block" style={{ animation: p.anim }}>
                      <span className="block rounded-full" style={{
                        width: '4px', height: '4px',
                        background: runtimeBranding.titleColor || '#3b82f6',
                        animation: p.blink,
                      }} />
                    </span>
                  ))}
                </div>
              </div>
              ) : (
                <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-200 animate-pulse" />
              )}
              <div className="hidden sm:block min-w-0">
                {configLoaded ? (
                  <h1 className="text-base sm:text-lg font-black whitespace-nowrap truncate" style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", letterSpacing: '0.02em' }}>
                    <span className="bg-clip-text text-transparent" style={{
                      backgroundImage: `linear-gradient(90deg, ${runtimeBranding.titleColor || '#3b82f6'} 0%, ${runtimeBranding.titleColor ? runtimeBranding.titleColor + 'cc' : '#3b82f6cc'} 50%, ${runtimeBranding.titleColor || '#3b82f6'} 100%)`
                    }}>{companyName}</span>
                  </h1>
                ) : (
                  <div className="h-5 w-28 rounded bg-slate-200 animate-pulse" />
                )}
                <p className="block text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 -mt-0.5 truncate">
                  {currentTime.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })} · {currentTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </Link>

            {/* Selector de sede activa (desktop) */}
            <div className="hidden md:block relative ml-2">
              <button
                data-hdr-trigger
                onClick={() => { setBranchOpen(v => !v); setNotifOpen(false); setAvatarOpen(false); setPlusOpen(false) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition ${activeBranch === 'todas' ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
              >
                <MapPin size={12} />
                <span className="max-w-[120px] truncate">{activeBranchLabel}</span>
                <ChevronDown size={12} className={`transition-transform ${branchOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Centro: buscador ⌘K (desktop) */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden lg:flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
            title="Buscar"
          >
            <Search size={18} />
          </button>

          {/* Derecha: acciones */}
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            {/* Monto de efectivo en caja (desktop y mobile) */}
            <div
              className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-2.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200/60 dark:border-emerald-800 shadow-2xs"
              title="Efectivo en caja (Chile)"
            >
              <div className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm flex-shrink-0">
                <Wallet size={11} />
              </div>
              <div className="leading-tight min-w-0">
                <p className="text-[7.5px] sm:text-[8.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">
                  Efectivo
                </p>
                <p className="text-[10px] sm:text-[11px] font-black text-emerald-800 dark:text-emerald-200 tabular-nums truncate">
                  {totalEfectivoHoy > 0 ? `$${totalEfectivoHoy.toLocaleString('es-CL')}` : (totalVentasHoy > 0 ? `$${totalVentasHoy.toLocaleString('es-CL')}` : '$0')}
                </p>
              </div>
            </div>

            {/* CONTADOR IA — solo pantallas muy grandes */}
            <Link
              to="/erp-dashboard/contador-ia"
              className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-900/30 dark:hover:to-orange-900/30 text-amber-700 dark:text-amber-300 text-xs font-semibold transition shadow-sm"
              title="CONTADOR IA — Asesor financiero"
            >
              <TrendingUp size={14} />
              <span>CONTADOR IA</span>
            </Link>

            {/* Estado Firebase */}
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" title="Conectado a Firebase">
              <div className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider">En línea</span>
            </div>

            {/* Shortcuts: Cuadres / Ganancias / POS / BD (despliegan completos en pantallas anchas >= 1280px) */}
            <Link to="/_admin" className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold transition" title="Cuadres">
              <ClipboardList size={14} />
              <span>Cuadres</span>
            </Link>
            <Link to={gananciasLink} className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold transition" title="Ganancias">
              <TrendingUp size={14} />
              <span>Ganancias</span>
            </Link>
            {servicesReady && services.pos && <Link to="/pos" className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold transition" title="POS o POS-admin según tus permisos">
              <BarChart2 size={14} />
              <span>POS</span>
            </Link>}
            <Link to="/base-datos" className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-xs font-semibold transition" title="Base de Datos">
              <Database size={14} />
              <span>BD</span>
            </Link>
            {servicesReady && services.web && (erpUserInfo?.modules?.includes('web') || erpUserInfo?.modules?.includes('admin_supreme') || isSupreme) && (
              <a
                href="/admin/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition"
                title="Ir a la Web (panel de administración)"
              >
                <Store size={14} />
                <span>Web</span>
              </a>
            )}

            {/* Atajos (en pantallas < 1280px / cuadradas / móviles) */}
            <div className="relative xl:hidden">
              <button
                data-hdr-trigger
                onClick={() => { setAtajosOpen(v => !v); setNotifOpen(false); setAvatarOpen(false); setPlusOpen(false); setBranchOpen(false) }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition shadow-2xs ${
                  atajosOpen
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-cyan-500/25'
                    : 'bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20 border-cyan-200/90 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 hover:border-cyan-300'
                }`}
                title="Atajos rápidos"
              >
                <Zap size={12} className={atajosOpen ? 'fill-white' : ''} />
                <span>Atajos</span>
                <ChevronDown size={11} className={`transition-transform duration-200 ${atajosOpen ? 'rotate-180' : ''}`} />
              </button>
              {atajosOpen && (
                <div
                  data-hdr-dropdown
                  className="absolute right-[-45px] top-full mt-2 w-56 !max-w-[calc(100vw-24px)] min-w-[220px] rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-2xl shadow-[0_20px_45px_-10px_rgba(15,23,42,0.25)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                  style={{ maxWidth: 'calc(100vw - 24px)' }}
                >
                  {/* Encabezado del menú de atajos */}
                  <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between bg-gradient-to-r from-cyan-50/80 via-sky-50/60 to-transparent dark:from-cyan-900/30 dark:via-sky-900/20 dark:to-transparent">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                        <Zap size={12} className="fill-cyan-500/20" />
                      </div>
                      <span className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-wider">
                        Atajos Rápidos
                      </span>
                    </div>
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-cyan-100/70 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300">
                      ERP
                    </span>
                  </div>

                  <div className="py-1 divide-y divide-slate-100/70 dark:divide-slate-700/40">
                    {/* Base de Datos (Primero en Atajos) */}
                    <Link
                      to="/base-datos"
                      onClick={() => setAtajosOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-cyan-50/70 dark:hover:bg-cyan-900/20 transition group"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 border border-cyan-100 dark:border-cyan-800/40 shrink-0 group-hover:scale-105 transition-transform">
                        <Database size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">Base de Datos</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">Catálogo maestro & inventario</p>
                      </div>
                      <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    </Link>

                    {/* Cuadres */}
                    <Link
                      to="/_admin"
                      onClick={() => setAtajosOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50/70 dark:hover:bg-rose-900/20 transition group"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 border border-rose-100 dark:border-rose-800/40 shrink-0 group-hover:scale-105 transition-transform">
                        <ClipboardList size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">Cuadres</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">Cortes y turnos de caja</p>
                      </div>
                      <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    </Link>

                    {/* Ganancias */}
                    <Link
                      to={gananciasLink}
                      onClick={() => setAtajosOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50/70 dark:hover:bg-purple-900/20 transition group"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 border border-purple-100 dark:border-purple-800/40 shrink-0 group-hover:scale-105 transition-transform">
                        <TrendingUp size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">Ganancias</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">Métricas y balance del día</p>
                      </div>
                      <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    </Link>

                    {/* POS */}
                    {servicesReady && services.pos && <Link
                      to="/pos"
                      onClick={() => setAtajosOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50/70 dark:hover:bg-blue-900/20 transition group"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 border border-blue-100 dark:border-blue-800/40 shrink-0 group-hover:scale-105 transition-transform">
                        <BarChart2 size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">POS según tu acceso</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">POS o POS-admin según tu rol</p>
                      </div>
                      <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    </Link>}

                    {/* Tienda Web */}
                    {servicesReady && services.web && (erpUserInfo?.modules?.includes('web') || erpUserInfo?.modules?.includes('admin_supreme') || isSupreme) && (
                      <a
                        href="/admin/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setAtajosOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50/70 dark:hover:bg-amber-900/20 transition group"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 border border-amber-100 dark:border-amber-800/40 shrink-0 group-hover:scale-105 transition-transform">
                          <Store size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">Tienda Web</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">Panel de administración web</p>
                        </div>
                        <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Botón + (nuevo registro) */}
            <div className="relative hidden sm:flex">
              <button
                data-hdr-trigger
                onClick={() => { setPlusOpen(v => !v); setNotifOpen(false); setAvatarOpen(false); setBranchOpen(false) }}
                className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500 dark:bg-emerald-600 text-white hover:bg-emerald-600 dark:hover:bg-emerald-500 transition-all"
                title="Nuevo registro"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Buscador mobile */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="lg:hidden flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
              title="Buscar"
            >
              <Search size={18} />
            </button>

            {/* Campana notificaciones */}
            <div className="relative">
              <button
                data-hdr-trigger
                onClick={() => { setNotifOpen(v => !v); setAvatarOpen(false); setPlusOpen(false); setBranchOpen(false) }}
                className="relative flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
                title="Notificaciones"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-black px-1 shadow-md shadow-rose-500/40 ring-2 ring-white dark:ring-slate-900">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Avatar + dropdown */}
            <div className="relative flex">
              <button
                data-hdr-trigger
                onClick={() => { setAvatarOpen(v => !v); setNotifOpen(false); setPlusOpen(false); setBranchOpen(false) }}
                className="flex items-center gap-1 p-0.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title={`Perfil: ${userName}`}
              >
                <div className="relative shrink-0">
                  <div className="relative rounded-xl ring-2 ring-white dark:ring-slate-800 shadow-md h-9 w-9 sm:h-[50px] sm:w-[50px] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                    {userAvatar && !avatarError ? (
                      <img
                        src={userAvatar}
                        alt={userName}
                        className="absolute inset-0 h-full w-full object-cover"
                        ref={(el) => {
                          if (el && el.complete && el.naturalWidth > 0 && !avatarLoaded) setAvatarLoaded(true)
                        }}
                        onLoad={() => setAvatarLoaded(true)}
                        onError={() => { setAvatarLoaded(false); setAvatarError(true) }}
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <span className="text-sm sm:text-base font-black text-white select-none">
                          {(userName || '?')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-900 z-10" />
                </div>
                <ChevronDown size={12} className={`text-slate-400 hidden sm:block transition-transform ${avatarOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Selector de sede en móvil: segunda fila para que no compita con las acciones del header */}
        <div className="md:hidden relative px-3 pb-2.5">
          <button
            data-hdr-trigger
            aria-label={`Cambiar sucursal. Actual: ${activeBranchLabel}`}
            aria-expanded={branchOpen}
            onClick={() => { setBranchOpen(v => !v); setNotifOpen(false); setAvatarOpen(false); setPlusOpen(false) }}
            className={`flex w-full min-h-10 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${activeBranch === 'todas' ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <MapPin size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Sucursal</span>
              <span className="truncate text-xs font-bold">{activeBranchLabel}</span>
            </span>
            <ChevronDown size={15} className={`shrink-0 transition-transform ${branchOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* ═══════════ Dropdown: Selector de sede ═══════════ */}
        {branchOpen && (
          <div data-hdr-dropdown className="absolute left-3 right-3 sm:left-32 sm:right-auto md:left-56 top-full mt-1 w-auto max-w-sm sm:w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl shadow-slate-900/20 overflow-hidden z-50">
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
              <MapPin size={14} className="text-emerald-600" />
              <span className="text-xs font-black text-slate-700 dark:text-white">Sede activa</span>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              <button
                onClick={() => { setActiveBranch('todas'); setBranchOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition ${activeBranch === 'todas' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  <Building2 size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white">Todas las sedes</p>
                  <p className="text-[10px] text-slate-500">Vista consolidada</p>
                </div>
                {activeBranch === 'todas' && <CheckCircle2 size={14} className="text-emerald-500" />}
              </button>
              {branches.map(b => (
                <button
                  key={b.slug}
                  onClick={() => { setActiveBranch(b.slug); setBranchOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition ${activeBranch === b.slug ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-400 text-white shadow-sm">
                    <MapPin size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{b.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{b.slug}</p>
                  </div>
                  {activeBranch === b.slug && <CheckCircle2 size={14} className="text-emerald-500" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════ Dropdown: Botón + (nuevo) ═══════════ */}
        {plusOpen && (
          <div data-hdr-dropdown className="absolute right-24 sm:right-32 top-full mt-1 w-60 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl shadow-slate-900/20 overflow-hidden z-50">
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20">
              <Zap size={14} className="text-violet-600" />
              <span className="text-xs font-black text-slate-700 dark:text-white">Crear rápido</span>
            </div>
            <div className="py-1">
              {[
                { to: '/gastos', label: 'Nuevo gasto', icon: <DollarSign size={13} />, color: 'rose' },
                { to: '/gastos-externos', label: 'Gasto externo', icon: <Receipt size={13} />, color: 'rose' },
                { to: '/adelantos-personal', label: 'Adelanto personal', icon: <Wallet size={13} />, color: 'amber' },
                { to: '/cajeras', label: 'Realizar corte', icon: <FileText size={13} />, color: 'fuchsia' },
                { to: '/transferencias', label: 'Transferencia', icon: <Landmark size={13} />, color: 'cyan' },
                { to: '/whatsapp-gestion', label: 'Contacto WhatsApp', icon: <MessageCircle size={13} />, color: 'green' },
              ].map((a, i) => {
                const cc = colorClasses[a.color] || colorClasses.slate
                return (
                  <button
                    key={i}
                    onClick={() => { navigate(a.to); setPlusOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${cc.light} ${cc.text}`}>
                      {a.icon}
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{a.label}</span>
                    <Plus size={11} className="text-slate-400" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══════════ Dropdown: Notificaciones ═══════════ */}
        {notifOpen && (
          <div data-hdr-dropdown className="absolute right-12 sm:right-14 top-full mt-1 w-80 max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl shadow-slate-900/20 overflow-hidden z-50">
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-rose-600" />
                <span className="text-xs font-black text-slate-700 dark:text-white">Notificaciones</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] font-black text-white bg-rose-500 rounded-full">{unreadCount} nuevas</span>
                )}
              </div>
              <button className="text-[10px] font-bold text-slate-500 hover:text-slate-700">Marcar leídas</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.map(n => {
                const cc = colorClasses[n.color] || colorClasses.slate
                const content = (
                  <>
                    {n.unread && <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${cc.light} ${cc.text} flex-shrink-0 mt-0.5`}>
                      {n.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{n.title}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">{n.desc}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{n.time}</p>
                    </div>
                  </>
                )
                const cls = `relative flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition ${n.unread ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`
                return n.to ? (
                  <Link key={n.id} to={n.to} onClick={() => setNotifOpen(false)} className={cls}>{content}</Link>
                ) : (
                  <div key={n.id} className={cls}>{content}</div>
                )
              })}
              {notifications.length === 0 && (
                <div className="px-4 py-8 text-center text-slate-400 text-xs">Sin notificaciones</div>
              )}
            </div>
            <Link to="/alertas" onClick={() => setNotifOpen(false)} className="flex items-center justify-center gap-1 px-3 py-2 border-t border-slate-100 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
              Ver todas <TrendingUp size={11} />
            </Link>
          </div>
        )}

        {/* ═══════════ Dropdown: Avatar ═══════════ */}
        {avatarOpen && (
          <div data-hdr-dropdown className="absolute right-2 sm:right-4 top-full mt-1 w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl shadow-slate-900/20 overflow-hidden z-50">
            <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-purple-900/20">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl overflow-hidden ring-2 ring-white dark:ring-slate-800 shadow-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 relative">
                  {userAvatar && !avatarError ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={() => { setAvatarLoaded(false); setAvatarError(true) }}
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-base font-black text-white select-none">
                        {(userName || '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800 dark:text-white truncate">{userName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
                  <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Shield size={8} /> {userRole}
                  </span>
                </div>
              </div>
            </div>
            <div className="py-1">
              <button onClick={() => { navigate('/roles'); setAvatarOpen(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                <UserCircle size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Mi perfil</span>
              </button>
              <button onClick={() => { navigate('/admin-supreme'); setAvatarOpen(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                <Settings size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Configuración</span>
              </button>
              <button onClick={() => setDarkMode(v => !v)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                {darkMode ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-slate-500" />}
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex-1">{darkMode ? 'Modo claro' : 'Modo oscuro'}</span>
                <div className={`relative w-8 h-4 rounded-full transition ${darkMode ? 'bg-violet-500' : 'bg-slate-300'}`}>
                  <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${darkMode ? 'left-4' : 'left-0.5'}`} />
                </div>
              </button>
              <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
              <button
                onClick={async () => { await logout(); navigate('/dashboard-login', { replace: true }) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-900/20 transition"
              >
                <LogOut size={14} className="text-rose-500" />
                <span className="text-xs font-bold text-rose-600">Cerrar sesión</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Contenido de la página */}
      <main className="block w-full min-w-0 max-w-none m-0 p-0">
        {children}
      </main>
    </div>
  )
}
