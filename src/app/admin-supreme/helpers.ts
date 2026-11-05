import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const ERP_CONFIG_COLLECTION = 'erp_config'
const ERP_USERS_COLLECTION = 'erp_users'

export type AppRole = 'admin_supremo' | 'admin' | 'encargador' | 'trabajador' | 'visitante'
export const APP_ROLES: AppRole[] = ['admin_supremo', 'admin', 'encargador', 'trabajador', 'visitante']

export type AppModule = 'web' | 'pos' | 'pos_admin' | 'erp' | 'erp_admin' | 'admin_supreme' | 'base_datos'
export const APP_MODULES: AppModule[] = ['web', 'pos', 'pos_admin', 'erp', 'erp_admin', 'admin_supreme', 'base_datos']
export const MODULE_LABELS: Record<AppModule, string> = {
  web: '🛒 Web (Tienda + Admin)',
  pos: '📍 POS Terminal',
  pos_admin: '📍 POS + Dashboard',
  erp: '📊 ERP Dashboard',
  erp_admin: '📊 ERP + Configuración',
  admin_supreme: '👑 Admin Supreme',
  base_datos: '🗄️ Base de Datos (Catálogo)',
}

// Estructura de módulos principales y sus sub-permisos
export const MODULE_TREE: { main: AppModule; label: string; icon: string; sub: { id: AppModule; label: string; desc: string }[] }[] = [
  {
    main: 'pos',
    label: 'POS',
    icon: '📍',
    sub: [
      { id: 'pos', label: 'Solo Terminal', desc: 'Caja y ventas en /pos' },
      { id: 'pos_admin', label: 'Terminal + Dashboard', desc: 'POS + /pos-admin (productos, stock, informes)' },
    ],
  },
  {
    main: 'erp',
    label: 'ERP',
    icon: '📊',
    sub: [
      { id: 'erp', label: 'Dashboard básico', desc: 'Ver dashboard, ventas y sucursales' },
      { id: 'erp_admin', label: 'Dashboard + Configuración', desc: 'ERP completo: equipo, gastos, alertas, sucursales' },
      { id: 'base_datos', label: 'Base de Datos (Catálogo)', desc: 'Acceso directo a gestión de productos en /erp-dashboard/base-datos' },
    ],
  },
  {
    main: 'web',
    label: 'Web',
    icon: '🛒',
    sub: [
      { id: 'web', label: 'Tienda + Admin', desc: 'Panel web: productos, pedidos, clientes' },
    ],
  },
]

export interface AppUserRecord {
  email: string
  displayName: string
  photoURL: string
  role: AppRole
  modules: AppModule[]
  branchSlugs: string[]
  trabajadorId?: string
  hasAccount?: boolean
  createdAt?: number
  createdBy?: string
  /** Módulo predeterminado al iniciar sesión (cuando tiene varios). Si no se setea, se usa la prioridad automática. */
  defaultModule?: AppModule | ''
}

export interface BranchConfig {
  slug: string
  name: string
  region: string
  icon: string
  color: string
  imageUrl: string
  managerEmail: string
  active: boolean
}

export interface RuntimeAppConfig {
  companyName: string
  legalName: string
  companyDescription: string
  supremeAdminEmail: string
  sparkMode: boolean
  branding: {
    companyLogoUrl: string
    defaultUserAvatarUrl: string
    titleColor: string
  }
  ownerProfile: {
    displayName: string
    email: string
    photoURL: string
  }
  firebase: {
    projectId: string
    apiKey: string
    authDomain: string
    appId: string
    storageBucket: string
    messagingSenderId: string
    recaptchaV3SiteKey: string
  }
  branches: BranchConfig[]
}

export function getDefaultRuntimeConfig(): RuntimeAppConfig {
  return {
    companyName: 'Importadora Carlitos',
    legalName: 'Importadora Carlitos Mayorista',
    companyDescription: 'Importadora Carlitos - Tienda Oficial y Mayorista',
    supremeAdminEmail: '',
    sparkMode: true,
    branding: {
      companyLogoUrl: '/images/optimized/logo-carlitos.svg',
      defaultUserAvatarUrl: '/avatar.png',
      titleColor: '#3b82f6',
    },
    ownerProfile: {
      displayName: 'Administrador',
      email: 'dezkonet@gmail.com',
      photoURL: '/avatar.png',
    },
    firebase: {
      projectId: 'importadora-carlitos',
      apiKey: 'AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE',
      authDomain: 'importadora-carlitos.firebaseapp.com',
      appId: '1:289604179340:web:9d3f876c8aafeceedef2a9',
      storageBucket: 'importadora-carlitos.firebasestorage.app',
      messagingSenderId: '289604179340',
      recaptchaV3SiteKey: '',
    },
    branches: [
      { slug: 'donbalato-central', name: 'Importadora Carlitos Central', region: 'Santiago', icon: '🏪', color: 'blue', imageUrl: '', managerEmail: '', active: true },
    ],
  }
}

export function mergeRuntimeConfig(base: RuntimeAppConfig, incoming?: Partial<RuntimeAppConfig> | null): RuntimeAppConfig {
  const baseBranchMap = new Map(base.branches.map((branch) => [branch.slug, branch]))
  return {
    ...base,
    ...(incoming || {}),
    companyName: String(incoming?.companyName || base.companyName),
    legalName: String(incoming?.legalName || incoming?.companyName || base.legalName),
    companyDescription: String(incoming?.companyDescription || base.companyDescription),
    supremeAdminEmail: String(incoming?.supremeAdminEmail || incoming?.ownerProfile?.email || base.supremeAdminEmail).trim().toLowerCase(),
    branding: { ...base.branding, ...(incoming?.branding || {}) },
    ownerProfile: { ...base.ownerProfile, ...(incoming?.ownerProfile || {}) },
    firebase: { ...base.firebase, ...(incoming?.firebase || {}) },
    branches: Array.isArray(incoming?.branches)
      ? incoming.branches.map((branch) => ({ ...(baseBranchMap.get(branch.slug) || {}), ...branch }))
      : base.branches.map((branch) => ({ ...branch })),
  }
}

export function createEmptyBranch(): BranchConfig {
  return { slug: '', name: '', region: '', icon: '🏬', color: 'slate', imageUrl: '', managerEmail: '', active: true }
}

export function sanitize(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase()
}

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(stripUndefined) as T
  if (typeof obj === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) { if (v !== undefined) clean[k] = stripUndefined(v) }
    return clean as T
  }
  return obj
}

export async function loadConfig(): Promise<RuntimeAppConfig | null> {
  try {
    const res = await fetch(`/api/admin-supreme/load-config?_t=${Date.now()}`)
    if (!res.ok) return null
    const json = await res.json()
    if (!json.ok || !json.data) return null
    const parsed = JSON.parse(json.data)
    return mergeRuntimeConfig(getDefaultRuntimeConfig(), parsed)
  } catch { return null }
}

export async function saveConfig(config: RuntimeAppConfig): Promise<boolean> {
  try {
    const data = JSON.stringify(stripUndefined(config))
    const res = await fetch('/api/admin-supreme/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      console.error('[admin-supreme] saveConfig error:', errJson)
      return false
    }
    const json = await res.json()
    return !!json.ok
  } catch (e) { console.error('[admin-supreme] saveConfig error:', e); return false }
}

export async function deleteConfig(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin-supreme/delete-config', { method: 'POST' })
    const json = await res.json()
    return !!json.ok
  } catch { return false }
}

export async function loadUsers(): Promise<AppUserRecord[]> {
  try {
    const colRef = collection(db, ERP_USERS_COLLECTION)
    const snap = await getDocs(colRef)
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        email: data.email || d.id,
        displayName: String(data.displayName || data.email || ''),
        photoURL: String(data.photoURL || ''),
        role: (data.role as AppRole) || 'visitante',
        modules: Array.isArray(data.modules) ? data.modules : ['erp'] as AppModule[],
        branchSlugs: Array.isArray(data.branchSlugs)
          ? data.branchSlugs
          : (() => { try { return JSON.parse(data.branchSlugs || '[]') } catch { return [] } })(),
        trabajadorId: String(data.trabajadorId || ''),
        hasAccount: Boolean(data.hasAccount),
        createdAt: Number(data.createdAt || 0),
        createdBy: String(data.createdBy || ''),
        defaultModule: (data.defaultModule as AppModule | undefined) || '',
      }
    })
  } catch (e) {
    console.error('[admin-supreme] loadUsers error:', e)
    return []
  }
}

export async function saveUserToAppwrite(user: AppUserRecord): Promise<boolean> {
  try {
    const docId = user.email.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')
    const docRef = doc(db, ERP_USERS_COLLECTION, docId)
    const payload = {
      email: user.email.toLowerCase().trim(),
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      modules: user.modules || ['erp'],
      branchSlugs: user.branchSlugs || [],
      trabajadorId: user.trabajadorId || '',
      hasAccount: user.hasAccount ?? false,
      createdAt: user.createdAt || Date.now(),
      createdBy: user.createdBy || '',
      defaultModule: user.defaultModule || '',
    }
    await setDoc(docRef, payload, { merge: true })
    return true
  } catch (e) {
    console.error('[admin-supreme] saveUser error:', e)
    return false
  }
}

export async function deleteUserFromAppwrite(email: string): Promise<boolean> {
  try {
    const docId = email.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')
    const docRef = doc(db, ERP_USERS_COLLECTION, docId)
    await deleteDoc(docRef)
    return true
  } catch (e) {
    console.error('[admin-supreme] deleteUser error:', e)
    return false
  }
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin_supremo: '👑 Supremo', admin: '🔥 Admin', encargador: '🛡️ Encargado',
  trabajador: '👷 Trabajador', visitante: '👁️ Visitante',
}
export const ROLE_COLORS: Record<AppRole, string> = {
  admin_supremo: 'border-amber-300/70 bg-amber-50/80 text-amber-700',
  admin: 'border-rose-300/70 bg-rose-50/80 text-rose-700',
  encargador: 'border-blue-300/70 bg-blue-50/80 text-blue-700',
  trabajador: 'border-emerald-300/70 bg-emerald-50/80 text-emerald-700',
  visitante: 'border-slate-300/70 bg-slate-50/80 text-slate-600',
}

export type SectionTone = 'brand' | 'owner' | 'branches' | 'firebase' | 'users' | 'checklist'
export const SECTION_STYLES: Record<SectionTone, { shell: string; strip: string; icon: string; badge: string }> = {
  brand: { shell: 'from-sky-50/90 to-violet-50/80', strip: 'from-sky-400/80 via-cyan-300/70 to-violet-300/70', icon: 'bg-gradient-to-br from-sky-500 to-violet-500 text-white', badge: 'bg-sky-100/80 text-sky-700 border-sky-200/70' },
  owner: { shell: 'from-amber-50/90 to-rose-50/80', strip: 'from-amber-400/80 via-orange-300/70 to-rose-300/70', icon: 'bg-gradient-to-br from-amber-500 to-rose-500 text-white', badge: 'bg-amber-100/80 text-amber-700 border-amber-200/70' },
  branches: { shell: 'from-emerald-50/90 to-teal-50/80', strip: 'from-emerald-400/80 via-teal-300/70 to-cyan-300/70', icon: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white', badge: 'bg-emerald-100/80 text-emerald-700 border-emerald-200/70' },
  firebase: { shell: 'from-blue-50/90 to-indigo-50/80', strip: 'from-blue-400/80 via-cyan-300/70 to-indigo-300/70', icon: 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white', badge: 'bg-blue-100/80 text-blue-700 border-blue-200/70' },
  users: { shell: 'from-fuchsia-50/90 to-violet-50/80', strip: 'from-fuchsia-400/80 via-pink-300/70 to-violet-300/70', icon: 'bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white', badge: 'bg-fuchsia-100/80 text-fuchsia-700 border-fuchsia-200/70' },
  checklist: { shell: 'from-orange-50/90 to-amber-50/80', strip: 'from-orange-400/80 via-amber-300/70 to-yellow-300/70', icon: 'bg-gradient-to-br from-orange-500 to-amber-500 text-white', badge: 'bg-orange-100/80 text-orange-700 border-orange-200/70' },
}

export const ADMIN_SUPREME_ALLOWED_EMAIL = 'dezkonet@gmail.com'

export const PARTICLES = [
  { left: '4%', top: '6%', size: 'h-2 w-2', color: 'bg-sky-200/80', delay: '0s', duration: '4.2s' },
  { left: '14%', top: '18%', size: 'h-3 w-3', color: 'bg-violet-200/80', delay: '1.1s', duration: '5.1s' },
  { left: '28%', top: '10%', size: 'h-2 w-2', color: 'bg-cyan-200/80', delay: '0.4s', duration: '4.6s' },
  { left: '42%', top: '16%', size: 'h-1.5 w-1.5', color: 'bg-fuchsia-200/80', delay: '1.8s', duration: '3.8s' },
  { left: '55%', top: '8%', size: 'h-3 w-3', color: 'bg-emerald-200/80', delay: '0.8s', duration: '5.6s' },
  { left: '68%', top: '14%', size: 'h-2 w-2', color: 'bg-amber-200/80', delay: '1.5s', duration: '4.1s' },
  { left: '82%', top: '12%', size: 'h-1.5 w-1.5', color: 'bg-rose-200/80', delay: '0.2s', duration: '3.7s' },
  { left: '91%', top: '22%', size: 'h-2.5 w-2.5', color: 'bg-blue-200/80', delay: '2s', duration: '5s' },
  { left: '10%', top: '54%', size: 'h-2 w-2', color: 'bg-teal-200/80', delay: '0.6s', duration: '4.4s' },
  { left: '22%', top: '68%', size: 'h-1.5 w-1.5', color: 'bg-sky-200/80', delay: '1.7s', duration: '3.9s' },
  { left: '38%', top: '60%', size: 'h-2.5 w-2.5', color: 'bg-violet-200/80', delay: '0.9s', duration: '5.4s' },
  { left: '53%', top: '72%', size: 'h-2 w-2', color: 'bg-fuchsia-200/80', delay: '1.4s', duration: '4.8s' },
  { left: '70%', top: '66%', size: 'h-1.5 w-1.5', color: 'bg-emerald-200/80', delay: '0.3s', duration: '3.6s' },
  { left: '84%', top: '58%', size: 'h-2 w-2', color: 'bg-cyan-200/80', delay: '1.9s', duration: '4.7s' },
]
