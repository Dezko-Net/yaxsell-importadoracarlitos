# Guía de Mantenimiento — Appwrite Reads

## Reglas de Oro

### 1. Nunca uses `export const revalidate` en API routes
```ts
// ❌ MAL — Vercel revalida automáticamente cada 60s, sin usuarios
export const revalidate = 60;

// ✅ BIEN — Solo revalida cuando llega una request real después de 300s
// En la respuesta HTTP:
headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' }
```

### 2. Toda ruta API pública que lea Appwrite debe tener `Cache-Control`
```ts
// ✅ BIEN
return NextResponse.json(data, {
  headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' }
});
```

### 3. Usar `unstable_cache` para cache del lado servidor
```ts
const getCachedData = unstable_cache(
  async () => { /* leer Appwrite */ },
  ['cache-key'],
  { revalidate: 3600, tags: ['products'] }
);
```

### 4. Cache en memoria para funciones llamadas múltiples veces
```ts
let _cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60000; // 60s

async function getCachedData() {
  const now = Date.now();
  if (_cache && (now - _cache.ts < CACHE_TTL)) return _cache.data;
  const data = await fetchFromAppwrite();
  _cache = { data, ts: now };
  return data;
}
```

### 5. Nunca hardcodear API keys
```ts
// ❌ MAL
const API_KEY = 'standard_abc123...';

// ✅ BIEN
const API_KEY = process.env.APPWRITE_API_KEY || '';
```

## Valores recomendados de cache

| Tipo de dato | `unstable_cache` revalidate | CDN `s-maxage` |
|-------------|---------------------------|----------------|
| Productos | 3600 (1h) | 300 (5min) |
| Categorías | 3600 (1h) | 300 (5min) |
| Configuración | 300 (5min) | 300 (5min) |
| Home data | 86400 (24h) | 300 (5min) |
| Product detail | 86400 (24h) | 300 (5min) |
| Kenia status | 86400 (24h) | 3600 (1h) |
| Theme config | — (sin ISR) | 300 (5min) |

## Cómo monitorear reads

1. Appwrite Console → Usage → Reads
2. Vercel Dashboard → Functions → Logs
3. Buscar `[AWREAD]` en logs para ver lecturas individuales
4. Buscar `[REQ]` en logs para ver requests entrantes

## Si los reads vuelven a subir

1. Revisar si se agregó `export const revalidate` a alguna ruta nueva
2. Revisar si alguna ruta API nueva no tiene `Cache-Control` header
3. Revisar si hay nuevos `setInterval` que hagan fetch a APIs
4. Revisar Vercel → Settings → Cron Jobs
5. Revisar si hay webhooks externos haciendo polling
