# Tienda, checkout y tiendas aliadas

## Tienda pública

La aplicación sirve la tienda pública y varios paneles desde el mismo `src/app`. La home (`src/app/page.tsx`) carga datos desde `/api/public-data/home` para el diseño predeterminado y delega en `DynamicHomePage`/`TemplateContext` cuando la sección de inicio selecciona una plantilla propia. `StoreShell` decide navbar, footer y wrappers por ruta.

Páginas públicas importantes: `/`, `/productos`, `/producto/[id]`, `/categorias`, `/categoria/[id]`, `/collections`, `/search`, `/ofertas`, `/carrito`, `/checkout`, `/pedido/[id]`, `/cuenta/*`, `/favoritos`, `/clips` y `/linktree`.

El catálogo web se deriva de `products`, ofertas/configuración y filtros de publicación. `src/lib/catalog-cache.ts` contiene `isMainStoreProduct`, filtros y precios de catálogo. El POS usa reglas de visibilidad distintas: no asumir que “no aparece en web” significa que no existe o no puede venderse internamente.

## Sistema visual y plantillas

- `src/lib/section-config.ts` declara secciones y asignación/configuración de plantilla.
- `src/context/TemplateContext.tsx` carga y resuelve configuración.
- `src/components/DynamicHomePage.tsx` selecciona el renderizador de home.
- Las plantillas combinan componentes React (`src/components/catalog*`, `src/templates/`) y recursos Shopify/HTML bajo `public/shopify/`.
- `StoreShell` detecta casos especiales como la plantilla 25 y rutas de checkout/autenticación.

No usar el inventario de plantillas de un README de junio como lista definitiva: el estado real está distribuido entre configuraciones, componentes y assets públicos. En una tarea visual, buscar el ID de plantilla en `section-config.ts` y seguir los imports del renderizador hasta el archivo que pinta la sección.

## Checkout de tienda principal

El flujo público inicia pedido desde el carrito/checkout, valida los datos y crea el pedido mediante APIs de catálogo. Los endpoints `/api/catalogo/*`, `/api/checkout/*`, `/api/public-data/my-orders*` y `/api/public-data/edit-order` cubren pedidos, datos de envío, comprobantes, cancelaciones/confirmaciones y consultas. La carga de comprobante ocurre en servidor hacia Storage.

Los endpoints de expiración están en `/api/cron/expire-orders`; la librería `src/lib/order-stock-service.ts` centraliza reservas, liberación e idempotencia. El `vercel.json` programa esa tarea cada cinco minutos. `orders` y `wholesale_orders` tienen flujos separados; no normalizar sus estados sin revisar el panel cliente, admin y POS.

## Marketplace de vendors

La tienda aliada está implementada en `/vendor/*`, `/api/vendor/*`, `/api/admin/vendors/*`, `/api/checkout/vendor-order` y `/api/public-data/vendor-order/*`.

- `vendors`: cuenta/estado y presentación de cada tienda aliada.
- `products`: catálogo compartido; el propietario puede aparecer como `VENDOR_ID`, `vendorId`, `SELLERID` o `sellerId` por compatibilidad.
- `vendor_orders`: subpedidos por vendor y folio secuencial asociado.
- `stock_movements`: auditoría de inventario.
- La sesión de vendor se entrega en cookie `httpOnly` firmada por HMAC y se valida en servidor mediante `src/lib/vendor-auth.ts`.
- Las APIs protegidas deben derivar el dueño desde la sesión, filtrar todos los listados por vendor y verificar dueño para cada ID recibido del navegador.
- El checkout recalcula precio, publicación, vendedor y stock con información servidor; el precio/stock del navegador no es autoridad.

Flujo vendor simplificado: agrupar los artículos del carrito por tienda, crear subpedido, reservar stock transaccionalmente, recibir y revisar comprobante, preparar/despachar o cancelar/liberar inventario. El cron de vencimiento libera reservas expiradas.

### Estados heredados

El módulo conserva estados históricos que la interfaz traduce a etiquetas como “stock confirmado”, “comprobante recibido” o “pago confirmado”. En ciertos pedidos, `paid` se usa como un estado técnico de stock confirmado antes de conciliar una transferencia. No inferir conciliación financiera únicamente por el valor del campo; consulta `docs/tiendas-aliadas/README.md` (20-10-2026) y los normalizadores actuales.

### Riesgo verificado en endpoint público

`src/app/api/vendor/public-order/route.ts` recibe un `code`, consulta por `ORDERCODE` y devuelve el documento completo del pedido junto a datos bancarios del vendor. No exige sesión ni token aleatorio. Los folios secuenciales/adivinables pueden exponer información del comprador. El documento de tiendas aliadas ya señalaba este riesgo; esta revisión confirmó el patrón en el handler. Mitigarlo requiere token aleatorio por pedido, respuesta mínima y pruebas de compatibilidad de los enlaces del checkout.

La guía detallada del módulo, estados, APIs y hallazgos adicionales está en `docs/tiendas-aliadas/README.md`.
