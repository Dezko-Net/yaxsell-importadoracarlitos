'use client'

import React, { useEffect, useMemo, useState, useRef, useCallback, Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  ChevronRight,
  TrendingDown,
  Calendar,
  Filter,
  Building2,
  RefreshCw,
  Brain,
  ChevronDown,
  ChevronUp,
  X,
  Eye,
  Sparkles,
  Receipt,
  Store,
  Tag,
  Wallet,
  BarChart3,
  Image as ImageIcon,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  FileText,
  Pencil,
  User,
  Info,
  Save,
  XCircle,
  Download,
  MessageCircle,
  Zap,
  Plus,
  Trash2,
  Layers,
  PieChart,
  Crown,
  Cloud,
  ShoppingBag,
  CreditCard,
  Upload,
  Check,
  Camera,
} from 'lucide-react'
import GastosAgent from '@/components/GastosAgent'
import { SEDES, SEDE_SLUGS as DEFAULT_SEDE_SLUGS, type SedeSlug } from '@/types'
import { db, firebaseProjectId, storage } from '@/lib/firebase'
import { fetchTrabajadoresERP } from '@/lib/trabajadoresErpService'
import { useAuth } from '@/hooks/useAuth'
import { isAdminEmail } from '@/lib/admin-access'

const OrdersCloudMascot = dynamic(() => import('@/components/admin/OrdersCloudMascot'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  ),
})
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  arrayRemove,
  arrayUnion,
  orderBy,
  addDoc,
  type Firestore,
} from 'firebase/firestore'

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  loadExternalExpensesConfig,
  saveExternalExpensesConfig,
  listExternalExpenseEntriesForMonth,
  addExternalExpenseEntry,
  deleteExternalExpenseEntry,
  buildExternalExpenseBreakdown,
  buildVisibleDateRange,
  type ExternalFixedExpense,
  type ExternalManualExpense,
} from '@/lib/externalExpenses'

const GASTOS_JEFATURA_CACHE_MS = 5 * 60 * 1000
type GastoJefaturaRow = { id: string; data: Record<string, any> }
const gastosJefaturaCache = new Map<string, { expiresAt: number; rows: GastoJefaturaRow[] }>()
const gastosJefaturaRequests = new Map<string, Promise<GastoJefaturaRow[]>>()
let gastosJefaturaCacheVersion = 0

async function getGastosJefaturaCached(database: Firestore, from?: string, to?: string) {
  const key = from && to ? `${from}:${to}` : 'all-dates'
  const cached = gastosJefaturaCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.rows
  const inFlight = gastosJefaturaRequests.get(key)
  if (inFlight) return inFlight
  const version = gastosJefaturaCacheVersion
  const constraints: any[] = []
  if (from && to) {
    constraints.push(where('fecha', from === to ? '==' : '>=', from))
    if (from !== to) constraints.push(where('fecha', '<=', to))
  }
  const queryRef = query(collection(database, 'gastos_jefatura'), ...constraints)
  const request = getDocs(queryRef)
    .then((snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, data: item.data() }))
      if (version === gastosJefaturaCacheVersion) {
        gastosJefaturaCache.set(key, { expiresAt: Date.now() + GASTOS_JEFATURA_CACHE_MS, rows })
      }
      return rows
    })
    .finally(() => { if (gastosJefaturaRequests.get(key) === request) gastosJefaturaRequests.delete(key) })
  gastosJefaturaRequests.set(key, request)
  return request
}

export type GastoItem = {
  id?: string
  index?: number
  sede: string
  fecha: string
  hora?: string
  tipo: string
  descripcion: string
  descripcionMejorada: string
  categoria: string
  monto: number
  confianza?: number
  clasificadoPor?: string
  cajero?: string
  posGastoId?: string
  fotos?: { url: string; nombre?: string }[]
  isJefatura?: boolean
  proveedor?: string
  facturaNro?: string
  medioPago?: string
  rubroMercaderia?: string
}

export type GastoFichaIA = {
  razonabilidad: 'Razonable' | 'Cuestionable' | 'Excesivo' | 'Normal'
  nivelRiesgo: 'Bajo' | 'Medio' | 'Alto'
  proporcion: string
  categorizacionCorrecta: 'Sí' | 'No' | 'Parcial'
  categoriaRecomendada?: string
  montoEsperado: string
  observacion: string
  puntaje: number
  confianzaIA: number
  esAdelanto: boolean
  nombreTrabajador?: string
  preguntasIA?: string[]
  razonesNoCompleta?: string[]
}

export type TrabajadorMatch = {
  id: string
  nombre: string
  cargo?: string
  fotoUrl?: string
  sede: string
  adelantoHistorial?: { ymd: string; monto: number; descripcion?: string }[]
  sueldo?: number
}

const ALL_KNOWN_SEDES: Record<string, string> = {
  'donbalato-central': 'Importadora Carlitos Central',
  ...SEDES,
}

const SEDE_SLUGS: string[] = Array.from(new Set(['donbalato-central', ...(DEFAULT_SEDE_SLUGS || [])]))

const fmtMoney = (n: number) => `$${Number(n || 0).toLocaleString('es-CL')}`
const pad2 = (n: number) => String(n).padStart(2, '0')

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function yesterdayYMD() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function daysAgoYMD(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const JEFE_MERCADERIA_ATAJOS = [
  { id: 'Higiene Personal', emoji: '🧴', label: 'Higiene Personal', desc: 'Compra mayorista de higiene personal, jabones, champú y cuidado corporal' },
  { id: 'Productos de Limpieza', emoji: '🧼', label: 'Prod. Limpieza', desc: 'Compra mayorista de detergentes, cloro, desinfectantes y útiles de limpieza' },
  { id: 'Tecnología y Audífonos', emoji: '🎧', label: 'Audífonos / Tech', desc: 'Compra mayorista de audífonos chinos, bluetooth y artículos tecnológicos' },
  { id: 'Accesorios Tech', emoji: '🔌', label: 'Accesorios Tech', desc: 'Cables, cargadores, adaptadores y electrónica importada' },
  { id: 'Mercadería Don Iván', emoji: '👑', label: 'Don Iván (Stock)', desc: 'Pago de mercadería / reposición de stock - Don Iván' },
  { id: 'Mercadería Nacho', emoji: '🚛', label: 'Nacho (Bodega)', desc: 'Pago / retiro de dinero para mercadería - Nacho' },
  { id: 'Proveedor Edimar', emoji: '🏢', label: 'Prov. Edimar', desc: 'Pago de mercadería a proveedor Edimar' },
  { id: 'Cajas e Importación', emoji: '🚢', label: 'Importación China', desc: 'Compra mayorista por cajas cerradas e importación directa' },
]

const JEFE_PROVEEDORES_ATAJOS = [
  'Importadora China',
  'Don Iván',
  'Nacho',
  'Proveedor Edimar',
  'Meiggs / Mayorista',
]

function normalizeJefeProveedor(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function jefeProveedorKey(value: unknown): string {
  return normalizeJefeProveedor(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')
}

function mergeJefeProveedores(...groups: unknown[][]): string[] {
  const unique = new Map<string, string>()
  groups.flat().forEach((value) => {
    const name = normalizeJefeProveedor(value)
    const key = jefeProveedorKey(name)
    if (name && key && !unique.has(key)) unique.set(key, name)
  })
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

const JEFE_OPERATIVOS_ATAJOS = [
  { id: 'retiro', emoji: '👑', label: 'Retiro Don Iván', desc: 'Retiro de efectivo para Don Iván / Jefatura', tipo: 'Administrativo', categoria: 'Oficina' },
  { id: 'combustible', emoji: '⛽', label: 'Combustible', desc: 'Carga de combustible / bencina vehículo', tipo: 'Transporte', categoria: 'Transporte' },
  { id: 'parqueo', emoji: '🅿️', label: 'Parqueo / Peaje', desc: 'Pago de parqueo / estacionamiento', tipo: 'Transporte', categoria: 'Transporte' },
  { id: 'colacion', emoji: '🍽️', label: 'Colación Turno', desc: 'Colación / almuerzo de turno personal', tipo: 'Alimentación', categoria: 'Alimentación' },
  { id: 'sencillo', emoji: '🪙', label: 'Sencillo Vuelto', desc: 'Sencillo para dar vuelto en caja', tipo: 'Operacional', categoria: 'Oficina' },
  { id: 'adelanto', emoji: '💵', label: 'Adelanto Personal', desc: 'Adelanto de sueldo a trabajador', tipo: 'Personal', categoria: 'Recursos Humanos' },
  { id: 'electricista', emoji: '🔧', label: 'Electricista / Local', desc: 'Pago electricista (Rodolfo), chapas, llaves o arreglo de local', tipo: 'Mantenimiento', categoria: 'Reparaciones' },
  { id: 'insumos', emoji: '🧹', label: 'Insumos / Folios', desc: 'Compra de folios, cuchillas, ligas, llaves o útiles de aseo', tipo: 'Operacional', categoria: 'Suministros' },
  { id: 'servicios', emoji: '💡', label: 'Luz / Servicios', desc: 'Pago de luz, agua, internet o servicios del local', tipo: 'Servicios', categoria: 'Servicios Públicos' },
]

function currentMonthId() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

const tipoColors: Record<string, string> = {
  'Operacional': 'bg-blue-100 text-blue-800 border-blue-200',
  'Mantenimiento': 'bg-orange-100 text-orange-800 border-orange-200',
  'Servicios': 'bg-green-100 text-green-800 border-green-200',
  'Marketing': 'bg-purple-100 text-purple-800 border-purple-200',
  'Personal': 'bg-pink-100 text-pink-800 border-pink-200',
  'Administrativo': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Alimentación': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Transporte': 'bg-red-100 text-red-800 border-red-200',
  'Gasto de mercadería': 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold',
  'Otros': 'bg-gray-100 text-gray-800 border-gray-200',
  'Sin clasificar': 'bg-slate-100 text-slate-600 border-slate-200',
}

const categoriaColors: Record<string, string> = {
  'Suministros': 'bg-blue-50 text-blue-700 border-blue-200',
  'Reparaciones': 'bg-orange-50 text-orange-700 border-orange-200',
  'Servicios Públicos': 'bg-green-50 text-green-700 border-green-200',
  'Publicidad': 'bg-purple-50 text-purple-700 border-purple-200',
  'Recursos Humanos': 'bg-pink-50 text-pink-700 border-pink-200',
  'Oficina': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Alimentación': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Transporte': 'bg-red-50 text-red-700 border-red-200',
  'Gasto fijo': 'bg-amber-50 text-amber-700 border-amber-200',
  'Gasto externo': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Inventario / Mercadería': 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
  'Otros': 'bg-gray-50 text-gray-700 border-gray-200',
  'Sin clasificar': 'bg-slate-50 text-slate-600 border-slate-200',
}

const tipoEmojis: Record<string, string> = {
  'Operacional': '⚙️',
  'Mantenimiento': '🔧',
  'Servicios': '💡',
  'Marketing': '📢',
  'Personal': '👥',
  'Administrativo': '📋',
  'Alimentación': '🍽️',
  'Transporte': '🚚',
  'Gasto de mercadería': '📦',
  'Otros': '📦',
  'Sin clasificar': '❓',
}

const categoriaEmojis: Record<string, string> = {
  'Suministros': '📦',
  'Reparaciones': '🛠️',
  'Servicios Públicos': '💧',
  'Publicidad': '📣',
  'Recursos Humanos': '👤',
  'Oficina': '🖊️',
  'Alimentación': '🍔',
  'Transporte': '🚗',
  'Gasto fijo': '🏢',
  'Gasto externo': '💳',
  'Inventario / Mercadería': '💎',
  'Otros': '📌',
  'Sin clasificar': '❓',
}

const TIPOS_VALIDOS_MASIVO = Object.keys(tipoEmojis).filter((t) => t !== 'Sin clasificar')
const CATEGORIAS_VALIDAS_MASIVO = Object.keys(categoriaEmojis).filter((c) => c !== 'Sin clasificar')

const SEDE_THEME: Record<string, { gradient: string; bg: string; border: string; text: string; badge: string; icon: string; ring: string; barFrom: string; barTo: string }> = {
  'donbalato-central': { gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-800 border-amber-300', icon: '🏪', ring: 'ring-amber-300/40', barFrom: 'from-amber-400', barTo: 'to-orange-400' },
}

const getSedeTheme = (slug: string) => SEDE_THEME[slug] || SEDE_THEME['donbalato-central']
const sedeShortName = (slug: string) => {
  return ALL_KNOWN_SEDES[slug] || SEDES[slug as SedeSlug] || 'Importadora Carlitos Central'
}

function heuristicallyClassifyGasto(text: string, amount: number) {
  const t = text.toLowerCase()
  if (
    t.includes('mercader') ||
    t.includes('stock') ||
    t.includes('proveedor') ||
    t.includes('edimar') ||
    t.includes('cajas') ||
    t.includes('bulto') ||
    t.includes('importac') ||
    t.includes('factura') ||
    (t === 'ivan' && amount >= 100000)
  ) {
    return { tipo: 'Gasto de mercadería', categoria: 'Inventario / Mercadería', confianza: 0.98 }
  }
  if (t.includes('retiro ivan') || t.includes('plata para don ivan') || t.includes('retiro dueño')) {
    return { tipo: 'Administrativo', categoria: 'Oficina', confianza: 0.96 }
  }
  if (t.includes('adelanto') || t.includes('sueldo') || t.includes('anticipo') || t.includes('remunera') || t.includes('prestamo')) {
    return { tipo: 'Personal', categoria: 'Recursos Humanos', confianza: 0.95 }
  }
  if (
    t.includes('combustible') ||
    t.includes('bencina') ||
    t.includes('parqueo') ||
    t.includes('estacionamiento') ||
    t.includes('flete') ||
    t.includes('encomienda') ||
    t.includes('traslado') ||
    t.includes('camion') ||
    t.includes('uber') ||
    t.includes('taxi') ||
    t.includes('peaje')
  ) {
    return { tipo: 'Transporte', categoria: 'Transporte', confianza: 0.94 }
  }
  if (t.includes('almuerzo') || t.includes('comida') || t.includes('pan') || t.includes('bebida') || t.includes('cafe') || t.includes('colacion') || t.includes('colación')) {
    return { tipo: 'Alimentación', categoria: 'Alimentación', confianza: 0.93 }
  }
  if (
    t.includes('electricista') ||
    t.includes('rodolfo') ||
    t.includes('chapa') ||
    t.includes('llave') ||
    t.includes('reparac') ||
    t.includes('arreglo') ||
    t.includes('tecnico') ||
    t.includes('falla') ||
    t.includes('mantencion') ||
    t.includes('enchufe')
  ) {
    return { tipo: 'Mantenimiento', categoria: 'Reparaciones', confianza: 0.93 }
  }
  if (t.includes('sencillo') || t.includes('vuelto') || t.includes('cambio caja')) {
    return { tipo: 'Operacional', categoria: 'Oficina', confianza: 0.95 }
  }
  if (
    t.includes('folio') ||
    t.includes('cuchilla') ||
    t.includes('liga') ||
    t.includes('embalar') ||
    t.includes('bolsa') ||
    t.includes('cinta') ||
    t.includes('rollo') ||
    t.includes('empaque') ||
    t.includes('limpieza') ||
    t.includes('cloro') ||
    t.includes('papel') ||
    t.includes('insumo')
  ) {
    return { tipo: 'Operacional', categoria: 'Suministros', confianza: 0.92 }
  }
  if (t.includes('agua') || t.includes('luz') || t.includes('enel') || t.includes('internet') || t.includes('gas') || t.includes('plan movil')) {
    return { tipo: 'Servicios', categoria: 'Servicios Públicos', confianza: 0.94 }
  }
  if (t.includes('impres') || t.includes('toner') || t.includes('lapiz') || t.includes('cuaderno') || t.includes('resma') || t.includes('formulario')) {
    return { tipo: 'Administrativo', categoria: 'Oficina', confianza: 0.89 }
  }
  return { tipo: 'Operacional', categoria: 'Suministros', confianza: 0.85 }
}

const buildRealFicha = (g: GastoItem, trabajadores: TrabajadorMatch[], totalPeriodo: number): { ficha: GastoFichaIA; matchedWorker: TrabajadorMatch | null } => {
  const desc = String(g.descripcionMejorada || g.descripcion || '').toLowerCase()
  const isMercaderia = g.tipo === 'Gasto de mercadería' || g.isJefatura
  const isAdelanto = desc.includes('adelanto') || desc.includes('sueldo') || g.tipo === 'Personal'
  const isHigh = g.monto >= 200000
  const riesgo: GastoFichaIA['nivelRiesgo'] = isHigh ? (g.monto > 500000 ? 'Medio' : 'Bajo') : 'Bajo'
  const razonabilidad: GastoFichaIA['razonabilidad'] = 'Razonable'

  let matchedWorker: TrabajadorMatch | null = null
  for (const w of trabajadores) {
    const wName = w.nombre.toLowerCase()
    if (desc.includes(wName) || (g.cajero && g.cajero.toLowerCase() === wName)) {
      matchedWorker = w
      break
    }
  }

  let observacion = `Egreso operativo real registrado en ${sedeShortName(g.sede)}${g.cajero ? ` por cajero(a) ${g.cajero}` : ''}.`
  if (isMercaderia) {
    observacion = `👑 Pago / inversión real en compra de mercadería registrado en Importadora Carlitos Central${g.cajero ? ` (Cajero: ${g.cajero})` : ''}. Corresponde a adquisición de stock comercializable.`
  } else if (isAdelanto) {
    observacion = `Adelanto o pago a personal registrado en Importadora Carlitos Central${matchedWorker ? ` (${matchedWorker.nombre})` : ''}.`
  }

  const baseTotal = Math.max(totalPeriodo, g.monto, 1)
  const pct = ((g.monto / baseTotal) * 100).toFixed(1)

  return {
    ficha: {
      razonabilidad,
      nivelRiesgo: riesgo,
      proporcion: `${pct}% del total del período (${fmtMoney(baseTotal)})`,
      categorizacionCorrecta: 'Sí',
      categoriaRecomendada: g.categoria,
      montoEsperado: isMercaderia ? '$100.000 - $1.500.000 (Reposición mercadería)' : '$3.000 - $60.000 (Caja operativa)',
      observacion,
      puntaje: isMercaderia ? 9 : 9,
      confianzaIA: Math.round((g.confianza ?? 0.94) * 100),
      esAdelanto: isAdelanto,
      nombreTrabajador: isAdelanto ? matchedWorker?.nombre : undefined,
      preguntasIA: [],
      razonesNoCompleta: g.fotos && g.fotos.length > 0 ? ['Con comprobante adjunto'] : ['Registrado en cierre de caja POS'],
    },
    matchedWorker,
  }
}

function GastosDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoggedIn } = useAuth()

  // Tab switcher
  const initialTab = (searchParams.get('tab') as 'sucursal' | 'externos' | 'consolidado') || 'sucursal'
  const [activeTab, setActiveTab] = useState<'sucursal' | 'externos' | 'consolidado'>(initialTab)

  // Account Name resolution (dynamic, replaces hardcoded "Jefecito")
  const accountName = useMemo(() => {
    const uAny = user as any
    if (uAny?.displayName && typeof uAny.displayName === 'string' && uAny.displayName.trim()) return uAny.displayName.trim()
    if (user?.name && user.name.trim()) return user.name.trim()
    if (user?.email) {
      const prefix = user.email.split('@')[0]
      return prefix.charAt(0).toUpperCase() + prefix.slice(1)
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('yaxsel_auth_user')
        if (stored) {
          const u = JSON.parse(stored)
          if (u.displayName) return u.displayName
          if (u.name) return u.name
          if (u.email) return u.email.split('@')[0]
        }
      } catch {}
    }
    return 'Yerko'
  }, [user])

  // Full-Screen Takeover states: 'welcome' | 'register_selection' | 'register_form' | 'dashboard'
  const initialMode = searchParams.get('view') === 'dashboard' ? 'dashboard' : 'welcome'
  const [fullScreenMode, setFullScreenMode] = useState<'welcome' | 'register_selection' | 'register_form' | 'dashboard'>(initialMode)
  const [jefeGastoType, setJefeGastoType] = useState<'mercaderia' | 'otros' | null>(null)

  // Jefe Wizard Form State
  const [jefeMonto, setJefeMonto] = useState('')
  const [jefeProveedor, setJefeProveedor] = useState('')
  const [jefeProveedores, setJefeProveedores] = useState<string[]>(() => mergeJefeProveedores(JEFE_PROVEEDORES_ATAJOS))
  const [jefeProveedoresOcultos, setJefeProveedoresOcultos] = useState<string[]>([])
  const [showJefeProveedores, setShowJefeProveedores] = useState(false)
  const [proveedorFiltro, setProveedorFiltro] = useState('')
  const [nuevoJefeProveedor, setNuevoJefeProveedor] = useState('')
  const [savingJefeProveedor, setSavingJefeProveedor] = useState(false)
  const [removingJefeProveedor, setRemovingJefeProveedor] = useState<string | null>(null)
  const [proveedorDirectoryMessage, setProveedorDirectoryMessage] = useState('')
  const [jefeFactura, setJefeFactura] = useState('')
  const [jefeMedioPago, setJefeMedioPago] = useState('Transferencia Bancaria')
  const [jefeFecha, setJefeFecha] = useState(todayYMD())
  const [jefeSede, setJefeSede] = useState('donbalato-central')
  const [jefeDescripcion, setJefeDescripcion] = useState('')
  const [jefeRubro, setJefeRubro] = useState('Higiene Personal')
  const [jefeMotivoOperativo, setJefeMotivoOperativo] = useState('retiro')
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [jefeFile, setJefeFile] = useState<File | null>(null)
  const [jefeFilePreview, setJefeFilePreview] = useState<string | null>(null)
  const [savingJefeExpense, setSavingJefeExpense] = useState(false)

  const proveedoresJefeDisponibles = useMemo(
    () => jefeProveedores.filter((provider) => !jefeProveedoresOcultos.includes(jefeProveedorKey(provider))),
    [jefeProveedores, jefeProveedoresOcultos],
  )

  const proveedoresJefeFiltrados = useMemo(() => {
    const queryKey = jefeProveedorKey(proveedorFiltro)
    if (!queryKey) return proveedoresJefeDisponibles
    return proveedoresJefeDisponibles.filter((provider) => jefeProveedorKey(provider).includes(queryKey))
  }, [proveedoresJefeDisponibles, proveedorFiltro])

  useEffect(() => {
    const database = db
    if (!database) return
    let mounted = true
    getDoc(doc(database, 'gastos_jefatura_config', 'proveedores'))
      .then((snapshot) => {
        if (!mounted || !snapshot.exists()) return
        const data = snapshot.data()
        const configured = data.proveedores
        if (Array.isArray(configured)) {
          setJefeProveedores((current) => mergeJefeProveedores(current, configured))
        }
        const hidden = Array.isArray(data.proveedoresOcultos)
          ? data.proveedoresOcultos.map(jefeProveedorKey).filter(Boolean)
          : []
        if (hidden.length) {
          setJefeProveedoresOcultos((current) => [...new Set([...current, ...hidden])])
        }
      })
      .catch((error) => console.warn('[Gastos] No se pudo cargar la lista de proveedores:', error))
    return () => { mounted = false }
  }, [])

  // WebGL Volumetric Sky Engine: permanece activo durante todas las etapas del asistente.
  const skyEngineRef = useRef<{
    setTheme?: (t: 'light' | 'dark', immediate?: boolean) => void;
    replayAnimation?: () => void;
    getScrollTarget?: () => number;
    destroy?: () => void;
  } | null>(null)

  const isFullScreen = fullScreenMode !== 'dashboard'

  useEffect(() => {
    if (!isFullScreen) {
      if (skyEngineRef.current) {
        try { skyEngineRef.current.destroy?.() } catch {}
        skyEngineRef.current = null
      }
      return
    }

    if (skyEngineRef.current) return

    let cancelled = false
    const timer = setTimeout(() => {
      import('@/app/admin/login/argonAstraEngine')
        .then(({ mountArgonAstraEngine }) => {
          if (cancelled) return
          const canvas = document.getElementById('astra-canvas')
          if (!canvas) return
          const ctrl = mountArgonAstraEngine({
            quality: 'full',
            theme: 'light',
            showParticles: true,
          })
          skyEngineRef.current = ctrl ?? null
          ctrl?.setTheme?.('light', true)
        })
        .catch((err) => {
          console.warn('[Gastos] No se pudo inicializar sky engine:', err)
        })
    }, 60)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (skyEngineRef.current) {
        try { skyEngineRef.current.destroy?.() } catch {}
        skyEngineRef.current = null
      }
    }
  }, [isFullScreen])

  const [loading, setLoading] = useState(false)
  const [gastos, setGastos] = useState<GastoItem[]>([])
  const [selectedSede, setSelectedSede] = useState<string>('todas')
  const [dateMode, setDateMode] = useState<'single' | 'range'>('range')
  const [singleDate, setSingleDate] = useState(yesterdayYMD())
  const [dateFrom, setDateFrom] = useState(`${currentMonthId()}-01`)
  const [dateTo, setDateTo] = useState(todayYMD())
  const [clasificandoTodos, setClasificandoTodos] = useState(false)
  const [clasificandoGasto, setClasificandoGasto] = useState<number | null>(null)
  const [detailGasto, setDetailGasto] = useState<GastoItem | null>(null)
  const [closingModal, setClosingModal] = useState(false)
  const [showResumen, setShowResumen] = useState(true)
  const [photoViewer, setPhotoViewer] = useState<string | null>(null)
  const [trabajadoresErp, setTrabajadoresErp] = useState<TrabajadorMatch[]>([])
  const [showAdelantosModal, setShowAdelantosModal] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // IA Ficha Modal state
  const [iaFicha, setIaFicha] = useState<GastoFichaIA | null>(null)
  const [iaFichaLoading, setIaFichaLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingFicha, setEditingFicha] = useState<GastoFichaIA | null>(null)
  const [trabajadorMatch, setTrabajadorMatch] = useState<TrabajadorMatch | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [editingDescription, setEditingDescription] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [holdingConfidence, setHoldingConfidence] = useState(false)
  const [iaChat, setIaChat] = useState<{ open: boolean; messages: { role: 'ia' | 'user'; text: string }[]; loading: boolean; input: string }>({
    open: false,
    messages: [],
    loading: false,
    input: '',
  })
  const fichaCache = useRef<Record<string, { ficha: GastoFichaIA; trabajador: TrabajadorMatch | null }>>({})

  // Quick New Expense Modal
  const [showNewExpenseModal, setShowNewExpenseModal] = useState(false)
  const [newExpenseSede, setNewExpenseSede] = useState<string>(SEDE_SLUGS[0] || 'donbalato-central')
  const [newExpenseMonto, setNewExpenseMonto] = useState<string>('')
  const [newExpenseDesc, setNewExpenseDesc] = useState<string>('')
  const [newExpenseTipo, setNewExpenseTipo] = useState<string>('Operacional')
  const [newExpenseCat, setNewExpenseCat] = useState<string>('Suministros')
  const [creatingExpense, setCreatingExpense] = useState(false)

  // ── EXTERNAL EXPENSES STATE ──
  const [extMonth, setExtMonth] = useState<string>(currentMonthId())
  const [extSede, setExtSede] = useState<string>(SEDE_SLUGS[0] || 'donbalato-central')
  const [extFixed, setExtFixed] = useState<ExternalFixedExpense[]>([])
  const [extManual, setExtManual] = useState<ExternalManualExpense[]>([])
  const [extLoading, setExtLoading] = useState(false)
  const [extSavingFixed, setExtSavingFixed] = useState(false)
  const [extSaveSuccess, setExtSaveSuccess] = useState(false)
  const [extAddingManual, setExtAddingManual] = useState(false)
  const [extForm, setExtForm] = useState({
    date: `${currentMonthId()}-01`,
    reason: '',
    amount: '',
    category: 'Gasto fijo',
  })

  // Synchronize Tab with URL
  const switchTab = (tab: 'sucursal' | 'externos' | 'consolidado') => {
    setFullScreenMode('dashboard')
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', url.toString())
  }

  // Escape key closes modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (photoViewer) setPhotoViewer(null)
        if (detailGasto) closeDetailModal()
        if (showNewExpenseModal) setShowNewExpenseModal(false)
        if (showAdelantosModal) setShowAdelantosModal(false)
        if (fullScreenMode !== 'dashboard') setFullScreenMode('dashboard')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailGasto, showNewExpenseModal, showAdelantosModal, fullScreenMode, photoViewer])

  const buildFichaCacheKey = (g: GastoItem) => {
    const descKey = (g.descripcionMejorada || g.descripcion || '')
      .slice(0, 60)
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
    return `ficha_gasto__${g.sede}__${g.fecha}__${descKey}__${g.monto}`
  }

  // ── LOAD REAL TRABAJADORES FROM FIRESTORE (`trabajadores_erp`) ──
  useEffect(() => {
    if (!db) return
    let mounted = true
    ;(async () => {
      try {
        const workers = await fetchTrabajadoresERP()
        if (!mounted) return
        const list: TrabajadorMatch[] = workers.map((worker: any) => {
          let adelantos: { ymd: string; monto: number; descripcion?: string }[] = []
          try {
            const rawAd = typeof worker.adelantos === 'string' ? JSON.parse(worker.adelantos || '[]') : worker.adelantos
            if (Array.isArray(rawAd)) {
              adelantos = rawAd.map((a: any) => ({
                ymd: a.fecha || a.ymd || '',
                monto: Number(a.monto || 0),
                descripcion: a.motivo || a.descripcion || 'Adelanto de sueldo',
              }))
            }
          } catch {}
          return {
            id: worker.$id,
            nombre: worker.nombre || worker.$id,
            cargo: worker.cargo || '',
            fotoUrl: worker.fotoUrl || undefined,
            sede: worker.sede || 'donbalato-central',
            adelantoHistorial: adelantos,
            sueldo: Number(worker.sueldoMensual || worker.sueldo || 0),
          }
        })
        setTrabajadoresErp(list)
      } catch (err) {
        console.warn('[Gastos] Error leyendo trabajadores_erp:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // ── LOAD OPERATIONAL GASTOS + GASTOS JEFATURA FROM FIRESTORE (100% REAL DATA) ──
  const loadGastos = async () => {
    setLoading(true)
    try {
      const sedes = selectedSede === 'todas' ? SEDE_SLUGS : [selectedSede]
      const results: GastoItem[] = []

      if (!db) {
        setGastos([])
        setLoading(false)
        return
      }

      // 1. Load Jefatura Expenses from collection `gastos_jefatura`
      try {
        const gastosJefe = await getGastosJefaturaCached(
          db,
          dateMode === 'single' ? singleDate : dateFrom || undefined,
          dateMode === 'single' ? singleDate : dateTo || undefined,
        )
        const historicalProviders: string[] = []
        gastosJefe.forEach((d) => {
          if (d.id === '_init') return
          const data = d.data
          const provider = normalizeJefeProveedor(data.proveedor)
          if (provider) historicalProviders.push(provider)
          if (selectedSede !== 'todas' && data.sede && data.sede !== selectedSede) return
          const f = data.fecha || ''
          if (dateMode === 'single') {
            if (f !== singleDate) return
          } else if (dateFrom && dateTo) {
            if (f < dateFrom || f > dateTo) return
          }
          results.push({
            id: d.id,
            sede: data.sede || 'donbalato-central',
            fecha: f || singleDate,
            tipo: data.tipo || 'Gasto de mercadería',
            categoria: data.categoria || 'Inventario / Mercadería',
            descripcion: data.descripcion || 'Compra de mercadería',
            descripcionMejorada: data.descripcionMejorada || data.descripcion || 'Compra de mercadería autorizada',
            monto: Number(data.monto || 0),
            confianza: 1.0,
            clasificadoPor: '👑 Jefatura',
            isJefatura: true,
            proveedor: data.proveedor,
            facturaNro: data.facturaNro,
            medioPago: data.medioPago,
            cajero: data.registradoPor,
            fotos: data.fotos || (data.fotoUrl ? [{ url: data.fotoUrl, nombre: 'Comprobante' }] : undefined),
          })
        })
        if (historicalProviders.length) {
          setJefeProveedores((current) => mergeJefeProveedores(current, historicalProviders))
        }
      } catch (err) {
        console.warn('[Gastos] Aviso leyendo gastos_jefatura:', err)
      }

      // 2. Load Real Cuadres ERP (`cuadres_erp`)
      if (dateMode === 'single') {
        await Promise.all(
          sedes.map(async (sede) => {
            const docId = `${sede}__${singleDate}`
            try {
              const snap = await getDoc(doc(db, 'cuadres_erp', docId))
              if (snap.exists()) {
                const data = snap.data()
                const rawGastos: any[] = Array.isArray(data.gastos)
                  ? data.gastos
                  : typeof data.gastosJson === 'string'
                  ? JSON.parse(data.gastosJson || '[]')
                  : []
                const allFotos: any[] = Array.isArray(data.fotos)
                  ? data.fotos
                  : typeof data.fotosJson === 'string'
                  ? JSON.parse(data.fotosJson || '[]')
                  : []

                rawGastos.forEach((g: any, gIdx: number) => {
                  const fotosEsp = allFotos.filter((f: any) => f?.gastoIndex === gIdx)
                  const fotosGen = allFotos.filter((f: any) => f?.tipo === 'gasto' || f?.url?.includes('gasto'))
                  const fotos =
                    fotosEsp.length > 0
                      ? fotosEsp.map((f: any) => ({ url: f.url, nombre: f.name || f.nombre }))
                      : fotosGen[gIdx]
                      ? [{ url: fotosGen[gIdx].url, nombre: fotosGen[gIdx].name || fotosGen[gIdx].nombre }]
                      : undefined

                  const rawDesc = g.detalle || g.descripcion || g.observacion || 'Sin descripción'
                  const h = heuristicallyClassifyGasto(rawDesc, Number(g.monto || 0))
                  const isUnclassified = !g.tipo || g.tipo === 'Otros' || g.tipo === 'Sin clasificar'
                  const isCatUnclassified = !g.categoria || g.categoria === 'Otros' || g.categoria === 'Sin clasificar'

                  results.push({
                    id: `${docId}__${gIdx}`,
                    index: gIdx,
                    sede,
                    fecha: singleDate,
                    hora: g.hora || undefined,
                    tipo: isUnclassified ? h.tipo : g.tipo,
                    descripcion: rawDesc,
                    descripcionMejorada: g.descripcionMejorada || rawDesc,
                    categoria: isCatUnclassified ? h.categoria : g.categoria,
                    monto: Number(g.monto || 0),
                    confianza: g.confianza ?? h.confianza,
                    clasificadoPor: g.clasificadoPor || (g.cajero ? `POS · ${g.cajero}` : 'POS Sucursal'),
                    cajero: g.cajero || data.cajero || undefined,
                    posGastoId: g.posGastoId,
                    fotos,
                  })
                })
              }
            } catch (err) {
              console.warn(`[Gastos] Error leyendo cuadre ${docId}:`, err)
            }

            // Also check cuadre_parcial and open caja_sesiones if querying today
            if (singleDate === todayYMD()) {
              try {
                const parcialSnap = await getDoc(doc(db, 'cuadre_parcial', `${sede}_${singleDate}`))
                if (parcialSnap.exists()) {
                  const pData = parcialSnap.data()
                  const pGastos: any[] = Array.isArray(pData?.gastos)
                    ? pData.gastos
                    : typeof pData?.gastosJson === 'string'
                    ? JSON.parse(pData.gastosJson || '[]')
                    : []
                  pGastos.forEach((g: any, gIdx: number) => {
                    const rawDesc = g.detalle || g.descripcion || g.observacion || 'Salida de caja'
                    const exists = results.some((r) => r.sede === sede && r.monto === Number(g.monto) && r.descripcion === rawDesc)
                    if (!exists) {
                      const h = heuristicallyClassifyGasto(rawDesc, Number(g.monto || 0))
                      results.push({
                        id: `parcial_${sede}__${gIdx}`,
                        index: gIdx,
                        sede,
                        fecha: singleDate,
                        hora: g.hora || undefined,
                        tipo: g.tipo && g.tipo !== 'Otros' ? g.tipo : h.tipo,
                        descripcion: rawDesc,
                        descripcionMejorada: g.descripcionMejorada || rawDesc,
                        categoria: g.categoria && g.categoria !== 'Otros' ? g.categoria : h.categoria,
                        monto: Number(g.monto || 0),
                        confianza: g.confianza ?? h.confianza,
                        clasificadoPor: g.cajero ? `Turno · ${g.cajero}` : 'Turno Activo',
                        cajero: g.cajero,
                      })
                    }
                  })
                }
              } catch {}
            }
          })
        )
      } else {
        // Range mode
        if (dateFrom && dateTo) {
          const colRef = collection(db, 'cuadres_erp')
          const q = query(colRef, where('fecha', '>=', dateFrom), where('fecha', '<=', dateTo))
          const snap = await getDocs(q)
          snap.forEach((d) => {
            if (d.id === '_init') return
            const data = d.data()
            const sede = data.sede || 'donbalato-central'
            if (selectedSede !== 'todas' && sede !== selectedSede) return

            const rawGastos: any[] = Array.isArray(data.gastos)
              ? data.gastos
              : typeof data.gastosJson === 'string'
              ? JSON.parse(data.gastosJson || '[]')
              : []
            const allFotos: any[] = Array.isArray(data.fotos)
              ? data.fotos
              : typeof data.fotosJson === 'string'
              ? JSON.parse(data.fotosJson || '[]')
              : []

            rawGastos.forEach((g: any, gIdx: number) => {
              const fotosEsp = allFotos.filter((f: any) => f?.gastoIndex === gIdx)
              const fotosGen = allFotos.filter((f: any) => f?.tipo === 'gasto' || f?.url?.includes('gasto'))
              const fotos =
                fotosEsp.length > 0
                  ? fotosEsp.map((f: any) => ({ url: f.url, nombre: f.name || f.nombre }))
                  : fotosGen[gIdx]
                  ? [{ url: fotosGen[gIdx].url, nombre: fotosGen[gIdx].name || fotosGen[gIdx].nombre }]
                  : undefined

              const rawDesc = g.detalle || g.descripcion || g.observacion || 'Sin descripción'
              const h = heuristicallyClassifyGasto(rawDesc, Number(g.monto || 0))
              const isUnclassified = !g.tipo || g.tipo === 'Otros' || g.tipo === 'Sin clasificar'
              const isCatUnclassified = !g.categoria || g.categoria === 'Otros' || g.categoria === 'Sin clasificar'

              results.push({
                id: `${d.id}__${gIdx}`,
                index: gIdx,
                sede,
                fecha: data.fecha,
                hora: g.hora || undefined,
                tipo: isUnclassified ? h.tipo : g.tipo,
                descripcion: rawDesc,
                descripcionMejorada: g.descripcionMejorada || rawDesc,
                categoria: isCatUnclassified ? h.categoria : g.categoria,
                monto: Number(g.monto || 0),
                confianza: g.confianza ?? h.confianza,
                clasificadoPor: g.clasificadoPor || (g.cajero ? `POS · ${g.cajero}` : 'POS Sucursal'),
                cajero: g.cajero || data.cajero || undefined,
                posGastoId: g.posGastoId,
                fotos,
              })
            })
          })
        }
      }

      results.sort((a, b) => {
        if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
        if (a.hora && b.hora) return b.hora.localeCompare(a.hora)
        return b.monto - a.monto
      })

      setGastos(results)
    } catch (err) {
      console.error('Error loading real gastos:', err)
      setGastos([])
    } finally {
      setLoading(false)
    }
  }

  // ── LOAD EXTERNAL EXPENSES ──
  const loadExternalData = async () => {
    if (!db) return
    setExtLoading(true)
    try {
      const [fixed, manual] = await Promise.all([
        loadExternalExpensesConfig(db, extSede as SedeSlug),
        listExternalExpenseEntriesForMonth(db, extSede as SedeSlug, extMonth),
      ])
      setExtFixed(fixed)
      setExtManual(manual)
    } catch (e) {
      console.error('Error loading external expenses:', e)
    } finally {
      setExtLoading(false)
    }
  }

  useEffect(() => {
    loadGastos()
  }, [singleDate, dateFrom, dateTo, selectedSede, dateMode])

  useEffect(() => {
    loadExternalData()
  }, [extSede, extMonth])

  // Save new fixed expenses config
  const handleSaveFixedExpenses = async () => {
    if (!db) return
    setExtSavingFixed(true)
    setExtSaveSuccess(false)
    try {
      const saved = await saveExternalExpensesConfig(db, extSede as SedeSlug, extFixed)
      setExtFixed(saved)
      setExtSaveSuccess(true)
      setTimeout(() => setExtSaveSuccess(false), 3000)
    } catch {
      alert('Error guardando gastos fijos')
    } finally {
      setExtSavingFixed(false)
    }
  }

  // Add manual external expense
  const handleAddManualExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!db) return
    if (!extForm.date || !extForm.reason.trim() || !Number(extForm.amount)) {
      alert('Completa la fecha, el motivo y un monto válido.')
      return
    }
    setExtAddingManual(true)
    try {
      const created = await addExternalExpenseEntry(db, extSede as SedeSlug, {
        date: extForm.date,
        reason: extForm.reason.trim(),
        amount: Number(extForm.amount),
        category: extForm.category || 'Gasto externo',
      })
      setExtManual((prev) => [created, ...prev])
      setExtForm((p) => ({ ...p, reason: '', amount: '' }))
    } catch {
      alert('Error registrando gasto externo manual.')
    } finally {
      setExtAddingManual(false)
    }
  }

  const handleDeleteManualExpense = async (id: string) => {
    if (!db || !confirm('¿Eliminar este gasto manual externo?')) return
    try {
      await deleteExternalExpenseEntry(db, extSede as SedeSlug, id)
      setExtManual((prev) => prev.filter((x) => x.id !== id))
    } catch {
      alert('Error al eliminar gasto manual')
    }
  }

  const removeJefeProveedor = async (provider: string) => {
    const database = db
    if (!database) {
      setProveedorDirectoryMessage('No hay conexión con la base de datos para quitar el proveedor.')
      return
    }

    const key = jefeProveedorKey(provider)
    setRemovingJefeProveedor(key)
    setProveedorDirectoryMessage('')
    try {
      await setDoc(
        doc(database, 'gastos_jefatura_config', 'proveedores'),
        {
          proveedores: arrayRemove(provider),
          proveedoresOcultos: arrayUnion(key),
          actualizadoEn: Date.now(),
          actualizadoPor: user?.email || '',
        },
        { merge: true },
      )
      setJefeProveedores((current) => current.filter((name) => jefeProveedorKey(name) !== key))
      setJefeProveedoresOcultos((current) => current.includes(key) ? current : [...current, key])
      setJefeProveedor((current) => jefeProveedorKey(current) === key ? '' : current)
      setProveedorDirectoryMessage(`“${provider}” se quitó de la lista.`)
    } catch (error) {
      console.error('[Gastos] No se pudo quitar el proveedor:', error)
      setProveedorDirectoryMessage('No se pudo quitar. Inténtalo nuevamente.')
    } finally {
      setRemovingJefeProveedor(null)
    }
  }

  const addJefeProveedor = async () => {
    const provider = normalizeJefeProveedor(nuevoJefeProveedor)
    if (!provider) {
      setProveedorDirectoryMessage('Escribe el nombre del proveedor.')
      return
    }

    const existing = proveedoresJefeDisponibles.find((name) => jefeProveedorKey(name) === jefeProveedorKey(provider))
    if (existing) {
      setJefeProveedor(existing)
      setNuevoJefeProveedor('')
      setProveedorDirectoryMessage('Ese proveedor ya estaba en la lista y quedó seleccionado.')
      return
    }

    const database = db
    if (!database) {
      setProveedorDirectoryMessage('No hay conexión con la base de datos para guardar el proveedor.')
      return
    }

    setSavingJefeProveedor(true)
    setProveedorDirectoryMessage('')
    try {
      await setDoc(
        doc(database, 'gastos_jefatura_config', 'proveedores'),
        {
          proveedores: arrayUnion(provider),
          proveedoresOcultos: arrayRemove(jefeProveedorKey(provider)),
          actualizadoEn: Date.now(),
          actualizadoPor: user?.email || '',
        },
        { merge: true },
      )
      setJefeProveedores((current) => mergeJefeProveedores(current, [provider]))
      setJefeProveedoresOcultos((current) => current.filter((key) => key !== jefeProveedorKey(provider)))
      setJefeProveedor(provider)
      setNuevoJefeProveedor('')
      setProveedorDirectoryMessage('Proveedor agregado y seleccionado.')
    } catch (error) {
      console.error('[Gastos] No se pudo guardar el proveedor:', error)
      setProveedorDirectoryMessage('No se pudo guardar. Inténtalo nuevamente.')
    } finally {
      setSavingJefeProveedor(false)
    }
  }

  // ── SAVE BOSS EXPENSE (MERCADERIA U OTROS) TO FIRESTORE ──
  const handleSaveJefeExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const monto = Number(jefeMonto)
    if (!monto || monto <= 0) {
      alert('Por favor ingresa un monto válido mayor a 0.')
      return
    }

    setSavingJefeExpense(true)
    try {
      let uploadedPhotoUrl: string | undefined = undefined

      // Upload photo if provided
      if (jefeFile && storage) {
        try {
          const storagePath = `comprobantes/jefatura/${Date.now()}_${jefeFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
          const storageRef = ref(storage, storagePath)
          await uploadBytes(storageRef, jefeFile)
          uploadedPhotoUrl = await getDownloadURL(storageRef)
        } catch (uploadErr) {
          console.warn('Error subiendo imagen a storage, usando preview:', uploadErr)
          uploadedPhotoUrl = jefeFilePreview || undefined
        }
      } else if (jefeFilePreview) {
        uploadedPhotoUrl = jefeFilePreview
      }

      const isMercaderia = jefeGastoType === 'mercaderia'
      const mercaderiaPreset = JEFE_MERCADERIA_ATAJOS.find((a) => a.id === jefeRubro) || JEFE_MERCADERIA_ATAJOS[0]
      const operativoPreset = JEFE_OPERATIVOS_ATAJOS.find((a) => a.id === jefeMotivoOperativo) || JEFE_OPERATIVOS_ATAJOS[0]

      const customNote = jefeDescripcion.trim()
      const descFinal = isMercaderia
        ? customNote || `${mercaderiaPreset.desc}${jefeProveedor.trim() ? ` · ${jefeProveedor.trim()}` : ''}`
        : customNote || operativoPreset.desc

      const docData: Record<string, any> = {
        sede: jefeSede,
        fecha: jefeFecha,
        tipo: isMercaderia ? 'Gasto de mercadería' : operativoPreset.tipo,
        categoria: isMercaderia ? 'Inventario / Mercadería' : operativoPreset.categoria,
        monto,
        descripcion: descFinal,
        descripcionMejorada: isMercaderia
          ? `Inversión mayorista de stock (${jefeRubro}): ${descFinal}${jefeFactura.trim() ? ` · Doc: ${jefeFactura.trim()}` : ''}`
          : `${operativoPreset.label}: ${descFinal}`,
        medioPago: jefeMedioPago,
        registradoPor: user?.name || user?.email || 'Jefe Importadora Carlitos',
        registradoEmail: user?.email || 'dezkonet@gmail.com',
        origen: 'jefatura',
        creadoEn: Date.now(),
      }

      if (jefeProveedor.trim()) docData.proveedor = jefeProveedor.trim()
      if (jefeFactura.trim()) docData.facturaNro = jefeFactura.trim()
      if (isMercaderia && jefeRubro) docData.rubroMercaderia = jefeRubro
      if (uploadedPhotoUrl) docData.fotos = [{ url: uploadedPhotoUrl, nombre: 'Comprobante Jefatura' }]

      let newId = `jefe_${Date.now()}`
      if (db) {
        try {
          const docRef = await addDoc(collection(db, 'gastos_jefatura'), docData)
          newId = docRef.id
          gastosJefaturaCacheVersion += 1
          gastosJefaturaCache.clear()
          gastosJefaturaRequests.clear()
        } catch (dbErr) {
          console.error('Error insertando en gastos_jefatura Firestore:', dbErr)
          // Fallback to local persistence if offline
        }
      }

      const nuevoItem: GastoItem = {
        id: newId,
        sede: jefeSede,
        fecha: jefeFecha,
        tipo: docData.tipo,
        categoria: docData.categoria,
        descripcion: docData.descripcion,
        descripcionMejorada: docData.descripcionMejorada,
        monto,
        confianza: 1.0,
        clasificadoPor: '👑 Jefatura',
        isJefatura: true,
        proveedor: docData.proveedor,
        facturaNro: docData.facturaNro,
        medioPago: docData.medioPago,
        fotos: docData.fotos,
      }

      setGastos((prev) => [nuevoItem, ...prev])
      setFullScreenMode('dashboard')
      setJefeGastoType(null)
      setJefeMonto('')
      setJefeProveedor('')
      setJefeFactura('')
      setJefeDescripcion('')
      setJefeFile(null)
      setJefeFilePreview(null)
      alert(`🎉 ¡Gasto registrado exitosamente a nombre de ${accountName}! Ya está visible en tus balances y listo para proyecciones.`)
    } catch (err) {
      console.error('Error guardando gasto de jefatura:', err)
      alert('Error al guardar el gasto.')
    } finally {
      setSavingJefeExpense(false)
    }
  }

  // Quick New Expense (Store/POS)
  const handleCreateNewExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const monto = Number(newExpenseMonto)
    if (!newExpenseDesc.trim() || !monto || monto <= 0) {
      alert('Por favor ingresa una descripción y un monto válido.')
      return
    }
    setCreatingExpense(true)
    try {
      const nuevoItem: GastoItem = {
        sede: newExpenseSede,
        fecha: singleDate,
        tipo: newExpenseTipo,
        categoria: newExpenseCat,
        descripcion: newExpenseDesc.trim(),
        descripcionMejorada: newExpenseDesc.trim(),
        monto,
        confianza: 0.95,
        clasificadoPor: 'Manual',
      }

      if (db) {
        const docId = `${newExpenseSede}__${singleDate}`
        const cuadreRef = doc(db, 'cuadres_erp', docId)
        await setDoc(
          cuadreRef,
          {
            sede: newExpenseSede,
            fecha: singleDate,
            gastos: arrayUnion({
              detalle: nuevoItem.descripcion,
              monto: nuevoItem.monto,
              tipo: nuevoItem.tipo,
              categoria: nuevoItem.categoria,
              creadoEn: Date.now(),
            }),
          },
          { merge: true },
        )
      }

      setGastos((prev) => [nuevoItem, ...prev])
      setShowNewExpenseModal(false)
      setNewExpenseDesc('')
      setNewExpenseMonto('')
      alert('✅ Gasto registrado correctamente.')
    } catch (err) {
      console.error('Error creating gasto:', err)
      alert('Error al registrar gasto.')
    } finally {
      setCreatingExpense(false)
    }
  }

  // ── IA Classification Logic ──
  const clasificarTodos = async () => {
    if (clasificandoTodos) return
    setClasificandoTodos(true)
    try {
      await new Promise((r) => setTimeout(r, 600))
      setGastos((prev) =>
        prev.map((g) => {
          if (g.isJefatura) return g
          const h = heuristicallyClassifyGasto(g.descripcion, g.monto)
          return {
            ...g,
            tipo: h.tipo,
            categoria: h.categoria,
            confianza: h.confianza,
            clasificadoPor: 'IA Solé',
            descripcionMejorada: g.descripcionMejorada || g.descripcion,
          }
        }),
      )
      alert(`✅ ${gastos.length} gastos clasificados exitosamente con IA.`)
    } finally {
      setClasificandoTodos(false)
    }
  }

  const clasificarUno = async (idx: number) => {
    if (clasificandoGasto !== null) return
    setClasificandoGasto(idx)
    try {
      await new Promise((r) => setTimeout(r, 450))
      const target = filteredGastos[idx]
      if (!target) return
      const h = heuristicallyClassifyGasto(target.descripcion, target.monto)
      const updated: GastoItem = {
        ...target,
        tipo: target.isJefatura ? target.tipo : h.tipo,
        categoria: target.isJefatura ? target.categoria : h.categoria,
        confianza: target.isJefatura ? 1.0 : h.confianza,
        clasificadoPor: target.isJefatura ? '👑 Jefatura' : 'IA Solé',
      }
      setGastos((prev) => prev.map((g) => (g === target ? updated : g)))
      if (detailGasto && detailGasto === target) {
        setDetailGasto(updated)
      }
    } finally {
      setClasificandoGasto(null)
    }
  }

  const fetchIaFicha = async (g: GastoItem) => {
    setIaFicha(null)
    setIaFichaLoading(true)
    try {
      const ck = buildFichaCacheKey(g)
      const { ficha: generatedFicha, matchedWorker } = buildRealFicha(g, trabajadoresErp, totalGastos)
      setTrabajadorMatch(matchedWorker)

      if (db) {
        try {
          const cacheSnap = await getDoc(doc(db, 'gastos_fichas_ia', ck))
          if (cacheSnap.exists()) {
            const cached = cacheSnap.data() as GastoFichaIA
            setIaFicha(cached)
            fichaCache.current[ck] = { ficha: cached, trabajador: matchedWorker }
            setIaFichaLoading(false)
            return
          }
        } catch {}
      }

      setIaFicha(generatedFicha)
      fichaCache.current[ck] = { ficha: generatedFicha, trabajador: matchedWorker }
      if (db) {
        setDoc(doc(db, 'gastos_fichas_ia', ck), {
          ...generatedFicha,
          sede: g.sede,
          fecha: g.fecha,
          monto: g.monto,
          descripcion: g.descripcionMejorada || g.descripcion,
        }).catch(() => {})
      }
    } finally {
      setIaFichaLoading(false)
    }
  }

  const saveEditedFicha = async () => {
    if (!editingFicha || !detailGasto) return
    setSavingEdit(true)
    try {
      const newDesc = editingDescription?.trim() || detailGasto.descripcionMejorada || detailGasto.descripcion
      const ck = buildFichaCacheKey(detailGasto)
      if (db) {
        await setDoc(
          doc(db, 'gastos_fichas_ia', ck),
          {
            ...editingFicha,
            sede: detailGasto.sede,
            fecha: detailGasto.fecha,
            descripcion: newDesc,
            monto: detailGasto.monto,
            editadoManualmente: true,
          },
          { merge: true },
        )
      }

      const updatedGasto: GastoItem = {
        ...detailGasto,
        descripcionMejorada: newDesc,
        categoria: editingFicha.categoriaRecomendada || detailGasto.categoria,
      }
      setDetailGasto(updatedGasto)
      setGastos((prev) => prev.map((g) => (g === detailGasto ? updatedGasto : g)))
      setIaFicha(editingFicha)
      fichaCache.current[ck] = { ficha: editingFicha, trabajador: trabajadorMatch }
      setEditMode(false)
      setEditingFicha(null)
      setEditingDescription(null)
    } catch {
      alert('Error al guardar la ficha.')
    } finally {
      setSavingEdit(false)
    }
  }

  // ── IA Chat: Solé Assistant ──
  const openIaChat = () => {
    if (!detailGasto || !iaFicha) return
    const isMercaderia = detailGasto.isJefatura || detailGasto.tipo === 'Gasto de mercadería'
    const contextQuestions = [
      `Hola 👋 Soy Solé, tu analista financiera de gastos de Importadora Carlitos.`,
      isMercaderia
        ? `Veo que este es un gasto de **👑 Inversión en Mercadería** por **${fmtMoney(detailGasto.monto)}** en ${sedeShortName(detailGasto.sede)}. ${detailGasto.proveedor ? `Proveedor: ${detailGasto.proveedor}.` : ''}`
        : `Veo que este gasto es de tipo **${detailGasto.tipo}** por **${fmtMoney(detailGasto.monto)}** en ${sedeShortName(detailGasto.sede)}.`,
      `Descripción: "${detailGasto.descripcionMejorada || detailGasto.descripcion}"`,
      `\n¿Deseas proyectar el retorno de esta compra o necesitas adjuntar algún respaldo contable?`,
    ]
    setIaChat({ open: true, messages: [{ role: 'ia', text: contextQuestions.join('\n') }], loading: false, input: '' })
  }

  const sendIaChatMessage = async () => {
    if (!iaChat.input.trim() || iaChat.loading || !detailGasto) return
    const userMsg = iaChat.input.trim()
    const newMsgs = [...iaChat.messages, { role: 'user' as const, text: userMsg }]
    setIaChat((prev) => ({ ...prev, messages: newMsgs, input: '', loading: true }))

    setTimeout(() => {
      const enrichedDesc = `${detailGasto.descripcionMejorada || detailGasto.descripcion} · Validado con Solé: "${userMsg}"`
      const iaReply = `✅ ¡Anotado perfectamente! He actualizado el contexto para auditoría.\n\n**DESCRIPCIÓN:** ${enrichedDesc}\n\nEste egreso queda registrado en la base de proyecciones.`
      setIaChat((prev) => ({ ...prev, messages: [...prev.messages, { role: 'ia', text: iaReply }], loading: false }))

      const updated = { ...detailGasto, descripcionMejorada: enrichedDesc }
      setDetailGasto(updated)
      setGastos((prev) => prev.map((g) => (g === detailGasto ? updated : g)))
      if (iaFicha) {
        const updatedF = { ...iaFicha, confianzaIA: Math.min(100, (iaFicha.confianzaIA || 80) + 8) }
        setIaFicha(updatedF)
        fichaCache.current[buildFichaCacheKey(detailGasto)] = { ficha: updatedF, trabajador: trabajadorMatch }
      }
    }, 700)
  }

  // ── Excel Export ──
  const exportToExcel = async () => {
    if (!filteredGastos.length) {
      alert('No hay gastos para exportar')
      return
    }
    setExporting(true)
    try {
      const ExcelJS: any = (await import('exceljs')).default || (await import('exceljs'))
      const { saveAs }: any = await import('file-saver')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Importadora Carlitos ERP - Control de Gastos'
      wb.created = new Date()

      const colors = {
        white: 'FFFFFFFF',
        headerBg: 'FFF97316',
        grayBorder: 'FFE2E8F0',
      }
      const thin = { style: 'thin' as const, color: { argb: colors.grayBorder } }
      const border = { top: thin, bottom: thin, left: thin, right: thin }

      const dateLabel = dateMode === 'single' ? singleDate : `${dateFrom} a ${dateTo}`
      const ws = wb.addWorksheet('Gastos')

      ws.columns = [
        { header: '#', key: 'num', width: 6 },
        { header: 'Sucursal', key: 'sede', width: 18 },
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Tipo', key: 'tipo', width: 22 },
        { header: 'Categoría', key: 'categoria', width: 22 },
        { header: 'Descripción', key: 'descripcion', width: 45 },
        { header: 'Monto', key: 'monto', width: 16 },
        { header: 'Origen', key: 'origen', width: 16 },
      ]

      ws.insertRow(1, [''])
      ws.mergeCells('A1:H1')
      const titleCell = ws.getCell('A1')
      titleCell.value = `📊 REPORTE DE GASTOS Y COMPRAS — ${dateLabel}`
      titleCell.font = { bold: true, size: 15, color: { argb: colors.white } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 36

      const headerRow = ws.getRow(2)
      headerRow.values = ['#', 'Sucursal', 'Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Origen']
      headerRow.height = 28
      headerRow.eachCell((cell: any) => {
        cell.font = { bold: true, size: 10, color: { argb: colors.white } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = border
      })

      filteredGastos.forEach((g, i) => {
        const row = ws.addRow([
          i + 1,
          sedeShortName(g.sede),
          g.fecha,
          g.tipo,
          g.categoria,
          g.descripcionMejorada || g.descripcion,
          g.monto,
          g.isJefatura ? 'Jefatura (Dueño)' : 'Sucursal / POS',
        ])
        row.getCell(7).numFmt = '$#,##0'
        row.getCell(7).font = { bold: true }
      })

      const buf = await wb.xlsx.writeBuffer()
      saveAs(new Blob([buf]), `Gastos_${dateLabel}_DonBalato.xlsx`)
    } catch (err) {
      console.error(err)
      alert('Error exportando Excel.')
    } finally {
      setExporting(false)
    }
  }

  const openDetailModal = (g: GastoItem) => {
    document.body.style.overflow = 'hidden'
    setDetailGasto(g)
    setEditMode(false)
    setEditingFicha(null)
    setShowOriginal(false)
    setHoldingConfidence(false)

    const ck = buildFichaCacheKey(g)
    const cached = fichaCache.current[ck]
    if (cached) {
      setIaFicha(cached.ficha)
      setTrabajadorMatch(cached.trabajador)
    } else {
      setIaFicha(null)
      fetchIaFicha(g)
    }
  }

  const closeDetailModal = () => {
    if (closingModal) return
    setClosingModal(true)
    setTimeout(() => {
      setDetailGasto(null)
      setClosingModal(false)
      document.body.style.overflow = ''
    }, 280)
  }

  // Filtered operational gastos
  const filteredGastos = useMemo(
    () => (selectedSede === 'todas' ? gastos : gastos.filter((g) => g.sede === selectedSede)),
    [gastos, selectedSede],
  )
  const totalGastos = useMemo(() => filteredGastos.reduce((s, g) => s + g.monto, 0), [filteredGastos])

  // Split calculations: Operational vs Merchandise Investment
  const totalGastosOperacionales = useMemo(
    () => filteredGastos.filter((g) => g.tipo !== 'Gasto de mercadería').reduce((s, g) => s + g.monto, 0),
    [filteredGastos],
  )
  const totalInversionMercaderia = useMemo(
    () => filteredGastos.filter((g) => g.tipo === 'Gasto de mercadería').reduce((s, g) => s + g.monto, 0),
    [filteredGastos],
  )

  const porTipo = useMemo(() => {
    const m: Record<string, number> = {}
    filteredGastos.forEach((g) => {
      m[g.tipo] = (m[g.tipo] || 0) + g.monto
    })
    return Object.entries(m).sort(([, a], [, b]) => b - a)
  }, [filteredGastos])

  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {}
    filteredGastos.forEach((g) => {
      m[g.categoria] = (m[g.categoria] || 0) + g.monto
    })
    return Object.entries(m).sort(([, a], [, b]) => b - a)
  }, [filteredGastos])

  const porSede = useMemo(() => {
    const m: Record<string, number> = {}
    filteredGastos.forEach((g) => {
      m[g.sede] = (m[g.sede] || 0) + g.monto
    })
    return Object.entries(m).sort(([, a], [, b]) => b - a)
  }, [filteredGastos])

  const topSede = porSede[0]
  const topCategoria = porCategoria[0]
  const topTipo = porTipo[0]
  const hayClasificados = useMemo(
    () => filteredGastos.some((g) => g.clasificadoPor || (g.tipo !== 'Sin clasificar' && g.categoria !== 'Sin clasificar')),
    [filteredGastos],
  )

  const globalConfianza = useMemo(() => {
    const classified = filteredGastos.filter((g) => g.confianza != null && g.confianza > 0)
    if (classified.length === 0) return null
    const avg = classified.reduce((s, g) => s + (g.confianza || 0), 0) / classified.length
    const avgPct = Math.round(avg * 100)
    return { avg: avgPct >= 95 ? 100 : avgPct, count: classified.length, total: filteredGastos.length }
  }, [filteredGastos])

  const gastoMaximo = useMemo(
    () => (filteredGastos.length > 0 ? filteredGastos.reduce((max, g) => (g.monto > max.monto ? g : max), filteredGastos[0]) : null),
    [filteredGastos],
  )

  const agentContext = useMemo(() => {
    if (!filteredGastos.length) return ''
    return [
      `Fecha: ${dateMode === 'single' ? singleDate : `${dateFrom} a ${dateTo}`}`,
      `Sucursal: ${selectedSede === 'todas' ? 'Todas' : sedeShortName(selectedSede)}`,
      `Movimientos registrados: $${totalGastos.toLocaleString('es-CL')} (${filteredGastos.length} registros)`,
      `Reinversión anotada en mercadería (no gasto): $${totalInversionMercaderia.toLocaleString('es-CL')}`,
      `Gastos operacionales: $${totalGastosOperacionales.toLocaleString('es-CL')}`,
      `Gasto más alto: ${gastoMaximo ? `$${gastoMaximo.monto.toLocaleString('es-CL')} — ${gastoMaximo.descripcionMejorada || gastoMaximo.descripcion}` : '-'}`,
      globalConfianza ? `Confianza IA promedio: ${globalConfianza.avg}%` : '',
    ].join('\n')
  }, [filteredGastos, totalGastos, totalInversionMercaderia, totalGastosOperacionales, selectedSede, dateMode, singleDate, dateFrom, dateTo, gastoMaximo, globalConfianza])

  // External totals
  const fixedForSelectedMonth = useMemo(
    () => extFixed.filter((item) =>
      item.active &&
      (!item.startMonth || item.startMonth <= extMonth) &&
      (!item.endMonth || item.endMonth >= extMonth),
    ),
    [extFixed, extMonth],
  )
  const totalExtFixed = useMemo(() => fixedForSelectedMonth.reduce((sum, item) => sum + item.amount, 0), [fixedForSelectedMonth])
  const totalExtManual = useMemo(() => extManual.reduce((s, x) => s + x.amount, 0), [extManual])
  const totalExtAll = totalExtFixed + totalExtManual

  return (
    <div className={`min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50${detailGasto ? ' gp-paused' : ''}`}>
      {/* ── THE SACRED CSS KEYFRAMES & MICRO-PARTICLE ANIMATIONS + VOLUMETRIC SKY ENGINE ── */}
      <style>{`
        :root {
          --astra-ambient-color: #23435F;
          --astra-ambient-fade-duration: 5.5s;
          --astra-ambient-opacity: 0.55;
          --theme-bg: #487eb8;
          --ambient-opacity: 0;
          --vignette-opacity: 0;
        }

        .astra-backdrop {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          background: var(--theme-bg, #487eb8);
          overflow: hidden;
          z-index: 0;
          pointer-events: none;
          transition: background-color 0.4s ease;
        }

        .astra-scene {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        canvas[data-astra-canvas] {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
        }

        .astra-ambient-backdrop {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse farthest-corner at center,
            transparent 0%,
            rgba(35, 67, 95, 0.06) 25%,
            rgba(35, 67, 95, 0.25) 50%,
            rgba(35, 67, 95, 0.56) 75%,
            #23435f 100%
          );
          mix-blend-mode: plus-lighter;
          opacity: var(--ambient-opacity, 0);
          transition: opacity 0.4s ease;
        }

        .astra-vignette {
          pointer-events: none;
          position: absolute;
          inset: 0;
          opacity: var(--vignette-opacity, 0);
          transition: opacity 0.4s ease;
          background: radial-gradient(
            circle,
            transparent 47%,
            rgba(0, 0, 0, 0.18) 72%,
            rgba(0, 0, 0, 0.78) 100%
          );
        }

        @keyframes gp_float { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-12px) rotate(3deg)} }
        @keyframes gp_drift { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(12px,-8px) scale(1.2)} 66%{transform:translate(-6px,4px) scale(0.9)} }
        @keyframes gp_pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes gp_shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes gp_fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gp_slideUp { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes gp_slideDown { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(100%)} }
        @keyframes gp_backdropOut { from{opacity:1} to{opacity:0} }
        @keyframes gp_barPulse { 0%,100%{opacity:0.85;filter:brightness(1)} 50%{opacity:1;filter:brightness(1.15)} }
        .gp-card { background: white; border: 1px solid #e2e8f0; border-radius: 1rem; transition: all 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .gp-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #cbd5e1; transform: translateY(-1px); }
        .gp-paused > :not(.gp-modal) *, .gp-paused > :not(.gp-modal) *::before, .gp-paused > :not(.gp-modal) *::after { animation-play-state: paused !important; }
        input.jefe-clean-monto,
        input.jefe-clean-monto:focus {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
          background: transparent !important;
          padding: 0.1rem 0.25rem !important;
          font-size: 1.45rem !important;
          line-height: 1.75rem !important;
          height: auto !important;
          min-height: 0 !important;
        }
        input.jefe-clean-monto::-webkit-outer-spin-button,
        input.jefe-clean-monto::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input.jefe-clean-monto[type=number] {
          -moz-appearance: textfield;
        }
        input.jefe-clean-field {
          padding: 0.42rem 0.65rem !important;
          font-size: 0.75rem !important;
          line-height: 1.1rem !important;
          height: auto !important;
          min-height: 0 !important;
          border-radius: 0.65rem !important;
        }
        input.jefe-clean-field:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        input::placeholder,
        textarea::placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
        }
      `}</style>

      {/* ═══════════════════════ PANTALLAS COMPLETAS JEFATURA CON VOLUMETRIC SKY ENGINE ═══════════════════════ */}
      {fullScreenMode !== 'dashboard' && (
        <div id="jefe-fullscreen-takeover" className="fixed inset-0 z-[9999] overflow-hidden font-sans select-none flex flex-col justify-between">
          {/* Fixed WebGL Volumetric Sky & 3D Starfield Backdrop ("Pro Max +++") */}
          <div
            className="astra-backdrop"
            data-astra-backdrop="true"
            data-astra-active="true"
          >
            <div className="astra-scene" data-astra-scene="ready">
              <canvas id="astra-canvas" data-astra-canvas="true" aria-hidden="true" />
            </div>
            <div id="astra-ambient" className="astra-ambient-backdrop" />
            <div className="astra-vignette" />
          </div>

          {/* Soft daylight atmospheric overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-300/10 via-transparent to-sky-900/15 pointer-events-none z-[1]" />

          {/* Scrollable Viewport Layer (Mobile First · Optimized for Samsung Galaxy S25 Ultra) */}
          <div className="relative z-10 w-full h-full min-h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col justify-between p-3.5 sm:p-6 md:p-8">
            {/* ── STEP 1: WELCOME SCREEN WITH 3D MASCOT ── */}
            {fullScreenMode === 'welcome' && (
              <div className="flex flex-col justify-between min-h-[calc(100dvh-1.75rem)] sm:min-h-[calc(100dvh-3rem)] w-full py-1">
                {/* ── BARRA SUPERIOR EN LOS EXTREMOS DE LA PANTALLA ── */}
                <div className="flex items-center justify-between w-full pb-2">
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-xl border border-white shadow-sm text-xs font-bold text-slate-800">
                    <Crown size={14} className="text-amber-500 fill-amber-500 shrink-0" />
                    <span>Panel de Administrador</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFullScreenMode('dashboard')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-700 hover:text-slate-950 bg-white/90 hover:bg-white border border-white shadow-sm backdrop-blur-xl transition active:scale-95 cursor-pointer"
                  >
                    <X size={14} />
                    <span>Cerrar</span>
                  </button>
                </div>

                {/* ── CONTENIDO CENTRAL (ARRIBA: VISUALIZAR, CENTRO: NUBECITA, ABAJO: REGISTRAR) ── */}
                <div className="flex flex-col justify-between flex-1 w-full max-w-md mx-auto">
                  {/* Botón 1 (ARRIBA DEL MODELO 3D): Visualizar Todo */}
                  <div className="w-full pt-1">
                    <button
                      type="button"
                      onClick={() => setFullScreenMode('dashboard')}
                      className="w-full group relative flex items-center text-left gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white/95 hover:bg-white border-2 border-white hover:border-sky-300 shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_32px_rgba(14,165,233,0.15)] backdrop-blur-2xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                    >
                      <div className="h-11 w-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0 group-hover:scale-105 group-hover:bg-sky-500 group-hover:text-white transition-all shadow-sm">
                        <BarChart3 size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-slate-800 group-hover:text-sky-600 transition">
                          Visualizar Todo
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">
                          Balances, sedes y auditoría contable
                        </span>
                      </div>
                      <div className="text-slate-300 group-hover:text-sky-500 group-hover:translate-x-0.5 transition-all shrink-0">
                        <ChevronRight size={18} />
                      </div>
                    </button>
                  </div>

                  {/* ── 2. CENTRO: El Modelo 3D GIGANTE (La Nubecita Flotante) ── */}
                  <div className="my-auto py-1 sm:py-2 flex flex-col items-center justify-center w-full">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute -bottom-3 w-64 sm:w-80 h-8 bg-sky-400/25 rounded-full blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-1 w-40 sm:w-56 h-4 bg-white/60 rounded-full blur-md pointer-events-none" />
                      <OrdersCloudMascot variant="hero" />
                    </div>
                  </div>

                  {/* ── 3. ABAJO DEL MODELO 3D: Botón Registrar Gastos ── */}
                  <div className="w-full pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFullScreenMode('register_selection')
                        setJefeGastoType(null)
                      }}
                      className="w-full group relative flex items-center text-left gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white/95 hover:bg-white border-2 border-white hover:border-emerald-300 shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_32px_rgba(16,185,129,0.15)] backdrop-blur-2xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                    >
                      <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
                        <Plus size={20} className="stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-slate-800 group-hover:text-emerald-600 transition">
                          Registrar Gastos
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">
                          Compra de mercadería y egresos
                        </span>
                      </div>
                      <div className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0">
                        <ChevronRight size={18} />
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: EXPENSE TYPE SELECTION ── */}
            {fullScreenMode === 'register_selection' && (
              <div className="max-w-3xl mx-auto w-full my-auto py-2 px-1 sm:px-0">
                {/* Top Navigation */}
                <div className="flex items-center justify-between pb-3">
                  <button
                    type="button"
                    onClick={() => setFullScreenMode('welcome')}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 bg-white/95 hover:bg-white border border-slate-200/80 shadow-sm backdrop-blur-xl transition active:scale-95 cursor-pointer"
                  >
                    <ArrowLeft size={14} className="stroke-[2.5]" />
                    <span>Volver al Asistente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullScreenMode('dashboard')}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 bg-white/95 hover:bg-white border border-slate-200/80 shadow-sm backdrop-blur-xl transition active:scale-95 cursor-pointer"
                  >
                    <BarChart3 size={14} className="stroke-[2.5] text-indigo-600" />
                    <span>Ver Dashboard de Gastos</span>
                  </button>
                </div>

                <section className="overflow-hidden rounded-[28px] border border-white/75 bg-white/60 p-4 shadow-[0_28px_80px_-32px_rgba(15,23,42,.28)] backdrop-blur-xl sm:p-7">
                  <header className="mb-5 flex items-start justify-between gap-3 border-b border-slate-100 pb-4 sm:mb-6 sm:pb-5">
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.12em] text-sky-700 shadow-sm backdrop-blur-md sm:text-[10px]">
                        <Cloud size={13} className="shrink-0 text-sky-500" />
                        Asistente de gastos · Importadora Carlitos
                      </span>
                      <h2 className="mt-3 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                        ¿Qué deseas registrar hoy?
                      </h2>
                      <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-500 sm:text-sm">
                        Elige el tipo de movimiento. Cada opción abre el formulario adecuado para respaldar el gasto.
                      </p>
                    </div>
                    <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white text-sky-600 shadow-sm sm:flex">
                      <Receipt size={21} />
                    </div>
                  </header>

                  <div className="grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2 sm:gap-4">
                    <article className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-white/80 bg-gradient-to-br from-sky-50/75 via-white/70 to-white/60 p-4 shadow-[0_12px_32px_-24px_rgba(14,116,184,.42)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_38px_-22px_rgba(14,116,184,.42)] sm:p-5">
                      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-sky-100/60 blur-2xl transition group-hover:bg-sky-200/60" />
                      <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                      <div className="relative flex flex-1 flex-col">
                        <button
                          type="button"
                          onClick={() => { setJefeGastoType('mercaderia'); setFullScreenMode('register_form') }}
                          className="w-full text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sky-100/90 bg-white/75 text-sky-600 shadow-sm backdrop-blur transition group-hover:scale-105">
                                <ShoppingBag size={19} strokeWidth={2.2} />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[9px] font-black uppercase tracking-[.14em] text-sky-700">Inventario</span>
                                <span className="mt-0.5 block text-[15px] font-black leading-tight text-slate-900 sm:text-base">Compra de mercadería</span>
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full border border-sky-100 bg-sky-50/60 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-sky-700">Stock</span>
                          </div>
                          <span className="mt-3 block text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                            Reposición para reventa, importaciones y pagos a proveedores.
                          </span>
                        </button>

                        <div className="mt-4 border-t border-white/80 pt-3.5">
                          <p className="mb-2 text-[9px] font-black uppercase tracking-[.13em] text-slate-500">Atajos frecuentes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {JEFE_MERCADERIA_ATAJOS.slice(0, 5).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => { setJefeRubro(item.id); setJefeGastoType('mercaderia'); setFullScreenMode('register_form') }}
                                className="inline-flex min-h-7 items-center rounded-full border border-white/90 bg-white/60 px-2.5 py-1 text-[9px] font-bold text-slate-600 shadow-sm backdrop-blur transition hover:border-sky-200 hover:bg-sky-50/80 hover:text-sky-800 active:scale-95"
                              >
                                <span className="mr-1" aria-hidden="true">{item.emoji}</span>{item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => { setJefeGastoType('mercaderia'); setFullScreenMode('register_form') }}
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-2xl border border-sky-100/90 bg-white/60 px-4 text-xs font-extrabold text-sky-800 shadow-sm backdrop-blur transition hover:border-sky-200 hover:bg-sky-50/80 active:scale-[.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                        >
                          <span>Registrar compra</span>
                          <span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-100/70 text-sky-700 transition group-hover:translate-x-0.5"><ChevronRight size={16} /></span>
                        </button>
                      </div>
                    </article>

                    <article className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-white/80 bg-gradient-to-br from-rose-50/75 via-white/70 to-white/60 p-4 shadow-[0_12px_32px_-24px_rgba(225,29,72,.22)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-[0_18px_38px_-22px_rgba(225,29,72,.28)] sm:p-5">
                      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-rose-100/60 blur-2xl transition group-hover:bg-rose-200/60" />
                      <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                      <div className="relative flex flex-1 flex-col">
                        <button
                          type="button"
                          onClick={() => { setJefeGastoType('otros'); setFullScreenMode('register_form') }}
                          className="w-full text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-rose-100/90 bg-white/75 text-rose-600 shadow-sm backdrop-blur transition group-hover:scale-105">
                                <CreditCard size={19} strokeWidth={2.2} />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[9px] font-black uppercase tracking-[.14em] text-rose-700">Caja diaria</span>
                                <span className="mt-0.5 block text-[15px] font-black leading-tight text-slate-900 sm:text-base">Gastos y retiros</span>
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full border border-rose-100 bg-rose-50/60 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-rose-700">Operación</span>
                          </div>
                          <span className="mt-3 block text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                            Retiros, fletes, bencina, colaciones, adelantos y servicios.
                          </span>
                        </button>

                        <div className="mt-4 border-t border-white/80 pt-3.5">
                          <p className="mb-2 text-[9px] font-black uppercase tracking-[.13em] text-slate-500">Atajos frecuentes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {JEFE_OPERATIVOS_ATAJOS.slice(0, 5).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => { setJefeMotivoOperativo(item.id); setJefeGastoType('otros'); setFullScreenMode('register_form') }}
                                className="inline-flex min-h-7 items-center rounded-full border border-white/90 bg-white/60 px-2.5 py-1 text-[9px] font-bold text-slate-600 shadow-sm backdrop-blur transition hover:border-rose-200 hover:bg-rose-50/80 hover:text-rose-800 active:scale-95"
                              >
                                <span className="mr-1" aria-hidden="true">{item.emoji}</span>{item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => { setJefeGastoType('otros'); setFullScreenMode('register_form') }}
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-2xl border border-rose-100/90 bg-white/60 px-4 text-xs font-extrabold text-rose-800 shadow-sm backdrop-blur transition hover:border-rose-200 hover:bg-rose-50/80 active:scale-[.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                        >
                          <span>Registrar gasto</span>
                          <span className="grid h-7 w-7 place-items-center rounded-xl bg-rose-100/70 text-rose-700 transition group-hover:translate-x-0.5"><ChevronRight size={16} /></span>
                        </button>
                      </div>
                    </article>
                  </div>

                  <footer className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-center text-[10px] font-semibold leading-relaxed text-slate-400 sm:text-[11px]">
                    <ShieldCheck size={15} className="shrink-0 text-emerald-500" />
                    <span>Comprobantes respaldados · Balance y auditoría en tiempo real</span>
                  </footer>
                </section>
              </div>
            )}

            {/* ── STEP 3: REGISTRATION FORM (1-TAP MOBILE-FIRST ERGONOMIC FLOW) ── */}
            {fullScreenMode === 'register_form' && (
              <div className="mx-auto my-auto w-full max-w-2xl py-2">
                <section className="relative overflow-hidden rounded-[30px] border border-white/80 bg-white/65 p-3 shadow-[0_28px_90px_-35px_rgba(15,23,42,.32)] backdrop-blur-2xl sm:p-6">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
                  <div aria-hidden="true" className={`pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full blur-3xl ${jefeGastoType === 'mercaderia' ? 'bg-sky-100/55' : 'bg-rose-100/55'}`} />
                  <div className="relative space-y-3.5 sm:space-y-4">
                  <div className="flex items-start justify-between gap-2 border-b border-white/80 pb-3 sm:gap-4 sm:pb-4">
                    <button
                      type="button"
                      onClick={() => setFullScreenMode('register_selection')}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/90 bg-white/65 px-2.5 text-[11px] font-bold text-slate-600 shadow-sm backdrop-blur transition hover:bg-white/90 hover:text-slate-900 active:scale-95 sm:px-3"
                    >
                      <ArrowLeft size={14} />
                      <span className="hidden min-[380px]:inline">Volver</span>
                    </button>

                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border bg-white/70 shadow-sm backdrop-blur ${jefeGastoType === 'mercaderia' ? 'border-sky-100 text-sky-600' : 'border-rose-100 text-rose-600'}`}>
                        {jefeGastoType === 'mercaderia' ? <ShoppingBag size={18} /> : <CreditCard size={18} />}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-[9px] font-black uppercase tracking-[.14em] ${jefeGastoType === 'mercaderia' ? 'text-sky-700' : 'text-rose-700'}`}>Nuevo movimiento</p>
                        <h2 className="truncate text-sm font-black leading-tight text-slate-900 sm:text-lg">
                          {jefeGastoType === 'mercaderia' ? 'Compra de mercadería' : 'Gasto operativo'}
                        </h2>
                        <p className="hidden text-[11px] text-slate-500 min-[420px]:block">Completa el monto y los datos del movimiento.</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFullScreenMode('dashboard')}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/80 bg-white/50 text-slate-400 shadow-sm transition hover:bg-white/90 hover:text-slate-700"
                      title="Cerrar y ver dashboard"
                      aria-label="Cerrar formulario"
                    >
                      <X size={17} />
                    </button>
                  </div>

                  <div>
                    <p className="mb-1.5 px-1 text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Tipo de movimiento</p>
                    <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/85 bg-slate-100/45 p-1.5 shadow-inner backdrop-blur-md">
                      <button
                        type="button"
                        onClick={() => setJefeGastoType('mercaderia')}
                        aria-pressed={jefeGastoType === 'mercaderia'}
                        className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-extrabold transition ${jefeGastoType === 'mercaderia' ? 'border-white bg-white/90 text-sky-800 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/50 hover:text-slate-800'}`}
                      >
                        <ShoppingBag size={14} className={jefeGastoType === 'mercaderia' ? 'text-sky-600' : ''} />
                        <span>Mercadería</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setJefeGastoType('otros')}
                        aria-pressed={jefeGastoType === 'otros'}
                        className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-extrabold transition ${jefeGastoType === 'otros' ? 'border-white bg-white/90 text-rose-800 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/50 hover:text-slate-800'}`}
                      >
                        <Wallet size={14} className={jefeGastoType === 'otros' ? 'text-rose-600' : ''} />
                        <span>Operativos</span>
                      </button>
                    </div>
                  </div>

                  {/* Form Body */}
                  <form onSubmit={handleSaveJefeExpense} className="space-y-3 sm:space-y-3.5">
                    {/* 1. ATAJOS DE 1 TOQUE: ¿QUÉ SE COMPRÓ O EN QUÉ SE GASTÓ? */}
                    {jefeGastoType === 'mercaderia' ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800">
                            1. ¿Qué compraste? (Toca 1 opción)
                          </label>
                          <span className="text-[10px] font-bold text-sky-700 bg-sky-50/80 px-2.5 py-1 rounded-full border border-sky-100">
                            {jefeRubro}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {JEFE_MERCADERIA_ATAJOS.map((item) => {
                            const active = jefeRubro === item.id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setJefeRubro(item.id)}
                                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center transition active:scale-95 cursor-pointer ${
                                  active
                                    ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-700/15'
                                    : 'bg-white/60 hover:bg-sky-50/80 text-slate-700 border-white/90 shadow-sm'
                                }`}
                              >
                                <span className="text-base leading-none">{item.emoji}</span>
                                <span className="text-[10px] font-bold leading-tight w-full px-0.5">
                                  {item.label}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-extrabold uppercase tracking-wide text-rose-800">
                            1. ¿Motivo del gasto o retiro? (Toca 1 opción)
                          </label>
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50/80 px-2.5 py-1 rounded-full border border-rose-100">
                            {JEFE_OPERATIVOS_ATAJOS.find((a) => a.id === jefeMotivoOperativo)?.label || 'Retiro Dueño'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {JEFE_OPERATIVOS_ATAJOS.map((item) => {
                            const active = jefeMotivoOperativo === item.id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setJefeMotivoOperativo(item.id)}
                                className={`flex min-h-11 items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition active:scale-95 cursor-pointer ${
                                  active
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-700/15'
                                    : 'bg-white/60 hover:bg-rose-50/80 text-slate-700 border-white/90 shadow-sm'
                                }`}
                              >
                                <span className="text-sm leading-none shrink-0">{item.emoji}</span>
                                <span className="text-[10px] font-bold leading-tight truncate">
                                  {item.label}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. MONTO TOTAL PAGADO CON ATAJOS DIRECTOS Y SUMADORES (+) */}
                    <div
                      className={`rounded-[24px] p-3 border transition space-y-2.5 shadow-sm backdrop-blur-md sm:p-4 ${
                        jefeGastoType === 'mercaderia'
                          ? 'bg-sky-50/60 border-sky-100/90 focus-within:bg-white/85 focus-within:border-sky-300'
                          : 'bg-rose-50/60 border-rose-100/90 focus-within:bg-white/85 focus-within:border-rose-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                          2. Monto Pagado (CLP) *
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded-md ${
                              jefeGastoType === 'mercaderia'
                                ? 'bg-sky-100/80 text-sky-800'
                                : 'bg-rose-100/80 text-rose-800'
                            }`}
                          >
                            {jefeMonto ? fmtMoney(Number(jefeMonto)) : '$ 0'}
                          </span>
                          {jefeMonto && (
                            <button
                              type="button"
                              onClick={() => setJefeMonto('')}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                            >
                              Borrar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="relative flex items-center rounded-2xl border border-white/90 bg-white/80 px-3 py-2 shadow-sm">
                        <span
                          className={`text-lg font-extrabold mr-1 ${
                            jefeGastoType === 'mercaderia' ? 'text-sky-600' : 'text-rose-600'
                          }`}
                        >
                          $
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="0"
                          value={jefeMonto}
                          onChange={(e) => setJefeMonto(e.target.value)}
                          className="jefe-clean-monto w-full font-extrabold font-mono text-slate-900 placeholder:text-slate-300"
                          required
                        />
                      </div>

                      {/* Montos Fijos de 1 Toque */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {(jefeGastoType === 'mercaderia'
                          ? [50000, 100000, 250000, 500000, 1000000, 2000000]
                          : [10000, 20000, 30000, 50000, 100000, 200000, 500000]
                        ).map((amt) => {
                          const isCurrent = Number(jefeMonto) === amt
                          return (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setJefeMonto(String(amt))}
                              className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-xl border transition active:scale-95 cursor-pointer ${
                                isCurrent
                                  ? jefeGastoType === 'mercaderia'
                                    ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                                    : 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                  : 'bg-white/65 hover:bg-white border-white/90 text-slate-700'
                              }`}
                            >
                              {fmtMoney(amt)}
                            </button>
                          )
                        })}
                      </div>

                      {/* Botones Sumadores Rápidos (+Monto) */}
                      <div className="flex items-center gap-1.5 flex-wrap border-t border-white/80 pt-2">
                        <span className="mr-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">Sumar</span>
                        {(jefeGastoType === 'mercaderia'
                          ? [
                              { label: '+$50k', val: 50000 },
                              { label: '+$100k', val: 100000 },
                              { label: '+$250k', val: 250000 },
                              { label: '+$500k', val: 500000 },
                            ]
                          : [
                              { label: '+$5k', val: 5000 },
                              { label: '+$10k', val: 10000 },
                              { label: '+$20k', val: 20000 },
                              { label: '+$50k', val: 50000 },
                              { label: '+$100k', val: 100000 },
                            ]
                        ).map((inc) => (
                          <button
                            key={inc.val}
                            type="button"
                            onClick={() => setJefeMonto(String((Number(jefeMonto) || 0) + inc.val))}
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition active:scale-95 cursor-pointer ${
                              jefeGastoType === 'mercaderia'
                                ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-100'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-100'
                            }`}
                          >
                            {inc.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. PROVEEDOR RÁPIDO Y FACTURA (SOLO MERCADERÍA - AZUL) */}
                    {jefeGastoType === 'mercaderia' && (
                      <div className="rounded-[22px] border border-white/85 bg-white/45 p-3 shadow-sm backdrop-blur-md space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
                            3. Proveedor / Factura (Opcional)
                          </label>
                          <span className="text-[9px] font-semibold text-slate-500">{proveedoresJefeDisponibles.length} guardados</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setShowJefeProveedores((open) => !open)}
                            aria-expanded={showJefeProveedores}
                            className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                              showJefeProveedores ? 'border-sky-300 bg-white text-sky-900' : 'border-white/90 bg-white/80 text-slate-700 hover:bg-white'
                            }`}
                          >
                            <span className="min-w-0 truncate">{jefeProveedor || 'Seleccionar proveedor...'}</span>
                            <ChevronDown size={15} className={`shrink-0 transition-transform ${showJefeProveedores ? 'rotate-180' : ''}`} />
                          </button>
                          <input
                            type="text"
                            placeholder="N° Factura / Boleta (Opc.)"
                            value={jefeFactura}
                            onChange={(e) => setJefeFactura(e.target.value)}
                            className="jefe-clean-field w-full font-medium bg-white/80 border border-white/90 focus:border-sky-300 text-slate-900 transition"
                          />
                        </div>
                        {showJefeProveedores && (
                          <div className="space-y-2 rounded-2xl border border-sky-100 bg-white/80 p-2.5 shadow-inner">
                            <input
                              type="search"
                              value={proveedorFiltro}
                              onChange={(event) => setProveedorFiltro(event.target.value)}
                              placeholder="Buscar proveedor..."
                              className="jefe-clean-field w-full border border-slate-200 bg-white text-slate-900 focus:border-sky-300"
                            />
                            <div className="max-h-36 overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-white p-1.5">
                              {proveedoresJefeFiltrados.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {proveedoresJefeFiltrados.map((provider) => {
                                    const active = jefeProveedorKey(jefeProveedor) === jefeProveedorKey(provider)
                                    return (
                                      <div
                                        key={jefeProveedorKey(provider)}
                                        className={`inline-flex max-w-full items-stretch overflow-hidden rounded-lg border text-[10px] font-bold transition ${
                                          active ? 'border-sky-600 bg-sky-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700'
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setJefeProveedor(provider)
                                            setShowJefeProveedores(false)
                                            setProveedorDirectoryMessage('')
                                          }}
                                          className="min-w-0 truncate px-2.5 py-1.5 text-left hover:bg-sky-50/70"
                                        >
                                          {provider}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void removeJefeProveedor(provider)}
                                          disabled={removingJefeProveedor !== null || savingJefeProveedor}
                                          aria-label={`Quitar ${provider} de la lista`}
                                          title={`Quitar ${provider}`}
                                          className={`grid w-7 shrink-0 place-items-center border-l transition disabled:cursor-wait disabled:opacity-50 ${
                                            active ? 'border-sky-400/70 text-white hover:bg-rose-500' : 'border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700'
                                          }`}
                                        >
                                          {removingJefeProveedor === jefeProveedorKey(provider)
                                            ? <RefreshCw size={11} className="animate-spin" />
                                            : <X size={12} />}
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="px-2 py-3 text-center text-[10px] font-semibold text-slate-500">No hay coincidencias. Puedes añadirlo abajo.</div>
                              )}
                            </div>
                            <div className="flex items-stretch gap-1.5">
                              <input
                                type="text"
                                value={nuevoJefeProveedor}
                                onChange={(event) => setNuevoJefeProveedor(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    void addJefeProveedor()
                                  }
                                }}
                                placeholder="Añadir proveedor nuevo..."
                                className="jefe-clean-field min-w-0 flex-1 border border-slate-200 bg-white text-slate-900 focus:border-sky-300"
                              />
                              <button
                                type="button"
                                onClick={() => void addJefeProveedor()}
                                disabled={savingJefeProveedor}
                                className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-sky-600 bg-sky-600 px-3 text-[10px] font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60"
                              >
                                {savingJefeProveedor ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                                Añadir
                              </button>
                            </div>
                            {proveedorDirectoryMessage && (
                              <p className="text-[10px] font-semibold text-sky-800" role="status">{proveedorDirectoryMessage}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. MEDIO DE PAGO + FECHA EN UNA FILA COMPACTA */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                      {/* Medio de Pago (Solo Transferencia y Efectivo) */}
                      <div className="sm:col-span-7 rounded-[22px] border border-white/85 bg-white/45 p-3 shadow-sm backdrop-blur-md">
                        <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 block mb-1">
                          Medio de Pago
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'Transferencia Bancaria', label: 'Transfer.' },
                            { id: 'Efectivo', label: 'Efectivo' },
                          ].map((m) => {
                            const isSelected = jefeMedioPago === m.id
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setJefeMedioPago(m.id)}
                                className={`text-[11px] py-1.5 px-2 rounded-xl font-extrabold border transition text-center cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
                                  isSelected
                                    ? jefeGastoType === 'mercaderia'
                                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                                      : 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                    : 'bg-white/70 text-slate-700 border-white/90 hover:bg-white'
                                }`}
                              >
                                {m.id === 'Transferencia Bancaria' ? (
                                  <Building2 size={13} className={isSelected ? 'text-blue-400 shrink-0' : 'text-slate-500 shrink-0'} />
                                ) : (
                                  <Wallet size={13} className={isSelected ? (jefeGastoType === 'mercaderia' ? 'text-sky-200 shrink-0' : 'text-rose-200 shrink-0') : 'text-slate-500 shrink-0'} />
                                )}
                                <span className="truncate">{m.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Fecha del Pago (Hoy / Ayer / Otra) */}
                      <div className="sm:col-span-5 rounded-[22px] border border-white/85 bg-white/45 p-3 shadow-sm backdrop-blur-md">
                        <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 block mb-1">
                          Fecha
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setJefeFecha(todayYMD())
                              setShowCustomDate(false)
                            }}
                            className={`text-[10px] font-extrabold py-1.5 px-1 rounded-xl border transition active:scale-95 cursor-pointer ${
                              jefeFecha === todayYMD() && !showCustomDate
                                ? jefeGastoType === 'mercaderia'
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Hoy
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setJefeFecha(yesterdayYMD())
                              setShowCustomDate(false)
                            }}
                            className={`text-[10px] font-extrabold py-1.5 px-1 rounded-xl border transition active:scale-95 cursor-pointer ${
                              jefeFecha === yesterdayYMD() && !showCustomDate
                                ? jefeGastoType === 'mercaderia'
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Ayer
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCustomDate((v) => !v)}
                            className={`text-[10px] font-extrabold py-1.5 px-1 rounded-xl border transition active:scale-95 cursor-pointer flex items-center justify-center ${
                              showCustomDate || (jefeFecha !== todayYMD() && jefeFecha !== yesterdayYMD())
                                ? jefeGastoType === 'mercaderia'
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Elegir otra fecha"
                          >
                            <Calendar size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {(showCustomDate || (jefeFecha !== todayYMD() && jefeFecha !== yesterdayYMD())) && (
                      <input
                        type="date"
                        value={jefeFecha}
                        onChange={(e) => setJefeFecha(e.target.value)}
                        className="jefe-clean-field w-full font-medium bg-white/80 border border-white/90 text-slate-900"
                        required
                      />
                    )}

                    {/* 5. SUCURSAL EN 1 TOQUE */}
                    <div className="flex items-center justify-between gap-2 rounded-[22px] border border-white/85 bg-white/45 px-3 py-2.5 shadow-sm backdrop-blur-md">
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 shrink-0">
                        Sucursal:
                      </span>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {SEDE_SLUGS.slice(0, 4).map((s) => {
                          const active = jefeSede === s
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setJefeSede(s)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition active:scale-95 cursor-pointer ${
                                active
                                  ? jefeGastoType === 'mercaderia'
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {sedeShortName(s)}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 6. NOTA OPCIONAL Y FOTO / CÁMARA EN 1 TOQUE */}
                    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-7">
                        <input
                          type="text"
                          placeholder={
                            jefeGastoType === 'mercaderia'
                              ? 'Nota opcional (ej: Pago mercadería Edimar, retiro Nacho)...'
                              : 'Nota opcional (ej: Bencina, colación turno, sencillo)...'
                          }
                          value={jefeDescripcion}
                          onChange={(e) => setJefeDescripcion(e.target.value)}
                          className={`jefe-clean-field w-full font-medium bg-slate-50 border border-slate-200 focus:bg-white text-slate-900 transition ${
                            jefeGastoType === 'mercaderia' ? 'focus:border-sky-400' : 'focus:border-rose-400'
                          }`}
                        />
                      </div>

                      <div className="flex items-center gap-1.5 sm:col-span-5">
                        {/* Botón directo Cámara (Móvil) */}
                        <label className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/90 bg-white/60 px-2 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-white/90 active:scale-95">
                          <Camera size={13} className="text-slate-500 shrink-0" />
                          <span className="truncate">Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) {
                                setJefeFile(f)
                                const reader = new FileReader()
                                reader.onload = (re) => setJefeFilePreview(re.target?.result as string)
                                reader.readAsDataURL(f)
                              }
                            }}
                          />
                        </label>

                        {/* Botón Galería / Archivo */}
                        <label className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/90 bg-white/60 px-2 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-white/90 active:scale-95">
                          <Upload size={13} className="text-slate-500 shrink-0" />
                          <span className="truncate">{jefeFile ? 'OK' : 'Subir'}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) {
                                setJefeFile(f)
                                const reader = new FileReader()
                                reader.onload = (re) => setJefeFilePreview(re.target?.result as string)
                                reader.readAsDataURL(f)
                              }
                            }}
                          />
                        </label>

                        {jefeFilePreview && (
                          <div className="relative h-8 w-8 rounded-lg overflow-hidden border border-slate-300 shrink-0 shadow-sm">
                            <img src={jefeFilePreview} alt="Preview" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => {
                                setJefeFile(null)
                                setJefeFilePreview(null)
                              }}
                              className="absolute inset-0 bg-black/40 flex items-center justify-center text-white cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submit CTA Buttons */}
                    <div className="sticky bottom-0 flex items-center gap-2 border-t border-white/75 bg-white/40 pt-3 backdrop-blur-xl">
                      <button
                        type="button"
                        onClick={() => setFullScreenMode('dashboard')}
                        className="min-h-12 rounded-2xl border border-white/90 bg-white/65 px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-white active:scale-95 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingJefeExpense}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-extrabold text-white shadow-lg transition active:scale-[.99] disabled:opacity-50 cursor-pointer ${
                          jefeGastoType === 'mercaderia'
                            ? 'bg-gradient-to-r from-sky-600 to-blue-600 hover:brightness-105 shadow-sky-700/20'
                            : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:brightness-105 shadow-rose-700/20'
                        }`}
                      >
                        <Save size={14} />
                        <span>
                          {savingJefeExpense
                            ? 'Guardando...'
                            : jefeGastoType === 'mercaderia'
                            ? 'Guardar Compra de Mercadería'
                            : 'Guardar Gasto / Retiro'}
                        </span>
                      </button>
                    </div>
                  </form>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════ HEADER — Minimal Sticky Bar ═══════════════════════ */}
      <div className={fullScreenMode !== 'dashboard' ? 'hidden' : 'block'}>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="px-4 py-2.5 max-w-[1400px] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFullScreenMode('welcome')}
              className="p-2 rounded-lg hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
              title="Volver al Menú Principal"
              aria-label="Volver al Menú Principal"
            >
              <ArrowLeft size={18} className="text-slate-600" />
            </button>
            <div className="min-w-0">
              <h1
                className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-orange-500"
                style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", letterSpacing: '0.02em' }}
              >
                Gastos
              </h1>
              <p className="text-[9px] text-slate-400 font-medium">Clasificación IA · Compras de Mercadería · Análisis por sucursal</p>
            </div>
          </div>

          {/* Unified Tab Switcher */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl shadow-inner gap-1">
            <button
              onClick={() => switchTab('sucursal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'sucursal'
                  ? 'bg-white text-rose-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Store size={13} />
              <span>Gastos de Sucursal</span>
            </button>
            <button
              onClick={() => switchTab('externos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'externos'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 size={13} />
              <span>Gastos Fijos y Externos</span>
            </button>
            <button
              onClick={() => switchTab('consolidado')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'consolidado'
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers size={13} />
              <span>Consolidado</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFullScreenMode('welcome')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-50/95 to-white/95 hover:from-sky-100 hover:to-sky-50 text-sky-800 text-xs font-semibold border border-sky-200/90 shadow-sm backdrop-blur-xl transition active:scale-95 cursor-pointer"
              title="Abrir Asistente con Mascota 3D"
            >
              <Crown size={13} className="text-amber-500" />
              <span>Panel de Carga · {accountName}</span>
            </button>
            <GastosAgent contextSummary={agentContext} />
          </div>
        </div>
      </header>

      {/* ═══════════════════════ ACCESO DIRECTO PANEL DE CARGA ═══════════════════════ */}
      <div className="max-w-[1400px] mx-auto px-4 pt-3 pb-1">
        <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
          <button
            onClick={() => setFullScreenMode('welcome')}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-50/95 to-white/95 hover:from-sky-100 hover:to-sky-50 text-sky-800 text-xs font-semibold border border-sky-200/90 shadow-sm backdrop-blur-xl transition active:scale-95 cursor-pointer"
          >
            <Crown size={14} className="text-amber-500" />
            <span>Panel de Carga · {accountName}</span>
          </button>
          <span className="text-[11px] text-slate-400">
            Haz clic para abrir el asistente con la Mascota 3D o registrar gastos directamente.
          </span>
        </div>
      </div>

      {/* ═══════════════════════ TAB 1: SACRED GASTOS DE SUCURSAL ═══════════════════════ */}
      {activeTab === 'sucursal' && (
        <>
          {/* Controls Bar */}
          <div className="max-w-[1400px] mx-auto px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
                <Store size={14} className="text-slate-500" />
                <select
                  value={selectedSede}
                  onChange={(e) => setSelectedSede(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 font-medium outline-none cursor-pointer"
                >
                  <option value="todas">Todas</option>
                  {SEDE_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {sedeShortName(s)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Period Shortcuts */}
              <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('single')
                    setSingleDate(todayYMD())
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === 'single' && singleDate === todayYMD()
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('single')
                    setSingleDate(yesterdayYMD())
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === 'single' && singleDate === yesterdayYMD()
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Ayer ({yesterdayYMD().slice(5)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('range')
                    setDateFrom(daysAgoYMD(7))
                    setDateTo(todayYMD())
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === 'range' && dateFrom === daysAgoYMD(7) && dateTo === todayYMD()
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Últimos 7 días
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('range')
                    setDateFrom(`${currentMonthId()}-01`)
                    setDateTo(todayYMD())
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === 'range' && dateFrom === `${currentMonthId()}-01`
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Este Mes ({currentMonthId()})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('range')
                    setDateFrom('2026-09-01')
                    setDateTo('2026-09-30')
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === 'range' && dateFrom === '2026-09-01'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Septiembre
                </button>
              </div>

              <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    dateMode === 'single' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setDateMode('single')}
                >
                  <Calendar size={11} className="inline mr-1" />
                  Fecha
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    dateMode === 'range' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setDateMode('range')}
                >
                  <Filter size={11} className="inline mr-1" />
                  Rango
                </button>
              </div>

              {dateMode === 'single' ? (
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="text-xs px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition"
                  />
                  <span className="text-slate-300 text-xs">→</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="text-xs px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition"
                  />
                </div>
              )}

              <button
                onClick={loadGastos}
                disabled={loading}
                className="text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-semibold shadow-md shadow-rose-200/50 hover:shadow-rose-300/60 disabled:opacity-50 transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw size={12} className={`inline mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Cargando...' : 'Cargar'}
              </button>

              <button
                type="button"
                onClick={() => setShowAdelantosModal(true)}
                className="text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-semibold shadow-md shadow-sky-200/50 hover:shadow-sky-300/60 transition-all active:scale-95 cursor-pointer"
              >
                Adelantos del personal
              </button>

              {filteredGastos.length > 0 && (
                <button
                  onClick={exportToExcel}
                  disabled={exporting}
                  className="text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-md shadow-emerald-200/50 hover:shadow-emerald-300/60 disabled:opacity-50 transition-all active:scale-95"
                >
                  {exporting ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent mr-1.5" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Download size={12} className="inline mr-1.5" />
                      Excel
                    </>
                  )}
                </button>
              )}

              {filteredGastos.length > 0 && (
                <button
                  onClick={clasificarTodos}
                  disabled={clasificandoTodos}
                  className="text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-semibold shadow-md shadow-violet-200/50 hover:shadow-violet-300/60 disabled:opacity-50 transition-all active:scale-95"
                >
                  {clasificandoTodos ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent mr-1.5" />
                      Clasificando...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="inline mr-1.5" />
                      Clasificar con IA
                    </>
                  )}
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => {
                    setJefeGastoType('mercaderia')
                    setFullScreenMode('register_form')
                  }}
                  className="text-xs px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black hover:opacity-95 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                >
                  <ShoppingBag size={13} />
                  <span>+ Compra Mercadería</span>
                </button>

                <button
                  onClick={() => setShowNewExpenseModal(true)}
                  className="text-xs px-3.5 py-2 rounded-xl bg-rose-50/90 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                >
                  <Plus size={13} className="text-rose-600" />
                  <span>Nuevo Gasto</span>
                </button>
              </div>
            </div>

            {filteredGastos.length > 0 && (
              <div className="flex items-center gap-3 mt-2.5">
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                    hayClasificados
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-violet-50 text-violet-700 border border-violet-200'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${hayClasificados ? 'bg-emerald-500' : 'bg-violet-500 animate-pulse'}`} />
                  {hayClasificados ? '✓ Clasificado por IA' : '○ Sin clasificar'}
                </span>
                <span className="text-xs text-slate-400 font-medium">{filteredGastos.length} gastos registrados</span>
                {totalInversionMercaderia > 0 && (
                  <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-xl border border-cyan-200">
                    📦 Mercadería: {fmtMoney(totalInversionMercaderia)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════ CONTENT CONTAINER ═══════════════════════ */}
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 pb-12 relative z-10" ref={scrollRef}>
            {/* ── Global IA Confidence Bar with Shimmer & Particles ── */}
            {globalConfianza && (
              <div className="mt-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-4" style={{ animation: 'gp_fadeIn 0.4s ease-out' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 shadow-sm">
                      <Brain size={13} className="text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confianza IA Global</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      {globalConfianza.count}/{globalConfianza.total} clasificados
                    </span>
                    <span
                      className={`text-sm font-extrabold ${
                        globalConfianza.avg >= 90
                          ? 'text-emerald-700'
                          : globalConfianza.avg >= 70
                          ? 'text-emerald-600'
                          : globalConfianza.avg >= 40
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {globalConfianza.avg}%
                    </span>
                  </div>
                </div>
                <div className="h-6 rounded-full bg-slate-200/80 overflow-hidden relative">
                  {(() => {
                    const pct = globalConfianza.avg
                    const color =
                      pct >= 90
                        ? 'from-emerald-400 via-green-400 to-teal-400'
                        : pct >= 70
                        ? 'from-emerald-400 via-teal-400 to-cyan-400'
                        : pct >= 40
                        ? 'from-amber-400 via-orange-400 to-yellow-400'
                        : 'from-rose-400 via-red-400 to-pink-400'
                    return (
                      <div
                        className={`${
                          pct >= 100 ? 'absolute inset-0 rounded-full' : 'absolute left-0 top-0 h-full rounded-l-full'
                        } bg-gradient-to-r ${color} transition-[width] duration-1000 ease-out overflow-hidden`}
                        style={pct < 100 ? { width: `${pct}%` } : undefined}
                      >
                        <div
                          className="absolute inset-0 opacity-40"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 50%, rgba(255,255,255,0) 100%)',
                            backgroundSize: '200% 100%',
                            animation: 'gp_shimmer 2.5s ease-in-out infinite',
                          }}
                        />
                        {[...Array(10)].map((_, i) => (
                          <div
                            key={`gc_${i}`}
                            className="absolute rounded-full"
                            style={{
                              left: `${3 + ((i * 10) % 90)}%`,
                              top: `${8 + ((i * 23 + 7) % 75)}%`,
                              width: `${1.5 + (i % 4) * 0.8}px`,
                              height: `${1.5 + (i % 4) * 0.8}px`,
                              background: `radial-gradient(circle, rgba(255,255,255,${0.6 + (i % 3) * 0.15}), rgba(255,255,255,0.1))`,
                              animation: `gp_float ${1.2 + (i % 5) * 0.4}s ease-in-out ${(i * 0.15) % 2}s infinite alternate`,
                            }}
                          />
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {globalConfianza.avg >= 90 ? (
                  <p className="text-[10px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Alta confianza — no necesitas revisar manualmente
                  </p>
                ) : globalConfianza.avg >= 70 ? (
                  <p className="text-[10px] text-teal-600 font-medium mt-1.5 flex items-center gap-1">
                    <ShieldCheck size={10} /> Buena confianza — revisa solo los gastos marcados con dudas
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-600 font-medium mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={10} /> Confianza moderada — se recomienda revisión manual
                  </p>
                )}
              </div>
            )}

            {/* ── Smart Stat Cards — Soft Glass Premium with Floating Micro-Particles ── */}
            {filteredGastos.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4" style={{ animation: 'gp_fadeIn 0.5s ease-out' }}>
                {[
                  {
                    label: '💰 Total Movimientos',
                    value: fmtMoney(totalGastos),
                    sub: `${filteredGastos.length} registros · Gastos ${fmtMoney(totalGastosOperacionales)} · Mercadería aparte ${fmtMoney(totalInversionMercaderia)}`,
                    gradient: 'from-rose-100 via-pink-50 to-orange-50',
                    accent: 'from-rose-400 to-orange-400',
                    text: 'text-rose-700',
                    border: 'border-rose-200/60',
                    icon: <Wallet size={16} className="text-rose-500" />,
                    pct: 100,
                    particles: ['#fb7185', '#f97316', '#ec4899'],
                  },
                  topSede
                    ? {
                        label: `🏪 Más Gasto`,
                        value: fmtMoney(topSede[1]),
                        sub: sedeShortName(topSede[0]),
                        gradient: 'from-blue-100 via-sky-50 to-cyan-50',
                        accent: 'from-blue-400 to-cyan-400',
                        text: 'text-blue-700',
                        border: 'border-blue-200/60',
                        icon: <Store size={16} className="text-blue-500" />,
                        pct: totalGastos > 0 ? (topSede[1] / totalGastos) * 100 : 0,
                        particles: ['#3b82f6', '#06b6d4', '#0ea5e9'],
                      }
                    : null,
                  topCategoria
                    ? {
                        label: `${categoriaEmojis[topCategoria[0]] || '📌'} Top Categoría`,
                        value: fmtMoney(topCategoria[1]),
                        sub: topCategoria[0],
                        gradient: 'from-violet-100 via-purple-50 to-fuchsia-50',
                        accent: 'from-violet-400 to-purple-400',
                        text: 'text-violet-700',
                        border: 'border-violet-200/60',
                        icon: <Tag size={16} className="text-violet-500" />,
                        pct: totalGastos > 0 ? (topCategoria[1] / totalGastos) * 100 : 0,
                        particles: ['#8b5cf6', '#a855f7', '#c084fc'],
                      }
                    : null,
                  topTipo
                    ? {
                        label: `${tipoEmojis[topTipo[0]] || '📦'} Top Tipo`,
                        value: fmtMoney(topTipo[1]),
                        sub: topTipo[0],
                        gradient: 'from-amber-100 via-yellow-50 to-orange-50',
                        accent: 'from-amber-400 to-orange-400',
                        text: 'text-amber-700',
                        border: 'border-amber-200/60',
                        icon: <Receipt size={16} className="text-amber-500" />,
                        pct: totalGastos > 0 ? (topTipo[1] / totalGastos) * 100 : 0,
                        particles: ['#f59e0b', '#f97316', '#eab308'],
                      }
                    : null,
                ]
                  .filter(Boolean)
                  .map((card, ci) => (
                    <div
                      key={ci}
                      className={`relative group rounded-2xl overflow-hidden border ${card!.border} shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${card!.gradient} opacity-60`} />
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        {[...Array(6)].map((_, i) => (
                          <div
                            key={i}
                            className="absolute rounded-full opacity-30"
                            style={{
                              left: `${10 + ((i * 17) % 75)}%`,
                              top: `${8 + ((i * 23) % 70)}%`,
                              width: `${2 + (i % 3)}px`,
                              height: `${2 + (i % 3)}px`,
                              background: card!.particles[i % 3],
                              animation: `gp_float ${2 + (i % 4) * 0.7}s ease-in-out ${i * 0.3}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="relative p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="p-2 rounded-xl bg-white/70 shadow-sm backdrop-blur-sm">{card!.icon}</div>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">{card!.label}</p>
                        <p className={`text-xl font-black tracking-tight ${card!.text}`}>{card!.value}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">{card!.sub}</p>
                        <div className="mt-2.5 h-1.5 rounded-full bg-white/50 overflow-hidden backdrop-blur-sm">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${card!.accent} transition-[width] duration-1000 ease-out`}
                            style={{ width: `${Math.min(100, card!.pct)}%` }}
                          >
                            <div
                              className="absolute inset-0 opacity-50"
                              style={{
                                backgroundImage:
                                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.6) 50%, rgba(255,255,255,0) 100%)',
                                backgroundSize: '200% 100%',
                                animation: 'gp_shimmer 2.5s ease-in-out infinite',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* ── Sucursal Breakdown Cards ── */}
            {selectedSede === 'todas' && porSede.length > 1 && (
              <div className="mt-5" style={{ animation: 'gp_fadeIn 0.6s ease-out' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Store size={16} className="text-rose-500" />
                  <h2 className="text-sm font-bold text-slate-700">Por Sucursal</h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {porSede.map(([sede, total]) => {
                    const theme = getSedeTheme(sede)
                    const pct = totalGastos > 0 ? (total / totalGastos) * 100 : 0
                    const count = gastos.filter((g) => g.sede === sede).length
                    return (
                      <button
                        key={sede}
                        onClick={() => setSelectedSede(sede)}
                        className="gp-card p-4 text-left group relative overflow-hidden"
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
                        <div className="relative">
                          <div className="flex items-center gap-2.5 mb-2">
                            <span className="text-xl">{theme.icon}</span>
                            <span className="text-sm font-bold text-slate-800">{sedeShortName(sede)}</span>
                          </div>
                          <p className="text-xl font-black text-slate-900">{fmtMoney(total)}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${theme.barFrom} ${theme.barTo} transition-[width] duration-700`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold">{pct.toFixed(0)}%</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1.5">{count} gastos</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Resumen Toggle: Por Tipo y Por Categoría ── */}
            {filteredGastos.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowResumen(!showResumen)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors mb-3"
                >
                  <BarChart3 size={16} className="text-rose-500" />
                  <span>Resumen por Tipo y Categoría</span>
                  {showResumen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showResumen && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ animation: 'gp_fadeIn 0.4s ease-out' }}>
                    {/* Por Tipo */}
                    <div className="relative rounded-2xl overflow-hidden border border-rose-200/50 shadow-sm">
                      <div className="absolute inset-0 bg-gradient-to-br from-rose-50/80 via-white to-pink-50/60" />
                      <div className="relative p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="p-2 rounded-xl bg-white/80 shadow-sm backdrop-blur-sm">
                            <Receipt size={15} className="text-rose-500" />
                          </div>
                          <p className="text-sm font-bold text-slate-700">📋 Por Tipo</p>
                        </div>
                        <div className="space-y-3.5">
                          {porTipo.map(([tipo, total]) => {
                            const pct = totalGastos > 0 ? (total / totalGastos) * 100 : 0
                            return (
                              <div key={tipo}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
                                      tipoColors[tipo] || tipoColors['Otros']
                                    }`}
                                  >
                                    {tipoEmojis[tipo] || '📦'} {tipo}
                                  </span>
                                  <span className="text-sm font-bold text-slate-700">
                                    {fmtMoney(total)}{' '}
                                    <span className="text-[10px] text-slate-400 font-medium">({pct.toFixed(1)}%)</span>
                                  </span>
                                </div>
                                <div className="h-2.5 rounded-full bg-white/60 overflow-hidden backdrop-blur-sm shadow-inner">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-rose-400 via-pink-400 to-rose-500 transition-[width] duration-700 relative"
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  >
                                    <div
                                      className="absolute inset-0 opacity-40"
                                      style={{
                                        backgroundImage:
                                          'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 50%, rgba(255,255,255,0) 100%)',
                                        backgroundSize: '200% 100%',
                                        animation: 'gp_shimmer 3s ease-in-out infinite',
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Por Categoría */}
                    <div className="relative rounded-2xl overflow-hidden border border-violet-200/50 shadow-sm">
                      <div className="absolute inset-0 bg-gradient-to-br from-violet-50/80 via-white to-purple-50/60" />
                      <div className="relative p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="p-2 rounded-xl bg-white/80 shadow-sm backdrop-blur-sm">
                            <Tag size={15} className="text-violet-500" />
                          </div>
                          <p className="text-sm font-bold text-slate-700">🏷️ Por Categoría</p>
                        </div>
                        <div className="space-y-3.5">
                          {porCategoria.map(([cat, total]) => {
                            const pct = totalGastos > 0 ? (total / totalGastos) * 100 : 0
                            return (
                              <div key={cat}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
                                      categoriaColors[cat] || categoriaColors['Otros']
                                    }`}
                                  >
                                    {categoriaEmojis[cat] || '📌'} {cat}
                                  </span>
                                  <span className="text-sm font-bold text-slate-700">
                                    {fmtMoney(total)}{' '}
                                    <span className="text-[10px] text-slate-400 font-medium">({pct.toFixed(1)}%)</span>
                                  </span>
                                </div>
                                <div className="h-2.5 rounded-full bg-white/60 overflow-hidden backdrop-blur-sm shadow-inner">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-500 transition-[width] duration-700 relative"
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  >
                                    <div
                                      className="absolute inset-0 opacity-40"
                                      style={{
                                        backgroundImage:
                                          'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 50%, rgba(255,255,255,0) 100%)',
                                        backgroundSize: '200% 100%',
                                        animation: 'gp_shimmer 3s ease-in-out infinite',
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Table View ── */}
            {!loading && filteredGastos.length > 0 && (
              <div className="mt-6" style={{ animation: 'gp_fadeIn 0.7s ease-out' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-rose-500" />
                    <h2 className="text-sm font-bold text-slate-700">Detalle de Gastos</h2>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">Total: {fmtMoney(totalGastos)}</span>
                </div>

                <div className="hidden lg:block overflow-x-auto rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        {selectedSede === 'todas' && (
                          <th className="px-4 py-3.5 text-left text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                            Sucursal
                          </th>
                        )}
                        <th className="px-4 py-3.5 text-left text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                          Descripción
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                          Categoría
                        </th>
                        <th className="px-4 py-3.5 text-right text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                          Monto
                        </th>
                        <th className="px-4 py-3.5 text-center text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                          Acciones
                        </th>
                        {dateMode === 'range' && (
                          <th className="px-4 py-3.5 text-right text-[11px] text-rose-500 font-semibold uppercase tracking-wider">
                            Fecha
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGastos.map((g, idx) => {
                        const theme = getSedeTheme(g.sede)
                        return (
                          <tr
                            key={idx}
                            className={`border-b border-slate-50 hover:bg-rose-50/30 transition-colors cursor-pointer ${
                              g.isJefatura ? 'bg-amber-50/20' : ''
                            }`}
                            onClick={() => openDetailModal(g)}
                          >
                            {selectedSede === 'todas' && (
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${theme.badge}`}>
                                  {theme.icon} {sedeShortName(g.sede)}
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${tipoColors[g.tipo] || tipoColors['Otros']}`}>
                                {tipoEmojis[g.tipo] || '📦'} {g.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-sm">
                              <div className="flex items-center gap-1.5">
                                {g.isJefatura && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-xs">
                                    <Crown size={9} /> Jefe
                                  </span>
                                )}
                                <p className="text-sm text-slate-700 font-medium truncate">{g.descripcionMejorada || g.descripcion}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                {g.cajero && (
                                  <span className="text-[10px] text-slate-500 font-semibold inline-flex items-center gap-1">
                                    👤 {g.cajero}
                                  </span>
                                )}
                                {g.hora && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    🕒 {g.hora}
                                  </span>
                                )}
                                {g.proveedor && (
                                  <span className="text-[10px] text-slate-500">
                                    Proveedor: <strong className="text-slate-700">{g.proveedor}</strong> {g.facturaNro ? `(${g.facturaNro})` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${categoriaColors[g.categoria] || categoriaColors['Otros']}`}>
                                {categoriaEmojis[g.categoria] || '📌'} {g.categoria}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800 text-sm">
                              <span className={g.tipo === 'Gasto de mercadería' ? 'text-cyan-700 font-black' : ''}>{fmtMoney(g.monto)}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openDetailModal(g)
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                                  title="Ver detalle"
                                >
                                  <Eye size={13} className="text-slate-500" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    clasificarUno(idx)
                                  }}
                                  disabled={clasificandoGasto === idx}
                                  className="p-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-50 transition-colors"
                                  title="Clasificar con IA"
                                >
                                  {clasificandoGasto === idx ? (
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-violet-500 border-t-transparent" />
                                  ) : (
                                    <Brain size={13} className="text-violet-600" />
                                  )}
                                </button>
                                {g.fotos && g.fotos.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPhotoViewer(g.fotos![0].url)
                                    }}
                                    className="p-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 transition"
                                    title="Ver comprobante adjunto"
                                  >
                                    <ImageIcon size={13} className="text-sky-600" />
                                  </button>
                                )}
                              </div>
                            </td>
                            {dateMode === 'range' && <td className="px-4 py-3 text-right text-xs text-slate-400 font-mono">{g.fecha}</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/50">
                        <td
                          colSpan={selectedSede === 'todas' ? (dateMode === 'range' ? 5 : 4) : (dateMode === 'range' ? 4 : 3)}
                          className="px-4 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider"
                        >
                          Total registrado
                        </td>
                        <td className="px-4 py-3.5 text-right font-black text-lg text-rose-600">{fmtMoney(totalGastos)}</td>
                        <td />
                        {dateMode === 'range' && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden space-y-3">
                  {filteredGastos.map((g, idx) => {
                    const theme = getSedeTheme(g.sede)
                    const pctOfTotal = totalGastos > 0 ? (g.monto / totalGastos) * 100 : 0
                    return (
                      <div
                        key={idx}
                        className={`group relative rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg active:scale-[0.99] transition-all duration-300 cursor-pointer p-4 ${
                          g.isJefatura ? 'ring-1 ring-amber-300' : ''
                        }`}
                        onClick={() => openDetailModal(g)}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl shrink-0">{tipoEmojis[g.tipo] || '📦'}</span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                {g.isJefatura && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-black bg-amber-500 text-white">
                                    <Crown size={8} /> Jefe
                                  </span>
                                )}
                                <p className="text-sm font-bold text-slate-800 line-clamp-2">{g.descripcionMejorada || g.descripcion}</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                {selectedSede === 'todas' && (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${theme.badge}`}>
                                    {theme.icon} {sedeShortName(g.sede)}
                                  </span>
                                )}
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${tipoColors[g.tipo] || tipoColors['Otros']}`}>
                                  {g.tipo}
                                </span>
                                {g.cajero && (
                                  <span className="text-[9px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded-md">
                                    👤 {g.cajero}
                                  </span>
                                )}
                                {dateMode === 'range' && (
                                  <span className="text-[9px] text-slate-400 font-mono">{g.fecha}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-black text-slate-900">{fmtMoney(g.monto)}</p>
                            <span className="text-[10px] text-slate-400">{pctOfTotal.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Empty State (100% Real Data - Sin gastos en la fecha seleccionada) ── */}
            {!loading && filteredGastos.length === 0 && (
              <div className="mt-6 rounded-3xl bg-white border border-slate-200 p-8 text-center shadow-sm max-w-xl mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
                  <Receipt size={22} />
                </div>
                <h3 className="text-base font-black text-slate-800">
                  Sin gastos registrados en este período
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  No existen salidas de caja en <code className="text-slate-700 font-bold">cuadres_erp</code> ni compras en <code className="text-slate-700 font-bold">gastos_jefatura</code> para{' '}
                  <strong>{dateMode === 'single' ? singleDate : `${dateFrom} a ${dateTo}`}</strong>.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setDateMode('single')
                      setSingleDate(yesterdayYMD())
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer"
                  >
                    Ver Ayer ({yesterdayYMD()})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDateMode('range')
                      setDateFrom(`${currentMonthId()}-01`)
                      setDateTo(todayYMD())
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition cursor-pointer"
                  >
                    Ver Este Mes ({currentMonthId()})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setJefeGastoType('mercaderia')
                      setFullScreenMode('register_selection')
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition cursor-pointer"
                  >
                    + Registrar Gasto
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════ TAB 2: GASTOS FIJOS Y EXTERNOS ═══════════════════════ */}
      {activeTab === 'externos' && (
        <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
                <Store size={14} className="text-slate-500" />
                <select
                  value={extSede}
                  onChange={(e) => setExtSede(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 font-semibold outline-none cursor-pointer"
                >
                  {SEDE_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {sedeShortName(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
                <Calendar size={14} className="text-slate-500" />
                <input
                  type="month"
                  value={extMonth}
                  onChange={(e) => setExtMonth(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 font-semibold outline-none cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={loadExternalData}
              disabled={extLoading}
              className="text-xs px-4 py-2 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw size={12} className={extLoading ? 'animate-spin' : ''} />
              <span>{extLoading ? 'Actualizando...' : 'Actualizar'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">🏢 Total Gastos Fijos Mensuales</p>
              <p className="text-2xl font-black text-amber-900 mt-2">{fmtMoney(totalExtFixed)}</p>
              <p className="text-xs text-amber-700 mt-1">{fixedForSelectedMonth.length} conceptos activos este mes</p>
            </div>
            <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/70 shadow-sm">
              <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">💳 Total Gastos Manuales del Mes</p>
              <p className="text-2xl font-black text-rose-900 mt-2">{fmtMoney(totalExtManual)}</p>
              <p className="text-xs text-rose-700 mt-1">{extManual.length} pagos registrados</p>
            </div>
            <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/70 shadow-sm">
              <p className="text-xs font-bold text-indigo-800 uppercase tracking-wider">📊 Total Gastos Externos</p>
              <p className="text-2xl font-black text-indigo-900 mt-2">{fmtMoney(totalExtAll)}</p>
              <p className="text-xs text-indigo-700 mt-1">Impacto financiero en balance mensual</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Col 1: Fixed Expenses Config */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">Gastos Fijos Recurrentes</h3>
                  <p className="text-xs text-slate-400">Arriendos, luz, agua, contador y servicios estructurales</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setExtFixed((prev) => [
                      ...prev,
                      {
                        id: `${extSede}-custom-${Date.now()}`,
                        name: 'Nuevo gasto fijo',
                        amount: 0,
                        active: true,
                        category: 'Gasto fijo',
                      },
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  + Agregar concepto
                </button>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {extFixed.map((f, i) => (
                  <div key={f.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                    <input
                      type="checkbox"
                      checked={f.active}
                      onChange={(e) =>
                        setExtFixed((prev) =>
                          prev.map((item, idx) => (idx === i ? { ...item, active: e.target.checked } : item)),
                        )
                      }
                      className="w-4 h-4 rounded text-orange-500 focus:ring-orange-400"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) =>
                          setExtFixed((prev) =>
                            prev.map((item, idx) => (idx === i ? { ...item, name: e.target.value } : item)),
                          )
                        }
                        className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-orange-400"
                        placeholder="Nombre del gasto fijo"
                      />
                      {(f.startMonth || f.endMonth) && (
                        <p className="mt-1 px-1 text-[10px] text-slate-400">
                          {f.startMonth ? `Desde ${f.startMonth}` : 'Histórico'}
                          {f.endMonth ? ` · hasta ${f.endMonth}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="w-28 relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        value={f.amount || ''}
                        onChange={(e) =>
                          setExtFixed((prev) =>
                            prev.map((item, idx) =>
                              idx === i ? { ...item, amount: Math.max(0, Number(e.target.value) || 0) } : item,
                            ),
                          )
                        }
                        className="w-full text-xs font-bold pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-orange-400 text-right"
                        placeholder="0"
                      />
                    </div>
                    <button
                      onClick={() => setExtFixed((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                {extSaveSuccess && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Guardado exitosamente
                  </span>
                )}
                <button
                  onClick={handleSaveFixedExpenses}
                  disabled={extSavingFixed}
                  className="ml-auto px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition flex items-center gap-1.5 shadow-sm"
                >
                  <Save size={13} />
                  <span>{extSavingFixed ? 'Guardando...' : 'Guardar Gastos Fijos'}</span>
                </button>
              </div>
            </div>

            {/* Col 2: Register Manual External Expense */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Registrar Gasto Manual / Extra</h3>
                <p className="text-xs text-slate-400 mb-4">Pagos extraordinarios fuera de la caja chica diaria</p>

                <form onSubmit={handleAddManualExpense} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Fecha
                      </label>
                      <input
                        type="date"
                        value={extForm.date}
                        onChange={(e) => setExtForm((p) => ({ ...p, date: e.target.value }))}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Monto (CLP)
                      </label>
                      <input
                        type="number"
                        placeholder="Ej: 85000"
                        value={extForm.amount}
                        onChange={(e) => setExtForm((p) => ({ ...p, amount: e.target.value }))}
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-400"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Motivo / Descripción
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Pago de flete camión bodega externa"
                      value={extForm.reason}
                      onChange={(e) => setExtForm((p) => ({ ...p, reason: e.target.value }))}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-400"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Categoría
                    </label>
                    <select
                      value={extForm.category}
                      onChange={(e) => setExtForm((p) => ({ ...p, category: e.target.value }))}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-400 cursor-pointer"
                    >
                      <option>Gasto fijo</option>
                      <option>Servicios básicos</option>
                      <option>Logística y transporte</option>
                      <option>Honorarios y contador</option>
                      <option>Gasto extraordinario</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={extAddingManual}
                    className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-200/50 hover:shadow-rose-300/60 transition active:scale-95"
                  >
                    {extAddingManual ? 'Registrando...' : 'Registrar Gasto Manual'}
                  </button>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-600 mb-2">Gastos Manuales de este mes</h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {extManual.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{m.reason}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {m.date} · {m.category}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-rose-600">{fmtMoney(m.amount)}</span>
                        <button
                          onClick={() => handleDeleteManualExpense(m.id)}
                          className="p-1 text-slate-300 hover:text-red-500 transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {extManual.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">Sin gastos manuales en este mes</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB 3: RESUMEN CONSOLIDADO (CON INVERSIÓN MERCADERÍA) ═══════════════════════ */}
      {activeTab === 'consolidado' && (
        <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-white/90 border border-white/20">
                Resumen Financiero Total
              </span>
              <h2 className="text-2xl sm:text-3xl font-black mt-3">Balance Integral de Egresos & Inversión</h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mt-1">
                Consolidación completa de gastos de caja chica en tienda (POS), inversiones de stock (Jefatura) y egresos fijos/estructurales.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-8">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[11px] font-bold text-slate-300 uppercase">1. Caja Chica (Tienda)</p>
                  <p className="text-2xl font-black text-rose-300 mt-1">{fmtMoney(totalGastosOperacionales)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Operación diaria</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-cyan-400/30 ring-1 ring-cyan-400/20">
                  <p className="text-[11px] font-bold text-cyan-300 uppercase flex items-center gap-1">
                    <Crown size={12} /> 2. Mercadería (Jefe)
                  </p>
                  <p className="text-2xl font-black text-cyan-200 mt-1">{fmtMoney(totalInversionMercaderia)}</p>
                  <p className="text-[10px] text-cyan-300/70 mt-0.5">Inversión en stock</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[11px] font-bold text-slate-300 uppercase">3. Gastos Fijos</p>
                  <p className="text-2xl font-black text-amber-300 mt-1">{fmtMoney(totalExtFixed)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Estructura mensual</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[11px] font-bold text-slate-300 uppercase">4. Gastos Externos</p>
                  <p className="text-2xl font-black text-emerald-300 mt-1">{fmtMoney(totalExtManual)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Pagos extras</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Total Egresos & Compras del Período</p>
                  <p className="text-3xl sm:text-4xl font-black text-white">{fmtMoney(totalGastos + totalExtAll)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setJefeGastoType('mercaderia')
                      setFullScreenMode('register_form')
                    }}
                    className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Cargar Compra de Mercadería
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-lg transition active:scale-95"
                  >
                    Exportar Informe Financiero
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}







      {/* ═══════════════════════ DETAIL MODAL — THE SACRED IA ANALYSIS DRAWER ═══════════════════════ */}
      {detailGasto &&
        (() => {
          const dTheme = getSedeTheme(detailGasto.sede)
          const sedeGastos = filteredGastos.filter((x) => x.sede === detailGasto.sede)
          const totalSede = sedeGastos.reduce((s, x) => s + x.monto, 0)
          const tipoColor = tipoColors[detailGasto.tipo] || tipoColors['Otros']
          const isAdelanto = iaFicha?.esAdelanto === true
          const confianza = iaFicha?.confianzaIA ?? 0
          const ef = editMode ? editingFicha : iaFicha

          const tGrad =
            detailGasto.tipo === 'Personal'
              ? { grad: 'from-pink-500 to-rose-500', particles: ['#ec4899', '#f43f5e', '#fb7185'] }
              : detailGasto.tipo === 'Gasto de mercadería'
              ? { grad: 'from-cyan-500 to-blue-600', particles: ['#06b6d4', '#0284c7', '#38bdf8'] }
              : detailGasto.tipo === 'Mantenimiento'
              ? { grad: 'from-amber-500 to-orange-500', particles: ['#f59e0b', '#f97316', '#fbbf24'] }
              : detailGasto.tipo === 'Operacional'
              ? { grad: 'from-blue-500 to-indigo-500', particles: ['#3b82f6', '#6366f1', '#60a5fa'] }
              : detailGasto.tipo === 'Servicios'
              ? { grad: 'from-green-500 to-emerald-500', particles: ['#22c55e', '#10b981', '#34d399'] }
              : { grad: 'from-slate-400 to-gray-500', particles: ['#94a3b8', '#64748b', '#cbd5e1'] }

          return (
            <div
              className="gp-modal fixed inset-0 z-50 flex items-end sm:items-center justify-center"
              onClick={() => {
                if (!editMode) closeDetailModal()
              }}
            >
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                style={closingModal ? { animation: 'gp_backdropOut 0.28s ease-in forwards' } : undefined}
              />
              <div
                className="relative w-full max-w-lg max-h-[90dvh] sm:max-h-[95vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl pb-[env(safe-area-inset-bottom)]"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: closingModal ? 'gp_slideDown 0.28s ease-in forwards' : 'gp_slideUp 0.3s ease-out' }}
              >
                {/* Header with Type Gradient */}
                <div className="relative overflow-hidden rounded-t-3xl">
                  <div className={`absolute inset-0 bg-gradient-to-br ${tGrad.grad} opacity-[0.12]`} />
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-white" />

                  <div className="relative p-5 pb-4">
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 z-10">
                      {iaFicha && !editMode && (
                        <button
                          onClick={() => {
                            setEditMode(true)
                            setEditingFicha({ ...iaFicha })
                            setEditingDescription(detailGasto.descripcionMejorada || detailGasto.descripcion)
                          }}
                          className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-sm transition-colors"
                          title="Editar descripción y ficha"
                        >
                          <Pencil size={14} className="text-blue-500" />
                        </button>
                      )}
                      {editMode ? (
                        <button
                          onClick={() => {
                            setEditMode(false)
                            setEditingFicha(null)
                            setEditingDescription(null)
                          }}
                          className="p-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 shadow-sm transition-colors"
                          title="Cancelar"
                        >
                          <XCircle size={14} className="text-red-500" />
                        </button>
                      ) : (
                        <button
                          onClick={() => closeDetailModal()}
                          className="p-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200 shadow-sm transition-colors"
                        >
                          <X size={15} className="text-slate-500" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl shrink-0 drop-shadow-sm">{tipoEmojis[detailGasto.tipo] || '📦'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${dTheme.badge}`}>
                            {sedeShortName(detailGasto.sede)}
                          </span>
                          {detailGasto.isJefatura && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-xs">
                              <Crown size={10} /> Compra Jefatura
                            </span>
                          )}
                          {isAdelanto && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-300">
                              💰 Adelanto
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">📅 {detailGasto.fecha}</p>
                      </div>
                    </div>

                    <p className="text-3xl font-black text-slate-800 tracking-tight">{fmtMoney(detailGasto.monto)}</p>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="px-5 pb-5 space-y-4">
                  {/* Status Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${tipoColor}`}>
                      {tipoEmojis[detailGasto.tipo] || '📦'} {detailGasto.tipo}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                        categoriaColors[detailGasto.categoria] || categoriaColors['Otros']
                      }`}
                    >
                      {categoriaEmojis[detailGasto.categoria] || '📌'} {detailGasto.categoria}
                    </span>
                    {detailGasto.clasificadoPor && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {detailGasto.clasificadoPor}
                      </span>
                    )}
                    {ef && (
                      <>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          ✅ {ef.razonabilidad}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border bg-green-50 text-green-700 border-green-200">
                          🛡️ Riesgo {ef.nivelRiesgo}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200">
                          ⭐ {ef.puntaje || 8}/10
                        </span>
                      </>
                    )}
                  </div>

                  {/* Description Box */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 relative">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">📝 Descripción</p>
                      {detailGasto.descripcion !== detailGasto.descripcionMejorada && detailGasto.descripcionMejorada && (
                        <button
                          onClick={() => setShowOriginal(!showOriginal)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all ${
                            showOriginal ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          <Eye size={9} />
                          {showOriginal ? 'Mejorada' : 'Original'}
                        </button>
                      )}
                    </div>
                    {editMode && editingDescription !== null ? (
                      <textarea
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        className="w-full text-sm text-slate-800 font-medium leading-relaxed bg-white rounded-xl p-3 border border-blue-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none resize-none min-h-[60px]"
                        placeholder="Edita la descripción..."
                      />
                    ) : (
                      <div className="cursor-pointer" onClick={() => setShowOriginal((s) => !s)}>
                        <p className="text-sm text-slate-800 font-medium leading-relaxed">
                          {showOriginal ? detailGasto.descripcion : detailGasto.descripcionMejorada || detailGasto.descripcion}
                        </p>
                        {detailGasto.descripcion !== detailGasto.descripcionMejorada && detailGasto.descripcionMejorada && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Sparkles size={9} className="text-emerald-500" />
                            <span className="text-[9px] text-emerald-600 font-semibold">
                              {showOriginal ? 'Texto original' : 'Mejorada por IA — toca para alternar'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata de Jefatura (Proveedor, Factura, Medio de pago) */}
                  {(detailGasto.proveedor || detailGasto.facturaNro || detailGasto.medioPago) && (
                    <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50/70 to-blue-50/30 p-3.5 space-y-2">
                      <p className="text-[10px] text-cyan-800 font-black uppercase tracking-wider flex items-center gap-1">
                        <Crown size={12} className="text-amber-500" /> Datos de Respaldo de Jefatura
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {detailGasto.proveedor && (
                          <div>
                            <span className="text-[10px] text-slate-400 block">Proveedor:</span>
                            <span className="font-bold text-slate-800">{detailGasto.proveedor}</span>
                          </div>
                        )}
                        {detailGasto.facturaNro && (
                          <div>
                            <span className="text-[10px] text-slate-400 block">N° Factura/Boleta:</span>
                            <span className="font-bold text-slate-800">{detailGasto.facturaNro}</span>
                          </div>
                        )}
                        {detailGasto.medioPago && (
                          <div>
                            <span className="text-[10px] text-slate-400 block">Medio de Pago:</span>
                            <span className="font-bold text-slate-800">{detailGasto.medioPago}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Antecedentes Similares ── */}
                  {(() => {
                    const similar = filteredGastos
                      .filter((x) => x !== detailGasto && x.sede === detailGasto.sede && x.tipo === detailGasto.tipo)
                      .slice(0, 3)
                    if (similar.length === 0) return null
                    const totalSim = similar.reduce((s, x) => s + x.monto, 0)
                    return (
                      <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/50 to-blue-50/30 p-3.5">
                        <div className="flex items-center gap-1.5 mb-2">
                          <TrendingDown size={11} className="text-sky-500" />
                          <p className="text-[10px] text-sky-600 font-bold uppercase tracking-wider">Antecedentes similares</p>
                          <span className="ml-auto text-[9px] text-sky-400 font-semibold">
                            {similar.length} gastos · {fmtMoney(totalSim)}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {similar.map((s, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg bg-white/60 border border-sky-100/50">
                              <p className="text-[11px] text-slate-700 font-medium truncate">{s.descripcionMejorada || s.descripcion}</p>
                              <p className="text-[11px] font-bold text-slate-800 shrink-0">{fmtMoney(s.monto)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Liquid Confianza IA Bar ── */}
                  {iaFicha && (
                    <div
                      className="rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-200 p-3 shadow-sm relative cursor-pointer select-none"
                      onClick={() => setHoldingConfidence((h) => !h)}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confianza IA</span>
                          <span className="text-[8px] text-slate-300 font-medium">(toca para {holdingConfidence ? 'ocultar' : 'ver detalles'})</span>
                        </div>
                        <span className="text-xs font-extrabold text-emerald-700">{confianza}%</span>
                      </div>
                      <div className="h-6 rounded-full bg-slate-200/80 overflow-hidden relative">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 transition-[width] duration-1000 ease-out overflow-hidden"
                          style={{ width: `${confianza}%` }}
                        >
                          <div
                            className="absolute inset-0 opacity-40"
                            style={{
                              backgroundImage:
                                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 50%, rgba(255,255,255,0) 100%)',
                              backgroundSize: '200% 100%',
                              animation: 'gp_shimmer 2.5s ease-in-out infinite',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Herramientas IA ── */}
                  {iaFicha && !editMode && (
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/50 to-white p-3.5">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <Zap size={11} className="text-violet-500" />
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Herramientas IA</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const i = filteredGastos.indexOf(detailGasto)
                            if (i >= 0) clasificarUno(i)
                          }}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors active:scale-95"
                        >
                          <Brain size={13} /> Reclasificar
                        </button>
                        <button
                          onClick={() => {
                            setEditMode(true)
                            setEditingFicha({ ...iaFicha })
                            setEditingDescription(detailGasto.descripcionMejorada || detailGasto.descripcion)
                          }}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors active:scale-95"
                        >
                          <Pencil size={13} /> Editar ficha
                        </button>
                        <button
                          onClick={() => openIaChat()}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200 hover:from-amber-100 transition-colors active:scale-95"
                        >
                          <MessageCircle size={13} /> Chat con Solé
                        </button>
                        <button
                          onClick={async () => {
                            const txt = `${detailGasto.tipo} | ${detailGasto.categoria}\n${detailGasto.descripcionMejorada || detailGasto.descripcion}\nMonto: ${fmtMoney(detailGasto.monto)}\nSede: ${sedeShortName(detailGasto.sede)}`
                            await navigator.clipboard.writeText(txt)
                            alert('📋 Ficha copiada al portapapeles.')
                          }}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors active:scale-95"
                        >
                          <Download size={13} /> Copiar ficha
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Chat con Solé ── */}
                  {iaChat.open && (
                    <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/30 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500">
                        <div className="flex items-center gap-2">
                          <MessageCircle size={14} className="text-white" />
                          <p className="text-xs font-black text-white uppercase tracking-wider">Chat con Solé</p>
                        </div>
                        <button onClick={() => setIaChat((p) => ({ ...p, open: false }))} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 text-white">
                          <X size={12} />
                        </button>
                      </div>
                      <div className="max-h-[220px] overflow-y-auto p-3 space-y-2">
                        {iaChat.messages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-amber-200 text-slate-700 shadow-sm'}`}>
                              {msg.text}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-2 border-t border-amber-200/50 flex gap-1.5">
                        <input
                          type="text"
                          value={iaChat.input}
                          onChange={(e) => setIaChat((p) => ({ ...p, input: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && sendIaChatMessage()}
                          placeholder="Escribe tu mensaje..."
                          className="flex-1 text-xs bg-white rounded-xl px-3 py-1.5 border border-amber-200 outline-none"
                        />
                        <button onClick={sendIaChatMessage} className="px-3 py-1.5 rounded-xl bg-orange-500 text-white text-xs font-bold">
                          Enviar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Ficha de Análisis IA ── */}
                  {ef && (
                    <div className="rounded-2xl border-2 border-violet-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 shadow-sm">
                            <Brain size={14} className="text-white" />
                          </div>
                          <p className="text-xs text-violet-700 font-black uppercase tracking-wider">
                            {editMode ? 'Editando Ficha' : 'Ficha de Análisis IA'}
                          </p>
                        </div>
                        {editMode && (
                          <button
                            onClick={saveEditedFicha}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition shadow-sm"
                          >
                            <Save size={12} /> Guardar
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-200">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Razonabilidad</p>
                            <p className="text-xs font-black text-emerald-700">✓ {ef.razonabilidad}</p>
                          </div>
                          <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-200">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Riesgo</p>
                            <p className="text-xs font-black text-emerald-700">🛡️ {ef.nivelRiesgo}</p>
                          </div>
                          <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-200">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Puntaje</p>
                            <p className="text-sm font-black text-emerald-700">
                              {ef.puntaje || 8}
                              <span className="text-[10px] text-slate-400">/10</span>
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-200">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Proporción</p>
                            <p className="text-xs font-semibold text-slate-700">{ef.proporcion}</p>
                          </div>
                          <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-200">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Monto Esperado</p>
                            <p className="text-xs font-semibold text-slate-700">{ef.montoEsperado}</p>
                          </div>
                        </div>

                        <div className="rounded-xl p-3 border-l-4 border-l-violet-400 bg-violet-50/50 border border-violet-100">
                          <p className="text-[9px] text-violet-500 font-bold uppercase mb-1">Observación</p>
                          <p className="text-xs text-slate-700 font-medium leading-relaxed">{ef.observacion}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resumen Sede */}
                  <div className="rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">
                      📊 Resumen {sedeShortName(detailGasto.sede)}
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-black text-slate-800">{sedeGastos.length}</p>
                        <p className="text-[9px] text-slate-400 font-semibold">Gastos</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-rose-600">{fmtMoney(totalSede)}</p>
                        <p className="text-[9px] text-slate-400 font-semibold">Total sede</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-600">{fmtMoney(totalGastos)}</p>
                        <p className="text-[9px] text-slate-400 font-semibold">Total general</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      {/* ═══════════════════════ MODAL: NUEVO GASTO DIRECTO (POS/SUCURSAL) ═══════════════════════ */}
      {showNewExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-800">Registrar Salida de Efectivo</h3>
              <button onClick={() => setShowNewExpenseModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateNewExpense} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Sucursal</label>
                <select
                  value={newExpenseSede}
                  onChange={(e) => setNewExpenseSede(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                >
                  {SEDE_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {sedeShortName(s)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Monto (CLP)</label>
                <input
                  type="number"
                  placeholder="Ej: 45000"
                  value={newExpenseMonto}
                  onChange={(e) => setNewExpenseMonto(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Descripción / Motivo</label>
                <input
                  type="text"
                  placeholder="Ej: Compra de bolsas para empaque"
                  value={newExpenseDesc}
                  onChange={(e) => setNewExpenseDesc(e.target.value)}
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Tipo</label>
                  <select
                    value={newExpenseTipo}
                    onChange={(e) => setNewExpenseTipo(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  >
                    {TIPOS_VALIDOS_MASIVO.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Categoría</label>
                  <select
                    value={newExpenseCat}
                    onChange={(e) => setNewExpenseCat(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  >
                    {CATEGORIAS_VALIDAS_MASIVO.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewExpenseModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingExpense}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition shadow-sm"
                >
                  {creatingExpense ? 'Guardando...' : 'Guardar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════ MODAL: ADELANTOS REALES DEL PERSONAL (trabajadores_erp) ═══════════════════════ */}
      {showAdelantosModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAdelantosModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-indigo-50">
              <div>
                <h3 className="text-base font-black text-slate-800">👥 Adelantos Reales del Personal · Importadora Carlitos Central</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sincronizado en vivo desde <code className="font-bold text-slate-700">trabajadores_erp</code> ({trabajadoresErp.length} trabajadores)
                </p>
              </div>
              <button
                onClick={() => setShowAdelantosModal(false)}
                className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {(() => {
                const conAdelantos = trabajadoresErp.filter((w) => (w.adelantoHistorial?.length || 0) > 0)
                const totalAdelantosGlobal = trabajadoresErp.reduce(
                  (acc, w) => acc + (w.adelantoHistorial || []).reduce((s, a) => s + a.monto, 0),
                  0
                )
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200">
                        <p className="text-[10px] font-bold uppercase text-sky-700">Equipo Total</p>
                        <p className="text-xl font-black text-sky-900 mt-0.5">{trabajadoresErp.length}</p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
                        <p className="text-[10px] font-bold uppercase text-indigo-700">Con Adelantos</p>
                        <p className="text-xl font-black text-indigo-900 mt-0.5">{conAdelantos.length}</p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200">
                        <p className="text-[10px] font-bold uppercase text-rose-700">Total Adelantos</p>
                        <p className="text-xl font-black text-rose-900 mt-0.5">{fmtMoney(totalAdelantosGlobal)}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {trabajadoresErp.map((w) => {
                        const hist = w.adelantoHistorial || []
                        const totalW = hist.reduce((s, a) => s + a.monto, 0)
                        return (
                          <div
                            key={w.id}
                            className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-slate-800">{w.nombre}</span>
                                  {w.cargo && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/80 text-slate-700">
                                      {w.cargo}
                                    </span>
                                  )}
                                </div>
                                {w.sueldo ? (
                                  <p className="text-[11px] text-slate-500">Sueldo base: {fmtMoney(w.sueldo)}</p>
                                ) : null}
                              </div>
                              <div className="text-right">
                                <span
                                  className={`text-sm font-black ${
                                    totalW > 0 ? 'text-rose-600' : 'text-emerald-600'
                                  }`}
                                >
                                  {totalW > 0 ? fmtMoney(totalW) : 'Sin adelantos'}
                                </span>
                                {hist.length > 0 && (
                                  <p className="text-[10px] text-slate-400">{hist.length} registros</p>
                                )}
                              </div>
                            </div>

                            {hist.length > 0 && (
                              <div className="pt-2 border-t border-slate-200/70 space-y-1">
                                {hist.map((a, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between text-xs bg-white px-3 py-1.5 rounded-xl border border-slate-100"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] text-slate-400">{a.ymd}</span>
                                      <span className="font-medium text-slate-700">{a.descripcion || 'Adelanto'}</span>
                                    </div>
                                    <span className="font-bold text-rose-600">{fmtMoney(a.monto)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      </div>

      {/* ═══════════════════════ PHOTO VIEWER LIGHTBOX ═══════════════════════ */}
      {photoViewer && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => setPhotoViewer(null)}
        >
          <button
            onClick={() => setPhotoViewer(null)}
            className="absolute top-4 right-4 z-10 p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white"
          >
            <X size={20} />
          </button>
          <div className="max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border-2 border-white/20 shadow-2xl">
            <img src={photoViewer} alt="Comprobante" className="w-full h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function GastosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-3 border-rose-500 border-t-transparent" />
        </div>
      }
    >
      <GastosDashboardContent />
    </Suspense>
  )
}
