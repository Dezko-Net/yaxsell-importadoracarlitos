export type TopProduct = {
  sku: string
  nombre: string
  cantidadVendida: number
  costoNeto: number
  ventasBrutas: number
  ventasNetas?: number
}

type ProfitBase = Pick<TopProduct, 'sku' | 'nombre' | 'cantidadVendida' | 'costoNeto' | 'ventasBrutas'> & {
  ventasNetas?: number
}

export type ProfitRow<T extends ProfitBase = ProfitBase> = T & {
  adjustedByMinus10: boolean
  cantidadVendida: number
  costoAjustado: number
  costoUnitarioAjustado: number
  ganancia: number
  margenPct: number
  margenRatio: number
  skuNormalizado: string
  ventasBrutas: number
  ventasNetas: number
}

export type ProfitSummary<T extends ProfitBase = ProfitBase> = {
  cantidadTotal: number
  costoTotal: number
  gananciaTotal: number
  margenPct: number
  margenRatio: number
  rows: Array<ProfitRow<T>>
  ventasBrutas: number
  ventasNetas: number
}

export function normalizeProfitSku(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

export function computeAdjustedUnitCost<T extends Pick<ProfitBase, 'sku' | 'cantidadVendida' | 'costoNeto'>>(
  product: T,
  costsBD: Map<string, number>,
  minus10Flags: Set<string>
) {
  const sku = normalizeProfitSku(product?.sku)
  const cantidad = Number(product?.cantidadVendida || 0)
  const costoNetoReporte = Number(product?.costoNeto || 0)
  const costoUnitBD = Number(costsBD.get(sku) || 0)
  const base = costoUnitBD > 0 ? costoUnitBD : cantidad > 0 ? costoNetoReporte / cantidad : 0
  const adjustedByMinus10 = minus10Flags.has(sku)
  const costoUnitarioAjustado = Math.round(base * (adjustedByMinus10 ? 0.81 : 1))

  return {
    adjustedByMinus10,
    costoUnitarioAjustado,
    sku,
  }
}

export function enrichProfitRows<T extends ProfitBase>(
  products: T[],
  costsBD: Map<string, number>,
  minus10Flags: Set<string>
): Array<ProfitRow<T>> {
  return products.map((product) => {
    const cantidadVendida = Number(product?.cantidadVendida || 0)
    const ventasBrutas = Number(product?.ventasBrutas || 0)
    const ventasNetas = Number(product?.ventasNetas || ventasBrutas)
    const { adjustedByMinus10, costoUnitarioAjustado, sku } = computeAdjustedUnitCost(product, costsBD, minus10Flags)
    const costoAjustado = Math.round(costoUnitarioAjustado * cantidadVendida)
    const ganancia = ventasBrutas - costoAjustado
    const margenRatio = ventasBrutas > 0 ? ganancia / ventasBrutas : 0
    const margenPct = margenRatio * 100

    return {
      ...product,
      adjustedByMinus10,
      cantidadVendida,
      costoAjustado,
      costoUnitarioAjustado,
      ganancia,
      margenPct,
      margenRatio,
      skuNormalizado: sku,
      ventasBrutas,
      ventasNetas,
    }
  })
}

export function summarizeTopProducts<T extends ProfitBase>(
  products: T[],
  costsBD: Map<string, number>,
  minus10Flags: Set<string>
): ProfitSummary<T> {
  const rows = enrichProfitRows(products, costsBD, minus10Flags)
  const cantidadTotal = rows.reduce((sum, row) => sum + Number(row.cantidadVendida || 0), 0)
  const ventasBrutas = rows.reduce((sum, row) => sum + Number(row.ventasBrutas || 0), 0)
  const ventasNetas = rows.reduce((sum, row) => sum + Number(row.ventasNetas || 0), 0)
  const costoTotal = rows.reduce((sum, row) => sum + Number(row.costoAjustado || 0), 0)
  const gananciaTotal = ventasBrutas - costoTotal
  const margenRatio = ventasBrutas > 0 ? gananciaTotal / ventasBrutas : 0
  const margenPct = margenRatio * 100

  return {
    cantidadTotal,
    costoTotal,
    gananciaTotal,
    margenPct,
    margenRatio,
    rows,
    ventasBrutas,
    ventasNetas,
  }
}

export function aggregateTopProducts(products: ProfitBase[]) {
  const map = new Map<string, ProfitBase>()

  products.forEach((product) => {
    const sku = normalizeProfitSku(product?.sku)
    const key = sku || String(product?.nombre || '')
    const current = map.get(key) || {
      sku: String(product?.sku || ''),
      nombre: String(product?.nombre || ''),
      cantidadVendida: 0,
      costoNeto: 0,
      ventasBrutas: 0,
      ventasNetas: 0,
    }

    current.cantidadVendida += Number(product?.cantidadVendida || 0)
    current.costoNeto += Number(product?.costoNeto || 0)
    current.ventasBrutas += Number(product?.ventasBrutas || 0)
    current.ventasNetas = (current.ventasNetas || 0) + Number(product?.ventasNetas || 0)
    current.nombre = String(product?.nombre || current.nombre || '')
    current.sku = String(product?.sku || current.sku || '')

    map.set(key, current)
  })

  return Array.from(map.values()).sort((a, b) => Number(b.cantidadVendida || 0) - Number(a.cantidadVendida || 0))
}

export function aggregateAndSummarizeTopProducts(
  products: ProfitBase[],
  costsBD: Map<string, number>,
  minus10Flags: Set<string>
) {
  return summarizeTopProducts(aggregateTopProducts(products), costsBD, minus10Flags)
}
