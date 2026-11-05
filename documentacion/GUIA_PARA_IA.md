# Guía de continuidad para IA

## Qué es este proyecto

Yaxsell es una tienda online y un motor comercial que hoy integra el catálogo de Importadora Carlitos, administración de productos/pedidos, caja presencial (POS), inventario/ERP y un módulo de tiendas aliadas. El código está en un único repositorio Next.js; no son servicios separados por módulo.

## Stack observado

- Next.js 15 App Router, React 19 y TypeScript.
- Firebase Web SDK y Firebase Admin SDK; Firestore nombrado `donbalato` por defecto, configurable mediante variables de entorno. `firebase.json` también declara `(default)`.
- Firebase Authentication y Firebase Storage.
- Vercel como destino configurado en `vercel.json`, con dos cron declarados.
- UI: CSS global y Tailwind, GSAP, Framer Motion, Three.js y varias librerías de animación/gráficos.
- Exportaciones y operación: `exceljs`, `xlsx`, PDF con `jspdf`/`pdf-lib`, impresión POS y Chromium/Puppeteer en tareas concretas.

Las versiones exactas y scripts npm se encuentran en `package.json`. No hay script `test` declarado.

## Mapa de arranque

```text
src/app/                 páginas y 156 handlers route.ts (corte de esta revisión)
src/components/          UI de tienda, catálogo, cuenta, admin, POS y ERP
src/context/             carrito, usuario y selección/configuración de plantilla
src/hooks/               hooks de autenticación, catálogo, POS y preferencias
src/lib/                 Firebase, cachés, contratos y servicios de dominio
src/services/             autenticación, fidelidad y notificaciones
src/templates/            código auxiliar de dos plantillas; los recursos Shopify viven también en public/
public/shopify/           HTML/CSS/JS y recursos de temas migrados
scripts/                  utilidades de importación, auditoría, operación y archivos históricos
migracion/                semillas y scripts de migración Firebase/Appwrite
docs/                     análisis POS/ERP, stock pendiente y tiendas aliadas
documentacion/             handoff técnico actual
```

Puntos de entrada más útiles:

- Root layout y providers: `src/app/layout.tsx`.
- Home y resolución visual: `src/app/page.tsx`, `src/components/DynamicHomePage.tsx`, `src/components/StoreShell.tsx`, `src/context/TemplateContext.tsx`.
- Firebase cliente: `src/lib/firebase.ts`, `src/lib/db.ts`.
- Firebase servidor y compatibilidad: `src/lib/db-server.ts`.
- Nombres de colecciones y prefijos de archivos: `src/lib/collections.ts`.
- POS: `src/app/pos/[sede]/page.tsx`, `src/app/api/pos/stock/route.ts`, `src/lib/firebaseVentasPos.ts`.
- Inventario/ERP: `src/lib/firebaseErpService.ts`, `src/app/api/erp/stock-movements/route.ts`, `src/app/api/erp/stock-pending/route.ts`.
- Catálogo público: `src/lib/catalog-cache.ts`, `src/app/api/public-data/`.
- Checkout vendor y stock de pedidos: `src/app/api/checkout/vendor-order/route.ts`, `src/app/api/checkout/stock/route.ts`, `src/lib/order-stock-service.ts`.
- Autenticación vendor: `src/lib/vendor-auth.ts`.

## Cómo se mueve una solicitud

1. Las páginas cliente usan Firebase Web SDK para estado interactivo y algunas consumen `/api/public-data/*` para catálogos cacheados.
2. Los handlers `src/app/api/**/route.ts` validan la operación y, en muchos casos, acceden a Firebase Admin por `src/lib/db-server.ts`.
3. El acceso común se expone como una capa de compatibilidad (`getServices`, `serverListDocuments`, `serverCreateDocument`, etc.) que mantiene formas de datos inspiradas en Appwrite. Lee la función antes de asumir qué SDK usa.
4. Los flujos que afectan stock o dinero deben pasar por endpoints transaccionales del servidor. El POS y el checkout no deben tratar el stock calculado en pantalla como autoridad.
5. Las páginas públicas y privadas comparten `StoreShell`; el layout modifica navbar/footer según la ruta. Que una ruta se vea dentro del panel no protege automáticamente su API.

## Reglas de trabajo que evitan daños

- **No editar stock al modificar metadatos del producto.** Las ventas POS, devoluciones, ingresos y ajustes tienen flujos separados; revisa [POS/ERP](POS_ERP_INVENTARIO.md) antes de cambiar campos `STOCK`/`stock`.
- **No ampliar listeners ni polling sin medir lecturas.** Hay cachés de distintas capas y TTL distintos. No copiar la antigua regla Appwrite de 24 horas como si aplicara a todos los endpoints Firebase.
- **Mantener el límite cliente/servidor.** Nunca enviar service accounts, tokens de proveedor ni secretos a componentes cliente.
- **Mantener propietario y sesión en backend para vendors.** El ID de vendor que manda el navegador no basta para autorizar acceso.
- **No ejecutar scripts de `scripts/` o `migracion/` por el nombre.** Algunos borran colecciones, reescriben precios o importan datos. Lee el script y confirma destino, argumentos, respaldo y modo antes de operar.
- **No imprimir ni copiar valores de `.env*`, `*-key.json` o service account.** En esta revisión solo se inventariaron nombres de variables; no se mostraron valores secretos.
- **Respetar el estado de Git.** Antes de trabajar, consulta `git status`; durante esta revisión ya existían cambios en la página del POS y su generador de etiquetas PDF.

## Desarrollo local

```powershell
npm install
npm run dev
```

Los comandos disponibles declarados son `dev`, `build`, `start` y `lint`. No se ejecutaron durante esta revisión. Antes de `npm run build` en este proyecto, tener en cuenta que el build puede activar integraciones externas o consumir recursos; no usarlo como inspección inicial.

## Documentos de continuidad

Consulta primero el índice [documentacion/README.md](README.md). Los apuntes de `Analisis Low Level/`, `plan migratorio/` y varios documentos antiguos de `DOCUMENTOS/` describen snapshots de junio de 2026 o una etapa Appwrite anterior; sirven para historia, no como contrato actual sin contraste con código.
