'use client'

import React, { useState, useMemo } from 'react'
import {
  X,
  FileDown,
  Eye,
  Send,
  Copy,
  Check,
  Package,
  Sparkles,
  Phone,
  User,
  MapPin,
  FileText,
  Loader2,
  Percent,
} from 'lucide-react'
import {
  buildCotizacionPdf,
  CotizacionData,
  CotizacionItem,
} from '@/lib/cotizacionPdfGenerator'
import { resolveEmbalajeQty, resolveBoxCode } from '@/lib/embalajeHelper'

interface ProductDocRef {
  $id?: string
  sku: string
  nombre: string
  precio_detalle?: number
  precio_mayorista?: number
  precio_segundo?: number
  imageUrl?: string
  packageQty?: string
  embalajeQty?: number
  boxCode?: string
}

interface CartItemRef {
  productId?: string
  sku: string
  nombre: string
  cantidad: number
  precioUnitario: number
  priceField?: string
  priceLabel?: string
  descuentoPct: number
  subtotal: number
  imageUrl?: string
  packageQty?: string
  embalajeQty?: number
}

interface PosCotizacionModalProps {
  isOpen: boolean
  onClose: () => void
  cart: CartItemRef[]
  descuentoGlobalPct: number
  sede: string
  posUser: { id?: string; nombre?: string; cargo?: string } | null
  activeTabName?: string
  products?: Map<string, ProductDocRef>
  empresaConfig?: {
    nombreEmpresa?: string
    rut?: string
    direccion?: string
    telefono?: string
  }
  showToast?: (msg: string, type: 'ok' | 'err' | 'info') => void
}

const fmtCLP = (n: number) => {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n || 0))
  return sign + '$' + abs.toLocaleString('es-CL')
}

export default function PosCotizacionModal({
  isOpen,
  onClose,
  cart,
  descuentoGlobalPct,
  sede,
  posUser,
  activeTabName = '',
  products,
  empresaConfig,
  showToast,
}: PosCotizacionModalProps) {
  // Datos del cliente y cotización editables
  const initialClienteNombre = activeTabName && !activeTabName.toLowerCase().startsWith('cliente ') ? activeTabName : ''
  const [clienteNombre, setClienteNombre] = useState(initialClienteNombre)
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteCiudad, setClienteCiudad] = useState('')
  const [notas, setNotas] = useState('Validez de 48 horas. Precios especiales por mayor.')
  const [mostrarPrecioMayorista, setMostrarPrecioMayorista] = useState(true)
  const [pdfMode, setPdfMode] = useState<'quote' | 'catalog'>('quote')

  // Estados de generación y copiado
  const [generating, setGenerating] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [copied, setCopied] = useState(false)

  // Enriquecer items del carrito con precios mayoristas e imágenes del catálogo
  const cotizacionItems: CotizacionItem[] = useMemo(() => {
    return cart.map((c) => {
      const productKeys = [c.productId, c.sku, c.sku.trim().toUpperCase(), c.sku.trim().toLowerCase()].filter(Boolean) as string[]
      const prod = productKeys.map(key => products?.get(key)).find(Boolean)
      const precioMayorista = prod?.precio_mayorista && prod.precio_mayorista > 0 ? prod.precio_mayorista : c.precioUnitario
      const precioDetalle = prod?.precio_detalle || c.precioUnitario
      const imageUrls = [...new Set([
        c.imageUrl,
        prod?.imageUrl,
        (prod as any)?.IMAGEURL,
        (prod as any)?.imageURL,
        (prod as any)?.image_url,
        (prod as any)?.imageUrl2,
        (prod as any)?.IMAGEURL2,
      ].map(url => String(url || '').trim()).filter(Boolean))]
      const imageUrl = imageUrls[0] || ''
      const packageQty = c.packageQty || prod?.packageQty
      const embalajeQty = c.embalajeQty || prod?.embalajeQty
      const boxCode = (prod as any)?.boxCode || (c as any)?.boxCode

      return {
        sku: c.sku,
        nombre: c.nombre,
        cantidad: c.cantidad,
        precioUnitario: c.precioUnitario,
        subtotal: c.subtotal,
        imageUrl,
        imageUrls,
        precioMayorista,
        precioDetalle,
        embalajeQty,
        packageQty,
        boxCode,
        priceLabel: c.priceLabel,
      }
    })
  }, [cart, products])

  // Cálculos financieros
  const subtotal = useMemo(() => cotizacionItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0), [cotizacionItems])
  const descuentoMonto = Math.round((subtotal * (descuentoGlobalPct || 0)) / 100)
  const total = Math.max(0, subtotal - descuentoMonto)
  const totalUnidades = useMemo(() => cotizacionItems.reduce((s, it) => s + (Number(it.cantidad) || 0), 0), [cotizacionItems])

  // Texto formateado para WhatsApp
  const whatsappText = useMemo(() => {
    const fecha = new Date().toLocaleDateString('es-CL')
    const cliente = clienteNombre.trim() || 'Estimado(a) Cliente'
    const sedeLabel = sede ? sede.replace(/[-_]/g, ' ').toUpperCase() : 'CENTRAL'

    const lineas = cotizacionItems.map((item, i) => {
      const embQty = resolveEmbalajeQty(item)
      const embLabel = embQty > 1 ? ` (📦 Caja x ${embQty})` : ''
      return `${i + 1}. *${item.nombre}*${embLabel}\n   👉 ${item.cantidad} un x ${fmtCLP(item.precioUnitario)} = *${fmtCLP(item.subtotal)}*`
    }).join('\n\n')

    let txt = `📄 *COTIZACIÓN FORMAL - Importadora Carlitos* 📄\n`
    txt += `📅 *Fecha:* ${fecha}\n`
    txt += `👤 *Cliente:* ${cliente}\n`
    txt += `🏢 *Sucursal:* Importadora Carlitos ${sedeLabel}\n`
    txt += `👩‍💼 *Atendido por:* ${posUser?.nombre || 'Venta Web'}\n\n`
    txt += `━━━━━━━━━━━━━━━━━━━━━\n`
    txt += `🛒 *DETALLE DE PRODUCTOS:*\n\n`
    txt += `${lineas}\n`
    txt += `━━━━━━━━━━━━━━━━━━━━━\n`
    txt += `📦 *Total Unidades:* ${totalUnidades} un\n`
    txt += `💰 *Subtotal:* ${fmtCLP(subtotal)}\n`
    if (descuentoMonto > 0) {
      txt += `🏷️ *Descuento (${descuentoGlobalPct}%):* -${fmtCLP(descuentoMonto)}\n`
    }
    txt += `✨ *TOTAL A PAGAR: ${fmtCLP(total)} CLP* ✨\n\n`
    txt += `⏱️ *Validez:* 48 horas continuas o agotar stock.\n`
    txt += `🚚 *Despachos:* Todo Chile por Starken, Pullman, Blue Express o retiro en tienda.\n`
    txt += `💵 *Medios de Pago:* Efectivo en sala y Transferencia electrónica.\n\n`
    txt += `_Te hemos preparado tu cotización oficial en PDF con imágenes y detalle mayorista. ¡Quedamos atentos a tu confirmación!_`

    return txt
  }, [cotizacionItems, clienteNombre, sede, posUser, totalUnidades, subtotal, descuentoMonto, descuentoGlobalPct, total])

  if (!isOpen) return null

  // Preparar payload para el generador de PDF
  const preparePdfData = (): CotizacionData => {
    const finalClienteNombre = clienteNombre.trim() || activeTabName || 'Cliente General'
    const sedeNombre = sede ? `Importadora Carlitos ${sede.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}` : 'Importadora Carlitos Central'

    return {
      clienteNombre: finalClienteNombre,
      clienteTelefono: clienteTelefono.trim() || undefined,
      clienteCiudad: clienteCiudad.trim() || undefined,
      sedeNombre,
      vendedorNombre: posUser?.nombre || 'Caja Web',
      empresaNombre: empresaConfig?.nombreEmpresa || 'Importadora Carlitos',
      empresaRut: empresaConfig?.rut || '77.862.693-4',
      empresaDireccion: empresaConfig?.direccion || 'Chacabuco #8, Estación Central, Santiago',
      empresaTelefono: empresaConfig?.telefono || '+56 9 8552 0703',
      items: cotizacionItems,
      subtotal,
      descuentoGlobalPct,
      descuentoGlobalMonto: descuentoMonto,
      total,
      notas,
      mostrarPrecioMayorista,
      pdfMode,
    }
  }

  // Descargar PDF directamente
  const handleDownloadPdf = async () => {
    try {
      setGenerating(true)
      setProgressText('Iniciando generador...')
      const pdfData = preparePdfData()
      const { doc, filename } = await buildCotizacionPdf(pdfData, (curr, tot, label) => {
        setProgressText(label)
      })
      doc.save(filename)
      showToast?.('PDF generado y descargado exitosamente', 'ok')
    } catch (err: any) {
      console.error('[Cotizacion] Error generando PDF:', err)
      showToast?.('Error al generar el PDF: ' + (err?.message || 'Error desconocido'), 'err')
    } finally {
      setGenerating(false)
      setProgressText('')
    }
  }

  // Abrir / Ver / Imprimir PDF en nueva pestaña (con fallback automático si el navegador bloquea popups)
  const handlePreviewPdf = async () => {
    try {
      setGenerating(true)
      setProgressText('Generando vista previa...')
      const pdfData = preparePdfData()
      const { doc, filename, blobUrl } = await buildCotizacionPdf(pdfData, (curr, tot, label) => {
        setProgressText(label)
      })
      const win = window.open(blobUrl, '_blank')
      if (!win) {
        doc.save(filename)
        showToast?.('Ventana emergente bloqueada por el navegador. Se descargó el PDF directamente.', 'info')
      } else {
        showToast?.('Cotización abierta en nueva pestaña', 'ok')
      }
    } catch (err: any) {
      console.error('[Cotizacion] Error en preview PDF:', err)
      showToast?.('Error al abrir la vista previa', 'err')
    } finally {
      setGenerating(false)
      setProgressText('')
    }
  }

  // Enviar por WhatsApp
  const handleSendWhatsApp = () => {
    const cleanPhone = clienteTelefono.replace(/\D/g, '')
    const encoded = encodeURIComponent(whatsappText)

    if (cleanPhone.length >= 8) {
      // Si el número no tiene código de país (Chile = 56), agregarlo
      const finalPhone = cleanPhone.startsWith('56') ? cleanPhone : `56${cleanPhone}`
      window.open(`https://wa.me/${finalPhone}?text=${encoded}`, '_blank')
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank')
    }
  }

  // Copiar resumen de texto
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      showToast?.('Resumen copiado al portapapeles', 'ok')
    } catch {
      showToast?.('No se pudo copiar el texto', 'err')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh] overflow-hidden">
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">Cotización Formal para Cliente</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500 text-slate-950">
                  PDF Premium
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Diseño profesional con fotos de productos, precios mayoristas y condiciones comerciales.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Body (Scrollable) ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/60 dark:bg-slate-950/40">
          {/* Tarjeta de Datos del Cliente */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <User size={14} className="text-blue-500" /> Datos del Cliente y Envío
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Nombre / Empresa
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    placeholder="Ej: Distribuidora Sol SpA"
                    className="w-full pl-8 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <User size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  WhatsApp / Teléfono
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="Ej: +56 9 1234 5678"
                    className="w-full pl-8 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Phone size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Ciudad / Destino de Despacho
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clienteCiudad}
                    onChange={(e) => setClienteCiudad(e.target.value)}
                    placeholder="Ej: Temuco (Starken) o Retiro en Sala"
                    className="w-full pl-8 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <MapPin size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Observaciones / Términos de Cotización
                </label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Sujeto a disponibilidad en bodega. Despacho por pagar."
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center sm:justify-end pt-4 sm:pt-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mostrarPrecioMayorista}
                    onChange={(e) => setMostrarPrecioMayorista(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Mostrar precio mayorista de referencia
                  </span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Formato del PDF
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPdfMode('quote')}
                  aria-pressed={pdfMode === 'quote'}
                  className={`rounded-xl border p-3 text-left transition ${pdfMode === 'quote' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white"><FileText size={15} className="text-blue-600" /> Cotización tipo catálogo</span>
                  <span className="block mt-1 text-[11px] text-slate-500">Fotos grandes, cliente, cantidades y total.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfMode('catalog')}
                  aria-pressed={pdfMode === 'catalog'}
                  className={`rounded-xl border p-3 text-left transition ${pdfMode === 'catalog' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white"><Package size={15} className="text-indigo-600" /> Catálogo visual</span>
                  <span className="block mt-1 text-[11px] text-slate-500">Solo foto, nombre y precio; sin datos del pedido.</span>
                </button>
              </div>
            </div>
          </div>

          {/* Lista de Productos a Cotizar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Productos en la Cotización ({cotizacionItems.length} {cotizacionItems.length === 1 ? 'ítem' : 'ítems'} • {totalUnidades} un)
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Sede: <strong className="text-slate-800 dark:text-slate-200">{sede}</strong>
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-64 overflow-y-auto">
              {cotizacionItems.map((item, index) => {
                const embQty = resolveEmbalajeQty(item)
                const boxCode = resolveBoxCode(item)

                return (
                  <div key={item.sku + index} className="p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.nombre}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Package size={20} className="text-slate-400" />
                      )}
                    </div>

                    {/* Detalle Producto */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {item.nombre}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                        <span className="font-mono font-medium text-slate-600 dark:text-slate-400">
                          SKU: {item.sku}
                        </span>
                        {boxCode && (
                          <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.2 rounded font-semibold text-[10px]">
                            COD: {boxCode.replace(/^COD[:\s\-]*/i, '')}
                          </span>
                        )}
                        {embQty > 1 && (
                          <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-1.5 py-0.2 rounded font-semibold text-[10px]">
                            📦 Caja x {embQty} un
                          </span>
                        )}
                      </div>
                    </div>

                    {/* P. Mayorista Referencial */}
                    {mostrarPrecioMayorista && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">P. Mayorista</span>
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtCLP(item.precioMayorista || item.precioUnitario)}
                        </span>
                      </div>
                    )}

                    {/* Cantidad y Precio */}
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                        {item.cantidad} un × {fmtCLP(item.precioUnitario)}
                      </span>
                      <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                        {fmtCLP(item.subtotal)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Totales Footer Bar */}
            <div className="bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">Subtotal:</span>{' '}
                  <strong className="text-white">{fmtCLP(subtotal)}</strong>
                </div>
                {descuentoMonto > 0 && (
                  <div>
                    <span className="text-amber-400">Desc. ({descuentoGlobalPct}%):</span>{' '}
                    <strong className="text-amber-300">-{fmtCLP(descuentoMonto)}</strong>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Unidades:</span>{' '}
                  <strong className="text-white">{totalUnidades} un</strong>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Total Cotización:
                </span>
                <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {fmtCLP(total)} <span className="text-xs font-semibold text-slate-400">CLP</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer de Acciones ── */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Mensaje de progreso si está procesando */}
          <div className="w-full sm:w-auto">
            {generating ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 animate-pulse">
                <Loader2 size={16} className="animate-spin" />
                <span>{progressText || 'Generando documento...'}</span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                {pdfMode === 'catalog' ? 'Se generará un catálogo visual con fotos y precios grandes.' : 'Cotización en formato catálogo con productos, datos del cliente y totales.'}
              </p>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <button
              onClick={handleCopyText}
              disabled={generating}
              className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              title="Copiar texto resumen para WhatsApp"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span>{copied ? 'Copiado' : 'Copiar Texto'}</span>
            </button>

            <button
              onClick={handleSendWhatsApp}
              disabled={generating}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            >
              <Send size={14} />
              <span>Enviar WhatsApp</span>
            </button>

            <button
              onClick={handlePreviewPdf}
              disabled={generating}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Eye size={14} />
              <span>Ver {pdfMode === 'catalog' ? 'catálogo' : 'cotización'}</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={generating}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              <span>Descargar {pdfMode === 'catalog' ? 'catálogo' : 'cotización'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
