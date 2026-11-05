import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendorSession } from '@/lib/vendor-auth';
import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';
import { clearPublicProductDetailCache } from '@/lib/public-product-detail-cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { showInWeb } = await req.json();
    if (typeof showInWeb !== 'boolean') {
      return NextResponse.json({ error: 'La visibilidad debe ser verdadera o falsa' }, { status: 400 });
    }

    const db = getAdminDb();
    const collection = db.collection(PRODUCTS_COLLECTION_ID);
    const snapshots = await Promise.all([
      collection.where('VENDOR_ID', '==', session.vendorId).limit(1000).get(),
      collection.where('vendorId', '==', session.vendorId).limit(1000).get(),
      collection.where('SELLERID', '==', session.vendorId).limit(1000).get(),
      collection.where('sellerId', '==', session.vendorId).limit(1000).get(),
    ]);
    const docs = new Map<string, any>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(doc => docs.set(doc.id, doc)));

    const productDocs = Array.from(docs.values());
    for (let start = 0; start < productDocs.length; start += 450) {
      const batch = db.batch();
      productDocs.slice(start, start + 450).forEach(doc => {
        batch.update(doc.ref, { SHOW_IN_WEB: showInWeb, show_in_web: showInWeb });
      });
      await batch.commit();
    }

    revalidateTag('products');
    revalidateTag('catalog');
    revalidateTag('home');
    clearCatalogMemoryCache();
    clearPublicProductDetailCache();
    return NextResponse.json({ ok: true, updated: productDocs.length, showInWeb });
  } catch (err: any) {
    console.error('[vendor/products visibility POST]', err);
    return NextResponse.json({ error: err.message || 'Error al actualizar la visibilidad de los productos' }, { status: 500 });
  }
}
