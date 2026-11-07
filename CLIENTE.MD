# Importadora Carlitos — alcance y funciones restringidas

Este archivo registra las decisiones acordadas para esta copia de Yaxsell. Añadir aquí cada función que el cliente indique que debe ocultarse o restringirse y actualizar su estado cuando cambie.

## Alcance actual

- Cliente: Importadora Carlitos SPA. Plan contratado: tienda web y catálogo.
- Firebase: proyecto `importadora-carlitos`, Firestore `(default)` y bucket propio.
- Inventario: el modo **web independiente** o **conjunto con ERP** se administra en «Mi Tienda → Admin Supreme Web», visible para `dezkonet@gmail.com`.
- Servicios: Web, ERP y POS están habilitados inicialmente para pruebas. Sus estados se guardan en `system_settings/module_access` de Firebase y el middleware restringe las rutas de cada módulo.
- Admin Supreme Web, el Supreme del ERP y Admin Supreme POS permiten a `dezkonet@gmail.com` activar o desactivar los otros servicios. Cada panel impide apagar su propio módulo para conservar una vía de administración.
- Acceso administrativo: `/admin/login` adapta las opciones y destinos a los servicios activos. El cambio de servicios requiere la sesión Firebase de la cuenta autorizada.
- En **Admin Supreme Web → Datos de la web** se configuran nombre, logo, imagen y textos de portada, dirección, WhatsApp de atención, número del bot, dominio público e identificador del número de Meta. Estos datos se guardan en `web_settings`; no sustituyen la configuración del ERP o del POS. Productos, pedidos y pagos se gestionan desde sus pantallas enlazadas.
- El token de Meta sigue en la variable de servidor `WHATSAPP_ACCESS_TOKEN`, nunca se muestra en el navegador. El webhook requiere el dominio público de la tienda configurado antes de procesar mensajes. Si faltan datos bancarios completos, el bot no inventa una cuenta para recibir pagos.
- Para otro cliente se requiere una copia y un proyecto Firebase propios, configurar todas las variables públicas y credenciales de ese proyecto, crear la cuenta propietaria e indicar `NEXT_PUBLIC_SUPREME_OWNER_UID` (y si corresponde `NEXT_PUBLIC_SUPREME_OWNER_EMAIL`), adaptar y desplegar sus reglas de Firebase, y configurar hosting y secretos. Los datos comerciales se completan luego en Supreme Web. No copiar productos, pedidos, usuarios, credenciales ni respaldos entre clientes.
- La separación absoluta entre web y ERP aún requiere trabajo: por ejemplo, el dashboard del ERP consulta pedidos web para sus informes. Revisar esas lecturas y las demás integraciones antes de prometer aislamiento total dentro de una misma instalación.
- La configuración nueva ya alimenta el catálogo, la cuenta, el webhook y la notificación de despacho. Otras plantillas y funciones heredadas, incluidos cron de negociación e IA de administración, conservan configuraciones propias y deben revisarse antes de reutilizarlas con otro cliente.

### Productos en modo web independiente

- El menú muestra **Productos Web** y oculta **1. Seleccionar de Tienda**, **2. Revisión Web** y **3. Productos Publicados**. Las categorías y los packs siguen disponibles.
- La pantalla 0 permite crear, editar y cargar fotos para el catálogo web. El stock web se guarda en `WEB_STOCK` y no requiere las rutas del ERP o POS.
- La pantalla independiente usa un diseño propio de catálogo, con marca y datos opcionales de talla, color y contenido. Estos datos son referencias internas: aún no crean variantes seleccionables ni stock por variante.
- En modo conjunto con ERP vuelven a mostrarse los pasos 1, 2 y 3 y se conserva el flujo integrado.

## Funciones ocultas o restringidas

### Salud del catálogo y stock

- En productos web independientes se retiraron el resumen y el flujo de salud del catálogo, junto con los indicadores de riesgo de stock. Se mantiene la cantidad disponible o la opción de stock ilimitado.
- En pedidos, el modo web independiente oculta los indicadores y alertas de salud de stock vinculados al inventario integrado. En modo conjunto se conservan. La comprobación de existencias y las reglas existentes del pedido siguen funcionando.

### Imágenes del inicio

- En `/admin/marketing/home` solo se muestra la edición del banner «Últimas novedades». Se ocultan los controles de imágenes del hero; su configuración guardada se conserva al actualizar el banner.

### Acceso con Google en el login administrativo

- Se quitó el enlace «Continuar con Google» de `/admin/login`. Esta decisión afecta a ese acceso visual; no modifica los proveedores de autenticación ni el acceso con Google en otras páginas.

### Administración de WhatsApp

- Oculta para Carlitos: la bandeja de conversaciones de WhatsApp, sus acciones manuales y la sección de configuración de asesoras y contactos.
- La ruta `/admin/ia/whatsapp` y los endpoints de administración asociados se bloquean en middleware. `MODULE_ACCESS.whatsappManagement` controla esta restricción.
- Se ocultan los accesos manuales de mensajería en las pantallas de pedidos. La solicitud de datos de envío por WhatsApp y el endpoint de envío manual quedan bloqueados; la antigua notificación de reemplazo que utilizaba ese endpoint deja de enviarse.
- El formulario de ajustes generales conserva la configuración de WhatsApp existente sin sobrescribirla. La API rechaza cambios a los campos de administración de WhatsApp mientras el módulo está deshabilitado.
- Se conservan los botones de contacto para compradores y el bot de WhatsApp. `WHATSAPP_BOT_ENABLED` permanece activo y el webhook `/api/whatsapp/webhook` no se bloquea. La opción BOT conserva el acceso a cotizaciones.
- El menú BOT y la bandeja de WhatsApp compartían pantalla. Al ocultar la bandeja, BOT dirige a cotizaciones; el cliente no dispone de una pantalla independiente para administrar conversaciones o configurar el bot.
- La disponibilidad real del bot requiere sus credenciales y configuración propias; un flag activo por sí solo no garantiza su funcionamiento.
- El bloqueo por middleware protege las rutas de esta aplicación. El acceso directo a Firebase depende de sus reglas y de los permisos concedidos a cada cuenta; no debe entregarse al cliente acceso de administrador al proyecto Firebase si no corresponde.

## Pendientes antes de producción

- Preparar el catálogo propio de Carlitos tras confirmar el archivo maestro, las columnas de precios y un respaldo.
- Revisar los riesgos documentados de validación de precios del checkout y del endpoint público de pedidos de vendors.
- Configurar las credenciales y el dominio del hosting de Carlitos, y verificar el flujo completo de la tienda y del bot.
