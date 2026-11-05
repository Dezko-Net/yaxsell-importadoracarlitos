import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';

export const dynamic = 'force-dynamic';

// Cache server-side en memoria global (TTL 3 minutos por rango start_end)
const gRangeStats = globalThis as unknown as {
  __yaxsellRangeStatsCache?: Map<string, { data: any; ts: number }>;
};

function getRangeStatsCache() {
  if (!gRangeStats.__yaxsellRangeStatsCache) {
    gRangeStats.__yaxsellRangeStatsCache = new Map();
  }
  return gRangeStats.__yaxsellRangeStatsCache;
}

const RANGE_CACHE_TTL = 3 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (!start || !end) {
      return NextResponse.json({ error: 'start y end son requeridos (YYYY-MM-DD)' }, { status: 400 });
    }

    const cacheKey = `${start}_${end}`;
    const cache = getRangeStatsCache();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < RANGE_CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, max-age=180' },
      });
    }

    const sTs = new Date(start + 'T00:00:00').getTime();
    const eTs = new Date(end + 'T23:59:59').getTime();

    const db = getAdminDb();
    let snap;
    try {
      snap = await db.collection('orders')
        .where('CREATEDAT', '>=', sTs)
        .where('CREATEDAT', '<=', eTs)
        .limit(1000)
        .get();
    } catch {
      // Fallback acotado si requiere índice o formato alternativo
      snap = await db.collection('orders').orderBy('CREATEDAT', 'desc').limit(500).get();
    }

    const paidStatuses = ['processing', 'paid', 'negotiation', 'shipped', 'delivered', 'payment_confirmed'];
    const counts: Record<string, number> = {};
    let total = 0, count = 0, totalPaid = 0, countPaid = 0;
    let countWhatsapp = 0, countWeb = 0;
    const byCustomer: Record<string, { name: string; total: number }> = {};

    for (const doc of snap.docs) {
      const d = doc.data() as any;
      if (d._seed) continue;
      const ts = d.CREATEDAT;
      if (typeof ts !== 'number' || ts < sTs || ts > eTs) continue;

      counts[String(d.STATUS)] = (counts[String(d.STATUS)] || 0) + 1;
      total += d.TOTAL || 0;
      count++;
      if (d.PAYMENTMETHOD === 'WhatsApp') {
        countWhatsapp++;
      } else {
        countWeb++;
      }

      if (paidStatuses.includes(d.STATUS)) {
        totalPaid += d.TOTAL || 0;
        countPaid++;
      }

      const key = d.CUSTOMERRUT || d.CUSTOMERNAME || 'anon';
      if (!byCustomer[key]) byCustomer[key] = { name: d.CUSTOMERNAME || key, total: 0 };
      byCustomer[key].total += d.TOTAL || 0;
    }

    const topEntries = Object.values(byCustomer).sort((a, b) => b.total - a.total);

    const responseData = {
      total,
      count,
      totalPaid,
      countPaid,
      countWhatsapp,
      countWeb,
      topCustomer: topEntries[0] || null,
      statusCounts: counts,
    };

    if (cache.size > 100) cache.clear();
    cache.set(cacheKey, { data: responseData, ts: Date.now() });

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'private, max-age=180' },
    });
  } catch (error: any) {
    console.error('[API orders/range-stats] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
