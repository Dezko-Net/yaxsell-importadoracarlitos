# Registro de migración: Carlitos → producto base

**Fecha:** 6 de noviembre de 2026  
**Origen:** `PROJECTO YAXSELL CARLITOS (FIREBASE)`  
**Destino futuro:** producto base de Yaxsell (revisar antes de aplicar en Don Balato).  
**Estado:** cambios locales; no se hizo push.

Este documento registra los ajustes recientes para poder evaluarlos y trasladar al producto base solo lo que corresponda. Las configuraciones, credenciales, datos y marca de Carlitos no se deben copiar a otros clientes.

## Cambios registrados

### Productos Web y carga de imágenes

- Se ordenó y amplió la cortina lateral de creación y edición de productos; se elevó su capa para que no quede debajo del menú superior.
- La subida de imágenes usa Firebase Storage de Carlitos, comprime/optimiza el archivo en el navegador y guarda las fotos de productos bajo el prefijo de Carlitos definido por la configuración de medios.
- Se conservó la carga mediante archivo, arrastrar y soltar y pegado desde el portapapeles. El botón de pegado también acepta enlaces copiados; el campo de URL directa está visible por foto.
- Se añadieron avisos de error y estado dentro de la cortina, para que no queden tapados por esta.
- Antes de migrar: comprobar `MEDIA_PREFIXES` y reglas del Storage del destino. No copiar el prefijo `carlitos/` ni asumir que cada producto usa el mismo backend.

**Archivos principales:**

- `src/components/admin/WebProductsWorkspace.tsx`
- `src/lib/compress-product-image-client.ts`
- `src/lib/collections.ts` y `src/lib/db.ts` (prefijos de medios; revisar valores del destino)
- `tests/web-product-images.test.cjs` (pruebas de las acciones de imagen)

### Indicadores de catálogo e inventario

- En el modo `web_independent` se quitaron el resumen y el flujo de salud del catálogo, además de los indicadores de riesgo de stock en Productos Web. Se conserva el conteo de productos y la configuración de stock por unidades o ilimitado.
- En Pedidos se muestran las señales de salud y riesgo de inventario integrado solo cuando `inventoryMode === 'erp_integrated'`. La comprobación de existencias y las reglas existentes de los pedidos continúan activas.
- En el modo integrado se conserva la interfaz previa.
- Al migrar, confirmar primero que el producto base use el mismo valor de modo y distinguir entre ocultar indicadores y desactivar lógica de negocio. Este cambio oculta la interfaz; no apaga la validación real de stock.

**Archivos principales:**

- `src/components/admin/WebProductsWorkspace.tsx`
- `src/app/admin/(panel)/products-web/page.tsx`
- `src/app/admin/(panel)/orders/page.tsx`
- `CLIENTE.MD` (registro de alcance del cliente)

### Retiro de configuración heredada de Appwrite

- Se quitó el enlace «Servidor» de **Mi Tienda** y el acceso equivalente desde el menú del perfil.
- Se retiró `src/app/admin/(panel)/settings/page.tsx`, que era el panel técnico de Appwrite (credenciales, diagnóstico, cuotas y configuración heredada).
- No quedaron referencias a `/admin/settings` en `src/app` ni `src/components` al momento de documentar.
- Revisar el producto base antes de trasladarlo: esa pantalla o sus utilidades podrían seguir siendo necesarias en otra instalación. El retiro se hizo para esta copia de Carlitos.

**Archivo de navegación:** `src/app/admin/(panel)/layout.tsx`.

### Servidores locales y compilaciones

- Se habilitó `NEXT_DEV_DIST_DIR` en `next.config.ts` para permitir que dos servidores locales del mismo proyecto usen carpetas de compilación distintas.
- Se agregó `.next-dev-*/` a `.gitignore`.
- La configuración de Carlitos permite usar `NEXT_DEV_DIST_DIR` si se levantan dos instancias desde esa misma copia.
- En la distribución local comprobada el 6 de noviembre, el puerto 3000 corre la carpeta del proyecto Carlitos y usa `importadora-carlitos`; el 3001 corre la carpeta Don Balato y usa `yaxselldemo`. Son repositorios separados, así que cada uno genera sus archivos en su propio `.next/`.
- No asumir que el puerto 3001 es Carlitos ni que hoy está usando `.next-dev-3001/`; el puerto corresponde al proyecto desde cuya carpeta se inicia Next.

**Archivos:** `next.config.ts`, `.gitignore`.

## Pendiente para el siguiente cambio

- El trabajo de WhatsApp se está revisando en **Don Balato**, puerto 3001; las mejoras de bandeja anotadas abajo deben evaluarse para su traslado a Carlitos después de validar el comportamiento.
- El puerto 3000 corresponde a Carlitos (`importadora-carlitos`) y el 3001 a Don Balato (`yaxselldemo`). No intercambiar ni mezclar sus archivos `.env`, datos ni credenciales.
- La API de ajustes de Don Balato devuelve `storeName: Don Balato`; sus datos de pago identifican a Importadora 3B. El nombre «Importadora Carlitos» que aparece junto a la cuenta del administrador sí está fijado por email en `src/app/admin/(panel)/layout.tsx` (líneas aproximadas 1020 y 1060), no proviene de los ajustes de la tienda.
- La pantalla de ajustes y la pantalla de WhatsApp de Don Balato aún contienen textos predeterminados con «Importadora Carlitos». Revisarlos al trabajar la sección BOT/WhatsApp; no reemplazar a ciegas configuraciones de asesor, nombre o teléfono.

### Ajustes locales al revisar la bandeja de WhatsApp en Don Balato

- La búsqueda de conversaciones ahora filtra en memoria; escribir no vuelve a consultar el endpoint de bandeja en cada tecla.
- Se quitó la carga automática por lotes de perfiles de todos los chats. El detalle de pedidos se consulta cuando se abre esa función, evitando decenas de consultas de clientes al entrar a la bandeja.
- Los mensajes entrantes ahora se guardan como no leídos para que funcione el filtro «Sin leer»; al abrir el chat, la lista y el contador se actualizan.
- Las rutas administrativas de conversaciones/configuración requieren un ID token válido de Firebase con acceso web. Las vistas de administración adjuntan el token. La lectura pública de una cotización compartida conserva su acceso.
- Las acciones administrativas de bloqueo, borrado de historial, eliminación de chat y envío ahora aceptan el modo BOT sin exigir que también esté activado el módulo IA.
- Después de enviar un mensaje desde la bandeja, la conversación y su vista previa se actualizan localmente; se evitó volver a leer hasta 200 mensajes y escanear otra vez toda la bandeja tras cada envío.
- **Estado actualizado:** la bandeja de Don Balato ya usa una colección de resumen por teléfono; se registra el detalle y queda implementada una migración incremental para el historial anterior. La migración no se ejecuta sola: se inicia desde un botón explícito, procesa lotes y permite continuar desde el cursor guardado.
- `getKeniaRuntimeSnapshot()` devuelve uso vacío para evitar leer el documento de cada teléfono. Por eso las cifras de tokens y los estados de escalado/spam de la lista no son confiables; el detalle individual sí carga el uso real. El estado «Bloqueado» de la lista ahora se obtiene desde `blockedPhones` en la configuración.
- `src/lib/whatsapp.ts` contiene un token de Meta escrito en el código. No copiarlo al proyecto Carlitos ni mostrar su valor. Antes de publicar cambios, rotar ese token en Meta y guardar el nuevo como secreto `WHATSAPP_ACCESS_TOKEN`; revisar la configuración de producción para no detener los envíos.

**Archivos principales de esta revisión:** `src/app/admin/(panel)/ia/whatsapp/page.tsx`, `src/app/admin/(panel)/ia/page.tsx`, `src/app/api/admin/ia/`, `src/lib/whatsapp.ts`, `src/lib/whatsapp-admin-auth.ts`, `src/lib/whatsapp-admin-client.ts`.
- Antes de migrar navegación o controles de WhatsApp, revisar `MODULE_ACCESS.whatsappManagement`, los flags de funciones y las rutas del proyecto destino. Mantener las diferencias de cliente y no copiar tokens ni números telefónicos.

### Optimización de lecturas de la bandeja en Don Balato (6-11-2026)

- La carga de conversaciones dejó de leer hasta 1.000 mensajes de `admin_chat` y hasta 200 pedidos en cada apertura o refresco. Ahora lee un resumen por teléfono de `whatsapp_thread_summaries`; buscar, filtrar y paginar continúan usando la lista cargada en memoria.
- Cada mensaje nuevo actualiza el resumen y crea su documento en un batch atómico de Firebase Admin. El batch usa el ID de mensaje de WhatsApp para no duplicar contadores si Meta reintenta un webhook. El camino normal no hace lecturas adicionales por mensaje; el adaptador REST legado conserva una ruta de compatibilidad más costosa.
- Abrir una conversación deja de escribir `readByAdmin` en cada mensaje. Un marcador transaccional por conversación actualiza los no leídos y conserva los mensajes que llegan durante la carga.
- La bandeja consulta el historial legado en lotes de 100 solo al pulsar **Optimizar historial antiguo**. El cursor y el progreso se guardan, para continuar si hay más de 1.000 mensajes. No ejecutar esta migración hasta decidir aceptar la lectura y escritura única del historial existente.
- El resumen ya no consulta pedidos masivamente para obtener nombres; la identidad/detalle de cliente se solicita al usar las funciones del contacto.
- Limpiar un historial elimina todas sus páginas (antes se limitaba a 100) y su resumen.
- El detalle del chat aún carga hasta 200 mensajes por apertura. El bot conserva sus lecturas de contexto actuales (hasta 20 mensajes por interacción), necesarias para mantener la conversación.

**Archivos de Don Balato:** `src/lib/whatsapp.ts`, `src/app/api/admin/ia/threads/route.ts`, `src/app/api/admin/ia/threads/backfill/route.ts`, `src/app/api/admin/ia/thread/route.ts`, `src/app/admin/(panel)/ia/whatsapp/page.tsx`.
- Al trasladar al producto base o Carlitos, revisar el proveedor de Firebase Admin, los permisos de las colecciones nuevas, y la ruta de migración. No copiar la configuración ni credenciales de Don Balato.

## Verificación conocida

- En la revisión anterior, las pruebas automatizadas de imágenes y acceso dieron 15 resultados correctos.
- `npx tsc --noEmit` terminó con errores preexistentes/en otras áreas del sistema; no reportó errores en los archivos de WhatsApp cambiados en esta revisión. `git diff --check` no reportó errores de whitespace. No se ejecutaron migraciones de datos ni se hizo push o despliegue.
- No se hizo push ni despliegue.

### Port de WhatsApp optimizado a Carlitos (6-11-2026)

- Se adaptó en la copia local de Carlitos la bandeja de conversaciones optimizada: la lista usa `whatsapp_thread_summaries` en vez de escanear hasta 1.000 mensajes y pedidos en cada carga. Los mensajes nuevos actualizan el detalle y el resumen en una escritura atómica de Firebase Admin.
- Al enviar texto o una plantilla desde la bandeja, el administrador toma el control de esa conversación y Yaxbot queda pausada para ese teléfono. Las respuestas posteriores del cliente se registran y notifican al administrador; el bot no se reactiva automáticamente. Se puede reanudar desde **Devolver a Yaxbot**.
- Se protegieron los endpoints administrativos de WhatsApp con token de Firebase y autorización de administración web. No se copiaron tokens, credenciales ni datos de Don Balato.
- El acceso de la bandeja quedó agregado como **Automatizaciones → BOT → WhatsApp**, debajo de **Cotización**. Se separó el permiso `whatsappInbox` de `whatsappManagement`: Carlitos puede ofrecer la bandeja del bot sin habilitar las funciones generales de WhatsApp ligadas a pedidos y ajustes comerciales.
- Corrección para el servidor local de Carlitos (puerto 3001): también se aplicó el enlace y su permiso de ruta en `C:\Proyectos\YAXSELL CLIENTES\PROJECTO YAXSELL CARLITOS (FIREBASE)`, que es la copia que sirve la instancia visible; el cambio previo solo estaba en el worktree de Codex.

### Frescura del stock del catálogo web (6-11-2026)

- El panel guarda `WEB_STOCK` y, con `inventoryMode: web_independent`, el catálogo lo transforma al campo `STOCK` que consume la tienda. Se comprobó que el endpoint público de productos entrega ambos valores y el modo público confirma `web_independent`.
- El retraso venía de una caché de memoria local por instancia serverless que podía vivir hasta 60 minutos, además de la caché CDN de respuesta.
- Se retiró la comprobación por intervalos. El catálogo principal ahora usa la caché compartida de Next con `revalidate: false`, que se invalida por el tag `products` cuando se crea/edita un producto o se ejecuta `clearCatalogMemoryCache`. La petición pública de catálogo no se conserva en el CDN, y el siguiente acceso regenera el resultado después de invalidar el tag.
- La regeneración usa Delta Sync cuando la instancia tiene el mapa base y una carga completa solo si esa instancia aún no lo tiene. Las visitas normales leen la caché compartida; no hay polling ni lecturas periódicas de Firestore para refrescar stock. Una página que ya estaba abierta necesita una nueva carga/actualización manual para pedir el resultado nuevo.
- En el menú lateral del admin se ocultaron **Plantillas**, **Tiendas Aliadas**, **Analytics** y **Packs** (por ahora).
- Cambios locales sin push ni despliegue.
- El historial anterior requiere iniciar manualmente **Optimizar historial antiguo** desde la bandeja; no se ejecutó la migración ni se accedió a los datos de Firebase durante esta adaptación.
- El trabajo permanece sin commit, push ni despliegue. La comprobación TypeScript del repositorio presenta errores en áreas preexistentes ajenas a los archivos WhatsApp editados; `git diff --check` no detectó errores de whitespace.

**Archivos Carlitos:** `src/lib/whatsapp.ts`, `src/lib/whatsapp-admin-auth.ts`, `src/lib/whatsapp-admin-client.ts`, `src/app/admin/(panel)/ia/whatsapp/page.tsx`, `src/app/api/admin/ia/`.

### Compra directa con el bot (6-11-2026)

- Al elegir WhatsApp se abre el formulario de nombre y teléfono y se usa el número configurado del bot; se elimina la selección de asesor en los dos flujos del carrito.
- Se conserva la barra de anuncios amarilla y se actualiza la versión de los archivos del catálogo. Los cambios necesitan publicarse para aparecer en producción.

### Traslado de pedidos desde Don Balato (6-11-2026)

- Se adaptaron a Carlitos el escaneo continuo de pedidos, la captura de cantidad y tallas de cajas, el listado imprimible de embalados y la revisión de faltantes mediante un segundo QR.
- Los QR usan el origen de la página que imprime (con `getPublicSiteUrl()` como alternativa fuera del navegador); no apuntan al dominio de Don Balato. La autorización de acceso a pedidos sigue siendo obligatoria.
- Los faltantes quedan como informe separado con totales original y estimado; no se alteran automáticamente los artículos, el stock ni el total del pedido. El escáner no embala un pedido con faltantes pendientes.
- Se trasladó la corrección de visualización de comprobantes. No se trasladaron cambios de confirmación de pedidos ni datos bancarios.
- Validación: la prueba local del cálculo de faltantes, la protección contra revisiones obsoletas y las cantidades inválidas pasó. TypeScript sigue informando errores previos en otras áreas; no se probó la cámara física ni se realizó push o despliegue.
- Por indicación del usuario, no trasladar compras por embalaje, packs, optimizaciones de lecturas ni etiquetas; no copiar marcas, números, credenciales ni datos de Don Balato.

### Flujo de pedidos para Web independiente (6-11-2026)

- En Administración, el flujo independiente muestra No pagados, Revisando pago, Pago confirmado, Embalado y Entregado. Los dos primeros filtros agrupan pedidos pendientes según la presencia real de comprobantes, incluidos estados antiguos; el modo integrado conserva su flujo anterior.
- La carga de comprobantes pasa a revisión. La revisión masiva admite comprobantes de pedidos pendientes antiguos y exige el comprobante antes de confirmar.
- En pedidos principales independientes no se aplica el vencimiento ni la cancelación automática por tiempo; el temporizador se oculta. Pedidos de tiendas aliadas y el modo integrado mantienen sus reglas previas. Los pedidos ya cancelados no se reactivan automáticamente.
- El detalle del pedido en administración y la página del cliente muestran las etapas del modo independiente. No se modificaron datos bancarios ni dominios.
- Verificación: TypeScript no informó errores en los archivos de este cambio; el repositorio mantiene errores preexistentes en otras áreas. Falta prueba integrada con Firebase y comprobantes reales. Sin push ni despliegue.

### Datos comerciales de Carlitos (6-11-2026)

- Se configuraron en Firebase de Carlitos los datos de transferencia proporcionados por el usuario; la web y el bot los consultan desde ajustes de tienda. No activar funciones de WhatsApp deshabilitadas sin autorización.
- La ubicación visible se configuró como Alameda 2960 y se añadió en el catálogo un enlace al mapa indicado. La lista de agencias contiene STARKEN y BLUEXPRESS; el respaldo local del checkout usa esas mismas dos opciones.
- Se verificó la configuración desde Firebase y desde las API del servidor local de Carlitos. El enlace del catálogo y el respaldo del checkout son cambios locales que requieren despliegue para verse en una web publicada.

### Pedidos: filtro por tiendas

- Se ocultó el selector de tiendas en Pedidos y se retiró la consulta de tiendas que solo alimentaba ese selector. Los pedidos y sus datos permanecen disponibles.

### Barra superior del catálogo

- Se retiró el acceso rápido de WhatsApp de la barra principal y se trasladó el indicador de conectados junto a la dirección. El indicador conserva su comportamiento previo.
