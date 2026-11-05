'use client';

import { useEffect, useState, useCallback, useMemo, Suspense, useRef, type CSSProperties, type ReactNode } from 'react';
import useSWR from 'swr';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { Search, Grid3x3, List, ShoppingCart, X, SlidersHorizontal, Sparkles, ChevronDown, ChevronLeft, ChevronRight, Clock, ArrowLeft } from 'lucide-react';
import AnimHeart from '@/components/AnimHeart';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, TIMED_OFFERS_COLLECTION, formatPrice } from '@/lib/db';
import { getSectionConfigAsync, getSectionConfig, type SectionConfig } from '@/lib/section-config';
import { normalizeProductImages, getProductImageUrl } from '@/lib/product-images';
import { cached, TTL } from '@/lib/cache';
import { Query } from '@/lib/db';
import { Product, Category, Subcategory, TimedOffer } from '@/types';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/context/FavoritesContext';

import ProductCardPreview from '@/components/ProductCardPreview';
import ImageZoomModal from '@/components/ImageZoomModal';
import ProductImageGallery, { getProductImages, ProductThumbnails } from '@/components/ProductImageGallery';
import ProductBadges from '@/components/ProductBadges';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice, isDisableDiscounts } from '@/lib/apertura-promo';
import AperturaDiscountBadge from '@/components/AperturaDiscountBadge';
import CountdownTimer from '@/components/CountdownTimer';
import { getSkuFromFeatures } from '@/lib/product-features';
import { useProductsCache } from '@/hooks/useProductsCache';
import { extractBrand, HOUSE_BRAND } from '@/lib/brands';
import { getVolumeTiers } from '@/lib/volume-pricing';

const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';

// Extract leading emoji from a string (handles surrogate pairs + variation selectors)
function extractEmoji(name: string): string {
  if (!name) return '';
  const emojiRegex = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?)/u;
  const m = name.match(emojiRegex);
  return m ? m[1] : '';
}

// Remove leading emoji + trailing whitespace from a name
function stripEmoji(name: string): string {
  if (!name) return '';
  const emojiRegex = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?\s*)/u;
  if (emojiRegex.test(name)) {
    return name.replace(emojiRegex, '').trim();
  }
  const emoji = extractEmoji(name);
  return (emoji && name.startsWith(emoji)) ? name.slice(emoji.length).trim() : name.trim();
}

// Generic SVG icon for subcategories without emoji or image
function FallbackIcon({ size = 20, color = '#0284c7' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} fill="none" stroke={color} viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function getExpiresAtEpochSeconds(offer: TimedOffer): number | null {
  if (offer.timeType === 'endDateTime' && offer.endDateTime) {
    return Math.floor(new Date(offer.endDateTime).getTime() / 1000);
  }
  if (offer.timeType === 'duration' && offer.durationHours) {
    const start = offer.activatedAt || (offer as any).$createdAt;
    if (start) {
      return Math.floor((new Date(start).getTime() + offer.durationHours * 3600000) / 1000);
    }
  }
  return null;
}

function ProductosInner({ lockCategoryId, catalogMode }: { lockCategoryId?: string; catalogMode?: 'retail' | 'paquetes' | 'embalajes' } = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const catParam = lockCategoryId || searchParams.get('categoria') || '';
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

  const isPaquetes = catalogMode === 'paquetes';
  const isEmbalajes = catalogMode === 'embalajes';
  const modeQueryParam = isPaquetes ? '?mode=paquetes' : '';
  // 🎨 Rediseño jul 2026: fondo blanco limpio, rosa SOLO como acento puntual.
  // CTAs en negro elegante, sombras neutras (nada de glow rosa neón).
  const primaryColor = isPaquetes ? '#b8895a' : (isEmbalajes ? '#0ea5e9' : '#3b82f6');
  const gradientColor = isPaquetes ? 'linear-gradient(135deg,#f5ede0,#e8dcc8)' : (isEmbalajes ? 'linear-gradient(135deg,#e0f2fe,#bae6fd)' : 'linear-gradient(135deg,#3b82f6,#2563eb)');
  const buttonTextColor = isPaquetes ? '#5c3d24' : (isEmbalajes ? '#0369a1' : '#fff');
  const lightBgColor = isPaquetes ? '#faf7f2' : (isEmbalajes ? '#f0f9ff' : '#faf9fa');
  const lightBorderColor = isPaquetes ? '#e8dcc8' : (isEmbalajes ? '#bae6fd' : '#eceaec');
  const shadowColor = isPaquetes ? 'rgba(198,139,89,0.25)' : (isEmbalajes ? 'rgba(14,165,233,0.2)' : 'rgba(17,24,39,0.07)');
  const shadowColorLight = isPaquetes ? 'rgba(198,139,89,0.1)' : (isEmbalajes ? 'rgba(14,165,233,0.08)' : 'rgba(17,24,39,0.045)');
  const radialBgColor = isPaquetes ? 'rgba(198,139,89,0.08)' : (isEmbalajes ? 'rgba(14,165,233,0.12)' : 'rgba(59,130,246,0.05)');
  const packQtyColor = isPaquetes ? '#0ea5e9' : (isEmbalajes ? '#0284c7' : '#1d4ed8');

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string; color: string; logoUrl?: string }[]>([]);
  const [selectedStore, setSelectedStore] = useState(searchParams.get('vendorId') || '');
  const [search, setSearch] = useState(qParam);
  const [selectedCat, setSelectedCat] = useState(lockCategoryId || '');
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [timedOffersMap, setTimedOffersMap] = useState<Record<string, TimedOffer>>({});
  const [selectedSubcat, setSelectedSubcat] = useState('');
  const [subcatExpanded, setSubcatExpanded] = useState(true);
  const [sortBy, setSortBy] = useState('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // Feedback visual "" Añadido" en el botón de la tarjeta tras agregar al carrito
  const [justAdded, setJustAdded] = useState<Record<string, boolean>>({});
  const flashAdded = (id: string) => {
    setJustAdded(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setJustAdded(prev => ({ ...prev, [id]: false })), 1600);
  };
  const [showLiveHistory, setShowLiveHistory] = useState(false);
  const [liveHistoryDates, setLiveHistoryDates] = useState<string[]>([]);
  const [liveHistoryProducts, setLiveHistoryProducts] = useState<Product[]>([]);
  const [liveHistoryLoading, setLiveHistoryLoading] = useState(false);
  const [liveHistorySelectedDate, setLiveHistorySelectedDate] = useState<string | null>(null);

  const [catalogCover, setCatalogCover] = useState<{ image: string; title: string; subtitle: string; overlayEnabled: boolean; overlayOpacity: number; overlayColor: string }>({
    image: '', title: '', subtitle: '', overlayEnabled: true, overlayOpacity: 40, overlayColor: '#000000'
  });


  // Cargar configuración de portada del catálogo desde theme config
  useEffect(() => {
    getSectionConfigAsync().then(cfg => {
      const heroSec = cfg.find((s: SectionConfig) => s.id === 'tpl1_hero');
      if (heroSec?.settings) {
        const hs = heroSec.settings as Record<string, any>;
        setCatalogCover({
          image: hs.catalogCoverImage || '',
          title: hs.catalogCoverTitle || '',
          subtitle: hs.catalogCoverSubtitle || '',
          overlayEnabled: hs.catalogCoverOverlayEnabled !== false,
          overlayOpacity: hs.catalogCoverOverlayOpacity ?? 40,
          overlayColor: hs.catalogCoverOverlayColor || '#000000',
        });
      }
    }).catch(() => {});
  }, []);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);
  const [selectedTag, setSelectedTag] = useState('');

  const [activePriceRange, setActivePriceRange] = useState<[number, number] | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [heroImgLoaded, setHeroImgLoaded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  useEffect(() => {
    if (mobileFiltersOpen || categoryDrawerOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [mobileFiltersOpen, categoryDrawerOpen]);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { settings: apertura } = useAperturaPromotion();

  const {
    products,
    total,
    priceRange: fetchedPriceRange,
    categoryCounts: catCountMap,
    subcategoryCounts: subCountMap,
    allTags,
    isLoadingInitialData: isLoading,
    isLoadingMore,
    isReachingEnd,
    loadMore,
    isMobile
  } = useProductsCache({
    categoryId: lockCategoryId || selectedCat || undefined,
    subcategoryId: selectedSubcat && selectedSubcat !== 'ofertas-temporales' ? selectedSubcat : undefined,
    sortBy,
    search: search || undefined,
    tag: selectedTag || undefined,
    vendorId: selectedStore || undefined,
    priceMin: activePriceRange ? activePriceRange[0] : undefined,
    priceMax: activePriceRange ? activePriceRange[1] : undefined,
    catalogMode,
    // Paginación real 10 en 10 (server-side): evita descargar el catálogo
    // completo (~1-2MB) por visitante; el servidor responde desde su caché 24h.
    serverPaginated: true,
    pageSize: 10
  });

  //  ─ Pools chicos y cacheados para los carruseles  ─
  // Antes venían de allProducts (catálogo completo). Con paginación 10/10 se
  // piden listas acotadas al endpoint cacheado (0 lecturas Appwrite extra).
  const poolFetcher = (url: string) => fetch(url).then(r => r.json());
  const poolOpts = { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 300000 };
  const isRetailMode = !isPaquetes && !isEmbalajes;
  const { data: offersPoolData } = useSWR(
    isRetailMode ? '/api/public-data/products?ofertasOnly=true&limit=40' : null,
    poolFetcher, poolOpts
  );
  const { data: cheapPoolData } = useSWR(
    isRetailMode ? '/api/public-data/products?sortBy=price_asc&limit=20' : null,
    poolFetcher, poolOpts
  );
  const { data: packPoolData } = useSWR(
    isPaquetes ? '/api/public-data/products?mode=paquetes&sortBy=price_asc&limit=60' : null,
    poolFetcher, poolOpts
  );

  const priceRange = fetchedPriceRange;
  const filtered = products;
  const packStockAvailable = (p: Product) => (p.PACK_STOCK && p.PACK_STOCK > 0) ? p.PACK_STOCK : Math.floor((p.STOCK || 0) / (p.PACKQTY || 1));
  const isLiveShoppingFilter = selectedSubcat === 'ofertas-temporales' && !selectedCat;
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const visibleProducts = isPaquetes ? products.filter(p => {
    if (!p.PACKQTY || p.PACKQTY <= 1) return false;
    const packStock = (p.PACK_STOCK && p.PACK_STOCK > 0) ? p.PACK_STOCK : Math.floor((p.STOCK || 0) / p.PACKQTY);
    return packStock > 0;
  }) : isLiveShoppingFilter ? products.filter(p => {
    if ((p.STOCK || 0) <= 0) return false;
    return false;
  }) : products.filter(p => (p.STOCK || 0) > 0);
  const hasMore = !isReachingEnd;

  // Synchronize priceRange once SWR loads the products
  const hasInitializedPriceRangeRef = useRef(false);
  useEffect(() => {
    if (priceRange && priceRange[1] > 0 && !hasInitializedPriceRangeRef.current) {
      setActivePriceRange(priceRange as [number, number]);
      hasInitializedPriceRangeRef.current = true;
    }
  }, [priceRange]);




  // Con paginación server-side, `total` ya refleja los filtros activos
  // (categoría bloqueada incluida)  sin necesidad de descargar todo.
  const allActiveProducts = useMemo(() => {
    const pool: Product[] = isPaquetes
      ? (packPoolData?.products || [])
      : (offersPoolData?.products || []);
    return pool.filter(p => p.ISACTIVE !== false);
  }, [isPaquetes, packPoolData, offersPoolData]);
  const lockedCategory = lockCategoryId ? categories.find(c => c.$id === lockCategoryId) : null;
  const categoryProductCount = total;

  const carouselRef = useRef<HTMLDivElement>(null);
  const offerCarouselRef = useRef<HTMLDivElement>(null);

  // filterTick re-evalúa las ofertas 1 vez por minuto (para expirar countdowns).
  // Se eliminó el intervalo de 1s que re-renderizaba todo el catálogo sin uso.
  const [filterTick, setFilterTick] = useState(0);
  useEffect(() => {
    const minInterval = setInterval(() => setFilterTick(t => t + 1), 60_000);
    return () => clearInterval(minInterval);
  }, []);

  const paquetesBgImage = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%22400%22%20viewBox%3D%220%200%201200%20400%22%3E%3Crect%20width%3D%221200%22%20height%3D%22400%22%20fill%3D%22%23f5f5f5%22%2F%3E%3Ctext%20x%3D%22600%22%20y%3D%22200%22%20font-family%3D%22sans-serif%22%20font-size%3D%2228%22%20fill%3D%22%23bbb%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E";
  const bgImageToUse = isPaquetes ? paquetesBgImage : (isEmbalajes ? '' : (catalogCover.image || ''));
  const heroImageToUse = isPaquetes ? paquetesBgImage : (isEmbalajes ? '' : (catalogCover.image || ''));

  const offersDayProducts = useMemo(() => {
    const nowMs = Date.now();
    return allActiveProducts.filter(p => {
      if (isPaquetes) {
        return (
          p.PACKQTY && p.PACKQTY > 1 &&
          p.PACK_OFFER_PRICE && p.PACK_OFFER_PRICE > 0 &&
          p.PACK_OFFER_EXPIRES_AT && p.PACK_OFFER_EXPIRES_AT > nowMs &&
          packStockAvailable(p) > 0
        );
      }
      if (!isEmbalajes) {
        const hasOfferPrice = !!(p.CURRENTPRICE && p.CURRENTPRICE > 0 && p.CURRENTPRICE < p.PRICE);
        const notExpired = !p.UNIT_OFFER_EXPIRES_AT || p.UNIT_OFFER_EXPIRES_AT > nowMs;
        return hasOfferPrice && notExpired;
      }
      return false;
    });
  // filterTick triggers re-evaluation once per minute to remove expired offers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allActiveProducts, filterTick, isPaquetes, isEmbalajes]);

  const carouselPaquetes = useMemo(() => {
    if (!isPaquetes) return [];
    return allActiveProducts
      .filter(p => p.PACKQTY && p.PACKQTY > 1 && p.WHOLESALEPRICE && p.WHOLESALEPRICE > 0)
      .filter(p => packStockAvailable(p) > 0)
      .sort((a, b) => {
        const priceA = (a.WHOLESALEPRICE || a.PRICE) * (a.PACKQTY || 1);
        const priceB = (b.WHOLESALEPRICE || b.PRICE) * (b.PACKQTY || 1);
        return priceA - priceB;
      });
  }, [isPaquetes, allActiveProducts]);

  const cheapestRetailProducts = useMemo(() => {
    if (isPaquetes || isEmbalajes) return [];
    const pool: Product[] = (cheapPoolData?.products || []).filter((p: Product) => p.ISACTIVE !== false);
    return pool
      .map(p => {
        const unitOfferExpired = !!(p.UNIT_OFFER_EXPIRES_AT && p.UNIT_OFFER_EXPIRES_AT < Date.now());
        const effectivePrice = (!unitOfferExpired && p.CURRENTPRICE && p.CURRENTPRICE > 0 && p.CURRENTPRICE < p.PRICE) ? p.CURRENTPRICE : p.PRICE;
        return { p, effectivePrice };
      })
      .sort((a, b) => a.effectivePrice - b.effectivePrice)
      .slice(0, 20)
      .map(x => x.p);
  }, [isPaquetes, isEmbalajes, cheapPoolData]);

  const heroBadgeText = isPaquetes ? 'Paquetes Especiales' : (isEmbalajes ? 'Embalajes Profesionales' : (lockCategoryId ? 'Categoría' : 'Nuestra tienda'));
  const heroTitleText = isPaquetes ? 'Paquetes Mayoristas' : (isEmbalajes ? 'Sección Embalaje' : (catalogCover.title || lockedCategory?.name || 'Productos'));
  const heroSubtitleText = isPaquetes ? 'Comprá en cantidad y ahorrá con nuestros precios mayoristas exclusivos por paquete.' : (isEmbalajes ? 'Cajas y embalajes de alta calidad para tus envíos y productos.' : (catalogCover.subtitle || (lockCategoryId ? `Productos de la categoría ${lockedCategory?.name || ''}. Filtrá, ordená y comprá en un solo lugar.` : 'Explorá nuestro catálogo de productos exclusivos')));

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
          setCategories(data.categories as Category[]);
          
          if (catParam && !selectedCat) {
            const found = (data.categories as Category[]).find(c => c.$id === catParam || c.name?.toLowerCase() === catParam.toLowerCase());
            if (found) setSelectedCat(found.$id);
          }

          const map: Record<string, TimedOffer> = {};
          (data.offers as TimedOffer[]).forEach(o => {
            if (o.targetId) map[o.targetId] = o;
          });
          setTimedOffersMap(map);
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
          setSubcategories([
            ...(subData.subcategories as Subcategory[])
          ]);
        } else {
          setSubcategories([]);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadSubcategories();
  }, [selectedCat, lockCategoryId]);






  const hasActiveFilters = !!(
    (selectedCat && selectedCat !== lockCategoryId) || selectedSubcat || selectedTag || selectedStore || search
    || (activePriceRange && (activePriceRange[0] !== priceRange[0] || activePriceRange[1] !== priceRange[1]))
  );
  // Contador para el badge del botón "Filtros" de la toolbar
  const activeFiltersCount =
    ((selectedCat && selectedCat !== lockCategoryId) ? 1 : 0) +
    (selectedStore ? 1 : 0) +
    (selectedSubcat ? 1 : 0) +
    (selectedTag ? 1 : 0) +
    (search ? 1 : 0) +
    ((activePriceRange && (activePriceRange[0] !== priceRange[0] || activePriceRange[1] !== priceRange[1])) ? 1 : 0);
  const clearAllFilters = () => {
    setSelectedCat(lockCategoryId || ''); setSelectedStore(''); setSelectedSubcat(''); setSelectedTag(''); setSearch('');
    setActivePriceRange(priceRange as [number, number]);
  };


  // Sidebar filters component (shared between desktop and mobile drawer)
  const FiltersSidebar = () => (
    <div className="pk-filters-panel" style={{ background: 'rgba(255,255,255,0.86)', borderRadius: 24, padding: 22, border: '1px solid rgba(229,231,235,0.95)', boxShadow: `0 14px 40px ${shadowColor}`, backdropFilter: 'blur(14px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
          <SlidersHorizontal size={16} color={primaryColor} /> Filtros
        </h3>
        {hasActiveFilters && (
          <button onClick={clearAllFilters} style={{ fontSize: 11, fontWeight: 700, color: primaryColor, background: '#f8f9fa', border: 'none', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Precio  FIRST */}
      {priceRange[1] > 0 && activePriceRange && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: primaryColor, marginBottom: 10 }}>
            <span>Precio Máx:</span>
            <span>{formatPrice(activePriceRange[1])}</span>
          </div>
          <input type="range" min={priceRange[0]} max={priceRange[1]} value={activePriceRange[1]}
            onChange={e => setActivePriceRange([activePriceRange[0], Number(e.target.value) || 0])}
            style={{ width: '100%', accentColor: primaryColor, cursor: 'pointer', background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${((activePriceRange[1] - priceRange[0]) / (priceRange[1] - priceRange[0])) * 100}%, #e5e7eb ${((activePriceRange[1] - priceRange[0]) / (priceRange[1] - priceRange[0])) * 100}%, #e5e7eb 100%)` }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="number" value={activePriceRange[0]} onChange={e => setActivePriceRange([Number(e.target.value) || 0, activePriceRange[1]])}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, color: '#111', outline: 'none', fontFamily: 'inherit' }} placeholder="Min" />
            <input type="number" value={activePriceRange[1]} onChange={e => setActivePriceRange([activePriceRange[0], Number(e.target.value) || 0])}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, color: '#111', outline: 'none', fontFamily: 'inherit' }} placeholder="Max" />
          </div>
        </div>
      )}

      {/* Categorías */}
      <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Categorías</p>
        <button onClick={() => { setSelectedCat(''); setSelectedSubcat(''); updateCategoryUrl(''); }}
          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: !selectedCat && !selectedSubcat ? 700 : 500, color: !selectedCat && !selectedSubcat ? primaryColor : '#6b7280', background: !selectedCat && !selectedSubcat ? '#f8f9fa' : 'transparent', border: 'none', cursor: 'pointer', marginBottom: 4, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: !selectedCat && !selectedSubcat ? primaryColor : '#d1d5db', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Todas</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>{total}</span>
        </button>
        {categories.map(c => {
          const count = catCountMap[c.$id] || 0;
          if (count === 0) return null;
          return (
            <button key={c.$id} onClick={() => { setSelectedCat(c.$id); setSelectedSubcat(''); updateCategoryUrl(c.$id); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: selectedCat === c.$id ? 700 : 500, color: selectedCat === c.$id ? primaryColor : '#6b7280', background: selectedCat === c.$id ? '#f8f9fa' : 'transparent', border: 'none', cursor: 'pointer', marginBottom: 4, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedCat === c.$id ? primaryColor : '#d1d5db', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: selectedCat === c.$id ? '#e5e7eb' : '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Subcategorías */}
      {subcategories.length > 0 && selectedCat && (
        <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Subcategorías</p>
          <button onClick={() => setSelectedSubcat('')}
            style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: !selectedSubcat ? 700 : 500, color: !selectedSubcat ? primaryColor : '#9ca3af', background: !selectedSubcat ? '#f8f9fa' : 'transparent', border: 'none', cursor: 'pointer', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: !selectedSubcat ? primaryColor : '#d1d5db', flexShrink: 0 }} />
            Todas
          </button>
          {subcategories.map(sc => {
            const scCount = subCountMap[sc.$id] || 0;
            if (scCount === 0) return null;
            return (
              <button key={sc.$id} onClick={() => setSelectedSubcat(sc.$id)}
                style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: selectedSubcat === sc.$id ? 700 : 500, color: selectedSubcat === sc.$id ? primaryColor : '#9ca3af', background: selectedSubcat === sc.$id ? '#f8f9fa' : 'transparent', border: 'none', cursor: 'pointer', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: selectedSubcat === sc.$id ? primaryColor : '#d1d5db', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{sc.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', background: '#f3f4f6', padding: '2px 6px', borderRadius: 999 }}>{scCount}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tags */}
      {allTags.length > 0 && (
        <div style={{ paddingTop: 14, borderTop: '1px solid #e5e7eb', marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Etiquetas</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => setSelectedTag('')}
              style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: !selectedTag ? '#fff' : primaryColor, background: !selectedTag ? gradientColor : '#f8f9fa', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
              Todas
            </button>
            {allTags.slice(0, 20).map((tag: string) => (
              <button key={tag} onClick={() => setSelectedTag(tag)}
                style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: selectedTag === tag ? '#fff' : primaryColor, background: selectedTag === tag ? gradientColor : '#f8f9fa', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="pk-page" style={{
      fontFamily: FF,
      minHeight: '100vh',
      position: 'relative',
      ['--pk-primary' as any]: primaryColor,
      ['--pk-gradient' as any]: gradientColor,
      ['--pk-light-bg' as any]: lightBgColor,
      ['--pk-light-border' as any]: lightBorderColor,
      ['--pk-shadow' as any]: shadowColor,
      ['--pk-shadow-light' as any]: shadowColorLight,
      ['--pk-radial' as any]: radialBgColor,
    }}>
      <div className="pk-bg-fixed" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        {bgImageToUse && <img className="pk-bg-image" src={bgImageToUse} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(4px) brightness(1.08) saturate(1.08)', transform: 'scale(1.15)', animation: 'pkBgFloat 20s ease-in-out infinite, pkCoverFadeIn 0.6s ease forwards' }} />}
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 15% 10%,${radialBgColor},transparent 32%), linear-gradient(180deg,rgba(255,255,255,0.94) 0%,rgba(255,255,255,0.985) 100%)` }} />
      </div>
      <div className="pk-products-container" style={{ position: 'relative', zIndex: 1, maxWidth: 1600, margin: '0 auto', padding: '32px 20px 60px' }}>
        {/*   Header editorial compacto (rediseño): breadcrumb + título + contador
            + portada slim opcional. Sustituye al hero gigante con stats. */}
        <div className="pk-header2" style={{ margin: '0 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
            <Link href="/" style={{ color: '#9ca3af', textDecoration: 'none' }}>Inicio</Link>
            <span style={{ color: '#d1d5db' }}>/</span>
            {lockCategoryId ? (
              <>
                <Link href="/productos" style={{ color: '#9ca3af', textDecoration: 'none' }}>Tienda</Link>
                <span style={{ color: '#d1d5db' }}>/</span>
                <span style={{ color: '#2563eb', fontWeight: 700 }}>{lockedCategory?.name || 'Categoría'}</span>
              </>
            ) : (
              <span style={{ color: '#2563eb', fontWeight: 700 }}>{isPaquetes ? 'Paquetes' : (isEmbalajes ? 'Embalajes' : 'Tienda')}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 className="pk-title2" style={{ fontSize: 34, fontWeight: 950, color: '#111827', margin: 0, letterSpacing: '-0.04em', lineHeight: 1.08, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {heroTitleText}
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 999, padding: '5px 13px', letterSpacing: 0, whiteSpace: 'nowrap' }}>
                  {total} {isPaquetes ? 'paquetes' : 'productos'}
                </span>
              </h1>
              <p className="pk-subtitle2" style={{ fontSize: 13.5, color: '#6b7280', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>{heroSubtitleText}</p>
            </div>
            <div className="pk-view-toggle" style={{ display: 'flex', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 3, flexShrink: 0 }}>
              <button onClick={() => setView('grid')} style={{ padding: '8px 12px', background: view === 'grid' ? '#eff6ff' : 'transparent', color: view === 'grid' ? '#2563eb' : '#6b7280', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, transition: 'all 0.2s', outline: 'none', fontFamily: 'inherit' }} aria-label="Cuadrícula">
                <Grid3x3 size={14} /> <span className="pk-desktop-only">Cuadrícula</span>
              </button>
              <button onClick={() => setView('list')} style={{ padding: '8px 12px', background: view === 'list' ? '#eff6ff' : 'transparent', color: view === 'list' ? '#2563eb' : '#6b7280', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, transition: 'all 0.2s', outline: 'none', fontFamily: 'inherit' }} aria-label="Lista">
                <List size={14} /> <span className="pk-desktop-only">Lista</span>
              </button>
            </div>
          </div>
        </div>

        {/* 🏪 Tiendas: filtro principal antes de categorías  logo + nombre */}
        <div className="pk-storeband pk-h-scroll" style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto', padding: '6px 2px 14px', marginBottom: 6, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: '#6b7280', marginRight: 2 }}>Tiendas</span>
            {[{ id: '', name: 'Todas', color: primaryColor, logoUrl: '' }, { id: '__main__', name: 'Yaxsell', color: '#f59e0b', logoUrl: '' }, ...stores].map(store => {
              const active = selectedStore === store.id;
              const initials = (store.name || '?').trim().slice(0, 2).toUpperCase();
              return <button key={store.id || 'all-stores'} type="button" onClick={() => { setSelectedStore(store.id); setSelectedCat(''); setSelectedSubcat(''); updateCategoryUrl(''); }} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', padding: '6px 14px 6px 6px', borderRadius: 999, border: `1px solid ${active ? store.color : '#e5e7eb'}`, background: active ? `${store.color}18` : '#fff', color: active ? store.color : '#6b7280', fontSize: 12, fontWeight: active ? 800 : 600, cursor: 'pointer', transition: 'all .2s', fontFamily: 'inherit' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: store.id === '' ? 'transparent' : store.color, color: '#fff', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {store.logoUrl ? <img src={store.logoUrl} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (store.id === '__main__' ? '🐱' : (store.id ? initials : '🛍'))}
                </span>
                <span>{store.name}</span>
              </button>;
            })}
          </div>

        {/* 🏷· Banda de categorías con contadores  burbujas estilo stories,
            visible en desktop Y móvil (antes: chips solo móvil + select desktop) */}
        {!lockCategoryId && categories.length > 0 && (
          <div className="pk-catband pk-h-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '6px 2px 14px', marginBottom: 8, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            <button onClick={() => { setSelectedCat(''); setSelectedSubcat(''); updateCategoryUrl(''); }} className="pk-catband-item" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 70, fontFamily: 'inherit', padding: 0 }}>
              <span style={{ width: 58, height: 58, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 900, color: !selectedCat ? '#fff' : '#2563eb', background: !selectedCat ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : '#eff6ff', border: !selectedCat ? '2.5px solid #3b82f6' : '2.5px solid #dbeafe', boxShadow: !selectedCat ? '0 6px 16px rgba(59,130,246,0.35)' : 'none', transition: 'all 0.2s' }}><FallbackIcon size={24} color={!selectedCat ? '#fff' : '#2563eb'} /></span>
              <span style={{ fontSize: 11, fontWeight: !selectedCat ? 800 : 600, color: !selectedCat ? '#2563eb' : '#6b7280', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>Todos</span>
            </button>
            {categories.map(c => {
              const count = catCountMap[c.$id] || 0;
              if (count === 0) return null;
              const active = selectedCat === c.$id;
              return (
                <button key={c.$id} onClick={() => {
                  if (selectedCat === c.$id) {
                    setSubcatExpanded(prev => !prev);
                  } else {
                    setSelectedCat(c.$id); setSelectedSubcat(''); updateCategoryUrl(c.$id);
                    setSubcatExpanded(true);
                  }
                }} className="pk-catband-item" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 78, maxWidth: 84, width: 78, fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>
                  <span style={{ position: 'relative', width: 58, height: 58, display: 'block' }}>
                    {c.iconUrl ? (
                      <img src={c.iconUrl} alt={c.name} style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', border: active ? '2.5px solid #3b82f6' : '2.5px solid #f3f4f6', boxShadow: active ? '0 6px 16px rgba(59,130,246,0.35)' : '0 1px 4px rgba(0,0,0,0.06)', transition: 'all 0.2s', display: 'block' }} />
                    ) : (
                      <span style={{ width: 58, height: 58, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: active ? '#fff' : '#2563eb', background: active ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : '#eff6ff', border: active ? '2.5px solid #3b82f6' : '2.5px solid #dbeafe', transition: 'all 0.2s' }}>{(() => { const em = extractEmoji(c.name); return em ? em : <FallbackIcon size={24} color={active ? '#fff' : '#2563eb'} />; })()}</span>
                    )}
                    <span style={{ position: 'absolute', top: -3, right: -5, background: active ? '#2563eb' : '#2563eb', color: '#fff', fontSize: 9.5, fontWeight: 800, borderRadius: 999, padding: '2px 6px', border: '2px solid #fff', lineHeight: 1.2 }}>{count}</span>
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, color: active ? '#2563eb' : '#6b7280', textAlign: 'center', maxWidth: 78, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{stripEmoji(c.name)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 🏷· Banda de subcategorías  círculos celestes con animación suave de entrada/salida */}
        {selectedCat && subcategories.length > 0 && (
          <div className={`pk-subcatband-wrap${!subcatExpanded ? ' pk-subcatband-collapsed' : ''}`}>
          <div className="pk-subcatband pk-h-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 2px 12px', marginBottom: 8, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            <button onClick={() => setSelectedSubcat('')} className="pk-subcatband-item" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 68, maxWidth: 74, width: 68, fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>
              <span style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: !selectedSubcat ? '#fff' : '#0284c7', background: !selectedSubcat ? 'linear-gradient(135deg,#38bdf8,#0284c7)' : '#f0f9ff', border: !selectedSubcat ? '2px solid #38bdf8' : '2px solid #bae6fd', transition: 'all 0.2s' }}><FallbackIcon size={20} color={!selectedSubcat ? '#fff' : '#0284c7'} /></span>
              <span style={{ fontSize: 10, fontWeight: !selectedSubcat ? 800 : 600, color: !selectedSubcat ? '#0284c7' : '#6b7280', textAlign: 'center', maxWidth: 68, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>Todas</span>
            </button>
            {subcategories.map(sc => {
              const scCount = subCountMap[sc.$id] || 0;
              if (scCount === 0) return null;
              const subActive = selectedSubcat === sc.$id;
              return (
                <button key={sc.$id} onClick={() => setSelectedSubcat(sc.$id)} className="pk-subcatband-item" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 68, maxWidth: 74, width: 68, fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>
                  <span style={{ position: 'relative', width: 48, height: 48, display: 'block' }}>
                    {sc.ICON_URL ? (
                      <img src={sc.ICON_URL} alt={sc.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: subActive ? '2.5px solid #38bdf8' : '2.5px solid #e0f2fe', boxShadow: subActive ? '0 4px 12px rgba(56,189,248,0.3)' : '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.2s', display: 'block' }} />
                    ) : (
                      <span style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: subActive ? '#fff' : '#0284c7', background: subActive ? 'linear-gradient(135deg,#38bdf8,#0284c7)' : '#f0f9ff', border: subActive ? '2.5px solid #38bdf8' : '2.5px solid #bae6fd', transition: 'all 0.2s' }}>{(() => { const em = extractEmoji(sc.name); return em ? em : <FallbackIcon size={20} color={subActive ? '#fff' : '#0284c7'} />; })()}</span>
                    )}
                    <span style={{ position: 'absolute', top: -2, right: -4, background: '#0284c7', color: '#fff', fontSize: 8.5, fontWeight: 800, borderRadius: 999, padding: '1px 5px', border: '1.5px solid #fff', lineHeight: 1.2 }}>{scCount}</span>
                  </span>
                  <span style={{ fontSize: 10, fontWeight: subActive ? 800 : 600, color: subActive ? '#0284c7' : '#6b7280', textAlign: 'center', maxWidth: 68, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{stripEmoji(sc.name)}</span>
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* Carousel hero para paquetes */}
        {isPaquetes && carouselPaquetes.length > 0 && (
          <div style={{ marginBottom: 28, position: 'relative', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(135deg,#fdfaf6 0%,#faf6f0 100%)', border: '1px solid #e8dcc8', boxShadow: '0 8px 32px rgba(198,139,89,0.08)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#c68b59,#e09b6f)', color: '#fff', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, marginBottom: 8, letterSpacing: '0.04em' }}>
                    OFERTAS POR PAQUETE
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: '#5c3d24', margin: 0, letterSpacing: '-0.02em', fontFamily: FF }}>Los mejores precios por cantidad</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0', fontWeight: 500 }}>Comprá en paquetes y maximizá tu ahorro mayorista</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { const el = carouselRef.current; if (el) el.scrollBy({ left: -268, behavior: 'smooth' }); }} style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #eed9c4', background: '#fff', color: '#c68b59', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(198,139,89,0.1)', flexShrink: 0 }}>
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => { const el = carouselRef.current; if (el) el.scrollBy({ left: 268, behavior: 'smooth' }); }} style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #eed9c4', background: '#fff', color: '#c68b59', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(198,139,89,0.1)', flexShrink: 0 }}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div ref={carouselRef} className="pk-carousel-no-scroll" style={{ display: 'flex', gap: 16, padding: '0 24px 20px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {carouselPaquetes.map(p => {
                const packUnitPrice = isDisableDiscounts(p) ? (p.PRICE || 0) : (p.WHOLESALEPRICE || p.PRICE || 0);
                const packPrice = packUnitPrice * (p.PACKQTY || 1);
                const origPackPrice = p.PRICE * (p.PACKQTY || 1);
                const discPct = !isDisableDiscounts(p) && origPackPrice > 0 && packPrice < origPackPrice ? Math.round((1 - packPrice/origPackPrice) * 100) : 0;
                const cFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
                const cTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
                const cSku = getSkuFromFeatures(cFeatures, cTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
                return (
                  <div key={p.$id} style={{ minWidth: 204, maxWidth: 224, flex: '0 0 auto', background: '#fff', borderRadius: 18, border: '1px solid #eed9c4', overflow: 'hidden', boxShadow: '0 4px 14px rgba(198,139,89,0.08)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    {discPct > 0 && (
                      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, background: '#b8a07a', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 900, padding: '3px 9px' }}>-{discPct}%</div>
                    )}
                    {p.PACK_MIN_PACKS && p.PACK_DISCOUNT_PCT ? (
                      <div style={{ position: 'absolute', top: discPct > 0 ? 38 : 10, right: 10, zIndex: 2, background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 800, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        {p.PACK_MIN_PACKS}+ paq. . -{p.PACK_DISCOUNT_PCT}%
                      </div>
                    ) : null}
                    <div style={{ position: 'relative', aspectRatio: '1/1', background: '#f8f9fa', cursor: 'pointer', overflow: 'hidden' }} onClick={() => handleCardImageClick(p)}>
                      {getProductImageUrl(p) ? (
                        <Image src={getProductImageUrl(p)} alt={p.NAME} fill sizes="224px" referrerPolicy="no-referrer" style={{ objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 42, color: '#eed9c4' }}>{'\uD83D\uDED2'}</div>
                      )}
                    </div>
                    <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {cSku && <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700 }}>SKU: {cSku}</div>}
                      <Link prefetch={false} href={`/productos/${p.$id}${modeQueryParam}`} style={{ textDecoration: 'none' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', minHeight: 36 }}>{p.NAME}</p>
                      </Link>
                      {(p.PACKQTY ?? 0) > 1 ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#0ea5e9' }}>{p.PACKQTY} UNIDADES / PAQUETE</span>
                      ) : null}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        <span style={{ fontSize: 19, fontWeight: 900, color: '#c68b59', letterSpacing: '-0.02em', fontFamily: FF }}>{formatPrice(packPrice)}</span>
                        {discPct > 0 && <span style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(origPackPrice)}</span>}
                        {p.VENDOR_NAME && (p.VENDOR_IS_MAIN
                          ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🐱 {p.VENDOR_NAME}</span>
                          : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🏪 {p.VENDOR_NAME}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#b0b0b0', fontWeight: 600 }}>{formatPrice(packUnitPrice)} por unidad</div>
                      <button
                        onClick={() => packStockAvailable(p) > 0 && addItem(p, p.PACKQTY || 1, undefined, undefined, isDisableDiscounts(p) ? (p.PRICE || 0) : packUnitPrice, true)}
                        disabled={packStockAvailable(p) <= 0}
                        style={{ marginTop: 'auto', padding: '9px 12px', borderRadius: 12, border: 'none', background: packStockAvailable(p) <= 0 ? '#f3f4f6' : 'linear-gradient(135deg,#faf0e6,#eed9c4)', color: packStockAvailable(p) <= 0 ? '#9ca3af' : '#5c3d24', fontSize: 12, fontWeight: 700, cursor: packStockAvailable(p) <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: FF }}
                      >
                        <ShoppingCart size={13} /> {packStockAvailable(p) <= 0 ? 'Sin stock' : 'Agregar paquete'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <style>{`.pk-carousel-no-scroll::-webkit-scrollbar { display: none; }`}</style>
          </div>
        )}

        {/* Carousel de ofertas del día (solo retail) */}
        {!isPaquetes && !isEmbalajes && offersDayProducts.length > 0 && (
          <div style={{ marginBottom: 28, position: 'relative', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(135deg,#f0f9ff 0%,#eff6ff 100%)', border: '1px solid #e0e7ff', boxShadow: `0 8px 32px ${shadowColor}` }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#3b82f6,#2563eb)', color: '#fff', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, marginBottom: 8, letterSpacing: '0.04em' }}>
                    OFERTAS DEL DÍA
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.02em', fontFamily: FF }}>Productos en promoción</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0', fontWeight: 500 }}>Precios especiales por tiempo limitado</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { const el = offerCarouselRef.current; if (el) el.scrollBy({ left: -268, behavior: 'smooth' }); }} style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #e0e7ff', background: '#fff', color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${shadowColorLight}`, flexShrink: 0 }}>
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => { const el = offerCarouselRef.current; if (el) el.scrollBy({ left: 268, behavior: 'smooth' }); }} style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #e0e7ff', background: '#fff', color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${shadowColorLight}`, flexShrink: 0 }}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div ref={offerCarouselRef} className="pk-carousel-offers-no-scroll" style={{ display: 'flex', gap: 16, padding: '0 24px 20px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {offersDayProducts.map(p => {
                const offerPrice = p.CURRENTPRICE || 0;
                const origPrice = p.PRICE || 0;
                const discPct = origPrice > 0 ? Math.round((1 - offerPrice / origPrice) * 100) : 0;
                const cFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
                const cTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
                const cSku = getSkuFromFeatures(cFeatures, cTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
                const expiresAtMs = p.UNIT_OFFER_EXPIRES_AT || 0;
                const minQty = (p.WHOLESALEMINQUANTITY && p.WHOLESALEMINQUANTITY > 1) ? p.WHOLESALEMINQUANTITY : 1;
                return (
                  <div key={p.$id} style={{ minWidth: 204, maxWidth: 224, flex: '0 0 auto', background: '#fff', borderRadius: 18, border: '1px solid #e0e7ff', overflow: 'hidden', boxShadow: `0 4px 14px ${shadowColorLight}`, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    {discPct > 0 && (
                      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, background: '#3b82f6', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 900, padding: '3px 9px' }}>-{discPct}%</div>
                    )}
                    <div style={{ position: 'relative', aspectRatio: '1/1', background: '#f8f9fa', cursor: 'pointer', overflow: 'hidden' }} onClick={() => handleCardImageClick(p)}>
                      {getProductImageUrl(p) ? (
                        <Image src={getProductImageUrl(p)} alt={p.NAME} fill sizes="224px" referrerPolicy="no-referrer" style={{ objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 42, color: '#e0e7ff' }}>🛍ð</div>
                      )}
                    </div>
                    <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {cSku && <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700 }}>SKU: {cSku}</div>}
                      <Link prefetch={false} href={`/productos/${p.$id}`} style={{ textDecoration: 'none' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', minHeight: 36 }}>{p.NAME}</p>
                      </Link>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        <span style={{ fontSize: 19, fontWeight: 900, color: '#3b82f6', letterSpacing: '-0.02em', fontFamily: FF }}>{formatPrice(offerPrice)}</span>
                        {discPct > 0 && <span style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(origPrice)}</span>}
                        {p.VENDOR_NAME && (p.VENDOR_IS_MAIN
                          ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🐱 {p.VENDOR_NAME}</span>
                          : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🏪 {p.VENDOR_NAME}</span>
                        )}
                      </div>
                      {minQty > 1 && (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1d4ed8' }}>Desde {minQty} unidades</div>
                      )}
                      {expiresAtMs > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444' }}>
                          <Clock size={11} className="animate-pulse" />
                          <CountdownTimer expiresAt={Math.floor(expiresAtMs / 1000)} compact />
                        </div>
                      )}
                      <button
                        onClick={() => (p.STOCK || 0) > 0 && addItem(p, minQty)}
                        disabled={(p.STOCK || 0) <= 0}
                        style={{ marginTop: 'auto', padding: '9px 12px', borderRadius: 12, border: 'none', background: (p.STOCK || 0) <= 0 ? '#f3f4f6' : 'linear-gradient(135deg,#eff6ff,#e0e7ff)', color: (p.STOCK || 0) <= 0 ? '#9ca3af' : '#2563eb', fontSize: 12, fontWeight: 700, cursor: (p.STOCK || 0) <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: FF }}
                      >
                        <ShoppingCart size={13} /> {(p.STOCK || 0) <= 0 ? 'Sin stock' : (minQty > 1 ? `Agregar ${minQty}` : 'Agregar')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <style>{`.pk-carousel-offers-no-scroll::-webkit-scrollbar { display: none; }`}</style>
          </div>
        )}

        {/* { Toolbar rediseñado: UNA fila limpia  búsqueda + orden + cortina de
            filtros (con contador). Los selects de categoría se fueron: ahora la
            banda de burbujas y la cortina cubren eso. */}
        <div className={`pk-toolbar ${isScrolled ? 'pk-toolbar-scrolled' : ''}`} style={{ position: 'sticky', top: 10, zIndex: 20, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 18, padding: 10, borderRadius: 999, background: 'rgba(255,255,255,0.92)', border: '1px solid #eee', backdropFilter: 'blur(16px)', boxShadow: '0 8px 28px rgba(17,24,39,0.06)' }}>
          <div className="pk-toolbar-search" style={{ position: 'relative', flex: searchFocused ? '1 1 100%' : '1 1 200px', minWidth: 0, transition: 'flex 0.25s ease' }}>
            <Search size={17} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: primaryColor }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isPaquetes ? "Buscar paquetes..." : (isEmbalajes ? "Buscar embalajes..." : "Buscar productos...")}
              style={{ width: '100%', padding: '12px 38px 12px 44px', borderRadius: 999, border: '1.5px solid #eee', background: '#faf9fa', fontSize: 14, color: '#111', outline: 'none', fontFamily: 'inherit', transition: 'all 0.2s', minWidth: 0 }}
              onFocus={e => { e.currentTarget.style.borderColor = primaryColor; e.currentTarget.style.background = '#fff'; setSearchFocused(true); }}
              onBlur={e => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.background = '#faf9fa'; setSearchFocused(false); }} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: '#eff6ff', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#2563eb' }}><X size={14} /></button>}
          </div>

          <div className="pk-sort-wrap" style={{ position: 'relative', zIndex: sortDropdownOpen ? 1050 : 1, flexShrink: 0, overflow: sortDropdownOpen ? 'visible' : (searchFocused ? 'hidden' : 'visible'), transition: 'opacity 0.25s ease, max-width 0.25s ease, margin 0.25s ease', ...(searchFocused ? { opacity: 0, maxWidth: 0, marginLeft: 0, marginRight: 0, pointerEvents: 'none' } : { opacity: 1, maxWidth: 200 }) }}>
            <button onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className="pk-sort-btn" style={{ padding: '12px 14px', borderRadius: 999, border: '1.5px solid #eee', background: '#fff', fontSize: 12.5, color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', outline: 'none', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span className="pk-sort-label">{sortBy === 'newest' ? 'M\u00E1s recientes' : sortBy === 'price_asc' ? '\u2191 Precio' : '\u2193 Precio'}</span>
              <ChevronDown size={14} style={{ color: primaryColor, transition: 'transform 0.2s', transform: sortDropdownOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {sortDropdownOpen && (
              <>
                <div onClick={() => setSortDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 210, background: '#fff', borderRadius: 16, border: '1.5px solid #eee', boxShadow: '0 12px 34px rgba(17,24,39,0.15)', zIndex: 1000, overflow: 'hidden' }}>
                  <button onClick={() => { setSortBy('newest'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '11px 15px', background: sortBy === 'newest' ? '#eff6ff' : 'transparent', color: sortBy === 'newest' ? '#2563eb' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'newest' ? 800 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    M&aacute;s recientes
                  </button>
                  <button onClick={() => { setSortBy('price_asc'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '11px 15px', background: sortBy === 'price_asc' ? '#eff6ff' : 'transparent', color: sortBy === 'price_asc' ? '#2563eb' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'price_asc' ? 800 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    &uarr; Precio: menor a mayor
                  </button>
                  <button onClick={() => { setSortBy('price_desc'); setSortDropdownOpen(false); }} style={{ width: '100%', padding: '11px 15px', background: sortBy === 'price_desc' ? '#eff6ff' : 'transparent', color: sortBy === 'price_desc' ? '#2563eb' : '#111', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sortBy === 'price_desc' ? 800 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    &darr; Precio: mayor a menor
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ overflow: 'hidden', transition: 'opacity 0.25s ease, max-width 0.25s ease, margin 0.25s ease', ...(searchFocused ? { opacity: 0, maxWidth: 0, marginLeft: 0, marginRight: 0, pointerEvents: 'none' } : { opacity: 1, maxWidth: 200 }) }}>
          <button type="button" onClick={() => setMobileFiltersOpen(true)} className="pk-filters-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 16px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', fontSize: 12.5, fontWeight: 800, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}>
            <SlidersHorizontal size={15} /> Filtros
            {activeFiltersCount > 0 && (
              <span style={{ background: '#fff', color: '#2563eb', borderRadius: 999, fontSize: 10.5, fontWeight: 900, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{activeFiltersCount}</span>
            )}
          </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="pk-filter-chips pk-h-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {selectedCat && categories.find(c => c.$id === selectedCat) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#f8f9fa', color: primaryColor, borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                {categories.find(c => c.$id === selectedCat)?.name}
                <button onClick={() => { setSelectedCat(''); setSelectedSubcat(''); updateCategoryUrl(''); }} style={{ background: 'transparent', border: 'none', color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
            {selectedTag && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#f8f9fa', color: primaryColor, borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                #{selectedTag}
                <button onClick={() => setSelectedTag('')} style={{ background: 'transparent', border: 'none', color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
            {search && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 12px', background: '#f8f9fa', color: primaryColor, borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                "{search}"
                <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} /></button>
              </span>
            )}
          </div>
        )}

        <div className="pk-products-layout" style={{ display: 'flex', gap: 28 }}>
          {/*   Sidebar desktop eliminado: los filtros viven en la cortina lateral
              (setMobileFiltersOpen)  grid a ancho completo estilo Shein/Zara */}

          {/* Products */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pk-result-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 14px', padding: '10px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.72)', border: '1px solid #e5e7eb', backdropFilter: 'blur(10px)' }}>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, fontWeight: 700 }}>
                <span style={{ color: primaryColor, fontWeight: 900 }}>{total}</span> {isPaquetes ? `paquete${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}` : (isEmbalajes ? `embalaje${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}` : `producto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`)}
              </p>
              {hasActiveFilters && (
                <button onClick={clearAllFilters} style={{ padding: '6px 12px', background: '#f8f9fa', color: primaryColor, border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Limpiar todo
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="pk-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: 16 }}>
                {[...Array(8)].map((_, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ aspectRatio: '1/1', background: 'linear-gradient(90deg,#f8f9fa,#e5e7eb,#f8f9fa)', backgroundSize: '200% 100%', animation: 'pkShimmer 1.4s ease infinite' }} />
                    <div style={{ padding: 14 }}>
                      <div style={{ height: 14, width: '80%', background: '#e5e7eb', borderRadius: 6, marginBottom: 8 }} />
                      <div style={{ height: 18, width: '50%', background: '#e5e7eb', borderRadius: 6 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="pk-empty-state" style={{ textAlign: 'center', padding: '86px 20px', background: 'rgba(255,255,255,0.86)', borderRadius: 26, border: '1px solid #e5e7eb', boxShadow: `0 14px 42px ${shadowColorLight}`, backdropFilter: 'blur(14px)' }}>
                <div className="pk-empty-icon" style={{ width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg,#f8f9fa,#e5e7eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: `0 10px 28px ${shadowColorLight}` }}>
                  <ShoppingCart size={36} color={primaryColor} />
                </div>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Sin resultados</p>
                <p style={{ fontSize: 14, color: '#6b7280', margin: '0 auto 18px', maxWidth: 360, lineHeight: 1.55 }}>No encontramos productos con esos filtros. Probá quitar alguno o buscar con otra palabra.</p>
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} style={{ padding: '10px 22px', background: gradientColor, color: '#fff', border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 20px ${shadowColor}`, fontFamily: 'inherit' }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : view === 'grid' ? (
              <div className="pk-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: 16 }}>
                                {visibleProducts.map(p => {
                  //   Precios por volumen: precio Detalle grande + niveles como
                  // chips informativos. CERO descuentos fabricados (ni %, ni tachados).
                  const tiers = getVolumeTiers(p);
                  const isPackModeCard = catalogMode === 'paquetes' || catalogMode === 'embalajes';
                  let price = tiers[0].unitPrice;
                  if (isPackModeCard) {
                    price = (p.WHOLESALEPRICE || p.PRICE || 0) * (p.PACKQTY || 1);
                  }
                  const volTiers = !isPackModeCard ? tiers.slice(1, 3) : [];
                  const fav = isFavorite(p.$id);
                  const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
                  const pTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
                  const cardSku = getSkuFromFeatures(pFeatures, pTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
                  const pBrand = p.BRAND || extractBrand(p.NAME) || HOUSE_BRAND;
                  const isSadoer = pBrand.toLowerCase() === 'sadoer';
                  const badgeBg = isSadoer ? '#e0f2fe' : '#f3f4f6';
                  const badgeColor = isSadoer ? '#1e40af' : '#4b5563';
                  const effectiveStock = isPackModeCard ? packStockAvailable(p) : (p.STOCK || 0);
                  const outOfStock = effectiveStock <= 0;
                  const limitedStock = !outOfStock && effectiveStock < 99999;
                  const lowStock = limitedStock && effectiveStock <= 10;
                  const added = !!justAdded[p.$id];
                  return (
                    <ImageStateManager product={p} key={p.$id}>
                    {({ activeIndex, setActiveIndex, images }) => (
                    <div className={`pk-card${outOfStock ? ' is-oos' : ''}`} style={{ '--pk-accent': primaryColor } as CSSProperties}>
                      <div className="pk-card-media-link" style={{ display: 'block', position: 'relative', cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}>
                        <div className="pk-card-image">
                          <ProductImageGallery product={p} alt={p.NAME} onImageClick={(imgSrc) => handleCardImageClick(p, imgSrc)} hideThumbnails activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} />
                          {(p.PACKQTY ?? 0) > 1 && (
                            <span className="pk-pack-pill">{p.PACKQTY} un/paquete</span>
                          )}
                          <button
                            type="button"
                            className="pk-card-fav"
                            aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(p.$id); }}
                          >
                            <AnimHeart filled={fav} size={18} />
                          </button>
                          <button
                            type="button"
                            aria-label="Ampliar imagen"
                            title="Ampliar imagen"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); handleCardImageClick(p); }}
                            style={{
                              position: 'absolute', top: 10, left: 10, zIndex: 4,
                              width: 32, height: 32, borderRadius: '50%',
                              background: 'rgba(255,255,255,0.92)', border: 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#2563eb', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                            }}
                          >
                            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
                          </button>
                          {outOfStock && (
                            <div className="pk-oos-veil"><span>Agotado</span></div>
                          )}
                        </div>
                      </div>
                      <div className="pk-card-body">
                        <div className="pk-card-meta">
                          {(() => { const cat = categories.find(c => c.$id === p.CATEGORYID); return cat ? <span className="pk-cat-pill">{cat.name}</span> : null; })()}
                          <ProductBadges product={p} />
                        </div>
                        <Link prefetch={false} href={`/productos/${p.$id}${modeQueryParam}`} style={{ textDecoration: 'none' }}>
                          <p className="pk-card-title">{p.NAME}</p>
                        </Link>
                        {pBrand && pBrand !== HOUSE_BRAND && (
                          <div className="pk-card-subline">
                            <span className="pk-brand-pill" style={{ color: badgeColor, background: badgeBg }}>{pBrand}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 4px', flexWrap: 'wrap' }}>
                          {outOfStock ? (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#be123c', background: '#ffe4e6', border: '1px solid #fecdd3', borderRadius: 999, padding: '2px 8px' }}>
                              🚫 Stock: 0 · Agotado
                            </span>
                          ) : lowStock ? (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
                              ⚠️ Stock: {effectiveStock} un.
                            </span>
                          ) : (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#334155', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 8px' }}>
                              📦 Stock: {effectiveStock} un.
                            </span>
                          )}
                        </div>
                        <div className="pk-card-price-row">
                          {price > 0 ? (
                            <>
                              <span className="pk-price">{formatPrice(price)}</span>
                              <span className="pk-price-unit">{isPackModeCard ? 'por paquete' : 'c/u'}</span>
                              {p.VENDOR_NAME && (p.VENDOR_IS_MAIN
                          ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🐱 {p.VENDOR_NAME}</span>
                          : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🏪 {p.VENDOR_NAME}</span>
                        )}
                              <ProductThumbnails images={images} activeIndex={activeIndex} onIndexChange={setActiveIndex} />
                            </>
                          ) : (
                            <span className="pk-price-ask">Consultar precio</span>
                          )}
                        </div>
                        {volTiers.length > 0 && (
                          <div className="pk-vol-chips">
                            {volTiers.map(t => (
                              <span key={t.key} title={`Llevando ${t.minQty} o más unidades pagas ${formatPrice(t.unitPrice)} por unidad`}>
                                {t.minQty}+ un&nbsp;<strong>{formatPrice(t.unitPrice)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <Link prefetch={false} href={`/productos/${p.$id}`} className="pk-add-btn"
                          style={{ flex: 1, padding: '11px 12px', minHeight: 42, borderRadius: 12, border: 'none', background: gradientColor, color: buttonTextColor, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, textDecoration: 'none', boxShadow: '0 4px 14px rgba(37,99,235,.20)', fontFamily: 'inherit' }}>
                          Ver detalles
                        </Link>
                        <button onClick={() => {
                          if (outOfStock) return;
                          const qtyToAdd = isPackModeCard && p.PACKQTY ? p.PACKQTY : 1;
                          const overridePrice = isPackModeCard ? (p.WHOLESALEPRICE || p.PRICE) : undefined;
                          addItem(p, qtyToAdd, undefined, undefined, overridePrice, isPackModeCard);
                          flashAdded(p.$id);
                        }} disabled={outOfStock} className="pk-cart-btn"
                          style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: outOfStock ? '#f3f4f6' : (added ? '#10b981' : '#fff'), color: outOfStock ? '#9ca3af' : (added ? '#fff' : '#2563eb'), cursor: outOfStock ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: outOfStock ? 'none' : '0 2px 8px rgba(59,130,246,0.12)' }}
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
                {visibleProducts.map(p => {
                  const activeOffer = timedOffersMap[p.$id];
                  const rawPricing = activeOffer ? {
                    displayPrice: activeOffer.discountPrice,
                    originalPrice: activeOffer.originalPrice,
                    hasDiscount: true,
                    discountPercent: activeOffer.discountPercentage,
                    fromApertura: false
                  } : resolveProductDisplayPrice(p, apertura);
                  
                  let price = rawPricing.displayPrice;
                  let origPrice = rawPricing.originalPrice;
                  
                  if (catalogMode === 'embalajes') {
                    price = p.WHOLESALEPRICE || p.PRICE;
                    origPrice = p.PRICE;
                  } else if (catalogMode === 'paquetes') {
                    const basePrice = p.PRICE || 0;
                    if (isDisableDiscounts(p)) {
                      price = basePrice;
                      origPrice = null;
                    } else {
                      price = p.WHOLESALEPRICE || basePrice;
                      origPrice = p.WHOLESALEPRICE && p.WHOLESALEPRICE < basePrice ? p.PRICE : null;
                    }
                  }

                  if ((catalogMode === 'paquetes' || catalogMode === 'embalajes') && p.PACKQTY) {
                    price *= p.PACKQTY;
                    if (origPrice != null) origPrice *= p.PACKQTY;
                  }

                  const hasDisc = origPrice != null && origPrice > price;
                  const effDiscPct = rawPricing.discountPercent;
                  const disc = hasDisc && origPrice ? Math.round((1 - price/origPrice)*100) : effDiscPct;
                  const pricing = { ...rawPricing, originalPrice: origPrice };
                  const fav = isFavorite(p.$id);
                  const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
                  const pTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
                  const cardSku = getSkuFromFeatures(pFeatures, pTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
                  const pBrand = p.BRAND || extractBrand(p.NAME) || HOUSE_BRAND;
                  const isSadoer = pBrand.toLowerCase() === 'sadoer';
                  const badgeBg = isSadoer ? '#e0f2fe' : '#f3f4f6';
                  const badgeColor = isSadoer ? '#1e40af' : '#4b5563';
                  const effectiveStockL = (catalogMode === 'paquetes' || catalogMode === 'embalajes') ? packStockAvailable(p) : (p.STOCK || 0);
                  const outOfStockL = effectiveStockL <= 0;
                  return (
                    <div key={p.$id} className="pk-card-list" style={{ position: 'relative', background: '#faf9f7', borderRadius: 16, border: '1px solid #f0f0f0', display: 'flex', gap: 16, padding: 14, transition: 'all 0.2s', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
                      <div className="pk-card-list-media" style={{ position: 'relative', width: 110, borderRadius: 12, overflow: 'hidden', background: '#f5f4f2', flexShrink: 0 }}>
                        <ProductImageGallery product={p} alt={p.NAME} onImageClick={(imgSrc) => handleCardImageClick(p, imgSrc)} sizes="110px" compact />
                        {(p.PACKQTY ?? 0) > 1 && (
                          <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 4, fontSize: 9, fontWeight: 800, color: '#1e40af', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>{p.PACKQTY} un/paq</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          {cardSku && <span className="pk-card-sku" style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>SKU: {cardSku}</span>}
                          {pBrand && pBrand !== HOUSE_BRAND && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeBg, padding: '1px 6px', borderRadius: 999 }}>
                              {pBrand}
                            </span>
                          )}
                          {(() => { const cat = categories.find(c => c.$id === p.CATEGORYID); return cat ? <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#3b82f6', padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap' }}>{cat.name}</span> : null; })()}
                        </div>
                        <Link prefetch={false} href={`/productos/${p.$id}${modeQueryParam}`} style={{ textDecoration: 'none' }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '0 0 4px' }}>{p.NAME}</p>
                        </Link>
                        <p className="pk-card-list-desc" style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{p.DESCRIPTION}</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          {price > 0 ? (
                            <>
                              <span className="pk-price" style={{ fontSize: 18, fontWeight: 900, color: '#111827', letterSpacing: '-0.02em' }}>{formatPrice(price)}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#1e40af', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>{(catalogMode === 'paquetes' || catalogMode === 'embalajes') ? 'por paquete' : 'al detalle'}</span>
                              {p.VENDOR_NAME && (p.VENDOR_IS_MAIN
                          ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🐱 {p.VENDOR_NAME}</span>
                          : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>🏪 {p.VENDOR_NAME}</span>
                        )}
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Consultar precio</span>
                          )}
                        </div>
                        {(catalogMode !== 'paquetes' && catalogMode !== 'embalajes') && getVolumeTiers(p).length > 1 ? (
                          <div className="pk-vol-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {getVolumeTiers(p).slice(1, 3).map(t => (
                              <span key={t.key} title={`Llevando ${t.minQty} o más unidades pagas ${formatPrice(t.unitPrice)} por unidad`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#6366f1', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 999, padding: '3px 8px', lineHeight: 1.1 }}>
                                {t.minQty}+ un&nbsp;<span style={{ color: '#4f46e5', fontWeight: 900 }}>{formatPrice(t.unitPrice)}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="pk-card-list-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={() => setPreviewProduct(p)} title="Vista rápida"
                          style={{ width: 40, height: 40, borderRadius: '50%', background: '#f8f9fa', border: 'none', color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Search size={16} />
                        </button>
                        <button onClick={() => toggleFavorite(p.$id)} title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                          style={{ width: 40, height: 40, borderRadius: '50%', background: '#f8f9fa', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AnimHeart filled={fav} size={24} />
                        </button>
                        <button className="pk-list-cart-btn" onClick={() => {
                          if (outOfStockL) return;
                          const qtyToAddL = (catalogMode === 'paquetes' || catalogMode === 'embalajes') && p.PACKQTY ? p.PACKQTY : 1;
                          const overridePriceL = (catalogMode === 'paquetes' || catalogMode === 'embalajes') ? (p.WHOLESALEPRICE || p.PRICE) : undefined;
                          addItem(p, qtyToAddL, undefined, undefined, overridePriceL, (catalogMode === 'paquetes' || catalogMode === 'embalajes'));
                          flashAdded(p.$id);
                        }} disabled={outOfStockL} title={outOfStockL ? "Sin stock" : ((catalogMode === 'paquetes' || catalogMode === 'embalajes') ? "Comprar paquete" : "Agregar al carrito")}
                          style={{ width: 42, height: 42, borderRadius: '50%', background: outOfStockL ? '#e5e7eb' : (justAdded[p.$id] ? '#059669' : gradientColor), border: 'none', color: outOfStockL ? '#9ca3af' : '#fff', cursor: outOfStockL ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: outOfStockL ? 'none' : '0 3px 10px rgba(59,130,246,0.3)', transition: 'filter 0.2s ease' }}>
                          <ShoppingCart size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0 8px' }}>
                {isMobile ? (
                  <div
                    ref={(el) => {
                      if (!el) return;
                      const observer = new IntersectionObserver(
                        ([entry]) => {
                          if (entry.isIntersecting && !isLoadingMore) {
                            loadMore();
                          }
                        },
                        { rootMargin: '100px' }
                      );
                      observer.observe(el);
                      return () => observer.disconnect();
                    }}
                    style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isLoadingMore ? (
                      <div style={{ width: 24, height: 24, border: '3px solid #f3f4f6', borderTopColor: primaryColor, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    ) : null}
                  </div>
                ) : (
                  <button 
                    onClick={() => loadMore()} 
                    disabled={isLoadingMore}
                    style={{ padding: '12px 32px', background: gradientColor, color: '#fff', border: 'none', borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 20px ${shadowColor}`, fontFamily: 'inherit', opacity: isLoadingMore ? 0.7 : 1 }}
                  >
                    {isLoadingMore ? 'Cargando...' : `Cargar más`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filters drawer */}
      {mounted && mobileFiltersOpen && createPortal(
        <>
          {/*   Cortina de filtros: bottom-sheet en móvil, panel lateral en desktop */}
          <div className="pk-filters-backdrop" onClick={() => setMobileFiltersOpen(false)} onTouchMove={(e) => e.preventDefault()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 10000, touchAction: 'none', display: 'block' }} />
          <div className="pk-filters-drawer" style={{ overscrollBehavior: 'contain' }}>
            <div className="pk-filters-drawer-handle" />
            <div className="pk-filters-drawer-header" onTouchMove={(e) => e.preventDefault()}>
              <h2>Filtros</h2>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Cerrar filtros"><X size={18} /></button>
            </div>
            <FiltersSidebar />
            <button type="button" className="pk-filters-apply" onClick={() => setMobileFiltersOpen(false)}>
              Ver {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Mobile categories drawer */}
      {mounted && categoryDrawerOpen && createPortal(
        <>
          <div className="pk-filters-backdrop pk-mobile-only" onClick={() => setCategoryDrawerOpen(false)} onTouchMove={(e) => e.preventDefault()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 10000, touchAction: 'none' }} />
          <div className="pk-filters-drawer pk-mobile-only" style={{ overscrollBehavior: 'contain' }}>
            <div className="pk-filters-drawer-handle" />
            <div className="pk-filters-drawer-header" onTouchMove={(e) => e.preventDefault()}>
              <h2>Categorías</h2>
              <button type="button" onClick={() => setCategoryDrawerOpen(false)} aria-label="Cerrar categorías"><X size={18} /></button>
            </div>
            <div className="pk-filters-panel" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 4px' }}>
              <button
                onClick={() => { setSelectedCat(''); setSelectedSubcat(''); setCategoryDrawerOpen(false); updateCategoryUrl(''); }}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: 14,
                  border: selectedCat === '' ? `1.5px solid ${primaryColor}` : '1.5px solid rgba(229, 231, 235, 0.8)',
                  background: selectedCat === '' ? (isPaquetes ? 'rgba(198, 139, 89, 0.06)' : 'rgba(59,130,246, 0.06)') : '#fff',
                  color: selectedCat === '' ? (isPaquetes ? '#5c3d24' : '#2563eb') : '#374151',
                  fontSize: 14,
                  fontWeight: selectedCat === '' ? 800 : 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
              >
                Todas las categorías
              </button>
              {categories.map(c => {
                const isSelected = selectedCat === c.$id;
                return (
                  <button
                    key={c.$id}
                    onClick={() => { setSelectedCat(c.$id); setSelectedSubcat(''); setCategoryDrawerOpen(false); updateCategoryUrl(c.$id); }}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: 14,
                      border: isSelected ? `1.5px solid ${primaryColor}` : '1.5px solid rgba(229, 231, 235, 0.8)',
                      background: isSelected ? (isPaquetes ? 'rgba(198, 139, 89, 0.06)' : 'rgba(59,130,246, 0.06)') : '#fff',
                      color: isSelected ? (isPaquetes ? '#5c3d24' : '#2563eb') : '#374151',
                      fontSize: 14,
                      fontWeight: isSelected ? 800 : 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{c.name}</span>
                    {isSelected && <Sparkles size={14} color={primaryColor} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Quick View Modal */}
      {previewProduct && <ProductCardPreview product={previewProduct} onClose={() => setPreviewProduct(null)} isPackMode={isPaquetes || isEmbalajes} />}

      {/* Image Zoom Modal */}
      {zoomImage && <ImageZoomModal src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />}


      <style>{`
        :root {
          --pk-primary: ${primaryColor};
          --pk-primary-dark: ${isPaquetes ? '#5c3d24' : (isEmbalajes ? '#7f1d1d' : '#2563eb')};
          --pk-gradient: ${gradientColor};
          --pk-light-bg: ${lightBgColor};
          --pk-light-border: ${lightBorderColor};
          --pk-shadow: ${shadowColor};
          --pk-shadow-light: ${shadowColorLight};
          --pk-radial: ${radialBgColor};
          --pk-cosmic-gradient: ${isPaquetes ? 'linear-gradient(-45deg, #f0f7ff, #e0f2fe, #f8fafc, #bae6fd, #ffffff)' : (isEmbalajes ? 'linear-gradient(-45deg, #fff5f5, #ffe3e3, #fff8f8, #ffc9c9, #ffffff)' : 'linear-gradient(-45deg, #eff6ff, #dbeafe, #f0f9ff, #bfdbfe, #ffffff)')};
        }

        .pk-hero-home-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 16px;
          background: var(--pk-radial) !important;
          border: 1px solid rgba(${isPaquetes ? '123, 179, 232' : (isEmbalajes ? '220, 38, 38' : '59, 130, 246')}, 0.25) !important;
          font-size: 13px;
          font-weight: 800;
          color: var(--pk-primary-dark) !important;
          text-decoration: none !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .pk-hero-home-btn:hover {
          background: rgba(${isPaquetes ? '198, 139, 89' : (isEmbalajes ? '220, 38, 38' : '59, 130, 246')}, 0.18) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(${isPaquetes ? '198, 139, 89' : (isEmbalajes ? '220, 38, 38' : '59, 130, 246')}, 0.15);
        }
        .pk-hero-home-btn:active {
          transform: translateY(0) scale(0.98);
        }

        .pk-hero-stat-info, .pk-hero-stat-info * {
          background: transparent !important;
          box-shadow: none !important;
          border: none !important;
        }

        /* ══════════════════════════════════════════════════════════
           TARJETA DE PRODUCTO  sistema por capas
           Superficie (gradiente + sombra escalonada), media (zoom
           contenido), contenido (jerarquía tipográfica) y CTA.
           Las interacciones ricas viven sólo en punteros finos; en
           táctil la tarjeta queda plana para que el tap no deje
           estados "pegados".
           ══════════════════════════════════════════════════════════ */
        /* Ángulo registrado: sin @property un conic-gradient NO se puede
           animar (el navegador no sabe interpolar el ángulo). */
        @property --pk-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        /* La tarjeta es un MARCO: el padding deja ver el gradiente cónico
           del fondo como un aro de luz, y ::before pinta la superficie
           interior. El producto queda sobre una teja blanca para que la
           foto no pierda claridad (la nitidez del producto manda). */
        .pk-card {
          --pk-accent: #3b82f6;
          position: relative;
          display: flex;
          flex-direction: column;
          border-radius: 24px;
          padding: 4px;
          isolation: isolate;
          border: none;
          background: conic-gradient(from var(--pk-angle),
            rgba(59,130,246,.90) 0%,
            rgba(56,189,248,.85) 22%,
            rgba(168,85,247,.72) 45%,
            rgba(236,72,153,.60) 62%,
            rgba(56,189,248,.85) 80%,
            rgba(59,130,246,.90) 100%);
          box-shadow:
            0 2px 6px rgba(15,23,42,.16),
            0 16px 34px -18px rgba(30,58,138,.55);
          transition: transform .34s cubic-bezier(.2,.7,.3,1), box-shadow .34s cubic-bezier(.2,.7,.3,1);
        }
        /* Superficie interior: se retrae exactamente el ancho del padding
           para que ese canto quede como aro de luz visible. */
        .pk-card::before {
          content: '';
          position: absolute; inset: 4px;
          border-radius: 20px;
          background: linear-gradient(168deg, #fff 0%, #fdfcfb 54%, #f7f5f1 100%);
          z-index: 0; pointer-events: none;
        }
        /* Aurora: halo de color que sube desde la base, tenue sobre blanco */
        .pk-card::after {
          content: '';
          position: absolute; z-index: 0; pointer-events: none;
          left: -15%; right: -15%; bottom: -22%; height: 58%;
          background: radial-gradient(58% 62% at 50% 100%, rgba(56,189,248,.16), rgba(59,130,246,.07) 45%, transparent 72%);
          filter: blur(16px);
        }
        .pk-card > * { position: relative; z-index: 1; }

        /* El aro gira con el scroll: sin coste en reposo, a diferencia de
           una animación por tiempo repintando 134 tarjetas. */
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            .pk-card {
              animation: pkRing linear both;
              animation-timeline: view();
              animation-range: cover 0% cover 100%;
            }
          }
        }
        @keyframes pkRing { to { --pk-angle: 360deg; } }
        @keyframes pkRise {
          from { opacity: 0; transform: translateY(30px) scale(.94); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /*    Media: integrada dentro de la tarjeta ta */
        .pk-card-image {
          position: relative; overflow: hidden;
          border-radius: 20px 20px 0 0;
          background: #fff;
          border-bottom: 1px solid rgba(17,24,39,.06);
        }
        .pk-card-image::after {
          display: none;
        }
        .pk-card-image img { transition: transform .6s cubic-bezier(.2,.7,.3,1); }
        /* las miniaturas no participan del zoom */
        .pk-card-image button img { transform: none !important; }

        /* Chip de categoría en vidrio, sobre la foto */
        .pk-cat-chip {
          position: absolute; top: 9px; left: 9px; z-index: 4;
          max-width: calc(100% - 58px);
          font-size: 9.5px; font-weight: 800; letter-spacing: .01em;
          color: #0f172a; background: rgba(255,255,255,.82);
          backdrop-filter: blur(10px) saturate(1.5);
          -webkit-backdrop-filter: blur(10px) saturate(1.5);
          border: 1px solid rgba(255,255,255,.8);
          border-radius: 999px; padding: 4px 9px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          box-shadow: 0 3px 10px rgba(16,24,40,.14);
        }
        /* si hay píldora de paquete, la categoría baja para no solaparse */
        .pk-pack-pill + .pk-cat-chip { top: 39px; }

        /* Miniaturas: debajo de la imagen, integradas en el body */
        .pk-card-image [role="group"] {
          position: relative !important; z-index: 2;
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 6px 4px 4px !important; gap: 5px !important;
          box-shadow: none !important;
          border-top: 1px solid rgba(17,24,39,.06);
        }
        /* con una sola imagen la tira no aporta nada */
        .pk-card-image [role="group"]:not(:has(button:nth-child(2))) { display: none !important; }
        .pk-card-image [role="group"] button {
          width: 26px !important; height: 26px !important; padding: 2px !important;
          border: 1.5px solid transparent !important;
          box-shadow: none !important; opacity: .7 !important;
          transition: all .2s ease !important;
        }
        .pk-card-image [role="group"] button[aria-pressed="true"] {
          border-color: var(--pk-accent) !important; opacity: 1 !important;
          box-shadow: 0 0 0 2px rgba(59,130,246,.16) !important;
        }

        .pk-pack-pill {
          position: absolute; top: 9px; left: 9px; z-index: 4;
          font-size: 10px; font-weight: 800; color: #1e40af;
          background: rgba(255,255,255,.94);
          border: 1px solid rgba(30,64,175,.14); border-radius: 999px;
          padding: 3.5px 9px; white-space: nowrap;
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          box-shadow: 0 2px 8px rgba(16,24,40,.08);
        }

        .pk-card-fav {
          position: absolute; top: 9px; right: 9px; z-index: 4;
          width: 33px; height: 33px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--pk-accent);
          background: rgba(255,255,255,.9);
          border: 1px solid rgba(17,24,39,.06);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 2px 10px rgba(16,24,40,.10);
          transition: transform .22s cubic-bezier(.2,.7,.3,1), box-shadow .22s ease, background .22s ease;
        }

        .pk-oos-veil {
          position: absolute; inset: 0; z-index: 3;
          display: flex; align-items: center; justify-content: center;
          background: rgba(250,250,249,.72);
          backdrop-filter: blur(2.5px); -webkit-backdrop-filter: blur(2.5px);
          pointer-events: none;
        }
        .pk-oos-veil span {
          padding: 7px 15px; background: #fff; color: #6b7280;
          border-radius: 999px; font-size: 12px; font-weight: 800;
          border: 1px solid #e5e7eb; box-shadow: 0 3px 10px rgba(16,24,40,.08);
        }
        .pk-card.is-oos .pk-card-image img { filter: saturate(.35); }

        /*    Cuerpo (sobre superficie oscura) os */
        .pk-card-body {
          padding: 12px 11px 12px; display: flex; flex-direction: column;
          flex: 1; gap: 7px; position: relative; z-index: 2;
        }
        .pk-card-meta {
          display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
          min-width: 0; font-size: 10px; font-weight: 700; color: #9ca3af;
        }
        /* La marca llega con colores claros del tema: sobre el fondo
           oscuro se reinterpreta como cristal tintado. */
        .pk-brand-pill {
          font-size: 9.5px; font-weight: 800; padding: 2.5px 8px;
          border-radius: 999px; white-space: nowrap;
          background: #f3f4f6 !important;
          color: #4b5563 !important;
          border: 1px solid rgba(17,24,39,.06);
        }
        .pk-cat-pill {
          font-size: 9.5px; font-weight: 800; color: #fff; white-space: nowrap;
          background: linear-gradient(135deg, var(--pk-accent), #2563eb);
          padding: 2.5px 8px; border-radius: 999px;
          box-shadow: 0 2px 6px rgba(37,99,235,.22);
        }
        .pk-card-subline {
          display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
          min-width: 0; margin-top: -1px;
        }
        .pk-card-sku {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          letter-spacing: .02em; color: #9ca3af;
          font-size: 10px; font-weight: 700;
        }
        .pk-card-title {
          font-size: 14.5px; font-weight: 700; color: #1f2937; margin: 0;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; min-height: 40px; line-height: 1.38;
          letter-spacing: -.014em; transition: color .22s ease;
          text-wrap: balance;
        }
        .pk-card-stock {
          display: flex; align-items: center; gap: 5px;
          font-size: 10.5px; font-weight: 700;
        }
        .pk-card-stock .pk-stock-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor; flex-shrink: 0;
        }
        /* El punto de stock emite luz propia: legible sobre el fondo oscuro */
        .pk-card-stock.is-ok { color: #059669; }
        .pk-card-stock.is-ok .pk-stock-dot { box-shadow: 0 0 0 3px rgba(5,150,105,.14); }
        .pk-card-stock.is-low { color: #d97706; }
        .pk-card-stock.is-low .pk-stock-dot { box-shadow: 0 0 0 3px rgba(217,119,6,.15); }
        .pk-card-stock.is-out { color: #9ca3af; }

        /* Separador: corta el bloque comercial del descriptivo */
        .pk-card-price-row {
          display: flex; align-items: baseline; gap: 6px;
          margin-top: auto; flex-wrap: wrap;
          padding-top: 9px; border-top: 1px solid rgba(17,24,39,.08);
        }
        .pk-price {
          font-size: 22px; font-weight: 900; color: #0f172a;
          letter-spacing: -.03em; font-variant-numeric: tabular-nums;
        }
        .pk-price-unit { font-size: 11px; color: #9ca3af; font-weight: 600; }
        .pk-price-ask { font-size: 12px; color: #9ca3af; font-weight: 500; }

        .pk-vol-chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .pk-vol-chips span {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; color: #6366f1;
          background: #f5f3ff;
          border: 1px solid #e0e7ff; border-radius: 999px;
          padding: 3px 8px; line-height: 1.1;
        }
        .pk-vol-chips strong { color: #4f46e5; font-weight: 900; }

        /*    CTA  ─ */
        .pk-add-btn {
          position: relative; overflow: hidden;
          margin-top: 4px; padding: 11px 12px; min-height: 42px;
          border: none; border-radius: 12px;
          font-size: 12.5px; font-weight: 800; font-family: inherit;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow: 0 4px 14px rgba(37,99,235,.20), inset 0 1px 0 rgba(255,255,255,.22);
          transition: transform .16s cubic-bezier(.2,.7,.3,1), box-shadow .24s ease, filter .2s ease;
        }
        .pk-add-btn__label { display: inline-flex; align-items: center; gap: 7px; position: relative; z-index: 2; }
        /* el icono viaja en su propia cápsula translúcida */
        .pk-add-btn__label svg {
          box-sizing: border-box; width: 22px; height: 22px; padding: 4px;
          border-radius: 50%; background: rgba(255,255,255,.22);
          flex-shrink: 0;
        }
        .pk-add-btn:disabled .pk-add-btn__label svg { background: rgba(17,24,39,.06); }
        /* barrido de luz al pasar el cursor */
        .pk-add-btn::after {
          content: ''; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.38), transparent);
          transform: skewX(-18deg); opacity: 0; z-index: 1;
        }
        .pk-add-btn:disabled {
          background: #f2f3f5 !important; color: #a1a6ae !important;
          cursor: not-allowed; box-shadow: none;
        }
        .pk-add-btn.is-added { box-shadow: 0 4px 14px rgba(5,150,105,.24), inset 0 1px 0 rgba(255,255,255,.22); }
        .pk-add-btn:active:not(:disabled) { transform: scale(.975); }

        /*    Interacciones: sólo punteros finos (desktop) es */
        @media (hover: hover) and (pointer: fine) {
          .pk-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 4px 10px rgba(15,23,42,.20), 0 26px 46px -22px rgba(56,189,248,.55);
          }
          .pk-card:hover .pk-card-image img { transform: scale(1.055); }
          .pk-card:hover .pk-card-image button img { transform: none !important; }
          /* sobre superficie oscura el acento debe aclararse, no oscurecerse */
          .pk-card:hover .pk-card-title { color: #2563eb; }
          .pk-card-fav:hover { transform: scale(1.1); background: #fff; box-shadow: 0 4px 14px rgba(16,24,40,.16); }
          .pk-add-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 8px 22px rgba(37,99,235,.30), inset 0 1px 0 rgba(255,255,255,.26);
          }
          .pk-add-btn:hover:not(:disabled)::after { opacity: 1; animation: pkSheen .75s cubic-bezier(.2,.7,.3,1); }
        }
        @keyframes pkSheen { from { left: -60%; } to { left: 115%; } }

        /*    Táctil: sin estados pegados tras el tap  e */
        @media (hover: none), (pointer: coarse) {
          .pk-card:hover, .pk-card-list:hover { transform: none; }
          .pk-card:hover .pk-card-image img { transform: none; }
          .pk-card:hover .pk-card-title { color: #1f2937; }
          /* Respuesta al tap: la tarjeta "cede" bajo el dedo */
          .pk-card:active { transform: scale(.985); transition: transform .12s ease; }
        }

        .pk-card, .pk-card *, .pk-card-list, .pk-card-list * {
          -webkit-tap-highlight-color: transparent;
        }
        .pk-card a, .pk-card-list a { text-decoration: none !important; }
        .pk-card :focus-visible, .pk-card-list :focus-visible {
          outline: 2px solid var(--pk-accent); outline-offset: 2px; border-radius: 8px;
        }
        @media (prefers-reduced-motion: reduce) {
          .pk-card, .pk-card *, .pk-add-btn, .pk-add-btn::after { transition: none !important; animation: none !important; }
          .pk-card:hover { transform: none; }
        }

        .pk-card .pk-card-sku:hover,
        .pk-card-list .pk-card-sku:hover,
        .pk-card .pk-price-old:hover,
        .pk-card-list .pk-price-old:hover {
          color: #9ca3af;
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
          background: var(--pk-gradient) !important;
          box-shadow: var(--pk-badge-shadow) !important;
        }

        @keyframes pkShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes pkBgFloat { 0%,100% { transform: scale(1.15) translateY(0); } 50% { transform: scale(1.18) translateY(-10px); } }
        @keyframes pkCoverFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pkDrawerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes pkBubbleFloat {
          0% { transform: translateY(30%) scale(0.5); opacity: 0; }
          8% { opacity: 0.8; }
          30% { opacity: 0.6; }
          60% { opacity: 0.4; }
          85% { opacity: 0.15; }
          100% { transform: translateY(-90%) scale(1.1); opacity: 0; }
        }
        @keyframes pkBubbleSway {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(var(--sway, 12px)); }
          40% { transform: translateX(calc(var(--sway, 12px) * -0.6)); }
          60% { transform: translateX(calc(var(--sway, 12px) * 0.8)); }
          80% { transform: translateX(calc(var(--sway, 12px) * -1)); }
        }
        .pk-bubble {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle at 25% 25%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.4) 20%, rgba(59,130,246,0.08) 50%, rgba(37,99,235,0.12) 80%, rgba(59,130,246,0.2) 100%);
          box-shadow: inset 0 -4px 8px rgba(59,130,246,0.12), inset 2px 2px 6px rgba(255,255,255,0.5), 0 0 8px rgba(59,130,246,0.08);
          border: 1px solid rgba(255,255,255,0.35);
          pointer-events: none; z-index: 3;
        }
        .pk-bubble::before {
          content: ''; position: absolute; top: 15%; left: 20%; width: 35%; height: 25%;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(255,255,255,0.9) 0%, transparent 70%);
          transform: rotate(-30deg);
        }
        .pk-bubble::after {
          content: ''; position: absolute; bottom: 20%; right: 18%; width: 18%; height: 12%;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 70%);
          transform: rotate(20deg);
        }

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
          overflow: visible;
        }
        
        .pk-toolbar.pk-toolbar-scrolled .pk-toolbar-actions {
          opacity: 0;
          max-height: 0 !important;
          transform: translateY(-10px);
          pointer-events: none;
          overflow: hidden !important;
        }

        .pk-toolbar-search input {
          border: 1.5px solid rgba(229, 231, 235, 0.8) !important;
          border-radius: 16px !important;
          background: rgba(255, 255, 255, 0.85) !important;
          font-weight: 500 !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .pk-toolbar-search input:focus {
          border-color: var(--pk-primary) !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 4px var(--pk-shadow-light) !important;
        }

        .pk-toolbar-select-wrap select {
          border: 1.5px solid rgba(229, 231, 235, 0.8) !important;
          border-radius: 14px !important;
          background: rgba(255, 255, 255, 0.85) !important;
          font-weight: 600 !important;
          color: #374151 !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .pk-toolbar-select-wrap select:focus {
          border-color: var(--pk-primary) !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 4px var(--pk-shadow-light) !important;
        }

        /*   Botón "Filtros": píldora rosa protagonista (abre la cortina) */
        .pk-filters-btn {
          border: none !important;
          border-radius: 999px !important;
          background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
          color: #ffffff !important;
          font-weight: 800 !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 7px !important;
          cursor: pointer !important;
          box-shadow: 0 4px 14px rgba(59,130,246, 0.3) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .pk-filters-btn:active {
          transform: scale(0.96) !important;
        }
        .pk-filters-btn:hover {
          filter: brightness(0.94);
        }

        .pk-sort-btn {
          border: 1.5px solid #eeeeee !important;
          border-radius: 999px !important;
          background: #ffffff !important;
          font-weight: 700 !important;
          color: #374151 !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .pk-sort-btn:focus, .pk-sort-btn:hover {
          border-color: var(--pk-primary) !important;
          background: #ffffff !important;
        }
        .pk-sort-btn:active {
          transform: scale(0.96) !important;
        }

        .pk-view-toggle {
          background: rgba(229, 231, 235, 0.4) !important;
          border: 1.5px solid rgba(229, 231, 235, 0.7) !important;
          padding: 3px !important;
          border-radius: 14px !important;
          gap: 3px !important;
        }
        .pk-view-toggle button {
          padding: 8px 12px !important;
          border-radius: 10px !important;
          border: none !important;
          cursor: pointer !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .pk-view-toggle button:active {
          transform: scale(0.92) !important;
        }
        .pk-desktop-only { display: block; }
        .pk-mobile-only { display: none; }
        /* (el botón Filtros ahora vive en la toolbar en TODOS los breakpoints) */

        .pk-h-scroll { scrollbar-width: none; -ms-overflow-style: none; touch-action: pan-x pan-y pinch-zoom; -webkit-overflow-scrolling: touch; }
        .pk-h-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }

        .pk-filters-drawer {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 10005 !important;
          max-height: min(88vh, 720px); background: #fff;
          border-radius: 20px 20px 0 0; padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px));
          box-shadow: 0 -12px 40px rgba(0,0,0,0.18);
          display: flex; flex-direction: column; gap: 10px;
          animation: pkDrawerUp 0.32s cubic-bezier(0.16,1,0.3,1);
        }
        /*   Desktop: la cortina entra desde la DERECHA como panel lateral */
        @keyframes pkDrawerRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @media (min-width: 1025px) {
          .pk-filters-drawer {
            left: auto; right: 0; top: 0; bottom: 0;
            width: 400px; max-height: none; height: 100vh;
            border-radius: 24px 0 0 24px;
            padding: 18px 20px 20px;
            box-shadow: -16px 0 50px rgba(0,0,0,0.16);
            animation: pkDrawerRight 0.32s cubic-bezier(0.16,1,0.3,1);
          }
          .pk-filters-drawer-handle { display: none; }
        }
        /* 🏷  Banda de categorías: hover con lift sutil */
        .pk-catband { scrollbar-width: none; }
        .pk-catband::-webkit-scrollbar { display: none; }
        .pk-subcatband { scrollbar-width: none; }
        .pk-subcatband::-webkit-scrollbar { display: none; }
        .pk-subcatband-wrap {
          overflow: hidden;
          max-height: 140px;
          opacity: 1;
          transform: translateY(0);
          transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.3s ease,
                      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pk-subcatband-wrap.pk-subcatband-collapsed {
          max-height: 0;
          opacity: 0;
          transform: translateY(-10px);
        }
        @media (hover: hover) and (pointer: fine) {
          .pk-catband-item:hover > span:first-of-type,
          .pk-catband-item:hover img { transform: translateY(-3px); }
          .pk-catband-item > span:first-of-type, .pk-catband-item img { transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
          .pk-subcatband-item:hover > span:first-of-type,
          .pk-subcatband-item:hover img { transform: translateY(-2px); }
          .pk-subcatband-item > span:first-of-type, .pk-subcatband-item img { transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
        }
        .pk-filters-drawer-handle { width: 40px; height: 4px; border-radius: 999px; background: #e5e7eb; margin: 4px auto 0; flex-shrink: 0; }
        .pk-filters-drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px 8px; flex-shrink: 0; }
        .pk-filters-drawer-header h2 { margin: 0; font-size: 17px; font-weight: 800; color: #111827; }
        .pk-filters-drawer-header button { width: 36px; height: 36px; border-radius: 50%; border: none; background: #f8f9fa; color: var(--pk-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pk-filters-drawer .pk-filters-panel { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; border-radius: 16px !important; box-shadow: none !important; margin: 0 !important; }
        .pk-filters-panel input[type="range"] {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 6px !important;
          border-radius: 999px !important;
          outline: none !important;
        }
        .pk-filters-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 18px !important;
          height: 18px !important;
          border-radius: 50% !important;
          background: var(--pk-primary) !important;
          cursor: pointer !important;
          border: 2px solid #fff !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
        }
        .pk-filters-panel input[type="range"]::-moz-range-thumb {
          width: 18px !important;
          height: 18px !important;
          border-radius: 50% !important;
          background: var(--pk-primary) !important;
          cursor: pointer !important;
          border: 2px solid #fff !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
        }
        .pk-filters-panel input[type="range"]::-moz-range-track {
          height: 6px !important;
          border-radius: 999px !important;
        }
        .pk-filters-apply {
          flex-shrink: 0; width: 100%; padding: 14px; border: none; border-radius: 14px;
          background: var(--pk-gradient) !important; color: #fff;
          font-size: 14px; font-weight: 800; cursor: pointer; font-family: inherit;
          box-shadow: 0 6px 20px var(--pk-shadow) !important;
        }


        .pk-hero-header { display: flex; flex-direction: column; padding: 0 !important; }
        .pk-hero-banner {
          position: relative; width: 100%; overflow: hidden;
          aspect-ratio: 2.4 / 1; min-height: 140px; max-height: 320px;
          background: linear-gradient(135deg, #f8f9fa, #e5e7eb);
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

        .pk-hero-fallback-bg {
          background: ${isPaquetes ? 'linear-gradient(135deg, #faf0e6 0%, #eed9c4 50%, #fff8f0 100%)' : (isEmbalajes ? 'linear-gradient(135deg, #fff5f5 0%, #ffc9c9 50%, #fff8f8 100%)' : 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 50%, #ffffff 100%)')} !important;
          position: relative;
          overflow: hidden;
        }
        .pk-hero-fallback-bg::before {
          content: '';
          position: absolute;
          top: -20%;
          left: -10%;
          width: 60%;
          height: 140%;
          background: radial-gradient(circle, ${isPaquetes ? 'rgba(198, 139, 89, 0.4)' : (isEmbalajes ? 'rgba(220, 38, 38, 0.4)' : 'rgba(59,130,246, 0.28)')} 0%, transparent 70%);
          filter: blur(40px);
          animation: pulseGlow 8s ease-in-out infinite alternate;
        }
        .pk-hero-fallback-bg::after {
          content: '';
          position: absolute;
          bottom: -20%;
          right: -10%;
          width: 50%;
          height: 130%;
          background: radial-gradient(circle, ${isPaquetes ? 'rgba(92, 61, 36, 0.3)' : (isEmbalajes ? 'rgba(127, 29, 29, 0.3)' : 'rgba(37, 99, 235, 0.15)')} 0%, transparent 70%);
          filter: blur(40px);
          animation: pulseGlow 12s ease-in-out infinite alternate-reverse;
        }
        @keyframes pulseGlow {
          0% { transform: scale(1) translate(0, 0); opacity: 0.6; }
          100% { transform: scale(1.2) translate(10px, 10px); opacity: 0.9; }
        }

        .pk-card-fav { display: flex; align-items: center; justify-content: center; }

        @media (hover: hover) and (pointer: fine) and (min-width: 769px) {
          .pk-card:hover .pk-card-actions { opacity: 1 !important; transform: translateX(-50%) translateY(0) !important; }
          /* El lift, la sombra y el borde los define el bloque de la tarjeta
             (elevación azul de marca); aquí sólo el matiz del precio. */
          .pk-card:hover .pk-price { color: #2563eb; }
        }

        @media (max-width: 1024px) {
          .pk-products-layout { flex-direction: column !important; gap: 16px !important; }
          .pk-products-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 14px !important; }
          .pk-sidebar-desktop { display: none !important; }
          .pk-desktop-only { display: none !important; }
          .pk-mobile-only, .pk-filters-btn { display: flex !important; }
        }

        @media (max-width: 768px) {
          .pk-page { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
          .pk-products-container { padding: 12px 12px 48px !important; }
          .pk-hero-header {
            border-radius: 28px !important;
            margin-bottom: 24px !important;
            position: relative !important;
            min-height: 280px !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-end !important;
            background: var(--pk-cosmic-gradient) !important;
            background-size: 400% 400% !important;
            animation: cosmicFlow 12s ease infinite !important;
            box-shadow: 0 16px 36px var(--pk-shadow-light) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            overflow: hidden !important;
          }
          
          @keyframes cosmicFlow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          
          .pk-hero-banner {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            max-height: none !important;
            aspect-ratio: auto !important;
            z-index: 1 !important;
          }
          
          .pk-hero-banner-img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            object-position: center bottom !important;
            opacity: 0.75 !important;
          }

          .pk-hero-fallback-bg {
            background: ${isPaquetes ? 'linear-gradient(135deg, #faf0e6 0%, #eed9c4 50%, #fff8f0 100%)' : 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 50%, #ffffff 100%)'} !important;
            opacity: 1 !important;
          }
          
          .pk-hero-banner::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(to bottom, ${isPaquetes ? 'rgba(250, 240, 230, 0.05) 0%, rgba(198, 139, 89, 0.25)' : 'rgba(255, 240, 245, 0.05) 0%, rgba(59,130,246, 0.25)'} 100%) !important;
            z-index: 3;
          }
          
          .pk-hero-body {
            position: relative !important;
            z-index: 10 !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
            padding: 24px 20px 20px !important;
            background: transparent !important;
          }
          
          .pk-hero-logo-wrap {
            align-self: flex-start !important;
            width: auto !important;
            order: -1 !important;
            margin-bottom: 6px !important;
            display: flex !important;
            justify-content: flex-start !important;
          }
          
          .pk-hero-logo-img {
            height: 44px !important;
            width: auto !important;
            object-fit: contain !important;
            filter: drop-shadow(0 4px 10px rgba(0,0,0,0.15)) !important;
          }
          
          .pk-hero-text {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            width: 100% !important;
            color: #ffffff !important;
          }
          
          .pk-hero-badge {
            background: rgba(255, 255, 255, 0.2) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
            color: #ffffff !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            font-size: 11px !important;
            padding: 5px 12px !important;
            margin-bottom: 10px !important;
            box-shadow: 0 2px 10px var(--pk-shadow-light) !important;
            border-radius: 999px !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
          }
          
          .pk-products-title {
            font-size: 32px !important;
            font-weight: 900 !important;
            color: #ffffff !important;
            letter-spacing: -0.03em !important;
            text-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
          }
          
          .pk-hero-subtitle {
            font-size: 13px !important;
            color: #ffffff !important;
            font-weight: 700 !important;
            margin: 6px 0 14px !important;
            max-width: 100% !important;
            line-height: 1.4 !important;
            text-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
          }
          
          .pk-hero-stats {
            gap: 10px !important;
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
          }
          
          .pk-hero-stat-card {
            flex: 1 !important;
            min-width: 120px !important;
            padding: 10px 14px !important;
            border-radius: 16px !important;
            background: rgba(255, 255, 255, 0.15) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 10px !important;
            transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease !important;
          }

          .pk-hero-stat-card:active {
            transform: scale(0.97) !important;
            background: rgba(255, 255, 255, 0.25) !important;
            border-color: rgba(255, 255, 255, 0.3) !important;
          }
          
          .pk-hero-stat-icon {
            background: rgba(255, 255, 255, 0.2) !important;
            color: #ffffff !important;
            width: 32px !important;
            height: 32px !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            box-shadow: none !important;
          }

          .pk-hero-stat-num {
            color: #ffffff !important;
            font-size: 18px !important;
            font-weight: 950 !important;
            display: block !important;
            line-height: 1.1 !important;
            text-shadow: 0 1px 3px rgba(37, 99, 235, 0.25) !important;
          }
          
          .pk-hero-stat-label {
            color: rgba(255, 255, 255, 0.7) !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            letter-spacing: 0.03em !important;
            text-transform: uppercase !important;
            display: block !important;
          }

          .pk-hero-stat-link {
            flex: 1 0 100% !important;
            padding: 12px 14px !important;
            border-radius: 16px !important;
            background: rgba(255, 255, 255, 0.2) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
            color: #ffffff !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            font-size: 12px !important;
            font-weight: 800 !important;
            text-align: center !important;
            justify-content: center !important;
            text-decoration: none !important;
            display: inline-flex !important;
            align-items: center !important;
            transition: transform 0.2s ease, background 0.2s ease !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
          }

          .pk-hero-stat-link:active {
            transform: scale(0.98) !important;
            background: rgba(255, 255, 255, 0.3) !important;
          }

          .pk-bubble {
            opacity: 0.35 !important;
          }

          .pk-hero-home-btn {
            width: 100% !important;
            justify-content: center !important;
            background: rgba(255, 255, 255, 0.2) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
            color: #ffffff !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            font-size: 12px !important;
            font-weight: 800 !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
            text-shadow: 0 1px 3px rgba(37, 99, 235, 0.25) !important;
            margin-top: 6px !important;
          }
          .pk-hero-home-btn:hover, .pk-hero-home-btn:active {
            background: rgba(255, 255, 255, 0.3) !important;
            transform: scale(0.98) !important;
          }
          
          /* Background performance optimization */
          .pk-bg-fixed { display: none !important; }
          .pk-bg-image { animation: none !important; transform: none !important; }

          /* Sticky toolbar: remove overrides to preserve user's inline styles */
          .pk-toolbar {
            position: -webkit-sticky !important;
            position: sticky !important;
            top: 54px !important;
            z-index: 999 !important;
            border-radius: 22px !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          /*   Header editorial + banda de categorías en móvil */
          .pk-title2 { font-size: 25px !important; gap: 8px !important; }
          .pk-title2 > span { font-size: 11px !important; padding: 4px 10px !important; }
          .pk-subtitle2 { font-size: 12.5px !important; }
          .pk-catband { gap: 11px !important; padding-bottom: 10px !important; }
          .pk-subcatband { gap: 8px !important; padding-bottom: 8px !important; }
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

          .pk-filter-chips { margin-bottom: 14px !important; padding-bottom: 2px !important; }
          .pk-filter-chips span { flex-shrink: 0; font-size: 11px !important; }
          .pk-products-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
          /*   Marco calibrado para dos columnas: aro más fino y radios
             menores, manteniendo la misma identidad que en desktop. */
          .pk-card {
            border-radius: 19px !important;
            padding: 3px !important;
            border: none !important;
            box-shadow: 0 2px 5px rgba(15,23,42,.16), 0 12px 24px -14px rgba(30,58,138,.55) !important;
          }
          .pk-card::before { inset: 3px !important; border-radius: 16px !important; }
          .pk-card-image { border-radius: 15px !important; }
          /* Entrada scroll-driven: cada tarjeta se eleva al entrar en
             cuadro. Sólo en táctil, para no pisar el lift del hover. */
          @supports (animation-timeline: view()) {
            @media (prefers-reduced-motion: no-preference) {
              .pk-card {
                animation: pkRing linear both, pkRise cubic-bezier(.2,.7,.3,1) both !important;
                animation-timeline: view(), view() !important;
                animation-range: cover 0% cover 100%, cover 0% cover 26% !important;
              }
            }
          }
          /*   Comodidad táctil: buscador sin zoom iOS, botones de 42px+, chips legibles */
          .pk-toolbar-search input { font-size: 16px !important; }
          .pk-card-body { padding: 10px 10px 12px !important; gap: 5px !important; }
          .pk-card-body .pk-price { font-size: 17px !important; }
          .pk-add-btn { min-height: 42px !important; font-size: 12px !important; border-radius: 11px !important; }
          .pk-cart-btn { width: 36px !important; height: 36px !important; border-radius: 10px !important; }
          .pk-vol-chips span { font-size: 9.5px !important; padding: 3px 7px !important; }
          .pk-card-list-desc { display: none !important; }
          /* en 2 columnas las píldoras compiten con el nombre: se acotan */
          .pk-card-meta { gap: 4px !important; }
          .pk-brand-pill, .pk-cat-pill { font-size: 9px !important; padding: 2px 6.5px !important; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
          .pk-card-sku { font-size: 9px !important; }
          .pk-card-stock { font-size: 10px !important; }
          .pk-card-fav {
            display: flex !important;
            width: 30px !important;
            height: 30px !important;
            top: 6px !important;
            right: 6px !important;
            background: rgba(255,255,255,.92) !important;
            box-shadow: 0 2px 8px rgba(16,24,40,.10) !important;
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
          
          /*   Tarjetas cómodas: nombre legible, precio protagonista, botón táctil 42px+ */
          .pk-card .pk-card-body { padding: 11px 10px 11px !important; }
          .pk-card .pk-card-body p { font-size: 13px !important; min-height: 35px !important; line-height: 1.32 !important; margin-bottom: 2px !important; }
          .pk-card .pk-price { font-size: 19px !important; }
          .pk-card .pk-add-btn { padding: 10px !important; font-size: 11.5px !important; border-radius: 10px !important; margin-top: 6px !important; min-height: 42px !important; }

          /* Redesigned horizontal list card on mobile */
          .pk-card-list {
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 10px !important;
            border-radius: 14px !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            background: #ffffff !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04) !important;
            border-color: rgba(229, 231, 235, 0.5) !important;
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
            background: var(--pk-light-bg) !important;
            border: 1.5px solid var(--pk-light-border) !important;
            color: var(--pk-primary) !important;
          }
          .pk-card-list-actions .pk-list-cart-btn svg {
            color: var(--pk-primary) !important;
            stroke: var(--pk-primary) !important;
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

function ImageStateManager({ product, children }: { product: Product; children: (state: { activeIndex: number; setActiveIndex: (i: number) => void; images: string[] }) => ReactNode }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const images = useMemo(() => getProductImages(product), [product]);
  return <>{children({ activeIndex, setActiveIndex, images })}</>;
}

export default function CollectionAll1({ lockCategoryId, catalogMode }: { lockCategoryId?: string; catalogMode?: 'retail' | 'paquetes' | 'embalajes' } = {}) {
  return (
    <Suspense fallback={
      <div style={{ fontFamily: FF, background: 'linear-gradient(180deg,#f8f9fa 0%,#fff 280px)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '32px 20px 60px' }}>
          <div style={{ height: 36, width: 200, background: '#e5e7eb', borderRadius: 10, marginBottom: 30 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ height: 320, background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb' }} />
            ))}
          </div>
        </div>
      </div>
    }>
      <ProductosInner lockCategoryId={lockCategoryId} catalogMode={catalogMode} />
    </Suspense>
  );
}
