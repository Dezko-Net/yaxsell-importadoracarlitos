# Inventario, seguridad y documentación histórica

## Mapa práctico de código

| Área | Ubicación principal |
|---|---|
| Páginas y layouts | `src/app/` |
| Handlers de servidor | `src/app/api/` (156 `route.ts` en el corte de esta revisión) |
| UI compartida | `src/components/`, con subárboles `admin/`, `catalog/`, `catalogo/`, `cuenta/`, `erp/`, `inventario/`, `pos/` |
| Estado de carrito/usuario/template | `src/context/` |
| Acceso a datos/caché/dominio | `src/lib/` |
| Servicios del cliente | `src/services/` |
| Hooks | `src/hooks/` |
| Shopify clonado y assets | `public/shopify/` y `src/templates/` |
| Scripts | `scripts/`, `scripts/importacion/`, `migracion/` |
| Guías recientes por dominio | `docs/` |
| Handoff consolidado | `documentacion/` |

El número de rutas es un conteo reproducible de `route.ts`, no un inventario contractual. Algunas páginas y handlers son de pruebas, soporte, compatibilidad o herramientas internas.

## Reglas Firebase locales — 3 de noviembre de 2026

Se reemplazaron las reglas públicas originales en `firestore.rules` y `storage.rules`:

- Firestore deniega por defecto el acceso desde clientes. Las reglas admiten las cuentas administradoras con correo verificado y, además, la cuenta existente de `dezkonet@gmail.com` por su UID específico sin cambiar el estado de verificación del correo.
- Los clientes pueden leer por SDK directo productos publicados, taxonomía, banners y contenido público activo; crear pedidos con una lista cerrada de campos; y mantener sus propios perfiles/direcciones. Las reseñas, preguntas y solicitudes de stock aceptan únicamente escrituras asociadas a una sesión Firebase.
- Las APIs del servidor que usan Firebase Admin SDK no pasan por estas reglas. Hay que revisar su autorización por separado; estas reglas no las protegen.
- Storage deja lectura pública para rutas de medios de catálogo (`carlitos/productos/`, `carlitos/banners/`, `carlitos/categorias/`, `carlitos/thumbnails/` y `media/`); los comprobantes y el chat de Carlitos son privados. Las escrituras directas quedan reservadas a las cuentas administradoras reconocidas por las reglas y los comprobantes siguen subiendo por API servidor. Las reglas `storage.carlitos.rules` y `firestore.carlitos.rules` están desplegadas en el proyecto Carlitos.
- La acción de anular en `/pedido/[id]` aún intenta reponer stock y cambiar el estado desde el navegador; estas reglas rechazan esas escrituras. Migrarla a una API autenticada que valide propiedad y libere stock antes de desplegar estas reglas.
- La creación directa de pedidos todavía acepta precios/totales calculados por el navegador: las reglas limitan estructura y tamaños, pero no recalculan el precio de cada artículo. Migrar la creación/validación completa al servidor antes de tratar el checkout como resistente a manipulación.
- Firebase Console no se consultó y no hubo despliegue. El emulador local no completó la validación: el entorno tenía Java 8, se preparó un runtime temporal Java 21, pero Firebase CLI quedó descargando el emulador. No afirmar que las reglas fueron compiladas o probadas.

### Riesgos de seguridad observados en archivos locales

### Hallazgo original crítico: reglas Firebase versionadas abiertas

- Antes del endurecimiento local del 3 de noviembre, `firestore.rules` permitía leer y escribir cualquier documento sin autenticación.
- Antes del endurecimiento local del 3 de noviembre, `storage.rules` permitía leer y escribir cualquier ruta/objeto sin autenticación.
- `firebase.json` asocia Firestore rules a `(default)` y `donbalato` y enlaza las reglas de Storage.

El estado de Firebase Console no fue consultado. No se sabe si las reglas originales se desplegaron o si producción usa otras. Revisar el estado efectivo de cada base de datos y bucket antes de publicar datos reales.

### Alto: secreto de respaldo de sesión vendor en código

`src/lib/vendor-auth.ts` declara una clave HMAC con lectura de `VENDOR_SESSION_SECRET` y fallback literal. El literal no se copia aquí. Si producción depende del fallback, las sesiones de vendor pueden ser falsificadas por quien conozca el código. Requerir secreto aleatorio fuerte en despliegue, eliminar fallback de producción, rotar la clave si estuvo publicada y comprobar invalidación de cookies.

### Alto: endpoint de pedido consultable por folio

`src/app/api/vendor/public-order/route.ts` recibe un `ORDERCODE` predecible, consulta sin autenticar y responde el objeto `order` entero junto con datos bancarios del vendor. Esto puede incluir datos personales del comprador. Restringir a token aleatorio por pedido, limitar campos de respuesta, aplicar vencimiento y revisar todos los consumidores del endpoint antes de cambiarlo.

### Alto: autorización API no uniforme

Hay handlers admin, POS y ERP con estrategias distintas. `StoreShell` decide presentación del panel, no autorización de servidor. Auditar cada método HTTP por separado, especialmente APIs de operaciones financieras, cambios de roles, borrados/importaciones, cancelación de pedidos y cargas públicas.

### Riesgo de disponibilidad/integridad: fallback de Admin SDK

`src/lib/db-server.ts` intenta volver a un adaptador con Firebase cliente cuando falla la autenticación de Admin. La aplicación puede comportarse distinto según haya credenciales Admin disponibles. Junto con reglas abiertas en el repositorio, no se debe interpretar el fallback como aislamiento de permisos. Registrar el error, fallar cerrado en operaciones sensibles y validar cada endpoint.

### Riesgos de secretos y datos locales

- Existe `.env.local` y el proyecto contiene archivos de credenciales ignorados por Git. Los valores no se mostraron ni copiaron; solo se inventariaron nombres de variables.
- La raíz y `scripts/` contienen dumps/exportaciones JSON y logs de actividad. Pueden contener datos de clientes, operaciones o resultados con información privada; fueron tratados como datos y no se inspeccionaron ni copiaron.
- No asumas que `.gitignore` garantiza que un secreto nunca haya sido rastreado en un commit anterior.
- Evita imprimir errores completos de credenciales y payloads de pedidos en logs.

## Hallazgos de arquitectura/mantenimiento

- Persisten nombres, variables, comentarios y pantallas `Appwrite` aunque Firebase sea el backend principal del código. Algunos proxies/sync aún interactúan con legado; revisa destino antes de borrar.
- `src/app/api/firebase-proxy*` conserva tags/logs `appwrite`; `src/app/api/admin/sync-firebase-products` está orientado a sincronización con Appwrite. No usar el workflow antiguo como evidencia de que el sync siga autorizado.
- La home, el mensaje de error y pantallas de configuración mantienen texto/instrucciones Appwrite. La configuración Firebase real vive en `src/lib/firebase.ts` y `src/lib/db-server.ts`.
- `next.config.ts` tiene `images.unoptimized: true`; no prometer optimización automática de Next.js.
- El proyecto combina fechas epoch, strings, nombres de campo mayúsculos/minúsculos y objetos de pedido serializados. Documentar/normalizar antes de cambiar contratos.
- El readme de tiendas aliadas del 20-10-2026 documenta hallazgos de paginación, estados y conciliación que merecen seguimiento; no todos se revalidaron en esta revisión.

## Documentación antigua leída y tratamiento

Se inventariaron los documentos previos. Se leyeron las instrucciones y README que se iban a reemplazar, además de las guías pertinentes de vendors, POS/ERP, stock pendiente y operación. Los documentos históricos que no se quitaron se conservaron; las copias idénticas se cotejaron por hash y sus originales canónicos siguen presentes.

- `README.md` raíz era una “survival bible” que describía Appwrite como backend principal y sugería que otra IA limpiara scripts. Fue reemplazado por el índice técnico actual.
- Los diez análisis `DOCUMENTOS/01...10` eran duplicados byte por byte de `Analisis Low Level/`; se conserva la copia canónica en `Analisis Low Level/` como archivo histórico.
- `DOCUMENTOS/README.md`, `DOCUMENTOS/YAXSEL_ARCHITECTURE_CORE.md`, `DOCUMENTOS/debug-whatsapp-ia-silence.md`, `DOCUMENTOS/readmekenialogic.md`, `DOCUMENTOS/GUIA_PARA_IAS.md`, `DOCUMENTOS/MIGRACION_EJECUTABLE.md` y `DOCUMENTOS/PLAN MIGRATORIO.md` eran duplicados exactos de archivos que se mantienen en raíz o `plan migratorio/`.
- Se eliminaron únicamente esos duplicados de `DOCUMENTOS/`; el resto del contenido único se conserva. No se eliminaron carpetas de datos, bases, dependencias, imágenes, exports ni respaldos operativos.
- Las guías `Analisis Low Level/`, `plan migratorio/`, `erp.md`, `CONTEXTO_DEL_NEGOCIO.md`, `GEMINI_CONFIG.md`, `IMPLEMENTACION_VENDEDORES.md`, `YAXSEL_OMNICHANNEL_ERP_MASTER_PLAN.md` y `docs/*` siguen disponibles como histórico/especializado. Sus planes y conteos deben verificarse en código antes de ejecutarlos.
- `.agents/AGENTS.md` y `DOCUMENTOS/AGENTS.md` se actualizaron para remitir a este handoff y no presentar los datos Appwrite antiguos como configuración vigente.
- El workflow `.windsurf/workflows/sync-firebase-to-appwrite.md` quedó marcado como heredado; se retiró una contraseña literal que estaba guardada en el archivo y se requiere validar destino y autorización antes de cualquier uso.

## Limpieza y límites

La búsqueda de archivo comprimido excluyó `.git`, `node_modules`, `.next`, `.vercel` y `.wrangler`: no encontró ZIP/RAR/7z/TAR/GZ. Los tres `.bak` son distintos de sus fuentes actuales, así que se preservaron. `scripts/backups/` conserva versiones fechadas de datos y código operativo. Los grandes logs y dumps no se leyeron.

El estado de Git tenía cambios en `src/app/pos/[sede]/page.tsx` y `src/lib/posPriceLabelsPdf.ts` antes de empezar. Se mantuvieron intactos. La regla local actual no se verificó en producción; esta documentación no representa una aprobación de seguridad ni un despliegue.
