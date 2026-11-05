import { NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, INVENTORY_PRODUCTS_COLLECTION } from '@/lib/db';
import { Query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

let memoryCacheInventory: any[] | null = null;
let memoryCacheInventoryTime = 0;

const getCachedInventoryProducts = unstable_cache(
  async () => {
    const now = Date.now();
    if (memoryCacheInventory && (now - memoryCacheInventoryTime < 2000)) {
      return memoryCacheInventory;
    }

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    
    const allProducts: any[] = [];
    let lastId = null;
    const limit = 100;
    
    while (true) {
      const queries = [Query.limit(limit)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }
      
      const response = await databases.listDocuments(databaseId, INVENTORY_PRODUCTS_COLLECTION, queries).catch(() => ({ documents: [] }));
      if (response.documents.length === 0) {
        break;
      }
      
      allProducts.push(...response.documents);
      lastId = response.documents[response.documents.length - 1].$id;
      
      if (response.documents.length < limit) {
        break;
      }
    }
    
    memoryCacheInventory = allProducts;
    memoryCacheInventoryTime = Date.now();
    return allProducts;
  },
  ['all-inventory-products-cache-v1'],
  { revalidate: 86400, tags: ['products'] }
);

export async function GET() {
  try {
    const data = await getCachedInventoryProducts();
    return NextResponse.json({ documents: data }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' }
    });
  } catch (error: any) {
    console.error('[API public-data/inventory] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
