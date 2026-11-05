# ERP MIGRACIÓN — Instrucciones para el agente ejecutor

> **Escrito por:** Agente Antigravity (contexto completo del proyecto)
> **Para:** Claude Pro Max u otro agente con capacidad de escritura
> **Proyecto:** `C:\Proyectos\PROYECTO Importadora Carlitos\PROJECT YAXSEL (PRODUCCION) - 14-06-2026 (3GB)`
> **Última actualización:** 2026-07-30 (plan original) · **Log de ejecución agregado 2026-07-30 por Claude Opus 4.8**

> ⚠️ **IMPORTANTE:** El plan de abajo (PASOS 1–7) se ejecutó, PERO durante la ejecución se descubrió que la
> página `/erp` (Cuadres) es solo **una parte** del ERP. El dashboard principal real es otro (el `Dashboard.tsx`
> de Asistora). El alcance creció. **Lee primero el [LOG DE EJECUCIÓN](#log-de-ejecución--estado-real-2026-07-30)
> al final del documento** para ver el estado real y actualizado antes de continuar.

---

## LEE ESTO ANTES DE TOCAR CUALQUIER ARCHIVO

### Qué significa "migrar" en este contexto
**"Migrar" NO significa trasladar datos.** No hay que mover productos de Firebase a Appwrite, ni cuadres, ni ventas, ni nada. Los datos de Asistora (Firebase) son de otro cliente y otro sistema.

**"Migrar" significa:** reemplazar el código que actualmente usa mocks de Firebase en la página `/erp` de Yaxsel, para que en su lugar use Appwrite con colecciones NUEVAS y VACÍAS propias de Yaxsel.

### Qué NO debes tocar jamás
Yaxsel es simultáneamente una **tienda de e-commerce** (`donbalatoivan.cl`) Y un sistema ERP/POS interno. Son módulos distintos que comparten el mismo repo por ahora (en el futuro se venderán por separado). **No toques nada relacionado con la web:**

```
❌ NO TOCAR:
src/app/(store)/          → páginas de la tienda web
src/app/api/              → APIs de la tienda
src/components/Navbar*    → navbar de la tienda
src/components/Cart*      → carrito de compras
src/components/Product*   → componentes de productos web
src/context/Cart*         → contexto del carrito
src/context/Favorites*    → favoritos
src/templates/            → plantillas de la tienda
src/hooks/useAuth*        → auth de la tienda
public/shopify/           → assets de la tienda

✅ PUEDES TOCAR:
src/app/erp/              → módulo ERP (tu objetivo principal)
src/app/admin/            → panel de administración
src/app/pos/              → módulo POS
src/app/pos-admin/        → panel POS admin
src/lib/appwriteErpService.ts    → servicio Appwrite ERP ya existente
src/lib/cuadresErpService.ts     → LO VAS A CREAR TÚ
src/types/index.ts               → solo si necesitas agregar tipos (no eliminar)
```

### Regla de oro
Después de cada cambio ejecuta `npx tsc --noEmit` en la raíz del proyecto. Debe terminar con **0 errores**. Si rompes algo, reviértelo antes de continuar.

---

## Contexto técnico del proyecto Yaxsel

### Stack
- **Framework:** Next.js 14 (App Router, TypeScript)
- **Backend:** Appwrite Cloud (`nyc.cloud.appwrite.io`)
- **Tienda:** Importadora Carlitos (`donbalatoivan.cl`)
- **Módulo ERP:** `/erp` — Dashboard de Cuadres de Caja
- **Módulo POS:** `/pos/[sede]` — Punto de venta
- **Panel admin:** `/admin` — Gestión de tienda + ERP + POS

### Credenciales Appwrite (ya están en `.env.local`)
```
NEXT_PUBLIC_APPWRITE_ENDPOINT    = https://nyc.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID  = donbalatoivan
NEXT_PUBLIC_APPWRITE_DATABASE_ID = 6a62e7440033d2278d28
APPWRITE_API_KEY = standard_36d66a586c5975803e1bb17c5bcd8bb4146a1ee594b31be56fd22a537043adf5cbae612072df4f25873e3d388c4f6dc494beb6a8a56fbfd0c5d878552a622a35762e78dae181636818840ba3eeb07227efbc0b2a1d08893e740e7f56941b427b81f6c675fdd90ca5fe896cd46aeb7e5027736fe5fb40c480ea2f8363ca89740a
```

### Colecciones existentes (NO TOCAR)
| ID | Uso |
|----|-----|
| `products` | Catálogo web. Campos: `SKU`, `NAME`, `PRICE`, `WHOLESALEPRICE`, `COST`, `STOCK`, `ISACTIVE`, `BARCODE`, `IMAGEURL`, `CATEGORYID` |
| `inventory_products` | ERP/POS inventario. Mismos campos. |
| `ventas_pos` | Ventas del POS. Campos: `boletaNumero`, `cajeroNombre`, `total`, `pagos[]`, `items[]`, `estado`, `fecha`, `sede` |

### Función helper principal de Appwrite
```typescript
// src/lib/appwrite.ts
import { getServices, Query } from '@/lib/appwrite'
// Uso:
const { databases } = getServices()
const res = await databases.listDocuments(DB_ID, COLLECTION_ID, queries)
```

### Tipos disponibles en `src/types/index.ts`
```typescript
export type SedeSlug = 'alameda' | 'copiapo' | 'la-florida' | (string & {})
export const SEDES: Record<string, string> = { alameda: 'Alameda', ... }
export const DEFAULT_SEDE: SedeSlug = 'alameda'
export const SEDE_SLUGS: SedeSlug[] = ['alameda', 'copiapo', 'la-florida']
```

> **Importante:** Yaxsel actualmente solo tiene la sede `alameda`. Los otros slugs existen por compatibilidad futura.

---

## Estado actual de `/erp/page.tsx`

La página existe en `src/app/erp/page.tsx` (905 líneas). Es un port de `AdminPage.tsx` de Asistora (otro cliente con Firebase). Actualmente tiene **todos los mocks en líneas 16-30**:

```typescript
// ---------- Firebase mocks ----------
const db = {} as any
const firebaseProjectId = 'yaxsel-prod'
const authReady = Promise.resolve()
const collection = (...args: any[]) => args.join('/')
// ... etc.
```

Y en el `useEffect` de carga (línea ~85) usa `buildDemoAdminRows()` — datos hardcodeados de demo. **Eso es lo que hay que reemplazar con Appwrite real.**

La UI, el JSX, los filtros, los sheets de gastos, el visor de imágenes — **todo eso está bien y no hay que tocarlo**.

---

## PLAN DE EJECUCIÓN (en orden)

---

### PASO 1 — Crear colección `cuadres_erp` en Appwrite

Usa la API REST de Appwrite con el API key para crear la colección y sus atributos. Ejecuta estos comandos PowerShell desde cualquier directorio:

```powershell
# Variables
$endpoint = "https://nyc.cloud.appwrite.io/v1"
$projectId = "donbalatoivan"
$dbId = "6a62e7440033d2278d28"
$apiKey = "standard_36d66a586c5975803e1bb17c5bcd8bb4146a1ee594b31be56fd22a537043adf5cbae612072df4f25873e3d388c4f6dc494beb6a8a56fbfd0c5d878552a622a35762e78dae181636818840ba3eeb07227efbc0b2a1d08893e740e7f56941b427b81f6c675fdd90ca5fe896cd46aeb7e5027736fe5fb40c480ea2f8363ca89740a"
$headers = @{ "X-Appwrite-Project" = $projectId; "X-Appwrite-Key" = $apiKey; "Content-Type" = "application/json" }

# 1. Crear la colección
$body = '{"collectionId":"cuadres_erp","name":"Cuadres ERP","documentSecurity":false}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections" -Method Post -Headers $headers -Body $body

# 2. Atributo: sede (string)
$body = '{"key":"sede","size":50,"required":true}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/attributes/string" -Method Post -Headers $headers -Body $body

# 3. Atributo: fecha (string YYYY-MM-DD)
$body = '{"key":"fecha","size":10,"required":true}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/attributes/string" -Method Post -Headers $headers -Body $body

# 4. Atributo: estado
$body = '{"key":"estado","size":20,"required":false,"default":"pendiente"}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/attributes/string" -Method Post -Headers $headers -Body $body

# 5-9. Montos (integers)
foreach ($field in @("efectivoSistema","efectivoReal","debitoSistema","debitoReal","transferencias")) {
  $body = "{`"key`":`"$field`",`"required`":false,`"default`":0}"
  Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/attributes/integer" -Method Post -Headers $headers -Body $body
  Start-Sleep -Milliseconds 300
}

# 10-15. Calculos (integers)
foreach ($field in @("gastosTotales","totalNeto","totalBruto","diferenciaTotal","diferenciaEfectivo","diferenciaDebito")) {
  $body = "{`"key`":`"$field`",`"required`":false,`"default`":0}"
  Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/attributes/integer" -Method Post -Headers $headers -Body $body
  Start-Sleep -Milliseconds 300
}

# 16-20. JSON strings para arrays complejos (string large)
foreach ($field in @("gastosJson","topProductsJson","fotosJson","anuladasJson","devolucionesJson")) {
  $body = "{`"key`":`"$field`",`"size`":65535,`"required`":false,`"default`":`"[]`"}"
  Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/attributes/string" -Method Post -Headers $headers -Body $body
  Start-Sleep -Milliseconds 300
}

# ESPERAR 15 segundos para que Appwrite procese los atributos
Start-Sleep -Seconds 15

# 21. Índice compuesto sede+fecha (para buscar cuadre específico)
$body = '{"key":"sede_fecha_idx","type":"key","attributes":["sede","fecha"],"orders":["ASC","DESC"]}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/indexes" -Method Post -Headers $headers -Body $body

# 22. Índice por fecha (para filtrar por día)
$body = '{"key":"fecha_idx","type":"key","attributes":["fecha"],"orders":["DESC"]}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/indexes" -Method Post -Headers $headers -Body $body

# 23. Permisos: cualquiera puede leer y escribir (igual que otras colecciones del proyecto)
$body = '{"read":["any"],"create":["any"],"update":["any"],"delete":["any"]}'
Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp" -Method Put -Headers $headers -Body $body
```

> Si algún atributo falla porque ya existe, ignóralo y continúa. Los índices pueden tardar 30-60 segundos en activarse.

---

### PASO 2 — Crear `src/lib/cuadresErpService.ts`

Crea este archivo nuevo (no existe aún):

```typescript
// src/lib/cuadresErpService.ts
import { getServices, Query } from '@/lib/appwrite'
import { ID } from 'appwrite'
import type { SedeSlug } from '@/types'

export const CUADRES_COLLECTION = 'cuadres_erp'
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || '6a62e7440033d2278d28'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface CuadreGasto {
  monto: number
  observacion?: string
  detalle?: string
  esDevolucion?: boolean
  esAnulada?: boolean
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

export interface CuadreERP {
  $id: string
  sede: SedeSlug
  fecha: string            // 'YYYY-MM-DD'
  estado: string           // 'pendiente' | 'enviado'
  montos: {
    efectivoSistema: number
    efectivoReal: number
    debitoSistema: number
    debitoReal: number
    transferencias: number
  }
  calculos: {
    gastosTotales: number
    totalNeto: number
    totalBruto: number
    diferenciaTotal: number
    diferenciaEfectivo: number
    diferenciaDebito: number
  }
  gastos: CuadreGasto[]
  topProducts: CuadreTopProduct[]
  fotos: CuadreFoto[]
  anuladas: CuadreAnulada[]
  devoluciones: CuadreAnulada[]
  createdAt?: string
  updatedAt?: string
  _pending?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeParseJson<T>(str: string | undefined | null, fallback: T): T {
  if (!str || str === '[]' || str === 'null') return fallback
  try { return JSON.parse(str) as T } catch { return fallback }
}

function deserializeCuadre(doc: any): CuadreERP {
  return {
    $id: doc.$id,
    sede: doc.sede as SedeSlug,
    fecha: doc.fecha,
    estado: doc.estado || 'pendiente',
    montos: {
      efectivoSistema: Number(doc.efectivoSistema) || 0,
      efectivoReal:    Number(doc.efectivoReal) || 0,
      debitoSistema:   Number(doc.debitoSistema) || 0,
      debitoReal:      Number(doc.debitoReal) || 0,
      transferencias:  Number(doc.transferencias) || 0,
    },
    calculos: {
      gastosTotales:      Number(doc.gastosTotales) || 0,
      totalNeto:          Number(doc.totalNeto) || 0,
      totalBruto:         Number(doc.totalBruto) || 0,
      diferenciaTotal:    Number(doc.diferenciaTotal) || 0,
      diferenciaEfectivo: Number(doc.diferenciaEfectivo) || 0,
      diferenciaDebito:   Number(doc.diferenciaDebito) || 0,
    },
    gastos:       safeParseJson<CuadreGasto[]>(doc.gastosJson, []),
    topProducts:  safeParseJson<CuadreTopProduct[]>(doc.topProductsJson, []),
    fotos:        safeParseJson<CuadreFoto[]>(doc.fotosJson, []),
    anuladas:     safeParseJson<CuadreAnulada[]>(doc.anuladasJson, []),
    devoluciones: safeParseJson<CuadreAnulada[]>(doc.devolucionesJson, []),
    createdAt:    doc.$createdAt,
    updatedAt:    doc.$updatedAt,
    _pending:     false,
  }
}

function serializeCuadre(c: Partial<Omit<CuadreERP, '$id'>>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (c.sede !== undefined)   payload.sede   = c.sede
  if (c.fecha !== undefined)  payload.fecha  = c.fecha
  if (c.estado !== undefined) payload.estado = c.estado
  if (c.montos) {
    payload.efectivoSistema = c.montos.efectivoSistema
    payload.efectivoReal    = c.montos.efectivoReal
    payload.debitoSistema   = c.montos.debitoSistema
    payload.debitoReal      = c.montos.debitoReal
    payload.transferencias  = c.montos.transferencias
  }
  if (c.calculos) {
    payload.gastosTotales      = c.calculos.gastosTotales
    payload.totalNeto          = c.calculos.totalNeto
    payload.totalBruto         = c.calculos.totalBruto
    payload.diferenciaTotal    = c.calculos.diferenciaTotal
    payload.diferenciaEfectivo = c.calculos.diferenciaEfectivo
    payload.diferenciaDebito   = c.calculos.diferenciaDebito
  }
  if (c.gastos !== undefined)       payload.gastosJson      = JSON.stringify(c.gastos)
  if (c.topProducts !== undefined)  payload.topProductsJson = JSON.stringify(c.topProducts)
  if (c.fotos !== undefined)        payload.fotosJson       = JSON.stringify(c.fotos)
  if (c.anuladas !== undefined)     payload.anuladasJson    = JSON.stringify(c.anuladas)
  if (c.devoluciones !== undefined) payload.devolucionesJson = JSON.stringify(c.devoluciones)
  return payload
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Carga todos los cuadres de los últimos N meses.
 * Pagina automáticamente con cursores.
 */
export async function fetchCuadresERP(meses = 3): Promise<CuadreERP[]> {
  try {
    const { databases } = getServices()

    // Fecha mínima: hace N meses
    const since = new Date()
    since.setMonth(since.getMonth() - meses)
    const sinceStr = since.toISOString().slice(0, 10)

    const allDocs: any[] = []
    let cursor: string | null = null
    let hasMore = true

    while (hasMore) {
      const queries: any[] = [
        Query.greaterThanEqual('fecha', sinceStr),
        Query.orderDesc('fecha'),
        Query.limit(100),
      ]
      if (cursor) queries.push(Query.cursorAfter(cursor))

      const res = await databases.listDocuments(DB_ID, CUADRES_COLLECTION, queries)

      if (res.documents.length > 0) {
        allDocs.push(...res.documents)
        cursor = res.documents[res.documents.length - 1].$id
        if (res.documents.length < 100) hasMore = false
      } else {
        hasMore = false
      }
    }

    // Deduplicar por sede+fecha (más reciente gana)
    const byKey = new Map<string, any>()
    for (const doc of allDocs) {
      const key = `${doc.sede}|${doc.fecha}`
      if (!byKey.has(key)) byKey.set(key, doc)
    }

    return Array.from(byKey.values()).map(deserializeCuadre)
  } catch (err) {
    console.error('[cuadresErpService] fetchCuadresERP error:', err)
    return []
  }
}

/**
 * Crea un nuevo cuadre en Appwrite.
 */
export async function createCuadreERP(
  cuadre: Omit<CuadreERP, '$id' | 'createdAt' | 'updatedAt' | '_pending'>
): Promise<CuadreERP | null> {
  try {
    const { databases } = getServices()
    const doc = await databases.createDocument(
      DB_ID,
      CUADRES_COLLECTION,
      ID.unique(),
      serializeCuadre(cuadre)
    )
    return deserializeCuadre(doc)
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
    const { databases } = getServices()
    await databases.updateDocument(DB_ID, CUADRES_COLLECTION, id, serializeCuadre(data))
    return true
  } catch (err) {
    console.error('[cuadresErpService] updateCuadreERP error:', err)
    return false
  }
}

/**
 * Elimina un cuadre por su $id de Appwrite.
 */
export async function deleteCuadreERP(id: string): Promise<boolean> {
  try {
    const { databases } = getServices()
    await databases.deleteDocument(DB_ID, CUADRES_COLLECTION, id)
    return true
  } catch (err) {
    console.error('[cuadresErpService] deleteCuadreERP error:', err)
    return false
  }
}
```

---

### PASO 3 — Editar `src/app/erp/page.tsx`

Estos son los cambios exactos que hay que hacer. No toques nada más.

#### 3A — Reemplazar el bloque de imports iniciales (líneas 1-15)

**Busca:**
```typescript
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wallet, CreditCard, ...
} from 'lucide-react'
import { SEDES, SedeSlug } from '@/types'
```

**Agrega estas importaciones DESPUÉS de las que ya existen** (no reemplaces las que hay):
```typescript
import { fetchCuadresERP, deleteCuadreERP } from '@/lib/cuadresErpService'
import type { CuadreERP } from '@/lib/cuadresErpService'
import { fetchAllAppwriteErpProducts } from '@/lib/appwriteErpService'
```

#### 3B — Eliminar el bloque de mocks de Firebase (líneas 16-33 aprox)

**Elimina completamente este bloque:**
```typescript
// ---------- Firebase mocks ----------
const db = {} as any
const firebaseProjectId = 'yaxsel-prod'
const authReady = Promise.resolve()
const collection = (...args: any[]) => args.join('/')
const query = (...args: any[]) => args[0]
const where = (..._args: any[]) => null
const orderBy = (..._args: any[]) => null
const getDocs = async (_q?: any): Promise<{ docs: any[]; forEach: (fn: any) => void }> => ({ docs: [], forEach: () => {} })
const onSnapshot = (_c: any, cb: any, _err?: any) => { cb({ docs: [], forEach: () => {} }); return () => {} }
const deleteDoc = async (..._args: any[]) => {}
const doc = (...args: any[]) => args.join('/')
const updateDoc = async (..._args: any[]) => {}
const serverTimestamp = () => Date.now()
const documentId = () => '__name__'
```

También elimina:
```typescript
// ---------- Lib mocks ----------
const uploadFiles = async (..._args: any[]) => []
const toPng = async (_node: any, _opts?: any): Promise<string> => ''
const saveAs = (_blob: any, _name: string) => {}
const summarizeTopProducts = (items: any[], _costs: any, _flags: any) => ({ rows: items, ventasBrutas: 0, costoTotal: 0 })
```

#### 3C — Cambiar el tipo del estado `rows`

**Busca:**
```typescript
const [rows, setRows] = useState<any[]>([])
```
**Reemplaza con:**
```typescript
const [rows, setRows] = useState<CuadreERP[]>([])
```

#### 3D — Reemplazar el `useEffect` de carga de datos

**Busca el bloque que empieza con:**
```typescript
useEffect(() => {
  async function load() {
    setLoading(true)
    try {
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
      const todayStr = now.toISOString().slice(0, 10)
      const yesterdayDate = new Date(now)
      ...
      const demoRows = buildDemoAdminRows(todayStr, yesterdayStr)
      setRows(demoRows)
```

**Reemplaza todo ese `useEffect` con:**
```typescript
useEffect(() => {
  async function load() {
    setLoading(true)
    try {
      const cuadres = await fetchCuadresERP(3) // últimos 3 meses

      // Construir lista de fechas disponibles
      const fechasSet = new Set<string>()
      cuadres.forEach(c => fechasSet.add(c.fecha))
      const fechas = Array.from(fechasSet).sort((a, b) => b.localeCompare(a))

      // Construir meses disponibles
      const monthsMap: Record<string, string[]> = {}
      fechas.forEach(d => {
        const m = d.slice(0, 7)
        if (!monthsMap[m]) monthsMap[m] = []
        monthsMap[m].push(d)
      })
      Object.keys(monthsMap).forEach(m => monthsMap[m].sort((a, b) => b.localeCompare(a)))
      const months = Object.keys(monthsMap).sort((a, b) => b.localeCompare(a))

      setRows(cuadres)
      setAvailableDates(fechas)
      setMonthDates(monthsMap)
      setAvailableMonths(months)

      if (fechas.length > 0) {
        // Intentar seleccionar hoy (hora Chile UTC-3)
        const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const todayStr = now.toISOString().slice(0, 10)
        const todayExists = fechas.includes(todayStr)
        const targetDate = todayExists ? todayStr : fechas[0]
        setSelectedDate(targetDate)
        const targetMonth = targetDate.slice(0, 7)
        setSelectedMonth(months.includes(targetMonth) ? targetMonth : (months[0] || ''))
      }

      setError(null)
    } catch (e: any) {
      console.error('[ERP] Error cargando cuadres:', e)
      setError(`Error cargando cuadres: ${e?.message || String(e)}`)
      setRows([])
    } finally {
      setLoading(false)
    }
  }
  load()
}, [])
```

#### 3E — Reemplazar el `useEffect` de costos (costsBD)

**Busca:**
```typescript
const [costsBD] = useState<Map<string, number>>(new Map())
const [minus10Flags] = useState<Set<string>>(new Set())
```

**Reemplaza con:**
```typescript
const [costsBD, setCostsBD] = useState<Map<string, number>>(new Map())
const [minus10Flags] = useState<Set<string>>(new Set()) // sin ajuste_menos10 en Yaxsel
```

**Y agrega este `useEffect` debajo:**
```typescript
useEffect(() => {
  async function loadCosts() {
    try {
      const products = await fetchAllAppwriteErpProducts()
      const map = new Map<string, number>()
      for (const p of products) {
        const sku = String(p.sku || '').trim().toUpperCase()
        if (sku && p.costo_uni > 0) map.set(sku, p.costo_uni)
      }
      setCostsBD(map)
    } catch (err) {
      console.warn('[ERP] No se pudieron cargar costos de productos:', err)
    }
  }
  loadCosts()
}, [])
```

#### 3F — Reemplazar `handleDeleteCuadreOfDay`

**Busca la función `handleDeleteCuadreOfDay` y reemplaza su cuerpo:**
```typescript
const handleDeleteCuadreOfDay = async (row: any) => {
  if (!row || row?._pending) { alert('No hay un cuadre creado para eliminar.'); return }
  const ok = window.confirm(
    `¿Eliminar el cuadre de ${formatSedeLabel(row?.sede)} del día ${row?.fecha}?\n\nEsto borrará el cuadre de la base de datos.`
  )
  if (!ok) return

  if (row.$id) {
    const deleted = await deleteCuadreERP(row.$id)
    if (!deleted) { alert('Error al eliminar el cuadre. Intenta nuevamente.'); return }
  }
  setRows(prev => prev.filter(r => r.$id !== row.$id))
  alert('Cuadre eliminado.')
}
```

#### 3G — Eliminar la función `buildDemoAdminRows` y el bloque de GROUPS mock si quieres (opcional)

Puedes dejarlos sin que rompan nada, pero por limpieza elimina:
- La función `buildDemoAdminRows` (era demo, ya no se usa)
- Las constantes `IS_DEMO_PROJECT`, `DEMO_SEDE_KEYS` (ya no se usan)

#### 3H — Actualizar los textos de las funciones de exportación

**Reemplaza los `alert` de "funcionalidad disponible con Firebase/backend conectado" por algo más apropiado:**
```typescript
const handleExportExcel = async () => {
  alert('Exportar Excel: próximamente disponible. Instala exceljs y file-saver para activarlo.')
}

const handleGenerateImage = async () => {
  alert('Generar imagen: próximamente disponible. Instala html-to-image para activarlo.')
}

// etc.
```

---

### PASO 4 — Verificar que compila

```powershell
cd "C:\Proyectos\PROYECTO Importadora Carlitos\PROJECT YAXSEL (PRODUCCION) - 14-06-2026 (3GB)"
npx tsc --noEmit
```

Debe mostrar **0 errores**. Si hay errores de tipos, los más comunes son:

- **`CuadreERP` tiene campos tipados que no matchean con `any[]`**: Ajusta las funciones que usan `row: any` para que acepten `CuadreERP | any` o castea con `as CuadreERP`.
- **`Query.greaterThanEqual` no existe**: Verifica la versión del SDK de Appwrite. Si falla, usa `Query.greaterEqual('fecha', sinceStr)` (SDK v13+) o `Query.greaterThanEqual` (SDK v14+).

---

### PASO 5 — Crear documento de prueba en Appwrite

Para verificar que todo funciona, crea un cuadre de prueba manualmente via API:

```powershell
$endpoint = "https://nyc.cloud.appwrite.io/v1"
$projectId = "donbalatoivan"
$dbId = "6a62e7440033d2278d28"
$apiKey = "standard_36d66a586c5975803e1bb17c5bcd8bb4146a1ee594b31be56fd22a537043adf5cbae612072df4f25873e3d388c4f6dc494beb6a8a56fbfd0c5d878552a622a35762e78dae181636818840ba3eeb07227efbc0b2a1d08893e740e7f56941b427b81f6c675fdd90ca5fe896cd46aeb7e5027736fe5fb40c480ea2f8363ca89740a"
$headers = @{ "X-Appwrite-Project" = $projectId; "X-Appwrite-Key" = $apiKey; "Content-Type" = "application/json" }

$today = (Get-Date).ToString("yyyy-MM-dd")
$body = @{
  documentId = "unique()"
  data = @{
    sede = "alameda"
    fecha = $today
    estado = "enviado"
    efectivoSistema = 1280000
    efectivoReal = 1280000
    debitoSistema = 1710000
    debitoReal = 1710000
    transferencias = 620000
    gastosTotales = 760000
    totalNeto = 2850000
    totalBruto = 3610000
    diferenciaTotal = 0
    diferenciaEfectivo = 0
    diferenciaDebito = 0
    gastosJson = '[{"monto":450000,"observacion":"Proveedor mercaderia"},{"monto":310000,"observacion":"Arriendo local"}]'
    topProductsJson = '[{"sku":"PILA-AA","nombre":"Pila Duracell AA 2pcs","cantidadVendida":485,"ventasBrutas":970000,"ventasNetas":970000,"costoNeto":583000}]'
    fotosJson = "[]"
    anuladasJson = "[]"
    devolucionesJson = "[]"
  }
  permissions = @("read(`"any`")", "write(`"any`")")
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$endpoint/databases/$dbId/collections/cuadres_erp/documents" -Method Post -Headers $headers -Body $body
```

Luego navega a `http://localhost:3001/erp` y deberías ver el cuadre de alameda del día de hoy.

---

### PASO 6 (BONUS) — Formulario para crear cuadres desde la UI

El módulo ERP actualmente solo lee cuadres. Para que los cajeros puedan crear cuadres desde la app (en lugar de la API), crea un modal o una página `/erp/nuevo`:

**Campos mínimos del formulario:**
- Sede (solo `alameda` por ahora, hardcodeado)
- Fecha (date picker, default: hoy)
- Efectivo del sistema (monto del POS)
- Efectivo real (conteo físico)
- Débito sistema
- Débito real
- Transferencias
- Lista de gastos (+ botón agregar gasto: monto + descripción)

**Al guardar:** llama a `createCuadreERP(...)` del servicio. Los campos `calculos` se calculan automáticamente:
```typescript
const totalBruto = efectivoSistema + debitoSistema + transferencias
const gastosTotales = gastos.reduce((s, g) => s + g.monto, 0)
const totalNeto = totalBruto - gastosTotales
const diferenciaEfectivo = efectivoSistema - efectivoReal
const diferenciaDebito = debitoSistema - debitoReal
const diferenciaTotal = diferenciaEfectivo + diferenciaDebito
```

---

### PASO 7 (BONUS) — Conectar con ventas del POS

La colección `ventas_pos` ya existe en Appwrite. Para poblar `topProducts` automáticamente al cerrar caja, filtra las ventas del día:

```typescript
// En el formulario de nuevo cuadre:
const hoyVentas = await databases.listDocuments(DB_ID, 'ventas_pos', [
  Query.equal('sede', 'alameda'),
  Query.equal('fecha', fechaSeleccionada),
  Query.equal('estado', 'completada'),
  Query.limit(1000),
])

// Agregar SKU + nombre + cantidades desde items[]
```

---

## Separación futura ERP / WEB

El dueño quiere poder vender el ERP/POS y la WEB por separado. Para facilitar eso, desde ya mantén esta separación mental:

| Módulo | Rutas | Colecciones Appwrite |
|--------|-------|---------------------|
| **WEB** (tienda) | `/`, `/productos`, `/carrito`, etc. | `products`, `orders`, `customers` |
| **ERP** | `/erp`, `/admin/erp` | `cuadres_erp` (nueva) |
| **POS** | `/pos/[sede]`, `/pos-admin/[sede]` | `ventas_pos`, `inventory_products` |
| **Admin** | `/admin` | todas las anteriores (solo lectura) |

Cuando llegue el momento de separar, cada módulo debería poder funcionar con su propio `projectId` de Appwrite y su propia base de datos. Por eso **no mezcles llamadas a colecciones de la tienda dentro del ERP**, y viceversa.

---

## Resumen de archivos a crear/editar

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| Appwrite: colección `cuadres_erp` | **CREAR** via API REST (PASO 1) | CRÍTICO |
| `src/lib/cuadresErpService.ts` | **CREAR** (PASO 2) | CRÍTICO |
| `src/app/erp/page.tsx` | **EDITAR** — 6 cambios precisos (PASO 3) | CRÍTICO |
| `src/app/erp/nuevo/page.tsx` | **CREAR** — formulario (PASO 6) | BONUS |

## Archivos que NO se tocan

| Archivo | Razón |
|---------|-------|
| `src/lib/appwrite.ts` | Configuración base — no modificar |
| `src/lib/appwriteErpService.ts` | Ya funciona — reutilizar |
| `src/components/StoreShell.tsx` | Ya configurado — no tocar |
| `src/app/admin/(panel)/layout.tsx` | Sidebar ya correcto — no tocar |
| Todo lo de la tienda web | Módulo separado — no tocar nunca |

---
---

# LOG DE EJECUCIÓN — ESTADO REAL (2026-07-30)

> Ejecutado por **Claude Opus 4.8**. Esta sección refleja lo que **realmente** se hizo y el estado actual.
> Sustituye/complementa al plan de arriba donde haya diferencias.

## 0. Descubrimiento clave (cambio de alcance)

El plan original asumía que `/erp` era "el dashboard del ERP". **No lo es.** Durante la ejecución el dueño aclaró:

- **`/erp`** (la página de Cuadres que migró el plan original) es **solo UNA pestaña** del ERP.
- El **dashboard principal** del ERP es el `Dashboard.tsx` del proyecto original Asistora, mucho más grande
  (header "Ventas hoy", pestañas Cuadres/Ganancias/POS, Cerebro IA, Análisis Mensual, proyecciones, Top
  Productos, Ranking de Rentabilidad, etc.).
- **Repo fuente del original (Asistora, solo lectura, referencia):**
  `C:\Proyectos\PROJECT ERP ASISTORA (PRODUCCION) - 14-06-2026 (2.5GB)`
  - Dashboard principal: `src/components/Dashboard.tsx` (~3548 líneas)
  - Chrome (navbar + sidebar): `src/layouts/DashboardLayout.tsx` (~1198 líneas)

**Decisiones del dueño durante la ejecución:**
1. El dashboard nuevo pasa a ser el **principal** del ERP (no el `/erp` de Cuadres).
2. Primero portar **todo el diseño/visual**; luego vincular a Appwrite incrementalmente ("yo te diré qué
   vinculamos y qué borramos").

## 1. Migración `/erp` (Cuadres) — ✅ COMPLETADA (PASOS 1–5 del plan)

- **Colección `cuadres_erp` creada** en Appwrite (19 atributos `available`, índices `sede_fecha_idx` y
  `fecha_idx`, permisos `any`). SDK Appwrite instalado = **16.1.0** → `Query.greaterThanEqual` existe (se usó tal cual).
- **`src/lib/cuadresErpService.ts`** creado (idéntico al PASO 2): `fetchCuadresERP`, `createCuadreERP`,
  `updateCuadreERP`, `deleteCuadreERP` + (de)serialización de arrays JSON.
- **`src/app/erp/page.tsx`** editado: mocks de Firebase eliminados, `rows: CuadreERP[]`, `useEffect` de carga y
  de costos vinculados a Appwrite, `handleDeleteCuadreOfDay` borra en Appwrite, textos de export actualizados.
- **Documento de prueba** creado en `cuadres_erp` (`sede=alameda`, `fecha=2026-07-30`) — borrable desde el 🗑️ de la UI.
- Verificado en vivo: `/erp` lee datos reales. `tsc --noEmit` → **0 errores**.

## 2. Dashboard principal portado — ✅ VISUAL + VINCULACIÓN PARCIAL

**Archivo nuevo:** `src/app/erp-dashboard/page.tsx` (port de `Dashboard.tsx` de Asistora).

Técnica de port (para no reescribir 3548 líneas de JSX): se copió el archivo y se **shimeó solo la capa de datos**:
- `firebase/firestore` → mocks no-op (in-file).
- `react-router-dom` (`Link`/`useNavigate`) → Next (`next/link`, `useRouter`).
- `useAuth` / `runtimeConfig` → mocks fijos de Yaxsel (branding + 1 sede `alameda`).
- Assets copiados a `public/erp/` (`asis.png`, `tora.png`) y `public/avatar.png`.
- **`recharts` instalado** (los charts lo requieren; no estaba en Yaxsel).
- `'use client'` agregado.

**Dependencias nuevas creadas:** `src/data/demoWorkers.ts` (copiado de Asistora, datos demo de equipo).

## 3. Navbar superior + cortina lateral (sidebar) — ✅ PORTADO

**Archivo nuevo:** `src/app/erp-dashboard/layout.tsx` (port de `DashboardLayout.tsx`, como **layout de Next**).
- `<Outlet />` → `{children}` (ahí se renderiza el dashboard).
- Mismos shims que `page.tsx` + `useLocation` → `usePathname`, `Timestamp` mockeado.
- **Fix SSR:** el original (Vite, sin SSR) usaba `window.innerWidth` directo en el render → crasheaba en el
  server de Next. Se protegieron los 5 usos con `typeof window !== 'undefined'`.
- Incluye: botón hamburguesa, logo/branding, "Ventas hoy", CONTADOR IA, pestañas Cuadres/Ganancias/POS,
  selector de sede, notificaciones, avatar, reloj, modo claro/oscuro, command palette, y el drawer lateral.
- Verificado en vivo (server limpio, consola sin errores): `<header>` ✓, `<aside>` ✓, contenido dentro ✓.

## 4. Ruteo — ✅ dashboard como principal del ERP

- `src/app/admin/(panel)/layout.tsx` → enlace **ERP** del sidebar admin ahora apunta a `/erp-dashboard`.
- `src/app/admin/(panel)/erp/page.tsx` → `redirect('/erp-dashboard')`.
- `src/components/GlobalMobileNav.tsx` → oculta la nav móvil de tienda en rutas `/erp*`.
- La página de Cuadres sigue en `/erp` (será una pestaña del dashboard más adelante).

## 5. Estado de la VINCULACIÓN a Appwrite

Modo demo **apagado** (`isRuntimeDemoProject()→false`). Todo lo vinculado está marcado con `[APPWRITE]` en el código.

| Sección del dashboard | Fuente Appwrite | Estado |
|---|---|---|
| Datos del día, sucursales, totales, Top Productos, Producto más vendido | `cuadres_erp` | ✅ `loadData` |
| Análisis Mensual, Proyecciones, Tendencia, Acumulado por Sede, Ranking | `cuadres_erp` | ✅ `loadMonthlyData` |
| Costos Productos, Ganancia Final, Pérdidas / Rev. Costos (`costsBD`/`pricesBD`) | `products` (226 prods) | ✅ `loadCosts` |
| "Ventas hoy" (pill de la navbar) | `cuadres_erp` | ✅ en `layout.tsx` |
| **Equipo / Trabajadores** | `trabajadores_erp` (nueva) | ✅ `loadTrabajadores` |
| **Gastos fijos** (sueldos) para proyecciones | `trabajadores_erp` | ✅ en `loadMonthlyData` |
| **Cerebro IA / Chat IA / CONTADOR IA** | módulo Kenia IA `/admin/ia` | ✅ enlaces vía `mapRoute` |
| **Chips de estado de cuadre** (cajeros pendientes) | `cuadres_erp` + `trabajadores_erp` | ✅ `loadCuadreStatusToday` |
| **Enlaces de navbar/sidebar** (`/_admin`, `/pos-admin`, etc.) | rutas de Asistora | ✅ remapeados (ver abajo) |

**Remapeo de rutas (✅ hecho):** se agregó `mapRoute()` en los shims `Link`/`useNavigate` de `page.tsx` y
`layout.tsx`. Mapea `/_admin`→`/erp`, `/admin`→`/erp`, `/pos-admin`,`/pos`→`/admin/pos-admin`,
`/dashboard-login`→`/admin/login`, `/inventario`,`/base-datos`,`/control-datos`→`/admin/inventario-erp`,
`/top-products*`,`/ganancias*`→`/erp`. Todo lo demás (features de Asistora sin equivalente en Yaxsel) cae a
`/erp-dashboard` para evitar 404. Ampliar el `MAP` cuando existan más rutas Yaxsel.

## 6. Pendientes / notas técnicas para el próximo agente

- ~~**Remapear rutas** de la navbar y el drawer~~ ✅ HECHO vía `mapRoute()` (ver §5).
- ~~**Dead code**~~ ✅ LIMPIADO: se borraron ~625 líneas de código Firebase muerto (page.tsx: `loadData`,
  `loadTrabajadores`, `loadCuadreStatusToday`, `loadMonthlyData` = 501 líneas; layout.tsx: `fetchTodaySales` = 124).
  Cada loader ahora tiene solo su lógica `[APPWRITE]`. `tsc --noEmit` → 0 errores, render verificado.
- **Chips de estado de cuadre** ✅ HECHO: `loadCuadreStatusToday` marca una sede como pendiente si NO tiene cuadre
  para el día (Hoy/Ayer); muestra sus cajeros (trabajadores con cargo "cajer*"). El botón "Hacer corte" →
  `/erp/nuevo` (vía `mapRoute` slug de sede → nuevo cuadre).
- ~~**Trabajadores/Gastos fijos**~~ ✅ HECHO: colección `trabajadores_erp` creada (nombre, cargo, sede, sueldo,
  fotoUrl, activo, nacionalidad, genero, fechaIngreso; índice `sede_idx`; permisos `any`). Servicio
  `src/lib/trabajadoresErpService.ts` (`fetchTrabajadoresERP`, `createTrabajadorERP`, `deleteTrabajadorERP`).
  `loadTrabajadores` y los gastos fijos de `loadMonthlyData` leen de ahí. Hay 3 trabajadores de prueba (alameda).
  **Formulario ✅:** `src/app/erp-dashboard/equipo/page.tsx` — lista/agrega/elimina equipo (probado: create cliente→Appwrite
  funciona). Entrada desde el dashboard: "Trabajadores" (`/planilla-unificada` → `/erp-dashboard/equipo` vía `mapRoute`).
- ~~**Cerebro IA / Chat IA**~~ ✅ HECHO: los botones (Cerebro IA, Dashboard ASIS, CONTADOR IA, burbujas ASIS/TORA,
  WhatsApp/Telegram) enlazan al módulo Kenia IA de Yaxsel vía `mapRoute` (`/chat-ia`,`/cerebro-ia`,`/ia-consultor`,
  `/asis-monitor`→`/admin/ia`; `/whatsapp*`→`/admin/ia/whatsapp`).
- **Regla de oro respetada:** tras cada cambio, `npx tsc --noEmit` → **0 errores**.
- **Datos mensuales sparse:** hoy solo existe 1 cuadre real (el de prueba), por eso el Análisis Mensual muestra
  "1/31 días". Al ingresar cuadres reales, el dashboard se llena solo.

## 7. Archivos nuevos/editados en esta ejecución

| Archivo | Acción |
|---|---|
| Appwrite: colección `cuadres_erp` | CREADA (+ doc de prueba) |
| Appwrite: colección `trabajadores_erp` | CREADA (+ 3 docs de prueba) |
| `src/lib/cuadresErpService.ts` | CREADO |
| `src/lib/trabajadoresErpService.ts` | CREADO |
| `src/app/erp/page.tsx` | EDITADO (migrado a Appwrite) |
| `src/app/erp-dashboard/page.tsx` | CREADO (dashboard principal, port + binding) |
| `src/app/erp-dashboard/layout.tsx` | CREADO (navbar + sidebar, port + binding) |
| `src/app/erp-dashboard/equipo/page.tsx` | CREADO (formulario gestión de equipo) |
| `src/app/erp/nuevo/page.tsx` | CREADO (formulario nuevo cuadre, PASO 6) |
| `src/lib/trabajadoresErpService.ts` | CREADO |
| `src/data/demoWorkers.ts` | CREADO (datos demo de equipo) |
| `public/erp/asis.png`, `public/erp/tora.png`, `public/avatar.png` | COPIADOS |
| `src/app/admin/(panel)/layout.tsx` | EDITADO (enlace ERP → `/erp-dashboard`) |
| `src/app/admin/(panel)/erp/page.tsx` | EDITADO (redirect → `/erp-dashboard`) |
| `src/components/GlobalMobileNav.tsx` | EDITADO (ocultar en `/erp*`) |
| `package.json` | recharts agregado |
