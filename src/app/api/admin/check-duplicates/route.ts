import { NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { PRODUCTS_COLLECTION, CATALOG_PRODUCTS_COLLECTION, INVENTORY_PRODUCTS_COLLECTION } from '@/lib/db';
import { getSkuFromFeatures } from '@/lib/product-features';
import { unstable_cache } from 'next/cache';

// Duplicate-SKU detection across the 3 product collections. This used to run
// client-side as 3 × listDocuments(limit=2000) = ~6000 Appwrite reads on every
// button click. It now runs server-side behind unstable_cache (24h), so it
// costs ~6000 reads only once per refresh window, shared across all admins.
// The cache is invalidated on-demand whenever a product changes via
// /api/revalidate?tag=products (tag: 'products').
const getCachedDuplicates = unstable_cache(
  async () => {
    const limitQ = JSON.stringify({ method: 'limit', values: [2000] });
    const [prodResp, catResp, invResp] = await Promise.all([
      serverListDocuments(PRODUCTS_COLLECTION, [limitQ]),
      serverListDocuments(CATALOG_PRODUCTS_COLLECTION, [limitQ]),
      serverListDocuments(INVENTORY_PRODUCTS_COLLECTION, [limitQ]),
    ]);

    const getSkuLocal = (p: any) => getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || p.$id;
    const allItems: any[] = [];
    const pushItems = (docs: any[], collection: string) => {
      docs.forEach((p: any) => {
        const sku = (getSkuLocal(p) || '').toLowerCase().trim();
        if (sku && sku !== p.$id) {
          allItems.push({
            document: p,
            sku,
            name: p.NAME || p.name || '',
            collection,
            stock: p.STOCK ?? p.stock ?? 0,
            price: p.PRICE ?? p.price ?? 0,
            imageurl: p.IMAGEURL || p.imageurl || '',
          });
        }
      });
    };
    pushItems(prodResp.documents as any[], 'products');
    pushItems(catResp.documents as any[], 'catalog_products');
    pushItems(invResp.documents as any[], 'inventory_products');

    const groupedBySku = new Map<string, any[]>();
    allItems.forEach(item => {
      if (!groupedBySku.has(item.sku)) groupedBySku.set(item.sku, []);
      groupedBySku.get(item.sku)!.push(item);
    });

    const groupedDuplicates: any[] = [];
    groupedBySku.forEach((items, sku) => {
      if (items.length <= 1) return;
      items.sort((a, b) => {
        const aHasStock = a.stock > 0 ? 1 : 0;
        const bHasStock = b.stock > 0 ? 1 : 0;
        if (aHasStock !== bHasStock) return bHasStock - aHasStock;
        const aIsMain = a.collection === 'products' ? 1 : 0;
        const bIsMain = b.collection === 'products' ? 1 : 0;
        if (aIsMain !== bIsMain) return bIsMain - aIsMain;
        return b.stock - a.stock;
      });
      const original = items[0];
      const duplicates = items.slice(1).map(dup => {
        const reason = dup.collection === 'products'
          ? `Copia interna en Productos (original tiene ${original.stock} stock)`
          : `Existe en colección '${dup.collection === 'catalog_products' ? 'Catálogo' : 'Inventario'}'`;
        return { ...dup, reason };
      });
      groupedDuplicates.push({ sku, original, duplicates });
    });

    return groupedDuplicates;
  },
  ['admin-check-duplicates-v1'],
  { revalidate: 86400, tags: ['products'] }
);

export async function GET() {
  try {
    const duplicates = await getCachedDuplicates();
    return NextResponse.json({ duplicates });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error', duplicates: [] }, { status: 500 });
  }
}
