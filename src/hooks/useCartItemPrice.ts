'use client';

import { useMemo } from 'react';
import type { CartItem } from '@/types';
import { resolveProductDisplayPrice, isDisableDiscounts, type ResolvedProductPrice } from '@/lib/apertura-promo';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { hasVolumePricing, resolveVolumeUnitPrice } from '@/lib/volume-pricing';

export function useCartItemPrice(item: CartItem): {
  unitPrice: number;
  pricing: ResolvedProductPrice;
} {
  const { settings: apertura } = useAperturaPromotion();

  return useMemo(() => {
    const now = Date.now();
    let result: { unitPrice: number; pricing: ResolvedProductPrice } | null = null;

    // 0. Bundle pack pricing: bundleQty at bundle price, extra at normal price
    const configuredBundleQty = item.bundleId ? (item.bundlePackQty || 1) : item.bundlePackQty;
    const configuredBundlePrice = item.bundleId ? (item.bundleUnitPrice ?? item.bundlePackPrice) : item.bundlePackPrice;
    if (configuredBundleQty && configuredBundleQty > 0 && configuredBundlePrice) {
      const bundleTotal = configuredBundleQty * configuredBundlePrice;
      const extraQty = item.quantity - configuredBundleQty;
      if (extraQty <= 0) {
        result = {
          unitPrice: configuredBundlePrice,
          pricing: {
            displayPrice: configuredBundlePrice,
            originalPrice: item.bundleOriginalUnitPrice ?? item.product.PRICE,
            hasDiscount: configuredBundlePrice < (item.bundleOriginalUnitPrice ?? item.product.PRICE),
            discountPercent: (item.bundleOriginalUnitPrice ?? item.product.PRICE) > 0 ? Math.round((((item.bundleOriginalUnitPrice ?? item.product.PRICE) - configuredBundlePrice) / (item.bundleOriginalUnitPrice ?? item.product.PRICE)) * 100) : 0,
            fromApertura: false,
          },
        };
      } else {
        // Mixed: bundle qty at bundle price, extra at normal price
        const normalItem = { ...item, bundlePackQty: undefined, bundlePackPrice: undefined, timedOfferPrice: undefined, wholesalePrice: undefined, isPack: undefined };
        const normalPricing = resolveProductDisplayPrice(normalItem.product, apertura);
        const total = bundleTotal + (normalPricing.displayPrice * extraQty);
        const avgPrice = Math.round(total / item.quantity);
        result = {
          unitPrice: avgPrice,
          pricing: {
            displayPrice: avgPrice,
            originalPrice: item.bundleOriginalUnitPrice ?? item.product.PRICE,
            hasDiscount: avgPrice < (item.bundleOriginalUnitPrice ?? item.product.PRICE),
            discountPercent: (item.bundleOriginalUnitPrice ?? item.product.PRICE) > 0 ? Math.round((((item.bundleOriginalUnitPrice ?? item.product.PRICE) - avgPrice) / (item.bundleOriginalUnitPrice ?? item.product.PRICE)) * 100) : 0,
            fromApertura: false,
          },
        };
      }
    }

    // 0.5. 🌐 Precio Web Exclusivo: Si el producto tiene precio web, se respeta estrictamente
    const webPrice = Number((item.product as any)?.WEBPRICE ?? (item.product as any)?.web_price ?? 0);
    if (!result && webPrice > 0 && !(item.timedOfferPrice && item.timedOfferExpiresAt && now < item.timedOfferExpiresAt)) {
      result = {
        unitPrice: webPrice,
        pricing: {
          displayPrice: webPrice,
          originalPrice: null,
          hasDiscount: false,
          discountPercent: 0,
          fromApertura: false,
        },
      };
    }

    // 1. Timed offer
    if (item.timedOfferPrice && item.timedOfferExpiresAt && now < item.timedOfferExpiresAt) {
      result = {
        unitPrice: item.timedOfferPrice,
        pricing: {
          displayPrice: item.timedOfferPrice,
          originalPrice: item.product.PRICE,
          hasDiscount: item.timedOfferPrice < item.product.PRICE,
          discountPercent: 0,
          fromApertura: false,
        },
      };
    }

    // 2. Explicit wholesale price passed via item (e.g. from embalajes or isPack mode addition)
    // Respects WHOLESALEMINQUANTITY: only applies unconditionally for packs or when no minQty is set
    if (!result && item.wholesalePrice !== undefined && (item.isPack || !item.product.WHOLESALEMINQUANTITY || item.product.WHOLESALEMINQUANTITY <= 1 || item.quantity >= item.product.WHOLESALEMINQUANTITY)) {
      result = {
        unitPrice: item.wholesalePrice,
        pricing: {
          displayPrice: item.wholesalePrice,
          originalPrice: item.product.PRICE,
          hasDiscount: item.wholesalePrice < item.product.PRICE,
          discountPercent: item.product.PRICE > 0 ? Math.round(((item.product.PRICE - item.wholesalePrice) / item.product.PRICE) * 100) : 0,
          fromApertura: false,
        },
      };
    }

    // 3. 📦 Precios por volumen (3 niveles: detalle/mayor/caja).
    // El precio unitario baja según la cantidad — sin descuentos artificiales.
    if (!result && hasVolumePricing(item.product)) {
      const unit = resolveVolumeUnitPrice(item.product, item.quantity);
      result = {
        unitPrice: unit,
        pricing: {
          // Sin originalPrice/hasDiscount: el precio por volumen ES el precio,
          // no un "descuento" — nada de tachados ni badges de -X%.
          displayPrice: unit,
          originalPrice: null,
          hasDiscount: false,
          discountPercent: 0,
          fromApertura: false,
        }
      };
    }

    // 3.5. 📦 Precio por volumen — % descuento (PACK_DISCOUNT_PCT + PACK_MIN_PACKS)
    if (!result) {
      const pct = Number(item.product.PACK_DISCOUNT_PCT) || 0;
      const minPacks = Number(item.product.PACK_MIN_PACKS) || 0;
      if (pct > 0 && minPacks > 0 && item.quantity >= minPacks && !isDisableDiscounts(item.product)) {
        const basePrice = resolveProductDisplayPrice(item.product, apertura).displayPrice;
        const discounted = Math.round(basePrice * (1 - pct / 100));
        if (discounted > 0 && discounted < basePrice) {
          result = {
            unitPrice: discounted,
            pricing: {
              displayPrice: discounted,
              originalPrice: basePrice,
              hasDiscount: true,
              discountPercent: pct,
              fromApertura: false,
            },
          };
        }
      }
    }

    // 4. Regular Wholesale rules
    const pFeatures = Array.isArray(item.product.FEATURES) ? item.product.FEATURES.join('\n') : item.product.FEATURES || '';
    const isExact = /ExactWholesale:\s*true/i.test(pFeatures);
    const minQty = item.product.WHOLESALEMINQUANTITY || 0;
    const qtyMatches = isExact 
      ? item.quantity === minQty 
      : item.quantity >= minQty;

    const hasConfiguredWholesale = !!(item.product.WHOLESALEPRICE && item.product.WHOLESALEMINQUANTITY);
    const effectiveWholesale = (hasConfiguredWholesale && qtyMatches) 
      ? item.product.WHOLESALEPRICE 
      : undefined;

    if (!result && effectiveWholesale) {
      result = {
        unitPrice: effectiveWholesale,
        pricing: {
          displayPrice: effectiveWholesale,
          originalPrice: item.product.PRICE,
          hasDiscount: effectiveWholesale < item.product.PRICE,
          discountPercent: item.product.PRICE > 0 ? Math.round(((item.product.PRICE - effectiveWholesale) / item.product.PRICE) * 100) : 0,
          fromApertura: false,
        },
      };
    }

    // 5. Default Apertura/Live logic
    if (!result) {
      const pricing = resolveProductDisplayPrice(item.product, apertura);
      result = { unitPrice: pricing.displayPrice, pricing };
    }

    return result;
  }, [item, apertura]);
}

export function useCartPricing(items: CartItem[]) {
  const { settings: apertura, isActive: aperturaActive, discountPercent } = useAperturaPromotion();

  return useMemo(() => {
    let subtotal = 0;
    let catalogSubtotal = 0;

    for (const item of items) {
      const now = Date.now();
      let unit = item.product.PRICE;
      if (item.bundleId && Number.isFinite(Number(item.bundleUnitPrice))) {
        const bundleQty = Math.min(item.quantity, Math.max(1, Number(item.bundlePackQty) || 1));
        const extraQty = Math.max(0, item.quantity - bundleQty);
        const extraPrice = extraQty > 0 ? resolveProductDisplayPrice(item.product, apertura).displayPrice : 0;
        subtotal += Number(item.bundleUnitPrice) * bundleQty + extraPrice * extraQty;
        catalogSubtotal += item.product.PRICE * item.quantity;
        continue;
      }
      const pFeatures = Array.isArray(item.product.FEATURES) ? item.product.FEATURES.join('\n') : item.product.FEATURES || '';
      const isExact = /ExactWholesale:\s*true/i.test(pFeatures);
      const minQty = item.product.WHOLESALEMINQUANTITY || 0;
      const qtyMatches = isExact 
        ? item.quantity === minQty 
        : item.quantity >= minQty;

      const hasConfiguredWholesale = !!(item.product.WHOLESALEPRICE && item.product.WHOLESALEMINQUANTITY);
      if (item.timedOfferPrice && item.timedOfferExpiresAt && now < item.timedOfferExpiresAt) {
        unit = item.timedOfferPrice;
      } else if (hasVolumePricing(item.product)) {
        // 📦 Precios por volumen: el nivel (detalle/mayor/caja) según cantidad
        unit = resolveVolumeUnitPrice(item.product, item.quantity);
      } else {
        // 📦 % descuento por volumen (PACK_DISCOUNT_PCT + PACK_MIN_PACKS)
        const pct = Number(item.product.PACK_DISCOUNT_PCT) || 0;
        const minPacks = Number(item.product.PACK_MIN_PACKS) || 0;
        if (pct > 0 && minPacks > 0 && item.quantity >= minPacks) {
          const baseUnit = resolveProductDisplayPrice(item.product, apertura).displayPrice;
          unit = Math.round(baseUnit * (1 - pct / 100));
        } else if (hasConfiguredWholesale && qtyMatches) {
          unit = item.product.WHOLESALEPRICE!;
        } else if (!hasConfiguredWholesale && item.wholesalePrice && (item.isPack || !item.product.WHOLESALEMINQUANTITY || item.product.WHOLESALEMINQUANTITY <= 1 || item.quantity >= item.product.WHOLESALEMINQUANTITY)) {
          unit = item.wholesalePrice;
        } else {
          unit = resolveProductDisplayPrice(item.product, apertura).displayPrice;
        }
      }

      subtotal += unit * item.quantity;
      catalogSubtotal += item.product.PRICE * item.quantity;
    }

    const aperturaSavings = aperturaActive ? Math.max(0, catalogSubtotal - subtotal) : 0;

    return { subtotal, catalogSubtotal, aperturaSavings, aperturaActive, discountPercent };
  }, [items, apertura, aperturaActive, discountPercent]);
}
