# Prompt para auditoría de fugas de lecturas en Appwrite

Eres una IA experta en optimización de rendimiento para aplicaciones Next.js + Appwrite. Necesito que audites un proyecto completo en busca de "fugas de lecturas" — llamadas innecesarias o excesivas a la API de Appwrite que podrían inflar el consumo diario de database reads.

## Contexto del proyecto

- **Stack**: Next.js 14 (App Router) + Appwrite Cloud (plan gratuito, 60k reads/día)
- **Dominio**: www.donbalatomayorista.cl
- **Repositorio**: Proyecto Yaxsel — tienda de mayorista con catálogo de ~178 productos
- **Historial de consumo**: Al inicio el proyecto tiraba 1 millón de lecturas/día. Tras optimización manual se bajó a 3,000-15,000 lecturas/día. Ahora se migró a un nuevo proyecto y se necesita verificar que no haya fugas.

## Arquitectura de caché actual

1. **`src/lib/catalog-cache.ts`**: Cachea TODOS los productos con `unstable_cache` (revalidate: 3600s, tag: 'products'). Es un módulo compartido — products route, sitemap y generateMetadata usan la MISMA entrada de caché. Incluye memory cache anti-estampida de 2s.

2. **`src/app/api/public-data/products/route.ts`**: Usa `getCachedAllProducts()` del módulo compartido. Además cachea active offers y apertura settings con `unstable_cache` (revalidate: 3600s). Tiene `force-dynamic` pero los datos vienen del caché. Headers: `Cache-Control: private, no-store, max-age=0`.

3. **`src/app/api/public-data/catalog/route.ts`**: Cachea categorías, subcategorías y ofertas con `unstable_cache` (revalidate: 3600s, tags: 'catalog', 'categories', 'offers'). Headers: `Cache-Control: private, no-store, max-age=0`.

4. **`src/app/api/public-data/product-detail/route.ts`**: Cachea detalle de producto por ID con `unstable_cache` (revalidate: 86400s = 24h, tag: 'products'). Headers: `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`.

5. **`src/components/ClientFetchCache.tsx`**: Intercepta `window.fetch` en el cliente con TTL rules:
   - `/api/public-data/products`: 5 min
   - `/api/public-data/catalog`: 5 min
   - `/api/theme-config`: 5 min
   - Evita llamadas duplicadas con pendingRequests map.

6. **`src/components/UpdateNotifier.tsx`**: Poll a `/api/version` cada 12 horas. No toca Appwrite.

7. **`src/hooks/usePageViewTracker.ts`**: Deshabilitado (return early en línea 56).

8. **`src/components/GlobalCanjeBanner.tsx`**: Poll cada 30s a `/api/public-data/canje-info` con `no-store` SOLO si usuario está logueado. Cada llamada hace 2-3 `listDocuments` a Appwrite (órdenes en negotiation + productos).

## Lo que necesito que revises

1. **Fugas en endpoints API**: Revisa TODOS los archivos en `src/app/api/` que hagan `databases.listDocuments`, `databases.getDocument`, o cualquier llamada a Appwrite. Verifica:
   - ¿Están cacheados con `unstable_cache`?
   - ¿Tienen memory cache anti-estampida?
   - ¿Los headers HTTP permiten caché en CDN/Vercel?
   - ¿Hay endpoints con `no-store` que no deberían tenerlo?

2. **Fugas en componentes cliente**: Revisa TODOS los `.tsx` que hagan `fetch()` a APIs que tocan Appwrite. Verifica:
   - ¿Hay polls con `setInterval` que llamen APIs de Appwrite?
   - ¿Hay llamadas en `useEffect` sin dependencias correctas que se re-ejecuten innecesariamente?
   - ¿Hay componentes que hagan fetch en cada render o navegación sin aprovechar el ClientFetchCache?

3. **Fugas en Server Components**: Revisa páginas que sean Server Components y hagan llamadas directas a Appwrite (sin pasar por el módulo compartido `catalog-cache.ts`).

4. **Fugas en middleware**: Revisa `src/middleware.ts` por si hace llamadas a Appwrite en cada request.

5. **Fugas en `generateMetadata` o `generateStaticParams`**: Revisa si estas funciones hacen llamadas a Appwrite sin caché.

6. **Fugas en sitemap.xml o robots.txt**: Revisa si se generan dinámicamente con llamadas a Appwrite sin caché.

7. **Endpoints admin**: Los endpoints de admin (`/api/admin/*`) pueden no estar cacheados intencionalmente, pero verifica si hay alguno que se llame automáticamente desde el frontend sin que el admin lo sepa.

8. **Webhooks o cron jobs**: Verifica si hay algún cron, webhook, o función programada que haga llamadas periódicas a Appwrite.

## Cómo identificar una fuga

Una fuga es cualquiera de estos patrones:
- Un endpoint que hace `listDocuments` SIN `unstable_cache` y se llama desde el cliente
- Un componente que hace `fetch` con `no-store` a un endpoint que toca Appwrite en cada navegación
- Un `setInterval` que poll un endpoint de Appwrite con frecuencia < 5 minutos
- Un `force-dynamic` en una página que hace llamadas a Appwrite en cada request sin caché
- Un `unstable_cache` con revalidate muy bajo (< 60s) que se llama frecuentemente
- Múltiples endpoints que fetchean los mismos datos de Appwrite por separado en vez de compartir caché

## Output esperado

Para cada fuga encontrada, proporciona:
1. **Archivo y línea** exacta
2. **Severidad** (crítica = podría generar miles de reads/día, media = cientos, baja = decenas)
3. **Explicación** de por qué es una fuga
4. **Fix propuesto** con código concreto

Si no encuentras fugas, dime que el proyecto está limpio y estima el consumo diario esperado basado en el tráfico típico de una tienda con ~178 productos y tráfico moderado.

## Archivos clave a revisar

```
src/lib/catalog-cache.ts
src/lib/appwrite.ts
src/lib/appwrite-server.ts
src/middleware.ts
src/app/api/public-data/products/route.ts
src/app/api/public-data/catalog/route.ts
src/app/api/public-data/product-detail/route.ts
src/app/api/public-data/home/route.ts
src/app/api/public-data/subcategories/route.ts
src/app/api/public-data/version/route.ts
src/app/api/public-data/canje-info/route.ts
src/components/ClientFetchCache.tsx
src/components/GlobalCanjeBanner.tsx
src/components/UpdateNotifier.tsx
src/components/NavbarConceptReal.tsx
src/hooks/usePageViewTracker.ts
src/app/page.tsx
src/app/productos/ProductosInner.tsx
src/app/sitemap.ts
src/app/robots.ts
```

Además, busca con grep/ripgrep todos los archivos que contengan `databases.listDocuments`, `databases.getDocument`, `databases.createDocument`, o `getServices()` para asegurarte de no perder ningún punto de entrada a Appwrite.
