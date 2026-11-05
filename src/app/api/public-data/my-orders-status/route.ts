import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';

const q = (method: string, attribute: string, values: any[]) =>
  JSON.stringify({ method, attribute, values });

const STATUS_FILTER = q('equal', 'STATUS', [
  'paid', 'payment_expired', 'payment_review', 'payment_confirmed',
  'shipped', 'delivered'
]);
const ORDER_DESC = JSON.stringify({ method: 'orderDesc', attribute: '$createdAt' });
// Pedimos unos cuantos por si hay varios de distintos estados, pero limitamos a 5 para no gastar lecturas
const LIMIT_5 = JSON.stringify({ method: 'limit', values: [5] });

// Caché en memoria — 30 min. Los pedidos no cambian de estado cada minuto.
// Si el estado cambia, el evento 'orders-updated' invalida el caché del cliente.
const CACHE_TTL = 1_800_000; // 30 minutos
const globalCache = (globalThis as any)._myOrdersStatusCache || new Map<string, { data: any, ts: number }>();
if (!(globalThis as any)._myOrdersStatusCache) {
  (globalThis as any)._myOrdersStatusCache = globalCache;
}

const EMPTY = { count: 0, firstOrderId: null, firstOrderStatus: null, firstUpdatedAt: null, shippedCount: 0, shippedOrderId: null, shippedStatus: null, shippedUpdatedAt: null };

async function fetchOrdersForUser(userId: string, email: string) {
  // Una sola query con limit 10 — buscamos por USERID primero, si no hay nada
  // intentamos por email. Así reducimos de 3 lecturas a máximo 2.
  let res = await serverListDocuments(ORDERS_COLLECTION_ID, [
    q('equal', 'USERID', [userId]), STATUS_FILTER, ORDER_DESC, LIMIT_5,
  ]).catch(() => ({ documents: [], total: 0 }));

  // Solo buscar por email si no hubo resultados por USERID
  if (res.total === 0 && email) {
    res = await serverListDocuments(ORDERS_COLLECTION_ID, [
      q('equal', 'CUSTOMEREMAIL', [email]), STATUS_FILTER, ORDER_DESC, LIMIT_5,
    ]).catch(() => ({ documents: [], total: 0 }));
  }

  // Eliminado el tercer fallback (userId minúscula) — era redundante con el primero
  // ya que Appwrite hace comparación case-sensitive y el userId siempre viene igual

  const docs = (res.documents || []) as any[];
  const paidDocs = docs.filter((d: any) => ['paid', 'payment_expired', 'payment_review', 'payment_confirmed'].includes(d.STATUS));
  const shippedDocs = docs.filter((d: any) => ['shipped', 'delivered'].includes(d.STATUS));

  return {
    count: paidDocs.length,
    firstOrderId: paidDocs[0]?.$id ?? null,
    firstOrderStatus: paidDocs[0]?.STATUS ?? null,
    firstUpdatedAt: paidDocs[0]?.UPDATEDAT ?? null,
    shippedCount: shippedDocs.length,
    shippedOrderId: shippedDocs[0]?.$id ?? null,
    shippedStatus: shippedDocs[0]?.STATUS ?? null,
    shippedUpdatedAt: shippedDocs[0]?.UPDATEDAT ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || '';
    const email = request.nextUrl.searchParams.get('email') || '';
    if (!userId) return NextResponse.json(EMPTY);

    const cacheKey = `${userId}:::${email}`;
    const now = Date.now();
    const cached = globalCache.get(cacheKey);

    if (cached && now - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    }

    const data = await fetchOrdersForUser(userId, email);
    globalCache.set(cacheKey, { data, ts: now });

    // Limpiar caché vieja aleatoriamente (10% prob) para evitar fugas de memoria
    if (Math.random() < 0.1) {
      for (const [k, v] of globalCache.entries()) {
        if (now - v.ts > CACHE_TTL) globalCache.delete(k);
      }
    }

    return NextResponse.json(data, {
      // stale-while-revalidate: el CDN sirve el caché viejo mientras revalida en bg
      // Esto evita que múltiples usuarios simultáneos golpeen Appwrite al mismo tiempo
      headers: { 'Cache-Control': 'private, max-age=1800, stale-while-revalidate=3600' },
    });
  } catch (error: any) {
    console.error('[API public-data/my-orders-status] Error:', error);
    return NextResponse.json(EMPTY);
  }
}
