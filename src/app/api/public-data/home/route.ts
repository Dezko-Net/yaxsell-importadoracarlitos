import { NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, TIMED_OFFERS_COLLECTION } from '@/lib/db';
import { Query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache';

import { getHomeMemoryCache, setHomeMemoryCache } from '@/lib/home-cache';
import { getInventoryConnectionMode, type InventoryConnectionMode } from '@/lib/inventory-mode';

// Caché independiente para categorías y subcategorías (cambian muy rara vez, 1 hora)
const getCachedCategoriesAndSubcategories = unstable_cache(
  async () => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const [cRes, scRes] = await Promise.all([
        databases.listDocuments(databaseId, CATEGORIES_COLLECTION, [
          Query.orderAsc('order'),
          Query.limit(100),
        ]).catch(() => ({ documents: [] })),
        databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION, [
          Query.limit(200),
        ]).catch(() => ({ documents: [] })),
      ]);

      return {
        categories: cRes.documents || [],
        subcategories: scRes.documents || [],
      };
    } catch (err) {
      console.warn('[getCachedCategoriesAndSubcategories] error:', err);
      return { categories: [], subcategories: [] };
    }
  },
  ['home-categories-subcategories-v2'],
  { revalidate: 3600, tags: ['categories', 'home'] }
);

// Caché para ofertas cronometradas
const getCachedTimedOffers = unstable_cache(
  async () => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const [dtRes, ptRes, toRes] = await Promise.all([
        databases.listDocuments(databaseId, TIMED_OFFERS_COLLECTION, [
          Query.equal('offerType', 'destacado_temporal'),
          Query.equal('isActive', true),
          Query.limit(1),
        ]).catch(() => ({ documents: [] })),

        databases.listDocuments(databaseId, TIMED_OFFERS_COLLECTION, [
          Query.equal('offerType', 'pack_timer'),
          Query.equal('isActive', true),
          Query.limit(1),
        ]).catch(() => ({ documents: [] })),

        databases.listDocuments(databaseId, TIMED_OFFERS_COLLECTION, [
          Query.equal('offerType', 'product'),
          Query.equal('isActive', true),
          Query.equal('status', 'active'),
          Query.limit(5),
        ]).catch(() => ({ documents: [] })),
      ]);

      return {
        destacadoTemporal: dtRes.documents.length > 0 ? dtRes.documents[0] : null,
        packTimer: ptRes.documents.length > 0 ? ptRes.documents[0] : null,
        timedOffers: toRes.documents || [],
      };
    } catch {
      return { destacadoTemporal: null, packTimer: null, timedOffers: [] };
    }
  },
  ['home-timed-offers-v2'],
  { revalidate: 600, tags: ['offers', 'home'] }
);

const getCachedHomeData = unstable_cache(
  async (inventoryMode: InventoryConnectionMode) => {
    const mem = getHomeMemoryCache(inventoryMode);
    if (mem) return mem;

    const [allProductsRaw, catsData, offersData] = await Promise.all([
      getCachedAllProducts(),
      getCachedCategoriesAndSubcategories(),
      getCachedTimedOffers(),
    ]);

    const allProducts = Array.isArray(allProductsRaw) ? allProductsRaw.filter(isMainStoreProduct) : [];

    const newestProducts = [...allProducts]
      .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
      .slice(0, 80);

    const cheapestProducts = [...allProducts]
      .sort((a, b) => Number(a.PRICE || 0) - Number(b.PRICE || 0))
      .slice(0, 12);

    const result = {
      categories: catsData.categories,
      subcategories: catsData.subcategories,
      products: newestProducts,
      cheapestProducts: cheapestProducts,
      destacadoTemporal: offersData.destacadoTemporal,
      packTimer: offersData.packTimer,
      timedOffers: offersData.timedOffers,
    };

    setHomeMemoryCache(result, inventoryMode);
    return result;
  },
  ['yaxsell-home-data-v7'],
  { revalidate: 3600, tags: ['home', 'products', 'offers'] }
);

export async function GET() {
  try {
    const inventoryMode = await getInventoryConnectionMode();
    const mem = getHomeMemoryCache(inventoryMode);
    const data = mem || await getCachedHomeData(inventoryMode);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' }
    });
  } catch (error: any) {
    console.error('[API public-data/home] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
