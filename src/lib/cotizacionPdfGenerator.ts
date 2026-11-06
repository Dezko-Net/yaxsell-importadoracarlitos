import jsPDF from 'jspdf'
import { resolveEmbalajeQty, resolveBoxCode } from '@/lib/embalajeHelper'

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CotizacionItem {
  sku: string
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  imageUrl?: string
  imageUrls?: string[]
  precioMayorista?: number
  precioDetalle?: number
  embalajeQty?: number
  packageQty?: string
  boxCode?: string
  priceLabel?: string
}

export interface CotizacionData {
  folio?: string
  fecha?: string
  validezTexto?: string
  clienteNombre: string
  clienteTelefono?: string
  clienteRut?: string
  clienteCiudad?: string
  sedeNombre: string
  vendedorNombre: string
  empresaNombre?: string
  empresaRut?: string
  empresaDireccion?: string
  empresaTelefono?: string
  items: CotizacionItem[]
  subtotal: number
  descuentoGlobalPct: number
  descuentoGlobalMonto: number
  total: number
  notas?: string
  mostrarPrecioMayorista?: boolean
  pdfMode?: 'quote' | 'catalog'
}

export type ProgressCallback = (current: number, total: number, label: string) => void

// ─── Modern Corporate Palette ────────────────────────────────────────────────

type RGB = [number, number, number]

const C = {
  // Slate / Grafito Principal (Elegante y ejecutivo)
  primary: [30, 41, 59] as RGB,       // slate-800
  primaryDark: [15, 23, 42] as RGB,   // slate-900
  primaryLight: [51, 65, 85] as RGB,  // slate-700

  // Azul Importadora Carlitos (Acento refinado)
  brand: [37, 99, 235] as RGB,        // blue-600
  brandDark: [29, 78, 216] as RGB,    // blue-700
  brandLight: [239, 246, 255] as RGB, // blue-50
  brandBorder: [191, 219, 254] as RGB,// blue-200

  // Acentos de estado
  amber: [217, 119, 6] as RGB,        // amber-600
  amberDark: [180, 83, 9] as RGB,     // amber-700
  amberLight: [254, 243, 199] as RGB, // amber-100
  emerald: [5, 150, 105] as RGB,      // emerald-600
  emeraldLight: [236, 253, 245] as RGB,

  // Superficies y neutros
  gray50: [248, 250, 252] as RGB,     // slate-50
  gray100: [241, 245, 249] as RGB,    // slate-100
  gray200: [226, 232, 240] as RGB,    // slate-200
  gray300: [203, 213, 225] as RGB,    // slate-300
  gray400: [148, 163, 184] as RGB,    // slate-400
  gray500: [100, 116, 139] as RGB,    // slate-500
  gray600: [71, 85, 105] as RGB,      // slate-600
  gray700: [51, 65, 85] as RGB,       // slate-700
  gray800: [30, 41, 59] as RGB,       // slate-800
  white: [255, 255, 255] as RGB,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtCLP = (n: number) => {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n || 0))
  return sign + '$' + abs.toLocaleString('es-CL')
}

/**
 * Sanitiza cadenas para jsPDF con fuentes estándar (Helvetica):
 * - Descarta surrogate pairs (emojis) que rompen el kerning y la alineación en jsPDF.
 * - Preserva caracteres imprimibles ASCII y Latin-1 (tildes: á, é, í, ó, ú, ñ, Á, É, Í, Ó, Ú, Ñ, °, etc.).
 * - Reemplaza viñetas no estándar por guiones limpios.
 */
function cleanPdfText(text: string | null | undefined): string {
  if (!text) return ''
  const s = String(text).replace(/[•\u2022\u2023\u25E6\u2043\u2219]/g, '-')
  let result = ''
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    // Descartar surrogate pairs (emojis y caracteres suplementarios)
    if (code >= 0xd800 && code <= 0xdfff) {
      continue
    }
    if (code === 10 || code === 13 || code === 9 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      result += s[i]
    } else {
      result += ' '
    }
  }
  return result.replace(/[ \t]+/g, ' ').trim()
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const CONTENT_W = PAGE_W - MARGIN * 2 // 182mm
const FOOTER_H = 14

// Cache en memoria para no re-descargar imágenes en la misma sesión
const imageBase64Cache = new Map<string, string>()

/**
 * Descarga y procesa imágenes de forma ultra robusta:
 * 1. URLs relativas (/logo.png) se cargan directo en el cliente (evita error de proxy con relative path).
 * 2. URLs remotas usan el proxy y reintentan antes de pasar a la siguiente foto disponible.
 * 3. Renderiza en canvas de alta resolución con fondo blanco para mantener nitidez al imprimir.
 */
async function fetchAndProcessImage(url: string, timeoutMs: number = 7000): Promise<string | null> {
  url = String(url || '').trim()
  if (!url || typeof window === 'undefined') return null
  if (imageBase64Cache.has(url)) return imageBase64Cache.get(url)!

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let dataUrl = ''

    if (url.startsWith('data:') || url.startsWith('/')) {
      // Rutas locales de Next.js públicas o ya dataUrls: no necesitan proxy
      dataUrl = url
    } else {
      // URLs externas remotas: usar proxy para saltar restricciones de CORS
      const proxyUrl = `/api/admin/proxy-image?url=${encodeURIComponent(url)}`
      for (let attempt = 0; attempt < 2 && !dataUrl; attempt++) {
        try {
          const res = await fetch(proxyUrl, { signal: controller.signal, cache: 'force-cache' })
          if (res.ok) {
            const json = await res.json()
            if (typeof json?.dataUrl === 'string' && json.dataUrl.startsWith('data:image/')) {
              dataUrl = json.dataUrl
            }
          }
        } catch {
          if (attempt === 1) dataUrl = url
        }
        if (!dataUrl && attempt === 0) await new Promise(resolve => setTimeout(resolve, 180))
      }
      // Si el proxy respondió con error, intentar una última carga directa. Algunos
      // CDNs permiten CORS y así se puede rescatar la imagen sin perderla en el PDF.
      if (!dataUrl) dataUrl = url
    }

    if (!dataUrl) {
      clearTimeout(timer)
      return null
    }

    const processed = await new Promise<string | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      const onLoadTimer = setTimeout(() => {
        resolve(null)
      }, timeoutMs)

      img.onload = () => {
        clearTimeout(onLoadTimer)
        try {
          const canvas = document.createElement('canvas')
          const size = 600
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(dataUrl.startsWith('data:') ? dataUrl : null)

          // Fondo blanco sólido
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, size, size)

          // Escalar manteniendo proporción
          const aspect = img.width / (img.height || 1)
          let w = size
          let h = size
          let dx = 0
          let dy = 0
          if (aspect > 1) {
            h = size / aspect
            dy = (size - h) / 2
          } else {
            w = size * aspect
            dx = (size - w) / 2
          }
          ctx.drawImage(img, dx, dy, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        } catch {
          resolve(dataUrl.startsWith('data:') ? dataUrl : null)
        }
      }

      img.onerror = () => {
        clearTimeout(onLoadTimer)
        resolve(null)
      }

      img.src = dataUrl
    })

    clearTimeout(timer)
    if (processed) {
      imageBase64Cache.set(url, processed)
    }
    return processed
  } catch (err) {
    clearTimeout(timer)
    return null
  }
}

/**
 * Genera el documento PDF formal de cotización Importadora Carlitos con diseño ejecutivo de alto nivel
 */
export async function buildCotizacionPdf(
  data: CotizacionData,
  onProgress?: ProgressCallback
): Promise<{ doc: jsPDF; filename: string; blobUrl: string }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // 1. Cargar Logotipo Importadora Carlitos
  onProgress?.(0, data.items.length + 1, 'Cargando logotipo...')
  let logoBase64: string | null = null
  if (data.pdfMode !== 'catalog') {
    try {
      logoBase64 = await fetchAndProcessImage('/logo.png', 2000)
      if (!logoBase64) {
        logoBase64 = await fetchAndProcessImage('/shopify/plantilla25/assets/images/logo.png', 2000)
      }
    } catch {}
  }

  // 2. Pre-cargar fotos de productos concurrentemente (rápido y sin congelar)
  const totalItems = data.items.length
  onProgress?.(1, totalItems + 1, 'Cargando fotos de catálogo...')

  const productImages: Array<string | null> = Array(totalItems).fill(null)
  let nextImageIndex = 0
  let completedImages = 0
  const imageWorkers = Array.from({ length: Math.min(totalItems, 5) }, async () => {
    while (true) {
      const i = nextImageIndex++
      if (i >= totalItems) return
      const item = data.items[i]
      const candidates = [...new Set([item.imageUrl, ...(item.imageUrls || [])]
        .map(url => String(url || '').trim())
        .filter(url => url && !/(?:placeholder|sin(?:%20|[\s_-])?(?:imagen|foto)|no-image)/i.test(url)))]
      for (const candidate of candidates) {
        try {
          const img = await fetchAndProcessImage(candidate, 7000)
          if (img) {
            productImages[i] = img
            break
          }
        } catch {
          // Probar la siguiente URL disponible del producto.
        }
      }
      completedImages++
      onProgress?.(completedImages + 1, totalItems + 1, `Foto ${completedImages} de ${totalItems}...`)
    }
  })
  await Promise.all(imageWorkers)

  onProgress?.(totalItems + 1, totalItems + 1, 'Generando diseño...')

  if (data.pdfMode === 'catalog') {
    drawCatalogOnlyPdf(doc, data, productImages)
    const filename = makePdfFilename(data, 'Catalogo')
    const blob = doc.output('blob')
    return { doc, filename, blobUrl: URL.createObjectURL(blob) }
  }

  // ─── Header Decorativo Superior ─────────────────────────────────────────────
  // Línea delgada y refinada (Azul Importadora Carlitos de 2.2mm)
  doc.setFillColor(...C.brand)
  doc.rect(0, 0, PAGE_W, 2.5, 'F')

  // ─── Bloque de Marca / Empresa ──────────────────────────────────────────────
  const headerY = 9

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'JPEG', MARGIN, headerY, 34, 14, undefined, 'FAST')
    } catch {
      drawBrandFallbackText(doc, MARGIN, headerY)
    }
  } else {
    drawBrandFallbackText(doc, MARGIN, headerY)
  }

  // Subtítulo e información de la empresa
  const infoStartX = MARGIN + 38

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primary)
  doc.text('DISTRIBUIDORA & IMPORTADORA MAYORISTA', infoStartX, headerY + 4)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)

  const empNombre = cleanPdfText(data.empresaNombre) || 'Importadora Carlitos'
  const empRut = cleanPdfText(data.empresaRut) || '77.862.693-4'
  doc.text(`${empNombre}  |  RUT: ${empRut}`, infoStartX, headerY + 8)

  const empDir = cleanPdfText(data.empresaDireccion) || 'Chacabuco #8, Estación Central, Santiago'
  const empDirFinal = empDir.toLowerCase().includes('chile') ? empDir : `${empDir}  |  Chile`
  doc.text(empDirFinal, infoStartX, headerY + 11.5)

  const empTel = cleanPdfText(data.empresaTelefono) || '+56 9 8552 0703'
  doc.text(`Tel/WhatsApp: ${empTel}`, infoStartX, headerY + 15)

  // ─── Badge de Cotización Formal (Lado Derecho) ───────────────────────────────
  const badgeW = 62
  const badgeH = 22
  const badgeX = PAGE_W - MARGIN - badgeW
  const badgeY = headerY

  // Contenedor tarjeta cotización con borde suave
  doc.setFillColor(...C.white)
  doc.setDrawColor(...C.gray200)
  doc.setLineWidth(0.3)
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'FD')

  // Cabecera de la tarjeta en Slate 800
  doc.setFillColor(...C.primary)
  doc.roundedRect(badgeX, badgeY, badgeW, 6.5, 2, 2, 'F')
  doc.rect(badgeX, badgeY + 4.5, badgeW, 2, 'F') // llenar esquinas inferiores

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)
  doc.text('COTIZACIÓN FORMAL', badgeX + badgeW / 2, badgeY + 4.5, { align: 'center' })

  // Folio en Slate de alto contraste
  const folio = data.folio || `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.brandDark)
  doc.text(folio, badgeX + badgeW / 2, badgeY + 11.5, { align: 'center' })

  doc.setFontSize(6.8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)
  const fechaEmision = data.fecha || new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.text(`Fecha: ${fechaEmision}`, badgeX + 4, badgeY + 16)
  doc.text(`Validez: ${cleanPdfText(data.validezTexto) || '48 Horas'}`, badgeX + 4, badgeY + 19.5)

  // ─── Tarjetas de Información: Cliente & Emisión ────────────────────────────
  const infoCardY = 35
  const cardW = (CONTENT_W - 4) / 2 // 89mm cada una
  const cardH = 22

  // Tarjeta 1: Cliente
  doc.setFillColor(...C.gray50)
  doc.setDrawColor(...C.gray200)
  doc.setLineWidth(0.3)
  doc.roundedRect(MARGIN, infoCardY, cardW, cardH, 2, 2, 'FD')

  // Acento superior discreto
  doc.setFillColor(...C.brand)
  doc.roundedRect(MARGIN, infoCardY, cardW, 1.2, 1, 1, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.brandDark)
  doc.text('DATOS DEL CLIENTE', MARGIN + 4, infoCardY + 5)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primaryDark)
  const clienteNombreDisplay = cleanPdfText(data.clienteNombre || 'Cliente General').slice(0, 38)
  doc.text(clienteNombreDisplay, MARGIN + 4, infoCardY + 10)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)
  doc.text(`Teléfono: ${cleanPdfText(data.clienteTelefono) || 'No registrado'}`, MARGIN + 4, infoCardY + 14.5)

  const rutOciudad = [
    data.clienteRut ? `RUT: ${cleanPdfText(data.clienteRut)}` : '',
    data.clienteCiudad ? `Destino: ${cleanPdfText(data.clienteCiudad)}` : 'Retiro en Sala'
  ].filter(Boolean).join('  |  ')
  doc.text(rutOciudad, MARGIN + 4, infoCardY + 18.5)

  // Tarjeta 2: Sucursal & Emisión
  const card2X = MARGIN + cardW + 4
  doc.setFillColor(...C.gray50)
  doc.setDrawColor(...C.gray200)
  doc.roundedRect(card2X, infoCardY, cardW, cardH, 2, 2, 'FD')

  // Acento superior discreto
  doc.setFillColor(...C.primary)
  doc.roundedRect(card2X, infoCardY, cardW, 1.2, 1, 1, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.gray700)
  doc.text('EMISIÓN & ATENCIÓN COMERCIAL', card2X + 4, infoCardY + 5)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primaryDark)
  doc.text(cleanPdfText(data.sedeNombre) || 'Importadora Carlitos Central', card2X + 4, infoCardY + 10)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)
  doc.text(`Atendido por: ${cleanPdfText(data.vendedorNombre) || 'Administrador'}`, card2X + 4, infoCardY + 14.5)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.emerald)
  doc.text('Tarifa: Precios Mayoristas Preferenciales', card2X + 4, infoCardY + 18.5)

  // ─── Catálogo de productos cotizados ───────────────────────────────────────
  const mostrarMayorista = data.mostrarPrecioMayorista !== false
  const cardGapX = 6
  const cardGapY = 5
  const productCardW = (CONTENT_W - cardGapX) / 2
  const productCardH = 76
  const pageCapacity = 4
  let lastTableY = 61

  data.items.forEach((item, index) => {
    const pageItemIndex = index % pageCapacity
    if (index > 0 && pageItemIndex === 0) {
      doc.addPage()
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.primary)
      doc.text('COTIZACIÓN · CONTINUACIÓN DE PRODUCTOS', MARGIN, 15)
      doc.setDrawColor(...C.gray200)
      doc.line(MARGIN, 19, PAGE_W - MARGIN, 19)
    }

    const pageStartY = index < pageCapacity ? 61 : 25
    const row = Math.floor(pageItemIndex / 2)
    const col = pageItemIndex % 2
    const x = MARGIN + col * (productCardW + cardGapX)
    const y = pageStartY + row * (productCardH + cardGapY)
    const imageSize = 36
    const imageX = x + (productCardW - imageSize) / 2
    const imageY = y + 3

    doc.setFillColor(...C.white)
    doc.setDrawColor(...C.gray200)
    doc.setLineWidth(0.35)
    doc.roundedRect(x, y, productCardW, productCardH, 2, 2, 'FD')
    doc.setFillColor(...C.brand)
    doc.roundedRect(x + 0.5, y + 0.5, productCardW - 1, 1.4, 1, 1, 'F')

    if (productImages[index]) {
      try {
        doc.setFillColor(...C.white)
        doc.roundedRect(imageX, imageY, imageSize, imageSize, 1.5, 1.5, 'F')
        doc.addImage(productImages[index]!, 'JPEG', imageX, imageY, imageSize, imageSize, undefined, 'FAST')
        doc.setDrawColor(...C.gray200)
        doc.roundedRect(imageX, imageY, imageSize, imageSize, 1.5, 1.5, 'D')
      } catch {
        drawFallbackPhotoBox(doc, imageX, imageY, imageSize)
      }
    } else {
      drawFallbackPhotoBox(doc, imageX, imageY, imageSize)
    }

    const name = cleanPdfText(item.nombre) || 'Producto'
    const nameLines = doc.splitTextToSize(name, productCardW - 8).slice(0, 2)
    doc.setFontSize(9.2)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.primaryDark)
    doc.text(nameLines, x + 4, y + 45, { maxWidth: productCardW - 8, lineHeightFactor: 1.12 })

    const embQty = resolveEmbalajeQty(item)
    const boxCode = resolveBoxCode(item)
    const metaParts: string[] = []
    if (item.sku) {
      metaParts.push(`SKU: ${cleanPdfText(item.sku)}`)
    }
    if (boxCode) {
      const cleanBc = cleanPdfText(boxCode.replace(/^COD[:\s\-]*/i, ''))
      if (cleanBc) metaParts.push(`COD: ${cleanBc}`)
    }
    if (embQty > 1) {
      metaParts.push(`Caja x ${embQty} un`)
    } else if (item.packageQty) {
      const cleanPkg = cleanPdfText(String(item.packageQty))
      if (cleanPkg) metaParts.push(cleanPkg)
    }

    const precioMayoristaVal = item.precioMayorista && item.precioMayorista > 0 ? item.precioMayorista : item.precioUnitario
    if (mostrarMayorista && precioMayoristaVal !== item.precioUnitario) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.gray500)
      doc.text(`P. mayorista: ${fmtCLP(precioMayoristaVal)}`, x + 4, y + 57)
    }
    if (metaParts.length > 0) {
      doc.setFontSize(6.2)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.gray500)
      doc.text(metaParts.join(' · ').slice(0, 78), x + 4, y + 61)
    }

    doc.setFontSize(8.2)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.brandDark)
    doc.text(`Precio: ${fmtCLP(item.precioUnitario)}`, x + 4, y + 68)
    doc.setFontSize(7.6)
    doc.setTextColor(...C.primaryDark)
    doc.text(`${item.cantidad} un  ·  Total ${fmtCLP(item.subtotal)}`, x + 4, y + 73)

    lastTableY = y + productCardH
  })

  // ─── Sección de Condiciones & Totales ───────────────────────────────────────
  const summaryHeight = 48
  let summaryY = lastTableY + 5

  // Si no cabe en la página actual, agregar una nueva
  if (summaryY + summaryHeight > PAGE_H - FOOTER_H - 4) {
    doc.addPage()
    summaryY = MARGIN + 4
  }

  const termsW = 104
  const totalsW = CONTENT_W - termsW - 4 // 74mm

  // Caja Izquierda: Condiciones Comerciales
  doc.setFillColor(...C.gray50)
  doc.setDrawColor(...C.gray200)
  doc.setLineWidth(0.3)
  doc.roundedRect(MARGIN, summaryY, termsW, summaryHeight, 2, 2, 'FD')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primary)
  doc.text('CONDICIONES COMERCIALES Y DE COMPRA', MARGIN + 4, summaryY + 5)

  doc.setFontSize(6.8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)
  let termY = summaryY + 10
  const termLineSpacing = 4.2

  doc.text('- Validez: 48 horas continuas desde su emisión o hasta agotar stock.', MARGIN + 4, termY)
  termY += termLineSpacing

  // SOLICITUD EXPLÍCITA DEL CLIENTE: Solo Efectivo y Transferencia (SIN Débito)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primaryDark)
  doc.text('- Medios de Pago: Efectivo en sala y Transferencia electrónica.', MARGIN + 4, termY)
  termY += termLineSpacing

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)
  doc.text('- Despachos: A todo Chile (Starken, Pullman, Blue Express) o retiro en tienda.', MARGIN + 4, termY)
  termY += termLineSpacing
  doc.text('- Confirmación: Para procesar pedido, adjuntar comprobante vía WhatsApp.', MARGIN + 4, termY)
  termY += termLineSpacing

  if (data.notas && data.notas.trim()) {
    const customNote = cleanPdfText(`- Observación: ${data.notas.trim()}`).slice(0, 95)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.brandDark)
    doc.text(customNote, MARGIN + 4, termY)
    termY += termLineSpacing
  }

  doc.setFontSize(6.2)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...C.gray400)
  doc.text('* Documento de cotización informativo. No constituye comprobante tributario.', MARGIN + 4, summaryY + summaryHeight - 3)

  // Caja Derecha: Resumen de Totales
  const totalsX = MARGIN + termsW + 4
  doc.setFillColor(...C.white)
  doc.setDrawColor(...C.gray200)
  doc.roundedRect(totalsX, summaryY, totalsW, summaryHeight, 2, 2, 'FD')

  const totalUnidades = data.items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0)

  doc.setFontSize(7.2)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray600)

  let rowY = summaryY + 6.5
  doc.text('Total Unidades:', totalsX + 4, rowY)
  doc.setFont('helvetica', 'bold')
  doc.text(`${totalUnidades} un`, totalsX + totalsW - 4, rowY, { align: 'right' })

  rowY += 5
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal:', totalsX + 4, rowY)
  doc.setFont('helvetica', 'bold')
  doc.text(fmtCLP(data.subtotal), totalsX + totalsW - 4, rowY, { align: 'right' })

  if (data.descuentoGlobalMonto > 0) {
    rowY += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.amberDark)
    doc.text(`Descuento (${data.descuentoGlobalPct}%):`, totalsX + 4, rowY)
    doc.setFont('helvetica', 'bold')
    doc.text(`-${fmtCLP(data.descuentoGlobalMonto)}`, totalsX + totalsW - 4, rowY, { align: 'right' })
    doc.setTextColor(...C.gray600)
  }

  // Caja de Total Final Destacada en Slate 800
  const totalBoxY = summaryY + summaryHeight - 17
  const totalBoxH = 14
  doc.setFillColor(...C.primary)
  doc.roundedRect(totalsX + 3, totalBoxY, totalsW - 6, totalBoxH, 2, 2, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.amberLight)
  doc.text('TOTAL COTIZACIÓN', totalsX + 6, totalBoxY + 5)

  doc.setFontSize(13.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)
  doc.text(fmtCLP(data.total), totalsX + totalsW - 6, totalBoxY + 10.5, { align: 'right' })

  // ─── Pie de Página (Numeración en todas las hojas) ──────────────────────────
  addPageFooters(doc, cleanPdfText(data.sedeNombre) || 'Central')

  // ─── Generación de Blob y Retorno ──────────────────────────────────────────
  const filename = makePdfFilename(data, 'Cotizacion')

  const blob = doc.output('blob')
  const blobUrl = URL.createObjectURL(blob)

  return { doc, filename, blobUrl }
}

function drawCatalogOnlyPdf(doc: jsPDF, data: CotizacionData, productImages: Array<string | null>) {
  const gapX = 7
  const gapY = 6
  const cardW = (CONTENT_W - gapX) / 2
  const cardH = 77
  const capacity = 6
  const imageSize = 46

  data.items.forEach((item, index) => {
    const pageIndex = Math.floor(index / capacity)
    const pageItem = index % capacity
    if (pageItem === 0) {
      if (pageIndex > 0) doc.addPage()
      const pageDate = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
      doc.setFillColor(...C.brand)
      doc.rect(0, 0, PAGE_W, 2.5, 'F')
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.primaryDark)
      doc.text('CATÁLOGO DE PRODUCTOS', MARGIN, 15)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.gray500)
      doc.text(pageDate, PAGE_W - MARGIN, 15, { align: 'right' })
      doc.setDrawColor(...C.gray200)
      doc.line(MARGIN, 20, PAGE_W - MARGIN, 20)
    }

    const col = pageItem % 2
    const row = Math.floor(pageItem / 2)
    const x = MARGIN + col * (cardW + gapX)
    const y = 27 + row * (cardH + gapY)
    const imageX = x + (cardW - imageSize) / 2
    const imageY = y + 3

    doc.setFillColor(...C.white)
    doc.setDrawColor(...C.gray200)
    doc.setLineWidth(0.35)
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'FD')
    doc.setFillColor(...C.brand)
    doc.roundedRect(x + 0.5, y + 0.5, cardW - 1, 1.5, 1, 1, 'F')

    if (productImages[index]) {
      try {
        doc.addImage(productImages[index]!, 'JPEG', imageX, imageY, imageSize, imageSize, undefined, 'FAST')
      } catch {
        drawFallbackPhotoBox(doc, imageX, imageY, imageSize)
      }
    } else {
      drawFallbackPhotoBox(doc, imageX, imageY, imageSize)
    }

    const nameLines = doc.splitTextToSize(cleanPdfText(item.nombre) || 'Producto', cardW - 8).slice(0, 2)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.primaryDark)
    doc.text(nameLines, x + 4, y + 55, { maxWidth: cardW - 8, lineHeightFactor: 1.12 })

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.brandDark)
    doc.text(fmtCLP(item.precioUnitario), x + 4, y + 71)
  })

  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page)
    doc.setDrawColor(...C.gray200)
    doc.line(MARGIN, PAGE_H - 9, PAGE_W - MARGIN, PAGE_H - 9)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.gray500)
    doc.text(`${page} / ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' })
  }
}

function makePdfFilename(data: CotizacionData, prefix: 'Cotizacion' | 'Catalogo') {
  const cleanCliente = cleanPdfText(data.clienteNombre || 'Cliente')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 20)
  const cleanFecha = new Date().toISOString().slice(0, 10)
  return prefix === 'Catalogo'
    ? `Catalogo_Importadora_Carlitos_${cleanFecha}.pdf`
    : `Cotizacion_Importadora_Carlitos_${cleanCliente}_${cleanFecha}.pdf`
}

function drawBrandFallbackText(doc: jsPDF, x: number, y: number) {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primaryDark)
  doc.text('Importadora Carlitos', x, y + 7)
}

function drawFallbackPhotoBox(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(...C.gray100)
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.15)
  doc.rect(x, y, size, size, 'FD')

  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.gray400)
  doc.text('SIN FOTO', x + size / 2, y + size / 2 + 1.5, { align: 'center' })
}

function addPageFooters(doc: jsPDF, sedeName: string) {
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...C.gray200)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - FOOTER_H, PAGE_W - MARGIN, PAGE_H - FOOTER_H)

    doc.setFontSize(6.8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.gray500)
  doc.text(`Importadora Carlitos  |  ${sedeName || 'Central'}  |  Chacabuco #8, Estación Central`, MARGIN, PAGE_H - 8)
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' })
  }
}
