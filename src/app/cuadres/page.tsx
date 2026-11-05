'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wallet, CreditCard, ArrowLeftRight, HandCoins, TrendingUp, CircleDollarSign,
  Scale, Image, Trash2, Building2, TreePine, Share2, Download, Lock,
  FileSpreadsheet, Send, RotateCcw, Package, Plus, LayoutDashboard,
  Sparkles, Loader2, X, RefreshCw,
} from 'lucide-react'
import { SEDES, SedeSlug } from '@/types'
import { fetchCuadresERP, deleteCuadreERP } from '@/lib/cuadresErpService'
import type { CuadreERP } from '@/lib/cuadresErpService'
import { fetchAllFirebaseErpProducts } from '@/lib/firebaseErpService'
import { esCompraMercaderia, obtenerGastosQueAfectanGanancia, sumarGastosMercaderia } from '@/lib/gastosProfit'
import { toPng } from 'html-to-image'
import EstrategiaMargenModal from './EstrategiaMargenModal'

// ---------- Inline types ----------
interface GastoItem { monto?: number; observacion?: string; detalle?: string; tipo?: string; categoria?: string; tipoGasto?: string; esDevolucion?: boolean; esAnulada?: boolean; folio?: string }
interface TopProduct { sku: string; nombre: string; cantidadVendida: number; ventasBrutas: number; ventasNetas: number; costoNeto: number }

// ---------- GROUPS mock ----------
type GroupKey = string
const GROUPS: Record<GroupKey, { sedes: SedeSlug[] }> = {}

type CuadreSedeSlug = SedeSlug

type GroupTotals = { bruto: number; gastos: number; neto: number; debitoSistema: number; debitoReal: number; transferencias: number }
const EMPTY_GROUP_TOTALS: GroupTotals = { bruto: 0, gastos: 0, neto: 0, debitoSistema: 0, debitoReal: 0, transferencias: 0 }

// ─────────────────────────────────────────────────────────────
export default function ERPPage() {
  const router = useRouter()

  const SEDE_UI: Record<string, { icon: string; bg: string; border: string; bar: string; text: string; chipBg: string; chipText: string }> = {
    'donbalato-central': { icon: '🏪', bg: 'bg-sky-50', border: 'border-sky-300', bar: 'bg-sky-500', text: 'text-sky-900', chipBg: 'bg-sky-100', chipText: 'text-sky-900' },
    'chacabuco-08': { icon: '🏬', bg: 'bg-indigo-50', border: 'border-indigo-300', bar: 'bg-indigo-500', text: 'text-indigo-900', chipBg: 'bg-indigo-100', chipText: 'text-indigo-900' },
    'alameda': { icon: '🌳', bg: 'bg-green-50', border: 'border-green-300', bar: 'bg-green-300', text: 'text-green-900', chipBg: 'bg-green-100', chipText: 'text-green-900' },
    'copiapo': { icon: '🏜️', bg: 'bg-amber-50', border: 'border-amber-300', bar: 'bg-amber-300', text: 'text-amber-900', chipBg: 'bg-amber-100', chipText: 'text-amber-900' },
    'la-florida': { icon: '🌺', bg: 'bg-pink-50', border: 'border-pink-300', bar: 'bg-pink-300', text: 'text-pink-900', chipBg: 'bg-pink-100', chipText: 'text-pink-900' },
  }

  const cuadreCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const reportPanelRef = useRef<HTMLDivElement | null>(null)
  const [reportRow, setReportRow] = useState<any | null>(null)
  const productsPanelRef = useRef<HTMLDivElement | null>(null)
  const [productsRow, setProductsRow] = useState<any | null>(null)
  const [iaAnalisis, setIaAnalisis] = useState<string | null>(null)
  const [iaLoading, setIaLoading] = useState(false)
  const [iaError, setIaError] = useState<string | null>(null)
  const [iaRow, setIaRow] = useState<any | null>(null)
  const [rows, setRows] = useState<CuadreERP[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated] = useState(true)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [monthDates, setMonthDates] = useState<Record<string, string[]>>({})
  const [selectedSede, setSelectedSede] = useState<'' | CuadreSedeSlug>('')
  const [multiSedeFilter, setMultiSedeFilter] = useState<CuadreSedeSlug[]>([])
  const [activeGroup, setActiveGroup] = useState<GroupKey | ''>('')

  const normSku = (v: any) => String(v ?? '').trim().toUpperCase()

  const [gastosSheet, setGastosSheet] = useState<{ open: boolean; sede?: string; fecha?: string; gastos?: GastoItem[]; fotos?: { url: string; tipo: 'gasto' | 'corte'; gastoIndex?: number; name?: string; caja?: 1 | 2 }[] }>({ open: false })
  const [globalGastosSheet, setGlobalGastosSheet] = useState<{ open: boolean; fecha?: string; items?: Array<{ sede: SedeSlug; monto: number; observacion?: string; categoria?: string; fotos: { url: string; tipo: 'gasto' | 'corte'; gastoIndex?: number; name?: string; caja?: 1 | 2 }[] }> }>({ open: false })
  const [cortesSheet, setCortesSheet] = useState<{ open: boolean; sede?: string; fecha?: string; items?: GastoItem[] }>({ open: false })
  const [topsSheet, setTopsSheet] = useState<{ open: boolean; sede?: string; fecha?: string; items?: TopProduct[] }>({ open: false })
  const [viewer, setViewer] = useState<{ open: boolean; urls: string[]; index: number; title?: string }>({ open: false, urls: [], index: 0 })
  const [estrategiaModal, setEstrategiaModal] = useState<{ open: boolean; sede?: string; fecha?: string }>({ open: false })

  const handleOpenEstrategia = (row: any) => {
    setEstrategiaModal({ open: true, sede: row?.sede, fecha: String(row?.fecha || '').slice(0, 10) })
  }
  const handleCloseEstrategia = () => {
    setEstrategiaModal({ open: false })
  }

  const clearMultiSedeFilter = () => { setMultiSedeFilter([]); setActiveGroup('') }

  // ── Load data (Appwrite) ───────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const cuadres = await fetchCuadresERP(3, true) // últimos 3 meses (forzar refresh sin caché)

        // Construir lista de fechas disponibles
        const fechasSet = new Set<string>()
        cuadres.forEach(c => fechasSet.add(c.fecha))
        const fechas = Array.from(fechasSet).sort((a, b) => b.localeCompare(a))

        // Construir meses disponibles
        const monthsMap: Record<string, string[]> = {}
        fechas.forEach(d => {
          const m = d.slice(0, 7)
          if (!monthsMap[m]) monthsMap[m] = []
          monthsMap[m].push(d)
        })
        Object.keys(monthsMap).forEach(m => monthsMap[m].sort((a, b) => b.localeCompare(a)))
        const months = Object.keys(monthsMap).sort((a, b) => b.localeCompare(a))

        setRows(cuadres)
        setAvailableDates(fechas)
        setMonthDates(monthsMap)
        setAvailableMonths(months)

        if (fechas.length > 0) {
          // Intentar seleccionar hoy (hora Chile UTC-3)
          const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
          const todayStr = now.toISOString().slice(0, 10)
          const todayExists = fechas.includes(todayStr)
          const targetDate = todayExists ? todayStr : fechas[0]
          setSelectedDate(targetDate)
          const targetMonth = targetDate.slice(0, 7)
          setSelectedMonth(months.includes(targetMonth) ? targetMonth : (months[0] || ''))
        }

        setError(null)
      } catch (e: any) {
        console.error('[ERP] Error cargando cuadres:', e)
        setError(`Error cargando cuadres: ${e?.message || String(e)}`)
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Lock body scroll when sheets open
  useEffect(() => {
    const anyOpen = gastosSheet.open || cortesSheet.open || topsSheet.open || viewer.open || estrategiaModal.open
    if (anyOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [gastosSheet.open, cortesSheet.open, topsSheet.open, viewer.open, estrategiaModal.open])

  // ── Costs from Appwrite ────────────────────────────────────
  const [costsBD, setCostsBD] = useState<Map<string, number>>(new Map())
  const [productImages, setProductImages] = useState<Map<string, string>>(new Map())
  const [minus10Flags] = useState<Set<string>>(new Set()) // sin ajuste_menos10 en Yaxsel

  useEffect(() => {
    async function loadCosts() {
      try {
        const products = await fetchAllFirebaseErpProducts()
        const map = new Map<string, number>()
        const imgMap = new Map<string, string>()
        for (const p of products) {
          const sku = String(p.sku || '').trim().toUpperCase()
          if (sku && p.costo_uni > 0) map.set(sku, p.costo_uni)
          if (sku && p.imageUrl) imgMap.set(sku, p.imageUrl)
        }
        setCostsBD(map)
        setProductImages(imgMap)
      } catch (err) {
        console.warn('[ERP] No se pudieron cargar costos de productos:', err)
      }
    }
    loadCosts()
  }, [])

  // ── Helpers ───────────────────────────────────────────────
  const money = (n?: number) => typeof n === 'number' ? `$${n.toLocaleString('es-CL')}` : '-'

  const SEDE_STYLES: Record<string, { bg: string; text: string; Icon: any }> = {
    'donbalato-central': { bg: 'bg-sky-100', text: 'text-sky-800', Icon: Building2 },
    'chacabuco-08': { bg: 'bg-indigo-100', text: 'text-indigo-800', Icon: Building2 },
    'copiapo': { bg: 'bg-amber-100', text: 'text-amber-800', Icon: Building2 },
    'la-florida': { bg: 'bg-pink-100', text: 'text-pink-800', Icon: Building2 },
    'alameda': { bg: 'bg-green-100', text: 'text-green-800', Icon: TreePine },
  }

  const calcBruto = (x: any) => {
    // Preferir totalBruto de calculos (es el total real de ventas)
    const fromCalculos = Number(x?.calculos?.totalBruto) || 0
    if (fromCalculos > 0) return fromCalculos
    const fromMontos = (Number(x?.montos?.efectivoSistema) || 0) + (Number(x?.montos?.debitoSistema) || 0) + (Number(x?.montos?.transferencias) || 0)
    if (fromMontos > 0) return fromMontos
    const items: any[] = Array.isArray(x?.topProducts) ? x.topProducts : []
    return items.reduce((s, p) => s + (Number(p?.ventasBrutas) || 0), 0)
  }

  const sumAnuladas = (x: any) => (Array.isArray(x?.anuladas) ? x.anuladas : []).reduce((s: number, a: any) => s + (Number(a?.monto) || 0), 0)
  const sumDevoluciones = (x: any) => (Array.isArray(x?.devoluciones) ? x.devoluciones : []).reduce((s: number, d: any) => s + (Number(d?.monto) || 0), 0)
  const esPagoMercaderia = (g: any) => esCompraMercaderia(g)
  const sumGastos = (x: any, incluirMercaderia = true) => (Array.isArray(x?.gastos) ? x.gastos : [])
    .filter((g: any) => incluirMercaderia || !esPagoMercaderia(g))
    .reduce((s: number, g: any) => s + (Number(g?.monto) || 0), 0)
  const calcNeto = (x: any) => calcBruto(x) - obtenerGastosQueAfectanGanancia(x) - sumAnuladas(x) - sumDevoluciones(x)

  const formatSedeLabel = (s: any) => {
    const slug = String(s || '').trim()
    const label = (SEDES as any)[slug] || String(s || '')
    return String(label).replace(/^YAXSELL\s*/i, '').trim()
  }

  const calcDifEfectivo = (x: any) => {
    const sistema = Number(x?.montos?.efectivoSistema) || 0
    const real = Number(x?.montos?.efectivoReal) || 0
    // En los cuadres sincronizados desde cierres, el efectivo del sistema ya viene
    // neto de las salidas registradas; no volver a restar gastos aquí.
    if (x?.calculos?.efectivoSistemaNetoSalidasCaja === true) return sistema - real
    // Todas las salidas de efectivo, incluida la mercadería, reducen el efectivo
    // que queda en caja. La clasificación solo las excluye del cálculo de ganancia.
    const gastosEfectivo = Array.isArray(x?.gastos) ? sumGastos(x, true) : (Number(x?.calculos?.gastosTotales) || 0)
    const anuladasT = sumAnuladas(x)
    const devolucionesT = sumDevoluciones(x)
    const justificado = gastosEfectivo + anuladasT + devolucionesT
    const esperado = real + justificado
    return sistema - esperado
  }

  const getCajaDiffInfo = (r: any) => {
    const hasMontos = r?.montos && typeof r.montos === 'object' && Object.keys(r.montos).length > 0
    const hasCalculos = r?.calculos && typeof r.calculos === 'object' && Object.keys(r.calculos).length > 0
    if (!hasMontos && !hasCalculos) return { label: 'Sin cuadre', className: 'text-amber-700', detail: 'No se ha realizado el corte del día' }
    const efectivoSistema = Number(r?.montos?.efectivoSistema) || 0
    const efectivoReal = Number(r?.montos?.efectivoReal) || 0
    if (r?.calculos?.efectivoSistemaNetoSalidasCaja === true) {
      const diff = efectivoSistema - efectivoReal
      if (diff === 0) return { label: 'Cuadra', className: 'text-green-700', detail: '' }
      const esSobrante = diff < 0
      return {
        label: esSobrante ? 'Sobrante' : 'No cuadra',
        className: esSobrante ? 'text-emerald-700' : 'text-red-700',
        detail: `${esSobrante ? 'Sobrante no justificado' : 'Faltante no justificado'}: ${money(Math.abs(diff))}`,
      }
    }
    const gastos = Array.isArray(r?.gastos) ? sumGastos(r, true) : (Number(r?.calculos?.gastosTotales) || 0)
    const anuladasT = sumAnuladas(r)
    const devolucionesT = sumDevoluciones(r)
    const justificado = gastos + anuladasT + devolucionesT
    const esperado = efectivoReal + justificado
    const diff = efectivoSistema - esperado
    if (diff === 0) return { label: 'Cuadra', className: 'text-green-700', detail: '' }
    const esSobrante = diff < 0
    return {
      label: esSobrante ? 'Sobrante' : 'No cuadra',
      className: esSobrante ? 'text-emerald-700' : 'text-red-700',
      detail: `${esSobrante ? 'Sobrante no justificado' : 'Faltante no justificado'}: ${money(Math.abs(diff))}`,
    }
  }

  const calcCostosProductos = (x: any) => {
    const fromCalculos = Number(x?.calculos?.costoProductos ?? x?.costoProductos) || 0
    if (fromCalculos > 0) return fromCalculos

    const items: TopProduct[] = Array.isArray(x?.topProducts) ? (x.topProducts as TopProduct[]) : []
    return items.reduce((sum, p) => {
      const sku = String(p?.sku || '').trim().toUpperCase()
      const cantidad = Number(p?.cantidadVendida) || 0
      const costoNetoReporte = Number(p?.costoNeto) || 0
      const costoUnitBD = Number(costsBD.get(sku) || 0)
      const base = costoUnitBD > 0 ? costoUnitBD : (cantidad > 0 ? costoNetoReporte / cantidad : 0)
      const isMinus10 = minus10Flags.has(sku)
      const costoUnit = Math.round(base * (isMinus10 ? 0.81 : 1))
      return sum + costoUnit * cantidad
    }, 0)
  }

  const getGananciaConciliada = (x: any): { ganancia: number; margen: number; ventasBrutas?: number; fuente?: string } | null => {
    const analisisProductos = x?.analisisProductosRetailbase
    const ventasProductos = Number(analisisProductos?.ventasBrutas) || 0
    const costoProductos = Number(analisisProductos?.costoProductos) || 0
    if (ventasProductos > 0 && costoProductos >= 0) {
      const ganancia = Number(analisisProductos?.gananciaBruta) || (ventasProductos - costoProductos)
      const margen = Number(analisisProductos?.margenBrutoPct) || (ganancia / ventasProductos) * 100
      return { ganancia, margen, ventasBrutas: ventasProductos, fuente: analisisProductos?.fuente }
    }

    const items: TopProduct[] = Array.isArray(x?.topProducts) ? x.topProducts : []
    if (items.length === 0) return null

    const ventasDetalle = items.reduce((sum, product) => sum + Math.max(0, Number(product?.ventasBrutas) || 0), 0)
    const costosDetalle = items.reduce((sum, product) => sum + Math.max(0, Number(product?.costoNeto) || 0), 0)
    const ventasCierre = calcBruto(x)
    const costosCierre = calcCostosProductos(x)
    const toleranciaVentas = Math.max(100, ventasCierre * 0.005)
    const toleranciaCostos = Math.max(100, costosCierre * 0.005)

    // No mostrar margen si el cierre y el detalle de productos provienen de
    // fuentes que no cuadran entre sí.
    if (ventasDetalle <= 0 || costosDetalle <= 0
      || Math.abs(ventasDetalle - ventasCierre) > toleranciaVentas
      || Math.abs(costosDetalle - costosCierre) > toleranciaCostos) return null

    const ganancia = ventasDetalle - costosDetalle
    return { ganancia, margen: (ganancia / ventasDetalle) * 100 }
  }

  // ── Sheet handlers ─────────────────────────────────────────
  const openViewer = (urls: string[], index = 0, title?: string) => setViewer({ open: true, urls, index, title })
  const closeViewer = () => setViewer({ open: false, urls: [], index: 0 })

  const openGastosSheet = (row: any) => {
    setGastosSheet({ open: true, sede: row?.sede, fecha: row?.fecha, gastos: Array.isArray(row?.gastos) ? row.gastos : [], fotos: Array.isArray(row?.fotos) ? row.fotos : [] })
  }
  const closeGastosSheet = () => setGastosSheet({ open: false })

  const openGlobalGastosSheet = () => {
    try {
      const rowsList: any[] = Array.isArray(sortedRowsForWeb) ? sortedRowsForWeb : []
      const items: Array<{ sede: SedeSlug; monto: number; observacion?: string; categoria?: string; fotos: any[] }> = []
      rowsList.forEach((r) => {
        const sede = (r?.sede || 'alameda') as SedeSlug
        const gastos: GastoItem[] = Array.isArray(r?.gastos) ? r.gastos : []
        const fotos: any[] = Array.isArray(r?.fotos) ? r.fotos : []
        gastos.forEach((g, idx) => {
          const fotosDeGasto = fotos.filter((f: any) => f?.tipo === 'gasto' && f?.gastoIndex === idx)
          items.push({ sede, monto: Number(g?.monto) || 0, observacion: g?.observacion, categoria: g?.tipo || g?.categoria || g?.tipoGasto, fotos: fotosDeGasto })
        })
      })
      items.sort((a, b) => b.monto - a.monto)
      setGlobalGastosSheet({ open: true, fecha: selectedDate || undefined, items })
    } catch { }
  }
  const closeGlobalGastosSheet = () => setGlobalGastosSheet({ open: false })

  const openCortesSheet = (row: any) => {
    const gastos: GastoItem[] = Array.isArray(row?.gastos) ? row.gastos : []
    const fromGastos = gastos.filter((g: any) => g?.esDevolucion || g?.esAnulada)
    const anuladas: GastoItem[] = (Array.isArray(row?.anuladas) ? row.anuladas : []).map((a: any) => ({ ...a, esAnulada: true }))
    const devoluciones: GastoItem[] = (Array.isArray(row?.devoluciones) ? row.devoluciones : []).map((d: any) => ({ ...d, esDevolucion: true }))
    setCortesSheet({ open: true, sede: row?.sede, fecha: row?.fecha, items: [...fromGastos, ...anuladas, ...devoluciones] })
  }
  const closeCortesSheet = () => setCortesSheet({ open: false })

  const openTopsSheet = (row: any) => {
    const items: TopProduct[] = Array.isArray(row?.topProducts) ? row.topProducts : []
    if (!items.length) { alert('No hay Top 10 para esta sede en esta fecha.'); return }
    setTopsSheet({ open: true, sede: row?.sede, fecha: row?.fecha, items })
  }
  const closeTopsSheet = () => setTopsSheet({ open: false })

  const handleDeleteCuadreOfDay = async (row: any) => {
    if (!row || row?._pending) { alert('No hay un cuadre creado para eliminar.'); return }
    const ok = window.confirm(
      `¿Eliminar el cuadre de ${formatSedeLabel(row?.sede)} del día ${row?.fecha}?\n\nEsto borrará el cuadre de la base de datos.`
    )
    if (!ok) return

    if (row.$id) {
      const deleted = await deleteCuadreERP(row.$id)
      if (!deleted) { alert('Error al eliminar el cuadre. Intenta nuevamente.'); return }
    }
    setRows(prev => prev.filter(r => r.$id !== row.$id))
    alert('Cuadre eliminado.')
  }

  const handleExportExcel = async () => {
    alert('Exportar Excel: próximamente disponible. Instala exceljs y file-saver para activarlo.')
  }

  const handleGenerateImage = async () => {
    alert('Generar imagen: próximamente disponible. Instala html-to-image para activarlo.')
  }

  const handleShareExcel = async () => {
    alert('Compartir: próximamente disponible.')
  }

  const handleSendWhatsAppPreview = async (_row: any, _stage: 'parte1' | 'parte2') => {
    alert('WhatsApp Preview: próximamente disponible.')
  }

  // Helper: reemplaza imágenes con placeholders para evitar CORS en toPng
  const replaceImagesForCapture = (el: HTMLElement) => {
    const imgs = el.querySelectorAll('img')
    const replacements: { img: HTMLImageElement; parent: Node; placeholder: HTMLElement }[] = []
    imgs.forEach(img => {
      const parent = img.parentNode
      if (!parent) return
      const placeholder = document.createElement('div')
      const w = img.offsetWidth || 40
      const h = img.offsetHeight || 40
      placeholder.style.cssText = `width: ${w}px; height: ${h}px; display: flex; align-items: center; justify-content: center; font-size: ${Math.min(h * 0.5, 20)}px; background: #f1f5f9; border-radius: 8px; flex-shrink: 0;`
      placeholder.textContent = '📦'
      parent.replaceChild(placeholder, img)
      replacements.push({ img, parent, placeholder })
    })
    return () => {
      replacements.forEach(({ img, parent, placeholder }) => {
        try { parent.replaceChild(img, placeholder) } catch {}
      })
    }
  }

  const handleDownloadSedeCardOnlyImage = async (row: any) => {
    const cardKey = `${row?.sede || ''}|${String(row?.fecha || '').slice(0, 10)}`
    const el = cuadreCardRefs.current[cardKey]
    if (!el) { alert('No se encontró la tarjeta.'); return }
    const restore = replaceImagesForCapture(el)
    try {
      const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `cuadre_${row?.sede || 'sede'}_${String(row?.fecha || '').slice(0, 10)}.png`
      a.click()
    } catch (e) { alert('Error al generar imagen: ' + (e as any)?.message) }
    finally { restore() }
  }

  const handleDownloadSedeCardReportImage = async (row: any) => {
    // Mostrar panel de reporte completo y capturarlo
    setReportRow(row)
    await new Promise(r => setTimeout(r, 200))
    const el = reportPanelRef.current
    if (!el) { alert('No se pudo generar el reporte.'); return }
    const restore = replaceImagesForCapture(el)
    try {
      const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `reporte_${row?.sede || 'sede'}_${String(row?.fecha || '').slice(0, 10)}.png`
      a.click()
    } catch (e) { alert('Error al generar imagen: ' + (e as any)?.message) }
    finally { restore(); setReportRow(null) }
  }

  const handleDownloadSedeProductsReportImage = async (row: any) => {
    setProductsRow(row)
    await new Promise(r => setTimeout(r, 500))
    const el = productsPanelRef.current
    if (!el) { alert('No se pudo generar el reporte.'); return }
    const restore = replaceImagesForCapture(el)
    try {
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `productos_${row?.sede || 'sede'}_${String(row?.fecha || '').slice(0, 10)}.png`
      a.click()
    } catch (e) {
      console.error('Error toPng:', e)
      alert('Error al generar imagen. Intenta de nuevo.')
    }
    finally { restore(); setProductsRow(null) }
  }

  const handleAnalizarConIA = async (row: any) => {
    setIaLoading(true)
    setIaError(null)
    setIaAnalisis(null)
    setIaRow(row)
    try {
      const res = await fetch('/api/ai-analisis-productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sede: row?.sede,
          fecha: String(row?.fecha || '').slice(0, 10),
          accion: 'analizar',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setIaAnalisis(data.texto || 'Sin respuesta del Contador IA')
    } catch (e: any) {
      setIaError(e.message || 'Error al analizar con IA')
    } finally {
      setIaLoading(false)
    }
  }

  const handleDownloadSedeGastosOnlyImage = async (row: any) => {
    const cardKey = `${row?.sede || ''}|${String(row?.fecha || '').slice(0, 10)}`
    const el = cuadreCardRefs.current[cardKey]
    if (!el) { alert('No se encontró la tarjeta.'); return }
    const restore = replaceImagesForCapture(el)
    try {
      const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `gastos_${row?.sede || 'sede'}_${String(row?.fecha || '').slice(0, 10)}.png`
      a.click()
    } catch (e) { alert('Error al generar imagen: ' + (e as any)?.message) }
    finally { restore() }
  }

  // ── Derived state ─────────────────────────────────────────
  const allSedeKeys = Object.keys(SEDES) as CuadreSedeSlug[]
  const rowsForSelected = rows.filter(r => {
    if (!selectedDate) return true
    const f = typeof r?.fecha === 'string' ? r.fecha.slice(0, 10) : String(r?.fecha || '').slice(0, 10)
    return f === selectedDate
  })
  const bySede = new Map<string, any>(rowsForSelected.map(r => [String(r.sede), r]))
  // Solo mostrar sedes que tienen datos reales en la fecha seleccionada
  const sedeKeysWithData = Array.from(bySede.keys()) as CuadreSedeSlug[]
  const sedeKeys = sedeKeysWithData.length > 0 ? sedeKeysWithData : (allSedeKeys.length > 0 ? [allSedeKeys[0]] : allSedeKeys)
  const defaultRow = (sede: CuadreSedeSlug) => ({
    id: `${selectedDate || 'sin-fecha'}-${sede}`,
    sede, fecha: selectedDate || '-',
    montos: { efectivoSistema: 0, efectivoReal: 0, debitoSistema: 0, debitoReal: 0, transferencias: 0 },
    calculos: { gastosTotales: 0, totalNeto: 0, totalBruto: 0, diferenciaTotal: 0, diferenciaEfectivo: 0, diferenciaDebito: 0 },
    _pending: true,
  })
  const hasAdvancedSedeFilter = multiSedeFilter.length > 0
  const sedePool = hasAdvancedSedeFilter ? (multiSedeFilter as CuadreSedeSlug[]) : (selectedSede ? [selectedSede as CuadreSedeSlug] : sedeKeys)
  const displayRows = sedePool.map((s) => {
    const existing = bySede.get(s)
    return existing ? { ...existing, _pending: false } : defaultRow(s)
  })
  const sortedRowsForWeb = [...displayRows].sort((a, b) => calcBruto(b) - calcBruto(a))

  const groupTotals = useMemo<Record<GroupKey, GroupTotals>>(() => {
    const totals = {} as Record<GroupKey, GroupTotals>
    ;(Object.entries(GROUPS) as [GroupKey, (typeof GROUPS)[GroupKey]][]).forEach(([key, meta]) => {
      const rows = displayRows.filter((r) => meta.sedes.includes(r.sede as any))
      totals[key] = rows.reduce((acc, row) => {
        const bruto = calcBruto(row)
        const gastosTotales = Number(row?.calculos?.gastosTotales) || sumGastos(row)
        const gastosMercaderia = sumarGastosMercaderia(row?.gastos) || Number(row?.calculos?.gastosMercaderia) || 0
        const gastos = Math.max(0, gastosTotales - gastosMercaderia)
        const neto = bruto - obtenerGastosQueAfectanGanancia(row)
        return { bruto: acc.bruto + bruto, gastos: acc.gastos + gastos, neto: acc.neto + neto, debitoSistema: acc.debitoSistema + (Number(row?.montos?.debitoSistema) || 0), debitoReal: acc.debitoReal + (Number(row?.montos?.debitoReal) || 0), transferencias: acc.transferencias + (Number(row?.montos?.transferencias) || 0) }
      }, { ...EMPTY_GROUP_TOTALS })
    })
    return totals
  }, [displayRows])

  // Totales globales
  const totalsDetailed = displayRows.reduce((acc, r) => {
    acc.montos.efectivoSistema += Number(r?.montos?.efectivoSistema) || 0
    acc.montos.efectivoReal += Number(r?.montos?.efectivoReal) || 0
    acc.montos.debitoSistema += Number(r?.montos?.debitoSistema) || 0
    acc.montos.debitoReal += Number(r?.montos?.debitoReal) || 0
    acc.montos.transferencias += Number(r?.montos?.transferencias) || 0
    acc.calculos.gastosTotales += Number(r?.calculos?.gastosTotales) || sumGastos(r)
    acc.calculos.totalBruto += Number(r?.calculos?.totalBruto) || 0
    acc.calculos.totalNeto += Number(r?.calculos?.totalNeto) || 0
    acc.calculos.diferenciaTotal += Number(r?.calculos?.diferenciaTotal) || 0
    acc.calculos.diferenciaEfectivo += Number(r?.calculos?.diferenciaEfectivo) || 0
    acc.calculos.diferenciaDebito += Number(r?.calculos?.diferenciaDebito) || 0
    return acc
  }, {
    montos: { efectivoSistema: 0, efectivoReal: 0, debitoSistema: 0, debitoReal: 0, transferencias: 0 },
    calculos: { gastosTotales: 0, totalNeto: 0, totalBruto: 0, diferenciaTotal: 0, diferenciaEfectivo: 0, diferenciaDebito: 0 },
  })

  const ventasBrutas = displayRows.reduce((s, r) => s + (Number(r?.analisisProductosRetailbase?.ventasBrutas) || calcBruto(r)), 0)
  const gastosTotales = totalsDetailed.calculos.gastosTotales
  const pagoMercaderiaTotal = displayRows.reduce((sum, row) => sum + (
    sumarGastosMercaderia(row?.gastos) || Number(row?.calculos?.gastosMercaderia) || 0
  ), 0)
  const gastosOperacionalesTotal = Math.max(0, gastosTotales - pagoMercaderiaTotal)
  const gastosQueAfectanGananciaTotales = displayRows.reduce((sum, row) => sum + obtenerGastosQueAfectanGanancia(row), 0)
  const costosProductosDisponibles = displayRows.every(r => r?._pending || r?.costosProductosDisponibles !== false)
  const costosProductosTotales = costosProductosDisponibles
    ? displayRows.reduce((sum, r) => sum + (Number(r?.analisisProductosRetailbase?.costoProductos) || calcCostosProductos(r)), 0)
    : null
  const resultadosGanancia = displayRows.map(getGananciaConciliada)
  const gananciaConciliada = resultadosGanancia.length > 0 && resultadosGanancia.every(resultado => resultado !== null)
  const gananciaDiaTotales = gananciaConciliada
    ? resultadosGanancia.reduce((sum, resultado) => sum + (resultado?.ganancia || 0), 0)
    : null
  const gananciaFinalTotales = gananciaDiaTotales === null ? null : gananciaDiaTotales - gastosQueAfectanGananciaTotales
  const anuladasDevolucionesTotales = displayRows.reduce((sum, r) => {
    const at = (Array.isArray(r?.anuladas) ? r.anuladas : []).reduce((s: number, a: any) => s + (Number(a?.monto) || 0), 0)
    const dt = (Array.isArray(r?.devoluciones) ? r.devoluciones : []).reduce((s: number, d: any) => s + (Number(d?.monto) || 0), 0)
    return sum + at + dt
  }, 0)
  const totalVentasSistema = (Number(totalsDetailed.montos.efectivoSistema) || 0) + (Number(totalsDetailed.montos.debitoSistema) || 0) + (Number(totalsDetailed.montos.transferencias) || 0)
  const efectivoTeorico = totalsDetailed.montos.efectivoSistema
  const efectivoReal = totalsDetailed.montos.efectivoReal
  const debitoTeorico = totalsDetailed.montos.debitoSistema
  const debitoReal = totalsDetailed.montos.debitoReal
  const transferenciasTotales = totalsDetailed.montos.transferencias
  const diferenciaCajaTotal = displayRows.reduce((sum, row) => sum + calcDifEfectivo(row), 0)
  const diferenciaEfectivoTotal = diferenciaCajaTotal

  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 pt-3 pb-4 sm:pt-4 sm:pb-5 shadow-sm">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-400 rounded-full mb-3" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/erp-dashboard')}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              title="Volver al Dashboard ERP"
            >
              <LayoutDashboard size={18} />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">Cuadres ERP</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {selectedDate || 'Todas las fechas'}{hasAdvancedSedeFilter ? ` · ${multiSedeFilter.length} sede${multiSedeFilter.length === 1 ? '' : 's'}` : selectedSede ? ` · ${formatSedeLabel(selectedSede)}` : ' · Todas las sedes'}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/cuadres/nuevo')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition"
          >
            <Plus size={15} />
            <span>Nuevo Cuadre</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 sm:py-6">
        {/* Filtros */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1.5">Mes</span>
            <select className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-white text-slate-800 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={selectedMonth} onChange={(e) => { const v = e.target.value; setSelectedMonth(v); const dates = monthDates[v] || []; if (dates[0]) setSelectedDate(dates[0]) }}>
              <option value="">Todos los meses</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1.5">Dia</span>
            <select className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-white text-slate-800 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
              <option value="">Todos los dias</option>
              {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1.5">Sede</span>
            <select className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-white text-slate-800 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={selectedSede} onChange={(e) => { clearMultiSedeFilter(); setSelectedSede(e.target.value as any) }} disabled={hasAdvancedSedeFilter}>
              <option value="">Todas las sedes</option>
              {sedeKeys.map((s) => <option key={String(s)} value={String(s)}>{formatSedeLabel(s)}</option>)}
            </select>
            {hasAdvancedSedeFilter && <p className="text-[11px] text-emerald-600 font-medium mt-1">Filtro avanzado activo</p>}
          </label>
        </div>

        {hasAdvancedSedeFilter && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {multiSedeFilter.map((slug) => <span key={slug} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-2.5 py-1 bg-emerald-50 text-emerald-700 font-medium">{formatSedeLabel(slug)}</span>)}
            <button type="button" onClick={() => { clearMultiSedeFilter(); setSelectedSede('') }} className="text-[11px] font-semibold text-emerald-600 hover:underline ml-1">Limpiar</button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-emerald-600" />
            <span className="ml-3 text-slate-500 font-medium">Cargando cuadres...</span>
          </div>
        )}
        {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">{error}</div>}

        {!loading && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="col-span-2 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/80 to-cyan-50/60 border border-emerald-200/50 p-5 shadow-lg relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-3xl bg-emerald-200/50" />
                  <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full blur-3xl bg-teal-200/40" />
                  <div className="absolute top-3 right-16 w-2 h-2 rounded-full bg-emerald-300/60 animate-pulse" />
                  <div className="absolute top-8 right-8 w-1.5 h-1.5 rounded-full bg-teal-400/50 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  <div className="absolute bottom-4 right-24 w-2.5 h-2.5 rounded-full bg-emerald-200/70 animate-pulse" style={{ animationDelay: '0.7s' }} />
                </div>
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-xs font-extrabold tracking-widest uppercase text-emerald-700">Venta Bruta Total</p>
                    <p className="text-3xl sm:text-4xl font-black mt-1 text-emerald-900">{money(ventasBrutas)}</p>
                    <p className="text-[11px] mt-1.5 text-emerald-600 font-semibold">Efectivo + Debito + Transferencias</p>
                  </div>
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-100/80 to-teal-100/80 flex items-center justify-center border border-emerald-200/40 shadow-inner">
                    <TrendingUp size={28} className="text-emerald-600" />
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50/80 to-fuchsia-50/40 border border-rose-200/50 p-3.5 sm:p-4 shadow-md relative overflow-hidden">
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl bg-rose-200/40" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 border border-rose-200/40 shadow-inner"><HandCoins size={15} className="text-rose-600" /></div>
                  <span className="text-[10px] font-extrabold tracking-widest uppercase text-rose-700">Gastos operacionales</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-rose-800">{money(gastosOperacionalesTotal)}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 via-green-50/80 to-teal-50/40 border border-emerald-200/60 p-3.5 sm:p-4 shadow-md relative overflow-hidden">
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl bg-emerald-200/40" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-xl bg-cyan-100 border border-cyan-200/50 shadow-inner"><Package size={15} className="text-cyan-700" /></div>
                    <span className="text-[10px] font-extrabold tracking-widest uppercase text-cyan-800">Mercadería anotada aparte</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-cyan-800">{money(pagoMercaderiaTotal)}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50/80 to-yellow-50/40 border border-amber-200/50 p-3.5 sm:p-4 shadow-md relative overflow-hidden">
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl bg-amber-200/40" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-200/40 shadow-inner"><RotateCcw size={15} className="text-amber-700" /></div>
                    <span className="text-[10px] font-extrabold tracking-widest uppercase text-amber-800">Devol / Anuladas</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-amber-900">{money(anuladasDevolucionesTotales)}</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {displayRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs hover:bg-emerald-700 shadow-sm transition-colors">
                  <Download className="h-3.5 w-3.5" /> Exportar
                </button>
                <button type="button" onClick={handleGenerateImage} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-3 py-2 text-xs hover:bg-blue-700 shadow-sm transition-colors">
                  <Image className="h-3.5 w-3.5" /> Imagen
                </button>
                <button type="button" onClick={handleShareExcel} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 text-white px-3 py-2 text-xs hover:bg-sky-700 shadow-sm transition-colors">
                  <Share2 className="h-3.5 w-3.5" /> Compartir
                </button>
                <button type="button" onClick={() => router.push('/admin')} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 text-slate-700 px-3 py-2 text-xs bg-white hover:bg-slate-50 shadow-sm transition-colors">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Informes
                </button>
                <button type="button" onClick={openGlobalGastosSheet} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 text-rose-700 px-3 py-2 text-xs bg-rose-50 hover:bg-rose-100 shadow-sm transition-colors">
                  <HandCoins className="h-3.5 w-3.5" /> Gastos
                </button>
              </div>
            )}

            {/* Desglose financiero */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="font-semibold text-slate-800 text-sm">Desglose del Dia</div>
                <p className="text-[10px] text-slate-500 mt-0.5">{selectedDate || 'Todas las fechas'}</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                <div className="p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Ventas y Gastos</div>
                  <div className="space-y-1.5 text-sm">
                    {[
                      { label: 'Venta Bruta', value: ventasBrutas, accent: 'text-emerald-700 font-semibold' },
                      { label: costosProductosDisponibles ? 'Costos Productos' : 'Costos Productos (sin desglose)', value: costosProductosTotales, accent: 'text-slate-800 font-semibold' },
                      { label: 'Ganancia de productos conciliada', value: gananciaDiaTotales, accent: gananciaDiaTotales === null ? 'text-slate-400 font-semibold' : gananciaDiaTotales >= 0 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold' },
                      { label: 'Gastos operacionales', value: gastosOperacionalesTotal, accent: 'text-rose-700 font-semibold' },
                      { label: 'Mercadería anotada aparte', value: pagoMercaderiaTotal, accent: 'text-cyan-700 font-semibold' },
                      { label: 'Gastos que afectan ganancia', value: gastosQueAfectanGananciaTotales, accent: 'text-rose-700 font-semibold' },
                      { label: 'Ganancia Final', value: gananciaFinalTotales, accent: gananciaFinalTotales === null ? 'text-slate-400 font-semibold' : gananciaFinalTotales >= 0 ? 'text-emerald-800 font-bold' : 'text-red-800 font-bold', highlight: true },
                      { label: 'Dif. Caja Total', value: diferenciaCajaTotal, accent: diferenciaCajaTotal === 0 ? 'text-gray-700' : diferenciaCajaTotal > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold' },
                    ].map((row: any) => (
                      <div key={row.label} className={`flex items-center justify-between rounded-xl px-3 py-2 ${row.highlight ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-50'}`}>
                        <span className="text-xs text-slate-600">{row.label}</span>
                        <span className={`text-right ${row.accent}`}>{money(row.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Medios de Pago</div>
                  <div className="space-y-1.5 text-sm">
                    {[
                      { label: 'Efectivo Teorico', value: efectivoTeorico },
                      { label: 'Efectivo Real', value: efectivoReal },
                      { label: 'Dif. Efectivo', value: diferenciaEfectivoTotal, accent: diferenciaEfectivoTotal === 0 ? '' : diferenciaEfectivoTotal > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold' },
                      { label: 'Debito Sistema', value: debitoTeorico },
                      { label: 'Debito Real', value: debitoReal },
                      { label: 'Transferencias', value: transferenciasTotales },
                      { label: 'Total Sistema', value: totalVentasSistema, highlight: true },
                    ].map((row: any) => (
                      <div key={row.label} className={`flex items-center justify-between rounded-xl px-3 py-2 ${row.highlight ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}`}>
                        <span className="text-xs text-slate-600">{row.label}</span>
                        <span className={`text-right font-semibold text-slate-800 ${row.accent || ''}`}>{money(row.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sede cards */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Building2 size={16} className="text-slate-400" /> Sucursales</h2>
              <span className="text-xs text-slate-500">{sortedRowsForWeb.length} cuadre{sortedRowsForWeb.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {sortedRowsForWeb.length === 0 && (
                <div className="col-span-full rounded-2xl bg-white border border-slate-200 p-8 text-center">
                  <p className="text-sm text-slate-500">No hay datos para los filtros seleccionados.</p>
                </div>
              )}
              {sortedRowsForWeb.map((r) => {
                const sedeKey = String(r?.sede || '') as SedeSlug
                const fechaKey = String(r?.fecha || '').slice(0, 10)
                const cardKey = `${sedeKey}|${fechaKey}`
                const sedeStyle = (SEDE_STYLES as any)[sedeKey] || { bg: 'bg-slate-100', text: 'text-slate-800', Icon: Building2 }
                const sedeUI = (SEDE_UI as any)[r.sede] || { icon: '🏬', bg: 'bg-white', border: 'border-slate-200', bar: '' }
                return (
                  <div
                    key={`${r.sede || 'sede'}-${r.fecha || 'fecha'}`}
                    ref={(el) => { cuadreCardRefs.current[cardKey] = el }}
                    className={`group relative overflow-hidden rounded-2xl border p-3.5 shadow-sm hover:shadow-lg transition-all duration-200 ${sedeUI.bg || 'bg-white'} ${r?._pending ? 'border-yellow-300 border-dashed ring-2 ring-yellow-200' : (sedeUI.border || 'border-slate-200')}`}
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 ${sedeUI.bar || 'bg-slate-200'}`} />
                    <div className={`absolute -top-6 -right-6 w-28 h-28 ${sedeStyle.bg} opacity-30 rounded-full blur-2xl group-hover:opacity-50 transition-opacity pointer-events-none`} />
                    {r?._pending && (
                      <div className="pointer-events-none select-none absolute -right-10 top-3 rotate-45 bg-yellow-400 text-yellow-900 text-[10px] font-bold tracking-wide px-10 py-1 shadow z-20">EN ESPERA</div>
                    )}
                    {r?._pending && (
                      <div className="absolute inset-x-0 bottom-0 top-12 z-10 flex items-center justify-center backdrop-blur-sm bg-yellow-50/40 cursor-not-allowed rounded-b-2xl">
                        <Lock className="h-10 w-10 text-yellow-900 opacity-80" />
                      </div>
                    )}
                    <div className="relative mb-3">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{sedeUI.icon || '🏬'}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold text-slate-800 ${r?._pending ? 'text-yellow-900' : ''}`}>{formatSedeLabel(sedeKey)}</h3>
                          <span className="text-xs text-slate-500">{r.fecha}</span>
                        </div>
                      </div>
                      {!r?._pending && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={() => handleDownloadSedeCardOnlyImage(r)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors" title="Imagen del cuadre">
                            <Image className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDownloadSedeCardReportImage(r)} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors" title="Rendimiento de cajeras y gastos">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDownloadSedeProductsReportImage(r)} className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors" title="Productos por ganancia">
                            <Package className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleOpenEstrategia(r)} className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors" title="Estrategia de margen & subida de precios">
                            <TrendingUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleAnalizarConIA(r)} className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors" title="Analizar con IA" disabled={iaLoading}>
                            {iaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          </button>
                          <button type="button" onClick={() => handleDeleteCuadreOfDay(r)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors ml-auto" title="Eliminar cuadre">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 text-sm relative">
                      <div className="flex justify-between items-center px-1 py-0.5">
                        <span className="text-xs text-slate-500 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-emerald-500" /> Efec. Sistema</span>
                        <span className="font-medium text-slate-700">{money(r?.montos?.efectivoSistema)}</span>
                      </div>
                      <div className="flex justify-between items-center px-1 py-0.5">
                        <span className="text-xs text-slate-500 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-emerald-500" /> Efec. Real</span>
                        <span className="font-medium text-slate-700">{money(r?.montos?.efectivoReal)}</span>
                      </div>
                      {(() => {
                        const totalAnuladasDevol = sumAnuladas(r) + sumDevoluciones(r)
                        if (totalAnuladasDevol <= 0) return null
                        return (
                          <div className="flex justify-between items-center px-1 py-0.5">
                            <span className="text-xs text-slate-500 flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5 text-amber-500" /> Anuladas / Devol.</span>
                            <span className="font-bold text-amber-700 flex items-center gap-1.5">
                              -{money(totalAnuladasDevol)}
                              <button type="button" onClick={() => openCortesSheet(r)} className="p-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors" title="Ver detalle de anuladas / devoluciones"><RotateCcw className="h-3 w-3" /></button>
                            </span>
                          </div>
                        )
                      })()}
                      {(() => { const d = calcDifEfectivo(r); return d !== 0 ? (
                        <div className={`flex justify-between items-center rounded-lg px-2 py-1 ${d > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                          <span className="text-xs text-slate-600 flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-amber-500" /> Dif. Efectivo</span>
                          <span className={`font-bold text-xs ${d > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{d > 0 ? 'Faltante ' : 'Sobrante '}{money(Math.abs(d))}</span>
                        </div>
                      ) : null })()}
                      {(() => {
                        const otrosGastosTotal = Array.isArray(r?.gastos) && r.gastos.length > 0
                          ? sumGastos(r, false)
                          : Math.max(0, (Number(r?.calculos?.gastosTotales) || 0) - (Number(r?.calculos?.gastosMercaderia) || 0))
                        const pagoMercaderia = sumarGastosMercaderia(r?.gastos) || Number(r?.calculos?.gastosMercaderia) || 0
                        return (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center px-1 py-0.5">
                              <span className="text-xs text-slate-500 flex items-center gap-1.5"><HandCoins className="h-3.5 w-3.5 text-rose-500" /> Gastos operacionales</span>
                              <span className="font-bold text-rose-700 flex items-center gap-1.5">{money(otrosGastosTotal)}
                              {Number(r?.calculos?.gastosTotales) > 0 && (
                                <button type="button" onClick={() => openGastosSheet(r)} className="p-1 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-700 transition-colors"><Image className="h-3 w-3" /></button>
                              )}
                              </span>
                            </div>
                            {pagoMercaderia > 0 && <div className="flex justify-between items-center rounded-lg bg-emerald-50 px-2 py-1">
                              <span className="text-xs text-cyan-700 flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-cyan-600" /> Mercadería anotada aparte</span>
                              <span className="font-bold text-cyan-700">{money(pagoMercaderia)}</span>
                            </div>}
                          </div>
                        )
                      })()}
                      <div className="flex justify-between items-center px-1 py-0.5">
                        <span className="text-xs text-slate-500 flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5 text-violet-500" /> Transf. Sist.</span>
                        <span className="font-medium text-slate-700">{money(r?.montos?.transferenciaSistema ?? r?.montos?.transferencias)}</span>
                      </div>
                      <div className="h-px bg-slate-100 my-1" />
                      <div className="flex justify-between items-center rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-slate-600" /> Bruto de caja</span>
                        <span className="font-bold text-slate-800">{money(calcBruto(r))}</span>
                      </div>
                      {r?.analisisProductosRetailbase && <>
                        <div className="flex justify-between items-center rounded-lg bg-sky-50 px-3 py-1.5">
                          <span className="text-xs font-semibold text-sky-700">Venta bruta de productos</span>
                          <span className="font-bold text-sky-800">{money(Number(r.analisisProductosRetailbase.ventasBrutas) || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center px-3 py-1.5">
                          <span className="text-xs text-slate-500">Costo de productos</span>
                          <span className="font-semibold text-slate-700">{money(Number(r.analisisProductosRetailbase.costoProductos) || 0)}</span>
                        </div>
                      </>}
                      <div className="flex justify-between items-center rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5 text-slate-600" /> Neto de caja</span>
                        <span className="font-bold text-slate-800">{money(calcNeto(r))}</span>
                      </div>
                      {(() => {
                        const resultado = getGananciaConciliada(r)
                        if (!resultado) return (
                          <div className="flex justify-between items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Ganancia</span>
                            <span className="text-right text-[10px] font-semibold text-amber-700">Pendiente: ventas y costos no conciliados</span>
                          </div>
                        )
                        const gan = resultado.ganancia
                        return (
                          <div className={`flex justify-between items-center rounded-lg px-3 py-2 ${gan >= 0 ? 'bg-emerald-100 border border-emerald-300' : 'bg-red-50 border border-red-200'}`}>
                            <span className={`text-xs font-semibold flex items-center gap-1.5 ${gan >= 0 ? 'text-emerald-800' : 'text-red-700'}`}><TrendingUp className="h-3.5 w-3.5" /> Ganancia</span>
                            <div className="flex flex-col items-end">
                              <span className={`font-bold text-sm ${gan >= 0 ? 'text-emerald-900' : 'text-red-800'}`}>{money(gan)}</span>
                              <span className={`text-[10px] font-semibold ${gan >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {resultado.margen.toFixed(2)}% sobre {resultado.fuente ? 'venta bruta de productos' : 'venta conciliada'}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Dif. Caja */}
                    {(() => {
                      const info = getCajaDiffInfo(r)
                      return (
                        <div className={`mt-3 rounded-xl px-3 py-2 ${info.className.includes('red') ? 'bg-red-50 border border-red-200' : info.className.includes('amber') ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-600 flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-amber-500" /> Dif. Caja</span>
                            <span className={`text-xs font-bold ${info.className}`}>{info.label}</span>
                          </div>
                          {info.detail && <div className="text-[10px] text-slate-500 mt-0.5 text-right">{info.detail}</div>}
                        </div>
                      )
                    })()}

                    {!r?._pending && (
                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEstrategia(r)}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 text-white px-3 py-2 text-xs font-bold hover:opacity-95 shadow-sm transition-all"
                        >
                          <TrendingUp className="h-3.5 w-3.5" /> Estrategia de Margen & Precios
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => openCortesSheet(r)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                            <RotateCcw className="h-3.5 w-3.5" /> Anuladas / Devol.
                          </button>
                          <button type="button" onClick={() => openTopsSheet(r)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                            <TrendingUp className="h-3.5 w-3.5" /> Top 10
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Bottom Sheet: Gastos */}
        {gastosSheet.open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={closeGastosSheet} />
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] w-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm text-gray-700">Gastos — <b>{formatSedeLabel(gastosSheet.sede)}</b> {gastosSheet.fecha ? `— ${gastosSheet.fecha}` : ''}</div>
                <button onClick={closeGastosSheet} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Cerrar</button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {Array.isArray(gastosSheet.gastos) && gastosSheet.gastos.length ? (
                  <div className="space-y-3">
                    {gastosSheet.gastos.map((g, idx) => {
                      const fotosDeGasto = (Array.isArray(gastosSheet.fotos) ? gastosSheet.fotos : []).filter((f: any) => f?.tipo === 'gasto' && f?.gastoIndex === idx)
                      return (
                        <div key={idx} className={`border rounded-lg p-3 ${esPagoMercaderia(g) ? 'border-cyan-200 bg-cyan-50/60' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <div className="font-semibold">{g?.observacion || `Gasto #${idx + 1}`}</div>
                              {esPagoMercaderia(g) && <span className="inline-flex mt-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">Mercadería anotada aparte · no es gasto</span>}
                              {g?.detalle ? <div className="text-gray-600">{g.detalle}</div> : null}
                            </div>
                            <div className="text-sm font-semibold">{money(Number(g?.monto) || 0)}</div>
                          </div>
                          {fotosDeGasto.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto py-1 mt-2">
                              {fotosDeGasto.map((f: any, i: number) => (
                                <button key={i} className="shrink-0" onClick={() => { const urls = fotosDeGasto.map((x: any) => x.url).filter((u: string) => typeof u === 'string' && u); openViewer(urls, i) }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={f.url} alt={f?.name || `foto-${i + 1}`} className="h-28 w-28 object-contain rounded border bg-gray-50" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : <div className="text-sm text-gray-600">No hay gastos registrados.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sheet: Gastos Globales */}
        {globalGastosSheet.open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={closeGlobalGastosSheet} />
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] w-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div className="text-sm text-gray-700">Gastos — Todas las sucursales {globalGastosSheet.fecha ? `— ${globalGastosSheet.fecha}` : ''}</div>
                <button onClick={closeGlobalGastosSheet} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Cerrar</button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 overscroll-contain">
                {Array.isArray(globalGastosSheet.items) && globalGastosSheet.items.length ? (
                  <div className="space-y-3">
                    {globalGastosSheet.items.map((g, idx) => (
                      <div key={idx} className={`border rounded-lg p-3 ${esPagoMercaderia(g) ? 'border-cyan-200 bg-cyan-50/60' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">{formatSedeLabel(g.sede)}</div>
                          <div className={`text-sm font-bold ${esPagoMercaderia(g) ? 'text-cyan-700' : ''}`}>${Number(g.monto).toLocaleString('es-CL')}</div>
                        </div>
                        {esPagoMercaderia(g) && <span className="inline-flex mt-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">Mercadería anotada aparte · no es gasto</span>}
                        {g.observacion && <div className="text-sm text-gray-600 mt-1">{g.observacion}</div>}
                      </div>
                    ))}
                  </div>
                ) : <div className="text-sm text-gray-600">No hay gastos registrados.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sheet: Anuladas */}
        {cortesSheet.open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={closeCortesSheet} />
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] w-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div className="text-sm text-gray-700">Anuladas / Devoluciones — <b>{formatSedeLabel(cortesSheet.sede)}</b> {cortesSheet.fecha ? `— ${cortesSheet.fecha}` : ''}</div>
                <button onClick={closeCortesSheet} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Cerrar</button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {Array.isArray(cortesSheet.items) && cortesSheet.items.length ? (
                  <div className="space-y-3">
                    {cortesSheet.items.map((g: any, idx: number) => {
                      const tipo = g?.esAnulada ? 'Anulada' : g?.esDevolucion ? 'Devolucion' : 'Otro'
                      const tipoBg = g?.esAnulada ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      return (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <div className="font-semibold flex items-center gap-1.5">
                                <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
                                {g?.folio ? `Folio #${g.folio}` : `#${idx + 1}`}
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tipoBg}`}>{tipo}</span>
                              </div>
                              {g?.observacion && <div className="text-gray-600 mt-0.5">{g.observacion}</div>}
                            </div>
                            <div className="text-sm font-bold text-orange-700">{money(Number(g?.monto) || 0)}</div>
                          </div>
                        </div>
                      )
                    })}
                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Total Anuladas/Devol.</span>
                      <span className="text-sm font-bold text-orange-700">{money(cortesSheet.items.reduce((s: number, g: GastoItem) => s + (Number(g?.monto) || 0), 0))}</span>
                    </div>
                  </div>
                ) : <div className="text-sm text-gray-600">No hay devoluciones ni boletas anuladas.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sheet: Top 10 */}
        {topsSheet.open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={closeTopsSheet} />
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm text-gray-700">Top 10 — <b>{formatSedeLabel(topsSheet.sede)}</b> {topsSheet.fecha ? `— ${topsSheet.fecha}` : ''}</div>
                <button onClick={closeTopsSheet} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Cerrar</button>
              </div>
              <div className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                {Array.isArray(topsSheet.items) && topsSheet.items.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-2 py-2 border text-left">#</th>
                          <th className="px-2 py-2 border text-left">SKU</th>
                          <th className="px-2 py-2 border text-left">Nombre</th>
                          <th className="px-2 py-2 border text-right">Cantidad</th>
                          <th className="px-2 py-2 border text-right">Costo Neto</th>
                          <th className="px-2 py-2 border text-right">Ventas Brutas</th>
                          <th className="px-2 py-2 border text-right">Ventas Netas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topsSheet.items.map((p, idx) => (
                          <tr key={`${p.sku}-${idx}`} className="odd:bg-white even:bg-gray-50">
                            <td className="px-2 py-2 border text-left w-10">{idx + 1}</td>
                            <td className="px-2 py-2 border text-left whitespace-nowrap">{p.sku}</td>
                            <td className="px-2 py-2 border text-left">{p.nombre}</td>
                            <td className="px-2 py-2 border text-right">{Number(p.cantidadVendida).toLocaleString('es-CL')}</td>
                            <td className="px-2 py-2 border text-right text-gray-800">{money(Number(p.costoNeto) || 0)}</td>
                            <td className="px-2 py-2 border text-right text-gray-800">{money(Number(p.ventasBrutas) || 0)}</td>
                            <td className="px-2 py-2 border text-right text-gray-800">{money(Number(p.ventasNetas) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="text-sm text-gray-600">No hay datos de Top 10 para esta sede.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Image Viewer */}
        {viewer.open && <ImageViewer viewer={viewer} onClose={closeViewer} onNavigate={(idx: number) => setViewer(v => ({ ...v, index: idx }))} />}

        {/* Modal de Estrategia de Margen & Precios */}
        <EstrategiaMargenModal
          open={estrategiaModal.open}
          onClose={handleCloseEstrategia}
          sede={estrategiaModal.sede || 'donbalato-central'}
          fecha={estrategiaModal.fecha || selectedDate || ''}
          rows={rows}
          productImages={productImages}
          costsBD={costsBD}
        />

        {/* Modal del Contador IA — página completa */}
        {(iaLoading || iaAnalisis || iaError) && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-y-auto" onClick={() => { if (!iaLoading) { setIaAnalisis(null); setIaError(null); setIaRow(null) } }}>
            <div className="max-w-4xl mx-auto min-h-screen flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">🧮 Contador IA</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {iaRow ? `${formatSedeLabel(iaRow?.sede)} — ${iaRow?.fecha}` : 'Analizando...'}
                    </p>
                  </div>
                </div>
                {!iaLoading && (
                  <button
                    onClick={() => { setIaAnalisis(null); setIaError(null); setIaRow(null) }}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 px-6 py-6">
                {iaLoading && (
                  <div className="flex flex-col items-center justify-center py-24">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-500 mb-4" />
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">🧮 El Contador IA está analizando...</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Leyendo ventas, costos, márgenes, cajeras y tendencias</p>
                  </div>
                )}
                {iaError && (
                  <div className="p-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-base font-bold text-red-700 dark:text-red-300 mb-1">⚠️ Error</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{iaError}</p>
                  </div>
                )}
                {iaAnalisis && (() => {
                  // Construir mapa de productos para lookup por SKU
                  const productLookup = new Map<string, { nombre: string; img?: string; ganancia: number; cantidad: number }>()
                  if (Array.isArray(iaRow?.topProducts)) {
                    for (const p of iaRow.topProducts) {
                      const sku = String(p?.sku || '').toUpperCase()
                      if (!sku) continue
                      productLookup.set(sku, {
                        nombre: String(p?.nombre || sku),
                        img: productImages.get(sku),
                        ganancia: Number(p?.ventasNetas) || 0,
                        cantidad: Number(p?.cantidadVendida) || 0,
                      })
                    }
                  }

                  // Renderizar texto: cuando encuentra [SKU], pone la imagen grande debajo
                  const renderTextWithProducts = (text: string) => {
                    const lines = text.split('\n')
                    const parts: React.ReactNode[] = []
                    let keyIdx = 0
                    const shownSkus = new Set<string>()

                    for (const line of lines) {
                      const regex = /\[([A-Z]{2,5}\d{2,6})\]/g
                      const matches = [...line.matchAll(regex)]
                      const html = line
                        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900 dark:text-white font-semibold">$1</strong>')
                        .replace(/\*(.+?)\*/g, '<em>$1</em>')
                        .replace(/`(.+?)`/g, '<code class="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded text-xs font-mono text-pink-600">$1</code>')

                      parts.push(
                        <div key={`l-${keyIdx++}`} className="text-sm leading-relaxed text-slate-700 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: html }} />
                      )

                      // Imágenes de los productos mencionados en esta línea
                      for (const m of matches) {
                        const sku = m[1].toUpperCase()
                        if (shownSkus.has(sku)) continue
                        shownSkus.add(sku)
                        const product = productLookup.get(sku)
                        if (product) {
                          parts.push(
                            <div key={`img-${keyIdx++}`} className="my-3 flex justify-center">
                              <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={product.img}
                                  alt={product.nombre}
                                  className="w-48 h-48 object-cover rounded-2xl shadow-md border border-slate-200 dark:border-slate-700"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl px-3 py-2">
                                  <p className="text-xs font-semibold text-white truncate">{product.nombre}</p>
                                  <p className="text-[10px] text-white/80">{sku}</p>
                                </div>
                              </div>
                            </div>
                          )
                        }
                      }
                    }
                    return parts
                  }

                  return (
                    <div className="space-y-1">
                      {renderTextWithProducts(iaAnalisis)}
                    </div>
                  )
                })()}
              </div>

              {/* Footer */}
              {iaAnalisis && (
                <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex justify-end gap-2 shadow-sm">
                  <button
                    onClick={() => { setIaAnalisis(null); setIaError(null); setIaRow(null) }}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => { if (iaRow) handleDownloadSedeProductsReportImage(iaRow) }}
                    className="px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Package className="h-3.5 w-3.5" />
                    Descargar imagen
                  </button>
                  <button
                    onClick={() => { if (iaRow) handleAnalizarConIA(iaRow) }}
                    disabled={iaLoading}
                    className="px-4 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {iaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Regenerar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

    {/* Panel 2: Rendimiento de cajeras + gastos (oculto, solo para captura) */}
    {reportRow && (
      <div style={{ position: 'fixed', top: -9999, left: -9999, zIndex: -1 }}>
        <div ref={reportPanelRef} style={{ width: 520, background: '#fff', padding: 24, borderRadius: 16, fontFamily: 'system-ui, sans-serif' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, borderBottom: '2px solid #f1f5f9', paddingBottom: 12 }}>
            <span style={{ fontSize: 28 }}>{(SEDE_UI as any)[reportRow?.sede]?.icon || '🏬'}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{formatSedeLabel(reportRow?.sede)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{reportRow?.fecha}</div>
            </div>
          </div>

          {/* Rendimiento de cajeras detallado */}
          {(() => {
            const cajeros = Array.isArray(reportRow?.cajerosListos) ? reportRow.cajerosListos : []
            const montos: any = reportRow?.montosPorCajera || {}
            if (cajeros.length === 0) return null
            const sorted = cajeros.map((c: string) => ({
              nombre: c,
              ventas: Number(montos[c]?.ventasCount) || 0,
              total: Number(montos[c]?.totalBruto) || 0,
              efectivo: Number(montos[c]?.efectivo) || 0,
              transferencia: Number(montos[c]?.transferencia) || 0,
              debito: Number(montos[c]?.debito) || 0,
              efectivoRecibido: Number(montos[c]?.efectivoRecibido) || 0,
              vueltos: Number(montos[c]?.vueltos) || 0,
              diferencia: Number(montos[c]?.diferencia) || 0,
            })).sort((a: any, b: any) => b.total - a.total)
            const maxTotal = sorted.length > 0 ? sorted[0].total : 1
            const totalVentas = sorted.reduce((s: number, c: any) => s + c.ventas, 0)
            const totalMonto = sorted.reduce((s: number, c: any) => s + c.total, 0)
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>👥</span> Rendimiento de Cajeras
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sorted.map((c: any, i: number) => {
                    const promedio = c.ventas > 0 ? Math.round(c.total / c.ventas) : 0
                    return (
                      <div key={i} style={{ background: i === 0 ? '#fef3c7' : '#f8fafc', borderRadius: 10, padding: 12, border: i === 0 ? '1px solid #fcd34d' : '1px solid #e2e8f0' }}>
                        {/* Fila 1: nombre + ranking */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {i === 0 && <span style={{ fontSize: 18 }}>🏆</span>}
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{c.nombre}</span>
                            {i === 0 && <span style={{ fontSize: 9, background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>TOP</span>}
                          </div>
                          <span style={{ fontSize: 11, color: '#64748b' }}>#{i + 1} de {sorted.length}</span>
                        </div>
                        {/* Fila 2: stats grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                          <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>Ventas</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{c.ventas}</div>
                          </div>
                          <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>Total</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{money(c.total)}</div>
                          </div>
                          <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>Promedio</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{money(promedio)}</div>
                          </div>
                        </div>
                        {/* Fila 3: métodos de pago */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <div style={{ flex: 1, background: '#ecfdf5', borderRadius: 6, padding: '5px 8px' }}>
                            <div style={{ fontSize: 9, color: '#059669' }}>Efectivo</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#064e3b' }}>{money(c.efectivo)}</div>
                          </div>
                          <div style={{ flex: 1, background: '#eff6ff', borderRadius: 6, padding: '5px 8px' }}>
                            <div style={{ fontSize: 9, color: '#3b82f6' }}>Transferencia</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a' }}>{money(c.transferencia)}</div>
                          </div>
                          {c.debito > 0 && (
                            <div style={{ flex: 1, background: '#fefce8', borderRadius: 6, padding: '5px 8px' }}>
                              <div style={{ fontSize: 9, color: '#ca8a04' }}>Débito</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#713f12' }}>{money(c.debito)}</div>
                            </div>
                          )}
                        </div>
                        {/* Fila 4: diferencia de caja */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                          <span>Vueltos: {money(c.vueltos)}</span>
                          <span>Dif. caja: <b style={{ color: c.diferencia > 0 ? '#059669' : c.diferencia < 0 ? '#e11d48' : '#64748b' }}>{c.diferencia > 0 ? 'Sobrante ' : c.diferencia < 0 ? 'Faltante ' : ''}{money(Math.abs(c.diferencia))}</b></span>
                        </div>
                        {/* Barra de progreso */}
                        <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
                          <div style={{ height: '100%', width: `${(c.total / maxTotal) * 100}%`, background: i === 0 ? '#f59e0b' : '#3b82f6', borderRadius: 3 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Resumen total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '10px 12px', background: '#f1f5f9', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Total: {totalVentas} ventas</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{money(totalMonto)}</span>
                </div>
              </div>
            )
          })()}

          {/* Gastos detallados */}
          {(() => {
            const gastos = Array.isArray(reportRow?.gastos) ? reportRow.gastos : []
            const gastosMercaderiaDetalle = gastos.filter((g: any) => esPagoMercaderia(g)).reduce((sum: number, g: any) => sum + (Number(g?.monto) || 0), 0)
            const mercaderiaAnotada = gastosMercaderiaDetalle || Number(reportRow?.calculos?.gastosMercaderia) || 0
            const gastosOperacionales = gastos.length > 0
              ? sumGastos(reportRow, false)
              : Math.max(0, (Number(reportRow?.calculos?.gastosTotales) || 0) - mercaderiaAnotada)
            if (gastos.length === 0 && mercaderiaAnotada === 0 && gastosOperacionales === 0) {
              return (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>💸</span> Gastos operacionales y mercadería anotada
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    Sin movimientos registrados
                  </div>
                </div>
              )
            }
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>💸</span> Gastos operacionales y mercadería anotada
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {gastos.map((g: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12, padding: '8px 12px', background: esPagoMercaderia(g) ? '#ecfeff' : '#fef2f2', borderRadius: 8, border: `1px solid ${esPagoMercaderia(g) ? '#a5f3fc' : '#fecaca'}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#64748b' }}>{g?.observacion || g?.detalle || `Gasto #${i + 1}`}</div>
                        {g?.folio && <div style={{ fontSize: 10, color: '#94a3b8' }}>Folio: {g.folio}</div>}
                        {esPagoMercaderia(g) && <div style={{ fontSize: 10, fontWeight: 700, color: '#0e7490', marginTop: 2 }}>Mercadería anotada aparte · no es gasto</div>}
                      </div>
                      <span style={{ fontWeight: 700, color: esPagoMercaderia(g) ? '#0e7490' : '#e11d48', marginLeft: 8, fontSize: 13 }}>{money(Number(g?.monto) || 0)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, padding: '8px 12px', background: '#fee2e2', borderRadius: 8, marginTop: 2 }}>
                    <span style={{ color: '#991b1b' }}>Gastos operacionales</span>
                    <span style={{ color: '#991b1b' }}>{money(gastosOperacionales)}</span>
                  </div>
                  {mercaderiaAnotada > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, padding: '8px 12px', background: '#cffafe', borderRadius: 8 }}>
                    <span style={{ color: '#155e75' }}>Mercadería anotada aparte · no es gasto</span>
                    <span style={{ color: '#155e75' }}>{money(mercaderiaAnotada)}</span>
                  </div>}
                </div>
              </div>
            )
          })()}

          {/* Anuladas / Devoluciones */}
          {(() => {
            const anuladas = Array.isArray(reportRow?.anuladas) ? reportRow.anuladas : []
            const devol = Array.isArray(reportRow?.devoluciones) ? reportRow.devoluciones : []
            if (anuladas.length === 0 && devol.length === 0) return null
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span> Anuladas / Devoluciones
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ background: '#fef2f2', borderRadius: 10, padding: 12, flex: 1, border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Anuladas ({anuladas.length})</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#e11d48' }}>{money(anuladas.reduce((s: number, a: any) => s + (Number(a?.monto) || 0), 0))}</div>
                  </div>
                  <div style={{ background: '#fef2f2', borderRadius: 10, padding: 12, flex: 1, border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Devoluciones ({devol.length})</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#e11d48' }}>{money(devol.reduce((s: number, d: any) => s + (Number(d?.monto) || 0), 0))}</div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Footer */}
          <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: 10, marginTop: 4, textAlign: 'center', fontSize: 9, color: '#94a3b8' }}>
            Rendimiento de Cajeras Importadora Carlitos ERP — {new Date().toLocaleString('es-CL')}
          </div>
        </div>
      </div>
    )}

    {/* Panel 3: Productos por ganancia (oculto, solo para captura) */}
    {productsRow && (
      <div style={{ position: 'fixed', top: -9999, left: -9999, zIndex: -1 }}>
        <div ref={productsPanelRef} style={{ width: 520, background: '#fff', padding: 24, borderRadius: 16, fontFamily: 'system-ui, sans-serif' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, borderBottom: '2px solid #f1f5f9', paddingBottom: 12 }}>
            <span style={{ fontSize: 28 }}>{(SEDE_UI as any)[productsRow?.sede]?.icon || '🏬'}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{formatSedeLabel(productsRow?.sede)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{productsRow?.fecha}</div>
            </div>
          </div>

          {/* Top productos por ganancia */}
          {(() => {
            const tops = Array.isArray(productsRow?.topProducts) ? productsRow.topProducts : []
            if (tops.length === 0) return null
            const withGan = tops.map((p: any) => ({
              ...p,
              ganancia: (Number(p?.ventasBrutas) || 0) - (Number(p?.costoNeto) || 0),
            })).sort((a: any, b: any) => b.ganancia - a.ganancia)
            const top10 = withGan.slice(0, 10)
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>💰</span> Top 10 Productos por Ganancia
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {top10.map((p: any, i: number) => {
                    const img = productImages.get(String(p?.sku || '').toUpperCase())
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: i % 2 === 0 ? '#f8fafc' : '#fff', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                        {/* Ranking */}
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? ['#f59e0b', '#94a3b8', '#b45309'][i] : '#e2e8f0', color: i < 3 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        {/* Imagen */}
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={p?.nombre || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 18 }}>📦</span>
                          )}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.nombre || ''}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{Number(p?.cantidadVendida) || 0} uds · {money(Number(p?.ventasBrutas) || 0)}</div>
                        </div>
                        {/* Ganancia */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: p.ganancia >= 0 ? '#059669' : '#e11d48' }}>{money(p.ganancia)}</div>
                          <div style={{ fontSize: 9, color: '#94a3b8' }}>ganancia</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Productos más vendidos */}
          {(() => {
            const tops = Array.isArray(productsRow?.topProducts) ? productsRow.topProducts : []
            if (tops.length === 0) return null
            const sorted = [...tops].sort((a: any, b: any) => (Number(b?.cantidadVendida) || 0) - (Number(a?.cantidadVendida) || 0))
            const maxCant = sorted.length > 0 ? Number(sorted[0].cantidadVendida) || 1 : 1
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>📊</span> Productos Más Vendidos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sorted.slice(0, 10).map((p: any, i: number) => (
                    <div key={i} style={{ padding: '6px 10px', background: i % 2 === 0 ? '#f8fafc' : '#fff', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', marginRight: 4 }}>{p?.sku || ''}</span>
                          <span style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>{p?.nombre || ''}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginLeft: 8 }}>{Number(p?.cantidadVendida) || 0} uds</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginRight: 8 }}>
                          <div style={{ height: '100%', width: `${((Number(p?.cantidadVendida) || 0) / maxCant) * 100}%`, background: '#3b82f6', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{money(Number(p?.ventasBrutas) || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Análisis del Contador IA */}
          {iaLoading && (
            <div style={{ marginBottom: 18, padding: 16, background: '#faf5ff', borderRadius: 10, border: '1px solid #e9d5ff', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', marginBottom: 6 }}>🧮 Contador IA analizando...</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Leyendo ventas, costos, márgenes y tendencias</div>
            </div>
          )}
          {iaError && (
            <div style={{ marginBottom: 18, padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e11d48', marginBottom: 4 }}>⚠️ Error del Contador IA</div>
              <div style={{ fontSize: 11, color: '#991b1b' }}>{iaError}</div>
            </div>
          )}
          {iaAnalisis && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>🧮</span> Análisis del Contador IA
              </div>
              <div style={{ padding: 14, background: '#faf5ff', borderRadius: 10, border: '1px solid #e9d5ff', fontSize: 11, color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {iaAnalisis}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: 10, marginTop: 4, textAlign: 'center', fontSize: 9, color: '#94a3b8' }}>
            Reporte de Productos Importadora Carlitos ERP — {new Date().toLocaleString('es-CL')}
          </div>
        </div>
      </div>
    )}
      </div>
    </div>
  )
}

// ── ImageViewer ────────────────────────────────────────────────────────────
function ImageViewer({ viewer, onClose, onNavigate }: { viewer: { open: boolean; urls: string[]; index: number; title?: string }; onClose: () => void; onNavigate: (idx: number) => void }) {
  const [zoom, setZoom] = useState(1)
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
  const zoomIn = () => setZoom(z => clamp(z + 0.25, 0.5, 5))
  const zoomOut = () => setZoom(z => clamp(z - 0.25, 0.5, 5))
  const reset = () => setZoom(1)
  const prev = () => onNavigate((viewer.index - 1 + viewer.urls.length) % viewer.urls.length)
  const next = () => onNavigate((viewer.index + 1) % viewer.urls.length)
  useEffect(() => { setZoom(1) }, [viewer.index])
  const url = viewer.urls[viewer.index]
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-black/60 text-white">
          <div className="text-sm truncate">{viewer.title || 'Visor de imagenes'}</div>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 text-sm rounded bg-white/10 hover:bg-white/20" onClick={zoomOut}>-</button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button className="px-2 py-1 text-sm rounded bg-white/10 hover:bg-white/20" onClick={zoomIn}>+</button>
            <button className="px-2 py-1 text-sm rounded bg-white/10 hover:bg-white/20" onClick={reset}>Reset</button>
            <button className="px-2 py-1 text-sm rounded bg-white/10 hover:bg-white/20" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div className="relative flex-1 overflow-auto touch-pan-y touch-pan-x">
          <div className="min-h-full min-w-full flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`img-${viewer.index + 1}`} className="max-w-[95vw] max-h-[85vh] rounded bg-white" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }} />
          </div>
          {viewer.urls.length > 1 && (
            <>
              <button className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-black/50 text-white hover:bg-black/60" onClick={prev}>prev</button>
              <button className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-black/50 text-white hover:bg-black/60" onClick={next}>next</button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/50 rounded px-2 py-1">{viewer.index + 1} / {viewer.urls.length}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
