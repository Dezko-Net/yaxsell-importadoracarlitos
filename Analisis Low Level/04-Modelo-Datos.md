# Análisis Low Level — Modelo de Datos (Appwrite)

## Configuración de Conexión

### Client-Side (`src/lib/appwrite.ts`)

```
1. Check localStorage 'yaxsel_appwrite_config' (admin)
2. Check localStorage 'appwrite_config' (store)
3. Fallback a .env.local:
   - NEXT_PUBLIC_APPWRITE_ENDPOINT
   - NEXT_PUBLIC_APPWRITE_PROJECT_ID
   - NEXT_PUBLIC_APPWRITE_DATABASE_ID
```

### Server-Side (`src/app/api/template/route.ts`)

- API key hardcoded con permisos completos
- Endpoint, Project ID, Database ID hardcoded
- **⚠️ RIESGO:** API key expuesta en código fuente (aunque solo corre server-side)

---

## Colecciones Appwrite (30)

### Catálogo

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `products` | `PRODUCTS_COLLECTION` | NAME, PRICE, CURRENTPRICE, STOCK, CATEGORYID, IMAGEURL-5, WHOLESALEPRICE, PACKQTY, COMING_SOON | Productos tienda |
| `categories` | `CATEGORIES_COLLECTION` | name, iconUrl, order, color, BACKGROUND_IMAGE_URL | Categorías |
| `subcategories` | `SUBCATEGORIES_COLLECTION` | name, categoryId, ICON_URL, COLOR, ORDER | Subcategorías |

### Ventas

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `orders` | `ORDERS_COLLECTION` | USERID, ITEMS(JSON), SHIPPINGADDRESS, TOTAL, ORDERCODE, STATUS, PAYMENTPROOFURL, SHIPPINGPROOFURL, COUPONCODE, DISCOUNT | Pedidos |
| `discount_coupons` | `COUPONS_COLLECTION` | code, type, value, isActive, maxUses, usedCount | Cupones descuento |
| `timed_offers` | `TIMED_OFFERS_COLLECTION` | title, offerType, targetId, discountPrice, timeType, durationHours, endDateTime, status | Ofertas con timer |

### Contenido

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `banners` | `BANNERS_COLLECTION` | TITLE, IMAGEURL, LINKURL, DURATION, ISACTIVE, DISPLAYORDER, CLICKS, VIEWS | Hero carousel |
| `hotspot_panels` | `HOTSPOT_PANELS_COLLECTION` | IMAGEURL, TITLE, LINKURL, MOSAICGROUP, CELLINDEX, ISACTIVE, DISPLAYORDER | Collage interactivo |
| `banner_overlay_positions` | `BANNER_OVERLAY_POSITIONS_COLLECTION` | BANNERID, PRODUCTID, POSITIONX, POSITIONY, SCALE, DISPLAYTYPE, CIRCLECOLOR | Hotspots en collage |
| `house_product_positions` | `HOUSE_PRODUCT_POSITIONS_COLLECTION` | PRODUCTID, CATEGORYID, POSITIONX, POSITIONY, SCALE, BACKGROUND, CIRCLECOLOR | Sala interactiva |

### Engagement

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `reviews` | `REVIEWS_COLLECTION` | PRODUCTID, USERID, USERNAME, RATING, COMMENT, CREATEDAT | Reviews productos |
| `favorites` | `FAVORITES_COLLECTION` | (por usuario) | Favoritos |
| `clips` | `CLIPS_COLLECTION` | TITLE, VIDEOURL, THUMBNAILURL, PRODUCTID, LIKES, VIEWS | Video clips |
| `product_votes` | `PRODUCT_VOTES_COLLECTION` | PRODUCTTITLE, USERID, USERNAME, IPADDRESS | Votación productos |
| `live_raffles` | `RAFFLES_COLLECTION` | TITLE, PRIZE, STATUS, PARTICIPANTS, WINNERID | Sorteos en vivo |
| `raffle_participants` | `RAFFLE_PARTICIPANTS_COLLECTION` | (por sorteo) | Participantes sorteo |

### Live Shopping

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `live_streams` | `LIVE_STREAMS_COLLECTION` | title, url, platform, status, productIds, pinnedProductId, viewerCount | Streams en vivo |
| `stock_alerts` | `STOCK_ALERTS_COLLECTION` | PRODUCTID, PRODUCTNAME, USERID, USERNAME, EMAIL, STATUS, NOTIFIED | Alertas de stock |

### Usuarios

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `users` | `USERS_COLLECTION` | (datos usuario) | Perfiles |
| `addresses` | — | (direcciones) | Direcciones envío |
| `wholesale_requests` | — | (solicitud mayorista) | Registro mayorista |

### Config

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `sequences` | `SEQUENCES_COLLECTION` | key, value | Contadores (order_sequence, store_template) |
| `theme_config` | `THEME_CONFIG_COLLECTION` | (config secciones) | Config plantillas |
| `apertura_settings` | `APERTURA_SETTINGS_COLLECTION` | (config promoción) | Promo inauguración |
| `notifications` | `NOTIFICATIONS_COLLECTION` | title, message, type, userId, isRead | Notificaciones |

### Operaciones

| Colección | Constante | Atributos Clave | Uso |
|-----------|-----------|------------------|-----|
| `stock_movements` | — | productId, type, quantity, reason | Movimientos stock |
| `order_status_history` | — | (historial estados) | Timeline pedido |
| `fcm_tokens` | — | (tokens push) | Notificaciones push |
| `points_store_items` | `POINTS_STORE_COLLECTION` | (items tienda puntos) | Tienda de puntos |
| `support_tickets` | — | userId, subject, message, status, priority, adminNotes | Tickets soporte |

---

## Storage Bucket

### Bucket Único: `media`

Organizado por prefijos:

| Prefijo | Constante | Uso |
|---------|-----------|-----|
| `products/` | `MEDIA_PREFIXES.products` | Imágenes producto |
| `banners/` | `MEDIA_PREFIXES.banners` | Imágenes banners |
| `categories/` | `MEDIA_PREFIXES.categories` | Íconos categorías |
| `comprobantes/` | `MEDIA_PREFIXES.comprobantes` | Comprobantes pago/envío |
| `thumbnails/` | `MEDIA_PREFIXES.thumbnails` | Thumbnails live streams |

**Backward compatibility:**
```typescript
export const COMPROBANTES_BUCKET = MEDIA_BUCKET_ID;  // 'media'
export const USER_PHOTOS_BUCKET = MEDIA_BUCKET_ID;    // 'media'
```

### URL Builder

```typescript
getMediaUrl(fileId, prefix?) → `${endpoint}/storage/buckets/media/files/${prefix?+fileId}/view?project=${projectId}`
```

---

## Tipos TypeScript

### `src/types/index.ts` (9KB) — Store Front

Interfaces: Product, Review, Category, Subcategory, Banner, TimedOffer, Coupon, Order, OrderItem, CartItem, LiveStream, Raffle, Clip, HotspotPanel, BannerOverlayPosition, HouseProductPosition, ProductVote

Constantes: `CHILE_REGIONES` (16 regiones + comunas), `SHIPPING_AGENCIES` (6 agencias)

### `src/types/admin.ts` (4KB) — Admin

Interfaces: Order (admin), Product (admin), Category (admin), Subcategory (admin), Banner (admin), AdminNotification, TimedOffer (admin), SupportTicket, StockMovement, DashboardStats

### ⚠️ Duplicación de Tipos

`Product`, `Order`, `Category`, `Subcategory`, `Banner`, `TimedOffer` están definidos en **AMBOS** archivos con campos ligeramente diferentes. Ejemplo:

- `types/index.ts` → `Product.TAGS?: string[]` (array)
- `types/admin.ts` → `Product.TAGS?: string` (string)

Esto causa errores de tipo cuando se comparten datos entre store y admin.

---

## Convención de Nombres

### Appwrite: UPPERCASE

Todos los atributos de colecciones usan UPPERCASE:
```
NAME, PRICE, STOCK, IMAGEURL, CATEGORYID, CREATEDAT
```

### TypeScript: mixedCase

Los tipos de admin usan mixedCase para algunos campos:
```
iconUrl, order, color, createdAt, updatedAt
```

### ⚠️ Inconsistencia

- Colecciones Appwrite: `UPPERCASE`
- Types store (`index.ts`): mezcla UPPERCASE + camelCase
- Types admin (`admin.ts`): mezcla UPPERCASE + camelCase
- Categorías: `name` (camelCase) vs `NAME` (UPPERCASE)

---

## Relaciones entre Colecciones

```
products ──→ categories (CATEGORYID)
products ──→ subcategories (SUBCATEGORYID)
orders ──→ users (USERID)
orders ──→ discount_coupons (COUPONCODE)
reviews ──→ products (PRODUCTID)
reviews ──→ users (USERID)
favorites ──→ products + users
hotspot_panels ──→ banner_overlay_positions (BANNERID = panel.$id)
banner_overlay_positions ──→ products (PRODUCTID)
house_product_positions ──→ products (PRODUCTID)
house_product_positions ──→ categories (CATEGORYID)
stock_alerts ──→ products (PRODUCTID)
stock_alerts ──→ users (USERID)
live_raffles ──→ raffle_participants
live_streams ──→ products (productIds[])
clips ──→ products (PRODUCTID)
```

**NOTA:** No hay foreign keys en Appwrite. Las relaciones son por convención (string ID).
