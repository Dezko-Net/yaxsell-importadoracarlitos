'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, ArrowLeft, Check, AlertCircle, Tag, Sparkles, X, ChevronUp } from 'lucide-react';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { getSkuFromFeatures } from '@/lib/product-features';

const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

interface CanjeProduct {
  $id: string;
  NAME: string;
  DESCRIPTION?: string;
  PRICE: number;
  WHOLESALEPRICE: number;
  IMAGEURL?: string;
  FEATURES?: string | string[];
  TAGS?: string | string[];
  STOCK?: number;
  PACKQTY?: number;
}

interface CanjeInfo {
  hasCredit: boolean;
  creditAmount: number;
  creditWithMargin: number;
  products: CanjeProduct[];
  orders: { id: string; orderCode: string; status: string }[];
}

interface CanjeItem {
  productId: string;
  name: string;
  img: string;
  price: number;
  originalPrice: number;
  qty: number;
}

export default function CanjePage() {
  const router = useRouter();
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [canjeInfo, setCanjeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CanjeItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);

  const loadCanjeInfo = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public-data/canje-info?userId=${encodeURIComponent(user.id)}&email=${encodeURIComponent(user.email)}`);
      if (!res.ok) throw new Error('Error al cargar datos de canje');
      const data = await res.json();
      setCanjeInfo(data);
    } catch (e: any) {
      setError(e.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login?redirect=/canje');
        return;
      }
      loadCanjeInfo();
    }
  }, [user, authLoading, router, loadCanjeInfo]);

  const cartTotal = cart.reduce((s, it) => s + it.price * it.qty, 0);
  const creditAmount = canjeInfo?.creditAmount || 0;
  const creditWithMargin = canjeInfo?.creditWithMargin || 0;
  const remaining = creditWithMargin - cartTotal;
  const isOverLimit = cartTotal > creditWithMargin;

  const addToCart = (product: CanjeProduct) => {
    const price = product.PRICE || 0;
    const pFeatures = Array.isArray(product.FEATURES) ? product.FEATURES.join('\n') : product.FEATURES || '';
    const pTags = Array.isArray(product.TAGS) ? product.TAGS.join(',') : product.TAGS || '';
    const sku = getSkuFromFeatures(pFeatures, pTags, (product as any).jumpseller_id, (product as any).sku);

    setCart(prev => {
      const existing = prev.find(it => it.productId === product.$id);
      if (existing) {
        return prev.map(it => it.productId === product.$id ? { ...it, qty: it.qty + 1 } : it);
      }
      return [...prev, {
        productId: product.$id,
        name: product.NAME,
        price,
        originalPrice: product.PRICE,
        qty: 1,
        img: resolveStorageImageUrl(product.IMAGEURL) || '',
        sku: sku || '',
      }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(it => {
      if (it.productId !== productId) return it;
      const newQty = it.qty + delta;
      return newQty <= 0 ? null as any : { ...it, qty: newQty };
    }).filter(Boolean));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(it => it.productId !== productId));
  };

  const handleConfirm = async () => {
    if (!canjeInfo || cart.length === 0 || isOverLimit) return;
    const order = canjeInfo.orders[0];
    if (!order) return;

    setConfirming(true);
    try {
      const remainingCredit = Math.max(0, creditAmount - cartTotal);
      const res = await fetch('/api/public-data/canje-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          email: user?.email,
          orderId: order.id,
          isWholesale: !!order.isWholesale,
          items: cart,
          remainingCredit: remainingCredit > 0 ? remainingCredit : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al confirmar canje');
      setSuccessMsg(data.message);
      setCart([]);
      setCanjeInfo(null);
    } catch (e: any) {
      setError(e.message || 'Error al confirmar');
    } finally {
      setConfirming(false);
    }
  };

  const filteredProducts = canjeInfo?.products.filter((p: any) =>
    p.NAME?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (successMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-3">¡Canje Completado!</h1>
          <p className="text-gray-600 mb-6">{successMsg}</p>
          <Link href="/cuenta/pedidos" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all">
            Ver mis pedidos
          </Link>
        </div>
      </div>
    );
  }

  if (!canjeInfo?.hasCredit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-gray-400" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-3">No tienes crédito disponible</h1>
          <p className="text-gray-500 mb-6">No hay productos faltantes en negociación asociados a tu cuenta.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-pink-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold text-sm">Volver</span>
          </Link>
          <h1 className="text-lg font-black bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
            Canje de Productos
          </h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Credit Banner */}
        <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-3xl p-6 mb-6 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6 text-white" />
            <h2 className="text-white font-black text-lg">Tu Crédito de Canje</h2>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-4xl font-black text-white">{fmt(creditAmount)}</span>
            <span className="text-pink-100 text-sm">+ {fmt(500)} margen = {fmt(creditWithMargin)} máximo</span>
          </div>
          {canjeInfo.orders.length > 0 && (
            <p className="text-pink-100 text-xs mt-2">
              Pedido en negociación: #{canjeInfo.orders[0].orderCode}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-28 lg:pb-0">
          {/* Products Grid */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Buscar productos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-pink-200 bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm"
              />
            </div>
            <p className="text-gray-500 text-sm mb-4">
              {filteredProducts.length} productos disponibles · Todo a 20% off desde unidad 1
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredProducts.map((p: any) => {
                const discount = p.PRICE - p.WHOLESALEPRICE;
                const inCart = cart.find(it => it.productId === p.$id);
                return (
                  <div key={p.$id} className="bg-white rounded-2xl border border-pink-100 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
                    <div className="relative aspect-square bg-gradient-to-br from-pink-50 to-white">
                      {p.IMAGEURL ? (
                        <img src={resolveStorageImageUrl(p.IMAGEURL)} alt={p.NAME} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="font-bold text-gray-900 text-xs leading-snug line-clamp-2 mb-2 min-h-[32px]">{p.NAME}</h3>
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="font-black text-gray-950 text-base">{fmt(p.PRICE || 0)}</span>
                        <span className="text-[11px] text-gray-400 line-through font-medium hidden">{fmt(p.PRICE)}</span>
                      </div>
                      <button
                        onClick={() => addToCart(p)}
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:brightness-105 active:scale-95 transition-all"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {inCart ? `Agregar más (${inCart.qty})` : 'Agregar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart Sidebar / Drawer */}
          <div className={`lg:sticky lg:top-20 h-fit ${isCartOpen ? 'fixed inset-0 z-[100] flex flex-col justify-end bg-black/50 lg:bg-transparent lg:static lg:z-auto lg:flex-none' : 'hidden lg:block'}`}>
            {isCartOpen && <div className="absolute inset-0 lg:hidden" onClick={() => setIsCartOpen(false)} />}
            <div className="bg-white lg:rounded-3xl rounded-t-3xl border border-pink-100 shadow-lg overflow-hidden relative z-10 flex flex-col max-h-[85vh] lg:max-h-none lg:block">
              <div className="bg-gradient-to-r from-pink-50 to-rose-50 px-5 py-4 border-b border-pink-100 flex justify-between items-center flex-shrink-0">
                <h2 className="font-black text-gray-900 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-pink-500" />
                  Tu Canje
                </h2>
                <button className="lg:hidden p-1 bg-white rounded-full text-gray-500 hover:bg-gray-100" onClick={() => setIsCartOpen(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-400 text-sm">Agrega productos para canjear por tu crédito</p>
                </div>
              ) : (
                <>
                  <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
                    {cart.map(it => (
                      <div key={it.productId} className="flex gap-3 items-center">
                        <img src={it.img} alt={it.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{it.name}</p>
                          <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-xs font-bold text-pink-600">{fmt(it.price)} c/u</span>
                            <span className="text-[10px] text-gray-400 line-through">{fmt(it.originalPrice)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <button onClick={() => updateQty(it.productId, -1)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition">-</button>
                            <span className="text-xs font-bold w-6 text-center">{it.qty}</span>
                            <button onClick={() => updateQty(it.productId, 1)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition">+</button>
                            <button onClick={() => removeFromCart(it.productId)} className="ml-auto text-red-400 hover:text-red-600 text-[11px]">Quitar</button>
                          </div>
                        </div>
                        <span className="text-sm font-black text-gray-900 flex-shrink-0">{fmt(it.price * it.qty)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-pink-100 p-5 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total canje</span>
                      <span className="font-black text-gray-900">{fmt(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600 font-bold">
                      <span>Ahorro total vs precio base</span>
                      <span>-{fmt(cart.reduce((s, it) => s + (it.originalPrice - it.price) * it.qty, 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-4 border-t border-gray-100 pt-3">
                      <span className="text-gray-500">Crédito disponible</span>
                      <span className="font-bold text-gray-700">{fmt(creditAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Margen extra tolerado</span>
                      <span className="font-bold text-gray-500">{fmt(500)}</span>
                    </div>
                    <div className="flex justify-between text-sm bg-gray-50 p-2 rounded-lg">
                      <span className="text-gray-700 font-bold">Límite máximo</span>
                      <span className="font-black text-pink-600">{fmt(creditWithMargin)}</span>
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      {isOverLimit ? (
                        <div className="bg-red-50 rounded-xl p-3 text-center">
                          <p className="text-red-600 font-bold text-sm">⚠️ Excediste el límite</p>
                          <p className="text-red-500 text-xs">Quita {fmt(cartTotal - creditWithMargin)}</p>
                        </div>
                      ) : remaining > 0 ? (
                        <div className="bg-amber-50 rounded-xl p-3 text-center">
                          <p className="text-amber-700 font-bold text-sm">Sobran {fmt(remaining)}</p>
                          <p className="text-amber-600 text-xs">Se guardará como cupón para tu próximo pedido</p>
                        </div>
                      ) : (
                        <div className="bg-green-50 rounded-xl p-3 text-center">
                          <p className="text-green-700 font-bold text-sm">✓ Crédito usado completamente</p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleConfirm}
                      disabled={isOverLimit || confirming || cart.length === 0}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black text-sm flex items-center justify-center gap-2 hover:brightness-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {confirming ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Confirmando...</>
                      ) : (
                        <><Check className="w-4 h-4" /> Confirmar Canje</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Sticky Bottom Bar (Visible only on mobile) */}
        <div className="lg:hidden fixed bottom-16 sm:bottom-0 left-0 right-0 bg-white border-t border-pink-100 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-50 flex items-center justify-between">
          <div onClick={() => setIsCartOpen(true)} className="flex-1 cursor-pointer group">
            <p className="text-xs text-gray-500 font-bold flex items-center gap-1">Ver Canje <ChevronUp className="w-3 h-3 text-pink-500 group-hover:-translate-y-1 transition-transform"/></p>
            <p className="font-black text-lg text-gray-900">{fmt(cartTotal)}</p>
          </div>
          <button
            onClick={handleConfirm}
            disabled={isOverLimit || confirming || cart.length === 0}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:scale-100 active:scale-95"
          >
            {confirming ? 'Confirmando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
