# Migración de cambios de Carlitos

Fecha: 6 de noviembre de 2026
Proyecto destino: `yaxsell-importadoracarlitos`
Firebase: `importadora-carlitos` (`(default)`)

## Catálogo web sin polling

- La respuesta mínima del catálogo público no se almacena en el navegador ni en el CDN.
- Los productos se sirven desde la caché compartida de Next.js, invalidada con la etiqueta `products` cuando se ejecuta `clearCatalogMemoryCache`.
- Crear o editar productos e inventario actualiza esa caché; no se consulta Firestore con un temporizador ni se instala polling.
- Una tienda que ya estaba abierta necesita volver a solicitar el catálogo para recibir el estado actualizado. No se agregó un listener en tiempo real que genere lecturas continuas.
- Las consultas no mínimas siguen usando el flujo de caché existente.

## Bandeja de WhatsApp

- La lista de conversaciones usa resúmenes por número en `whatsapp_thread_summaries`, en vez de volver a recorrer todos los mensajes al abrir la bandeja.
- Los nuevos mensajes actualizan el mensaje y su resumen en una operación atómica de Firebase Admin. Los reintentos de Meta no deben duplicar los contadores.
- La búsqueda y los filtros trabajan sobre conversaciones ya cargadas; los detalles adicionales se obtienen al abrir las acciones que los necesitan.
- Los endpoints administrativos de la bandeja validan el ID token de Firebase y el acceso web del administrador.
- El historial previo se indexa solo si alguien inicia **Optimizar historial antiguo**. La migración procesa lotes con cursor; no se ejecutó desde este cambio.
- La bandeja aparece como **Automatizaciones → BOT → WhatsApp**, debajo de **Cotización**. Su permiso queda separado de la gestión general de WhatsApp.

## Navegación del panel

Se ocultaron del menú de Carlitos, por ahora:

- Packs
- Analytics
- Tiendas Aliadas
- Plantillas

Esto solo cambia la navegación visible. No elimina sus rutas ni sus datos.

## Al migrar o revertir

- Aplicar estos cambios únicamente a la copia de Carlitos; no trasladar credenciales ni datos de Don Balato.
- Si se revierte el cambio de catálogo, restaurar a la vez la invalidación de caché y los encabezados HTTP de la ruta pública; de lo contrario reaparecerán valores de stock obsoletos.
- No ejecutar la indexación de mensajes antiguos sin aceptar previamente las lecturas y escrituras de esa tarea.

## Verificación

- `git diff --check` sin errores de formato.
- No se ejecutaron pruebas ni compilación en este push.
- No se ejecutó ninguna migración de datos ni se desplegó Firebase desde este cambio.

### Compra directa con el bot (6-11-2026)

- Al elegir WhatsApp se abre el formulario de nombre y teléfono y se usa el número configurado del bot; se elimina la selección de asesor en los dos flujos del carrito.
- Se conserva la barra de anuncios amarilla y se actualiza la versión de los archivos del catálogo. Los cambios necesitan publicarse para aparecer en producción.

### Enlaces y datos de pago del bot

- Los enlaces públicos generados por el bot apuntan a `https://www.importadoracarlitos.cl`.
- Los datos bancarios antiguos se retiraron del texto del bot; para la tienda principal, el bot informa que el equipo entregará datos confirmados hasta que Carlitos los proporcione. Revisar la configuración de pago y otras pantallas al recibirlos.

### Acceso directo al historial de pedidos

- La confirmación de despacho y el enlace del bot abren `/cuenta?pedidos=1`, que muestra Mi cuenta y desplaza al historial dentro del catálogo incrustado. El acceso normal a Mi cuenta conserva su vista inicial.
