import { collection, doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { PosSellerRole } from './posSellerRoles'

export type AppModule = 'web' | 'pos' | 'pos_admin' | 'erp' | 'erp_admin' | 'admin_supreme' | 'base_datos'

export interface ErpUserRecord {
  email: string
  displayName: string
  photoURL: string
  role: string
  modules: AppModule[]
  branchSlugs: string[]
  trabajadorId?: string
  hasAccount?: boolean
  /** Módulo predeterminado al iniciar sesión (cuando tiene varios). */
  defaultModule?: AppModule | ''
  nivelAccesoPos?: 'bajo' | 'medio' | 'alto'
  rolOperativoPos?: PosSellerRole
}

const ERP_USERS_COLLECTION = 'erp_users'
const ERP_USER_CACHE_PREFIX = 'yaxsel_erp_user_cache_v1_'
const ERP_USER_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutos antes de refrescar en background

function readCachedErpUser(docId: string): { record: ErpUserRecord; ts: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${ERP_USER_CACHE_PREFIX}${docId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.record && parsed.record.email) {
      return { record: parsed.record as ErpUserRecord, ts: Number(parsed.ts) || 0 }
    }
  } catch {}
  return null
}

function writeCachedErpUser(docId: string, record: ErpUserRecord) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${ERP_USER_CACHE_PREFIX}${docId}`, JSON.stringify({ record, ts: Date.now() }))
  } catch {}
}

/** Obtiene el registro de erp_users por email con caché persistente anti-desconexión */
export async function getErpUserByEmail(email: string, forceRefresh = false): Promise<ErpUserRecord | null> {
  const cleanEmail = String(email || '').toLowerCase().trim()
  if (!cleanEmail) return null
  const docId = cleanEmail.replace(/[^a-z0-9_-]/g, '_')
  const cached = readCachedErpUser(docId)

  // Si tenemos caché fresca y no es forceRefresh, devolver de inmediato (0 lecturas Firestore)
  if (!forceRefresh && cached && (Date.now() - cached.ts < ERP_USER_CACHE_TTL_MS)) {
    return cached.record
  }

  const fetchFromFirestore = async (): Promise<ErpUserRecord | null> => {
    try {
      const ref = doc(db, ERP_USERS_COLLECTION, docId)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        return cached?.record || null
      }
      const data = snap.data()
      const record: ErpUserRecord = {
        email: data.email || cleanEmail,
        displayName: String(data.displayName || ''),
        photoURL: String(data.photoURL || ''),
        role: data.role || 'visitante',
        modules: Array.isArray(data.modules) ? data.modules : ['erp'],
        branchSlugs: Array.isArray(data.branchSlugs) ? data.branchSlugs : [],
        trabajadorId: data.trabajadorId || '',
        hasAccount: Boolean(data.hasAccount),
        defaultModule: (data.defaultModule as AppModule | undefined) || '',
        nivelAccesoPos: data.nivelAccesoPos === 'bajo' || data.nivelAccesoPos === 'medio' || data.nivelAccesoPos === 'alto' ? data.nivelAccesoPos : undefined,
        rolOperativoPos: data.rolOperativoPos === 'cajero_express' ? 'cajero_express' : data.rolOperativoPos === 'ayudante_caja' ? 'ayudante_caja' : undefined,
      }
      writeCachedErpUser(docId, record)
      return record
    } catch (e) {
      console.error('[erpUserService] getErpUserByEmail error (usando caché si existe):', e)
      return cached?.record || null
    }
  }

  // Si ya hay caché pero expiró el TTL, devolver la caché al instante y revalidar en segundo plano
  if (!forceRefresh && cached) {
    void fetchFromFirestore()
    return cached.record
  }

  return await fetchFromFirestore()
}

/** Determina la ruta de redirección según los módulos del usuario */
export function getRedirectForModules(modules: AppModule[], isSupreme: boolean, defaultModule?: AppModule | ''): string {
  if (isSupreme || modules.includes('admin_supreme')) return '/erp-dashboard'
  if (modules.length === 0) return '/erp-dashboard'

  // Si el admin supremo configuró un módulo predeterminado y el usuario lo tiene, ir ahí primero
  if (defaultModule && modules.includes(defaultModule)) {
    if (defaultModule === 'pos' || defaultModule === 'pos_admin') return '/pos-acceso'
    if (defaultModule === 'erp' || defaultModule === 'erp_admin') return '/erp-dashboard'
    if (defaultModule === 'base_datos') return '/erp-dashboard/base-datos'
    if (defaultModule === 'web') return '/admin/dashboard'
  }

  // Prioridad automática si no hay predeterminado
  // Resolver entre POS y POS-admin según los permisos reales de la cuenta.
  if (modules.includes('pos') || modules.includes('pos_admin')) return '/pos-acceso'
  if (modules.includes('erp') || modules.includes('erp_admin')) return '/erp-dashboard'
  if (modules.includes('base_datos')) return '/erp-dashboard/base-datos'
  if (modules.includes('web')) return '/admin/dashboard'
  return '/erp-dashboard'
}

/** Verifica si el usuario tiene acceso a un módulo específico */
export function hasModuleAccess(modules: AppModule[] | undefined, module: AppModule): boolean {
  if (!modules) return false
  if (modules.includes('admin_supreme')) return true
  // pos_admin incluye pos
  if (module === 'pos' && (modules.includes('pos') || modules.includes('pos_admin'))) return true
  // erp_admin incluye erp
  if (module === 'erp' && (modules.includes('erp') || modules.includes('erp_admin'))) return true
  // base_datos incluye erp y erp_admin
  if (module === 'base_datos' && (modules.includes('base_datos') || modules.includes('erp') || modules.includes('erp_admin'))) return true
  return modules.includes(module)
}
