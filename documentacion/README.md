# Documentación técnica — Yaxsell / Importadora Carlitos

**Revisada:** 22 de octubre de 2026  
**Repositorio:** `PROJECTO YAXSELL IMPORTADORA CARLITOS (FIREBASE)`
**Propósito:** dejar un traspaso técnico para que otra IA o desarrollador pueda ubicarse sin reconstruir el proyecto desde cero.

## Lectura recomendada

- **Antes de rediseñar el POS:** lee [POS y POS Admin — análisis técnico profundo](POS_Y_POS_ADMIN_DEEP_DIVE.md), que detalla roles, flujos de caja/venta, persistencia, APIs y límites de seguridad.


1. [Guía para IA](GUIA_PARA_IA.md): propósito, arquitectura, puntos de entrada e invariantes para trabajar.
2. [Firebase, datos y caché](FIREBASE_DATOS_Y_CACHE.md): configuración, acceso a datos, colecciones y cacheado observado.
3. [POS, ERP e inventario](POS_ERP_INVENTARIO.md): ventas presenciales, stock, caja y deuda de inventario.
4. [Tienda, checkout y vendors](TIENDA_CHECKOUT_VENDORS.md): catálogo público, pedidos web y marketplace.
5. [API, autenticación e integraciones](API_AUTH_INTEGRACIONES.md): límites entre cliente/servidor, flags, cron y servicios externos.
6. [Operación y migraciones](OPERACION_MIGRACIONES.md): comandos, configuración, despliegue y scripts con efectos sobre datos.
7. [Inventario, documentación histórica y seguridad](INVENTARIO_SEGURIDAD_Y_HISTORICO.md): mapa de archivos, riesgos confirmados y limpieza aplicada.
8. [Inventario de páginas y endpoints](INVENTARIO_RUTAS.md): las rutas fuente de App Router y métodos exportados, generados desde el árbol actual.

## Estado resumido

- Es una aplicación Next.js 15 con React 19 y TypeScript. Firebase/Firestore es el backend principal del estado actual del código.
- El árbol conserva nombres, shims, rutas y scripts de la etapa Appwrite. Esa compatibilidad no prueba que Appwrite siga siendo el origen de datos de cada función; revisar la implementación concreta antes de cambiarla.
- El sitio reúne tienda online, administración, POS, ERP, inventario y ventas de vendors.
- El 3 de noviembre de 2026 se endurecieron localmente las reglas de Firestore y Storage: datos internos quedan para la cuenta administradora verificada; el SDK público solo puede leer productos publicados y contenido público de tienda; y las escrituras de medios quedan restringidas al administrador. No se consultó Firebase Console ni se desplegaron reglas; la configuración efectiva sigue sin confirmarse.
- El endpoint público de pedido vendor devuelve el documento completo del pedido al buscar por folio, y la sesión de vendor conserva un secreto literal de respaldo en el código. Ver [hallazgos de seguridad](INVENTARIO_SEGURIDAD_Y_HISTORICO.md).

## Ajuste local para Importadora Carlitos — 3 de noviembre de 2026

- La copia mantiene habilitado el e-commerce y desactiva POS/ERP mediante `src/lib/module-access.ts`. `src/middleware.ts` redirige las páginas bloqueadas a `/productos` y devuelve 404 en sus APIs.
- La raíz `/` redirige a `/productos`, que conserva el catálogo público.
- Los nombres legados de tienda se normalizan a “Importadora Carlitos” al servir la configuración y el catálogo.
- Las rutas públicas de catálogo usan APIs del servidor; las reglas del cliente bloquean por defecto el resto de colecciones y dejan POS/ERP sin acceso directo.
- El detalle de permisos locales y límites pendientes está en [Inventario, documentación histórica y seguridad](INVENTARIO_SEGURIDAD_Y_HISTORICO.md). El emulador no llegó a iniciar en esta sesión, así que estas reglas aún requieren validación local antes de desplegar.

## Firebase independiente para Carlitos — 3 de noviembre de 2026

- Proyecto Firebase: `importadora-carlitos` (plan Blaze); app web `Importadora Carlitos` registrada.
- Firestore `(default)` y bucket predeterminado `importadora-carlitos.firebasestorage.app` creados en Santiago (`southamerica-west1`); la API de Storage está habilitada. Sus ubicaciones son fijas.
- No se copiaron productos, pedidos, usuarios ni archivos desde Don Balato. La base contiene únicamente dos documentos de configuración `store_settings` con el modo `web_independent`; el bucket comienza vacío.
- `.firebaserc`, `firebase.json` y la configuración local apuntan a este proyecto y a `(default)`. La credencial Admin local de `yaxselldemo` se quitó para evitar llamadas cruzadas; el desarrollo local usa ADC y el despliegue necesita credenciales autorizadas para `importadora-carlitos`.
- Authentication se habilitó con Google y correo/contraseña, y se autorizó localhost. Las reglas activas se desplegaron desde `firestore.carlitos.rules` y `storage.carlitos.rules`: admiten la cuenta existente de `dezkonet@gmail.com` por su UID específico y las cuentas administradoras con correo verificado. El correo de `dezkonet` no se marcó como verificado. Antes de publicar datos reales, resolver los riesgos de checkout y vendor y configurar las credenciales del entorno de hosting.

## Límites de esta revisión

Se leyó documentación anterior y se contrastaron rutas, servicios y configuración local. El 3 de noviembre se consultó Firebase con CLI para preparar el proyecto Carlitos y crear sus recursos vacíos; no se accedió a Vercel, WhatsApp, Gemini, a la planilla maestra externa ni a datos de clientes. No se ejecutaron migraciones, scripts de importación, pruebas ni builds. Las reglas descritas son las que están guardadas en el repositorio, no una afirmación sobre producción.

La revisión encontró cambios preexistentes sin commit en `src/app/pos/[sede]/page.tsx` y `src/lib/posPriceLabelsPdf.ts`; se conservaron sin editarlos.
