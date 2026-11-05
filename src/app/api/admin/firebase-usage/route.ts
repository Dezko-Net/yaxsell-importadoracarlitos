import { NextRequest, NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, Query } from '@/lib/db';
import { getReadsSummary } from '@/lib/firebase-read-tracker';
import { unstable_cache, revalidateTag } from 'next/cache';
import { execSync } from 'child_process';
import { GoogleAuth } from 'google-auth-library';

export const dynamic = 'force-dynamic';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';

async function getAccessToken(): Promise<string> {
  try {
    const token = execSync('gcloud.cmd auth application-default print-access-token', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (token) return token;
  } catch {}

  try {
    const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    let auth: GoogleAuth;
    if (credsJson) {
      auth = new GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/monitoring.read'],
      });
    } else {
      auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/monitoring.read'],
      });
    }
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || '';
  } catch (e: any) {
    console.error('[firebase-usage] getAccessToken error:', e?.message || e);
    return '';
  }
}

async function queryFirestoreMetric(
  token: string,
  metricName: string,
  hours: number
): Promise<{ hourly: { date: string; value: number }[]; total: number }> {
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const filter = `metric.type="${metricName}" resource.type="firestore.googleapis.com/Database"`;
  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${start.toISOString()}&interval.endTime=${now.toISOString()}&aggregation.alignmentPeriod=3600s&aggregation.perSeriesAligner=ALIGN_DELTA`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) return { hourly: [], total: 0 };

  const data = await res.json();
  if (!data.timeSeries || data.timeSeries.length === 0) {
    return { hourly: [], total: 0 };
  }

  // Aggregate all series by hour
  const hourMap = new Map<string, number>();
  let total = 0;

  for (const ts of data.timeSeries) {
    for (const p of ts.points || []) {
      const val = Number(p.value?.int64Value || p.value?.doubleValue || 0);
      total += val;
      const hourKey = p.interval?.startTime?.slice(0, 13) || '';
      if (hourKey) {
        hourMap.set(hourKey, (hourMap.get(hourKey) || 0) + val);
      }
    }
  }

  const hourly = Array.from(hourMap.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { hourly, total };
}

function getChileStartOfDay(now = new Date()): Date {
  const chileDateStr = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Santiago', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(now); // 'YYYY-MM-DD'

  for (let offset = -5; offset <= -2; offset++) {
    const sign = offset < 0 ? '-' : '+';
    const offsetStr = sign + String(Math.abs(offset)).padStart(2, '0') + ':00';
    const candidate = new Date(`${chileDateStr}T00:00:00${offsetStr}`);
    const inSantiago = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(candidate);
    if (inSantiago === '00:00' || inSantiago === '24:00') {
      return candidate;
    }
  }
  return new Date(`${chileDateStr}T00:00:00-03:00`);
}

// Query today's reads (since midnight Chile America/Santiago)
// Queries raw unaggregated 1-minute delta points to eliminate sliding-window bucket leakage on refresh
async function queryTodayReads(token: string, metricName: string): Promise<{ total: number; byDatabase: Record<string, number> }> {
  const now = new Date();
  const startOfDay = getChileStartOfDay(now);

  const filter = `metric.type="${metricName}" resource.type="firestore.googleapis.com/Database"`;
  let pageToken = '';
  let total = 0;
  const byDatabase: Record<string, number> = {};

  do {
    let url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startOfDay.toISOString()}&interval.endTime=${now.toISOString()}&pageSize=10000`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) break;

    const data = await res.json();
    if (!data.timeSeries || data.timeSeries.length === 0) break;

    for (const ts of data.timeSeries) {
      const dbId = ts.resource?.labels?.database_id || '(default)';
      byDatabase[dbId] = byDatabase[dbId] || 0;
      for (const p of ts.points || []) {
        const val = Number(p.value?.int64Value || p.value?.doubleValue || 0);
        total += val;
        byDatabase[dbId] += val;
      }
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return { total, byDatabase };
}

async function queryFirestoreMetricRange(
  token: string,
  metricName: string,
  days: number
): Promise<{ daily: { date: string; value: number }[]; total: number; byDatabase: Record<string, number> }> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const filter = `metric.type="${metricName}" resource.type="firestore.googleapis.com/Database"`;
  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${start.toISOString()}&interval.endTime=${now.toISOString()}&aggregation.alignmentPeriod=86400s&aggregation.perSeriesAligner=ALIGN_DELTA`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) return { daily: [], total: 0, byDatabase: {} };

  const data = await res.json();
  if (!data.timeSeries || data.timeSeries.length === 0) {
    return { daily: [], total: 0, byDatabase: {} };
  }

  const dayMap = new Map<string, number>();
  const byDatabase: Record<string, number> = {};
  let total = 0;

  for (const ts of data.timeSeries) {
    const dbId = ts.resource?.labels?.database_id || '(default)';
    byDatabase[dbId] = byDatabase[dbId] || 0;
    for (const p of ts.points || []) {
      const val = Number(p.value?.int64Value || p.value?.doubleValue || 0);
      total += val;
      byDatabase[dbId] += val;
      const dayKey = p.interval?.startTime?.slice(0, 10) || '';
      if (dayKey) {
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + val);
      }
    }
  }

  const daily = Array.from(dayMap.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { daily, total, byDatabase };
}

// Cache de collection counts — SOLO se actualiza cuando el usuario
// le da al botón de refresh (revalidateTag). No hay auto-refresh.
const getCachedCollectionCounts = unstable_cache(
  async () => {
    return await countCollectionsUncached();
  },
  ['firebase-collection-counts-v2'],
  { revalidate: false, tags: ['collection-counts'] } // sin auto-refresh
);

async function countCollectionsUncached() {
  // Usar Firestore REST API con aggregation count — cuenta SIN leer documentos
  // Esto cuesta 1 lectura por aggregation (no por documento)
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';
  const token = await getAccessToken();

  const collectionsToCount = [
    { key: 'products', id: 'products' },
    { key: 'orders', id: 'orders' },
    { key: 'inventory', id: 'inventory_products' },
    { key: 'categories', id: 'categories' },
  ];

  const collections: Record<string, number> = {};
  let documentsTotal = 0;

  if (token) {
    await Promise.all(
      collectionsToCount.map(async (c) => {
        try {
          const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '(default)';
          const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runAggregationQuery`;
          const body = {
            structuredAggregationQuery: {
              structuredQuery: {
                from: [{ collectionId: c.id }],
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
            const count = Number(data[0]?.result?.aggregateFields?.count?.integerValue || 0);
            collections[c.key] = count;
            documentsTotal += count;
          } else {
            collections[c.key] = 0;
          }
        } catch (e: any) {
          console.error(`[firebase-usage] Error counting ${c.id}:`, e?.message || e);
          collections[c.key] = 0;
        }
      })
    );
  } else {
    collectionsToCount.forEach(c => { collections[c.key] = 0; });
  }

  return { collections, documentsTotal };
}

const getCachedFirebaseUsage = unstable_cache(
  async () => {
    const { collections, documentsTotal } = await getCachedCollectionCounts();

    let databaseReadsTotal = 0;
    let databaseWritesTotal = 0;
    let todayReads = 0;
    let sevenDaysReads = 0;
    let history: { date: string; value: number }[] = [];
    let writesHistory: { date: string; value: number }[] = [];
    let byDatabase: {
      todayReads: Record<string, number>;
      reads30d: Record<string, number>;
      writes30d: Record<string, number>;
    } = { todayReads: {}, reads30d: {}, writes30d: {} };
    let usageError: string | undefined;

    const token = await getAccessToken();
    if (token) {
      try {
        // 30-day history for reads + today's reads (since midnight UTC)
        const [readsRange, writesRange, todayReadsRes] = await Promise.all([
          queryFirestoreMetricRange(token, 'firestore.googleapis.com/document/read_ops_count', 30),
          queryFirestoreMetricRange(token, 'firestore.googleapis.com/document/write_ops_count', 30),
          queryTodayReads(token, 'firestore.googleapis.com/document/read_ops_count'),
        ]);

        history = readsRange.daily;
        writesHistory = writesRange.daily;
        databaseReadsTotal = readsRange.total;
        databaseWritesTotal = writesRange.total;
        todayReads = todayReadsRes.total;
        sevenDaysReads = history.slice(-7).reduce((s, h) => s + h.value, 0);
        byDatabase = {
          todayReads: todayReadsRes.byDatabase,
          reads30d: readsRange.byDatabase,
          writes30d: writesRange.byDatabase,
        };
      } catch (e: any) {
        usageError = e?.message || 'Error al obtener métricas de Cloud Monitoring';
      }
    } else {
      usageError = 'No se pudo obtener access token de gcloud';
    }

    // Fill empty days
    if (history.length === 0) {
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        history.push({ date: d.toISOString().slice(0, 10), value: 0 });
        writesHistory.push({ date: d.toISOString().slice(0, 10), value: 0 });
      }
    }

    return {
      databaseReadsTotal,
      databaseWritesTotal,
      todayReads,
      sevenDaysReads,
      history,
      writesHistory,
      byDatabase,
      collections,
      collectionsTotal: Object.keys(collections).length,
      documentsTotal,
      lastUpdated: new Date().toISOString(),
      cached: true,
      error: usageError,
    };
  },
  ['firebase-usage-cache-v2'],
  { revalidate: 300, tags: ['firebase-usage'] }
);

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force');

    if (force) {
      // Bustear el cache de collection counts para que se vuelvan a contar
      revalidateTag('collection-counts');
      const { collections, documentsTotal } = await getCachedCollectionCounts();

      let usageError: string | undefined;
      let databaseReadsTotal = 0;
      let databaseWritesTotal = 0;
      let todayReads = 0;
      let sevenDaysReads = 0;
      let history: { date: string; value: number }[] = [];
      let writesHistory: { date: string; value: number }[] = [];
      let byDatabase: {
        todayReads: Record<string, number>;
        reads30d: Record<string, number>;
        writes30d: Record<string, number>;
      } = { todayReads: {}, reads30d: {}, writes30d: {} };

      const token = await getAccessToken();
      if (token) {
        try {
          const [readsRange, writesRange, todayReadsRes] = await Promise.all([
            queryFirestoreMetricRange(token, 'firestore.googleapis.com/document/read_ops_count', 30),
            queryFirestoreMetricRange(token, 'firestore.googleapis.com/document/write_ops_count', 30),
            queryTodayReads(token, 'firestore.googleapis.com/document/read_ops_count'),
          ]);

          history = readsRange.daily;
          writesHistory = writesRange.daily;
          databaseReadsTotal = readsRange.total;
          databaseWritesTotal = writesRange.total;
          todayReads = todayReadsRes.total;
          sevenDaysReads = history.slice(-7).reduce((s, h) => s + h.value, 0);
          byDatabase = {
            todayReads: todayReadsRes.byDatabase,
            reads30d: readsRange.byDatabase,
            writes30d: writesRange.byDatabase,
          };
        } catch (e: any) {
          usageError = e?.message || 'Error al obtener métricas';
        }
      } else {
        usageError = 'No se pudo obtener access token de gcloud';
      }

      if (history.length === 0) {
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - i);
          history.push({ date: d.toISOString().slice(0, 10), value: 0 });
          writesHistory.push({ date: d.toISOString().slice(0, 10), value: 0 });
        }
      }

      return NextResponse.json({
        databaseReadsTotal,
        databaseWritesTotal,
        todayReads,
        sevenDaysReads,
        history,
        writesHistory,
        byDatabase,
        collections,
        collectionsTotal: Object.keys(collections).length,
        documentsTotal,
        lastUpdated: new Date().toISOString(),
        cached: false,
        error: usageError,
      });
    }

    const data = await getCachedFirebaseUsage();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching Firebase usage metrics:', error);
    return NextResponse.json({ error: error.message || 'Error desconocido' }, { status: 500 });
  }
}
