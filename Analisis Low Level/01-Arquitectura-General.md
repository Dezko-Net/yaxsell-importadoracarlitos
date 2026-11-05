# Análisis Low Level — Arquitectura General

## Proyecto: Yaxsel Web Store

**Ubicación:** `C:\Proyectos\PROJECT YAXSEL\web-store\`
**Stack:** Next.js 15.5.18 + React 19 + TypeScript 5.9.3 + Tailwind CSS 3.4 + Appwrite SDK 16.0.2
**Dev server:** `localhost:3003`
**Deploy:** Netlify (via `netlify.toml`)

---

## 1. Estructura de Directorios

```
web-store/
├── src/
│   ├── app/                    # Next.js App Router (páginas + API routes)
│   │   ├── admin/(panel)/      # Panel admin (34 sub-páginas)
│   │   ├── api/                # API routes server-side
│   │   ├── carrito/            # Carrito
│   │   ├── catalogo/           # Catálogo de productos
│   │   ├── categoria/          # Vista por categoría
│   │   ├── checkout/           # Checkout
│   │   ├── cuenta/             # Cuenta de usuario
│   │   ├── favoritos/          # Favoritos
│   │   ├── llegan-pronto/      # Productos "coming soon"
│   │   ├── login/              # Autenticación
│   │   ├── mayorista/          # Registro mayorista
│   │   ├── ofertas/            # Ofertas con timer
│   │   ├── producto/           # Detalle producto
│   │   ├── productos/          # Tienda (lista)
│   │   ├── globals.css         # Estilos globales
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Homepage
│   │   └── not-found.tsx       # 404
│   ├── components/             # Componentes React
│   │   ├── admin/              # Admin-specific components
│   │   ├── cuenta/             # Cuenta-specific
│   │   ├── inventario/         # Inventario scan wizard
│   │   └── [50+ componentes]   # Globales
│   ├── context/                # React Context providers
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Utilidades, servicios, configuración
│   ├── services/               # Servicios de negocio
│   ├── templates/              # Sistema multi-plantilla
│   │   ├── plantilla1/         # Shopify-Venice (premium)
│   │   ├── plantilla2/         # MercadoLibre-style
│   │   ├── plantilla3/         # Minimal
│   │   └── plantilla4/         # Chinamart
│   └── types/                  # TypeScript interfaces
├── scripts/                    # Scripts Appwrite (setup, fix, dump)
├── public/                     # Assets estáticos
├── .env.local                  # Variables de entorno
├── next.config.ts              # Config Next.js
├── tailwind.config.js          # Config Tailwind
├── tsconfig.json               # Config TypeScript
└── netlify.toml                # Deploy config
```

---

## 2. Flujo de Renderizado

### Root Layout (`src/app/layout.tsx`)

```
<html lang="es">
  <body>
    <AuthProvider>
      <ToastProvider>
        <NotificationProvider>
          <FavoritesProvider>
            <CartProvider>
              <TemplateProvider>          ← carga template ID desde /api/template
                <StoreShell>              ← navbar + footer dinámicos
                  {children}              ← página actual
                </StoreShell>
                <HomeOnlyWidgets />       ← widgets solo en homepage
                <BackToTop />
                <CookieConsent />
                <ScrollToTop />
                <PageViewTracker />       ← tracking Appwrite
              </TemplateProvider>
            </CartProvider>
          </FavoritesProvider>
        </NotificationProvider>
      </ToastProvider>
    </AuthProvider>
  </body>
</html>
```

### Template Resolution

1. `TemplateProvider` → fetch `/api/template` → obtiene `template` ID (1-4)
2. `StoreShell` → renderiza `DynamicNavbar` según template
3. `DynamicNavbar` → switch template 1/2/3/4 → Navbar correspondiente
4. `page.tsx` → renderiza `DynamicHomePage` según template
5. `DynamicHomePage` → switch template 1/2/3/4 → HomePage correspondiente

### Template Data Attribute

`TemplateProvider` inyecta `data-template="{n}"` en un wrapper div. Todo el CSS de plantillas usa este atributo como selector:

```css
[data-template="1"] .some-class { /* estilos plantilla 1 */ }
```

---

## 3. Sistema Multi-Plantilla

| Plantilla | Nombre | Navbar | HomePage | ProductDetail | Características |
|-----------|--------|--------|----------|---------------|-----------------|
| 1 | Shopify-Venice | 60KB | 416KB | 50KB | HTML Shopify migrado, GSAP, Lottie, premium collections |
| 2 | MercadoLibre | 126KB | 222KB | 33KB | Grid estilo marketplace, hotspot collage, sala interactiva |
| 3 | Minimal | 5KB | 10KB | — | Layout limpio, sin dependencias pesadas |
| 4 | Chinamart | 0.2KB | 50KB | — | CSS masivo (43KB), estilo chino |

**NOTA:** Plantilla 1 y 2 son las más complejas. Plantilla 1 contiene HTML migrado desde un tema Shopify (Venice) con manipulación DOM directa.

---

## 4. Context Providers (Estado Global)

| Provider | Archivo | Propósito |
|----------|---------|-----------|
| `AuthProvider` | `hooks/useAuth.ts` | Sesión Appwrite, login/logout, user data |
| `CartProvider` | `context/CartContext.tsx` | Items del carrito, add/remove/update |
| `FavoritesProvider` | `context/FavoritesContext.tsx` | Productos favoritos (Appwrite) |
| `NotificationProvider` | `context/NotificationContext.tsx` | Notificaciones en tiempo real |
| `TemplateProvider` | `context/TemplateContext.tsx` | Template ID activo |

---

## 5. API Routes (Server-Side)

| Ruta | Propósito |
|------|-----------|
| `/api/template` | GET/POST template ID activo (usa API key Appwrite) |
| `/api/theme-config` | GET/POST configuración de secciones por template |
| `/api/products` | Proxy server-side para búsqueda productos |
| `/api/geo` | Geolocalización IP para tracking |
| `/api/notifications` | Push notifications |
| `/api/product-votes` | Votación de productos |
| `/api/ai-sidekick` | Chat AI para admin |
| `/api/admin/auth-users` | Lista usuarios (server key) |
| `/api/admin/customers` | Datos clientes (server key) |
| `/api/admin/apertura` | Config promociones apertura |
| `/api/admin/fix-schema` | Fix atributos Appwrite |
| `/api/init-theme-config` | Inicializar config de secciones |
| `/api/version` | Versión del deploy |

---

## 6. Configuración Appwrite

- **Endpoint:** `https://nyc.cloud.appwrite.io/v1`
- **Project ID:** `6a0a4e8d0032177f3f90`
- **Database ID:** `6a0a58ca001798410d86`
- **API Key:** Server key con permisos completos (hardcoded en `/api/template/route.ts`)
- **Auth:** Client-side SDK con `localStorage` fallback para config

### Colecciones (30)

products, categories, subcategories, banners, orders, users, notifications,
timed_offers, live_streams, support_tickets, sequences, stock_movements,
fcm_tokens, order_status_history, discount_coupons, points_store_items,
wholesale_requests, reviews, favorites, clips, live_raffles,
raffle_participants, stock_alerts, addresses, apertura_settings,
product_votes, banner_overlay_positions, house_product_positions,
hotspot_panels, theme_config

### Storage

- **Bucket único:** `media` con prefijos (products/, banners/, categories/, comprobantes/, thumbnails/)
- **Backward compat:** `COMPROBANTES_BUCKET` y `USER_PHOTOS_BUCKET` apuntan al mismo bucket

---

## 7. Dependencias Clave

| Categoría | Paquetes |
|-----------|----------|
| Framework | next, react, react-dom |
| Backend | appwrite, node-appwrite, firebase |
| Animación | gsap, framer-motion, lottie-web, lenis |
| 3D | three, @react-three/fiber, @react-three/drei, @react-three/postprocessing |
| Canvas | fabric, konva, react-konva |
| UI | lucide-react, @phosphor-icons/react |
| Partículas | @tsparticles/react, tsparticles-engine |
| Utilidades | xlsx, canvas-confetti, chroma-js, culori, color2k, split-type, flubber, html5-qrcode, granim |

**NOTA:** El proyecto tiene dependencias pesadas que podrían no usarse en todas las plantillas (Three.js, Fabric, Konva, tsparticles). Esto impacta el bundle size.
