# YAXSEL OMNICHANNEL ERP & WEB: PLAN MAESTRO Y ARQUITECTURA DE INVENTARIO ÚNICO (2026)

Este documento establece la estrategia y reglas de negocio para integrar el **Punto de Venta (POS)** y **Base de Datos / Inventario ERP** directamente dentro de la tienda web de **Yaxsel** (`PROJECT Importadora Carlitos`).

---

## 1. REGLA DE ORO DE SEGURIDAD (0 RIESGO EN PRODUCCIÓN)

Toda modificación debe realizarse sin interrumpir el funcionamiento de la tienda online pública.
- Las rutas del e-commerce público (`/`, `/productos`, `/catalogo`, `/carrito`, etc.) **no se tocan ni se alteran**.
- Toda la funcionalidad del ERP/POS vivirá dentro del panel de administración aislado de Yaxsel (`/admin/...`).

---

## 2. ARQUITECTURA DE BASE DE DATOS ÚNICA (SINGLE SOURCE OF TRUTH)

```
┌──────────────────────────────────────────────────────────────┐
│                    APPWRITE CLOUD (NYC)                      │
│ Project ID: donbalatoivan                                    │
│ Database ID: 6a62e7440033d2278d28                            │
│ Collection: 'products' (LA MADRE DE TODO)                    │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
   ┌──────────────────────┐        ┌──────────────────────┐
   │    POS / ERP CAJA    │        │    TIENDA WEB YAXSEL │
   │  Ruta: /admin/pos    │        │  Ruta: /productos    │
   │  Vende TODO producto │        │  Filtra solo con     │
   │  (con o sin imagen)  │        │  FOTO + STOCK + ACTIVE│
   └──────────────────────┘        └──────────────────────┘
```

- **La Colección Suprema**: La colección `products` en Appwrite es la única fuente oficial de productos, precios, códigos de barra, imágenes y stock.
- **Colecciones Depuradas**: Se ignoran y pueden eliminarse colecciones obsoletas como `inventory_products` o `catalog_products`.

---

## 3. REGLAS DE VISIBILIDAD E IMÁGENES

### A. Para la Tienda Web (E-Commerce Público)
Para proteger la estética profesional del sitio web, un producto sólo es visible si cumple **TODAS** las condiciones:
1. `ISACTIVE == true`
2. `STOCK > 0`
3. `IMAGEURL != null` (el producto debe tener una imagen asignada).

### B. Para el Punto de Venta (POS) y Base de Datos ERP
En la caja registradora del local y en el inventario ERP:
- **Se muestran y venden TODOS los productos**, tengan o no tengan foto.
- El escáner de código de barras busca por `BARCODE` o `SKU` a velocidad instantánea (0 ms).
- **Subida de foto rápida**: Desde la vista de Inventario ERP o al crear un producto en caja, se puede tomar/subir una foto. En el instante en que el producto recibe su imagen, **se activa automáticamente en la tienda web**.

---

## 4. FASES DE IMPLEMENTACIÓN SEGURA

### Fase 1: Documentación y Conexión de Inventario (ACTUAL)
- Crear esta guía de arquitectura.
- Conectar la vista de **Base de Datos / Inventario** en el Admin (`/admin/inventario-erp`) leyendo los productos en vivo de la colección `products` de Appwrite.
- Integrar la vista dentro del diseño oscuro oficial ("la cortina negra") de Yaxsel Admin.

### Fase 2: Módulo POS (Punto de Venta) en Admin
- Crear la pantalla de caja `/admin/pos` en Next.js.
- Integrar escáner de código de barra, selección rápida de productos y carrito de compra.
- Pendiente: evaluar una integración autorizada para la emisión tributaria electrónica. El comprobante interno actual no emite documentos del SII.
- Configurar descuento automático de stock en Appwrite al presionar "Cobrar".

### Fase 3: Módulos Complementarios ERP
- Cierres de caja y cortes diarios (`/admin/cortes`).
- Reporte de ganancias y márgenes comerciales (`/admin/ganancias`).

---

*Fecha de creación: 30 de Julio de 2026*
*Proyecto: PROJECT Importadora Carlitos (Yaxsel)*
