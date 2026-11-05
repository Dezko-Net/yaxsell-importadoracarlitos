'use client';

import { useEffect, useState, useRef } from 'react';
import { formatPrice } from '@/lib/db';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { Sparkles, ShoppingCart, Check, ChevronLeft, ChevronRight, RefreshCw, ArrowRight } from 'lucide-react';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice } from '@/lib/apertura-promo';
import { getSkuFromFeatures } from '@/lib/product-features';
import { extractBrand, HOUSE_BRAND } from '@/lib/brands';
import { getVolumeTiers } from '@/lib/volume-pricing';

export default function LatestProductsCarousel({ initialProducts }: { initialProducts?: Product[] } = {}) {
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [loading, setLoading] = useState(!initialProducts);
  const [addingId, setAddingId] = useState<string | null>(null);
  const { addItem } = useCart();
  const { settings: apertura } = useAperturaPromotion();

  const containerRef = useRef<HTMLDivElement>(null);

  const getScrollAmount = () => {
    const container = containerRef.current;
    if (!container) return 240;
    const card = container.querySelector<HTMLElement>('[data-latest-card]');
    if (!card) return 240;
    const styles = window.getComputedStyle(container);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
    // Scroll by ~2 cards on desktop, 1 on mobile for a natural feel
    const perStep = window.innerWidth >= 768 ? 2 : 1;
    return (card.offsetWidth + gap) * perStep;
  };

  const handleScrollPrev = () => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
    }
  };

  const handleScrollNext = () => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      const sorted = [...initialProducts]
        .filter((p: Product) => p.STOCK !== undefined && p.STOCK > 0)
        .sort((a, b) => new Date(b.$updatedAt || b.$createdAt || 0).getTime() - new Date(a.$updatedAt || a.$createdAt || 0).getTime())
        .slice(0, 24);
      setProducts(sorted);
      setLoading(false);
      return;
    }
    const loadNewest = async () => {
      try {
        const res = await fetch('/api/public-data/products?sortBy=updated&limit=24');
        if (res.ok) {
          const data = await res.json();
          const activeProducts = (data.products || []).filter((p: Product) => p.STOCK !== undefined && p.STOCK > 0);
          setProducts(activeProducts);
        }
      } catch (err) {
        console.error('[LatestProducts] Error fetching:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNewest();
  }, [initialProducts]);

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    setAddingId(product.$id);
    addItem(product);
    setTimeout(() => {
      setAddingId(null);
    }, 1000);
  };

  if (loading) {
    return (
      <div className="w-full py-10 flex flex-col items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#e396bf]"></div>
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="latest-section w-full relative">
      <style dangerouslySetInnerHTML={{ __html: `
        /* 🎀 Sección full-bleed (todo el ancho, sin caja centrada).
           El contenedor #yaxsell-latest-products-root ya aporta 40px vert. */
        .latest-section {
          padding: 12px 0 16px;
          background: linear-gradient(180deg, #ffffff 0%, #fdf4f8 46%, #ffffff 100%);
        }
        .latest-head {
          display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
          margin: 0 0 20px;
          padding: 0 clamp(16px, 4vw, 44px);
        }
        .latest-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          font-weight: 900; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
          color: #c0547a; margin-bottom: 8px;
        }
        .latest-title {
          font-size: clamp(21px, 3.4vw, 30px); font-weight: 900; line-height: 1.08;
          letter-spacing: -0.03em; color: #111827; margin: 0;
        }
        .latest-title span { color: #c0547a; }
        .latest-seeall {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 800; color: #c0547a; text-decoration: none;
          background: #fff; border: 1.5px solid #fbcfe8; border-radius: 999px;
          padding: 9px 16px; white-space: nowrap; transition: all 0.25s ease;
        }
        .latest-seeall:hover { background: linear-gradient(135deg,#e396bf,#c0547a); color: #fff; border-color: transparent; transform: translateX(2px); }

        .latest-carousel-wrapper { position: relative; width: 100%; }
        .latest-carousel-wrapper::before,
        .latest-carousel-wrapper::after {
          content: ""; position: absolute; top: 0; bottom: 26px; width: clamp(16px, 4vw, 44px);
          z-index: 8; pointer-events: none;
        }
        .latest-carousel-wrapper::before { left: 0; background: linear-gradient(to right, #fdf4f8, transparent); }
        .latest-carousel-wrapper::after { right: 0; background: linear-gradient(to left, #fdf4f8, transparent); }

        .latest-carousel-container {
          display: flex !important; overflow-x: auto !important; scroll-behavior: smooth !important;
          gap: 16px !important;
          padding: 8px clamp(16px, 4vw, 44px) 26px !important;
          scroll-padding-left: clamp(16px, 4vw, 44px) !important;
          scrollbar-width: none !important; -ms-overflow-style: none !important;
          -webkit-overflow-scrolling: touch !important;
        }
        .latest-carousel-container::-webkit-scrollbar { display: none !important; }

        .latest-product-card { width: clamp(180px, 62vw, 216px) !important; flex-shrink: 0 !important; }
        @media (min-width: 640px) { .latest-product-card { width: clamp(200px, 30vw, 224px) !important; } }
        @media (min-width: 1024px) { .latest-product-card { width: clamp(210px, 17vw, 238px) !important; } }

        .latest-nav-btn {
          position: absolute; top: calc(50% - 13px); transform: translateY(-50%); z-index: 20;
          width: 46px; height: 46px; border-radius: 999px; cursor: pointer;
          display: none; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
          border: 1.5px solid #fbcfe8; color: #c0547a;
          box-shadow: 0 6px 18px rgba(192,84,122,0.14);
          opacity: 0; transition: all 0.28s ease;
        }
        .group\\/wrapper:hover .latest-nav-btn { opacity: 1; }
        .latest-nav-btn:hover { background: linear-gradient(135deg,#e396bf,#c0547a); color: #fff; border-color: transparent; }
        .latest-nav-btn:active { transform: translateY(-50%) scale(0.94); }
        @media (min-width: 768px) { .latest-nav-btn { display: flex; } }
        .latest-nav-prev { left: clamp(6px, 2vw, 18px); }
        .latest-nav-next { right: clamp(6px, 2vw, 18px); }

        .animate-spin-slow { animation: spin 1.8s linear infinite; }
      `}} />

      {/* Header */}
      <div className="latest-head">
        <div>
          <span className="latest-eyebrow">
            <Sparkles size={14} className="animate-pulse" />
            Novedades y Reingresos
          </span>
          <h2 className="latest-title">Recién llegados <span>&amp; reingresos</span></h2>
        </div>
        <a href="/productos" className="latest-seeall">
          Ver todos <ArrowRight size={15} />
        </a>
      </div>

      {/* Carousel — full width */}
      <div className="latest-carousel-wrapper group/wrapper">
        <button onClick={handleScrollPrev} className="latest-nav-btn latest-nav-prev" aria-label="Anterior">
          <ChevronLeft size={22} />
        </button>
        <button onClick={handleScrollNext} className="latest-nav-btn latest-nav-next" aria-label="Siguiente">
          <ChevronRight size={22} />
        </button>

        <div ref={containerRef} className="latest-carousel-container snap-x">
          {products.map((p, idx) => {
            const pricing = resolveProductDisplayPrice(p, apertura);
            const displayPrice = pricing.displayPrice;
            const hasDiscount = pricing.hasDiscount && pricing.originalPrice != null && pricing.originalPrice > displayPrice;
            const isAdding = addingId === p.$id;

            const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES;
            const pTags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS;
            const cardSku = getSkuFromFeatures(pFeatures, pTags, (p as any).jumpseller_id, p.SKU || (p as any).sku);
            const pBrand = p.BRAND || extractBrand(p.NAME) || HOUSE_BRAND;
            const isSadoer = pBrand.toLowerCase() === 'sadoer';
            const badgeBg = isSadoer ? '#ffeef2' : '#f4f4f5';
            const badgeColor = isSadoer ? '#b36b7c' : '#52525b';
            const outOfStock = p.STOCK !== undefined && p.STOCK === 0;
            const lowStock = p.STOCK !== undefined && p.STOCK > 0 && p.STOCK <= 10;

            const createdAt = new Date(p.$createdAt || '').getTime();
            const now = Date.now();
            const isNew = (now - createdAt < 7 * 24 * 60 * 60 * 1000) || (idx < 4);

            // 📦 Pista de precio por volumen: mejor nivel (por mayor / caja)
            const tiers = getVolumeTiers(p);
            const bestTier = tiers.length > 1 ? tiers[tiers.length - 1] : null;

            return (
              <div key={`latest-carousel-${p.$id}-${idx}`} data-latest-card className="latest-product-card snap-start group">
                <div className="relative h-full rounded-[20px] overflow-hidden flex flex-col border border-[#f7d3e3] shadow-[0_3px_12px_rgba(192,84,122,0.07)] transition-all duration-300 hover:shadow-[0_18px_42px_rgba(192,84,122,0.16)] hover:-translate-y-1.5 hover:border-[#f2b4d0] will-change-transform" style={{ background: 'linear-gradient(180deg,#fff8fb 0%,#fdeef5 100%)' }}>
                  <a href={`/productos/${p.$id}`} className="block relative overflow-hidden aspect-square bg-gradient-to-br from-pink-50 via-white to-rose-50/80">
                    {p.IMAGEURL ? (
                      <img
                        src={p.IMAGEURL}
                        alt={p.NAME}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.09]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-200 text-4xl">📦</div>
                    )}

                    {/* Badge Nuevo / Reingreso */}
                    <div className="absolute top-3 left-3 z-10">
                      {isNew ? (
                        <span className="bg-gradient-to-br from-[#e79ec6] to-[#c0547a] text-white font-black text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wide shadow-md shadow-pink-500/25 flex items-center gap-1 ring-1 ring-white/40">
                          <Sparkles size={10} /> Nuevo
                        </span>
                      ) : (
                        <span className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wide shadow-md shadow-emerald-500/25 flex items-center gap-1 ring-1 ring-white/40">
                          <RefreshCw size={9} className="animate-spin-slow" /> Reingreso
                        </span>
                      )}
                    </div>

                    {/* Descuento real (CURRENTPRICE), no artificial */}
                    {hasDiscount && (
                      <span className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-sm text-[#c0547a] font-black text-[10px] px-2 py-1 rounded-full shadow-sm ring-1 ring-pink-100">
                        -{pricing.discountPercent}%
                      </span>
                    )}

                    {outOfStock && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center z-10">
                        <span className="px-3.5 py-1.5 bg-white text-rose-600 rounded-full text-xs font-black border border-rose-100">Sin stock</span>
                      </div>
                    )}
                  </a>

                  <div className="p-3.5 flex-1 flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {pBrand && (
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                          {pBrand}
                        </span>
                      )}
                      {cardSku && (
                        <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, whiteSpace: 'nowrap' }}>SKU {cardSku}</span>
                      )}
                    </div>

                    <a href={`/productos/${p.$id}`} className="no-underline">
                      <h3 className="font-bold text-gray-900 text-[13px] leading-snug line-clamp-2 mb-2 group-hover:text-pink-700 transition-colors min-h-[34px]">
                        {p.NAME}
                      </h3>
                    </a>

                    {/* Stock */}
                    <div className="flex items-center gap-1.5 mb-2.5" style={{ fontSize: 10.5, fontWeight: 700, color: outOfStock ? '#9ca3af' : lowStock ? '#d97706' : '#059669' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                      {outOfStock ? 'Sin stock' : lowStock ? `Quedan ${p.STOCK} unidades` : 'Stock disponible'}
                    </div>

                    <div className="mt-auto">
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="font-black text-gray-950 text-[19px] leading-none tracking-tight">
                          {formatPrice(displayPrice)}
                        </span>
                        <span className="text-[11px] text-gray-400 font-semibold">c/u</span>
                        {hasDiscount && (
                          <span className="text-[11px] text-gray-400 line-through leading-none">
                            {formatPrice(pricing.originalPrice!)}
                          </span>
                        )}
                      </div>

                      {/* Pista de precio por volumen */}
                      {bestTier ? (
                        <div className="mb-2.5" style={{ fontSize: 10.5, fontWeight: 700, color: '#9d5878' }}>
                          Desde <span style={{ color: '#c0547a', fontWeight: 900 }}>{formatPrice(bestTier.unitPrice)}</span> c/u · {bestTier.minQty}+ un
                        </div>
                      ) : (
                        <div className="mb-2.5" style={{ height: 1 }} />
                      )}

                      <button
                        onClick={(e) => handleAddToCart(e, p)}
                        disabled={outOfStock}
                        className={`w-full py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                          outOfStock
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : isAdding
                            ? 'bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.25)]'
                            : 'bg-gradient-to-br from-[#e79ec6] to-[#c0547a] text-white shadow-[0_8px_20px_rgba(236,72,153,0.25)] hover:brightness-105'
                        }`}
                      >
                        {outOfStock ? (
                          <><ShoppingCart size={12} /> Sin stock</>
                        ) : isAdding ? (
                          <><Check size={13} strokeWidth={3} /> Listo</>
                        ) : (
                          <><ShoppingCart size={12} /> Agregar</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
