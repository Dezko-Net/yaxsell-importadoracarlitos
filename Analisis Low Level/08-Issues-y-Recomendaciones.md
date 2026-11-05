# Análisis Low Level — Issues, Deuda Técnica y Recomendaciones

## Issues Críticos

### 1. Archivos Monolíticos

| Archivo | Tamaño | Líneas (est.) | Riesgo |
|---------|--------|---------------|--------|
| `templates/plantilla1/HomePage.tsx` | **416KB** | ~12,000 | Inmantenible, imposible de debuggear eficientemente |
| `templates/plantilla2/Navbar.tsx` | **126KB** | ~3,600 | Demasiada responsabilidad |
| `templates/plantilla1/mobile-responsive.css` | **88KB** | ~1,900 | CSS no modular |
| `templates/plantilla1/shopify-fix.css` | **70KB** | ~1,500 | Frágil, depende de IDs Shopify |
| `templates/plantilla1/Navbar.tsx` | **60KB** | ~1,700 | Debería dividirse |
| `lib/section-config.ts` | **60KB** | ~1,600 | Lógica + tipos + defaults mezclados |
| `components/CouponBanner.tsx` | **53KB** | ~1,500 | Lógica de negocio en componente UI |
| `templates/plantilla4/chinamart.css` | **43KB** | ~1,200 | CSS sin modularizar |
| `templates/plantilla1/HomePage.tsx` | **50KB** (ProductDetail) | ~1,400 | Debería dividirse |
| `components/LoyaltyLevel.tsx` | **46KB** | ~1,300 | Sistema completo en un archivo |

### 2. Manipulación DOM Directa

Plantilla 1 (`HomePage.tsx`) manipula el DOM directamente:

```typescript
document.querySelector('.some-class').classList.add('active');
element.style.setProperty('background', color);
```

**Problemas:**
- No se beneficia del virtual DOM de React
- Difícil de rastrear cambios
- Race conditions con renderizado React
- No se limpia automáticamente en unmount

### 3. CSS con IDs Shopify Hardcodeados

```css
[data-template="1"] #shopify-section-template--22405132419320__collection_list_WrFbPe
```

**Problemas:**
- Si el tema Shopify cambia, el CSS se rompe
- No reutilizable entre plantillas
- Difícil de entender sin contexto del tema original

### 4. API Key Expuesta en Código

```typescript
// src/app/api/template/route.ts
const API_KEY = 'standard_dea4a8654ed430bf3626a6cd6506a562...';
```

**Riesgo:** Aunque solo corre server-side, la key está en el repo Git. Si el repo se hace público, la key se expone.

**Fix:** Mover a variable de entorno `APPWRITE_API_KEY`.

### 5. Colección `page_views` Inexistente

`usePageViewTracker.ts` intenta crear documentos en `page_views` pero la colección no existe en la cuenta actual de Appwrite. Resultado: **Error 500 en consola** en cada navegación.

**Fix:** Crear la colección en Appwrite o desactivar el tracking.

---

## Deuda Técnica

### Tipos Duplicados e Inconsistentes

`types/index.ts` y `types/admin.ts` definen las mismas interfaces con campos diferentes:

| Campo | `index.ts` | `admin.ts` |
|-------|-----------|-----------|
| `Product.TAGS` | `string[]` | `string` |
| `Product.FEATURES` | `string[]` | `string` |
| `Category.name` | `name` | `name` |
| `Category.iconUrl` | `iconUrl?` | `iconUrl?` |
| `Category.color` | ❌ | `color?` |
| `Order` | UPPERCASE | UPPERCASE + camelCase |

**Fix:** Unificar en un solo archivo de tipos con campos opcionales para admin vs store.

### Sin Tests

No existe ningún archivo de test en el proyecto. No hay:
- Unit tests
- Integration tests
- E2E tests
- Component tests

### Sin Paginación Server-Side

Muchas páginas admin cargan **todos** los documentos de una colección y filtran client-side:

```typescript
const allDocs: any[] = [];
let offset = 0;
while (true) {
  const res = await databases.listDocuments(db, coll, [Query.limit(100), Query.offset(offset)]);
  allDocs.push(...res.documents);
  if (res.documents.length < 100) break;
  offset += 100;
}
```

**Problema:** Con colecciones grandes (miles de productos), esto es lento y consume memoria.

### Cache Sin Invalidación

El sistema de cache (`lib/cache.ts`) usa TTL pero no se invalida cuando el admin modifica datos. Un admin puede cambiar un producto y los usuarios siguen viendo la versión cacheada por hasta 15 minutos.

### Dependencias No Utilizadas

El `package.json` incluye dependencias pesadas que pueden no usarse en todas las plantillas:

| Paquete | Tamaño (est.) | Uso real |
|---------|---------------|----------|
| `three` + `@react-three/*` | ~500KB | ¿Solo plantilla específica? |
| `fabric` | ~300KB | ¿Se usa? |
| `konva` + `react-konva` | ~200KB | ¿Solo admin? |
| `@tsparticles/*` | ~100KB | ¿Se usa? |
| `granim` | ~20KB | ¿Se usa? |
| `flubber` | ~15KB | ¿Se usa? |
| `culori` | ~50KB | ¿Se usa? |

**Fix:** Audit de dependencias con `npx depcheck` y tree-shaking.

---

## Recomendaciones Priorizadas

### P0 — Crítico (Semana 1)

1. **Mover API key a `.env`** — Seguridad
2. **Crear colección `page_views`** o desactivar tracking — Fix error 500
3. **Dividir `HomePage.tsx` plantilla 1** en componentes de sección — Mantenibilidad

### P1 — Alto (Semana 2-3)

4. **Unificar tipos TypeScript** — Un solo `types/` con interfaces compartidas
5. **Extraer lógica DOM** de plantilla 1 a hooks custom — Testeabilidad
6. **Paginación server-side** en admin — Performance
7. **Invalidación de cache** cuando admin modifica datos — Consistencia

### P2 — Medio (Semana 4-6)

8. **Dividir `section-config.ts`** en módulos — Mantenibilidad
9. **Dividir componentes grandes** (CouponBanner, LoyaltyLevel, ProductLocator) — Mantenibilidad
10. **CSS modular** — Eliminar IDs Shopify, usar clases genéricas o CSS Modules
11. **Audit de dependencias** — Reducir bundle size

### P3 — Bajo (Semana 7+)

12. **Tests unitarios** para hooks y servicios
13. **Tests E2E** para flujos críticos (checkout, login, carrito)
14. **PWA completa** — Service worker con cache strategies
15. **i18n** — Internacionalización (actualmente solo español)
16. **Error boundaries** — Manejar errores de renderizado graceful

---

## Métricas del Proyecto

| Métrica | Valor |
|---------|-------|
| Total archivos `.tsx` | ~80 |
| Total archivos `.ts` | ~40 |
| Total archivos `.css` | ~8 |
| Líneas de código (est.) | ~50,000 |
| Componentes React | ~55 |
| Páginas store | ~20 |
| Páginas admin | ~34 |
| API routes | ~13 |
| Colecciones Appwrite | 30 |
| Context providers | 5 |
| Custom hooks | 6 |
| Servicios | 4 |
| Archivo más grande | `HomePage.tsx` plantilla 1 (416KB) |
| Bundle size (est.) | ~2-3MB (sin tree-shaking) |

---

## Arquitectura Propuesta (Target)

```
src/
├── app/                    # Next.js App Router
│   ├── (store)/            # Route group tienda
│   └── admin/              # Route group admin
├── components/
│   ├── ui/                 # Componentes UI base (Button, Card, Modal)
│   ├── store/              # Componentes tienda
│   ├── admin/              # Componentes admin
│   └── sections/           # Secciones homepage por plantilla
├── hooks/                  # Custom hooks
├── services/               # Servicios de negocio
├── lib/                    # Utilidades
│   ├── appwrite/           # Config + helpers Appwrite
│   ├── cache/              # Sistema de cache
│   └── section-config/     # Config secciones (dividido)
├── templates/              # Plantillas
│   ├── shared/             # Componentes compartidos entre plantillas
│   ├── plantilla1/         # Componentes específicos P1
│   ├── plantilla2/         # Componentes específicos P2
│   └── ...
└── types/                  # Tipos unificados
    ├── appwrite.ts         # Tipos Appwrite (UPPERCASE)
    ├── store.ts            # Tipos store front
    └── admin.ts            # Tipos admin (extends store)
```
