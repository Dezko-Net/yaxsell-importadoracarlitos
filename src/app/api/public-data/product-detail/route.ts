import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, VENDORS_COLLECTION_ID } from '@/lib/db';
import { serverGetDocument, serverListDocuments } from '@/lib/db-server';
import { normalizeProductImages } from '@/lib/product-images';
import { applyWebPrice, getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache';
import { getCatalogDataMemoryCache } from '@/lib/catalog-data-cache';
import { getPublicProductDetailCache, setPublicProductDetailCache } from '@/lib/public-product-detail-cache';
import { isProductPublishedOnWeb } from '@/lib/product-publication';
import { getInventoryConnectionMode, getInventoryStock } from '@/lib/inventory-mode';

async function resolveProductDetail(id: string) {
  const inventoryMode = await getInventoryConnectionMode();
  const cacheKey = `${id}:${inventoryMode}`;
  const cachedDetail = getPublicProductDetailCache(cacheKey);
  if (cachedDetail) return cachedDetail;

  // 1. Buscar primero en el catálogo completo en memoria (0 lecturas Firestore)
  const allProducts = await getCachedAllProducts().catch(() => []);
  let product = allProducts.find((p: any) => p.$id === id || p.id === id);

  if (!product) {
    // Evita exponer productos ocultos, desactivados o de tiendas suspendidas.
    const doc = await serverGetDocument(PRODUCTS_COLLECTION, id) as any;
    if (!doc || (isMainStoreProduct(doc)
      ? getInventoryStock(doc, inventoryMode, true)
      : Number(doc.STOCK ?? doc.stock ?? -1)) < 0 || !isProductPublishedOnWeb(doc)) return null;
    if (!isMainStoreProduct(doc)) {
      const vendorId = String(doc.VENDOR_ID || doc.vendorId || doc.SELLERID || doc.sellerId || '').trim();
      if (!vendorId) return null;
      const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, vendorId) as any;
      if (!vendor?.ACTIVE) return null;
      product = applyWebPrice(normalizeProductImages({
        ...doc,
        VENDOR_ID: vendorId,
        VENDOR_NAME: vendor.NAME || 'Tienda asociada',
        VENDOR_LOGO_URL: vendor.LOGO_URL || '',
        VENDOR_BRAND_COLOR: vendor.BRAND_COLOR || '#f97316',
        VENDOR_SECONDARY_COLOR: vendor.BRAND_SECONDARY_COLOR || '#fb923c',
        VENDOR_IS_MAIN: false,
      } as any));
    } else {
      const webStock = getInventoryStock(doc, inventoryMode, true);
      product = applyWebPrice(normalizeProductImages({ ...doc, STOCK: webStock, stock: webStock, VENDOR_ID: '', VENDOR_IS_MAIN: true } as any));
    }
  }

  if (!product) return null;
  const productStoreId = String(product.VENDOR_ID || '');

  // 2. Variantes vinculadas (GROUPID) resueltas desde memoria
  let linkedProducts: any[] = [];
  let variantLabels: Record<string, string> = {};
  if (product.GROUPID) {
    linkedProducts = allProducts
      .filter((p: any) => p.GROUPID === product.GROUPID && String(p.VENDOR_ID || '') === productStoreId)
      .slice(0, 20);

    try {
      const grpRes = await serverListDocuments('product_groups', [
        JSON.stringify({ method: 'equal', attribute: 'GROUPID', values: [product.GROUPID] }),
        JSON.stringify({ method: 'limit', values: [1] }),
      ]);
      if (grpRes.documents.length > 0) {
        const grpDoc = grpRes.documents[0] as any;
        if (grpDoc.VARIANT_LABELS) {
          variantLabels = JSON.parse(grpDoc.VARIANT_LABELS);
        }
      }
    } catch {}
  }

  // 3. Categoría y productos relacionados desde memoria (0 lecturas Firestore)
  let category: any = null;
  let relatedProducts: any[] = [];
  const catalogData = getCatalogDataMemoryCache();

  if (product.CATEGORYID) {
    if (catalogData?.categories) {
      category = catalogData.categories.find((c: any) => c.$id === product.CATEGORYID || c.id === product.CATEGORYID) || null;
    }
    if (!category) {
      try {
        category = await serverGetDocument(CATEGORIES_COLLECTION, product.CATEGORYID);
      } catch {}
    }

    relatedProducts = allProducts
      .filter((p: any) => p.CATEGORYID === product.CATEGORYID && p.$id !== id && String(p.VENDOR_ID || '') === productStoreId)
      .slice(0, 6);
  }

  // 4. Timed Offers desde caché de catálogo si existe
  let activeOffer = null;
  const cachedOffers: any[] = Array.isArray(catalogData?.offers) ? catalogData.offers : [];
  if (cachedOffers.length > 0) {
    const matching = cachedOffers.filter((o: any) => {
      if (o.targetId !== product.$id || !o.isActive || o.status !== 'active') return false;
      if (o.timeType === 'endDateTime' && o.endDateTime) {
        return new Date(o.endDateTime) > new Date();
      }
      if (o.timeType === 'duration' && o.durationHours) {
        const start = o.activatedAt || o.$createdAt;
        if (start) {
          return (new Date(start).getTime() + o.durationHours * 3600000) > Date.now();
        }
      }
      return true;
    });
    if (matching.length > 0) {
      let resolvedOffer = matching[0];
      const packDoc = cachedOffers.find((o: any) => o.offerType === 'pack_timer' && o.isActive);
      if (packDoc) {
        resolvedOffer = {
          ...resolvedOffer,
          timeType: 'endDateTime',
          endDateTime: packDoc.endDateTime,
        };
      }
      activeOffer = resolvedOffer;
    }
  }

  const payload = {
    product,
    linkedProducts,
    variantLabels,
    category,
    relatedProducts,
    activeOffer,
  };

  setPublicProductDetailCache(cacheKey, payload);
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
    }

    const data = await resolveProductDetail(id);
    if (!data) return NextResponse.json({ error: 'Producto no disponible' }, { status: 404 });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' }
    });
  } catch (error: any) {
    console.error('[API public-data/product-detail] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
