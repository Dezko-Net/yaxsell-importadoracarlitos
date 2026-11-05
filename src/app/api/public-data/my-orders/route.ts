import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments, serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/db';
import { expireUnpaidOrder, getOrderAutoCancelAt, isOrderPaymentWindowExpired, isVendorOrder, markOrderPaymentExpired, PAYMENT_PENDING_STATUSES } from '@/lib/order-stock-service';

export const dynamic = 'force-dynamic';

const q = (method: string, attribute: string, values: any[]) => JSON.stringify({ method, attribute, values });
const limit = JSON.stringify({ method: 'limit', values: [50] });

// Caché en RAM global (compartida entre workers) de 5 minutos por usuario y 30 minutos para perfiles de vendors
const gMyOrders = globalThis as unknown as {
  __yaxsellMyOrdersCache?: Map<string, { ts: number; orders: any[] }>;
  __yaxsellVendorProfileCache?: Map<string, { ts: number; profile: any }>;
};
if (!gMyOrders.__yaxsellMyOrdersCache) gMyOrders.__yaxsellMyOrdersCache = new Map();
if (!gMyOrders.__yaxsellVendorProfileCache) gMyOrders.__yaxsellVendorProfileCache = new Map();

const _myOrdersCache = gMyOrders.__yaxsellMyOrdersCache;
const MY_ORDERS_TTL = 5 * 60 * 1000;
const _vendorProfileCache = gMyOrders.__yaxsellVendorProfileCache;
const VENDOR_PROFILE_TTL = 30 * 60 * 1000;

async function findOrders(collectionId: string, userId: string, email: string) {
  const unique = new Map<string, any>();

  if (userId) {
    const byUser = await serverListDocuments(collectionId, [q('equal', 'USERID', [userId]), limit]).catch(() => ({ documents: [] }));
    for (const order of (byUser as any).documents || []) {
      if (order.$id === '_init' || order._seed) continue;
      unique.set(order.$id, order);
    }
  }

  // Solo consultar por email si no hay userId o si queremos capturar pedidos hechos como guest
  // cuando por USERID no vino ningún pedido
  if (email && unique.size === 0) {
    const cleanEmail = email.trim();
    const lowerEmail = cleanEmail.toLowerCase();
    const emailQueries: Promise<any>[] = [
      serverListDocuments(collectionId, [q('equal', 'CUSTOMEREMAIL', [cleanEmail]), limit]).catch(() => ({ documents: [] })),
    ];
    if (lowerEmail !== cleanEmail) {
      emailQueries.push(
        serverListDocuments(collectionId, [q('equal', 'CUSTOMEREMAIL', [lowerEmail]), limit]).catch(() => ({ documents: [] }))
      );
    }
    const results = await Promise.all(emailQueries);
    for (const result of results) {
      for (const order of (result as any).documents || []) {
        if (order.$id === '_init' || order._seed) continue;
        unique.set(order.$id, order);
      }
    }
  }

  return Array.from(unique.values()).sort((a, b) => {
    const dateA = Number(a.CREATEDAT) || new Date(a.$createdAt || a.createdAt || 0).getTime();
    const dateB = Number(b.CREATEDAT) || new Date(b.$createdAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || '';
    const email = request.nextUrl.searchParams.get('email') || '';
    const force = request.nextUrl.searchParams.get('force') === '1';
    if (!userId && !email) return NextResponse.json({ orders: [] });

    const cacheKey = `${userId}::${email.toLowerCase().trim()}`;
    const cached = !force ? _myOrdersCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.ts < MY_ORDERS_TTL) {
      return NextResponse.json(
        { orders: cached.orders },
        { headers: { 'Cache-Control': 'private, max-age=120' } },
      );
    }

    const [rawMainOrders, rawVendorOrders] = await Promise.all([
      findOrders(ORDERS_COLLECTION_ID, userId, email),
      findOrders(VENDOR_ORDERS_COLLECTION_ID, userId, email),
    ]);
    const now = Date.now();
    const refreshExpiredOrder = async (order: any, collectionId: string) => {
      let current = order;
      if (isVendorOrder(current)) {
        const autoCancelAt = getOrderAutoCancelAt(current);
        if (PAYMENT_PENDING_STATUSES.includes(current.STATUS) || current.STATUS === 'payment_expired') {
          if (!current.PAYMENTPROOFURL && autoCancelAt > 0 && autoCancelAt <= now) {
            await expireUnpaidOrder(current.$id, now);
            current = await serverGetDocument(collectionId, current.$id) as any || current;
          }
        }
        return current;
      }
      if (PAYMENT_PENDING_STATUSES.includes(current.STATUS) && !current.PAYMENTPROOFURL && isOrderPaymentWindowExpired(current, now)) {
        await markOrderPaymentExpired(current.$id, now);
        current = await serverGetDocument(collectionId, current.$id) as any || current;
      }
      if (current.STATUS === 'payment_expired' && getOrderAutoCancelAt(current) <= now) {
        await expireUnpaidOrder(current.$id, now);
        current = await serverGetDocument(collectionId, current.$id) as any || current;
      }
      return current;
    };
    const [mainOrders, vendorOrders] = await Promise.all([
      Promise.all(rawMainOrders.map(order => refreshExpiredOrder(order, ORDERS_COLLECTION_ID))),
      Promise.all(rawVendorOrders.map(order => refreshExpiredOrder(order, VENDOR_ORDERS_COLLECTION_ID))),
    ]);

    const vendorIds = [...new Set(vendorOrders.map(order => order.VENDOR_ID).filter(Boolean))];
    const vendorProfiles: Record<string, any> = {};
    await Promise.all(vendorIds.map(async vendorId => {
      const cachedVendor = _vendorProfileCache.get(vendorId);
      if (cachedVendor && Date.now() - cachedVendor.ts < VENDOR_PROFILE_TTL) {
        vendorProfiles[vendorId] = cachedVendor.profile;
        return;
      }
      try {
        const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, vendorId) as any;
        const profile = { name: vendor.NAME || 'Tienda asociada', color: vendor.BRAND_COLOR || '#f97316', secondaryColor: vendor.BRAND_SECONDARY_COLOR || '#fb923c', logoUrl: vendor.LOGO_URL || '', address: vendor.STORE_ADDRESS || '', phone: vendor.STORE_PHONE || '', email: vendor.STORE_EMAIL || vendor.EMAIL || '', website: vendor.STORE_WEBSITE || '' };
        vendorProfiles[vendorId] = profile;
        _vendorProfileCache.set(vendorId, { ts: Date.now(), profile });
      } catch {
        vendorProfiles[vendorId] = { name: 'Tienda asociada', color: '#f97316', secondaryColor: '#fb923c' };
      }
    }));

    const taggedMain = mainOrders.map(order => ({ ...order, ORDER_SOURCE: 'main', STORE_LABEL: 'Importadora Carlitos' }));
    const taggedVendor = vendorOrders.map(order => ({
      ...order,
      STATUS: order.STATUS === 'payment_expired'
        ? (order.PAYMENTPROOFURL ? 'payment_review' : 'paid')
        : ['pending', 'pending_stock', 'processing'].includes(String(order.STATUS)) ? 'paid' : order.STATUS,
      ORDER_SOURCE: 'vendor',
      STORE_LABEL: vendorProfiles[order.VENDOR_ID]?.name || 'Tienda asociada',
      STORE_BRANDING: vendorProfiles[order.VENDOR_ID] || null,
    }));

    const orders = [...taggedMain, ...taggedVendor].sort((a, b) => {
      const dateA = Number(a.CREATEDAT) || new Date(a.$createdAt || 0).getTime();
      const dateB = Number(b.CREATEDAT) || new Date(b.$createdAt || 0).getTime();
      return dateB - dateA;
    });

    if (_myOrdersCache.size > 300) _myOrdersCache.clear();
    _myOrdersCache.set(cacheKey, { ts: Date.now(), orders });

    return NextResponse.json(
      { orders },
      { headers: { 'Cache-Control': 'private, max-age=120' } },
    );
  } catch (error: any) {
    console.error('[API public-data/my-orders]', error);
    return NextResponse.json({ orders: [] }, { status: 500 });
  }
}
