# Firebase, datos y caché

## Configuración y SDKs

### Cliente

`src/lib/firebase.ts` inicializa Firebase Web SDK, Firestore, Auth y Storage. Firestore usa persistencia local multi-tab en navegador y cae a `getFirestore` si la inicialización persistente falla. Esta copia usa el proyecto `importadora-carlitos` y la base `(default)`; el identificador se toma de `NEXT_PUBLIC_FIREBASE_DATABASE_ID`.

### Servidor

`src/lib/db-server.ts` encapsula Firebase Admin y funciones con forma de documento/consulta heredada. En el servidor intenta credenciales JSON, variables de cuenta de servicio y ADC. Rechaza una credencial JSON cuyo `project_id` no coincida con el proyecto configurado. El `.env.local` de esta copia ya no contiene la cuenta de servicio de `yaxselldemo`; el desarrollo local depende de ADC y el hosting debe recibir credenciales autorizadas para `importadora-carlitos`. Si el acceso Admin falla, hay una ruta de compatibilidad hacia un adaptador Firebase cliente. No asumir que una llamada con nombre `server*` siempre conserva permisos de Admin; estudiar el manejo de errores y permisos antes de cambiarlo.

Variables identificadas por referencias en el código (los valores no se documentan):

- Firebase cliente: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_DATABASE_ID`.
- Firebase servidor: `FIREBASE_DATABASE_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_ADMIN_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_PROJECT_ID`.
- Integraciones: `VERTEX_PROJECT_ID`, `VERTEX_CREDENTIALS_JSON`, `GOOGLE_CLOUD_PROJECT_ID`, `GEMINI_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `CRON_SECRET`, `VENDOR_SESSION_SECRET`.
- Otras referencias heredadas: variables `APPWRITE_*` y `NEXT_PUBLIC_APPWRITE_*` siguen en uso en partes de compatibilidad y paneles viejos.

Mantén el mismo ID de Firestore entre cliente, servidor, `firebase.json` y entorno de despliegue. El archivo `firebase.json` asocia `(default)` con `firestore.carlitos.rules` e `firestore.indexes.json`. En el proyecto Carlitos, la base está en `southamerica-west1` y tiene protección contra borrado activada.

## Colecciones por dominio

Los nombres compartidos se declaran principalmente en `src/lib/collections.ts` y `src/lib/db.ts`. La lista no es exhaustiva: hay colecciones específicas en servicios POS/ERP.

| Dominio | Colecciones encontradas |
|---|---|
| Catálogo y tienda | `products`, `categories`, `subcategories`, `banners`, `timed_offers`, `theme_config`, `store_settings`, `shipping_agencies` |
| Pedidos y clientes | `orders`, `vendor_orders`, `wholesale_orders`, `users`, `addresses`, `sequences` |
| Marketplace | `vendors`, `vendor_orders`, `vendor_order_sequences` |
| POS y caja | `ventas_pos`, `caja_sesiones`, `cortes_caja`, `pos_returns`, `pos_counters`, `pos_cart_sync` |
| ERP e inventario | `stock_movements`, `stock_pending`, `trabajadores_erp`, `erp_config`, `cuadres_erp`, gastos y colecciones de conciliación |
| Contenido/engagement | `reviews`, `product_questions`, `product_views`, `product_votes`, `clips`, `favorites`, `live_streams`, `live_raffles`, `notifications`, `coupons`, `points_store_items` |

El modelo conserva campos de distinto estilo (`NAME`/`name`, `STOCK`/`stock`, `$id`/`id`) por compatibilidad histórica. Usa normalizadores existentes en vez de introducir otro alias. `products` es compartida por tienda, ERP y POS; la separación se hace por campos de estado/visibilidad y propietario.

## Storage

`src/lib/collections.ts` define los prefijos activos usados por el código:

```text
productos:     carlitos/productos/
banners:       carlitos/banners/
categorías:    carlitos/categorias/
comprobantes:  comprobantes/carlitos/
miniaturas:    carlitos/thumbnails/
chat:          carlitos/chat/
```

El código también distingue los buckets `media` y `order_box_photos`. El bucket predeterminado Firebase de Carlitos es `importadora-carlitos.firebasestorage.app`, creado en `southamerica-west1`; el proyecto comienza sin objetos migrados. Documentos anteriores mencionan prefijos de otras tiendas y buckets, no los tomes como configuración vigente.

## Lecturas públicas y cachés

- `src/lib/catalog-cache.ts`: catálogo completo con `unstable_cache`, revalidación de 3.600 segundos y tags de productos, settings y vendors; también tiene caché en memoria.
- `/api/public-data/catalog`: caché de catálogo y facetas con TTL de 86.400 segundos.
- `/api/public-data/home`: capas de caché para catálogo, categorías y ofertas; en el código revisado, las categorías usan 3.600 s, las ofertas 600 s y la respuesta de home 3.600 s. Los headers HTTP de home son otra capa y pueden durar distinto.
- `/api/public-data/products`: caché compartida y headers públicos cortos; no es equivalente a `catalog` ni a `home`.
- Otras rutas mantienen cachés independientes. Consulta el handler específico y `revalidateTag` antes de cambiar un TTL.

Las cifras anteriores son valores locales del código revisado el 22-10-2026. No implican garantía sobre caché de CDN, Vercel ni una instancia desplegada.

## Índices

`firestore.indexes.json` centraliza índices compuestos para queries. Si aparece un error `FAILED_PRECONDITION` al cambiar filtros/orden, inspecciona los índices primero; no ejecutes una creación en producción desde scripts sin confirmar proyecto y base.

## Riesgo de reglas abiertas

Los archivos locales `firestore.rules` y `storage.rules` permiten lectura y escritura sin autenticación (`if true`). `firebase.json` asocia estas reglas con ambas bases Firestore declaradas y con Storage. No se inspeccionó la consola de Firebase: puede haber reglas desplegadas distintas, pero la copia versionada es insegura para una tienda real. Ver [auditoría de seguridad](INVENTARIO_SEGURIDAD_Y_HISTORICO.md) y confirma/corrige las reglas efectivas antes de considerar este estado apto para producción.
