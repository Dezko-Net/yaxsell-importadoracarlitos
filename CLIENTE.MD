# Importadora Carlitos — alcance y funciones restringidas

Este archivo registra las decisiones acordadas para esta copia de Yaxsell. Añadir aquí cada función que el cliente indique que debe ocultarse o restringirse y actualizar su estado cuando cambie.

## Alcance actual

- Cliente: Importadora Carlitos SPA. Plan contratado: tienda web y catálogo.
- Firebase: proyecto `importadora-carlitos`, Firestore `(default)` y bucket propio.
- Inventario: modo **web independiente** seleccionado. El modo conjunto con ERP sigue disponible en la configuración.
- POS y ERP: deshabilitados para esta copia mediante `src/lib/module-access.ts` y middleware.
- Acceso administrativo: `/admin/login` muestra únicamente el acceso a la plataforma web cuando ERP y POS están deshabilitados. Los parámetros de acceso no reactivan esos módulos y los usuarios sin permiso web reciben un aviso.

### Productos en modo web independiente

- El menú muestra **0. Productos Web** y oculta **1. Seleccionar de Tienda**, **2. Revisión Web** y **3. Productos Publicados**. Las categorías y los packs siguen disponibles.
- La pantalla 0 permite crear, editar y cargar fotos para el catálogo web. El stock web se guarda en `WEB_STOCK` y no requiere las rutas del ERP o POS.
- La pantalla independiente usa un diseño propio de catálogo, con marca y datos opcionales de talla, color y contenido. Estos datos son referencias internas: aún no crean variantes seleccionables ni stock por variante.
- En modo conjunto con ERP vuelven a mostrarse los pasos 1, 2 y 3 y se conserva el flujo integrado.

## Funciones ocultas o restringidas

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
