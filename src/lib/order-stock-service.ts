import { getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { PAYMENT_PROOF_GRACE_MS } from '@/lib/payment-deadline';
import { getOrderAutoCancelDeadline } from '@/lib/order-expiration';
import {
  patchCatalogMemoryCacheStock,
  restoreCatalogMemoryCacheStock,
  resolveProductFromCatalogCache,
  isMainStoreProduct,
} from '@/lib/catalog-cache';
import {
  getInventoryStock,
  getInventoryStockField,
  getOrderInventoryConnectionMode,
  inventoryStockUpdate,
  type InventoryStockField,
} from '@/lib/inventory-mode';

const UNLIMITED_STOCK = 99999;

const gOrderStock = globalThis as unknown as {
  __yaxsellUnlimitedStockCache?: { value: boolean; time: number };
};
const UNLIMITED_STOCK_CACHE_TTL = 15 * 60 * 1000; // 15 minutos en RAM
// Estados heredados que todavía pueden existir en pedidos con reserva activa.
// En el flujo actual todos equivalen a stock confirmado hasta que vence el reloj.
export const PAYMENT_PENDING_STATUSES = ['paid', 'pending', 'pending_stock', 'processing'] as const;
export const PAYMENT_EXPIRATION_STATUSES = [...PAYMENT_PENDING_STATUSES, 'payment_expired'] as const;
export function isVendorOrder(order: Record<string, any> | null | undefined): boolean {
  return order?.IS_VENDOR_ORDER === true || Boolean(order?.VENDOR_ID);
}
export function getOrderPaymentDeadline(order: Record<string, any>): number {
  const explicitBackendDeadline = Number(order.EXPIRESATBACKEND || 0);
  if (explicitBackendDeadline > 0) return explicitBackendDeadline;
  const visibleDeadline = Number(order.EXPIRESAT || 0);
  return visibleDeadline > 0 ? visibleDeadline + PAYMENT_PROOF_GRACE_MS : 0;
}

export function getOrderAutoCancelAt(order: Record<string, any>): number {
  return getOrderAutoCancelDeadline(order);
}

export function isOrderPaymentWindowExpired(order: Record<string, any>, now: number = Date.now()): boolean {
  // Las tiendas aliadas conservan la reserva hasta las 24 h; no usan el reloj
  // corto de la tienda principal ni pasan por el estado "Pago vencido".
  if (isVendorOrder(order)) {
    const autoCancelAt = getOrderAutoCancelAt(order);
    return autoCancelAt > 0 && autoCancelAt <= now;
  }
  const paymentDeadline = Number(order.EXPIRESAT || getOrderPaymentDeadline(order));
  const autoCancelAt = getOrderAutoCancelAt(order);
  return (paymentDeadline > 0 && paymentDeadline <= now) || (autoCancelAt > 0 && autoCancelAt <= now);
}

export async function isUnlimitedStockEnabled(): Promise<boolean> {
  const cached = gOrderStock.__yaxsellUnlimitedStockCache;
  if (cached && Date.now() - cached.time < UNLIMITED_STOCK_CACHE_TTL) {
    return cached.value;
  }
  try {
    const db = getAdminDb();
    const col = db.collection(STORE_SETTINGS_COLLECTION);
    const [mainSnap, configSnap] = await Promise.all([
      col.doc('main').get(),
      col.doc('config').get(),
    ]);
    const main = mainSnap.exists ? mainSnap.data() : {};
    const config = configSnap.exists ? configSnap.data() : {};
    const value = (main?.UNLIMITEDSTOCK ?? main?.unlimitedStock ?? config?.UNLIMITEDSTOCK ?? config?.unlimitedStock) === true;
    gOrderStock.__yaxsellUnlimitedStockCache = { value, time: Date.now() };
    return value;
  } catch {
    return false;
  }
}

interface ParsedOrderItem {
  id?: string;
  sku?: string;
  qty: number;
  name?: string;
}

function isVirtualStockItem(item: any): boolean {
  const id = String(item?.id || item?.pid || item?.productId || item?.$id || '');
  const sku = String(item?.sku || item?.SKU || '');
  return sku === 'PROMO1' || id.startsWith('bundle-');
}

function isVirtualOnlyOrderItems(rawItems: unknown): boolean {
  let items: any = rawItems;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return false; }
  }
  return Array.isArray(items) && items.length > 0 && items.every((item: any) => {
    const qty = Math.floor(Number(item?.qty ?? item?.CANTIDAD ?? item?.quantity) || 0);
    return qty > 0 && isVirtualStockItem(item);
  });
}

function aggregateResolvedItems<T extends { ref: FirebaseFirestore.DocumentReference; qty: number; name: string; sku: string }>(items: T[]): T[] {
  const byPath = new Map<string, T>();
  for (const item of items) {
    const key = item.ref.path;
    const existing = byPath.get(key);
    if (existing) existing.qty += item.qty;
    else byPath.set(key, { ...item });
  }
  return [...byPath.values()];
}

function patchStockCacheByField(
  rows: Array<{ id: string; sku: string; qty: number; stockField: InventoryStockField }>,
  patch: typeof patchCatalogMemoryCacheStock,
): void {
  for (const stockField of ['STOCK', 'WEB_STOCK'] as const) {
    const matching = rows.filter(row => row.stockField === stockField);
    if (matching.length) patch(matching.map(row => ({ id: row.id, sku: row.sku, cantidad: row.qty })), stockField);
  }
}

export interface OrderStockMeta {
  orderCode?: string;
  customerName?: string;
  orderIndex?: number | string;
}

async function findOrderRef(orderId: string) {
  const db = getAdminDb();
  for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
    const ref = db.collection(collectionId).doc(orderId);
    const snapshot = await ref.get();
    if (snapshot.exists) return { ref, snapshot, collectionId };
  }
  return null;
}

function getMirrorOrderRef(orderId: string, collectionId: string, order: Record<string, any>) {
  if (!order.IS_VENDOR_ORDER && !order.VENDOR_ID) return null;
  const mirrorCollection = collectionId === ORDERS_COLLECTION_ID ? VENDOR_ORDERS_COLLECTION_ID : ORDERS_COLLECTION_ID;
  return getAdminDb().collection(mirrorCollection).doc(orderId);
}

/** Acomoda fechas AUTOCANCELAT antiguas al límite de 24 h desde CREATEDAT. */
export async function syncExpiredOrderAutoCancelAt(orderId: string): Promise<boolean> {
  const adminDb = getAdminDb();
  const target = await findOrderRef(orderId);
  if (!target) return false;
  const { ref: orderRef, collectionId, snapshot } = target;
  const mirrorRef = getMirrorOrderRef(orderId, collectionId, snapshot.data() || {});

  return adminDb.runTransaction(async (transaction) => {
    const [freshOrder, freshMirror] = await Promise.all([
      transaction.get(orderRef),
      mirrorRef ? transaction.get(mirrorRef) : Promise.resolve(null),
    ]);
    if (!freshOrder.exists) return false;
    const order = freshOrder.data() || {};
    if (order.STATUS !== 'payment_expired' || order.PAYMENTPROOFURL) return false;

    const autoCancelAt = getOrderAutoCancelAt(order);
    if (!autoCancelAt || Number(order.AUTOCANCELAT || 0) === autoCancelAt) return false;

    const update = { AUTOCANCELAT: autoCancelAt, UPDATEDAT: Date.now() };
    transaction.update(orderRef, update);
    if (mirrorRef && freshMirror?.exists) transaction.update(mirrorRef, update);
    return true;
  });
}

/**
 * Descuenta del inventario Firestore las cantidades correspondientes a un pedido.
 * Utiliza transacciones atómicas ACID (adminDb.runTransaction).
 * Si cualquier ítem no tiene existencias, la transacción se aborta completamente (cero sobreventa).
 */
export async function deductStockForOrder(orderId: string, rawItems?: any[], meta?: OrderStockMeta): Promise<boolean> {
  const adminDb = getAdminDb();
  let orderRef: FirebaseFirestore.DocumentReference | null = null;
  let mirrorRef: FirebaseFirestore.DocumentReference | null = null;
  let orderExists = false;

  let orderData: any = null;
  let itemsToDeduct = rawItems;
  try {
    const target = await findOrderRef(orderId);
    if (target) {
      orderRef = target.ref;
      orderExists = true;
      orderData = target.snapshot.data();
      mirrorRef = getMirrorOrderRef(orderId, target.collectionId, orderData);
      // IDEMPOTENCIA: Si ya está marcado como STOCKDEDUCTED: true, evitar doble descuento
      if (orderData?.STOCKDEDUCTED === true) {
        console.log(`[order-stock-service] Pedido ${orderId} ya tiene stock descontado (STOCKDEDUCTED: true). Omitiendo doble descuento.`);
        return true;
      }
      if (!itemsToDeduct) {
        itemsToDeduct = orderData?.ITEMS || [];
      }
    }
  } catch (err) {
    console.warn(`[order-stock-service] Error consultando orden ${orderId}:`, err);
  }

  if (typeof itemsToDeduct === 'string') {
    try { itemsToDeduct = JSON.parse(itemsToDeduct); } catch { itemsToDeduct = []; }
  }

  if (!itemsToDeduct || !Array.isArray(itemsToDeduct) || itemsToDeduct.length === 0) {
    return false;
  }

  if (await isUnlimitedStockEnabled()) return false;
  const inventoryMode = await getOrderInventoryConnectionMode(orderData);

  const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);

  // 1. Normalizar ítems
  const items: ParsedOrderItem[] = itemsToDeduct
    .map((item) => ({
      id: (item.id || item.pid || item.productId || item.$id || '').trim(),
      sku: (item.sku || item.SKU || '').trim(),
      qty: Math.max(0, Math.floor(Number(item.qty ?? item.CANTIDAD ?? item.quantity) || 0)),
      name: item.name || item.NAME || item.nombre || '',
    }))
    .filter((it) => it.qty > 0);

  if (items.length === 0) return false;

  // 2. Resolver Document References por ID, SKU o nombre (paralelizado)
  const resolvedItems: Array<{ ref: FirebaseFirestore.DocumentReference; qty: number; name: string; sku: string }> = [];

  const resolveResults = await Promise.all(items.map(async (it) => {
    // 2.0. Resolver desde caché en memoria del servidor (0 lecturas a Firestore)
    const cachedMatch = resolveProductFromCatalogCache({ id: it.id, sku: it.sku, name: it.name });
    if (cachedMatch) {
      return { ref: productsCol.doc(cachedMatch.id), qty: it.qty, name: it.name || '', sku: it.sku || cachedMatch.sku || '' };
    }

    // 2a. Intentar por ID directo (verificando que exista)
    if (it.id && it.id.length > 3) {
      try {
        const idSnap = await productsCol.doc(it.id).get();
        if (idSnap.exists) return { ref: idSnap.ref, qty: it.qty, name: it.name || '', sku: it.sku || '' };
      } catch {}
    }

    // 2b. Si no se encontró por ID, buscar por SKU
    if (it.sku && it.sku !== '-' && it.sku !== 'undefined') {
      try {
        let snap = await productsCol.where('SKU', '==', it.sku).limit(1).get();
        if (snap.empty) snap = await productsCol.where('sku', '==', it.sku).limit(1).get();
        if (!snap.empty) return { ref: snap.docs[0].ref, qty: it.qty, name: it.name || '', sku: it.sku || '' };
      } catch (err) {
        console.warn(`[order-stock-service] Error buscando por SKU "${it.sku}":`, err);
      }
    }

    // 2c. Si no se encontró por ID ni SKU, buscar por nombre
    if (it.name) {
      try {
        let snap = await productsCol.where('NAME', '==', it.name).limit(1).get();
        if (snap.empty) snap = await productsCol.where('name', '==', it.name).limit(1).get();
        if (!snap.empty) return { ref: snap.docs[0].ref, qty: it.qty, name: it.name || '', sku: it.sku || '' };
      } catch (err) {
        console.warn(`[order-stock-service] Error buscando por nombre "${it.name}":`, err);
      }
    }

    console.warn(`[order-stock-service] Producto no encontrado para item:`, it);
    return null;
  }));

  for (const r of resolveResults) {
    if (r) resolvedItems.push(r);
  }

  if (resolvedItems.length === 0 || resolvedItems.length !== items.length) return false;
  // Un mismo producto puede aparecer en varias líneas (por ejemplo, unidad y
  // embalaje). Se valida y descuenta el total una sola vez por documento.
  resolvedItems.splice(0, resolvedItems.length, ...aggregateResolvedItems(resolvedItems));

  const movementsToRecord: Array<{
    productId: string;
    sku: string;
    nombre: string;
    stockAnterior: number;
    stockNuevo: number;
    qty: number;
    stockField: InventoryStockField;
  }> = [];

  // 3. Ejecutar transacción ACID en Firestore
  await adminDb.runTransaction(async (t) => {
    // Fase de lectura: leer todos los snapshots dentro de la transacción
    const snaps = await Promise.all(resolvedItems.map((it) => t.get(it.ref)));

    // Fase de verificación
    for (let i = 0; i < resolvedItems.length; i++) {
      const snap = snaps[i];
      const item = resolvedItems[i];

      if (!snap.exists) {
        throw new Error(`Producto "${item.name || item.sku || snap.id}" no existe en el catálogo.`);
      }

      const data = snap.data() || {};
      const currentStock = getInventoryStock(data, inventoryMode, isMainStoreProduct(data));

      // Si el producto tiene stock ilimitado centinela (99999), omitir descuento
      if (currentStock === UNLIMITED_STOCK) continue;

      if (currentStock < item.qty) {
        const prodName = data.NAME || data.name || item.name || snap.id;
        throw new Error(`Stock insuficiente para "${prodName}". Disponible: ${currentStock}, solicitado: ${item.qty}.`);
      }
    }

    // Fase de escritura: aplicar decrementos atómicos
    for (let i = 0; i < resolvedItems.length; i++) {
      const snap = snaps[i];
      const item = resolvedItems[i];
      const data = snap.data() || {};
      const mainStoreProduct = isMainStoreProduct(data);
      const stockField = getInventoryStockField(inventoryMode, mainStoreProduct);
      const currentStock = getInventoryStock(data, inventoryMode, mainStoreProduct);

      if (currentStock === UNLIMITED_STOCK) continue;

      const newStock = Math.max(0, currentStock - item.qty);
      t.update(item.ref, {
        ...inventoryStockUpdate(newStock, inventoryMode, mainStoreProduct),
        soldQuantity: FieldValue.increment(item.qty),
        updatedAt: Date.now(),
      });
      movementsToRecord.push({
        productId: snap.id,
        sku: item.sku || data.SKU || snap.id,
        nombre: item.name || data.NAME || 'Producto',
        stockAnterior: currentStock,
        stockNuevo: newStock,
        qty: item.qty,
        stockField,
      });
      console.log(`[order-stock-service] Stock descontado (TX) para "${data.NAME || snap.id}": ${currentStock} -> ${newStock} (-${item.qty})`);
    }
  });

  // 3.5. Registrar movimientos de auditoría en stock_movements
  if (movementsToRecord.length > 0) {
    try {
      const movementsCol = adminDb.collection('stock_movements');
      const nowMs = Date.now();
      const fechaStr = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const horaChile = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date(nowMs));

      const rawCode = meta?.orderCode || orderData?.ORDERCODE;
      const orderNum = rawCode
        ? (String(rawCode).startsWith('#') ? String(rawCode) : `#${rawCode}`)
        : (orderData?.ORDERINDEX ? `#${orderData.ORDERINDEX}` : (meta?.orderIndex ? `#${meta.orderIndex}` : (orderId.startsWith('wa_') ? orderId.slice(0, 18) : orderId)));
      const rawCustomer = meta?.customerName || orderData?.CUSTOMERNAME || '';
      const clientName = rawCustomer ? ` · Cliente: ${rawCustomer}` : '';

      for (const m of movementsToRecord) {
        await movementsCol.add({
          productId: m.productId,
          sku: m.sku,
          nombre: m.nombre,
          tipo: 'venta_web',
          stockAnterior: m.stockAnterior,
          cantidad: -m.qty,
          stockNuevo: m.stockNuevo,
          pendienteDescontado: 0,
          fecha: fechaStr,
          fechaTs: nowMs,
          fechaHora: horaChile,
          usuario: 'Tienda Web',
          nota: `Pedido Web ${orderNum}${clientName} (Separación Web)`,
        });
      }
    } catch (movErr) {
      console.warn(`[order-stock-service] Error registrando stock_movements para orden ${orderId}:`, movErr);
    }
  }

  if (orderExists && orderRef) {
    try {
      await orderRef.update({
        STOCKDEDUCTED: true,
        INVENTORYMODE: inventoryMode,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (mirrorRef) {
        try {
          const mirrorSnap = await mirrorRef.get();
          if (mirrorSnap.exists) {
            await mirrorRef.update({
              STOCKDEDUCTED: true,
              INVENTORYMODE: inventoryMode,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        } catch {}
      }
    } catch (e) {
      console.warn(`[order-stock-service] Error marcando STOCKDEDUCTED: true en orden ${orderId}:`, e);
    }
  }

  // Parchear en memoria el catálogo del servidor (0 lecturas en vez de purgar 736 docs)
  if (movementsToRecord.length > 0) {
    try {
      patchStockCacheByField(
        movementsToRecord.map((m) => ({ id: m.productId, sku: m.sku, qty: m.qty, stockField: m.stockField })),
        patchCatalogMemoryCacheStock,
      );
    } catch {}
  }
  if (orderExists && orderRef?.parent.id === ORDERS_COLLECTION_ID && !isVendorOrder(orderData)) {
    try { revalidateTag('pos-web-reservations') } catch {}
  }
  return true;
}

/**
 * Restituye al inventario Firestore las cantidades correspondientes a un pedido cancelado.
 * Utiliza transacciones atómicas ACID (adminDb.runTransaction).
 */
export async function restoreStockForOrder(orderId: string, rawItems?: any[], meta?: OrderStockMeta): Promise<boolean> {
  const adminDb = getAdminDb();
  let orderRef: FirebaseFirestore.DocumentReference | null = null;
  let mirrorRef: FirebaseFirestore.DocumentReference | null = null;
  let orderExists = false;

  let orderData: any = null;
  let itemsToRestore = rawItems;
  try {
    const target = await findOrderRef(orderId);
    if (target) {
      orderRef = target.ref;
      orderExists = true;
      orderData = target.snapshot.data();
      mirrorRef = getMirrorOrderRef(orderId, target.collectionId, orderData);

      let mirrorData: any = null;
      if (mirrorRef) {
        try {
          const mirrorSnap = await mirrorRef.get();
          if (mirrorSnap.exists) mirrorData = mirrorSnap.data();
        } catch {}
      }

      // IDEMPOTENCIA: Si ya está restituido en CUALQUIERA de las colecciones, evitar duplicación
      const isAlreadyRestored =
        orderData?.STOCKDEDUCTED === false ||
        orderData?.STATUS === 'cancelled' ||
        mirrorData?.STOCKDEDUCTED === false ||
        mirrorData?.STATUS === 'cancelled';

      if (isAlreadyRestored) {
        console.log(`[order-stock-service] Pedido ${orderId} (o su espejo) ya tiene stock restituido (STOCKDEDUCTED: false / STATUS: cancelled). Omitiendo.`);
        return true;
      }
      if (!itemsToRestore) {
        itemsToRestore = orderData?.ITEMS || mirrorData?.ITEMS || [];
      }
    }
  } catch (err) {
    console.warn(`[order-stock-service] Error consultando orden ${orderId}:`, err);
  }

  if (typeof itemsToRestore === 'string') {
    try { itemsToRestore = JSON.parse(itemsToRestore); } catch { itemsToRestore = []; }
  }

  if (!itemsToRestore || !Array.isArray(itemsToRestore) || itemsToRestore.length === 0) {
    return false;
  }
  const inventoryMode = await getOrderInventoryConnectionMode(orderData);

  const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);

  const items: ParsedOrderItem[] = itemsToRestore
    .filter((item: any) => !isVirtualStockItem(item))
    .map((item) => ({
      id: (item.id || item.pid || item.productId || item.$id || '').trim(),
      sku: (item.sku || item.SKU || '').trim(),
      qty: Math.max(0, Math.floor(Number(item.qty ?? item.CANTIDAD ?? item.quantity) || 0)),
      name: item.name || item.NAME || item.nombre || '',
    }))
    .filter((it) => it.qty > 0);

  if (items.length === 0) {
    // Los bundles virtuales no tienen documento de producto. Aun así, hay que
    // dejar el pedido cancelable y quitar su marca de reserva de forma atómica.
    if (!orderExists || !orderRef || !isVirtualOnlyOrderItems(itemsToRestore)) return false;
    const released = await adminDb.runTransaction(async transaction => {
      const freshOrder = await transaction.get(orderRef!);
      if (!freshOrder.exists) return false;
      if (freshOrder.data()?.STOCKDEDUCTED !== true) return true;
      transaction.update(orderRef!, { STOCKDEDUCTED: false, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (released) {
      try { revalidateTag('orders'); } catch {}
      if (orderRef.parent.id === ORDERS_COLLECTION_ID && !isVendorOrder(orderData)) {
        try { revalidateTag('pos-web-reservations') } catch {}
      }
    }
    return released;
  }

  const resolvedItems: Array<{ ref: FirebaseFirestore.DocumentReference; qty: number; name: string; sku: string }> = [];

  const resolveResults = await Promise.all(items.map(async (it) => {
    // 2.0. Resolver desde caché en memoria del servidor (0 lecturas a Firestore)
    const cachedMatch = resolveProductFromCatalogCache({ id: it.id, sku: it.sku, name: it.name });
    if (cachedMatch) {
      return { ref: productsCol.doc(cachedMatch.id), qty: it.qty, name: it.name || '', sku: it.sku || cachedMatch.sku || '' };
    }

    // 2a. Intentar por ID directo (verificando que exista)
    if (it.id && it.id.length > 3) {
      try {
        const idSnap = await productsCol.doc(it.id).get();
        if (idSnap.exists) return { ref: idSnap.ref, qty: it.qty, name: it.name || '', sku: it.sku || '' };
      } catch {}
    }

    // 2b. Si no se encontró por ID, buscar por SKU
    if (it.sku && it.sku !== '-' && it.sku !== 'undefined') {
      try {
        let snap = await productsCol.where('SKU', '==', it.sku).limit(1).get();
        if (snap.empty) snap = await productsCol.where('sku', '==', it.sku).limit(1).get();
        if (!snap.empty) return { ref: snap.docs[0].ref, qty: it.qty, name: it.name || '', sku: it.sku || '' };
      } catch (err) {
        console.warn(`[order-stock-service] Error buscando por SKU "${it.sku}":`, err);
      }
    }

    // 2c. Si no se encontró por ID ni SKU, buscar por nombre
    if (it.name) {
      try {
        let snap = await productsCol.where('NAME', '==', it.name).limit(1).get();
        if (snap.empty) snap = await productsCol.where('name', '==', it.name).limit(1).get();
        if (!snap.empty) return { ref: snap.docs[0].ref, qty: it.qty, name: it.name || '', sku: it.sku || '' };
      } catch (err) {
        console.warn(`[order-stock-service] Error buscando por nombre "${it.name}":`, err);
      }
    }

    return null;
  }));

  for (const r of resolveResults) {
    if (r) resolvedItems.push(r);
  }

  if (resolvedItems.length === 0 || resolvedItems.length !== items.length) return false;
  resolvedItems.splice(0, resolvedItems.length, ...aggregateResolvedItems(resolvedItems));

  const restoredMovements: Array<{
    productId: string;
    sku: string;
    nombre: string;
    stockAnterior: number;
    stockNuevo: number;
    qty: number;
    stockField: InventoryStockField;
  }> = [];

  let restored = false;
  await adminDb.runTransaction(async (t) => {
    restoredMovements.length = 0;
    let freshOrder: FirebaseFirestore.DocumentSnapshot | null = null;
    let freshMirror: FirebaseFirestore.DocumentSnapshot | null = null;
    if (orderRef) {
      const [snapOrder, snapMirror] = await Promise.all([
        t.get(orderRef),
        mirrorRef ? t.get(mirrorRef) : Promise.resolve(null),
      ]);
      freshOrder = snapOrder;
      freshMirror = snapMirror;

      const freshOrderData = freshOrder?.exists ? (freshOrder.data() || {}) : {};
      const freshMirrorData = freshMirror?.exists ? (freshMirror.data() || {}) : {};

      // Si cualquiera ya tiene stock restituido o cancelado, abortar la transacción inmediatamente
      if (
        (freshOrder?.exists && (freshOrderData.STOCKDEDUCTED === false || freshOrderData.STATUS === 'cancelled')) ||
        (freshMirror?.exists && (freshMirrorData.STOCKDEDUCTED === false || freshMirrorData.STATUS === 'cancelled'))
      ) {
        console.log(`[order-stock-service] Pedido ${orderId} ya cancelado/restituido dentro de TX. Omitiendo.`);
        return;
      }

      const wasDeducted =
        (freshOrder?.exists && freshOrderData.STOCKDEDUCTED === true) ||
        (freshMirror?.exists && freshMirrorData.STOCKDEDUCTED === true);

      if (!wasDeducted) return;
      orderData = freshOrder?.exists ? freshOrderData : freshMirrorData;
    }
    const snaps = await Promise.all(resolvedItems.map((it) => t.get(it.ref)));

    for (let i = 0; i < resolvedItems.length; i++) {
      const snap = snaps[i];
      const item = resolvedItems[i];
      if (!snap.exists) continue;

      const data = snap.data() || {};
      const mainStoreProduct = isMainStoreProduct(data);
      const stockField = getInventoryStockField(inventoryMode, mainStoreProduct);
      const currentStock = getInventoryStock(data, inventoryMode, mainStoreProduct);
      if (currentStock === UNLIMITED_STOCK) continue;

      const currentSold = Number(data.soldQuantity ?? 0);
      const newStock = currentStock + item.qty;
      const newSold = Math.max(0, currentSold - item.qty);

      t.update(item.ref, {
        ...inventoryStockUpdate(newStock, inventoryMode, mainStoreProduct),
        soldQuantity: newSold,
        updatedAt: Date.now(),
      });
      restoredMovements.push({
        productId: snap.id,
        sku: item.sku || data.SKU || snap.id,
        nombre: item.name || data.NAME || 'Producto',
        stockAnterior: currentStock,
        stockNuevo: newStock,
        qty: item.qty,
        stockField,
      });
      console.log(`[order-stock-service] Stock restituido (TX) para "${data.NAME || snap.id}": ${currentStock} -> ${newStock} (+${item.qty})`);
    }
    if (orderRef && freshOrder?.exists) {
      t.update(orderRef, { STOCKDEDUCTED: false, STATUS: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
    }
    if (mirrorRef && freshMirror?.exists) {
      t.update(mirrorRef, { STOCKDEDUCTED: false, STATUS: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
    }
    restored = true;
  });

  // Orders that do not exist are only used by the legacy rollback path where
  // stock was deducted before the order document itself could be created.
  if (orderExists && !restored) return orderData?.STOCKDEDUCTED === false;

  // 3.5. Registrar auditoría de restitución en stock_movements
  if (restoredMovements.length > 0) {
    try {
      const movementsCol = adminDb.collection('stock_movements');
      const nowMs = Date.now();
      const fechaStr = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const horaChile = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date(nowMs));

      const rawCode = meta?.orderCode || orderData?.ORDERCODE;
      const orderNum = rawCode
        ? (String(rawCode).startsWith('#') ? String(rawCode) : `#${rawCode}`)
        : (orderData?.ORDERINDEX ? `#${orderData.ORDERINDEX}` : (meta?.orderIndex ? `#${meta.orderIndex}` : (orderId.startsWith('wa_') ? orderId.slice(0, 18) : orderId)));
      const rawCustomer = meta?.customerName || orderData?.CUSTOMERNAME || '';
      const clientName = rawCustomer ? ` · Cliente: ${rawCustomer}` : '';

      for (const m of restoredMovements) {
        await movementsCol.add({
          productId: m.productId,
          sku: m.sku,
          nombre: m.nombre,
          tipo: 'cancelacion_web',
          stockAnterior: m.stockAnterior,
          cantidad: m.qty,
          stockNuevo: m.stockNuevo,
          pendienteDescontado: 0,
          fecha: fechaStr,
          fechaTs: nowMs,
          fechaHora: horaChile,
          usuario: 'Tienda Web (Cancelación)',
          nota: `Restitución por pedido web cancelado ${orderNum}${clientName}`,
        });
      }
    } catch (movErr) {
      console.warn(`[order-stock-service] Error registrando stock_movements para cancelación ${orderId}:`, movErr);
    }
  }

  // Restituir en memoria el catálogo del servidor (0 lecturas en vez de purgar 736 docs)
  if (restoredMovements.length > 0) {
    try {
      patchStockCacheByField(
        restoredMovements.map((m) => ({ id: m.productId, sku: m.sku, qty: m.qty, stockField: m.stockField })),
        restoreCatalogMemoryCacheStock,
      );
    } catch {}
  }
  if (orderExists && orderRef?.parent.id === ORDERS_COLLECTION_ID && !isVendorOrder(orderData)) {
    try { revalidateTag('pos-web-reservations') } catch {}
  }
  return true;
}

export async function markOrderPaymentExpired(orderId: string, now: number = Date.now()): Promise<boolean> {
  const adminDb = getAdminDb();
  const target = await findOrderRef(orderId);
  if (!target) return false;
  const { ref: orderRef, collectionId, snapshot } = target;
  const mirrorRef = getMirrorOrderRef(orderId, collectionId, snapshot.data() || {});

  const marked = await adminDb.runTransaction(async (transaction) => {
    const [freshOrder, freshMirror] = await Promise.all([
      transaction.get(orderRef),
      mirrorRef ? transaction.get(mirrorRef) : Promise.resolve(null),
    ]);
    if (!freshOrder.exists) return false;
    const order = freshOrder.data() || {};
    if (isVendorOrder(order)) return false;
    if (!PAYMENT_PENDING_STATUSES.includes(order.STATUS) || order.PAYMENTPROOFURL) return false;
    // El estado cambia al vencer el plazo de pago, pero el auto-cancel tiene
    // como límite 24 h desde CREATEDAT. La tolerancia técnica para subir el
    // comprobante no debe retrasar el cambio de estado.
    const paymentDeadline = Number(order.EXPIRESAT || getOrderPaymentDeadline(order));
    const autoCancelAt = getOrderAutoCancelAt(order);
    if ((!paymentDeadline || paymentDeadline > now) && (!autoCancelAt || autoCancelAt > now)) return false;

    const visibleDeadline = Number(order.EXPIRESAT || paymentDeadline);
    const expirationUpdate = {
      STATUS: 'payment_expired',
      PAYMENTEXPIREDAT: visibleDeadline > 0 ? Math.min(visibleDeadline, now) : now,
      AUTOCANCELAT: autoCancelAt,
      UPDATEDAT: now,
    };
    transaction.update(orderRef, expirationUpdate);
    if (mirrorRef && freshMirror?.exists) transaction.update(mirrorRef, expirationUpdate);
    return true;
  });
  if (marked) {
    try { revalidateTag('orders'); } catch {}
  }
  return marked;
}

export async function expireUnpaidOrder(orderId: string, now: number = Date.now()): Promise<boolean> {
  const adminDb = getAdminDb();
  const target = await findOrderRef(orderId);
  if (!target) return false;
  const { ref: orderRef, snapshot: initialOrder, collectionId } = target;

  const order = initialOrder.data() || {};
  const inventoryMode = await getOrderInventoryConnectionMode(order);
  const mirrorRef = getMirrorOrderRef(orderId, collectionId, order);
  const autoCancelAt = getOrderAutoCancelAt(order);
  // El fin del temporizador de pago solo mueve el pedido a "payment_expired".
  // El stock se devuelve cuando vence el plazo absoluto de 24 h desde CREATEDAT.
  if (!PAYMENT_EXPIRATION_STATUSES.includes(order.STATUS) || order.PAYMENTPROOFURL || !autoCancelAt || autoCancelAt > now) return false;

  const stockWasDeducted = order.STOCKDEDUCTED === true;
  let resolvedItems: Array<{ ref: FirebaseFirestore.DocumentReference; qty: number; sku: string; name: string }> = [];
  if (stockWasDeducted) {
    let rawItems = order.ITEMS;
    if (typeof rawItems === 'string') {
      try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; }
    }
    if (!Array.isArray(rawItems)) rawItems = [];

    const parsedItems: ParsedOrderItem[] = rawItems
      .filter((item: any) => !isVirtualStockItem(item))
      .map((item: any) => ({
        id: String(item.id || item.pid || item.productId || item.$id || '').trim(),
        sku: String(item.sku || item.SKU || '').trim(),
        qty: Math.max(0, Math.floor(Number(item.qty ?? item.CANTIDAD ?? item.quantity) || 0)),
        name: item.name || item.NAME || item.nombre || '',
      }))
      .filter((item: ParsedOrderItem) => item.qty > 0);

    if (parsedItems.length === 0 && !isVirtualOnlyOrderItems(rawItems)) return false;

    const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);
    for (const item of parsedItems) {
      let ref: FirebaseFirestore.DocumentReference | null = null;
      const cachedMatch = resolveProductFromCatalogCache({ id: item.id, sku: item.sku, name: item.name });
      if (cachedMatch) {
        ref = productsCol.doc(cachedMatch.id);
      } else if (item.id && item.id.length > 3) {
        ref = productsCol.doc(item.id);
      } else if (item.sku && item.sku !== '-' && item.sku !== 'undefined') {
        const upper = await productsCol.where('SKU', '==', item.sku).limit(1).get();
        if (!upper.empty) ref = upper.docs[0].ref;
        else {
          const lower = await productsCol.where('sku', '==', item.sku).limit(1).get();
          if (!lower.empty) ref = lower.docs[0].ref;
        }
      }
      if (ref) resolvedItems.push({ ref, qty: item.qty, sku: item.sku || '', name: item.name || '' });
    }
    if (resolvedItems.length !== parsedItems.length) return false;
    resolvedItems = aggregateResolvedItems(resolvedItems);
  }

  const expiredMovements: Array<{
    productId: string;
    sku: string;
    nombre: string;
    stockAnterior: number;
    stockNuevo: number;
    qty: number;
    stockField: InventoryStockField;
  }> = [];

  const expired = await adminDb.runTransaction(async (transaction) => {
    expiredMovements.length = 0;
    const [freshOrder, freshMirror] = await Promise.all([
      transaction.get(orderRef),
      mirrorRef ? transaction.get(mirrorRef) : Promise.resolve(null),
    ]);
    if (!freshOrder.exists) return false;
    const fresh = freshOrder.data() || {};
    const freshAutoCancelAt = getOrderAutoCancelAt(fresh);
    if (!PAYMENT_EXPIRATION_STATUSES.includes(fresh.STATUS) || fresh.PAYMENTPROOFURL || !freshAutoCancelAt || freshAutoCancelAt > now || (fresh.STOCKDEDUCTED === true) !== stockWasDeducted) return false;

    if (stockWasDeducted) {
      const productSnapshots = await Promise.all(resolvedItems.map((item) => transaction.get(item.ref)));
      productSnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const item = resolvedItems[index];
        const data = snapshot.data() || {};
        const mainStoreProduct = isMainStoreProduct(data);
        const stockField = getInventoryStockField(inventoryMode, mainStoreProduct);
        const currentStock = getInventoryStock(data, inventoryMode, mainStoreProduct);
        if (currentStock === UNLIMITED_STOCK) return;
        const newStock = currentStock + item.qty;
        transaction.update(item.ref, {
          ...inventoryStockUpdate(newStock, inventoryMode, mainStoreProduct),
          soldQuantity: Math.max(0, Number(data.soldQuantity ?? 0) - item.qty),
          updatedAt: Date.now(),
        });
        expiredMovements.push({
          productId: snapshot.id,
          sku: item.sku || data.SKU || snapshot.id,
          nombre: item.name || data.NAME || 'Producto',
          stockAnterior: currentStock,
          stockNuevo: newStock,
          qty: item.qty,
          stockField,
        });
      });
    }
    const recordedPaymentDeadline = Number(fresh.EXPIRESAT || getOrderPaymentDeadline(fresh) || 0);
    const cancellationUpdate = {
      STATUS: 'cancelled',
      STOCKDEDUCTED: false,
      PAYMENTEXPIREDAT: Number(fresh.PAYMENTEXPIREDAT || 0) || (recordedPaymentDeadline > 0 ? Math.min(recordedPaymentDeadline, now) : now),
      AUTOCANCELAT: freshAutoCancelAt,
      CANCELREASON: 'payment_expired',
      UPDATEDAT: now,
    };
    transaction.update(orderRef, cancellationUpdate);
    if (mirrorRef && freshMirror?.exists) transaction.update(mirrorRef, cancellationUpdate);
    return true;
  });

  // 3.5. Registrar auditoría de expiración en stock_movements
  if (expiredMovements.length > 0) {
    try {
      const movementsCol = adminDb.collection('stock_movements');
      const nowMs = Date.now();
      const fechaStr = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const horaChile = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date(nowMs));

      const orderNum = order?.ORDERINDEX ? `#${order.ORDERINDEX}` : (orderId.startsWith('wa_') ? orderId.slice(0, 18) : orderId);
      const clientName = order?.CUSTOMERNAME ? ` · Cliente: ${order.CUSTOMERNAME}` : '';

      for (const m of expiredMovements) {
        await movementsCol.add({
          productId: m.productId,
          sku: m.sku,
          nombre: m.nombre,
          tipo: 'expiracion_web',
          stockAnterior: m.stockAnterior,
          cantidad: m.qty,
          stockNuevo: m.stockNuevo,
          pendienteDescontado: 0,
          fecha: fechaStr,
          fechaTs: nowMs,
          fechaHora: horaChile,
          usuario: 'Cron Expiración',
          nota: `Restitución por expiración de pago Pedido Web ${orderNum}${clientName}`,
        });
      }
    } catch (movErr) {
      console.warn(`[order-stock-service] Error registrando expiracion stock_movements para orden ${orderId}:`, movErr);
    }
  }

  if (expired) {
    if (expiredMovements.length > 0) {
      try {
        patchStockCacheByField(
          expiredMovements.map((m) => ({ id: m.productId, sku: m.sku, qty: m.qty, stockField: m.stockField })),
          restoreCatalogMemoryCacheStock,
        );
      } catch {}
    }
    try { revalidateTag('orders'); } catch {}
    if (collectionId === ORDERS_COLLECTION_ID && !isVendorOrder(order)) {
      try { revalidateTag('pos-web-reservations') } catch {}
    }
  }
  return expired;
}
