import type { LiveLogicConfig } from '@/lib/product-features';
import { isLiveLogicLimitedTimeActive } from '@/lib/product-features';

export type AperturaSettings = {
  isActive: boolean;
  discountPercent: number;
  minPurchase: number;
};

export type ProductPriceLike = {
  PRICE: number;
  CURRENTPRICE?: number | null;
  WHOLESALEPRICE?: number | null;
  WHOLESALEMINQUANTITY?: number | null;
  PACKQTY?: number | null;
  PACK_DISCOUNT_PCT?: number | null;
  UNIT_OFFER_EXPIRES_AT?: number | null;
  $createdAt?: string | null;
  SKU?: string | null;
  DISABLE_DISCOUNTS?: boolean | null;
  FEATURES?: string | string[] | null;
};

export function isDisableDiscounts(product: ProductPriceLike): boolean {
  if (product.DISABLE_DISCOUNTS || product.SKU === 'PROMO1') return true;
  const featuresStr = Array.isArray(product.FEATURES) ? product.FEATURES.join('\n') : (product.FEATURES || '');
  return /DisableDiscounts:\s*true/i.test(featuresStr);
}

/**
 * 🌐 REGLA DE NEGOCIO (GEMINI.md):
 * Si el producto tiene precio web exclusivo (WEBPRICE / web_price),
 * asigna ese valor a PRICE, CURRENTPRICE y WHOLESALEPRICE para el canal web.
 * Función 100% pura y segura para cliente/browser (sin dependencias de servidor).
 */
export function applyWebPrice(product: any): any {
  if (!product) return product;
  const webPrice = Number(product?.WEBPRICE ?? product?.web_price ?? 0);
  if (webPrice <= 0) return product;
  return {
    ...product,
    STORE_PRICE: product.PRICE,
    STORE_WHOLESALEPRICE: product.WHOLESALEPRICE,
    PRICE: webPrice,
    CURRENTPRICE: webPrice,
    WHOLESALEPRICE: webPrice,
  };
}

export type ResolvedProductPrice = {
  displayPrice: number;
  originalPrice: number | null;
  hasDiscount: boolean;
  discountPercent: number;
  fromApertura: boolean;
};

const DEFAULT_SETTINGS: AperturaSettings = {
  isActive: false,
  discountPercent: 0,
  minPurchase: 0,
};

/** Precio mostrado: oferta del producto (CURRENTPRICE) tiene prioridad sobre promoción apertura. */
export function resolveProductDisplayPrice(
  product: ProductPriceLike,
  apertura: AperturaSettings | null | undefined,
  liveLogic?: LiveLogicConfig | null,
): ResolvedProductPrice {
  // 🌐 REGLA DE NEGOCIO (GEMINI.md):
  // Si el producto tiene WEBPRICE / web_price asignado (> 0), ese es su precio oficial web
  // y NUNCA se sobreescribe con precios de tienda física ni POS.
  const webPrice = Number((product as any)?.WEBPRICE ?? (product as any)?.web_price ?? 0);
  if (webPrice > 0) {
    return {
      displayPrice: webPrice,
      originalPrice: null,
      hasDiscount: false,
      discountPercent: 0,
      fromApertura: false,
    };
  }

  const base = product.PRICE || 0;
  const catalog = (product as any).CATALOGPRICE && (product as any).CATALOGPRICE > 0 ? (product as any).CATALOGPRICE : null;
  const wholesale = product.WHOLESALEPRICE && product.WHOLESALEPRICE > 0 ? product.WHOLESALEPRICE : null;
  const fallbackPrice = catalog || wholesale || 0;
  // Si no hay precio normal (PRICE <= 0), usamos CATALOGPRICE o WHOLESALEPRICE como precio oficial
  const effectiveBase = base > 0 ? base : fallbackPrice;

  // If a product has a wholesale price from 1 unit or less, that is its final display price.
  if (wholesale && wholesale > 0 && product.WHOLESALEMINQUANTITY != null && product.WHOLESALEMINQUANTITY <= 1) {
    return {
      displayPrice: wholesale,
      originalPrice: base > wholesale ? base : null,
      hasDiscount: base > wholesale,
      discountPercent: base > wholesale ? Math.round(((base - wholesale) / base) * 100) : 0,
      fromApertura: false,
    };
  }

  // Bloquear todos los descuentos (checkbox en admin o SKU PROMO1).
  // DEBE ir antes que Live Shopping: ese bloque retorna temprano y todo
  // producto con $createdAt válido caía en el 20% aunque estuviera bloqueado.
  if (isDisableDiscounts(product)) {
    return {
      displayPrice: effectiveBase,
      originalPrice: null,
      hasDiscount: false,
      discountPercent: 0,
      fromApertura: false,
    };
  }

  const unitOfferExpired = !!(product.UNIT_OFFER_EXPIRES_AT && product.UNIT_OFFER_EXPIRES_AT < Date.now());
  // Si hay una cantidad mínima configurada (precio por volumen), la oferta NO se aplica
  // incondicionalmente: solo se activa al alcanzar esa cantidad (gestionado por la lógica
  // de wholesale en carrito/checkout/detalle). Sin cantidad mínima, la oferta es incondicional.
  const hasMinQtyGate = !!(product.WHOLESALEMINQUANTITY && product.WHOLESALEMINQUANTITY > 1);
  const sale =
    product.CURRENTPRICE && product.CURRENTPRICE > 0 && product.CURRENTPRICE < effectiveBase && !unitOfferExpired && !hasMinQtyGate
      ? product.CURRENTPRICE
      : null;

  if (sale != null) {
    return {
      displayPrice: sale,
      originalPrice: effectiveBase,
      hasDiscount: true,
      discountPercent: effectiveBase > 0 ? Math.round(((effectiveBase - sale) / effectiveBase) * 100) : 0,
      fromApertura: false,
    };
  }

  // If a live logic limited-time offer is active, show the live offer price
  if (liveLogic?.limitedTime && isLiveLogicLimitedTimeActive(liveLogic)) {
    const offerPrice = liveLogic.limitedTime.offerPrice;
    if (offerPrice > 0 && offerPrice < effectiveBase) {
      return {
        displayPrice: offerPrice,
        originalPrice: effectiveBase,
        hasDiscount: true,
        discountPercent: Math.round(((effectiveBase - offerPrice) / effectiveBase) * 100),
        fromApertura: false,
      };
    }
  }

  return {
    displayPrice: effectiveBase,
    originalPrice: null,
    hasDiscount: false,
    discountPercent: 0,
    fromApertura: false,
  };
}

