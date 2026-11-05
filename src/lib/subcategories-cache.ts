// Caché en memoria para subcategorías por categoría (/api/public-data/subcategories)
// Protege contra estampidas de navegación entre categorías y comparte estado en globalThis.

const MEMORY_TTL_1H = 60 * 60 * 1000; // 1 hora

const g = globalThis as unknown as {
  __yaxsellSubcategoriesCache?: Record<string, { data: any[]; timestamp: number }>;
};
if (!g.__yaxsellSubcategoriesCache) {
  g.__yaxsellSubcategoriesCache = {};
}

export function getSubcategoriesMemoryCache(categoryId: string) {
  const cached = g.__yaxsellSubcategoriesCache![categoryId];
  if (cached && Date.now() - cached.timestamp < MEMORY_TTL_1H) {
    return cached.data;
  }
  return null;
}

export function setSubcategoriesMemoryCache(categoryId: string, data: any[]) {
  g.__yaxsellSubcategoriesCache![categoryId] = { data, timestamp: Date.now() };
}

export function clearSubcategoriesMemoryCache() {
  g.__yaxsellSubcategoriesCache = {};
}
