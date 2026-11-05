'use client';

import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/db';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { Tag, ShoppingCart, Check, Percent } from 'lucide-react';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice } from '@/lib/apertura-promo';

export default function WholesaleOffersSection({ initialProducts }: { initialProducts?: Product[] } = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const { addItem } = useCart();
  const { settings: apertura } = useAperturaPromotion();

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const configRes = await fetch('/api/ofertas');
        if (!configRes.ok) throw new Error();
        const configData = await configRes.json();
        const productIds: string[] = configData.productIds || [];

        if (productIds.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        if (initialProducts && initialProducts.length > 0) {
          const filtered = initialProducts.filter(
            (p: Product) => productIds.includes(p.$id) && p.STOCK !== undefined && p.STOCK > 0
          );
          setProducts(filtered);
          setLoading(false);
          return;
        }

        const prodRes = await fetch(`/api/public-data/products?ids=${productIds.join(',')}`);
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          const filtered = (prodData.products || []).filter(
            (p: Product) => p.STOCK !== undefined && p.STOCK > 0
          );
          setProducts(filtered);
        }
      } catch (err) {
        console.error('[WholesaleOffersSection] Error fetching:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [initialProducts]);

  const handleAddToCart = (e: React.MouseEvent, product: Product, quantity: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (addingId) return;

    addItem(product, quantity);
    setAddingId(`${product.$id}-${quantity}`);

    setTimeout(() => {
      setAddingId(null);
      const cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer) {
        cartDrawer.setAttribute('data-hidden', 'false');
        cartDrawer.removeAttribute('inert');
        document.documentElement.style.overflow = 'hidden';
      }
    }, 800);
  };

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[250px]">
        <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-pink-500"></div>
        <p className="text-xs text-gray-500 mt-4 font-semibold uppercase tracking-wider">
          Cargando ofertas al por mayor...
        </p>
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-10 relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-2">
        <div>
          <div className="flex items-center gap-2 text-pink-600 font-extrabold text-xs uppercase tracking-widest mb-1.5 bg-pink-50 border border-pink-100 rounded-full px-3.5 py-1 w-fit">
            <Percent size={13} className="animate-pulse" />
            Ofertas por Mayor
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-950 tracking-tight leading-tight">
            Grandes Ofertas: Compra Más y Paga Menos
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 font-medium">
            Precios especiales de mayorista a partir de las cantidades indicadas.
          </p>
        </div>
      </div>

      {/* Grid: 2 per row on large screens, 1 on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {products.map(p => {
          const pricing = resolveProductDisplayPrice(p, apertura);
          const normalDisplayPrice = pricing.displayPrice;

          const hasWholesale =
            p.WHOLESALEPRICE && p.WHOLESALEPRICE > 0 &&
            p.WHOLESALEMINQUANTITY && p.WHOLESALEMINQUANTITY > 0;
          const wholesalePrice = p.WHOLESALEPRICE || 0;
          const wholesaleMinQty = p.WHOLESALEMINQUANTITY || 1;

          const pFeatures = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES || '';
          const isExact = /ExactWholesale:\s*true/i.test(pFeatures);

          const discountPercent = hasWholesale
            ? Math.round(((normalDisplayPrice - wholesalePrice) / normalDisplayPrice) * 100)
            : 0;
          const savingsPerUnit = hasWholesale ? normalDisplayPrice - wholesalePrice : 0;
          const totalSavings = savingsPerUnit * wholesaleMinQty;

          const isAddingSingle = addingId === `${p.$id}-1`;
          const isAddingWholesale = addingId === `${p.$id}-${wholesaleMinQty}`;
          const productUrl = `/producto/${p.$id}`;

          return (
            <a
              key={`wholesale-offer-${p.$id}`}
              href={productUrl}
              className="relative bg-white rounded-3xl border border-pink-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_50px_rgba(236,72,153,0.12)] hover:-translate-y-1.5 hover:border-pink-200 transition-all duration-500 flex flex-col overflow-hidden group"
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}
            >
              {/* Product Image Column */}
              <div className="relative w-full aspect-[16/10] bg-gradient-to-br from-pink-50 via-white to-rose-50 overflow-hidden shrink-0">
                {p.IMAGEURL ? (
                  <img
                    src={p.IMAGEURL}
                    alt={p.NAME}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">📦</div>
                )}

                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent pointer-events-none" />

                {/* Floating Discount Tag */}
                {hasWholesale && discountPercent > 0 && (
                  <div className="absolute top-4 left-4 bg-gradient-to-br from-pink-500 to-rose-600 text-white font-black text-[11px] sm:text-sm px-3.5 py-2 rounded-2xl shadow-lg shadow-pink-500/30 z-10 flex items-center gap-1.5 ring-2 ring-white/40">
                    <Tag size={13} strokeWidth={2.5} />
                    -{discountPercent}%
                  </div>
                )}

                {/* "Mayorista" ribbon bottom */}
                {hasWholesale && (
                  <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm text-pink-700 font-black text-[9px] sm:text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full shadow-md z-10 flex items-center gap-1">
                    <Percent size={10} strokeWidth={3} />
                    Precio Mayor
                  </div>
                )}
              </div>

              {/* Product Info Column */}
              <div className="p-5 sm:p-6 flex flex-col justify-between flex-1 min-w-0">
                <div className="space-y-2">
                  {p.SKU && (
                    <span className="font-mono text-[10px] font-bold text-gray-400 tracking-wider">
                      SKU: {p.SKU}
                    </span>
                  )}
                  <h3 className="font-black text-gray-900 text-base sm:text-lg group-hover:text-pink-600 line-clamp-2 transition-colors duration-200 leading-snug">
                    {p.NAME}
                  </h3>

                  {/* Prices Display */}
                  {hasWholesale ? (
                    <div className="relative bg-gradient-to-br from-pink-50 to-rose-50/60 border border-pink-100 rounded-2xl p-3.5 mt-1 overflow-hidden">
                      {/* Unit price reference (struck) */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-gray-400 font-semibold line-through">
                          {formatPrice(normalDisplayPrice)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">precio por unidad</span>
                      </div>

                      {/* Wholesale hero price */}
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-2xl sm:text-3xl font-black text-pink-600 tracking-tight leading-none">
                          {formatPrice(wholesalePrice)}
                        </span>
                        <span className="text-[11px] sm:text-xs font-bold text-pink-500">
                          c/u
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500">
                          {isExact
                            ? `· llevando exactamente ${wholesaleMinQty} un.`
                            : `· desde ${wholesaleMinQty} unidades`}
                        </span>
                      </div>

                      {/* Savings highlight */}
                      {savingsPerUnit > 0 && (
                        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-pink-100">
                          <span className="bg-green-500 text-white text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full">
                            Ahorras {formatPrice(savingsPerUnit)} c/u
                          </span>
                          <span className="text-[10px] text-green-600 font-bold">
                            ≈ {formatPrice(totalSavings)} en total
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5 py-1">
                      <span className="text-2xl font-black text-gray-900 tracking-tight">
                        {formatPrice(normalDisplayPrice)}
                      </span>
                      <span className="text-[11px] font-bold text-gray-400">por unidad</span>
                    </div>
                  )}
                </div>

                {/* Purchase Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch gap-2.5 mt-4">
                  {hasWholesale && (
                    <button
                      onClick={(e) => handleAddToCart(e, p, wholesaleMinQty)}
                      disabled={isAddingWholesale}
                      className={`flex-[1.4] py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all duration-300 flex items-center justify-center gap-2 ${
                        isAddingWholesale
                          ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                          : 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/25 hover:shadow-xl hover:shadow-pink-500/35 hover:brightness-105 active:scale-[0.98]'
                      }`}
                    >
                      {isAddingWholesale ? (
                        <>
                          <Check size={15} strokeWidth={3} />
                          ¡Añadido!
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={15} strokeWidth={2.5} />
                          Llevar {wholesaleMinQty} un.
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={(e) => handleAddToCart(e, p, 1)}
                    disabled={isAddingSingle}
                    className={`flex-1 py-3.5 px-4 rounded-2xl font-extrabold text-xs uppercase tracking-wide transition-all duration-300 flex items-center justify-center gap-2 border-2 ${
                      isAddingSingle
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-white border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 active:scale-[0.98]'
                    }`}
                    title="Añadir 1 unidad"
                  >
                    {isAddingSingle ? (
                      <Check size={15} strokeWidth={3} />
                    ) : (
                      <>
                        <ShoppingCart size={15} />
                        Llevar 1 un.
                      </>
                    )}
                  </button>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
