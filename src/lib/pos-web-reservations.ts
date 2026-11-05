import 'server-only'
import { unstable_cache, revalidateTag } from 'next/cache'
import { getAdminDb, ORDERS_COLLECTION_ID, WHOLESALE_ORDERS_COLLECTION_ID } from '@/lib/db-server'
import { getOrderAutoCancelAt } from '@/lib/order-stock-service'

export interface WebReservationInfo {
  qty: number
  orderCodes: string[]
  orderCount: number
}

export interface PosWebReservations {
  byKey: Record<string, WebReservationInfo>
  bySku: Record<string, WebReservationInfo>
  byId: Record<string, WebReservationInfo>
}

const CACHE_TTL_SECONDS = 600
const MEMORY_TTL_MS = CACHE_TTL_SECONDS * 1000

const gReservations = globalThis as unknown as {
  __yaxsellPosWebReservationsCache?: { data: PosWebReservations; ts: number }
}

const ACTIVE_STATUSES = [
  'paid', 'pending', 'pending_stock', 'payment_expired', 'payment_review',
  'processing', 'preparing', 'payment_confirmed', 'confirmed', 'shipped',
]

function norm(str: string): string {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function parseItems(value: unknown): any[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function loadReservations(): Promise<PosWebReservations> {
  const now = Date.now()
  const cached = gReservations.__yaxsellPosWebReservationsCache
  if (cached && now - cached.ts < MEMORY_TTL_MS) {
    return cached.data
  }

  const db = getAdminDb()
  const [ordersSnap, wholesaleSnap] = await Promise.all([
    db.collection(ORDERS_COLLECTION_ID)
      .where('STATUS', 'in', ACTIVE_STATUSES)
      .where('STOCKDEDUCTED', '==', true)
      .get(),
    db.collection(WHOLESALE_ORDERS_COLLECTION_ID)
      .where('STATUS', 'in', ACTIVE_STATUSES)
      .get(),
  ])

  const result: PosWebReservations = { byKey: {}, bySku: {}, byId: {} }
  const orderKeysByMap = new Map<keyof PosWebReservations, Map<string, Set<string>>>()
  const add = (mapName: keyof PosWebReservations, key: string, qty: number, orderCode: string, orderKey: string) => {
    if (!key || qty <= 0) return
    const map = result[mapName]
    const entry = map[key] || (map[key] = { qty: 0, orderCodes: [], orderCount: 0 })
    entry.qty += qty
    if (!entry.orderCodes.includes(orderCode)) entry.orderCodes.push(orderCode)
    let ordersForMap = orderKeysByMap.get(mapName)
    if (!ordersForMap) orderKeysByMap.set(mapName, ordersForMap = new Map())
    let ordersForKey = ordersForMap.get(key)
    if (!ordersForKey) ordersForMap.set(key, ordersForKey = new Set())
    if (!ordersForKey.has(orderKey)) {
      ordersForKey.add(orderKey)
      entry.orderCount += 1
    }
  }

  const docs = [...ordersSnap.docs, ...wholesaleSnap.docs]
  for (const doc of docs) {
    const order = doc.data() as any
    const isMainOrder = doc.ref.parent.id === ORDERS_COLLECTION_ID
    if (isMainOrder && order.STOCKDEDUCTED !== true) continue
    // Vendor products are stocked independently from the main POS catalog.
    if (order.IS_VENDOR_ORDER === true || order.VENDOR_ID) continue
    if (String(order.STATUS || '') === 'shipped') {
      const agency = String(order.SHIPPINGAGENCY || '').toUpperCase()
      if (!agency.includes('RETIRO')) continue
    }

    // A payment timeout alone does not return stock. Keep the reservation until
    // the 24-hour cancellation deadline unless a proof was uploaded.
    const status = String(order.STATUS || '')
    const hasProof = Boolean(order.PAYMENTPROOFURL)
    const autoCancelAt = getOrderAutoCancelAt(order)
    if (['paid', 'pending', 'pending_stock', 'payment_expired'].includes(status)
      && !hasProof && autoCancelAt > 0 && autoCancelAt <= now) continue

    const orderCode = String(order.ORDERCODE || order.code || doc.id)
    const orderKey = `${doc.ref.parent.id}:${doc.id}`
    for (const item of parseItems(order.ITEMS)) {
      const qty = Number(item.qty || item.quantity || item.cantidad || 0)
      if (qty <= 0) continue
      const rawSku = String(item.sku || item.SKU || '').trim()
      const rawId = String(item.id || item.pid || item.productId || '').trim()

      const keys = new Set<string>()
      if (rawSku) {
        keys.add(rawSku.toUpperCase())
        keys.add(norm(rawSku))
        add('bySku', rawSku.toUpperCase(), qty, orderCode, orderKey)
      }
      if (rawId) {
        keys.add(rawId)
        keys.add(norm(rawId))
        add('byId', rawId, qty, orderCode, orderKey)
      }
      for (const key of keys) add('byKey', key, qty, orderCode, orderKey)
    }
  }

  console.info('[pos/web-reservations] reconstrucción de caché', {
    orders: ordersSnap.size,
    wholesaleOrders: wholesaleSnap.size,
    reservationKeys: Object.keys(result.byKey).length,
  })
  gReservations.__yaxsellPosWebReservationsCache = { data: result, ts: Date.now() }
  return result
}

const getNextCachedReservations = unstable_cache(
  loadReservations,
  ['pos-web-reservations-v2'],
  { revalidate: CACHE_TTL_SECONDS, tags: ['pos-web-reservations'] },
)

// Shared by the POS reservation endpoint and the checkout revalidation route.
// A dedicated tag prevents changes to proof/shipping/deadline fields from
// forcing a full scan of active orders when reserved stock has not changed.
export async function getCachedPosWebReservations(): Promise<PosWebReservations> {
  const cached = gReservations.__yaxsellPosWebReservationsCache
  if (cached && Date.now() - cached.ts < MEMORY_TTL_MS) {
    return cached.data
  }
  return getNextCachedReservations()
}

export function invalidatePosWebReservations(): void {
  gReservations.__yaxsellPosWebReservationsCache = undefined
  try { revalidateTag('pos-web-reservations') } catch {}
}
