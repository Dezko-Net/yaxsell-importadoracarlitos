const TIPOS_MERCADERIA = new Set([
  'gasto de mercaderia',
  'compra de mercaderia',
  'inversion en mercaderia',
  'inversion mercaderia',
])

const normalizeExpenseLabel = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()

export function esCompraMercaderia(gasto: {
  tipo?: unknown
  tipoGasto?: unknown
  categoria?: unknown
  observacion?: unknown
  descripcion?: unknown
  detalle?: unknown
  concepto?: unknown
} | null | undefined): boolean {
  const tipo = normalizeExpenseLabel(gasto?.tipo)
  const tipoGasto = normalizeExpenseLabel(gasto?.tipoGasto)
  const categoria = normalizeExpenseLabel(gasto?.categoria)
  const detalle = normalizeExpenseLabel([
    gasto?.observacion,
    gasto?.descripcion,
    gasto?.detalle,
    gasto?.concepto,
  ].filter(Boolean).join(' '))
  const categoriaProveedor = /\bproveedor(es)?\b/.test(categoria)

  // La categoría explícita de proveedores identifica un gasto mensual.
  if (categoriaProveedor) return false

  if (TIPOS_MERCADERIA.has(tipo) || TIPOS_MERCADERIA.has(tipoGasto) || categoria === 'inventario / mercaderia' || categoria === 'compra de mercaderia') {
    return true
  }

  // Si no hay categoría explícita, no inferir una compra de inventario desde
  // una descripción que identifica un pago a proveedor.
  if (/\bproveedor(es)?\b/.test(detalle)) return false

  const mencionaMercaderia = /\b(mercaderia|inventario|stock)\b/.test(detalle)
  const describeCompra = /\b(compra|comprar|pago|pagado|pagando|abono|inversion|reponer|reposicion)\b/.test(detalle)
  const describeFlete = /\b(flete|encomienda|despacho|envio|transporte|bencina|combustible)\b/.test(detalle)

  return mencionaMercaderia && describeCompra && !describeFlete
}

export function gastoAfectaGanancia(gasto: { tipo?: unknown; tipoGasto?: unknown; categoria?: unknown } | null | undefined): boolean {
  return !esCompraMercaderia(gasto)
}

export function sumarGastosMercaderia(gastos: unknown): number {
  if (!Array.isArray(gastos)) return 0
  return gastos.reduce((total: number, gasto: any) =>
    total + (esCompraMercaderia(gasto) ? Number(gasto?.monto) || 0 : 0), 0)
}

export function sumarGastosQueAfectanGanancia(gastos: unknown): number {
  if (!Array.isArray(gastos)) return 0
  return gastos.reduce((total: number, gasto: any) =>
    total + (gastoAfectaGanancia(gasto) ? Number(gasto?.monto) || 0 : 0), 0)
}

export function obtenerGastosQueAfectanGanancia(cuadre: any): number {
  const calculos = cuadre?.calculos || {}
  let gastos = Array.isArray(cuadre?.gastos) ? cuadre.gastos : null
  if (!gastos && typeof cuadre?.gastosJson === 'string') {
    try { gastos = JSON.parse(cuadre.gastosJson) } catch { gastos = null }
  }

  // Los cierres antiguos pueden tener un total guardado antes de separar mercadería.
  // Si hay detalle clasificado, lo recalculamos para no descontar el inventario como gasto.
  if (Array.isArray(gastos) && gastos.some(esCompraMercaderia)) {
    return sumarGastosQueAfectanGanancia(gastos)
  }

  const storedValue = calculos.gastosQueAfectanGanancia
  if (storedValue !== undefined && storedValue !== null && Number.isFinite(Number(storedValue))) {
    return Number(storedValue)
  }

  if (Array.isArray(gastos) && gastos.length > 0) return sumarGastosQueAfectanGanancia(gastos)

  const totalRegistrado = Number(calculos.gastosTotales ?? cuadre?.gastosTotales) || 0
  const mercaderiaRegistrada = Number(calculos.gastosMercaderia) || 0
  return Math.max(0, totalRegistrado - mercaderiaRegistrada)
}
