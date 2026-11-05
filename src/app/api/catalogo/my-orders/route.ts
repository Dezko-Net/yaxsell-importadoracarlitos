import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, serverGetDocument, serverListDocuments } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { getProductImageUrl } from '@/lib/product-images';
import { expireUnpaidOrder, getOrderAutoCancelAt, isOrderPaymentWindowExpired, isVendorOrder, markOrderPaymentExpired, PAYMENT_PENDING_STATUSES } from '@/lib/order-stock-service';

export const dynamic = 'force-dynamic';

function normalizePhoneVariants(phone: string): string[] {
  let rawDigits = phone.replace(/\D/g, '');
  if (!rawDigits) return [];

  if (rawDigits.length === 8) {
    rawDigits = '9' + rawDigits;
  }

  let ch9 = rawDigits;
  if (rawDigits.length > 9 && rawDigits.startsWith('56')) {
    ch9 = rawDigits.slice(2);
  } else if (rawDigits.length === 9) {
    ch9 = rawDigits;
  }

  const variants = Array.from(new Set([
    '56' + ch9,
    '+56' + ch9,
    ch9,
    '+' + rawDigits,
    rawDigits,
    phone.trim(),
  ])).filter(Boolean);

  return variants;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone') || '';
    if (!phone) return NextResponse.json({ error: 'phone requerido' }, { status: 400 });

    const variants = normalizePhoneVariants(phone);
    if (variants.length === 0) {
      return NextResponse.json({ success: true, orders: [] });
    }

    const db = getAdminDb();

    const allOrders: any[] = [];
    const seen = new Set<string>();

    for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
      try {
        const snap = await db.collection(collectionId)
          .where('CUSTOMERPHONE', 'in', variants)
          .get();

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          // Ignorar documentos de semilla o sin código
          if (docSnap.id === '_init' || data._seed) return;
          if (!seen.has(docSnap.id)) {
            seen.add(docSnap.id);
            allOrders.push({
              $id: docSnap.id,
              ...data,
              _SOURCECOLLECTION: collectionId,
            });
          }
        });
      } catch (colErr) {
        console.warn(`[my-orders] Error querying collection ${collectionId}:`, colErr);
      }
    }

    const now = Date.now();
    await Promise.all(allOrders.map(async (order: any) => {
      const collectionId = order._SOURCECOLLECTION;
      if (!collectionId) return;
      if (isVendorOrder(order)) {
        const autoCancelAt = getOrderAutoCancelAt(order);
        if ((PAYMENT_PENDING_STATUSES.includes(order.STATUS) || order.STATUS === 'payment_expired') && !order.PAYMENTPROOFURL && autoCancelAt > 0 && autoCancelAt <= now) {
          const cancelled = await expireUnpaidOrder(order.$id, now);
          if (cancelled) Object.assign(order, (await serverGetDocument(collectionId, order.$id) as any) || { STATUS: 'cancelled' });
        }
        return;
      }
      if (PAYMENT_PENDING_STATUSES.includes(order.STATUS) && !order.PAYMENTPROOFURL && isOrderPaymentWindowExpired(order, now)) {
        await markOrderPaymentExpired(order.$id, now);
        Object.assign(order, (await serverGetDocument(collectionId, order.$id) as any) || {});
      }
      if (order.STATUS === 'payment_expired' && getOrderAutoCancelAt(order) <= now) {
        const cancelled = await expireUnpaidOrder(order.$id, now);
        if (cancelled) Object.assign(order, (await serverGetDocument(collectionId, order.$id) as any) || { STATUS: 'cancelled' });
      }
    }));

    // Cargar nombres de las tiendas para que cada pedido indique su origen.
    const vendorIds = [...new Set(allOrders.map(o => o.VENDOR_ID).filter(Boolean))] as string[];
    const vendorNames: Record<string, string> = {};
    await Promise.all(vendorIds.map(async (vendorId) => {
      try {
        const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, vendorId) as any;
        vendorNames[vendorId] = vendor.NAME || 'Tienda asociada';
      } catch {
        vendorNames[vendorId] = 'Tienda asociada';
      }
    }));

    // Sort by creation date desc
    allOrders.sort((a, b) => {
      const timeA = typeof a.CREATEDAT === 'number'
        ? a.CREATEDAT
        : typeof a.createdAt === 'number'
          ? a.createdAt
          : a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = typeof b.CREATEDAT === 'number'
        ? b.CREATEDAT
        : typeof b.createdAt === 'number'
          ? b.createdAt
          : b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const orders = await Promise.all(allOrders.map(async (o: any) => {
      let itemsList: any[] = [];
      if (Array.isArray(o.ITEMS)) {
        itemsList = o.ITEMS;
      } else if (typeof o.ITEMS === 'string') {
        try {
          itemsList = JSON.parse(o.ITEMS);
        } catch {
          itemsList = [];
        }
      }

      // Recopilar IDs y SKUs de productos sin imagen para buscarlas en Firestore
      const productsToFetchById = new Set<string>();
      const productsToFetchBySku = new Set<string>();
      for (const item of itemsList) {
        const img = item.image || item.img || item.IMAGEURL || '';
        if (!img) {
          const pid = item.id || item.pid || item.productId || item.$id;
          if (pid && typeof pid === 'string' && pid.length > 5) {
            productsToFetchById.add(pid);
          } else if (item.sku && typeof item.sku === 'string' && item.sku !== '-' && item.sku !== 'undefined') {
            productsToFetchBySku.add(item.sku);
          }
        }
      }

      // Buscar imágenes de productos en Firestore por ID
      const productImages: Record<string, string> = {};
      await Promise.all([...productsToFetchById].map(async (pid) => {
        try {
          const prod = await serverGetDocument(PRODUCTS_COLLECTION_ID, pid) as any;
          const img = getProductImageUrl(prod)
            || prod.IMAGEURL
            || prod.IMAGEURL2
            || prod.IMAGEURL3
            || '';
          if (img) productImages[pid] = img;
        } catch {}
      }));

      // Buscar imágenes de productos en Firestore por SKU (para pedidos antiguos sin ID)
      const productImagesBySku: Record<string, string> = {};
      await Promise.all([...productsToFetchBySku].map(async (sku) => {
        try {
          const qSku = JSON.stringify({ method: 'equal', attribute: 'SKU', values: [sku] });
          const qLimit1 = JSON.stringify({ method: 'limit', values: [1] });
          const res = await serverListDocuments(PRODUCTS_COLLECTION_ID, [qSku, qLimit1]);
          if (res.documents && res.documents.length > 0) {
            const prod = res.documents[0] as any;
            const img = getProductImageUrl(prod)
              || prod.IMAGEURL
              || prod.IMAGEURL2
              || prod.IMAGEURL3
              || '';
            if (img) productImagesBySku[sku] = img;
          }
        } catch {}
      }));

      const parsedItems = itemsList.map((item: any) => {
        const pid = item.id || item.pid || item.productId || item.$id;
        const sku = item.sku || item.SKU || '';
        const img = item.image || item.img || item.IMAGEURL
          || productImages[pid]
          || productImagesBySku[sku]
          || '';
        return {
          ...item,
          image: img,
        };
      });

      const dateVal = o.CREATEDAT || o.createdAt || o.$createdAt;
      const createdAtIso = typeof dateVal === 'number'
        ? new Date(dateVal).toISOString()
        : typeof dateVal === 'string'
          ? dateVal
          : new Date().toISOString();

      return {
        id: o.$id,
        orderCode: o.ORDERCODE || o.REQCODE || o.orderCode || o.$id,
        storeName: o.VENDOR_ID ? (vendorNames[o.VENDOR_ID] || 'Tienda asociada') : 'Importadora Carlitos',
        vendorId: o.VENDOR_ID || '',
        status: isVendorOrder(o) && o.STATUS === 'payment_expired'
          ? (o.PAYMENTPROOFURL ? 'payment_review' : 'paid')
          : o.STATUS || 'pending',
        total: Number(o.TOTAL || o.SUBTOTAL || 0),
        items: parsedItems,
        createdAt: createdAtIso,
        expiresAt: isVendorOrder(o) ? null : o.EXPIRESAT || null,
        paymentExpiredAt: isVendorOrder(o) ? null : o.PAYMENTEXPIREDAT || null,
        autoCancelAt: o.AUTOCANCELAT || null,
        paymentProofUrl: o.PAYMENTPROOFURL || '',
        assignedCashier: o.ASSIGNEDCASHIER || '',
        shippingAgency: o.SHIPPINGAGENCY || '',
        trackingNumber: o.TRACKINGNUMBER || '',
        customerName: o.CUSTOMERNAME || o.customerName || o.NAME || o.name || '',
        customerPhone: o.CUSTOMERPHONE || o.customerPhone || '',
      };
    }));

    return NextResponse.json({ success: true, orders }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API catalogo/my-orders] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
