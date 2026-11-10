import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, TIMED_OFFERS_COLLECTION } from '@/lib/db';
import { unstable_cache } from 'next/cache';


const getCachedCatalogStructure = unstable_cache(
  async () => {
    const [catDocs, subDocs] = await Promise.all([
      serverListDocuments(CATEGORIES_COLLECTION, [
        JSON.stringify({ method: 'limit', values: [100] }),
      ]),
      serverListDocuments(SUBCATEGORIES_COLLECTION, [
        JSON.stringify({ method: 'limit', values: [300] }),
      ]),
    ]);

    const categories = (catDocs.documents || []).map((c: any) => ({
      id: c.id || c.$id,
      $id: c.$id || c.id,
      ...c
    })).sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999) || (a.name || '').localeCompare(b.name || ''));

    const subcategories = (subDocs.documents || []).map((s: any) => ({
      id: s.id || s.$id,
      $id: s.$id || s.id,
      ...s
    })).sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999) || (a.name || '').localeCompare(b.name || ''));

    return {
      categories,
      subcategories,
    };
  },
  ['public-catalog-structure-cache-v1'],
  { revalidate: 86400, tags: ['catalog', 'categories'] }
);

const getCachedCatalogOffers = unstable_cache(
  async () => {
    const offers = await serverListDocuments(TIMED_OFFERS_COLLECTION, [
      JSON.stringify({ method: 'equal', attribute: 'isActive', values: [true] }),
      JSON.stringify({ method: 'equal', attribute: 'status', values: ['active'] }),
      JSON.stringify({ method: 'limit', values: [100] }),
    ]).catch(() => ({ documents: [], total: 0 }));
    return offers.documents || [];
  },
  ['public-catalog-offers-cache-v1'],
  { revalidate: 86400, tags: ['catalog', 'offers'] }
);

const getCachedCatalogData = unstable_cache(
  async () => {
    const [structure, offers] = await Promise.all([
      getCachedCatalogStructure(),
      getCachedCatalogOffers(),
    ]);
    return { ...structure, offers };
  },
  ['public-catalog-cache-v10'],
  { revalidate: 86400, tags: ['catalog', 'categories', 'offers'] }
);

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('categoriesOnly') === 'true') {
      const structure = await getCachedCatalogStructure();
      return NextResponse.json({
        categories: structure.categories || [],
        subcategories: structure.subcategories || [],
        offers: [],
      }, {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'Vercel-CDN-Cache-Control': 'no-store',
          'CDN-Cache-Control': 'no-store',
        }
      });
    }
    const data = await getCachedCatalogData();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Vercel-CDN-Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
      }
    });
  } catch (error: any) {
    console.error('[API public-data/catalog] Error:', error);
    return NextResponse.json({ categories: [], subcategories: [], offers: [] }, { status: 200 });
  }
}
