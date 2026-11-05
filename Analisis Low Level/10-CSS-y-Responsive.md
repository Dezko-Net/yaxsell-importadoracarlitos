# Análisis Low Level — CSS y Responsive Design

## Estructura CSS

### Archivos CSS del Proyecto

| Archivo | Tamaño | Ubicación | Propósito |
|---------|--------|-----------|-----------|
| `globals.css` | 7KB | `src/app/` | Estilos globales (reset, fonts, utilities) |
| `theme.css` | 1KB | `templates/plantilla1/` | Variables tema P1 |
| `theme.css` | 1KB | `templates/plantilla2/` | Variables tema P2 |
| `theme.css` | 1KB | `templates/plantilla3/` | Variables tema P3 |
| `mobile-responsive.css` | **88KB** | `templates/plantilla1/` | Responsive P1 |
| `shopify-fix.css` | **70KB** | `templates/plantilla1/` | Fixes sobre HTML Shopify |
| `tpl1-collections-premium.css` | **20KB** | `templates/plantilla1/` | Sección colecciones P1 |
| `chinamart.css` | **43KB** | `templates/plantilla4/` | Estilos completos P4 |

**Total CSS:** ~232KB (sin Tailwind output)

---

## Carga de CSS

### Orden de importación (Plantilla 1)

```tsx
// HomePage.tsx
import './shopify-fix.css';           // 70KB — fixes sobre HTML Shopify
import './tpl1-collections-premium.css'; // 20KB — colecciones premium
import './mobile-responsive.css';      // 88KB — responsive mobile
```

**Problema:** Todos los CSS se cargan para todas las páginas, no hay code-splitting por ruta.

---

## Sistema de Selectores

### Selector Principal: `data-template`

Todo el CSS específico de plantilla usa este atributo:

```css
[data-template="1"] .some-class { /* plantilla 1 */ }
[data-template="2"] .some-class { /* plantilla 2 */ }
```

### Selectores con IDs Shopify (Plantilla 1)

```css
[data-template="1"] #shopify-section-template--22405132419320__collection_list_WrFbPe { }
[data-template="1"] #shopify-section-template--22405132419320__brand_logos_N9XpeF { }
[data-template="1"] #shopify-section-template--22405132419320__before_after_3VVXkq { }
[data-template="1"] #shopify-section-template--22405132419320__collection_tab_NGBXPp { }
```

**⚠️ Frágil:** Estos IDs son del tema Shopify original. Si se migra a otro tema, todo se rompe.

---

## Breakpoints

| Breakpoint | Uso |
|------------|-----|
| `max-width: 768px` | Mobile principal |
| `max-width: 480px` | Mobile pequeño |
| `min-width: 769px` | Desktop |
| `min-width: 1024px` | Desktop grande |

### Media Queries por Archivo

**`mobile-responsive.css`:**
- `@media screen and (max-width: 768px)` — la mayoría de reglas
- `@media screen and (max-width: 480px)` — ajustes extra pequeños

**`shopify-fix.css`:**
- `@media screen and (min-width: 769px)` — desktop overrides
- `@media screen and (max-width: 768px)` — mobile fixes

---

## Responsive: Componentes Clave

### Navbar Mobile (Plantilla 1)

```
Desktop: Top navbar (logo + search + cart + user)
Mobile:  Bottom nav (5 tabs + FAB central)
         FAB: "Explorar" con menú radial (Tienda/Catálogo/Llegan Pronto)
```

CSS específico:
```css
.tpl1-bottom-nav { display: none; }  /* hidden desktop */
@media (max-width: 768px) {
  .tpl1-bottom-nav { display: flex; }
}
```

### FAB Bubbles (Plantilla 1)

```css
.tpl1-fab-bubbles {
  position: absolute;
  bottom: calc(100% + 24px);  /* 24px arriba del FAB */
  left: 50%;
  transform: translateX(-50%);
  width: 280px; height: 160px;
}

/* Tienda — izquierda */
.tpl1-fab-bubble:nth-child(1) { left: 6px; bottom: 0; }

/* Catálogo — arriba centro */
.tpl1-fab-bubble:nth-child(2) { left: 50%; top: 0; }

/* Llegan Pronto — derecha */
.tpl1-fab-bubble:nth-child(3) { right: 6px; bottom: 0; }
```

### Colecciones Premium (Plantilla 1)

```css
/* Desktop */
.musk-collection-slide { aspect-ratio: 3 / 4; }

/* Mobile */
@media (max-width: 768px) {
  .musk-collection-slide { aspect-ratio: 4 / 5; }
  .swiper-slide { width: 78% !important; max-width: 300px; }
}
```

### Product Cards Mobile

```css
/* Grid responsive */
.tpl1-product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);  /* 2 cols mobile */
  gap: 12px;
}

@media (min-width: 769px) {
  .tpl1-product-grid {
    grid-template-columns: repeat(4, 1fr);  /* 4 cols desktop */
  }
}
```

---

## Tailwind CSS

### Config (`tailwind.config.js`)

```javascript
content: [
  './src/**/*.{js,ts,jsx,tsx,mdx}',
],
theme: {
  extend: {
    // Custom extensions
  }
}
```

### Uso Real

Tailwind se usa **poco** en las plantillas principales. La mayoría del styling es CSS custom con selectores `[data-template]`. Tailwind se usa más en:
- Admin panel (layout, sidebar)
- Componentes genéricos (Toast, CookieConsent)
- Páginas sin plantilla (login, 404)

**NOTA:** Se carga Tailwind completo pero se aprovecha poco. El CSS output incluye clases no usadas.

---

## Animaciones CSS

### Keyframes Definidas

| Nombre | Archivo | Uso |
|--------|---------|-----|
| `tpl1-nav-pop` | Navbar.tsx | Pop en tab nav |
| `tpl1-fab-spin` | Navbar.tsx | Rotación FAB abrir |
| `tpl1-fab-spin-back` | Navbar.tsx | Rotación FAB cerrar |
| `tpl1-bbl-side` | Navbar.tsx | Animación bubble lateral |
| `tpl1-bbl-center` | Navbar.tsx | Animación bubble central |
| `tpl1-fab-particles-anim` | Navbar.tsx | Partículas FAB |
| `tpl1-col-pulse-ring` | collections-premium.css | Pulse dot |
| `tpl1-col-shimmer` | collections-premium.css | Shimmer texto |
| `tpl1-col-bg-drift` | collections-premium.css | Drift orbes fondo |
| `tpl1-col-kenburns` | collections-premium.css | Ken Burns imágenes |
| `tpl1-col-line-grow` | collections-premium.css | Línea decorativa |
| `tpl1-col-title-glow` | collections-premium.css | Glow título |

### Animaciones GSAP (Plantilla 1)

- ScrollTrigger para entrada de secciones
- Split-type para animación de texto
- Timeline para secuencias

### Animaciones Lottie

- Carrito vacío (animación de carrito)
- Loading states

---

## Fuentes

### Fuentes Usadas

| Fuente | Uso | Carga |
|--------|-----|-------|
| "DM Sans" | UI general, labels, badges | Google Fonts (link) |
| "Fraunces" | Títulos premium | Google Fonts (link) |
| "Playfair Display" | Títulos alternativos | Google Fonts (link) |
| system-ui | Fallback | Sistema |

---

## Issues CSS

1. **!important excesivo:** La mayoría de reglas usan `!important` por la especificidad del HTML Shopify
2. **Sin CSS Modules:** Todo es CSS global con selectores largos
3. **Sin purge efectivo:** CSS custom no se purga, solo Tailwind
4. **IDs hardcodeados:** IDs de sección Shopify son frágiles
5. **Orden de carga:** CSS se carga en orden fijo, no por ruta
6. **Sin design tokens:** Colores y espaciados hardcodeados, no variables CSS
