import { getServices, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, Query, DATABASE_ID } from '@/lib/db';

export interface FirebaseErpProduct {
  $id: string;
  sku: string;
  isAutoSku?: boolean;
  codigo_barra: string;
  nombre: string;
  description?: string;
  costo_uni: number;
  precio_venta_1: number; // Precio detalle (web PRICE / CURRENTPRICE)
  precio_venta_2: number; // Precio mayorista (WHOLESALEPRICE)
  precio_venta_3: number; // Precio emprendedor / distribuidor (EMPRENDEDORPRICE)
  precio_venta_4?: number; // Cuarto nivel de precio
  precio_venta_5?: number;
  precio_venta_6?: number;
  precio_venta_7?: number;
  precio_venta_8?: number;
  precio_venta_9?: number;
  precio_venta_10?: number;
  web_price?: number;
  web_publish_pending?: boolean;
  web_published_at?: string;
  stock: number;
  ilimitado?: boolean;
  isactive: boolean;
  show_in_web: boolean;
  web_only?: boolean;
  category: string;
  subcategory?: string;
  imageUrl: string | null;
  imageUrl2?: string | null;
  imageUrl3?: string | null;
  supplier?: string;
  packageQty?: string;
  boxCode?: string;
  label_p2?: string;
  label_p3?: string;
  label_p4?: string;
  label_p5?: string;
  label_p6?: string;
  label_p7?: string;
  label_p8?: string;
  label_p9?: string;
  label_p10?: string;
  min_qty_2?: number;
  min_qty_3?: number;
  is_draft?: boolean;
  status?: string;
  source?: string;
  origen?: string;
  is_temporary?: boolean;
  rawDocument?: any;
}

export function isAppwriteProduct(p: {
  origen?: string;
  source?: string;
  is_temporary?: boolean;
  sku?: string;
  $id?: string;
  rowId?: string;
} | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    p.origen === 'appwrite' ||
    p.source === 'appwrite' ||
    p.is_temporary ||
    String(p.sku || '').toUpperCase().startsWith('AW-') ||
    String(p.$id || '').toLowerCase().startsWith('aw_') ||
    String(p.rowId || '').toLowerCase().startsWith('aw_')
  );
}

export function resolveSku(doc: any): string {
  if (!doc) return '';
  if (doc.SKU && typeof doc.SKU === 'string' && doc.SKU.trim()) return doc.SKU.trim();
  if (doc.sku && typeof doc.sku === 'string' && doc.sku.trim()) return doc.sku.trim();

  const feat = doc.FEATURES;
  const featStr = typeof feat === 'string' ? feat : (Array.isArray(feat) ? feat.join(' ') : String(feat || ''));
  const m = featStr.match(/SKU:\s*([^\s,\n]+)/i);
  if (m && m[1]) return m[1].trim();

  const tags = Array.isArray(doc.TAGS)
    ? doc.TAGS
    : (typeof doc.TAGS === 'string' ? doc.TAGS.split(',').map((t: string) => t.trim()) : []);
  const tagSku = tags.find((t: string) => t.toUpperCase().startsWith('VT-') || t.toUpperCase().startsWith('DB-') || t.toUpperCase().startsWith('DB'));
  if (tagSku) return tagSku;

  if (doc.jumpseller_id && String(doc.jumpseller_id).trim()) return String(doc.jumpseller_id).trim();

  return '-';
}

const POS_PRODUCTS_CACHE_KEY = 'carlitos_products_workspace_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas (panel privado, ahorrar lecturas)
export const POS_PRODUCTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos: evita sondeos por minuto y reusa caché local entre pestañas/F5.

// 🔒 Caché en RAM + deduplicación de promesas en vuelo (protege si localStorage se llena o si montan varios componentes a la vez)
let _erpProductsMemoryCache: { timestamp: number; items: FirebaseErpProduct[] } | null = null;
let _inflightErpProducts: Promise<FirebaseErpProduct[]> | null = null;

function hydrateErpProductsFromLocalStorage(items: FirebaseErpProduct[]): FirebaseErpProduct[] {
  return items.map((it) => {
    if (!it.rawDocument) return it;
    return {
      ...it,
      rawDocument: {
        ...it.rawDocument,
        $id: it.rawDocument.$id ?? it.$id,
        NAME: it.rawDocument.NAME ?? it.nombre,
        DESCRIPTION: it.rawDocument.DESCRIPTION ?? it.description ?? '',
        IMAGEURL: it.rawDocument.IMAGEURL ?? it.imageUrl ?? null,
        IMAGEURL2: it.rawDocument.IMAGEURL2 ?? it.imageUrl2 ?? null,
        IMAGEURL3: it.rawDocument.IMAGEURL3 ?? it.imageUrl3 ?? null,
        PRICE: it.rawDocument.PRICE ?? it.precio_venta_1,
        WHOLESALEPRICE: it.rawDocument.WHOLESALEPRICE ?? it.precio_venta_2,
        STOCK: it.rawDocument.STOCK ?? it.stock,
        COST: it.rawDocument.COST ?? it.costo_uni,
      },
    };
  });
}

function persistErpProductsToLocalStorage(timestamp: number, items: FirebaseErpProduct[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Limpiar claves Base64 pesadas que saturaban la cuota de 5 MB de localStorage
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('asistora_sakura_wallpaper') ||
          k.startsWith('asistora_neko_wallpaper') ||
          k.startsWith('asistora_neko_fernanda_wallpaper') ||
          k.startsWith('asistora_capy_wallpaper') ||
          k.startsWith('asistora_jasmine_wallpaper') ||
          k.startsWith('asistora_sakura_petal') ||
          k.startsWith('dashboard_media_cache_'))
      ) {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    }
  } catch {}

  const compactItems = items.map((it) => {
    if (!it.rawDocument) return it;
    const {
      DESCRIPTION,
      description,
      FEATURES,
      features,
      INGREDIENTS,
      ingredients,
      USAGE,
      usage,
      DETAILS,
      details,
      NAME,
      IMAGEURL,
      IMAGEURL2,
      IMAGEURL3,
      ...lightRaw
    } = it.rawDocument;
    return { ...it, rawDocument: lightRaw };
  });

  const serialized = JSON.stringify({ timestamp, items: compactItems });
  try {
    localStorage.setItem(POS_PRODUCTS_CACHE_KEY, serialized);
  } catch {
    try {
      localStorage.removeItem('carlitos_admin_products_cache_v1');
      localStorage.setItem(POS_PRODUCTS_CACHE_KEY, serialized);
    } catch (e2) {
      console.warn('No se pudo guardar productos en localStorage:', e2);
    }
  }
}

export function clearPosProductsCache(options?: { onlyWorkspace?: boolean }): void {
  _erpProductsMemoryCache = null;
  _inflightErpProducts = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(POS_PRODUCTS_CACHE_KEY);
      if (!options?.onlyWorkspace) {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('yaxsel_pos_products_') || k.startsWith('donbalato_pos_') || k.startsWith('yaxsel_cache:')) {
            localStorage.removeItem(k);
          }
        });
      }
    } catch {}
  }
}

/**
 * Parchea el stock en la caché RAM + localStorage del POS/ERP sin realizar lecturas a Firestore.
 * Evita que al recargar con F5 o en el intervalo de 1h el stock regrese al valor antiguo cacheado.
 */
export function patchErpProductsLocalCacheStock(
  deltas: { id?: string; sku?: string; delta: number }[]
): void {
  if (!Array.isArray(deltas) || deltas.length === 0) return;
  const deltaById = new Map<string, number>();
  const deltaBySku = new Map<string, number>();
  for (const d of deltas) {
    const val = Number(d.delta || 0);
    if (!val) continue;
    if (d.id) deltaById.set(String(d.id).trim(), (deltaById.get(String(d.id).trim()) || 0) + val);
    if (d.sku) {
      const norm = String(d.sku).toUpperCase().replace(/[\s\-_]/g, '').trim();
      if (norm) deltaBySku.set(norm, (deltaBySku.get(norm) || 0) + val);
    }
  }
  if (deltaById.size === 0 && deltaBySku.size === 0) return;

  const applyToList = (list: FirebaseErpProduct[]): boolean => {
    let changed = false;
    for (const p of list) {
      const idMatch = p.$id ? deltaById.get(String(p.$id).trim()) : undefined;
      const normSku = p.sku ? String(p.sku).toUpperCase().replace(/[\s\-_]/g, '').trim() : '';
      const skuMatch = normSku ? deltaBySku.get(normSku) : undefined;
      const delta = idMatch !== undefined ? idMatch : skuMatch;
      if (delta) {
        p.stock = Number(p.stock || 0) + delta;
        if (p.rawDocument) {
          p.rawDocument.STOCK = p.stock;
          p.rawDocument.stock = p.stock;
        }
        changed = true;
      }
    }
    return changed;
  };

  if (_erpProductsMemoryCache?.items) {
    applyToList(_erpProductsMemoryCache.items);
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          if (applyToList(parsed.items)) {
            persistErpProductsToLocalStorage(parsed.timestamp || Date.now(), parsed.items);
          }
        }
      }
    } catch {}
  }
}

/**
 * Purga la caché SERVER-SIDE del appwrite-proxy (unstable_cache 24h, tag 'products').
 * Sin esto, tras editar precio/stock desde pos-admin el proxy seguía sirviendo
 * datos de hasta 24h de antigüedad (inconsistencia Web ↔ POS).
 * Fire-and-forget + coalescido: máximo 1 llamada cada 2s aunque se editen N productos.
 */
let lastPurgeAt = 0;
let purgeTimer: ReturnType<typeof setTimeout> | null = null;
export function purgeServerProductsCache(): void {
  if (typeof window === 'undefined') return;
  const markNeedsDelta = (storage: Storage, key: string) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        parsed.needsDeltaSync = true;
        storage.setItem(key, JSON.stringify(parsed));
      } else {
        storage.removeItem(key);
      }
    } catch {
      try { storage.removeItem(key); } catch {}
    }
  };
  markNeedsDelta(sessionStorage, 'carlitos_admin_products_all_v1');
  markNeedsDelta(localStorage, 'carlitos_admin_products_cache_v1');
  // NOTA: NO borrar la caché de localStorage del POS aquí (clearPosProductsCache)
  // porque updateFirebaseErpProduct ya la actualiza in-place.
  const nowTs = Date.now();
  const doPurge = () => {
    lastPurgeAt = Date.now();
    fetch('/api/revalidate?tag=products').then(async response => {
      if (!response.ok) throw new Error('No se pudo actualizar el catálogo');
      const { signalCatalogChanged } = await import('./catalog-live-refresh');
      await signalCatalogChanged();
    }).catch(error => console.error('[catalog] No se pudo invalidar la caché:', error));
  };
  if (nowTs - lastPurgeAt > 2000) {
    if (purgeTimer) { clearTimeout(purgeTimer); purgeTimer = null; }
    doPurge();
  } else if (!purgeTimer) {
    purgeTimer = setTimeout(() => { purgeTimer = null; doPurge(); }, 2100);
  }
}

// Generar el siguiente SKU consecutivo basado en los SKUs existentes
export function generateNextConsecutiveSku(existingSkus: string[], prefix = 'DB-'): string {
  let maxNum = 0;
  existingSkus.forEach((sku) => {
    if (!sku || sku === '-') return;
    const match = sku.match(/(\d+)$/);
    if (match && match[1]) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxNum) {
        maxNum = val;
      }
    }
  });

  const nextNum = maxNum + 1;
  const padLen = Math.max(3, String(nextNum).length);
  return `${prefix}${String(nextNum).padStart(padLen, '0')}`;
}

export function isWebVisible(doc: any): boolean {
  if (!doc) return false;
  const raw = doc.SHOW_IN_WEB !== undefined ? doc.SHOW_IN_WEB : doc.show_in_web;
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'true') return true;
  return false;
}

export function isWebOnlyProduct(product: any): boolean {
  if (!product) return false;
  const raw = product.rawDocument || product;
  const value = product.web_only ?? raw.WEB_ONLY ?? raw.web_only ?? raw.SOLO_WEB ?? raw.solo_web;
  return value === true || value === 1 || (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()));
}

// Cargar todos los productos de la colección 'products' en Firebase Firestore
export async function fetchAllFirebaseErpProducts(
  forceRefresh = false,
  cacheTtlMs = CACHE_TTL_MS,
): Promise<FirebaseErpProduct[]> {
  try {
    // 1. Revisar caché en RAM primero (0ms, 0 lecturas, inmune a QuotaExceededError de localStorage)
    if (!forceRefresh && _erpProductsMemoryCache && (Date.now() - _erpProductsMemoryCache.timestamp < cacheTtlMs) && _erpProductsMemoryCache.items.length > 0) {
      return _erpProductsMemoryCache.items;
    }

    // 2. Revisar localStorage
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.timestamp && (Date.now() - parsed.timestamp < cacheTtlMs) && Array.isArray(parsed.items) && parsed.items.length > 0) {
            const hydrated = hydrateErpProductsFromLocalStorage(parsed.items);
            _erpProductsMemoryCache = { timestamp: parsed.timestamp, items: hydrated };
            return hydrated;
          }
        }
      } catch {}
    }

    // 3. Deduplicar llamadas en vuelo simultáneas
    if (!forceRefresh && _inflightErpProducts) {
      return _inflightErpProducts;
    }

    _inflightErpProducts = (async () => {
      try {
        const loadProducts = async (): Promise<FirebaseErpProduct[]> => {
        const { databases } = getServices();
        const dbId = DATABASE_ID;

        // Intentar recuperar base previa para Delta Sync (evita leer los 400 productos si solo cambiaron unos pocos)
        let baseCache: { timestamp: number; items: FirebaseErpProduct[] } | null = forceRefresh ? null : _erpProductsMemoryCache;
        if (!baseCache && !forceRefresh && typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0 && Number(parsed.timestamp) > 0) {
                baseCache = { timestamp: Number(parsed.timestamp), items: hydrateErpProductsFromLocalStorage(parsed.items) };
              }
            }
          } catch {}
        }

        const filterVendorDoc = (doc: any) => {
          if (doc.isVendorProduct === true || doc.IS_VENDOR_PRODUCT === true) return false;
          const vid = doc.VENDOR_ID || doc.vendorId;
          if (vid && !['__MAIN__', 'carlitos', 'importadora-carlitos', 'importadora_carlitos'].includes(vid)) return false;
          const sid = doc.SELLERID || doc.sellerId;
          if (sid && !['__MAIN__', 'carlitos', 'importadora-carlitos', 'importadora_carlitos'].includes(sid)) return false;
          return true;
        };

        const mapDocToErpProduct = (doc: any, fallbackSku?: string, isAuto = false): FirebaseErpProduct => {
          const finalSku = fallbackSku || resolveSku(doc) || doc.$id;
          return {
            $id: doc.$id,
            sku: finalSku,
            isAutoSku: isAuto,
            codigo_barra: doc.BARCODE || doc.barcode || doc.codigo_barra || doc.sku || '',
            nombre: doc.NAME || doc.name || doc.nombre || 'Sin Nombre',
            description: doc.DESCRIPTION || doc.description || '',
            costo_uni: Number(doc.COST || doc.cost || doc.costo_uni || 0),
            precio_venta_1: Number(doc.PRICE || doc.price || doc.precio_venta_1 || doc.CURRENTPRICE || 0),
            precio_venta_2: Number(doc.WHOLESALEPRICE || doc.precio_venta_2 || doc.PRICE || 0),
            precio_venta_3: Number(doc.EMPRENDEDORPRICE || doc.precio_venta_3 || 0),
            precio_venta_4: Number(doc.PRICE4 ?? doc.PRICE_4 ?? doc.price4 ?? doc.precio_venta_4 ?? doc.P4 ?? 0),
            precio_venta_5: Number(doc.PRICE5 ?? doc.PRICE_5 ?? doc.price5 ?? doc.precio_venta_5 ?? doc.P5 ?? 0),
            precio_venta_6: Number(doc.PRICE6 ?? doc.PRICE_6 ?? doc.price6 ?? doc.precio_venta_6 ?? doc.P6 ?? 0),
            precio_venta_7: Number(doc.PRICE7 ?? doc.PRICE_7 ?? doc.price7 ?? doc.precio_venta_7 ?? doc.P7 ?? 0),
            precio_venta_8: Number(doc.PRICE8 ?? doc.PRICE_8 ?? doc.price8 ?? doc.precio_venta_8 ?? doc.P8 ?? 0),
            precio_venta_9: Number(doc.PRICE9 ?? doc.PRICE_9 ?? doc.price9 ?? doc.precio_venta_9 ?? doc.P9 ?? 0),
            precio_venta_10: Number(doc.PRICE10 ?? doc.PRICE_10 ?? doc.price10 ?? doc.precio_venta_10 ?? doc.P10 ?? 0),
            web_price: Number(doc.WEBPRICE || doc.web_price || Math.max(Number(doc.PRICE || 0), Number(doc.WHOLESALEPRICE || 0))),
            web_publish_pending: Boolean(doc.WEB_PUBLISH_PENDING ?? doc.web_publish_pending),
            web_published_at: doc.WEB_PUBLISHED_AT || doc.web_published_at || '',
            stock: Number(doc.STOCK ?? doc.stock ?? doc.CANTIDAD ?? doc.cantidad ?? 0),
            ilimitado: Boolean(doc.ILIMITADO ?? doc.ilimitado ?? (Number(doc.STOCK ?? doc.stock ?? 0) >= 99999)),
            isactive: doc.ISACTIVE !== undefined ? Boolean(doc.ISACTIVE) : true,
            show_in_web: isWebVisible(doc),
            web_only: isWebOnlyProduct(doc),
            category: doc.category || doc.CATEGORYID || doc.categoria || 'General',
            subcategory: doc.subcategory || doc.SUBCATEGORYID || '',
            supplier: doc.BRAND || doc.SUPPLIER || doc.supplier || doc.proveedor || '',
            packageQty: doc.PACKAGE_QTY || doc.QUANTITY || doc.packageQty || doc.cantidad_embalaje || '',
            boxCode: doc.BOX_CODE || doc.box_code || doc.boxCode || '',
            label_p2: doc.LABEL_P2 || doc.label_p2 || doc.p2_label || doc.p2Label || doc.labelP2 || doc.etiqueta_p2 || doc.ETIQUETA_P2 || '',
            label_p3: doc.LABEL_P3 || doc.label_p3 || doc.p3_label || doc.p3Label || doc.labelP3 || doc.etiqueta_p3 || doc.ETIQUETA_P3 || '',
            label_p4: doc.LABEL_P4 || doc.label_p4 || doc.p4_label || doc.p4Label || doc.labelP4 || doc.etiqueta_p4 || doc.ETIQUETA_P4 || '',
            label_p5: doc.LABEL_P5 || doc.label_p5 || doc.p5_label || doc.p5Label || doc.labelP5 || doc.etiqueta_p5 || doc.ETIQUETA_P5 || '',
            label_p6: doc.LABEL_P6 || doc.label_p6 || doc.p6_label || doc.p6Label || doc.labelP6 || doc.etiqueta_p6 || doc.ETIQUETA_P6 || '',
            label_p7: doc.LABEL_P7 || doc.label_p7 || doc.p7_label || doc.p7Label || doc.labelP7 || doc.etiqueta_p7 || doc.ETIQUETA_P7 || '',
            label_p8: doc.LABEL_P8 || doc.label_p8 || doc.p8_label || doc.p8Label || doc.labelP8 || doc.etiqueta_p8 || doc.ETIQUETA_P8 || '',
            label_p9: doc.LABEL_P9 || doc.label_p9 || doc.p9_label || doc.p9Label || doc.labelP9 || doc.etiqueta_p9 || doc.ETIQUETA_P9 || '',
            label_p10: doc.LABEL_P10 || doc.label_p10 || doc.p10_label || doc.p10Label || doc.labelP10 || doc.etiqueta_p10 || doc.ETIQUETA_P10 || '',
            min_qty_2: Number(doc.MIN_QTY_P2 || doc.min_qty_2 || 0) || undefined,
            min_qty_3: Number(doc.MIN_QTY_P3 || doc.min_qty_3 || 0) || undefined,
            is_draft: Boolean(doc.IS_DRAFT ?? doc.is_draft ?? (doc.STATUS === 'draft' || doc.status === 'draft')),
            status: doc.STATUS || doc.status || ((doc.IS_DRAFT || doc.is_draft) ? 'draft' : 'active'),
            imageUrl: doc.IMAGEURL || doc.imageUrl || doc.image || null,
            imageUrl2: doc.IMAGEURL2 || null,
            imageUrl3: doc.IMAGEURL3 || null,
            source: doc.source || (String(doc.$id || '').startsWith('aw_') ? 'appwrite' : undefined),
            origen: doc.origen || (String(doc.$id || '').startsWith('aw_') ? 'appwrite' : undefined),
            is_temporary: Boolean(doc.is_temporary || String(doc.$id || '').startsWith('aw_')),
            rawDocument: doc,
          };
        };

        let items: FirebaseErpProduct[] = [];

        // ⚡ DELTA SYNC: Si ya tenemos un catálogo base en caché, consultar SOLO los documentos con updatedAt > lastSyncTs - 60s
        if (baseCache && baseCache.items.length >= 50 && baseCache.timestamp > 0) {
          try {
            const sinceTs = Math.max(0, baseCache.timestamp - 60_000);
            const deltaRes = await databases.listDocuments(dbId, PRODUCTS_COLLECTION, [
              Query.greaterThan('updatedAt', sinceTs),
              Query.limit(1000),
            ]);
            const deltaDocs = (deltaRes.documents || []).filter(filterVendorDoc);
            if (deltaDocs.length === 0) {
              const nowTs = Date.now();
              _erpProductsMemoryCache = { timestamp: nowTs, items: baseCache.items };
              persistErpProductsToLocalStorage(nowTs, baseCache.items);
              return baseCache.items;
            }
            const mergedMap = new Map<string, FirebaseErpProduct>();
            baseCache.items.forEach(item => mergedMap.set(item.$id, item));
            for (const dDoc of deltaDocs) {
              const prev = mergedMap.get(dDoc.$id);
              const mapped = mapDocToErpProduct(dDoc, resolveSku(dDoc) || prev?.sku || dDoc.$id, prev?.isAutoSku || false);
              mergedMap.set(dDoc.$id, mapped);
            }
            items = Array.from(mergedMap.values());
            console.log(`⚡ Firebase Delta Sync: ${deltaDocs.length} productos modificados sincronizados (base: ${ items.length }).`);
          } catch (deltaErr) {
            console.warn('[DeltaSync] Fallback a carga completa:', deltaErr);
          }
        }

        // Carga inicial completa (solo cuando no hay caché previa o falló el delta)
        if (items.length === 0) {
          const res = await databases.listDocuments(dbId, PRODUCTS_COLLECTION, [
            Query.limit(5000),
            Query.orderDesc('$createdAt'),
          ]);
          const allDocs: any[] = (res.documents || []).filter(filterVendorDoc);

          let maxFound = 0;
          allDocs.forEach((doc) => {
            const explicit = resolveSku(doc);
            if (explicit && explicit !== '-') {
              const match = explicit.match(/(\d+)$/);
              if (match && match[1]) {
                const val = parseInt(match[1], 10);
                if (!isNaN(val) && val > maxFound) maxFound = val;
              }
            }
          });

          let autoCounter = maxFound + 1;
          items = allDocs.map((doc: any) => {
            let finalSku = resolveSku(doc);
            let isAutoSku = false;
            if (!finalSku || finalSku === '-') {
              const padLen = Math.max(3, String(autoCounter).length);
              finalSku = `DB-${String(autoCounter).padStart(padLen, '0')}`;
              autoCounter++;
              isAutoSku = true;
            }
            return mapDocToErpProduct(doc, finalSku, isAutoSku);
          });
          console.log(`✅ Firebase ERP: ${items.length} productos cargados desde 'products' y sincronizados.`);
        }

        const nowTs = Date.now();
        _erpProductsMemoryCache = { timestamp: nowTs, items };
        persistErpProductsToLocalStorage(nowTs, items);

        return items;
        };

        // Cold starts in separate POS tabs otherwise fetch the same catalogue at
        // once. Web Locks coordinates tabs of this origin without delaying an
        // explicit refresh; recheck the shared cache after acquiring the lock.
        if (!forceRefresh && typeof navigator !== 'undefined' && navigator.locks) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          let acquired = false;
          try {
            return await navigator.locks.request('asistora-pos-products-sync', { signal: controller.signal }, async () => {
              acquired = true;
              clearTimeout(timeout);
              try {
                const raw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
                const cached = raw ? JSON.parse(raw) : null;
                if (cached && Number(cached.timestamp) > 0 && Date.now() - Number(cached.timestamp) < cacheTtlMs && Array.isArray(cached.items) && cached.items.length > 0) {
                  const items = hydrateErpProductsFromLocalStorage(cached.items);
                  _erpProductsMemoryCache = { timestamp: Number(cached.timestamp), items };
                  return items;
                }
              } catch {}
              return loadProducts();
            });
          } catch (error) {
            if (acquired) throw error;
            // Unsupported/blocked lock or a suspended tab: continue normally.
            return await loadProducts();
          } finally {
            clearTimeout(timeout);
          }
        }
        return await loadProducts();
      } finally {
        _inflightErpProducts = null;
      }
    })();

    return await _inflightErpProducts;
  } catch (error) {
    console.error('❌ Error al cargar productos de Firebase:', error);
    if (_erpProductsMemoryCache?.items?.length) return _erpProductsMemoryCache.items;
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed?.items)) return hydrateErpProductsFromLocalStorage(parsed.items);
        }
      } catch {}
    }
    return [];
  }
}

// Actualizar cualquier atributo de producto en la colección 'products' manteniéndolo sincronizado con la Web
export async function updateFirebaseErpProduct(
  productId: string,
  data: Partial<{
    sku: string;
    nombre: string;
    description: string;
    codigo_barra: string;
    precio_venta_1: number;
    precio_venta_2: number;
    precio_venta_3: number;
    precio_venta_4: number;
    precio_venta_5: number;
    precio_venta_6: number;
    precio_venta_7: number;
    precio_venta_8: number;
    precio_venta_9: number;
    precio_venta_10: number;
    web_price: number;
    web_publish_pending: boolean;
    web_published_at: string;
    costo_uni: number;
    stock: number;
    web_stock: number;
    ilimitado: boolean;
    isactive: boolean;
    show_in_web: boolean;
    web_only: boolean;
    category: string;
    subcategory: string;
    imageUrl: string;
    imageUrl2: string;
    imageUrl3: string;
    proveedor: string;
    brand: string;
    web_size: string;
    web_color: string;
    web_volume: string;
    web_managed: boolean;
    cantidad_embalaje: string;
    box_code: string;
    label_p2: string;
    label_p3: string;
    label_p4: string;
    label_p5: string;
    label_p6: string;
    label_p7: string;
    label_p8: string;
    label_p9: string;
    label_p10: string;
    min_qty_2: number;
    min_qty_3: number;
    is_draft: boolean;
    status: string;
  }>
): Promise<boolean> {
  try {
    const { databases } = getServices();
    const dbId = DATABASE_ID;

    const payload: any = {};
    if (data.sku !== undefined) {
      payload.SKU = data.sku;
      payload.jumpseller_id = data.sku;
    }
    if (data.nombre !== undefined) { payload.NAME = data.nombre; }
    if (data.description !== undefined) { payload.DESCRIPTION = data.description; }
    if (data.codigo_barra !== undefined) { payload.BARCODE = data.codigo_barra; }
    if (data.precio_venta_1 !== undefined) {
      payload.PRICE = data.precio_venta_1;
      payload.CURRENTPRICE = data.precio_venta_1;
    }
    if (data.precio_venta_2 !== undefined) { payload.WHOLESALEPRICE = data.precio_venta_2; }
    if (data.precio_venta_3 !== undefined) { payload.EMPRENDEDORPRICE = data.precio_venta_3; }
    if (data.precio_venta_4 !== undefined) {
      payload.PRICE4 = data.precio_venta_4;
      payload.precio_venta_4 = data.precio_venta_4;
    }
    if (data.precio_venta_5 !== undefined) { payload.PRICE5 = data.precio_venta_5; payload.precio_venta_5 = data.precio_venta_5; }
    if (data.precio_venta_6 !== undefined) { payload.PRICE6 = data.precio_venta_6; payload.precio_venta_6 = data.precio_venta_6; }
    if (data.precio_venta_7 !== undefined) { payload.PRICE7 = data.precio_venta_7; payload.precio_venta_7 = data.precio_venta_7; }
    if (data.precio_venta_8 !== undefined) { payload.PRICE8 = data.precio_venta_8; payload.precio_venta_8 = data.precio_venta_8; }
    if (data.precio_venta_9 !== undefined) { payload.PRICE9 = data.precio_venta_9; payload.precio_venta_9 = data.precio_venta_9; }
    if (data.precio_venta_10 !== undefined) { payload.PRICE10 = data.precio_venta_10; payload.precio_venta_10 = data.precio_venta_10; }
    if (data.web_price !== undefined) { payload.WEBPRICE = data.web_price; payload.web_price = data.web_price; }
    if (data.web_publish_pending !== undefined) { payload.WEB_PUBLISH_PENDING = data.web_publish_pending; payload.web_publish_pending = data.web_publish_pending; }
    if (data.web_published_at !== undefined) { payload.WEB_PUBLISHED_AT = data.web_published_at; payload.web_published_at = data.web_published_at; }
    if (data.costo_uni !== undefined) { payload.COST = data.costo_uni; }
    if (data.stock !== undefined) {
      payload.STOCK = data.stock;
      payload.stock = data.stock;
    }
    if (data.web_stock !== undefined) {
      payload.WEB_STOCK = data.web_stock;
      payload.web_stock = data.web_stock;
    }
    if (data.ilimitado !== undefined) {
      payload.ILIMITADO = data.ilimitado;
      payload.ilimitado = data.ilimitado;
    }
    if (data.isactive !== undefined) { payload.ISACTIVE = data.isactive; }
    if (data.show_in_web !== undefined) {
      payload.SHOW_IN_WEB = data.show_in_web;
      payload.show_in_web = data.show_in_web;
    }
    if (data.web_only !== undefined) {
      payload.WEB_ONLY = data.web_only;
      payload.web_only = data.web_only;
    }
    if (data.category !== undefined) { payload.CATEGORYID = data.category; }
    if (data.subcategory !== undefined) { payload.SUBCATEGORYID = data.subcategory; }
    if (data.imageUrl !== undefined) { payload.IMAGEURL = data.imageUrl; }
    if (data.imageUrl2 !== undefined) { payload.IMAGEURL2 = data.imageUrl2; }
    if (data.imageUrl3 !== undefined) { payload.IMAGEURL3 = data.imageUrl3; }
    if (data.brand !== undefined) { payload.BRAND = data.brand; }
    if (data.web_size !== undefined) { payload.WEB_SIZE = data.web_size; }
    if (data.web_color !== undefined) { payload.WEB_COLOR = data.web_color; }
    if (data.web_volume !== undefined) { payload.WEB_VOLUME = data.web_volume; }
    if (data.web_managed !== undefined) { payload.WEB_MANAGED = data.web_managed; }
    if (data.proveedor !== undefined) {
      payload.BRAND = data.proveedor;
      payload.SUPPLIER = data.proveedor;
      payload.supplier = data.proveedor;
      payload.proveedor = data.proveedor;
    }
    if (data.cantidad_embalaje !== undefined) {
      payload.PACKAGE_QTY = data.cantidad_embalaje;
      payload.QUANTITY = data.cantidad_embalaje;
      payload.packageQty = data.cantidad_embalaje;
      payload.cantidad_embalaje = data.cantidad_embalaje;
      const m = String(data.cantidad_embalaje).match(/\d+/);
      if (m) payload.EMBALAJEQTY = parseInt(m[0], 10);
    }
    if (data.box_code !== undefined) {
      payload.BOX_CODE = data.box_code;
      payload.box_code = data.box_code;
      payload.boxCode = data.box_code;
    }
    if (data.label_p2 !== undefined) {
      payload.LABEL_P2 = data.label_p2;
      payload.label_p2 = data.label_p2;
      payload.p2_label = data.label_p2;
      payload.p2Label = data.label_p2;
      payload.labelP2 = data.label_p2;
    }
    if (data.label_p3 !== undefined) {
      payload.LABEL_P3 = data.label_p3;
      payload.label_p3 = data.label_p3;
      payload.p3_label = data.label_p3;
      payload.p3Label = data.label_p3;
      payload.labelP3 = data.label_p3;
    }
    if (data.label_p4 !== undefined) {
      payload.LABEL_P4 = data.label_p4;
      payload.label_p4 = data.label_p4;
      payload.p4_label = data.label_p4;
      payload.p4Label = data.label_p4;
      payload.labelP4 = data.label_p4;
    }
    if (data.label_p5 !== undefined) { payload.LABEL_P5 = data.label_p5; payload.label_p5 = data.label_p5; payload.p5_label = data.label_p5; }
    if (data.label_p6 !== undefined) { payload.LABEL_P6 = data.label_p6; payload.label_p6 = data.label_p6; payload.p6_label = data.label_p6; }
    if (data.label_p7 !== undefined) { payload.LABEL_P7 = data.label_p7; payload.label_p7 = data.label_p7; payload.p7_label = data.label_p7; }
    if (data.label_p8 !== undefined) { payload.LABEL_P8 = data.label_p8; payload.label_p8 = data.label_p8; payload.p8_label = data.label_p8; }
    if (data.label_p9 !== undefined) { payload.LABEL_P9 = data.label_p9; payload.label_p9 = data.label_p9; payload.p9_label = data.label_p9; }
    if (data.label_p10 !== undefined) { payload.LABEL_P10 = data.label_p10; payload.label_p10 = data.label_p10; payload.p10_label = data.label_p10; }
    if (data.min_qty_2 !== undefined) {
      payload.MIN_QTY_P2 = data.min_qty_2;
      payload.min_qty_2 = data.min_qty_2;
    }
    if (data.min_qty_3 !== undefined) {
      payload.MIN_QTY_P3 = data.min_qty_3;
      payload.min_qty_3 = data.min_qty_3;
    }
    payload.updatedAt = Date.now();
    if (data.is_draft !== undefined) {
      payload.IS_DRAFT = data.is_draft;
      payload.is_draft = data.is_draft;
      payload.STATUS = data.is_draft ? 'draft' : 'active';
      payload.status = data.is_draft ? 'draft' : 'active';
    }

    let targetDocId = productId;
    try {
      await databases.updateDocument(dbId, PRODUCTS_COLLECTION, targetDocId, payload);
    } catch (directErr) {
      // Si el id no coincide directamente, buscar por SKU (mayúsculas o minúsculas)
      const skuToFind = data.sku || productId;
      let foundDoc: any = null;
      try {
        const searchRes = await databases.listDocuments(dbId, PRODUCTS_COLLECTION, [
          Query.equal('SKU', skuToFind),
          Query.limit(1),
        ]);
        if (searchRes.documents && searchRes.documents.length > 0) {
          foundDoc = searchRes.documents[0];
        }
      } catch {}

      if (!foundDoc) {
        try {
          const searchResLower = await databases.listDocuments(dbId, PRODUCTS_COLLECTION, [
            Query.equal('sku', skuToFind),
            Query.limit(1),
          ]);
          if (searchResLower.documents && searchResLower.documents.length > 0) {
            foundDoc = searchResLower.documents[0];
          }
        } catch {}
      }

      if (foundDoc) {
        targetDocId = foundDoc.$id;
        await databases.updateDocument(dbId, PRODUCTS_COLLECTION, targetDocId, payload);
      } else {
        throw directErr;
      }
    }
    // Mantener la caché local de 24h actualizada en memoria y localStorage sin destruirla
    const applyPatchToItem = (it: any) => {
      if (it.$id === productId || it.sku === productId || it.$id === targetDocId || (data.sku && it.sku === data.sku)) {
        return {
          ...it,
          ...(data.nombre !== undefined && { nombre: data.nombre }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.sku !== undefined && { sku: data.sku }),
          ...(data.codigo_barra !== undefined && { codigo_barra: data.codigo_barra }),
          ...(data.precio_venta_1 !== undefined && { precio_venta_1: data.precio_venta_1 }),
          ...(data.precio_venta_2 !== undefined && { precio_venta_2: data.precio_venta_2 }),
          ...(data.precio_venta_3 !== undefined && { precio_venta_3: data.precio_venta_3 }),
          ...(data.precio_venta_4 !== undefined && { precio_venta_4: data.precio_venta_4 }),
          ...(data.precio_venta_5 !== undefined && { precio_venta_5: data.precio_venta_5 }),
          ...(data.precio_venta_6 !== undefined && { precio_venta_6: data.precio_venta_6 }),
          ...(data.precio_venta_7 !== undefined && { precio_venta_7: data.precio_venta_7 }),
          ...(data.precio_venta_8 !== undefined && { precio_venta_8: data.precio_venta_8 }),
          ...(data.precio_venta_9 !== undefined && { precio_venta_9: data.precio_venta_9 }),
          ...(data.precio_venta_10 !== undefined && { precio_venta_10: data.precio_venta_10 }),
          ...(data.web_price !== undefined && { web_price: data.web_price }),
          ...(data.web_publish_pending !== undefined && { web_publish_pending: data.web_publish_pending }),
          ...(data.web_published_at !== undefined && { web_published_at: data.web_published_at }),
          ...(data.costo_uni !== undefined && { costo_uni: data.costo_uni }),
          ...(data.stock !== undefined && { stock: data.stock }),
          ...(data.ilimitado !== undefined && { ilimitado: data.ilimitado }),
          ...(data.isactive !== undefined && { isactive: data.isactive }),
          ...(data.show_in_web !== undefined && { show_in_web: data.show_in_web }),
          ...(data.web_only !== undefined && { web_only: data.web_only }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.subcategory !== undefined && { subcategory: data.subcategory }),
          ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
          ...(data.imageUrl2 !== undefined && { imageUrl2: data.imageUrl2 }),
          ...(data.imageUrl3 !== undefined && { imageUrl3: data.imageUrl3 }),
          ...(data.brand !== undefined && { supplier: data.brand }),
          ...(data.proveedor !== undefined && { supplier: data.proveedor }),
          ...(data.cantidad_embalaje !== undefined && { packageQty: data.cantidad_embalaje }),
          ...(data.box_code !== undefined && { boxCode: data.box_code }),
          ...(data.label_p2 !== undefined && { label_p2: data.label_p2 }),
          ...(data.label_p3 !== undefined && { label_p3: data.label_p3 }),
          ...(data.label_p4 !== undefined && { label_p4: data.label_p4 }),
          ...(data.label_p5 !== undefined && { label_p5: data.label_p5 }),
          ...(data.label_p6 !== undefined && { label_p6: data.label_p6 }),
          ...(data.label_p7 !== undefined && { label_p7: data.label_p7 }),
          ...(data.label_p8 !== undefined && { label_p8: data.label_p8 }),
          ...(data.label_p9 !== undefined && { label_p9: data.label_p9 }),
          ...(data.label_p10 !== undefined && { label_p10: data.label_p10 }),
          ...(data.min_qty_2 !== undefined && { min_qty_2: data.min_qty_2 }),
          ...(data.min_qty_3 !== undefined && { min_qty_3: data.min_qty_3 }),
          ...(data.is_draft !== undefined && { is_draft: data.is_draft, status: data.is_draft ? 'draft' : 'active' }),
          rawDocument: {
            ...(it.rawDocument || {}),
            ...(data.label_p2 !== undefined && { LABEL_P2: data.label_p2, label_p2: data.label_p2, p2_label: data.label_p2, p2Label: data.label_p2, labelP2: data.label_p2 }),
            ...(data.label_p3 !== undefined && { LABEL_P3: data.label_p3, label_p3: data.label_p3, p3_label: data.label_p3, p3Label: data.label_p3, labelP3: data.label_p3 }),
            ...payload,
          },
        };
      }
      return it;
    };

    if (_erpProductsMemoryCache?.items) {
      _erpProductsMemoryCache = {
        timestamp: _erpProductsMemoryCache.timestamp || Date.now(),
        items: _erpProductsMemoryCache.items.map(applyPatchToItem),
      };
      persistErpProductsToLocalStorage(_erpProductsMemoryCache.timestamp, _erpProductsMemoryCache.items);
    } else if (typeof window !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed?.items)) {
            const hydrated = hydrateErpProductsFromLocalStorage(parsed.items).map(applyPatchToItem);
            const ts = parsed.timestamp || Date.now();
            _erpProductsMemoryCache = { items: hydrated, timestamp: ts };
            persistErpProductsToLocalStorage(ts, hydrated);
          }
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      const patchAdminCache = (storage: Storage, key: string) => {
        try {
          const raw = storage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.products)) {
            parsed.products = parsed.products.map((p: any) =>
              (p.$id === productId || p.$id === targetDocId || p.SKU === productId || p.sku === productId)
                ? { ...p, ...payload }
                : p
            );
            storage.setItem(key, JSON.stringify(parsed));
          }
        } catch {}
      };
      patchAdminCache(localStorage, 'carlitos_admin_products_cache_v1');
      patchAdminCache(sessionStorage, 'carlitos_admin_products_all_v1');
    }
    purgeServerProductsCache();
    console.log(`✅ Producto [${productId}] actualizado en Firebase (Web & POS Sync)`);
    return true;
  } catch (error) {
    console.error(`❌ Error actualizando producto [${productId}]:`, error);
    return false;
  }
}

export async function createFirebaseErpProduct(data: {
  sku?: string;
  nombre: string;
  descripcion?: string;
  codigo_barra?: string;
  precio_venta_1?: number;
  precio_venta_2?: number;
  precio_venta_3?: number;
  precio_venta_4?: number;
  precio_venta_5?: number;
  precio_venta_6?: number;
  precio_venta_7?: number;
  precio_venta_8?: number;
  precio_venta_9?: number;
  precio_venta_10?: number;
  costo_uni?: number;
  stock?: number;
  web_stock?: number;
  category?: string;
  subcategory?: string;
  isactive?: boolean;
  show_in_web?: boolean;
  web_only?: boolean;
  proveedor?: string;
  brand?: string;
  web_size?: string;
  web_color?: string;
  web_volume?: string;
  web_managed?: boolean;
  imageUrl?: string;
  imageUrl2?: string;
  imageUrl3?: string;
  cantidad_embalaje?: string;
  box_code?: string;
  label_p2?: string;
  label_p3?: string;
  label_p4?: string;
  label_p5?: string;
  label_p6?: string;
  label_p7?: string;
  label_p8?: string;
  label_p9?: string;
  label_p10?: string;
  min_qty_2?: number;
  min_qty_3?: number;
  is_draft?: boolean;
  status?: string;
  section?: number;
  tags?: string;
  features?: string;
  packqty?: number;
  packprice?: number;
  embalajeqty?: number;
  embalajeprice?: number;
  promo_qty?: number;
  promo_price?: number;
  wholesale_min_qty?: number;
  wholesale_price?: number;
  pack_discount_pct?: number;
  pack_min_packs?: number;
  details?: string;
  usage?: string;
  ingredients?: string;
  current_price?: number;
  disable_discounts?: boolean;
}): Promise<string | null> {
  try {
    const { databases } = getServices();
    const dbId = DATABASE_ID;
    const docId = (data.sku && /^[a-zA-Z0-9_.-]{1,36}$/.test(data.sku)) ? data.sku : `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isDraft = Boolean(data.is_draft || data.status === 'draft' || Number(data.precio_venta_1 || 0) <= 0);
    const stockForSave = (data.stock === undefined || data.stock === null) ? (isDraft ? 0 : 99999) : Math.max(0, Math.round(Number(data.stock)));
    const now = Date.now();
    const payload: any = {
      createdAt: now,
      updatedAt: now,
      NAME: data.nombre,
      DESCRIPTION: data.descripcion || '',
      PRICE: Math.round(Number(data.precio_venta_1 || 0)),
      CURRENTPRICE: data.current_price ? Math.round(Number(data.current_price)) : null,
      WHOLESALEPRICE: Math.round(Number(data.precio_venta_2 || data.wholesale_price || 0)),
      EMPRENDEDORPRICE: Math.round(Number(data.precio_venta_3 || 0)),
      PRICE4: Math.round(Number(data.precio_venta_4 || 0)),
      precio_venta_4: Math.round(Number(data.precio_venta_4 || 0)),
      ...(data.precio_venta_5 !== undefined ? { PRICE5: Math.round(Number(data.precio_venta_5 || 0)), precio_venta_5: Math.round(Number(data.precio_venta_5 || 0)) } : {}),
      ...(data.precio_venta_6 !== undefined ? { PRICE6: Math.round(Number(data.precio_venta_6 || 0)), precio_venta_6: Math.round(Number(data.precio_venta_6 || 0)) } : {}),
      ...(data.precio_venta_7 !== undefined ? { PRICE7: Math.round(Number(data.precio_venta_7 || 0)), precio_venta_7: Math.round(Number(data.precio_venta_7 || 0)) } : {}),
      ...(data.precio_venta_8 !== undefined ? { PRICE8: Math.round(Number(data.precio_venta_8 || 0)), precio_venta_8: Math.round(Number(data.precio_venta_8 || 0)) } : {}),
      ...(data.precio_venta_9 !== undefined ? { PRICE9: Math.round(Number(data.precio_venta_9 || 0)), precio_venta_9: Math.round(Number(data.precio_venta_9 || 0)) } : {}),
      ...(data.precio_venta_10 !== undefined ? { PRICE10: Math.round(Number(data.precio_venta_10 || 0)), precio_venta_10: Math.round(Number(data.precio_venta_10 || 0)) } : {}),
      COST: Math.round(Number(data.costo_uni || 0)),
      STOCK: stockForSave,
      ...(data.web_stock !== undefined ? { WEB_STOCK: Math.max(0, Math.round(Number(data.web_stock) || 0)), web_stock: Math.max(0, Math.round(Number(data.web_stock) || 0)) } : {}),
      ISACTIVE: isDraft ? false : (data.isactive ?? (stockForSave > 0)),
      BARCODE: data.codigo_barra || '',
      SKU: data.sku || docId,
      SELLERID: 'carlitos',
      SHOW_IN_WEB: isDraft ? false : (data.show_in_web ?? false),
      show_in_web: isDraft ? false : (data.show_in_web ?? false),
      WEB_ONLY: data.web_only ?? false,
      web_only: data.web_only ?? false,
      IS_DRAFT: isDraft,
      is_draft: isDraft,
      STATUS: isDraft ? 'draft' : 'active',
      status: isDraft ? 'draft' : 'active',
      CATEGORYID: data.category || '',
      SUBCATEGORYID: data.subcategory || '',
      ...(data.label_p2 ? { LABEL_P2: data.label_p2, label_p2: data.label_p2, p2_label: data.label_p2, p2Label: data.label_p2, labelP2: data.label_p2 } : {}),
      ...(data.label_p3 ? { LABEL_P3: data.label_p3, label_p3: data.label_p3, p3_label: data.label_p3, p3Label: data.label_p3, labelP3: data.label_p3 } : {}),
      ...(data.label_p4 ? { LABEL_P4: data.label_p4, label_p4: data.label_p4, p4_label: data.label_p4, p4Label: data.label_p4, labelP4: data.label_p4 } : {}),
      ...(data.label_p5 ? { LABEL_P5: data.label_p5, label_p5: data.label_p5, p5_label: data.label_p5 } : {}),
      ...(data.label_p6 ? { LABEL_P6: data.label_p6, label_p6: data.label_p6, p6_label: data.label_p6 } : {}),
      ...(data.label_p7 ? { LABEL_P7: data.label_p7, label_p7: data.label_p7, p7_label: data.label_p7 } : {}),
      ...(data.label_p8 ? { LABEL_P8: data.label_p8, label_p8: data.label_p8, p8_label: data.label_p8 } : {}),
      ...(data.label_p9 ? { LABEL_P9: data.label_p9, label_p9: data.label_p9, p9_label: data.label_p9 } : {}),
      ...(data.label_p10 ? { LABEL_P10: data.label_p10, label_p10: data.label_p10, p10_label: data.label_p10 } : {}),
      ...(data.min_qty_2 ? { MIN_QTY_P2: data.min_qty_2, min_qty_2: data.min_qty_2 } : {}),
      ...(data.min_qty_3 ? { MIN_QTY_P3: data.min_qty_3, min_qty_3: data.min_qty_3 } : {}),
      ...(data.brand !== undefined ? { BRAND: data.brand } : {}),
      ...(data.web_size !== undefined ? { WEB_SIZE: data.web_size } : {}),
      ...(data.web_color !== undefined ? { WEB_COLOR: data.web_color } : {}),
      ...(data.web_volume !== undefined ? { WEB_VOLUME: data.web_volume } : {}),
      ...(data.web_managed !== undefined ? { WEB_MANAGED: data.web_managed } : {}),
      ...(data.proveedor ? {
        BRAND: data.proveedor,
        SUPPLIER: data.proveedor,
        supplier: data.proveedor,
        proveedor: data.proveedor,
      } : {}),
      ...(data.cantidad_embalaje ? {
        QUANTITY: data.cantidad_embalaje,
        PACKAGE_QTY: data.cantidad_embalaje,
        packageQty: data.cantidad_embalaje,
        cantidad_embalaje: data.cantidad_embalaje,
      } : {}),
      ...(data.box_code ? {
        BOX_CODE: data.box_code,
        box_code: data.box_code,
        boxCode: data.box_code,
      } : {}),
      ...(data.section != null ? { section: data.section } : {}),
      ...(data.packqty ? { PACKQTY: Math.round(Number(data.packqty)) } : {}),
      ...(data.packprice ? { PACKPRICE: Math.round(Number(data.packprice)) } : {}),
      ...(data.embalajeqty ? { EMBALAJEQTY: Math.round(Number(data.embalajeqty)) } : {}),
      ...(data.embalajeprice ? { EMBALAJEPRICE: Math.round(Number(data.embalajeprice)) } : {}),
      ...(data.promo_qty ? { PROMO_QTY: Math.round(Number(data.promo_qty)) } : {}),
      ...(data.promo_price ? { PROMO_PRICE: Math.round(Number(data.promo_price)) } : {}),
      ...(data.wholesale_min_qty ? { WHOLESALEMINQUANTITY: Math.round(Number(data.wholesale_min_qty)) } : {}),
      ...(data.pack_discount_pct ? { PACK_DISCOUNT_PCT: Math.round(Number(data.pack_discount_pct)) } : {}),
      ...(data.pack_min_packs ? { PACK_MIN_PACKS: Math.round(Number(data.pack_min_packs)) } : {}),
      TAGS: data.tags ? String(data.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      FEATURES: data.features ? String(data.features).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      IMAGEURL: data.imageUrl || '', IMAGEURL2: data.imageUrl2 || '', IMAGEURL3: data.imageUrl3 || '',
    };
    const doc = await databases.createDocument(dbId, PRODUCTS_COLLECTION, docId, payload);
    // Actualizar cache local sin recargar todo
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && Array.isArray(parsed.items)) {
            const newItem: FirebaseErpProduct = {
              $id: doc.$id,
              sku: data.sku || docId,
              isAutoSku: false,
              codigo_barra: data.codigo_barra || '',
              nombre: data.nombre,
              description: data.descripcion || '',
              costo_uni: Math.round(Number(data.costo_uni || 0)),
              precio_venta_1: Math.round(Number(data.precio_venta_1 || 0)),
              precio_venta_2: Math.round(Number(data.precio_venta_2 || 0)),
              precio_venta_3: Math.round(Number(data.precio_venta_3 || 0)),
              precio_venta_4: Math.round(Number(data.precio_venta_4 || 0)),
              precio_venta_5: Math.round(Number(data.precio_venta_5 || 0)),
              precio_venta_6: Math.round(Number(data.precio_venta_6 || 0)),
              precio_venta_7: Math.round(Number(data.precio_venta_7 || 0)),
              precio_venta_8: Math.round(Number(data.precio_venta_8 || 0)),
              precio_venta_9: Math.round(Number(data.precio_venta_9 || 0)),
              precio_venta_10: Math.round(Number(data.precio_venta_10 || 0)),
              stock: stockForSave,
              isactive: data.isactive ?? (stockForSave > 0),
              show_in_web: data.show_in_web ?? false,
              web_only: data.web_only ?? false,
              category: data.category || 'General',
              subcategory: data.subcategory || '',
              supplier: data.brand || data.proveedor || '',
              packageQty: data.cantidad_embalaje || '',
              boxCode: data.box_code || '',
              label_p2: data.label_p2 || '',
              label_p3: data.label_p3 || '',
              label_p4: data.label_p4 || '',
              label_p5: data.label_p5 || '',
              label_p6: data.label_p6 || '',
              label_p7: data.label_p7 || '',
              label_p8: data.label_p8 || '',
              label_p9: data.label_p9 || '',
              label_p10: data.label_p10 || '',
              min_qty_2: data.min_qty_2,
              min_qty_3: data.min_qty_3,
              is_draft: isDraft,
              status: isDraft ? 'draft' : 'active',
              imageUrl: data.imageUrl || null,
              imageUrl2: data.imageUrl2 || null,
              imageUrl3: data.imageUrl3 || null,
              source: undefined,
              origen: undefined,
              is_temporary: false,
              rawDocument: doc,
            };
            parsed.items.unshift(newItem);
            parsed.timestamp = Date.now();
            const hydrated = hydrateErpProductsFromLocalStorage(parsed.items);
            _erpProductsMemoryCache = { items: hydrated, timestamp: parsed.timestamp };
            persistErpProductsToLocalStorage(parsed.timestamp, hydrated);
          }
        } else if (_erpProductsMemoryCache) {
          _erpProductsMemoryCache = null;
        }
      } catch (e) {
        console.warn('No se pudo actualizar caché local:', e);
      }
    }
    purgeServerProductsCache();
    return doc.$id;
  } catch (error) {
    console.error('❌ Error creando producto en Firebase:', error);
    return null;
  }
}

export async function deleteFirebaseErpProduct(productId: string): Promise<boolean> {
  try {
    const { databases } = getServices();
    const dbId = DATABASE_ID;
    await databases.deleteDocument(dbId, PRODUCTS_COLLECTION, productId);
    // Actualizar cache local sin recargar todo
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem(POS_PRODUCTS_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && Array.isArray(parsed.items)) {
            parsed.items = parsed.items.filter((item: FirebaseErpProduct) => item.$id !== productId);
            parsed.timestamp = Date.now();
            const hydrated = hydrateErpProductsFromLocalStorage(parsed.items);
            _erpProductsMemoryCache = { items: hydrated, timestamp: parsed.timestamp };
            persistErpProductsToLocalStorage(parsed.timestamp, hydrated);
          }
        } else if (_erpProductsMemoryCache) {
          _erpProductsMemoryCache = null;
        }
      } catch (e) {
        console.warn('No se pudo actualizar caché local:', e);
      }
    }
    return true;
  } catch (error) {
    console.error(`❌ Error eliminando producto [${productId}] en Appwrite:`, error);
    return false;
  }
}

let _erpCategoriesCache: { data: Array<{ $id: string; name: string; icon?: string; imageUrl?: string }>; ts: number } | null = null;
let _erpSubcategoriesCache: { data: Array<{ $id: string; name: string; categoryId: string; parentSubcategoryId?: string }>; ts: number } | null = null;
let _erpCategoriesInFlight: Promise<Array<{ $id: string; name: string; icon?: string; imageUrl?: string }>> | null = null;
let _erpSubcategoriesInFlight: Promise<Array<{ $id: string; name: string; categoryId: string; parentSubcategoryId?: string }>> | null = null;
const CAT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas (cambian raramente)
const CAT_LOCAL_KEY = 'carlitos_workspace_categories_v1';
const SUBCAT_LOCAL_KEY = 'carlitos_workspace_subcategories_v1';

export async function getFirebaseErpCategories(force = false): Promise<Array<{ $id: string; name: string; icon?: string; imageUrl?: string }>> {
  if (!force && _erpCategoriesCache && (Date.now() - _erpCategoriesCache.ts < CAT_CACHE_TTL)) {
    return _erpCategoriesCache.data;
  }
  if (!force && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(CAT_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && (Date.now() - parsed.ts < CAT_CACHE_TTL) && Array.isArray(parsed.data)) {
          _erpCategoriesCache = parsed;
          return parsed.data;
        }
      }
    } catch {}
  }
  if (!force && _erpCategoriesInFlight) return _erpCategoriesInFlight;
  const pending = (async () => { try {
    const { databases } = getServices();
    const dbId = DATABASE_ID;
    const res = await databases.listDocuments(dbId, CATEGORIES_COLLECTION, [Query.limit(500)]);
    const data = res.documents.map((d: any) => ({
      $id: d.$id,
      name: d.name || d.NAME || d.$id,
      icon: d.icon || d.ICON || '',
      imageUrl: d.iconUrl || d.imageUrl || d.IMAGEURL || d.image || '',
    }));
    _erpCategoriesCache = { data, ts: Date.now() };
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(CAT_LOCAL_KEY, JSON.stringify(_erpCategoriesCache)); } catch {}
    }
    return data;
  } catch (error) {
    console.error('❌ Error cargando categorías:', error);
    return _erpCategoriesCache?.data || [];
  } })();
  if (!force) _erpCategoriesInFlight = pending;
  try { return await pending; } finally {
    if (_erpCategoriesInFlight === pending) _erpCategoriesInFlight = null;
  }
}

export async function getFirebaseErpSubcategories(force = false): Promise<Array<{ $id: string; name: string; categoryId: string; parentSubcategoryId?: string }>> {
  if (!force && _erpSubcategoriesCache && (Date.now() - _erpSubcategoriesCache.ts < CAT_CACHE_TTL)) {
    return _erpSubcategoriesCache.data;
  }
  if (!force && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(SUBCAT_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && (Date.now() - parsed.ts < CAT_CACHE_TTL) && Array.isArray(parsed.data)) {
          _erpSubcategoriesCache = parsed;
          return parsed.data;
        }
      }
    } catch {}
  }
  if (!force && _erpSubcategoriesInFlight) return _erpSubcategoriesInFlight;
  const pending = (async () => { try {
    const { databases } = getServices();
    const dbId = DATABASE_ID;
    const res = await databases.listDocuments(dbId, SUBCATEGORIES_COLLECTION, [Query.limit(1000)]);
    const data = res.documents.map((d: any) => ({
      $id: d.$id,
      name: d.name || d.NAME || d.$id,
      categoryId: d.categoryId || d.CATEGORYID || '',
      parentSubcategoryId: d.parentSubcategoryId || '',
    }));
    _erpSubcategoriesCache = { data, ts: Date.now() };
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(SUBCAT_LOCAL_KEY, JSON.stringify(_erpSubcategoriesCache)); } catch {}
    }
    return data;
  } catch (error) {
    console.error('❌ Error cargando subcategorías:', error);
    return _erpSubcategoriesCache?.data || [];
  } })();
  if (!force) _erpSubcategoriesInFlight = pending;
  try { return await pending; } finally {
    if (_erpSubcategoriesInFlight === pending) _erpSubcategoriesInFlight = null;
  }
}
