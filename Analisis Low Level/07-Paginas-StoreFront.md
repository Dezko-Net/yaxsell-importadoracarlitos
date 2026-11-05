# Análisis Low Level — Páginas Store Front

## Rutas Públicas (`src/app/`)

### `/` — Homepage (`page.tsx` — 18KB)

**Renderiza:** `DynamicHomePage` según template activo

Contiene lógica de fallback (si no hay template):
- Hero carousel con banners
- Ofertas con countdown timer
- Categorías grid
- Productos destacados
- Grid de productos

**NOTA:** La mayoría del contenido real se renderiza dentro de las plantillas (HomePage1/2/3/4). Este page.tsx es un fallback.

---

### `/productos` — Tienda (`productos/`)

| Archivo | Propósito |
|---------|-----------|
| `page.tsx` | Server component, carga productos |
| `ProductosInner.tsx` | Client component, grid + filtros + búsqueda |

**Features:**
- Grid de productos con infinite scroll
- Filtros por categoría, subcategoría, precio
- Búsqueda por nombre
- Sort por nombre, precio, popularidad
- ProductSkeleton loader
- FAB mobile

---

### `/catalogo` — Catálogo (`catalogo/page.tsx`)

**Features:**
- Grid de categorías con imágenes
- Filtro por subcategorías
- Cards con estilo catálogo (precios verdes para packaging)

---

### `/llegan-pronto` — Coming Soon (`llegan-pronto/page.tsx`)

**Features:**
- Productos con `COMING_SOON = true`
- Cards con badge "Próximamente"
- Botón "Notificarme" (stock_alerts)
- Skeleton loader

---

### `/producto/[slug]` — Detalle Producto

**Renderiza:** `DynamicProductDetail` según template

**Features (común):**
- Galería de imágenes con zoom
- Tabs (descripción, reviews, preguntas)
- StockIndicator (barra urgencia)
- FavoriteButton
- ShareButton (WhatsApp, FB, Twitter, Copy)
- ProductQuestions
- ReviewSection
- JSON-LD structured data
- Keyboard navigation (← →) en galería
- Click en rating stars → scroll a Reviews tab

---

### `/carrito` — Carrito (`carrito/page.tsx`)

**Features:**
- CartDrawer como página completa
- Cupón de descuento input
- Resumen de totales
- Botón checkout

---

### `/checkout` — Checkout (`checkout/`)

**Features:**
- Formulario de dirección (Región/Comuna select)
- Selección método de pago
- Selección agencia de envío
- Resumen de orden
- Cupón descuento
- Notas del cliente
- Opción regalo
- Generación PDF orden

---

### `/cuenta` — Cuenta de Usuario (`cuenta/`)

| Sub-ruta | Propósito |
|----------|-----------|
| `/cuenta/perfil` | Datos del perfil |
| `/cuenta/pedidos` | Historial de pedidos |
| `/cuenta/direcciones` | Direcciones guardadas |
| `/cuenta/favoritos` | Productos favoritos |
| `/cuenta/notificaciones` | Notificaciones |
| `/cuenta/tickets` | Tickets de soporte |
| `/cuenta/puntos` | Puntos de fidelidad |
| `/cuenta/nivel` | Nivel de fidelidad |

**Shell:** `CuentaPageShell` con sidebar navigation

---

### `/favoritos` — Favoritos (`favoritos/page.tsx`)

**Features:**
- Grid de productos favoritos
- Empty state mejorado
- Remove from favorites

---

### `/ofertas` — Ofertas (`ofertas/page.tsx`)

**Features:**
- Productos con CURRENTPRICE < PRICE
- Countdown timer para timed offers
- Filtro por categoría

---

### `/clips` — Video Clips (`clips/page.tsx`)

**Features:**
- Grid de clips con thumbnails
- Video player inline
- Link a producto asociado

---

### `/comparar` — Comparar (`comparar/page.tsx`)

**Features:**
- Comparar hasta 4 productos lado a lado
- Tabla de características

---

### `/mayorista` — Registro Mayorista (`mayorista/page.tsx`)

**Features:**
- Formulario de registro mayorista
- Información de beneficios

---

### `/login` — Autenticación (`login/`)

**Features:**
- Login email/contraseña
- Registro
- Recuperar contraseña
- Verificación email

---

### `/pedido/[code]` — Seguimiento Pedido

**Features:**
- Timeline de estados
- Detalle de items
- Dirección de envío
- Upload comprobante de pago

---

### `/pedido-confirmado` — Confirmación

**Features:**
- Pantalla de confirmación post-checkout
- Código de pedido
- Resumen

---

### `/lista` — Lista de Deseos (alias favoritos)

---

### `/configurar` — Configuración Inicial

---

### `/inventario` — Inventario Público (scan)

---

### `/clientes` — Portal Clientes

---

## Páginas 404 (`not-found.tsx`)

- Diseño personalizado con ilustración
- Links a homepage, productos, contacto
- Animación sutil

---

## API Routes Públicas

| Ruta | Método | Propósito |
|------|--------|-----------|
| `/api/template` | GET/POST | Template activo |
| `/api/theme-config` | GET/POST | Config secciones |
| `/api/products` | GET | Búsqueda productos |
| `/api/geo` | GET | Geolocalización IP |
| `/api/notifications` | POST | Push notifications |
| `/api/product-votes` | POST | Votar producto |
| `/api/ai-sidekick` | POST | Chat AI |
| `/api/version` | GET | Versión deploy |
| `/api/init-theme-config` | POST | Inicializar config |

---

## Flujo de Checkout Completo

```
1. /carrito → Ver items, aplicar cupón
2. /checkout → 
   a. Seleccionar/crear dirección (Región + Comuna + Calle + Info)
   b. Seleccionar método de pago (transferencia, efectivo)
   c. Seleccionar agencia de envío
   d. Notas del cliente + opción regalo
   e. Revisar totales (subtotal + envío - descuento)
3. Crear orden en Appwrite:
   a. getNextOrderIndex() → ORDERCODE
   b. Crear documento en orders collection
   c. Vaciar carrito
4. /pedido-confirmado → Mostrar código
5. /pedido/[code] → Seguimiento:
   a. Upload comprobante de pago → Appwrite Storage
   b. Admin cambia STATUS → timeline actualiza
   c. Upload comprobante de envío → Appwrite Storage
   d. STATUS: pending → paid → processing → shipped → delivered
```

---

## Flujos de Engagement

### Fidelidad
```
Compra → addPoints(userId, amount) → Nivel sube → Beneficios desbloqueados
Canje → redeemPoints(userId, itemId) → Puntos bajan → Item entregado
```

### Live Shopping
```
Admin crea stream → /admin/live → Activa "live"
Tienda muestra banner "EN VIVO" → / → Click → Player embebido
Productos pinned → Rotación automática → Descuento live
```

### Sorteos
```
Admin crea sorteo → /admin/raffles → Activa
Usuarios participan → RaffleWidget → PARTICIPANTS array
Admin sortea → WINNERID seleccionado → Notificación al ganador
```
