/** Helpers para SKU, código de barras y sección en FEATURES (Appwrite). */

function resolveFeaturesString(features?: string | string[] | null): string {
  if (!features) return '';
  if (Array.isArray(features)) {
    return features.join('\n');
  }
  return String(features);
}

function resolveTagsString(tags?: string | string[] | null): string {
  if (!tags) return '';
  if (Array.isArray(tags)) {
    return tags.join(',');
  }
  return String(tags);
}

export function getBarcodeFromFeatures(features?: string | string[] | null, directBarcode?: string | null): string {
  if (directBarcode && String(directBarcode).trim()) return String(directBarcode).trim();
  const featuresStr = resolveFeaturesString(features);
  const m = featuresStr.match(/Barcode:\s*(.+)/i);
  return m ? m[1].trim().split('\n')[0] : '';
}

export function getSkuFromFeatures(
  features?: string | string[] | null,
  tags?: string | string[] | null,
  jumpsellerId?: string | null,
  directSku?: string | null,
): string {
  if (directSku && String(directSku).trim()) return String(directSku).trim();
  const featuresStr = resolveFeaturesString(features);
  const m = featuresStr.match(/SKU:\s*(.+)/i);
  if (m) return m[1].trim().split('\n')[0];
  const tagsStr = resolveTagsString(tags);
  const tagParts = tagsStr.split(',').map(t => t.trim());
  const skuTag = tagParts.find(t => /^[A-Z0-9]{4,}$/i.test(t));
  return jumpsellerId || skuTag || '';
}

export function setBarcodeInFeatures(features: string | string[] | null, barcode: string): string {
  const code = barcode.trim();
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?Barcode:\s*[^\n]*/gi, '')
    .replace(/^Barcode:\s*[^\n]*\n?/gi, '')
    .trim();
  if (!code) return base;
  return base ? `${base}\nBarcode: ${code}` : `Barcode: ${code}`;
}

export function setSkuInFeatures(features: string | string[] | null, sku: string): string {
  const value = sku.trim();
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?SKU:\s*[^\n]*/gi, '')
    .replace(/^SKU:\s*[^\n]*\n?/gi, '')
    .trim();
  if (!value) return base;
  return base ? `${base}\nSKU: ${value}` : `SKU: ${value}`;
}

export interface ProductWarehouseLocation {
  section: number | null;
  gondola: string | null;
  /** Ej: G-A · S5 */
  label: string | null;
}

export function getWarehouseLocationFromFeatures(features?: string | string[] | null, directSection?: number | null): ProductWarehouseLocation {
  const featuresStr = resolveFeaturesString(features);
  const section = directSection != null ? directSection : (() => {
    const m = featuresStr.match(/Section:\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  })();
  let gondola: string | null = null;
  if (section !== null && !Number.isNaN(section)) {
    if (section >= 1 && section <= 9) gondola = 'A';
    else if (section >= 10 && section <= 18) gondola = 'B';
    else if (section >= 19 && section <= 27) gondola = 'C';
    else if (section >= 28 && section <= 36) gondola = 'D';
  }
  const label = section !== null && gondola ? `G${gondola} · S${section}` : null;
  return { section, gondola, label };
}

export function setSectionInFeatures(features: string | string[] | null, section: number | null): string {
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?Section:\s*\d+/gi, '')
    .replace(/^Section:\s*\d+\n?/gi, '')
    .trim();
  if (section == null || !section) return base;
  return base ? `${base}\nSection: ${section}` : `Section: ${section}`;
}

// ─── Live Shopping Logic ───────────────────────────────────────────────────────

export type LiveLogicMinQty = {
  /** Minimum quantity to trigger the offer price */
  qty: number;
  /** Special price when qty >= minQty */
  offerPrice: number;
};

export type LiveLogicLimitedTime = {
  /** ISO date string when the offer expires */
  expiresAt: string;
  /** Offer price during the limited time period */
  offerPrice: number;
};

export type LiveLogicConfig = {
  /** If true, the apertura -20% global discount is suppressed for this product */
  disableApertura?: boolean;
  /** Minimum quantity logic */
  minQty?: LiveLogicMinQty;
  /** Limited time offer logic */
  limitedTime?: LiveLogicLimitedTime;
};

export function getLiveLogicFromFeatures(features?: string | string[] | null): LiveLogicConfig | null {
  const featuresStr = resolveFeaturesString(features);
  const m = featuresStr.match(/LiveLogic:\s*(\{.*\})/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as LiveLogicConfig;
  } catch {
    return null;
  }
}

export function setLiveLogicInFeatures(features: string | string[] | null, config: LiveLogicConfig | null): string {
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?LiveLogic:\s*\{[^\n]*\}/gi, '')
    .replace(/^LiveLogic:\s*\{[^\n]*\}\n?/gi, '')
    .trim();
  if (!config) return base;
  const json = JSON.stringify(config);
  return base ? `${base}\nLiveLogic: ${json}` : `LiveLogic: ${json}`;
}

/** Returns whether the limited-time offer is currently active (not yet expired). */
export function isLiveLogicLimitedTimeActive(logic: LiveLogicConfig): boolean {
  if (!logic.limitedTime) return false;
  return new Date(logic.limitedTime.expiresAt).getTime() > Date.now();
}

// ─── Custom Detail Blocks (Detalles Técnicos, Modo de Uso, Ingredientes) ────────

export type CustomTabsConfig = {
  details?: string;
  usage?: string;
  ingredients?: string;
};

export function getCustomTabsFromFeatures(features?: string | string[] | null): CustomTabsConfig | null {
  const featuresStr = resolveFeaturesString(features);
  const m = featuresStr.match(/CustomTabs:\s*(\{.*\})/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as CustomTabsConfig;
  } catch {
    return null;
  }
}

export function setCustomTabsInFeatures(features: string | string[] | null, config: CustomTabsConfig | null): string {
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?CustomTabs:\s*\{[^\n]*\}/gi, '')
    .replace(/^CustomTabs:\s*\{[^\n]*\}\n?/gi, '')
    .trim();
  if (!config) return base;
  const json = JSON.stringify(config);
  return base ? `${base}\nCustomTabs: ${json}` : `CustomTabs: ${json}`;
}

export function getExactWholesaleFromFeatures(features?: string | string[] | null): boolean {
  const featuresStr = resolveFeaturesString(features);
  return /ExactWholesale:\s*true/i.test(featuresStr);
}

export function setExactWholesaleInFeatures(features: string | string[] | null, isExact: boolean): string {
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?ExactWholesale:\s*(true|false)/gi, '')
    .replace(/^ExactWholesale:\s*(true|false)\n?/gi, '')
    .trim();
  if (!isExact) return base;
  return base ? `${base}\nExactWholesale: true` : `ExactWholesale: true`;
}

export function getDisableDiscountsFromFeatures(features?: string | string[] | null): boolean {
  const featuresStr = resolveFeaturesString(features);
  return /DisableDiscounts:\s*true/i.test(featuresStr);
}

export function setDisableDiscountsInFeatures(features: string | string[] | null, disabled: boolean): string {
  const featuresStr = resolveFeaturesString(features);
  let base = featuresStr
    .replace(/\r\n/g, '\n')
    .replace(/\n?DisableDiscounts:\s*(true|false)/gi, '')
    .replace(/^DisableDiscounts:\s*(true|false)\n?/gi, '')
    .trim();
  if (!disabled) return base;
  return base ? `${base}\nDisableDiscounts: true` : `DisableDiscounts: true`;
}
