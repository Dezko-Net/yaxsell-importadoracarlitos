# 📊 ERP MASTER CONTROL — Importadora Carlitos / YAXSEL
> **Estado de la Migración:** En curso  
> **Última Actualización:** 2026-09-11  
> **Objetivo:** Migración 100% nativa de Vite a Next.js (App Router), eliminación total de residuos de Appwrite, conexión directa a Firebase Firestore (`donbalato`), blindaje transaccional y optimización extrema de lecturas/escrituras.

---

## 1. Contexto Histórico & Diagnóstico Raíz

El ERP fue concebido originalmente en **React 18 + Vite + Firebase Firestore** en el proyecto **Asistora ERP** (`PROJECT ERP ASISTORA (PRODUCCION)`).

Al integrarse a la plataforma comercial de Importadora Carlitos / Yaxsel:
1. Se intentó migrar a **Next.js 15 App Router**.
2. Durante esa transición, parte del sistema se adaptó a **Appwrite Cloud** (`cuadres_erp`, `trabajadores_erp`), introduciendo restricciones como serializar objetos a strings JSON (`gastosJson`, `topProductsJson`, `fotosJson`).
3. Posteriormente, la tienda e-commerce volvió a migrarse a **Firebase Firestore** (`yaxselldemo`, base de datos `donbalato`), pero el ERP quedó en un **estado híbrido / roto**:
   - En `/erp-dashboard`: Se colocaron shims `db: any = null` con funciones mock (`getDocs: () => ({ empty: true })`), provocando que los gráficos y KPIs caigan obligatoriamente a datos de demostración (`DEMO_MOCK_SUCURSALES`).
   - En `/erp` (Cuadres): Depende de `cuadresErpService.ts` que aún emula llamadas de Appwrite vía `src/lib/db.ts` y tiene quemadas las sedes antiguas (`alameda`, `copiapo`, `la-florida`), ignorando la sede real **`donbalato-central`**.
   - En `/erp-dashboard/equipo`: `trabajadoresErpService.ts` usa emulación de cursores Appwrite y respuestas mockeadas de IA.
   - En `/admin-supreme`: Rutas de API como `save-trabajador` y `delete-config` usan llamadas cliente con `DB_ID` en vez de `getAdminDb()`.

---

## 2. Mapa de Colecciones Firestore (`donbalato`)

Estructura unificada y oficial en Firestore:

| Colección | Propósito | Estado Actual | Modelo / Claves Principales |
|---|---|---|---|
| `erp_config` | Configuración global multiempresa y sucursales | ✅ Operativa | `doc('config')`: `companyName`, `branches` (`donbalato-central`), `supremeAdminEmail` |
| `config_pos` | Datos de empresa para boletas y tickets POS | ✅ Operativa | `doc('empresa')`: `rut`, `giro`, `direccion`, `telefono` |
| `ventas_pos` | Registro transaccional de ventas del POS | ✅ Operativa (5+ ventas reales) | `sede`, `fechaStr`, `boletaNumero`, `total`, `itemsJson`, `pagosJson`, `cajeroNombre`, `sesionCajaId` |
| `caja_sesiones` | Control de apertura y cierre de caja por sede | ✅ Operativa | `active_donbalato-central`: `estado`, `totalVentas`, `totalEfectivo`, `ventasCount` |
| `caja_cortes` | Cortes parciales (X) y finales (Z) | ⚠️ Pendiente poblar | `sede`, `fechaStr`, `tipoCorte`, `totalSistema`, `totalReal`, `diferencia` |
| `cuadres_erp` | Cuadre diario consolidado para contabilidad | ⚠️ Solo `_init` | `sede`, `fecha`, `montos`, `calculos`, `gastos`, `topProducts` |
| `trabajadores_erp` | Plantilla de personal y cajeras activas | ⚠️ 1 cajera (`cajera_central_1`) | `nombre`, `cargo`, `sede`, `sueldo`, `activo`, `posActivo` |
| `products` | Catálogo maestro de productos, costos y precios | ✅ 333 productos donbalato | `SKU`, `NAME`, `costo_uni`, `PRICE`, `WHOLESALEPRICE`, `STOCK` |
| `users` | Usuarios autenticados del sistema | ✅ Operativa | `email`, `role`, `displayName` |

---

## 3. Arquitectura de Módulos del ERP

```mermaid
graph TD
    subgraph Frontend Next.js 15
        DASH["/erp-dashboard<br/>(Dashboard Maestro & KPIs)"]
        CUADRE["/erp<br/>(Historial de Cuadres)"]
        NUEVO_CUADRE["/erp/nuevo<br/>(Cierre y Cuadre Diario)"]
        EQUIPO["/erp-dashboard/equipo<br/>(RRHH y Trabajadores)"]
        BD["/erp-dashboard/base-datos<br/>(Costos y Precios)"]
    end

    subgraph Capa de Servicios Firestore
        SVC_DASH["dashboardService.ts<br/>(Ventas hoy + Cuadres)"]
        SVC_CUADRE["cuadresErpService.ts<br/>(Nativo Firestore)"]
        SVC_TRAB["trabajadoresErpService.ts<br/>(Nativo Firestore)"]
        SVC_PROD["firebaseErpService.ts<br/>(Catálogo con Caché)"]
    end

    subgraph Base de Datos Firestore (donbalato)
        COL_VENTAS[(ventas_pos)]
        COL_SESIONES[(caja_sesiones)]
        COL_CUADRES[(cuadres_erp)]
        COL_TRAB[(trabajadores_erp)]
        COL_PROD[(products)]
        COL_CFG[(erp_config)]
    end

    DASH --> SVC_DASH
    CUADRE --> SVC_CUADRE
    NUEVO_CUADRE --> SVC_CUADRE
    EQUIPO --> SVC_TRAB
    BD --> SVC_PROD

    SVC_DASH --> COL_VENTAS
    SVC_DASH --> COL_SESIONES
    SVC_DASH --> COL_CUADRES
    SVC_CUADRE --> COL_CUADRES
    SVC_TRAB --> COL_TRAB
    SVC_PROD --> COL_PROD
```

---

## 4. Estrategia de Optimización de Lecturas & Escrituras (Uso Privado)

Dado que el POS y el ERP son herramientas de uso interno/privado (1 a 5 terminales activas), la dinámica es:
* **Escrituras altas** (registro de cada venta, movimientos de stock, cierres de caja).
* **Lecturas optimizadas** (evitar barrer colecciones completas en cada cambio de vista).

### Directrices de Rendimiento:
1. **Catálogo de Productos (`products`)**:
   - Cache cliente en `localStorage` con TTL de 12-24 horas.
   - Solo se invalida cuando se crea o edita un producto (`invalidateProductsCache()`).
   - El POS busca en memoria local en lugar de consultar Firestore por cada tecla pulsada.
2. **Configuración de Sucursales & Branding (`erp_config`)**:
   - Cache SWR en memoria de 60 segundos (`posConfig.ts`).
   - Deduplicación de promesas en vuelo (si 3 componentes montan simultáneamente, solo se realiza 1 petición HTTP).
3. **Ventas y Cuadres (`ventas_pos` y `cuadres_erp`)**:
   - Consultas acotadas por fecha (`fechaStr == today`) e indexadas por `sede + fecha`.
   - Cero lecturas ciegas: no hacer `collection.get()` sin filtros de fecha ni límites (`limit(100)` con cursor).
   - Cálculos agregados en la sesión de caja (`caja_sesiones/active_donbalato-central`): el total acumulado y conteo de ventas se actualizan con incremento atómico (`FieldValue.increment`), ahorrando leer todas las ventas para saber el total del día.
4. **Escrituras Transaccionales Seguras**:
   - Uso obligatorio de transacciones o lotes (`db.runTransaction` / `db.batch`) al realizar cuadres o anular boletas para evitar desfases de stock y caja.

---

## 5. Checklist Vivo de Auditoría & Deuda Técnica

### 🔴 Bloque 1: Shims y Mocks (Despertar el ERP Real)
- [x] Eliminar `db: any = null` y funciones mock (`collection`, `getDocs`) en `src/app/erp-dashboard/page.tsx`.
- [x] Eliminar mocks en `src/app/erp-dashboard/layout.tsx`.
- [x] Conectar los KPIs de ventas del día en `/erp-dashboard` a la colección real `ventas_pos` y `caja_sesiones`.
- [x] Mapear `donbalato-central` en el selector de sucursales del dashboard.

### 🔴 Bloque 2: Limpieza de Residuos Appwrite & Vite
- [x] Migrar `src/lib/cuadresErpService.ts` a Firestore nativo (quitar `getServices().databases` y emulaciones Appwrite).
- [x] Quitar serialización innecesaria de JSON strings (`gastosJson`, `topProductsJson`) en `cuadres_erp` y usar mapas/arreglos nativos de Firestore.
- [x] Migrar `src/lib/trabajadoresErpService.ts` a Firestore nativo directo.
- [x] Limpiar residuos en `src/app/api/admin-supreme/save-trabajador` (usar `getAdminDb()`).
- [x] Limpiar residuos en `src/app/api/admin-supreme/delete-config` (usar `getAdminDb()`).
- [x] Limpiar `helpers.ts` de Admin Supreme (`saveUserToAppwrite`, `deleteUserFromAppwrite`, `DB_ID`).

### 🟡 Bloque 3: Sincronización POS ➔ ERP
- [x] Mapear `donbalato-central` en `SEDE_UI` de `src/app/erp/page.tsx` para visualización correcta de cuadres.
- [x] Sincronizar el formulario de nuevo cuadre (`/erp/nuevo`) para que pre-cargue automáticamente los totales de `ventas_pos` de la sesión de caja del día.
- [ ] Validar que el botón "Cerrar Caja" del POS genere o alimente el registro en `cuadres_erp`.

### 🟢 Bloque 4: Optimización, Layouts y Pruebas
- [x] Reparar el bug de paginación infinita (`cursorAfter` no-op) en servicios de listado.
- [x] Corregir Hydration Mismatches de SSR (`window.innerWidth` evaluado en render) en `erp-dashboard/layout.tsx`.
- [x] Crear `src/app/erp/layout.tsx` unificando la barra de navegación superior (live clock, ticker ventas hoy, selector de sede, CONTADOR IA, panel admin, modo oscuro) y sidebar en `/erp` y `/erp/nuevo`.
- [x] Sincronizar resaltado de ruta activa (`isRouteActive`) en el sidebar para rutas mapeadas (`/erp` y `/erp/nuevo`).
- [x] Agregar botón de acceso rápido "+ Nuevo Cuadre" y retorno al Dashboard ERP en el sub-header de `/erp`.
- [x] Validar rutas de Next.js (`/erp`, `/erp-dashboard`, `/erp/nuevo`) respondiendo HTTP 200 OK con el layout completo integrado.
- [x] Implementar sombreado visual y badges de auditoría en la cortina lateral del frontend (🟢 Verde para páginas existentes, 🟡 Ámbar para alias, 🔴 Rojo para rutas faltantes).
- [x] Migrar `SucursalesPage` desde Asistora a Next.js 15 App Router en `src/app/erp-dashboard/sucursales/page.tsx` conectado a Firestore (`cuadres_erp`, `ventas_pos`, `caja_sesiones`), pasando la casilla en el menú a 🟢 **VERDE (`✓ Existe`)**.
- [x] Migrar `AlertasPage` desde Asistora a Next.js 15 App Router en `src/app/erp-dashboard/alertas/page.tsx` con Health Score, anomalías de caja/gastos y auditoría de inventario lento, pasando la casilla en el menú a 🟢 **VERDE (`✓ Existe`)**.
- [x] Migrar `VentasTiempoRealPage` desde Asistora a Next.js 15 App Router en `src/app/erp-dashboard/ventas-tiempo-real/page.tsx` con paginación limpia (20 en 20), switch Radar En Vivo / Historial Pausado para cero desperdicio de lecturas, filtros dinámicos e impresión de boletas térmicas, pasando la casilla en el menú a 🟢 **VERDE (`✓ Existe`)**.
- [x] Sustituir el formato de boleta simulado por un comprobante interno en `src/lib/posReceipt.ts`. No hay emisión fiscal del SII integrada.
- [x] Habilitar rutas físicas directas para Planilla Unificada en `src/app/erp-dashboard/planilla-unificada/page.tsx` y `src/app/planilla-unificada/page.tsx` conectadas a `trabajadores_erp` en Firestore, pasando la casilla en el menú lateral a 🟢 **VERDE (`✓ Existe`)**.
- [x] Migrar módulo de **Gastos Operacionales** (`/gastos` y `/erp-dashboard/gastos`) desde Asistora a Next.js 15 App Router: lectura nativa desde `cuadres_erp`, selector de sede/fechas, KPIs, modal de Ficha IA del gasto con matching a trabajadores en `trabajadores_erp`, edición en vivo, chat Solé y exportación a Excel, pasando la casilla en el menú a 🟢 **VERDE (`✓ Existe`)**.
- [x] Migrar módulo de **Gastos Externos** (`/gastos-externos` y `/erp-dashboard/gastos-externos`): servicio `externalExpenses.ts` con Firestore (`external_expenses`), prorrateo de gastos fijos mensuales, registro de gastos manuales, KPIs y modo oscuro, pasando la casilla en el menú a 🟢 **VERDE (`✓ Existe`)**.
- [ ] Probar flujo completo: Venta en POS ➔ Sesión de caja actualizada ➔ Métrica visible en Dashboard ERP ➔ Cuadre de caja generado.



