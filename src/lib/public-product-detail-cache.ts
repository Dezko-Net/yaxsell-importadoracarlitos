const DETAIL_TTL_MS = 15 * 60 * 1000;
const detailMemoryCache = new Map<string, { data: any; ts: number }>();

export function getPublicProductDetailCache(id: string): any | null {
  const entry = detailMemoryCache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts >= DETAIL_TTL_MS) {
    detailMemoryCache.delete(id);
    return null;
  }
  return entry.data;
}

export function setPublicProductDetailCache(id: string, data: any): void {
  detailMemoryCache.set(id, { data, ts: Date.now() });
}

export function clearPublicProductDetailCache(): void {
  detailMemoryCache.clear();
}
