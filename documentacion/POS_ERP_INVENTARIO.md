# POS, ERP e inventario

> Para rediseño o análisis detallado del POS y POS Admin, empieza por [POS_Y_POS_ADMIN_DEEP_DIVE.md](POS_Y_POS_ADMIN_DEEP_DIVE.md). Allí se documentan permisos, checkout, caja, devoluciones y APIs vigentes.


## Módulos y rutas

- POS de caja por sucursal: `/pos/[sede]`, interfaz principal `src/app/pos/[sede]/page.tsx`.
- Panel de sede: `/pos-admin/[sede]` con cierres, ventas, devoluciones, stock, precios, usuarios y configuración.
- Vista de cliente en caja: `/pos-visualizer/[sede]/[cajero]`.
- ERP ejecutivo: `/erp-dashboard/*` (ventas, gastos, márgenes, equipo, cuadres, inventario y reportes).
- APIs de caja: `/api/pos/*`; operaciones de stock: `/api/erp/stock-movements` y `/api/erp/stock-pending`.

El análisis de rutas está en `docs/ANALISIS_POS_ERP.md`; úsalo como mapa de UI con fecha septiembre 2026 y verifica nombres contra `src/app/` cuando cambien módulos.

## POS y persistencia de caja

El cliente puede cargar el catálogo a memoria para búsqueda por SKU/código de barras; no debe consultar Firestore por cada escaneo. Las ventas POS se guardan en `ventas_pos`, las sesiones en `caja_sesiones` y los cortes en `cortes_caja`. También aparece `pos_returns`; los folios actuales usan `config_pos/correlativos_<sede>`. No se hallaron referencias activas a `pos_counters` ni `pos_cart_sync` en la revisión profunda.

Flujo de alto nivel:

1. Abrir una sesión de caja por sede/cajero.
2. Armar el carrito localmente; puede haber carritos de espera/preventa y líneas distintas del mismo SKU con lista de precio diferente.
3. Descontar stock con la ruta /api/pos/stock y luego crear o actualizar la venta mediante el adaptador Firestore cliente.
4. Actualizar los totales de caja e imprimir o reimprimir; esas escrituras no forman una transacción conjunta con el stock.
5. Anular, devolver o cerrar turno con operaciones compensatorias explícitas.

`src/lib/firebaseVentasPos.ts` contiene las operaciones y modelos de ventas/caja. `src/lib/posReceipt.ts` gestiona impresión térmica. `src/lib/posPriceLabelsPdf.ts` genera etiquetas; este último archivo ya tenía una modificación local del usuario antes de la documentación y se dejó intacto.

## Invariantes de stock

1. **Editar descripción, foto, SKU o precio no debe sobrescribir stock leído antes.** El stock se modifica por ajustes explícitos y operaciones de inventario.
2. **Coalescer líneas repetidas por producto antes de una transacción.** El mismo producto puede aparecer con precios distintos en el carrito; validar y mutar la suma por documento/producto, no cada renglón contra el mismo snapshot.
3. **El cambio de stock es transaccional, pero el endpoint no impone idempotencia.** `src/app/api/pos/stock/route.ts` implementa `validate`, `decrement` y `restore`; sus reintentos pueden repetir movimientos si el llamador no los protege.
4. **Devolución y anulación requieren compensación de una sola vez.** No asumir que `restore` evita duplicados; revisar transición de estado, reintentos e idempotencia del llamador.
5. **Stock ilimitado:** distintas áreas usan un centinela alto (documentado como `99999`). No interpretarlo como unidades físicas reales.
6. **Un pedido web reserva stock y su vencimiento lo libera.** POS, web y vendor comparten productos, por lo que no crear un segundo contador local de disponibilidad.

## Stock pendiente

La colección `stock_pending` representa unidades vendidas sin disponibilidad física suficiente, indexadas por SKU canónico. Al registrar un déficit se incrementa la deuda; un ingreso de unidades la reduce y un conteo físico absoluto puede saldarla según la ruta de ajuste.

Hay una nota antigua en `docs/STOCK_PENDIENTE.md` que describe la regla como “stock ingresado menos pendiente” tanto para `set` como para `add`. La documentación de octubre y el código actual distinguen los casos: al `add`, el stock negativo ya refleja el déficit y no se debe restar dos veces; al `set` con conteo físico absoluto no negativo, la deuda previa se considera saldada. **Antes de modificar esta regla, leer el código vigente** en `src/app/api/erp/stock-movements/route.ts`, `src/app/api/erp/stock-pending/route.ts` y `src/app/api/pos/stock/route.ts`.

La UI ERP usa `src/components/erp/BaseDatosWorkspace.tsx`; consultas/resumen de deuda viven en la ruta `stock-pending`. Los movimientos históricos se almacenan en `stock_movements`. Revisa idempotencia y reconciliación de SKU antes de agregar una escritura nueva.

## Colecciones POS/ERP observadas

| Colección | Uso |
|---|---|
| `products` | Catálogo y stock maestro compartido. |
| `ventas_pos` | Boletas/ventas de caja. |
| `caja_sesiones`, `cortes_caja` | Apertura, actividad y cierre/arqueo. |
| `pos_returns` | Devoluciones. |
| `stock_movements`, `stock_pending` | Kárdex y déficit físico/comercial. |
| `config_pos/correlativos_{sede}` | Folios disponibles, correlativo de boleta y orden de débito observados en el POS actual. |
| `erp_config`, `trabajadores_erp`, `cuadres_erp` | Configuración de sedes, personal y cuadres. |
| Colecciones de gastos, conciliación y reportes | Finanzas/operación; los nombres se resuelven también en servicios. |

Los documentos históricos mezclan campos mayúsculos/minúsculos, strings JSON y fechas en epoch o texto. Mantén compatibilidad con los normalizadores y formatos existentes; no migres esquemas de forma global desde una pantalla.

## Lecturas y sincronización

`src/lib/firebaseErpService.ts` ofrece caché de catálogo, sincronización de cambios y mutaciones de producto. La documentación `readmeargon.md` registra optimizaciones para evitar relecturas completas y limitar listeners, pero está ignorada por `.gitignore`; verifica la implementación antes de repetir sus cifras. El objetivo correcto es reducir consultas observables sin ocultar cambios entre terminales.

Antes de tocar POS o ERP:

- Lee `readmeargon.md`, `docs/ANALISIS_POS_ERP.md` y las rutas de stock afectadas.
- Simula mentalmente la operación sobre una transacción y su reintento; identifica writes externos a la transacción.
- Revisa cierres, devoluciones, carritos de espera y productos con stock ilimitado.
- Mide lecturas y ventanas de listeners con una sesión controlada; no agregues polling por conveniencia.
- Conserva los cambios locales existentes de la página del POS.
