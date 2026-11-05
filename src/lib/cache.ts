/**
 * 💾 Caché simple en localStorage con TTL (Time To Live).
 * Diseñado para reducir lecturas a Appwrite en navegación entre páginas.
 *
 * Uso:
 *   const products = await cached('products:all', 15 * 60_000, async () => {
 *     const res = await databases.listDocuments(...);
 *     return res.documents;
 *   });
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const PREFIX = 'yaxsel_cache:';

// TTL por defecto (10 minutos)
export const DEFAULT_TTL = 10 * 60 * 1000;

// TTLs sugeridos por tipo de dato
export const TTL = {
  products: 15 * 60 * 1000,      // 15 min
  categories: 30 * 60 * 1000,    // 30 min (cambian poco)
  banners: 10 * 60 * 1000,       // 10 min
  offers: 5 * 60 * 1000,         // 5 min (más volátiles)
  short: 60 * 1000,              // 1 min
} as const;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Lee del caché. Devuelve null si no existe o expiró.
 */
export function cacheGet<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

/**
 * Guarda en caché con TTL en milisegundos.
 */
export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL): void {
  if (!isBrowser()) return;
  try {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage lleno o quota exceeded → limpia caché viejo
    cacheCleanup();
  }
}

/**
 * Borra una entrada específica del caché.
 */
export function cacheDelete(key: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}

/**
 * Borra todas las entradas que coinciden con un prefijo.
 * Útil para invalidar caché tras crear/editar/eliminar.
 *
 * Ej: cacheInvalidate('products:') borra products:all, products:featured, etc.
 */
export function cacheInvalidate(keyPrefix: string): void {
  if (!isBrowser()) return;
  try {
    const fullPrefix = PREFIX + keyPrefix;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Limpia todas las entradas expiradas del caché.
 */
export function cacheCleanup(): void {
  if (!isBrowser()) return;
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const entry = JSON.parse(raw) as CacheEntry<unknown>;
        if (now > entry.expiresAt) keysToRemove.push(k);
      } catch {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Helper: devuelve del caché si existe; si no, ejecuta el fetcher y cachea el resultado.
 *
 * @example
 *   const products = await cached('products:all', TTL.products, async () => {
 *     const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [...]);
 *     return res.documents;
 *   });
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  cacheSet(key, fresh, ttlMs);
  return fresh;
}

/**
 * ── Revalidación coalescida (anti-tormenta de lecturas) ──
 *
 * Cada invalidación de la etiqueta 'products' obliga a reconstruir los cachés
 * del servidor (products ≈800 docs + home ≈400 docs + inventory + catalog).
 * Appwrite cobra las lecturas POR DOCUMENTO, así que una sesión de edición
 * masiva (50 productos guardados uno a uno) generaba ~60.000 lecturas.
 *
 * Este helper agrupa las invalidaciones: la primera se dispara al instante y
 * las siguientes dentro de la ventana se funden en UNA sola llamada al final.
 * Si la pestaña se cierra antes del disparo diferido, queda un flag pendiente
 * que se libera en la próxima carga (flushPendingRevalidate desde el admin).
 */
const REVAL_WINDOW_MS = 1_000; // 1 segundo (prácticamente instantáneo, evita tormentas de clics simultáneos)
let revalTimer: ReturnType<typeof setTimeout> | null = null;

function fireRevalidate(): void {
  try {
    localStorage.setItem(PREFIX + 'reval:last', String(Date.now()));
    localStorage.removeItem(PREFIX + 'reval:pending');
  } catch {}
  fetch('/api/admin/revalidate', { method: 'POST' }).catch(() => {});
  fetch('/api/revalidate?tag=products').catch(() => {});
}

export function requestProductsRevalidate(): void {
  if (!isBrowser()) return;
  let last = 0;
  try { last = Number(localStorage.getItem(PREFIX + 'reval:last') || 0); } catch {}
  const elapsed = Date.now() - last;
  if (elapsed >= REVAL_WINDOW_MS) {
    fireRevalidate();
    return;
  }
  try { localStorage.setItem(PREFIX + 'reval:pending', '1'); } catch {}
  if (!revalTimer) {
    revalTimer = setTimeout(() => {
      revalTimer = null;
      let pending = false;
      try { pending = !!localStorage.getItem(PREFIX + 'reval:pending'); } catch {}
      if (pending) fireRevalidate();
    }, Math.max(100, REVAL_WINDOW_MS - elapsed));
  }
}

/** Dispara una revalidación que quedó pendiente de una sesión anterior. */
export function flushPendingRevalidate(): void {
  if (!isBrowser()) return;
  let pending = false;
  try { pending = !!localStorage.getItem(PREFIX + 'reval:pending'); } catch {}
  if (pending) fireRevalidate();
}

/**
 * Hook de invalidación: borra todos los cachés relacionados con productos.
 * Llamar tras crear/editar/eliminar productos en el admin.
 */
export function invalidateProductCache(): void {
  cacheInvalidate('products:');
  if (isBrowser()) {
    // 1. Limpiar caché de la lista en el panel de administración (sessionStorage y localStorage)
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('admin_products_')) sessionStorage.removeItem(k);
      });
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('yaxsel_pos_products_') || k.startsWith('yaxsel_cache:')) localStorage.removeItem(k);
      });
    } catch {}

    // 2. Limpiar caché en memoria de peticiones públicas del cliente (ClientFetchCache)
    try {
      window.dispatchEvent(new CustomEvent('clear-client-cache'));
    } catch {}

    // 3. Disparar revalidación inmediata en el servidor (Next.js revalidateTag + paths)
    fetch('/api/admin/revalidate', { method: 'POST' }).catch(() => {});
    fetch('/api/revalidate?tag=products').catch(() => {});
    requestProductsRevalidate();

    // 4. Revalidar SWR
    import('swr').then(({ mutate }) => {
      mutate(
        (key: any) => typeof key === 'string' && (key.startsWith('/api/public-data/products') || key.startsWith('/api/public-data/product-detail')),
        undefined,
        { revalidate: true }
      );
    }).catch(() => {});
  }
}

export function invalidateCategoryCache(): void {
  cacheInvalidate('categories:');
  cacheInvalidate('subcategories:');
  if (isBrowser()) {
    fetch('/api/admin/revalidate', { method: 'POST' }).catch(() => {});
  }
}

export function invalidateBannerCache(): void {
  cacheInvalidate('banners:');
}

export function invalidateOfferCache(): void {
  cacheInvalidate('offers:');
}
