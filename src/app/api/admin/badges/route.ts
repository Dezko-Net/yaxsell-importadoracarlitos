import { NextResponse } from 'next/server';

const CACHE_TTL = 300_000; // 5 minutos (antes 30s)
const globalCache = (globalThis as any)._adminBadgesCache || { data: null, ts: 0 };
if (!(globalThis as any)._adminBadgesCache) {
  (globalThis as any)._adminBadgesCache = globalCache;
}

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';

function getAccessToken(): string {
  try {
    const { execSync } = require('child_process');
    return execSync('gcloud.cmd auth application-default print-access-token', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function countWithFilter(collection: string, status: string): Promise<number> {
  const token = getAccessToken();
  if (!token) return 0;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runAggregationQuery`;
    const body = {
      structuredAggregationQuery: {
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'STATUS' },
              op: 'EQUAL',
              value: { stringValue: status },
            },
          },
        },
        aggregations: [{ alias: 'count', count: {} }],
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return Number(data[0]?.result?.aggregateFields?.count?.integerValue || 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const now = Date.now();
    if (globalCache.data && now - globalCache.ts < CACHE_TTL) {
      return NextResponse.json(globalCache.data, {
        headers: { 'Cache-Control': 'private, max-age=300' }
      });
    }

    // Usar aggregation count via REST API — 1 lectura por query (no por documento)
    const [pendingOrders, processingOrders, pendingWholesale] = await Promise.all([
      countWithFilter('orders', 'pending'),
      countWithFilter('orders', 'processing'),
      countWithFilter('wholesale_orders', 'pending'),
    ]).catch(() => [0, 0, 0]);

    const data = {
      pendingOrders,
      processingOrders,
      pendingWholesale,
      pendingRequests: 0,
      pendingAlerts: 0,
    };

    globalCache.data = data;
    globalCache.ts = now;

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
