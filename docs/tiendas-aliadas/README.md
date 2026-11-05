# Tiendas aliadas (vendors)

Guía técnica del módulo multi-vendor: cuentas de tiendas aliadas, catálogo propio, pedidos, pagos y stock. Se basa en el código existente en el repositorio; los riesgos marcados como **pendientes** no deben darse por resueltos solo porque exista esta documentación.

## Qué resuelve

Una tienda aliada publica y administra sus propios productos desde un panel reducido. Sus productos aparecen en la tienda web y pertenecen a esa tienda; no son productos del catálogo POS de Importadora Carlitos. El comprador puede adquirirlos en la web o iniciar un pedido por WhatsApp. Cada tienda mantiene sus datos de marca, pago, despacho y pedidos.

El panel del vendor está en `/vendor` y actualmente redirige a `/vendor/products`. No usa el acceso de administrador de Importadora Carlitos.

## Rutas de usuario

| Ruta | Uso |
| --- | --- |
| `/vendor/login` | Inicio de sesión del aliado. |
| `/vendor/products` | Crear, editar, buscar y administrar sus productos. |
| `/vendor/orders` | Revisar pedidos, filtrarlos por estado y avanzar el flujo. |
| `/vendor/settings` | Editar logo, colores e información pública de la tienda. |
| `/vendor/agencies` | Consultar/configurar agencias habilitadas para despachos. |
| `/checkout` | Checkout web. Los artículos de aliados se convierten en pedidos de `vendor_orders`. |
| `/pedido/[id]` | Detalle del pedido y carga de comprobante, validando comprador y plazo. |
| `/pedido-confirmado` | Confirmación del checkout y datos de transferencia. |

El administrador gestiona cuentas desde `/admin/vendors`; esa API exige autorización de administrador supremo.

## Datos y separación entre tiendas

### Colecciones

- `vendors`: cuenta, estado y configuración de cada tienda aliada.
- `products`: catálogo compartido técnicamente, con propietario identificado por `VENDOR_ID` (también se toleran campos antiguos `vendorId`, `SELLERID` y `sellerId`).
- `vendor_orders`: pedidos que pertenecen a una tienda aliada; no se guardan como pedidos normales de Importadora Carlitos.
- `vendor_order_sequences`: contador independiente de folios por tienda.
- `stock_movements`: registro de movimientos de inventario cuando se reserva/libera stock.
- `shipping_agencies`: agencias disponibles; cada vendor puede restringir las visibles.

### Campos principales

**`vendors`**: `NAME`, `EMAIL`, `PASSWORD_HASH`, `ACTIVE`, `MIN_PURCHASE_AMOUNT`, `ORDER_PREFIX`, datos bancarios, `BRAND_COLOR`, `BRAND_SECONDARY_COLOR`, `LOGO_URL`, datos públicos de tienda, `VISIBLE_AGENCIES`, `STORAGE_PREFIX`, `CREATEDAT`, `UPDATEDAT`.

**Producto aliado**: `VENDOR_ID`, `IS_VENDOR_PRODUCT`/`isVendorProduct`, `SHOW_IN_WEB`, `ISACTIVE`, `NAME`, `DESCRIPTION`, `PRICE`, `STOCK`, imágenes, categoría, precios por volumen/descuento y `createdAt`. SKU y código de barras se guardan como entradas de `FEATURES` (`SKU: ...`, `BARCODE: ...`). La API asigna el `VENDOR_ID` desde la sesión; el navegador no debe poder escoger otro dueño.

**`vendor_orders`**: `VENDOR_ID`, `ORDERCODE`, `ORDERINDEX`, `USERID`, `CUSTOMERNAME`, email/teléfono/RUT, dirección, `ITEMS` (JSON serializado), `SUBTOTAL`, `TOTAL`, `PAYMENTMETHOD`, `ORDER_SOURCE`, `STATUS`, `PAYMENTPROOFURL`, `STOCKDEDUCTED`, fechas y vencimiento. `PARENTORDERID` relaciona el pedido aliado con el pedido contenedor cuando corresponde.

El catálogo público reconoce los productos principales con `isMainStoreProduct()` en `src/lib/catalog-cache.ts`; un ID de vendor distinto de `__main__`/`donbalato` los separa del catálogo POS. Mantener los campos de propietario y las marcas de vendor consistentes es esencial para que no se mezclen.

## Acceso y límites de tenant

El login está en `/api/vendor/login`. La contraseña se guarda con `scrypt`; el servidor entrega una cookie `vendor_session` `httpOnly`, `SameSite=Lax` y segura en producción, firmada con HMAC. La sesión dura 30 días. `getActiveVendorSession()` vuelve a comprobar que el documento del vendor exista y siga con `ACTIVE: true` en cada API protegida, así que desactivar la cuenta invalida el acceso.

Las APIs de productos, pedidos, perfil y agencias deben obtener el ID de vendor desde esa sesión y filtrar/validar propiedad en el servidor. En particular:

- La lista de productos consulta únicamente los campos de propietario del vendor autenticado.
- Editar/eliminar un producto comprueba que pertenezca a la cuenta autenticada.
- Los pedidos del panel se filtran por `VENDOR_ID`; detalle y cambios de estado comprueban propiedad.
- El comprador solo puede consultar/modificar un pedido propio desde el flujo público.
- El checkout vuelve a consultar producto, dueño, publicación, estado, precio y stock en el servidor; no confía en el precio ni stock del navegador.

**Configuración de producción:** definir `VENDOR_SESSION_SECRET` como secreto aleatorio largo. El código tiene compatibilidad de fallback a otras claves y, finalmente, un valor literal de desarrollo; producción no debe depender de esos fallbacks. Al rotar el secreto se invalidan las sesiones activas.

## Flujo de productos

1. El vendor entra a `/vendor/products` y crea o edita su ficha.
2. `/api/vendor/products` valida nombre, precio y stock, guarda el producto como activo/publicado y fuerza el dueño de la sesión.
3. Los productos del aliado se muestran en la web según la publicación y el estado del producto. No deben entrar al POS de Importadora Carlitos.
4. La actualización invalida cachés del catálogo y del detalle público.

Campos de producto disponibles en el formulario: nombre, descripción, precio, stock, categoría/subcategoría, hasta tres imágenes, tags, SKU, código de barras, ficha técnica/uso/ingredientes y configuración de precio por volumen o descuento. El stock `99999` se usa como centinela de inventario ilimitado en partes del sistema; no tratarlo como unidades físicas reales.

## Flujo de venta y stock

### Compra web con transferencia

1. `/checkout` agrupa los artículos por tienda y crea el pedido aliado mediante `/api/checkout/vendor-order`.
2. La API valida que cada producto esté activo, publicado, sea propiedad del vendor indicado y tenga stock. Calcula el precio con los datos actuales del servidor y admite un precio enviado por el cliente solo si coincide con una oferta temporal vigente.
3. El pedido se crea en `vendor_orders` con folio propio, `ORDER_SOURCE: "web"`, estado inicial heredado `paid`, `STOCKDEDUCTED: false` y fecha de vencimiento.
4. El checkout llama a `/api/checkout/stock` en modo `reserve_orders`. La transacción valida comprador, pedido, vendor y productos; agrupa líneas repetidas y descuenta el stock de forma atómica e idempotente. Si falla la reserva, el checkout cancela los pedidos nuevos que todavía no descontaron inventario.
5. El comprador ve las instrucciones bancarias del vendor. Al subir el comprobante, el pedido pasa a `payment_review`.
6. El cron de expiración cancela pedidos vencidos sin comprobante y libera el stock reservado.

**Ojo con el nombre:** en el checkout aliado, `STATUS: "paid"` es un estado heredado que representa pedido creado/stock reservado y pendiente de comprobante; no significa que el vendor haya conciliado el pago. La UI lo muestra como “Stock confirmado”. Conviene migrar a estados explícitos para evitar confusión.

### Pedido iniciado por WhatsApp

1. El carrito envía el grupo de productos a `/api/checkout/vendor-order` con `orderSource: "whatsapp"`.
2. El servidor crea el pedido con `STATUS: "pending_stock"` y luego reserva el stock del documento guardado usando una transacción. El marcador `STOCKDEDUCTED` evita descontarlo dos veces.
3. Si la reserva falla, se elimina el pedido recién creado y se devuelve el motivo al cliente.
4. La UI del vendor normaliza `pending_stock` como “Stock confirmado” para que aparezca en el flujo.

### Cancelación y vencimiento

- Cancelar un pedido con `STOCKDEDUCTED: true` primero restaura el inventario y solo después cambia el estado a `cancelled`.
- La restauración es idempotente para evitar devoluciones duplicadas de stock.
- Pedidos de stock ilimitado no modifican unidades físicas.
- Los movimientos de stock se escriben después de la transacción principal; el movimiento se registra de forma best-effort y su fallo no revierte la reserva.

## Estados del pedido

El panel contempla estados como `pending_stock`, `paid`, `pending`, `payment_review`, `payment_confirmed`, `processing`, `preparing`, `shipped`, `delivered`, `negotiation` y `cancelled`. La UI normaliza algunos estados internos para mostrarlos en una secuencia legible:

| Estado persistido | Etiqueta/interpretación en el panel |
| --- | --- |
| `pending_stock`, `processing`, `paid` | Stock confirmado / esperando el siguiente paso. |
| `payment_review` | Comprobante recibido; revisar pago. |
| `payment_confirmed` | Pago confirmado. |
| `preparing`, `shipped` | Preparando/embalado según la vista. |
| `delivered` | Entregado a agencia/entregado según el contexto. |
| `cancelled` | Cancelado. |

Esta mezcla de estados heredados y etiquetas distintas es una fuente probable de contadores desincronizados. Antes de cambiarla hay que definir una máquina de estados única para cliente, vendor y administrador y mapear los documentos antiguos.

## APIs principales

| API | Responsabilidad |
| --- | --- |
| `/api/vendor/login`, `/logout`, `/me` | Sesión y perfil autenticado. |
| `/api/vendor/products` y `/api/vendor/products/[id]` | CRUD de productos propios. |
| `/api/vendor/orders`, `/api/vendor/orders/[id]` | Lista, detalle y actualización/cancelación de pedidos propios. |
| `/api/vendor/profile` | Branding e información pública. |
| `/api/vendor/agencies` | Agencias de despacho del vendor. |
| `/api/admin/vendors` y `/api/admin/vendors/[id]` | Administración de tiendas aliadas. |
| `/api/checkout/vendor-order` | Creación de subpedidos y pedidos WhatsApp. |
| `/api/checkout/stock` | Reserva idempotente, limpieza de pedidos no reservados y compatibilidad antigua. |
| `/api/public-data/vendor-order/[id]` | Consulta/edición del pedido del comprador con verificación de dueño. |
| `/api/public-data/vendor-order/[id]/upload-proof` | Recepción validada de imagen/PDF y cambio a revisión de pago. |
| `/api/cron/expire-orders` | Vencimiento y liberación de pedidos sin pago. |

## Hallazgos de la revisión del flujo

Estos puntos quedan anotados para resolver antes de considerar el módulo listo para producción:

### Prioridad alta

1. **Consulta pública antigua por folio:** `/api/vendor/public-order?code=...` busca el folio secuencial y responde el pedido completo junto con datos bancarios. Los folios llevan prefijo predecible y contador incremental. Ese endpoint puede exponer datos personales del comprador si alguien conoce/adivina un folio. Sustituirlo por un token de acceso aleatorio firmado y devolver solo los campos necesarios; revisar también `/confirmar-pedido`, que aún lo llama como fallback.
2. **Reserva antigua sin propietario:** `/api/checkout/stock` conserva `mode: "decrement"`, que encuentra un pedido por ID y llama a la reserva con `trustedStoredOwner: true`. El ID no debería bastar para que un caller externo fuerce la reserva. Eliminar ese modo si ya no se usa o exigir una credencial/propiedad verificada; no dejar una bandera de confianza accesible desde una API pública.
3. **Transiciones de estado poco estrictas:** el PATCH de pedidos vendor valida que el estado exista en la lista, pero permite saltos directos entre estados (por ejemplo, de recién creado a entregado). Implementar transiciones válidas según estado actual, permisos y existencia de comprobante/pago.

### Prioridad media

4. **Historial sin paginación:** `/api/vendor/orders` limita a 1.000 pedidos y ordena en memoria. No permite alcanzar pedidos más antiguos y las cantidades del flujo solo reflejan ese conjunto. Añadir cursor por `CREATEDAT`/document ID y paginación real.
5. **Métricas del administrador:** el resumen de `/api/admin/vendors` suma `TOTAL` y cuenta pedidos sin excluir cancelados ni otros estados no vendidos; “total vendido” puede inflarse. Definir qué estados cuentan y usar agregados que eviten leer hasta 1.000 pedidos por vendor cada vez.
6. **Verificación del comprador por email:** el detalle público permite autorizar con `userId` o email junto con el ID del pedido. Para pedidos guest, el email no es un secreto. Preferir token de acceso aleatorio por pedido; no exponer datos sensibles mediante una URL que solo contenga email.
7. **Movimiento de stock best-effort:** la reserva y los movimientos se guardan en dos pasos; si falla la segunda escritura, el stock queda correctamente reservado pero no aparece el registro de movimiento. Si la auditoría debe ser completa, registrar el movimiento en la misma transacción o usar una outbox/reintento.
8. **Archivo huérfano tras carrera de comprobantes:** el archivo se sube a Storage antes de hacer la transacción final del pedido. Dos subidas simultáneas pueden dejar un archivo huérfano aunque solo una gane. Añadir limpieza del archivo cuando la transacción falla.

## Checklist manual antes de liberar

- Crear una cuenta de vendor y comprobar login, logout y desactivación inmediata.
- Crear, editar y eliminar un producto; confirmar que solo se atribuye al vendor de la sesión y no aparece en POS.
- Comprar un producto con stock exacto; comprobar que no queda stock negativo ante dos intentos simultáneos.
- Probar precio normal, precio por volumen, descuento porcentual y oferta temporal vencida/activa.
- Probar checkout de transferencia, comprobante duplicado, archivo inválido, vencimiento y liberación de stock.
- Probar pedido WhatsApp, reserva inmediata, fallo por stock insuficiente y reintento idempotente.
- Cancelar una vez y reintentar; el stock debe restaurarse exactamente una vez.
- Confirmar que un vendor no pueda listar, consultar, editar ni cancelar pedidos/productos de otro vendor manipulando IDs.
- Probar los folios antiguos y cerrar los endpoints públicos enumerables antes de producción.
- Probar más de 1.000 pedidos para validar el cursor cuando se implemente la paginación.

## Archivos de referencia

- `src/lib/vendor-auth.ts`
- `src/lib/order-stock-service.ts`
- `src/lib/catalog-cache.ts`
- `src/app/vendor/`
- `src/app/api/vendor/`
- `src/app/api/admin/vendors/`
- `src/app/api/checkout/vendor-order/route.ts`
- `src/app/api/checkout/stock/route.ts`
- `src/app/api/public-data/vendor-order/`
- `src/app/api/cron/expire-orders/route.ts`

---

Documento preparado durante la revisión local del flujo de tiendas aliadas. No implica despliegue ni migración de datos. Mantenerlo actualizado al cerrar los hallazgos anteriores o cambiar el modelo de estados.
