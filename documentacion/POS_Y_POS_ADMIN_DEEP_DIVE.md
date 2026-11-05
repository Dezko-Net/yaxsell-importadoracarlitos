# POS y POS Admin — análisis técnico profundo

**Revisión:** 22 de octubre de 2026 · **Repositorio:** `PROJECTO YAXSELL IMPORTADORA CARLITOS (FIREBASE)`
**Alcance:** flujo del POS y del panel por sucursal, persistencia, permisos y límites técnicos relevantes para un rediseño.  
**Método:** lectura estática. No se consultaron Firebase Console, Vercel, datos reales ni servicios externos. No se ejecutaron pruebas ni builds.

> Complementa [POS_ERP_INVENTARIO.md](POS_ERP_INVENTARIO.md), que cubre el contexto general de ERP e inventario.

## 1. Resumen para la siguiente IA

`/pos/[sede]` concentra la operación de venta: catálogo en memoria, precios por lista y embalaje, carrito multiatención, pagos mixtos, caja, gastos, cotizaciones, carritos enviados por vendedores, preventas para cobro por jefe, impresión, devoluciones y anulaciones. Su componente principal mezcla estado, persistencia, handlers y JSX.

`/pos-admin/[sede]` es un panel operativo por sucursal. Tiene shell, selector de sede y niveles de acceso; combina páginas POS propias con vistas embebidas del ERP. POS y panel comparten productos, ventas, sesiones y configuración.

Firebase/Firestore es el backend que ejecuta el adaptador actual. Aunque el código conserva nombres como `firebaseVentasPos.ts`, `VentaPOSAppwrite` y comentarios de Appwrite, `src/lib/db.ts` documenta una fachada de compatibilidad Firebase y sus métodos `getServices().databases.*` terminan en Firestore. No asumir que ese servicio usa Appwrite sin leer el adaptador.

Tres límites que importan para cambios y comercialización:

1. El stock se descuenta en una ruta de servidor y luego la venta se escribe mediante el adaptador Firestore cliente: no es una única transacción de inventario, venta y caja.
2. Los handlers de `/api/pos/stock` y `/api/pos/auto-anular` no verifican token en el código actual. `/api/pos/returns`, `/api/pos/cash-management` y `/api/pos-admin/users` sí verifican identidad y aplican reglas distintas.
3. El guard visual del cliente no reemplaza la autorización de las APIs. La documentación de seguridad local ya registró reglas de Firestore/Storage abiertas; no se verificó su estado desplegado.

## 2. Rutas y capas

| Superficie | Ruta | Implementación |
|---|---|---|
| POS principal | `/pos/[sede]` | `src/app/pos/[sede]/page.tsx`. |
| Redirección POS | `/pos` | `src/app/pos/page.tsx`; selecciona una sucursal activa configurada. |
| Guard POS | `/pos/*` | `src/app/pos/layout.tsx` monta `RequireAdminAuth`. |
| POS Admin por sede | `/pos-admin/[sede]/*` | `src/app/pos-admin/[sede]/layout.tsx`; navegación, selector de sede y control visual por nivel. |
| Guard POS Admin | `/pos-admin/*` | `src/app/pos-admin/layout.tsx` monta el mismo guard raíz. |
| Redirección panel | `/pos-admin` | `src/app/pos-admin/page.tsx`; configuración de sucursal y fallback `donbalato-central`. |
| Historial dentro del POS | `/pos/[sede]/historial` | `src/app/pos/[sede]/historial/page.tsx`. |
| Devoluciones | `/pos-admin/[sede]/devoluciones` | Historial y comprobante interno. |
| Alias de cortes | `/pos-admin/[sede]/caja-cierres` | Reexporta `/cortes`. |
| Alias de caja | `/pos-admin/[sede]/cajero` | Redirige a `/pos/[sede]`. |
| APIs POS | `/api/pos/*` | Handlers separados; no comparten automáticamente la autorización del layout. |
| Usuarios POS | `/api/pos-admin/users` | Gestión de trabajadores y permisos. |
| Recepciones | `/api/erp/recepciones` | API ERP usada desde POS Admin. |

El layout del panel obtiene `branches` de la configuración compartida, conserva las activas y redirige sucursales deshabilitadas a la primera activa.

**Entradas del menú sin página hallada:** `clientes`, `despachos` y `informes`. No aparecieron sus `page.tsx` bajo `src/app/pos-admin/[sede]/`; verificar si están pendientes o deben quitarse del menú.

## 3. Identidad y permisos

### Cuenta y operador son dos contextos

- **Cuenta Firebase:** `useAuth` proporciona la sesión principal. `RequireAdminAuth` busca módulos `pos`, `pos_admin` o `admin_supreme` mediante el usuario ERP.
- **Operador de tienda:** el POS carga personal desde `trabajadores_erp`, determina cargo/nivel y guarda una sesión local bajo `asistora_pos_session` (también lee `yaxsel_pos_session`). Esta sesión no reemplaza Firebase Auth para entrar a la ruta.

`RequireAdminAuth` es un guard de interfaz: si `getErpUserByEmail` lanza una excepción, su `catch` actual asigna `hasPosAccess=true`. No tratarlo como control de seguridad de API.

En la ruta de carga de trabajadores de `src/app/pos/[sede]/page.tsx` los objetos asignan `posPassword: ''`; la vista de PIN depende de que algún objeto tenga contraseña no vacía. Verificar si otro flujo enriquece ese dato antes de cambiar ese acceso. La autorización principal sigue vinculada a Firebase Auth y controles del servidor.

### Niveles

`src/lib/posAccessLevels.ts` define `bajo`, `medio` y `alto`. `isSellerCargo` fuerza a vendedores al nivel `bajo`.

| Nivel | Acceso descrito en la UI/código |
|---|---|
| Bajo | Operación POS; limitado para tareas administrativas y correcciones. |
| Medio | POS Admin operativo, Base de Datos, anulaciones y devoluciones; sin Usuarios ni Configuración general. |
| Alto | Gestión de equipo y edición de boletas con motivo; el layout redirige `config` a `ventas`. |
| Admin supremo | Acceso amplio, incluido `config`. |

El layout de sede vuelve a resolver datos desde `erp_users` y `trabajadores_erp`; trata el nivel guardado en la ficha del trabajador como fuente vigente. La API de usuarios requiere nivel alto o admin supremo.

Roles operativos de vendedor en `src/lib/posSellerRoles.ts`:

- `ayudante_caja`: arma y envía carritos a una cajera.
- `cajero_express`: envía carritos y cobra solo con débito/transferencia; checkout bloquea efectivo.
- Cajera/cajero: operan caja según su nivel y permiso.
- Jefe: cobra preventas cuando se usa el modo correspondiente.

Usuarios y roles permite cargo, estado, `posActivo`, nivel POS, rol operativo y rol Web adicional. Los vendedores quedan en nivel bajo y no reciben el rol Web adicional.

## 4. POS: comportamiento operativo

### Catálogo y precio

`fetchAllFirebaseErpProducts` de `src/lib/firebaseErpService.ts` carga catálogo a memoria para buscar por nombre, SKU o código de barras; las categorías se resuelven desde el mismo servicio. Hay caché y parche local de stock para no depender de una lectura remota por interacción.

El producto puede llevar varias listas: `precio_detalle`, `precio_mayorista`, `precio_segundo`/`precio_region`, `precio_cuarto` y `precio_5` a `precio_10`; etiquetas editables `label_p2`–`label_p10`; mínimos por cantidad; SKU/barcode; costo; imagen; stock y embalaje (`cantidad_embalaje`, `box_code`, `packageQty`). La línea guardada puede conservar `priceField`, `priceLabel`, costo, descuento e información de embalaje.

El stock y catálogo aceptan formatos históricos mayúsculos/minúsculos, por ejemplo `STOCK`/`stock`, `SKU`/`sku`. No normalizar el esquema completo desde un rediseño de UI.

`/api/pos/stock` expone `mode: "validate"`, pero no encontré una invocación con ese modo en el flujo principal de `page.tsx` revisado. El checkout sí llama `mode: "decrement"`. El comentario del endpoint dice que una compra Web abortaría el descuento; la lógica actual permite déficit y stock negativo. Seguir la implementación ejecutada, no ese comentario.

### Carrito y continuidad

El carrito vive en el cliente. Permite varias atenciones/clientes simultáneas con nombre, líneas, descuentos, pagos y datos asociados. Se guardan por sucursal en `localStorage` con `asistora_pos_customer_tabs_v1_<sede>`; también existe recuperación legacy `pos_cart_<sede>`.

Otras preferencias locales: `donbalato_pos_pro_mode`, `donbalato_pos_quick_amounts_accumulate_v1` y `pos_hidden_quick_skus`, además de borradores y caché de sesión. Son locales al navegador/equipo. El envío compartido de vendedor a cajera usa Firestore en `pos_ventas_pendientes`.

### Modos de cobro

`config/page.tsx` permite aplicar modo global o excepción por sucursal:

- `cajera_cobra`: la cajera confirma el pago normal.
- `jefe_cobra`: la cajera genera preventa; un jefe la confirma y cobra.

En `jefe_cobra` se descuenta/reserva stock al crear preventa, no se asigna folio real ni se actualiza el total de caja en ese momento. El cobro del jefe conserva ID de venta. Si vence, `/api/pos/auto-anular` la marca anulada e intenta devolver stock. Timeout configurable de 1 a 120 minutos, fallback 15.

Este modo cambia actor, folio, estado de venta y cuándo se refleja en caja. No es solo una variación de diseño.

### Checkout normal

`handleCompleteSale` en `src/app/pos/[sede]/page.tsx`:

1. Bloquea dobles confirmaciones mediante estado y lock en `useRef`.
2. Exige carrito, conexión y sesión de caja abierta; deniega efectivo a `cajero_express`.
3. Calcula descuentos, total, vuelto y pagos; admite efectivo, débito, transferencia y pago dividido.
4. Abre ventana de impresión antes del trabajo asíncrono para evitar bloqueo del navegador.
5. Si no cobra preventa ya reservada, llama `/api/pos/stock` con `decrement`.
6. Reserva folios/correlativos en transacción Firestore en `config_pos/correlativos_<sede>`. Boleta consume folio disponible o siguiente; comprobante no consume número de boleta.
7. Crea/actualiza `ventas_pos` con `createVentaPos`/`updateVentaPos` mediante adaptador Firebase; actualiza totales de sesión.
8. Completa un carrito pendiente si aplica, limpia atención e imprime recibo.

Si falla un paso posterior al descuento, el `catch` intenta `mode: "restore"`. Stock, venta, caja, movimientos y rollback no son una sola transacción. La API de stock consolida líneas repetidas por ID; `STOCK === 99999` representa stock ilimitado. Si el stock queda corto permite venta física, puede dejar stock negativo e incrementa deuda en `stock_pending`. La transacción cambia el producto; `stock_movements` y `stock_pending` se escriben después y pueden fallar independientemente.

### Caja, gastos y cierres

Se abre sesión por sucursal/operador y se manejan documentos de sesión y punteros `active_<sede>_<cajeroId>`, con compatibilidad legacy. La sesión contiene apertura, totales por medio de pago, gastos, devoluciones, estado y fechas. Gastos tienen monto/detalle/tipo/categoría/usuario/fecha y pueden agregarse, editarse o borrarse. Seguir estos campos hasta el corte/reimpresión antes de cambiar cálculos; hay serialización JSON histórica.

POS Admin agrega gestión de sesiones abiertas, antiguas y cerradas:

- `GET /api/pos/cash-management?sede=...` carga sesiones y resume las abiertas.
- El cierre valida sede/estado/perfil, calcula el corte, actualiza sesión/puntero y crea auditoría en `caja_auditoria` en transacción.
- Reabrir crea otra sesión con `parentSessionId`; el corte anterior se conserva.
- La API requiere cuenta con módulo `pos_admin` o `admin_supreme` (o admin supremo por email) y comprueba que la caja corresponda a cajero o vendedor Cajero express de esa sede.

### Cotizaciones y comprobantes

- Cotizaciones pueden copiarse/compartirse por WhatsApp.
- Vendedores envían carrito a cajera a través de `pos_ventas_pendientes`; la cajera acepta/rechaza y se conserva atribución.
- `src/lib/posReceipt.ts` crea HTML térmico de 80 mm para comprobantes internos y cortes; admite varias representaciones de fecha.
- El recibo de venta se identifica como comprobante interno sin validez tributaria. Se retiró la generación del gráfico PDF417 simulado y de las referencias al timbre SII. Las devoluciones también se identifican como documentos internos.
- Funciones adicionales visibles: descuentos de línea/globales, edición simple de producto/foto, tema personal por cajero (fondos, acentos y decoración), rehacer venta al carrito, anular, cambiar medio de pago con motivo/PIN en cliente, espacio de cajera y chat de movimientos.
- `src/lib/posPriceLabelsPdf.ts` genera etiquetas de precios; existe un cambio local preexistente que debe conservarse.

## 5. POS Admin: páginas

| Ruta | Función encontrada |
|---|---|
| `/pos-admin/[sede]` | Inicio con accesos a POS/inventario, estado de conexión y KPIs de catálogo (cantidad, fotos, valor a costo y valor proyectado a venta); no es tablero de ventas. |
| `/ventas` | Historial filtrable, detalle, métricas del período, impresión/reimpresión, edición de pago, rehacer venta y anulación según nivel. |
| `/cortes` | Historial de cortes, filtros, ventas por sesión, detalle y comprobantes de caja/boleta. |
| `/caja-cerrar` | Cajas abiertas hoy, sesiones antiguas, perfiles fuera de gestión de efectivo y cierres recientes; cierre/reapertura administrativa. |
| `/devoluciones` | Historial en `pos_returns` y comprobante interno; conserva la boleta original. |
| `/config` | Datos de empresa/recibo, modo global/por sede, permiso general para cierre de cajeras, timeout de preventa y listas de precios. Solo admin supremo entra por el layout. |
| `/usuarios` | Equipo de ventas, cargo, estado, nivel, roles; API `/api/pos-admin/users`. |
| `/recepciones` | Excel/plantilla, pegado de filas o descripción asistida; los tres requieren revisión antes de confirmar; historial de ingresos. Comparte API ERP. |
| `/stock`, `/precios`, `/costos`, `/productos-web` | Wrappers de `BaseDatosEmbedded` a las vistas ERP correspondientes. |
| `/borradores`, `/pendientes`, `/monitoreo` | Vistas adicionales del mismo workspace compartido. |

### Shell compartido

`src/app/pos-admin/[sede]/layout.tsx` contiene sidebar, secciones, selector de sucursal, header y navegación. El acento se calcula con hash del slug entre ocho colores.

Las rutas de inventario/precios/costos/productos web/borradores/pendientes/monitoreo son wrappers breves. El contenido real está en `src/components/erp/BaseDatosWorkspace.tsx` (más de 4.600 líneas) y también se utiliza fuera de POS Admin. Un cambio ahí puede afectar Base de Datos general y otras vistas ERP.

Ventas, cortes, configuración, usuarios, recepciones, caja-cerrar y devoluciones son páginas propias, mayormente Tailwind en línea. No hay un sistema de diseño compartido explícito entre shell y todas las páginas.

## 6. Datos observados

Nombres y formatos pueden variar por documentos históricos; esto no es una especificación exhaustiva.

| Colección/documento | Uso |
|---|---|
| `products` | Catálogo/stock compartido con Web y ERP; admite nombres de campo legacy. |
| `ventas_pos` | Completadas, anuladas y preventas. `items`/`pagos` coexisten con `itemsJson`/`pagosJson`; almacena sede, cajero, sesión, fechas, líneas, precios, costos, descuentos, total, pagos, folios y estado. |
| `caja_sesiones` | Sesiones y punteros activos `active_<sede>_<operador>`. |
| `cortes_caja` | Totales, gastos, devoluciones, efectivo teórico/real, diferencia y datos de impresión. Cierre administrativo usa `corte_<sessionId>`. |
| `config_pos/empresa` | Preferencias POS observadas por listener. |
| `config_pos/sede_<slug>` | Configuración/override por sucursal observada por listener. |
| `config_pos/correlativos_<slug>` | Folios disponibles, número de boleta y correlativo de débito; escritura transaccional. |
| Configuración por API ERP | `load-config`/`save-config` entregan JSON con `empresa`, `branches`, `overrides` y `listasPrecios`. No asumir que equivale directamente a `config_pos`. |
| `trabajadores_erp` / `erp_users` | Perfil de personal y cuenta de aplicación, módulos, vínculo de trabajador y nivel. |
| `pos_ventas_pendientes` | Carritos compartidos enviados a cajeras. |
| `pos_cashier_profiles` | Tema personal del cajero: fondo, acento, decoración. |
| `pos_returns` | Devoluciones parciales, por índice de línea, con reembolso, motivo y actor. |
| `stock_movements` / `stock_pending` | Kárdex y deuda de unidades sin stock. |
| `caja_auditoria` | Cierres/reaperturas administrativas. |
| `orders` / `wholesale_orders` | Reservas web activas consultadas por `/api/pos/web-reservations`. |

Documentación anterior menciona `pos_counters` y `pos_cart_sync`, pero no encontré referencias en los archivos POS activos revisados. El correlativo utilizado aparece en `config_pos/correlativos_<sede>`. Buscar referencias actuales antes de reutilizar nombres históricos.

## 7. Endpoints y límites importantes

| Endpoint | Comportamiento | Control visto en handler |
|---|---|---|
| `/api/pos/stock` | `POST validate/decrement/restore`, hasta 100 líneas; cambia productos y luego registra movimientos/deuda y parchea caché. | No verifica token ni rol. Usa Admin SDK. |
| `/api/pos/auto-anular` | `POST` busca hasta 100 preventas, marca vencidas anuladas y luego restaura stock. Diseñado para cron/intervalo cliente. | No verifica token ni secreto de cron. Producción no consultada. |
| `/api/pos/returns` | `GET` consulta por venta/sede; `POST` limita devolución a cantidades restantes, comprueba medio de reembolso disponible, exige caja abierta, reingresa stock opcional y registra la devolución. | Verifica Firebase token. GET restringe usuarios bajos a ventas propias; POST mínimo nivel medio. |
| `/api/pos/cash-management` | `GET` sesiones/resumen, `POST` cierre/reapertura. | Verifica token y módulo POS Admin; además comprueba sede, estado y perfil de caja. |
| `/api/pos/web-reservations` | Resume pedidos activos de Web y mayoristas por producto/SKU. | No vi verificación de token en el handler. |
| `/api/pos/revalidate` | Revalidación/operación de pedidos relacionados con stock. | Revisar el handler; no es igual a `stock.validate`. |
| `/api/pos/chat-movimientos` | Consulta asistida de movimientos. | Verifica token y usuario ERP. |
| `/api/pos-admin/users` | GET/POST/PATCH de perfiles POS. | Verifica Firebase token y requiere nivel alto/admin supremo. |

La visibilidad de un botón no protege el endpoint. La revisión de seguridad debe confirmar reglas Firestore efectivas y autorización por sede.

### Consistencia e idempotencia

- Decremento/restauración son transacciones sobre documentos `products`, pero no verifican una clave de idempotencia por venta/movimiento. Repetir restauración puede sumar stock otra vez.
- `stock_movements`, `stock_pending` y cachés se actualizan después/fuera de la transacción principal; son best-effort en varias rutas.
- Autoanulación primero cambia estado de `ventas_pos` y luego restaura stock; no es una operación atómica conjunta.
- Devoluciones transaccionan registro, sesión y stock reingresado; ajuste posterior de `stock_pending` y caché ocurre fuera.
- Boletas/cortes son HTML térmico en este código. No se confirmó conexión a facturación electrónica/SII.

## 8. Implicancias para el rediseño

### POS

`src/app/pos/[sede]/page.tsx` tiene alrededor de 7.700 líneas. `src/app/pos/[sede]/pos-layout.module.css` contiene el modo Pro de escritorio: atributo `data-pro="true"` y selectores `data-pos` para productos, carrito, pago, búsqueda y controles. En móvil hay navegación por pestañas (productos/carrito/pago) y barra inferior fija de total/pago; no asumir que el DOM de escritorio cuenta la experiencia móvil.

Mapear acciones por rol y pantalla antes de cambiar composición. Conservar handlers, estado y contratos al sustituir paneles. Mantener visibles total, medio de pago, estado de caja, stock insuficiente y estado de preventa. Si se extraen componentes, empezar por secciones visuales con límites de datos pequeños.

### POS Admin

El shell cambia acento según la sede; puede centralizarse la paleta sin alterar rutas, nivel ni selección de sucursal. Las vistas de Base de Datos embebidas también son ERP general: decidir si un cambio debe afectar `/erp-dashboard/base-datos`.

### Guía de edición segura

1. Usar este mapa funcional y `POS_ERP_INVENTARIO.md`.
2. Cambiar primero composición/estilos, conservando handlers, rutas, folios, claves y documentos.
3. Diseñar y revisar desktop, tablet/táctil y móvil por separado.
4. Considerar perfiles bajo/medio/alto, supremo, ayudante, cajero express y los modos `cajera_cobra`/`jefe_cobra`.
5. Cubrir venta efectivo/mixta, preventa, lista/embalaje, stock insuficiente, devolución parcial, anulación, cierre/reapertura y reimpresión.
6. Tratar seguridad e idempotencia como trabajo separado del diseño visual.

## 9. Archivos de entrada

| Archivo | Responsabilidad |
|---|---|
| `src/app/pos/[sede]/page.tsx` | POS: estado, handlers de venta/caja, roles y JSX. |
| `src/app/pos/[sede]/pos-layout.module.css` | Workspace, modo Pro y responsive. |
| `src/app/pos/layout.tsx`, `src/app/pos-admin/layout.tsx` | Guards de ambas superficies. |
| `src/app/pos-admin/[sede]/layout.tsx` | Shell, sucursal, menú y permisos visuales. |
| `src/app/pos-admin/[sede]/ventas/page.tsx` | Historial y acciones de ventas. |
| `src/app/pos-admin/[sede]/cortes/page.tsx` | Cortes y detalle de sesiones. |
| `src/app/pos-admin/[sede]/caja-cerrar/page.tsx` | Gestión administrativa de caja. |
| `src/app/pos-admin/[sede]/config/page.tsx` | Empresa, recibo, modo y listas. |
| `src/app/pos-admin/[sede]/usuarios/page.tsx` | Personal y niveles. |
| `src/app/pos-admin/[sede]/recepciones/page.tsx` | Entrada de inventario y revisión. |
| `src/components/pos/RequireAdminAuth.tsx` | Guard visual; no autoriza APIs. |
| `src/components/pos/PosReturnModal.tsx` | Flujo de devolución en cliente. |
| `src/components/pos/PosCashierSpace.tsx` | Espacio de cajera. |
| `src/components/erp/BaseDatosWorkspace.tsx` | Vistas ERP embebidas. |
| `src/lib/firebaseVentasPos.ts`, `src/lib/db.ts` | Serialización y adaptador Firestore heredado. |
| `src/lib/posAccessLevels.ts`, `src/lib/posSellerRoles.ts` | Permisos/roles. |
| `src/lib/posConfig.ts` | Caché de configuración cliente. |
| `src/lib/posReceipt.ts` | Impresión térmica. |
| `src/app/api/pos/stock/route.ts` | Stock y déficit. |
| `src/app/api/pos/returns/route.ts`, `src/app/api/pos/cash-management/route.ts` | Transacciones y autorización de devolución/caja. |
| `src/app/api/pos/auto-anular/route.ts` | Timeout de preventas. |
| `src/app/api/pos-admin/users/route.ts` | Autorización y cambios en perfiles. |

## 10. Precauciones

- No confundir permiso visual con autorización de servidor.
- El comprobante interno no constituye una boleta electrónica emitida ante el SII; la emisión fiscal requiere un flujo autorizado aparte.
- Devolución parcial conserva la venta y crea operación propia; anular cambia su estado y compensa inventario; rehacer carga una copia al carrito.
- No repetir comentarios como hechos si la lógica no coincide (caso de stock Web y stock negativo).
- Antes de tocar lógica, consultar `documentacion/POS_ERP_INVENTARIO.md`, `documentacion/FIREBASE_DATOS_Y_CACHE.md`, las rutas vigentes y el estado local de Git.

