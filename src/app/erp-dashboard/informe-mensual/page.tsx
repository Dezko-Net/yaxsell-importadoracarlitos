'use client'

import React, { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Download,
  DollarSign,
  BarChart3,
  TrendingUp,
  TrendingDown,
  CreditCard,
  PieChart,
  Receipt,
  Sparkles,
  ShoppingCart,
  Package,
  Activity,
  Building2,
  RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
} from 'recharts'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { saveAs } from 'file-saver'
import { generateInformePdf, type PdfReportData } from '@/lib/informePdfGenerator'

const ResponsiveBox = ResponsiveContainer as any
import { db } from '@/lib/firebase'
import { SEDES, SedeSlug, SEDE_SLUGS, DEFAULT_SEDE } from '@/types'
import { aggregateAndSummarizeTopProducts, normalizeProfitSku, type TopProduct } from '@/lib/topProductsProfit'
import {
  buildExternalExpenseBreakdown,
  buildVisibleDateRange,
  type ExternalFixedExpense,
  type ExternalManualExpense,
  listExternalExpenseEntriesForMonth,
  loadExternalExpensesConfig,
} from '@/lib/externalExpenses'
import { fetchCuadresERP, type CuadreERP } from '@/lib/cuadresErpService'
import { fetchAllFirebaseErpProducts } from '@/lib/firebaseErpService'
import { fetchTrabajadoresERP } from '@/lib/trabajadoresErpService'
import { esCompraMercaderia, obtenerGastosQueAfectanGanancia, sumarGastosMercaderia } from '@/lib/gastosProfit'

type GastoItem = {
  id?: string
  sede?: string
  monto?: number
  observacion?: string
  descripcion?: string
  concepto?: string
  tipoGasto?: string
  categoria?: string
  tipo?: string
  fecha?: string
  proveedor?: string
  rubroMercaderia?: string
  sourceLabel?: string
}

type DayData = {
  dia: number
  fecha: string
  totalBruto: number
  costoProductos: number
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
  gastosQueAfectanGanancia: number
  diasConDatos: number
  gananciaBrutaCierre: number
  gastosDetalle: GastoItem[]
  topProducts: TopProduct[]
  analisisProductosRetailbase?: CuadreERP['analisisProductosRetailbase']
  costosProductosDisponibles?: boolean
}

type WorkerAdelanto = {
  ymd?: string
  monto?: number
  descripcion?: string
  anulada?: boolean
}

type PayrollWorker = {
  id: string
  nombre: string
  adelantos: WorkerAdelanto[]
}

type Totals = {
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
  gastosQueAfectanGanancia: number
  diasConDatos: number
}

const EMPTY_TOTALS: Totals = {
  totalBruto: 0,
  totalNeto: 0,
  efectivoSistema: 0,
  efectivoReal: 0,
  diferenciaEfectivo: 0,
  debitoSistema: 0,
  debitoReal: 0,
  diferenciaDebito: 0,
  transferencias: 0,
  gastos: 0,
  gastosMercaderia: 0,
  gastosQueAfectanGanancia: 0,
  diasConDatos: 0,
}

const isValidSede = (value: string | undefined): value is SedeSlug => !!value && value in SEDES
const isValidMonthId = (value: string | null | undefined) => !!value && /^\d{4}-\d{2}$/.test(value)

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)
}

const formatInteger = (amount: number) => new Intl.NumberFormat('es-CL').format(Math.round(Number(amount) || 0))

const formatMonth = (monthId: string) => {
  if (!monthId || !monthId.includes('-')) return monthId
  const [year, month] = monthId.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
}

const parseMonthValue = (value: string) => {
  const [year, month] = value.split('-')
  return Number(year) * 100 + Number(month)
}

const normalizeExpenseText = (value: string) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const toYmdLocal = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const easterSunday = (year: number) => {
  const f = Math.floor
  const a = year % 19
  const b = f(year / 100)
  const c = year % 100
  const d = f(b / 4)
  const e = b % 4
  const g = f((8 * b + 13) / 25)
  const h = (19 * a + b - d - g + 15) % 30
  const i = f(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = f((a + 11 * h + 19 * l) / 433)
  const n = f((h + l - 7 * m + 90) / 25)
  const p = (h + l - 7 * m + 33 * n + 19) % 32
  return new Date(year, n - 1, p)
}

const chileHolidayName = (date: Date, ymd: string) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const yyyy = d.getFullYear()
  const fixed: Record<string, string> = {
    [`${yyyy}-01-01`]: 'Año Nuevo',
    [`${yyyy}-05-01`]: 'Día del Trabajador',
    [`${yyyy}-05-21`]: 'Glorias Navales',
    [`${yyyy}-06-29`]: 'San Pedro y San Pablo',
    [`${yyyy}-07-16`]: 'Virgen del Carmen',
    [`${yyyy}-08-15`]: 'Asunción',
    [`${yyyy}-09-18`]: 'Independencia',
    [`${yyyy}-09-19`]: 'Glorias del Ejército',
    [`${yyyy}-10-12`]: 'Encuentro de Dos Mundos',
    [`${yyyy}-10-31`]: 'Día de las Iglesias Evangélicas',
    [`${yyyy}-11-01`]: 'Todos los Santos',
    [`${yyyy}-12-08`]: 'Inmaculada Concepción',
    [`${yyyy}-12-25`]: 'Navidad',
  }
  if (fixed[ymd]) return fixed[ymd]

  const easter = easterSunday(yyyy)
  easter.setHours(0, 0, 0, 0)
  const goodFriday = new Date(easter)
  goodFriday.setDate(goodFriday.getDate() - 2)
  const holySaturday = new Date(easter)
  holySaturday.setDate(holySaturday.getDate() - 1)

  const movable: Record<string, string> = {
    [toYmdLocal(goodFriday)]: 'Viernes Santo',
    [toYmdLocal(holySaturday)]: 'Sábado Santo',
  }
  return movable[ymd] || null
}

const isSunday = (d: Date) => d.getDay() === 0

function InformeMensualContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawSede = searchParams.get('sede') || DEFAULT_SEDE
  const sede: SedeSlug = isValidSede(rawSede) ? rawSede : DEFAULT_SEDE
  const requestedMonth = isValidMonthId(searchParams.get('month')) ? String(searchParams.get('month')) : ''

  const [selectedMonth, setSelectedMonth] = useState('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [monthData, setMonthData] = useState<DayData[]>([])
  const [jefaturaMercaderia, setJefaturaMercaderia] = useState<GastoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState<'full' | 's1' | 's2' | 's3' | 's4'>('full')
  const [costsBD, setCostsBD] = useState<Map<string, number>>(new Map())
  const [minus10Flags, setMinus10Flags] = useState<Set<string>>(new Set())
  const [fixedExternalExpenses, setFixedExternalExpenses] = useState<ExternalFixedExpense[]>([])
  const [manualExternalExpenses, setManualExternalExpenses] = useState<ExternalManualExpense[]>([])
  const [payrollWorkers, setPayrollWorkers] = useState<PayrollWorker[]>([])
  const [manualHolidays, setManualHolidays] = useState<Record<string, string>>({})
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [pdfProgress, setPdfProgress] = useState(0)
  const [pdfLabel, setPdfLabel] = useState('')
  const consolidatingOctoberIntoA = sede === 'donbalato-central' && selectedMonth === '2026-10'

  // 1. Cargar costos de catálogo (con caché de 1h del ERP)
  useEffect(() => {
    let cancelled = false
    async function loadCosts() {
      try {
        const prods = await fetchAllFirebaseErpProducts()
        if (cancelled) return
        const costsMap = new Map<string, number>()
        const flags = new Set<string>()

        prods.forEach((p) => {
          const sku = normalizeProfitSku(p.sku || p.$id)
          const costo = Number(p.costo_uni) || 0
          if (!sku) return
          costsMap.set(sku, Math.round(costo))
        })

        setCostsBD(costsMap)
        setMinus10Flags(flags)
      } catch (err) {
        console.error('Error cargando costos de productos:', err)
      }
    }
    loadCosts()
    return () => { cancelled = true }
  }, [])

  // 2. Cargar meses disponibles desde cuadraturas pre-agregadas
  useEffect(() => {
    let cancelled = false

    const loadAvailableMonths = async () => {
      setLoading(true)
      setError('')

      try {
        const cuadres = await fetchCuadresERP(24)
        const monthsSet = new Set<string>()

        cuadres.forEach((c) => {
          if (c.fecha && c.fecha.length >= 7) {
            monthsSet.add(c.fecha.slice(0, 7))
          }
        })

        // Asegurar que el mes actual siempre esté disponible
        const currentMonth = new Date().toISOString().slice(0, 7)
        monthsSet.add(currentMonth)

        if (requestedMonth) {
          monthsSet.add(requestedMonth)
        }

        const months = Array.from(monthsSet).filter(isValidMonthId).sort((a, b) => parseMonthValue(b) - parseMonthValue(a))
        if (cancelled) return

        setAvailableMonths(months)
        setSelectedMonth((prev) => {
          if (requestedMonth) return requestedMonth
          if (prev && months.includes(prev)) return prev
          return months[0] || currentMonth
        })
      } catch (err) {
        console.error('Error cargando meses del informe:', err)
        if (!cancelled) {
          setError('No se pudieron cargar los meses disponibles.')
          setLoading(false)
        }
      }
    }

    loadAvailableMonths()
    return () => { cancelled = true }
  }, [requestedMonth, sede])

  // Sincronizar URL cuando cambia selectedMonth o sede
  useEffect(() => {
    if (!selectedMonth) return
    const currentM = searchParams.get('month')
    const currentS = searchParams.get('sede')
    const consolidatingIntoA = selectedMonth === '2026-10' && sede === 'don-balato-b'
    const targetSede = consolidatingIntoA ? 'donbalato-central' : sede
    if (currentM === selectedMonth && currentS === targetSede) return

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('sede', targetSede)
    nextParams.set('month', selectedMonth)
    router.replace(`/erp-dashboard/informe-mensual?${nextParams.toString()}`)
  }, [selectedMonth, sede, router, searchParams])

  // 3. Cargar datos del mes seleccionado desde cuadres_erp
  useEffect(() => {
    if (!selectedMonth) return

    let cancelled = false

    const loadMonthlyData = async () => {
      setLoading(true)
      setError('')

      try {
        const cuadres = await fetchCuadresERP(24)
        const [year, month] = selectedMonth.split('-').map(Number)
        const monthStart = `${selectedMonth}-01`
        const monthEnd = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
        let jefaturaPurchases: GastoItem[] = []
        try {
          const purchasesSnapshot = await getDocs(query(
            collection(db, 'gastos_jefatura'),
            where('fecha', '>=', monthStart),
            where('fecha', '<=', monthEnd),
          ))
          jefaturaPurchases = purchasesSnapshot.docs
            .map((item) => ({ id: item.id, ...item.data() } as GastoItem))
            .filter((item) => {
              const purchaseSede = item.sede || DEFAULT_SEDE
              const includedSede = purchaseSede === sede || (consolidatingOctoberIntoA && purchaseSede === 'don-balato-b')
              return includedSede && esCompraMercaderia(item)
            })
        } catch (purchaseError) {
          console.warn('No se pudieron cargar compras de mercadería de jefatura:', purchaseError)
        }
        const dailyData: DayData[] = []

        const monthCuadres = cuadres.filter((c) => {
          const includedSede = !c.sede || c.sede === sede || (consolidatingOctoberIntoA && c.sede === 'don-balato-b')
          return includedSede && c.fecha && c.fecha.startsWith(selectedMonth)
        })

        monthCuadres.forEach((data) => {
          const dayParts = data.fecha.split('-')
          const dayNum = Number(dayParts[2]) || 1

          const montos = data.montos || ({} as any)
          const calculos = data.calculos || ({} as any)
          const gastosDetalle = Array.isArray(data.gastos) ? (data.gastos as GastoItem[]) : []
          const efectivoSistema = Number(montos.efectivoSistema || 0)
          const efectivoReal = Number(montos.efectivoReal || 0)
          const debitoSistema = Number(montos.debitoSistema || 0)
          const debitoReal = Number(montos.debitoReal || 0)
          const transferencias = Number(montos.transferencias || 0)
          const gastosTotalRegistrado = Number(calculos.gastosTotales || 0) || gastosDetalle.reduce((sum, g) => sum + (Number(g?.monto) || 0), 0)
          const gastosMercaderiaDetalle = sumarGastosMercaderia(gastosDetalle)
          const gastosMercaderia = gastosMercaderiaDetalle || Number(calculos.gastosMercaderia) || 0
          const gastos = Math.max(0, gastosTotalRegistrado - gastosMercaderia)
          const gastosQueAfectanGanancia = obtenerGastosQueAfectanGanancia(data)
          const totalBruto = Number(calculos.totalBruto || 0) || efectivoReal + debitoReal + transferencias
          const totalNeto = Number(calculos.totalNeto || 0) || totalBruto - gastosTotalRegistrado
          const cashierRows = Object.values(data.montosPorCajera || {}).filter((row) => Number(row?.totalBruto) > 0)
          const cashierDetailsReconcile = cashierRows.length > 0
            && Math.abs(cashierRows.reduce((sum, row) => sum + (Number(row.totalBruto) || 0), 0) - totalBruto) <= Math.max(100, totalBruto * 0.005)
            && cashierRows.every((row) => {
              const products = Array.isArray(row.topProducts) ? row.topProducts : []
              const cashierSales = products.reduce((sum, product) => sum + Math.max(0, Number(product.ventasBrutas) || 0), 0)
              const tolerance = Math.max(100, (Number(row.totalBruto) || 0) * 0.005)
              return products.length > 0 && Math.abs(cashierSales - (Number(row.totalBruto) || 0)) <= tolerance
            })
          const topProducts = cashierDetailsReconcile
            ? cashierRows.flatMap((row) => row.topProducts || []) as TopProduct[]
            : Array.isArray(data.topProducts) ? (data.topProducts as TopProduct[]) : []

          dailyData.push({
            dia: dayNum,
            fecha: data.fecha,
            totalBruto,
            costoProductos: Number(calculos.costoProductos || 0),
            gananciaBrutaCierre: Number(calculos.gananciaBruta || 0),
            totalNeto,
            gastosQueAfectanGanancia,
            efectivoSistema,
            efectivoReal,
            diferenciaEfectivo: efectivoReal - efectivoSistema,
            debitoSistema,
            debitoReal,
            diferenciaDebito: debitoReal - debitoSistema,
            transferencias,
            gastos,
            gastosMercaderia,
            diasConDatos: totalBruto > 0 ? 1 : 0,
            gastosDetalle,
            topProducts,
            analisisProductosRetailbase: data.analisisProductosRetailbase,
            costosProductosDisponibles: data.costosProductosDisponibles,
          })
        })

        dailyData.sort((a, b) => a.dia - b.dia)
        const combinedByDate = new Map<string, DayData>()
        dailyData.forEach((day) => {
          const previous = combinedByDate.get(day.fecha)
          if (!previous) {
            combinedByDate.set(day.fecha, day)
            return
          }

          const previousAnalysis = previous.analisisProductosRetailbase
          const currentAnalysis = day.analisisProductosRetailbase
          const combinedAnalysis = previousAnalysis && currentAnalysis
            ? {
                ...previousAnalysis,
                ventasBrutas: (Number(previousAnalysis.ventasBrutas) || 0) + (Number(currentAnalysis.ventasBrutas) || 0),
                costoProductos: (Number(previousAnalysis.costoProductos) || 0) + (Number(currentAnalysis.costoProductos) || 0),
                gananciaBruta: (Number(previousAnalysis.gananciaBruta) || 0) + (Number(currentAnalysis.gananciaBruta) || 0),
                unidades: (Number(previousAnalysis.unidades) || 0) + (Number(currentAnalysis.unidades) || 0),
                productosUnicos: (Number(previousAnalysis.productosUnicos) || 0) + (Number(currentAnalysis.productosUnicos) || 0),
                fuente: 'Análisis consolidado de Importadora Carlitos A y B',
                productosExcluidos: [...(previousAnalysis.productosExcluidos || []), ...(currentAnalysis.productosExcluidos || [])],
              }
            : undefined

          combinedByDate.set(day.fecha, {
            ...previous,
            totalBruto: previous.totalBruto + day.totalBruto,
            costoProductos: previous.costoProductos + day.costoProductos,
            gananciaBrutaCierre: previous.gananciaBrutaCierre + day.gananciaBrutaCierre,
            totalNeto: previous.totalNeto + day.totalNeto,
            efectivoSistema: previous.efectivoSistema + day.efectivoSistema,
            efectivoReal: previous.efectivoReal + day.efectivoReal,
            diferenciaEfectivo: previous.diferenciaEfectivo + day.diferenciaEfectivo,
            debitoSistema: previous.debitoSistema + day.debitoSistema,
            debitoReal: previous.debitoReal + day.debitoReal,
            diferenciaDebito: previous.diferenciaDebito + day.diferenciaDebito,
            transferencias: previous.transferencias + day.transferencias,
            gastos: previous.gastos + day.gastos,
            gastosMercaderia: previous.gastosMercaderia + day.gastosMercaderia,
            gastosQueAfectanGanancia: previous.gastosQueAfectanGanancia + day.gastosQueAfectanGanancia,
            diasConDatos: Math.max(previous.diasConDatos, day.diasConDatos),
            gastosDetalle: [...previous.gastosDetalle, ...day.gastosDetalle],
            topProducts: [...previous.topProducts, ...day.topProducts],
            analisisProductosRetailbase: combinedAnalysis,
            costosProductosDisponibles: previous.costosProductosDisponibles !== false && day.costosProductosDisponibles !== false,
          })
        })
        const consolidatedDailyData = Array.from(combinedByDate.values()).sort((a, b) => a.dia - b.dia)

        if (!cancelled) {
          setMonthData(consolidatedDailyData)
          setJefaturaMercaderia(jefaturaPurchases)
          setLoading(false)
        }
      } catch (err) {
        console.error('Error cargando datos del informe mensual:', err)
        if (!cancelled) {
          setError('No se pudieron cargar los datos del mes seleccionado.')
          setMonthData([])
          setJefaturaMercaderia([])
          setLoading(false)
        }
      }
    }

    loadMonthlyData()
    return () => { cancelled = true }
  }, [sede, selectedMonth])

  // 4. Cargar gastos externos (fijos y manuales)
  useEffect(() => {
    if (!db || !selectedMonth) {
      setFixedExternalExpenses([])
      setManualExternalExpenses([])
      return
    }

    let cancelled = false

    const loadExternalExpenses = async () => {
      try {
        const [fixed, manual, manualFromB] = await Promise.all([
          loadExternalExpensesConfig(db, sede),
          listExternalExpenseEntriesForMonth(db, sede, selectedMonth),
          consolidatingOctoberIntoA
            ? listExternalExpenseEntriesForMonth(db, 'don-balato-b', selectedMonth)
            : Promise.resolve([]),
        ])

        if (!cancelled) {
          setFixedExternalExpenses(fixed)
          setManualExternalExpenses([...manual, ...manualFromB])
        }
      } catch {
        if (!cancelled) {
          setFixedExternalExpenses([])
          setManualExternalExpenses([])
        }
      }
    }

    loadExternalExpenses()
    return () => { cancelled = true }
  }, [sede, selectedMonth])

  // 5. Cargar trabajadores para identificar adelantos ya registrados
  useEffect(() => {
    if (!selectedMonth) {
      setPayrollWorkers([])
      return
    }

    let cancelled = false

    const loadPayrollWorkers = async () => {
      try {
        const workers = await fetchTrabajadoresERP()
        const payroll: PayrollWorker[] = workers
          .filter((w) => w.activo && (w.sede === sede || !w.sede || (sede === 'donbalato-central' && selectedMonth === '2026-10' && w.sede === 'don-balato-b')))
          .map((w) => ({
            id: w.$id,
            nombre: String(w.nombre || w.$id),
            adelantos: w.adelantos || [],
          }))

        if (!cancelled) {
          setPayrollWorkers(payroll)
        }
      } catch {
        if (!cancelled) {
          setPayrollWorkers([])
        }
      }
    }

    loadPayrollWorkers()
    return () => { cancelled = true }
  }, [sede, selectedMonth])

  // 6. Cargar feriados configurados
  useEffect(() => {
    if (!db) {
      setManualHolidays({})
      return
    }

    let cancelled = false

    const loadManualHolidays = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'feriados'))
        const data = snap.exists() ? (snap.data() as { items?: Record<string, string> }) : null
        if (!cancelled) setManualHolidays(data?.items || {})
      } catch {
        if (!cancelled) setManualHolidays({})
      }
    }

    loadManualHolidays()
    return () => { cancelled = true }
  }, [])

  // ─── Derivaciones y cálculos de negocio ───────────────────────────────────

  const filteredChartData = useMemo(() => {
    return monthData.filter((day) => {
      if (dateRange === 's1') return day.dia >= 1 && day.dia <= 7
      if (dateRange === 's2') return day.dia >= 8 && day.dia <= 14
      if (dateRange === 's3') return day.dia >= 15 && day.dia <= 21
      if (dateRange === 's4') return day.dia >= 22
      return true
    })
  }, [monthData, dateRange])

  const visibleDates = useMemo(() => {
    if (!selectedMonth) return []
    return buildVisibleDateRange(selectedMonth, dateRange)
  }, [selectedMonth, dateRange])

  const visibleDateSet = useMemo(() => new Set(visibleDates), [visibleDates])

  const jefaturaMercaderiaVisible = useMemo(
    () => jefaturaMercaderia.filter((item) => item.fecha && visibleDateSet.has(item.fecha)),
    [jefaturaMercaderia, visibleDateSet],
  )

  const jefaturaMercaderiaByDate = useMemo(() => {
    return jefaturaMercaderiaVisible.reduce<Record<string, number>>((acc, item) => {
      const fecha = String(item.fecha || '')
      acc[fecha] = (acc[fecha] || 0) + (Number(item.monto) || 0)
      return acc
    }, {})
  }, [jefaturaMercaderiaVisible])

  const activePayrollWorkers = useMemo(() => {
    return payrollWorkers
  }, [payrollWorkers])

  const workingDatesMonth = useMemo(() => {
    if (!selectedMonth) return []
    const [year, month] = selectedMonth.split('-').map(Number)
    const monthLastDay = new Date(year, month, 0).getDate()
    const working: string[] = []
    for (let d = 1; d <= monthLastDay; d++) {
      const date = new Date(year, month - 1, d)
      if (isSunday(date)) continue
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const holiday = manualHolidays[ymd] || chileHolidayName(date, ymd)
      if (holiday) continue
      working.push(ymd)
    }
    return working
  }, [selectedMonth, manualHolidays])

  const payrollWorkerAdelantosVisible = useMemo(() => {
    return activePayrollWorkers.flatMap((worker) =>
      (worker.adelantos || [])
        .filter((adelanto) => !adelanto?.anulada && visibleDateSet.has(String(adelanto?.ymd || '')))
        .map((adelanto) => ({
          trabajador: worker.nombre,
          ymd: String(adelanto?.ymd || ''),
          monto: Number(adelanto?.monto) || 0,
          descripcion: adelanto?.descripcion || '',
        })),
    )
  }, [activePayrollWorkers, visibleDateSet])

  const payrollAdelantoKeys = useMemo(() => {
    return new Set(payrollWorkerAdelantosVisible.map((item) => `${item.ymd}|${Math.round(item.monto)}`))
  }, [payrollWorkerAdelantosVisible])

  const workingDates = useMemo(() => {
    if (!selectedMonth) return []
    const todayYmd = toYmdLocal(new Date())
    const visibleSet = new Set(visibleDates)
    return workingDatesMonth.filter((ymd) => visibleSet.has(ymd) && ymd <= todayYmd)
  }, [selectedMonth, visibleDates, workingDatesMonth])

  const externalExpenseBreakdown = useMemo(() => {
    if (!selectedMonth) {
      return {
        reportItems: [],
        dayAmountsByDate: {} as Record<string, number>,
        fixedVisibleTotal: 0,
        manualVisibleTotal: 0,
        totalVisible: 0,
      }
    }

    return buildExternalExpenseBreakdown(selectedMonth, visibleDates, fixedExternalExpenses, manualExternalExpenses, workingDatesMonth)
  }, [selectedMonth, visibleDates, fixedExternalExpenses, manualExternalExpenses, workingDatesMonth])

  const classifiedInternalExpenses = useMemo(() => {
    const payrollKeywords = [
      'adelanto',
      'anticipo',
      'sueldo',
      'salario',
      'nomina',
      'quincena',
      'liquidacion',
      'pago sueldo',
      'pago trabajador',
      'pago personal',
    ]

    return filteredChartData.flatMap((day) =>
      (day.gastosDetalle || []).map((gasto) => {
        const fecha = gasto.fecha || day.fecha
        const monto = Number(gasto.monto) || 0
        const descripcion = gasto.observacion || gasto.descripcion || gasto.concepto || ''
        const normalized = normalizeExpenseText(descripcion)
        const adelantoKey = `${fecha}|${Math.round(monto)}`
        const isPayrollExpense = payrollAdelantoKeys.has(adelantoKey) || payrollKeywords.some((keyword) => normalized.includes(keyword))

        const isMerchandisePurchase = esCompraMercaderia(gasto)

        return {
          ...gasto,
          dia: day.dia,
          fecha,
          monto,
          source: isPayrollExpense
            ? ('internal-payroll' as const)
            : isMerchandisePurchase
              ? ('inventory-reinvestment' as const)
              : ('internal-operational' as const),
        }
      }),
    )
  }, [filteredChartData, payrollAdelantoKeys])

  const payrollDetectedByDate = useMemo(() => {
    return classifiedInternalExpenses
      .filter((gasto) => gasto.source === 'internal-payroll')
      .reduce<Record<string, number>>((acc, gasto) => {
        acc[gasto.fecha] = (acc[gasto.fecha] || 0) + (Number(gasto.monto) || 0)
        return acc
      }, {})
  }, [classifiedInternalExpenses])

  const reportDays = useMemo(() => {
    const closeDates = new Set(filteredChartData.map((day) => day.fecha))
    const rows = filteredChartData.map((day) => {
      const gastosExternos = Number(externalExpenseBreakdown.dayAmountsByDate[day.fecha] || 0)
      const gastosNominaRegistrados = Number(payrollDetectedByDate[day.fecha] || 0)
      const gastosInternos = Math.max(0, Number(day.gastos || 0) - gastosNominaRegistrados)
      const gastosInternosGanancia = Math.max(0, Number(day.gastosQueAfectanGanancia || 0) - gastosNominaRegistrados)
      // La ficha del trabajador identifica adelantos; no crea sueldos como gasto.
      const gastosSueldos = gastosNominaRegistrados
      return {
        ...day,
        gastosInternos,
        gastosExternos,
        gastosSueldos,
        gastosMercaderia: day.gastosMercaderia + (jefaturaMercaderiaByDate[day.fecha] || 0),
        gastos: gastosInternos + gastosExternos + gastosSueldos,
        gastosQueAfectanGanancia: gastosInternosGanancia + gastosExternos + gastosSueldos,
        totalNeto: day.totalNeto - gastosExternos,
      }
    })

    const nonCloseExpenseDates = new Set([
      ...Object.keys(jefaturaMercaderiaByDate),
      ...visibleDates.filter((fecha) => Number(externalExpenseBreakdown.dayAmountsByDate[fecha] || 0) > 0),
    ])
    const daysWithoutClose = [...nonCloseExpenseDates]
      .filter((fecha) => !closeDates.has(fecha))
      .map((fecha) => {
        const gastosExternos = Number(externalExpenseBreakdown.dayAmountsByDate[fecha] || 0)
        const gastosMercaderia = Number(jefaturaMercaderiaByDate[fecha] || 0)
        return {
          dia: Number(fecha.slice(8, 10)) || 0,
          fecha,
          totalBruto: 0,
          costoProductos: 0,
          totalNeto: -gastosExternos,
          gastosQueAfectanGanancia: gastosExternos,
          efectivoSistema: 0,
          efectivoReal: 0,
          diferenciaEfectivo: 0,
          debitoSistema: 0,
          debitoReal: 0,
          diferenciaDebito: 0,
          transferencias: 0,
          gastos: gastosExternos,
          gastosMercaderia,
          diasConDatos: 0,
          gastosDetalle: [],
          topProducts: [],
          analisisProductosRetailbase: undefined,
          costosProductosDisponibles: true,
          gastosInternos: 0,
          gastosExternos,
          gastosSueldos: 0,
        }
      })

    return [...rows, ...daysWithoutClose].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [filteredChartData, externalExpenseBreakdown, payrollDetectedByDate, jefaturaMercaderiaByDate, visibleDates])

  const totals = useMemo<Totals>(() => {
    return reportDays.reduce<Totals>((acc, day) => ({
      totalBruto: acc.totalBruto + day.totalBruto,
      totalNeto: acc.totalNeto + day.totalNeto,
      efectivoSistema: acc.efectivoSistema + day.efectivoSistema,
      efectivoReal: acc.efectivoReal + day.efectivoReal,
      diferenciaEfectivo: acc.diferenciaEfectivo + day.diferenciaEfectivo,
      debitoSistema: acc.debitoSistema + day.debitoSistema,
      debitoReal: acc.debitoReal + day.debitoReal,
      diferenciaDebito: acc.diferenciaDebito + day.diferenciaDebito,
      transferencias: acc.transferencias + day.transferencias,
      gastos: acc.gastos + day.gastos,
      gastosMercaderia: acc.gastosMercaderia + day.gastosMercaderia,
      gastosQueAfectanGanancia: acc.gastosQueAfectanGanancia + day.gastosQueAfectanGanancia,
      diasConDatos: acc.diasConDatos + day.diasConDatos,
    }), EMPTY_TOTALS)
  }, [reportDays])

  const allTopProducts = useMemo(() => {
    return reportDays.flatMap((day) => day.topProducts || [])
  }, [reportDays])

  const profitSummary = useMemo(() => {
    return aggregateAndSummarizeTopProducts(allTopProducts, costsBD, minus10Flags)
  }, [allTopProducts, costsBD, minus10Flags])

  const productProfitReconciliation = useMemo(() => {
    const byDate: Record<string, { ventasBrutas: number; costoProductos: number; gananciaBruta: number; fuente: string }> = {}
    const pendingDays: Array<{
      fecha: string
      motivo: string
      ventasCierre: number
      ventasDetalle: number
      costoCierre: number
      costoDetalle: number
    }> = []
    const warnings: Array<{ fecha: string; motivo: string }> = []

    reportDays.filter((day) => day.totalBruto > 0).forEach((day) => {
      const analysis = day.analisisProductosRetailbase
      const analysisSales = Number(analysis?.ventasBrutas) || 0
      const analysisCost = Number(analysis?.costoProductos) || 0
      if (analysis && analysisSales > 0 && analysisCost >= 0) {
        const reportedProfit = Number(analysis.gananciaBruta)
        const calculatedProfit = analysisSales - analysisCost
        const salesTolerance = Math.max(100, day.totalBruto * 0.005)
        if (Math.abs(analysisSales - day.totalBruto) > salesTolerance) {
          warnings.push({
            fecha: day.fecha,
            motivo: `el análisis Retailbase difiere ${formatCurrency(Math.abs(analysisSales - day.totalBruto))} de las ventas del cierre; se mantiene el análisis guardado como fuente de productos`,
          })
        }
        if (Number.isFinite(reportedProfit) && Math.abs(reportedProfit - calculatedProfit) > 1) {
          warnings.push({
            fecha: day.fecha,
            motivo: `la ganancia guardada en Retailbase difiere ${formatCurrency(Math.abs(reportedProfit - calculatedProfit))} de ventas menos costo; se conserva la ganancia registrada`,
          })
        }
        byDate[day.fecha] = {
          ventasBrutas: analysisSales,
          costoProductos: analysisCost,
          gananciaBruta: Number.isFinite(reportedProfit) ? reportedProfit : calculatedProfit,
          fuente: analysis.fuente || 'Análisis de productos guardado',
        }
        return
      }

      const products = day.topProducts || []
      const detailSummary = aggregateAndSummarizeTopProducts(products, costsBD, minus10Flags)
      const sales = detailSummary.ventasBrutas
      const cost = detailSummary.costoTotal
      const salesTolerance = Math.max(100, day.totalBruto * 0.005)
      const costTolerance = Math.max(100, day.costoProductos * 0.005)
      const salesMatch = sales > 0 && Math.abs(sales - day.totalBruto) <= salesTolerance
      const costMatch = day.costoProductos > 0 && cost > 0 && Math.abs(cost - day.costoProductos) <= costTolerance
      const reasonParts: string[] = []

      if (!products.length) reasonParts.push('sin productos detallados ni análisis Retailbase')
      else {
        if (!salesMatch) reasonParts.push(`ventas del detalle difieren ${formatCurrency(Math.abs(sales - day.totalBruto))}`)
        if (!costMatch) reasonParts.push(`costos del detalle difieren ${formatCurrency(Math.abs(cost - day.costoProductos))}`)
      }
      if (day.costosProductosDisponibles === false) reasonParts.push('el cierre indica que faltan costos')

      if (products.length > 0 && day.costosProductosDisponibles !== false) {
        if (!salesMatch) warnings.push({ fecha: day.fecha, motivo: `el detalle diario de productos difiere ${formatCurrency(Math.abs(sales - day.totalBruto))} de las ventas del cierre; se conserva la ganancia del detalle guardado` })
        if (!costMatch) warnings.push({ fecha: day.fecha, motivo: `el costo ajustado del detalle diario difiere ${formatCurrency(Math.abs(cost - day.costoProductos))} del costo del cierre; se usa el costo unitario actual del catálogo` })
        byDate[day.fecha] = {
          ventasBrutas: sales,
          costoProductos: cost,
          gananciaBruta: detailSummary.gananciaTotal,
          fuente: 'Ganancia calculada con costo unitario actual del catálogo',
        }
        return
      }

      if (Number.isFinite(day.gananciaBrutaCierre) && day.costoProductos > 0 && day.costosProductosDisponibles !== false) {
        warnings.push({ fecha: day.fecha, motivo: 'no hay detalle diario de productos; se usa la ganancia bruta guardada en el cierre' })
        byDate[day.fecha] = {
          ventasBrutas: day.totalBruto,
          costoProductos: day.costoProductos,
          gananciaBruta: day.gananciaBrutaCierre,
          fuente: 'Ganancia bruta guardada en el cierre diario',
        }
        return
      }

      pendingDays.push({
        fecha: day.fecha,
        motivo: reasonParts.join('; ') || 'el sistema no tiene una ganancia diaria guardada ni un detalle con costo confiable',
        ventasCierre: day.totalBruto,
        ventasDetalle: sales,
        costoCierre: day.costoProductos,
        costoDetalle: cost,
      })
    })

    const confirmedDays = Object.values(byDate)
    return {
      byDate,
      pendingDays,
      warnings,
      diasConciliados: confirmedDays.length,
      ventasBrutas: confirmedDays.reduce((sum, day) => sum + day.ventasBrutas, 0),
      costoProductos: confirmedDays.reduce((sum, day) => sum + day.costoProductos, 0),
      gananciaBruta: confirmedDays.reduce((sum, day) => sum + day.gananciaBruta, 0),
    }
  }, [reportDays, costsBD, minus10Flags])

  const productProfitComplete = productProfitReconciliation.pendingDays.length === 0
  const selectedSalesDifference = Math.round(productProfitReconciliation.ventasBrutas - totals.totalBruto)
  const productProfitWarnings = [...productProfitReconciliation.warnings]
  if (Math.abs(selectedSalesDifference) > Math.max(100, totals.totalBruto * 0.005)) {
    productProfitWarnings.push({
      fecha: selectedMonth,
      motivo: `las ventas de las fuentes de productos difieren ${formatCurrency(Math.abs(selectedSalesDifference))} de la venta bruta de los cierres; revisar los análisis Retailbase señalados`,
    })
  }
  const resultHasUnresolvedIssues = !productProfitComplete || productProfitWarnings.length > 0

  const dailyProfitSeries = useMemo(() => {
    return reportDays.map((day) => {
      const dayProfit = productProfitReconciliation.byDate[day.fecha]
      const gastosDescontados = Number(day.gastosQueAfectanGanancia || 0)
      const resultadoFinal = dayProfit ? dayProfit.gananciaBruta - gastosDescontados : null
      const margenFinalPct = dayProfit?.ventasBrutas ? (Number(resultadoFinal || 0) / dayProfit.ventasBrutas) * 100 : 0
      return {
        ...day,
        ventasTop: dayProfit?.ventasBrutas ?? null,
        costoTop: dayProfit?.costoProductos ?? null,
        gananciaTop: dayProfit?.gananciaBruta ?? null,
        margenTopPct: dayProfit?.ventasBrutas ? (dayProfit.gananciaBruta / dayProfit.ventasBrutas) * 100 : null,
        gastosDescontados,
        resultadoFinal,
        margenFinalPct,
      }
    })
  }, [reportDays, productProfitReconciliation])

  const paymentTotal = totals.efectivoReal + totals.debitoReal + totals.transferencias

  const paymentMethodsData = useMemo(() => {
    return [
      { name: 'Efectivo', value: totals.efectivoReal, color: '#10b981' },
      { name: 'Débito', value: totals.debitoReal, color: '#3b82f6' },
      { name: 'Transferencia', value: totals.transferencias, color: '#8b5cf6' },
    ].filter((item) => item.value > 0)
  }, [totals])

  const allExpenses = useMemo(() => {
    const internalExpenses = classifiedInternalExpenses
      .filter((gasto) => gasto.source === 'internal-operational')
      .map((gasto) => ({
        ...gasto,
        source: 'internal' as const,
      }))

    const recordedPayrollExpenses = classifiedInternalExpenses
      .filter((gasto) => gasto.source === 'internal-payroll')
      .map((gasto) => ({
        ...gasto,
        categoria: gasto.categoria || 'Sueldos',
        tipo: gasto.tipo || 'Planilla registrada',
        source: 'internal-payroll' as const,
      }))

    const fixedExternalExpensesDaily = fixedExternalExpenses
      .filter((item) =>
        item.active &&
        Number(item.amount) > 0 &&
        (!item.startMonth || item.startMonth <= selectedMonth) &&
        (!item.endMonth || item.endMonth >= selectedMonth),
      )
      .flatMap((item) => {
        const perDay = Number(item.amount) / Math.max(1, workingDatesMonth.length)
        return workingDates.map((fecha) => ({
          observacion: item.name,
          descripcion: item.name,
          concepto: undefined,
          categoria: item.category,
          tipo: 'Gasto fijo externo',
          fecha,
          dia: Number(fecha.slice(8, 10)),
          monto: perDay,
          source: 'external-fixed' as const,
        }))
      })

    const manualExternalExpensesList = externalExpenseBreakdown.reportItems
      .filter((item) => item.source === 'manual')
      .map((gasto) => ({
        observacion: gasto.descripcion,
        descripcion: gasto.descripcion,
        concepto: undefined,
        categoria: gasto.categoria,
        tipo: gasto.tipo,
        fecha: gasto.fecha,
        dia: gasto.dia,
        monto: Number(gasto.monto) || 0,
        source: 'external-manual' as const,
      }))

    return [...internalExpenses, ...recordedPayrollExpenses, ...fixedExternalExpensesDaily, ...manualExternalExpensesList].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.dia - b.dia || Number(b.monto) - Number(a.monto),
    )
  }, [classifiedInternalExpenses, fixedExternalExpenses, externalExpenseBreakdown, workingDates, workingDatesMonth])

  const allMerchandisePurchases = useMemo(() => {
    const closePurchases = classifiedInternalExpenses
      .filter((gasto) => gasto.source === 'inventory-reinvestment')
      .map((gasto) => ({
        ...gasto,
        categoria: gasto.categoria || 'Reinversión en mercadería',
        tipoOriginal: gasto.tipo || gasto.tipoGasto || 'Gasto de mercadería',
        tipo: 'Compra de mercadería (anotación)',
        sourceLabel: 'Cierre diario',
        source: 'inventory-reinvestment' as const,
      }))
    const managerPurchases = jefaturaMercaderiaVisible.map((gasto) => ({
      ...gasto,
      fecha: String(gasto.fecha || ''),
      dia: Number(String(gasto.fecha || '').slice(8, 10)) || 0,
      categoria: gasto.categoria || 'Inventario / Mercadería',
      tipoOriginal: gasto.tipo || gasto.tipoGasto || 'Gasto de mercadería',
      tipo: 'Compra de mercadería (anotación)',
      sourceLabel: 'Jefatura',
      source: 'inventory-reinvestment' as const,
    }))
    return [...closePurchases, ...managerPurchases].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.dia - b.dia || Number(b.monto) - Number(a.monto),
    )
  }, [classifiedInternalExpenses, jefaturaMercaderiaVisible])

  const totalExpenses = useMemo(() => {
    return reportDays.reduce((sum, day) => sum + (Number(day.gastos) || 0), 0)
  }, [reportDays])

  const internalExpensesTotal = useMemo(() => {
    return reportDays.reduce((sum, day) => sum + Number(day.gastosInternos || 0), 0)
  }, [reportDays])

  const externalExpensesTotal = externalExpenseBreakdown.totalVisible
  const payrollExpensesTotal = useMemo(() => {
    return reportDays.reduce((sum, day) => sum + Number(day.gastosSueldos || 0), 0)
  }, [reportDays])

  const gastosAplicadosAlResultado = totals.gastosQueAfectanGanancia
  const finalResult = productProfitReconciliation.gananciaBruta - gastosAplicadosAlResultado
  const finalMarginPct = productProfitReconciliation.ventasBrutas > 0 ? (finalResult / productProfitReconciliation.ventasBrutas) * 100 : 0
  const finalResultTone: 'emerald' | 'red' = finalResult >= 0 ? 'emerald' : 'red'

  // ─── Exportación a Excel Profesional ───────────────────────────────────────

  const exportarInformeCompletoExcel = async () => {
    if (!reportDays.length) return

    const ExcelJS = await import('exceljs')
    const WorkbookClass = (ExcelJS as any).Workbook || (ExcelJS.default as any)?.Workbook
    const workbook = new WorkbookClass()
    const sedeName = isValidSede(sede) ? SEDES[sede] : sede || 'Sucursal'
    const periodLabel = selectedMonth ? formatMonth(selectedMonth) : 'Período'
    const rangeLabel = dateRange === 'full' ? 'Mes completo' : dateRange === 's1' ? 'Semana 1 (1-7)' : dateRange === 's2' ? 'Semana 2 (8-14)' : dateRange === 's3' ? 'Semana 3 (15-21)' : 'Semana 4 (22-fin)'
    const moneyFormat = '"$"#,##0;[Red]-"$"#,##0'
    const percentFormat = '0.0%'
    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    }
    const resultadoFinal = finalResult
    const resultadoFinalLabel = !productProfitComplete
      ? `RESULTADO PARCIAL · ${productProfitReconciliation.diasConciliados} DÍAS CON FUENTE`
      : productProfitWarnings.length
        ? 'RESULTADO CALCULADO · REVISAR FUENTES'
        : resultadoFinal >= 0 ? 'GANANCIA DEL PERÍODO' : 'PÉRDIDA DEL PERÍODO'
    const resultadoFinalFill = resultHasUnresolvedIssues ? 'FFB45309' : resultadoFinal >= 0 ? 'FF166534' : 'FFB91C1C'
    const resultadoFinalSoftFill = resultHasUnresolvedIssues ? 'FFFEF3C7' : resultadoFinal >= 0 ? 'FFDCFCE7' : 'FFFEE2E2'
    const resultadoFinalText = resultHasUnresolvedIssues ? 'FF92400E' : resultadoFinal >= 0 ? 'FF166534' : 'FF991B1B'
    const margenTopRatio = productProfitReconciliation.ventasBrutas > 0 ? productProfitReconciliation.gananciaBruta / productProfitReconciliation.ventasBrutas : 0
    const margenResultadoRatio = productProfitReconciliation.ventasBrutas > 0 ? resultadoFinal / productProfitReconciliation.ventasBrutas : 0

    const styleTitle = (sheet: any, cellRef: string, fill: string, fontSize: number) => {
      const cell = sheet.getCell(cellRef)
      cell.font = { bold: true, size: fontSize, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }

    const styleHeaderRow = (row: any, fill: string) => {
      row.height = 24
      row.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = thinBorder
      })
    }

    const styleBodyRows = (sheet: any, fromRow: number, toRow: number) => {
      for (let rowIndex = fromRow; rowIndex <= toRow; rowIndex += 1) {
        const row = sheet.getRow(rowIndex)
        row.eachCell((cell: any, colNumber: number) => {
          cell.border = thinBorder
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' }
          if (rowIndex % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
          }
        })
      }
    }

    const styleSectionTitle = (sheet: any, fromCol: string, toCol: string, rowNumber: number, title: string, fill: string) => {
      sheet.mergeCells(`${fromCol}${rowNumber}:${toCol}${rowNumber}`)
      const cell = sheet.getCell(`${fromCol}${rowNumber}`)
      cell.value = title
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    }

    const setRowValues = (sheet: any, rowNumber: number, values: Array<string | number>) => {
      values.forEach((value, index) => {
        sheet.getCell(rowNumber, index + 1).value = value
      })
    }

    const styleSummaryPair = (sheet: any, rowNumber: number, labelCol: string, valueCol: string) => {
      const labelCell = sheet.getCell(`${labelCol}${rowNumber}`)
      const valueCell = sheet.getCell(`${valueCol}${rowNumber}`)
      labelCell.font = { bold: true, color: { argb: 'FF0F172A' } }
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      labelCell.border = thinBorder
      labelCell.alignment = { horizontal: 'left', vertical: 'middle' }
      valueCell.border = thinBorder
      valueCell.alignment = { horizontal: 'center', vertical: 'middle' }
    }

    const styleValueBySign = (cell: any, value: number, isPercent = false) => {
      cell.numFmt = isPercent ? percentFormat : moneyFormat
      cell.font = {
        bold: true,
        color: { argb: value >= 0 ? 'FF166534' : 'FFB91C1C' },
      }
    }

    workbook.creator = 'Importadora Carlitos'
    workbook.created = new Date()
    workbook.modified = new Date()

    // ─── Hoja 1: Resumen Ejecutivo ──────────────────────────────────────────
    const resumenSheet = workbook.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
    resumenSheet.columns = [{ width: 24 }, { width: 18 }, { width: 24 }, { width: 18 }, { width: 24 }, { width: 18 }]
    resumenSheet.mergeCells('A1:F1')
    resumenSheet.mergeCells('A2:F2')
    resumenSheet.getCell('A1').value = `INFORME MENSUAL · ${sedeName.toUpperCase()}`
    resumenSheet.getCell('A2').value = `${periodLabel} · ${rangeLabel}${consolidatingOctoberIntoA ? ' · Consolidado en Importadora Carlitos A' : ''}`
    styleTitle(resumenSheet, 'A1', 'FF0F172A', 18)
    styleTitle(resumenSheet, 'A2', 'FF2563EB', 11)
    resumenSheet.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }

    resumenSheet.mergeCells('A4:F4')
    resumenSheet.getCell('A4').value = resultadoFinalLabel
    resumenSheet.getCell('A4').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    resumenSheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: resultadoFinalFill } }
    resumenSheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' }
    resumenSheet.getCell('A4').border = thinBorder
    resumenSheet.getRow(4).height = 24

    resumenSheet.mergeCells('A5:F6')
    resumenSheet.getCell('A5').value = resultadoFinal
    resumenSheet.getCell('A5').numFmt = moneyFormat
    resumenSheet.getCell('A5').font = { bold: true, size: 24, color: { argb: resultadoFinalText } }
    resumenSheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: resultadoFinalSoftFill } }
    resumenSheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' }
    resumenSheet.getCell('A5').border = thinBorder
    resumenSheet.getRow(5).height = 30
    resumenSheet.getRow(6).height = 30

    resumenSheet.mergeCells('A7:F7')
    resumenSheet.getCell('A7').value = consolidatingOctoberIntoA
      ? 'Este informe reúne en Importadora Carlitos A las ventas, costos, ganancias y gastos diarios registrados en A y B durante octubre. Las compras de mercadería siguen anotadas aparte.'
      : 'La ganancia bruta muestra lo que dejan los productos después de su costo. La ganancia final resta los gastos. Las compras de mercadería se anotan aparte. El detalle indica si falta algún costo por confirmar.'
    resumenSheet.getCell('A7').font = { italic: true, color: { argb: 'FF475569' } }
    resumenSheet.getCell('A7').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    resumenSheet.getRow(7).height = 30
    resumenSheet.getCell('A7').border = thinBorder

    styleSectionTitle(resumenSheet, 'A', 'F', 9, 'RESUMEN DEL MES', 'FF1D4ED8')
    setRowValues(resumenSheet, 10, ['Indicador', 'Valor', 'Indicador', 'Valor', 'Indicador', 'Valor'])
    styleHeaderRow(resumenSheet.getRow(10), 'FF0F766E')
    setRowValues(resumenSheet, 11, ['Ventas en cierres', totals.totalBruto, 'Costo productos vendidos', productProfitReconciliation.costoProductos, 'Ganancia bruta', productProfitReconciliation.gananciaBruta])
    setRowValues(resumenSheet, 12, ['Ventas según detalle', productProfitReconciliation.ventasBrutas, 'Diferencia con cierres', Math.abs(selectedSalesDifference), 'Días con costo revisado', productProfitReconciliation.diasConciliados])
    setRowValues(resumenSheet, 13, ['Gastos internos', internalExpensesTotal, 'Sueldos en cierres', payrollExpensesTotal, 'Gastos fijos y externos', externalExpensesTotal])
    setRowValues(resumenSheet, 14, ['Total gastos descontados', gastosAplicadosAlResultado, 'Ganancia final', resultadoFinal, 'Mercadería anotada aparte', totals.gastosMercaderia])
    for (let rowIndex = 11; rowIndex <= 14; rowIndex += 1) {
      styleSummaryPair(resumenSheet, rowIndex, 'A', 'B')
      styleSummaryPair(resumenSheet, rowIndex, 'C', 'D')
      styleSummaryPair(resumenSheet, rowIndex, 'E', 'F')
    }
    ;['B11', 'D11', 'F11', 'B12', 'D12', 'B13', 'D13', 'F13', 'B14', 'D14', 'F14'].forEach((cellRef) => {
      resumenSheet.getCell(cellRef).numFmt = moneyFormat
      resumenSheet.getCell(cellRef).font = { bold: true, color: { argb: 'FF0F172A' } }
    })
    resumenSheet.getCell('F12').numFmt = '#,##0'
    styleValueBySign(resumenSheet.getCell('D14'), resultadoFinal)

    styleSectionTitle(resumenSheet, 'A', 'F', 16, 'LECTURA DEL RESULTADO', 'FF7C3AED')
    ;[
      `Ventas de productos: ${formatCurrency(productProfitReconciliation.ventasBrutas)}. Costo de esos productos: ${formatCurrency(productProfitReconciliation.costoProductos)}. Ganancia bruta: ${formatCurrency(productProfitReconciliation.gananciaBruta)}.`,
      `Los gastos descontados fueron ${formatCurrency(totals.gastosQueAfectanGanancia)}. Después de esos gastos, la ganancia final es ${formatCurrency(resultadoFinal)}.`,
      !productProfitComplete
        ? `El costo está confirmado en ${productProfitReconciliation.diasConciliados} de ${totals.diasConDatos} días con datos. Falta revisar: ${productProfitReconciliation.pendingDays.map((day) => day.fecha).join(', ')}.`
        : `El costo está confirmado en los ${productProfitReconciliation.diasConciliados} días conciliados.`,
      productProfitWarnings.length
        ? `Hay ${productProfitWarnings.length} diferencias entre el detalle de productos y los cierres. La diferencia de ventas es ${formatCurrency(Math.abs(selectedSalesDifference))}. Revisar los días indicados en el detalle diario.`
        : 'Las ventas de productos y los cierres no muestran diferencias relevantes.',
      `Las compras de mercadería suman ${formatCurrency(totals.gastosMercaderia)}. Se muestran aparte y no se descuentan como gasto.`,
    ].forEach((message, index) => {
      const rowNumber = 17 + index
      resumenSheet.mergeCells(`A${rowNumber}:F${rowNumber}`)
      const cell = resumenSheet.getCell(`A${rowNumber}`)
      cell.value = message
      cell.font = { size: 10, color: { argb: 'FF334155' } }
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      resumenSheet.getRow(rowNumber).height = 36
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } }
    })

    styleSectionTitle(resumenSheet, 'A', 'F', 22, 'COMPOSICIÓN DE INGRESOS', 'FFEA580C')
    setRowValues(resumenSheet, 23, ['Canal', 'Monto', '% venta', 'Canal', 'Monto', '% venta'])
    styleHeaderRow(resumenSheet.getRow(23), 'FFEA580C')
    setRowValues(resumenSheet, 24, ['Efectivo real', totals.efectivoReal, totals.totalBruto > 0 ? totals.efectivoReal / totals.totalBruto : 0, 'Débito real', totals.debitoReal, totals.totalBruto > 0 ? totals.debitoReal / totals.totalBruto : 0])
    setRowValues(resumenSheet, 25, ['Transferencias', totals.transferencias, totals.totalBruto > 0 ? totals.transferencias / totals.totalBruto : 0, 'Venta bruta total', totals.totalBruto, totals.totalBruto > 0 ? 1 : 0])
    for (let rowIndex = 24; rowIndex <= 25; rowIndex += 1) {
      ;['A', 'D'].forEach((column) => {
        const cell = resumenSheet.getCell(`${column}${rowIndex}`)
        cell.font = { bold: true, color: { argb: 'FF0F172A' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        cell.border = thinBorder
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
      })
      ;['B', 'C', 'E', 'F'].forEach((column) => {
        const cell = resumenSheet.getCell(`${column}${rowIndex}`)
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
    }
    ;['B24', 'D24', 'B25', 'D25'].forEach((cellRef) => {
      resumenSheet.getCell(cellRef.replace('D', 'E')).numFmt = moneyFormat
    })
    ;['B24', 'E24', 'B25', 'E25'].forEach((cellRef) => {
      resumenSheet.getCell(cellRef).numFmt = moneyFormat
      resumenSheet.getCell(cellRef).font = { bold: true, color: { argb: 'FF0F172A' } }
    })
    ;['C24', 'F24', 'C25', 'F25'].forEach((cellRef) => {
      resumenSheet.getCell(cellRef).numFmt = percentFormat
      resumenSheet.getCell(cellRef).font = { bold: true, color: { argb: 'FF0F172A' } }
    })

    // ─── Hoja 2: Resultado Diario ─────────────────────────────────────────────
    const detalleSheet = workbook.addWorksheet('Detalle diario', { views: [{ state: 'frozen', ySplit: 1 }] })
    detalleSheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Día', key: 'dia', width: 8 },
      { header: 'Ventas registradas en cierres', key: 'totalBruto', width: 24 },
      { header: 'Ventas según detalle de productos', key: 'ventasTop', width: 28 },
      { header: 'Costo de productos vendidos', key: 'costoTop', width: 24 },
      { header: 'Ganancia bruta de productos', key: 'gananciaTop', width: 25 },
      { header: 'Gastos operativos internos', key: 'gastosInternos', width: 23 },
      { header: 'Sueldos anotados en cierres', key: 'gastosSueldos', width: 24 },
      { header: 'Gastos fijos y externos', key: 'gastosExternos', width: 22 },
      { header: 'Compras de mercadería (aparte)', key: 'gastosMercaderia', width: 27 },
      { header: 'Gastos descontados', key: 'gastosDescontados', width: 22 },
      { header: 'Ganancia final del día', key: 'resultadoFinalDia', width: 22 },
      { header: 'Estado', key: 'estadoResultado', width: 14 },
      { header: 'Margen final', key: 'margenResultadoDia', width: 14 },
      { header: 'Dif. Efectivo', key: 'diferenciaEfectivo', width: 16 },
      { header: 'Dif. Débito', key: 'diferenciaDebito', width: 16 },
    ]
    styleHeaderRow(detalleSheet.getRow(1), 'FF2563EB')
    const detalleRows = dailyProfitSeries.map((day) => {
      const resultadoFinalDia = day.resultadoFinal
      const margenResultadoDia = Number(day.ventasTop || 0) > 0 && resultadoFinalDia != null ? resultadoFinalDia / Number(day.ventasTop) : 0
      return {
        ...day,
        resultadoFinalDia,
        estadoResultado: resultadoFinalDia == null ? 'Costo pendiente' : resultadoFinalDia >= 0 ? 'Ganancia' : 'Pérdida',
        margenResultadoDia,
      }
    })
    detalleRows.forEach((row) => {
      detalleSheet.addRow(row)
    })
    const totalDetalleRow = detalleSheet.addRow({
      fecha: 'TOTAL PERÍODO',
      totalBruto: totals.totalBruto,
      ventasTop: productProfitReconciliation.ventasBrutas,
      costoTop: productProfitReconciliation.costoProductos,
      gananciaTop: productProfitReconciliation.gananciaBruta,
      gastosInternos: internalExpensesTotal,
      gastosSueldos: payrollExpensesTotal,
      gastosExternos: externalExpensesTotal,
      gastosMercaderia: totals.gastosMercaderia,
      gastosDescontados: gastosAplicadosAlResultado,
      resultadoFinalDia: resultadoFinal,
      estadoResultado: !productProfitComplete
        ? `Parcial · ${productProfitReconciliation.diasConciliados} días`
        : productProfitWarnings.length ? 'Revisar diferencias' : resultadoFinal >= 0 ? 'Ganancia' : 'Pérdida',
      margenResultadoDia: margenResultadoRatio,
      diferenciaEfectivo: totals.diferenciaEfectivo,
      diferenciaDebito: totals.diferenciaDebito,
    })
    styleBodyRows(detalleSheet, 2, detalleSheet.rowCount)
    detalleSheet.autoFilter = 'A1:P1'
    ;['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'O', 'P'].forEach((column) => {
      detalleSheet.getColumn(column).numFmt = moneyFormat
    })
    detalleSheet.getColumn('N').numFmt = percentFormat
    detalleRows.forEach((row, index) => {
      const sheetRow = detalleSheet.getRow(index + 2)
      const resultCell = sheetRow.getCell(12)
      const stateCell = sheetRow.getCell(13)
      const marginCell = sheetRow.getCell(14)
      const resultIsPending = row.resultadoFinalDia == null
      const resultValue = row.resultadoFinalDia ?? 0
      resultCell.font = { bold: true, color: { argb: resultIsPending ? 'FF92400E' : resultValue >= 0 ? 'FF166534' : 'FFB91C1C' } }
      resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: resultIsPending ? 'FFFEF3C7' : resultValue >= 0 ? 'FFDCFCE7' : 'FFFEE2E2' } }
      stateCell.font = { bold: true, color: { argb: resultIsPending ? 'FF92400E' : resultValue >= 0 ? 'FF166534' : 'FFB91C1C' } }
      stateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: resultIsPending ? 'FFFEF3C7' : resultValue >= 0 ? 'FFDCFCE7' : 'FFFEE2E2' } }
      marginCell.font = { bold: true, color: { argb: row.margenResultadoDia >= 0 ? 'FF166534' : 'FFB91C1C' } }
    })
    totalDetalleRow.eachCell((cell: any) => {
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    totalDetalleRow.getCell(12).font = { bold: true, color: { argb: resultHasUnresolvedIssues ? 'FFFCD34D' : resultadoFinal >= 0 ? 'FF86EFAC' : 'FFFCA5A5' } }
    totalDetalleRow.getCell(14).numFmt = percentFormat

    // ─── Hoja 3: Métodos de Pago ──────────────────────────────────────────────
    const pagosSheet = workbook.addWorksheet('Métodos de pago', { views: [{ state: 'frozen', ySplit: 1 }] })
    pagosSheet.columns = [
      { header: 'Método', key: 'metodo', width: 24 },
      { header: 'Monto', key: 'monto', width: 18 },
      { header: '% sobre venta', key: 'participacion', width: 16 },
      { header: 'Lectura', key: 'lectura', width: 42 },
    ]
    styleHeaderRow(pagosSheet.getRow(1), 'FF0F766E')
    ;[
      {
        metodo: 'Efectivo real',
        monto: totals.efectivoReal,
        participacion: totals.totalBruto > 0 ? totals.efectivoReal / totals.totalBruto : 0,
        lectura: 'Ingreso recibido por caja en efectivo.',
      },
      {
        metodo: 'Débito real',
        monto: totals.debitoReal,
        participacion: totals.totalBruto > 0 ? totals.debitoReal / totals.totalBruto : 0,
        lectura: 'Pago con tarjeta registrado en el período.',
      },
      {
        metodo: 'Transferencias',
        monto: totals.transferencias,
        participacion: totals.totalBruto > 0 ? totals.transferencias / totals.totalBruto : 0,
        lectura: 'Pagos por transferencia incluidos en el informe.',
      },
      {
        metodo: 'Total venta bruta',
        monto: totals.totalBruto,
        participacion: totals.totalBruto > 0 ? 1 : 0,
        lectura: 'Total consolidado de ingresos del período.',
      },
    ].forEach((item) => pagosSheet.addRow(item))
    styleBodyRows(pagosSheet, 2, pagosSheet.rowCount)
    pagosSheet.autoFilter = 'A1:D1'
    pagosSheet.getColumn('B').numFmt = moneyFormat
    pagosSheet.getColumn('C').numFmt = percentFormat

    // ─── Hoja 4: Gastos del Período ───────────────────────────────────────────
    const gastosSheet = workbook.addWorksheet('Gastos', { views: [{ state: 'frozen', ySplit: 4 }] })
    gastosSheet.columns = [
      { header: 'Fecha / período', key: 'fecha', width: 18 },
      { header: 'Día', key: 'dia', width: 8 },
      { header: 'Origen', key: 'origen', width: 30 },
      { header: 'Tipo', key: 'tipo', width: 20 },
      { header: 'Categoría', key: 'categoria', width: 24 },
      { header: 'Descripción', key: 'descripcion', width: 50 },
      { header: 'Monto', key: 'monto', width: 16 },
    ]
    gastosSheet.mergeCells('A1:G1')
    gastosSheet.getCell('A1').value = 'GASTOS DEL MES'
    gastosSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    gastosSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } }
    gastosSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    gastosSheet.mergeCells('A2:G2')
    gastosSheet.getCell('A2').value = 'Incluye gastos operacionales registrados. Las compras de mercadería están en una hoja aparte y no cuentan como gasto.'
    gastosSheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }
    gastosSheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
    gastosSheet.mergeCells('A3:G3')
    gastosSheet.getCell('A3').value = `Total de gastos descontados (sin compras de mercadería): ${formatCurrency(totals.gastosQueAfectanGanancia)}`
    gastosSheet.getCell('A3').font = { bold: true, size: 11, color: { argb: 'FF991B1B' } }
    gastosSheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' }
    setRowValues(gastosSheet, 4, ['Fecha / período', 'Día', 'Origen', 'Tipo', 'Categoría', 'Descripción', 'Monto'])
    styleHeaderRow(gastosSheet.getRow(4), 'FFEF4444')
    const gastosFijosAgrupados = new Map<string, { gasto: any; monto: number }>()
    allExpenses.filter((gasto) => gasto.source === 'external-fixed').forEach((gasto) => {
      const descripcion = gasto.observacion || gasto.descripcion || gasto.concepto || 'Gasto fijo mensual'
      const key = `${gasto.categoria || ''}|${descripcion}`
      const current = gastosFijosAgrupados.get(key)
      gastosFijosAgrupados.set(key, {
        gasto: current?.gasto || gasto,
        monto: (current?.monto || 0) + (Number(gasto.monto) || 0),
      })
    })
    const gastosParaExcel = [
      ...Array.from(gastosFijosAgrupados.values(), ({ gasto, monto }) => ({
        ...gasto,
        fecha: dateRange === 'full' ? 'Mes completo' : rangeLabel,
        dia: undefined,
        tipo: 'Gasto fijo mensual',
        monto,
      })),
      ...allExpenses.filter((gasto) => gasto.source !== 'external-fixed'),
    ]
    gastosParaExcel.forEach((gasto) => {
      const desc = normalizeExpenseText(gasto.observacion || gasto.descripcion || gasto.concepto || '')
      const autoTipo = gasto.tipo || (gasto.source === 'internal-payroll' ? 'Planilla registrada' : gasto.source === 'internal' ? 'Gasto operacional' : 'Sin tipo')
      const autoCategoria = gasto.categoria || (
        desc.includes('proveedor') ? 'Proveedores'
        : desc.includes('delivery') || desc.includes('despacho') || desc.includes('envio') ? 'Despachos'
        : desc.includes('limpieza') || desc.includes('aseo') ? 'Limpieza'
        : desc.includes('comida') || desc.includes('almuerzo') || desc.includes('colacion') ? 'Alimentación'
        : gasto.source === 'internal-payroll' ? 'Sueldos'
        : gasto.source === 'internal' ? 'Gasto operacional'
        : 'Sin categoría'
      )
      gastosSheet.addRow({
        fecha: gasto.fecha,
        dia: gasto.dia,
        origen:
          gasto.source === 'external-fixed'
            ? 'Gasto fijo mensual'
            : gasto.source === 'external-manual'
              ? 'Gasto manual externo'
              : gasto.source === 'internal-payroll'
                ? 'Sueldo registrado en cuadre'
              : 'Gasto registrado en cuadre',
        tipo: autoTipo,
        categoria: autoCategoria,
        descripcion: gasto.observacion || gasto.descripcion || gasto.concepto || 'Gasto sin descripción',
        monto: Number(gasto.monto) || 0,
      })
    })
    styleBodyRows(gastosSheet, 5, gastosSheet.rowCount)
    gastosSheet.autoFilter = 'A4:G4'
    gastosSheet.getColumn('G').numFmt = moneyFormat

    // ─── Hoja 5: Compras de mercadería (anotación, no gasto) ──────────────────
    const mercaderiaSheet = workbook.addWorksheet('Mercadería aparte', { views: [{ state: 'frozen', ySplit: 4 }] })
    mercaderiaSheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Día', key: 'dia', width: 8 },
      { header: 'Origen', key: 'origen', width: 18 },
      { header: 'Descripción', key: 'descripcion', width: 48 },
      { header: 'Rubro', key: 'rubro', width: 22 },
      { header: 'Proveedor', key: 'proveedor', width: 24 },
      { header: 'Tipo original', key: 'tipo', width: 24 },
      { header: 'Categoría original', key: 'categoria', width: 26 },
      { header: 'Monto anotado', key: 'monto', width: 18 },
    ]
    mercaderiaSheet.mergeCells('A1:I1')
    mercaderiaSheet.getCell('A1').value = 'COMPRAS DE MERCADERÍA · REINVERSIÓN ANOTADA'
    mercaderiaSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    mercaderiaSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
    mercaderiaSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    mercaderiaSheet.mergeCells('A2:I2')
    mercaderiaSheet.getCell('A2').value = 'Se conserva como anotación de reinversión: no se suma a gastos ni se descuenta de la ganancia.'
    mercaderiaSheet.getCell('A2').font = { italic: true, color: { argb: 'FF155E75' } }
    mercaderiaSheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
    mercaderiaSheet.mergeCells('A3:I3')
    mercaderiaSheet.getCell('A3').value = `Total compras anotadas: ${formatCurrency(totals.gastosMercaderia)}`
    mercaderiaSheet.getCell('A3').font = { bold: true, size: 11, color: { argb: 'FF155E75' } }
    mercaderiaSheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' }
    setRowValues(mercaderiaSheet, 4, ['Fecha', 'Día', 'Origen', 'Descripción', 'Rubro', 'Proveedor', 'Tipo original', 'Categoría original', 'Monto anotado'])
    styleHeaderRow(mercaderiaSheet.getRow(4), 'FF0891B2')
    allMerchandisePurchases.forEach((compra) => {
      mercaderiaSheet.addRow({
        fecha: compra.fecha,
        dia: compra.dia,
        origen: compra.sourceLabel,
        descripcion: compra.observacion || compra.descripcion || compra.concepto || 'Compra de mercadería',
        rubro: compra.rubroMercaderia || '',
        proveedor: compra.proveedor || '',
        tipo: compra.tipoOriginal,
        categoria: compra.categoria,
        monto: Number(compra.monto) || 0,
      })
    })
    const totalMercaderiaRow = mercaderiaSheet.addRow({ descripcion: 'TOTAL ANOTADO', monto: totals.gastosMercaderia })
    styleBodyRows(mercaderiaSheet, 5, mercaderiaSheet.rowCount)
    mercaderiaSheet.autoFilter = 'A4:I4'
    mercaderiaSheet.getColumn('I').numFmt = moneyFormat
    totalMercaderiaRow.eachCell((cell: any) => {
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    })

    // ─── Hoja 6: Ganancia por Productos ──────────────────────────────────────
    const productosSheet = workbook.addWorksheet('Detalle por producto', { views: [{ state: 'frozen', ySplit: 4 }] })
    productosSheet.columns = [
      { header: '#', key: 'ranking', width: 8 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Producto', key: 'nombre', width: 42 },
      { header: 'Cantidad', key: 'cantidadVendida', width: 12 },
      { header: 'Ventas', key: 'ventasBrutas', width: 16 },
      { header: 'Costo de productos', key: 'costoAjustado', width: 20 },
      { header: 'Ganancia bruta', key: 'ganancia', width: 18 },
      { header: 'Margen', key: 'margenPct', width: 12 },
      { header: '% de ventas', key: 'shareVentas', width: 12 },
      { header: '% de ganancia', key: 'shareGanancia', width: 14 },
      { header: 'Rebaja 10% aplicada', key: 'adjustedByMinus10', width: 21 },
    ]
    productosSheet.mergeCells('A1:K1')
    productosSheet.getCell('A1').value = 'VENTAS, COSTO Y GANANCIA POR PRODUCTO'
    productosSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    productosSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } }
    productosSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    productosSheet.mergeCells('A2:K2')
    productosSheet.getCell('A2').value = `${productProfitComplete ? 'Ganancia bruta del período' : 'Ganancia bruta parcial'}: ${formatCurrency(productProfitReconciliation.gananciaBruta)}`
    productosSheet.getCell('A2').font = { bold: true, color: { argb: 'FF92400E' } }
    productosSheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
    productosSheet.mergeCells('A3:K3')
    productosSheet.getCell('A3').value = `Margen global de productos: ${(margenTopRatio * 100).toFixed(1)}%`
    productosSheet.getCell('A3').font = { italic: true, color: { argb: 'FF475569' } }
    productosSheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' }
    setRowValues(productosSheet, 4, ['#', 'SKU', 'Producto', 'Cantidad', 'Ventas', 'Costo productos', 'Ganancia bruta', 'Margen', '% de ventas', '% de ganancia', 'Rebaja 10% aplicada'])
    styleHeaderRow(productosSheet.getRow(4), 'FFF59E0B')
    const productoRows = profitSummary.rows.map((row, index) => ({
      ranking: index + 1,
      sku: row.sku,
      nombre: row.nombre,
      cantidadVendida: row.cantidadVendida,
      ventasBrutas: row.ventasBrutas,
      costoAjustado: row.costoAjustado,
      ganancia: row.ganancia,
      margenPct: row.margenPct / 100,
      shareVentas: profitSummary.ventasBrutas > 0 ? row.ventasBrutas / profitSummary.ventasBrutas : 0,
      shareGanancia: profitSummary.gananciaTotal !== 0 ? row.ganancia / profitSummary.gananciaTotal : 0,
      adjustedByMinus10: row.adjustedByMinus10 ? 'Sí' : 'No',
    }))
    productoRows.forEach((row) => {
      productosSheet.addRow(row)
    })
    styleBodyRows(productosSheet, 5, productosSheet.rowCount)
    productosSheet.autoFilter = 'A4:K4'
    ;['E', 'F', 'G'].forEach((column) => {
      productosSheet.getColumn(column).numFmt = moneyFormat
    })
    ;['H', 'I', 'J'].forEach((column) => {
      productosSheet.getColumn(column).numFmt = percentFormat
    })
    productoRows.forEach((row, index) => {
      const sheetRow = productosSheet.getRow(index + 5)
      sheetRow.getCell(7).font = { bold: true, color: { argb: row.ganancia >= 0 ? 'FF166534' : 'FFB91C1C' } }
      sheetRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.ganancia >= 0 ? 'FFDCFCE7' : 'FFFEE2E2' } }
      sheetRow.getCell(8).font = { bold: true, color: { argb: row.margenPct >= 0 ? 'FF166534' : 'FFB91C1C' } }
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    saveAs(blob, `informe-mensual-${sede || 'donbalato'}-${selectedMonth}.xlsx`)
  }

  // ─── Generación de PDF Ejecutivo ──────────────────────────────────────────

  const generarInformePdf = async () => {
    if (!reportDays.length || pdfGenerating) return
    setPdfGenerating(true)
    setPdfProgress(0)
    setPdfLabel('Iniciando...')
    try {
      const pdfData: PdfReportData = {
        sedeName: isValidSede(sede) ? SEDES[sede] : sede || 'Importadora Carlitos A',
        sedeSlug: sede || 'donbalato-central',
        selectedMonth,
        dateRange,
        reportDays: reportDays.map((d) => ({
          dia: d.dia,
          fecha: d.fecha,
          totalBruto: d.totalBruto,
          totalNeto: d.totalNeto,
          efectivoReal: d.efectivoReal,
          debitoReal: d.debitoReal,
          transferencias: d.transferencias,
          gastos: d.gastos,
          gastosInternos: (d as any).gastosInternos,
          gastosExternos: (d as any).gastosExternos,
          gastosSueldos: (d as any).gastosSueldos,
          gastosMercaderia: d.gastosMercaderia,
        })),
        totals,
        profitSummary: {
          gananciaTotal: productProfitReconciliation.gananciaBruta,
          ventasBrutas: productProfitReconciliation.ventasBrutas,
          costoTotal: productProfitReconciliation.costoProductos,
          margenPct: productProfitReconciliation.ventasBrutas > 0 ? (productProfitReconciliation.gananciaBruta / productProfitReconciliation.ventasBrutas) * 100 : 0,
          rows: profitSummary.rows.map((r) => ({
            sku: r.sku,
            nombre: r.nombre,
            cantidadVendida: r.cantidadVendida,
            ventasBrutas: r.ventasBrutas,
            costoAjustado: r.costoAjustado,
            ganancia: r.ganancia,
            margenPct: r.margenPct,
          })),
        },
        paymentMethodsData,
        internalExpensesTotal,
        externalExpensesTotal,
        payrollExpensesTotal,
        merchandisePurchasesTotal: totals.gastosMercaderia,
        finalResult,
        finalMarginPct,
        productProfitStatus: {
          confirmedDays: productProfitReconciliation.diasConciliados,
          totalDays: totals.diasConDatos,
          sales: productProfitReconciliation.ventasBrutas,
          cost: productProfitReconciliation.costoProductos,
          grossProfit: productProfitReconciliation.gananciaBruta,
          pendingDays: productProfitReconciliation.pendingDays.map(({ fecha, motivo }) => ({ fecha, motivo })),
          warnings: productProfitWarnings,
        },
        allExpenses: allExpenses.map((e) => ({
          fecha: e.fecha,
          descripcion: e.descripcion,
          observacion: e.observacion,
          concepto: e.concepto,
          monto: e.monto,
          source: e.source,
        })),
        merchandisePurchases: allMerchandisePurchases.map((purchase) => ({
          fecha: purchase.fecha,
          descripcion: [
            purchase.sourceLabel,
            purchase.rubroMercaderia,
            purchase.proveedor,
            purchase.observacion || purchase.descripcion || purchase.concepto,
          ].filter(Boolean).join(' · '),
          monto: Number(purchase.monto) || 0,
          source: purchase.source,
        })),
      }

      const blob = await generateInformePdf(pdfData, (pct, label) => {
        setPdfProgress(pct)
        setPdfLabel(label)
      })
      saveAs(blob, `informe-mensual-${sede || 'donbalato'}-${selectedMonth}.pdf`)
    } catch (err) {
      console.error('Error generando PDF:', err)
      setPdfLabel('Error al generar el PDF.')
    } finally {
      setPdfGenerating(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchCuadresERP(24, true)
      window.location.reload()
    } finally {
      setRefreshing(false)
    }
  }

  const sedeName = isValidSede(sede) ? SEDES[sede] : 'Importadora Carlitos A'

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">Cargando informe mensual...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-lg w-full rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-red-200 dark:border-red-900/50 p-8 shadow-2xl text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-3">No se pudo cargar el informe</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
          <Link href="/erp-dashboard" className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-lg transition-all">
            Volver al ERP
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20 transition-colors">
      <div className="max-w-7xl mx-auto px-2 py-3 sm:px-4 sm:py-4 md:px-6 md:py-5">
        {/* Header compacto */}
        <div className="mb-4 rounded-2xl bg-white dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/erp-dashboard"
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 transition hover:scale-105"
              aria-label="Volver"
            >
              <ArrowLeft size={16} className="text-slate-600 dark:text-slate-300" />
            </Link>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <BarChart3 size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">Informe Mensual</h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                  {sedeName}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {availableMonths.length} meses disponibles · Importadora Carlitos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de Sucursal si existen más de una */}
            {SEDE_SLUGS.length > 1 && (
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700">
                <Building2 size={14} className="text-slate-500" />
                <select
                  value={sede}
                  onChange={(e) => {
                    const s = e.target.value as SedeSlug
                    router.push(`/erp-dashboard/informe-mensual?sede=${s}&month=${selectedMonth}`)
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  {SEDE_SLUGS.map((slug) => (
                    <option key={slug} value={slug}>
                      {SEDES[slug] || slug}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selector de Mes */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700">
              <Calendar size={14} className="text-slate-500" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer capitalize"
              >
                {availableMonths.length > 0 ? (
                  availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {formatMonth(month)}
                    </option>
                  ))
                ) : (
                  <option value="">Sin meses</option>
                )}
              </select>
            </div>

            {/* Selector de Rango de Fechas */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700/50 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              {[
                { key: 'full', label: 'Mes' },
                { key: 's1', label: 'S1' },
                { key: 's2', label: 'S2' },
                { key: 's3', label: 'S3' },
                { key: 's4', label: 'S4' },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => {
                    const r = option.key as 'full' | 's1' | 's2' | 's3' | 's4'
                    setDateRange(r)
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    dateRange === option.key
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Botón Refrescar Caché */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refrescar datos desde la nube"
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-500 transition"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Action buttons compactos */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={exportarInformeCompletoExcel}
            disabled={!reportDays.length}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 disabled:from-slate-300 disabled:to-slate-400 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
          >
            <Download size={14} strokeWidth={2.5} />
            Exportar Excel
          </button>
          <button
            onClick={generarInformePdf}
            disabled={!reportDays.length || pdfGenerating}
            className="relative inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-red-500 to-rose-600 disabled:from-slate-300 disabled:to-slate-400 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:cursor-not-allowed overflow-hidden"
          >
            {pdfGenerating && (
              <div
                className="absolute inset-0 bg-gradient-to-r from-red-600 to-rose-700"
                style={{ width: `${pdfProgress}%` }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {pdfGenerating ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>
                    {pdfProgress}% · {pdfLabel}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={2.5} />
                  Generar PDF + IA
                </>
              )}
            </span>
          </button>
          <Link
            href={`/erp-dashboard/gastos-externos?sede=${encodeURIComponent(sede || '')}&month=${encodeURIComponent(selectedMonth)}`}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-rose-500 to-pink-600 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <Receipt size={14} strokeWidth={2.5} />
            Gastos Externos
          </Link>
          <Link
            href="/erp-dashboard/ganancias"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all"
          >
            Ganancias POS
            <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>

        {reportDays.length === 0 ? (
          <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-10 shadow-xl text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Calendar size={28} className="text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">No hay datos para este período</h2>
            <p className="text-slate-600 dark:text-slate-400">Prueba con otro mes o revisa si la sucursal tiene cierres de caja cargados.</p>
          </div>
        ) : (
          <>
            {consolidatingOctoberIntoA && (
              <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
                Octubre 2026 está consolidado en Importadora Carlitos A. Incluye los cierres de ventas de A y B; los gastos fijos y sueldos de ambas quedaron cargados en A.
              </div>
            )}
            {(!productProfitComplete || productProfitWarnings.length > 0) && (
              <div role="alert" className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 sm:p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold sm:text-base">
                  <Activity size={18} />
                  {productProfitComplete
                    ? 'Resultado calculado; hay diferencias en los detalles de productos'
                    : `Resultado parcial: faltan ${productProfitReconciliation.pendingDays.length} cierres con costo confiable`}
                </h3>
                <p className="mt-2 text-xs leading-relaxed sm:text-sm">
                  Suma de ganancias brutas diarias guardadas: {formatCurrency(productProfitReconciliation.gananciaBruta)} en {productProfitReconciliation.diasConciliados} días. Ventas brutas de los cierres: {formatCurrency(totals.totalBruto)}. Las diferencias de detalle se muestran abajo.
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed sm:text-sm">
                  {productProfitWarnings.map((warning, index) => (
                    <li key={`${warning.fecha}-${index}`}><strong>{warning.fecha}:</strong> {warning.motivo}.</li>
                  ))}
                  {productProfitReconciliation.pendingDays.map((day) => (
                    <li key={day.fecha}><strong>{day.fecha}:</strong> {day.motivo}.</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed sm:text-sm">
                  {productProfitComplete
                    ? `${productProfitWarnings.length ? 'El resultado calculado' : 'El resultado final'} resta los gastos del mes (${formatCurrency(totals.gastosQueAfectanGanancia)}) a la ganancia bruta calculada. Las diferencias listadas afectan el detalle o su comparación con el cierre; las compras de mercadería quedan anotadas aparte y no se descuentan.`
                    : `El resultado parcial resta los gastos del mes (${formatCurrency(totals.gastosQueAfectanGanancia)}) a la ganancia confirmada: ${formatCurrency(finalResult)}. Los días pendientes aún podrían cambiarlo. Las compras de mercadería quedan anotadas aparte y no se descuentan.`}
                </p>
              </div>
            )}

            {/* Tarjetas de Métricas Principales */}
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6 mb-5 sm:mb-8">
              <GlassMetricCard
                title="Venta Bruta (cierres)"
                value={formatCurrency(totals.totalBruto)}
                icon={<DollarSign size={24} strokeWidth={2.5} />}
                tone="emerald"
              />
              <GlassMetricCard
                title="Costo de productos vendidos"
                value={formatCurrency(productProfitReconciliation.costoProductos)}
                icon={<Package size={24} strokeWidth={2.5} />}
                tone="red"
              />
              <GlassMetricCard
                title={!productProfitComplete ? `Ganancia conciliada (${productProfitReconciliation.diasConciliados} días)` : productProfitWarnings.length ? 'Ganancia bruta calculada' : 'Ganancia Productos'}
                value={formatCurrency(productProfitReconciliation.gananciaBruta)}
                icon={<TrendingUp size={24} strokeWidth={2.5} />}
                tone="blue"
              />
              <GlassMetricCard
                title={!productProfitComplete ? 'Resultado parcial' : productProfitWarnings.length ? 'Resultado calculado' : finalResult >= 0 ? 'Resultado Final' : 'Pérdida Final'}
                value={formatCurrency(finalResult)}
                icon={finalResult >= 0 ? <TrendingUp size={24} strokeWidth={2.5} /> : <TrendingDown size={24} strokeWidth={2.5} />}
                tone={resultHasUnresolvedIssues ? 'amber' : finalResultTone}
                featured
              />
              <GlassMetricCard
                title="Gastos Oper. Internos"
                value={formatCurrency(internalExpensesTotal)}
                icon={<Receipt size={24} strokeWidth={2.5} />}
                tone="amber"
              />
              <GlassMetricCard
                title="Sueldos en cierres diarios"
                value={formatCurrency(payrollExpensesTotal)}
                icon={<CreditCard size={24} strokeWidth={2.5} />}
                tone="blue"
              />
              <GlassMetricCard
                title="Gastos Fijos / Oper. Ext."
                value={formatCurrency(externalExpensesTotal)}
                icon={<Receipt size={24} strokeWidth={2.5} />}
                tone="purple"
              />
              <GlassMetricCard
                title="Gastos que afectan la ganancia"
                value={formatCurrency(totals.gastos)}
                icon={<TrendingDown size={24} strokeWidth={2.5} />}
                tone="red"
              />
              <GlassMetricCard
                title="Mercadería anotada aparte"
                value={formatCurrency(totals.gastosMercaderia)}
                icon={<Package size={24} strokeWidth={2.5} />}
                tone="purple"
              />
              <GlassMetricCard
                title="Días Activos"
                value={String(totals.diasConDatos)}
                icon={<Calendar size={24} strokeWidth={2.5} />}
                tone="indigo"
              />
            </div>

            {/* P&L Desglose Ejecutivo */}
            <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl mb-5 sm:mb-8">
              <div className="flex items-start justify-between gap-3 sm:gap-4 flex-col lg:flex-row lg:items-center mb-4 sm:mb-6">
                <div>
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] mb-3 ${
                      !productProfitComplete
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                        : finalResult >= 0
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
                    }`}
                  >
                    <Sparkles size={12} />
                    {!productProfitComplete ? 'Faltan cierres por resolver' : productProfitWarnings.length ? 'Resultado calculado; revisar fuentes' : finalResult >= 0 ? 'Resultado final positivo' : 'Resultado final negativo'}
                  </div>
                  <h2 className="text-base sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {!productProfitComplete ? 'Revisar cierres sin un costo confiable' : productProfitWarnings.length ? 'Resultado después de gastos; hay diferencias entre fuentes que requieren revisión' : 'Resultado final después de los gastos que afectan la ganancia'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 sm:mt-2">
                    Se resta de la ganancia de productos lo que afecta la ganancia. Las compras de mercadería quedan anotadas aparte.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 w-full lg:w-auto">
                  <MiniStat
                    label={productProfitComplete ? 'Ganancia productos' : `Ganancia conciliada · ${productProfitReconciliation.diasConciliados} días`}
                    value={formatCurrency(productProfitReconciliation.gananciaBruta)}
                    color={productProfitReconciliation.gananciaBruta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}
                  />
                  <MiniStat
                    label="Costo productos vendidos"
                    value={formatCurrency(productProfitReconciliation.costoProductos)}
                    color="text-rose-700 dark:text-rose-300"
                  />
                  <MiniStat
                    label="Gastos oper. int."
                    value={formatCurrency(internalExpensesTotal)}
                    color="text-amber-700 dark:text-amber-300"
                  />
                  <MiniStat
                    label="Sueldos en cierres diarios"
                    value={formatCurrency(payrollExpensesTotal)}
                    color="text-blue-700 dark:text-blue-300"
                  />
                  <MiniStat
                    label="Gastos oper. ext."
                    value={formatCurrency(externalExpensesTotal)}
                    color="text-purple-700 dark:text-purple-300"
                  />
                  <MiniStat
                    label={productProfitComplete ? 'Resultado final' : `Resultado parcial · ${productProfitReconciliation.diasConciliados}/${totals.diasConDatos} días`}
                    value={formatCurrency(finalResult)}
                    color={!productProfitComplete ? 'text-amber-700 dark:text-amber-300' : finalResult >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
                <SoftMetric
                  title={!productProfitComplete ? 'Resultado parcial del período' : productProfitWarnings.length ? 'Resultado calculado del período' : 'Resultado final del período'}
                  value={formatCurrency(finalResult)}
                  tone={resultHasUnresolvedIssues ? 'violet' : finalResult >= 0 ? 'emerald' : 'rose'}
                />
                <SoftMetric
                  title="Sueldos en cierres diarios"
                  value={formatCurrency(payrollExpensesTotal)}
                  tone="blue"
                />
                <SoftMetric
                  title="Gastos que afectan la ganancia"
                  value={formatCurrency(totals.gastos)}
                  tone="rose"
                />
                <SoftMetric
                  title={!productProfitComplete ? 'Margen parcial sobre ventas conciliadas' : productProfitWarnings.length ? 'Margen calculado; revisar diferencias de fuente' : 'Margen neto sobre ventas conciliadas'}
                  value={`${finalMarginPct.toFixed(1)}%`}
                  tone={resultHasUnresolvedIssues ? 'violet' : finalResult >= 0 ? 'emerald' : 'rose'}
                />
              </div>
            </div>

            {/* Gráficos de Evolución y Métodos de Pago */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-5 sm:mb-8">
              <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg">
                    <BarChart3 size={18} strokeWidth={2.5} />
                  </div>
                  Evolución del Período
                </h3>
                <ResponsiveBox width="100%" height={260}>
                  <AreaChart data={dailyProfitSeries}>
                    <defs>
                      <linearGradient id="colorBrutoDonBalato" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `Día ${value}`} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `$${(Number(value) / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} labelFormatter={(label) => `Día ${label}`} />
                    <Legend />
                    <Area type="monotone" dataKey="totalBruto" stroke="#10b981" fill="url(#colorBrutoDonBalato)" strokeWidth={2.25} name="Venta Bruta" />
                    <Line type="monotone" dataKey="totalNeto" stroke="#8b5cf6" strokeWidth={1.75} name="Caja Ajustada" dot={false} />
                    <Line type="monotone" dataKey="gananciaTop" stroke="#2563eb" strokeWidth={1.8} name="Ganancia Productos" dot={false} />
                    <Line type="monotone" dataKey="resultadoFinal" stroke="#16a34a" strokeWidth={2.25} name="Resultado Final" dot={false} />
                    <Line type="monotone" dataKey="gastosInternos" stroke="#f97316" strokeWidth={1.75} name="Gastos Operativos Internos" dot={false} />
                    <Line type="monotone" dataKey="gastosSueldos" stroke="#3b82f6" strokeWidth={1.75} name="Sueldos en cierres diarios" dot={false} />
                    <Line type="monotone" dataKey="gastosExternos" stroke="#a855f7" strokeWidth={1.75} name="Gastos Fijos / Oper. Ext." dot={false} />
                    <Line type="monotone" dataKey="gastos" stroke="#ef4444" strokeWidth={1.9} name="Gastos que afectan ganancia" dot={false} />
                  </AreaChart>
                </ResponsiveBox>
              </div>

              <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white shadow-lg">
                    <PieChart size={18} strokeWidth={2.5} />
                  </div>
                  Distribución de Métodos de Pago
                </h3>
                {paymentMethodsData.length > 0 ? (
                  <ResponsiveBox width="100%" height={260}>
                    <RechartsPieChart>
                      <Pie
                        data={paymentMethodsData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${(((entry.value || 0) / (paymentTotal || 1)) * 100).toFixed(1)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {paymentMethodsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    </RechartsPieChart>
                  </ResponsiveBox>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-slate-500 dark:text-slate-400">
                    Sin datos disponibles
                  </div>
                )}
              </div>
            </div>

            {/* Comparaciones Efectivo y Débito */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-5 sm:mb-8">
              <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white shadow-lg">
                    <DollarSign size={18} strokeWidth={2.5} />
                  </div>
                  Efectivo - Sistema vs Real
                </h3>
                <div className="space-y-2 sm:space-y-4">
                  <ComparisonRow label="Sistema" value={formatCurrency(totals.efectivoSistema)} />
                  <ComparisonRow label="Real" value={formatCurrency(totals.efectivoReal)} />
                  <ComparisonDiff value={totals.diferenciaEfectivo} />
                </div>
              </div>

              <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg">
                    <CreditCard size={18} strokeWidth={2.5} />
                  </div>
                  Débito - Sistema vs Real
                </h3>
                <div className="space-y-2 sm:space-y-4">
                  <ComparisonRow label="Sistema" value={formatCurrency(totals.debitoSistema)} />
                  <ComparisonRow label="Real" value={formatCurrency(totals.debitoReal)} />
                  <ComparisonDiff value={totals.diferenciaDebito} />
                </div>
              </div>
            </div>

            {/* Ranking Top Products */}
            <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl mb-5 sm:mb-8">
              <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <ShoppingCart size={18} strokeWidth={2.5} />
                </div>
                Top Products del período
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">#</th>
                      <th className="px-3 py-3 text-left font-semibold">SKU</th>
                      <th className="px-3 py-3 text-left font-semibold">Producto</th>
                      <th className="px-3 py-3 text-right font-semibold">Cant.</th>
                      <th className="px-3 py-3 text-right font-semibold">Ventas</th>
                      <th className="px-3 py-3 text-right font-semibold">Costo</th>
                      <th className="px-3 py-3 text-right font-semibold">Ganancia</th>
                      <th className="px-3 py-3 text-right font-semibold">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {profitSummary.rows.length > 0 ? (
                      profitSummary.rows.slice(0, 20).map((row, index) => (
                        <tr key={`${row.skuNormalizado}-${index}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-3 py-3 text-slate-400">{index + 1}</td>
                          <td className="px-3 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{row.sku || '—'}</td>
                          <td className="px-3 py-3 text-slate-800 dark:text-slate-100 max-w-[14rem] truncate" title={row.nombre}>{row.nombre}</td>
                          <td className="px-3 py-3 text-right font-medium text-slate-700 dark:text-slate-200">{formatInteger(row.cantidadVendida)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(row.ventasBrutas)}</td>
                          <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">{formatCurrency(row.costoAjustado)}</td>
                          <td className={`px-3 py-3 text-right font-bold ${row.ganancia >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{formatCurrency(row.ganancia)}</td>
                          <td className={`px-3 py-3 text-right font-bold ${row.ganancia >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{row.margenPct.toFixed(1)}%</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">
                          No hay top products registrados en este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Listado de Gastos del Mes */}
            <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl mb-5 sm:mb-8">
              <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white shadow-lg">
                  <Receipt size={18} strokeWidth={2.5} />
                </div>
                Todos los Gastos del Mes
              </h3>
              <div className="flex items-center justify-between mb-4 flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{allExpenses.length} gastos</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-md">
                    Internos {formatCurrency(internalExpensesTotal)}
                  </span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-md">
                    Externos {formatCurrency(externalExpensesTotal)}
                  </span>
                  {totals.gastosMercaderia > 0 && (
                    <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/30 px-2 py-1 rounded-md">
                      Mercadería anotada aparte {formatCurrency(totals.gastosMercaderia)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/erp-dashboard/gastos-externos?sede=${encodeURIComponent(sede || '')}&month=${encodeURIComponent(selectedMonth)}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-800 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                  >
                    <Receipt size={15} />
                    Gestionar externos
                  </Link>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(totalExpenses)}</span>
                </div>
              </div>

              {allExpenses.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {allExpenses.map((gasto, index) => {
                    const descripcion = gasto.observacion || gasto.descripcion || gasto.concepto || 'Gasto sin descripción'
                    return (
                      <div
                        key={`${gasto.fecha}-${index}`}
                        className="flex items-center justify-between p-2.5 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 border border-slate-200 dark:border-slate-600 hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-600 dark:hover:to-slate-700 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-md">Día {gasto.dia}</span>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-md">{gasto.fecha}</span>
                            {gasto.tipo && <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-md">{gasto.tipo}</span>}
                            {gasto.source === 'external-fixed' && <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-md">Externo fijo</span>}
                            {gasto.source === 'external-manual' && <span className="text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/30 px-2 py-1 rounded-md">Externo manual</span>}
                            {gasto.source === 'internal-payroll' && <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-md">Sueldo registrado</span>}
                            {gasto.source === 'internal' && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-md">Cuadre caja</span>}
                          </div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm mb-1 line-clamp-2">{descripcion}</p>
                          {gasto.categoria && <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Categoría: {gasto.categoria}</p>}
                        </div>
                        <div className="text-right ml-2 sm:ml-4 flex-shrink-0">
                          <p className="text-sm sm:text-xl font-black text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform whitespace-nowrap">
                            {formatCurrency(Number(gasto.monto) || 0)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <div className="h-20 w-20 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                    <Receipt size={40} className="text-slate-400" />
                  </div>
                  <p className="text-xl font-bold mb-2">No hay gastos operacionales registrados</p>
                  <p className="text-sm">para {selectedMonth ? formatMonth(selectedMonth) : 'este período'} en {sedeName}</p>
                </div>
              )}

              {totals.gastosMercaderia > 0 && (
                <div className="mt-5 rounded-2xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/70 dark:bg-cyan-950/20 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="font-bold text-cyan-900 dark:text-cyan-200">Compras de mercadería — anotación de reinversión</h4>
                      <p className="text-xs text-cyan-800/80 dark:text-cyan-300/80">Se muestran aparte: no se suman a gastos ni se descuentan de la ganancia.</p>
                    </div>
                    <span className="font-black text-cyan-800 dark:text-cyan-200">{formatCurrency(totals.gastosMercaderia)}</span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {allMerchandisePurchases.length > 0 ? allMerchandisePurchases.map((compra, index) => (
                        <div key={`${compra.fecha}-${compra.id || index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-slate-800/70 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500 dark:text-slate-400">{compra.fecha} · {compra.sourceLabel}</p>
                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{compra.observacion || compra.descripcion || compra.concepto || 'Compra de mercadería'}</p>
                            {(compra.rubroMercaderia || compra.proveedor) && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[compra.rubroMercaderia, compra.proveedor].filter(Boolean).join(' · ')}</p>}
                          </div>
                          <span className="shrink-0 font-bold text-cyan-800 dark:text-cyan-200">{formatCurrency(Number(compra.monto) || 0)}</span>
                        </div>
                      )) : (
                        <p className="rounded-xl bg-white/80 dark:bg-slate-800/70 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                          El cierre conserva el total anotado, pero no trae el detalle de cada compra.
                        </p>
                      )}
                  </div>
                </div>
              )}
            </div>

            {/* Detalle Diario Completo */}
            <div className="rounded-3xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-3 sm:p-6 shadow-xl transition-all hover:shadow-2xl mb-5 sm:mb-8">
              <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-200 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-slate-400 to-sky-500 flex items-center justify-center text-white shadow-lg">
                  <Activity size={18} strokeWidth={2.5} />
                </div>
                Detalle Diario Completo
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">Día</th>
                      <th className="px-3 py-3 text-right font-semibold">Bruto</th>
                      <th className="px-3 py-3 text-right font-semibold">Caja neta</th>
                      <th className="px-3 py-3 text-right font-semibold">Ganancia TP</th>
                      <th className="px-3 py-3 text-right font-semibold">Margen TP</th>
                      <th className="px-3 py-3 text-right font-semibold">Dif. Efectivo</th>
                      <th className="px-3 py-3 text-right font-semibold">Dif. Débito</th>
                      <th className="px-3 py-3 text-right font-semibold">Gastos Ext.</th>
                      <th className="px-3 py-3 text-right font-semibold">Gastos operacionales</th>
                      <th className="px-3 py-3 text-right font-semibold text-cyan-700 dark:text-cyan-300">Mercadería anotada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {dailyProfitSeries.map((day) => (
                      <tr key={day.fecha} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{day.dia}</td>
                        <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">{formatCurrency(day.totalBruto)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-violet-700 dark:text-violet-300">{formatCurrency(day.totalNeto)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${day.gananciaTop == null ? 'text-amber-700 dark:text-amber-300' : day.gananciaTop >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{day.gananciaTop == null ? 'Pendiente' : formatCurrency(day.gananciaTop)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${day.margenTopPct == null ? 'text-amber-700 dark:text-amber-300' : day.margenTopPct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{day.margenTopPct == null ? 'Pendiente' : `${day.margenTopPct.toFixed(1)}%`}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${day.diferenciaEfectivo >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{day.diferenciaEfectivo >= 0 ? '+' : ''}{formatCurrency(day.diferenciaEfectivo)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${day.diferenciaDebito >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{day.diferenciaDebito >= 0 ? '+' : ''}{formatCurrency(day.diferenciaDebito)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(day.gastosExternos || 0)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-red-600 dark:text-red-400">{formatCurrency(day.gastos)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-cyan-700 dark:text-cyan-300">{formatCurrency(day.gastosMercaderia || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function GlassMetricCard({
  title,
  value,
  icon,
  tone,
  featured = false,
}: {
  title: string
  value: string
  icon: React.ReactNode
  tone: 'emerald' | 'amber' | 'blue' | 'red' | 'purple' | 'indigo'
  featured?: boolean
}) {
  const toneMap = {
    emerald: {
      glow: 'group-hover:bg-emerald-500/20',
      bubble: 'bg-emerald-500/10',
      icon: 'from-emerald-400 to-emerald-600 shadow-emerald-500/30',
      featuredBorder: 'border-b-emerald-500',
    },
    amber: {
      glow: 'group-hover:bg-amber-500/20',
      bubble: 'bg-amber-500/10',
      icon: 'from-amber-400 to-amber-600 shadow-amber-500/30',
      featuredBorder: 'border-b-amber-500',
    },
    blue: {
      glow: 'group-hover:bg-blue-500/20',
      bubble: 'bg-blue-500/10',
      icon: 'from-blue-400 to-blue-600 shadow-blue-500/30',
      featuredBorder: 'border-b-blue-500',
    },
    red: {
      glow: 'group-hover:bg-red-500/20',
      bubble: 'bg-red-500/10',
      icon: 'from-red-400 to-red-600 shadow-red-500/30',
      featuredBorder: 'border-b-red-500',
    },
    purple: {
      glow: 'group-hover:bg-purple-500/20',
      bubble: 'bg-purple-500/10',
      icon: 'from-purple-500 to-indigo-600 shadow-purple-500/30',
      featuredBorder: 'border-b-purple-500',
    },
    indigo: {
      glow: 'group-hover:bg-indigo-500/20',
      bubble: 'bg-indigo-500/10',
      icon: 'from-indigo-400 to-indigo-600 shadow-indigo-500/30',
      featuredBorder: 'border-b-indigo-500',
    },
  } as const

  const styles = toneMap[tone]

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border ${
        featured
          ? `border-t border-l border-white/80 dark:border-slate-700/80 border-b-4 ${styles.featuredBorder}`
          : 'border-white/40 dark:border-slate-700/50'
      } p-3 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all hover:-translate-y-1 group`}
    >
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${styles.bubble} blur-2xl ${styles.glow} transition-all`} />
      <div className="flex items-center gap-2 sm:gap-4 mb-2 sm:mb-4 relative">
        <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br ${styles.icon} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
          <div className="scale-75 sm:scale-100">{icon}</div>
        </div>
        <h3 className="text-[10px] sm:text-sm font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400 leading-tight">
          {title}
        </h3>
      </div>
      <p className="text-lg sm:text-3xl font-black text-slate-800 dark:text-white tracking-tight break-words">{value}</p>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/30 px-2 py-2 sm:px-3 sm:py-2.5">
      <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-slate-400 dark:text-slate-500 leading-tight">
        {label}
      </div>
      <div className={`text-xs sm:text-sm font-black mt-1 break-words ${color || 'text-slate-900 dark:text-white'}`}>{value}</div>
    </div>
  )
}

function SoftMetric({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'emerald' | 'rose' | 'blue' | 'violet'
}) {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
    violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800',
  } as const

  return (
    <div className={`rounded-2xl border p-2.5 sm:p-4 ${toneMap[tone]}`}>
      <div className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] opacity-70 leading-tight">
        {title}
      </div>
      <div className="text-sm sm:text-2xl font-black mt-1 sm:mt-2 break-words">{value}</div>
    </div>
  )
}

function ComparisonRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center p-2.5 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 border border-slate-200 dark:border-slate-600">
      <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">{label}:</span>
      <span className="text-sm sm:text-xl font-bold text-slate-800 dark:text-slate-200 break-words">{value}</span>
    </div>
  )
}

function ComparisonDiff({ value }: { value: number }) {
  const positive = value >= 0

  return (
    <div
      className={`flex justify-between items-center p-2.5 sm:p-4 rounded-2xl border-2 ${
        positive
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800'
          : 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800'
      }`}
    >
      <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400">Diferencia:</span>
      <span
        className={`text-base sm:text-2xl font-black break-words ${
          positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {positive ? '+' : ''}
        {formatCurrency(value)}
      </span>
    </div>
  )
}

export default function InformeMensualPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
            <p className="text-slate-600 dark:text-slate-400 font-medium">Cargando módulo de informe...</p>
          </div>
        </div>
      }
    >
      <InformeMensualContent />
    </Suspense>
  )
}
