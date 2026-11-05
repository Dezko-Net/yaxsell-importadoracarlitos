// Comprobante interno térmico de 80 mm. No emite documentos tributarios.
// Formato profesional basado en ERP Asistora

import { getEmbalajeHtmlParts, formatProductCodeLabel, resolveEmbalajeQty } from './embalajeHelper'
import { esCompraMercaderia } from './gastosProfit'

export type ReceiptPayment = {
  metodo: string
  monto: number
}

export type ReceiptItem = {
  sku?: string
  nombre: string
  cantidad: number
  precioUnitario: number
  descuentoPct?: number
  subtotal: number
  embalajeQty?: number | null
  packageQty?: string | number | null
  boxCode?: string | null
}

export type ReceiptCompanyConfig = {
  nombreEmpresa?: string
  rut?: string
  giro?: string
  direccion?: string
  telefono?: string
  email?: string
  sucursalLinea?: string
  clienteNombre?: string
  clienteRut?: string
  ivaPorcentaje?: number
}

export type ReceiptData = {
  tipoComprobante?: 'boleta' | 'factura' | 'comprobante'
  folio?: number
  fechaHora?: string
  cajeraNombre?: string
  sedeNombre: string
  items: ReceiptItem[]
  subtotal: number
  descuentoGlobalMonto?: number
  descuentoGlobal?: number
  descuentoGlobalPct?: number
  total: number
  metodoPago?: string
  efectivoPagado?: number
  vuelto?: number
  rUTCliente?: string
  razonSocial?: string
  // Campos compatibles con ERP Asistora
  ventaId?: string
  boletaNumero?: number
  debitoOrdenNumero?: number | null
  cajero?: string
  fecha?: Date | number | string | any
  fechaTs?: number
  createdAtTs?: number
  fechaStr?: string
  pagos?: ReceiptPayment[]
  esPreVenta?: boolean
}

// Configuración por defecto de la empresa
// Datos base del emisor para comprobantes internos.
export const DEFAULT_COMPANY_CONFIG: ReceiptCompanyConfig = {
  nombreEmpresa: 'Importadora Carlitos',
  rut: '78.267.426-9',
  giro: 'VENTA AL POR MENOR DE JUEGOS Y JUGUETES EN\nCOMERCIOS ESPECIALIZADOS',
  direccion: 'Chacabuco #8 Estacion Central, Estacion Central Santiago,\nChile',
  sucursalLinea: 'Importadora Carlitos Alameda, # Chacabuco 8',
  clienteNombre: 'Genérico',
  clienteRut: '66.666.666-6',
  ivaPorcentaje: 19,
}

const fmtNum = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const pad2 = (n: number) => String(n).padStart(2, '0')

export function resolveReceiptDate(data?: any): Date {
  if (!data) return new Date()

  // 1. Si ya es una instancia de Date válida
  if (data.fecha instanceof Date && !isNaN(data.fecha.getTime())) {
    return data.fecha
  }

  // 2. Si viene un objeto Timestamp de Firestore con .toDate()
  if (data.fecha && typeof data.fecha.toDate === 'function') {
    const d = data.fecha.toDate()
    if (d instanceof Date && !isNaN(d.getTime())) return d
  }
  if (data.createdAt && typeof data.createdAt.toDate === 'function') {
    const d = data.createdAt.toDate()
    if (d instanceof Date && !isNaN(d.getTime())) return d
  }

  // 3. Timestamps numéricos en milisegundos o segundos (fechaTs, createdAtTs, o fecha/createdAt numérico)
  const numericTs = Number(
    data.fechaTs ??
    data.createdAtTs ??
    (typeof data.fecha === 'number' ? data.fecha : null) ??
    (typeof data.createdAt === 'number' ? data.createdAt : null) ??
    0
  )
  if (numericTs > 100000000000) { // milisegundos (13 dígitos)
    const d = new Date(numericTs)
    if (!isNaN(d.getTime())) return d
  } else if (numericTs > 1000000000) { // segundos (10 dígitos)
    const d = new Date(numericTs * 1000)
    if (!isNaN(d.getTime())) return d
  }

  // 4. Si viene fechaHora como string
  if (typeof data.fechaHora === 'string' && data.fechaHora.trim()) {
    const d = new Date(data.fechaHora)
    if (!isNaN(d.getTime())) return d
  }

  // 5. Si viene fecha como string ISO o similar
  if (typeof data.fecha === 'string' && data.fecha.trim()) {
    const d = new Date(data.fecha)
    if (!isNaN(d.getTime())) return d
  }

  // 6. Si viene fechaStr ("YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss")
  if (typeof data.fechaStr === 'string' && data.fechaStr.trim()) {
    const cleanStr = data.fechaStr.trim()
    if (cleanStr.includes('T')) {
      const d = new Date(cleanStr)
      if (!isNaN(d.getTime())) return d
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [y, m, day] = cleanStr.split('-').map(Number)
      if (y && m && day) {
        return new Date(y, m - 1, day, 12, 0, 0)
      }
    }
  }

  return new Date()
}

export function buildReceiptHtml(company: ReceiptCompanyConfig, data: ReceiptData, options?: { autoPrint?: boolean }) {
  // Normalizar fecha real de la venta
  const d = resolveReceiptDate(data)

  let fecha = `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
  let hora = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

  try {
    const parts = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)

    const day = parts.find(p => p.type === 'day')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const year = parts.find(p => p.type === 'year')?.value
    const hourVal = parts.find(p => p.type === 'hour')?.value
    const minuteVal = parts.find(p => p.type === 'minute')?.value

    if (day && month && year) fecha = `${day}-${month}-${year}`
    if (hourVal && minuteVal) hora = `${hourVal}:${minuteVal}`
  } catch {}

  const normalizeMetodoLabel = (m?: string): string => {
    const clean = (m || '').toLowerCase().trim()
    if (clean.includes('debit') || clean.includes('débit') || clean.includes('tarjeta') || clean.includes('card') || clean.includes('pos') || clean.includes('redelcom') || clean.includes('transbank')) {
      return 'Débito'
    }
    if (clean.includes('transf') || clean.includes('wire') || clean.includes('banco')) {
      return 'Transferencia'
    }
    if (clean.includes('efect') || clean.includes('cash')) {
      return 'Efectivo'
    }
    if (clean.includes('mix')) {
      return 'Pago Mixto'
    }
    return m ? (m.charAt(0).toUpperCase() + m.slice(1)) : 'Efectivo'
  }

  const esPreVenta = !!data.esPreVenta
  const ventaId = data.ventaId || `v${Date.now()}`
  const comprobanteNum = ventaId.slice(-6).toUpperCase()
  const tituloDoc = esPreVenta ? 'Pre-venta ' + ventaId.slice(-6).toUpperCase() : 'Comprobante interno ' + comprobanteNum

  const descPct = Number(data.descuentoGlobalPct) || 0
  const descGlobal = Number(data.descuentoGlobal || data.descuentoGlobalMonto || 0)

  // Resolver pagos de manera resiliente (array de pagos, método individual, débito o efectivo)
  const debitoNum = data.debitoOrdenNumero ?? (data as any).ordenDebito ?? null
  let rawPagos: ReceiptPayment[] = []
  if (Array.isArray(data.pagos) && data.pagos.length > 0) {
    rawPagos = data.pagos.filter(p => p && (Number(p.monto) > 0 || data.pagos!.length === 1))
  }
  if (rawPagos.length === 0 && data.metodoPago) {
    rawPagos = [{ metodo: data.metodoPago, monto: Number(data.total) || 0 }]
  }
  if (rawPagos.length === 0) {
    if (debitoNum) {
      rawPagos = [{ metodo: 'debito', monto: Number(data.total) || 0 }]
    } else {
      rawPagos = [{ metodo: 'efectivo', monto: Number(data.total) || 0 }]
    }
  }

  const pagos = rawPagos.map(p => ({
    metodo: p.metodo,
    label: normalizeMetodoLabel(p.metodo),
    monto: Number(p.monto) || 0,
  }))
  const totalPagos = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const pagosEfectivo = pagos.filter(p => /efect|cash/i.test(String(p.metodo || '')))
  const totalEfectivoRegistrado = pagosEfectivo.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const efectivoPagadoExplicito = Number(data.efectivoPagado)
  // En ventas antiguas de un solo medio, pagos guardaba el total de la venta,
  // mientras que el monto entregado por el cliente se obtiene sumando el vuelto.
  // En pagos mixtos, en cambio, cada fila conserva lo recibido para ese medio.
  const efectivoPagado = efectivoPagadoExplicito > 0
    ? Math.round(efectivoPagadoExplicito)
    : pagosEfectivo.length === 0
      ? 0
      : Math.round(totalEfectivoRegistrado + (
        pagos.length === 1 && totalEfectivoRegistrado <= (Number(data.total) || 0)
          ? Number(data.vuelto) || 0
          : 0
      ))

  // Resumen de forma de pago para el bloque superior del comprobante
  const formaPagoTexto = pagos.length === 1
    ? pagos[0].label
    : (pagos.length > 1 ? `Mixto (${pagos.map(p => p.label).join(' + ')})` : 'Efectivo')

  const direccion = company.direccion ?? DEFAULT_COMPANY_CONFIG.direccion ?? ''
  const giro = company.giro ?? DEFAULT_COMPANY_CONFIG.giro ?? ''
  const sucursalLinea = company.sucursalLinea ?? DEFAULT_COMPANY_CONFIG.sucursalLinea ?? ''
  const nombreEmpresa = company.nombreEmpresa ?? DEFAULT_COMPANY_CONFIG.nombreEmpresa ?? ''
  const rutEmpresa = company.rut ?? DEFAULT_COMPANY_CONFIG.rut ?? ''
  const clienteNombre = company.clienteNombre ?? DEFAULT_COMPANY_CONFIG.clienteNombre ?? ''
  const clienteRut = company.clienteRut ?? DEFAULT_COMPANY_CONFIG.clienteRut ?? ''
  const emisorHtml = (value: string) => value ? value.split(/\r?\n/).map(line => `<div>${esc(line)}</div>`).join('') : ''
  const cajero = data.cajero || data.cajeraNombre || 'PAOLA CAJA ALAMEDA'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(tituloDoc)}</title>
<style>
@page{margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0 !important;padding:0 !important}
body{
  font-family:Arial,Helvetica,sans-serif;
  background:#fff;
  color:#000;
  margin:0 !important;
  padding:0 0 40px 14px;
  -webkit-font-smoothing:antialiased;
}
.receipt{width:342px;margin:0 !important;padding:0 !important}
@media print{
  @page{margin:0}
  html,body{margin:0 !important;padding:0 !important}
  body{margin:0 !important;padding:0 0 40px 14px !important}
  .receipt{width:100% !important;max-width:80mm !important;margin:0 !important;padding:0 !important}
  .emisor{margin-top:0 !important}
  button{display:none !important}
}
.emisor{margin-top:0 !important;border:1px solid #000;padding:7px 8px 9px;font-size:10px;line-height:1.4}
.emisor .rut{font-size:11px}
.emisor .razon{font-size:13.5px;font-weight:700;margin:2px 0 3px}
.doc{margin-top:16px;font-size:12px;line-height:1.6}
.doc .row{display:flex}
.doc .row .c1{flex:0 0 55%;font-weight:700}
.doc .row .c2{flex:1;font-weight:700}
.doc .cajero{font-size:11.5px;margin-top:3px}
.cliente{margin-top:26px;font-size:11px;line-height:1.5}
.cliente .nom{font-weight:700;font-size:12px}
.line{border-top:1.5px solid #000;margin:12px 0 16px;width:100%}
.line.post-table{margin:14px 0 8px}
table.det{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
table.det th{font-weight:700;font-size:12px;padding:0 0 6px}
table.det th.p{text-align:left;width:196px}
table.det th.q{text-align:center;width:46px}
table.det th.s{text-align:right;width:100px;padding-right:26px}
table.det td{padding:4px 0;vertical-align:top}
table.det td.p{text-align:left;line-height:1.35;word-break:break-word}
table.det td.q{text-align:center}
table.det td.s{text-align:right;padding-right:26px}
table.tot{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}
table.tot td{padding:3px 0}
table.tot td.lbl{text-align:right;width:200px;padding-right:8px}
table.tot td.cur{text-align:center;width:24px}
table.tot td.val{text-align:right;width:118px;padding-right:26px}
table.tot tr.big td{font-size:16px;font-weight:700;padding-top:4px;padding-bottom:4px}
table.tot tr.big td.val{padding-right:26px !important}
table.tot tr.big td.lbl{padding-right:8px !important}
.nota-interna{margin-top:20px;text-align:center;font-size:11px;line-height:1.5}
.pie{margin-top:28px;text-align:center;font-size:11.5px;font-weight:700}
.aviso{border:2px solid #000;text-align:center;padding:8px;font-weight:700;font-size:12px;margin-bottom:12px}
${options?.autoPrint === false ? `
html,body{scrollbar-width:none!important;-ms-overflow-style:none!important}
html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}
body{width:342px!important;padding:0!important}
.receipt{width:322px!important;margin-left:10px!important;padding:10px!important}
table.det th.p{width:155px}
table.det th.q{width:38px}
table.det th.s{width:85px;padding-right:6px}
table.det td.s{padding-right:6px}
table.tot td.lbl{width:160px}
table.tot td.cur{width:20px}
table.tot td.val{width:85px;padding-right:6px}
table.tot tr.big td.val{padding-right:6px !important}
` : ''}
</style></head><body>
<div class="receipt">
  ${esPreVenta ? `<div class="aviso">PRE-VENTA · NO VÁLIDA COMO COMPROBANTE</div>` : '<div class="aviso">COMPROBANTE INTERNO · NO VÁLIDO COMO DOCUMENTO TRIBUTARIO</div>'}
  <div class="emisor">
    ${rutEmpresa ? `<div class="rut">${esc(rutEmpresa)}</div>` : ''}
    ${nombreEmpresa ? `<div class="razon">${esc(nombreEmpresa)}</div>` : ''}
    ${emisorHtml(direccion)}
    ${emisorHtml(giro)}
    ${emisorHtml(sucursalLinea)}
  </div>
  <div class="doc">
    <div class="row"><div class="c1">Fecha : ${fecha}</div><div class="c2">Hora : ${hora}</div></div>
    <div class="row"><div class="c1">${esPreVenta ? 'Pre-Venta.' : 'Comprobante interno.'}</div><div class="c2">Nº ${esPreVenta ? esc(ventaId.slice(-6).toUpperCase()) : comprobanteNum}</div></div>
    <div class="cajero">Cajero: ${esc(cajero)}</div>
    ${!esPreVenta ? `<div class="cajero">Forma de Pago: ${esc(formaPagoTexto.toUpperCase())}</div>` : ''}
    ${debitoNum ? `<div class="cajero">Débito Nº ${esc(String(debitoNum))}</div>` : ''}
  </div>
  <div class="cliente">
    ${clienteNombre ? `<div class="nom">${esc(clienteNombre)}</div>` : ''}
    ${clienteRut ? `<div>RUT: ${esc(clienteRut)}</div>` : ''}
  </div>
  <div class="line"></div>
  <table class="det">
    <thead><tr><th class="p">Producto</th><th class="q">Cant</th><th class="s">Subtotal</th></tr></thead>
    <tbody>
    ${(data.items || []).map(it => {
      const embParts = getEmbalajeHtmlParts(it)
      const embQty = resolveEmbalajeQty(it)
      const codeLabel = formatProductCodeLabel(it)
      const embSizeLabel = embQty > 1 ? ` (${embQty}xE)` : ''
      const embCountLabel = embParts
        ? ` <b style="font-weight:900;">${esc(embParts.boldPart)}</b>${embParts.unidadesSueltas > 0
          ? ` y ${fmtNum(embParts.unidadesSueltas)} ${embParts.unidadesSueltas === 1 ? 'unidad suelta' : 'unidades sueltas'}`
          : ''}`
        : ''
      return `<tr>
        <td class="p">${esc(it.nombre)}${esc(embSizeLabel)}${embCountLabel}${codeLabel ? ` ${esc(codeLabel)}` : ''} $ ${fmtNum(it.precioUnitario || 0)} C/U</td>
        <td class="q">${fmtNum(it.cantidad || 0)}</td>
        <td class="s">${fmtNum(it.subtotal || 0)}</td>
      </tr>`
    }).join('')}
    </tbody>
  </table>
  <div class="line post-table"></div>
  <table class="tot">
    ${descGlobal > 0 ? `<tr><td class="lbl">Descuento (${descPct}%)</td><td class="cur">$</td><td class="val">-${fmtNum(descGlobal)}</td></tr>` : ''}
    <tr class="big"><td class="lbl">Total</td><td class="cur">$</td><td class="val">${fmtNum(Number(data.total) || 0)}</td></tr>
    ${!esPreVenta ? pagos.map(p => `<tr><td class="lbl">${esc(p.label)}</td><td class="cur">$</td><td class="val">${fmtNum(p.monto)}</td></tr>`).join('') : ''}
    ${!esPreVenta && (pagos.length > 1 || Number(data.vuelto || 0) > 0 || totalPagos !== Number(data.total)) ? `<tr><td class="lbl">Total Pagos</td><td class="cur">$</td><td class="val">${fmtNum(totalPagos)}</td></tr>` : ''}
    ${!esPreVenta && efectivoPagado > 0 ? `<tr><td class="lbl">Efectivo recibido</td><td class="cur">$</td><td class="val">${fmtNum(efectivoPagado)}</td></tr>` : ''}
    ${!esPreVenta && Number(data.vuelto || 0) > 0 ? `<tr><td class="lbl">Vuelto</td><td class="cur">$</td><td class="val">${fmtNum(Number(data.vuelto) || 0)}</td></tr>` : ''}
  </table>
  ${esPreVenta ? '<div class="nota-interna">Documento informativo · Pendiente de cobro</div>' : ''}
</div>
${options?.autoPrint === false ? '' : `<script>
  function triggerPrint() {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.warn('[receipt] print error:', e);
    }
  }
  if (document.readyState === 'complete') {
    setTimeout(triggerPrint, 80);
  } else {
    window.addEventListener('load', function() { setTimeout(triggerPrint, 80); });
    setTimeout(triggerPrint, 500);
  }
  window.onafterprint = function() {
    try { window.close(); } catch (_) {}
  };
</script>`}
</body></html>`
}

export function generateReceiptHTML(data?: ReceiptData | any, company?: ReceiptCompanyConfig, options?: { autoPrint?: boolean }): string {
  if (!data) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cargando...</title></head><body style="font-family:sans-serif;padding:20px;text-align:center;background:#fff;color:#999;"><p>Cargando...</p></body></html>`;
  }
  const mergedCompany = { ...DEFAULT_COMPANY_CONFIG, ...(company || {}) }
  return buildReceiptHtml(mergedCompany, data, options)
}

export function printReceiptViaIframe(data: ReceiptData | any, company?: ReceiptCompanyConfig): boolean {
  if (typeof window === 'undefined') return false
  try {
    let iframe = document.getElementById('pos-receipt-print-iframe') as HTMLIFrameElement | null
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'pos-receipt-print-iframe'
      iframe.style.position = 'fixed'
      iframe.style.top = '-9999px'
      iframe.style.left = '-9999px'
      iframe.style.width = '1px'
      iframe.style.height = '1px'
      iframe.style.border = 'none'
      iframe.style.opacity = '0'
      document.body.appendChild(iframe)
    }
    const mergedCompany = { ...DEFAULT_COMPANY_CONFIG, ...(company || {}) }
    const html = buildReceiptHtml(mergedCompany, data)
    const doc = iframe.contentWindow?.document
    if (!doc) return false
    doc.open()
    doc.write(html)
    doc.close()
    setTimeout(() => {
      try {
        iframe?.contentWindow?.focus()
        iframe?.contentWindow?.print()
      } catch (e) {
        console.warn('[printReceiptViaIframe] print failed:', e)
      }
    }, 250)
    return true
  } catch (err) {
    console.warn('[printReceiptViaIframe] failed:', err)
    return false
  }
}

export function openReceiptPrintWindow(
  data?: ReceiptData | any,
  existingWindowOrCompany?: Window | ReceiptCompanyConfig | null,
  optionalCompany?: ReceiptCompanyConfig
): Window | null {
  let win: Window | null = null
  let company: ReceiptCompanyConfig = DEFAULT_COMPANY_CONFIG

  if (existingWindowOrCompany) {
    if ('document' in (existingWindowOrCompany as any)) {
      win = existingWindowOrCompany as Window
      if (optionalCompany) company = { ...DEFAULT_COMPANY_CONFIG, ...optionalCompany }
    } else if (typeof existingWindowOrCompany === 'object') {
      company = { ...DEFAULT_COMPANY_CONFIG, ...(existingWindowOrCompany as ReceiptCompanyConfig) }
    }
  }

  if (!win && typeof window !== 'undefined') {
    try {
      win = window.open('', '_blank', 'width=400,height=700')
    } catch (_) {
      win = null
    }
  }

  // Si el navegador bloqueó la ventana emergente, usar el iframe invisible de respaldo
  if (!win || win.closed || typeof win.closed === 'undefined') {
    if (data && typeof window !== 'undefined') {
      printReceiptViaIframe(data, company)
    }
    return null
  }

  if (win && data) {
    try {
      const html = generateReceiptHTML(data, company)
      win.document.open()
      win.document.write(html)
      win.document.close()
      setTimeout(() => {
        try {
          if (win && !win.closed) {
            win.focus()
            win.print()
          }
        } catch (_) {}
      }, 250)
    } catch (err) {
      console.warn('[openReceiptPrintWindow] error escribiendo comprobante:', err)
    }
  } else if (win && !data) {
    // Blank window for later use
    try {
      win.document.open()
      win.document.write(generateReceiptHTML(undefined, company))
      win.document.close()
    } catch (_) {}
  }
  return win
}

export function openBlankReceiptWindow(): Window | null {
  return window.open('', '_blank', 'width=400,height=700')
}

export type VentaVendedorEnvioItem = {
  vendedorNombre: string
  cajeraNombre: string
  cantidad: number
  totalMonto?: number
}

export type CorteCajaData = {
  corteId?: string
  sesionCajaId?: string
  sede?: string
  sedeNombre?: string
  cajeroNombre?: string
  fechaStr?: string
  fechaCierreStr?: string
  horaCierreStr?: string
  aperturaAt?: any
  cierreAt?: any
  montoApertura: number
  ventasCount: number
  totalVentas: number
  totalEfectivo: number
  totalDebito: number
  totalTransferencia: number
  totalVueltos?: number
  efectivoTeorico: number
  efectivoReal: number
  diferencia: number
  gastos: number
  gastosItems?: Array<{ monto: number; detalle?: string; observacion?: string; boletaNumero?: string; tipoGasto?: string; categoria?: string }>
  anulacionesItems?: Array<{ monto: number; detalle?: string; observacion?: string }>
  devolucionesItems?: Array<{ monto: number; detalle?: string; observacion?: string }>
  totalAnulaciones?: number
  totalDevoluciones?: number
  ventasRecibidasDeVendedores?: Array<{
    vendedorNombre: string
    cantidad: number
    totalMonto: number
  }>
}

export function buildCorteCajaHtml(company: ReceiptCompanyConfig, data: CorteCajaData): string {
  const ahora = new Date()
  const fechaCierre = data.fechaCierreStr || `${pad2(ahora.getDate())}-${pad2(ahora.getMonth() + 1)}-${ahora.getFullYear()}`
  const horaCierre = data.horaCierreStr || `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}`

  let fechaAperturaStr = ''
  if (data.aperturaAt) {
    const apDate = typeof data.aperturaAt === 'number' ? new Date(data.aperturaAt) : (data.aperturaAt?.toDate ? data.aperturaAt.toDate() : new Date(data.aperturaAt))
    if (!isNaN(apDate.getTime())) {
      fechaAperturaStr = `${pad2(apDate.getDate())}-${pad2(apDate.getMonth() + 1)}-${apDate.getFullYear()} ${pad2(apDate.getHours())}:${pad2(apDate.getMinutes())}`
    }
  }

  const cajero = data.cajeroNombre || 'Cajera'
  const sedeLabel = data.sedeNombre || data.sede || 'Importadora Carlitos'
  const corteId = data.corteId || data.sesionCajaId || `corte_${Date.now()}`
  const gastosItems = data.gastosItems || []
  const gastosMercaderia = gastosItems.filter(esCompraMercaderia).reduce((sum, gasto) => sum + (Number(gasto.monto) || 0), 0)
  const gastosOperacionales = gastosItems.filter((gasto) => !esCompraMercaderia(gasto)).reduce((sum, gasto) => sum + (Number(gasto.monto) || 0), 0)
  const diferencia = Number(data.diferencia) || 0
  const difLabel = diferencia === 0 ? 'CUADRA PERFECTO' : (diferencia > 0 ? 'SOBRANTE (+)' : 'FALTANTE (-)')
  const difColor = diferencia === 0 ? '#166534' : (diferencia > 0 ? '#c2410c' : '#b91c1c')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corte de Caja - ${esc(cajero)}</title>
<style>
@page{margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0 !important;padding:0 !important}
body{
  font-family:Arial,Helvetica,sans-serif;
  background:#fff;
  color:#000;
  margin:0 !important;
  padding:0 0 40px 14px;
  -webkit-font-smoothing:antialiased;
}
.receipt{width:342px;margin:0 !important;padding:0 !important}
@media print{
  @page{margin:0}
  html,body{margin:0 !important;padding:0 !important}
  body{margin:0 !important;padding:0 0 40px 14px !important}
  .receipt{width:100% !important;max-width:80mm !important;margin:0 !important;padding:0 !important}
  button{display:none !important}
}
.emisor{border:1px solid #000;padding:7px 8px;font-size:10px;line-height:1.4;text-align:center}
.emisor .razon{font-size:13.5px;font-weight:700;margin:2px 0}
.emisor .rut{font-size:11px}
.corte-badge{margin-top:14px;border:2px solid #000;text-align:center;padding:7px 4px;font-size:13.5px;font-weight:900;letter-spacing:1px}
.doc{margin-top:12px;font-size:11.5px;line-height:1.55}
.doc .row{display:flex;justify-content:space-between}
.line{border-top:1.5px solid #000;margin:10px 0;width:100%}
.line.dash{border-top:1px dashed #000;margin:8px 0}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;margin:10px 0 4px;background:#eee;padding:3px 5px}
table.tot{width:100%;border-collapse:collapse;font-size:11.5px}
table.tot td{padding:3px 0}
table.tot td.lbl{text-align:left}
table.tot td.cur{text-align:center;width:20px}
table.tot td.val{text-align:right}
table.tot tr.big td{font-size:13px;font-weight:700;padding-top:4px;padding-bottom:4px}
table.tot tr.highlight td{font-size:13.5px;font-weight:900;border-top:1.5px solid #000;border-bottom:1.5px solid #000;padding:6px 0}
.firma{margin-top:44px;display:flex;justify-content:space-between;gap:18px}
.firma-box{flex:1;text-align:center;font-size:10px}
.firma-line{border-top:1px solid #000;margin-bottom:4px}
</style></head>
<body>
<div class="receipt">
  <div class="emisor">
    <div class="rut">${esc(company.rut || '78.267.426-9')}</div>
    <div class="razon">${esc(company.nombreEmpresa || 'Importadora Carlitos')}</div>
    <div>${esc(sedeLabel)}</div>
    <div>S.I.I - Unidad La Florida</div>
  </div>

  <div class="corte-badge">*** CORTE DE CAJA ***</div>

  <div class="doc">
    <div class="row"><span><strong>Cajero(a):</strong></span><span>${esc(cajero)}</span></div>
    <div class="row"><span><strong>Sucursal / Sede:</strong></span><span>${esc(sedeLabel)}</span></div>
    <div class="row"><span><strong>Fecha Cierre:</strong></span><span>${esc(fechaCierre)} ${esc(horaCierre)}</span></div>
    ${fechaAperturaStr ? `<div class="row"><span><strong>Fecha Apertura:</strong></span><span>${esc(fechaAperturaStr)}</span></div>` : ''}
    <div class="row"><span><strong>ID Corte:</strong></span><span>${esc(corteId.replace(/^corte_/, '').slice(-10).toUpperCase())}</span></div>
  </div>

  <div class="line"></div>
  <div class="section-title">Resumen de Ventas (${Number(data.ventasCount) || 0} operaciones)</div>
  <table class="tot">
    <tr><td class="lbl">(+) Efectivo Ventas</td><td class="cur">$</td><td class="val">${fmtNum(data.totalEfectivo)}</td></tr>
    <tr><td class="lbl">(+) Tarjeta Débito</td><td class="cur">$</td><td class="val">${fmtNum(data.totalDebito)}</td></tr>
    <tr><td class="lbl">(+) Transferencia</td><td class="cur">$</td><td class="val">${fmtNum(data.totalTransferencia)}</td></tr>
    <tr class="big"><td class="lbl">Total Ventas Sistema</td><td class="cur">$</td><td class="val">${fmtNum(data.totalVentas)}</td></tr>
    ${Number(data.totalVueltos || 0) > 0 ? `<tr><td class="lbl" style="font-size:10.5px;color:#555">Vueltos entregados</td><td class="cur">$</td><td class="val" style="font-size:10.5px;color:#555">${fmtNum(data.totalVueltos || 0)}</td></tr>` : ''}
  </table>

  <div class="line dash"></div>
  <div class="section-title">Movimiento de Efectivo en Gaveta</div>
  <table class="tot">
    <tr><td class="lbl">(+) Monto Apertura (Fondo)</td><td class="cur">$</td><td class="val">${fmtNum(data.montoApertura)}</td></tr>
    <tr><td class="lbl">(+) Efectivo Cobrado en Ventas</td><td class="cur">$</td><td class="val">${fmtNum(data.totalEfectivo)}</td></tr>
    ${Number(data.gastos) > 0 ? `<tr><td class="lbl">(-) Salidas de Caja (incluye mercadería)</td><td class="cur">$</td><td class="val">-${fmtNum(data.gastos)}</td></tr>` : ''}
    <tr class="big"><td class="lbl">(=) Efectivo Esperado en Caja</td><td class="cur">$</td><td class="val">${fmtNum(data.efectivoTeorico)}</td></tr>
  </table>

  <div class="line dash"></div>
  <div class="section-title">Arqueo y Cuadre de Caja</div>
  <table class="tot">
    <tr><td class="lbl">Efectivo Real (Declarado)</td><td class="cur">$</td><td class="val"><strong>${fmtNum(data.efectivoReal)}</strong></td></tr>
    <tr><td class="lbl">Efectivo Teórico (Sistema)</td><td class="cur">$</td><td class="val">${fmtNum(data.efectivoTeorico)}</td></tr>
    <tr class="highlight" style="color:${difColor}">
      <td class="lbl">${esc(difLabel)}</td>
      <td class="cur">$</td>
      <td class="val">
        ${diferencia === 0 ? '$ 0' : (diferencia > 0 ? `+${fmtNum(diferencia)}` : `-${fmtNum(Math.abs(diferencia))}`)}
      </td>
    </tr>
  </table>

  ${gastosItems.length > 0 ? `
    <div class="line dash"></div>
    <div class="section-title">Detalle de salidas y anotaciones (${gastosItems.length})</div>
    <table class="tot">
      ${gastosItems.map(g => `
        <tr>
          <td class="lbl">${esCompraMercaderia(g) ? 'Mercadería anotada · no es gasto: ' : ''}${esc(g.detalle || g.observacion || 'Registro')}${g.boletaNumero ? ` (Bol. ${esc(g.boletaNumero)})` : ''}</td>
          <td class="cur">$</td>
          <td class="val">${fmtNum(g.monto)}</td>
        </tr>
      `).join('')}
      <tr><td class="lbl">Gastos operacionales</td><td class="cur">$</td><td class="val">${fmtNum(gastosOperacionales)}</td></tr>
      ${gastosMercaderia > 0 ? `<tr><td class="lbl">Mercadería anotada aparte · no es gasto</td><td class="cur">$</td><td class="val">${fmtNum(gastosMercaderia)}</td></tr>` : ''}
      <tr class="big"><td class="lbl">Total salidas de caja</td><td class="cur">$</td><td class="val">${fmtNum(data.gastos)}</td></tr>
    </table>
  ` : ''}

  ${(Array.isArray(data.ventasRecibidasDeVendedores) && data.ventasRecibidasDeVendedores.length > 0) ? `
    <div class="line dash"></div>
    <div class="section-title">Ventas Recibidas de Vendedores (${data.ventasRecibidasDeVendedores.reduce((s, v) => s + (v.cantidad || 0), 0)})</div>
    <div style="font-size:9.5px;color:#555;margin-bottom:6px;font-style:italic">
      * Conteo informativo de envíos recibidos (no altera arqueo de caja)
    </div>
    <table class="tot">
      ${data.ventasRecibidasDeVendedores.map(v => `
        <tr>
          <td class="lbl">De ${esc(v.vendedorNombre)}</td>
          <td class="cur">${v.cantidad} vts</td>
          <td class="val">$${fmtNum(v.totalMonto || 0)}</td>
        </tr>
      `).join('')}
      <tr class="big">
        <td class="lbl">Total Recibidas de Vendedores</td>
        <td class="cur">${data.ventasRecibidasDeVendedores.reduce((s, v) => s + (v.cantidad || 0), 0)} vts</td>
        <td class="val">$${fmtNum(data.ventasRecibidasDeVendedores.reduce((s, v) => s + (v.totalMonto || 0), 0))}</td>
      </tr>
    </table>
  ` : ''}

  <div class="firma">
    <div class="firma-box">
      <div class="firma-line"></div>
      <div>Firma Cajero(a)</div>
      <div style="font-size:9.5px;color:#555">${esc(cajero)}</div>
    </div>
    <div class="firma-box">
      <div class="firma-line"></div>
      <div>Firma Supervisor / Recibe</div>
      <div style="font-size:9.5px;color:#555">Conforme</div>
    </div>
  </div>

  <div style="margin-top:24px;text-align:center;font-size:9.5px;color:#666">
    Importadora Carlitos POS · Comprobante de Cierre de Caja
  </div>
</div>
<script>
window.onload = function() {
  window.print();
  window.onafterprint = function() { window.close(); }
}
</script>
</body></html>`
}

export function generateCorteCajaHTML(data?: CorteCajaData | any, company?: ReceiptCompanyConfig): string {
  if (!data) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cargando corte...</title></head><body style="font-family:sans-serif;padding:20px;text-align:center;background:#fff;color:#999;"><p>Cargando corte de caja...</p></body></html>`
  }
  const mergedCompany = { ...DEFAULT_COMPANY_CONFIG, ...(company || {}) }
  return buildCorteCajaHtml(mergedCompany, data)
}

export function openCorteCajaPrintWindow(
  data?: CorteCajaData | any,
  existingWindowOrCompany?: Window | ReceiptCompanyConfig | null,
  optionalCompany?: ReceiptCompanyConfig
): Window | null {
  let win: Window | null = null
  let company: ReceiptCompanyConfig = DEFAULT_COMPANY_CONFIG

  if (existingWindowOrCompany) {
    if ('document' in (existingWindowOrCompany as any)) {
      win = existingWindowOrCompany as Window
      if (optionalCompany) company = { ...DEFAULT_COMPANY_CONFIG, ...optionalCompany }
    } else if (typeof existingWindowOrCompany === 'object') {
      company = { ...DEFAULT_COMPANY_CONFIG, ...(existingWindowOrCompany as ReceiptCompanyConfig) }
    }
  }

  if (!win && typeof window !== 'undefined') {
    win = window.open('', '_blank', 'width=400,height=700')
  }
  if (win && data) {
    const html = generateCorteCajaHTML(data, company)
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else if (win && !data) {
    win.document.open()
    win.document.write(generateCorteCajaHTML(undefined, company))
    win.document.close()
  }
  return win
}

export type CorteGeneralCajeraItem = {
  cajeroNombre: string
  ventasCount: number
  totalVentas: number
  totalEfectivo: number
  totalDebito: number
  totalTransferencia: number
  montoApertura: number
  efectivoTeorico: number
  efectivoReal: number
  diferencia: number
  gastos: number
  horaCierreStr?: string
}

export type CorteGeneralData = {
  sede?: string
  sedeNombre?: string
  fechaStr?: string
  fechaCierreStr?: string
  horaCierreStr?: string
  cajerasNombres?: string[]
  cortesCount: number
  ventasCount: number
  totalVentas: number
  totalEfectivo: number
  totalDebito: number
  totalTransferencia: number
  totalVueltos?: number
  montoAperturaTotal: number
  efectivoTeorico: number
  efectivoReal: number
  diferencia: number
  gastos: number
  gastosItems?: Array<{ monto: number; detalle?: string; observacion?: string; cajeroNombre?: string; tipoGasto?: string; categoria?: string }>
  desgloseCajeras: CorteGeneralCajeraItem[]
  ventasVendedores?: VentaVendedorEnvioItem[]
}

export function buildCorteGeneralHtml(company: ReceiptCompanyConfig, data: CorteGeneralData): string {
  const ahora = new Date()
  const fechaCierre = data.fechaCierreStr || data.fechaStr || `${pad2(ahora.getDate())}-${pad2(ahora.getMonth() + 1)}-${ahora.getFullYear()}`
  const horaCierre = data.horaCierreStr || `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}`
  const sedeLabel = data.sedeNombre || data.sede || 'Importadora Carlitos'
  const diferencia = Number(data.diferencia) || 0
  const gastosItems = data.gastosItems || []
  const gastosMercaderia = gastosItems.filter(esCompraMercaderia).reduce((sum, gasto) => sum + (Number(gasto.monto) || 0), 0)
  const gastosOperacionales = gastosItems.filter((gasto) => !esCompraMercaderia(gasto)).reduce((sum, gasto) => sum + (Number(gasto.monto) || 0), 0)
  const difLabel = diferencia === 0 ? 'CUADRA PERFECTO' : (diferencia > 0 ? 'SOBRANTE (+)' : 'FALTANTE (-)')
  const difColor = diferencia === 0 ? '#166534' : (diferencia > 0 ? '#c2410c' : '#b91c1c')
  const cajeras = data.cajerasNombres || data.desgloseCajeras?.map(c => c.cajeroNombre) || []

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corte General - ${esc(sedeLabel)} - ${esc(fechaCierre)}</title>
<style>
@page{margin:0;size:auto}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0 !important;padding:0 !important}
body{
  font-family:Arial,Helvetica,sans-serif;
  background:#fff;
  color:#000;
  margin:0 !important;
  padding:0 0 40px 14px;
  -webkit-font-smoothing:antialiased;
}
.receipt{width:360px;margin:0 !important;padding:0 !important}
@media print{
  @page{margin:0}
  html,body{margin:0 !important;padding:0 !important}
  body{margin:0 !important;padding:0 0 40px 14px !important}
  .receipt{width:100% !important;max-width:80mm !important;margin:0 !important;padding:0 !important}
  .no-print{display:none !important}
}
.no-print{
  padding:10px 0;
  margin-bottom:12px;
  display:flex;
  gap:8px;
}
.btn-print{
  background:#4f46e5;
  color:#fff;
  border:none;
  padding:8px 16px;
  border-radius:6px;
  font-weight:bold;
  font-size:12px;
  cursor:pointer;
}
.btn-close{
  background:#f1f5f9;
  color:#334155;
  border:1px solid #cbd5e1;
  padding:8px 14px;
  border-radius:6px;
  font-weight:bold;
  font-size:12px;
  cursor:pointer;
}
.emisor{border:1px solid #000;padding:7px 8px;font-size:10px;line-height:1.4;text-align:center}
.emisor .razon{font-size:13.5px;font-weight:700;margin:2px 0}
.emisor .rut{font-size:11px}
.corte-badge{margin-top:14px;border:2px solid #000;text-align:center;padding:7px 4px;font-size:12.5px;font-weight:900;letter-spacing:0.5px;background:#000;color:#fff}
.doc{margin-top:12px;font-size:11px;line-height:1.55}
.doc .row{display:flex;justify-content:space-between}
.line{border-top:1.5px solid #000;margin:10px 0;width:100%}
.line.dash{border-top:1px dashed #000;margin:8px 0}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;margin:10px 0 4px;background:#eee;padding:3px 5px}
table.tot{width:100%;border-collapse:collapse;font-size:11.5px}
table.tot td{padding:3px 0}
table.tot td.lbl{text-align:left}
table.tot td.cur{text-align:center;width:20px}
table.tot td.val{text-align:right}
table.tot tr.big td{font-size:13px;font-weight:700;padding-top:4px;padding-bottom:4px}
table.tot tr.highlight td{font-size:13.5px;font-weight:900;border-top:1.5px solid #000;border-bottom:1.5px solid #000;padding:6px 0}

table.desglose{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}
table.desglose th{border-bottom:1px solid #000;padding:3px 2px;text-align:right;font-size:9px}
table.desglose th:first-child{text-align:left}
table.desglose td{padding:3px 2px;text-align:right}
table.desglose td:first-child{text-align:left;font-weight:bold}
table.desglose tr.total-row td{font-weight:bold;border-top:1px solid #000;border-bottom:1.5px solid #000;padding-top:4px;padding-bottom:4px}

.firma{margin-top:40px;display:flex;justify-content:space-between;gap:18px}
.firma-box{flex:1;text-align:center;font-size:10px}
.firma-line{border-top:1px solid #000;margin-bottom:4px}
</style></head>
<body>
<div class="receipt">
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Descargar en PDF / Imprimir</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>

  <div class="emisor">
    <div class="rut">${esc(company.rut || '78.267.426-9')}</div>
    <div class="razon">${esc(company.nombreEmpresa || 'Importadora Carlitos')}</div>
    <div>${esc(sedeLabel)}</div>
    <div>S.I.I - Unidad La Florida</div>
  </div>

  <div class="corte-badge">*** CORTE GENERAL DE CAJAS ***<br><span style="font-size:9.5px;font-weight:bold;letter-spacing:0">CONSOLIDADO TODAS LAS CAJERAS</span></div>

  <div class="doc">
    <div class="row"><span><strong>Sucursal / Sede:</strong></span><span>${esc(sedeLabel)}</span></div>
    <div class="row"><span><strong>Fecha Cierre:</strong></span><span>${esc(fechaCierre)} ${esc(horaCierre)}</span></div>
    <div class="row"><span><strong>Cajas Consolidadas:</strong></span><span><strong>${data.cortesCount} turnos</strong> (${cajeras.length} cajeras)</span></div>
    <div class="row" style="font-size:10px;color:#555"><span><strong>Cajeras:</strong></span><span>${esc(cajeras.join(', '))}</span></div>
    <div class="row"><span><strong>Total Operaciones:</strong></span><span>${fmtNum(data.ventasCount)} ventas</span></div>
  </div>

  <div class="line"></div>
  <div class="section-title">1. Resumen Consolidado de Ventas</div>
  <table class="tot">
    <tr><td class="lbl">(+) Efectivo Ventas</td><td class="cur">$</td><td class="val">${fmtNum(data.totalEfectivo)}</td></tr>
    <tr><td class="lbl">(+) Tarjeta Débito</td><td class="cur">$</td><td class="val">${fmtNum(data.totalDebito)}</td></tr>
    <tr><td class="lbl">(+) Transferencia</td><td class="cur">$</td><td class="val">${fmtNum(data.totalTransferencia)}</td></tr>
    <tr class="big"><td class="lbl">Total Ventas Sistema</td><td class="cur">$</td><td class="val">${fmtNum(data.totalVentas)}</td></tr>
    ${Number(data.totalVueltos || 0) > 0 ? `<tr><td class="lbl" style="font-size:10px;color:#555">Vueltos entregados</td><td class="cur">$</td><td class="val" style="font-size:10.5px;color:#555">${fmtNum(data.totalVueltos || 0)}</td></tr>` : ''}
  </table>

  <div class="line dash"></div>
  <div class="section-title">2. Desglose Detallado por Cajera (${data.desgloseCajeras.length})</div>
  <table class="desglose">
    <thead>
      <tr>
        <th>Cajera</th>
        <th>Ops</th>
        <th>Total</th>
        <th>Efectivo</th>
        <th>Déb/Trf</th>
        <th>Dif.</th>
      </tr>
    </thead>
    <tbody>
      ${data.desgloseCajeras.map(c => `
        <tr>
          <td>${esc(c.cajeroNombre)}</td>
          <td>${c.ventasCount}</td>
          <td>$${fmtNum(c.totalVentas)}</td>
          <td>$${fmtNum(c.totalEfectivo)}</td>
          <td>$${fmtNum(c.totalDebito + c.totalTransferencia)}</td>
          <td style="font-weight:bold;color:${c.diferencia === 0 ? '#166534' : (c.diferencia > 0 ? '#c2410c' : '#b91c1c')}">
            ${c.diferencia === 0 ? '$0' : (c.diferencia > 0 ? `+${fmtNum(c.diferencia)}` : `-${fmtNum(Math.abs(c.diferencia))}`)}
          </td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td>TOTAL</td>
        <td>${data.ventasCount}</td>
        <td>$${fmtNum(data.totalVentas)}</td>
        <td>$${fmtNum(data.totalEfectivo)}</td>
        <td>$${fmtNum(data.totalDebito + data.totalTransferencia)}</td>
        <td style="color:${difColor}">
          ${diferencia === 0 ? '$0' : (diferencia > 0 ? `+${fmtNum(diferencia)}` : `-${fmtNum(Math.abs(diferencia))}`)}
        </td>
      </tr>
    </tbody>
  </table>

  <div class="line dash"></div>
  <div class="section-title">3. Movimiento Consolidado de Efectivo</div>
  <table class="tot">
    <tr><td class="lbl">(+) Total Fondos de Apertura</td><td class="cur">$</td><td class="val">${fmtNum(data.montoAperturaTotal)}</td></tr>
    <tr><td class="lbl">(+) Total Efectivo Ventas</td><td class="cur">$</td><td class="val">${fmtNum(data.totalEfectivo)}</td></tr>
    ${Number(data.gastos) > 0 ? `<tr><td class="lbl">(-) Salidas de Caja (incluye mercadería)</td><td class="cur">$</td><td class="val">-${fmtNum(data.gastos)}</td></tr>` : ''}
    <tr class="big"><td class="lbl">(=) Efectivo Total Esperado en Tienda</td><td class="cur">$</td><td class="val">${fmtNum(data.efectivoTeorico)}</td></tr>
  </table>

  <div class="line dash"></div>
  <div class="section-title">4. Arqueo y Cuadre Consolidado General</div>
  <table class="tot">
    <tr><td class="lbl">Efectivo Real (Declarado Total)</td><td class="cur">$</td><td class="val"><strong>${fmtNum(data.efectivoReal)}</strong></td></tr>
    <tr><td class="lbl">Efectivo Teórico (Sistema Total)</td><td class="cur">$</td><td class="val">${fmtNum(data.efectivoTeorico)}</td></tr>
    <tr class="highlight" style="color:${difColor}">
      <td class="lbl">BALANCE GENERAL: ${esc(difLabel)}</td>
      <td class="cur">$</td>
      <td class="val">
        ${diferencia === 0 ? '$ 0' : (diferencia > 0 ? `+${fmtNum(diferencia)}` : `-${fmtNum(Math.abs(diferencia))}`)}
      </td>
    </tr>
  </table>

  ${gastosItems.length > 0 ? `
    <div class="line dash"></div>
    <div class="section-title">Detalle de salidas y anotaciones (${gastosItems.length})</div>
    <table class="tot">
      ${gastosItems.map(g => `
        <tr>
          <td class="lbl">${esCompraMercaderia(g) ? 'Mercadería anotada · no es gasto: ' : ''}${esc(g.detalle || g.observacion || 'Registro')}${g.cajeroNombre ? ` (${esc(g.cajeroNombre)})` : ''}</td>
          <td class="cur">$</td>
          <td class="val">${fmtNum(g.monto)}</td>
        </tr>
      `).join('')}
      <tr><td class="lbl">Gastos operacionales</td><td class="cur">$</td><td class="val">${fmtNum(gastosOperacionales)}</td></tr>
      ${gastosMercaderia > 0 ? `<tr><td class="lbl">Mercadería anotada aparte · no es gasto</td><td class="cur">$</td><td class="val">${fmtNum(gastosMercaderia)}</td></tr>` : ''}
      <tr class="big"><td class="lbl">Total salidas de caja</td><td class="cur">$</td><td class="val">${fmtNum(data.gastos)}</td></tr>
    </table>
  ` : ''}

  ${(Array.isArray(data.ventasVendedores) && data.ventasVendedores.length > 0) ? `
    <div class="line dash"></div>
    <div class="section-title">5. Envíos de Vendedores a Cajeras (${data.ventasVendedores.reduce((s, v) => s + (v.cantidad || 0), 0)} envíos)</div>
    <div style="font-size:9.5px;color:#555;margin-bottom:6px;font-style:italic">
      * Conteo informativo de pedidos enviados — no afecta dinero en gaveta ni cuadre de caja
    </div>
    <table class="desglose">
      <thead>
        <tr>
          <th>Vendedor</th>
          <th>Cajera Destino</th>
          <th>Envíos</th>
          <th>Monto Ref.</th>
        </tr>
      </thead>
      <tbody>
        ${data.ventasVendedores.map(v => `
          <tr>
            <td style="font-weight:bold">${esc(v.vendedorNombre)}</td>
            <td>${esc(v.cajeraNombre)}</td>
            <td style="font-weight:bold">${v.cantidad}</td>
            <td>$${fmtNum(v.totalMonto || 0)}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="2">TOTAL ENVÍOS VENDEDORES</td>
          <td>${data.ventasVendedores.reduce((s, v) => s + (v.cantidad || 0), 0)}</td>
          <td>$${fmtNum(data.ventasVendedores.reduce((s, v) => s + (v.totalMonto || 0), 0))}</td>
        </tr>
      </tbody>
    </table>
  ` : ''}

  <div class="firma">
    <div class="firma-box">
      <div class="firma-line"></div>
      <div>Firma Administrador / Supervisor</div>
      <div style="font-size:9.5px;color:#555">Revisado y Conforme</div>
    </div>
    <div class="firma-box">
      <div class="firma-line"></div>
      <div>Firma Representante Cajeras</div>
      <div style="font-size:9.5px;color:#555">${esc(cajeras.join(' / '))}</div>
    </div>
  </div>

  <div style="margin-top:24px;text-align:center;font-size:9.5px;color:#666">
    Importadora Carlitos POS · Reporte Oficial de Corte General Consolidado
  </div>
</div>
<script>
window.onload = function() {
  setTimeout(function() {
    window.print();
  }, 250);
}
</script>
</body></html>`
}

export function generateCorteGeneralHTML(data?: CorteGeneralData | any, company?: ReceiptCompanyConfig): string {
  if (!data) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cargando corte general...</title></head><body style="font-family:sans-serif;padding:20px;text-align:center;background:#fff;color:#999;"><p>Cargando corte general consolidado...</p></body></html>`
  }
  const mergedCompany = { ...DEFAULT_COMPANY_CONFIG, ...(company || {}) }
  return buildCorteGeneralHtml(mergedCompany, data)
}

export function openCorteGeneralPrintWindow(
  data?: CorteGeneralData | any,
  existingWindowOrCompany?: Window | ReceiptCompanyConfig | null,
  optionalCompany?: ReceiptCompanyConfig
): Window | null {
  let win: Window | null = null
  let company: ReceiptCompanyConfig = DEFAULT_COMPANY_CONFIG

  if (existingWindowOrCompany) {
    if ('document' in (existingWindowOrCompany as any)) {
      win = existingWindowOrCompany as Window
      if (optionalCompany) company = { ...DEFAULT_COMPANY_CONFIG, ...optionalCompany }
    } else if (typeof existingWindowOrCompany === 'object') {
      company = { ...DEFAULT_COMPANY_CONFIG, ...(existingWindowOrCompany as ReceiptCompanyConfig) }
    }
  }

  if (!win && typeof window !== 'undefined') {
    win = window.open('', '_blank', 'width=450,height=750')
  }
  if (win && data) {
    const html = generateCorteGeneralHTML(data, company)
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else if (win && !data) {
    win.document.open()
    win.document.write(generateCorteGeneralHTML(undefined, company))
    win.document.close()
  }
  return win
}
