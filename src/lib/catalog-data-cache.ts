// Caché en memoria para el catálogo público (/api/public-data/catalog)
// Protege contra estampidas y comparte estado entre bundles de Next.js mediante globalThis.

const MEMORY_TTL_1H = 60 * 60 * 1000; // 1 hora

interface CatalogDataGlobalState {
  data: any;
  time: number;
}

const g = globalThis as unknown as { __yaxsellCatalogDataCache?: CatalogDataGlobalState };
if (!g.__yaxsellCatalogDataCache) {
  g.__yaxsellCatalogDataCache = { data: null, time: 0 };
}

export function getCatalogDataMemoryCache() {
  const state = g.__yaxsellCatalogDataCache!;
  if (state.data && Date.now() - state.time < MEMORY_TTL_1H) {
    return state.data;
  }
  return null;
}

export function setCatalogDataMemoryCache(data: any) {
  const state = g.__yaxsellCatalogDataCache!;
  state.data = data;
  state.time = Date.now();
}

export function clearCatalogDataCache() {
  const state = g.__yaxsellCatalogDataCache!;
  state.data = null;
  state.time = 0;
}
