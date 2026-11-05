'use client'

import React, { useState, useMemo, useRef } from 'react'
import {
  TrendingUp,
  X,
  Target,
  Coins,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  RotateCcw,
  Download,
  Info,
  ChevronRight,
  Flame,
  ArrowUpRight,
  Sparkles,
  Percent,
  Maximize2,
  Minimize2,
  BarChart3,
  Search,
  Check,
  Share2,
  Package,
} from 'lucide-react'
import { toPng } from 'html-to-image'
import type { CuadreERP } from '@/lib/cuadresErpService'
import { matchBranchSlug } from '@/lib/posBranchAccess'

interface EstrategiaMargenModalProps {
  open: boolean
  onClose: () => void
  sede: string
  fecha: string
  rows: CuadreERP[]
  productImages: Map<string, string>
  costsBD: Map<string, number>
}

interface ItemConsolidado {
  sku: string
  nombre: string
  imagen: string
  cantidadVendida: number
  ventasBrutas: number
  costoNeto: number
  costoUnitario: number
  precioPromedio: number
  gananciaActual: number
  margenActualPct: number
  clasificacion: 'critico' | 'medio' | 'optimo'
  precioMeta25: number
  subidaMeta25: number
}

// Helper para evitar fallos de CORS con imágenes externas en toPng
const replaceImagesForCapture = (el: HTMLElement) => {
  const imgs = el.querySelectorAll('img')
  const replacements: { img: HTMLImageElement; parent: Node; placeholder: HTMLElement }[] = []
  imgs.forEach((img) => {
    const parent = img.parentNode
    if (!parent) return
    const placeholder = document.createElement('div')
    const w = img.offsetWidth || 36
    const h = img.offsetHeight || 36
    placeholder.style.cssText = `width: ${w}px; height: ${h}px; display: flex; align-items: center; justify-content: center; font-size: ${Math.min(
      h * 0.5,
      18
    )}px; background: #f1f5f9; border-radius: 8px; flex-shrink: 0;`
    placeholder.textContent = '📦'
    parent.replaceChild(placeholder, img)
    replacements.push({ img, parent, placeholder })
  })
  return () => {
    replacements.forEach(({ img, parent, placeholder }) => {
      try {
        parent.replaceChild(img, placeholder)
      } catch {}
    })
  }
}

export default function EstrategiaMargenModal({
  open,
  onClose,
  sede,
  fecha,
  rows,
  productImages,
  costsBD,
}: EstrategiaMargenModalProps) {
  const [periodo, setPeriodo] = useState<'dia_actual' | 'ultimos_7dias'>('dia_actual')
  const [activeTab, setActiveTab] = useState<'graficos' | 'simulador' | 'urgentes' | 'explicacion' | 'semaforo'>('graficos')
  const [filtroSemaforo, setFiltroSemaforo] = useState<'todos' | 'critico' | 'medio' | 'optimo'>('critico')
  const [busqueda, setBusqueda] = useState('')
  const [ajustes, setAjustes] = useState<Record<string, number>>({})
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [exportandoCompleto, setExportandoCompleto] = useState(false)
  const [exportandoWhatsApp, setExportandoWhatsApp] = useState(false)

  const capturaRef = useRef<HTMLDivElement | null>(null)
  const reporteCompletoRef = useRef<HTMLDivElement | null>(null)

  // Siempre que se abre el modal para una fecha, resetear al día del cuadre
  React.useEffect(() => {
    if (open) {
      setPeriodo('dia_actual')
      setAjustes({})
    }
  }, [open, fecha])

  const fechaLegible = useMemo(() => {
    if (!fecha) return 'Hoy'
    const parts = fecha.split('-')
    if (parts.length === 3) {
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
      const d = parseInt(parts[2], 10)
      const m = meses[parseInt(parts[1], 10) - 1] || parts[1]
      const y = parts[0]
      return `${d} de ${m} ${y}`
    }
    return fecha
  }, [fecha])

  // 1. Filtrar cuadres según el período seleccionado
  const cuadresFiltrados = useMemo(() => {
    const sedeNorm = sede || 'donbalato-central'
    const list = rows.filter((r) => matchBranchSlug(r.sede || 'donbalato-central', sedeNorm))

    if (periodo === 'dia_actual') {
      const fTarget = fecha || list[0]?.fecha || ''
      return list.filter((r) => r.fecha === fTarget)
    }

    return list.slice(0, 7)
  }, [rows, sede, fecha, periodo])

  // 2. Consolidar productos y métricas base
  const { productos, totalBrutoBase, totalCostoBase, totalGananciaBase, margenGlobalBasePct, totalUnidades } =
    useMemo(() => {
      const map = new Map<string, { sku: string; nombre: string; cantidad: number; bruto: number; costo: number }>()
      let brutoSum = 0
      let costoSum = 0
      let udsSum = 0

      cuadresFiltrados.forEach((c) => {
        const tops = Array.isArray(c.topProducts) ? c.topProducts : []
        tops.forEach((p: any) => {
          const sku = String(p.sku || '').trim().toUpperCase()
          if (!sku) return

          const qty = Number(p.cantidadVendida || 0)
          const bruto = Number(p.ventasBrutas || 0)
          let costo = Number(p.costoNeto || 0)

          if (costo <= 0 && qty > 0) {
            const cu = costsBD.get(sku) || 0
            if (cu > 0) costo = cu * qty
          }

          brutoSum += bruto
          costoSum += costo
          udsSum += qty

          const cur = map.get(sku) || {
            sku,
            nombre: String(p.nombre || sku),
            cantidad: 0,
            bruto: 0,
            costo: 0,
          }
          cur.cantidad += qty
          cur.bruto += bruto
          cur.costo += costo
          map.set(sku, cur)
        })
      })

      const prodsList: ItemConsolidado[] = Array.from(map.values())
        .map((cur) => {
          const precioPromedio = Math.round(cur.bruto / (cur.cantidad || 1))
          const costoUnitario = Math.round(cur.costo / (cur.cantidad || 1))
          const gananciaActual = cur.bruto - cur.costo
          const margenActualPct = cur.bruto > 0 ? Number(((gananciaActual / cur.bruto) * 100).toFixed(1)) : 0

          let clasificacion: 'critico' | 'medio' | 'optimo' = 'medio'
          if (margenActualPct < 15) clasificacion = 'critico'
          else if (margenActualPct > 22) clasificacion = 'optimo'

          let precioMeta25 = costoUnitario > 0 ? Math.ceil(costoUnitario / 0.75 / 10) * 10 : precioPromedio
          if (precioMeta25 < precioPromedio) precioMeta25 = precioPromedio
          const subidaMeta25 = Math.max(0, precioMeta25 - precioPromedio)

          return {
            sku: cur.sku,
            nombre: cur.nombre,
            imagen: productImages.get(cur.sku) || '',
            cantidadVendida: cur.cantidad,
            ventasBrutas: Math.round(cur.bruto),
            costoNeto: Math.round(cur.costo),
            costoUnitario,
            precioPromedio,
            gananciaActual: Math.round(gananciaActual),
            margenActualPct,
            clasificacion,
            precioMeta25,
            subidaMeta25,
          }
        })
        .sort((a, b) => b.cantidadVendida - a.cantidadVendida)

      const gananciaBase = brutoSum - costoSum
      const margenGlobalBase = brutoSum > 0 ? Number(((gananciaBase / brutoSum) * 100).toFixed(1)) : 0

      return {
        productos: prodsList,
        totalBrutoBase: Math.round(brutoSum),
        totalCostoBase: Math.round(costoSum),
        totalGananciaBase: Math.round(gananciaBase),
        margenGlobalBasePct: margenGlobalBase,
        totalUnidades: udsSum,
      }
    }, [cuadresFiltrados, costsBD, productImages])

  // 3. Simulación reactiva en vivo
  const simulacion = useMemo(() => {
    let extraGananciaTotal = 0

    productos.forEach((p) => {
      const incremento = Number(ajustes[p.sku] || 0)
      if (incremento > 0) {
        extraGananciaTotal += p.cantidadVendida * incremento
      }
    })

    const nuevaVentaTotal = totalBrutoBase + extraGananciaTotal
    const nuevaGananciaTotal = totalGananciaBase + extraGananciaTotal
    const nuevoMargenGlobalPct =
      nuevaVentaTotal > 0 ? Number(((nuevaGananciaTotal / nuevaVentaTotal) * 100).toFixed(1)) : margenGlobalBasePct
    const saltoPuntos = Number((nuevoMargenGlobalPct - margenGlobalBasePct).toFixed(1))

    return {
      extraSemanal: Math.round(extraGananciaTotal),
      extraMensual: Math.round(extraGananciaTotal * 4),
      nuevaVentaTotal: Math.round(nuevaVentaTotal),
      nuevaGananciaTotal: Math.round(nuevaGananciaTotal),
      nuevoMargenGlobalPct,
      saltoPuntos,
      hayAjustes: extraGananciaTotal > 0,
    }
  }, [productos, ajustes, totalBrutoBase, totalGananciaBase, margenGlobalBasePct])

  // 4. Presets rápidos
  const handleAplicarRecomendado = () => {
    const nuevosAjustes: Record<string, number> = {}
    productos.forEach((p) => {
      if (p.clasificacion === 'critico') {
        if (p.precioPromedio < 500) nuevosAjustes[p.sku] = 50
        else if (p.precioPromedio < 1000) nuevosAjustes[p.sku] = 100
        else nuevosAjustes[p.sku] = 150
      }
    })
    setAjustes(nuevosAjustes)
  }

  const handleAplicarMeta25 = () => {
    const nuevosAjustes: Record<string, number> = {}
    productos.forEach((p) => {
      if (p.clasificacion === 'critico' && p.subidaMeta25 > 0) {
        nuevosAjustes[p.sku] = p.subidaMeta25
      }
    })
    setAjustes(nuevosAjustes)
  }

  const handleResetAjustes = () => {
    setAjustes({})
  }

  const handleSetAjuste = (sku: string, incremento: number) => {
    setAjustes((prev) => {
      const next = { ...prev }
      if (incremento <= 0) delete next[sku]
      else next[sku] = incremento
      return next
    })
  }

  // 5. Exportar reporte completo HD
  const handleDescargarReporteCompleto = async () => {
    if (!reporteCompletoRef.current) return
    setExportandoCompleto(true)
    const restore = replaceImagesForCapture(reporteCompletoRef.current)
    try {
      const dataUrl = await toPng(reporteCompletoRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `reporte_estrategia_completa_${sede || 'donbalato'}_${periodo}.png`
      a.click()
    } catch (e: any) {
      alert('Error generando reporte completo: ' + (e?.message || ''))
    } finally {
      restore()
      setExportandoCompleto(false)
    }
  }

  // 6. Exportar lámina WhatsApp
  const handleDescargarLáminaWhatsApp = async () => {
    if (!capturaRef.current) return
    setExportandoWhatsApp(true)
    const restore = replaceImagesForCapture(capturaRef.current)
    try {
      const dataUrl = await toPng(capturaRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `estrategia_whatsapp_${sede || 'donbalato'}_${periodo}.png`
      a.click()
    } catch (e: any) {
      alert('Error generando lámina para WhatsApp: ' + (e?.message || ''))
    } finally {
      restore()
      setExportandoWhatsApp(false)
    }
  }

  const topCriticos = useMemo(() => {
    const criticos = productos.filter((p) => p.clasificacion === 'critico')
    if (criticos.length >= 5) return criticos.slice(0, 5)
    const otros = productos.filter((p) => p.clasificacion !== 'critico').sort((a, b) => a.margenActualPct - b.margenActualPct)
    return [...criticos, ...otros].slice(0, 5)
  }, [productos])

  const top5Impacto = useMemo(() => {
    let sumaExtraDia = 0
    topCriticos.forEach((p) => {
      const subida = p.precioPromedio < 500 ? 50 : p.precioPromedio < 1000 ? 70 : 100
      sumaExtraDia += p.cantidadVendida * subida
    })
    const sumaExtraMes = sumaExtraDia * 30
    const nuevaGananciaDia = totalGananciaBase + sumaExtraDia
    const nuevaVentaDia = totalBrutoBase + sumaExtraDia
    const nuevoMargen = nuevaVentaDia > 0 ? Number(((nuevaGananciaDia / nuevaVentaDia) * 100).toFixed(1)) : margenGlobalBasePct
    const saltoMargen = Number((nuevoMargen - margenGlobalBasePct).toFixed(1))

    return {
      sumaExtraDia: Math.round(sumaExtraDia),
      sumaExtraMes: Math.round(sumaExtraMes),
      nuevoMargen,
      saltoMargen,
    }
  }, [topCriticos, totalGananciaBase, totalBrutoBase, margenGlobalBasePct])

  if (!open) return null

  const margenFinalProyectado = simulacion.hayAjustes ? simulacion.nuevoMargenGlobalPct : top5Impacto.nuevoMargen
  const extraMesProyectado = simulacion.hayAjustes ? simulacion.extraMensual : top5Impacto.sumaExtraMes
  const saltoMargenProyectado = simulacion.hayAjustes ? simulacion.saltoPuntos : top5Impacto.saltoMargen

  const productosFiltrados = productos.filter((p) => {
    const matchesBusqueda =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.sku.toLowerCase().includes(busqueda.toLowerCase())
    if (!matchesBusqueda) return false
    if (activeTab === 'semaforo' && filtroSemaforo !== 'todos') {
      return p.clasificacion === filtroSemaforo
    }
    return true
  })

  // Cálculos didácticos de $1.000 para el gráfico
  const costoPorMilActual = Math.round(1000 * (1 - margenGlobalBasePct / 100))
  const gananciaPorMilActual = 1000 - costoPorMilActual

  const costoPorMilNuevo = Math.round(1000 * (1 - margenFinalProyectado / 100))
  const gananciaPorMilNuevo = 1000 - costoPorMilNuevo
  const incrementoGananciaPorMilPct =
    gananciaPorMilActual > 0
      ? Math.round(((gananciaPorMilNuevo - gananciaPorMilActual) / gananciaPorMilActual) * 100)
      : 0

  return (
    <div
      className={
        isFullScreen
          ? 'fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col w-screen h-screen overflow-hidden'
          : 'fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto'
      }
    >
      <div
        className={
          isFullScreen
            ? 'flex-1 flex flex-col w-full h-full overflow-hidden'
            : 'bg-white dark:bg-slate-900 w-full max-w-7xl max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200'
        }
      >
        {/* HEADER SUPERIOR */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 px-5 sm:px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner border border-white/20 shrink-0">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight">Estrategia de Margen & Precios</h2>
                <span className="bg-sky-400/25 border border-sky-300/40 text-sky-100 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                  Importadora Carlitos Central
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5">
                Radiografía visual de rentabilidad y simulador interactivo para socios
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector de Período */}
            <div className="flex items-center bg-blue-900/40 p-1 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setPeriodo('dia_actual')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  periodo === 'dia_actual'
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                Día ({fechaLegible})
              </button>
              <button
                type="button"
                onClick={() => setPeriodo('ultimos_7dias')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  periodo === 'ultimos_7dias'
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                Últimos 7 Días
              </button>
            </div>

            {/* Botón Descargar Reporte Completo HD */}
            <button
              type="button"
              onClick={handleDescargarReporteCompleto}
              disabled={exportandoCompleto}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              title="Descargar imagen HD con todo el análisis completo, gráficos y tabla"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exportandoCompleto ? 'Generando HD...' : 'Descargar Reporte Completo'}</span>
            </button>

            {/* Botón Lámina WhatsApp */}
            <button
              type="button"
              onClick={handleDescargarLáminaWhatsApp}
              disabled={exportandoWhatsApp}
              className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition shadow-sm disabled:opacity-50"
              title="Descargar lámina vertical optimizada para enviar por WhatsApp"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>{exportandoWhatsApp ? '...' : 'Lámina WhatsApp'}</span>
            </button>

            {/* Botón Pantalla Completa */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              title={isFullScreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
            >
              {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Botón Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* BARRA DE KPIS DINÁMICOS EN VIVO */}
        <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* KPI 1: Venta Real */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Venta del Período
              </span>
              <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">
                ${totalBrutoBase.toLocaleString('es-CL')}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {totalUnidades.toLocaleString('es-CL')} unidades físicas vendidas
              </span>
            </div>

            {/* KPI 2: Margen Global Base */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Margen Global Actual
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                  {margenGlobalBasePct}%
                </span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  (${totalGananciaBase.toLocaleString('es-CL')})
                </span>
              </div>
              <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                Meta recomendada: 22% - 25%
              </span>
            </div>

            {/* KPI 3: Ganancia Extra en Simulación */}
            <div
              className={`p-3 rounded-2xl border transition-all ${
                simulacion.hayAjustes
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Ganancia Extra Limpia
                </span>
                {simulacion.hayAjustes && (
                  <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                    SIMULANDO
                  </span>
                )}
              </div>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                +${simulacion.extraSemanal.toLocaleString('es-CL')}{' '}
                <span className="text-xs font-medium text-slate-500">/sem</span>
              </div>
              <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 block">
                +${simulacion.extraMensual.toLocaleString('es-CL')} / mes a tu bolsillo
              </span>
            </div>

            {/* KPI 4: Nuevo Margen Proyectado */}
            <div
              className={`p-3 rounded-2xl border transition-all ${
                simulacion.hayAjustes
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Nuevo Margen Importadora Carlitos
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-black text-blue-700 dark:text-blue-300">
                  {simulacion.nuevoMargenGlobalPct}%
                </span>
                {simulacion.saltoPuntos > 0 && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center">
                    <ArrowUpRight className="h-3.5 w-3.5" /> +{simulacion.saltoPuntos}%
                  </span>
                )}
              </div>
              {/* Barra miniatura de progreso hacia el 25% */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (simulacion.nuevoMargenGlobalPct / 25) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* PESTAÑAS DE NAVEGACIÓN */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 bg-white dark:bg-slate-900 flex-wrap gap-2">
          <div className="flex gap-1 sm:gap-2 -mb-px overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('graficos')}
              className={`py-3 px-3.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'graficos'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              1. Gráficos & Radiografía Visual
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('simulador')}
              className={`py-3 px-3.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'simulador'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              2. Simulador en Vivo ({productos.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('urgentes')}
              className={`py-3 px-3.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'urgentes'
                  ? 'border-rose-600 text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Flame className="h-4 w-4 text-rose-500" />
              3. Top 5 Urgentes por Corregir
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('explicacion')}
              className={`py-3 px-3.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'explicacion'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Info className="h-4 w-4 text-amber-500" />
              4. ¿Por qué cayó el margen? (Explicación)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('semaforo')}
              className={`py-3 px-3.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'semaforo'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Target className="h-4 w-4 text-indigo-500" />
              5. Semáforo Completo
            </button>
          </div>

          {/* Botones de acción rápida de simulación */}
          <div className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={handleAplicarRecomendado}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-bold flex items-center gap-1 transition shadow-sm"
              title="Aplica subidas inteligentes (+50 / +100 / +150) a los productos críticos"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Sugerencia Inteligente (+100/150)
            </button>

            <button
              type="button"
              onClick={handleAplicarMeta25}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 transition shadow-sm"
              title="Eleva los precios para que alcancen el 25% de margen"
            >
              <Target className="h-3.5 w-3.5" />
              Llevar a Meta 25%
            </button>

            {simulacion.hayAjustes && (
              <button
                type="button"
                onClick={handleResetAjustes}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1 transition"
                title="Restablecer todos los precios al valor original"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/60 dark:bg-slate-950/50">
          {/* TAB 1: GRÁFICOS & RADIOGRAFÍA VISUAL */}
          {activeTab === 'graficos' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* GRÁFICO 1: EL BILLETE DE $1.000 PESOS */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-2xl shadow-inner">
                      💵
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                        La Radiografía del Billete de $1.000
                      </h3>
                      <p className="text-xs text-slate-500">
                        La forma más fácil de ver a dónde se va cada billete que entra a la caja de Importadora Carlitos
                      </p>
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-bold">
                    {simulacion.hayAjustes ? 'Con Ajustes Simulados' : 'Situación Actual'}
                  </span>
                </div>

                {/* Comparación visual de las dos barras */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Barra 1: Situación Actual */}
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold uppercase text-slate-500">Hoy (Margen Actual {margenGlobalBasePct}%)</span>
                      <span className="text-sm font-black text-amber-600">${totalGananciaBase.toLocaleString('es-CL')} ganancia</span>
                    </div>

                    {/* Barra apilada */}
                    <div className="h-10 rounded-xl overflow-hidden flex font-bold text-xs text-white shadow-inner">
                      <div
                        className="bg-slate-600 flex items-center justify-center transition-all duration-500"
                        style={{ width: `${(costoPorMilActual / 1000) * 100}%` }}
                        title={`$${costoPorMilActual} se va a proveedores`}
                      >
                        Costos ${costoPorMilActual}
                      </div>
                      <div
                        className="bg-amber-500 flex items-center justify-center transition-all duration-500 text-amber-950 font-black"
                        style={{ width: `${(gananciaPorMilActual / 1000) * 100}%` }}
                        title={`$${gananciaPorMilActual} te queda a ti`}
                      >
                        ${gananciaPorMilActual}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      De cada $1.000 pesos cobrados:
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                        <li><b>${costoPorMilActual}</b> se van al proveedor (mercadería).</li>
                        <li>Solo <b>${gananciaPorMilActual}</b> te quedan limpios en mano.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Barra 2: Con la subida sugerida */}
                  <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-300 dark:border-emerald-800 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">
                        Con el Ajuste (Margen {simulacion.nuevoMargenGlobalPct}%)
                      </span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        ${simulacion.nuevaGananciaTotal.toLocaleString('es-CL')} ganancia
                      </span>
                    </div>

                    {/* Barra apilada con ganancia extra */}
                    <div className="h-10 rounded-xl overflow-hidden flex font-bold text-xs text-white shadow-inner">
                      <div
                        className="bg-slate-600 flex items-center justify-center transition-all duration-500"
                        style={{ width: `${(costoPorMilNuevo / 1000) * 100}%` }}
                        title={`$${costoPorMilNuevo} se va a proveedores`}
                      >
                        Costos ${costoPorMilNuevo}
                      </div>
                      <div
                        className="bg-emerald-500 flex items-center justify-center transition-all duration-500 text-emerald-950 font-black"
                        style={{ width: `${(gananciaPorMilNuevo / 1000) * 100}%` }}
                        title={`$${gananciaPorMilNuevo} te queda a ti`}
                      >
                        ${gananciaPorMilNuevo}
                      </div>
                    </div>

                    <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed font-medium">
                      Con solo ajustar los 5 productos clave:
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                        <li>Te quedas con <b>${gananciaPorMilNuevo} pesos por cada $1.000</b>.</li>
                        <li className="font-bold text-emerald-700 dark:text-emerald-300">
                          ¡Es un <b>+{incrementoGananciaPorMilPct}% más de plata en tu bolsillo</b> por exactamente el mismo trabajo!
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* GRÁFICO 2: EL TERMÓMETRO DE MARGEN DEL NEGOCIO */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-2xl shadow-inner">
                    🌡️
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                      El Termómetro de Rentabilidad de Importadora Carlitos
                    </h3>
                    <p className="text-xs text-slate-500">
                      Semáforo oficial del negocio: Zona Crítica (&lt;15%), Zona Regular (15-22%) y Zona Saludable (&gt;22%)
                    </p>
                  </div>
                </div>

                {/* Medidor visual horizontal */}
                <div className="space-y-3 pt-2">
                  <div className="relative h-12 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex shadow-inner">
                    {/* Zona Crítica (0% - 15%) */}
                    <div className="bg-rose-500 h-full flex items-center justify-center text-white text-[11px] font-bold" style={{ width: '50%' }}>
                      Zona Crítica (&lt;15%)
                    </div>
                    {/* Zona Regular (15% - 22%) */}
                    <div className="bg-amber-400 h-full flex items-center justify-center text-amber-950 text-[11px] font-bold" style={{ width: '23.3%' }}>
                      Regular (15-22%)
                    </div>
                    {/* Zona Saludable (22% - 30%) */}
                    <div className="bg-emerald-500 h-full flex items-center justify-center text-white text-[11px] font-bold" style={{ width: '26.7%' }}>
                      Meta Saludable (22-25%+)
                    </div>

                    {/* Marcador Actual */}
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-white shadow-2xl z-10 flex flex-col items-center justify-between py-1"
                      style={{ left: `${Math.min(95, (margenGlobalBasePct / 30) * 100)}%` }}
                    >
                      <div className="bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded font-black whitespace-nowrap shadow -mt-6">
                        Hoy: {margenGlobalBasePct}%
                      </div>
                      <div className="w-3 h-3 rounded-full bg-slate-900 border-2 border-white" />
                    </div>

                    {/* Marcador Simulado (si hay cambios) */}
                    {simulacion.hayAjustes && (
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-blue-900 shadow-2xl z-20 flex flex-col items-center justify-between py-1 transition-all duration-500"
                        style={{ left: `${Math.min(95, (simulacion.nuevoMargenGlobalPct / 30) * 100)}%` }}
                      >
                        <div className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black whitespace-nowrap shadow -mt-7 ring-2 ring-white">
                          🚀 Nuevo: {simulacion.nuevoMargenGlobalPct}%
                        </div>
                        <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 font-semibold px-1">
                    <span>0%</span>
                    <span>15% (Límite peligro)</span>
                    <span>22% (Saludable)</span>
                    <span>25% (Meta Oficial)</span>
                    <span>30%</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  💡 <b>¿Por qué estamos en el 15.2%?</b> Porque el 90% de los clientes se llevan los productos de mayor volumen (Trapero Vi-Mas, Toallas Pure Love, Servilletas), los cuales hoy se están vendiendo prácticamente al costo (7% a 12% de margen). Al moverlos ligeramente, toda la tienda salta automáticamente a la zona verde.
                </div>
              </div>

              {/* GRÁFICO 3: BARRAS COMPARATIVAS DE LOS 5 GIGANTES DE VOLUMEN */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                      Comparativa de los 5 Gigantes de Venta
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mira cuánto se lleva el costo vs la ganancia actual y la ganancia extra con el ajuste
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('simulador')}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition flex items-center gap-1.5"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Abrir Simulador Completo
                  </button>
                </div>

                <div className="space-y-4">
                  {topCriticos.map((p, idx) => {
                    const subida = p.precioPromedio < 500 ? 70 : p.precioPromedio > 1000 ? 150 : 100
                    const precioNuevo = p.precioPromedio + subida
                    const gananciaActual = p.precioPromedio - p.costoUnitario
                    const gananciaNueva = precioNuevo - p.costoUnitario
                    const extraMensual = p.cantidadVendida * subida * 4

                    return (
                      <div
                        key={p.sku}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2.5"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{p.nombre}</span>
                            <span className="text-xs text-slate-400 font-mono">({p.sku})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">
                              <b>{p.cantidadVendida.toLocaleString('es-CL')}</b> unidades
                            </span>
                            <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold">
                              +${extraMensual.toLocaleString('es-CL')} / mes
                            </span>
                          </div>
                        </div>

                        {/* Barra de Costo vs Ganancia */}
                        <div className="h-6 rounded-lg overflow-hidden flex text-[10px] font-bold text-white shadow-inner">
                          {/* Costo */}
                          <div
                            className="bg-slate-600 flex items-center justify-center px-2 truncate"
                            style={{ width: `${(p.costoUnitario / precioNuevo) * 100}%` }}
                            title={`Costo: $${p.costoUnitario}`}
                          >
                            Costo ${p.costoUnitario}
                          </div>
                          {/* Ganancia Actual */}
                          <div
                            className="bg-amber-500 text-amber-950 flex items-center justify-center px-1 truncate"
                            style={{ width: `${(gananciaActual / precioNuevo) * 100}%` }}
                            title={`Ganancia hoy: $${gananciaActual}`}
                          >
                            Hoy ${gananciaActual}
                          </div>
                          {/* Ganancia Extra */}
                          <div
                            className="bg-emerald-500 text-emerald-950 flex items-center justify-center px-1 truncate font-black"
                            style={{ width: `${(subida / precioNuevo) * 100}%` }}
                            title={`Extra: +$${subida}`}
                          >
                            +${subida}
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[11px] text-slate-500 pt-0.5">
                          <span>
                            Hoy se cobra: <b>${p.precioPromedio}</b> (Margen: <b className="text-rose-600">{p.margenActualPct}%</b>)
                          </span>
                          <span className="font-bold text-emerald-600">
                            Precio Sugerido: ${precioNuevo} (Margen:{' '}
                            {Math.round(((gananciaNueva / precioNuevo) * 100))}%)
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SIMULADOR EN VIVO */}
          {activeTab === 'simulador' && (
            <div className="space-y-4">
              <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-blue-950 dark:text-blue-100">
                      Simulador Dinámico de Subida de Precios
                    </h4>
                    <p className="text-xs text-blue-800/80 dark:text-blue-300">
                      Ajusta <b>+$50, +$100, +$150</b> a los productos. Observa arriba cómo sube el margen global y
                      cuántos millones limpios se generan.
                    </p>
                  </div>
                </div>

                {/* Buscador de productos */}
                <div className="relative min-w-[240px]">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar producto o SKU..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* LISTADO DE PRODUCTOS DEL SIMULADOR */}
              <div className="grid grid-cols-1 gap-3">
                {productosFiltrados.slice(0, 30).map((p, idx) => {
                  const ajusteActual = ajustes[p.sku] || 0
                  const nuevoPrecio = p.precioPromedio + ajusteActual
                  const nuevoMargen =
                    nuevoPrecio > 0
                      ? Number((((nuevoPrecio - p.costoUnitario) / nuevoPrecio) * 100).toFixed(1))
                      : p.margenActualPct
                  const extraSemanalProd = p.cantidadVendida * ajusteActual

                  return (
                    <div
                      key={p.sku}
                      className={`p-4 rounded-2xl border transition-all ${
                        ajusteActual > 0
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 shadow-sm'
                          : p.clasificacion === 'critico'
                          ? 'bg-white dark:bg-slate-800 border-rose-200 dark:border-rose-900/50'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Info Producto */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="relative shrink-0">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                              {p.imagen ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xl">📦</span>
                              )}
                            </div>
                            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-400">{p.sku}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                  p.clasificacion === 'critico'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                    : p.clasificacion === 'medio'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                }`}
                              >
                                {p.clasificacion === 'critico'
                                  ? 'Margen Crítico'
                                  : p.clasificacion === 'medio'
                                  ? 'Margen Medio'
                                  : 'Saludable'}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                              {p.nombre}
                            </h4>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span>
                                <b>{p.cantidadVendida.toLocaleString('es-CL')}</b> uds vendidas
                              </span>
                              <span>·</span>
                              <span>Costo: ${p.costoUnitario.toLocaleString('es-CL')}</span>
                              <span>·</span>
                              <span>Cobrado: ${p.precioPromedio.toLocaleString('es-CL')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Margen Actual vs Nuevo */}
                        <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 pt-3 sm:pt-0 sm:pl-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                              Margen Actual
                            </span>
                            <div
                              className={`text-sm font-black ${
                                p.margenActualPct < 15
                                  ? 'text-rose-600'
                                  : p.margenActualPct > 22
                                  ? 'text-emerald-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {p.margenActualPct}%
                            </div>
                            <span className="text-[10px] text-slate-400">
                              +${(p.precioPromedio - p.costoUnitario).toLocaleString('es-CL')} / ud
                            </span>
                          </div>

                          {/* Control de Botones de Ajuste */}
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-1">
                              {[50, 100, 150].map((inc) => (
                                <button
                                  key={inc}
                                  type="button"
                                  onClick={() => handleSetAjuste(p.sku, ajusteActual === inc ? 0 : inc)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                    ajusteActual === inc
                                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                                  }`}
                                >
                                  +${inc}
                                </button>
                              ))}
                              {ajusteActual > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleSetAjuste(p.sku, 0)}
                                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                                  title="Quitar ajuste"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {ajusteActual > 0 && (
                              <div className="text-right">
                                <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                                  Nuevo: ${nuevoPrecio.toLocaleString('es-CL')} ({nuevoMargen}%)
                                </span>
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">
                                  +${extraSemanalProd.toLocaleString('es-CL')} sem (+${(extraSemanalProd * 4).toLocaleString('es-CL')} mes)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 3: TOP 5 ACCIONES URGENTES */}
          {activeTab === 'urgentes' && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <Flame className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-rose-950 dark:text-rose-100">
                      Los 5 Productos que te están Costando $1.080.000 Mensuales
                    </h3>
                    <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                      Estos 5 productos mueven miles de unidades en caja pero se están vendiendo prácticamente al
                      costo. Ajustando solo unos pesos por unidad, nadie dejará de comprar y la tienda recupera más
                      de un millón de pesos limpios cada mes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topCriticos.map((p, i) => {
                  let subidaSugerida = 100
                  if (p.precioPromedio < 500) subidaSugerida = 70
                  else if (p.precioPromedio > 1000) subidaSugerida = 150
                  const precioSugerido = p.precioPromedio + subidaSugerida
                  const nuevoMargen = Number(
                    (((precioSugerido - p.costoUnitario) / precioSugerido) * 100).toFixed(1)
                  )
                  const extraSemanal = p.cantidadVendida * subidaSugerida
                  const extraMensual = extraSemanal * 4

                  return (
                    <div
                      key={p.sku}
                      className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center">
                            #{i + 1}
                          </span>
                          <span className="bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                            Margen Actual: {p.margenActualPct}%
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                            {p.imagen ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl">📦</span>
                            )}
                          </div>
                          <div>
                            <span className="text-xs font-mono font-bold text-slate-400">{p.sku}</span>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
                              {p.nombre}
                            </h4>
                            <p className="text-xs text-slate-500">
                              Vendió <b>{p.cantidadVendida.toLocaleString('es-CL')}</b> unidades
                            </p>
                          </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl space-y-1.5 text-xs mb-4">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Costo Unitario Real:</span>
                            <span className="font-semibold">${p.costoUnitario.toLocaleString('es-CL')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Precio Actual Cobrado:</span>
                            <span className="font-semibold text-rose-600">
                              ${p.precioPromedio.toLocaleString('es-CL')} (Ganas solo $
                              {(p.precioPromedio - p.costoUnitario).toLocaleString('es-CL')})
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-1.5 font-bold">
                            <span className="text-emerald-700 dark:text-emerald-300">Precio Sugerido (+${subidaSugerida}):</span>
                            <span className="text-emerald-700 dark:text-emerald-300 font-extrabold text-sm">
                              ${precioSugerido.toLocaleString('es-CL')} ({nuevoMargen}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium block">
                            Dinero Extra Generado
                          </span>
                          <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                            +${extraMensual.toLocaleString('es-CL')} / mes
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('simulador')
                            handleSetAjuste(p.sku, subidaSugerida)
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          Simular Este
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 4: EXPLICACIÓN PARA EL TÍO */}
          {activeTab === 'explicacion' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-2xl">
                    💡
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      ¿Por qué el margen de Importadora Carlitos fue 15.2% y no 25%?
                    </h3>
                    <p className="text-xs text-slate-500">
                      La explicación matemática sencilla para entender cómo funciona la rentabilidad
                    </p>
                  </div>
                </div>

                <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  <p>
                    Muchas veces pensamos: <i>"Si a varios productos les pusimos un 25% o 30% de ganancia, ¿por qué al cerrar la caja del día o la semana la ganancia sale en 15%?"</i>.
                  </p>
                  <p className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900 font-medium text-amber-900 dark:text-amber-200">
                    <b>La respuesta es la Ley del Volumen (el Promedio Ponderado):</b> El porcentaje de ganancia total de la tienda <u>no es la suma de los porcentajes dividida por la cantidad de productos</u>. Depende directamente de <b>QUÉ productos compra la gente y en qué cantidad</b>.
                  </p>

                  <div className="bg-slate-50 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                      Ejemplo con los datos reales de esta semana:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200">
                        <span className="font-bold text-rose-800 block text-sm">
                          Producto A: Trapero Vi-Mas 10+2
                        </span>
                        <div className="mt-2 space-y-1 text-slate-600">
                          <div>• Se vendieron: <b>1.069 unidades</b></div>
                          <div>• Costo: $580 | Se cobró: $630</div>
                          <div>• Margen de ganancia: <b>¡Solo 8%!</b> ($50 pesos)</div>
                          <div>• Dinero que movió en caja: <b>$673.600</b></div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200">
                        <span className="font-bold text-emerald-800 block text-sm">
                          Producto B: Producto con 40%
                        </span>
                        <div className="mt-2 space-y-1 text-slate-600">
                          <div>• Se vendieron: <b>10 unidades</b></div>
                          <div>• Costo: $1.000 | Se cobró: $1.660</div>
                          <div>• Margen de ganancia: <b>40%</b> ($660 pesos)</div>
                          <div>• Dinero que movió en caja: <b>$16.600</b></div>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 pt-2">
                      👉 <b>Conclusión:</b> Como el Trapero vendió <b>1.069 unidades</b> y el otro vendió solo 10, el 98% del dinero de la caja provino del producto con 8% de margen. Por eso, el margen global de la tienda se parece al del trapero (8%-15%) y no al de los productos con 25% o 40%.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/30 p-5 rounded-2xl border border-blue-200 dark:border-blue-900 space-y-2">
                    <h4 className="font-bold text-blue-900 dark:text-blue-100 text-sm">
                      🎯 ¿Cómo volvemos al 20% - 25% sin perder clientes?
                    </h4>
                    <p className="text-xs text-blue-800/90 dark:text-blue-200">
                      No hace falta subirle el precio a toda la tienda. Solo basta ajustar <b>entre $50 y $150 pesos a los 5 productos de mayor volumen</b> que hoy están dejando menos del 12%. El cliente ni lo nota porque siguen siendo baratísimos, pero la tienda suma <b>+$1.000.000 de pesos extra limpios cada mes</b>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SEMÁFORO COMPLETO */}
          {activeTab === 'semaforo' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setFiltroSemaforo('critico')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                      filtroSemaforo === 'critico'
                        ? 'bg-rose-100 text-rose-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    Críticos &lt;15% ({productos.filter((p) => p.clasificacion === 'critico').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroSemaforo('medio')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                      filtroSemaforo === 'medio'
                        ? 'bg-amber-100 text-amber-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Medio 15-22% ({productos.filter((p) => p.clasificacion === 'medio').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroSemaforo('optimo')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                      filtroSemaforo === 'optimo'
                        ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    Saludables &gt;22% ({productos.filter((p) => p.clasificacion === 'optimo').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroSemaforo('todos')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition ${
                      filtroSemaforo === 'todos'
                        ? 'bg-slate-200 text-slate-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({productos.length})
                  </button>
                </div>
              </div>

              {/* TABLA DE PRODUCTOS */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Producto</th>
                        <th className="py-3 px-4 text-right">Uds Vendidas</th>
                        <th className="py-3 px-4 text-right">Costo Unit.</th>
                        <th className="py-3 px-4 text-right">Precio Cobrado</th>
                        <th className="py-3 px-4 text-right">Venta Total</th>
                        <th className="py-3 px-4 text-right">Margen Actual</th>
                        <th className="py-3 px-4 text-right">Precio Meta 25%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {productosFiltrados.map((p, i) => (
                        <tr key={p.sku} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                          <td className="py-3 px-4 text-slate-400 font-bold">{i + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                                {p.imagen ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.imagen} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span>📦</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-100 block truncate max-w-[240px]">
                                  {p.nombre}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">{p.sku}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-200">
                            {p.cantidadVendida.toLocaleString('es-CL')}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500">${p.costoUnitario.toLocaleString('es-CL')}</td>
                          <td className="py-3 px-4 text-right font-medium">${p.precioPromedio.toLocaleString('es-CL')}</td>
                          <td className="py-3 px-4 text-right font-semibold">${p.ventasBrutas.toLocaleString('es-CL')}</td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                p.margenActualPct < 15
                                  ? 'bg-rose-100 text-rose-700'
                                  : p.margenActualPct > 22
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {p.margenActualPct}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-blue-600">
                            ${p.precioMeta25.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <span>Importadora Carlitos ERP — Estrategia de Margen, Volumen y Rentabilidad</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
          >
            Cerrar Ventana
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            PLANTILLA 1: REPORTE COMPLETO HD (920px) PARA DESCARGA
            Contiene Título, KPIs, Gráfico del Billete, Termómetro, Top 5 y Resumen
        ───────────────────────────────────────────────────────────── */}
        <div style={{ position: 'fixed', top: -9999, left: -9999, zIndex: -1 }}>
          <div
            ref={reporteCompletoRef}
            style={{
              width: 920,
              background: '#ffffff',
              padding: 36,
              borderRadius: 24,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              color: '#0f172a',
            }}
          >
            {/* Header Corporativo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '3px solid #1e3a8a',
                paddingBottom: 20,
                marginBottom: 24,
              }}
            >
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#1e3a8a', letterSpacing: -0.5 }}>
                  🏪 Importadora Carlitos CENTRAL — INFORME ESTRATÉGICO
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginTop: 2 }}>
                  Radiografía de Margen, Ley del Volumen & Subida de Precios
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Período analizado: {periodo === 'dia_actual' ? `Día ${fechaLegible}` : 'Últimos 7 Días'}
                </div>
              </div>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 16,
                  padding: '12px 20px',
                  textAlign: 'right',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
                  Margen Actual Tienda
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#dc2626' }}>{margenGlobalBasePct}%</div>
                <div style={{ fontSize: 10, color: '#059669', fontWeight: 800 }}>Meta: 22% - 25%</div>
              </div>
            </div>

            {/* 4 KPIs Clave */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Venta Real</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                  ${totalBrutoBase.toLocaleString('es-CL')}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{totalUnidades.toLocaleString('es-CL')} uds vendidas</div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Ganancia Base</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#d97706', marginTop: 4 }}>
                  ${totalGananciaBase.toLocaleString('es-CL')}
                </div>
                <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700 }}>Margen: {margenGlobalBasePct}%</div>
              </div>

              <div style={{ background: '#ecfdf5', padding: 14, borderRadius: 14, border: '2px solid #34d399' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>Ganancia Extra Mes</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#047857', marginTop: 4 }}>
                  +${extraMesProyectado.toLocaleString('es-CL')} / mes
                </div>
                <div style={{ fontSize: 10, color: '#047857', fontWeight: 700 }}>100% ganancia líquida</div>
              </div>

              <div style={{ background: '#eff6ff', padding: 14, borderRadius: 14, border: '2px solid #60a5fa' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>Nuevo Margen Proyectado</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>
                  {margenFinalProyectado}%
                </div>
                <div style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700 }}>+{saltoMargenProyectado} pts de margen</div>
              </div>
            </div>

            {/* Gráfico Visual: El Billete de $1.000 */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 18, padding: 18, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                💵 ¿A DÓNDE SE VA CADA $1.000 PESOS QUE ENTRAN A Importadora Carlitos?
              </div>

              {/* Barra Actual */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  <span>Hoy (Margen {margenGlobalBasePct}%)</span>
                  <span style={{ color: '#dc2626' }}>Solo te quedan ${gananciaPorMilActual} de ganancia</span>
                </div>
                <div style={{ height: 28, borderRadius: 8, overflow: 'hidden', display: 'flex', fontSize: 11, fontWeight: 800, color: '#fff' }}>
                  <div style={{ width: `${(costoPorMilActual / 1000) * 100}%`, background: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Costo Proveedores ${costoPorMilActual} ({((costoPorMilActual / 1000) * 100).toFixed(1)}%)
                  </div>
                  <div style={{ width: `${(gananciaPorMilActual / 1000) * 100}%`, background: '#f59e0b', color: '#451a03', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ${gananciaPorMilActual}
                  </div>
                </div>
              </div>

              {/* Barra Propuesta */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: '#047857' }}>Con el Ajuste Sugerido (Margen {margenFinalProyectado}%)</span>
                  <span style={{ color: '#047857', fontWeight: 900 }}>¡Te quedan ${gananciaPorMilNuevo} limpios (+{incrementoGananciaPorMilPct}% más plata)!</span>
                </div>
                <div style={{ height: 28, borderRadius: 8, overflow: 'hidden', display: 'flex', fontSize: 11, fontWeight: 800, color: '#fff' }}>
                  <div style={{ width: `${(costoPorMilNuevo / 1000) * 100}%`, background: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Costo Proveedores ${costoPorMilNuevo} ({((costoPorMilNuevo / 1000) * 100).toFixed(1)}%)
                  </div>
                  <div style={{ width: `${(gananciaPorMilNuevo / 1000) * 100}%`, background: '#10b981', color: '#022c22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Ganancia Importadora Carlitos ${gananciaPorMilNuevo} ({margenFinalProyectado}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Tabla Top 5 Acciones Urgentes */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔥</span> TOP 5 SUBIDAS DE PRECIO RECOMENDADAS (ALTO IMPACTO):
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px 12px' }}>#</th>
                      <th style={{ padding: '8px 12px' }}>Producto</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Uds Vendidas</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Costo Real</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Precio Hoy</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Margen Hoy</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Precio Sugerido</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Extra al Mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCriticos.map((p, idx) => {
                      const subida = p.precioPromedio < 500 ? 50 : p.precioPromedio < 1000 ? 70 : 100
                      const precioSugerido = p.precioPromedio + subida
                      const factorDiasMes = periodo === 'dia_actual' ? 30 : 4
                      const extraMensual = p.cantidadVendida * subida * factorDiasMes
                      return (
                        <tr key={p.sku} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 800, color: '#dc2626' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>{p.nombre}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>{p.cantidadVendida} uds</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>${p.costoUnitario}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>${p.precioPromedio}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{p.margenActualPct}%</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#047857' }}>
                            ${precioSugerido} (+${subida})
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#047857' }}>
                            +${extraMensual.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Banner Final de Impacto */}
            <div
              style={{
                background: '#ecfdf5',
                border: '2px solid #10b981',
                borderRadius: 16,
                padding: 18,
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46' }}>
                🚀 RESULTADO TOTAL DE AJUSTAR ESTOS 5 PRODUCTOS:
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#047857', marginTop: 4 }}>
                +${extraMesProyectado.toLocaleString('es-CL')} PESOS EXTRA LIMPIOS AL MES
              </div>
              <div style={{ fontSize: 12, color: '#065f46', marginTop: 4, fontWeight: 600 }}>
                El margen global de Importadora Carlitos sube del {margenGlobalBasePct}% al {margenFinalProyectado}% sin riesgo de perder clientes.
              </div>
            </div>

            {/* Footer Oficial */}
            <div
              style={{
                borderTop: '1px solid #e2e8f0',
                paddingTop: 10,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: '#94a3b8',
              }}
            >
              <span>Importadora Carlitos ERP — Generado Automáticamente para Gerencia y Socios</span>
              <span>{new Date().toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            PLANTILLA 2: LÁMINA WHATSAPP (580px)
        ───────────────────────────────────────────────────────────── */}
        <div style={{ position: 'fixed', top: -9999, left: -9999, zIndex: -1 }}>
          <div
            ref={capturaRef}
            style={{
              width: 580,
              background: '#ffffff',
              padding: 28,
              borderRadius: 20,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              color: '#1e293b',
            }}
          >
            {/* Header Lámina */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '2px solid #e2e8f0',
                paddingBottom: 16,
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#1e3a8a' }}>🏪 Importadora Carlitos CENTRAL</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                  Informe de Rentabilidad & Subida de Precios
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Período: {periodo === 'dia_actual' ? `Día ${fechaLegible}` : 'Últimos 7 Días'}
                </div>
              </div>
              <div
                style={{
                  background: '#eff6ff',
                  padding: '8px 14px',
                  borderRadius: 12,
                  textAlign: 'right',
                  border: '1px solid #bfdbfe',
                }}
              >
                <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>
                  Margen Actual
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626' }}>{margenGlobalBasePct}%</div>
              </div>
            </div>

            {/* Diagnóstico Breve */}
            <div
              style={{
                background: '#f8fafc',
                padding: 14,
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                marginBottom: 18,
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              <b>💡 ¿Por qué el margen de la tienda fue {margenGlobalBasePct}% y no 25%?</b>
              <div style={{ color: '#475569', marginTop: 4 }}>
                Porque productos de alto volumen ({topCriticos.slice(0, 3).map(p => `${p.nombre} [${p.margenActualPct}%]`).join(', ')}) se vendieron con márgenes bajos, reduciendo el promedio de ganancia.
              </div>
            </div>

            {/* Top 5 Recomendaciones */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>🚀</span> Top 5 Subidas de Precio Recomendadas:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {topCriticos.map((p, idx) => {
                let subidaSugerida = 100
                if (p.precioPromedio < 500) subidaSugerida = 50
                else if (p.precioPromedio < 1000) subidaSugerida = 70
                const precioSugerido = p.precioPromedio + subidaSugerida
                const factorDiasMes = periodo === 'dia_actual' ? 30 : 4
                const extraMensual = p.cantidadVendida * subidaSugerida * factorDiasMes
                return (
                  <div
                    key={p.sku}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: idx % 2 === 0 ? '#f1f5f9' : '#ffffff',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#dc2626',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{p.nombre}</div>
                        <div style={{ fontSize: 9, color: '#64748b' }}>
                          Vendió {p.cantidadVendida} uds · Costo ${p.costoUnitario} · Cobra ${p.precioPromedio} (
                          {p.margenActualPct}%)
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>
                        Subir a ${precioSugerido} (+${subidaSugerida})
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#047857' }}>
                        +${extraMensual.toLocaleString('es-CL')} / mes
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Impacto Total */}
            <div
              style={{
                background: '#ecfdf5',
                padding: 14,
                borderRadius: 14,
                border: '1px solid #a7f3d0',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46' }}>
                💰 IMPACTO TOTAL AJUSTANDO SOLO ESTOS 5 PRODUCTOS:
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#047857', marginTop: 2 }}>
                +${extraMesProyectado.toLocaleString('es-CL')} pesos extra al mes
              </div>
              <div style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
                El margen global de Importadora Carlitos sube del {margenGlobalBasePct}% al {margenFinalProyectado}% automáticamente.
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                textAlign: 'center',
                fontSize: 9,
                color: '#94a3b8',
                marginTop: 14,
                borderTop: '1px solid #f1f5f9',
                paddingTop: 8,
              }}
            >
              Generado automáticamente por Importadora Carlitos ERP — {new Date().toLocaleDateString('es-CL')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
