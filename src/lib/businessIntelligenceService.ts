/**
 * businessIntelligenceService.ts
 *
 * Construye un snapshot del negocio desde Firestore para alimentar al Contador IA.
 * Lee: cuadres_erp, ventas_pos, products, trabajadores_erp, external_expenses.
 *
 * Server-side only (usa firebase-admin).
 */
import { getAdminDb } from './db-server'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ProductPerformance {
  sku: string
  nombre: string
  cantidadVendida: number
  ventasBrutas: number
  costoNeto: number
  ganancia: number
  margen: number
  precioPromedio: number
  costoUnitario: number
}

export interface CashierPerformance {
  nombre: string
  ventasCount: number
  totalBruto: number
  efectivo: number
  transferencia: number
  debito: number
  vueltos: number
  diferencia: number
  promedioVenta: number
}

export interface DaySummary {
  fecha: string
  sede: string
  totalVentas: number
  totalBruto: number
  totalGanancia: number
  totalGastos: number
  efectivoSistema: number
  efectivoReal: number
  transferencia: number
  diferenciaCaja: number
  boletasCount: number
  anuladasCount: number
  devolucionesCount: number
  topProducts: ProductPerformance[]
  cajeras: CashierPerformance[]
  gastos: { detalle: string; monto: number }[]
}

export interface BusinessSnapshot {
  sede: string
  sedeName: string
  fecha: string
  diaSemana: string
  day: DaySummary
  // Comparación con días anteriores
  ventaAyer: number | null
  ventaPromedioSemana: number | null
  tendencia: 'subiendo' | 'estable' | 'bajando' | 'sin_datos'
  // Productos
  topProductosGanancia: ProductPerformance[]
  topProductosCantidad: ProductPerformance[]
  peoresProductos: ProductPerformance[]
  productosBajoCosto: ProductPerformance[]
  // Alertas
  alertas: { tipo: 'danger' | 'warning' | 'info'; mensaje: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

function diaSemana(fecha: string): string {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const d = new Date(fecha + 'T12:00:00')
  return dias[d.getDay()] || ''
}

// ─── Construir snapshot del día ──────────────────────────────────────────────

export async function buildDaySnapshot(sede: string, fecha: string): Promise<DaySummary> {
  const db = getAdminDb()

  // 1. Cuadre del día
  const cuadreSnap = await db.collection('cuadres_erp')
    .where('sede', '==', sede)
    .where('fecha', '==', fecha)
    .limit(1)
    .get()

  const cuadre = cuadreSnap.empty ? null : cuadreSnap.docs[0].data() as any

  // 2. Ventas POS del día (solo para contar boletas)
  const ventasSnap = await db.collection('ventas_pos')
    .where('sede', '==', sede)
    .where('fechaStr', '==', fecha)
    .limit(500)
    .get()

  const ventas = ventasSnap.docs
    .map(d => ({ $id: d.id, ...d.data() } as any))
    .filter(d => d.estado !== 'anulada' && d.estado !== 'pre_venta')

  // 3. Productos desde topProducts del cuadre (ya tiene costoNeto y ventasNetas calculados)
  const topProductsRaw = Array.isArray(cuadre?.topProducts) ? cuadre.topProducts : []
  const topProducts: ProductPerformance[] = topProductsRaw.map((p: any) => {
    const cantidad = Number(p.cantidadVendida) || 0
    const ventasBrutas = Number(p.ventasBrutas) || 0
    const costoNeto = Number(p.costoNeto) || 0
    const ganancia = Number(p.ventasNetas) || (ventasBrutas - costoNeto)
    const precioPromedio = cantidad > 0 ? ventasBrutas / cantidad : 0
    const costoUnitario = cantidad > 0 ? costoNeto / cantidad : 0
    const margen = ventasBrutas > 0 ? Math.round((ganancia / ventasBrutas) * 100) : 0
    return {
      sku: String(p.sku || '').toUpperCase(),
      nombre: String(p.nombre || ''),
      cantidadVendida: cantidad,
      ventasBrutas,
      costoNeto,
      ganancia,
      margen,
      precioPromedio,
      costoUnitario,
    }
  }).sort((a: ProductPerformance, b: ProductPerformance) => b.cantidadVendida - a.cantidadVendida)

  // 4. Cajeras desde montosPorCajera
  const montosPorCajera = cuadre?.montosPorCajera || {}
  const cajerosListos = Array.isArray(cuadre?.cajerosListos) ? cuadre.cajerosListos : []
  const cajeras: CashierPerformance[] = cajerosListos.map((nombre: string) => {
    const m = montosPorCajera[nombre] || {}
    const ventasCount = Number(m.ventasCount) || 0
    const totalBruto = Number(m.totalBruto) || 0
    return {
      nombre,
      ventasCount,
      totalBruto,
      efectivo: Number(m.efectivo) || 0,
      transferencia: Number(m.transferencia) || 0,
      debito: Number(m.debito) || 0,
      vueltos: Number(m.vueltos) || 0,
      diferencia: Number(m.diferencia) || 0,
      promedioVenta: ventasCount > 0 ? Math.round(totalBruto / ventasCount) : 0,
    }
  }).sort((a: CashierPerformance, b: CashierPerformance) => b.totalBruto - a.totalBruto)

  // 5. Gastos
  const gastosRaw = Array.isArray(cuadre?.gastos) ? cuadre.gastos : []
  const gastos: { detalle: string; monto: number }[] = gastosRaw.map((g: any) => ({
    detalle: String(g?.observacion || g?.detalle || 'Sin detalle'),
    monto: Number(g?.monto) || 0,
  }))

  // 6. Anuladas y devoluciones
  const anuladas = Array.isArray(cuadre?.anuladas) ? cuadre.anuladas : []
  const devoluciones = Array.isArray(cuadre?.devoluciones) ? cuadre.devoluciones : []

  // 7. Totales
  const totalBruto = cajeras.reduce((s: number, c: CashierPerformance) => s + c.totalBruto, 0)
  const totalGanancia = topProducts.reduce((s: number, p: ProductPerformance) => s + p.ganancia, 0)
  const totalGastos = gastos.reduce((s: number, g: { monto: number }) => s + g.monto, 0)

  return {
    fecha,
    sede,
    totalVentas: ventas.length,
    totalBruto,
    totalGanancia,
    totalGastos,
    efectivoSistema: Number(cuadre?.montos?.efectivoSistema) || 0,
    efectivoReal: Number(cuadre?.montos?.efectivoReal) || 0,
    transferencia: Number(cuadre?.montos?.transferencias) || 0,
    diferenciaCaja: Number(cuadre?.calculos?.diferenciaEfectivo) || 0,
    boletasCount: ventas.length,
    anuladasCount: anuladas.length,
    devolucionesCount: devoluciones.length,
    topProducts,
    cajeras,
    gastos,
  }
}

// ─── Snapshot completo para IA ────────────────────────────────────────────────

export async function buildBusinessSnapshot(sede: string, fecha: string): Promise<BusinessSnapshot> {
  const db = getAdminDb()
  const sedeNames: Record<string, string> = {
    'donbalato-central': 'Importadora Carlitos Central',
    'donbalato-maipu': 'Importadora Carlitos Maipú',
    'donbalato-san-bernardo': 'Importadora Carlitos San Bernardo',
    'donbalato-puente-alto': 'Importadora Carlitos Puente Alto',
  }

  const day = await buildDaySnapshot(sede, fecha)

  // Comparación con días anteriores (últimos 7 días)
  const fechaDate = new Date(fecha + 'T12:00:00')
  const ventasSemana: number[] = []
  let ventaAyer: number | null = null

  for (let i = 1; i <= 7; i++) {
    const d = new Date(fechaDate)
    d.setDate(d.getDate() - i)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const snap = await db.collection('cuadres_erp')
      .where('sede', '==', sede)
      .where('fecha', '==', ymd)
      .limit(1)
      .get()
    if (!snap.empty) {
      const c = snap.docs[0].data() as any
      const montos = c.montosPorCajera || {}
      const total = Object.values(montos).reduce((s: number, m: any) => s + (Number(m?.totalBruto) || 0), 0)
      ventasSemana.push(total)
      if (i === 1) ventaAyer = total
    }
  }

  const ventaPromedioSemana = ventasSemana.length > 0
    ? Math.round(ventasSemana.reduce((s, v) => s + v, 0) / ventasSemana.length)
    : null

  let tendencia: BusinessSnapshot['tendencia'] = 'sin_datos'
  if (ventaAyer !== null && ventaPromedioSemana !== null) {
    if (day.totalBruto > ventaAyer * 1.1) tendencia = 'subiendo'
    else if (day.totalBruto < ventaAyer * 0.9) tendencia = 'bajando'
    else tendencia = 'estable'
  }

  // Top productos por ganancia
  const topProductosGanancia = [...day.topProducts]
    .sort((a, b) => b.ganancia - a.ganancia)
    .slice(0, 15)

  // Top productos por cantidad
  const topProductosCantidad = [...day.topProducts]
    .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
    .slice(0, 15)

  // Peores productos (margen negativo o muy bajo)
  const peoresProductos = [...day.topProducts]
    .filter(p => p.margen < 10)
    .sort((a, b) => a.margen - b.margen)
    .slice(0, 10)

  // Productos bajo costo (ganancia negativa)
  const productosBajoCosto = [...day.topProducts]
    .filter(p => p.ganancia < 0)
    .sort((a, b) => a.ganancia - b.ganancia)

  // Alertas
  const alertas: BusinessSnapshot['alertas'] = []
  if (productosBajoCosto.length > 0) {
    alertas.push({
      tipo: 'danger',
      mensaje: `${productosBajoCosto.length} producto(s) vendido(s) bajo costo (pérdida directa)`,
    })
  }
  if (day.diferenciaCaja < -1000) {
    alertas.push({
      tipo: 'warning',
      mensaje: `Faltante de caja de ${money(Math.abs(day.diferenciaCaja))}`,
    })
  }
  if (day.diferenciaCaja > 1000) {
    alertas.push({
      tipo: 'warning',
      mensaje: `Sobrante de caja de ${money(day.diferenciaCaja)}`,
    })
  }
  if (day.totalGanancia < 0) {
    alertas.push({
      tipo: 'danger',
      mensaje: `Pérdida neta del día: ${money(Math.abs(day.totalGanancia))}`,
    })
  }
  if (peoresProductos.length > 5) {
    alertas.push({
      tipo: 'warning',
      mensaje: `${peoresProductos.length} productos con margen bajo 10%`,
    })
  }

  return {
    sede,
    sedeName: sedeNames[sede] || sede,
    fecha,
    diaSemana: diaSemana(fecha),
    day,
    ventaAyer,
    ventaPromedioSemana,
    tendencia,
    topProductosGanancia,
    topProductosCantidad,
    peoresProductos,
    productosBajoCosto,
    alertas,
  }
}

// ─── Convertir snapshot a contexto de prompt ─────────────────────────────────

export function snapshotToPromptContext(snap: BusinessSnapshot): string {
  const f = money
  const lines: string[] = []

  lines.push(`=== DATOS REALES DE ${snap.sedeName.toUpperCase()} — ${snap.fecha} (${snap.diaSemana}) ===`)
  lines.push('')

  lines.push('--- INDICADORES DEL DÍA ---')
  lines.push(`  Boletas emitidas: ${snap.day.boletasCount}`)
  lines.push(`  Total vendido: ${f(snap.day.totalBruto)}`)
  lines.push(`  Ganancia productos: ${f(snap.day.totalGanancia)}`)
  lines.push(`  Margen promedio: ${snap.day.totalBruto > 0 ? Math.round((snap.day.totalGanancia / snap.day.totalBruto) * 100) : 0}%`)
  lines.push(`  Gastos: ${f(snap.day.totalGastos)}`)
  lines.push(`  Efectivo sistema: ${f(snap.day.efectivoSistema)}`)
  lines.push(`  Efectivo real: ${f(snap.day.efectivoReal)}`)
  lines.push(`  Transferencia: ${f(snap.day.transferencia)}`)
  lines.push(`  Diferencia caja: ${f(snap.day.diferenciaCaja)}`)
  lines.push(`  Anuladas: ${snap.day.anuladasCount} | Devoluciones: ${snap.day.devolucionesCount}`)
  lines.push('')

  if (snap.ventaAyer !== null) {
    lines.push('--- COMPARACIÓN ---')
    lines.push(`  Venta ayer: ${f(snap.ventaAyer)}`)
    lines.push(`  Promedio semana: ${snap.ventaPromedioSemana ? f(snap.ventaPromedioSemana) : 'sin datos'}`)
    lines.push(`  Tendencia: ${snap.tendencia.toUpperCase()}`)
    lines.push('')
  }

  if (snap.alertas.length > 0) {
    lines.push('--- ⚠️ ALERTAS DETECTADAS ---')
    snap.alertas.forEach(a => lines.push(`  [${a.tipo.toUpperCase()}] ${a.mensaje}`))
    lines.push('')
  }

  lines.push('--- RENDIMIENTO DE CAJERAS ---')
  snap.day.cajeras.forEach((c, i) => {
    lines.push(`  ${i + 1}. ${c.nombre}: ${c.ventasCount} ventas | Total: ${f(c.totalBruto)} | Promedio: ${f(c.promedioVenta)} | Efectivo: ${f(c.efectivo)} | Transf: ${f(c.transferencia)} | Dif caja: ${f(c.diferencia)}`)
  })
  lines.push('')

  if (snap.day.gastos.length > 0) {
    lines.push('--- GASTOS DETALLADOS ---')
    snap.day.gastos.forEach(g => lines.push(`  ${g.detalle}: ${f(g.monto)}`))
    lines.push('')
  }

  lines.push('--- TOP 15 PRODUCTOS POR CANTIDAD VENDIDA ---')
  snap.topProductosCantidad.forEach((p, i) => {
    lines.push(`  ${i + 1}. [${p.sku}] ${p.nombre} — Cant: ${p.cantidadVendida} | Precio prom: ${f(p.precioPromedio)} | Costo unit: ${f(p.costoUnitario)} | Gan: ${f(p.ganancia)} | Margen: ${p.margen}%`)
  })
  lines.push('')

  lines.push('--- TOP 15 PRODUCTOS POR GANANCIA ---')
  snap.topProductosGanancia.forEach((p, i) => {
    lines.push(`  ${i + 1}. [${p.sku}] ${p.nombre} — Gan: ${f(p.ganancia)} | Cant: ${p.cantidadVendida} | Margen: ${p.margen}%`)
  })
  lines.push('')

  if (snap.peoresProductos.length > 0) {
    lines.push('--- PRODUCTOS CON MARGEN BAJO 10% ---')
    snap.peoresProductos.forEach((p, i) => {
      lines.push(`  ${i + 1}. [${p.sku}] ${p.nombre} — Margen: ${p.margen}% | Precio: ${f(p.precioPromedio)} | Costo: ${f(p.costoUnitario)} | Gan: ${f(p.ganancia)}`)
    })
    lines.push('')
  }

  if (snap.productosBajoCosto.length > 0) {
    lines.push('--- 🚨 PRODUCTOS VENDIDOS BAJO COSTO (PÉRDIDA) ---')
    snap.productosBajoCosto.forEach((p, i) => {
      lines.push(`  ${i + 1}. [${p.sku}] ${p.nombre} — Pérdida: ${f(Math.abs(p.ganancia))} | Precio: ${f(p.precioPromedio)} | Costo: ${f(p.costoUnitario)} | Cant: ${p.cantidadVendida}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}
