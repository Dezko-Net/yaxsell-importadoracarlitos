# Stock Pendiente — Venta sin stock con control automático

## Problema

Cuando se suben productos nuevos a la base de datos, muchos no tienen stock asignado todavía.
Si la cajera intenta venderlos, el POS bloquea la venta. La solución temporal era poner cada
producto en "ilimitado" manualmente, lo cual es lento y sin control.

## Solución: Stock Pendiente

Permitir vender productos sin stock, pero llevar un registro automático de cuántas unidades
se vendieron "a deber". Cuando alguien agregue stock real, el sistema descuenta automáticamente
lo que se vendió sin stock.

### Flujo

1. **POS**: La cajera agrega un producto con stock 0 al carrito.
2. Aparece una notificación rápida: "⚠️ Producto sin stock — venta pendiente".
3. La venta se completa normalmente (no se bloquea).
4. El sistema registra la cantidad vendida como **stock pendiente** para ese SKU.
5. **Base de Datos**: Nueva pestaña "Stock Pendiente" muestra cuántas unidades debe cada producto.
6. Cuando alguien agrega stock real (botón Guardar o +), el sistema:
   - Avisa: "Este producto tiene N unidades pendientes"
   - Descuenta automáticamente: stock_real - pendiente = stock_final
   - Limpia el pendiente a 0

### Ejemplo

- Producto "Crema X" tiene stock 0
- Se venden 10 unidades (stock pendiente = 10)
- La cajera va a Base de Datos y agrega 100 unidades de stock real
- El sistema avisa: "10 unidades pendientes se descontarán automáticamente"
- Stock final = 100 - 10 = 90
- Pendiente vuelve a 0

### Implementación técnica

#### Colección Firestore: `stock_pending`

```
{
  sku: "IDB1053",
  nombre: "Crema X",
  pendiente: 10,           // unidades vendidas sin stock
  ultimaVentaTs: 1789387131112,
  ultimaVentaFecha: "2026-09-14",
  historico: [             // registro de cada venta sin stock
    { cantidad: 4, fecha: "2026-09-14", ventaId: "xxx" },
    { cantidad: 6, fecha: "2026-09-14", ventaId: "yyy" }
  ]
}
```

#### API: `/api/erp/stock-pending`

- **GET**: Lista todos los productos con stock pendiente > 0
- **POST**: Incrementa el pendiente (llamado desde el POS al vender sin stock)
- **DELETE**: Limpia el pendiente de un SKU (llamado al agregar stock real)

#### POS — `src/app/pos/[sede]/page.tsx`

En `addToCart`, cuando `stockDisp <= 0`:
1. Mostrar toast: "⚠️ {sku} sin stock — venta pendiente"
2. Permitir agregar al carrito (no bloquear)
3. Al completar la venta, llamar a `/api/erp/stock-pending` para registrar el pendiente

#### Base de Datos — `src/app/erp-dashboard/base-datos/page.tsx`

- Nueva pestaña "Stock Pendiente" junto a Maestro, Precios, Stock
- Muestra: foto, nombre, SKU, stock actual, pendiente, stock real necesario
- Al guardar stock con el botón Guardar o +, si hay pendiente:
  - Modal de confirmación: "Este producto tiene N unidades pendientes. Se descontarán automáticamente."
  - stock_final = stock_ingresado - pendiente
  - Limpiar pendiente

#### API: `/api/erp/stock-movements` (modificación)

En el POST, cuando `tipo === 'set'` o `tipo === 'add'`:
1. Consultar `stock_pending` del producto
2. Si pendiente > 0:
   - Para `set`: stock_final = cantidad - pendiente (mínimo 0)
   - Para `add`: stock_final = (stock_actual + cantidad) - pendiente
   - Limpiar pendiente a 0
   - Registrar movimiento adicional de tipo "ajuste_pendiente"

### Archivos a modificar

1. `src/app/api/erp/stock-pending/route.ts` — nuevo API
2. `src/app/pos/[sede]/page.tsx` — permitir venta sin stock + notificación + registrar pendiente
3. `src/app/erp-dashboard/base-datos/page.tsx` — nueva pestaña Stock Pendiente
4. `src/app/api/erp/stock-movements/route.ts` — descontar pendiente al agregar stock
5. `src/app/api/pos/stock/route.ts` — no bloquear venta cuando stock = 0 (si es necesario)

### Consideraciones

- Los productos ilimitados (stock >= 99999) NO generan pendiente
- El pendiente solo aplica a productos con stock 0 o stock insuficiente
- Si el stock real agregado es menor al pendiente, el stock final será 0 y el pendiente restante se mantiene
- El registro histórico se conserva para auditoría
