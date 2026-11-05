# Análisis Low Level — Admin Panel

## Estructura

```
src/app/admin/
├── layout.tsx              # Layout admin (sin navbar store)
├── page.tsx                # Redirect a /admin/dashboard
├── login/                  # Login admin
├── configure/              # Config inicial Appwrite
├── theme-editor/           # Editor de tema visual
└── (panel)/                # Panel principal (route group)
    ├── layout.tsx          # 51KB — Sidebar + header + routing
    ├── dashboard/          # Dashboard con KPIs
    ├── products/           # CRUD productos
    ├── catalog-products/   # Alertas de stock
    ├── inventory/          # Inventario
    ├── categories/         # Categorías
    ├── subcategories/      # Subcategorías
    ├── banners/            # Banners hero
    ├── hotspot-banners/    # Collage interactivo
    ├── hotspot-banners-plantilla1/  # Collage plantilla 1
    ├── orders/             # Pedidos
    ├── coupons/            # Cupones
    ├── timed-offers/       # Ofertas con timer
    ├── users/              # Usuarios
    ├── wholesale/          # Solicitudes mayorista
    ├── wholesale-products/ # Productos mayorista
    ├── analytics/          # Analíticas
    ├── support/            # Tickets soporte
    ├── notifications/      # Notificaciones
    ├── live/               # Live streams
    ├── reviews/            # Reviews
    ├── clips/              # Video clips
    ├── raffles/            # Sorteos
    ├── points-store/       # Tienda de puntos
    ├── product-votes/      # Votación productos
    ├── engagement/         # Engagement
    ├── vip/                # VIP
    ├── agencias/           # Agencias envío
    ├── apertura/           # Promo apertura
    ├── pagos/              # Pagos
    ├── questions/          # Preguntas
    ├── sections/           # Editor secciones
    ├── sections-custom/    # Editor secciones avanzado
    ├── settings/           # Config Appwrite
    └── store-settings/     # Config tienda
```

---

## Admin Layout (`src/app/admin/(panel)/layout.tsx` — 51KB)

### Sidebar

El sidebar define grupos de navegación:

| Grupo | Items |
|-------|-------|
| **General** | Dashboard, Analíticas |
| **Catálogo** | Productos, Inventario, Categorías, Subcategorías, Banners, Collage Interactivo, Sala Interactiva, Editor Secciones |
| **Ventas** | Pedidos, Cupones, Ofertas con Timer, Pagos |
| **Contenido** | Live Streams, Clips, Sorteos, Votación Productos, Preguntas |
| **Clientes** | Usuarios, Mayorista, VIP, Tienda Puntos, Soporte |
| **Configuración** | Config Appwrite, Config Tienda, Promo Apertura, Agencias, Tema Visual |

### Autenticación

- `AdminRouteGuard` verifica acceso admin
- Login via Appwrite Account
- Credenciales admin en localStorage: `yaxsel_appwrite_config`

---

## Páginas Admin — Análisis Detallado

### Dashboard (`dashboard/page.tsx`)

- KPIs: total productos, pedidos pendientes, ingresos, pedidos hoy
- Revenue chart (14 días, CSS puro con tooltips)
- Top 6 productos vendidos (progress bars)
- Quick actions (pedidos pendientes, stock bajo)
- Auto-refresh 60s

### Products (`products/page.tsx`)

- CRUD completo con ImageUploadField (5 imágenes)
- Duplicate product
- Discount badge (CURRENTPRICE)
- Filtros: stock (all/low/out), sort (NAME/PRICE/STOCK/SOLDQUANTITY)
- Búsqueda por tags/descripción
- Bulk price update modal (% o monto fijo)
- CSV export

### Catalog Products (`catalog-products/page.tsx`)

- Stock alerts agrupados por usuario
- Procesamiento de alertas (notificar cuando hay stock)
- Input de stock para actualizar

### Inventory (`inventory/page.tsx`)

- Inline stock editing
- Value summary (total unidades, valor venta, valor costo)
- Summary cards clickables (agotados/críticos/bajo/normal)
- CSV export
- ScanWizardModal para escáner código barras

### Orders (`orders/page.tsx`)

- Filtros estado + fecha (7d/30d/90d)
- Búsqueda por código/nombre/RUT/teléfono
- Bulk select + bulk status update
- Footer totals (count + sum)
- Columnas ordenables
- CSV export

### Categories (`categories/page.tsx`)

- ↑↓ reordenamiento con persistencia backend
- Conteo productos por categoría (badge)
- ImageUploadField para ícono

### Banners (`banners/page.tsx`)

- ↑↓ reordenamiento
- Toggle activo/inactivo inline
- Preview imagen
- ImageUploadField

### Hotspot Banners (`hotspot-banners/page.tsx`)

- 4 layout presets: A(3 cols), B(1 grande+2), C(2×2), D(1+3)
- Selecciona celda → asigna imagen + título + link
- Selecciona producto → clic en celda para hotspot
- Usa `hotspot_panels` + `banner_overlay_positions`

### Coupons (`coupons/page.tsx`)

- CRUD + toggle activo/inactivo
- Búsqueda por código
- Duplicate coupon (genera nuevo código)
- Usage progress bar
- Status: activo/inactivo/expirado/agotado

### Timed Offers (`timed-offers/page.tsx`)

- Búsqueda por producto
- Filtro estado: todas/activas/pausadas/expiradas
- Countdown timer display

### Users (`users/page.tsx`)

- Búsqueda por nombre/email/teléfono/región
- Filtro "Solo mayoristas"
- Internal admin notes por usuario (modal)
- CSV export

### Analytics (`analytics/page.tsx`)

- KPIs: ingresos, pedidos, ticket promedio, tasa conversión
- Revenue chart diario
- Distribución por estado
- Top regiones por ingresos
- Top productos vendidos
- Category revenue breakdown
- Payment methods breakdown

### Support (`support/page.tsx`)

- Búsqueda por asunto
- Filtro estado (open/in_progress/closed) con summary cards
- Admin notes inline
- Cambiar estado por ticket

### Wholesale (`wholesale/page.tsx`)

- Admin notes inline
- Modal de rechazo con razón
- Filtros + búsqueda

### Live (`live/page.tsx`)

- Streams live aparecen primero
- Contador total viewers
- Copy URL, toggle live, edit, delete

### Sections Editor (`sections/page.tsx`)

- Editor visual con drag & drop
- Toggle secciones on/off
- Settings por sección (colores, tipografía, espaciado)
- Persistencia en Appwrite `theme_config`

### Settings (`settings/page.tsx`)

- Verificador de 14 colecciones + buckets con latencia
- Copy config + reset config
- Session info

---

## Servicios Admin

### `src/services/authService.ts` (11KB)

- Login/logout Appwrite
- Session management
- Password recovery
- Admin role verification

### `src/services/loyaltyService.ts` (10KB)

- Puntos por compra
- Niveles de fidelidad
- Tienda de puntos (canje)
- Welcome gift

### `src/services/notificationService.ts` (8KB)

- Push notifications (FCM)
- In-app notifications
- Broadcast a todos los usuarios

### `src/services/pointsStoreService.ts` (4KB)

- CRUD items tienda de puntos
- Canje de puntos

---

## Librerías Admin

### `src/lib/appwrite-admin.ts` (4KB)

- Client admin con API key para operaciones server-side
- Permisos elevados para CRUD sin restricciones

### `src/lib/admin-access.ts` (0.3KB)

- Verificación de acceso admin

### `src/lib/admin-customers.ts` (4KB)

- Operaciones CRUD sobre clientes
- Búsqueda y filtros

### `src/lib/aiAdmin.ts` (3KB)

- Integración AI para asistente admin
- Chat sidekick

---

## Issues Conocidos Admin

1. **Layout 51KB:** El layout del panel es monolítico, contiene sidebar, header, routing, y estilos inline
2. **API key en código:** La API key de Appwrite está hardcoded en varios archivos server-side
3. **Sin validación de permisos granular:** Cualquier usuario autenticado puede acceder a todas las páginas admin
4. **Sin paginación server-side:** Muchas listas cargan todos los documentos y filtran client-side
5. **CSV export client-side:** Se genera CSV en el navegador, no server-side
