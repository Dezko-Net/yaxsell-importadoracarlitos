# Conciliación Retailbase — 27-10-2026

## Objetivo
Repetir la conciliación del reporte diario de Retailbase: verificar ventas, descontar solo el stock que aún no se haya descontado, calcular el costo de lo vendido y registrar la ganancia consolidada de Importadora Carlitos A+B con reparto 50/50.

## Criterio acordado
- Las ventas de la tienda se tratan como **sin IVA**. No dividir las ventas brutas por 1,19.
- Ingreso real = ventas brutas cobradas menos devoluciones brutas efectivamente reembolsadas.
- Ganancia de productos = ingreso real menos costo neto de los productos vendidos.
- Restar después los gastos operacionales. Las compras de mercadería son inventario, no gasto operacional del día.
- Cuando Retailbase reporte ambas sucursales consolidadas, repartir ventas, costo y ganancia 50/50 entre Importadora Carlitos A y B, compensando redondeos para que la suma coincida exactamente.

## Pasos
1. Recibir el Excel del día y confirmar que su fecha y contenido correspondan al cierre que se conciliará. No editar el archivo original.
2. Leer todas las filas de productos, cantidades, ventas brutas, devoluciones y total. Identificar filas totalmente devueltas y excluir sus unidades del costo vendido.
3. Conciliar cada producto por SKU exacto; después probar código de barras y nombre. Consultar el costo vigente de Firebase. Si falta la ficha, usar un costo histórico de POS solo cuando SKU y nombre coincidan y el costo sea consistente; no inventar costos ni recrear fichas eliminadas.
4. Revisar `stock_movements` del día y movimientos POS. Descontar únicamente cantidades aún no rebajadas, con movimiento idempotente y registro de stock anterior/nuevo. Dejar aparte productos sin ficha vigente.
5. Calcular ingreso real, costo total, ganancia y margen sobre el ingreso real. Revisar productos con margen negativo y explicar los mayores impactos.
6. Separar gastos operacionales de pagos de mercadería. Calcular resultado antes y después de gastos operacionales.
7. Repartir el consolidado 50/50 en los cuadres de Importadora Carlitos A y Importadora Carlitos B; conservar el reporte global y dejar nota de la regla aplicada.
8. Actualizar `stock_reconciliations` y `cuadres_erp`; comprobar que ambos cuadres sumen exactamente el total y verificar los nuevos stocks y movimientos.
9. Completar `RESULTADOS.md` con el archivo fuente, cifras, productos corregidos y cualquier elemento pendiente.

## Controles antes de escribir
- No repetir descuentos de stock que ya figuren en POS o en una conciliación anterior.
- No descontar stock de fichas inexistentes ni asignarles stock negativo sin autorización.
- La devolución se resta por el importe bruto reembolsado, no por una columna neta que Retailbase calcule dividiendo por 1,19.
- Confirmar que costo + ganancia = ingreso real y que A + B = consolidado, considerando gastos aparte.
