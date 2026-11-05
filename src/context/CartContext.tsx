'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback, useRef } from 'react';
import { CartItem, Product } from '@/types';
import { useToast } from '@/components/Toast';
import { resolveProductDisplayPrice, applyWebPrice, isDisableDiscounts } from '@/lib/apertura-promo';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { hasVolumePricing, resolveVolumeUnitPrice } from '@/lib/volume-pricing';
import { useAuth } from '@/hooks/useAuth';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { Query, ID } from '@/lib/db';

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, qty?: number, timedOfferPrice?: number, timedOfferExpiresAt?: number, wholesalePrice?: number, isPack?: boolean) => void;
  addBundleItem: (product: Product, bundleId: string, bundleInstanceId: string, bundleTitle: string, unitPrice: number, originalUnitPrice: number) => void;
  hasPackItems: boolean;
  removeItem: (productId: string, bundleInstanceId?: string | null) => void;
  updateQuantity: (productId: string, qty: number, isPack?: boolean, stockOverride?: number, matchIsPack?: boolean, bundleInstanceId?: string | null) => void;
  clearCart: () => void;
  updateCartWithLiveProducts: (liveProducts: Product[]) => void;
  totalItems: number;
  subtotal: number;
  catalogSubtotal: number;
  aperturaSavings: number;
  getEffectivePrice: (item: CartItem) => number;
  getEffectiveItemTotal: (item: CartItem) => number;
}

// Legacy per-item collection (kept for admin backward compat on read)
const CART_ITEMS_COLLECTION = 'cart_items';
// New: single-document snapshot per user for admin visibility
const CART_SNAPSHOTS_COLLECTION = 'cart_snapshots';

export function isSameProductItem(a: CartItem, b: CartItem): boolean {
  if (!a?.product || !b?.product) return false;
  const aId = a.product.$id;
  const aSku = a.product.SKU;
  const bId = b.product.$id;
  const bSku = b.product.SKU;

  const matchIdOrSku = Boolean(
    (aId && bId && aId === bId) ||
    (aSku && bSku && aSku === bSku) ||
    (aId && bSku && aId === bSku) ||
    (aSku && bId && aSku === bId)
  );

  const matchPack = Boolean(a.isPack) === Boolean(b.isPack);
  const aBundle = a.bundleInstanceId || a.bundleId || '';
  const bBundle = b.bundleInstanceId || b.bundleId || '';
  return matchIdOrSku && matchPack && aBundle === bBundle;
}

export function deduplicateCartItems(list: CartItem[]): CartItem[] {
  const result: CartItem[] = [];
  for (const item of list) {
    if (!item || !item.product || typeof item.product !== 'object') continue;
    const hasIdentifier = Boolean(item.product.$id || item.product.SKU);
    if (!hasIdentifier) continue;

    const existing = result.find(r => isSameProductItem(r, item));
    if (existing) {
      existing.quantity = (existing.quantity || 0) + (item.quantity || 1);
      if (!existing.product.IMAGEURL && item.product.IMAGEURL) existing.product.IMAGEURL = item.product.IMAGEURL;
      if (!existing.product.NAME && item.product.NAME) existing.product.NAME = item.product.NAME;
      if (!existing.product.PRICE && item.product.PRICE) existing.product.PRICE = item.product.PRICE;
      if (!existing.product.SKU && item.product.SKU) existing.product.SKU = item.product.SKU;
      if (!existing.product.$id && item.product.$id) existing.product.$id = item.product.$id;
    } else {
      result.push({ ...item });
    }
  }
  return result;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const { showToast } = useToast();
  const { settings: apertura } = useAperturaPromotion();
  const { user, isLoggedIn } = useAuth();
  const { unlimitedStock } = useStoreSettings();
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotDocIdRef = useRef<string | null>(null);
  const itemsRef = useRef<CartItem[]>([]);

  // Keep itemsRef in sync with items state
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Helper to sync CartContext to db_cart_importadora_carlitos (standalone catalog)
  const syncToAppCart = useCallback((cartItems: CartItem[]) => {
    try {
      const appKey = 'db_cart_importadora_carlitos';
      const mapped = cartItems.map(item => ({
        id: item.product.$id,
        sku: item.product.SKU || item.product.$id,
        name: item.product.NAME,
        price: Number(item.bundleUnitPrice ?? (item.product as any)?.WEBPRICE ?? (item.product as any)?.web_price ?? item.wholesalePrice ?? item.product.PRICE ?? 0),
        qty: item.quantity,
        image: item.product.IMAGEURL || '',
        mode: item.isPack ? 'box' : (item.wholesalePrice ? 'wholesale' : 'public'),
        vendorId: (item.product as any).VENDOR_ID || '',
        stock: item.product.STOCK,
        bundleId: item.bundleId,
        bundleInstanceId: item.bundleInstanceId,
        bundleTitle: item.bundleTitle,
        bundleUnitPrice: item.bundleUnitPrice,
        bundleOriginalUnitPrice: item.bundleOriginalUnitPrice,
        bundlePackQty: item.bundlePackQty,
        bundlePackPrice: item.bundlePackPrice,
      }));
      localStorage.setItem(appKey, JSON.stringify(mapped));

      if (typeof window !== 'undefined') {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          try {
            iframe.contentWindow?.postMessage({ type: 'YAXSEL_CART_SYNC_FROM_PARENT', items: cartItems }, '*');
          } catch {}
        });
      }
    } catch {}
  }, []);

  // Load cart from localStorage on mount (with db_cart_importadora_carlitos fallback)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('importadora_carlitos_cart_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(item => item && item.product && typeof item.product === 'object' && (item.product.$id || item.product.SKU));
          const deduplicated = deduplicateCartItems(valid);
          setItems(deduplicated);
          return;
        }
      }
      // Fallback: check db_cart_importadora_carlitos if importadora_carlitos_cart_v1 was empty
      const appStored = localStorage.getItem('db_cart_importadora_carlitos');
      if (appStored) {
        const appParsed = JSON.parse(appStored);
        if (Array.isArray(appParsed) && appParsed.length > 0) {
          const converted: CartItem[] = appParsed.map((item: any) => ({
            product: {
              $id: item.id || item.sku,
              SKU: item.sku,
              NAME: item.name,
              PRICE: item.price,
              IMAGEURL: item.image,
              VENDOR_ID: item.vendorId || '__MAIN__',
              STOCK: item.stock ?? 99999
            } as any,
            quantity: item.qty || 1,
            wholesalePrice: item.mode === 'wholesale' ? item.price : undefined,
            isPack: item.mode === 'box',
            bundleId: item.bundleId,
            bundleInstanceId: item.bundleInstanceId,
            bundleTitle: item.bundleTitle,
            bundleUnitPrice: item.bundleUnitPrice,
            bundleOriginalUnitPrice: item.bundleOriginalUnitPrice,
            bundlePackQty: item.bundlePackQty,
            bundlePackPrice: item.bundlePackPrice,
          }));
          const deduplicated = deduplicateCartItems(converted);
          setItems(deduplicated);
          localStorage.setItem('importadora_carlitos_cart_v1', JSON.stringify(deduplicated));
        }
      }
    } catch {}
  }, []);

  // Save to localStorage and sync to db_cart_importadora_carlitos
  useEffect(() => {
    localStorage.setItem('importadora_carlitos_cart_v1', JSON.stringify(items));
    syncToAppCart(items);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('importadora-carlitos:cart-updated'));
    }
  }, [items, syncToAppCart]);

  // Listen to external cart sync events (from iframe catalog or another tab)
  useEffect(() => {
    const handleSyncMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'YAXSEL_CART_SYNC' && Array.isArray(e.data.items)) {
        const valid = e.data.items.filter(
          (item: any) => item && item.product && typeof item.product === 'object' && (item.product.$id || item.product.SKU)
        );
        const deduplicated = deduplicateCartItems(valid);
        setItems(deduplicated);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'importadora_carlitos_cart_v1' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(item => item && item.product && typeof item.product === 'object' && (item.product.$id || item.product.SKU));
            const deduplicated = deduplicateCartItems(valid);
            setItems(deduplicated);
          }
        } catch {}
      }
    };
    const handleCustomUpdate = () => {
      try {
        const stored = localStorage.getItem('importadora_carlitos_cart_v1');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(item => item && item.product && typeof item.product === 'object' && (item.product.$id || item.product.SKU));
            const deduplicated = deduplicateCartItems(valid);
            setItems(prev => {
              if (JSON.stringify(prev) === JSON.stringify(deduplicated)) return prev;
              return deduplicated;
            });
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleSyncMessage);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('importadora-carlitos:cart-updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('message', handleSyncMessage);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('importadora-carlitos:cart-updated', handleCustomUpdate);
    };
  }, []);

  const getEffectiveItemTotal = (item: CartItem): number => {
    const now = Date.now();
    const webPrice = Number((item.product as any)?.WEBPRICE ?? (item.product as any)?.web_price ?? 0);

    if (item.bundleId && Number.isFinite(Number(item.bundleUnitPrice))) {
      const discountedQty = Math.min(item.quantity, Math.max(1, Number(item.bundlePackQty) || 1));
      const extraQty = Math.max(0, item.quantity - discountedQty);
      const discountedTotal = Number(item.bundleUnitPrice) * discountedQty;
      if (!extraQty) return discountedTotal;
      const regularItem: CartItem = {
        ...item,
        bundleId: undefined,
        bundleInstanceId: undefined,
        bundleTitle: undefined,
        bundleUnitPrice: undefined,
        bundleOriginalUnitPrice: undefined,
        bundlePackQty: undefined,
        bundlePackPrice: undefined,
        quantity: extraQty,
      };
      return discountedTotal + getEffectiveItemTotal(regularItem);
    }
    
    if (item.timedOfferPrice && item.timedOfferExpiresAt && now < item.timedOfferExpiresAt) {
      return item.timedOfferPrice * item.quantity;
    }

    // 🌐 REGLA DE NEGOCIO: Si el producto tiene precio web exclusivo (WEBPRICE), se respeta al 100%
    if (webPrice > 0) {
      return webPrice * item.quantity;
    }
    
    if (item.wholesalePrice !== undefined && (item.isPack || !item.product.WHOLESALEMINQUANTITY || item.product.WHOLESALEMINQUANTITY <= 1 || item.quantity >= item.product.WHOLESALEMINQUANTITY)) {
      return item.wholesalePrice * item.quantity;
    }
    
    // 📦 Precios por volumen (detalle/mayor/caja según cantidad).
    // Reemplaza al viejo wholesale + el descuento artificial de pack (20%),
    // que fue ELIMINADO: ya no existe ningún descuento fabricado en el código.
    // Va ANTES que isPack: con Paquetes oculto, el flag isPack de carritos
    // guardados no debe pisar el nivel de volumen (p. ej. precio caja).
    if (hasVolumePricing(item.product)) {
      return resolveVolumeUnitPrice(item.product, item.quantity) * item.quantity;
    }

    // Los productos de vendors pueden tener un descuento porcentual por
    // cantidad mínima. El detalle del carrito ya lo mostraba, pero el subtotal
    // usaba el precio base; eso dejaba el pedido y su comprobante descuadrados.
    const packDiscountPct = Number((item.product as any).PACK_DISCOUNT_PCT) || 0;
    const packMinQty = Number((item.product as any).PACK_MIN_PACKS) || 0;
    if (packDiscountPct > 0 && packMinQty > 0 && item.quantity >= packMinQty && !isDisableDiscounts(item.product)) {
      const basePrice = resolveProductDisplayPrice(item.product, apertura).displayPrice;
      const discountedPrice = Math.round(basePrice * (1 - packDiscountPct / 100));
      if (discountedPrice > 0 && discountedPrice < basePrice) return discountedPrice * item.quantity;
    }

    if (item.isPack) {
      const base = item.product.PRICE || 0;
      const packPrice = item.product.WHOLESALEPRICE && item.product.WHOLESALEPRICE > 0 ? item.product.WHOLESALEPRICE : base;
      return packPrice * item.quantity;
    }

    const pFeatures = Array.isArray(item.product.FEATURES) ? item.product.FEATURES.join('\n') : item.product.FEATURES || '';
    const isExact = /ExactWholesale:\s*true/i.test(pFeatures);
    const minQty = item.product.WHOLESALEMINQUANTITY || 0;
    const qtyMatches = isExact ? item.quantity === minQty : item.quantity >= minQty;
    const hasConfiguredWholesale = !!(item.product.WHOLESALEPRICE && item.product.WHOLESALEMINQUANTITY);

    if (hasConfiguredWholesale && qtyMatches) {
      return item.product.WHOLESALEPRICE! * item.quantity;
    }

    const basePriceDisplay = resolveProductDisplayPrice(item.product, apertura).displayPrice;
    return basePriceDisplay * item.quantity;
  };

  const getEffectivePrice = (item: CartItem): number => {
    if (item.quantity === 0) return 0;
    return Math.round(getEffectiveItemTotal(item) / item.quantity);
  };

  const addItem = (product: Product, qty = 1, timedOfferPrice?: number, timedOfferExpiresAt?: number, wholesalePrice?: number, isPack?: boolean) => {
    // Actualización funcional sobre `prev`: los listeners DOM de las plantillas
    // capturan un addItem viejo, y mirar `items` del closure creaba filas
    // duplicadas del mismo producto en clicks consecutivos.
    setItems(prev => {
      const candidate: CartItem = { product, quantity: qty, timedOfferPrice, timedOfferExpiresAt, wholesalePrice, isPack };
      const existing = prev.find(i => isSameProductItem(i, candidate));
      if (existing) {
        const isLimited = product.STOCK !== undefined && product.STOCK !== null && product.STOCK < 99999;
        const maxStock = isLimited ? product.STOCK : 99999;
        const newQty = (!isLimited && unlimitedStock) ? (existing.quantity + qty) : Math.min(existing.quantity + qty, maxStock as number);
        return prev.map(i => isSameProductItem(i, candidate) ? { ...i, quantity: newQty, wholesalePrice, isPack: isPack ?? i.isPack } : i);
      }
      return [...prev, candidate];
    });
  };

  const addBundleItem = useCallback((
    product: Product,
    bundleId: string,
    bundleInstanceId: string,
    bundleTitle: string,
    unitPrice: number,
    originalUnitPrice: number,
  ) => {
    if (!bundleId || !bundleInstanceId || !product?.$id) return;
    const price = Math.max(0, Math.round(Number(unitPrice) || 0));
    const originalPrice = Math.max(price, Math.round(Number(originalUnitPrice) || 0));
    if (price <= 0) return;
    setItems(prev => [...prev, {
      product,
      quantity: 1,
      bundleId,
      bundleInstanceId,
      bundleTitle,
      bundleUnitPrice: price,
      bundleOriginalUnitPrice: originalPrice,
      bundlePackQty: 1,
      bundlePackPrice: price,
    }]);
  }, []);

  const hasPackItems = items.some(i => i.isPack === true);

  const removeItem = (productId: string, bundleInstanceId?: string | null) => {
    setItems(prev => prev.filter(i => {
      if (bundleInstanceId) return i.bundleInstanceId !== bundleInstanceId;
      const idMatches = i.product.$id === productId || (i.product.SKU && i.product.SKU === productId);
      if (bundleInstanceId === null) return !idMatches || Boolean(i.bundleInstanceId || i.bundleId);
      return !idMatches;
    }));
  };

  const updateQuantity = (productId: string, qty: number, isPack?: boolean, stockOverride?: number, matchIsPack?: boolean, bundleInstanceId?: string | null) => {
    if (qty <= 0) { removeItem(productId, bundleInstanceId); return; }
    setItems(prev => prev.map(i => {
      const idMatch = i.product.$id === productId || (i.product.SKU && i.product.SKU === productId);
      const matchBundle = bundleInstanceId === undefined || (bundleInstanceId === null
        ? !i.bundleInstanceId && !i.bundleId
        : i.bundleInstanceId === bundleInstanceId);
      const match = idMatch && matchBundle && (matchIsPack === undefined || Boolean(i.isPack) === Boolean(matchIsPack));
      if (!match) return i;
      const product = stockOverride === undefined ? i.product : { ...i.product, STOCK: stockOverride, stock: stockOverride };
      const isLimited = product.STOCK !== undefined && product.STOCK !== null && product.STOCK < 99999;
      const maxStock = isLimited ? product.STOCK : 99999;
      return { 
        ...i, 
        product,
        quantity: (!isLimited && unlimitedStock) ? qty : Math.min(qty, maxStock),
        isPack: isPack !== undefined ? isPack : i.isPack
      };
    }));
  };

  const updateCartWithLiveProducts = (liveProducts: Product[]) => {
    setItems(prev => {
      const newItems = prev.map(item => {
        const liveMatch = liveProducts.find(p => p.$id === item.product.$id);
        if (!liveMatch) return item; // If not found, keep as is or we could remove it, but safer to keep.
        
        // Update product data preserving WEBPRICE
        const prodWithWebPrice = applyWebPrice(liveMatch);
        const updatedItem = { ...item, product: prodWithWebPrice };
        
        // Verify stock limits
        const isLimited = liveMatch.STOCK !== undefined && liveMatch.STOCK !== null && liveMatch.STOCK < 99999;
        const maxStock = isLimited ? liveMatch.STOCK : 99999;
        
        // If live stock is 0 and we enforce stock, qty becomes 0 (which might look weird, but let's just clamp)
        if (!unlimitedStock && isLimited && updatedItem.quantity > maxStock) {
          updatedItem.quantity = Math.max(0, maxStock);
        }
        
        return updatedItem;
      });
      return newItems.filter(i => i.quantity > 0);
    });
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = useMemo(
    () => items.reduce((s, i) => s + getEffectiveItemTotal(i), 0),
    [items, apertura],
  );
  const catalogSubtotal = useMemo(
    () => items.reduce((s, i) => s + i.product.PRICE * i.quantity, 0),
    [items],
  );
  const aperturaSavings = useMemo(
    () => (apertura?.isActive ? Math.max(0, catalogSubtotal - subtotal) : 0),
    [apertura, catalogSubtotal, subtotal],
  );

  return (
    <CartContext.Provider value={{ items, addItem, addBundleItem, hasPackItems, removeItem, updateQuantity, clearCart, updateCartWithLiveProducts, totalItems, subtotal, catalogSubtotal, aperturaSavings, getEffectivePrice, getEffectiveItemTotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
