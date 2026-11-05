export interface BundlePackProduct {
  $id: string;
  NAME: string;
  PRICE: number;
  IMAGEURL: string;
  SKU: string;
  quantity: number;
  bundleUnitPrice: number;
}

export const BUNDLE_PACK: {
  products: BundlePackProduct[];
  totalPrice: number;
  originalTotal: number;
  discountPercent: number;
} = {
  totalPrice: 15990,
  originalTotal: 25300,
  discountPercent: 37,
  products: [
    { $id: '6a2b4ef50018fb3a8c64', NAME: 'Base De Maquillaje Raspberry Tart Party', PRICE: 2800, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/db022e6a4a8df69271f73f86efae795e.jpg', SKU: 'KC1307', quantity: 1, bundleUnitPrice: 1770 },
    { $id: '6a1a4da2000dd909a12a', NAME: 'ILUMINADORES', PRICE: 1450, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/4164f83c116f25162a627a5e464a9e41.jpg', SKU: 'KC1277', quantity: 1, bundleUnitPrice: 916 },
    { $id: '6a287c100036e5592ea7', NAME: 'POLVO SUELTO BIG KIDS', PRICE: 2200, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/a73f3086e5d3fdf141c9291048fb5baf.jpg', SKU: 'KC1439', quantity: 1, bundleUnitPrice: 1390 },
    { $id: '6a1a4da50015b9ebbd58', NAME: 'PALETA DE 4 RUBORES', PRICE: 3000, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/83dc0de25ec30d42e5e65eb5fb97da88.jpg', SKU: 'KC1328', quantity: 1, bundleUnitPrice: 1896 },
    { $id: '6a1a4da70009d16509de', NAME: 'CORRECTOR DE OJERAS CLEAR SKIN', PRICE: 1600, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/7002e6ad9dcf769cabb007487e530180.jpg', SKU: 'KC1403', quantity: 1, bundleUnitPrice: 1011 },
    { $id: '6a23384e0005993581fe', NAME: 'Paleta de Sombras Serie Ghost Music de 18 Colores', PRICE: 4350, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/106ca38b2ef108b81c3a17d263f1f0db.jpg', SKU: 'KC1817', quantity: 1, bundleUnitPrice: 2749 },
    { $id: '6a3c6094003ceef0b1ec', NAME: 'Toallitas Desmaquillantes', PRICE: 950, IMAGEURL: 'https://yesbella.qianji.us./be/statics/resources/17c9eb3a00e9748b0a1d0c6da54a3244.jpg', SKU: 'KC1048', quantity: 1, bundleUnitPrice: 600 },
    { $id: '6a3c615e000b35db0f3b', NAME: 'BROCHA', PRICE: 1150, IMAGEURL: '', SKU: '1028', quantity: 1, bundleUnitPrice: 726 },
    { $id: '6a1a4db00004abd0d67d', NAME: 'BRILLOS LABIAL DE 6 COLORES + DELINEADOR DE LABIOS', PRICE: 1000, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/e4564128a8b9eef6cfda26b852e07653.jpg', SKU: 'L1516', quantity: 3, bundleUnitPrice: 632 },
    { $id: '6a46afc90033cd090a8e', NAME: 'BRILLOS LABIALES LOVE COLOR WHISPER', PRICE: 1200, IMAGEURL: 'https://yesbella1.tooerp3.com/be/statics/resources/33cd0e942a382b1eb4bb88eb6eb499e5.jpg', SKU: 'KC1241', quantity: 4, bundleUnitPrice: 759 },
  ],
};

/** Total units in the bundle pack */
export const BUNDLE_TOTAL_UNITS = BUNDLE_PACK.products.reduce((s, p) => s + p.quantity, 0);

/** Discount ratio: bundleTotal / originalTotal. Each product's bundle price = PRICE * this ratio */
export const BUNDLE_DISCOUNT_RATIO = BUNDLE_PACK.totalPrice / BUNDLE_PACK.originalTotal;

/** Per-unit bundle price for a specific product (proportional discount) */
export function getBundleUnitPrice(productPrice: number): number {
  return Math.round(productPrice * BUNDLE_DISCOUNT_RATIO);
}

/** Per-unit bundle price for a specific product by $id */
export function getBundleUnitPriceById(productId: string): number {
  const bp = BUNDLE_PACK.products.find(p => p.$id === productId);
  if (!bp) return 0;
  return bp.bundleUnitPrice;
}

/** Map of productId -> required quantity for quick lookup */
export const BUNDLE_PRODUCT_MAP = new Map(BUNDLE_PACK.products.map(p => [p.$id, p.quantity]));

/**
 * Checks if the cart items contain all bundle products with at least the required quantities.
 * Returns the bundle-eligible quantity map and whether the bundle is complete.
 */
export function detectBundleInCart(cartItems: Array<{ product: { $id: string }; quantity: number }>): {
  isComplete: boolean;
  bundleItems: Array<{ $id: string; bundleQty: number; extraQty: number }>;
} {
  const bundleItems = BUNDLE_PACK.products.map(bp => {
    const cartItem = cartItems.find(ci => ci.product.$id === bp.$id);
    const cartQty = cartItem?.quantity || 0;
    return {
      $id: bp.$id,
      bundleQty: Math.min(cartQty, bp.quantity),
      extraQty: Math.max(0, cartQty - bp.quantity),
    };
  });

  const isComplete = bundleItems.every(bi => bi.bundleQty >= BUNDLE_PRODUCT_MAP.get(bi.$id)!);

  return { isComplete, bundleItems };
}
