// src/lib/trabajadoresErpService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit as fbLimit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { SedeSlug } from '@/types'
import type { PosAccessLevel } from '@/lib/posAccessLevels'
import type { PosSellerRole } from '@/lib/posSellerRoles'

export const TRABAJADORES_COLLECTION = 'trabajadores_erp'

export interface TrabajadorERP {
  $id: string
  nombre: string
  cargo: string
  /** Cargos adicionales del trabajador. `cargo` conserva el cargo principal por compatibilidad. */
  cargos?: string[]
  sede: SedeSlug
  /** Sucursales adicionales donde puede operar; `sede` es la principal. */
  sedesAdicionales?: string[]
  sueldo: number
  fotoUrl: string
  activo: boolean
  posActivo?: boolean
  puedeGestionarCaja?: boolean | null
  nivelAccesoPos?: PosAccessLevel
  rolOperativoPos?: PosSellerRole
  rolesAdicionales?: Array<'web'>
  nacionalidad?: string
  genero?: string
  fechaIngreso?: string
  telefono?: string
  adelantos?: Array<{ id: string; ymd: string; monto: number; descripcion?: string; creadoEn: number; anulada?: boolean }>
  asistencia?: Record<string, 'trabajo' | 'falta' | 'justificado'>
  reportes?: Array<{ id: string; tipo: 'tardanza' | 'descuento' | 'justificacion'; ymd: string; monto?: number; descripcion?: string; creadoEn: number }>
}

export function normalizeTrabajadorCargos(cargos: unknown, cargoPrincipal?: unknown): string[] {
  const source = Array.isArray(cargos) ? cargos : []
  const roles = source.map(value => String(value || '').trim()).filter(Boolean)
  const fallback = String(cargoPrincipal || '').trim()
  if (fallback && !roles.some(role => role.toLocaleLowerCase('es') === fallback.toLocaleLowerCase('es'))) roles.unshift(fallback)
  const unique = new Map<string, string>()
  roles.forEach(role => unique.set(role.toLocaleLowerCase('es'), role))
  return [...unique.values()]
}

export function cargoPrincipalTrabajador(cargos: unknown, fallback?: unknown): string {
  const roles = normalizeTrabajadorCargos(cargos, fallback)
  const operationalRole = roles.find(role => /^(cajer[oa]|vendedor[oa])$/i.test(role))
  return operationalRole || roles.find(role => role.toLocaleLowerCase('es') !== 'web') || roles[0] || ''
}

function cleanFotoUrl(url?: any): string {
  if (!url) return ''
  const str = String(url).trim()
  if (!str) return ''
  // Descartar URLs legacy de Appwrite que dan 404
  if (str.includes('/storage/buckets/') && !str.includes('firebasestorage.googleapis.com')) {
    return ''
  }
  return str
}

function deserialize(d: any): TrabajadorERP {
  const cargos = normalizeTrabajadorCargos(
    [...(Array.isArray(d.cargos) ? d.cargos : []), ...(Array.isArray(d.rolesAdicionales) && d.rolesAdicionales.includes('web') ? ['WEB'] : [])],
    d.cargo,
  )
  return {
    $id: d.$id || d.id || '',
    nombre: String(d.nombre || ''),
    cargo: String(d.cargo || cargoPrincipalTrabajador(cargos)),
    cargos,
    sede: (d.sede || 'donbalato-central') as SedeSlug,
    sedesAdicionales: Array.isArray(d.sedesAdicionales) ? d.sedesAdicionales.map(String).filter(Boolean) : [],
    sueldo: Number(d.sueldo) || 0,
    fotoUrl: cleanFotoUrl(d.fotoUrl),
    activo: d.activo !== false,
    posActivo: d.posActivo !== false,
    puedeGestionarCaja: typeof d.puedeGestionarCaja === 'boolean' ? d.puedeGestionarCaja : null,
    nivelAccesoPos: d.nivelAccesoPos === 'bajo' || d.nivelAccesoPos === 'medio' || d.nivelAccesoPos === 'alto' ? d.nivelAccesoPos : undefined,
    rolOperativoPos: d.rolOperativoPos === 'cajero_express' ? 'cajero_express' : d.rolOperativoPos === 'ayudante_caja' ? 'ayudante_caja' : undefined,
    rolesAdicionales: Array.isArray(d.rolesAdicionales) && d.rolesAdicionales.includes('web') ? ['web'] : [],
    nacionalidad: d.nacionalidad || '',
    genero: d.genero || d.sexo || '',
    fechaIngreso: d.fechaIngreso || '',
    telefono: d.telefono || '',
    adelantos: Array.isArray(d.adelantos) ? d.adelantos : [],
    asistencia: d.asistencia && typeof d.asistencia === 'object' ? d.asistencia : {},
    reportes: Array.isArray(d.reportes) ? d.reportes : [],
  }
}

/** Carga todos los trabajadores con caché en RAM + localStorage de 6h */
const TRAB_CACHE_KEY = 'donbalato_trabajadores_cache_v4'
const TRAB_CACHE_TTL = 6 * 60 * 60 * 1000
let _trabMemoryCache: { timestamp: number; items: TrabajadorERP[] } | null = null
let _trabInflight: Promise<TrabajadorERP[]> | null = null
const _singleTrabMemoryCache = new Map<string, { timestamp: number; item: TrabajadorERP | null }>()

export function invalidateTrabajadoresCache(): void {
  _trabMemoryCache = null
  _trabInflight = null
  _singleTrabMemoryCache.clear()
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TRAB_CACHE_KEY)
    localStorage.removeItem('donbalato_trabajadores_cache_v3')
    localStorage.removeItem('donbalato_trabajadores_cache_v2')
    localStorage.removeItem('yaxsel_trabajadores_cache_v1')
  } catch {}
}

export async function fetchTrabajadoresERP(forceRefresh = false): Promise<TrabajadorERP[]> {
  // Comparte una lectura ya iniciada aunque quien llegue después pida refresh;
  // así dos verificaciones simultáneas del POS no duplican la consulta completa.
  if (_trabInflight) return _trabInflight

  if (!forceRefresh) {
    if (_trabMemoryCache && Date.now() - _trabMemoryCache.timestamp < TRAB_CACHE_TTL) {
      return _trabMemoryCache.items
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(TRAB_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.timestamp && Date.now() - parsed.timestamp < TRAB_CACHE_TTL && Array.isArray(parsed.items)) {
            _trabMemoryCache = { timestamp: parsed.timestamp, items: parsed.items }
            return parsed.items
          }
        }
      } catch {}
    }
  }

  const runFetch = async (): Promise<TrabajadorERP[]> => {
    try {
      const colRef = collection(db, TRABAJADORES_COLLECTION)
      const snap = await getDocs(colRef)
      const items: TrabajadorERP[] = []

      snap.forEach((d) => {
        if (d.id !== '_init') {
          items.push(deserialize({ $id: d.id, ...d.data() }))
        }
      })

      const now = Date.now()
      _trabMemoryCache = { timestamp: now, items }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TRAB_CACHE_KEY, JSON.stringify({ timestamp: now, items }))
        } catch {}
      }

      return items
    } catch (err) {
      console.error('[trabajadoresErpService] fetchTrabajadoresERP error:', err)
      if (_trabMemoryCache) return _trabMemoryCache.items
      // Fallback a caché aunque esté expirada
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(TRAB_CACHE_KEY)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed?.items)) return parsed.items
          }
        } catch {}
      }
      return []
    } finally {
      _trabInflight = null
    }
  }

  _trabInflight = runFetch()
  return _trabInflight
}

/** Lee solo el trabajador asociado a una cuenta, reutilizando primero la caché en RAM o localStorage. */
export async function fetchTrabajadorERP(trabajadorId?: string, displayName?: string): Promise<TrabajadorERP | null> {
  const idClean = String(trabajadorId || '').trim()
  const nameClean = String(displayName || '').trim()
  if (!idClean && !nameClean) return null

  const findInList = (list: TrabajadorERP[]): TrabajadorERP | null => {
    if (idClean) {
      const byId = list.find((w) => w.$id === idClean)
      if (byId) return byId
    }
    if (nameClean) {
      const lower = nameClean.toLowerCase()
      const byName = list.find((w) => String(w.nombre || '').trim().toLowerCase() === lower)
      if (byName) return byName
    }
    return null
  }

  // 1. Buscar en caché completa en memoria
  if (_trabMemoryCache && Date.now() - _trabMemoryCache.timestamp < TRAB_CACHE_TTL) {
    const match = findInList(_trabMemoryCache.items)
    if (match) return match
  }

  // 2. Buscar en caché completa de localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(TRAB_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.timestamp && Date.now() - parsed.timestamp < TRAB_CACHE_TTL && Array.isArray(parsed.items)) {
          _trabMemoryCache = { timestamp: parsed.timestamp, items: parsed.items }
          const match = findInList(parsed.items)
          if (match) return match
        }
      }
    } catch {}
  }

  // 3. Si ya hay una descarga de trabajadores en curso, esperarla en vez de hacer otra lectura
  if (_trabInflight) {
    try {
      const list = await _trabInflight
      const match = findInList(list)
      if (match) return match
    } catch {}
  }

  // 4. Buscar en caché individual en memoria
  const cacheKey = `${idClean}::${nameClean.toLowerCase()}`
  const cachedSingle = _singleTrabMemoryCache.get(cacheKey)
  if (cachedSingle && Date.now() - cachedSingle.timestamp < TRAB_CACHE_TTL) {
    return cachedSingle.item
  }

  try {
    if (idClean) {
      const snap = await getDoc(doc(db, TRABAJADORES_COLLECTION, idClean))
      if (snap.exists()) {
        const item = deserialize({ $id: snap.id, ...snap.data() })
        _singleTrabMemoryCache.set(cacheKey, { timestamp: Date.now(), item })
        return item
      }
    }
    if (!nameClean) {
      _singleTrabMemoryCache.set(cacheKey, { timestamp: Date.now(), item: null })
      return null
    }
    const matches = await getDocs(query(
      collection(db, TRABAJADORES_COLLECTION),
      where('nombre', '==', nameClean),
      fbLimit(1),
    ))
    const first = matches.docs[0]
    const item = first ? deserialize({ $id: first.id, ...first.data() }) : null
    _singleTrabMemoryCache.set(cacheKey, { timestamp: Date.now(), item })
    return item
  } catch (err) {
    console.error('[trabajadoresErpService] fetchTrabajadorERP error:', err)
    return null
  }
}

/** Crea un trabajador (para la gestión de equipo o POS). */
export async function createTrabajadorERP(
  t: Omit<TrabajadorERP, '$id'>
): Promise<TrabajadorERP | null> {
  try {
    const colRef = collection(db, TRABAJADORES_COLLECTION)
    const safeFotoUrl = String(t.fotoUrl || '')
    const cargos = normalizeTrabajadorCargos([
      ...(Array.isArray(t.cargos) ? t.cargos : []),
      ...(Array.isArray(t.rolesAdicionales) && t.rolesAdicionales.includes('web') ? ['WEB'] : []),
    ], t.cargo || 'Operativo')
    const payload = {
      nombre: t.nombre || 'Sin nombre',
      cargo: cargoPrincipalTrabajador(cargos) || 'Operativo',
      cargos,
      sede: t.sede || 'donbalato-central',
      sedesAdicionales: Array.isArray(t.sedesAdicionales) ? [...new Set(t.sedesAdicionales.map(String).filter(Boolean))] : [],
      sueldo: Number(t.sueldo) || 0,
      fotoUrl: safeFotoUrl,
      activo: t.activo !== false,
      posActivo: t.posActivo !== false,
      puedeGestionarCaja: t.puedeGestionarCaja ?? null,
      nivelAccesoPos: t.nivelAccesoPos || 'bajo',
      rolesAdicionales: cargos.some(role => role.toLocaleLowerCase('es') === 'web') ? ['web'] : [],
      nacionalidad: t.nacionalidad || '',
      genero: t.genero || '',
      fechaIngreso: t.fechaIngreso || '',
      creadoEn: Date.now(),
    }
    const docRef = await addDoc(colRef, payload)
    invalidateTrabajadoresCache()
    return deserialize({ $id: docRef.id, ...payload })
  } catch (err) {
    console.error('[trabajadoresErpService] createTrabajadorERP error:', err)
    return null
  }
}

/** Elimina un trabajador por su ID. */
export async function deleteTrabajadorERP(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, TRABAJADORES_COLLECTION, id)
    await deleteDoc(docRef)
    invalidateTrabajadoresCache()
    return true
  } catch (err) {
    console.error('[trabajadoresErpService] deleteTrabajadorERP error:', err)
    return false
  }
}

/** Actualiza un trabajador por su ID. */
export async function updateTrabajadorERP(
  id: string,
  data: Partial<Omit<TrabajadorERP, '$id'>>
): Promise<boolean> {
  try {
    const docRef = doc(db, TRABAJADORES_COLLECTION, id)
    const updates: Record<string, any> = {
      actualizadoEn: Date.now(),
    }
    if (data.nombre !== undefined) updates.nombre = data.nombre
    if (data.cargos !== undefined) {
      const cargos = normalizeTrabajadorCargos(data.cargos, data.cargo)
      if (cargos.length) {
        updates.cargos = cargos
        updates.cargo = cargoPrincipalTrabajador(cargos)
        updates.rolesAdicionales = cargos.some(role => role.toLocaleLowerCase('es') === 'web') ? ['web'] : []
      }
    } else if (data.cargo !== undefined) {
      updates.cargo = data.cargo
      updates.cargos = normalizeTrabajadorCargos([data.cargo])
    }
    if (data.sede !== undefined) updates.sede = data.sede
    if (data.sedesAdicionales !== undefined) updates.sedesAdicionales = Array.isArray(data.sedesAdicionales) ? [...new Set(data.sedesAdicionales.map(String).filter(Boolean))] : []
    if (data.sueldo !== undefined) updates.sueldo = Number(data.sueldo)
    if (data.fotoUrl !== undefined) updates.fotoUrl = String(data.fotoUrl || '')
    if (data.activo !== undefined) updates.activo = data.activo
    if (data.posActivo !== undefined) updates.posActivo = data.posActivo
    if (data.puedeGestionarCaja !== undefined) updates.puedeGestionarCaja = data.puedeGestionarCaja
    if (data.nivelAccesoPos !== undefined) updates.nivelAccesoPos = data.nivelAccesoPos
    if (data.rolesAdicionales !== undefined) updates.rolesAdicionales = Array.isArray(data.rolesAdicionales) && data.rolesAdicionales.includes('web') ? ['web'] : []
    if (data.nacionalidad !== undefined) updates.nacionalidad = data.nacionalidad
    if (data.genero !== undefined) updates.genero = data.genero
    if (data.fechaIngreso !== undefined) updates.fechaIngreso = data.fechaIngreso
    if (data.telefono !== undefined) updates.telefono = data.telefono
    if (data.adelantos !== undefined) updates.adelantos = data.adelantos
    if (data.asistencia !== undefined) updates.asistencia = data.asistencia
    if (data.reportes !== undefined) updates.reportes = data.reportes

    await updateDoc(docRef, updates)
    invalidateTrabajadoresCache()

    // Sincronizar sucursales autorizadas en erp_users si existe cuenta asociada
    if (updates.sede !== undefined || updates.sedesAdicionales !== undefined) {
      try {
        const currentSnap = await getDoc(docRef)
        const currentData = currentSnap.data() || {}
        const primary = String(updates.sede !== undefined ? updates.sede : (currentData.sede || '')).trim()
        const addl = updates.sedesAdicionales !== undefined ? updates.sedesAdicionales : (currentData.sedesAdicionales || [])
        const fullBranches = [...new Set([primary, ...(Array.isArray(addl) ? addl.map(String) : [])].filter(Boolean))]

        const erpUsersRef = collection(db, 'erp_users')
        const userMatches = await getDocs(query(erpUsersRef, where('trabajadorId', '==', id), fbLimit(1)))
        let userDoc = userMatches.docs[0]
        if (!userDoc && currentData.nombre) {
          const nameMatches = await getDocs(query(erpUsersRef, where('displayName', '==', currentData.nombre), fbLimit(1)))
          userDoc = nameMatches.docs[0]
        }
        if (userDoc && String(userDoc.data().email || '').toLowerCase() !== 'dezkonet@gmail.com') {
          await updateDoc(userDoc.ref, { branchSlugs: fullBranches, updatedAt: Date.now() })
        }
      } catch (syncErr) {
        console.warn('[trabajadoresErpService] No se pudo sincronizar sucursales con erp_users:', syncErr)
      }
    }

    return true
  } catch (err) {
    console.error('[trabajadoresErpService] updateTrabajadorERP error:', err)
    return false
  }
}
