import { NextRequest, NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, THEME_CONFIG_COLLECTION } from '@/lib/db';
import { unstable_cache, revalidateTag } from 'next/cache';

const DOC_ID = 'ofertas_section';

let memoryCacheOfertas: { productIds: any[]; ts: number } | null = null;
const OFERTAS_CACHE_TTL = 60 * 60 * 1000;

const getCachedOfertas = unstable_cache(
  async () => {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    try {
      const doc = await databases.getDocument(databaseId, THEME_CONFIG_COLLECTION, DOC_ID);
      return JSON.parse((doc as any).SECTIONS || '[]');
    } catch (e: any) {
      if (e.code === 404 || String(e?.message || '').includes('not found')) {
        await databases.createDocument(databaseId, THEME_CONFIG_COLLECTION, DOC_ID, {
          NAME: 'ofertas_section',
          SECTIONS: '[]',
        }).catch(() => {});
        return [];
      }
      return [];
    }
  },
  ['ofertas-cache-v2'],
  { revalidate: 3600, tags: ['ofertas'] }
);

// GET - Get list of selected product IDs
export async function GET() {
  try {
    if (memoryCacheOfertas && Date.now() - memoryCacheOfertas.ts < OFERTAS_CACHE_TTL) {
      return NextResponse.json(
        { success: true, productIds: memoryCacheOfertas.productIds },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } }
      );
    }
    const productIds = await getCachedOfertas();
    memoryCacheOfertas = { productIds, ts: Date.now() };
    return NextResponse.json(
      { success: true, productIds },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } }
    );
  } catch (error: any) {
    console.error('[API ofertas] GET Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST - Update list of selected product IDs
export async function POST(req: NextRequest) {
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    const body = await req.json();
    const productIds = body.productIds || [];
    const sectionsStr = JSON.stringify(productIds);

    try {
      await databases.updateDocument(databaseId, THEME_CONFIG_COLLECTION, DOC_ID, {
        SECTIONS: sectionsStr,
      });
    } catch (e: any) {
      if (e.code === 404 || String(e?.message || '').includes('not found')) {
        await databases.createDocument(databaseId, THEME_CONFIG_COLLECTION, DOC_ID, {
          NAME: 'ofertas_section',
          SECTIONS: sectionsStr,
        });
      } else {
        throw e;
      }
    }

    memoryCacheOfertas = { productIds, ts: Date.now() };
    try { revalidateTag('ofertas'); } catch {}
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API ofertas] POST Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
