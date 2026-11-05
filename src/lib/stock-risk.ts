/**
 * stock-risk.ts — Motor de cálculo de salud y riesgo de stock para Importadora Carlitos
 *
 * Mapeo intuitivo invertido (estilo barra de salud / batería para retail):
 * - 100% (y barra llena): VERDE 🟢 — Totalmente seguro para publicar en web (cobertura amplia)
 * - 30% - 69% (y barra a la mitad): AMARILLO 🟡 — Precaución / rotación en tienda (cobertura 1.5 a 4 días)
 * - 0% - 29% (y barra vacía o casi vacía): ROJO 🔴 — Malo / Quiebre inminente / No publicar en web
 * - 0%: ROJO 🔴 — Agotado total (0 unidades físicas)
 *
 * Curva continua multivariada 0-100% (Sin saltos discretos).
 */

export type RiskLevel = 'verde' | 'amarillo' | 'rojo'

export interface ProductRisk {
  /** Porcentaje de salud/seguridad para web 0-100 (100 = verde y seguro publicar, 0 = rojo/vacío y crítico) */
  pct: number
  /** Nivel del semáforo */
  level: RiskLevel
  /** Días de cobertura estimados (stock / ventas_por_día) */
  cobertura: number
  /** Piso crítico de stock (1 para lentos, 3 para normales, ajustado por lote) */
  pisoCritico: number
  /** Velocidad de venta promedio (unidades/día, 7 días recortado) */
  velocity: number
  /** Si el producto es nuevo (sin historial) */
  coldStart: boolean
  /** Texto descriptivo corto para tooltip */
  label: string
}

export interface RiskInput {
  stock: number
  /** Unidades vendidas por día (promedio 7 días recortado). 0 si no hay historial. */
  salesVelocity7d: number
  /** Días desde que se creó el producto. Si <7, se aplica cold-start. */
  daysSinceCreated?: number
  /** Cantidad máxima vendida en una sola compra (tamaño de lote). Si no se pasa, se asume 1. */
  maxBatchSize?: number
  /** Precio unitario de venta (CLP). Si no se pasa, se asume precio promedio ~$2.500. */
  price?: number
}

/**
 * Clamp entre 0 y 100 con redondeo
 */
function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Calcula la salud y aptitud de stock de un producto para venta web según precio y rotación.
 *
 * Escala 0-100% intuitiva (Verde = lleno / seguro, Rojo = vacío / peligro):
 * - 70% - 100%: VERDE 🟢 (Seguro para publicar)
 * - 30% - 69%:  AMARILLO 🟡 (Precaución, rotación moderada)
 * - 0% - 29%:   ROJO 🔴 (Malo, deshabilitado en web, barra vacía/crítica)
 */
export function getProductRisk(input: RiskInput): ProductRisk {
  const stock = Math.max(0, Number(input.stock) || 0)
  const velocity = Math.max(0, Number(input.salesVelocity7d) || 0)
  const daysSinceCreated = Number(input.daysSinceCreated) || 999
  const maxBatchSize = Math.max(1, Number(input.maxBatchSize) || 1)
  const price = Math.max(0, Number(input.price) || 2500)
  const coldStart = daysSinceCreated < 7

  // ── Determinación de pisos y curvas según Tier de Precio ──
  // Tier 1: Productos muy económicos (< $1.200, ej: $300, $500, $800, $1.000). Salen en masa.
  // Tier 2: Productos precio medio-bajo ($1.200 a $3.500).
  // Tier 3: Productos precio medio-alto ($3.500 a $15.000).
  // Tier 4: Productos de alto valor / ticket alto (> $15.000, ej: $20.000 - $50.000+).
  let basePct = 100
  let pisoCritico = 3

  if (price < 1200) {
    pisoCritico = 10
    if (stock <= 0) {
      basePct = 0
    } else if (stock <= 5) {
      // 1 a 5 uds: 2% a 10% (Rojo crítico total, deshabilitado)
      basePct = clampPct((stock / 5) * 10)
    } else if (stock <= 10) {
      // 6 a 10 uds: 12% a 25% (Rojo peligro de quiebre en tienda)
      basePct = clampPct(12 + ((stock - 5) / 5) * 13)
    } else if (stock <= 25) {
      // 11 a 25 uds: 30% a 65% (Amarillo rotación alta)
      basePct = clampPct(30 + ((stock - 10) / 15) * 35)
    } else {
      // > 25 uds: Verde seguro
      basePct = clampPct(70 + Math.min(30, (stock - 25) * 1.5))
    }
  } else if (price < 3500) {
    pisoCritico = 5
    if (stock <= 0) {
      basePct = 0
    } else if (stock <= 3) {
      // 1 a 3 uds: 3% a 12% (Rojo)
      basePct = clampPct((stock / 3) * 12)
    } else if (stock <= 5) {
      // 4 a 5 uds: 16% a 25% (Rojo)
      basePct = clampPct(16 + ((stock - 3) / 2) * 9)
    } else if (stock <= 15) {
      // 6 a 15 uds: 30% a 65% (Amarillo)
      basePct = clampPct(30 + ((stock - 5) / 10) * 35)
    } else {
      // > 15 uds: Verde seguro
      basePct = clampPct(70 + Math.min(30, (stock - 15) * 3))
    }
  } else if (price < 15000) {
    pisoCritico = 3
    if (stock <= 0) {
      basePct = 0
    } else if (stock <= 2) {
      basePct = clampPct((stock / 2) * 15)
    } else if (stock === 3) {
      basePct = 22 // Rojo
    } else if (stock <= 8) {
      // 4 a 8 uds: 30% a 65% (Amarillo)
      basePct = clampPct(30 + ((stock - 3) / 5) * 35)
    } else {
      // > 8 uds: Verde
      basePct = clampPct(70 + Math.min(30, (stock - 8) * 5))
    }
  } else {
    // Alto valor (> $15.000, ej: $50.000). Movimiento lento y venta unitaria
    pisoCritico = 1
    if (stock <= 0) {
      basePct = 0
    } else if (stock === 1) {
      basePct = 18 // Rojo
    } else if (stock === 2) {
      basePct = 42 // Amarillo
    } else if (stock === 3) {
      basePct = 50 // Exacto ~50% Amarillo (3 uds en producto de $50k)
    } else if (stock === 4) {
      basePct = 72 // Verde
    } else {
      basePct = clampPct(75 + (stock - 4) * 5)
    }
  }

  // Ajuste por tamaño de lote (si compran de a 10 y quedan 8)
  if (stock < maxBatchSize) {
    const batchPenalty = (1 - stock / maxBatchSize) * 25
    basePct = clampPct(basePct - batchPenalty)
  }

  // Ajuste por velocidad de venta y cobertura real (si hay ventas en 7 días)
  const cobertura = velocity > 0 ? stock / velocity : Infinity
  if (velocity > 0) {
    if (cobertura < 1.5) {
      // Se agota en menos de 36 hrs -> forzar a rojo crítico
      basePct = Math.min(basePct, 22)
    } else if (cobertura < 3.0) {
      // Cobertura menor a 3 días -> forzar a amarillo
      basePct = Math.min(basePct, 55)
    }
  }

  // Si stock está en 0 o bajo el piso crítico estricto
  if (stock === 0) basePct = 0
  else if (stock <= pisoCritico && basePct >= 30) basePct = 25

  const pct = clampPct(basePct)
  const level: RiskLevel = pct >= 70 ? 'verde' : pct >= 30 ? 'amarillo' : 'rojo'

  return {
    pct,
    level,
    cobertura,
    pisoCritico,
    velocity,
    coldStart,
    label: riskLabel(level, pct, cobertura, stock),
  }
}

function coldStartLabel(stock: number, pct: number, level: RiskLevel): string {
  if (level === 'verde') return `Producto nuevo con buen stock (${stock}u). Seguro para web (${pct}%).`
  if (level === 'amarillo') return `Producto nuevo con stock moderado (${stock}u). Precaución (${pct}%).`
  return `Producto nuevo con stock bajo (${stock}u). No publicar en web (${pct}%).`
}

function riskLabel(level: RiskLevel, pct: number, cobertura: number, stock: number): string {
  const dias = cobertura === Infinity ? '∞' : cobertura.toFixed(1)
  if (level === 'rojo') return `Seguridad ${pct}%. Cobertura ${dias} días. Stock ${stock}u. No publicar en web.`
  if (level === 'amarillo') return `Seguridad ${pct}%. Cobertura ${dias} días. Stock ${stock}u. Precaución.`
  return `Seguridad ${pct}%. Cobertura ${dias} días. Stock ${stock}u. Seguro para web.`
}

/**
 * Tiempo de reserva de carrito según el nivel de riesgo (en minutos).
 * Acordado con Gravity:
 * - Verde: 20 min (estándar)
 * - Amarillo: 15 min + 5 min grace oculto = 20 min backend
 * - Rojo: no se puede comprar en web
 */
export function getReservaMinutos(level: RiskLevel): { visible: number; backend: number } {
  if (level === 'amarillo') return { visible: 15, backend: 20 }
  return { visible: 20, backend: 20 }
}

/**
 * Colores Tailwind para cada nivel de riesgo.
 */
export const RISK_COLORS: Record<RiskLevel, {
  bg: string
  text: string
  border: string
  bar: string
  badge: string
  emoji: string
}> = {
  verde: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    bar: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 border-green-300',
    emoji: '🟢',
  },
  amarillo: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    bar: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    emoji: '🟡',
  },
  rojo: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    bar: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-300',
    emoji: '🔴',
  },
}

export interface OrderStockRisk {
  /** Porcentaje de salud general del pedido 0-100% */
  pct: number
  /** Nivel consolidado del semáforo */
  level: RiskLevel
  /** Plazo estimado sugerido para transferir/pagar */
  deadlineText: string
  /** Plazo en horas decimales (24, 4, 0.33) */
  deadlineHours: number
  /** Descripción concisa para tooltip/badge */
  label: string
  /** Indica si al menos 1 ítem está en rojo o quiebre */
  hasRed: boolean
  /** Cantidad de productos en rojo */
  redCount: number
  /** Indica si hay productos en amarillo */
  hasYellow: boolean
  /** Cantidad de productos en amarillo */
  yellowCount: number
  /** Cantidad de productos en verde */
  greenCount: number
  /** Total de ítems evaluados */
  totalItems: number
  /** True si absolutamente todos los ítems están en verde */
  allGreen: boolean
}

export interface OrderItemRiskInput {
  qty: number
  stock?: number | null
  name?: string
  sku?: string
  price?: number
}

/**
 * Calcula la salud de stock consolidada de un pedido y su plazo estimado para pagar:
 * - Si TODO está en VERDE: ~1 día (24 horas) para transferir, barra verde (70-100%).
 * - Si hay AMARILLO (sin rojos): plazo intermedio decreciente (2 a 4 horas), barra amarilla (30-68%).
 * - Si tiene al menos 1 producto en ROJO o quiebre inminente: barra roja (0-25%), advertencia y plazo urgente de 20 min.
 */
export function calculateOrderStockRisk(
  items: OrderItemRiskInput[]
): OrderStockRisk {
  if (!items || items.length === 0) {
    return {
      pct: 100,
      level: 'verde',
      deadlineText: '24 horas (1 día)',
      deadlineHours: 24,
      label: 'Sin productos registrados',
      hasRed: false,
      redCount: 0,
      hasYellow: false,
      yellowCount: 0,
      greenCount: 0,
      totalItems: 0,
      allGreen: true,
    }
  }

  let redCount = 0
  let yellowCount = 0
  let greenCount = 0
  let totalPct = 0
  let minPct = 100

  for (const it of items) {
    const qty = Math.max(1, Number(it.qty) || 1)
    const stock = it.stock !== undefined && it.stock !== null ? Number(it.stock) : null

    let itemRisk: ProductRisk
    if (stock === null) {
      // Stock no disponible aún o desconocido -> neutro moderado
      itemRisk = {
        pct: 50,
        level: 'amarillo',
        cobertura: 2,
        pisoCritico: 3,
        velocity: 0,
        coldStart: false,
        label: 'Stock en verificación',
      }
    } else if (stock <= 0) {
      itemRisk = {
        pct: 0,
        level: 'rojo',
        cobertura: 0,
        pisoCritico: 3,
        velocity: 0,
        coldStart: false,
        label: 'Agotado (0u)',
      }
    } else if (stock < qty) {
      itemRisk = {
        pct: Math.max(0, Math.min(22, Math.round((stock / qty) * 20))),
        level: 'rojo',
        cobertura: 0,
        pisoCritico: 3,
        velocity: 0,
        coldStart: false,
        label: `Stock insuficiente (${stock}u de ${qty}u)`,
      }
    } else {
      itemRisk = getProductRisk({
        stock,
        salesVelocity7d: 0,
        maxBatchSize: qty,
        price: it.price,
      })
    }

    if (itemRisk.level === 'rojo' || itemRisk.pct < 30) {
      redCount++
    } else if (itemRisk.level === 'amarillo' || itemRisk.pct < 70) {
      yellowCount++
    } else {
      greenCount++
    }

    totalPct += itemRisk.pct
    if (itemRisk.pct < minPct) minPct = itemRisk.pct
  }

  const avgPct = Math.round(totalPct / items.length)

  // CASO 1: Al menos 1 producto en ROJO o casi rojo (quiebre inminente)
  if (redCount > 0) {
    const pct = Math.min(minPct, 25)
    return {
      pct,
      level: 'rojo',
      deadlineText: '20 min (Urgente)',
      deadlineHours: 0.33,
      label: redCount === 1 ? '1 producto con riesgo de quiebre' : `${redCount} productos con riesgo de quiebre`,
      hasRed: true,
      redCount,
      hasYellow: yellowCount > 0,
      yellowCount,
      greenCount,
      totalItems: items.length,
      allGreen: false,
    }
  }

  // CASO 2: Sin rojos, pero con AMARILLO (stock moderado)
  if (yellowCount > 0) {
    const pct = Math.max(30, Math.min(68, avgPct))
    const isHigher = pct >= 55
    return {
      pct,
      level: 'amarillo',
      deadlineText: isHigher ? '4 - 6 horas' : '2 - 3 horas',
      deadlineHours: isHigher ? 5 : 2.5,
      label: `Stock moderado (${yellowCount} prod. en precaución)`,
      hasRed: false,
      redCount: 0,
      hasYellow: true,
      yellowCount,
      greenCount,
      totalItems: items.length,
      allGreen: false,
    }
  }

  // CASO 3: Todo en VERDE (Stock abundante y seguro)
  const pct = Math.max(70, Math.min(100, avgPct))
  return {
    pct,
    level: 'verde',
    deadlineText: '24 horas (1 día)',
    deadlineHours: 24,
    label: 'Stock seguro y abundante',
    hasRed: false,
    redCount: 0,
    hasYellow: false,
    yellowCount: 0,
    greenCount,
    totalItems: items.length,
    allGreen: true,
  }
}
