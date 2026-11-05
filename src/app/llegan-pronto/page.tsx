'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Package, ArrowRight, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/db';
import { normalizeProductImages, resolveStorageImageUrl, getProductImageUrl } from '@/lib/product-images';
import { cached, TTL } from '@/lib/cache';
import { Product, Category, Subcategory } from '@/types';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice } from '@/lib/apertura-promo';
import AperturaDiscountBadge from '@/components/AperturaDiscountBadge';
import { useFavorites } from '@/context/FavoritesContext';
import ImageZoomModal from '@/components/ImageZoomModal';

const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';

export default function LleganProntoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [selectedSub, setSelectedSub] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);
  const [filterBarHeight, setFilterBarHeight] = useState(52);
  const [barVisible, setBarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const PAGE_SIZE = 50;
  const { isFavorite, toggleFavorite } = useFavorites();
  const { settings: apertura } = useAperturaPromotion();
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [catDocs, prodDocs] = await Promise.all([
        cached('categories:all', TTL.categories, async () => {
          const response = await fetch('/api/public-data/catalog?categoriesOnly=true');
          if (!response.ok) return [];
          const data = await response.json();
          return data.categories || [];
        }),
        cached('inventory_products:llegan-pronto', TTL.products, async () => {
          const res = await fetch('/api/public-data/inventory');
          if (!res.ok) return [];
          const data = await res.json();
          return data.documents || [];
        }),
      ]);

      setCategories(catDocs as unknown as Category[]);
      setProducts((prodDocs as unknown as Product[]).map(p => normalizeProductImages(p)));
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Measure filter bar height
  useEffect(() => {
    const measure = () => {
      const bar = document.getElementById('lp-filters-bar');
      if (bar) setFilterBarHeight(bar.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selectedCat, selectedSub, subcategories.length]);

  // Show/hide filter bar on scroll direction
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setBarVisible(currentY <= 100 || currentY < lastScrollY.current);
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [selectedCat, selectedSub, search]);

  // Las subcategorías se consultan por el endpoint cacheado por categoría.
  useEffect(() => {
    if (!selectedCat) { setSubcategories([]); return; }
    const loadSubs = async () => {
      try {
        const response = await fetch(`/api/public-data/subcategories?categoryId=${encodeURIComponent(selectedCat)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setSubcategories((data.subcategories || []) as Subcategory[]);
      } catch { setSubcategories([]); }
    };
    loadSubs();
  }, [selectedCat]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!(p as any).COMING_SOON) return false;
      if (!p.IMAGEURL || !p.IMAGEURL.trim()) return false;
      if (selectedCat && p.CATEGORYID !== selectedCat) return false;
      if (selectedSub && p.SUBCATEGORYID !== selectedSub) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return p.NAME.toLowerCase().includes(q) || (p.DESCRIPTION || '').toLowerCase().includes(q);
    });
  }, [products, selectedCat, selectedSub, search]);

  // Count products per category and subcategory from filtered list
  const catCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => {
      const catId = p.CATEGORYID || 'uncategorized';
      map[catId] = (map[catId] || 0) + 1;
    });
    return map;
  }, [filtered]);

  const subcatCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => {
      if (p.SUBCATEGORYID) {
        map[p.SUBCATEGORYID] = (map[p.SUBCATEGORYID] || 0) + 1;
      }
    });
    return map;
  }, [filtered]);

  // Only categories that have products in the filtered list
  const categoriesWithProducts = useMemo(() => {
    return categories.filter(c => catCountMap[c.$id] > 0);
  }, [categories, catCountMap]);

  const getCategoryName = (catId: string) => categories.find(c => c.$id === catId)?.name || 'Sin categoría';
  const getCategoryImage = (catId: string) => categories.find(c => c.$id === catId)?.iconUrl || '';

  return (
    <div style={{ fontFamily: FF, minHeight: '100vh', background: '#f5a8cffafa' }}>
      <style>{`
        @keyframes lp-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
        @keyframes lp-img-skeleton { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes lp-bg { 0% { transform: scale(1); } 50% { transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes lp-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(227,150,191,0.4); } 50% { box-shadow: 0 0 0 8px rgba(227,150,191,0); } }
        @keyframes subcat-in-lp { 0% { opacity: 0; transform: translateY(8px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .subcat-pill-lp { animation: subcat-in-lp .3s ease-out both; }
        .lp-img-skeleton {
          background: linear-gradient(90deg, #fce7f3 25%, #e0e0e0 37%, #fce7f3 63%);
          background-size: 200% 100%;
          animation: lp-img-skeleton 1.5s ease-in-out infinite;
        }
        .lp-card-wrap:hover .lp-card-img { transform: scale(1.06); }
        .lp-pill { transition: all .2s; }
        .lp-pill:hover { transform: translateY(-2px); }
        @media (max-width: 768px) {
          .lp-card-wrap { flex-direction: column !important; min-height: auto !important; border-radius: 14px !important; }
          .lp-card-img-side { width: 100% !important; min-width: 0 !important; height: auto !important; min-height: 280px !important; }
          .lp-card-img-side .lp-card-img { object-fit: contain !important; }
          .lp-card-info { padding: 16px 18px !important; }
          .lp-card-info h3 { font-size: 17px !important; margin: 4px 0 10px !important; }
          .lp-card-info .price-label { font-size: 11px !important; letter-spacing: 1px !important; }
          .lp-card-info .price-val { font-size: 22px !important; }
          .lp-card-info .price-val-sm { font-size: 20px !important; }
          .lp-hero-title { font-size: 28px !important; letter-spacing: -0.5px !important; }
          .lp-hero-wrap { padding: 64px 16px 24px !important; }
          .lp-hero-desc { font-size: 12px !important; }
          .lp-scroll-arrow { display: none !important; }
          #lp-scroll { padding-left: 12px !important; padding-right: 12px !important; }
          .lp-skeleton { flex-direction: column !important; min-height: auto !important; }
          .lp-skeleton-img { width: 100% !important; height: 180px !important; }
          .lp-skeleton-info { padding: 16px 18px !important; }
          .lp-section-title { font-size: 18px !important; }
          .lp-cta-btn { padding: 12px 0 !important; font-size: 11px !important; letter-spacing: 1px !important; }
          .lp-content-area { padding: 16px 12px 60px !important; }
          .lp-pack-badge { font-size: 12px !important; padding: 6px 12px !important; margin-top: 8px !important; }
          .lp-pack-badge strong { font-size: 14px !important; }
          .lp-price-card { padding: 8px 12px !important; border-radius: 10px !important; gap: 4px !important; }
          .lp-price-card .price-label { font-size: 11px !important; letter-spacing: 1px !important; }
          .lp-price-card .price-val { font-size: 20px !important; letter-spacing: -0.3px !important; }
          .lp-price-card .price-val-sm { font-size: 18px !important; }
          .lp-badge-lp { font-size: 9px !important; padding: 4px 9px !important; letter-spacing: 1.2px !important; }
          .lp-disc-badge { top: 40px !important; left: 12px !important; }
        }
      `}</style>

      {/* ── HERO ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', textAlign: 'center',
        background: 'url(data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%22400%22%20viewBox%3D%220%200%201200%20400%22%3E%3Crect%20width%3D%221200%22%20height%3D%22400%22%20fill%3D%22%23f5f5f5%22%2F%3E%3Ctext%20x%3D%22600%22%20y%3D%22200%22%20font-family%3D%22sans-serif%22%20font-size%3D%2228%22%20fill%3D%22%23bbb%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E',
        padding: '110px 24px 90px',
      }} className="lp-hero-wrap">
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.88) 100%)' }} />
        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 20px', borderRadius: 50, background: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.4)', marginBottom: 22 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e396bf', animation: 'lp-pulse 2s infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#be185d', letterSpacing: '3px', textTransform: 'uppercase' }}>Próximamente</span>
          </div>
          <h1 className="lp-hero-title" style={{ fontSize: 58, fontWeight: 900, color: '#fff', margin: '0 0 40px', lineHeight: 1, letterSpacing: '-2px', fontFamily: '"Playfair Display", Georgia, serif' }}>
            ¡LLEGAN<br /><span style={{ color: '#e396bf' }}>PRONTO!</span>
          </h1>
          <div style={{ position: 'relative', maxWidth: 500, margin: '0 auto' }}>
            <Search size={18} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input
              type="text"
              placeholder="Buscar productos que llegan pronto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '16px 20px 16px 52px', borderRadius: 50,
                border: '1px solid rgba(0,0,0,0.08)', fontSize: 14, fontFamily: FF,
                background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)',
                color: '#111', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div id="lp-filters-bar" style={{
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,0,0,0.06)',
        position: 'fixed', top: barVisible ? 0 : -120, left: 0, right: 0, zIndex: 40,
        transition: 'top .3s ease',
      }}>
        {selectedSub ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px' }}>
            <button
              onClick={() => { setSelectedCat(''); setSelectedSub(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 50, border: '1px solid rgba(227,150,191,0.15)', background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)', cursor: 'pointer', fontFamily: FF, fontSize: 12, fontWeight: 700, color: '#be185d', letterSpacing: '0.5px' }}
            >
              <ChevronLeft size={14} /> Volver
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e396bf', letterSpacing: '1px', textTransform: 'uppercase' }}>{subcategories.find(s => s.$id === selectedSub)?.name || 'Subcategoría'}</span>
          </div>
        ) : (
          <>
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <button
            onClick={() => { if (scrollRef.current) scrollRef.current.scrollBy({ left: -200, behavior: 'smooth' }); }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(90deg, rgba(255,255,255,0.9) 60%, transparent)', border: 'none', cursor: 'pointer', zIndex: 5, color: '#999' }}
            className="lp-scroll-arrow"
          >
            <ChevronLeft size={18} />
          </button>
          <div id="lp-scroll" ref={scrollRef} style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 24px 14px 44px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <button className="lp-pill" onClick={() => { setSelectedCat(''); setSelectedSub(''); }} style={{
              padding: '9px 22px', borderRadius: 50, cursor: 'pointer', fontFamily: FF, fontSize: 12,
              fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '1px', textTransform: 'uppercase',
              border: `1px solid ${!selectedCat ? 'rgba(227,150,191,0.3)' : 'rgba(0,0,0,0.06)'}`,
              background: !selectedCat ? 'rgba(227,150,191,0.12)' : 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(8px)',
              color: !selectedCat ? '#be185d' : '#666',
              boxShadow: !selectedCat ? '0 2px 10px rgba(227,150,191,0.12)' : 'none',
            }}>✦ Todos</button>
            {categoriesWithProducts.map(cat => (
              <button key={cat.$id} className="lp-pill"
                onClick={() => { setSelectedCat(selectedCat === cat.$id ? '' : cat.$id); setSelectedSub(''); }}
                style={{
                  padding: '9px 22px', borderRadius: 50, cursor: 'pointer', fontFamily: FF, fontSize: 12,
                  fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '1px', textTransform: 'uppercase',
                  border: `1px solid ${selectedCat === cat.$id ? 'rgba(227,150,191,0.3)' : 'rgba(0,0,0,0.06)'}`,
                  background: selectedCat === cat.$id ? 'rgba(227,150,191,0.12)' : 'rgba(255,255,255,0.5)',
                  backdropFilter: 'blur(8px)',
                  color: selectedCat === cat.$id ? '#be185d' : '#666',
                  boxShadow: selectedCat === cat.$id ? '0 2px 10px rgba(227,150,191,0.12)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                {getCategoryImage(cat.$id) && <img src={getCategoryImage(cat.$id)} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee' }} />}
                {cat.name} <span style={{ fontSize: 10, fontWeight: 700, opacity: .7 }}>({catCountMap[cat.$id] || 0})</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { if (scrollRef.current) scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' }); }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(270deg, rgba(255,255,255,0.9) 60%, transparent)', border: 'none', cursor: 'pointer', zIndex: 5, color: '#999' }}
            className="lp-scroll-arrow"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {selectedCat && !selectedSub && subcategories.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 24px 14px' }}>
            {subcategories.filter(sub => (subcatCountMap[sub.$id] || 0) > 0).map((sub, i) => (
              <button key={sub.$id} className="lp-pill subcat-pill-lp"
                onClick={() => setSelectedSub(selectedSub === sub.$id ? '' : sub.$id)}
                style={{
                  animationDelay: `${i * 0.04}s`, padding: '8px 18px', borderRadius: 50, cursor: 'pointer', fontFamily: FF, fontSize: 11,
                  fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.8px', textTransform: 'uppercase',
                  border: `1px solid ${selectedSub === sub.$id ? 'rgba(227,150,191,0.25)' : 'rgba(227,150,191,0.1)'}`,
                  background: selectedSub === sub.$id ? 'rgba(227,150,191,0.12)' : 'rgba(255,255,255,0.5)',
                  backdropFilter: 'blur(8px)',
                  color: selectedSub === sub.$id ? '#be185d' : '#888',
                  boxShadow: selectedSub === sub.$id ? '0 2px 10px rgba(227,150,191,0.12)' : '0 1px 3px rgba(227,150,191,0.05)',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all .2s',
                }}>
                {sub.ICON_URL && <img src={sub.ICON_URL} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />}
                {sub.name} <span style={{ fontSize: 9, fontWeight: 700, opacity: .7 }}>({subcatCountMap[sub.$id] || 0})</span>
              </button>
            ))}
          </div>
        )}
          </>
        )}
      </div>
      {/* Spacer */}
      <div style={{ height: filterBarHeight }} />

      {/* ── CONTENT ── */}
      <div className="lp-content-area" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="lp-skeleton" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: i % 2 !== 0 ? 'row-reverse' : 'row', minHeight: 380, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.02)' }}>
                <div className="lp-skeleton-img" style={{ width: '42%', background: '#f5f5f5', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 16, left: 16, padding: '5px 12px', borderRadius: 6, background: 'rgba(227,150,191,0.08)', width: 70, height: 18 }} />
                </div>
                <div className="lp-skeleton-info" style={{ flex: 1, padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ height: 10, background: '#eee', borderRadius: 50, width: '25%' }} />
                  <div style={{ height: 24, background: '#eee', borderRadius: 8, width: '65%' }} />
                  <div style={{ height: 1, background: 'rgba(227,150,191,0.15)', width: '55%' }} />
                  <div style={{ height: 20, background: '#eee', borderRadius: 12, width: '40%' }} />
                  <div style={{ height: 20, background: '#eee', borderRadius: 12, width: '35%' }} />
                  <div style={{ marginTop: 24, height: 52, background: 'rgba(227,150,191,0.06)', borderRadius: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(227,150,191,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Package size={36} color="#e396bf" />
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: '0 0 10px', fontFamily: '"Playfair Display", serif' }}>Aún no hay productos</p>
            <p style={{ fontSize: 14, color: '#888', margin: '0 0 28px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>Estamos trabajando para traerte los mejores productos. ¡Volvé pronto para ver las novedades!</p>
            <Link href="/productos" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 50, background: 'rgba(227,150,191,0.1)', border: '1px solid rgba(227,150,191,0.2)', color: '#be185d', fontSize: 13, fontWeight: 700, textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: FF }}>
              Ver catálogo <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
              <div>
                <h2 className="lp-section-title" style={{ fontSize: 28, fontWeight: 900, color: '#e396bf', margin: 0, fontFamily: '"Playfair Display", Georgia, serif', letterSpacing: '-0.5px' }}>
                  {selectedCat ? getCategoryName(selectedCat) : 'Todos los productos'}
                </h2>
                <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0', letterSpacing: '0.5px' }}>
                  {filtered.length.toLocaleString()} producto{filtered.length !== 1 ? 's' : ''} por llegar
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {filtered.slice(0, visibleCount).map((p, i) => <LleganProntoCard key={p.$id} product={p} apertura={apertura} index={i} categories={categories} onZoom={() => { const src = getProductImageUrl(p); if (src) setZoomImage({ src, alt: p.NAME }); }} />)}
            </div>
            {filtered.length > visibleCount && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <button onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)} style={{
                  padding: '14px 40px', border: '1px solid rgba(227,150,191,0.2)', borderRadius: 50,
                  background: 'rgba(227,150,191,0.1)', backdropFilter: 'blur(8px)',
                  color: '#be185d', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: FF,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  <Package size={16} /> Cargar más ({filtered.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {zoomImage && <ImageZoomModal src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />}
    </div>
  );
}

function LleganProntoCard({ product, apertura, index = 0, categories, onZoom }: { product: Product; apertura: any; index?: number; categories: Category[]; onZoom: () => void }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { displayPrice, hasDiscount, discountPercent } = resolveProductDisplayPrice(product, apertura);
  const img = resolveStorageImageUrl(product.IMAGEURL) || resolveStorageImageUrl(product.IMAGEURL2);
  const isReversed = index % 2 !== 0;
  const catName = categories.find(c => c.$id === product.CATEGORYID)?.name || '';
  const liked = isFavorite(product.$id);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <Link href={`/producto/${product.$id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div className="lp-card-wrap" style={{
        background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', borderRadius: 20, overflow: 'hidden',
        display: 'flex', flexDirection: isReversed ? 'row-reverse' : 'row',
        minHeight: 280, border: `1px solid ${liked ? 'rgba(227,150,191,0.25)' : 'rgba(0,0,0,0.06)'}`,
        transition: 'border-color .3s, box-shadow .3s, transform .3s', cursor: 'pointer',
        boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.02)',
      }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(227,150,191,0.3)'; el.style.boxShadow = '0 12px 40px rgba(227,150,191,0.08), 0 6px 16px rgba(227,150,191,0.05)'; el.style.transform = 'translateY(-4px)'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = liked ? 'rgba(227,150,191,0.25)' : 'rgba(0,0,0,0.06)'; el.style.boxShadow = '0 4px 6px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.02)'; el.style.transform = 'none'; }}
      >
        {/* ── IMAGE SIDE ── */}
        <div
          onClick={e => { if (img) { e.preventDefault(); e.stopPropagation(); onZoom(); } }}
          style={{ width: '42%', minWidth: 220, position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#fdf2f8', cursor: img ? 'zoom-in' : 'default' }}
          className="lp-card-img-side"
        >
          {img ? (
            <>
              {!imgLoaded && <div className="lp-img-skeleton" style={{ position: 'absolute', inset: 0, zIndex: 1 }} />}
              <img className="lp-card-img" src={img} alt={product.NAME}
                onLoad={() => setImgLoaded(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .5s ease, opacity .4s ease', display: 'block', opacity: imgLoaded ? 1 : 0 }}
              />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc' }}><Package size={64} /></div>
          )}
          {/* LLEGAN PRONTO badge */}
          <div className="lp-badge-lp" style={{ position: 'absolute', top: 16, left: 16, padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(227,150,191,0.15)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#e396bf' }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#e396bf', letterSpacing: '1.5px', textTransform: 'uppercase' }}>¡Llegan Pronto!</span>
          </div>
          {hasDiscount && discountPercent > 0 && (
            <div className="lp-disc-badge" style={{ position: 'absolute', top: 48, left: 16 }}>
              <AperturaDiscountBadge percent={discountPercent} size="sm" />
            </div>
          )}
        </div>

        {/* ── INFO SIDE ── */}
        <div className="lp-card-info" style={{ flex: 1, padding: '32px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
          <div>
            {catName && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '2px', textTransform: 'uppercase' }}>{catName}</span>
            )}
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '10px 0 20px', lineHeight: 1.2, fontFamily: '"Playfair Display", serif' }}>
              {product.NAME}
            </h3>
            <div style={{ height: 1, background: 'linear-gradient(90deg, #e396bf 0%, transparent 100%)', width: '55%', marginBottom: 22 }} />

            {/* PRICES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(product.PACKQTY ?? 0) > 0 && (product.PRICE ?? 0) > 0 && (
                <div className="lp-price-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderRadius: 12, background: 'rgba(22,163,74,0.06)', border: '1.5px solid rgba(22,163,74,0.15)' }}>
                  <span className="price-label" style={{ fontSize: 14, fontWeight: 800, color: '#16a34a', letterSpacing: '2px', textTransform: 'uppercase' }}>Precio por Embalaje</span>
                  <span className="price-val-sm" style={{ fontSize: 32, fontWeight: 900, color: '#16a34a', fontFamily: '"Playfair Display", serif', letterSpacing: '-0.5px' }}>
                    {formatPrice(product.PRICE)}
                  </span>
                </div>
              )}
              {product.WHOLESALEPRICE && product.WHOLESALEPRICE > 0 && (
                <div className="lp-price-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderRadius: 12, background: 'rgba(220,38,38,0.04)', border: '1.5px solid rgba(220,38,38,0.12)' }}>
                  <span className="price-label" style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', letterSpacing: '2px', textTransform: 'uppercase' }}>Precio</span>
                  <span className="price-val" style={{ fontSize: 36, fontWeight: 900, color: '#dc2626', fontFamily: '"Playfair Display", serif', letterSpacing: '-1px' }}>
                    {formatPrice(product.WHOLESALEPRICE)}
                  </span>
                </div>
              )}
              {(!product.WHOLESALEPRICE || product.WHOLESALEPRICE <= 0) && (!product.PACKQTY || product.PACKQTY <= 0 || !product.PRICE || product.PRICE <= 0) && displayPrice > 0 && (
                <div className="lp-price-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', border: '1px solid rgba(227,150,191,0.08)' }}>
                  <span className="price-label" style={{ fontSize: 10, fontWeight: 800, color: '#e396bf', letterSpacing: '2px', textTransform: 'uppercase' }}>Precio</span>
                  <span className="price-val" style={{ fontSize: 34, fontWeight: 900, color: '#e396bf', fontFamily: '"Playfair Display", serif', letterSpacing: '-1px' }}>
                    {formatPrice(displayPrice)}
                  </span>
                </div>
              )}
            </div>

            {(product.PACKQTY ?? 0) > 0 && (
              <div className="lp-pack-badge" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, background: 'rgba(22,163,74,0.08)', border: '1.5px solid rgba(22,163,74,0.18)' }}>
                <Package size={15} color="#16a34a" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                  <strong style={{ fontSize: 16, color: '#15803d' }}>{product.PACKQTY}</strong> unidades por paquete
                </span>
              </div>
            )}
          </div>

          {/* LIKE & RESERVE CTA */}
          <button className="lp-cta-btn" onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(product.$id); }} style={{
            marginTop: 24, padding: '15px 0', border: liked ? '1px solid rgba(227,150,191,0.3)' : '1px solid rgba(227,150,191,0.15)', borderRadius: 12,
            background: liked ? 'rgba(227,150,191,0.15)' : 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(8px)',
            color: liked ? '#be185d' : '#e396bf', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            letterSpacing: '1.5px', textTransform: 'uppercase',
            boxShadow: liked ? '0 4px 16px rgba(227,150,191,0.15)' : '0 2px 8px rgba(227,150,191,0.08)',
            position: 'relative', overflow: 'hidden', fontFamily: FF,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all .25s',
          }}>
            <Heart size={16} fill={liked ? '#e396bf' : 'none'} color="#e396bf" style={{ position: 'relative', zIndex: 1 }} />
            <span style={{ position: 'relative', zIndex: 1 }}>
              {liked ? '¡Reservado!' : 'Me gusta · Reservar'}
            </span>
            {!liked && <span style={{
              position: 'absolute', top: 0, left: '-100%', width: '200%', height: '100%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(227,150,191,0.08) 25%, transparent 50%)',
              animation: 'lp-shimmer 2.5s infinite linear',
            }} />}
          </button>
        </div>
      </div>
    </Link>
  );
}
