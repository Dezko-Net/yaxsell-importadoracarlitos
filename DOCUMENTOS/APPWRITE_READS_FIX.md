# Appwrite Read Spikes — Diagnóstico y Solución

## Fecha
24 de Junio, 2026

## Problema
La tienda consumía ~150-1,000 lecturas/minuto en Appwrite sin actividad de usuarios. Los reads subían constantemente incluso de madrugada y sin visitantes.

## Síntomas
- Reads subiendo ~150/min en horas sin tráfico
- Picos de ~1,000/min durante horas con tráfico real
- Patrón constante 24/7 sin explicación

## Causa Raíz

### 1. ISR automático en `/api/theme-config` (Causa principal)
**Archivo:** `src/app/api/theme-config/route.ts`

La ruta tenía `export const revalidate = 60`, lo que le indicaba a Vercel que regenerara esta ruta automáticamente cada 60 segundos. Como la ruta lee la colección `theme_config` de Appwrite, esto generaba:

- **1 lectura cada 60 segundos, automáticamente, sin usuarios**
- 60 lecturas/hora
- **1,440 lecturas/día** gratis, sin ningún visitante

### 2. `s-maxage=60` global en `next.config.ts`
**Archivo:** `next.config.ts`

Todas las páginas HTML y rutas API tenían `s-maxage=60` en el header `Cache-Control`. Esto hacía que el CDN de Vercel revalidara cada 60 segundos. Cada revalidación de una página o API que lee Appwrite generaba lecturas adicionales.

### 3. Rutas API públicas sin header `Cache-Control`
Varias rutas públicas no tenían header de cache CDN, por lo que cada request pasaba al servidor:

- `/api/public-data/home` — 7 lecturas paralelas, sin cache CDN
- `/api/public-data/product-detail` — 6-7 lecturas por producto, sin cache CDN
- `/api/public-data/subcategories` — 1 lectura, sin cache CDN
- `/api/public-data/kenia-status` — 1 lectura, sin cache CDN

### 4. `fetchConfigFromAppwrite()` sin cache en Kenia
**Archivo:** `src/lib/kenia-runtime.ts`

La función `fetchConfigFromAppwrite()` hacía `serverGetDocument` directo a Appwrite sin ningún cache. Se llamaba múltiples veces por cada mensaje de WhatsApp recibido (getKeniaConfig, getKeniaUsage, recordKeniaUsage, setKeniaBlocked), generando ~10 lecturas por mensaje.

---

## Solución Aplicada

### Fix 1: Remover ISR de theme-config
- Eliminado `export const revalidate = 60` de `src/app/api/theme-config/route.ts`
- Cambiado `Cache-Control` a `s-maxage=300` (5 min) con `stale-while-revalidate`
- **Impacto:** -1,440 reads/día automáticos eliminados

### Fix 2: Aumentar `s-maxage` global de 60s a 300s
- `next.config.ts`: cambiado `s-maxage=60` a `s-maxage=300`
- **Impacto:** Revalidaciones de CDN reducidas 5x

### Fix 3: Aumentar `s-maxage` en rutas API públicas
- `/api/public-data/products`: `s-maxage` 60→300
- `/api/public-data/hotspots`: `s-maxage` 60→300
- `/api/public-data/apertura`: `s-maxage` 60→300, `unstable_cache` revalidate 60→300

### Fix 4: Agregar `Cache-Control` a rutas sin header
- `/api/public-data/home`: `s-maxage=300, stale-while-revalidate=86400`
- `/api/public-data/product-detail`: `s-maxage=300, stale-while-revalidate=86400`
- `/api/public-data/subcategories`: `s-maxage=300, stale-while-revalidate=3600`
- `/api/public-data/kenia-status`: `s-maxage=3600, stale-while-revalidate=86400`

### Fix 5: Cache en memoria para Kenia config
- `src/lib/kenia-runtime.ts`: agregado cache en memoria de 60s a `fetchConfigFromAppwrite()`
- Invalidación del cache al guardar configuración
- **Impacto:** ~10 reads/mensaje WhatsApp reducido a ~1 read/mensaje

### Fix 6: Remover API keys hardcodeadas
- Reemplazadas en 11 archivos por `process.env.APPWRITE_API_KEY`
- Incluye `src/app/api/init-theme-config/route.ts` que tenía una key de otro proyecto hardcodeada

---

## Commits

| Commit | Descripción |
|--------|-------------|
| `b697c63` | Removido ISR `revalidate=60` de theme-config, subido apertura cache a 300s |
| `01a2b8c` | Subido `s-maxage` global a 300s, agregados CDN cache headers a 6 rutas públicas |
| `1f695f2` | Cache en memoria (60s) para `fetchConfigFromAppwrite()` en kenia-runtime.ts |

---

## Resultado

| Métrica | Antes | Después |
|---------|-------|---------|
| Reads/min sin tráfico | ~150 | ~2.4 |
| Reads/día automáticos | ~216,000 | ~3,456 |
| Reducción | — | **98.5%** |

### Mediciones de verificación
```
137,410    14:26  (antes del deploy)
138,679    14:39  (+1,269 en 13 min — deploy midiendo)
138,679    14:43  (+0 en 4 min — deploy activo)
138,703    14:49  (+24 en 10 min — ~2.4/min normal)
```

---

## Archivos Modificados

1. `src/app/api/theme-config/route.ts` — Removido `revalidate=60`, ajustado `Cache-Control`
2. `next.config.ts` — `s-maxage` 60→300
3. `src/app/api/public-data/products/route.ts` — `s-maxage` 60→300
4. `src/app/api/public-data/hotspots/route.ts` — `s-maxage` 60→300
5. `src/app/api/public-data/apertura/route.ts` — `revalidate` 60→300, `s-maxage` 60→300
6. `src/app/api/public-data/home/route.ts` — Agregado `Cache-Control` header
7. `src/app/api/public-data/product-detail/route.ts` — Agregado `Cache-Control` header
8. `src/app/api/public-data/subcategories/route.ts` — Agregado `Cache-Control` header
9. `src/app/api/public-data/kenia-status/route.ts` — Agregado `Cache-Control` header
10. `src/lib/kenia-runtime.ts` — Cache en memoria (60s) para `fetchConfigFromAppwrite()`
11. `src/app/api/version/route.ts` — API key → env var
12. `src/app/api/template/route.ts` — API key → env var
13. `src/app/api/agencies/route.ts` — API key → env var
14. `src/app/api/public-data/edit-order/route.ts` — API key → env var
15. `src/app/api/stock-alerts/auto-cart/route.ts` — API key → env var
16. `src/app/api/image/route.ts` — API key → env var
17. `src/app/api/admin/fix-schema/route.ts` — API key → env var
18. `src/app/api/store-settings/route.ts` — API key → env var

---

## Lección

**Nunca uses `export const revalidate = N` en un API route que lee de una base de datos externa.** Eso fuerza a Vercel a hacer lecturas automáticas cada N segundos, sin importar si hay usuarios o no. Usa `Cache-Control` con `s-maxage` en su lugar, que solo revalida cuando hay una request real después de que el cache expira.
