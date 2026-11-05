import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Product } from '@/types';
import { getSkuFromFeatures } from '@/lib/product-features';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice } from '@/lib/apertura-promo';
import { productMatchesBrand } from '@/lib/brands';
import { getProductNewestTimestamp } from '@/lib/product-sort-date';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface UseProductsParams {
  categoryId?: string;
  subcategoryId?: string;
  subSubcategoryId?: string;
  sortBy?: string;
  search?: string;
  tag?: string;
  brand?: string;
  vendorId?: string;
  priceMin?: number;
  priceMax?: number;
  ofertasOnly?: boolean;
  apurateOnly?: boolean;
  catalogMode?: 'retail' | 'paquetes' | 'embalajes';
  // Opt-in: real server-side pagination (10/page) via useSWRInfinite.
  // When false (default) the hook keeps the legacy behaviour of downloading
  // every product once and filtering/sorting/slicing client-side — required by
  // consumers that need allProducts (carousels) or multi-mode client filters.
  serverPaginated?: boolean;
  pageSize?: number;
}

export function useProductsCache({
  categoryId,
  subcategoryId,
  subSubcategoryId,
  sortBy = 'newest',
  search,
  tag,
  brand,
  vendorId,
  priceMin,
  priceMax,
  ofertasOnly,
  apurateOnly,
  catalogMode,
  serverPaginated = false,
  pageSize = 10
}: UseProductsParams) {
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [page, setPage] = useState(1);

  const { settings: apertura } = useAperturaPromotion();

  const [isMinWaitDone, setIsMinWaitDone] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);

    // Premium UX: Ensure minimum loader time so Lottie has time to load and play
    const t = setTimeout(() => setIsMinWaitDone(true), 1200);

    return () => {
      window.removeEventListener('resize', check);
      clearTimeout(t);
    };
  }, []);

  const limit = isMobile ? 50 : 100;

  // ---------------------------------------------------------------------------
  // Build the shared filter query string used by the server-paginated mode.
  // ---------------------------------------------------------------------------
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    if (subcategoryId) params.set('subcategoryId', subcategoryId);
    if (subSubcategoryId) params.set('subSubcategoryId', subSubcategoryId);
    if (sortBy) params.set('sortBy', sortBy);
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    if (brand) params.set('brand', brand);
    if (vendorId) params.set('vendorId', vendorId);
    if (priceMin !== undefined) params.set('priceMin', String(priceMin));
    if (priceMax !== undefined) params.set('priceMax', String(priceMax));
    if (ofertasOnly) params.set('ofertasOnly', 'true');
    if (apurateOnly) params.set('apurateOnly', 'true');
    if (catalogMode && catalogMode !== 'retail') params.set('mode', catalogMode);
    return params;
  }, [categoryId, subcategoryId, subSubcategoryId, sortBy, search, tag, brand, vendorId, priceMin, priceMax, ofertasOnly, apurateOnly, catalogMode]);

  // ===========================================================================
  // LEGACY MODE: download everything once, filter/sort/paginate client-side.
  // ===========================================================================
  // Global SWR Key: Fetch EVERYTHING exactly once per session (only when NOT paginated).
  const globalKey = (isClient && !serverPaginated) ? `/api/public-data/products?limit=10000` : null;

  const { data, error, isValidating, mutate } = useSWR(globalKey, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
    dedupingInterval: 86400000, // 24 hours deduping (essentially cached for the entire session)
  });

  // ===========================================================================
  // PAGINATED MODE: real server-side pagination (10/page) via useSWRInfinite.
  // ===========================================================================
  const getKey = useCallback(
    (pageIndex: number, previousPageData: any) => {
      if (!serverPaginated || !isClient) return null;
      // Stop when the previous page came back empty.
      if (previousPageData && (!previousPageData.products || previousPageData.products.length === 0)) return null;
      const params = buildParams();
      params.set('limit', String(pageSize));
      params.set('offset', String(pageIndex * pageSize));
      return `/api/public-data/products?${params.toString()}`;
    },
    [serverPaginated, isClient, buildParams, pageSize]
  );

  const {
    data: pages,
    error: infiniteError,
    size,
    setSize,
    isValidating: isInfiniteValidating,
    mutate: infiniteMutate,
  } = useSWRInfinite(getKey, fetcher, {
    revalidateOnFocus: false,
    revalidateFirstPage: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });

  // Reset pagination back to the first page whenever the filters change.
  useEffect(() => {
    if (serverPaginated) {
      setSize(1);
    } else {
      setPage(1);
    }
  }, [categoryId, subcategoryId, subSubcategoryId, search, tag, brand, sortBy, priceMin, priceMax, ofertasOnly, apurateOnly, catalogMode, serverPaginated, setSize]);

  // Keep loading true until both data arrives AND the minimum premium delay has passed
  const isLoadingInitialData = (!data && !error) || !isMinWaitDone;

  const processedData = useMemo(() => {
    if (!data || !data.products) {
      return {
        products: [] as Product[],
        total: 0,
        priceRange: [0, 0] as [number, number],
        categoryCounts: {} as Record<string, number>,
        subcategoryCounts: {} as Record<string, number>,
        subSubcategoryCounts: {} as Record<string, number>,
        allTags: [] as string[],
      };
    }

    let filtered: Product[] = [...data.products];
    const activeOffers = data.activeOffers || [];

    if (categoryId) {
      filtered = filtered.filter(p => p.CATEGORYID === categoryId);
    }
    if (subcategoryId) {
      filtered = filtered.filter(p => p.SUBCATEGORYID === subcategoryId);
    }
    if (subSubcategoryId) {
      filtered = filtered.filter(p => p.SUBSUBCATEGORYID === subSubcategoryId);
    }
    if (brand) {
      filtered = filtered.filter(p => productMatchesBrand(p, brand));
    }
    if (ofertasOnly) {
      filtered = filtered.filter(p =>
        (activeOffers.length > 0 && activeOffers.includes(p.$id)) ||
        (p.CURRENTPRICE && p.CURRENTPRICE > 0 && p.CURRENTPRICE < (p.PRICE || 0))
      );
    }
    if (apurateOnly) {
      filtered = filtered.filter(p => {
        const qty = Number(p.STOCK ?? (p as any).stock ?? 0);
        return qty >= 6 && qty <= 18;
      });
    }
    if (catalogMode === 'paquetes' || catalogMode === 'embalajes') {
      filtered = filtered.filter(p => {
        const qty = p.PACKQTY ? Number(p.PACKQTY) : 0;
        return !isNaN(qty) && qty > 1;
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
          return qTokens.every(token => searchSpace.includes(token));
        });
      }
    }

    // Calculate priceRange dynamically for the current mode
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    const modeProducts = data.products.filter((p: Product) => {
      if (catalogMode === 'paquetes' || catalogMode === 'embalajes') {
        const qty = p.PACKQTY ? Number(p.PACKQTY) : 0;
        return !isNaN(qty) && qty > 1;
      }
      return true;
    });

    // Calculate Category, Subcategory and SubSubcategory Counts dynamically for this catalog mode
    const categoryCounts: Record<string, number> = {};
    const subcategoryCounts: Record<string, number> = {};
    const subSubcategoryCounts: Record<string, number> = {};
    modeProducts.forEach((p: Product) => {
      if (p.ISACTIVE === false) return;
      if (brand && !productMatchesBrand(p, brand)) return;
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

    modeProducts.forEach((p: Product) => {
      let price = resolveProductDisplayPrice(p, apertura).displayPrice;
      if (catalogMode === 'embalajes') {
        price = p.WHOLESALEPRICE || p.PRICE;
      } else if (catalogMode === 'paquetes') {
        price = p.WHOLESALEPRICE || p.PRICE;
      }
      if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && p.PACKQTY) {
        price *= p.PACKQTY;
      }
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    });

    if (minPrice === Infinity) minPrice = 0;
    if (maxPrice === -Infinity) maxPrice = 0;
    const finalPriceRange: [number, number] = [minPrice, maxPrice];

    if (priceMin !== undefined && priceMax !== undefined) {
      filtered = filtered.filter(p => {
        let price = resolveProductDisplayPrice(p, apertura).displayPrice;
        if (catalogMode === 'embalajes') {
          price = p.WHOLESALEPRICE || p.PRICE;
        } else if (catalogMode === 'paquetes') {
          price = p.WHOLESALEPRICE || p.PRICE;
        }
        if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && p.PACKQTY) {
          price *= p.PACKQTY;
        }
        return price >= priceMin! && price <= priceMax!;
      });
    }

    if (sortBy === 'newest') {
      filtered.sort((a, b) => getProductNewestTimestamp(b as any) - getProductNewestTimestamp(a as any));
    } else if (sortBy === 'updated') {
      filtered.sort((a, b) => {
        const timeA = new Date(a.$updatedAt || a.$createdAt || 0).getTime();
        const timeB = new Date(b.$updatedAt || b.$createdAt || 0).getTime();
        return timeB - timeA;
      });
    } else if (sortBy === 'price_asc') {
      filtered.sort((a, b) => {
        let priceA = resolveProductDisplayPrice(a, apertura).displayPrice;
        let priceB = resolveProductDisplayPrice(b, apertura).displayPrice;
        if (catalogMode === 'embalajes') {
          priceA = a.WHOLESALEPRICE || a.PRICE;
          priceB = b.WHOLESALEPRICE || b.PRICE;
        } else if (catalogMode === 'paquetes') {
          priceA = a.WHOLESALEPRICE || a.PRICE;
          priceB = b.WHOLESALEPRICE || b.PRICE;
        }
        if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && a.PACKQTY) priceA *= a.PACKQTY;
        if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && b.PACKQTY) priceB *= b.PACKQTY;
        return priceA - priceB;
      });
    } else if (sortBy === 'price_desc') {
      filtered.sort((a, b) => {
        let priceA = resolveProductDisplayPrice(a, apertura).displayPrice;
        let priceB = resolveProductDisplayPrice(b, apertura).displayPrice;
        if (catalogMode === 'embalajes') {
          priceA = a.WHOLESALEPRICE || a.PRICE;
          priceB = b.WHOLESALEPRICE || b.PRICE;
        } else if (catalogMode === 'paquetes') {
          priceA = a.WHOLESALEPRICE || a.PRICE;
          priceB = b.WHOLESALEPRICE || b.PRICE;
        }
        if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && a.PACKQTY) priceA *= a.PACKQTY;
        if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && b.PACKQTY) priceB *= b.PACKQTY;
        return priceB - priceA;
      });
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

    const apurateCount = (data.products || []).filter((p: Product) => {
      if (p.ISACTIVE === false) return false;
      const qty = Number(p.STOCK ?? (p as any).stock ?? 0);
      return qty >= 6 && qty <= 18;
    }).length;

    return {
      products: filtered,
      total: filtered.length,
      priceRange: finalPriceRange,
      categoryCounts,
      subcategoryCounts,
      subSubcategoryCounts,
      allTags: data.allTags || [],
      apurateCount,
    };
  }, [data, categoryId, subcategoryId, subSubcategoryId, sortBy, search, tag, brand, priceMin, priceMax, ofertasOnly, apurateOnly, catalogMode, apertura]);

  const paginatedProducts = useMemo(() => {
    return processedData.products.slice(0, page * limit);
  }, [processedData.products, page, limit]);

  const hasMore = paginatedProducts.length < processedData.products.length;

  // ---------------------------------------------------------------------------
  // PAGINATED MODE derived values (server-side).
  // ---------------------------------------------------------------------------
  const pagProducts = useMemo(
    () => (pages || []).flatMap((pg: any) => (pg?.products || []) as Product[]),
    [pages]
  );
  const firstPage: any = pages?.[0];
  const lastPage: any = pages?.[pages.length - 1];
  const pagTotal: number = firstPage?.total || 0;
  const pagIsEmpty = (firstPage?.products?.length || 0) === 0;
  const pagReachingEnd =
    pagIsEmpty ||
    pagProducts.length >= pagTotal ||
    (!!lastPage && (lastPage.products?.length || 0) < pageSize);
  const pagLoadingInitial = !pages && !infiniteError;
  const pagLoadingMore =
    pagLoadingInitial ||
    (size > 0 && !!pages && typeof pages[size - 1] === 'undefined') ||
    (isInfiniteValidating && (pages?.length || 0) > 0);

  const loadMorePaginated = useCallback(() => {
    if (!pagReachingEnd) setSize(s => s + 1);
  }, [pagReachingEnd, setSize]);

  const loadMoreLegacy = useCallback(() => {
    if (hasMore) setPage(p => p + 1);
  }, [hasMore]);

  if (serverPaginated) {
    return {
      products: pagProducts,
      allProducts: undefined as Product[] | undefined,
      total: pagTotal,
      priceRange: (firstPage?.priceRange || [0, 0]) as [number, number],
      categoryCounts: (firstPage?.categoryCounts || {}) as Record<string, number>,
      subcategoryCounts: (firstPage?.subcategoryCounts || {}) as Record<string, number>,
      subSubcategoryCounts: (firstPage?.subSubcategoryCounts || {}) as Record<string, number>,
      allTags: (firstPage?.allTags || []) as string[],
      offerCount: (firstPage?.offerCount || 0) as number,
      apurateCount: (firstPage?.apurateCount || 0) as number,
      error: infiniteError,
      isLoadingInitialData: pagLoadingInitial,
      isLoadingMore: pagLoadingMore,
      isReachingEnd: pagReachingEnd,
      loadMore: loadMorePaginated,
      isMobile,
      mutate: infiniteMutate,
    };
  }

  return {
    products: paginatedProducts,
    allProducts: processedData.products,
    total: processedData.total,
    priceRange: processedData.priceRange,
    categoryCounts: processedData.categoryCounts,
    subcategoryCounts: processedData.subcategoryCounts,
    subSubcategoryCounts: processedData.subSubcategoryCounts,
    allTags: processedData.allTags,
    offerCount: (data?.offerCount || 0) as number,
    apurateCount: processedData.apurateCount,
    error,
    isLoadingInitialData,
    isLoadingMore: isValidating && isLoadingInitialData,
    isReachingEnd: !hasMore,
    loadMore: loadMoreLegacy,
    isMobile,
    mutate
  };
}

export async function invalidateGlobalProductsCache() {
  try {
    // Coalescido: evita reconstruir los cachés del servidor en cada guardado
    const { requestProductsRevalidate } = await import('@/lib/cache');
    requestProductsRevalidate();
    const { mutate } = require('swr');
    await mutate(
      (key: string) => typeof key === 'string' && key.startsWith('/api/public-data/products'),
      undefined,
      { revalidate: true }
    );
  } catch (e) {
    console.error('Error invalidating cache', e);
  }
}
