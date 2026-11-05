# Análisis Low Level — Flujos de Datos y Estado

## Diagrama de Estado Global

```
┌─────────────────────────────────────────────────────────┐
│                    Root Layout                          │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │
│  │ AuthProv  │  │ ToastProv│  │ NotificationProv │     │
│  │          │  │          │  │                  │     │
│  │ user     │  │ toasts[] │  │ notifications[]  │     │
│  │ isLogged │  │ addToast │  │ unread           │     │
│  │ login    │  │ remove   │  │ markRead         │     │
│  │ logout   │  │          │  │                  │     │
│  └────┬─────┘  └──────────┘  └──────────────────┘     │
│       │                                                 │
│  ┌────▼─────┐  ┌──────────────┐  ┌──────────────┐     │
│  │FavProv   │  │ CartProvider │  │TemplateProv  │     │
│  │          │  │              │  │              │     │
│  │ favs[]   │  │ items[]      │  │ template:1-4 │     │
│  │ toggle   │  │ add/remove   │  │ isLoading    │     │
│  │ isFav    │  │ updateQty    │  │              │     │
│  └──────────┘  │ coupon       │  └──────┬───────┘     │
│                │ total        │         │              │
│                └──────────────┘         │              │
│                                         ▼              │
│                              data-template="N"         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                  StoreShell                      │   │
│  │  ┌─────────────┐  ┌───────────────────────┐     │   │
│  │  │DynamicNavbar│  │     <main>            │     │   │
│  │  │ (template)  │  │   {children}          │     │   │
│  │  └─────────────┘  └───────────────────────┘     │   │
│  │  ┌─────────────────────────────────────────┐     │   │
│  │  │            Footer (condicional)          │     │   │
│  │  └─────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Flujo: Carga de Homepage

```
1. Usuario navega a /
2. Root Layout renderiza providers
3. TemplateProvider → fetch /api/template
4. Server route lee sequences collection → { template: N }
5. TemplateProvider set template = N
6. page.tsx renderiza DynamicHomePage
7. DynamicHomePage → switch(N) → HomePageN
8. HomePageN carga datos desde Appwrite:
   a. cached('banners', TTL.SHORT, fetchBanners)
   b. cached('products_featured', TTL.MEDIUM, fetchFeatured)
   c. cached('categories', TTL.LONG, fetchCategories)
   d. cached('timed_offers', TTL.SHORT, fetchOffers)
9. GSAP + ScrollTrigger inicializan animaciones
10. PageViewTracker registra visita
```

---

## Flujo: Carrito → Checkout → Pedido

```
                    ┌─────────────┐
                    │  ProductCard │
                    │  "Agregar"   │
                    └──────┬──────┘
                           │ addToCart(product, qty)
                           ▼
                    ┌─────────────┐
                    │ CartContext  │
                    │ items[]      │
                    │ coupon       │
                    │ total        │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │CartDrawer│ │ /carrito  │ │CartBadge  │
        │(sidebar) │ │(página)  │ │(navbar)   │
        └──────────┘ └─────┬────┘ └──────────┘
                           │ "Ir a pagar"
                           ▼
                    ┌─────────────┐
                    │  /checkout  │
                    │             │
                    │ 1. Dirección│
                    │ 2. Pago     │
                    │ 3. Envío    │
                    │ 4. Notas    │
                    │ 5. Regalo   │
                    └──────┬──────┘
                           │ submitOrder()
                           ▼
                    ┌─────────────────┐
                    │ Appwrite orders │
                    │                  │
                    │ getNextOrderIndex()
                    │ createDocument() │
                    │ STATUS: pending  │
                    └──────┬──────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │/pedido-confirmado│
                    │ ORDERCODE: #001  │
                    └──────────────────┘
```

---

## Flujo: Autenticación

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│ /login   │────▶│ useAuth  │────▶│ Appwrite     │
│          │     │          │     │ Account      │
│ email    │     │ login()  │     │ createSession│
│ password │     │ register()│    │ createAccount│
│          │     │ logout() │     │ deleteSession│
└──────────┘     └────┬─────┘     └──────────────┘
                      │
                      ▼
              ┌──────────────┐
              │ user object  │
              │ $id          │
              │ email        │
              │ name         │
              └──────┬───────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │Favorites │ │ Orders   │ │ Reviews  │
  │Context   │ │ (user)   │ │ (user)   │
  └──────────┘ └──────────┘ └──────────┘
```

---

## Flujo: Template Switching

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Admin Panel  │────▶│ /api/template│────▶│ Appwrite     │
│ theme-editor │     │ POST         │     │ sequences    │
│              │     │ {template:N} │     │ key:store_   │
│              │     │              │     │   template   │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │TemplateProv  │
                    │ re-fetch     │
                    │ template=N   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │Dynamic   │ │Dynamic   │ │CSS       │
        │Navbar    │ │HomePage  │ │data-attr │
        │switch(N) │ │switch(N) │ │="N"      │
        └──────────┘ └──────────┘ └──────────┘
```

---

## Flujo: Secciones Configurables

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Admin        │────▶│section-config│────▶│ Appwrite     │
│ /sections    │     │ save()       │     │ theme_config │
│              │     │              │     │              │
│ Toggle on/off│     │ applyStyles()│     │ JSON config  │
│ Reorder      │     │              │     │ per section  │
│ Settings     │     │              │     │              │
└──────────────┘     └──────┬───────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ HomePage.tsx │
                    │ sec() wrapper│
                    │              │
                    │ if section   │
                    │   visible →  │
                    │   render     │
                    │ else → null  │
                    └──────────────┘
```

---

## Flujo: Fidelidad (Loyalty)

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Compra   │────▶│loyaltyService│────▶│ users coll.  │
│ completada│    │ addPoints()  │     │ POINTS += N  │
└──────────┘     └──────┬───────┘     └──────────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ loyalty-levels.ts │
              │                  │
              │ 0-499: Bronze    │
              │ 500-1999: Silver │
              │ 2000-4999: Gold  │
              │ 5000-9999: Plat  │
              │ 10000+: Diamond  │
              └────────┬─────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │LoyaltyLv │  │LoyaltyPts│  │Benefits  │
  │Component │  │Component │  │Actions   │
  │(UI nivel)│  │(UI pts)  │  │(Links)   │
  └──────────┘  └──────────┘  └──────────┘
```

---

## Flujo: Hotspot Collage (Plantilla 2)

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│ Admin        │────▶│ hotspot-banners  │────▶│ hotspot_     │
│ /admin/      │     │ page.tsx         │     │ panels       │
│ hotspot-     │     │                  │     │ collection   │
│ banners      │     │ Layout presets   │     │              │
│              │     │ A/B/C/D          │     │ IMAGEURL     │
│ Asignar img  │     │                  │     │ CELLINDEX    │
│ Asignar prod │     │ Click celda →    │     │ MOSAICGROUP  │
│              │     │ place hotspot    │     │              │
└──────────────┘     └──────────────────┘     └──────┬───────┘
                                                       │
                                                      ▼
                                             ┌──────────────────┐
                                             │banner_overlay_   │
                                             │positions         │
                                             │                  │
                                             │ BANNERID=panel.$id
                                             │ PRODUCTID        │
                                             │ POSITIONX/Y      │
                                             │ SCALE            │
                                             │ CIRCLECOLOR      │
                                             └──────────────────┘
```

---

## Persistencia de Estado

| Dato | Mecanismo | TTL | Invalidación |
|------|-----------|-----|-------------|
| Template ID | API route → Appwrite | No-cache | Admin POST |
| Section config | Appwrite `theme_config` + localStorage | TTL.MEDIUM (5min) | Admin save |
| Products | `cached()` en memoria | TTL.MEDIUM (5min) | ❌ Ninguna |
| Categories | `cached()` en memoria | TTL.LONG (15min) | ❌ Ninguna |
| Banners | `cached()` en memoria | TTL.SHORT (30s) | ❌ Ninguna |
| Cart | React Context + localStorage | Persistente | Add/remove |
| Favorites | Appwrite `favorites` + Context | Tiempo real | Toggle |
| Auth session | Appwrite Account SDK | Persistente | Login/logout |
| User points | Appwrite `users` | On-demand | Compra/canje |
| Page views | Appwrite `page_views` | ❌ No existe | N/A |

---

## Comunicación entre Componentes

### Context (bidireccional)
- `useCart()` → add, remove, update, apply coupon
- `useFavorites()` → toggle, isFavorite
- `useAuth()` → login, logout, user data
- `useTemplate()` → template ID, isLoading

### Props (unidireccional)
- `StoreShell` → `children` (pages)
- `DynamicNavbar` → template switch
- `DynamicHomePage` → template switch

### DOM Events (plantilla 1)
- `CustomEvent('scroll-to-reviews')` → click stars → scroll
- `window.dispatchEvent` → comunicación entre secciones GSAP

### URL Params
- `?_tpl=N` → override template (theme editor iframe)
- `?q=search` → búsqueda productos

### Appwrite Realtime
- `notificationService` → subscribe a cambios en notifications
- No se usa para otros datos (products, orders, etc.)
