// src/lib/cuadresErpService.ts
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { SEDE_SLUGS, type SedeSlug } from '@/types'

export const CUADRES_COLLECTION = 'cuadres_erp'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface CuadreGasto {
  monto: number
  tipo?: string
  tipoGasto?: string
  categoria?: string
  observacion?: string
  detalle?: string
  esDevolucion?: boolean
  esAnulada?: boolean
  folio?: string
}

export interface CuadreTopProduct {
  sku: string
  nombre: string
  cantidadVendida: number
  ventasBrutas: number
  ventasNetas: number
  costoNeto: number
}

export interface CuadreFoto {
  url: string
  tipo: 'gasto' | 'corte'
  gastoIndex?: number
  name?: string
  caja?: 1 | 2
}

export interface CuadreAnulada {
  monto: number
  observacion?: string
  folio?: string
}

export interface CuadreAnalisisProductos {
  ventasBrutas: number
  costoProductos: number
  gananciaBruta: number
  margenBrutoPct: number
  unidades: number
  productosUnicos: number
  fuente: string
  productosExcluidos?: Array<{ sku: string; nombre: string; cantidad: number; ventaBruta: number; motivo: string }>
  updatedAt?: string
}

export interface CuadreERP {
  $id: string
  sede: SedeSlug
  fecha: string            // 'YYYY-MM-DD'
  estado: string           // 'pendiente' | 'enviado'
  cajerosListos?: string[]
  cajeroNombre?: string
  montos: {
    efectivoSistema: number
    efectivoReal: number
    debitoSistema: number
    debitoReal: number
    transferencias: number
  }
  calculos: {
    gastosTotales: number
    gastosQueAfectanGanancia?: number
    gastosMercaderia?: number
    totalNeto: number
    totalBruto: number
    diferenciaTotal: number
    diferenciaEfectivo: number
    diferenciaDebito: number
    efectivoSistemaNetoSalidasCaja?: boolean
    costoProductos?: number
    gananciaBruta?: number
  }
  costoProductos?: number
  gananciaBruta?: number
  /** false cuando el cierre se importó sin detalle de productos/costos. */
  costosProductosDisponibles?: boolean
  origenPOS?: boolean
  origenCuadreImportado?: boolean
  fuenteCuadre?: string
  analisisProductosRetailbase?: CuadreAnalisisProductos
  gastos: CuadreGasto[]
  topProducts: CuadreTopProduct[]
  fotos: CuadreFoto[]
  anuladas: CuadreAnulada[]
  devoluciones: CuadreAnulada[]
  montosPorCajera?: Record<string, {
    efectivoReal?: number
    transferencia?: number
    debito?: number
    totalBruto?: number
    ventasCount?: number
    efectivo?: number
    efectivoRecibido?: number
    vueltos?: number
    diferencia?: number
    sessionIds?: string[]
    topProducts?: CuadreTopProduct[]
    gastos?: CuadreGasto[]
  }>
  createdAt?: string
  updatedAt?: string
  _pending?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeParseJson<T>(val: unknown, fallback: T): T {
  if (!val) return fallback
  if (typeof val === 'object') return val as T
  if (typeof val === 'string') {
    if (!val || val === '[]' || val === 'null' || val === '{}') return fallback
    try { return JSON.parse(val) as T } catch { return fallback }
  }
  return fallback
}

function deserializeCuadre(d: any): CuadreERP {
  const montos = d.montos || {}
  const calculos = d.calculos || {}
  const costoRaiz = Number(d.costoProductos)
  const costoCalculado = Number(calculos.costoProductos)
  const gananciaRaiz = Number(d.gananciaBruta)
  const gananciaCalculada = Number(calculos.gananciaBruta)
  const totalBrutoCalculado = Number(calculos.totalBruto ?? d.totalBruto)
  const resumenCalculadoConsistente = Number.isFinite(totalBrutoCalculado)
    && Number.isFinite(costoCalculado)
    && Number.isFinite(gananciaCalculada)
    && costoCalculado >= 0
    && Math.abs(totalBrutoCalculado - costoCalculado - gananciaCalculada) <= 1
  // Algunos cierres antiguos tienen el costo/ganancia raíz desactualizados, aunque
  // el resumen anidado de calculos sí cuadra con ventas - costo. Priorizar ese resumen.
  const costoProductos = resumenCalculadoConsistente
    ? costoCalculado
    : (Number.isFinite(costoRaiz) ? costoRaiz : costoCalculado) || 0
  const gananciaBruta = resumenCalculadoConsistente
    ? gananciaCalculada
    : (Number.isFinite(gananciaRaiz) ? gananciaRaiz : gananciaCalculada) || 0

  return {
    $id: d.$id || d.id || `${d.sede}__${d.fecha}`,
    sede: (d.sede || 'donbalato-central') as SedeSlug,
    fecha: String(d.fecha || ''),
    estado: d.estado || 'pendiente',
    cajerosListos: Array.isArray(d.cajerosListos) ? d.cajerosListos : (d.cajeroNombre ? [d.cajeroNombre] : []),
    cajeroNombre: String(d.cajeroNombre || ''),
    montos: {
      efectivoSistema: Number(d.efectivoSistema ?? montos.efectivoSistema) || 0,
      efectivoReal:    Number(d.efectivoReal ?? montos.efectivoReal) || 0,
      debitoSistema:   Number(d.debitoSistema ?? montos.debitoSistema) || 0,
      debitoReal:      Number(d.debitoReal ?? montos.debitoReal) || 0,
      transferencias:  Number(d.transferencias ?? montos.transferencias) || 0,
    },
    calculos: {
      gastosTotales:      Number(d.gastosTotales ?? calculos.gastosTotales) || 0,
      ...(calculos.gastosQueAfectanGanancia == null ? {} : { gastosQueAfectanGanancia: Number(calculos.gastosQueAfectanGanancia) || 0 }),
      ...(calculos.gastosMercaderia == null ? {} : { gastosMercaderia: Number(calculos.gastosMercaderia) || 0 }),
      totalNeto:          Number(d.totalNeto ?? calculos.totalNeto) || 0,
      totalBruto:         Number(d.totalBruto ?? calculos.totalBruto) || 0,
      costoProductos,
      gananciaBruta,
      diferenciaTotal:    Number(d.diferenciaTotal ?? calculos.diferenciaTotal) || 0,
      diferenciaEfectivo: Number(d.diferenciaEfectivo ?? calculos.diferenciaEfectivo) || 0,
      diferenciaDebito:   Number(d.diferenciaDebito ?? calculos.diferenciaDebito) || 0,
      ...(calculos.efectivoSistemaNetoSalidasCaja === true ? { efectivoSistemaNetoSalidasCaja: true } : {}),
    },
    costoProductos,
    gananciaBruta,
    costosProductosDisponibles: d.costosProductosDisponibles !== false,
    origenPOS: d.origenPOS === true,
    origenCuadreImportado: d.origenCuadreImportado === true,
    fuenteCuadre: String(d.fuenteCuadre || ''),
    analisisProductosRetailbase: d.analisisProductosRetailbase && typeof d.analisisProductosRetailbase === 'object'
      ? d.analisisProductosRetailbase as CuadreAnalisisProductos
      : undefined,
    gastos:       Array.isArray(d.gastos) ? d.gastos : safeParseJson<CuadreGasto[]>(d.gastosJson, []),
    topProducts:  Array.isArray(d.topProducts) ? d.topProducts : safeParseJson<CuadreTopProduct[]>(d.topProductsJson, []),
    fotos:        Array.isArray(d.fotos) ? d.fotos : safeParseJson<CuadreFoto[]>(d.fotosJson, []),
    anuladas:     Array.isArray(d.anuladas) ? d.anuladas : safeParseJson<CuadreAnulada[]>(d.anuladasJson, []),
    devoluciones: Array.isArray(d.devoluciones) ? d.devoluciones : safeParseJson<CuadreAnulada[]>(d.devolucionesJson, []),
    montosPorCajera: (typeof d.montosPorCajera === 'object' && d.montosPorCajera !== null) ? d.montosPorCajera as CuadreERP['montosPorCajera'] : undefined,
    createdAt:    d.createdAt || d.$createdAt || '',
    updatedAt:    d.updatedAt || d.$updatedAt || '',
    _pending:     false,
  }
}

function serializeCuadre(c: Partial<Omit<CuadreERP, '$id'>>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }
  if (c.sede !== undefined)   payload.sede   = c.sede
  if (c.fecha !== undefined)  payload.fecha  = c.fecha
  if (c.estado !== undefined) payload.estado = c.estado
  if (c.cajerosListos !== undefined) payload.cajerosListos = c.cajerosListos
  if (c.cajeroNombre !== undefined)  payload.cajeroNombre  = c.cajeroNombre
  if (c.analisisProductosRetailbase !== undefined) payload.analisisProductosRetailbase = c.analisisProductosRetailbase

  if (c.montos) {
    payload.montos = c.montos
    payload.efectivoSistema = c.montos.efectivoSistema
    payload.efectivoReal    = c.montos.efectivoReal
    payload.debitoSistema   = c.montos.debitoSistema
    payload.debitoReal      = c.montos.debitoReal
    payload.transferencias  = c.montos.transferencias
  }
  if (c.calculos) {
    payload.calculos = c.calculos
    payload.gastosTotales      = c.calculos.gastosTotales
    payload.totalNeto          = c.calculos.totalNeto
    payload.totalBruto         = c.calculos.totalBruto
    payload.diferenciaTotal    = c.calculos.diferenciaTotal
    payload.diferenciaEfectivo = c.calculos.diferenciaEfectivo
    payload.diferenciaDebito   = c.calculos.diferenciaDebito
  }

  // Guardar tanto arreglos nativos como strings JSON para compatibilidad total
  if (c.gastos !== undefined) {
    payload.gastos = c.gastos
    payload.gastosJson = JSON.stringify(c.gastos)
  }
  if (c.topProducts !== undefined) {
    payload.topProducts = c.topProducts
    payload.topProductsJson = JSON.stringify(c.topProducts)
  }
  if (c.fotos !== undefined) {
    payload.fotos = c.fotos
    payload.fotosJson = JSON.stringify(c.fotos)
  }
  if (c.anuladas !== undefined) {
    payload.anuladas = c.anuladas
    payload.anuladasJson = JSON.stringify(c.anuladas)
  }
  if (c.devoluciones !== undefined) {
    payload.devoluciones = c.devoluciones
    payload.devolucionesJson = JSON.stringify(c.devoluciones)
  }

  return payload
}

// ─── API pública nativa Firestore ──────────────────────────────────────────────

// ─── Caché y deduplicación en memoria / sessionStorage para fetchCuadresERP ───
interface CuadresCacheEntry {
  timestamp: number
  data: CuadreERP[]
}
const cuadresMemoryCache = new Map<number, CuadresCacheEntry>()
const CUADRES_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos de caché
const CUADRES_CACHE_STORAGE_PREFIX = 'donbalato_cuadres_cache_v2_'
const inflightPromises = new Map<number, Promise<CuadreERP[]>>()

export function invalidateCuadresERPCache(): void {
  cuadresMemoryCache.clear()
  inflightPromises.clear()
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('donbalato_cuadres_cache_1')
      sessionStorage.removeItem('donbalato_cuadres_cache_2')
      sessionStorage.removeItem('donbalato_cuadres_cache_3')
      sessionStorage.removeItem(`${CUADRES_CACHE_STORAGE_PREFIX}1`)
      sessionStorage.removeItem(`${CUADRES_CACHE_STORAGE_PREFIX}2`)
      sessionStorage.removeItem(`${CUADRES_CACHE_STORAGE_PREFIX}3`)
    } catch {}
  }
}

/**
 * Carga todos los cuadres de los últimos N meses (por defecto 3).
 * Pagina de forma segura con startAfter(DocumentSnapshot) de Firestore.
 * Incluye caché inteligente de 5 min y deduplicación de llamadas simultáneas para evitar lecturas masivas.
 */
export async function fetchCuadresERP(meses = 3, forceRefresh = false): Promise<CuadreERP[]> {
  if (!forceRefresh) {
    const mem = cuadresMemoryCache.get(meses)
    if (mem && (Date.now() - mem.timestamp < CUADRES_CACHE_TTL_MS)) {
      return mem.data
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`${CUADRES_CACHE_STORAGE_PREFIX}${meses}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.timestamp && (Date.now() - parsed.timestamp < CUADRES_CACHE_TTL_MS) && Array.isArray(parsed.data)) {
            cuadresMemoryCache.set(meses, parsed)
            return parsed.data
          }
        }
      } catch {}
    }
  }

  // Deduplicar llamadas simultáneas en vuelo (evita que 3 llamadas paralelas ejecuten 3 queries idénticas)
  if (inflightPromises.has(meses)) {
    return inflightPromises.get(meses)!
  }

  const promise = (async () => {
    try {
      const since = new Date()
      since.setMonth(since.getMonth() - meses)
      const sinceStr = since.toISOString().slice(0, 10)

      const colRef = collection(db, CUADRES_COLLECTION)
      const allDocs: any[] = []
      let lastDoc: QueryDocumentSnapshot | null = null
      let hasMore = true

      while (hasMore) {
        const constraints: any[] = [
          where('fecha', '>=', sinceStr),
          orderBy('fecha', 'desc'),
          limit(50),
        ]
        if (lastDoc) {
          constraints.push(startAfter(lastDoc))
        }

        const q = query(colRef, ...constraints)
        const snap = await getDocs(q)

        if (!snap.empty) {
          snap.forEach((d) => {
            if (d.id !== '_init') {
              allDocs.push({ $id: d.id, ...d.data() })
            }
          })
          lastDoc = snap.docs[snap.docs.length - 1]
          if (snap.docs.length < 50) {
            hasMore = false
          }
        } else {
          hasMore = false
        }
      }

      // Deduplicar por sede+fecha (más reciente gana)
      const byKey = new Map<string, any>()
      for (const docData of allDocs) {
        const key = `${docData.sede}|${docData.fecha}`
        if (!byKey.has(key)) byKey.set(key, docData)
      }

      // Fallback: Si una sede tiene reports en sedes/{sede}/reports no reflejados aún en cuadres_erp
      try {
        const sedesToCheck = SEDE_SLUGS || ['donbalato-central', 'don-balato-b']
        for (const s of sedesToCheck) {
          const reportsRef = collection(db, 'sedes', s, 'reports')
          let rSnap: any
          try {
            rSnap = await getDocs(query(reportsRef, where('fecha', '>=', sinceStr), limit(40)))
          } catch {
            rSnap = await getDocs(query(reportsRef, limit(40)))
          }
          rSnap.forEach((rd: any) => {
            const rData = rd.data()
            const f = rData.fecha || rd.id
            if (f && f >= sinceStr) {
              const key = `${s}|${f}`
              if (!byKey.has(key)) {
                byKey.set(key, {
                  $id: `${s}__${f}`,
                  sede: s,
                  fecha: f,
                  ...rData,
                })
              }
            }
          })
        }
      } catch {
        // ignore fallback error
      }

      const result = Array.from(byKey.values()).map(deserializeCuadre)
      const cachePayload = { timestamp: Date.now(), data: result }
      cuadresMemoryCache.set(meses, cachePayload)
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`${CUADRES_CACHE_STORAGE_PREFIX}${meses}`, JSON.stringify(cachePayload))
        } catch {}
      }
      return result
    } catch (err) {
      console.error('[cuadresErpService] fetchCuadresERP error:', err)
      return []
    } finally {
      inflightPromises.delete(meses)
    }
  })()

  inflightPromises.set(meses, promise)
  return promise
}

/**
 * Crea o sobreescribe un cuadre en Firestore.
 * Utiliza un ID determinista `${sede}__${fecha}` para evitar duplicados por tienda/día.
 */
export async function createCuadreERP(
  cuadre: Omit<CuadreERP, '$id' | 'createdAt' | 'updatedAt' | '_pending'>
): Promise<CuadreERP | null> {
  try {
    const docId = `${cuadre.sede}__${cuadre.fecha}`
    const docRef = doc(db, CUADRES_COLLECTION, docId)
    const payload = {
      $id: docId,
      ...serializeCuadre(cuadre),
      createdAt: new Date().toISOString(),
    }
    await setDoc(docRef, payload, { merge: true })
    invalidateCuadresERPCache()
    return deserializeCuadre(payload)
  } catch (err) {
    console.error('[cuadresErpService] createCuadreERP error:', err)
    return null
  }
}

/**
 * Actualiza un cuadre existente.
 */
export async function updateCuadreERP(
  id: string,
  data: Partial<Omit<CuadreERP, '$id' | 'createdAt' | 'updatedAt' | '_pending'>>
): Promise<boolean> {
  try {
    const docRef = doc(db, CUADRES_COLLECTION, id)
    await updateDoc(docRef, serializeCuadre(data))
    invalidateCuadresERPCache()
    return true
  } catch (err) {
    console.error('[cuadresErpService] updateCuadreERP error:', err)
    return false
  }
}

/**
 * Elimina un cuadre por su ID.
 */
export async function deleteCuadreERP(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, CUADRES_COLLECTION, id)
    await deleteDoc(docRef)
    invalidateCuadresERPCache()
    return true
  } catch (err) {
    console.error('[cuadresErpService] deleteCuadreERP error:', err)
    return false
  }
}
