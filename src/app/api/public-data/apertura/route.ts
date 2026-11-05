import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { serverListDocuments, APERTURA_SETTINGS_COLLECTION_ID } from '@/lib/db-server';

// Caché en memoria global de 60 minutos (evita lecturas repetitivas en cada visita web)
const gApertura = globalThis as unknown as {
  __yaxsellAperturaCache?: { data: any; ts: number };
};
const MEMORY_CACHE_TTL = 60 * 60 * 1000;

const DEFAULT_SETTINGS = {
  isActive: true,
  discountPercent: 10,
  minPurchase: 0,
};

const getCachedAperturaSettings = unstable_cache(
  async () => {
    const now = Date.now();
    const cached = gApertura.__yaxsellAperturaCache;
    if (cached && (now - cached.ts < MEMORY_CACHE_TTL)) {
      return cached.data;
    }

    const response = await serverListDocuments(APERTURA_SETTINGS_COLLECTION_ID, [
      { limit: 1 },
    ]).catch(() => ({ documents: [], total: 0 }));

    let result = { ...DEFAULT_SETTINGS };

    if (response.documents.length > 0) {
      const d = response.documents[0] as any;
      result = {
        isActive: !!d.isActive,
        discountPercent: typeof d.discountPercent === 'number' ? d.discountPercent : 10,
        minPurchase: typeof d.minPurchase === 'number' ? d.minPurchase : 0,
      };
    }

    gApertura.__yaxsellAperturaCache = { data: result, ts: now };
    return result;
  },
  ['apertura-settings-cache-v2'],
  { revalidate: 3600, tags: ['apertura_settings'] }
);

export async function GET() {
  try {
    const cached = gApertura.__yaxsellAperturaCache;
    if (cached && (Date.now() - cached.ts < MEMORY_CACHE_TTL)) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400'
        }
      });
    }
    const data = await getCachedAperturaSettings();
    gApertura.__yaxsellAperturaCache = { data, ts: Date.now() };
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (error: any) {
    console.error('[API apertura] Error fetching apertura settings:', error);
    return NextResponse.json(gApertura.__yaxsellAperturaCache?.data || DEFAULT_SETTINGS, { status: 200 });
  }
}
