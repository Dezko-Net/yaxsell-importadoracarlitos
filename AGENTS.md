# Importadora Carlitos (Firebase) - Contexto de Negocio y Proyecto

## Información General
- **Proyecto:** E-commerce Yaxsell preparado para Importadora Carlitos SPA
- **Cliente:** Importadora Carlitos - catálogo de perfumes, ropa y otros productos
- **Plan Firebase:** Blaze (pay-as-you-go)
- **Bucket de Storage:** importadora-carlitos.firebasestorage.app (Santiago, `southamerica-west1`)
- **Project ID:** importadora-carlitos
- **Database ID:** (default)
- **Ubicación Firestore:** `southamerica-west1` (Santiago; fija)
- **Administradores:** `yanpolreyes666@gmail.com` con correo verificado y la cuenta Firebase existente de `dezkonet@gmail.com` autorizada por UID específico. No se marcó como verificado el correo de esta última.
- **Migración de inventario:** pendiente; no importar datos hasta confirmar archivo maestro, columnas de precios y respaldo

## Estructura del Storage (Firebase Storage)
Estructura multi-tenant:

```
carlitos/productos/  ← imágenes de productos
carlitos/banners/     ← banners de la tienda
carlitos/categorias/  ← iconos de categorías
carlitos/thumbnails/  ← miniaturas
carlitos/chat/        ← imágenes del chat (privadas)
comprobantes/
  carlitos/           ← comprobantes de pago de clientes (privados)
```

Para tiendas aliadas futuras, crear carpetas separadas:
```
otra-tienda/
  productos/
  banners/
  categorias/
comprobantes/
  otra-tienda/
```

### Proyecto Carlitos preparado
- App web de Firebase registrada como `Importadora Carlitos`.
- Firestore `(default)` y bucket Firebase predeterminado creados en `southamerica-west1`.
- La base contiene dos documentos de configuración (`store_settings/main` y `store_settings/config`) con `inventoryMode: web_independent`; no se copiaron productos, pedidos, usuarios ni imágenes de Don Balato. El bucket comienza vacío.
- Authentication está habilitado con Google y correo/contraseña; localhost está autorizado para desarrollo.
- Las reglas activas se desplegaron desde `firestore.carlitos.rules` y `storage.carlitos.rules`. Revisar los riesgos de checkout y endpoints vendor antes de publicar datos reales.

## Configuración de Media Prefixes
Definido en `src/lib/db.ts` y `src/lib/collections.ts`:
```typescript
export const MEDIA_PREFIXES = {
  products:     'carlitos/productos/',
  banners:      'carlitos/banners/',
  categories:   'carlitos/categorias/',
  comprobantes: 'comprobantes/carlitos/',
  thumbnails:   'carlitos/thumbnails/',
  chat:         'carlitos/chat/',
};
```

## Endpoints de Upload de Comprobantes
3 endpoints que suben a `comprobantes/carlitos/`:
1. `/api/catalogo/upload-proof` - checkout y confirmar-pedido
2. `/api/public-data/vendor-order/[id]/upload-proof` - pedidos de vendor
3. `/api/vendor/public-upload-proof` - upload público de vendor

## Feature Flags (IA desactivada por defecto)
Definido en `src/lib/feature-flags.ts`. Todas las funcionalidades de IA
están **desactivadas** para el demo base. Se activan cuando un cliente
las contrate como add-on:

| Flag | Descripción | Default |
|------|-------------|---------|
| `AI_ENABLED` | Master switch — Yaxbot, Gemini, config IA | `false` |
| `WHATSAPP_BOT_ENABLED` | Bot de WhatsApp que responde a clientes | `false` |
| `AI_SIDEKICK_ENABLED` | Asistente IA flotante del panel admin | `false` |
| `AI_CATEGORIZE_ENABLED` | Auto-categorizar productos con IA | `false` |
| `AI_IMAGE_GEN_ENABLED` | Generar imágenes de productos con IA | `false` |
| `CHATBOT_ENABLED` | Widget de chat flotante en la tienda | `false` |
| `SMART_NOTIFICATIONS_ENABLED` | Notificaciones WhatsApp con IA | `false` |
| `AUTO_NEGOTIATION_ENABLED` | Cron de negociación automática | `false` |

### Rutas API gateadas (return 404 cuando flag=false)
- `/api/ai-sidekick` — requiere `AI_SIDEKICK_ENABLED`
- `/api/ai-categorize` — requiere `AI_CATEGORIZE_ENABLED`
- `/api/gemini` — requiere `AI_ENABLED`
- `/api/generate-image` — requiere `AI_IMAGE_GEN_ENABLED`
- `/api/admin/ia/*` (config, interact, threads, send, debug, etc.) — requiere `AI_ENABLED`
- `/api/admin/bulk-categorize` — requiere `AI_CATEGORIZE_ENABLED`
- `/api/whatsapp/webhook` — requiere `WHATSAPP_BOT_ENABLED`
- `/api/cron/negotiation` — requiere `AUTO_NEGOTIATION_ENABLED`

### UI oculta cuando IA está desactivada
- Sección "IA" del sidebar del admin
- Botón "IA" en la top bar del admin
- Panel AISidekick flotante
- Botones "Crear con IA", "Yaxbot", "Sugerir nombres con IA", "Generar con IA" en products
- Modal de categorización con IA
- ChatBot flotante en la tienda
- Link "Negociación" en el sidebar

### Credenciales de IA
- `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` están comentados en `.env.local`
- No hay `GEMINI_API_KEY` configurada
- Para activar: descomentar las variables en `.env.local` y cambiar los flags a `true`

## Autenticación
- **Google Auth:** Implementado en `authService.ts` (loginWithGoogle con signInWithPopup)
- **Hook:** `useAuth.ts` expone `loginWithGoogle`
- **UI:** Botón "Continuar con Google" en `/login` y `/cuenta`
- **Requisito:** Habilitar Google en Firebase Console → Authentication → Sign-in method → Google
- Colección de usuarios: `users` en Firestore

## Colecciones Principales de Firestore
- `products` - Productos (266 productos)
- `orders` - Pedidos
- `vendor_orders` - Pedidos de vendors/tiendas aliadas
- `shipping_agencies` - Agencias de envío (14 agencias)
- `banners` - Banners
- `users` - Usuarios registrados
- `categories` - Categorías
- `subcategories` - Subcategorías

## Agencias de Envío
14 agencias en Firestore (`shipping_agencies`):
RETIRO EN TIENDA, STARKEN, PULLMAN CARGO, VARMONTT, BLUEXPRESS, CYC, TVP, CRUZ DEL SUR, TRAMAR, 5SUR, MENA, CACEM, JT TRANSPORTES, STARKI

- Admin: `/admin/agencias`
- API: `/api/agencies` (con cache unstable_cache 24h - requiere reiniciar server o borrar .next para purgar)
- Checkout: scroll horizontal en mobile, grid en desktop

## Páginas Clave
- `/` - Home (usa template dinámico)
- `/login` - Login con email y Google
- `/cuenta` - Panel del cliente (sin sesión muestra login prompt)
- `/checkout?vendor=__MAIN__` - Checkout
- `/pedido/[id]` - Detalle de pedido con upload de comprobante
- `/comprobante` - Upload de comprobante interno
- `/admin/agencias` - Gestión de agencias
- `/admin/(panel)/orders/[id]` - Admin de pedidos

## Templates (Plantillas)
- `plantilla1` - Shopify-Venice (template principal)
- `plantilla2` - HomePage con secciones premium
- `plantilla5` - Pebble Little (Concept theme por RoarTheme)
- `plantilla8` - Variante simple
- `plantilla13` - Variante
- `plantilla23` - Variante con particle system
- `plantilla25` - Navbar Concept Real
- `plantilla101` - Captured landing (hide navbar)

## Problemas Conocidos y Soluciones
1. **Encoding de caracteres:** Los scripts de migración rompieron emojis y caracteres acentuados. Solución: usar entidades HTML (`&oacute;`, `&aacute;`) en texto JSX plano, no escapes `\u00F3`.
2. **theme.js classList error:** El script del tema Concept (RoarTheme) falla con `null.classList` en páginas sin header (ej. /login). Solución: error suppression global en `layout.tsx`.
3. **Cache de agencies:** `unstable_cache` con revalidate 24h. Para purgar: borrar `.next` y reiniciar server.
4. **Firebase reads spike:** Debugging intensivo causa spike de reads. 100k reads ≈ $0.04 en Blaze plan.

## Comandos
- `npm run dev` - Desarrollo (puerto 3000)
- Server reinicia automáticamente con Fast Refresh

## Archivos Importantes
- `src/lib/db.ts` - Config Firebase, colecciones, MEDIA_PREFIXES
- `src/lib/db-server.ts` - Server-side Firebase (admin SDK, storage, firestore)
- `src/lib/collections.ts` - Definiciones de colecciones (mirror de db.ts)
- `src/lib/feature-flags.ts` - Feature flags (IA desactivada por defecto)
- `src/lib/appwrite-server.ts` - Shim que re-exporta de db-server.ts
- `src/services/authService.ts` - Auth con Firebase (email + Google)
- `src/hooks/useAuth.ts` - Hook de autenticación
- `src/app/layout.tsx` - Root layout con providers, error suppression
- `src/components/StoreShell.tsx` - Shell que decide navbar/footer según ruta
- `migracion/migrar-cliente.mjs` - Script automatizado para migrar a nuevos clientes

## Próximos Pasos Pendientes
- Implementar lógica de tiendas aliadas (multi-vendor)
- Mover banners y categorías existentes a nueva estructura de Storage
- Probar Google Auth end-to-end (requiere habilitar en Firebase Console)
- Optimizar Firebase reads (onSnapshot listeners en POS)

## Inventario de Importadora Carlitos
- El archivo maestro y el script de sincronización propios de esta empresa están pendientes de configurar.
- No ejecutar sincronizadores de inventario de otra operación sobre esta copia.
- Confirmar el catálogo, las columnas de precios y el respaldo antes de preparar una carga.

## Documentación técnica vigente (22-10-2026)

- Para el traspaso completo por módulos, configuración y riesgos, comienza por documentacion/README.md.
- La carpeta contiene el estado contrastado con el código actual; documentos Appwrite antiguos son referencia histórica salvo confirmación en el handler vigente.
- Prioridad de seguridad: comprobar `firestore.rules`, `storage.rules`, `src/lib/vendor-auth.ts` y `/api/vendor/public-order` antes de exponer datos reales. Detalle en `documentacion/INVENTARIO_SEGURIDAD_Y_HISTORICO.md`.

