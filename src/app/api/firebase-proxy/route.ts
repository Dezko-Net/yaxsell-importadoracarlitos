import { NextResponse } from 'next/server';
import { serverListDocuments, serverGetDocument } from '@/lib/db-server';
import { PUBLIC_CACHEABLE_COLLECTIONS } from '@/lib/db';
import { unstable_cache } from 'next/cache';

const gProxy = globalThis as unknown as {
  __yaxsellFirebaseProxyCache?: Map<string, { data: any; ts: number }>;
};
if (!gProxy.__yaxsellFirebaseProxyCache) gProxy.__yaxsellFirebaseProxyCache = new Map();
const proxyMemoryCache = gProxy.__yaxsellFirebaseProxyCache;
const PROXY_MEMORY_TTL = 15 * 60 * 1000;

const getCachedList = (colId: string, parsedQueries: string[]) => unstable_cache(
  async () => {
    return await serverListDocuments(colId, parsedQueries);
  },
  ['appwrite-list-documents', colId, JSON.stringify(parsedQueries)],
  { revalidate: 86400, tags: ['appwrite-proxy', colId, 'products', `appwrite-proxy-${colId}`] }
)();

const getCachedDoc = (colId: string, docId: string) => unstable_cache(
  async () => {
    return await serverGetDocument(colId, docId);
  },
  ['appwrite-get-document', colId, docId],
  { revalidate: 86400, tags: ['appwrite-proxy', colId, 'products', `appwrite-proxy-${colId}`] }
)();

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const colId = url.searchParams.get('colId');
    const docId = url.searchParams.get('docId');
    const queriesStr = url.searchParams.get('queries') || '[]';

    if (!colId) {
      return NextResponse.json({ error: 'Missing colId' }, { status: 400 });
    }

    if (!PUBLIC_CACHEABLE_COLLECTIONS.includes(colId)) {
      return NextResponse.json({ error: 'Unauthorized collection' }, { status: 403 });
    }

    const memKey = docId ? `doc:${colId}:${docId}` : `list:${colId}:${queriesStr}`;
    const memHit = proxyMemoryCache.get(memKey);
    if (memHit && Date.now() - memHit.ts < PROXY_MEMORY_TTL) {
      return NextResponse.json(memHit.data, {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        },
      });
    }

    let data;

    if (docId) {
      data = await getCachedDoc(colId, docId);
    } else {
      let parsedQueries: string[] = [];
      try {
        parsedQueries = JSON.parse(decodeURIComponent(queriesStr));
      } catch (e) {
        console.warn('[appwrite-proxy] Invalid queries format:', queriesStr);
      }
      data = await getCachedList(colId, parsedQueries);
    }

    if (proxyMemoryCache.size > 500) proxyMemoryCache.clear();
    proxyMemoryCache.set(memKey, { data, ts: Date.now() });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    // Si la colección no existe devolver 404 limpio (no 500), así el cliente
    // puede detectarlo y silenciarse sin generar alertas innecesarias.
    const is404 = error?.code === 404 || error?.message?.includes('could not be found') || error?.type === 'collection_not_found';
    if (is404) {
      return NextResponse.json({ documents: [], total: 0 }, { status: 404 });
    }
    console.error('[appwrite-proxy] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
