import { NextRequest, NextResponse } from 'next/server';
import { TIMED_OFFERS_COLLECTION } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { resolveProductDisplayPrice } from '@/lib/apertura-promo';
import { fetchAperturaSettings } from '@/lib/apertura-promo-server';
import { getSkuFromFeatures } from '@/lib/product-features';
import { productMatchesBrand } from '@/lib/brands';
import { getCachedAllProducts } from '@/lib/catalog-cache';
import { serverListDocuments } from '@/lib/db-server';
import { getProductNewestTimestamp } from '@/lib/product-sort-date';

export const dynamic = 'force-dynamic';

const gProductsRoute = globalThis as unknown as {
  __yaxsellActiveOffersCache?: { data: any[]; ts: number };
  __yaxsellAperturaSettingsRouteCache?: { data: any; ts: number };
};

const MEMORY_TTL_10M = 30 * 60 * 1000;

const _getCachedActiveOffersUnstable = unstable_cache(
  async () => {
    const res = await serverListDocuments(TIMED_OFFERS_COLLECTION, [
      JSON.stringify({ method: 'equal', attribute: 'isActive', values: [true] }),
      JSON.stringify({ method: 'equal', attribute: 'status', values: ['active'] }),
      JSON.stringify({ method: 'limit', values: [100] }),
    ]).catch(() => ({ documents: [], total: 0 }));
    const ids = (res.documents as any[]).map((d: any) => d.targetId).filter(Boolean);
    gProductsRoute.__yaxsellActiveOffersCache = { data: ids, ts: Date.now() };
    return ids;
  },
  ['active-offers-cache-v5'],
  { revalidate: 3600, tags: ['offers'] }
);

async function getCachedActiveOffers(): Promise<any[]> {
  const cached = gProductsRoute.__yaxsellActiveOffersCache;
  if (cached && Date.now() - cached.ts < MEMORY_TTL_10M) {
    return cached.data;
  }
  const ids = await _getCachedActiveOffersUnstable();
  gProductsRoute.__yaxsellActiveOffersCache = { data: ids, ts: Date.now() };
  return ids;
}

// Cache apertura settings
const _getCachedAperturaSettingsUnstable = unstable_cache(
  async () => {
    const settings = await fetchAperturaSettings();
    gProductsRoute.__yaxsellAperturaSettingsRouteCache = { data: settings, ts: Date.now() };
    return settings;
  },
  ['apertura-settings-cache-v4'],
  { revalidate: 3600, tags: ['settings'] }
);

async function getCachedAperturaSettings(): Promise<any> {
  const cached = gProductsRoute.__yaxsellAperturaSettingsRouteCache;
  if (cached && Date.now() - cached.ts < MEMORY_TTL_10M) {
    return cached.data;
  }
  const settings = await _getCachedAperturaSettingsUnstable();
  gProductsRoute.__yaxsellAperturaSettingsRouteCache = { data: settings, ts: Date.now() };
  return settings;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ products: [] });
      }
      const [allProductsRaw] = await Promise.all([
        getCachedAllProducts()
      ]);
      const allProducts = allProductsRaw as any[];
      const filtered = allProducts.filter(p => ids.includes(p.$id));
      const map = new Map(filtered.map(p => [p.$id, p]));
      const sorted = ids.map(id => map.get(id)).filter(Boolean);
      return NextResponse.json({ products: sorted });
    }

    // 2. Standard Catalog Filters (Memory-based query)
    const sortBy = searchParams.get('sortBy') || 'newest';
    const categoryId = searchParams.get('categoryId') || undefined;
    const subcategoryId = searchParams.get('subcategoryId') || undefined;
    const subSubcategoryId = searchParams.get('subSubcategoryId') || undefined;
    const tag = searchParams.get('tag') || undefined;
    const search = searchParams.get('search') || undefined;
    const brand = searchParams.get('brand') || undefined;
    const vendorId = searchParams.get('vendorId') || undefined;
    const includeVendorProducts = searchParams.get('includeVendorProducts') === 'true';
    const ofertasOnly = searchParams.get('ofertasOnly') === 'true';
    const apurateOnly = searchParams.get('apurateOnly') === 'true';
    // mode=paquetes|embalajes: catálogo por paquete (PACKQTY>1, precio de pack)
    const mode = searchParams.get('mode') || undefined;
    const priceMin = searchParams.get('priceMin') ? parseInt(searchParams.get('priceMin')!, 10) : undefined;
    const priceMax = searchParams.get('priceMax') ? parseInt(searchParams.get('priceMax')!, 10) : undefined;
    const inStockOnly = searchParams.get('inStockOnly') === 'true';
    const minimal = searchParams.get('minimal') === 'true' &&
      sortBy === 'newest' && !categoryId && !subcategoryId && !subSubcategoryId &&
      !tag && !search && !brand && !vendorId && !ofertasOnly && !apurateOnly &&
      !mode && priceMin === undefined && priceMax === undefined && !inStockOnly;
    
    // Fallback to 1000 if limit is not passed (stale browser cache fallback)
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 1000;
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch cached data
    const [allProductsRaw, activeOffers, apertura] = await Promise.all([
      getCachedAllProducts(),
      minimal && !ofertasOnly ? Promise.resolve([]) : getCachedActiveOffers(),
      minimal ? Promise.resolve(null) : getCachedAperturaSettings()
    ]);

    // En el catálogo, los clientes pueden explorar todos los productos disponibles y agotados.
    // El stock real se muestra en cada tarjeta (Stock: X unid. o Stock: 0 · Agotado).
    // Si explícitamente se pide inStockOnly=true, se filtran solo los con stock > 0.
    const allProducts = (allProductsRaw as any[])
      // 🖼️ Solo mostrar productos con imagen en el e-commerce público
      // Los productos ERP sin imagen quedan ocultos hasta que se les suba una foto
      .filter((p: any) => {
        const hasImage = p.IMAGEURL && String(p.IMAGEURL).trim();
        if (!hasImage) return false;
        if (inStockOnly) return Number(p.STOCK || 0) > 0;
        return true;
      });

    // Precio efectivo según modo (pack multiplica por PACKQTY)
    const isPackMode = mode === 'paquetes' || mode === 'embalajes';
    const priceOf = (p: any): number => {
      if (isPackMode) {
        let base = p.WHOLESALEPRICE || p.PRICE || 0;
        if (p.PACKQTY) base *= p.PACKQTY;
        return base;
      }
      return resolveProductDisplayPrice(p, apertura).displayPrice;
    };

    let modeProducts = isPackMode
      ? allProducts.filter(p => {
          const qty = p.PACKQTY ? Number(p.PACKQTY) : 0;
          return !isNaN(qty) && qty > 1;
        })
      : allProducts;

    if (brand) {
      modeProducts = modeProducts.filter(p => productMatchesBrand(p, brand));
    }
    if (vendorId) {
      modeProducts = vendorId === '__main__'
        ? modeProducts.filter(p => !p.VENDOR_ID)
        : modeProducts.filter(p => p.VENDOR_ID === vendorId);
    } else if (!includeVendorProducts) {
      modeProducts = modeProducts.filter(p => {
        if (p.isVendorProduct === true || p.IS_VENDOR_PRODUCT === true) return false;
        const vid = p.VENDOR_ID || p.vendorId;
        if (vid && vid !== '__MAIN__' && vid !== 'carlitos' && vid !== 'importadora-carlitos' && vid !== 'importadora_carlitos') return false;
        const sid = p.SELLERID || p.sellerId;
        if (sid && sid !== '__MAIN__' && sid !== 'carlitos' && sid !== 'importadora-carlitos' && sid !== 'importadora_carlitos') return false;
        return true;
      });
    }

    // /productos solo necesita la lista ordenada para construir el catálogo
    // local. Este camino evita recorrer otra vez todo el catálogo para contar
    // categorías y calcular rangos de precio que el iframe no consume.
    if (minimal) {
      modeProducts.sort((a, b) => getProductNewestTimestamp(b) - getProductNewestTimestamp(a));
      return NextResponse.json({
        products: modeProducts.slice(offset, offset + limit),
        total: modeProducts.length,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600'
        }
      });
    }

    // Calculate Category, Subcategory and SubSubcategory Counts (across all active products in DB)
    const categoryCounts: Record<string, number> = {};
    const subcategoryCounts: Record<string, number> = {};
    const subSubcategoryCounts: Record<string, number> = {};
    modeProducts.forEach(p => {
      if (p.CATEGORYID) {
        categoryCounts[p.CATEGORYID] = (categoryCounts[p.CATEGORYID] || 0) + 1;
      }
      if (p.SUBCATEGORYID) {
        subcategoryCounts[p.SUBCATEGORYID] = (subcategoryCounts[p.SUBCATEGORYID] || 0) + 1;
      }
      if (p.SUBSUBCATEGORYID) {
        subSubcategoryCounts[p.SUBSUBCATEGORYID] = (subSubcategoryCounts[p.SUBSUBCATEGORYID] || 0) + 1;
      }
    });

    // Filter by category and search parameters (Except Price Range to compute price slider dynamically)
    let filtered = modeProducts;
    if (categoryId) {
      filtered = filtered.filter(p => p.CATEGORYID === categoryId);
    }
    if (subcategoryId) {
      filtered = filtered.filter(p => p.SUBCATEGORYID === subcategoryId);
    }
    if (subSubcategoryId) {
      filtered = filtered.filter(p => p.SUBSUBCATEGORYID === subSubcategoryId);
    }
    // Filtro server-side por marca (BRAND o inferida del nombre): así la
    // paginación, el total y el rango de precios reflejan solo la marca pedida
    if (brand) {
      filtered = filtered.filter(p => productMatchesBrand(p, brand));
    }
    if (ofertasOnly) {
      filtered = filtered.filter(p =>
        activeOffers.includes(p.$id) ||
        (p.CURRENTPRICE && p.CURRENTPRICE > 0 && p.CURRENTPRICE < (p.PRICE || 0))
      );
    }
    if (apurateOnly) {
      filtered = filtered.filter(p => {
        const qty = Number(p.STOCK ?? (p as any).stock ?? 0);
        return qty >= 6 && qty <= 18;
      });
    }
    if (tag) {
      filtered = filtered.filter(p => {
        const pTags = !p.TAGS ? [] : typeof p.TAGS === 'string' ? (p.TAGS as string).split(',').map(t => t.trim()) : (p.TAGS as string[]);
        return pTags.some(t => t.toLowerCase() === tag.toLowerCase());
      });
    }
    if (search) {
      const normalizeText = (text: string) => 
        text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, "").toLowerCase();
      
      const qTokens = normalizeText(search).trim().split(/\s+/).filter(Boolean);
      
      if (qTokens.length > 0) {
        filtered = filtered.filter(p => {
          const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
          const pTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
          const pSku = getSkuFromFeatures(pFeatures, pTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
          
          const searchSpace = normalizeText(`${p.NAME} ${p.DESCRIPTION || ''} ${pSku}`);
          
          // Must contain ALL tokens (AND logic)
          return qTokens.every(token => searchSpace.includes(token));
        });
      }
    }

    // Calculate dynamic price range (min/max price matching current category/search criteria)
    const displayPrices = filtered.map(p => priceOf(p)).filter(price => price > 0);
    const minPrice = displayPrices.length > 0 ? Math.floor(Math.min(...displayPrices)) : 0;
    const maxPrice = displayPrices.length > 0 ? Math.ceil(Math.max(...displayPrices)) : 0;

    // Apply Price Range filter
    if (priceMin !== undefined && priceMax !== undefined) {
      filtered = filtered.filter(p => {
        const price = priceOf(p);
        return price >= priceMin && price <= priceMax;
      });
    }

    // Sort Products
    if (sortBy === 'newest') {
      filtered.sort((a, b) => getProductNewestTimestamp(b) - getProductNewestTimestamp(a));
    } else if (sortBy === 'updated') {
      filtered.sort((a, b) => {
        const timeA = new Date(a.$updatedAt || a.$createdAt).getTime();
        const timeB = new Date(b.$updatedAt || b.$createdAt).getTime();
        return timeB - timeA;
      });
    } else if (sortBy === 'price_asc') {
      filtered.sort((a, b) => priceOf(a) - priceOf(b));
    } else if (sortBy === 'price_desc') {
      filtered.sort((a, b) => priceOf(b) - priceOf(a));
    } else if (sortBy === 'stock_low') {
      filtered.sort((a, b) => {
        const stockA = Number(a.STOCK ?? (a as any).stock ?? 0);
        const stockB = Number(b.STOCK ?? (b as any).stock ?? 0);
        return stockA - stockB;
      });
    } else if (sortBy === 'stock_high') {
      filtered.sort((a, b) => {
        const stockA = Number(a.STOCK ?? (a as any).stock ?? 0);
        const stockB = Number(b.STOCK ?? (b as any).stock ?? 0);
        return stockB - stockA;
      });
    }

    // Calculate all available tags in the current filtered set
    const allTags = Array.from(new Set(filtered.flatMap(p => {
      if (!p.TAGS) return [];
      if (typeof p.TAGS === 'string') return (p.TAGS as string).split(',').map(t => t.trim()).filter(Boolean);
      return (p.TAGS as string[]).filter(Boolean);
    }))).sort();

    // Count products with CURRENTPRICE offer (set from por-unidad admin)
    const cpOfferCount = allProducts.filter(p =>
      p.CURRENTPRICE && p.CURRENTPRICE > 0 && p.CURRENTPRICE < (p.PRICE || 0)
    ).length;
    const totalOfferCount = Math.max(cpOfferCount, activeOffers.length);

    const apurateCount = allProducts.filter(p => {
      const qty = Number(p.STOCK ?? (p as any).stock ?? 0);
      return qty >= 6 && qty <= 18;
    }).length;

    // Sliced pagination
    const total = filtered.length;
    const paginatedProducts = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      products: paginatedProducts,
      total,
      priceRange: [minPrice, maxPrice],
      categoryCounts,
      subcategoryCounts,
      subSubcategoryCounts,
      allTags,
      offerCount: totalOfferCount,
      apurateCount,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600'
      }
    });

  } catch (error: any) {
    console.error('[API public-data/products] Error:', error);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo. Intenta de nuevo.', products: [] }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' },
    });
  }
}
