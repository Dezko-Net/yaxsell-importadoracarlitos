# Análisis de Arquitectura: POS, POS-Admin y ERP-Dashboard
**Proyecto:** Importadora Carlitos (Firebase multi-tenant)  
**Fecha:** Septiembre 2026  
**Base de datos:** `donbalato` (Firebase Firestore)  
**Bucket de Storage:** `yaxselldemo.firebasestorage.app` (`donbalato/`)

---

## 1. Punto de Venta POS (`/pos` y `/pos/[sede]`)

El POS es la terminal de caja para ventas presenciales en tiendas físicas. Está diseñado para funcionar en pantallas táctiles o computadores con pistolas lectoras de código de barras.

### Flujo Operativo y Rendimiento
* **Búsqueda a 0ms (In-Memory Catalog):**
  - Al iniciar el POS, se carga todo el catálogo desde la colección `products` de Firestore a memoria RAM (`Map<string, ProductDoc>`), indexado por:
    - ID del documento
    - SKU
    - Código de barras
  - Al pistolear un código de barras o presionar `Enter`, la coincidencia es instantánea (<1ms), sin consultar a la base de datos por cada escaneo.
* **Ciclo de Caja Registradora:**
  - **Apertura de Turno:** La cajera ingresa el fondo inicial de sencillo. Se crea/actualiza el registro en `caja_sesiones` con el ID `active_${sede}`.
  - **Venta y Cobro:** Soporta Efectivo (con cálculo automático de vuelto), Débito/Transbank, Transferencias y Split (pago mixto). Permite aplicar descuentos individuales o descuento porcentual global.
  - **Cierre y Arqueo:** La cajera declara el efectivo en gaveta y los gastos o mermas del turno. Se calcula la diferencia (sobrante/faltante) y se guarda el documento en `cortes_caja`.
* **Impresión Térmica:**
  - Integración nativa con impresoras térmicas de 80mm y 58mm (`openReceiptPrintWindow` en `src/lib/posReceipt.ts`), emitiendo boletas con folio correlativo único, detalle de productos y datos de la empresa.
* **Roles de Personal:**
  - **Cajera:** Cobro en caja, apertura y cierre de turno.
  - **Vendedora (Piso de Venta):** Arma carritos de preventa desde tablets o celulares y los envía directamente a la gaveta de la cajera ("Enviar a Cajera").
  - **Jefe de Tienda:** Autorización de anulaciones y cobro directo.
* **Visualizador de Cliente (`/pos-visualizer`):**
  - Permite conectar una segunda pantalla orientada hacia el cliente. Se sincroniza en tiempo real mediante la colección `pos_cart_sync` en Firestore.

---

## 2. Panel Administrador del POS (`/pos-admin` / `pos-dashboard`)

Panel de control dedicado exclusivamente a la gestión comercial y operativa del POS y stock físico:

* **Dashboard de Sede (`/pos-admin/[sede]`):**
  - Métricas de inventario consolidado: total de productos, productos con stock activo, valorización del inventario a precio de costo vs. precio de venta proyectado.
* **Maestro de Productos (`/pos-admin/[sede]/productos`):**
  - Vista tabular con edición rápida en línea de Nombre, SKU, Código de Barras, Precios (Detalle, Mayorista, Emprendedor), Costo y Stock.
  - Exportación directa a Excel (`XLSX`).
* **Control de Stock (`/pos-admin/[sede]/stock`):**
  - Ajustes de inventario (sumar ingresos de mercadería, restar mermas o fijar stock físico auditado). Alertas automáticas de quiebre de stock (< 5 unidades).
* **Historial de Ventas (`/pos-admin/[sede]/ventas`):**
  - Visualización cronológica de las ventas registradas en la sede.
  - Reimpresión de comprobantes internos.
  - Anulación con PIN de seguridad.
  - Función **Rehacer Venta**: recarga los items de una boleta errónea de vuelta al POS.
* **Configuración del POS (`/pos-admin/[sede]/config`):**
  - Razón social, RUT, Giro comercial, Dirección y Teléfono que se imprimen en los tickets.
  - La antigua opción de código simulado fue retirada; el POS no emite documentos tributarios.
  - Modo de venta: "Cajera cobra" vs. "Jefe cobra".

---

## 3. ERP Dashboard Ejecutivo (`/erp-dashboard`)

Torre de control gerencial multitienda para el dueño y administradores generales:

* **KPIs y Gráficos Financieros:**
  - Gráficos interactivos de ventas brutas, gastos totales y margen de ganancia neta.
  - Evolución de ventas día a día y comparación mensual (Recharts).
* **Semáforo de Cierre de Cajas:**
  - Monitor en vivo que muestra qué sucursales ya cuadraron caja hoy y cuáles siguen con el turno pendiente de cierre.
* **Top Productos:**
  - Ranking de los productos con mayor rotación y volumen de dinero, consolidado general y por sucursal.
* **Gestión de Personal y Planilla (`/erp-dashboard/equipo`):**
  - Administración de personal, sueldos base, asistencia diaria, faltas, anticipos/adelantos quincenales y liquidación neta.
* **Conexión de datos:**
  - Se alimenta de `cuadres_erp`, `trabajadores_erp` y `erp_config` en Firestore `donbalato`.

---

## 4. Estado en la Base de Datos `donbalato`

| Componente | Estado Actual | Acción para Lanzamiento |
|---|---|---|
| Colección `products` | 0 productos (Limpia) | Carga del inventario maestro con fotos en Storage |
| Colección `trabajadores_erp` | Solo doc `_init` | Crear cajeras/vendedoras reales de Importadora Carlitos |
| Colección `erp_config` | 0 documentos | Crear doc `config` con datos fiscales y sucursales Importadora Carlitos |
| Redirección `/pos` | Cae a `chacabuco-08` por falta de config | Configurar sucursal Importadora Carlitos en `erp_config` |
