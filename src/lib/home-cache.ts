const MEMORY_TTL_15M = 60 * 60 * 1000; // 60 minutos en memoria servidor (compartido en globalThis)
type HomeInventoryMode = 'erp_integrated' | 'web_independent';

interface HomeCacheGlobalState {
  data: any;
  time: number;
  inventoryMode: HomeInventoryMode | null;
}

const g = globalThis as unknown as { __yaxsellHomeCache?: HomeCacheGlobalState };
if (!g.__yaxsellHomeCache) {
  g.__yaxsellHomeCache = { data: null, time: 0, inventoryMode: null };
}

export function getHomeMemoryCache(inventoryMode?: HomeInventoryMode) {
  const state = g.__yaxsellHomeCache!;
  if (state.data && (!inventoryMode || state.inventoryMode === inventoryMode) && Date.now() - state.time < MEMORY_TTL_15M) {
    return state.data;
  }
  return null;
}

export function setHomeMemoryCache(data: any, inventoryMode?: HomeInventoryMode) {
  const state = g.__yaxsellHomeCache!;
  state.data = data;
  state.time = Date.now();
  state.inventoryMode = inventoryMode || null;
}

export function clearHomeMemoryCache() {
  const state = g.__yaxsellHomeCache!;
  state.data = null;
  state.time = 0;
  state.inventoryMode = null;
}
