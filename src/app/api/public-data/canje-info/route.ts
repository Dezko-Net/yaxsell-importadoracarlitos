import { NextRequest, NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION } from '@/lib/db';
import { WHOLESALE_ORDERS_COLLECTION_ID } from '@/lib/db';
import { Query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache';

export const dynamic = 'force-dynamic';

// Caché en RAM de 10 minutos por usuario para evitar lecturas en el polling de GlobalCanjeBanner
const _canjeOrdersRamCache = new Map<string, { ts: number; orders: any[] }>();
const CANJE_RAM_TTL = 10 * 60 * 1000;

const _fetchNegotiationOrdersUnstable = (userId: string, email: string) => unstable_cache(
  async () => {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    const queries: string[] = [Query.equal('STATUS', 'negotiation'), Query.limit(50)];
    if (userId) queries.unshift(Query.equal('USERID', userId));

    let negotiationOrders: any[] = [];

    try {
      const ordersRes = await databases.listDocuments(databaseId, ORDERS_COLLECTION, queries);
      negotiationOrders = ordersRes.documents;
    } catch {}

    try {
      const wsQueries: string[] = [Query.equal('STATUS', 'negotiation'), Query.limit(50)];
      if (userId) wsQueries.unshift(Query.equal('USERID', userId));
      const wsRes = await databases.listDocuments(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, wsQueries);
      negotiationOrders = [...negotiationOrders, ...wsRes.documents];
    } catch {}

    if (negotiationOrders.length === 0 && email) {
      try {
        const emailOrders = await databases.listDocuments(databaseId, ORDERS_COLLECTION, [
          Query.equal('CUSTOMEREMAIL', email),
          Query.equal('STATUS', 'negotiation'),
          Query.limit(50),
        ]);
        negotiationOrders = emailOrders.documents;
      } catch {}
    }

    return negotiationOrders;
  },
  ['canje-negotiation-orders-v2', userId, email],
  { revalidate: 600, tags: ['orders', 'canje'] }
)();

async function getCachedNegotiationOrders(userId: string, email: string): Promise<any[]> {
  const key = `${userId || ''}::${(email || '').toLowerCase().trim()}`;
  const cached = _canjeOrdersRamCache.get(key);
  if (cached && Date.now() - cached.ts < CANJE_RAM_TTL) {
    return cached.orders;
  }
  const orders = await _fetchNegotiationOrdersUnstable(userId, email);
  if (_canjeOrdersRamCache.size > 500) _canjeOrdersRamCache.clear();
  _canjeOrdersRamCache.set(key, { ts: Date.now(), orders });
  return orders;
}

// Reutiliza el catálogo maestro en RAM (0 lecturas adicionales a Firestore)
async function getCachedCanjeProducts(): Promise<any[]> {
  try {
    const all = await getCachedAllProducts();
    return (all || []).filter((p: any) => isMainStoreProduct(p) && Number(p.PRICE || 0) > 0);
  } catch (e) {
    console.error('Error fetching products for canje:', e);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');
    const lightweight = searchParams.get('lightweight') === '1';

    if (!userId && !email) {
      return NextResponse.json({ error: 'userId or email required' }, { status: 400 });
    }

    let creditAmount = 0;
    const negotiationOrders = await getCachedNegotiationOrders(userId || '', email || '');

    // Calculate credit from missing items
    for (const order of negotiationOrders) {
      try {
        const items = JSON.parse(order.ITEMS || '[]');
        for (const item of items) {
          if (item.missing && !item.replaced) {
            creditAmount += (item.price || 0) * (item.qty || 1);
          }
        }
      } catch {}
    }

    // If no credit, return early
    if (creditAmount <= 0) {
      return NextResponse.json({
        hasCredit: false,
        creditAmount: 0,
        creditWithMargin: 0,
        products: [],
        orders: [],
      });
    }

    // Lightweight mode: skip fetching 500 products, only return credit info
    if (lightweight) {
      return NextResponse.json({
        hasCredit: true,
        creditAmount,
        creditWithMargin: creditAmount + 500,
        products: [],
        orders: negotiationOrders.map((o: any) => ({
          id: o.$id,
          orderCode: o.ORDERCODE || o.REQCODE || o.$id,
          status: o.STATUS,
          isWholesale: o.$collectionId === WHOLESALE_ORDERS_COLLECTION_ID,
        })),
      });
    }

    // 2. Fetch ALL products - canje applies flat 20% off from unit 1
    const eligibleProducts = await getCachedCanjeProducts();

    return NextResponse.json({
      hasCredit: true,
      creditAmount,
      creditWithMargin: creditAmount + 500,
      products: eligibleProducts,
      orders: negotiationOrders.map((o: any) => ({
        id: o.$id,
        orderCode: o.ORDERCODE || o.REQCODE || o.$id,
        status: o.STATUS,
        isWholesale: o.$collectionId === WHOLESALE_ORDERS_COLLECTION_ID,
      })),
    });
  } catch (error: any) {
    console.error('Canje info error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
