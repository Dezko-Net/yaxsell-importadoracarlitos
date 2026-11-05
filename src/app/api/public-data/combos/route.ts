import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import fs from 'fs';
import path from 'path';
import { serverGetDocument } from '@/lib/db-server';
import { isProductPublishedOnWeb } from '@/lib/product-publication';
import { ComboItemConfig, MAX_COMBO_PRODUCTS } from '@/lib/combo-types';
import { getCachedAllProducts } from '@/lib/catalog-cache';
import { getInventoryConnectionMode, type InventoryConnectionMode } from '@/lib/inventory-mode';

const CONFIG_PATH = path.join(process.cwd(), 'src', 'data', 'combos-config.json');
const SETTINGS_COLLECTION_ID = 'theme_config';
const COMBOS_DOC_ID = 'combos-config';

interface CombosGlobalCache {
  rawConfigs: ComboItemConfig[] | null;
  rawConfigsTime: number;
}

const gCombos = globalThis as unknown as { __yaxsellCombosCache?: CombosGlobalCache };
if (!gCombos.__yaxsellCombosCache) {
  gCombos.__yaxsellCombosCache = { rawConfigs: null, rawConfigsTime: 0 };
}
const COMBOS_CONFIG_TTL = 30 * 60 * 1000; // 30 minutos en RAM

async function readLocalConfig(): Promise<ComboItemConfig[]> {
  const cache = gCombos.__yaxsellCombosCache!;
  if (cache.rawConfigs && Date.now() - cache.rawConfigsTime < COMBOS_CONFIG_TTL) {
    return cache.rawConfigs;
  }

  // Try Firebase first
  try {
    const doc = await serverGetDocument(SETTINGS_COLLECTION_ID, COMBOS_DOC_ID);
    if (doc && (doc as any).config) {
      const parsed = JSON.parse((doc as any).config);
      cache.rawConfigs = parsed;
      cache.rawConfigsTime = Date.now();
      return parsed;
    }
  } catch { /* doc doesn't exist yet */ }

  // Fallback to local file (works in dev)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      cache.rawConfigs = parsed;
      cache.rawConfigsTime = Date.now();
      return parsed;
    }
  } catch (e) {
    console.error('[API combos] Error reading local config:', e);
  }
  cache.rawConfigs = [];
  cache.rawConfigsTime = Date.now();
  return [];
}

const getCachedCombos = unstable_cache(
  async (_inventoryMode: InventoryConnectionMode) => {
    const rawConfigs = await readLocalConfig();
    const activeConfigs = rawConfigs.filter(c => c.isActive);

    const allProdIds = new Set<string>();
    activeConfigs.forEach(c => {
      if (c.mainProductId) allProdIds.add(c.mainProductId);
      (c.bundleProductIds || []).forEach(id => { if (id) allProdIds.add(id); });
    });

    const productsById: Record<string, any> = {};

    if (allProdIds.size > 0) {
      try {
        // Reutiliza el catálogo en memoria del servidor (0 lecturas adicionales a Firestore)
        const allCatalogProducts = await getCachedAllProducts();
        for (const doc of allCatalogProducts) {
          const docId = String(doc?.$id || doc?.id || '');
          if (!docId || !allProdIds.has(docId)) continue;
          if (!isProductPublishedOnWeb(doc)) continue;
          const webPrice = Number(doc.WEBPRICE ?? doc.web_price ?? 0);
          const regularPrice = Number(doc.PRICE ?? doc.price ?? 0);
          const currentPrice = Number(doc.CURRENTPRICE ?? doc.current_price ?? 0);
          productsById[docId] = {
            $id: docId,
            NAME: doc.NAME || '',
            PRICE: webPrice > 0 ? webPrice : regularPrice,
            CURRENTPRICE: webPrice > 0 ? webPrice : currentPrice,
            IMAGEURL: doc.IMAGEURL || '',
            IMAGEURL2: doc.IMAGEURL2 || '',
            IMAGEURL3: doc.IMAGEURL3 || '',
            IMAGEURL4: doc.IMAGEURL4 || '',
            IMAGEURL5: doc.IMAGEURL5 || '',
            DESCRIPTION: doc.DESCRIPTION || '',
            FEATURES: doc.FEATURES || '',
            TAGS: doc.TAGS || '',
            SKU: doc.SKU || doc.sku || '',
            BRAND: doc.BRAND || '',
            STOCK: doc.STOCK || 0,
            PACKQTY: doc.PACKQTY || 1,
          };
        }
      } catch (e) {
        console.warn('[API combos] Failed to resolve products from cache:', e);
      }
    }

    const combos = activeConfigs.map(c => {
      const featId = (c as any).featuredProductId || c.mainProductId;
      const featProd = featId ? (productsById[featId] || null) : null;
      const requestedIds = Array.isArray(c.bundleProductIds) ? c.bundleProductIds : [];
      const bundleProds = requestedIds
        .map(id => productsById[id])
        .filter(Boolean);

      // No mostrar packs incompletos: sus componentes deben seguir publicados.
      if (requestedIds.length < 2 || requestedIds.length > MAX_COMBO_PRODUCTS || bundleProds.length !== requestedIds.length) return null;

      return {
        ...c,
        featuredProduct: featProd,
        mainProduct: featProd,
        bundleProducts: bundleProds,
      };
    }).filter(Boolean);

    return combos;
  },
  ['public-combos-cache-v3'],
  { revalidate: 86400, tags: ['combos'] }
);

export async function GET() {
  try {
    const inventoryMode = await getInventoryConnectionMode();
    const combos = await getCachedCombos(inventoryMode);

    return NextResponse.json({
      success: true,
      combos,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error: any) {
    console.error('[API combos GET] Error:', error);
    return NextResponse.json({ success: false, combos: [], error: error.message }, { status: 500 });
  }
}
