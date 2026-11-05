# Auditoría de lecturas Firebase: POS y POS Admin

Fecha: 27 de octubre de 2026. Alcance: revisión estática de POS, POS Admin, servicios Firebase y rutas asociadas; consulta de solo lectura a Cloud Monitoring. No se modificaron ventas, stock ni cierres.

## Qué dicen las métricas

Cloud Monitoring, métrica `firestore.googleapis.com/document/read_ops_count`, consulta a las 00:49 UTC del 28 de octubre, base **donbalato**, ventanas móviles de 24 horas alineadas a esa hora UTC:

| Ventana UTC | QUERY | LOOKUP | NOT_FOUND | Total |
| --- | ---: | ---: | ---: | ---: |
| 27 oct 00:49 – 28 oct 00:49 | 135.383 | 4.754 | 3.166 | 143.303 |
| 26 oct 00:49 – 27 oct 00:49 | 224.681 | 3.097 | 2.241 | 230.019 |

Son operaciones de lectura notificadas por Monitoring para toda la base, no un desglose por pantalla ni una factura. Las ventanas no son días calendario de Chile; el dato más reciente puede retrasarse. La investigación y las consultas administrativas realizadas durante la jornada también aportan lecturas. No hay evidencia suficiente para asignar esos totales al POS ni para afirmar cuál de los siguientes candidatos domina en producción.

La base `(default)` es distinta de `donbalato`; el monitor suma ambas para el total general. La consulta de 30 días en `src/app/api/admin/firebase-usage/route.ts:157` no pagina resultados, agrupa ventanas de 24 horas desde la hora actual y etiqueta por fecha UTC. La función de hoy sí pagina y calcula el inicio del día de Chile. Además, ante fallo de Monitoring varias funciones devuelven cero, y `src/app/admin/(panel)/ia/firebase/page.tsx:175` puede sustituir el cero con el contador local: esto puede presentar datos incompletos como si fueran el total real.

El panel «fuentes» tampoco es una distribución exhaustiva: `src/lib/firebase-read-tracker.ts` guarda eventos por proceso y como máximo 5.000; solo registra rutas que invocan `trackRead` mediante ciertos wrappers. Las consultas directas de los SDK cliente y Admin, como las de caja, no aparecen automáticamente. En serverless una instancia no ve todos los procesos. No interpretar la lista como porcentaje real de facturación.

## Hallazgos priorizados

### P1 — Gestión de cajas: recarga completa al cambiar una sesión

En `src/app/pos-admin/[sede]/caja-cerrar/page.tsx:137`, al abrir la página se ejecuta `loadSessions`; además, el listener de `caja_sesiones` por sede y fecha llama a esa función ante cada snapshot posterior al inicial (líneas 181–198). En el POS, el cobro puede llamar a `adjustCajaSesion` (`src/app/pos/[sede]/page.tsx:5279`, 5479, 5643), que ejecuta una transacción y actualiza los totales de la sesión (`src/lib/firebaseVentasPos.ts:379`). Por tanto, cuando la sesión cambiada coincide con el filtro del listener, una venta puede disparar la recarga completa por cada pantalla de gestión abierta. No ocurre necesariamente para sesiones con otra `fechaStr`.

Cada petición a `src/app/api/pos/cash-management/route.ts:141` lee hasta 300 sesiones de la sucursal; para cada sesión abierta entre las primeras 120 lee hasta 1.500 ventas por sesión (líneas 95–96 y 161–164), y solo después filtra por fecha en memoria. También lee pendientes y todos los trabajadores (líneas 185–209). Al mismo tiempo la página mantiene un listener de todas las ventas de la sucursal de hoy (líneas 153–175). El comentario «1 lectura por venta» describe el listener incremental, no el coste de la consulta inicial ni las recargas del endpoint.

**Ejemplo ilustrativo, no medición:** si una visita al endpoint devuelve 100 sesiones y 300 ventas en sesiones abiertas, una recarga puede leer aproximadamente 400 documentos, más pendientes y trabajadores. 100 recargas serían alrededor de 40.000 lecturas de documentos; las cifras reales dependen de resultados, concurrencia y facturación.

**Recomendación:** observar solo transiciones relevantes de apertura/cierre, o procesar `docChanges` y actualizar la sesión afectada sin recargar todo; coalescer cambios. Consultar ventas por sesión y fecha en servidor, con índice y tratamiento explícito de registros legados y sesiones que cruzan medianoche. No sustituir ciegamente el resumen por contadores de sesión: los ajustes, anulaciones, pagos mixtos y reaperturas deben seguir cuadrando con el cierre.

### P1 — Resumen y cierre POS vuelven a leer ventas históricas de la sesión

`src/app/pos/[sede]/page.tsx:2322` llama a `getVentasPosBySesionCaja` al abrir resumen o cierre. En `src/lib/firebaseVentasPos.ts:314` esa función usa `getDocsFromServer` por sesión con límite 1.000 y sin fecha; después el POS descarta fuera de hoy en memoria. Sesiones abiertas durante varios días provocan lecturas innecesarias por cada apertura. El límite también puede truncar datos, con riesgo de corte incorrecto.

**Recomendación:** consultar por sesión y fecha de negocio, con paginación y estrategia para ventas legadas sin fecha. Comparar los resultados con los cierres reales y cambios de cajera antes de activar el cambio.

### P2 — Cortes: tres consultas repetidas y sin filtro de sucursal

`src/app/pos-admin/[sede]/cortes/page.tsx:200` hace tres consultas paralelas a `cortes_caja`: 50 documentos sin orden explícito, hasta 500 por fecha ISO y hasta 500 por fecha localizada. Filtra la sucursal y deduplica después de leer. La misma operación vuelve a ejecutarse al cambiar fecha o sucursal (línea 375); resultados solapados de consultas distintas se leen de nuevo.

**Recomendación:** normalizar la fecha de cierre y consultar por sucursal y fecha en Firestore, con índices, paginación y estrategia temporal para cierres antiguos con fecha localizada y alias de sucursal. La consulta sin orden no garantiza los 50 cierres más recientes.

### P2 — Historial y ventas de POS Admin

`src/app/pos/[sede]/historial/page.tsx:383` consulta rangos históricos directamente en servidor sin límite ni paginación; hoy usa listener por fecha y sucursal (línea 429), pausado cuando la vista no está visible. Cada apertura de una vista puede cargar el conjunto inicial de nuevo. `src/app/pos-admin/[sede]/ventas/page.tsx:578` consulta todas las ventas del día desde servidor incluso con caché reciente; el rango de varias fechas tiene límite 300 (línea 594), que puede ocultar resultados.

**Recomendación:** paginación por fecha y documento con cursor, indicadores de carga parcial y refresco explícito; mantener la actualización fiable entre terminales, que es crítica para los cierres.

### P2 — Productos y reservas web

El POS programa sincronización del catálogo cuando la pestaña está visible cada 30 minutos (`src/app/pos/[sede]/page.tsx:3340`, TTL en `src/lib/firebaseErpService.ts:97`). Tiene caché RAM/local y delta por `updatedAt`, pero al faltar caché, al forzar refresco o al fallar el delta hace una carga de hasta 5.000 productos (`src/lib/firebaseErpService.ts:432–470`). El refresco forzado de usuario también existe. Los documentos devueltos antes de filtrar vendedores cuentan; se debe medir frecuencia de cargas completas y tamaño real, no asumir una por minuto.

Cada terminal visible consulta reservas cada 10 minutos (`src/app/pos/[sede]/page.tsx:1471–1516`). El servidor utiliza `unstable_cache` con TTL 600 segundos y tags, pero en una recarga de caché consulta sin límite los estados activos en dos colecciones (`src/app/api/pos/web-reservations/route.ts:29–34,128`). Las invalidaciones, despliegues y la configuración real de caché pueden aumentar las recargas; hay que medirlas. No eliminar la validación de reservas ni compartir datos sensibles entre permisos.

### P2 — Otros consumidores del mismo proyecto

El cron `expire-orders` está configurado cada 5 minutos (`vercel.json`); consulta pedidos recientes y una vez por hora hace barrido completo de estados; ante error de índice cae al barrido completo (`src/app/api/cron/expire-orders/route.ts:12,42–65`). `risk-velocity` lee el catálogo completo (`src/app/api/cron/risk-velocity/route.ts:42,139`) y está programado diariamente. Estos procesos y la web comparten las métricas con el POS: no atribuir todo el pico a las cajas sin correlacionar ejecuciones.

`src/app/api/pos/modificaciones/route.ts:82–83` realiza dos consultas de movimientos de hasta 350 documentos cada una, filtrando parte de los resultados posteriormente. `src/app/pos-admin/[sede]/cortes/page.tsx:720` consulta ventas de una sesión al abrir sus boletas. Son costos por acción, no una fuga continua demostrada.

## Plan de medición y corrección

1. Instrumentar de forma agregada y sin datos de clientes: ruta, sucursal anonimizada, duración, cantidad de documentos devueltos, origen caché/servidor y motivo de recarga. Contar por endpoint y por instancia; no registrar contenido de ventas ni tokens. Registrar eventos de conexión/desconexión de listeners.
2. Correlacionar durante un día de operación los eventos y logs con las series por minuto de Cloud Monitoring. Separar consultas, lecturas puntuales y documentos inexistentes. Medir con una y varias terminales y con la ventana de gestión abierta/cerrada.
3. Reparar primero la recarga de gestión de cajas y el filtrado de ventas por fecha, conservando reconciliación de caja, reaperturas, ventas reasignadas y sesiones que cruzan medianoche. Medir antes y después en la misma sucursal y un volumen comparable.
4. Paginar el historial de ventas y verificar que las consultas acotadas de cierres encuentren los índices publicados, manteniendo acceso a datos legados y sin truncamiento silencioso. Medir catálogo, reservas y cron antes de ajustar TTL o frecuencias.
5. Mejorar el monitor para mostrar errores como «sin datos» y aclarar que el rastreador local es parcial; revisar paginación, zona horaria y definición de ventana de 30 días.

## Límites de esta auditoría

Se revisó código y se consultó Monitoring, pero no hay trazas de producción por pantalla ni conteos por llamada, por lo que los puntos anteriores son mecanismos comprobados en código y causas probables, no una atribución medida del pico. La auditoría no altera la lógica de caja ni despliega cambios. Las consultas de lectura realizadas para investigar también generan consumo.

## Avance de corrección

Se cambió `src/app/pos-admin/[sede]/caja-cerrar/page.tsx`: las modificaciones que solo actualizan los contadores de ventas de una sesión ya no disparan la recarga completa del endpoint de gestión de cajas. El listener de ventas conserva la actualización en vivo. Las aperturas, cierres, gastos y otras modificaciones de sesión siguen provocando una recarga, agrupando eventos próximos durante 300 ms.

La consulta inicial del endpoint, los listeners y las consultas de historial y reservas siguen realizando lecturas. Es necesario medir en producción el ahorro efectivo. Se mantiene pendiente acotar las consultas de ventas por sesión y los cortes: requieren una solución para sesiones de varios días, registros antiguos y posibles índices antes de sustituir las consultas actuales.

Verificación local: `npx tsc --noEmit --pretty false` reportó errores previos en otras rutas y no reportó errores en `caja-cerrar/page.tsx`. Falta verificar el flujo real de ventas, gastos, aperturas y cierres en la aplicación y comparar métricas antes/después de desplegar.

## Cambios adicionales

- Cortes de caja: las dos consultas por fecha ISO y localizada se unen con OR, evitando devolver dos veces el mismo cierre en ambas consultas. Se conserva la consulta para datos legados y el fallback anterior si la consulta OR falla.
- Gestión de cajas: el resumen de ventas en vivo usa el mismo criterio que el servidor para efectivo, pagos mixtos, vuelto y devoluciones. Se reaplican las ventas recibidas si el listener responde antes de la carga inicial.
- Instrumentación: cash-management registra cantidades de documentos de sesiones, ventas, pendientes y trabajadores; el cron de expiración registra candidatos y resultados; reservas registra cantidades cuando se reconstruye la caché. Son conteos de documentos devueltos, no una medida exacta de facturación ni de lecturas de índices.
- Comprobaciones: se ejecutaron casos locales para el resumen de efectivo/mixto y para detectar cambios de estado y gastos en la firma de sesión. `git diff --check` pasó. TypeScript sigue fallando por errores en otros archivos del repositorio, sin diagnósticos en los archivos modificados.

Pendientes: el POS sigue leyendo la sesión completa al abrir resumen/cierre; el cron sigue consultando candidatos recientes y realizando barridos de compatibilidad; las reservas siguen cargando pedidos activos al invalidarse la caché. Sustituir esas consultas requiere validar en producción campos ausentes, sesiones antiguas y vencimientos para evitar ventas omitidas o pedidos sin cancelar. Los contadores agregados permiten medir dónde concentrar esa migración; no prueban por sí solos el ahorro real.

Se agregó deduplicación de consultas simultáneas de ventas por sesión en la vista administrativa, dentro de una misma instancia. La promesa se elimina al terminar: una solicitud posterior vuelve a consultar y el cierre administrativo conserva su consulta directa. Comprobación local: dos solicitudes simultáneas comparten una lectura y la siguiente solicita datos frescos.

## Investigación adicional y parches locales (27-10-2026)

- **Reservas web:** el agregado que consultan `/api/pos/web-reservations` y `/api/pos/revalidate` queda ahora en un solo caché compartido de 10 minutos con etiqueta propia. Antes usaba también la etiqueta general `orders`; por eso cambios de comprobante, dirección o cron podían invalidar una consulta que vuelve a recorrer pedidos activos y mayoristas. El pedido principal ahora se limita en Firestore a estados activos con `STOCKDEDUCTED == true`, que era la condición que el endpoint aplicaba después de leerlos. Las reservas se invalidan en cambios de stock/artículos/estado, creación, eliminación, edición y extensión del pedido.
- **Hallazgo en comprobantes:** subir el comprobante sí puede cambiar si se conserva una reserva vencida, porque el agregado distingue pedidos con `PAYMENTPROOFURL`. Se añadieron invalidaciones específicas al flujo web y al webhook de WhatsApp; ignorar este campo habría ahorrado una lectura a costa de mostrar reservas incorrectas.
- **Gestión de caja:** el endpoint ya no descarga toda `trabajadores_erp` en cada consulta. Busca por ID los cajeros y vendedores relacionados con las sesiones abiertas y ventas pendientes; para referencias antiguas sin ID usa búsquedas `in` por nombre, en grupos de hasta 30. El log informa sesiones, ventas devueltas, pendientes y documentos de trabajador consultados para poder comparar tras desplegar.
- **Sesiones del panel de caja:** el endpoint consultaba hasta 300 sesiones de la sucursal en cada carga aunque la interfaz solo enseña 40 cierres recientes. Ahora combina las sesiones abiertas (incluidas las antiguas que requieren revisión) con las 150 sesiones más recientes, deduplicando los documentos coincidentes. Si falta el índice, conserva la consulta anterior limitada a 300. Se añadieron índices locales para `sede + estado` y `sede + aperturaAtTs`; desplegarlos activa la reducción esperada.
- **Cron de expiración:** los ciclos normales consultan solo pedidos candidatos cuyo reloj o plazo de cancelación ya venció. Si el índice compuesto todavía no está disponible, usa la consulta acotada de las últimas 48 horas; conserva el barrido de compatibilidad legado una vez por hora. Se agregaron al archivo local `firestore.indexes.json` índices de estado más plazo. Falta desplegar esos índices en Firebase: hasta entonces puede usarse el fallback acotado y no se debe asumir el ahorro completo.
- **Auto-anulación de pre-ventas:** en modo `jefe_cobra`, el POS invoca `/api/pos/auto-anular` cada tres minutos cuando hay una preventa. Antes cada invocación descargaba hasta 100 documentos `pre_venta` y filtraba el vencimiento en Node. Ahora la consulta usa el corte de fecha en Firestore para leer candidatos vencidos; si no existe índice cae al límite anterior. Se agregaron índices `estado + fechaTs` y `estado + createdAtTs`. El endpoint informa `candidatosConsultados` y `usedFallback` para observar qué ruta usó.
- **Cortes por sucursal:** `/pos-admin/[sede]/cortes` leía hasta 1.000 cierres del día de todas las sucursales y descartaba las ajenas después de descargarlas; además consultaba 50 recientes globales. El listado diario ahora añade el filtro de sucursal antes de leer y el listado reciente también se acota para Importadora Carlitos B. Importadora Carlitos A conserva el límite global de 50 como compatibilidad para cortes antiguos sin campo `sede`. Se agregaron índices `cortes_caja: sede + fechaStr` y `sede + fechaCierreStr`; mientras no se desplieguen, la ruta puede caer temporalmente al fallback anterior.
- **Cron de velocidad de ventas:** `/api/cron/risk-velocity` descargaba todas las ventas de los últimos siete días, incluidas anuladas y preventas, y las descartaba después en memoria. La consulta ahora filtra `estado == completada` en Firestore y usa el índice `estado + fechaStr`. Si aún no existe el índice, conserva una consulta de respaldo para no romper el cálculo; la lectura completa del catálogo (~380 productos según el inventario documentado) continúa siendo una lectura diaria necesaria para actualizar velocidades.
- **Lectura en tiempo real:** los listeners actuales de ventas de hoy en historial y cierres POS están acotados por sucursal y `fechaStr`; cobran documentos iniciales y los que cambian/reconectan, no una lectura completa cada segundo. El intervalo de catálogo es de 30 minutos y el de reservas 10 minutos. Son costes periódicos esperados, no una fuga demostrada. En historial, la consulta de rangos pasados sigue sin paginación y merece una corrección separada.

En el dashboard ERP, el resumen del día mantiene un listener intencional de hasta 1.000 ventas del día y 50 sesiones de caja, para consolidar todas las sucursales en vivo. Cada pestaña abierta paga una lectura inicial y las actualizaciones recibidas; no hay un sondeo de ventas cada segundo. El encabezado comparte un caché local de una hora y actualiza el total cuando recibe el evento del dashboard. Son costes visibles que deben compararse con el número de pestañas activas.

### Pasada adicional por catálogo público

- Las reseñas y preguntas de cada ficha de producto se consultaban directamente desde el navegador con dos queries de hasta 50 documentos por visita. Ahora pasan por `/api/public-data/product-social`, que conserva el límite de 50 y cachea cada producto/tipo durante cinco minutos en Next/Vercel; el navegador comparte la respuesta por URL durante cinco minutos. Esto amortiza visitas repetidas al mismo producto y evita solicitudes duplicadas durante la sesión. La escritura sigue directa y el componente añade la nueva reseña/pregunta optimistamente.
- `/api/public-data/inventory` pagina toda `inventory_products`, pero está bajo caché de servidor de 24 h y CDN de 5 min; solo lo consume la página explícita `/llegan-pronto`. No parece una consulta recurrente por pestaña, aunque una instancia sin caché recorre la colección completa.
- El tracker de visitas está deshabilitado temporalmente al inicio del hook. Su consulta de hasta 3.000 registros solo corre desde el dashboard cuando alguien solicita estadísticas; no genera lecturas por cada visita pública en el estado actual.
- `llegan-pronto` consultaba subcategorías directamente desde el cliente cada vez que cambiaba la categoría y, si fallaban dos filtros, descargaba hasta 500 documentos. Ahora utiliza `/api/public-data/subcategories`, con caché por categoría y una consulta de compatibilidad `CATEGORYID` limitada a 50; la carga inicial de categorías también usa el endpoint de catálogo cacheado.
- La página `/erp-dashboard/gastos` leía toda `gastos_jefatura` y filtraba fechas después de descargarla, aunque la tabla ya estuviera limitada al mes o al rango elegido. Ahora aplica el rango de fechas en Firestore y cachea la respuesta por rango durante cinco minutos; al crear un gasto invalida las variantes locales.
- Esa misma página también descargaba `trabajadores_erp` sin caché cada vez que se abría. Ahora usa el servicio compartido que deduplica solicitudes y conserva la lista seis horas en memoria/localStorage, como ya hacen las otras vistas del ERP.
- El encabezado del ERP, si todavía no hay cuadre enviado, volvía a consultar hasta 1.000 ventas cada 15 minutos para completar los totales. El dashboard ya tiene esas mismas ventas en su listener. Ahora comparte también el efectivo calculado por ese snapshot y el respaldo del encabezado queda cacheado una hora; si el evento del listener llega mientras se cargan cuadres, se omite el `getDocs` duplicado. En páginas secundarias sin un evento nuevo, el encabezado puede tardar hasta una hora en refrescarse; el cierre de caja no usa este dato cacheado.

La cache de producto social reduce repeticiones, pero el ahorro real depende de visitas por producto y del hit rate de la caché distribuida; debe verificarse después de desplegar. No se atribuye una cantidad de lecturas ahorradas sin métricas de producción.

Estos cambios son locales y aún no están desplegados. No se volvió a consultar Cloud Monitoring después de los parches, por lo que no hay una cifra de ahorro confirmada. Para medir el efecto hay que desplegar el código y los índices, observar los logs de `pos/cash-management` y `pos/web-reservations`, y comparar ventanas equivalentes en Cloud Monitoring.

### Segunda pasada: consumidores auxiliares y listeners activos

- `/erp-dashboard/ganancias` ejecuta una consulta acotada por fechas, con tope de 2.500 ventas, al abrir la página o cambiar sucursal/rango. No tiene `setInterval` ni listener persistente; es coste por interacción. No se cachea el informe financiero para no ocultar ventas recientes.
- `/erp-dashboard/alertas` consulta hasta 1.000 ventas solo cuando el usuario ejecuta el análisis de stock. Tampoco se ejecuta periódicamente. Es un costo puntual y el resultado se agrega al inventario completo (que el servicio ERP ya cachea).
- `/erp-dashboard/ventas-tiempo-real` mantiene por diseño un `onSnapshot` de las 20 ventas más recientes mientras la ruta está visible. El límite sube solo si el usuario pide más historial; al ocultar la vista, el hook de visibilidad detiene el listener. La lectura inicial y las nuevas ventas/cambios son consumo esperado, no polling continuo.
- El POS abierto conserva listeners puntuales para el trabajador actual, configuración empresarial/sucursal, ventas pendientes, puntero de caja y sesión activa. La sesión recibe una lectura por cambios de caja; se necesita para que el saldo/cierre se actualice en la terminal. Catálogo se sincroniza cada 30 minutos y reservas llaman el endpoint cada 10 minutos, pero los pedidos solo vuelven a Firestore cuando vence o se invalida la caché compartida del servidor.
- La ficha de producto consultaba todas las solicitudes de stock pendientes del usuario para comprobar si existía alguna. Ahora limita esa query a un documento y comprueba `documents.length`; el ahorro depende de cuántas solicitudes repetidas tenga cada par usuario/producto, pero queda acotado a una lectura por apertura autenticada.
- `usePageViewTracker` tiene un retorno inmediato que mantiene deshabilitado el tracking por visita. `NotificationProvider` también es un stub sin lecturas; la consulta de notificaciones ocurre solo al abrir manualmente el overlay. No los cuento como fuentes activas de la cuota.
- No encontré otro intervalo que descargue repetidamente grandes colecciones sin una acción del usuario. Para perseguir el restante del pico hace falta correlacionar métricas por minuto con los logs instrumentados; Cloud Monitoring agregado no permite identificar por sí solo cuál pantalla produjo cada query.
- **Listener de preventas del POS:** `pollPreVentas` escuchaba todas las preventas (`estado == pre_venta`) de una sucursal sin límite mientras la pantalla de venta estuviera abierta. La carga puntual equivalente ya consultaba máximo 50. Ahora el listener usa el mismo tope de 50 para no cargar preventas históricas sin límite en cada terminal. Es un límite alineado con el comportamiento de lectura puntual existente; revisar con operación si una sucursal necesita tener más de 50 preventas activas simultáneamente.
- **Catálogo local del POS:** la caché dura 30 minutos por navegador y se comparte entre pestañas mediante `localStorage`; al vencer consulta `updatedAt > timestamp - 60s` con máximo 1.000 documentos. El catálogo completo (máximo 5.000) se descarga cuando no existe una caché utilizable (incluida una con menos de 50 productos) o si falla la consulta incremental. Cada terminal nuevo puede pagar una carga fría propia. El comentario de la página decía “cada minuto”, pero el intervalo real es 30 minutos; se corrigió el comentario. La ruta principal de actualización escribe `updatedAt` como número (`Date.now()`); falta comprobar registros legados importados antes de esa ruta.
- **Resumen `/pos-admin/[sede]`:** el listener de `ventas_pos` filtra por sucursal y fecha actual pero no tiene límite, porque calcula el total, medios de pago, unidades y ranking de todos los tickets del día. Una apertura inicial de ese panel lee los documentos del día; varios paneles abiertos reciben también cada venta nueva/cambiada. No se limita sin cambiar el modelo de resumen, porque truncaría los totales. Para reducirlo sin perder ventas hace falta un agregado diario actualizado idempotentemente en cada alta, edición, anulación y eliminación; ese cambio requiere mapear y migrar todos los escritores de ventas antes de activarlo.
- **ERP con sucursal seleccionada:** antes el listener y la carga puntual inicial leían las ventas de todas las sucursales aunque el filtro mostrara solo una. Ambos caminos ahora aplican `sede in aliases` cuando se elige una sucursal; las hasta 50 sesiones del día siguen en la consulta existente y se agrupan por sede en memoria para evitar exigir un índice nuevo. “Todas las sedes” conserva la consulta global y sus totales; los subtotales de una sucursal no contaminan la caché ni el encabezado global. La caché existente conserva el desglose por sede y sirve para pintar el primer cuadro mientras llega el snapshot filtrado. La consulta de ventas usa el índice existente `ventas_pos(sede, fechaStr, createdAtTs)`.

Validación de esta pasada: `git diff --check` y el parseo de `firestore.indexes.json` pasan. `npx tsc --noEmit --pretty false` aún falla por errores de tipos en otras páginas/rutas (entre ellas `admin/orders/[id]`, `admin/settings`, `api/admin/auth-users` y `confirmar-pedido`); no reporta errores en los cambios del ERP, el listener preventas, el detalle de producto ni los servicios de POS modificados para esta auditoría. No se ejecutó build ni se desplegó.

## Revisión y correcciones adicionales (28-10-2026)

Esta sección actualiza los hallazgos que más abajo se describían como pendientes o lecturas globales. Los cambios siguen locales; los índices compuestos deben desplegarse para activar el ahorro. Cada consulta nueva tiene fallback acotado/compatible cuando el índice aún no está disponible.

- **Cierre de caja POS:** `getVentasPosBySesionCaja` ahora consulta por ID de sesión y fecha local del negocio cuando se conoce la fecha. Usa `fechaStr`, `fechaTs` y `createdAtTs` para cubrir formatos actuales y legados, y mantiene fallback a la lectura de sesión completa si faltan índices. El POS de cierre solicita la fecha del día. Por tanto, la descripción anterior de una lectura histórica completa en cada apertura ya no aplica en la ruta indexada; el fallback sigue siendo un coste temporal y el tope de seguridad puede truncar sesiones excepcionalmente grandes.
- **Resumen de boletas IA:** `buildDaySnapshot` consulta ventas de la sucursal y del día directamente en Firestore; dejó de leer hasta 500 ventas recientes de la sucursal y filtrar el día después. Se apoya en el índice `ventas_pos(sede, fechaStr)`/prefijo de índice existente.
- **ERP por sucursal:** ganancias, alertas de stock y estrategia de margen ahora aplican sucursal en Firestore junto con el rango de fecha/tiempo para sedes no centrales. La sucursal central conserva la consulta global acotada por fechas para incluir documentos históricos sin campo `sede`; luego filtra con la normalización de alias existente. Si un índice de sede aún no está listo, cada pantalla cae a la consulta anterior por fecha y filtra en memoria, evitando mostrar un informe vacío.
- **Modificaciones POS:** los movimientos `edicion` y `precio_emergencia` se limitan ahora por `fechaTs` al rango local de Chile, y por sucursal en las sedes secundarias. Las ventas del mismo reporte también se acotan por sucursal y fecha. Si faltan índices, se conserva el límite anterior de 350/450 y el filtro en servidor. Se agregaron índices `stock_movements(tipo, fechaTs)` y `stock_movements(tipo, sede, fechaTs)`.
- **Devoluciones y anulaciones:** la consulta de `pos_returns` usa un OR indexado entre fecha de devolución y fecha de la venta original (el reporte acepta ambas), acotado por sucursal y rango. Se filtran las ventas de otras sucursales antes de descargarlas cuando se elige una sede secundaria. Fallback conserva los límites anteriores y el filtrado existente. Se añadieron índices `pos_returns(sede, createdAtTs)` y `pos_returns(sede, saleFechaStr)`.
- Se agregaron índices para `ventas_pos(sede, fechaStr)` y `ventas_pos(sede, createdAtTs)`. El archivo local es JSON válido; falta desplegarlo en el proyecto Firebase que corresponde a la base consultada.

### Consumo que permanece intencional o requiere otro diseño

- El tablero ERP y el resumen POS Admin mantienen listeners de ventas del día porque deben reflejar cada venta y cuadrar importes completos. No se les puso un límite arbitrario que pudiera esconder ventas. Para bajar ese coste hace falta migrar todos los escritores a un agregado diario idempotente que contemple editar, reasignar, anular, devolver y borrar tickets.
- Historiales consultados manualmente, detalle de boletas y reconstrucción de reservas siguen leyendo los documentos necesarios para su resultado; tienen filtros/rangos o caché donde se documentó. No se redujeron límites de conciliación ni se cachearon permisos.
- El cron de expiración conserva un barrido horario de compatibilidad para pedidos antiguos sin fechas normalizadas. Quitar ese barrido sin migrar los pedidos dejaría algunos pedidos vencidos sin cancelar.
- `/erp-dashboard/ventas-tiempo-real` mantiene un listener visible de las últimas ventas solicitado por el usuario; su coste crece con ventas nuevas y pestañas abiertas, no por polling de segundos.

### Verificación de esta revisión

`git diff --check` pasó y `firestore.indexes.json` parsea como JSON. `npx tsc --noEmit --pretty false` continúa fallando por errores previos del repositorio en otras rutas (pedidos admin, configuración, `auth-users`, `confirmar-pedido`, tipos de POS y servicios); no produjo diagnósticos en los archivos de las consultas recién acotadas. No se corrió build ni pruebas y no se desplegó. No se volvió a consultar Cloud Monitoring, así que todavía no hay una cifra de ahorro observada en producción.

### Optimización adicional de POS y gestión de cajas

- La primera carga o sincronización caducada del catálogo se coordina entre pestañas del mismo navegador con Web Locks y vuelve a revisar la caché compartida al entrar. Si otra pestaña ya terminó, se reutiliza su resultado. El botón de actualización forzada conserva su lectura de red. Si Web Locks no está disponible o la espera supera tres segundos, se consulta normalmente; computadoras y perfiles diferentes no comparten este bloqueo.
- Gestión de cajas solo pide fechas de ventas pendientes para hoy, la fecha solicitada y las sesiones cuyo resumen activo utiliza esos datos. Antes añadía fechas de todos los cierres históricos cargados, lo que podía provocar una consulta amplia con límite de 400. La conexión en vivo de las ventas y el cálculo de los cortes se mantienen.
- Una comprobación local con dos pestañas simuladas verificó una única descarga inicial compartida, actualización forzada y funcionamiento sin Web Locks. Esta comprobación no mide el ahorro en producción.

### Dashboard de administración y catálogo público

- El dashboard calcula estadísticas de visitas consultando hasta 3.000 documentos. Las peticiones simultáneas del mismo usuario y rango comparten la consulta, y su resultado completo se conserva durante 15 minutos en la sesión del navegador por usuario y rango. Si falla una página de la consulta, el resultado parcial no se cachea. Los pedidos conservan su listener en vivo.
- El iframe de `/productos` podía navegar dos veces cuando la URL principal tenía un hash: el primer montaje cargaba el catálogo y el efecto cambiaba `src` para cargarlo de nuevo. Ahora sincroniza la sección mediante el hash del iframe sin repetir la navegación ni las tres peticiones iniciales. Se conserva la navegación y la validación de stock del checkout.
- Las APIs públicas de productos y categorías ya usan caché compartida del servidor. Una petición repetida no implica necesariamente una lectura nueva de Firestore; por eso no se han aumentado sus tiempos de caducidad ni se ha quitado la validación del carrito.
- Comprobación local de estadísticas: peticiones simultáneas, recarga de sesión, separación por usuario y rango, y reintento tras fallo de red. El ahorro real sigue pendiente de medición en producción.

### Nueva revisión: POS, POS Admin y web

- Los listeners de preventas y de ventas pendientes del POS dependían del objeto completo de usuario. La actualización en vivo de la ficha del trabajador crea un objeto nuevo, por lo que podía cerrar y volver a abrir ambos listeners sin cambiar de cajera. Ahora dependen del ID, la sucursal y el rol correspondiente; un cambio de rol o cajera todavía actualiza las suscripciones.
- Las cargas simultáneas de categorías o subcategorías ERP comparten la misma consulta en cada pestaña. La actualización forzada conserva su comportamiento y el fallo permite reintentar.
- El catálogo web comparte peticiones simultáneas de productos, categorías y tiendas, pero cada actualización posterior sigue consultando las APIs. Esto evita solicitudes duplicadas en vuelo sin alargar la vigencia de la información. Se actualizó la versión de los recursos del catálogo.
- Riesgo previo de consistencia: `patchCatalogMemoryCacheStock` modifica solo la memoria de la instancia donde se ejecuta. Otras instancias y la caché distribuida pueden mantener stock anterior hasta su actualización; no es garantía de stock en vivo. El checkout consulta stock autoritativo, pero una visualización o sincronización de carrito basada en catálogo cacheado puede mostrar datos obsoletos. Resolverlo requiere una estrategia compartida de cambios o invalidación que no provoque una lectura completa del catálogo por cada venta.
- Comprobación local: categorías y subcategorías simultáneas, actualización forzada, y peticiones simultáneas del catálogo con reintento tras error. No hay métricas posteriores al despliegue que permitan cuantificar el ahorro.
