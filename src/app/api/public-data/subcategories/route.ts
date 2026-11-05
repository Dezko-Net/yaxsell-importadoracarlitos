import { NextRequest, NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, SUBCATEGORIES_COLLECTION } from '@/lib/db';
import { Query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

// force-dynamic removed to allow Vercel CDN caching via s-maxage header

import { getSubcategoriesMemoryCache, setSubcategoriesMemoryCache } from '@/lib/subcategories-cache';

const getCachedSubcategories = (categoryId: string) => unstable_cache(
  async () => {
    const cached = getSubcategoriesMemoryCache(categoryId);
    if (cached) {
      return cached;
    }

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    let res;
    try {
      res = await databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION, [
        Query.equal('categoryId', categoryId),
        Query.limit(50),
      ]);
    } catch {
      res = { documents: [] };
    }
    // Compatibilidad acotada para registros legados que guardaron CATEGORYID.
    // Evita el fallback anterior del cliente que descargaba hasta 500 documentos.
    if (res.documents.length === 0) {
      try {
        res = await databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION, [
          Query.equal('CATEGORYID', categoryId),
          Query.limit(50),
        ]);
      } catch {
        res = { documents: [] };
      }
    }

    setSubcategoriesMemoryCache(categoryId, res.documents);
    return res.documents;
  },
  [`subcategories-${categoryId}`],
  { revalidate: 3600, tags: [`subcategories-${categoryId}`, 'subcategories'] }
)();

export async function GET(request: NextRequest) {
  try {
    const categoryId = request.nextUrl.searchParams.get('categoryId');
    if (!categoryId) return NextResponse.json({ subcategories: [] });

    const subcategories = await getCachedSubcategories(categoryId);
    return NextResponse.json({ subcategories }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' }
    });
  } catch (error: any) {
    console.error('[API public-data/subcategories] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
