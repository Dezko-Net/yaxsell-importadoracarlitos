import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID, VENDORS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, ORDERS_COLLECTION_ID, TIMED_OFFERS_COLLECTION } from '@/lib/db';
import { hasVolumePricing, resolveVolumeUnitPrice } from '@/lib/volume-pricing';
import { ORDER_AUTO_CANCEL_WINDOW_MS } from '@/lib/order-expiration';
import { restoreStockForOrder } from '@/lib/order-stock-service';
import { isMainStoreProduct } from '@/lib/catalog-cache';
import { isDisableDiscounts } from '@/lib/apertura-promo';
import { reserveOrderCode } from '@/lib/order-identity';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

type InputItem = { id?: string; qty?: number; price?: number; isPack?: boolean; note?: string };
type VendorGroup = { vendorId: string; items: InputItem[] };

function buildVendorPrefix(vendor: Record<string, any>, vendorId: string): string {
  const name = String(vendor.ORDER_PREFIX || vendor.NAME || 'TIENDA')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (vendor.ORDER_PREFIX) return name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'VND';
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
  const idSuffix = vendorId.replace(/[^a-zA-Z0-9]/g, '').slice(-2);
  return (initials + idSuffix).toUpperCase().slice(0, 6) || 'VND';
}

function normalizeGroups(body: any): VendorGroup[] {
  if (Array.isArray(body?.orders)) {
    return body.orders.map((group: any) => ({ vendorId: String(group?.vendorId || ''), items: Array.isArray(group?.items) ? group.items : [] }));
  }
  if (body?.vendorId && Array.isArray(body?.items)) {
    return [{ vendorId: String(body.vendorId), items: body.items }];
  }
  return [];
}

function resolveVendorPrice(product: Record<string, any>, qty: number, isPack = false): number {
  const webPrice = Number(product.WEBPRICE ?? product.web_price ?? 0);
  if (webPrice > 0) return webPrice;

  const price = Number(product.PRICE ?? product.price ?? 0);
  const currentPrice = Number(product.CURRENTPRICE ?? product.currentPrice ?? 0);
  const wholesalePrice = Number(product.WHOLESALEPRICE ?? product.wholesalePrice ?? 0);
  const minQty = Number(product.WHOLESALEMINQUANTITY ?? product.wholesaleMinQuantity ?? 0);
  const packQty = Number(product.PACKQTY ?? product.packQty ?? 0);
  const boxPrice = Number(product.BOXPRICE ?? product.boxPrice ?? 0);
  const hasVolume = hasVolumePricing({
    PRICE: price,
    WHOLESALEPRICE: wholesalePrice || undefined,
    BOXPRICE: boxPrice || undefined,
    PACKQTY: packQty || undefined,
    BOXQTY: Number(product.BOXQTY ?? product.boxQty ?? 0) || undefined,
    WHOLESALEMINQUANTITY: minQty || undefined,
    WEBPRICE: webPrice || undefined,
  } as any);
  if (hasVolume) {
    return resolveVolumeUnitPrice({
      PRICE: price,
      WHOLESALEPRICE: wholesalePrice || undefined,
      BOXPRICE: boxPrice || undefined,
      PACKQTY: packQty || undefined,
      BOXQTY: Number(product.BOXQTY ?? product.boxQty ?? 0) || undefined,
      WHOLESALEMINQUANTITY: minQty || undefined,
    }, qty);
  }

  const packDiscountPct = Number(product.PACK_DISCOUNT_PCT ?? product.packDiscountPct ?? 0);
  const packMinQty = Number(product.PACK_MIN_PACKS ?? product.packMinPacks ?? 0);
  if (packDiscountPct > 0 && packMinQty > 0 && qty >= packMinQty && !isDisableDiscounts(product as any)) {
    const saleExpired = Number(product.UNIT_OFFER_EXPIRES_AT || 0) > 0 && Number(product.UNIT_OFFER_EXPIRES_AT) < Date.now();
    const basePrice = currentPrice > 0 && currentPrice < price && !saleExpired && minQty <= 1
      ? currentPrice
      : price || wholesalePrice;
    const discountedPrice = Math.round(basePrice * (1 - packDiscountPct / 100));
    if (discountedPrice > 0 && discountedPrice < basePrice) return discountedPrice;
  }

  if (isPack && wholesalePrice > 0) return wholesalePrice;
  const features = Array.isArray(product.FEATURES) ? product.FEATURES.join('\n') : String(product.FEATURES || '');
  const exactWholesale = /ExactWholesale:\s*true/i.test(features);
  if (wholesalePrice > 0 && minQty > 0 && (exactWholesale ? qty === minQty : qty >= minQty)) return wholesalePrice;
  const saleExpired = Number(product.UNIT_OFFER_EXPIRES_AT || 0) > 0 && Number(product.UNIT_OFFER_EXPIRES_AT) < Date.now();
  if (currentPrice > 0 && currentPrice < price && !saleExpired && minQty <= 1) return currentPrice;
  if (wholesalePrice > 0 && minQty <= 1) return wholesalePrice;
  return price || currentPrice || wholesalePrice;
}

function toMillis(value: any): number {
  if (value?.toDate) return value.toDate().getTime();
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function isActiveTimedOfferPrice(productId: string, price: number): Promise<boolean> {
  try {
    const offers = await getAdminDb().collection(TIMED_OFFERS_COLLECTION)
      .where('targetId', '==', productId)
      .limit(20)
      .get();
    const now = Date.now();
    return offers.docs.some(snapshot => {
      const offer = snapshot.data() || {};
      if (offer.isActive !== true || offer.status !== 'active' || Math.round(Number(offer.discountPrice) || 0) !== price) return false;
      if (offer.timeType === 'endDateTime' && offer.endDateTime) return toMillis(offer.endDateTime) > now;
      if (offer.timeType === 'duration' && Number(offer.durationHours) > 0) {
        const start = toMillis(offer.activatedAt) || toMillis(offer.$createdAt);
        return start > 0 && start + Number(offer.durationHours) * 60 * 60 * 1000 > now;
      }
      return true;
    });
  } catch (error) {
    console.warn('[checkout/vendor-order] No se pudo validar una oferta temporal:', error);
    return false;
  }
}

async function loadVendorItems(vendorId: string, items: InputItem[]) {
  const db = getAdminDb();
  if (!vendorId || !items.length || items.length > 200) throw new Error('Faltan productos válidos para el pedido de tienda aliada.');

  const lines: any[] = [];
  for (const input of items) {
    const productId = String(input?.id || '').trim();
    const qty = Math.floor(Number(input?.qty || 0));
    if (!productId || !Number.isSafeInteger(qty) || qty < 1 || qty > 100000) throw new Error('Hay un producto con cantidad inválida.');

    const snapshot = await db.collection(PRODUCTS_COLLECTION_ID).doc(productId).get();
    if (!snapshot.exists) throw new Error('Uno de los productos ya no está disponible. Actualiza la página y vuelve a intentarlo.');
    const product = snapshot.data() || {};
    const ownerId = String(product.VENDOR_ID || product.vendorId || product.SELLERID || product.sellerId || '');
    if (ownerId !== vendorId || isMainStoreProduct(product)) throw new Error('Un producto del carrito ya no pertenece a esta tienda aliada.');
    if ((product.ISACTIVE ?? product.isActive) === false) throw new Error(`"${product.NAME || product.name || 'Producto'}" ya no está disponible.`);
    if ((product.SHOW_IN_WEB ?? product.show_in_web) !== true) throw new Error(`"${product.NAME || product.name || 'Producto'}" ya no está publicado.`);

    const stock = Number(product.STOCK ?? product.stock ?? 0);
    if (!Number.isFinite(stock) || (stock !== 99999 && stock < qty)) {
      throw new Error(`Stock insuficiente para "${product.NAME || product.name || 'Producto'}". Disponible: ${stock || 0}.`);
    }

    let price = Math.round(resolveVendorPrice(product, qty, !!input.isPack));
    const requestedPrice = Math.round(Number(input.price) || 0);
    // Las ofertas temporales viven en su propia colección, no en el documento
    // del producto. Solo aceptamos el precio enviado por el carrito si coincide
    // con una oferta vigente del producto.
    if (requestedPrice > 0 && requestedPrice !== price && await isActiveTimedOfferPrice(productId, requestedPrice)) {
      price = requestedPrice;
    }
    if (!Number.isFinite(price) || price <= 0) throw new Error(`El precio de "${product.NAME || product.name || 'Producto'}" no es válido.`);

    lines.push({
      id: snapshot.id,
      name: String(product.NAME || product.name || 'Producto'),
      sku: String(product.SKU || product.sku || ''),
      barcode: String(product.BARCODE || product.barcode || ''),
      price,
      qty,
      total: price * qty,
      img: String(product.IMAGEURL || product.imageUrl || product.imageURL || ''),
      ...(typeof input.note === 'string' && input.note.trim() ? { note: input.note.trim().slice(0, 500) } : {}),
    });
  }
  return lines;
}

async function reserveVendorOrderStock(db: FirebaseFirestore.Firestore, orderId: string, vendorId: string) {
  const orderRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(orderId);
  const vendorRef = db.collection(VENDORS_COLLECTION_ID).doc(vendorId);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) throw new Error('No se encontró el pedido para reservar su stock.');

  let storedItems: any[] = [];
  try {
    const raw = orderSnapshot.get('ITEMS');
    storedItems = Array.isArray(raw) ? raw : JSON.parse(String(raw || '[]'));
  } catch {}
  const quantities = new Map<string, number>();
  for (const item of storedItems) {
    const id = String(item?.id || '').trim();
    const qty = Math.floor(Number(item?.qty || 0));
    if (!id || !Number.isSafeInteger(qty) || qty < 1) throw new Error('El pedido tiene productos inválidos.');
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }
  if (!quantities.size) throw new Error('El pedido no contiene productos válidos.');

  const productRefs = [...quantities.keys()].map(id => db.collection(PRODUCTS_COLLECTION_ID).doc(id));
  const movements = await db.runTransaction(async transaction => {
    const [freshOrder, vendorSnapshot, ...productSnapshots] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(vendorRef),
      ...productRefs.map(ref => transaction.get(ref)),
    ]);
    if (!freshOrder.exists) throw new Error('No se encontró el pedido para reservar su stock.');
    const order = freshOrder.data() || {};
    if (order.VENDOR_ID !== vendorId || order.IS_VENDOR_ORDER !== true) throw new Error('El pedido no corresponde a esta tienda aliada.');
    if (order.STOCKDEDUCTED === true) return [];
    if (!['paid', 'pending_stock'].includes(String(order.STATUS || ''))) throw new Error('El pedido ya no está pendiente de reserva.');
    if (!vendorSnapshot.exists || vendorSnapshot.data()?.ACTIVE !== true) throw new Error('La tienda aliada ya no está activa.');

    const rows: Array<{ id: string; name: string; sku: string; qty: number; before: number; after: number }> = [];
    for (let index = 0; index < productSnapshots.length; index++) {
      const snapshot = productSnapshots[index];
      if (!snapshot.exists) throw new Error('Uno de los productos ya no está disponible.');
      const product = snapshot.data() || {};
      const ownerId = String(product.VENDOR_ID || product.vendorId || product.SELLERID || product.sellerId || '');
      if (ownerId !== vendorId || (product.SHOW_IN_WEB ?? product.show_in_web) !== true || (product.ISACTIVE ?? product.isActive) === false) {
        throw new Error(`"${product.NAME || product.name || 'Producto'}" ya no está disponible para esta tienda.`);
      }
      const qty = quantities.get(snapshot.id) || 0;
      const stock = Number(product.STOCK ?? product.stock ?? 0);
      if (!Number.isFinite(stock) || (stock !== 99999 && stock < qty)) {
        throw new Error(`Stock insuficiente para "${product.NAME || product.name || 'Producto'}". Disponible: ${stock || 0}.`);
      }
      if (stock === 99999) continue;
      const after = Math.max(0, stock - qty);
      transaction.update(snapshot.ref, {
        STOCK: after,
        stock: after,
        soldQuantity: FieldValue.increment(qty),
        updatedAt: Date.now(),
      });
      rows.push({ id: snapshot.id, name: String(product.NAME || product.name || 'Producto'), sku: String(product.SKU || product.sku || snapshot.id), qty, before: stock, after });
    }
    transaction.update(orderRef, { STOCKDEDUCTED: true, UPDATEDAT: Date.now() });
    const adminRef = db.collection(ORDERS_COLLECTION_ID).doc(orderId);
    transaction.update(adminRef, { STOCKDEDUCTED: true, UPDATEDAT: Date.now() });
    return rows;
  });

  for (const movement of movements) {
    try {
      const now = Date.now();
      await db.collection('stock_movements').add({
        productId: movement.id,
        sku: movement.sku,
        nombre: movement.name,
        tipo: 'venta_web',
        stockAnterior: movement.before,
        cantidad: -movement.qty,
        stockNuevo: movement.after,
        pendienteDescontado: 0,
        fecha: new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }),
        fechaTs: now,
        fechaHora: new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(now)),
        usuario: 'Tienda Web',
        nota: `Reserva de pedido web de tienda aliada ${orderId}`,
      });
    } catch (error) {
      console.warn('[checkout/vendor-order] Error registrando movimiento de stock WhatsApp:', error);
    }
  }
  try { revalidateTag('products'); } catch {}
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getAdminDb();

    // Compatibilidad con los pedidos de WhatsApp creados desde el carrito.
    const groups = normalizeGroups(body);
    if (!groups.length || groups.length > 20 || groups.reduce((count, group) => count + group.items.length, 0) > 200 || groups.some(group => !group.vendorId || !group.items.length)) {
      return NextResponse.json({ error: 'Faltan datos del pedido' }, { status: 400 });
    }
    if (new Set(groups.map(group => group.vendorId)).size !== groups.length) {
      return NextResponse.json({ error: 'La tienda aparece repetida en el pedido.' }, { status: 400 });
    }

    const created: Array<{ vendorId: string; orderId: string; orderCode: string; total: number }> = [];
    try {
      for (const group of groups) {
        const vendorRef = db.collection(VENDORS_COLLECTION_ID).doc(group.vendorId);
        const vendorSnap = await vendorRef.get();
        const vendor = vendorSnap.data();
        if (!vendorSnap.exists || vendor?.ACTIVE !== true) throw new Error('Una tienda aliada ya no está disponible.');

        const items = await loadVendorItems(group.vendorId, group.items);
        // Evita cobrar o mostrar un total distinto al informado antes del checkout.
        for (let i = 0; i < items.length; i++) {
          const requestedPrice = Number(group.items[i]?.price || 0);
          if (requestedPrice > 0 && requestedPrice !== items[i].price) {
            throw new Error(`El precio de "${items[i].name}" cambió. Actualiza el carrito antes de continuar.`);
          }
        }
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const { orderIndex, orderCode } = await reserveOrderCode(buildVendorPrefix(vendor, group.vendorId), 4);
        if (!vendor.ORDER_PREFIX) await vendorRef.set({ ORDER_PREFIX: buildVendorPrefix(vendor, group.vendorId) }, { merge: true });

        const now = Date.now();
        const isWhatsApp = body.orderSource === 'whatsapp';

        const vendorBank = {
          holder: String(vendor.BANK_ACCOUNT_HOLDER || vendor.NAME || '').trim(),
          rut: String(vendor.BANK_RUT || '').trim(),
          bank: String(vendor.BANK_NAME || '').trim(),
          type: String(vendor.BANK_ACCOUNT_TYPE || 'Cuenta Vista').trim(),
          number: String(vendor.BANK_ACCOUNT_NUMBER || '').trim(),
          email: String(vendor.BANK_EMAIL || vendor.STORE_EMAIL || vendor.EMAIL || '').trim(),
        };

        const vendorBranding = {
          name: String(vendor.NAME || 'Tienda Aliada').trim(),
          color: vendor.BRAND_COLOR || '#f97316',
          secondaryColor: vendor.BRAND_SECONDARY_COLOR || '#fb923c',
          logoUrl: vendor.LOGO_URL || '',
          address: vendor.STORE_ADDRESS || '',
          phone: vendor.STORE_PHONE || '',
          email: vendor.STORE_EMAIL || vendor.EMAIL || '',
          website: vendor.STORE_WEBSITE || '',
          bankAccountHolder: vendorBank.holder,
          bankRut: vendorBank.rut,
          bankName: vendorBank.bank,
          bankAccountType: vendorBank.type,
          bankAccountNumber: vendorBank.number,
          bankEmail: vendorBank.email,
        };

        const adminOrderRef = db.collection(ORDERS_COLLECTION_ID).doc();
        const orderId = adminOrderRef.id;
        const vendorOrderRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(orderId);

        const order = {
          IS_VENDOR_ORDER: true,
          VENDOR_ID: group.vendorId,
          VENDOR_NAME: String(vendor.NAME || 'Tienda Aliada').trim(),
          VENDOR_ORDER_CODE: orderCode,
          ORDERCODE: orderCode,
          ORDERINDEX: orderIndex,
          USERID: body.userId || 'guest',
          ITEMS: JSON.stringify(items),
          CUSTOMERNAME: String(body.customerName || '').trim().slice(0, 160),
          CUSTOMERRUT: String(body.customerRut || '').trim().slice(0, 30),
          CUSTOMERPHONE: String(body.customerPhone || '').trim().slice(0, 50),
          CUSTOMEREMAIL: String(body.customerEmail || '').trim().slice(0, 200).toLowerCase(),
          REGION: String(body.region || '').trim().slice(0, 100),
          COMUNA: String(body.comuna || '').trim().slice(0, 100),
          ADDRESS: String(body.address || '').trim().slice(0, 500),
          ADDITIONALINFO: String(body.additionalInfo || '').trim().slice(0, 1000),
          PAYMENTMETHOD: isWhatsApp ? 'WhatsApp' : 'Transferencia Bancaria',
          ORDER_SOURCE: isWhatsApp ? 'whatsapp' : 'web',
          SHIPPINGAGENCY: String(body.shippingAgency || '').trim().slice(0, 160),
          SUBTOTAL: subtotal,
          TOTAL: subtotal,
          STATUS: 'paid',
          STOCKDEDUCTED: false,
          PARENTORDERID: String(body.parentOrderId || '').slice(0, 160),
          CREATEDAT: now,
          AUTOCANCELAT: now + ORDER_AUTO_CANCEL_WINDOW_MS,
          UPDATEDAT: now,
          // Datos bancarios específicos del vendedor para que el cliente realice la transferencia
          BANK_DETAILS: vendorBank,
          VENDOR_BANK_HOLDER: vendorBank.holder,
          VENDOR_BANK_RUT: vendorBank.rut,
          VENDOR_BANK_NAME: vendorBank.bank,
          VENDOR_BANK_TYPE: vendorBank.type,
          VENDOR_BANK_ACCOUNT: vendorBank.number,
          VENDOR_BANK_EMAIL: vendorBank.email,
          VENDOR_BRANDING: vendorBranding,
        };

        // Guardar directamente en 'orders' para que aparezca en el panel admin central
        await adminOrderRef.create(order);
        // También guardar en 'vendor_orders' con el mismo ID por retrocompatibilidad
        try {
          await vendorOrderRef.set(order);
        } catch (error) {
          await adminOrderRef.delete().catch(() => {});
          throw error;
        }

        created.push({ vendorId: group.vendorId, orderId, orderCode, total: subtotal });
        // En una tienda aliada, todo pedido confirma y reserva su stock al
        // crearse. El plazo es de 24 h para cualquier canal, sin el reloj PWA.
        await reserveVendorOrderStock(db, orderId, group.vendorId);
      }
    } catch (error) {
      // Si un checkout con varios vendors falla a mitad, reponer cada reserva
      // que ya alcanzó a descontarse antes de borrar sus documentos.
      for (const { orderId } of [...created].reverse()) {
        const orderRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(orderId);
        let snapshot: FirebaseFirestore.DocumentSnapshot;
        try {
          snapshot = await orderRef.get();
        } catch (rollbackError) {
          console.error(`[checkout/vendor-order] No se pudo leer el pedido ${orderId} durante el rollback; se conservan sus documentos.`, rollbackError);
          continue;
        }
        if (snapshot.exists && snapshot.get('STOCKDEDUCTED') === true) {
          try {
            const restored = await restoreStockForOrder(orderId);
            if (restored) {
              await Promise.all([
                db.collection(ORDERS_COLLECTION_ID).doc(orderId).delete().catch(() => {}),
                orderRef.delete().catch(() => {}),
              ]);
              continue;
            }
          } catch (rollbackError) {
            console.error(`[checkout/vendor-order] Error revirtiendo la reserva del pedido ${orderId}:`, rollbackError);
          }
          console.error(`[checkout/vendor-order] No se pudo revertir la reserva del pedido ${orderId}; se conservan sus documentos para revisión.`);
          continue;
        }
        await Promise.all([
          db.collection(ORDERS_COLLECTION_ID).doc(orderId).delete().catch(() => {}),
          orderRef.delete().catch(() => {}),
        ]);
      }
      throw error;
    }

    try { revalidateTag('orders'); } catch {}
    if (body.orderSource === 'whatsapp') {
      const first = created[0];
      return NextResponse.json({ ok: true, orderId: first.orderId, orderCode: first.orderCode, status: 'paid', total: first.total });
    }
    return NextResponse.json({ ok: true, orders: created, total: created.reduce((sum, order) => sum + order.total, 0) });
  } catch (error: any) {
    console.error('[checkout/vendor-order]', error);
    const message = error?.message || 'Error al crear el pedido de la tienda aliada';
    return NextResponse.json({ error: message }, { status: /stock|disponible|reserva/i.test(message) ? 409 : 400 });
  }
}
