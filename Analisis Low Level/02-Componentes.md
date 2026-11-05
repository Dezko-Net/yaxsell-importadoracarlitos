# Análisis Low Level — Componentes

## Inventario de Componentes (`src/components/`)

### Componentes Globales (Store Front)

| Componente | Archivo | Tamaño | Propósito |
|------------|---------|--------|-----------|
| `AnnouncementBar` | AnnouncementBar.tsx | 11KB | Barra de anuncios superior configurable |
| `AperturaDiscountBadge` | AperturaDiscountBadge.tsx | 1KB | Badge descuento promoción apertura |
| `AperturaPromoBanner` | AperturaPromoBanner.tsx | 3KB | Banner promocional apertura |
| `BackToTop` | BackToTop.tsx | 2KB | Botón volver arriba (fondo blanco, flecha rosa) |
| `BarcodeScanner` | BarcodeScanner.tsx | 9KB | Escáner código de barras (html5-qrcode) |
| `BenefitActionLink` | BenefitActionLink.tsx | 2KB | Link acción beneficio (loyalty) |
| `CartDrawer` | CartDrawer.tsx | 7KB | Drawer lateral del carrito |
| `CartLineRow` | CartLineRow.tsx | 4KB | Fila de item en carrito |
| `ChatBot` | ChatBot.tsx | 18KB | Chatbot integrado |
| `CookieConsent` | CookieConsent.tsx | 3KB | Banner consentimiento cookies |
| `CountdownTimer` | CountdownTimer.tsx | 3KB | Timer cuenta regresiva |
| `CouponBanner` | CouponBanner.tsx | 53KB | **MUY GRANDE** — Banner cupones con lógica compleja |
| `DynamicHomePage` | DynamicHomePage.tsx | 0.7KB | Router de plantillas homepage |
| `DynamicNavbar` | DynamicNavbar.tsx | 0.6KB | Router de plantillas navbar |
| `DynamicProductDetail` | DynamicProductDetail.tsx | 0.8KB | Router de plantillas product detail |
| `FavoriteButton` | FavoriteButton.tsx | 5KB | Botón favorito con animación |
| `HeroSkeletonMobile` | HeroSkeletonMobile.tsx | 3KB | Skeleton loader hero banner mobile |
| `HomeOnlyWidgets` | HomeOnlyWidgets.tsx | 0.3KB | Widgets solo homepage (FAB, raffle) |
| `ImageZoom` | ImageZoom.tsx | 1KB | Zoom de imagen |
| `InaugurationBanner` | InaugurationBanner.tsx | 8KB | Banner inauguración |
| `LoyaltyLevel` | LoyaltyLevel.tsx | 46KB | **MUY GRANDE** — Sistema niveles fidelidad |
| `LoyaltyPoints` | LoyaltyPoints.tsx | 24KB | Sistema puntos fidelidad |
| `MaintenanceGuard` | MaintenanceGuard.tsx | 3KB | Guard modo mantenimiento |
| `NavAvatarWithBadge` | NavAvatarWithBadge.tsx | 3KB | Avatar navbar con badge nivel |
| `Navbar` | Navbar.tsx | 2KB | Navbar genérico fallback |
| `NewsletterSignup` | NewsletterSignup.tsx | 3KB | Formulario newsletter |
| `NotificationsOverlay` | NotificationsOverlay.tsx | 9KB | Overlay notificaciones |
| `PageViewTracker` | PageViewTracker.tsx | 0.2KB | Wrapper hook tracking |
| `ProductBadges` | ProductBadges.tsx | 2KB | Badges producto (nuevo, oferta) |
| `ProductCardPreview` | ProductCardPreview.tsx | 7KB | Preview card producto |
| `ProductLocator` | ProductLocator.tsx | 34KB | **MUY GRANDE** — Localizador producto en tienda física |
| `ProductQuestions` | ProductQuestions.tsx | 7KB | Preguntas y respuestas producto |
| `ProductSkeleton` | ProductSkeleton.tsx | 1KB | Skeleton loader productos |
| `ProductTabs` | ProductTabs.tsx | 2KB | Tabs producto (descripción, reviews) |
| `QuickView` | QuickView.tsx | 15KB | Vista rápida producto modal |
| `RaffleWidget` | RaffleWidget.tsx | 11KB | Widget sorteo en vivo |
| `RecentlyViewed` | RecentlyViewed.tsx | 4KB | Productos vistos recientemente |
| `ReviewSection` | ReviewSection.tsx | 15KB | Sección de reviews |
| `ScrollToTop` | ScrollToTop.tsx | 0.3KB | Scroll al top en navegación |
| `SearchOverlay` | SearchOverlay.tsx | 9KB | Overlay búsqueda |
| `ServiceWorkerRegister` | ServiceWorkerRegister.tsx | 3KB | Registro SW para PWA |
| `ShareButton` | ShareButton.tsx | 6KB | Compartir (WhatsApp, FB, Twitter, copy) |
| `SmartCards` | SmartCards.tsx | 15KB | Cards inteligentes |
| `StockIndicator` | StockIndicator.tsx | 2KB | Barra visual urgencia stock |
| `StoreShell` | StoreShell.tsx | 3KB | Shell principal (navbar + footer) |
| `Toast` | Toast.tsx | 6KB | Sistema de toasts |
| `UpdateNotifier` | UpdateNotifier.tsx | 3KB | Notificador nueva versión SW |
| `WelcomeGiftSuccess` | WelcomeGiftSuccess.tsx | 5KB | Pantalla regalo bienvenida |
| `WhatsAppButton` | WhatsAppButton.tsx | 3KB | Botón flotante WhatsApp |

### Componentes Admin

| Componente | Archivo | Tamaño | Propósito |
|------------|---------|--------|-----------|
| `AISidekick` | admin/AISidekick.tsx | 21KB | Chat AI asistente admin |
| `AdminRouteGuard` | admin/AdminRouteGuard.tsx | 1KB | Guard rutas admin |
| `GlobalSearch` | admin/GlobalSearch.tsx | 11KB | Búsqueda global admin |
| `ImageUploadField` | admin/ImageUploadField.tsx | 3KB | Upload imagen a Appwrite Storage |

### Componentes Cuenta

| Componente | Archivo | Tamaño |
|------------|---------|--------|
| `CuentaPageShell` | cuenta/CuentaPageShell.tsx | 2KB |

### Componentes Inventario

| Componente | Archivo | Tamaño |
|------------|---------|--------|
| `ScanWizardModal` | inventario/ScanWizardModal.tsx | 13KB |

---

## Componentes Problemáticos (Tamaño Excesivo)

| Componente | Tamaño | Problema |
|------------|--------|----------|
| `CouponBanner` | **53KB** | Lógica de cupones + UI + estado todo en un archivo |
| `LoyaltyLevel` | **46KB** | Sistema completo niveles en un solo componente |
| `ProductLocator` | **34KB** | Mapa + lógica + UI sin separar |
| `LoyaltyPoints` | **24KB** | Demasiada responsabilidad |
| `AISidekick` | **21KB** | Chat AI completo sin modularizar |
| `ChatBot` | **18KB** | Similar, sin separar lógica de UI |

**Recomendación:** Extraer lógica de negocio a hooks/services, mantener componentes UI < 10KB.

---

## Flujo de Datos por Componente

### Carrito
```
CartContext (provider)
  ├── CartDrawer (UI drawer)
  │     └── CartLineRow (fila item)
  └── useCartItemPrice (hook precio)
```

### Fidelidad
```
loyaltyService (service)
  ├── LoyaltyLevel (UI niveles)
  ├── LoyaltyPoints (UI puntos)
  └── BenefitActionLink (link acción)
```

### Producto
```
ProductCardPreview (card)
  ├── ProductBadges (badges)
  ├── FavoriteButton (fav)
  ├── StockIndicator (stock bar)
  └── QuickView (modal preview)
```

### Tracking
```
PageViewTracker (wrapper)
  └── usePageViewTracker (hook)
        └── Appwrite page_views collection
```
