'use client';

import { useEffect, useState, useCallback, useMemo, Suspense, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { Search, Grid3x3, List, ShoppingCart, X, SlidersHorizontal, Sparkles, ChevronDown } from 'lucide-react';
import AnimHeart from '@/components/AnimHeart';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, TIMED_OFFERS_COLLECTION, formatPrice } from '@/lib/db';
import { normalizeProductImages, getProductImageUrl } from '@/lib/product-images';
import { cached, TTL } from '@/lib/cache';
import { Query } from '@/lib/db';
import { Product, Category, Subcategory } from '@/types';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuth } from '@/hooks/useAuth';
import ProductCardPreview from '@/components/ProductCardPreview';
import ImageZoomModal from '@/components/ImageZoomModal';
import ProductImageGallery, { getProductImages, ProductThumbnails } from '@/components/ProductImageGallery';
import ProductBadges from '@/components/ProductBadges';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice } from '@/lib/apertura-promo';
import AperturaDiscountBadge from '@/components/AperturaDiscountBadge';
import { getSkuFromFeatures } from '@/lib/product-features';
import { useProductsCache } from '@/hooks/useProductsCache';

// Helper movido a lib compartida (el API de products también lo usa para el
// filtro server-side); se re-exporta para no romper imports existentes.
import { extractBrand, productMatchesBrand, HOUSE_BRAND } from '@/lib/brands';
export { extractBrand };

import GlobalCatalogLoader from '@/components/GlobalCatalogLoader';

const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';

const CATEGORY_COLORS = [
  { main: '#3b82f6', light: '#eff6ff', border: '#dbeafe', shadow: 'rgba(59,130,246,0.2)' },
  { main: '#10b981', light: '#ecfdf5', border: '#d1fae5', shadow: 'rgba(16,185,129,0.2)' },
  { main: '#f59e0b', light: '#fffbeb', border: '#fef3c7', shadow: 'rgba(245,158,11,0.2)' },
  { main: '#ef4444', light: '#fef2f2', border: '#fee2e2', shadow: 'rgba(239,68,68,0.2)' },
  { main: '#8b5cf6', light: '#f5f3ff', border: '#ede9fe', shadow: 'rgba(139,92,246,0.2)' },
  { main: '#ec4899', light: '#fdf2f8', border: '#fce7f3', shadow: 'rgba(236,72,153,0.2)' },
  { main: '#14b8a6', light: '#f0fdfa', border: '#ccfbf1', shadow: 'rgba(20,184,166,0.2)' },
  { main: '#f97316', light: '#fff7ed', border: '#ffedd5', shadow: 'rgba(249,115,22,0.2)' },
  { main: '#6366f1', light: '#eef2ff', border: '#e0e7ff', shadow: 'rgba(99,102,241,0.2)' },
  { main: '#84cc16', light: '#f7fee7', border: '#ecfccb', shadow: 'rgba(132,204,22,0.2)' },
];

function getCatColor(catId: string, categories: Category[]): typeof CATEGORY_COLORS[0] {
  const idx = categories.findIndex(c => c.$id === catId);
  if (idx === -1) return CATEGORY_COLORS[0];
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

export function ProductosInner({ lockCategoryId, lockBrand }: { lockCategoryId?: string; lockBrand?: string } = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const catParam = lockCategoryId || searchParams.get('categoria') || searchParams.get('cat') || '';
  const subcatParam = searchParams.get('subcat') || '';
  const qParam = searchParams.get('q') || '';
  const [mounted, setMounted] = useState(false);

  const updateCategoryUrl = (catId: string) => {
    if (lockCategoryId) return;
    const url = new URL(window.location.href);
    if (catId) {
      const cat = categories.find(c => c.$id === catId);
      const slug = cat?.name?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || catId;
      url.searchParams.set('categoria', slug);
    } else {
      url.searchParams.delete('categoria');
    }
    window.history.replaceState({}, '', url.toString());
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string; color: string }[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [search, setSearch] = useState(qParam);
  const [debouncedSearch, setDebouncedSearch] = useState(qParam);
  const [selectedCat, setSelectedCat] = useState(lockCategoryId || '');
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [allSubcategories, setAllSubcategories] = useState<Subcategory[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedSubcat, setSelectedSubcat] = useState('');
  const [selectedSubSubcat, setSelectedSubSubcat] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [activePriceRange, setActivePriceRange] = useState<[number, number] | null>(null);
  const [debouncedPriceRange, setDebouncedPriceRange] = useState<[number, number] | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [heroImgLoaded, setHeroImgLoaded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [sortDropdownPos, setSortDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const diff = currentScrollY - lastScrollY;

          // Only change state if scroll movement is significant (e.g. > 15px) to prevent layout shift flickers
          if (currentScrollY > 350) {
            if (diff > 15) {
              // Scrolling down significantly -> hide
              setIsScrolled(true);
            } else if (diff < -25) {
              // Scrolling up significantly -> show
              setIsScrolled(false);
            }
          } else if (currentScrollY <= 150) {
            // Near the top -> always show
            setIsScrolled(false);
          }
          
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isLoggedIn } = useAuth();
  const handleFavToggle = (productId: string, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!isLoggedIn) { window.location.href = '/login'; return; }
    toggleFavorite(productId);
  };
  const { settings: apertura } = useAperturaPromotion();
  
  const [activeOfferProductIds, setActiveOfferProductIds] = useState<string[]>([]);
  const [selectedOfertasOnly, setSelectedOfertasOnly] = useState(false);
  const [selectedApurateOnly, setSelectedApurateOnly] = useState(false);

  useEffect(() => {
    if (searchParams.get('ofertas') === 'true') {
      setSelectedOfertasOnly(true);
    }
    if (searchParams.get('apurate') === 'true') {
      setSelectedApurateOnly(true);
    }
    const sortParam = searchParams.get('sort');
    if (sortParam === 'price_asc' || sortParam === 'price_desc' || sortParam === 'newest' || sortParam === 'stock_low' || sortParam === 'stock_high') {
      setSortBy(sortParam);
    }
  }, [searchParams]);


  const handleCardImageClick = (p: Product, imgSrc?: string) => {
    const src = imgSrc || getProductImageUrl(p);
    if (src) {
      setZoomImage({ src, alt: p.NAME });
    }
  };

  // Load catalog categories, stores & offers once on mount
  useEffect(() => {
    fetch('/api/public-data/vendors').then(res => res.json()).then(data => setStores(data.vendors || [])).catch(() => {});
    const initLoad = async () => {
      try {
        const catOffRes = await fetch('/api/public-data/catalog');
        if (catOffRes.ok) {
          const data = await catOffRes.json();
          const cats = data.categories as Category[];
          const subs = (data.subcategories as Subcategory[]) || [];
          setCategories(cats);
          if (subs.length > 0) {
            setAllSubcategories(subs);
          }
          
          if (catParam && !selectedCat) {
            const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const found = cats.find(c => c.$id === catParam || c.name?.toLowerCase() === catParam.toLowerCase() || norm(c.name || '') === norm(catParam));
            if (found) setSelectedCat(found.$id);
          }

          if (subcatParam) {
            setSelectedSubcat(subcatParam);
          }

          const offerIds = (data.offers as any[] || []).map((d: any) => d.targetId).filter(Boolean);
          const cpOfferIds = (data.offerProductIds as string[] || []);
          setActiveOfferProductIds(Array.from(new Set([...offerIds, ...cpOfferIds])));
        }
      } catch (e) {
        console.error(e);
      }
    };
    initLoad();
  }, [catParam]);

  // Load subcategories separately when selectedCat changes
  useEffect(() => {
    const cidToUse = lockCategoryId || selectedCat;
    if (!cidToUse) {
      setSubcategories([]);
      return;
    }
    const loadSubcategories = async () => {
      try {
        const subRes = await fetch(`/api/public-data/subcategories?categoryId=${cidToUse}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubcategories(subData.subcategories as Subcategory[]);
        } else {
          setSubcategories([]);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadSubcategories();
  }, [selectedCat, lockCategoryId]);

  // Debounce search query changes
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Debounce price range slider changes
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedPriceRange(activePriceRange);
    }, 400);
    return () => clearTimeout(t);
  }, [activePriceRange]);

  // Use ref to read current active price range without breaking useCallback closure dependencies
  const activePriceRangeRef = useRef(activePriceRange);
  useEffect(() => {
    activePriceRangeRef.current = activePriceRange;
  }, [activePriceRange]);

  // Dynamic client-side loading and filtering via Cache Hook
  const {
    products: visibleProducts,
    total: totalProducts,
    priceRange,
    categoryCounts: serverCategoryCounts,
    subcategoryCounts: serverSubcategoryCounts,
    subSubcategoryCounts: serverSubSubcategoryCounts,
    allTags,
    offerCount,
    apurateCount,
    isLoadingInitialData: isLoading,
    isLoadingMore: isMoreLoading,
    isReachingEnd,
    loadMore
  } = useProductsCache({
    categoryId: lockCategoryId || selectedCat || undefined,
    subcategoryId: selectedSubcat || undefined,
    subSubcategoryId: selectedSubSubcat || undefined,
    sortBy,
    search: debouncedSearch || undefined,
    tag: selectedTag || undefined,
    brand: lockBrand || undefined,
    vendorId: selectedStore || undefined,
    priceMin: debouncedPriceRange ? debouncedPriceRange[0] : undefined,
    priceMax: debouncedPriceRange ? debouncedPriceRange[1] : undefined,
    ofertasOnly: selectedOfertasOnly,
    apurateOnly: selectedApurateOnly,
    serverPaginated: false
  });

  // El servidor ya filtra por marca (param brand del hook); este filtro queda
  // como respaldo y debe usar la MISMA regla (incluida la marca de la casa).
  const products = lockBrand
    ? visibleProducts.filter(p => productMatchesBrand(p as any, lockBrand))
    : visibleProducts;
  const filtered = products;
  const hasMore = !isReachingEnd; // No infinite scroll needed when locked to brand (all loaded)

  const lockedCategory = lockCategoryId ? categories.find(c => c.$id === lockCategoryId) : null;
  const categoryProductCount = lockCategoryId
    ? products.filter(p => p.CATEGORYID === lockCategoryId).length
    : products.length;

  useEffect(() => {
    if (priceRange && priceRange[0] !== 0 && priceRange[1] !== 0) {
      if (!activePriceRangeRef.current) {
        setActivePriceRange(priceRange as [number, number]);
      }
    }
  }, [priceRange]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isMoreLoading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [hasMore, isMoreLoading, loadMore]);

  const hasActiveFilters = !!(
    (selectedCat && selectedCat !== lockCategoryId) || selectedSubcat || selectedSubSubcat || selectedTag || selectedStore || search || selectedOfertasOnly || selectedApurateOnly
    || (activePriceRange && priceRange && (activePriceRange[0] !== priceRange[0] || activePriceRange[1] !== priceRange[1]))
  );

  const clearAllFilters = () => {
    setSelectedCat(lockCategoryId || '');
    setSelectedStore('');
    setSelectedSubcat('');
    setSelectedSubSubcat('');
    setSelectedTag('');
    setSearch('');
    setDebouncedSearch('');
    setSelectedOfertasOnly(false);
    setSelectedApurateOnly(false);
    if (priceRange && (priceRange[0] !== 0 || priceRange[1] !== 0)) {
      setActivePriceRange(priceRange as [number, number]);
      setDebouncedPriceRange(priceRange as [number, number]);
    }
  };

  const catCountMap = serverCategoryCounts;

  // Sidebar filters component (shared between desktop and mobile drawer)
  const FiltersSidebar = () => (
    <div className="pk-filters-panel" style={{ background: 'rgba(255,255,255,0.86)', borderRadius: 24, padding: 22, border: '1px solid rgba(255,237,213,0.95)', boxShadow: '0 14px 40px rgba(59,130,246,0.1)', backdropFilter: 'blur(14px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
          <SlidersHorizontal size={16} color="#3b82f6" /> Filtros
        </h3>
        {hasActiveFilters && (
          <button onClick={clearAllFilters} style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', border: 'none', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Precio — FIRST */}
      {priceRange[1] > 0 && activePriceRange && (
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Precio</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 10 }}>
            <span>{formatPrice(activePriceRange[0])}</span>
            <span style={{ color: '#9ca3af', fontWeight: 400 }}>–</span>
            <span>{formatPrice(activePriceRange[1])}</span>
          </div>
          <input type="range" min={priceRange[0]} max={priceRange[1]} value={activePriceRange[1]}
            onChange={e => setActivePriceRange([activePriceRange[0], Number(e.target.value)])}
            style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer', background: '#fff' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="number" value={activePriceRange[0]} onChange={e => setActivePriceRange([Number(e.target.value) || 0, activePriceRange[1]])}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #dbeafe', fontSize: 12, color: '#111', outline: 'none', fontFamily: 'inherit' }} placeholder="Min" />
            <input type="number" value={activePriceRange[1]} onChange={e => setActivePriceRange([activePriceRange[0], Number(e.target.value) || 0])}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #dbeafe', fontSize: 12, color: '#111', outline: 'none', fontFamily: 'inherit' }} placeholder="Max" />
          </div>
        </div>
      )}

      {/* Promociones y Urgencia */}
      <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid #dbeafe' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Promociones y Urgencia</p>
        <button onClick={() => setSelectedApurateOnly(!selectedApurateOnly)}
          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: selectedApurateOnly ? 700 : 500, color: selectedApurateOnly ? '#c2410c' : '#6b7280', background: selectedApurateOnly ? '#ffedd5' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 15 }}>🔥</span>
          <span style={{ flex: 1 }}>¡Apúrate que se acaban!</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: selectedApurateOnly ? '#c2410c' : '#9ca3af', background: selectedApurateOnly ? '#fed7aa' : '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>{apurateCount}</span>
        </button>
        {(activeOfferProductIds.length > 0 || offerCount > 0) && (
          <button onClick={() => setSelectedOfertasOnly(!selectedOfertasOnly)}
            style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: selectedOfertasOnly ? 700 : 500, color: selectedOfertasOnly ? '#3b82f6' : '#6b7280', background: selectedOfertasOnly ? '#eff6ff' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <span style={{ flex: 1 }}>Ofertas Temporales</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: selectedOfertasOnly ? '#dbeafe' : '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>{Math.max(activeOfferProductIds.length, offerCount)}</span>
          </button>
        )}
      </div>

      {/* Categorías — jerárquico colapsable */}
      <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid #dbeafe' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Categorías</p>
        <button onClick={() => { setSelectedCat(''); setSelectedSubcat(''); setSelectedSubSubcat(''); updateCategoryUrl(''); }}
          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: !selectedCat ? 700 : 500, color: !selectedCat ? '#3b82f6' : '#6b7280', background: !selectedCat ? '#eff6ff' : 'transparent', border: 'none', cursor: 'pointer', marginBottom: 4, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: !selectedCat ? '#3b82f6' : '#d1d5db', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Todas</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>{totalProducts}</span>
        </button>
        {categories.map(c => {
          const count = catCountMap[c.$id] || 0;
          if (count === 0) return null;
          const catSubs = allSubcategories.filter(sc => sc.categoryId === c.$id && !sc.parentSubcategoryId);
          const hasSubs = catSubs.length > 0;
          const isExpanded = expandedCats.has(c.$id);
          return (
            <div key={c.$id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 4 }}>
                {(() => { const cc = getCatColor(c.$id, categories); return (
                <button onClick={() => {
                  setSelectedCat(c.$id); setSelectedSubcat(''); setSelectedSubSubcat(''); updateCategoryUrl(c.$id);
                  if (hasSubs) { setExpandedCats(prev => { const n = new Set(prev); n.has(c.$id) ? n.delete(c.$id) : n.add(c.$id); return n; }); }
                }}
                  style={{ flex: 1, textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: selectedCat === c.$id ? 700 : 500, color: selectedCat === c.$id ? cc.main : '#6b7280', background: selectedCat === c.$id ? cc.light : 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedCat === c.$id ? cc.main : '#d1d5db', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: selectedCat === c.$id ? cc.border : '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>{count}</span>
                </button>
                ); })()}
                {hasSubs && (
                  <button onClick={() => setExpandedCats(prev => { const n = new Set(prev); n.has(c.$id) ? n.delete(c.$id) : n.add(c.$id); return n; })}
                    style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}>
                    <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </button>
                )}
              </div>
              {hasSubs && isExpanded && (
                <div style={{ paddingLeft: 20, marginBottom: 6 }}>
                  {catSubs.map(sc => {
                    const scCount = serverSubcategoryCounts[sc.$id] || 0;
                    if (scCount === 0) return null;
                    const cc = getCatColor(c.$id, categories);
                    return (
                      <button key={sc.$id} onClick={() => { setSelectedCat(c.$id); setSelectedSubcat(sc.$id); setSelectedSubSubcat(''); }}
                        style={{ width: '100%', textAlign: 'left', padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: selectedSubcat === sc.$id ? 700 : 500, color: selectedSubcat === sc.$id ? cc.main : '#9ca3af', background: selectedSubcat === sc.$id ? cc.light : 'transparent', border: 'none', cursor: 'pointer', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: selectedSubcat === sc.$id ? cc.main : '#d1d5db', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{sc.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 999 }}>{scCount}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div style={{ paddingTop: 14, borderTop: '1px solid #dbeafe' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Etiquetas</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => setSelectedTag('')}
              style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: !selectedTag ? '#fff' : '#3b82f6', background: !selectedTag ? 'linear-gradient(135deg,#3b82f6,#3b82f6)' : '#eff6ff', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
              Todas
            </button>
            {allTags.slice(0, 20).map((tag: string) => (
              <button key={tag} onClick={() => setSelectedTag(tag)}
                style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: selectedTag === tag ? '#fff' : '#3b82f6', background: selectedTag === tag ? 'linear-gradient(135deg,#3b82f6,#3b82f6)' : '#eff6ff', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="pk-page" style={{ fontFamily: FF, minHeight: '100vh', position: 'relative' }}>
      <div className="pk-bg-fixed" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        {lockBrand?.toLowerCase() === 'sadoer' && <img className="pk-bg-image" src="https://sadoerskincare.com/wp-content/uploads/2026/03/sadoer-skincare-hero.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(4px) brightness(1.08) saturate(1.08)', transform: 'scale(1.15)', animation: 'pkBgFloat 20s ease-in-out infinite' }} />}
        <div style={{ position: 'absolute', inset: 0, background: lockBrand?.toLowerCase() === 'sadoer' ? 'radial-gradient(circle at 15% 10%,rgba(59,130,246,0.2),transparent 32%), linear-gradient(180deg,rgba(239,246,255,0.72) 0%,rgba(255,255,255,0.92) 100%)' : 'radial-gradient(circle at 15% 10%,rgba(59,130,246,0.16),transparent 32%), linear-gradient(180deg,rgba(239,246,255,0.72) 0%,rgba(255,255,255,0.92) 100%)' }} />
      </div>
      <div className="pk-products-container" style={{ position: 'relative', zIndex: 1, maxWidth: 1600, margin: '0 auto', padding: '32px 20px 60px' }}>
        {/* Hero header */}
        <div className="pk-hero-header" style={{ marginBottom: 24, borderRadius: 28, border: lockBrand?.toLowerCase() === 'sadoer' ? '1px solid #dbeafe' : '1px solid rgba(255,237,213,0.9)', boxShadow: '0 18px 50px rgba(59,130,246,0.12)', overflow: 'hidden', background: lockBrand?.toLowerCase() === 'sadoer' ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fff' }}>
          <div className="pk-hero-banner" style={{ position: 'relative' }}>
            {(!heroImgLoaded || (!lockedCategory?.iconUrl && !lockCategoryId)) && <div className="pk-hero-banner-skeleton" style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: heroImgLoaded ? 0 : 1, transition: 'opacity 0.4s ease' }} />}
            {lockedCategory?.iconUrl ? (
              <img className="pk-hero-banner-img" src={lockedCategory.iconUrl} alt={lockedCategory.name || 'Categoría'} onLoad={() => setHeroImgLoaded(true)} style={{ objectFit: 'contain', padding: 24, background: 'linear-gradient(135deg,#eff6ff,#fff)', position: 'relative', zIndex: 2, opacity: heroImgLoaded ? 1 : 0, transition: 'opacity 0.4s ease' }} />
            ) : lockCategoryId ? (
              <div className="pk-hero-banner-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#3b82f6,#3b82f6)', color: '#fff', fontSize: 56, fontWeight: 900, position: 'relative', zIndex: 2 }}>
                {(lockedCategory?.name || 'C').charAt(0).toUpperCase()}
              </div>
            ) : lockBrand?.toLowerCase() === 'sadoer' ? (
              <div className="pk-hero-banner-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', position: 'relative', zIndex: 2 }}>
                <img src="" alt="SADOER" style={{ height: 56, objectFit: 'contain', filter: 'none' }} onLoad={() => setHeroImgLoaded(true)} />
              </div>
            ) : (
              <img className="pk-hero-banner-img" src="https://kevincoco-official.com/cdn/shop/files/52f32db865885fc4a91bee12d6b70ff0.jpg?v=1763188428&width=2528" alt="Portada catálogo" onLoad={() => setHeroImgLoaded(true)} style={{ position: 'relative', zIndex: 2, opacity: heroImgLoaded ? 1 : 0, transition: 'opacity 0.4s ease' }} />
            )}
            {!lockedCategory?.iconUrl && !lockCategoryId && !lockBrand && (
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.58) 24%, rgba(255,255,255,0) 60%)' }} />
            )}
          </div>
          <div className="pk-hero-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div className="pk-hero-logo-wrap">
            {lockedCategory?.iconUrl && (
              <img src={lockedCategory.iconUrl} alt={lockedCategory.name} className="pk-hero-logo-img" />
            )}
          </div>
          <div className="pk-hero-text">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.92)', color: '#3b82f6', padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 800, marginBottom: 10, border: '1px solid #dbeafe' }}>
              <Sparkles size={13} /> {lockBrand?.toLowerCase() === 'sadoer' ? 'Distribuidor Oficial' : (lockCategoryId ? 'Categoría' : 'Nuestra tienda')}
            </div>
            <h1 className="pk-products-title" style={{ fontSize: 42, fontWeight: 950, color: '#111827', margin: 0, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
              {lockBrand?.toLowerCase() === 'sadoer' ? 'Colección SADOER' : (lockBrand || lockedCategory?.name || 'Productos')}
            </h1>
            <p className="pk-hero-subtitle" style={{ fontSize: 15, color: '#6b7280', margin: '8px 0 18px', maxWidth: 520, lineHeight: 1.55 }}>
              {lockBrand?.toLowerCase() === 'sadoer'
                ? 'Explora el catálogo oficial de skincare y cuidado facial Sadoer en Chile. Productos importados 100% auténticos.'
                : (lockCategoryId ? `Productos de la categoría ${lockedCategory?.name || ''}. Filtrá, ordená y comprá en un solo lugar.` : 'Descubrí nuestra selección de productos exclusivos')
              }
            </p>
            <div className="pk-hero-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ padding: '9px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.92)', border: '1px solid #dbeafe', boxShadow: '0 4px 14px rgba(59,130,246,0.15)' }}>
                <span style={{ display: 'block', fontSize: 18, fontWeight: 900, color: '#3b82f6' }}>{totalProducts}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Productos</span>
              </div>
              {!lockCategoryId && (
              <div style={{ padding: '9px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.92)', border: '1px solid #dbeafe', boxShadow: '0 4px 14px rgba(59,130,246,0.15)' }}>
                <span style={{ display: 'block', fontSize: 18, fontWeight: 900, color: '#3b82f6' }}>{Object.values(serverCategoryCounts || {}).filter(c => c > 0).length}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Categorías</span>
              </div>
              )}
              {lockCategoryId && (
                <Link href="/productos" style={{ padding: '9px 14px', borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe', fontSize: 12, fontWeight: 700, color: '#3b82f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                  Ver catálogo completo
                </Link>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Top toolbar */}
        <div className={`pk-toolbar ${isScrolled ? 'pk-toolbar-scrolled' : ''}`} style={{ position: 'sticky', top: 10, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, padding: 12, borderRadius: 22, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(229, 231, 235, 0.9)', backdropFilter: 'blur(16px)', boxShadow: 'rgba(59,130,246,0.1) 0px 10px 34px' }}>
          
          {/* Row 1: Search + Filters (Mobile next to Search, Desktop full flex) */}
          <div style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center' }}>
            <div className={`pk-toolbar-search ${searchFocused ? 'pk-search-expanded' : ''}`} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#3b82f6' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                style={{ width: '100%', padding: '13px 38px 13px 42px', borderRadius: 16, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, color: '#111', outline: 'none', boxShadow: '0 2px 8px rgba(59,130,246,0.05)', fontFamily: 'inherit', transition: 'all 0.2s', minWidth: 0 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.1)'; setSearchFocused(true); }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.05)'; setSearchFocused(false); }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: '#f8f9fa', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#3b82f6' }}><X size={14} /></button>}
            </div>

            <div style={{ ...(searchFocused ? { display: 'none' } : {}) }}>
            <button type="button" onClick={() => setMobileFiltersOpen(true)} className="pk-filters-btn pk-mobile-only animate-fade-in"
              style={{ display: 'none', alignItems: 'center', gap: 6, padding: '12px 14px', borderRadius: 16, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 700, color: '#3b82f6', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <SlidersHorizontal size={15} /> Filtros{hasActiveFilters ? ' •' : ''}
            </button>
            </div>
          </div>

          {/* Tiendas — filtro principal antes de categorías */}
          {!lockBrand && (
            <div className="pk-h-scroll" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', overflowX: 'auto', padding: '8px 0 2px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: '#6b7280', marginRight: 2 }}>Tiendas</span>
              {[{ id: '', name: 'Todas', color: '#3b82f6' }, { id: '__main__', name: 'Importadora Carlitos', color: '#f59e0b' }, ...stores].map(store => {
                const active = selectedStore === store.id;
                return <button key={store.id || 'all-stores'} type="button" onClick={() => { setSelectedStore(store.id); setSelectedCat(''); setSelectedSubcat(''); setSelectedSubSubcat(''); updateCategoryUrl(''); }} style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, border: `1px solid ${active ? store.color : '#e5e7eb'}`, background: active ? `${store.color}16` : '#fff', color: active ? store.color : '#6b7280', fontSize: 12, fontWeight: active ? 800 : 600, cursor: 'pointer', transition: 'all .2s' }}>{store.id === '__main__' ? <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, marginRight: 4, borderRadius: '50%', background: '#fef3c7', color: '#92400e', fontSize: 8, fontWeight: 900, verticalAlign: 'middle' }}>IC</span> : store.id ? '\uD83C\uDFEA ' : ''}{store.name}</button>;
              })}
            </div>
          )}

          {/* Row 2: Categories Horizontal Scroll on Mobile only */}
          {!lockCategoryId && (
            <div style={{ ...(searchFocused ? { display: 'none' } : {}), minWidth: 0, width: '100%' }}>
            <div className="pk-mobile-only pk-categories-scroll-wrap" style={{ display: 'none', width: '100%', overflowX: 'auto', gap: 10, padding: '4px 0 0', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', overscrollBehavior: 'contain', borderTop: '1px solid rgba(229,231,235,0.4)', paddingTop: 10, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', alignItems: 'center', minWidth: 0 }}
              onWheel={(e) => {
                const el = e.currentTarget;
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  el.scrollLeft += e.deltaY;
                  e.preventDefault();
                }
              }}
            >
              <button
                onClick={() => { setSelectedCat(''); setSelectedSubcat(''); updateCategoryUrl(''); }}
                style={{
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  marginRight: 8,
                  padding: '8px 16px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: !selectedCat ? 'linear-gradient(135deg,#3b82f6,#3b82f6)' : '#fff',
                  color: !selectedCat ? '#fff' : '#6b7280',
                  border: '1px solid ' + (!selectedCat ? 'transparent' : '#e5e7eb'),
                  cursor: 'pointer',
                  boxShadow: !selectedCat ? '0 4px 10px rgba(59,130,246,0.2)' : 'none',
                  fontFamily: 'inherit'
                }}
              >
                Todos
              </button>
              {categories.map(c => {
                const count = catCountMap[c.$id] || 0;
                if (count === 0) return null;
                const cc = getCatColor(c.$id, categories);
                return (
                  <button
                    key={c.$id}
                    onClick={() => { setSelectedCat(c.$id); setSelectedSubcat(''); updateCategoryUrl(c.$id); }}
                    style={{
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      marginRight: 8,
                      padding: '8px 16px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      background: selectedCat === c.$id ? `linear-gradient(135deg,${cc.main},${cc.main})` : '#fff',
                      color: selectedCat === c.$id ? '#fff' : '#6b7280',
                      border: '1px solid ' + (selectedCat === c.$id ? 'transparent' : '#e5e7eb'),
                      cursor: 'pointer',
                      boxShadow: selectedCat === c.$id ? `0 4px 10px ${cc.shadow}` : 'none',
                      fontFamily: 'inherit'
                    }}
                  >
                    {c.name} ({count})
                  </button>
                );
              })}
            </div>
            </div>
          )}

          {/* Row 3 (Desktop only or collapsed on scroll on mobile) */}
          <div className="pk-toolbar-actions" style={{ width: '100%', ...(searchFocused ? { display: 'none' } : {}) }}>
            {/* Selector de Categorías en Toolbar */}
          {!lockCategoryId && (
            <div className="pk-toolbar-select-wrap pk-desktop-only" style={{ position: 'relative' }}>
              <select
                value={selectedCat}
                onChange={e => { setSelectedCat(e.target.value); setSelectedSubcat(''); updateCategoryUrl(e.target.value); }}
                style={{
                  padding: '12px 34px 12px 16px',
                  borderRadius: 14,
                  border: '1.5px solid #e5e7eb',
                  background: '#fff',
                  fontSize: 13,
                  color: '#111',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  outline: 'none',
                  minWidth: 160,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => (
                  <option key={c.$id} value={c.$id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#3b82f6', pointerEvents: 'none' }} />
            </div>
          )}

          {/* Selector de Subcategorías en Toolbar */}
          {selectedCat && subcategories.length > 0 && (
            <div className="pk-toolbar-select-wrap pk-desktop-only" style={{ position: 'relative' }}>
              <select
                value={selectedSubcat}
                onChange={e => setSelectedSubcat(e.target.value)}
                style={{
                  padding: '12px 34px 12px 16px',
                  borderRadius: 14,
                  border: '1.5px solid #e5e7eb',
                  background: '#fff',
                  fontSize: 13,
                  color: '#111',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  outline: 'none',
                  minWidth: 160,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
              >
                <option value="">Todas las subcategorías</option>
                {subcategories.map(sc => (
                  <option key={sc.$id} value={sc.$id}>{sc.name}</option>
                ))}
              </select>
              <ChevronDown size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#3b82f6', pointerEvents: 'none' }} />
            </div>
          )}

          <button type="button" onClick={() => setMobileFiltersOpen(true)} className="pk-filters-btn pk-desktop-only"
            style={{ alignItems: 'center', gap: 7, padding: '12px 16px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 700, color: '#3b82f6', cursor: 'pointer', fontFamily: 'inherit' }}>
            <SlidersHorizontal size={15} /> Filtros{hasActiveFilters ? ' •' : ''}
          </button>

          <div className="pk-sort-wrap" style={{ position: 'relative', ...(searchFocused ? { display: 'none' } : {}) }}>
            <button ref={sortBtnRef} onClick={(e) => { e.stopPropagation();
                if (!sortDropdownOpen && sortBtnRef.current) {
                  const rect = sortBtnRef.current.getBoundingClientRect();
                  setSortDropdownPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
                }
                setSortDropdownOpen(!sortDropdownOpen);
              }}
              className="pk-sort-btn" style={{ padding: '12px 38px 12px 16px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, color: '#111', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', outline: 'none', minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {sortBy === 'newest' ? 'Más recientes' : sortBy === 'price_asc' ? '↑ Precio: menor a mayor' : sortBy === 'price_desc' ? '↓ Precio: mayor a menor' : sortBy === 'stock_low' ? '🔥 Próximos a agotarse' : sortBy === 'stock_high' ? '📦 Mayor stock' : 'Ordenar'}
              <ChevronDown size={15} style={{ color: '#3b82f6', transition: 'transform 0.2s', transform: sortDropdownOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {sortDropdownOpen && sortDropdownPos && mounted && createPortal(
              <>
                <div onClick={() => setSortDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99998, background: 'transparent' }} />
                <div style={{ position: 'fixed', top: sortDropdownPos.top, left: sortDropdownPos.left, width: sortDropdownPos.width, background: '#fff', borderRadius: 14, border: '1.5px solid #e5e7eb', boxShadow: '0 10px 30px rgba(59,130,246,0.15)', zIndex: 99999, overflow: 'hidden' }}>
                  <button onClick={(e) => { e.stopPropagation(); setSortBy('newest'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '10px 14px', background: sortBy === 'newest' ? '#f8f9fa' : 'transparent', color: sortBy === 'newest' ? '#3b82f6' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'newest' ? 700 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    Más recientes
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setSortBy('price_asc'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '10px 14px', background: sortBy === 'price_asc' ? '#f8f9fa' : 'transparent', color: sortBy === 'price_asc' ? '#3b82f6' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'price_asc' ? 700 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    &uarr; Precio: menor a mayor
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setSortBy('price_desc'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '10px 14px', background: sortBy === 'price_desc' ? '#f8f9fa' : 'transparent', color: sortBy === 'price_desc' ? '#3b82f6' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'price_desc' ? 700 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    &darr; Precio: mayor a menor
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setSortBy('stock_low'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '10px 14px', background: sortBy === 'stock_low' ? '#fff7ed' : 'transparent', color: sortBy === 'stock_low' ? '#ea580c' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'stock_low' ? 700 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    🔥 Pr&oacute;ximos a agotarse (Menor stock)
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setSortBy('stock_high'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '10px 14px', background: sortBy === 'stock_high' ? '#f0fdf4' : 'transparent', color: sortBy === 'stock_high' ? '#16a34a' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'stock_high' ? 700 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    📦 Mayor stock disponible
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>

          <div className="pk-view-toggle" style={{ display: 'flex', background: '#fff', borderRadius: 14, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}>
            <button onClick={() => setView('grid')} style={{ padding: '11px 13px', background: view === 'grid' ? '#f8f9fa' : 'transparent', color: view === 'grid' ? '#3b82f6' : '#9ca3af', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Grid3x3 size={16} /></button>
            <button onClick={() => setView('list')} style={{ padding: '11px 13px', background: view === 'list' ? '#f8f9fa' : 'transparent', color: view === 'list' ? '#3b82f6' : '#9ca3af', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><List size={16} /></button>
          </div>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="pk-filter-chips pk-h-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {selectedApurateOnly && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#ffedd5', color: '#c2410c', borderRadius: 999, fontSize: 12, fontWeight: 700, border: '1px solid #fed7aa' }}>
                🔥 ¡Apúrate que se acaban!
                <button onClick={() => setSelectedApurateOnly(false)} style={{ background: 'transparent', border: 'none', color: '#c2410c', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
            {selectedOfertasOnly && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: 999, fontSize: 12, fontWeight: 700, border: '1px solid #dbeafe' }}>
                ⚡ Ofertas Temporales
                <button onClick={() => setSelectedOfertasOnly(false)} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
            {selectedCat && categories.find(c => c.$id === selectedCat) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                {categories.find(c => c.$id === selectedCat)?.name}
                <button onClick={() => { setSelectedCat(''); setSelectedSubcat(''); updateCategoryUrl(''); }} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
            {selectedTag && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                #{selectedTag}
                <button onClick={() => setSelectedTag('')} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
            {search && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                "{search}"
                <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
          </div>
        )}

        <div className="pk-products-layout" style={{ display: 'flex', gap: 28 }}>
          {/* Desktop sidebar */}
          <aside className="pk-sidebar-desktop pk-desktop-only" style={{ width: 220, flexShrink: 0 }}>
            <div style={{ position: 'sticky', top: 20 }}>
              <FiltersSidebar />
            </div>
          </aside>

          {/* Products */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pk-result-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 14px', padding: '10px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.72)', border: '1px solid #dbeafe', backdropFilter: 'blur(10px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, fontWeight: 700 }}>
                  <span style={{ color: '#3b82f6', fontWeight: 900 }}>{totalProducts}</span> producto{totalProducts !== 1 ? 's' : ''} encontrado{totalProducts !== 1 ? 's' : ''}
                </p>
                {apurateCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedApurateOnly(!selectedApurateOnly)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 11px', borderRadius: 999, fontSize: 12, fontWeight: 800,
                      cursor: 'pointer',
                      border: selectedApurateOnly ? '1.5px solid #ea580c' : '1px solid #fed7aa',
                      background: selectedApurateOnly ? '#ea580c' : '#ffedd5',
                      color: selectedApurateOnly ? '#fff' : '#c2410c',
                      boxShadow: selectedApurateOnly ? '0 2px 8px rgba(234,88,12,0.3)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>🔥 ¡Apúrate que se acaban!</span>
                    <span style={{
                      background: selectedApurateOnly ? 'rgba(255,255,255,0.3)' : '#fed7aa',
                      color: selectedApurateOnly ? '#fff' : '#9a3412',
                      padding: '1px 6px', borderRadius: 999, fontSize: 11
                    }}>{apurateCount}</span>
                  </button>
                )}
              </div>
              {hasActiveFilters && (
                <button onClick={clearAllFilters} style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Limpiar todo
                </button>
              )}
            </div>

            {isLoading && products.length === 0 ? (
              <GlobalCatalogLoader />
            ) : products.length === 0 ? (
              <div className="pk-empty-state" style={{ textAlign: 'center', padding: '86px 20px', background: 'rgba(255,255,255,0.86)', borderRadius: 26, border: '1px solid #dbeafe', boxShadow: '0 14px 42px rgba(59,130,246,0.09)', backdropFilter: 'blur(14px)' }}>
                <div className="pk-empty-icon" style={{ width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 10px 28px rgba(59,130,246,0.15)' }}>
                  <ShoppingCart size={36} color="#3b82f6" />
                </div>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Sin resultados</p>
                <p style={{ fontSize: 14, color: '#6b7280', margin: '0 auto 18px', maxWidth: 360, lineHeight: 1.55 }}>No encontramos productos con esos filtros. Probá quitar alguno o buscar con otra palabra.</p>
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#3b82f6,#3b82f6)', color: '#fff', border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(59,130,246,0.25)', fontFamily: 'inherit' }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div style={{ position: 'relative', opacity: isLoading ? 0.6 : 1, transition: 'opacity 0.25s' }}>
                {isLoading && (
                  <div style={{ position: 'absolute', top: -10, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #3b82f6, #3b82f6, #3b82f6)', backgroundSize: '200% 100%', animation: 'pkShimmer 1.2s linear infinite', zIndex: 10, borderRadius: 999 }} />
                )}
                {view === 'grid' ? (
                  <div className="pk-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
                {filtered.map(p => {
                  const pricing = resolveProductDisplayPrice(p, apertura);
                  const price = pricing.displayPrice;
                  const hasDisc = pricing.hasDiscount;
                  const disc = pricing.discountPercent;
                  const fav = isFavorite(p.$id);
                  const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
                  const pTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
                  const cardSku = getSkuFromFeatures(pFeatures, pTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
                  const pBrand = p.BRAND || extractBrand(p.NAME) || HOUSE_BRAND;
                  const isSadoer = pBrand.toLowerCase() === 'sadoer';
                  const badgeBg = isSadoer ? '#e0f2fe' : '#f3f4f6';
                  const badgeColor = isSadoer ? '#1e40af' : '#4b5563';
                  return (
                    <ImageStateManager product={p} key={p.$id}>
                    {({ activeIndex, setActiveIndex, images }) => (
                    <div className="pk-card" style={{ background: '#faf9f7', borderRadius: 16, overflow: 'hidden', border: '1px solid #f0f0f0', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)', transition: 'box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease' }}>
                      <div className="pk-card-media-link" style={{ display: 'block', position: 'relative', cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}>
                        <div className="pk-card-image" style={{ position: 'relative', background: '#fff', overflow: 'hidden', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                          <ProductImageGallery product={p} alt={p.NAME} onImageClick={(imgSrc) => handleCardImageClick(p, imgSrc)} hideThumbnails activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} />
                          {p.PACKQTY != null && p.PACKQTY > 1 && (
                            <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, fontSize: 10, fontWeight: 800, color: '#1e40af', background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)' }}>{p.PACKQTY} un/paquete</span>
                          )}
                          {p.STOCK === 0 && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
                              <span style={{ padding: '6px 14px', background: '#fff', color: '#9ca3af', borderRadius: 999, fontSize: 12, fontWeight: 800, border: '1.5px solid #e5e7eb' }}>Sin stock</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="pk-card-body" style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', flex: 1, background: '#faf9f7' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {pBrand && pBrand !== HOUSE_BRAND && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: 999 }}>
                                {pBrand}
                              </span>
                            )}
                            <ProductBadges product={p} />
                          </div>
                          <button
                            type="button"
                            className="pk-card-fav"
                            aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            onClick={e => handleFavToggle(p.$id, e)}
                            style={{
                              width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(255,255,255,0.92)',
                              color: '#d979a8',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                            }}
                          >
                            <AnimHeart filled={fav} size={20} />
                          </button>
                        </div>
                        <Link prefetch={false} href={`/productos/${p.$id}`} style={{ textDecoration: 'none' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1f2937', margin: '0 0 2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 38, lineHeight: 1.4, transition: 'color 0.2s' }}>
                            {p.NAME}
                          </p>
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                          {price > 0 ? (
                            <>
                              <span className="pk-price" style={{ fontSize: 19, fontWeight: 800, color: hasDisc ? '#2563eb' : '#111', letterSpacing: '-0.02em' }}>{formatPrice(price)}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>al detalle</span>
                              {p.VENDOR_NAME && (p.VENDOR_IS_MAIN
                                ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🐱 {p.VENDOR_NAME}</span>
                                : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🏪 {p.VENDOR_NAME}</span>
                              )}
                              {hasDisc && pricing.originalPrice != null && <span className="pk-price-old" style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through', fontWeight: 500 }}>{formatPrice(pricing.originalPrice)}</span>}
                              {hasDisc && <AperturaDiscountBadge percent={disc} size="sm" />}
                              <ProductThumbnails images={images} activeIndex={activeIndex} onIndexChange={setActiveIndex} />
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Consultar precio</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <Link prefetch={false} href={`/productos/${p.$id}`} className="pk-add-btn"
                          style={{ flex: 1, padding: '10px 12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'filter 0.2s ease, transform 0.1s ease', boxShadow: '0 4px 14px rgba(59,130,246,0.18)', fontFamily: 'inherit', textDecoration: 'none' }}>
                          Ver detalles
                        </Link>
                        <button onClick={() => p.STOCK !== 0 && addItem(p)} disabled={p.STOCK === 0} className="pk-cart-btn"
                          style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: p.STOCK === 0 ? '#f3f4f6' : '#fff', color: p.STOCK === 0 ? '#9ca3af' : '#2563eb', fontSize: 12.5, fontWeight: 800, cursor: p.STOCK === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'filter 0.2s ease, transform 0.1s ease', boxShadow: p.STOCK === 0 ? 'none' : '0 2px 8px rgba(59,130,246,0.12)', fontFamily: 'inherit', flexShrink: 0 }}
                          aria-label="Agregar al carrito">
                          <ShoppingCart size={16} />
                        </button>
                        </div>
                      </div>
                    </div>
                    )}
                    </ImageStateManager>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.map(p => {
                  const pricing = resolveProductDisplayPrice(p, apertura);
                  const price = pricing.displayPrice;
                  const hasDisc = pricing.hasDiscount;
                  const disc = pricing.discountPercent;
                  const fav = isFavorite(p.$id);
                  const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
                  const pTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
                  const cardSku = getSkuFromFeatures(pFeatures, pTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
                  const pBrand = p.BRAND || extractBrand(p.NAME) || HOUSE_BRAND;
                  const isSadoer = pBrand.toLowerCase() === 'sadoer';
                  const badgeBg = isSadoer ? '#e0f2fe' : '#f3f4f6';
                  const badgeColor = isSadoer ? '#1e40af' : '#4b5563';

                  return (
                    <div key={p.$id} className="pk-card-list" style={{ position: 'relative', background: '#faf9f7', borderRadius: 16, border: '1px solid #f0f0f0', display: 'flex', gap: 16, padding: 14, transition: 'all 0.2s', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
                      {hasDisc && (
                        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 3 }}>
                          <AperturaDiscountBadge percent={disc} size="sm" />
                        </div>
                      )}
                      <div className="pk-card-list-media" style={{ position: 'relative', width: 110, borderRadius: 12, overflow: 'hidden', background: '#f5f4f2', flexShrink: 0 }}>
                        <ProductImageGallery product={p} alt={p.NAME} onImageClick={(imgSrc) => handleCardImageClick(p, imgSrc)} sizes="110px" compact />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          {cardSku && <span className="pk-card-sku" style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>SKU: {cardSku}</span>}
                          {pBrand && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeBg, padding: '1px 6px', borderRadius: 999 }}>
                              {pBrand}
                            </span>
                          )}
                          <ProductBadges product={p} />
                        </div>
                        <Link prefetch={false} href={`/productos/${p.$id}`} style={{ textDecoration: 'none' }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '0 0 2px' }}>{p.NAME}</p>
                        </Link>
                        <p className="pk-card-list-desc" style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{p.DESCRIPTION}</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          {price > 0 ? (
                            <>
                              <span className="pk-price" style={{ fontSize: 18, fontWeight: 800, color: hasDisc ? '#2563eb' : '#111' }}>{formatPrice(price)}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#1e40af', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>al detalle</span>
                              {p.VENDOR_NAME && (p.VENDOR_IS_MAIN
                                ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🐱 {p.VENDOR_NAME}</span>
                                : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🏪 {p.VENDOR_NAME}</span>
                              )}
                              {hasDisc && pricing.originalPrice != null && <span className="pk-price-old" style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(pricing.originalPrice)}</span>}
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Consultar precio</span>
                          )}
                        </div>
                      </div>
                      <div className="pk-card-list-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={() => setPreviewProduct(p)} title="Vista rápida"
                          style={{ width: 40, height: 40, borderRadius: '50%', background: '#eff6ff', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Search size={16} />
                        </button>
                        <button onClick={(e) => handleFavToggle(p.$id, e)} title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                          style={{ width: 40, height: 40, borderRadius: '50%', background: '#eff6ff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AnimHeart filled={fav} size={24} />
                        </button>
                        <button className="pk-list-cart-btn" onClick={() => p.STOCK !== 0 && addItem(p)} disabled={p.STOCK === 0} title="Agregar al carrito"
                          style={{ width: 40, height: 40, borderRadius: '50%', background: p.STOCK === 0 ? '#e5e7eb' : '#eff6ff', border: p.STOCK === 0 ? 'none' : '1.5px solid #dbeafe', color: p.STOCK === 0 ? '#9ca3af' : '#3b82f6', cursor: p.STOCK === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: p.STOCK === 0 ? 'none' : '0 2px 8px rgba(59,130,246,0.15)' }}>
                          <ShoppingCart size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
            <div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '32px 0', width: '100%' }}>
              {isMoreLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3b82f6', fontWeight: 600, fontSize: 14 }}>
                  <span style={{ display: 'inline-block', width: '18px', height: '18px', border: '2.5px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span>Cargando más productos...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile filters drawer */}
      {mounted && mobileFiltersOpen && createPortal(
        <>
          <div className="pk-filters-backdrop pk-mobile-only" onClick={() => setMobileFiltersOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 10000 }} />
          <div className="pk-filters-drawer pk-mobile-only">
            <div className="pk-filters-drawer-handle" />
            <div className="pk-filters-drawer-header">
              <h2>Filtros</h2>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Cerrar filtros"><X size={18} /></button>
            </div>
            <FiltersSidebar />
            <button type="button" className="pk-filters-apply" onClick={() => setMobileFiltersOpen(false)}>
              Ver {totalProducts} producto{totalProducts !== 1 ? 's' : ''}
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Quick View Modal */}
      {previewProduct && <ProductCardPreview product={previewProduct} onClose={() => setPreviewProduct(null)} />}

      {/* Image Zoom Modal */}
      {zoomImage && <ImageZoomModal src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />}

      <style>{`
        /* Card Hover/Touch Reset: completely disable any hover state changes */
        .pk-card, .pk-card *, .pk-card-list, .pk-card-list * {
          -webkit-tap-highlight-color: transparent !important;
          -webkit-focus-ring-color: transparent !important;
          outline: none !important;
        }

        /* Fix: product card images must be square and fill container on PC */
        .pk-card .pk-card-image {
          aspect-ratio: 1 / 1 !important;
          width: 100% !important;
        }
        .pk-card .pk-card-image img {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }

        .pk-card a, .pk-card-list a {
          outline: none !important;
          text-decoration: none !important;
        }

        .pk-card:hover, .pk-card-list:hover {
          transform: none !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) !important;
          border-color: #f0f0f0 !important;
        }

        .pk-card:hover *, .pk-card-list:hover * {
          transform: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
          outline: none !important;
        }

        .pk-card:hover .pk-card-sku,
        .pk-card-list:hover .pk-card-sku,
        .pk-card .pk-card-sku:hover,
        .pk-card-list .pk-card-sku:hover {
          color: #9ca3af !important;
        }

        .pk-card:hover .pk-price-old,
        .pk-card-list:hover .pk-price-old,
        .pk-card .pk-price-old:hover,
        .pk-card-list .pk-price-old:hover {
          color: #9ca3af !important;
        }

        /* Direct and parent-hover resets for badges to prevent any change or highlights */
        .pk-card:hover .pk-badge,
        .pk-card-list:hover .pk-badge,
        .pk-card .pk-badge:hover,
        .pk-card .pk-badge:active,
        .pk-card .pk-badge:focus,
        .pk-card-list .pk-badge:hover,
        .pk-card-list .pk-badge:active,
        .pk-card-list .pk-badge:focus,
        .pk-card:hover .apertura-disc-badge,
        .pk-card-list:hover .apertura-disc-badge,
        .pk-card .apertura-disc-badge:hover,
        .pk-card .apertura-disc-badge:active,
        .pk-card .apertura-disc-badge:focus,
        .pk-card-list .apertura-disc-badge:hover,
        .pk-card-list .apertura-disc-badge:active,
        .pk-card-list .apertura-disc-badge:focus {
          box-shadow: none !important;
          outline: none !important;
          border: none !important;
          transform: none !important;
          text-shadow: none !important;
          opacity: 1 !important;
        }
        .pk-card .apertura-disc-badge:hover,
        .pk-card-list .apertura-disc-badge:hover {
          background: linear-gradient(135deg, #3b82f6 0%, #3b82f6 50%, #2563eb 100%) !important;
          box-shadow: 0 2px 8px rgba(59,130,246,0.2), 0 0 0 1px rgba(255,255,255,0.35) inset !important;
        }

        @keyframes pkShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes pkBgFloat { 0%,100% { transform: scale(1.15) translateY(0); } 50% { transform: scale(1.18) translateY(-10px); } }
        @keyframes pkDrawerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

        .pk-page { background: #ffffff !important; }
        .pk-bg-fixed { display: none !important; }
        .pk-toolbar {
          position: -webkit-sticky !important;
          position: sticky !important;
          top: 86px !important;
          z-index: 20 !important;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pk-toolbar.pk-toolbar-scrolled {
          position: -webkit-sticky !important;
          position: sticky !important;
          top: 86px !important;
          z-index: 999 !important;
          background-color: rgba(255, 255, 255, 0.95) !important;
          box-shadow: 0 10px 30px rgba(59,130,246,0.18) !important;
          border-radius: 18px !important;
          padding: 8px 12px !important;
        }
        
        .pk-toolbar-search {
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .pk-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          transition: opacity 0.3s ease, max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease;
          max-height: 150px;
          opacity: 1;
          transform: translateY(0);
          overflow: hidden;
        }
        
        .pk-toolbar.pk-toolbar-scrolled .pk-toolbar-actions {
          opacity: 0;
          max-height: 0 !important;
          transform: translateY(-10px);
          pointer-events: none;
        }
        .pk-desktop-only { display: block; }
        .pk-mobile-only { display: none; }
        .pk-filters-btn { display: none; }

        .pk-h-scroll { scrollbar-width: none; -ms-overflow-style: none; touch-action: pan-x pan-y pinch-zoom; -webkit-overflow-scrolling: touch; }
        .pk-h-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }

        .pk-filters-drawer {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 999;
          max-height: min(88vh, 720px); background: #fff;
          border-radius: 20px 20px 0 0; padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px));
          box-shadow: 0 -12px 40px rgba(0,0,0,0.18);
          display: flex; flex-direction: column; gap: 10px;
          animation: pkDrawerUp 0.32s cubic-bezier(0.16,1,0.3,1);
        }
        .pk-filters-drawer-handle { width: 40px; height: 4px; border-radius: 999px; background: #e5e7eb; margin: 4px auto 0; flex-shrink: 0; }
        .pk-filters-drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px 8px; flex-shrink: 0; }
        .pk-filters-drawer-header h2 { margin: 0; font-size: 17px; font-weight: 800; color: #111827; }
        .pk-filters-drawer-header button { width: 36px; height: 36px; border-radius: 50%; border: none; background: #eff6ff; color: #3b82f6; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pk-filters-drawer .pk-filters-panel { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; border-radius: 16px !important; box-shadow: none !important; margin: 0 !important; }
        .pk-filters-apply {
          flex-shrink: 0; width: 100%; padding: 14px; border: none; border-radius: 14px;
          background: linear-gradient(135deg,#3b82f6,#3b82f6); color: #fff;
          font-size: 14px; font-weight: 800; cursor: pointer; font-family: inherit;
          box-shadow: 0 6px 20px rgba(59,130,246,0.35);
        }


        .pk-hero-header { display: flex; flex-direction: column; padding: 0 !important; }
        .pk-hero-banner {
          position: relative; width: 100%; overflow: hidden;
          aspect-ratio: 2.4 / 1; min-height: 140px; max-height: 320px;
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
        }
        .pk-hero-banner-skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 37%, #f0f0f0 63%);
          background-size: 200% 100%;
          animation: pkShimmer 1.5s ease-in-out infinite;
        }
        .pk-hero-banner-img {
          width: 100%; height: 100%; display: block;
          object-fit: cover; object-position: center center;
        }
        .pk-hero-body {
          flex: 1; min-width: 0; display: flex; flex-direction: row-reverse;
          align-items: center; justify-content: space-between; gap: 24px;
        }
        .pk-hero-text { flex: 1; min-width: 0; }
        .pk-hero-logo-wrap {
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        }
        .pk-hero-logo-img {
          height: 148px; width: auto; max-width: min(240px, 42vw);
          object-fit: contain; display: block;
        }
        .pk-card-fav { display: flex; align-items: center; justify-content: center; }

        @media (hover: hover) and (pointer: fine) and (min-width: 769px) {
          .pk-card:hover .pk-card-actions { opacity: 1 !important; transform: translateX(-50%) translateY(0) !important; }
        }

        @media (max-width: 1024px) {
          .pk-products-layout { flex-direction: column !important; gap: 16px !important; }
          .pk-products-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 14px !important; }
          .pk-sidebar-desktop { display: none !important; }
          .pk-desktop-only { display: none !important; }
          .pk-mobile-only, .pk-filters-btn { display: flex !important; }
          .pk-search-hide { display: none !important; }
          .pk-toolbar-search.pk-search-expanded { flex: 1 1 100% !important; width: 100% !important; }
        }

        @media (max-width: 768px) {
          .pk-page { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
          .pk-products-container { padding: 12px 12px 48px !important; }
          .pk-hero-header { border-radius: 20px !important; margin-bottom: 16px !important; }
          .pk-hero-banner { aspect-ratio: 2.6 / 1 !important; min-height: 88px !important; max-height: 128px !important; }
          .pk-hero-banner-img { object-fit: cover !important; object-position: center 42% !important; }
          .pk-hero-body { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; padding: 14px 16px 16px !important; }
          .pk-hero-text { display: block !important; }
          .pk-products-title { font-size: 28px !important; }
          .pk-hero-subtitle { font-size: 13px !important; margin: 6px 0 12px !important; max-width: 100% !important; }
          .pk-hero-stats { gap: 8px !important; }
          .pk-hero-stats > div { padding: 8px 12px !important; border-radius: 12px !important; }
          .pk-hero-body { flex-direction: column !important; align-items: stretch !important; gap: 14px !important; }
          .pk-hero-logo-wrap { align-self: center !important; order: -1 !important; width: 100% !important; }
          .pk-hero-logo-img { height: 96px !important; max-width: min(220px, 78vw) !important; }
          
          /* Background performance optimization */
          .pk-bg-image { animation: none !important; transform: none !important; }

          /* Sticky toolbar: remove overrides to preserve user's inline styles */
          .pk-toolbar {
            position: -webkit-sticky !important;
            position: sticky !important;
            top: 54px !important;
            z-index: 999 !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          .pk-toolbar.pk-toolbar-scrolled {
            position: -webkit-sticky !important;
            position: sticky !important;
            top: 54px !important;
            z-index: 999 !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
          }
          .pk-toolbar-search {
            flex: 1 !important;
            min-width: 0 !important;
          }
          .pk-categories-scroll-wrap {
            display: flex !important;
            gap: 10px !important;
            overflow-x: auto !important;
            touch-action: pan-x pan-y !important;
            -webkit-overflow-scrolling: touch !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          .pk-categories-scroll-wrap > button {
            flex-shrink: 0 !important;
            margin-right: 6px !important;
          }
          .pk-categories-scroll-wrap::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          .pk-toolbar.pk-toolbar-scrolled .pk-categories-scroll-wrap {
            opacity: 0 !important;
            max-height: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            margin-top: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
          }

          .pk-search-hide {
            display: none !important;
          }
          .pk-toolbar-search.pk-search-expanded {
            flex: 1 1 100% !important;
            width: 100% !important;
          }

          .pk-filter-chips { margin-bottom: 14px !important; padding-bottom: 2px !important; }
          .pk-filter-chips span { flex-shrink: 0; font-size: 11px !important; }
          .pk-products-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
          .pk-card {
            border-radius: 0 0 18px 18px !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            background: #faf9f7 !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) !important;
            border: 1px solid #f0f0f0 !important;
            transition: border-color 0.25s ease, box-shadow 0.25s ease !important;
          }
          .pk-card-fav {
            display: flex !important;
            width: 28px !important;
            height: 28px !important;
            top: 6px !important;
            right: 6px !important;
            background: rgba(255, 255, 255, 0.9) !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.08) !important;
          }
          .pk-card-fav svg {
            width: 15px !important;
            height: 15px !important;
          }
          .pk-disc-badge {
            top: 6px !important;
            left: 6px !important;
            right: auto !important;
          }
          .pk-card-badges {
            top: auto !important;
            bottom: 6px !important;
            left: 6px !important;
          }
          .pk-card-badges span {
            font-size: 8px !important;
            padding: 1.5px 4px !important;
            border-radius: 3px !important;
          }
          .pk-card-actions--desktop { display: none !important; }
          
          .pk-card .pk-card-body { padding: 8px 8px 10px !important; }
          .pk-card .pk-card-body p { font-size: 11px !important; min-height: 28px !important; line-height: 1.3 !important; margin-bottom: 4px !important; }
          .pk-card .pk-price { font-size: 14px !important; }
          .pk-card .pk-add-btn { padding: 6px 8px !important; font-size: 10px !important; border-radius: 8px !important; margin-top: 6px !important; }
          .pk-card .pk-cart-btn { width: 32px !important; height: 32px !important; border-radius: 8px !important; }

          /* Redesigned horizontal list card on mobile */
          .pk-card-list {
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 10px !important;
            border-radius: 14px !important;
          }
          .pk-card-list > a {
            width: auto !important;
            height: auto !important;
            display: block !important;
          }
          .pk-card-list-media {
            width: 90px !important;
            height: 90px !important;
            border-radius: 10px !important;
            flex-shrink: 0 !important;
          }
          .pk-card-list-desc {
            display: none !important;
          }
          .pk-card-list-actions {
            display: flex !important;
            flex-direction: row !important;
            gap: 6px !important;
            align-self: flex-end !important;
            margin-top: 6px !important;
            padding: 0 !important;
            background: transparent !important;
          }
          .pk-card-list-actions button {
            width: 32px !important;
            height: 32px !important;
            border-radius: 50% !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: #f8f9fa !important;
            border: none !important;
          }
          .pk-card-list-actions button svg {
            width: 14px !important;
            height: 14px !important;
          }
          /* Pink cart icon in list view on mobile */
          .pk-card-list-actions .pk-list-cart-btn {
            background: #eff6ff !important;
            border: 1.5px solid #dbeafe !important;
            color: #3b82f6 !important;
          }
          .pk-card-list-actions .pk-list-cart-btn svg {
            color: #3b82f6 !important;
            stroke: #3b82f6 !important;
          }
          .pk-card-list > div:last-child {
            flex-direction: row !important;
            justify-content: flex-end !important;
            gap: 6px !important;
          }

          .pk-filters-drawer {
            z-index: 10001 !important;
          }

          .pk-result-bar { padding: 8px 10px !important; flex-wrap: wrap; }
          .pk-result-bar p { font-size: 12px !important; }
        }

        @media (max-width: 480px) {
          .pk-hero-banner {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            max-height: none !important;
            aspect-ratio: auto !important;
            display: block !important;
          }
          .pk-hero-banner-img {
            object-fit: cover !important;
            object-position: center 50% !important;
            width: 100% !important;
            height: 100% !important;
            max-height: none !important;
          }
        }

        @media (max-width: 400px) {
          .pk-products-grid { gap: 8px !important; }
          .pk-card .pk-disc-badge { font-size: 9px !important; padding: 3px 6px !important; }
        }
      `}</style>
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense fallback={
      <div style={{ fontFamily: FF, background: 'linear-gradient(180deg,#eff6ff 0%,#fff 280px)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '32px 20px 60px' }}>
          <div style={{ height: 36, width: 200, background: '#dbeafe', borderRadius: 10, marginBottom: 30 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ height: 320, background: '#fff', borderRadius: 18, border: '1px solid #dbeafe' }} />
            ))}
          </div>
        </div>
      </div>
    }>
      <ProductosInner />
    </Suspense>
  );
}

function ImageStateManager({ product, children }: { product: Product; children: (state: { activeIndex: number; setActiveIndex: (i: number) => void; images: string[] }) => ReactNode }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const images = useMemo(() => getProductImages(product), [product]);
  return <>{children({ activeIndex, setActiveIndex, images })}</>;
}
