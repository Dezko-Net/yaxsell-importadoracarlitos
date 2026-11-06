import { revalidateTag, unstable_cache } from 'next/cache';
import { PRODUCTS_COLLECTION, STORE_SETTINGS_COLLECTION } from '@/lib/collections';
import { normalizeProductImages } from '@/lib/product-images';
import { serverListDocuments } from '@/lib/db-server';
import { getPublicVendors } from '@/lib/public-vendor-cache';
import { getInventoryConnectionMode, getInventoryStock, type InventoryConnectionMode } from '@/lib/inventory-mode';

// Módulo compartido del catálogo completo cacheado.
// Usa server SDK (firebase-admin) para evitar problemas de permisos del cliente.
// 🔒 Blindaje contra lecturas excesivas de Firestore:
// - Estado unificado en globalThis para compartir RAM entre todos los route handlers de Next.js
// - Server-Side Delta Sync por `updatedAt` numérico: tras un cambio o expiración de TTL,
//   solo descarga los productos modificados (1 lectura si no hay cambios, en vez de 736)
// - Deduplicación de llamadas en vuelo (evita estampidas paralelas)
// - Parcheo atómico en memoria al vender en POS o reservar en Web (0 lecturas adicionales)

const MEMORY_CACHE_TTL = 60 * 60 * 1000; // 60 minutos (blindaje de cuota Firestore; POS/Web parchean stock en RAM y edits usan Delta Sync)
const VENDOR_CACHE_TTL = 60 * 60 * 1000; // 60 minutos
const STORE_NAME_CACHE_TTL = 60 * 60 * 1000;
const DELTA_OVERLAP_MS = 120 * 1000; // 2 minutos de margen para cubrir desfases de reloj
const MAIN_STORE_OWNER_IDS = new Set(['__main__', 'carlitos', 'importadora-carlitos', 'importadora_carlitos']);

interface CatalogGlobalState {
  rawDocsMap: Map<string, any>;
  lastSyncTs: number;
  needsDeltaSync: boolean;
  memoryCacheAllProducts: any[] | null;
  memoryCacheAllProductsTime: number;
  memoryCacheInventoryMode: InventoryConnectionMode | null;
  inflightCatalogFetch: Promise<any[]> | null;
  inflightCatalogMode: InventoryConnectionMode | null;
  memoryCacheVendors: { data: { activeVendorIds: Set<string>; profiles: Record<string, any> }; time: number } | null;
  memoryCacheStoreName: { name: string; time: number } | null;
}

const g = globalThis as unknown as { __yaxsellCatalogState?: CatalogGlobalState };
if (!g.__yaxsellCatalogState) {
  g.__yaxsellCatalogState = {
    rawDocsMap: new Map<string, any>(),
    lastSyncTs: 0,
    needsDeltaSync: false,
    memoryCacheAllProducts: null,
    memoryCacheAllProductsTime: 0,
    memoryCacheInventoryMode: null,
    inflightCatalogFetch: null,
    inflightCatalogMode: null,
    memoryCacheVendors: null,
    memoryCacheStoreName: null,
  };
}
const state = g.__yaxsellCatalogState;

import { getHomeMemoryCache, clearHomeMemoryCache } from '@/lib/home-cache';

export function clearCatalogMemoryCache(options?: { hard?: boolean }): void {
  state.memoryCacheAllProducts = null;
  state.memoryCacheAllProductsTime = 0;
  state.memoryCacheInventoryMode = null;
  state.inflightCatalogFetch = null;
  state.inflightCatalogMode = null;
  if (options?.hard) {
    state.rawDocsMap.clear();
    state.lastSyncTs = 0;
    state.needsDeltaSync = false;
    state.memoryCacheVendors = null;
  } else if (state.rawDocsMap.size > 0) {
    // Soft invalidation: mantiene rawDocsMap para hacer Delta Sync incremental (1 lectura en vez de 736)
    state.needsDeltaSync = true;
  }
  // Invalida también la caché compartida entre instancias serverless.
  // Vaciar globalThis solo actualiza la instancia que recibió la mutación.
  try { revalidateTag('products'); } catch {}
  clearHomeMemoryCache();
}

/**
 * Resuelve un producto desde la caché en memoria del servidor (por ID, SKU o nombre exacto)
 * sin gastar lecturas de Firestore antes de una transacción.
 */
export function resolveProductFromCatalogCache(query: {
  id?: string;
  sku?: string;
  name?: string;
}): { id: string; sku: string; stock: number } | null {
  const idClean = String(query.id || '').trim();
  if (idClean && state.rawDocsMap.has(idClean)) {
    const raw = state.rawDocsMap.get(idClean);
    return {
      id: idClean,
      sku: String(raw?.SKU ?? raw?.sku ?? '').trim(),
      stock: Number(raw?.STOCK ?? raw?.stock ?? 0),
    };
  }

  const skuUpper = String(query.sku || '').trim().toUpperCase();
  const nameLower = String(query.name || '').trim().toLowerCase();

  if (state.rawDocsMap.size > 0) {
    for (const [docId, raw] of state.rawDocsMap.entries()) {
      if (skuUpper) {
        const docSku = String(raw?.SKU ?? raw?.sku ?? '').trim().toUpperCase();
        if (docSku === skuUpper) {
          return { id: docId, sku: docSku, stock: Number(raw?.STOCK ?? raw?.stock ?? 0) };
        }
      }
      if (nameLower) {
        const docName = String(raw?.NAME ?? raw?.name ?? '').trim().toLowerCase();
        if (docName === nameLower) {
          return {
            id: docId,
            sku: String(raw?.SKU ?? raw?.sku ?? '').trim(),
            stock: Number(raw?.STOCK ?? raw?.stock ?? 0),
          };
        }
      }
    }
  }

  if (Array.isArray(state.memoryCacheAllProducts)) {
    for (const p of state.memoryCacheAllProducts) {
      const pId = String(p?.$id || p?.id || '').trim();
      const pSku = String(p?.SKU ?? p?.sku ?? '').trim().toUpperCase();
      const pName = String(p?.NAME ?? p?.name ?? '').trim().toLowerCase();
      if ((idClean && pId === idClean) || (skuUpper && pSku === skuUpper) || (nameLower && pName === nameLower)) {
        if (pId) {
          return { id: pId, sku: pSku, stock: Number(p?.STOCK ?? p?.stock ?? 0) };
        }
      }
    }
  }

  return null;
}

/** Distinguishes Importadora Carlitos's catalog from products owned by an allied store. */
export function isMainStoreProduct(product: any): boolean {
  const vendorId = String(product?.VENDOR_ID || product?.vendorId || product?.SELLERID || product?.sellerId || '').trim().toLowerCase();
  const flaggedVendor = product?.isVendorProduct === true || product?.IS_VENDOR_PRODUCT === true;
  if (flaggedVendor && !vendorId) return false;
  return !vendorId || MAIN_STORE_OWNER_IDS.has(vendorId);
}

/**
 * Parchea el stock de productos vendidos en el POS o reservados en Web directamente en la memoria del servidor.
 * Esto mantiene la Web al segundo con el stock real sin necesidad de invalidar la caché
 * ni descargar nuevamente el catálogo desde Firestore (0 lecturas adicionales).
 */
export function patchCatalogMemoryCacheStock(
  deductions: { id?: string; sku?: string; cantidad: number }[],
  stockField: 'STOCK' | 'WEB_STOCK' = 'STOCK',
): void {
  const dedMap = new Map<string, number>();
  for (const d of deductions) {
    const qty = Number(d.cantidad || 0);
    if (qty <= 0) continue;
    if (d.id) dedMap.set(d.id, (dedMap.get(d.id) || 0) + qty);
    if (d.sku) dedMap.set(String(d.sku).toUpperCase().trim(), (dedMap.get(String(d.sku).toUpperCase().trim()) || 0) + qty);
  }
  if (dedMap.size === 0) return;

  const patchArray = (arr: any[] | null | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      const idKey = p.$id;
      const skuKey = (p.SKU || p.sku) ? String(p.SKU || p.sku).toUpperCase().trim() : '';
      const qtyToSub = (idKey && dedMap.get(idKey)) || (skuKey && dedMap.get(skuKey)) || 0;
      if (qtyToSub > 0) {
        const hasWebStock = p.WEB_STOCK != null || p.web_stock != null;
        const updateDisplayedStock = stockField === 'WEB_STOCK' ||
          state.memoryCacheInventoryMode !== 'web_independent' || !hasWebStock;
        if (!updateDisplayedStock) continue;
        const curStock = Number(p.STOCK ?? p.stock ?? p.WEB_STOCK ?? p.web_stock ?? 0);
        const newStock = Math.max(0, curStock - qtyToSub);
        p.STOCK = newStock;
        p.stock = newStock;
        if (stockField === 'WEB_STOCK') {
          p.WEB_STOCK = newStock;
          p.web_stock = newStock;
        }
      }
    }
  };

  patchArray(state.memoryCacheAllProducts);
  const homeCache = getHomeMemoryCache(state.memoryCacheInventoryMode || undefined);
  if (homeCache?.products) patchArray(homeCache.products);

  if (state.rawDocsMap.size > 0) {
    for (const [docId, raw] of state.rawDocsMap.entries()) {
      const skuKey = (raw.SKU || raw.sku) ? String(raw.SKU || raw.sku).toUpperCase().trim() : '';
      const qtyToSub = dedMap.get(docId) || (skuKey && dedMap.get(skuKey)) || 0;
      if (qtyToSub > 0) {
        const curStock = Number(stockField === 'WEB_STOCK'
          ? raw.WEB_STOCK ?? raw.web_stock ?? raw.STOCK ?? raw.stock ?? 0
          : raw.STOCK ?? raw.stock ?? 0);
        const newStock = Math.max(0, curStock - qtyToSub);
        if (stockField === 'WEB_STOCK') {
          raw.WEB_STOCK = newStock;
          raw.web_stock = newStock;
        } else {
          raw.STOCK = newStock;
          raw.stock = newStock;
        }
      }
    }
  }
}

/**
 * Restituye stock por anulación/devolución en el POS o expiración de pedido directamente en la memoria del servidor.
 */
export function restoreCatalogMemoryCacheStock(
  restorations: { id?: string; sku?: string; cantidad: number }[],
  stockField: 'STOCK' | 'WEB_STOCK' = 'STOCK',
): void {
  const restMap = new Map<string, number>();
  for (const r of restorations) {
    const qty = Number(r.cantidad || 0);
    if (qty <= 0) continue;
    if (r.id) restMap.set(r.id, (restMap.get(r.id) || 0) + qty);
    if (r.sku) restMap.set(String(r.sku).toUpperCase().trim(), (restMap.get(String(r.sku).toUpperCase().trim()) || 0) + qty);
  }
  if (restMap.size === 0) return;

  const restoreArray = (arr: any[] | null | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      const idKey = p.$id;
      const skuKey = (p.SKU || p.sku) ? String(p.SKU || p.sku).toUpperCase().trim() : '';
      const qtyToAdd = (idKey && restMap.get(idKey)) || (skuKey && restMap.get(skuKey)) || 0;
      if (qtyToAdd > 0) {
        const hasWebStock = p.WEB_STOCK != null || p.web_stock != null;
        const updateDisplayedStock = stockField === 'WEB_STOCK' ||
          state.memoryCacheInventoryMode !== 'web_independent' || !hasWebStock;
        if (!updateDisplayedStock) continue;
        const curStock = Number(p.STOCK ?? p.stock ?? p.WEB_STOCK ?? p.web_stock ?? 0);
        const newStock = curStock + qtyToAdd;
        p.STOCK = newStock;
        p.stock = newStock;
        if (stockField === 'WEB_STOCK') {
          p.WEB_STOCK = newStock;
          p.web_stock = newStock;
        }
      }
    }
  };

  restoreArray(state.memoryCacheAllProducts);
  const homeCache = getHomeMemoryCache(state.memoryCacheInventoryMode || undefined);
  if (homeCache?.products) restoreArray(homeCache.products);

  if (state.rawDocsMap.size > 0) {
    for (const [docId, raw] of state.rawDocsMap.entries()) {
      const skuKey = (raw.SKU || raw.sku) ? String(raw.SKU || raw.sku).toUpperCase().trim() : '';
      const qtyToAdd = restMap.get(docId) || (skuKey && restMap.get(skuKey)) || 0;
      if (qtyToAdd > 0) {
        const curStock = Number(stockField === 'WEB_STOCK'
          ? raw.WEB_STOCK ?? raw.web_stock ?? raw.STOCK ?? raw.stock ?? 0
          : raw.STOCK ?? raw.stock ?? 0);
        const newStock = curStock + qtyToAdd;
        if (stockField === 'WEB_STOCK') {
          raw.WEB_STOCK = newStock;
          raw.web_stock = newStock;
        } else {
          raw.STOCK = newStock;
          raw.stock = newStock;
        }
      }
    }
  }
}

import { applyWebPrice } from '@/lib/apertura-promo';
import { isProductPublishedOnWeb } from '@/lib/product-publication';
export { applyWebPrice };

async function fetchAllProductsFromDb(
  inventoryModeOverride?: InventoryConnectionMode,
  forceRefresh = false,
): Promise<any[]> {
  const requestedMode = inventoryModeOverride || await getInventoryConnectionMode();
  const now = Date.now();
  if (
    !forceRefresh &&
    state.memoryCacheAllProducts &&
    state.memoryCacheInventoryMode === requestedMode &&
    !state.needsDeltaSync &&
    now - state.memoryCacheAllProductsTime < MEMORY_CACHE_TTL
  ) {
    return state.memoryCacheAllProducts;
  }

  if (state.inflightCatalogFetch) {
    if (state.inflightCatalogMode === requestedMode) return state.inflightCatalogFetch;
    await state.inflightCatalogFetch;
    return fetchAllProductsFromDb(requestedMode);
  }

  state.inflightCatalogMode = requestedMode;
  state.inflightCatalogFetch = (async () => {
    try {
      let usedDelta = false;

      if (state.rawDocsMap.size > 0 && state.lastSyncTs > 0) {
        try {
          const sinceTs = Math.max(0, state.lastSyncTs - DELTA_OVERLAP_MS);
          const deltaResponse = await serverListDocuments(PRODUCTS_COLLECTION, [
            JSON.stringify({ method: 'greaterThan', attribute: 'updatedAt', values: [sinceTs] }),
            JSON.stringify({ method: 'limit', values: [500] }),
          ]);
          const deltaDocs: any[] = deltaResponse.documents || [];
          for (const doc of deltaDocs) {
            const docId = String(doc?.$id || doc?.id || '').trim();
            if (!docId) continue;
            if (doc.DELETED === true || doc.deleted === true) {
              state.rawDocsMap.delete(docId);
            } else {
              state.rawDocsMap.set(docId, doc);
            }
          }
          state.lastSyncTs = Date.now();
          state.needsDeltaSync = false;
          usedDelta = true;
          console.log(`[catalog-cache] Delta sync applied: ${deltaDocs.length} changed products (base: ${state.rawDocsMap.size})`);
        } catch (deltaErr) {
          console.warn('[catalog-cache] Delta sync fallback to full scan:', deltaErr);
          usedDelta = false;
        }
      }

      if (!usedDelta) {
        // 🔒 Consulta única sin bucle de offset (en Firestore offset(500) cobra 500 lecturas extra por página)
        console.log('[catalog-cache] Starting single-batch fetch from Firestore...');
        const response = await serverListDocuments(PRODUCTS_COLLECTION, [
          JSON.stringify({ method: 'limit', values: [2500] }),
        ]);
        const rawDocs: any[] = response.documents || [];
        console.log(`[catalog-cache] Total fetched raw: ${rawDocs.length}`);
        state.rawDocsMap.clear();
        for (const doc of rawDocs) {
          const docId = String(doc?.$id || doc?.id || '').trim();
          if (!docId || doc.DELETED === true || doc.deleted === true) continue;
          state.rawDocsMap.set(docId, doc);
        }
        state.lastSyncTs = Date.now();
        state.needsDeltaSync = false;
      }

      // El catálogo común contiene productos web activos de Importadora Carlitos y de
      // tiendas aliadas. Las rutas deciden después qué tienda mostrar.
      const inventoryMode = requestedMode;
      const allProducts = Array.from(state.rawDocsMap.values()).filter((p: any) => {
        const stock = isMainStoreProduct(p)
          ? getInventoryStock(p, inventoryMode, true)
          : Number(p.STOCK ?? p.stock ?? -1);
        return stock >= 0 && isProductPublishedOnWeb(p);
      });

      // Resolver identidad y estado de las tiendas aliadas una vez por caché.
      let activeVendorIds: Set<string>;
      let vendorProfiles: Record<string, any>;
      const vNow = Date.now();
      const vendorIds = new Set(allProducts
        .map((p: any) => String(p.VENDOR_ID || p.vendorId || p.SELLERID || p.sellerId || '').trim())
        .filter((id: string) => id && !MAIN_STORE_OWNER_IDS.has(id.toLowerCase()))
      );

      if (!vendorIds.size) {
        activeVendorIds = new Set<string>();
        vendorProfiles = {};
      } else if (state.memoryCacheVendors && (vNow - state.memoryCacheVendors.time < VENDOR_CACHE_TTL)) {
        activeVendorIds = state.memoryCacheVendors.data.activeVendorIds;
        vendorProfiles = state.memoryCacheVendors.data.profiles;
      } else {
        const publicVendors = await getPublicVendors();
        vendorProfiles = {};
        activeVendorIds = new Set<string>();
        for (const vendor of publicVendors) {
          if (!vendorIds.has(vendor.id)) continue;
          activeVendorIds.add(vendor.id);
          vendorProfiles[vendor.id] = {
            name: vendor.name,
            logoUrl: vendor.logoUrl,
            color: vendor.color,
            secondaryColor: vendor.secondaryColor,
          };
        }
        state.memoryCacheVendors = { data: { activeVendorIds, profiles: vendorProfiles }, time: vNow };
      }

      // Obtener nombre de la tienda principal con caché en memoria (60 min)
      let mainStoreName = 'Importadora Carlitos';
      const sNow = Date.now();
      if (state.memoryCacheStoreName && (sNow - state.memoryCacheStoreName.time < STORE_NAME_CACHE_TTL)) {
        mainStoreName = state.memoryCacheStoreName.name;
      } else {
        try {
          const sSnap = await serverListDocuments(STORE_SETTINGS_COLLECTION, [
            JSON.stringify({ method: 'limit', values: [1] }),
          ]);
          if (sSnap && sSnap.documents && sSnap.documents.length > 0) {
            const sDoc = sSnap.documents[0] as any;
            if (sDoc?.STORENAME || sDoc?.storeName) {
              const configuredStoreName = String(sDoc.STORENAME || sDoc.storeName).trim();
              mainStoreName = /(?:importadora\s*3b|don\s*balato)/i.test(configuredStoreName)
                ? 'Importadora Carlitos'
                : configuredStoreName;
            }
          }
        } catch (e) {
          console.warn('Error obteniendo nombre de la tienda principal en catalog-cache:', e);
        }
        state.memoryCacheStoreName = { name: mainStoreName, time: sNow };
      }

      // Normalize images and attach main store name
      const normalizedMain = allProducts
        .filter((p: any) => isMainStoreProduct(p))
        .map(p => {
          const np = applyWebPrice(normalizeProductImages(p as any)) as any;
          const webStock = getInventoryStock(p, inventoryMode, true);
          np.STOCK = webStock;
          np.stock = webStock;
          np.VENDOR_ID = '';
          np.VENDOR_NAME = mainStoreName;
          np.VENDOR_IS_MAIN = true;
          return np;
        });

      const normalizedVendors = allProducts
        .filter((p: any) => !isMainStoreProduct(p))
        .map((p: any) => {
          const vendorId = String(p.VENDOR_ID || p.vendorId || p.SELLERID || p.sellerId || '').trim();
          const profile = vendorProfiles[vendorId];
          if (!profile || !activeVendorIds.has(vendorId)) return null;
          const np = applyWebPrice(normalizeProductImages(p as any)) as any;
          np.VENDOR_ID = vendorId;
          np.VENDOR_NAME = profile.name;
          np.VENDOR_LOGO_URL = profile.logoUrl;
          np.VENDOR_BRAND_COLOR = profile.color;
          np.VENDOR_SECONDARY_COLOR = profile.secondaryColor;
          np.VENDOR_IS_MAIN = false;
          return np;
        })
        .filter(Boolean);

      state.memoryCacheAllProducts = [...normalizedMain, ...normalizedVendors];
      state.memoryCacheAllProductsTime = Date.now();
      state.memoryCacheInventoryMode = inventoryMode;
      return state.memoryCacheAllProducts;
    } finally {
      state.inflightCatalogFetch = null;
      state.inflightCatalogMode = null;
    }
  })();

  return state.inflightCatalogFetch;
}

const nextCachedAllProducts = unstable_cache(
  async (inventoryMode: InventoryConnectionMode) => fetchAllProductsFromDb(inventoryMode, true),
  ['all-public-products-cache-v22'],
  { revalidate: false, tags: ['products', 'store_settings', 'vendors'] }
);

export async function getCachedAllProducts(options?: { eventDriven?: boolean }): Promise<any[]> {
  const inventoryMode = await getInventoryConnectionMode();
  if (options?.eventDriven) {
    // Esta ruta permanece en caché hasta que una mutación invalida `products`.
    // No son necesarias lecturas por intervalo ni polling del catálogo.
    const result = await nextCachedAllProducts(inventoryMode);
    if (Array.isArray(result)) {
      state.memoryCacheAllProducts = result;
      state.memoryCacheAllProductsTime = Date.now();
      state.memoryCacheInventoryMode = inventoryMode;
      state.needsDeltaSync = false;
    }
    return result;
  }
  if (
    state.memoryCacheAllProducts &&
    state.memoryCacheInventoryMode === inventoryMode &&
    !state.needsDeltaSync &&
    Date.now() - state.memoryCacheAllProductsTime < MEMORY_CACHE_TTL
  ) {
    return state.memoryCacheAllProducts;
  }
  // Si ya tenemos el mapa base en RAM, usamos Delta Sync directo sin pasar por serialización de unstable_cache
  if (state.rawDocsMap.size > 0) {
    return fetchAllProductsFromDb(inventoryMode);
  }
  const result = await nextCachedAllProducts(inventoryMode);
  if (Array.isArray(result) && result.length > 0 && !state.memoryCacheAllProducts) {
    state.memoryCacheAllProducts = result;
    state.memoryCacheAllProductsTime = Date.now();
    state.memoryCacheInventoryMode = inventoryMode;
  }
  return result;
}
