import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { unstable_cache } from 'next/cache';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    const limit = parseInt(searchParams.get('limit') || '5');

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Parámetro "name" es requerido' },
        { status: 400 }
      );
    }

    const getCachedSearch = unstable_cache(
      async () => {
        // Try exact match first
        const res = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
          `equal("NAME", ["${name}"])`,
        ]);
        let docs = (res as any).documents || [];

        // Fallback: search with Query.search if exact match fails
        if (docs.length === 0) {
          try {
            const res2 = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
              `search("NAME", ["${name}"])`,
              `limit(${limit})`
            ]);
            docs = (res2 as any).documents || [];
          } catch (err) {
            console.error('Error on fulltext search fallback:', err);
          }
        }
        return docs;
      },
      ['product-search', name, String(limit)],
      { revalidate: 300, tags: ['products'] }
    )();

    const rawDocs = await getCachedSearch;
    const docs = (rawDocs || []).filter((d: any) => {
      if (d.isVendorProduct === true || d.IS_VENDOR_PRODUCT === true) return false;
      const vid = d.VENDOR_ID || d.vendorId;
      if (vid && !['__MAIN__', 'carlitos', 'importadora-carlitos', 'importadora_carlitos'].includes(vid)) return false;
      const sid = d.SELLERID || d.sellerId;
      if (sid && !['__MAIN__', 'carlitos', 'importadora-carlitos', 'importadora_carlitos'].includes(sid)) return false;
      return true;
    });

    const products = docs.map((d: any) => ({
      $id: d.$id,
      NAME: d.NAME,
      PRICE: d.PRICE,
      CURRENTPRICE: d.CURRENTPRICE,
      STOCK: d.STOCK,
      CATEGORYID: d.CATEGORYID,
      DESCRIPTION: d.DESCRIPTION,
      IMAGEURL: d.IMAGEURL,
    }));

    return NextResponse.json({ success: true, products, total: products.length });
  } catch (error: any) {
    console.error('Error searching products:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al buscar productos' },
      { status: 500 }
    );
  }
}
