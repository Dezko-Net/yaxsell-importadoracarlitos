# Análisis Low Level — Plantillas (Templates)

## Sistema Multi-Plantilla

El proyecto implementa un sistema de 4 plantillas intercambiables en runtime. El template activo se almacena en la colección `sequences` de Appwrite con key `store_template`.

### Mecanismo de Selección

```
1. TemplateProvider fetch /api/template
2. Server route lee sequences collection con API key
3. Retorna { template: 1|2|3|4 }
4. TemplateProvider inyecta data-template="N" en wrapper div
5. DynamicNavbar / DynamicHomePage switch según template ID
6. CSS usa [data-template="N"] como selector
```

---

## Plantilla 1 — Shopify-Venice (Premium)

**La más compleja. Contiene HTML migrado de un tema Shopify.**

### Archivos

| Archivo | Tamaño | Descripción |
|---------|--------|-------------|
| `HomePage.tsx` | **416KB** | Homepage completa con manipulación DOM |
| `Navbar.tsx` | **60KB** | Navbar con FAB, menú mobile, búsqueda |
| `ProductDetail.tsx` | **50KB** | Detalle producto con galería, tabs, reviews |
| `mobile-responsive.css` | **88KB** | Estilos responsive mobile |
| `shopify-fix.css` | **70KB** | Fixes CSS sobre HTML Shopify original |
| `tpl1-collections-premium.css` | **20KB** | Sección colecciones premium |
| `theme.css` | **1KB** | Variables tema |

### Arquitectura Interna (HomePage.tsx)

Este archivo es **excepcionalmente grande** (416KB, ~12,000 líneas). Contiene:

1. **HTML Shopify Inyectado:** El componente renderiza HTML crudo del tema Venice usando `dangerouslySetInnerHTML` y luego lo manipula con JS directo al DOM.
2. **Secciones Configurables:** Usa `section-config.ts` para toggle/reorder/config de secciones.
3. **GSAP + ScrollTrigger:** Animaciones de entrada y scroll.
4. **Lottie:** Animaciones vectoriales (cart vacío, etc).
5. **Lenis:** Smooth scrolling.
6. **Manipulación DOM directa:** `document.querySelector`, `classList.add`, etc.

### Secciones Homepage (Plantilla 1)

1. Live stream banner (rojo, EN VIVO)
2. Hero carousel (banners)
3. DA feature cards
4. Ofertas del día
5. Categorías
6. Collage Interactivo (IKEA-style con hotspots)
7. Sala Interactiva (house_product_positions)
8. Recomendados
9. Productos destacados
10. Footer

### Navbar (Plantilla 1)

- **Desktop:** Navbar superior con logo, búsqueda, carrito, usuario
- **Mobile:** Bottom nav con 5 items + FAB central
- **FAB:** Botón "Explorar" con menú radial (Tienda izq, Catálogo arriba, Llegan Pronto der.)
- **Búsqueda:** Overlay fullscreen con filtros, productos, categorías
- **Animaciones:** CSS keyframes para FAB bubbles, pulse, particles

### Issue Conocido: Tamaño de Archivo

`HomePage.tsx` a 416KB es insostenible. Debería dividirse en:
- Secciones individuales como componentes
- Lógica de manipulación DOM a hooks
- Configuración de secciones a un archivo separado

---

## Plantilla 2 — MercadoLibre-Style

### Archivos

| Archivo | Tamaño | Descripción |
|---------|--------|-------------|
| `HomePage.tsx` | **222KB** | Homepage marketplace |
| `Navbar.tsx` | **126KB** | Navbar complejo |
| `ProductDetail.tsx` | **33KB** | Detalle producto |
| `theme.css` | **1KB** | Variables tema |

### Características

- Grid estilo marketplace con categorías visuales
- Collage interactivo (hotspot_panels + banner_overlay_positions)
- Sala interactiva (house_product_positions)
- Secciones configurables via section-config
- Navbar con mega-menú

### Issue Conocido: Navbar 126KB

El Navbar de plantilla 2 es el archivo más grande de su tipo. Contiene lógica de mega-menú, búsqueda, y carrito todo en un componente.

---

## Plantilla 3 — Minimal

### Archivos

| Archivo | Tamaño |
|---------|--------|
| `HomePage.tsx` | 10KB |
| `Navbar.tsx` | 5KB |
| `theme.css` | 1KB |

**La más ligera.** Layout limpio sin animaciones pesadas ni manipulación DOM.

---

## Plantilla 4 — Chinamart

### Archivos

| Archivo | Tamaño |
|---------|--------|
| `HomePage.tsx` | 50KB |
| `Navbar.tsx` | 0.2KB |
| `chinamart.css` | **43KB** |

**CSS-driven.** La mayoría del diseño está en el archivo CSS masivo. El Navbar es casi vacío (solo re-exporta el genérico).

---

## CSS por Plantilla

### Problema: CSS Monolítico

| Archivo | Tamaño | Plantilla |
|---------|--------|-----------|
| `mobile-responsive.css` | **88KB** | 1 |
| `shopify-fix.css` | **70KB** | 1 |
| `chinamart.css` | **43KB** | 4 |
| `tpl1-collections-premium.css` | **20KB** | 1 |

Los CSS de plantilla 1 son **específicos a IDs de sección Shopify** hardcodeados:

```css
[data-template="1"] #shopify-section-template--22405132419320__collection_list_WrFbPe
```

Esto hace el CSS no reutilizable y frágil ante cambios en el tema Shopify original.

### Media Queries

Todos los CSS mobile usan `@media screen and (max-width: 768px)` como breakpoint principal.

---

## Sistema de Secciones Configurables

### `lib/section-config.ts` (60KB)

Define la configuración de cada sección de homepage:

- **Toggle:** Mostrar/ocultar sección
- **Reorder:** Cambiar orden de secciones
- **Settings:** Colores, tipografía, espaciado, sombras
- **Card Design System:** Estilos de cards (classic, elegant, glassmorphism, neon, etc.)
- **Favorite Button Design:** Estilos del botón favorito
- **Banner de Imagen:** Configuración de imagen con overlay

### Persistencia

- **Primario:** Appwrite `theme_config` collection
- **Fallback:** `localStorage` con key `tpl1_section_config`

### Admin

- `/admin/sections` — Editor visual con drag & drop
- `/admin/sections-custom` — Editor avanzado
- `/admin/theme-editor` — Editor de tema visual

---

## Recomendaciones

1. **Dividir HomePage.tsx plantilla 1** en ~10 componentes de sección
2. **Mover manipulación DOM** a hooks custom (useSectionSetup, useGSAPAnimations)
3. **Eliminar IDs Shopify hardcodeados** del CSS, usar clases genéricas
4. **Extraer lógica de Navbar** a hooks (useNavbar, useSearch, useFAB)
5. **CSS Modules o Tailwind** en vez de CSS global con selectores de ID
