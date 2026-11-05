import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID, ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/db';
import { FieldValue } from 'firebase-admin/firestore';
import { isMainStoreProduct, patchCatalogMemoryCacheStock } from '@/lib/catalog-cache';
import { isProductPublishedOnWeb } from '@/lib/product-publication';
import {
  getInventoryConnectionMode,
  getInventoryStock,
  getInventoryStockField,
  inventoryStockUpdate,
} from '@/lib/inventory-mode';

export const dynamic = 'force-dynamic';

// ⚠️ Por qué existe este endpoint:
// La colección `products` NO es legible ni escribible desde el navegador en este
// proyecto (permisos sin rol anónimo; por eso el resto de la app lee productos
// vía el proxy con API key). El checkout, sin embargo, usaba el cliente crudo de
// appwrite-admin para leer stock y descontarlo directamente desde el navegador:
//   - La lectura devolvía HTTP 200 con body `{}` (filtrado por permisos), así que
//     `res.documents` era undefined y el `for...of` reventaba con
//     "(intermediate value).documents is not iterable".
//   - El descuento (updateDocument) era un no-op silencioso → el stock nunca
//     bajaba (oversell).
// Aquí la validación y el descuento se hacen server-side con Firebase Admin SDK y con
// datos FRESCOS (sin unstable_cache: el stock jamás debe validarse contra caché).

const UNLIMITED_SENTINEL = 99999;
const MAX_ITEMS = 200;

interface StockItem { id: string; qty: number; name?: string; sku?: string; isPack?: boolean; }

// Productos virtuales (bundles/mega pack) que no existen en la BD: no se validan.
function isVirtual(it: StockItem): boolean {
  return it?.sku === 'PROMO1' || (typeof it?.id === 'string' && it.id.startsWith('bundle-'));
}

function sanitize(rawItems: any[]): StockItem[] {
  return (rawItems || [])
    .slice(0, MAX_ITEMS)
    .map((it) => ({
      id: String(it?.id || ''),
      qty: Math.max(0, Math.floor(Number(it?.qty) || 0)),
      name: typeof it?.name === 'string' ? it.name.slice(0, 200) : undefined,
      sku: typeof it?.sku === 'string' ? it.sku : undefined,
      isPack: Boolean(it?.isPack),
    }))
    .filter((it) => it.id && it.qty > 0 && !isVirtual(it));
}

async function fetchFreshProduct(id: string, sku?: string): Promise<any> {
  const db = getAdminDb();

  if (id) {
    const snapshot = await db.collection(PRODUCTS_COLLECTION_ID).doc(id).get();
    if (snapshot.exists) return { $id: snapshot.id, ...snapshot.data() };
  }

  const cleanSku = String(sku || '').trim();
  if (cleanSku) {
    const matches = await db.collection(PRODUCTS_COLLECTION_ID).where('SKU', '==', cleanSku).limit(1).get();
    const snapshot = matches.docs[0];
    if (snapshot?.exists) return { $id: snapshot.id, ...snapshot.data() };
  }

  return null;
}

async function loadFreshDocs(items: StockItem[]): Promise<Record<string, any>> {
  const map: Record<string, any> = {};

  const fetchedDocs = await Promise.all(
    items.map(it => fetchFreshProduct(it.id, it.sku))
  );

  items.forEach((it, idx) => {
    const docData = fetchedDocs[idx];
    if (docData) {
      map[it.id] = docData;
      const skuKey = String(it.sku || docData.SKU || docData.sku || '').trim().toLowerCase();
      if (skuKey) map[`sku:${skuKey}`] = docData;
    }
  });

  return map;
}

function getFreshDoc(docs: Record<string, any>, item: StockItem) {
  return docs[item.id] || docs[`sku:${String(item.sku || '').trim().toLowerCase()}`];
}

function parseOrderItems(raw: unknown): StockItem[] {
  let value: any = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = []; }
  }
  if (!Array.isArray(value)) return [];
  const normalized = new Map<string, StockItem>();
  for (const item of value.slice(0, MAX_ITEMS)) {
    const parsed = sanitize([item])[0];
    if (!parsed) continue;
    const existing = normalized.get(parsed.id);
    if (existing) existing.qty += parsed.qty;
    else normalized.set(parsed.id, parsed);
  }
  return [...normalized.values()].filter(item => item.qty > 0);
}

function isVirtualOnlyOrder(raw: unknown): boolean {
  let value: any = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return false; }
  }
  return Array.isArray(value) && value.length > 0 && value.every((item: any) => {
    const id = String(item?.id || item?.pid || item?.productId || item?.$id || '');
    const qty = Math.floor(Number(item?.qty ?? item?.quantity ?? item?.CANTIDAD) || 0);
    return id && qty > 0 && isVirtual({ id, qty, sku: String(item?.sku || item?.SKU || '') });
  });
}

/**
 * Reserve the products stored on each freshly-created order, as one atomic
 * operation. This keeps mixed carts from tying every product to the first
 * vendor sub-order and makes retries idempotent.
 */
async function reserveOrderStock(orderIds: unknown, owner: { userId?: string; email?: string }, trustedStoredOwner = false): Promise<{ ok: boolean; error?: string; alreadyReserved?: boolean }> {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(String).filter(Boolean))];
  if (!ids.length || ids.length > 100) return { ok: false, error: 'Pedidos inválidos para reservar stock.' };
  const userId = String(owner.userId || '').trim();
  const email = String(owner.email || '').trim().toLowerCase();
  if (!trustedStoredOwner && (!userId || userId === 'guest') && !email) return { ok: false, error: 'Faltan los datos del comprador para confirmar el pedido.' };

  const adminDb = getAdminDb();
  const orderTargets: Array<{ id: string; ref: FirebaseFirestore.DocumentReference; data: any; collectionId: string }> = [];
  for (const id of ids) {
    let target: { ref: FirebaseFirestore.DocumentReference; data: any; collectionId: string } | null = null;
    for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
      const ref = adminDb.collection(collectionId).doc(id);
      const snapshot = await ref.get();
      if (snapshot.exists) {
        target = { ref, data: snapshot.data() || {}, collectionId };
        break;
      }
    }
    if (!target) return { ok: false, error: 'No se encontró uno de los pedidos recién creados.' };
    orderTargets.push({ id, ...target });
  }

  const orderItems = orderTargets.map(target => ({
    ...target,
    items: parseOrderItems(target.data.ITEMS),
    virtualOnly: isVirtualOnlyOrder(target.data.ITEMS),
  }));
  if (orderItems.some(order => !order.items.length && !(order.collectionId === ORDERS_COLLECTION_ID && order.virtualOnly))) {
    return { ok: false, error: 'Un pedido no contiene productos válidos.' };
  }

  const productCol = adminDb.collection(PRODUCTS_COLLECTION_ID);
  const inventoryMode = await getInventoryConnectionMode();
  const productIds = [...new Set(orderItems.flatMap(order => order.items.map(item => item.id)))];
  if (ids.length + productIds.length > 450) return { ok: false, error: 'El pedido es demasiado grande para reservar el stock de una vez.' };
  const productRefs = productIds.map(id => productCol.doc(id));
  const vendorIds = [...new Set(orderItems.map(order => (order.collectionId === VENDOR_ORDERS_COLLECTION_ID || order.data?.IS_VENDOR_ORDER || order.data?.VENDOR_ID) ? String(order.data?.VENDOR_ID || '') : '').filter(Boolean))];
  if (orderItems.some(order => order.collectionId === VENDOR_ORDERS_COLLECTION_ID && !order.data.VENDOR_ID)) {
    return { ok: false, error: 'El pedido de tienda aliada no tiene vendedor asociado.' };
  }
  const vendorRefs = vendorIds.map(id => adminDb.collection(VENDORS_COLLECTION_ID).doc(id));

  try {
    const movements = await adminDb.runTransaction(async transaction => {
      const freshOrders = await Promise.all(orderItems.map(order => transaction.get(order.ref)));
      const freshProducts = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      const freshVendors = await Promise.all(vendorRefs.map(ref => transaction.get(ref)));
      const productById = new Map(freshProducts.map(snapshot => [snapshot.id, snapshot]));
      const vendorById = new Map(vendorIds.map((id, i) => [id, freshVendors[i]]));

      const orderIndexById = new Map(orderItems.map((order, i) => [order.id, i]));
      const pendingOrders = orderItems.filter((order, i) => {
        const snapshot = freshOrders[i];
        if (!snapshot.exists) throw new Error('Uno de los pedidos ya no existe.');
        const fresh = snapshot.data() || {};
        const matchesUser = userId && userId !== 'guest' && String(fresh.USERID || '') === userId;
        const matchesEmail = email && String(fresh.CUSTOMEREMAIL || '').trim().toLowerCase() === email;
        if (!trustedStoredOwner && !matchesUser && !matchesEmail) throw new Error('El pedido no pertenece a este comprador.');
        if (fresh.STOCKDEDUCTED !== true && Date.now() - Number(fresh.CREATEDAT || 0) > 30 * 60 * 1000) {
          throw new Error('La reserva del pedido venció. Vuelve a iniciar el checkout.');
        }
        return snapshot.data()?.STOCKDEDUCTED !== true;
      });
      if (pendingOrders.length === 0) return [];

      const requestedByProduct = new Map<string, { qty: number; vendorId: string; orderIds: string[]; items: Array<{ order: typeof pendingOrders[number]; item: StockItem }> }>();
      for (const order of pendingOrders) {
        const freshOrder = freshOrders[orderIndexById.get(order.id)!].data() || {};
        if (!['paid', 'pending', 'pending_stock'].includes(String(freshOrder.STATUS || '').toLowerCase())) {
          throw new Error('Uno de los pedidos ya no está pendiente de reserva.');
        }
        const currentItems = parseOrderItems(freshOrder.ITEMS);
        const expectedFingerprint = order.items.map(item => `${item.id}:${item.qty}`).sort().join('|');
        const currentFingerprint = currentItems.map(item => `${item.id}:${item.qty}`).sort().join('|');
        if (expectedFingerprint !== currentFingerprint) throw new Error('Los productos del pedido cambiaron antes de reservar el stock.');

        const vendorId = (order.collectionId === VENDOR_ORDERS_COLLECTION_ID || freshOrder.IS_VENDOR_ORDER || freshOrder.VENDOR_ID) ? String(freshOrder.VENDOR_ID || '') : '';
        if (vendorId) {
          const vendor = vendorById.get(vendorId);
          if (!vendor?.exists || vendor.data()?.ACTIVE !== true) throw new Error('La tienda aliada ya no está activa.');
        }
        for (const item of order.items) {
          const key = item.id;
          const accumulated = requestedByProduct.get(key) || { qty: 0, vendorId, orderIds: [], items: [] };
          if (accumulated.vendorId !== vendorId) throw new Error('Un mismo producto aparece asociado a tiendas distintas.');
          accumulated.qty += item.qty;
          accumulated.orderIds.push(order.id);
          accumulated.items.push({ order, item });
          requestedByProduct.set(key, accumulated);
        }
      }

      const movementRows: any[] = [];
      for (const [productId, request] of requestedByProduct) {
        const productSnap = productById.get(productId);
        if (!productSnap?.exists) throw new Error('Uno de los productos del pedido ya no existe.');
        const product = productSnap.data() || {};
        if (!isProductPublishedOnWeb(product)) throw new Error(`"${product.NAME || product.name || productId}" existe, pero ya no está publicado en la web.`);
        const ownerId = String(product.VENDOR_ID || product.vendorId || product.SELLERID || product.sellerId || '');
        if (request.vendorId ? ownerId !== request.vendorId : !isMainStoreProduct(product)) {
          throw new Error(`"${product.NAME || product.name || productId}" ya no pertenece a esta tienda.`);
        }
        const mainStoreProduct = isMainStoreProduct(product);
        const rawStock = getInventoryStock(product, inventoryMode, mainStoreProduct);
        const currentStock = Number.isFinite(rawStock) ? rawStock : 0;
        const canSellWithoutRecordedStock = inventoryMode === 'erp_integrated' && !request.vendorId && currentStock <= 0;
        if ((!Number.isFinite(rawStock) && Boolean(request.vendorId)) || (currentStock !== UNLIMITED_SENTINEL && currentStock < request.qty && !canSellWithoutRecordedStock)) {
          throw new Error(`Stock insuficiente para "${product.NAME || product.name || productId}". Disponible: ${currentStock || 0}, necesitas: ${request.qty}.`);
        }
      }

      for (const order of pendingOrders) {
        const orderInventoryMode = order.collectionId === VENDOR_ORDERS_COLLECTION_ID || order.data?.IS_VENDOR_ORDER || order.data?.VENDOR_ID
          ? 'erp_integrated'
          : inventoryMode;
        transaction.update(order.ref, { STOCKDEDUCTED: true, INVENTORYMODE: orderInventoryMode, UPDATEDAT: Date.now() });
        const otherCol = order.collectionId === ORDERS_COLLECTION_ID ? VENDOR_ORDERS_COLLECTION_ID : ORDERS_COLLECTION_ID;
        transaction.set(adminDb.collection(otherCol).doc(order.id), { STOCKDEDUCTED: true, INVENTORYMODE: orderInventoryMode, UPDATEDAT: Date.now() }, { merge: true });
      }
      for (const [productId, request] of requestedByProduct) {
        const productSnap = productById.get(productId)!;
        const product = productSnap.data() || {};
        const mainStoreProduct = isMainStoreProduct(product);
        const rawStock = getInventoryStock(product, inventoryMode, mainStoreProduct);
        const currentStock = Number.isFinite(rawStock) ? rawStock : 0;
        if (currentStock === UNLIMITED_SENTINEL) continue;
        const newStock = currentStock - request.qty;
        transaction.update(productSnap.ref, {
          ...inventoryStockUpdate(newStock, inventoryMode, mainStoreProduct),
          soldQuantity: FieldValue.increment(request.qty),
          updatedAt: Date.now(),
        });
        movementRows.push({
          productId,
          sku: product.SKU || product.sku || productId,
          name: product.NAME || product.name || 'Producto',
          before: currentStock,
          after: newStock,
          qty: request.qty,
          orderIds: request.orderIds,
          stockField: getInventoryStockField(inventoryMode, mainStoreProduct),
        });
      }
      return movementRows;
    });

    for (const movement of movements) {
      try {
        const now = Date.now();
        const fecha = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
        await adminDb.collection('stock_movements').add({
          productId: movement.productId,
          sku: movement.sku,
          nombre: movement.name,
          tipo: 'venta_web',
          stockAnterior: movement.before,
          cantidad: -movement.qty,
          stockNuevo: movement.after,
          pendienteDescontado: 0,
          fecha,
          fechaTs: now,
          fechaHora: new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(now)),
          usuario: 'Tienda Web',
          nota: `Reserva de pedido(s) ${movement.orderIds.join(', ')}`,
        });
      } catch (error) {
        console.warn('[checkout/stock] Error registrando movimiento de reserva:', error);
      }
    }
    if (movements.length > 0) {
      try {
        for (const stockField of ['STOCK', 'WEB_STOCK'] as const) {
          const matching = movements.filter(m => m.stockField === stockField);
          if (matching.length) {
            patchCatalogMemoryCacheStock(
              matching.map((m) => ({ id: m.productId, sku: m.sku, cantidad: m.qty })),
              stockField,
            );
          }
        }
      } catch {}
    }
    try { revalidateTag('orders'); } catch {}
    try { revalidateTag('pos-web-reservations'); } catch {}
    return { ok: true };
  } catch (error: any) {
    console.error('[checkout/stock reserve_orders]', error);
    return { ok: false, error: error?.message || 'No se pudo reservar el stock del pedido.' };
  }
}

async function cleanupUnreservedOrders(orderIds: unknown, owner: { userId?: string; email?: string }) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(String).filter(Boolean))];
  if (!ids.length || ids.length > 100) return { ok: false, error: 'Pedidos inválidos.' };
  const userId = String(owner.userId || '').trim();
  const email = String(owner.email || '').trim().toLowerCase();
  if ((!userId || userId === 'guest') && !email) return { ok: false, error: 'Faltan los datos del comprador.' };

  const db = getAdminDb();
  const refs: FirebaseFirestore.DocumentReference[] = [];
  for (const id of ids) {
    let found: FirebaseFirestore.DocumentReference | null = null;
    for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
      const ref = db.collection(collectionId).doc(id);
      const snapshot = await ref.get();
      if (snapshot.exists) { found = ref; break; }
    }
    if (found) refs.push(found);
  }
  if (!refs.length) return { ok: true };

  await db.runTransaction(async transaction => {
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const order = snapshot.data() || {};
      const matchesUser = userId && userId !== 'guest' && String(order.USERID || '') === userId;
      const matchesEmail = email && String(order.CUSTOMEREMAIL || '').trim().toLowerCase() === email;
      if (!matchesUser && !matchesEmail) throw new Error('No se pudo verificar la propiedad de uno de los pedidos.');
      if (Date.now() - Number(order.CREATEDAT || 0) > 30 * 60 * 1000) continue;
      if (order.STOCKDEDUCTED === true) throw new Error('La reserva sí se completó; el pedido se mantiene activo.');
      if (!['paid', 'pending', 'pending_stock'].includes(String(order.STATUS || '').toLowerCase())) continue;
      transaction.update(snapshot.ref, {
        STATUS: 'cancelled',
        CANCELREASON: 'checkout_reservation_failed',
        UPDATEDAT: Date.now(),
      });
    }
  });
  try { revalidateTag('orders'); } catch {}
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode: string = body?.mode;
    if (mode === 'reserve_orders') {
      const result = await reserveOrderStock(body?.orderIds, { userId: body?.userId, email: body?.email });
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    if (mode === 'cleanup_unreserved') {
      const result = await cleanupUnreservedOrders(body?.orderIds, { userId: body?.userId, email: body?.email });
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    if (mode === 'decrement') {
      const orderId = String(body?.orderId || '');
      if (!orderId) return NextResponse.json({ ok: false, error: 'orderId requerido' }, { status: 400 });
      const db = getAdminDb();
      let orderData: any = null;
      for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
        const orderSnap = await db.collection(collectionId).doc(orderId).get();
        if (orderSnap.exists) { orderData = orderSnap.data() || {}; break; }
      }
      if (!orderData) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 });
      const result = await reserveOrderStock([orderId], { userId: orderData.USERID, email: orderData.CUSTOMEREMAIL }, true);
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    const items = sanitize(body?.items);
    const docs = items.length ? await loadFreshDocs(items) : {};
    const inventoryMode = await getInventoryConnectionMode();

    // ── VERIFY_CART: chequeo interactivo detallado por producto ──
    if (mode === 'verify_cart') {
      const results: {
        id: string;
        sku?: string;
        isPack?: boolean;
        name: string;
        requestedQty: number;
        availableStock: number;
        adjustedQty: number;
        status: 'available' | 'out_of_stock' | 'adjusted' | 'blocked';
        reason: string;
        image?: string;
      }[] = [];

      let hasChanges = false;
      let outOfStockCount = 0;
      let adjustedCount = 0;
      let blockedCount = 0;

      for (const it of items) {
        const doc = getFreshDoc(docs, it);
        const name = String(doc?.NAME || it.name || it.sku || it.id);
        const image = String(doc?.IMAGEURL || (Array.isArray(doc?.IMAGES) ? doc.IMAGES[0] : '') || '');
        const sku = String(doc?.SKU || it.sku || '');

        if (!doc) {
          results.push({
            id: it.id,
            sku,
            isPack: it.isPack,
            name,
            requestedQty: it.qty,
            availableStock: 0,
            adjustedQty: 0,
            status: 'out_of_stock',
            reason: 'El producto ya no existe en el catálogo',
            image,
          });
          hasChanges = true;
          outOfStockCount++;
          continue;
        }

        if (!isProductPublishedOnWeb(doc)) {
          results.push({
            id: String(doc.$id || it.id),
            sku,
            isPack: it.isPack,
            name,
            requestedQty: it.qty,
            availableStock: getInventoryStock(doc, inventoryMode, isMainStoreProduct(doc)),
            adjustedQty: it.qty,
            status: 'blocked',
            reason: 'El producto existe, pero está en borrador o no terminó su publicación web; se conserva en el carrito.',
            image,
          });
          hasChanges = true;
          blockedCount++;
          continue;
        }

        const rawStock = getInventoryStock(doc, inventoryMode, isMainStoreProduct(doc));
        const stock = Number.isFinite(rawStock) ? rawStock : 0;
        if (stock === UNLIMITED_SENTINEL) {
          results.push({
            id: String(doc.$id || it.id),
            sku,
            isPack: it.isPack,
            name,
            requestedQty: it.qty,
            availableStock: UNLIMITED_SENTINEL,
            adjustedQty: it.qty,
            status: 'available',
            reason: 'Disponible',
            image,
          });
          continue;
        }

        if (stock <= 0) {
          if (isMainStoreProduct(doc) && inventoryMode === 'erp_integrated') {
            results.push({
              id: String(doc.$id || it.id),
              sku,
              isPack: it.isPack,
              name,
              requestedQty: it.qty,
              availableStock: stock,
              adjustedQty: it.qty,
              status: 'available',
              reason: 'Se conserva por prioridad de venta POS aunque el stock registrado sea cero',
              image,
            });
            continue;
          }

          results.push({
            id: String(doc.$id || it.id),
            sku,
            isPack: it.isPack,
            name,
            requestedQty: it.qty,
            availableStock: 0,
            adjustedQty: 0,
            status: 'blocked',
            reason: 'La tienda aliada no tiene stock; el producto se conserva en tu carrito',
            image,
          });
          hasChanges = true;
          blockedCount++;
          continue;
        }

        if (stock < it.qty) {
          results.push({
            id: String(doc.$id || it.id),
            sku,
            isPack: it.isPack,
            name,
            requestedQty: it.qty,
            availableStock: stock,
            adjustedQty: stock,
            status: 'adjusted',
            reason: `Solo quedan ${stock} unidad(es) disponibles`,
            image,
          });
          hasChanges = true;
          adjustedCount++;
          continue;
        }

        results.push({
          id: String(doc.$id || it.id),
          sku,
          isPack: it.isPack,
          name,
          requestedQty: it.qty,
          availableStock: stock,
          adjustedQty: it.qty,
          status: 'available',
          reason: 'Disponible',
          image,
        });
      }

      return NextResponse.json({
        ok: true,
        hasChanges,
        allAvailable: !hasChanges,
        results,
        summary: {
          totalChecked: items.length,
          availableCount: items.length - outOfStockCount - adjustedCount - blockedCount,
          outOfStockCount,
          adjustedCount,
          blockedCount,
        },
      });
    }

    // ── VALIDATE: solo lectura, no toca stock ──
    if (mode === 'validate') {
      const removed: { id: string; sku?: string; isPack?: boolean; name: string; reason: string }[] = []
      const adjusted: { id: string; sku?: string; isPack?: boolean; name: string; requestedQty: number; adjustedQty: number; availableStock: number }[] = []
      const blocked: { id: string; sku?: string; isPack?: boolean; name: string; reason: string }[] = []
      for (const it of items) {
        const doc = getFreshDoc(docs, it);
        if (!doc) {
          removed.push({ id: it.id, sku: it.sku, isPack: it.isPack, name: it.name || it.id, reason: 'el producto ya no existe' })
          continue
        }
        if (!isProductPublishedOnWeb(doc)) {
          blocked.push({
            id: String(doc.$id || it.id),
            sku: String(doc.SKU || it.sku || ''),
            isPack: it.isPack,
            name: String(doc.NAME || it.name || it.id),
            reason: 'el producto existe, pero aún no está publicado en la web; se conserva en el carrito',
          });
          continue;
        }
        const rawStock = getInventoryStock(doc, inventoryMode, isMainStoreProduct(doc));
        const stock = Number.isFinite(rawStock) ? rawStock : 0;
        if (stock === UNLIMITED_SENTINEL) continue; // ilimitado, no se valida
        const mainStoreProduct = isMainStoreProduct(doc);
        if (stock <= 0 && mainStoreProduct && inventoryMode === 'erp_integrated') continue; // El POS tiene prioridad en modo integrado.
        if (stock <= 0) {
          blocked.push({ id: String(doc.$id || it.id), sku: String(doc.SKU || it.sku || ''), isPack: it.isPack, name: String(doc.NAME || it.name || it.id), reason: 'la tienda aliada no tiene stock; el producto se conserva en el carrito' })
          continue
        }
        if (stock < it.qty) {
          adjusted.push({
            id: String(doc.$id || it.id),
            sku: String(doc.SKU || it.sku || ''),
            isPack: it.isPack,
            name: String(doc.NAME || it.name || it.id),
            requestedQty: it.qty,
            adjustedQty: stock,
            availableStock: stock,
          })
        }
      }
      if (removed.length > 0 || adjusted.length > 0 || blocked.length > 0) {
        return NextResponse.json({
          ok: false,
          error: 'Actualizamos el carrito según los productos que siguen disponibles.',
          removed,
          adjusted,
          blocked,
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'mode inválido' }, { status: 400 });
  } catch (error: any) {
    console.error('[API checkout/stock] Error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Error interno' }, { status: 500 });
  }
}
