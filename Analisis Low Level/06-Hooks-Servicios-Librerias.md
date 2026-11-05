# Análisis Low Level — Hooks, Servicios y Librerías

## Custom Hooks (`src/hooks/`)

### `useAuth.ts` (4KB)

**Propósito:** Autenticación con Appwrite Account

```
Estado:
  - user: User | null
  - isLoggedIn: boolean
  - isLoading: boolean

Funciones:
  - login(email, password)
  - logout()
  - register(email, password, name)
  - updateName(name)

Uso: AuthProvider en root layout
```

### `usePageViewTracker.ts` (7KB)

**Propósito:** Tracking de visitas a páginas en Appwrite

```
Flujo:
  1. useEffect detecta cambio de pathname
  2. Fetch /api/geo para obtener IP → hash
  3. Verifica si IP ya visitó esta página hoy
  4. Si no → crea documento en page_views
  5. Si sí → actualiza USER_NAME si falta

Ignorados: /admin, /api, /_next, /inventario

⚠️ BUG CONOCIDO: Colección page_views no existe → "Server Error" en consola
```

### `useCartItemPrice.ts` (2KB)

**Propósito:** Calcula precio efectivo de un item en carrito

```
Lógica:
  1. Si timedOfferPrice activo y no expirado → usa precio oferta
  2. Si wholesalePrice y qty >= WHOLESALEMINQUANTITY → usa precio mayorista
  3. Sino → usa CURRENTPRICE || PRICE
```

### `useAperturaPromotion.ts` (4KB)

**Propósito:** Gestiona promoción de inauguración

```
- Lee config de apertura_settings
- Calcula descuento según nivel de fidelidad
- Verifica si la promo está activa
```

### `usePrimaryAddress.ts` (2KB)

**Propósito:** Obtiene dirección principal del usuario

### `useGsap.ts` (6KB)

**Propósito:** Hook para animaciones GSAP + ScrollTrigger

```
- Registra plugins GSAP
- Limpia animaciones en unmount
- Soporta timeline y scroll trigger
```

---

## Servicios (`src/services/`)

### `authService.ts` (11KB)

```
Funciones:
  - login(email, password) → Appwrite Account
  - logout() → deleteSession
  - getCurrentUser() → getAccount
  - updateProfile(name) → updateName
  - changePassword(old, new) → updatePassword
  - recoverPassword(email) → createRecovery
  - verifyEmail() → createVerification
```

### `loyaltyService.ts` (10KB)

```
Funciones:
  - getUserPoints(userId) → lee puntos de users collection
  - addPoints(userId, amount, reason) → incrementa puntos
  - getLoyaltyLevel(points) → calcula nivel (Bronze/Silver/Gold/Platinum/Diamond)
  - redeemPoints(userId, itemId) → canjea puntos por item
  - getWelcomeGift(userId) → verifica/regala regalo bienvenida
  - getLevelBenefits(levelId) → beneficios por nivel

Niveles:
  0-499: Bronze
  500-1999: Silver
  2000-4999: Gold
  5000-9999: Platinum
  10000+: Diamond
```

### `notificationService.ts` (8KB)

```
Funciones:
  - sendToUser(userId, title, message, type) → notificación individual
  - broadcast(title, message, type) → notificación a todos
  - markAsRead(notificationId) → marca como leída
  - getUserNotifications(userId) → lista notificaciones
  - registerFCMToken(userId, token) → registro push
  - sendPushNotification(token, title, body) → FCM push

Tipos: info, success, warning, error, promo, order
```

### `pointsStoreService.ts` (4KB)

```
Funciones:
  - getItems() → lista items tienda puntos
  - createItem(data) → crea item
  - updateItem(id, data) → actualiza item
  - deleteItem(id) → elimina item
  - redeemItem(userId, itemId) → canjea puntos por item
```

---

## Librerías (`src/lib/`)

### `appwrite.ts` (5KB) — Config + Helpers

```
Exporta:
  - getServices() → { client, databases, account, storage }
  - getAppwriteConfig() → { endpoint, projectId, databaseId }
  - Collection constants (22)
  - Storage helpers (MEDIA_BUCKET_ID, MEDIA_PREFIXES, getMediaUrl)
  - getNextOrderIndex() → secuencias auto-increment
  - formatPrice(price) → formato CLP
  - ID, Query (re-export from appwrite)
```

### `appwrite-admin.ts` (4KB) — Admin Client

```
- Client con API key para operaciones server-side
- Permisos elevados: read/write any collection
- Usado en API routes y admin operations
```

### `appwrite-server.ts` (3KB) — Server-Side SDK

```
- Usa node-appwrite (server SDK)
- Para operaciones en API routes
- Diferente del client SDK (appwrite)
```

### `cache.ts` (4KB) — Caching Layer

```
- cached(key, ttl, fetcher) → cache en memoria con TTL
- TTL constants: SHORT (30s), MEDIUM (5min), LONG (15min), DAY (24h)
- Invalidación manual: invalidate(key)
- Usado para productos, categorías, banners
```

### `section-config.ts` (60KB) — Secciones Configurables

```
⚠️ ARCHIVO MUY GRANDE

Contiene:
  - SectionSettings interface (80+ campos)
  - Default configs por sección
  - 10 secciones configurables
  - Lógica de carga/guardado en Appwrite
  - Lógica de aplicación de estilos
  - Card design system
  - Favorite button design system
  - Banner de imagen config

Debería dividirse en:
  - types.ts (interfaces)
  - defaults.ts (valores default)
  - loader.ts (carga desde Appwrite)
  - saver.ts (guarda en Appwrite)
  - applier.ts (aplica estilos al DOM)
```

### `addresses.ts` (2KB) — Direcciones

```
- CRUD direcciones de envío
- Selección dirección principal
- Formateo para checkout
```

### `admin-access.ts` (0.3KB) — Verificación Admin

### `admin-customers.ts` (4KB) — Operaciones Clientes

### `aiAdmin.ts` (3KB) — AI Sidekick

### `apertura-promo.ts` (3KB) — Promo Inauguración

### `generateOrderPdf.ts` (7KB) — Generación PDF

```
- Genera PDF de orden usando canvas
- Datos: items, totales, dirección, estado
- Descarga como archivo
```

### `gradient-templates.ts` (9KB) — Gradientes CSS

```
- Templates de gradientes para cards, banners, backgrounds
- Generación dinámica de CSS
- Usado por section-config
```

### `home-header-avatar.ts` (6KB) — Avatar Header

```
- Renderiza avatar con badge de nivel
- Fallback a iniciales
- Diferentes tamaños
```

### `loyalty-levels.ts` (6KB) — Niveles Fidelidad

```
- Definición de niveles y beneficios
- Cálculo de progreso
- Colores y iconos por nivel
```

### `order-rules.ts` (0.5KB) — Reglas Pedidos

```
- Auto-cancel timeout
- Extension rules
- Payment proof requirements
```

### `product-features.ts` (3KB) — Features Producto

```
- Parse FEATURES string → array
- Feature icons mapping
- Feature display logic
```

### `product-images.ts` (2KB) — Imágenes Producto

```
- normalizeProductImages(product) → array de URLs
- getProductImageUrl(product, index) → URL específica
- resolveStorageImageUrl(url) → resuelve URL de Appwrite Storage
```

### `store-contact.ts` (0.7KB) — Contacto Tienda

```
- WhatsApp number
- Email
- Social links
```

### `tpl1-section-text.ts` (2KB) — Textos Sección

```
- Textos por defecto para secciones plantilla 1
- Reemplazo de textos en español
```

### `users-db.ts` (5KB) — Operaciones Usuarios

```
- CRUD usuarios en Appwrite
- Búsqueda por nombre/email/teléfono
- Filtros por rol/estado
- Admin notes
```

---

## Issues y Recomendaciones

1. **`section-config.ts` (60KB):** Dividir en 5+ archivos
2. **`usePageViewTracker`:** Colección `page_views` no existe, causa error 500
3. **Cache sin invalidación:** No hay invalidación automática cuando se modifican datos desde admin
4. **Sin tipado estricto en Appwrite:** Muchos `as any` casts por inconsistencia de tipos
5. **Servicios duplicados:** `authService.ts` y `useAuth.ts` hacen cosas similares
6. **Sin tests:** No hay archivos de test para ningún hook, servicio o librería
