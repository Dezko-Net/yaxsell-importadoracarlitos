# PROYECTO UNIFICADO — Yaxsell

## Resumen

Yaxsell es una plataforma SaaS compuesta por 4 módulos que se venden por separado pero que comparten una misma base de datos (Appwrite). Cada módulo tiene su propia lógica, UI y datos independientes, con la única excepción de productos y categorías que actúan como puente entre todos.

## Los 4 módulos

1. **Catálogo Web** — Catálogo online de productos.
2. **Página Web** — Sitio web completo con plantillas personalizables.
3. **ERP** — Gestión empresarial (trabajadores, cuadres de caja, sucursales, inventario, etc.).
4. **POS** — Punto de venta.

## Reglas de arquitectura

### Lo que SÍ se comparte
- **Appwrite** como backend único.
- **Colección de Productos** — compartida entre todos los módulos.
- **Colección de Categorías** — compartida entre todos los módulos.

### Lo que NO se comparte
- **ERP**: trabajadores, cuadres de caja, sucursales, reportes, nómina, etc. Todo independiente de Yaxsell y del resto de módulos.
- **POS**: ventas, tickets, caja, etc. Lógica propia e independiente.
- **Catálogo Web / Página Web**: cada plantilla tiene su propia UI (navbar, footer, hero, secciones). No comparten componentes visuales entre sí.
- Cada módulo debe poder funcionar de forma independiente en el futuro, como si fuera un proyecto distinto.

### Principio clave
> Los cambios que se hagan en un módulo (por ejemplo, ERP) no deben afectar a los demás. Cada módulo se trata como un proyecto independiente que casualmente usa el mismo Appwrite, pero con sus propias colecciones para todo lo que no sea productos o categorías.

## Plantillas (Página Web)

- Cada plantilla (`plantilla1`, `plantilla23`, `plantilla25`, etc.) es un mundo independiente.
- Cada una tiene su propio navbar, footer, hero banner y secciones.
- Lo único compartido entre plantillas son los datos de Appwrite (productos, categorías, etc.).
- Cambios en una plantilla no rompen ni afectan a las demás.
- Los hero banners son independientes por plantilla (no hay vinculación entre ellos).
