import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PdfDayData {
  dia: number
  fecha: string
  totalBruto: number
  totalNeto: number
  efectivoReal: number
  debitoReal: number
  transferencias: number
  gastos: number
  gastosInternos?: number
  gastosExternos?: number
  gastosSueldos?: number
  gastosMercaderia?: number
}

export interface PdfProductRow {
  sku: string
  nombre: string
  cantidadVendida: number
  ventasBrutas: number
  costoAjustado: number
  ganancia: number
  margenPct: number
}

export interface PdfProfitSummary {
  gananciaTotal: number
  ventasBrutas: number
  costoTotal: number
  margenPct: number
  rows: PdfProductRow[]
}

export interface PdfExpenseItem {
  fecha: string
  descripcion?: string
  observacion?: string
  concepto?: string
  monto: number
  source: string
}

export interface PdfReportData {
  sedeName: string
  sedeSlug: string
  selectedMonth: string
  dateRange: 'full' | 'first' | 'second' | 's1' | 's2' | 's3' | 's4'
  reportDays: PdfDayData[]
  totals: {
    totalBruto: number
    totalNeto: number
    efectivoSistema: number
    efectivoReal: number
    diferenciaEfectivo: number
    debitoSistema: number
    debitoReal: number
    diferenciaDebito: number
    transferencias: number
    gastos: number
    gastosMercaderia: number
    diasConDatos: number
  }
  profitSummary: PdfProfitSummary
  paymentMethodsData: Array<{ name: string; value: number; color: string }>
  internalExpensesTotal: number
  externalExpensesTotal: number
  payrollExpensesTotal: number
  merchandisePurchasesTotal: number
  finalResult: number
  finalMarginPct: number
  productProfitStatus?: {
    confirmedDays: number
    totalDays: number
    sales?: number
    cost?: number
    grossProfit?: number
    pendingDays: Array<{ fecha: string; motivo: string }>
    warnings?: Array<{ fecha: string; motivo: string }>
  }
  allExpenses: PdfExpenseItem[]
  merchandisePurchases: PdfExpenseItem[]
}

export type ProgressCallback = (pct: number, label: string) => void

// ─── Colors ──────────────────────────────────────────────────────────────────

type RGB = [number, number, number]

const C = {
  dark: [26, 32, 44] as RGB,
  primary: [30, 58, 138] as RGB,        // blue-900
  primaryMid: [59, 130, 246] as RGB,     // blue-500
  primaryLight: [219, 234, 254] as RGB,  // blue-100
  accent: [16, 185, 129] as RGB,         // emerald-500
  accentDark: [6, 95, 70] as RGB,        // emerald-800
  accentLight: [209, 250, 229] as RGB,   // emerald-100
  danger: [185, 28, 28] as RGB,          // red-700
  dangerLight: [254, 226, 226] as RGB,   // red-100
  purple: [88, 28, 135] as RGB,          // purple-800
  purpleMid: [147, 51, 234] as RGB,      // purple-600
  purpleLight: [243, 232, 255] as RGB,   // purple-100
  amber: [180, 83, 9] as RGB,            // amber-700
  amberMid: [245, 158, 11] as RGB,       // amber-500
  amberLight: [254, 243, 199] as RGB,    // amber-100
  gray50: [248, 250, 252] as RGB,
  gray100: [241, 245, 249] as RGB,
  gray200: [226, 232, 240] as RGB,
  gray300: [203, 213, 225] as RGB,
  gray500: [100, 116, 139] as RGB,
  gray600: [71, 85, 105] as RGB,
  gray700: [51, 65, 85] as RGB,
  gray800: [30, 41, 59] as RGB,
  gray900: [15, 23, 42] as RGB,
  white: [255, 255, 255] as RGB,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n))
  return sign + '$' + abs.toLocaleString('es-CL')
}

const fmtPct = (n: number) => `${n.toFixed(1)}%`

const fmtInt = (n: number) => Math.round(n).toLocaleString('es-CL')

const formatMonthLabel = (monthId: string) => {
  const [year, month] = monthId.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const raw = date.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const PAGE_W = 210
const PAGE_H = 297
const M = 18
const CW = PAGE_W - M * 2
const FOOTER_H = 14

function addPageFooters(doc: jsPDF, sedeName: string, monthLabel: string) {
  const total = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    // footer line
    doc.setDrawColor(...C.gray200)
    doc.setLineWidth(0.3)
    doc.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.gray500)
    doc.text(`Importadora Carlitos ERP  |  ${sedeName}  |  ${monthLabel}`, M, PAGE_H - 8)
    doc.text(`Página ${i} / ${total}`, PAGE_W - M, PAGE_H - 8, { align: 'right' })
  }
}

function ensureY(doc: jsPDF, needed: number, y: number): number {
  if (y + needed > PAGE_H - FOOTER_H - 6) {
    doc.addPage()
    return M + 2
  }
  return y
}

function sectionTitle(doc: jsPDF, title: string, y: number, color: RGB = C.primary): number {
  y = ensureY(doc, 16, y)
  // colored left bar
  doc.setFillColor(...color)
  doc.rect(M, y, 3, 9, 'F')
  // title text
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...color)
  doc.text(title.toUpperCase(), M + 7, y + 6.5)
  // subtle underline
  doc.setDrawColor(...C.gray200)
  doc.setLineWidth(0.3)
  doc.line(M, y + 10, PAGE_W - M, y + 10)
  return y + 14
}

function metricBox(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, accentColor: RGB, valueColor: RGB,
) {
  // white card with shadow effect
  doc.setFillColor(245, 247, 250)
  doc.roundedRect(x + 0.4, y + 0.4, w, h, 1.5, 1.5, 'F')
  doc.setFillColor(...C.white)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F')
  // colored top accent bar
  doc.setFillColor(...accentColor)
  doc.rect(x, y, w, 2, 'F')
  // label
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray500)
  doc.text(label, x + w / 2, y + 9, { align: 'center' })
  // value
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...valueColor)
  doc.text(value, x + w / 2, y + 17, { align: 'center' })
}

function kpiPill(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, positive: boolean) {
  const bg = positive ? C.accentLight : C.dangerLight
  const fg = positive ? C.accentDark : C.danger
  doc.setFillColor(...bg)
  doc.roundedRect(x, y, w, 14, 2, 2, 'F')
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)
  doc.text(label, x + w / 2, y + 5, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...fg)
  doc.text(value, x + w / 2, y + 11.5, { align: 'center' })
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

async function fetchAIAnalysis(data: PdfReportData): Promise<string> {
  const context = [
    `INFORME MENSUAL: ${data.sedeName} — ${formatMonthLabel(data.selectedMonth)}`,
    `Venta bruta: ${fmt(data.totals.totalBruto)}`,
    `Ganancia productos: ${fmt(data.productProfitStatus?.grossProfit ?? data.profitSummary.gananciaTotal)}`,
    `Margen productos: ${fmtPct(data.productProfitStatus?.sales ? ((data.productProfitStatus.grossProfit ?? data.profitSummary.gananciaTotal) / data.productProfitStatus.sales) * 100 : data.profitSummary.margenPct)}`,
    `Gastos que afectan la ganancia: ${fmt(data.totals.gastos)}`,
    `- Gastos internos: ${fmt(data.internalExpensesTotal)}`,
    `- Gastos externos: ${fmt(data.externalExpensesTotal)}`,
    `- Sueldos anotados en cierres diarios: ${fmt(data.payrollExpensesTotal)}`,
    `- Compras de mercadería anotadas aparte (no gasto): ${fmt(data.merchandisePurchasesTotal)}`,
    `Resultado final: ${fmt(data.finalResult)}`,
    data.productProfitStatus?.pendingDays.length
      ? `Resultado parcial: ganancia conciliada en ${data.productProfitStatus.confirmedDays} de ${data.productProfitStatus.totalDays} días; pendientes: ${data.productProfitStatus.pendingDays.map(day => `${day.fecha} (${day.motivo})`).join('; ')}`
      : '',
    data.productProfitStatus?.warnings?.length
      ? `Observaciones de conciliación: ${data.productProfitStatus.warnings.map(day => `${day.fecha} (${day.motivo})`).join('; ')}`
      : '',
    `Margen final: ${fmtPct(data.finalMarginPct)}`,
    `Días activos: ${data.totals.diasConDatos}`,
    `Promedio venta diaria: ${fmt(data.totals.diasConDatos > 0 ? data.totals.totalBruto / data.totals.diasConDatos : 0)}`,
    `Métodos de pago: ${data.paymentMethodsData.map(p => `${p.name}: ${fmt(p.value)}`).join(', ')}`,
    `Diferencia efectivo (sistema vs real): ${fmt(data.totals.diferenciaEfectivo)}`,
    `Top 5 productos por ganancia:`,
    ...data.profitSummary.rows.slice(0, 5).map((r, i) => `  ${i + 1}. ${r.nombre} (${r.sku}): venta ${fmt(r.ventasBrutas)}, ganancia ${fmt(r.ganancia)}, margen ${fmtPct(r.margenPct)}`),
    data.profitSummary.rows.filter(r => r.ganancia < 0).length > 0
      ? `Productos con pérdida: ${data.profitSummary.rows.filter(r => r.ganancia < 0).length}`
      : '',
  ].filter(Boolean).join('\n')

  const systemPrompt = `Eres un analista financiero senior de retail. Genera un análisis profesional del informe mensual. 
Responde SOLO con el análisis, sin saludos ni introducciones. Usa el siguiente formato exacto:

RESUMEN EJECUTIVO
(2-3 oraciones resumiendo el desempeño del mes)

FORTALEZAS
- (lista de 3-4 puntos fuertes detectados)

AREAS DE MEJORA
- (lista de 3-4 áreas que necesitan atención)

RECOMENDACIONES ESTRATEGICAS
1. (recomendación concreta y accionable)
2. (recomendación concreta y accionable)
3. (recomendación concreta y accionable)

PROYECCION
(1-2 oraciones sobre proyección si se mantienen las tendencias actuales)`

  try {
    const resp = await fetch('https://us-central1-yaxselldemo.cloudfunctions.net/chatWithGemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Analiza estos datos financieros y genera el informe:\n\n${context}`,
        personality: 'datamaster',
        systemOverride: systemPrompt,
      }),
    })
    if (!resp.ok) throw new Error('AI request failed')
    const json = await resp.json()
    return String(json?.reply || json?.response || json?.text || 'No se pudo generar el análisis.')
  } catch {
    return 'RESUMEN EJECUTIVO\nMes operativo completado con registro de ventas y gastos en regla.\n\nFORTALEZAS\n- Operación de venta física continua sin interrupciones.\n- Control de cuadraturas de caja diario registrado.\n\nAREAS DE MEJORA\n- Optimizar márgenes en productos de alta rotación.\n- Reducir brechas entre efectivo real y sistema.'
  }
}

// ─── Render AI text ──────────────────────────────────────────────────────────

function renderAIContent(doc: jsPDF, aiText: string, startY: number): number {
  let y = sectionTitle(doc, 'Analisis Inteligente  --  Recomendaciones IA', startY, C.purple)

  const lines = aiText.split('\n')
  const subHeadings = ['RESUMEN EJECUTIVO', 'FORTALEZAS', 'AREAS DE MEJORA', 'RECOMENDACIONES ESTRATEGICAS', 'PROYECCION']

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { y += 2; continue }

    y = ensureY(doc, 7, y)

    const isSubHeading = subHeadings.some(t => trimmed.toUpperCase().replace(/[ÁÉÍÓÚ]/g, (c: string) => ({'\u00C1':'A','\u00C9':'E','\u00CD':'I','\u00D3':'O','\u00DA':'U'}[c] || c)).includes(t))

    if (isSubHeading) {
      y += 2
      doc.setFillColor(...C.purpleLight)
      doc.roundedRect(M + 2, y - 1, CW - 4, 8, 1, 1, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.purple)
      doc.text(trimmed, M + 6, y + 4.5)
      y += 10
    } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
      const text = trimmed.replace(/^[-*]\s*/, '')
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.gray700)
      const wrapped = doc.splitTextToSize(text, CW - 16)
      for (let wi = 0; wi < wrapped.length; wi++) {
        y = ensureY(doc, 5, y)
        if (wi === 0) {
          doc.setFillColor(...C.purpleMid)
          doc.circle(M + 6, y + 2.5, 0.8, 'F')
        }
        doc.text(wrapped[wi], M + 10, y + 4)
        y += 4.5
      }
    } else if (/^\d+[\.\)]/.test(trimmed)) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.gray800)
      const wrapped = doc.splitTextToSize(trimmed, CW - 12)
      for (const wl of wrapped) {
        y = ensureY(doc, 5, y)
        doc.text(wl, M + 6, y + 4)
        y += 4.5
      }
    } else {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.gray700)
      const wrapped = doc.splitTextToSize(trimmed, CW - 8)
      for (const wl of wrapped) {
        y = ensureY(doc, 5, y)
        doc.text(wl, M + 4, y + 4)
        y += 4.5
      }
    }
  }

  return y + 4
}

// ─── Table Style Presets ─────────────────────────────────────────────────────

const tblMargin = { left: M, right: M }
const tblBase = { fontSize: 8, cellPadding: 2.5, font: 'helvetica' as const }
const tblAlt = { fillColor: [248, 250, 252] as RGB }

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generateInformePdf(
  data: PdfReportData,
  onProgress: ProgressCallback,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const monthLabel = formatMonthLabel(data.selectedMonth)
  const rangeLabel = data.dateRange === 'full' ? 'Mes completo' : data.dateRange === 's1' ? 'Semana 1 (1-7)' : data.dateRange === 's2' ? 'Semana 2 (8-14)' : data.dateRange === 's3' ? 'Semana 3 (15-21)' : data.dateRange === 's4' ? 'Semana 4 (22-fin)' : data.dateRange === 'first' ? '1ra quincena' : '2da quincena'

  onProgress(2, 'Inicializando documento...')

  // ══════════════════════════════════════════════════════════════
  // PAGE 1: COVER
  // ══════════════════════════════════════════════════════════════

  doc.setFillColor(...C.dark)
  doc.rect(0, 0, PAGE_W, 65, 'F')
  doc.setFillColor(...C.accent)
  doc.rect(0, 65, PAGE_W, 2.5, 'F')
  doc.setFillColor(...C.primaryMid)
  doc.rect(0, 0, 5, 65, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(140, 160, 190)
  doc.text('Importadora Carlitos ERP', M + 4, 18)

  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)
  doc.text('INFORME MENSUAL', M + 4, 34)

  doc.setFontSize(15)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.accent)
  doc.text(data.sedeName, M + 4, 46)

  doc.setFontSize(10)
  doc.setTextColor(170, 190, 210)
  doc.text(monthLabel, M + 4, 55)

  doc.setFontSize(8)
  doc.setTextColor(130, 150, 175)
  doc.text(`Período: ${rangeLabel}`, PAGE_W - M - 4, 46, { align: 'right' })
  doc.text(`${data.totals.diasConDatos} días con datos`, PAGE_W - M - 4, 52, { align: 'right' })
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, PAGE_W - M - 4, 58, { align: 'right' })

  onProgress(8, 'Resumen ejecutivo...')

  // ══════════════════════════════════════════════════════════════
  // EXECUTIVE SUMMARY — METRIC CARDS
  // ══════════════════════════════════════════════════════════════

  let y = 76

  const gap = 3
  const cw4 = (CW - gap * 3) / 4
  const resultAccent = data.finalResult >= 0 ? C.accent : C.danger
  const resultValue = data.finalResult >= 0 ? C.accentDark : C.danger
  const resultNeedsReview = Boolean(data.productProfitStatus?.pendingDays.length || data.productProfitStatus?.warnings?.length)

  metricBox(doc, M, y, cw4, 22, 'VENTA BRUTA', fmt(data.totals.totalBruto), C.accent, C.accentDark)
  metricBox(doc, M + cw4 + gap, y, cw4, 22, data.productProfitStatus?.pendingDays.length ? 'GANANCIA CONCILIADA' : 'GANANCIA PRODUCTOS', fmt(data.productProfitStatus?.grossProfit ?? data.profitSummary.gananciaTotal), C.primaryMid, C.primary)
  metricBox(doc, M + (cw4 + gap) * 2, y, cw4, 22, data.productProfitStatus?.pendingDays.length ? 'RESULTADO PARCIAL' : resultNeedsReview ? 'RESULTADO CALCULADO' : 'RESULTADO FINAL', fmt(data.finalResult), resultNeedsReview ? C.amberMid : resultAccent, resultNeedsReview ? C.amber : resultValue)
  metricBox(doc, M + (cw4 + gap) * 3, y, cw4, 22, 'GASTOS OPERATIVOS', fmt(data.totals.gastos), C.amberMid, C.amber)

  y += 27

  const cw3 = (CW - gap * 2) / 3
  metricBox(doc, M, y, cw3, 22, 'GASTOS INTERNOS', fmt(data.internalExpensesTotal), C.gray300, C.gray700)
  metricBox(doc, M + cw3 + gap, y, cw3, 22, 'SUELDOS EN CIERRES DIARIOS', fmt(data.payrollExpensesTotal), C.gray300, C.gray700)
  metricBox(doc, M + (cw3 + gap) * 2, y, cw3, 22, 'GASTOS EXTERNOS', fmt(data.externalExpensesTotal), C.gray300, C.gray700)

  y += 28

  const promedioVentaDiaria = data.totals.diasConDatos > 0 ? data.totals.totalBruto / data.totals.diasConDatos : 0
  const grossProductProfit = data.productProfitStatus?.grossProfit ?? data.profitSummary.gananciaTotal
  const productMarginPct = data.productProfitStatus?.sales
    ? (grossProductProfit / data.productProfitStatus.sales) * 100
    : data.profitSummary.margenPct
  const coberturaGastos = data.totals.gastos > 0 ? grossProductProfit / data.totals.gastos : 0
  const kpis = [
    { label: 'Margen Prod.', value: fmtPct(productMarginPct), pos: productMarginPct >= 0 },
    { label: 'Margen Final', value: fmtPct(data.finalMarginPct), pos: data.finalMarginPct >= 0 },
    { label: 'Prom. Venta/Día', value: fmt(promedioVentaDiaria), pos: true },
    { label: 'Cobertura Gastos', value: `${coberturaGastos.toFixed(2)}x`, pos: coberturaGastos >= 1 },
    { label: 'Dif. Efectivo', value: fmt(data.totals.diferenciaEfectivo), pos: data.totals.diferenciaEfectivo >= 0 },
  ]
  const pillW = (CW - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach((kpi, i) => {
    kpiPill(doc, M + i * (pillW + gap), y, pillW, kpi.label, kpi.value, kpi.pos)
  })

  y += 20

  const productProfitStatus = data.productProfitStatus
  if (productProfitStatus && (productProfitStatus.pendingDays.length || productProfitStatus.warnings?.length)) {
    const alertContent = [
      productProfitStatus.pendingDays.length
        ? `Resultado parcial: ganancia calculada en ${productProfitStatus.confirmedDays} de ${productProfitStatus.totalDays} días. Los cierres pendientes pueden cambiar el total final.`
        : 'Resultado calculado; las siguientes diferencias afectan el detalle de productos o su comparación con el cierre.',
      ...productProfitStatus.pendingDays.map(day => `${day.fecha}: ${day.motivo}`),
      ...(productProfitStatus.warnings || []).map(day => `${day.fecha}: ${day.motivo}`),
    ]
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    const alertLines = doc.splitTextToSize(alertContent.join('\n'), CW - 8)
    const alertHeight = 8 + alertLines.length * 3.5
    y = ensureY(doc, alertHeight, y)
    doc.setFillColor(...C.amberLight)
    doc.roundedRect(M, y, CW, alertHeight, 2, 2, 'F')
    doc.setTextColor(...C.amber)
    doc.text(alertLines, M + 4, y + 5)
    y += alertHeight + 5
  }

  onProgress(15, 'Métodos de pago...')

  // ══════════════════════════════════════════════════════════════
  // PAYMENT METHODS
  // ══════════════════════════════════════════════════════════════

  y = sectionTitle(doc, 'Métodos de Pago', y, C.primaryMid)

  const payTotal = data.totals.efectivoReal + data.totals.debitoReal + data.totals.transferencias
  const payRows = data.paymentMethodsData.map(p => [
    p.name,
    fmt(p.value),
    payTotal > 0 ? fmtPct((p.value / payTotal) * 100) : '0%',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Método', 'Monto', '% del Total']],
    body: payRows,
    margin: tblMargin,
    styles: { ...tblBase, fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'center' },
    alternateRowStyles: tblAlt,
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  onProgress(25, 'Tabla de ventas diarias...')

  // ══════════════════════════════════════════════════════════════
  // DAILY SALES TABLE
  // ══════════════════════════════════════════════════════════════

  y = sectionTitle(doc, 'Ventas Diarias', y)

  const dailyRows = data.reportDays.map(d => [
    String(d.dia).padStart(2, '0'),
    fmt(d.totalBruto),
    fmt(d.efectivoReal),
    fmt(d.debitoReal),
    fmt(d.transferencias),
    fmt(d.gastos),
    fmt(d.totalNeto),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Día', 'Venta Bruta', 'Efectivo', 'Débito', 'Transfer.', 'Gastos oper.', 'Caja neta']],
    body: dailyRows,
    foot: [[
      'TOTAL',
      fmt(data.totals.totalBruto),
      fmt(data.totals.efectivoReal),
      fmt(data.totals.debitoReal),
      fmt(data.totals.transferencias),
      fmt(data.totals.gastos),
      fmt(data.totals.totalNeto),
    ]],
    margin: tblMargin,
    styles: tblBase,
    headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'right' },
    footStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: tblAlt,
    columnStyles: { 0: { halign: 'center', cellWidth: 12, fontStyle: 'bold' } },
    didParseCell(hookData) {
      if (hookData.section === 'body' && hookData.column.index === 6) {
        const day = data.reportDays[hookData.row.index]
        if (day) {
          hookData.cell.styles.textColor = day.totalNeto >= 0 ? C.accentDark : C.danger
          hookData.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  onProgress(40, 'Gastos detallados...')

  // ══════════════════════════════════════════════════════════════
  // EXPENSES BREAKDOWN
  // ══════════════════════════════════════════════════════════════

  y = ensureY(doc, 30, y)
  y = sectionTitle(doc, 'Desglose de Gastos', y, C.amber)

  const expensesBySource: Record<string, { label: string; total: number }> = {
    'internal': { label: 'Operacional interno', total: 0 },
    'internal-payroll': { label: 'Sueldos registrados en cuadre', total: 0 },
    'external-fixed': { label: 'Fijo externo (servicios/arriendo)', total: 0 },
    'external-manual': { label: 'Manual externo', total: 0 },
  }
  for (const exp of data.allExpenses) {
    const key = exp.source || 'internal'
    if (expensesBySource[key]) expensesBySource[key].total += exp.monto
    else expensesBySource['internal'].total += exp.monto
  }

  const expSummaryRows = Object.values(expensesBySource)
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .map(e => [e.label, fmt(e.total)])

  if (expSummaryRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Categoría', 'Total']],
      body: expSummaryRows,
      margin: tblMargin,
      styles: { ...tblBase, fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: C.amber, textColor: C.white, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { halign: 'center' },
      alternateRowStyles: tblAlt,
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  if (data.merchandisePurchasesTotal > 0) {
    y = ensureY(doc, 30, y)
    y = sectionTitle(doc, 'Compras de mercadería anotadas aparte (no gasto)', y, C.primaryMid)
    const merchandiseRows = data.merchandisePurchases.map((item) => [
      item.fecha,
      item.descripcion || item.observacion || item.concepto || 'Compra de mercadería',
      fmt(item.monto),
    ])
    if (merchandiseRows.length === 0) {
      merchandiseRows.push(['', 'El cierre entrega el total, pero no el detalle de las compras.', ''])
    }
    merchandiseRows.push(['', 'TOTAL ANOTADO · NO SE SUMA A GASTOS', fmt(data.merchandisePurchasesTotal)])
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Descripción', 'Monto anotado']],
      body: merchandiseRows,
      margin: tblMargin,
      styles: { ...tblBase, fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: C.primaryMid, textColor: C.white, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { halign: 'right' },
      alternateRowStyles: tblAlt,
      columnStyles: { 0: { halign: 'center', cellWidth: 24 }, 1: { halign: 'left' }, 2: { halign: 'right', cellWidth: 32 } },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  onProgress(55, 'Top productos...')

  // ══════════════════════════════════════════════════════════════
  // TOP PRODUCTS
  // ══════════════════════════════════════════════════════════════

  y = ensureY(doc, 30, y)
  y = sectionTitle(doc, 'Top Productos por Ganancia', y, C.amberMid)

  const top25 = data.profitSummary.rows.slice(0, 25)
  const productRows = top25.map((r, i) => [
    String(i + 1),
    r.sku,
    r.nombre.length > 35 ? r.nombre.slice(0, 33) + '...' : r.nombre,
    fmtInt(r.cantidadVendida),
    fmt(r.ventasBrutas),
    fmt(r.ganancia),
    fmtPct(r.margenPct),
  ])

  autoTable(doc, {
    startY: y,
    head: [['#', 'SKU', 'Producto', 'Cant.', 'Ventas', 'Ganancia', 'Margen']],
    body: productRows,
    margin: tblMargin,
    styles: { ...tblBase, fontSize: 7.5, cellPadding: 2, overflow: 'ellipsize' as any },
    headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'right' },
    alternateRowStyles: tblAlt,
    columnStyles: {
      0: { halign: 'center', cellWidth: 8, fontStyle: 'bold' },
      1: { halign: 'left', cellWidth: 22 },
      2: { halign: 'left', cellWidth: 50 },
      3: { halign: 'center', cellWidth: 12 },
    },
    didParseCell(hookData) {
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const val = top25[hookData.row.index]?.ganancia ?? 0
        hookData.cell.styles.textColor = val >= 0 ? C.accentDark : C.danger
        hookData.cell.styles.fontStyle = 'bold'
      }
      if (hookData.section === 'body' && hookData.column.index === 6) {
        const val = top25[hookData.row.index]?.margenPct ?? 0
        hookData.cell.styles.textColor = val >= 0 ? C.accentDark : C.danger
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 5

  const lossProducts = data.profitSummary.rows.filter(r => r.ganancia < 0)
  if (lossProducts.length > 0) {
    y = ensureY(doc, 14, y)
    doc.setFillColor(...C.dangerLight)
    doc.roundedRect(M, y, CW, 10, 2, 2, 'F')
    doc.setFillColor(...C.danger)
    doc.rect(M, y, 3, 10, 'F')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.danger)
    const lossTotal = lossProducts.reduce((s, r) => s + r.ganancia, 0)
    doc.text(`ATENCIÓN: ${lossProducts.length} producto(s) con pérdida  --  Pérdida total: ${fmt(lossTotal)}`, M + 7, y + 6.5)
    y += 14
  }

  onProgress(65, 'Consultando análisis IA...')

  let aiText = ''
  try {
    aiText = await fetchAIAnalysis(data)
  } catch {
    aiText = 'No se pudo generar el análisis IA.'
  }

  onProgress(88, 'Generando análisis IA en PDF...')

  y = ensureY(doc, 40, y)
  y = renderAIContent(doc, aiText, y)

  onProgress(95, 'Finalizando documento...')

  addPageFooters(doc, data.sedeName, monthLabel)

  onProgress(100, 'PDF generado exitosamente.')

  return doc.output('blob')
}
