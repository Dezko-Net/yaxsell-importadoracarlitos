'use client';

export const SAKURA_REMOTE_WALLPAPER = '/pos/wallpapers/sakura-bloom-bokeh.jpg';

export const SAKURA_LOCAL_WALLPAPER = '/pos/wallpapers/sakura-bloom-bokeh.jpg';

export const SAKURA_CACHE_STORAGE_KEY = 'asistora_sakura_wallpaper_v3';

export const NEKO_LOCAL_WALLPAPER = '/pos/wallpapers/neko-mikan-hd.jpg';

export const NEKO_CACHE_STORAGE_KEY = 'asistora_neko_wallpaper_v1';

export const NEKO_FERNANDA_LOCAL_WALLPAPER = '/pos/wallpapers/neko-fernanda-hd.jpg';

export const NEKO_FERNANDA_CACHE_STORAGE_KEY = 'asistora_neko_fernanda_wallpaper_v1';

export const NEKO_FERNANDA_PHOTO = '/pos/wallpapers/neko-fernanda.jpg';

export const CAPY_LOCAL_WALLPAPER = '/pos/wallpapers/capy-matcha-hd.jpg';

export const CAPY_CACHE_STORAGE_KEY = 'asistora_capy_wallpaper_v1';

export const JASMINE_LOCAL_WALLPAPER = '/pos/wallpapers/jasmine-agrabah-hd.jpg';

export const JASMINE_CACHE_STORAGE_KEY = 'asistora_jasmine_wallpaper_v1';

export const SAKURA_PETAL_REMOTE_IMAGE =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQN5eWsaGncsEeH2SeGodbvS293ayZaKrgpSzmRinyPOjplRWaOxu4YHWo&s=10';

export const SAKURA_PETAL_LOCAL_IMAGE = '/pos/wallpapers/sakura-petal-clean.png';

export const SAKURA_PETAL_CACHE_KEY = 'asistora_sakura_petal_v1';

let _purgedLegacyBase64Wallpapers = false;

/**
 * Purga de localStorage los wallpapers y medios en Base64 que consumían ~4.6 MB
 * de la cuota de 5 MB del navegador y provocaban QuotaExceededError al guardar
 * el catálogo de productos del POS (forzando re-descargas completas de Firestore).
 */
export function purgeLegacyBase64WallpapersFromLocalStorage(): void {
  if (_purgedLegacyBase64Wallpapers || typeof window === 'undefined') return;
  _purgedLegacyBase64Wallpapers = true;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('asistora_sakura_wallpaper') ||
        k.startsWith('asistora_neko_wallpaper') ||
        k.startsWith('asistora_neko_fernanda_wallpaper') ||
        k.startsWith('asistora_capy_wallpaper') ||
        k.startsWith('asistora_jasmine_wallpaper') ||
        k.startsWith('asistora_sakura_petal') ||
        k.startsWith('dashboard_media_cache_')
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

async function warmCacheStorage(assetUrl: string): Promise<string> {
  if (typeof window === 'undefined') return assetUrl;
  purgeLegacyBase64WallpapersFromLocalStorage();
  try {
    if ('caches' in window) {
      const cache = await window.caches.open('asistora-wallpapers-v1');
      const matched = await cache.match(assetUrl);
      if (!matched) {
        const res = await fetch(assetUrl);
        if (res && res.ok) {
          await cache.put(assetUrl, res.clone());
        }
      }
    }
  } catch {}
  return assetUrl;
}

export function getCachedSakuraWallpaper(): string {
  purgeLegacyBase64WallpapersFromLocalStorage();
  return SAKURA_LOCAL_WALLPAPER;
}

export async function cacheSakuraWallpaper(): Promise<string> {
  return warmCacheStorage(SAKURA_LOCAL_WALLPAPER);
}

export function getCachedNekoWallpaper(): string {
  purgeLegacyBase64WallpapersFromLocalStorage();
  return NEKO_LOCAL_WALLPAPER;
}

export async function cacheNekoWallpaper(): Promise<string> {
  return warmCacheStorage(NEKO_LOCAL_WALLPAPER);
}

export function getCachedNekoFernandaWallpaper(): string {
  purgeLegacyBase64WallpapersFromLocalStorage();
  return NEKO_FERNANDA_LOCAL_WALLPAPER;
}

export async function cacheNekoFernandaWallpaper(): Promise<string> {
  return warmCacheStorage(NEKO_FERNANDA_LOCAL_WALLPAPER);
}

export function getCachedCapyWallpaper(): string {
  purgeLegacyBase64WallpapersFromLocalStorage();
  return CAPY_LOCAL_WALLPAPER;
}

export async function cacheCapyWallpaper(): Promise<string> {
  return warmCacheStorage(CAPY_LOCAL_WALLPAPER);
}

export function getCachedJasmineWallpaper(): string {
  purgeLegacyBase64WallpapersFromLocalStorage();
  return JASMINE_LOCAL_WALLPAPER;
}

export async function cacheJasmineWallpaper(): Promise<string> {
  return warmCacheStorage(JASMINE_LOCAL_WALLPAPER);
}

export function getCachedSakuraPetal(): string {
  purgeLegacyBase64WallpapersFromLocalStorage();
  return SAKURA_PETAL_LOCAL_IMAGE;
}

export async function cacheSakuraPetal(): Promise<string> {
  return warmCacheStorage(SAKURA_PETAL_LOCAL_IMAGE);
}
