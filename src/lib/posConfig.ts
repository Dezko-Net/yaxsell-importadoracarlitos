/**
 * loadErpConfig — fetcher client-side con caché SWR para /api/admin-supreme/load-config.
 *
 * ANTES: /pos lo llamaba 2 veces al montar y cada página de /pos-admin otra vez
 * (cada llamada = 1 request + potencial lectura Appwrite).
 *
 * AHORA:
 * - Caché en memoria de 60s (las páginas que montan en ráfaga comparten 1 request).
 * - Dedup de requests en vuelo (2 useEffects simultáneos = 1 fetch real).
 * - invalidateErpConfigCache() tras guardar config → próxima lectura fresca.
 */

const TTL_MS = 60_000;

let memCache: { raw: string | null; parsed: any; at: number } | null = null;
let inflight: Promise<any> | null = null;

function safeParse(raw: string | null): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function loadErpConfig(force = false): Promise<any | null> {
  if (!force && memCache && Date.now() - memCache.at < TTL_MS) return memCache.parsed;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/admin-supreme/load-config');
      const json = await res.json().catch(() => null);
      const raw: string | null = json?.ok ? (json.data ?? null) : null;
      memCache = { raw, parsed: safeParse(raw), at: Date.now() };
      return memCache.parsed;
    } catch {
      return memCache?.parsed ?? null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function invalidateErpConfigCache() {
  memCache = null;
}
