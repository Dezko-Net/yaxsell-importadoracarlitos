import { FieldValue } from 'firebase-admin/firestore'
import {
  ORDERS_COLLECTION_ID,
  VENDOR_ORDERS_COLLECTION_ID,
  WHOLESALE_ORDERS_COLLECTION_ID,
} from '@/lib/db'
import { getAdminDb, serverGetDocument, serverListDocuments } from '@/lib/db-server'

export type ResolvedOrder = {
  order: Record<string, any>
  collectionId: string
}

export type OrderLookupResult =
  | { status: 'found'; match: ResolvedOrder }
  | { status: 'not_found' }
  | { status: 'ambiguous' }

const ORDER_COLLECTIONS = [
  ORDERS_COLLECTION_ID,
  VENDOR_ORDERS_COLLECTION_ID,
  WHOLESALE_ORDERS_COLLECTION_ID,
]

function getOrderId(order: Record<string, any>, fallback = ''): string {
  return String(order.$id || order.id || fallback)
}

export async function resolveOrderById(
  id: string,
  collectionIds: string[] = ORDER_COLLECTIONS,
): Promise<OrderLookupResult> {
  const cleanId = String(id || '').trim()
  if (!cleanId) return { status: 'not_found' }

  const found: ResolvedOrder[] = []
  for (const collectionId of collectionIds) {
    try {
      const order = await serverGetDocument(collectionId, cleanId) as Record<string, any> | null
      if (order) found.push({ order, collectionId })
    } catch {}
  }

  if (!found.length) return { status: 'not_found' }
  const selected = found.find(({ collectionId }) => collectionId === VENDOR_ORDERS_COLLECTION_ID)
    || found.find(({ collectionId }) => collectionId === WHOLESALE_ORDERS_COLLECTION_ID)
    || found[0]
  return { status: 'found', match: selected }
}

export async function resolveOrderByCode(
  code: string,
  collectionIds: string[] = ORDER_COLLECTIONS,
): Promise<OrderLookupResult> {
  const cleanCode = String(code || '').trim()
  if (!cleanCode) return { status: 'not_found' }

  const documents = await Promise.all(collectionIds.map(async (collectionId) => {
    try {
      const limit = JSON.stringify({ method: 'limit', values: [25] })
      const attributes = collectionId === WHOLESALE_ORDERS_COLLECTION_ID ? ['ORDERCODE', 'REQCODE'] : ['ORDERCODE']
      const results = await Promise.all(attributes.map((attribute) => {
        const equal = JSON.stringify({ method: 'equal', attribute, values: [cleanCode] })
        return serverListDocuments(collectionId, [equal, limit])
      }))
      return results.flatMap((result) => (result.documents || []).map((order: any) => ({ order, collectionId })))
    } catch {
      return []
    }
  }))

  const byId = new Map<string, ResolvedOrder>()
  for (const entry of documents.flat()) {
    const id = getOrderId(entry.order)
    const key = id || `${entry.collectionId}:${String(entry.order.ORDERCODE || cleanCode)}`
    const candidate = {
      order: entry.order,
      collectionId: entry.collectionId,
    }
    const current = byId.get(key)
    if (!current || candidate.collectionId === VENDOR_ORDERS_COLLECTION_ID || candidate.collectionId === WHOLESALE_ORDERS_COLLECTION_ID) {
      byId.set(key, candidate)
    }
  }

  const matches = [...byId.values()]
  if (!matches.length) return { status: 'not_found' }
  if (matches.length > 1) return { status: 'ambiguous' }
  return { status: 'found', match: matches[0] }
}

/**
 * Reserve one globally sequenced, collision-checked public order code.
 * The reservation and global counter advance in the same Firestore transaction,
 * so concurrent web, vendor, and WhatsApp checkouts cannot issue the same code.
 */
export async function reserveOrderCode(prefix = 'ORD', width = 5): Promise<{ orderIndex: number; orderCode: string }> {
  const db = getAdminDb()
  const cleanPrefix = String(prefix || 'ORD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'ORD'
  const sequenceRef = db.collection('order_code_sequences').doc('global')
  const reservationCollection = db.collection('order_code_reservations')

  const legacyMaxima = await Promise.all(ORDER_COLLECTIONS.map(async (collectionId) => {
    try {
      const snapshot = await db.collection(collectionId).orderBy('ORDERINDEX', 'desc').limit(1).get()
      const value = Number(snapshot.docs[0]?.get('ORDERINDEX') || 0)
      return Number.isFinite(value) ? value : 0
    } catch {
      return 0
    }
  }))
  const legacyMax = Math.max(0, ...legacyMaxima)

  return db.runTransaction(async (transaction) => {
    const sequence = await transaction.get(sequenceRef)
    const storedSequence = Number(sequence.data()?.value || 0)
    let nextIndex = Math.max(Number.isFinite(storedSequence) ? storedSequence : 0, legacyMax)

    for (let attempt = 0; attempt < 100; attempt += 1) {
      nextIndex += 1
      const orderCode = `${cleanPrefix}-${String(nextIndex).padStart(width, '0')}`
      const reservationRef = reservationCollection.doc(orderCode)
      const reservation = await transaction.get(reservationRef)
      const existingOrders = await Promise.all(ORDER_COLLECTIONS.flatMap((collectionId) => {
        const attributes = collectionId === WHOLESALE_ORDERS_COLLECTION_ID ? ['ORDERCODE', 'REQCODE'] : ['ORDERCODE']
        const collection = db.collection(collectionId)
        return [
          ...attributes.map((attribute) => transaction.get(
            collection.where(attribute, '==', orderCode).limit(1),
          )),
          transaction.get(collection.where('ORDERINDEX', '==', nextIndex).limit(1)),
        ]
      }))

      if (reservation.exists || existingOrders.some((snapshot) => !snapshot.empty)) continue

      transaction.set(sequenceRef, { value: nextIndex, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      transaction.create(reservationRef, {
        orderCode,
        orderIndex: nextIndex,
        createdAt: FieldValue.serverTimestamp(),
      })
      return { orderIndex: nextIndex, orderCode }
    }

    throw new Error('No se pudo reservar un número de pedido único. Intenta nuevamente.')
  })
}
