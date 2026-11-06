"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import posLayout from './pos-layout.module.css'
import design from '@/components/pos/pos-design.module.css'
import '@/components/pos/pos-skins.css'
import PosBrand from '@/components/pos/PosBrand'
import PosToolbar, { type PosToolbarAction } from '@/components/pos/PosToolbar'
import PosCustomerTabs from '@/components/pos/PosCustomerTabs'
import PosProductCard from '@/components/pos/PosProductCard'
import PosSaleResult from '@/components/pos/PosSaleResult'
import PosCheckoutSummary from '@/components/pos/PosCheckoutSummary'
import PosCashOutDialog from '@/components/pos/PosCashOutDialog'
import PosThemeStudio, { ThemeMascotEmblem } from '@/components/pos/PosThemeStudio'
import PosSakuraRain from '@/components/pos/PosSakuraRain'
import PosSakuraChargeParticles from '@/components/pos/PosSakuraChargeParticles'
import {
  PosSakuraAmbientField,
  PosSakuraCartEmptyArt,
  PosSakuraSearchEmptyHero,
} from '@/components/pos/PosSakuraDecor'
import PosNekoRain from '@/components/pos/PosNekoRain'
import PosNekoChargeParticles from '@/components/pos/PosNekoChargeParticles'
import {
  PosNekoAmbientField,
  PosNekoCartEmptyArt,
  PosNekoSearchEmptyHero,
} from '@/components/pos/PosNekoDecor'
import PosCapyRain from '@/components/pos/PosCapyRain'
import PosCapyChargeParticles from '@/components/pos/PosCapyChargeParticles'
import {
  PosCapyAmbientField,
  PosCapyCartEmptyArt,
  PosCapySearchEmptyHero,
} from '@/components/pos/PosCapyDecor'
import PosJasmineRain from '@/components/pos/PosJasmineRain'
import PosJasmineChargeParticles from '@/components/pos/PosJasmineChargeParticles'
import {
  PosJasmineAmbientField,
  PosJasmineCartEmptyArt,
  PosJasmineSearchEmptyHero,
} from '@/components/pos/PosJasmineDecor'
import {
  DEFAULT_POS_PERSONAL_THEME,
  isPosNekoAnimatedTheme,
  isPosNekoTheme,
  normalizePosPersonalTheme,
  resolvePosSkinTokens,
  type PosPersonalTheme,
} from '@/components/pos/posThemes'
import {
  cacheSakuraWallpaper,
  getCachedSakuraWallpaper,
  cacheNekoWallpaper,
  getCachedNekoWallpaper,
  cacheNekoFernandaWallpaper,
  getCachedNekoFernandaWallpaper,
  cacheCapyWallpaper,
  getCachedCapyWallpaper,
  cacheJasmineWallpaper,
  getCachedJasmineWallpaper,
} from '@/components/pos/posWallpaperCache'
import { useParams, useRouter } from 'next/navigation'
import { fetchAllFirebaseErpProducts, POS_PRODUCTS_CACHE_TTL_MS, updateFirebaseErpProduct, getFirebaseErpCategories, clearPosProductsCache, patchErpProductsLocalCacheStock, FirebaseErpProduct, isAppwriteProduct, isWebOnlyProduct } from '@/lib/firebaseErpService'
import { getSalePagos, getSaleEfectivoNeto } from '@/lib/posSalePayments'
import { fetchTrabajadoresERP, fetchTrabajadorERP } from '@/lib/trabajadoresErpService'
import { workerBranchSlugs, matchBranchSlug, workerCanAccessBranch, getBranchDisplayName } from '@/lib/posBranchAccess'
import { getServices, Query } from '@/lib/firebase-compat'
import { loadErpConfig } from '@/lib/posConfig'
import { openReceiptPrintWindow, ReceiptData, openCorteCajaPrintWindow, openBlankReceiptWindow, CorteCajaData } from '@/lib/posReceipt'
import { formatEmbalajeBoletaLabel, resolveEmbalajeQty } from '@/lib/embalajeHelper'
import { normalizePosAccessLevel, type PosAccessLevel } from '@/lib/posAccessLevels'
import { isSellerCargo, normalizePosSellerRole, type PosSellerRole } from '@/lib/posSellerRoles'
import { getChileDateStr } from '@/lib/chileDate'
import { sumarGastosMercaderia, sumarGastosQueAfectanGanancia } from '@/lib/gastosProfit'
import { ERP_GASTO_CATEGORIAS, ERP_GASTO_TIPOS } from '@/lib/gastoCatalog'
import {
  createVentaPos, updateVentaPos, getVentasPosBySesionCaja, getPreVentasBySede, getVentaPosById, adjustCajaSesion,
  createCajaSesion, updateCajaSesion, getActiveCajaSesion, getCajaSesionActual, setActiveCajaSesion,
  createCorteCaja, pollPreVentas,
  VentaPOSAppwrite, SesionCajaAppwrite,
} from '@/lib/firebaseVentasPos'
import { SEDES, SedeSlug, DEFAULT_SEDE } from '@/types'
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, ArrowRightLeft,
  X, Check, Package, BarChart3, DollarSign, Maximize2, Minimize2, PawPrint,
  ChevronLeft, ChevronRight, Hash, Percent, AlertCircle, CheckCircle, RotateCcw, Receipt,
  Store, ScanBarcode, Loader2, Lock, Unlock, Zap, Sparkles, Eye, EyeOff, LogOut, Send, Camera, Edit3, FolderOpen,
  RefreshCw, FileText, FileDown, Database, Tag, Info, Globe, Printer,
  Palette, LockOpen, ShieldAlert, User, XCircle, ImageIcon,
} from 'lucide-react'


import { auth, db, authReady } from '@/lib/firebase';
import PosReturnModal from '@/components/pos/PosReturnModal';
import PosCotizacionModal from '@/components/pos/PosCotizacionModal';
import RecentPriceLabelsModal, { type RecentPriceLabelProduct } from '@/components/erp/RecentPriceLabelsModal';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc,
  where, orderBy, limit as fbLimit, serverTimestamp, Timestamp, increment,
  writeBatch, runTransaction
} from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { getErpUserByEmail } from '@/lib/erpUserService';
import { isAdminEmail } from '@/lib/admin-access'
import { PosCashierSpacePanel, type CashierSpaceView } from '@/components/pos/PosCashierSpace'

// Mock usePriceListConfig variables
const listasActivas = [] as any[];
const nombrePorCampo = (c: string) => {
  if (c === 'precio_detalle') return 'Efectivo';
  if (c === 'precio_mayorista') return 'Embalaje';
  if (c === 'precio_segundo' || c === 'precio_region') return 'Embalaje 2';
  if (c === 'precio_cuarto') return 'Precio especial';
  if (c === 'precio_5') return 'Precio 5';
  if (c === 'precio_6') return 'Precio 6';
  if (c === 'precio_7') return 'Precio 7';
  if (c === 'precio_8') return 'Precio 8';
  if (c === 'precio_9') return 'Precio 9';
  if (c === 'precio_10') return 'Precio 10';
  return c;
};
const inferHistoricalPriceOption = (product: ProductDoc | undefined, unitPrice: number) => {
  if (!product || unitPrice <= 0) return undefined;
  const options = [
    { field: 'precio_detalle', label: nombrePorCampo('precio_detalle'), value: Number(product.precio_detalle || 0) },
    { field: 'precio_mayorista', label: product.label_p2?.trim() || nombrePorCampo('precio_mayorista'), value: Number(product.precio_mayorista || 0) },
    { field: 'precio_segundo', label: product.label_p3?.trim() || nombrePorCampo('precio_segundo'), value: Number(product.precio_segundo || product.precio_region || 0) },
    { field: 'precio_cuarto', label: product.label_p4?.trim() || nombrePorCampo('precio_cuarto'), value: Number(product.precio_cuarto || 0) },
    { field: 'precio_5', label: product.label_p5?.trim() || 'Precio 5', value: Number(product.precio_5 || 0) },
    { field: 'precio_6', label: product.label_p6?.trim() || 'Precio 6', value: Number(product.precio_6 || 0) },
    { field: 'precio_7', label: product.label_p7?.trim() || 'Precio 7', value: Number(product.precio_7 || 0) },
    { field: 'precio_8', label: product.label_p8?.trim() || 'Precio 8', value: Number(product.precio_8 || 0) },
    { field: 'precio_9', label: product.label_p9?.trim() || 'Precio 9', value: Number(product.precio_9 || 0) },
    { field: 'precio_10', label: product.label_p10?.trim() || 'Precio 10', value: Number(product.precio_10 || 0) },
  ];
  return options.find(option => option.value > 0 && Math.round(option.value) === Math.round(unitPrice));
};
// ─── POS User Session ─────────────────────────────────────────────────────────
interface PosUserSession {
  id: string
  nombre: string
  cargo: string
  fotoUrl?: string
  puedeGestionarCaja?: boolean | null
  nivelAccesoPos?: PosAccessLevel
  rolOperativoPos?: PosSellerRole
  rolesAdicionales?: Array<'web'>
  sede: string
  role: 'cajera' | 'vendedora' | 'jefe'
  loginAt: number
}

const POS_SESSION_KEY = 'asistora_pos_session'
const POS_THEME_CACHE_PREFIX = 'asistora_pos_theme_v2_'

// Avatar de cajera con esqueleto mientras carga la imagen (evita mostrar foto anterior)
function CajeraAvatar({ src, alt, className, fallback }: { src?: string; alt: string; className: string; fallback: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setLoaded(false)
    setErrored(false)
    const image = imageRef.current
    if (!image) return
    if (image.complete) {
      if (image.naturalWidth > 0) setLoaded(true)
      else setErrored(true)
    }
  }, [src])

  if (!src || errored) return <>{fallback}</>
  return (
    <div className={`relative ${className}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-200 rounded-full" />}
      <img
        ref={imageRef}
        key={src}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

function getPosSession(sede: string): PosUserSession | null {
  try {
    // Bug corregido: antes leía 'yaxsel_pos_session' pero savePosSession escribe
    // POS_SESSION_KEY ('asistora_pos_session') → la sesión guardada NUNCA se recuperaba.
    const raw = localStorage.getItem(POS_SESSION_KEY) || localStorage.getItem('yaxsel_pos_session')
    if (!raw) return null
    const session = JSON.parse(raw) as PosUserSession
    if (!session || !matchBranchSlug(session.sede, sede)) return null
    session.rolesAdicionales = Array.isArray(session.rolesAdicionales) && session.rolesAdicionales.includes('web') ? ['web'] : []
    if (session && isSellerCargo(session.cargo)) {
      session.rolOperativoPos = normalizePosSellerRole(session.rolOperativoPos)
      session.role = session.rolOperativoPos === 'cajero_express' ? 'cajera' : 'vendedora'
      session.nivelAccesoPos = 'bajo'
      session.puedeGestionarCaja = false
    }
    if (session && ((session.cargo || '').toUpperCase().includes('ADMIN') || (session.cargo || '').toUpperCase().includes('SUPREMO'))) {
      session.role = 'cajera'
    }
    return session
  } catch { return null }
}

function getOperatorPosRole(cargo: string, sellerRole?: PosSellerRole, forceCashier = false): PosUserSession['role'] {
  if (forceCashier) return 'cajera'
  if (isSellerCargo(cargo)) {
    return normalizePosSellerRole(sellerRole) === 'cajero_express' ? 'cajera' : 'vendedora'
  }
  const normalizedCargo = String(cargo || '').toUpperCase()
  if (normalizedCargo.includes('CAJER') || normalizedCargo.includes('ADMIN') || normalizedCargo.includes('SUPREMO') || normalizedCargo.includes('WEB')) return 'cajera'
  if (normalizedCargo.includes('JEFE')) return 'jefe'
  return 'vendedora'
}

function savePosSession(session: PosUserSession) {
  localStorage.setItem(POS_SESSION_KEY, JSON.stringify(session))
}

function clearPosSession() {
  localStorage.removeItem(POS_SESSION_KEY)
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductDoc {
  $id?: string
  sku: string
  nombre: string
  costo_uni: number
  precio_detalle: number
  precio_mayorista: number
  precio_region?: number
  precio_segundo?: number
  precio_cuarto?: number
  precio_5?: number
  precio_6?: number
  precio_7?: number
  precio_8?: number
  precio_9?: number
  precio_10?: number
  label_p2?: string
  label_p3?: string
  label_p4?: string
  label_p5?: string
  label_p6?: string
  label_p7?: string
  label_p8?: string
  label_p9?: string
  label_p10?: string
  min_qty_2?: number
  min_qty_3?: number
  is_draft?: boolean
  status?: string
  ajuste_menos10?: boolean
  imageUrl?: string
  codigo_barra?: string
  category?: string
  stock?: number
  subcategory?: string
  packageQty?: string
  embalajeQty?: number
  boxCode?: string
  supplier?: string
}

interface StockDoc {
  sku: string
  sede: string
  stock: number
}

type PosManualPanelLayout = {
  productsWidth: number
  cartWidth: number
  paymentWidth: number
  proMainWidth: number
  proPaymentWidth: number
  productsHeight: number
  cartHeight: number
  paymentHeight: number
}

type PosManualResizeKind = 'products-width' | 'cart-width' | 'pro-width' | 'products-height' | 'cart-height' | 'payment-height'

const DEFAULT_POS_MANUAL_PANEL_LAYOUT: PosManualPanelLayout = {
  productsWidth: 1,
  cartWidth: 1.05,
  paymentWidth: 0.7,
  proMainWidth: 5.5,
  proPaymentWidth: 1,
  productsHeight: 100,
  cartHeight: 100,
  paymentHeight: 100,
}

const POS_MANUAL_PANEL_LAYOUT_KEY = 'donbalato_pos_manual_panel_layout'
const POS_MANUAL_PANEL_MODE_KEY = 'donbalato_pos_manual_panel_resize'

interface CartItem {
  productId?: string
  sku: string
  nombre: string
  cantidad: number
  precioUnitario: number
  priceField?: string
  priceLabel?: string
  costoUnitario: number
  descuentoPct: number
  subtotal: number
  stockDisponible: number
  imageUrl?: string
  stockPendiente?: boolean
  packageQty?: string
  embalajeQty?: number
  boxCode?: string
}

type MetodoPago = 'efectivo' | 'debito' | 'transferencia'

interface PagoEntry {
  metodo: MetodoPago
  monto: number
}

type ReceiptCounters = {
  boletaNumero: number
  debitoOrdenNumero: number | null
}

interface VentaPOS {
  id: string
  sede: string
  cajeroId?: string
  cajeroNombre: string
  clienteNombre?: string
  sesionCajaId: string
  fecha?: any
  fechaStr?: string
  fechaTs?: number
  itemsJson?: string
  items: Array<{
    sku: string
    nombre: string
    cantidad: number
    precioUnitario: number
    costoUnitario: number
    descuentoPct: number
    subtotal: number
    imageUrl?: string
    priceField?: string
    priceLabel?: string
    embalajeQty?: number
    packageQty?: string
    boxCode?: string
  }>
  subtotal: number
  descuentoGlobalPct: number
  descuentoGlobal: number
  total: number
  metodoPago?: string
  pagos: PagoEntry[]
  efectivoPagado?: number
  vuelto: number
  estado: 'completada' | 'anulada' | 'pre_venta'
  createdAt?: any
  createdAtTs?: number
  boletaNumero?: number
  debitoOrdenNumero?: number | null
  tipoComprobante?: 'boleta' | 'comprobante'
}

interface CustomerSaleTab {
  id: string
  name: string
  cart: CartItem[]
  descuentoGlobalPct: number
  pagoActivo: MetodoPago
  montoRecibido: string
  pagos: PagoEntry[]
  splitMode: boolean
  tipoComprobante: 'boleta' | 'comprobante'
  updatedAt: number
  originVendorName?: string
  pendingSaleId?: string
}

const POS_CUSTOMER_TABS_KEY = 'asistora_pos_customer_tabs_v1'
const POS_DRAFTS_STORAGE_PREFIX = 'asistora_pos_drafts_v1_'
const POS_QUICK_AMOUNT_ACCUMULATE_KEY = 'donbalato_pos_quick_amounts_accumulate_v1'
const MAX_CUSTOMER_TABS = 8
const RESTORE_SALE_STORAGE_PREFIX = 'yaxsel_pos_restore_sale_'

const createCustomerSaleTab = (
  number: number,
  name?: string,
  extra?: {
    cart?: CartItem[]
    descuentoGlobalPct?: number
    originVendorName?: string
    pendingSaleId?: string
  }
): CustomerSaleTab => ({
  id: extra?.pendingSaleId ? `tab_pending_${extra.pendingSaleId}` : `cliente_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: name?.trim() || `Cliente ${number}`,
  cart: extra?.cart || [],
  descuentoGlobalPct: extra?.descuentoGlobalPct || 0,
  pagoActivo: 'efectivo',
  montoRecibido: '',
  pagos: [],
  splitMode: false,
  tipoComprobante: 'comprobante',
  updatedAt: Date.now(),
  originVendorName: extra?.originVendorName,
  pendingSaleId: extra?.pendingSaleId,
})

interface CajaGasto {
  id: string
  monto: number
  detalle: string
  tipo?: string
  categoria?: string
  usuario: string
  createdAtTs: number
}

interface SesionCaja {
  id: string
  cajeroId?: string
  parentSessionId?: string
  cierrePor?: string
  cierrePorNombre?: string
  aperturaObservacion?: string
  sede: string
  cajeroNombre: string
  estado: 'abierta' | 'cerrada'
  montoApertura: number
  montoCierre?: number
  ventasCount: number
  totalVentas: number
  totalEfectivo: number
  totalDebito: number
  totalTransferencia: number
  totalGastos?: number
  devolucionesPosTotal?: number
  devolucionesPosEfectivo?: number
  devolucionesPosItemsJson?: string
  gastosItems?: CajaGasto[]
  aperturaAt: any
  aperturaAtTs?: number
  cierreAt?: any
  cierreAtTs?: number
  fechaStr?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n))

const fmtN = (n: number) => new Intl.NumberFormat('es-CL').format(Math.round(n))

const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase()

const now = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const todayStr = () => {
  return getChileDateStr()
}

const isSessionFromToday = (data: any): boolean => {
  if (!data) return false
  const today = todayStr()

  if (typeof data.fechaStr === 'string' && data.fechaStr.trim()) {
    return data.fechaStr.trim().slice(0, 10) === today
  }
  if (typeof data.fecha === 'string' && data.fecha.trim().length >= 10 && data.fecha.includes('-')) {
    return data.fecha.trim().slice(0, 10) === today
  }

  const resolveTs = (val: any): number => {
    if (!val) return 0
    if (typeof val === 'number') return val > 1e11 ? val : val * 1000
    if (typeof val.toMillis === 'function') return val.toMillis()
    if (typeof val.seconds === 'number') return val.seconds * 1000
    if (typeof val.toDate === 'function') return val.toDate().getTime()
    if (val instanceof Date) return val.getTime()
    if (typeof val === 'string') {
      const parsed = Date.parse(val)
      if (!Number.isNaN(parsed)) return parsed
    }
    return 0
  }

  const ts = resolveTs(data.cierreAtTs) || resolveTs(data.cierreAt) || resolveTs(data.aperturaAtTs) || resolveTs(data.aperturaAt) || resolveTs(data.createdAtTs) || resolveTs(data.createdAt)
  if (ts > 0) {
    try {
      const santiagoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ts))
      if (santiagoDate === today) return true
    } catch {}
    return getChileDateStr(new Date(ts)) === today
  }

  return false
}

const genId = () => `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

// ─── Component ───────────────────────────────────────────────────────────────

export default function PuntoDeVentaPage() {
  const { sede: sedeParam } = useParams<{ sede: string }>()
  const router = useRouter()
  const sede = (sedeParam || '') as SedeSlug
  const sedeNombre = SEDES[sede] || getBranchDisplayName(sede)

  useEffect(() => {
    loadErpConfig()
      .then(parsed => {
        if (parsed && Array.isArray(parsed.branches) && parsed.branches.length > 0) {
          try {
            const activeSlugs = parsed.branches.filter((b: any) => b.active !== false).map((b: any) => b.slug || b.name?.toLowerCase().replace(/\s+/g, '-'));
            if (activeSlugs.length > 0 && !activeSlugs.includes(sede)) {
              router.replace(`/pos/${activeSlugs[0]}`);
            }
          } catch (e) {
            console.error('Error verifying POS branch:', e);
          }
        }
      })
      .catch(err => console.error('Error loading config:', err));
  }, [sede, router]);
  

  // ─── POS Login ────────────────────────────────────────────────────────────────
  const { user: authUser, isLoggedIn: authLoggedIn, isLoading: authLoading, logout: authLogout } = useAuth()
  const [branchAccess, setBranchAccess] = useState<{ sede: string; status: 'checking' | 'allowed' | 'denied' }>({ sede, status: 'checking' })
  const [posUser, setPosUser] = useState<PosUserSession | null>(() => getPosSession(sede))
  const [loginUsers, setLoginUsers] = useState<Array<{ id: string; nombre: string; cargo: string; fotoUrl?: string; posPassword?: string; posActivo?: boolean; puedeGestionarCaja?: boolean | null; nivelAccesoPos?: PosAccessLevel; rolOperativoPos?: PosSellerRole; rolesAdicionales?: Array<'web'> }>>([])
  const [loginLoading, setLoginLoading] = useState(true)
  const [loginSelected, setLoginSelected] = useState<string | null>(null)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginShowPw, setLoginShowPw] = useState(false)
  const [cashierSpaceView, setCashierSpaceView] = useState<CashierSpaceView | null>(null)
  const [showPosThemeEditor, setShowPosThemeEditor] = useState(false)
  const [posPersonalTheme, setPosPersonalTheme] = useState<PosPersonalTheme>(DEFAULT_POS_PERSONAL_THEME)
  const [draftPosTheme, setDraftPosTheme] = useState<PosPersonalTheme>(DEFAULT_POS_PERSONAL_THEME)
  const [sakuraRainTrigger, setSakuraRainTrigger] = useState(0)
  const triggerSakuraRain = useCallback(() => {
    const currentThemeId = showPosThemeEditor ? draftPosTheme.presetId : posPersonalTheme.presetId
    if (
      currentThemeId === 'sakura-coquette' ||
      currentThemeId === 'neko-mikan' ||
      currentThemeId === 'neko-nocturno' ||
      currentThemeId === 'capy-matcha' ||
      currentThemeId === 'jasmine-lavender'
    ) {
      setSakuraRainTrigger(prev => prev + 1)
    }
  }, [showPosThemeEditor, draftPosTheme.presetId, posPersonalTheme.presetId])
  const [cachedSakuraWallpaper, setCachedSakuraWallpaper] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getCachedSakuraWallpaper()
    }
    return ''
  })
  const [cachedNekoWallpaper, setCachedNekoWallpaper] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getCachedNekoWallpaper()
    }
    return ''
  })
  const [cachedNekoFernandaWallpaper, setCachedNekoFernandaWallpaper] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getCachedNekoFernandaWallpaper()
    }
    return ''
  })
  const [cachedCapyWallpaper, setCachedCapyWallpaper] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getCachedCapyWallpaper()
    }
    return ''
  })
  const [cachedJasmineWallpaper, setCachedJasmineWallpaper] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getCachedJasmineWallpaper()
    }
    return ''
  })
  const [posThemeOwnerId, setPosThemeOwnerId] = useState<string | null>(null)
  const [posThemeLoading, setPosThemeLoading] = useState(false)
  const [posThemeSaving, setPosThemeSaving] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxProduct, setLightboxProduct] = useState<ProductDoc | null>(null)
  const [showBasicProductEditor, setShowBasicProductEditor] = useState(false)
  const [basicProductSaving, setBasicProductSaving] = useState(false)
  const [basicImageUploading, setBasicImageUploading] = useState(false)
  const [basicProductForm, setBasicProductForm] = useState({
    sku: '',
    codigo_barra: '',
    nombre: '',
    packageQty: '',
    category: '',
    stock: '',
    costo_uni: '',
    precio_venta_1: '',
    precio_venta_2: '',
    precio_venta_3: '',
    imageUrl: '',
    precioEmergencia: '',
    motivoEmergencia: '',
  })

  useEffect(() => {
    const rawCashierId = String(posUser?.id || '').trim()
    const accountKey = rawCashierId && rawCashierId !== 'default' ? rawCashierId : `default_${sede}`
    const cacheKey = `${POS_THEME_CACHE_PREFIX}${accountKey}`

    // Instant hydration from localStorage to prevent flash of unstyled theme
    let cachedTheme: PosPersonalTheme = DEFAULT_POS_PERSONAL_THEME
    try {
      const rawCache = localStorage.getItem(cacheKey)
      if (rawCache) {
        cachedTheme = normalizePosPersonalTheme(JSON.parse(rawCache))
      }
    } catch {}

    setPosPersonalTheme(cachedTheme)
    setDraftPosTheme(cachedTheme)
    setPosThemeOwnerId(accountKey)

    if (!rawCashierId || rawCashierId === 'default') {
      setPosThemeLoading(false)
      return
    }

    let active = true
    try {
      const cachedTs = Number(localStorage.getItem(`${cacheKey}_ts`) || 0)
      if (localStorage.getItem(cacheKey) && Date.now() - cachedTs < 12 * 60 * 60 * 1000) {
        setPosThemeLoading(false)
        return
      }
    } catch {}
    setPosThemeLoading(true)
    const profileKey = encodeURIComponent(rawCashierId)
    getDoc(doc(db, 'pos_cashier_profiles', profileKey))
      .then(snapshot => {
        if (!active) return
        if (snapshot.exists() && snapshot.data()?.posTheme) {
          const remoteTheme = normalizePosPersonalTheme(snapshot.data()?.posTheme)
          setPosPersonalTheme(remoteTheme)
          setDraftPosTheme(remoteTheme)
          try {
            localStorage.setItem(cacheKey, JSON.stringify(remoteTheme))
            localStorage.setItem(`${cacheKey}_ts`, String(Date.now()))
          } catch {}
        }
        setPosThemeOwnerId(accountKey)
      })
      .catch(error => {
        console.warn('[POS] No se pudo cargar el tema personal:', error)
        if (active) setPosThemeOwnerId(accountKey)
      })
      .finally(() => {
        if (active) setPosThemeLoading(false)
      })

    return () => { active = false }
  }, [posUser?.id, sede])

  useEffect(() => {
    // Pre-cache wallpapers on mount so they're instantly available and persisted in localStorage & CacheStorage
    cacheSakuraWallpaper().then(uri => {
      if (uri) setCachedSakuraWallpaper(uri)
    })
    cacheNekoWallpaper().then(uri => {
      if (uri) setCachedNekoWallpaper(uri)
    })
    cacheNekoFernandaWallpaper().then(uri => {
      if (uri) setCachedNekoFernandaWallpaper(uri)
    })
    cacheCapyWallpaper().then(uri => {
      if (uri) setCachedCapyWallpaper(uri)
    })
    cacheJasmineWallpaper().then(uri => {
      if (uri) setCachedJasmineWallpaper(uri)
    })
  }, [])

  const openPosThemeStudio = () => {
    setDraftPosTheme(posPersonalTheme)
    setShowPosThemeEditor(true)
  }

  const cancelPosThemeStudio = () => {
    setDraftPosTheme(posPersonalTheme)
    setShowPosThemeEditor(false)
  }

  const savePosPersonalTheme = async () => {
    const rawCashierId = String(posUser?.id || '').trim()
    const accountKey = rawCashierId && rawCashierId !== 'default' ? rawCashierId : `default_${sede}`
    const cacheKey = `${POS_THEME_CACHE_PREFIX}${accountKey}`
    setPosThemeSaving(true)
    try {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(draftPosTheme))
        localStorage.setItem(`${cacheKey}_ts`, String(Date.now()))
      } catch {}

      if (rawCashierId && rawCashierId !== 'default') {
        await setDoc(doc(db, 'pos_cashier_profiles', encodeURIComponent(rawCashierId)), {
          posTheme: draftPosTheme,
          posThemeUpdatedAt: serverTimestamp(),
        }, { merge: true })
      }

      setPosPersonalTheme(draftPosTheme)
      setPosThemeOwnerId(accountKey)
      setShowPosThemeEditor(false)
      showToast('Estilo personalizado guardado para tu cuenta.', 'ok')
    } catch (error) {
      console.error('[POS] No se pudo guardar el tema personal:', error)
      showToast('No se pudo guardar el estilo. Intenta otra vez.', 'err')
    } finally {
      setPosThemeSaving(false)
    }
  }

  const openProductLightbox = (product: ProductDoc, url?: string) => {
    setLightboxProduct(product)
    setLightboxUrl(url || product.imageUrl || null)
  }

  const closeProductLightbox = () => {
    setLightboxUrl(null)
    setLightboxProduct(null)
  }

  // ─── Sincronizar con Firebase Auth ──────────────────────────────────────────
  // Si el usuario ingresó con su cuenta de Firebase Auth, usar sus datos
  useEffect(() => {
    if (authLoading) return
    if (!authLoggedIn || !authUser?.email) {
      setBranchAccess({ sede, status: 'allowed' })
      return
    }
    let cancelled = false
    setBranchAccess({ sede, status: 'checking' })
    ;(async () => {
      try {
      const isSupreme = isAdminEmail(authUser.email)
      const erpUser = await getErpUserByEmail(authUser.email!, false)
      if (!erpUser) {
        if (!cancelled) setBranchAccess({ sede, status: isSupreme ? 'allowed' : 'denied' })
        return
      }
      // Buscar la foto y cargo del trabajador vinculado
      let fotoUrl = erpUser.photoURL || ''
      let cargo = erpUser.role || 'Cajera'
      let puedeGestionarCaja: boolean | null = null
      let nivelAccesoPos: PosAccessLevel = normalizePosAccessLevel(erpUser.nivelAccesoPos, erpUser.modules.includes('pos_admin'))
      let rolOperativoPos: PosSellerRole | undefined = isSellerCargo(cargo) ? normalizePosSellerRole(erpUser.rolOperativoPos) : undefined
      let rolesAdicionales: Array<'web'> = []
      let trabajadorId = erpUser.trabajadorId || ''
      let workerBranches: string[] | null = null
      if (erpUser.trabajadorId || erpUser.displayName || authUser.email) {
        try {
          const trab = await fetchTrabajadorERP(erpUser.trabajadorId, erpUser.displayName)
          if (trab) {
            workerBranches = workerBranchSlugs(trab)
            trabajadorId = trab.$id
            fotoUrl = fotoUrl || trab.fotoUrl || ''
            cargo = trab.cargo || cargo
            puedeGestionarCaja = trab.puedeGestionarCaja ?? null
            nivelAccesoPos = normalizePosAccessLevel(trab.nivelAccesoPos, trab.puedeGestionarCaja)
            rolOperativoPos = isSellerCargo(cargo) ? normalizePosSellerRole(trab.rolOperativoPos) : undefined
            rolesAdicionales = !isSellerCargo(cargo) && Array.isArray(trab.rolesAdicionales) && trab.rolesAdicionales.includes('web') ? ['web'] : []
          }
        } catch {}
      }
      if (cancelled) return
      const allowed = isSupreme || (workerBranches ? workerBranches.some(branch => matchBranchSlug(branch, sede)) : (!erpUser.trabajadorId && erpUser.branchSlugs.some(branch => matchBranchSlug(branch, sede))))
      if (!allowed) {
        clearPosSession()
        setPosUser(null)
        setBranchAccess({ sede, status: 'denied' })
        return
      }
      const cargoUpper = cargo.toUpperCase()
      const erpRoleUpper = (erpUser.role || '').toUpperCase()
      const isAdmin = cargoUpper.includes('ADMIN') || cargoUpper.includes('SUPREMO') || erpRoleUpper.includes('ADMIN') || erpRoleUpper.includes('SUPREMO')
      if (isAdminEmail(authUser.email)) nivelAccesoPos = 'alto'
      if (isSellerCargo(cargo) && !isAdminEmail(authUser.email)) {
        nivelAccesoPos = 'bajo'
        puedeGestionarCaja = false
      }
      const role = getOperatorPosRole(cargo, rolOperativoPos, isAdmin)
      const session: PosUserSession = {
        id: trabajadorId || authUser.id,
        nombre: erpUser.displayName || authUser.name || authUser.email.split('@')[0],
        cargo: isAdmin ? 'Cajero (Admin)' : cargo,
        fotoUrl,
        puedeGestionarCaja,
        nivelAccesoPos,
        rolOperativoPos,
        rolesAdicionales,
        sede,
        role,
        loginAt: Date.now(),
      }
      savePosSession(session)
      setPosUser(session)
      setBranchAccess({ sede, status: 'allowed' })
      // Guardar módulos del usuario para mostrar accesos a Web/ERP
      if (erpUser.modules) {
        try { localStorage.setItem('asistora_pos_user_modules', JSON.stringify(erpUser.modules)) } catch {}
      }
      } catch (error) {
        console.error('No se pudo verificar la sucursal del POS:', error)
        if (!cancelled) setBranchAccess({ sede, status: 'denied' })
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, authLoggedIn, authUser?.email, sede])

  // Cargar módulos del usuario desde localStorage (para accesos rápidos)
  const [posUserModules, setPosUserModules] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('asistora_pos_user_modules')
      if (raw) setPosUserModules(JSON.parse(raw))
    } catch {}
  }, [posUser])

  // ─── Editar método de pago ────────────────────────────────────────────────
  const [editPagoTarget, setEditPagoTarget] = useState<VentaPOS | null>(null)
  const [editPagoPin, setEditPagoPin] = useState('')
  const [editPagoPinError, setEditPagoPinError] = useState(false)
  const [editPagoPinOk, setEditPagoPinOk] = useState(false)
  const [editPagoReason, setEditPagoReason] = useState('')
  const [editPagoMetodo, setEditPagoMetodo] = useState<MetodoPago>('efectivo')
  const [editPagoSaving, setEditPagoSaving] = useState(false)
  const [isMobile, setIsMobile] = useState(false); useEffect(() => { setIsMobile(window.innerWidth < 1024) }, [])

  // ─── State ──────────────────────────────────────────────────────────────────
  // Products & stock
  const [products, setProducts] = useState<Map<string, ProductDoc>>(new Map())
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [loadingProducts, setLoadingProducts] = useState(true)

  // Search
  const [searchTerm, setSearchTerm] = useState('')
  const [searchAddedSkus, setSearchAddedSkus] = useState<Set<string>>(new Set())
  const hideNoStock = false
  const searchRef = useRef<HTMLInputElement>(null)
  const chargeButtonRef = useRef<HTMLButtonElement>(null)
  const [proMode, setProMode] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [askQtyMode, setAskQtyMode] = useState<boolean>(true)
  const lastAutoAddedQueryRef = useRef<string>('')
  const [proSearchOpen, setProSearchOpen] = useState(false)
  const [compactCart, setCompactCart] = useState(false)
  const [posScaleMode, setPosScaleMode] = useState<'auto' | 'manual'>('auto')
  const [posManualScale, setPosManualScale] = useState<number>(85)
  const [posExtraDense, setPosExtraDense] = useState<boolean>(true)
  const [manualPanelResize, setManualPanelResize] = useState(true)
  const [hoveredImagePreview, setHoveredImagePreview] = useState<{ url: string; name: string; left: number; top: number } | null>(null)
  const [quickQtyModal, setQuickQtyModal] = useState<{
    product: ProductDoc & { stock?: number }
    selectedPriceField?: string
    candidates?: (ProductDoc & { stock?: number })[]
    candidateIndex?: number
  } | null>(null)
  const [quickQtyInput, setQuickQtyInput] = useState<string>('1')
  const quickQtyInputRef = useRef<HTMLInputElement>(null)
  const [manualPanelLayout, setManualPanelLayout] = useState<PosManualPanelLayout>(DEFAULT_POS_MANUAL_PANEL_LAYOUT)
  const [showScaleMenu, setShowScaleMenu] = useState<boolean>(false)
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number; screenW: number; screenH: number }>({
    w: 1920,
    h: 1080,
    screenW: 1920,
    screenH: 1080,
  })
  const scaleMenuRef = useRef<HTMLDivElement>(null)
  const proResultsRef = useRef<HTMLDivElement>(null)
  const searchToolbarRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const productsPanelRef = useRef<HTMLDivElement>(null)
  const cartPanelRef = useRef<HTMLDivElement>(null)
  const paymentPanelRef = useRef<HTMLDivElement>(null)
  const manualPanelLayoutRef = useRef<PosManualPanelLayout>(DEFAULT_POS_MANUAL_PANEL_LAYOUT)
  const manualPanelLayoutReadyRef = useRef(false)
  const manualResizeDragRef = useRef<{
    kind: PosManualResizeKind
    startX: number
    startY: number
    startLayout: PosManualPanelLayout
    heightLimit: number
    scale: number
  } | null>(null)

  useEffect(() => {
    try {
      setProMode(localStorage.getItem('donbalato_pos_pro_mode') === 'true')
      setAutoMode(localStorage.getItem('donbalato_pos_auto_mode') === 'true')
      const savedAskQty = localStorage.getItem('donbalato_pos_ask_qty')
      setAskQtyMode(savedAskQty !== null ? savedAskQty === 'true' : true)
      setCompactCart(localStorage.getItem('donbalato_pos_compact_cart') === 'true')
      const savedManualMode = localStorage.getItem(POS_MANUAL_PANEL_MODE_KEY)
      setManualPanelResize(savedManualMode !== null ? savedManualMode === 'true' : true)
      const savedScaleMode = localStorage.getItem('donbalato_pos_scale_mode')
      if (savedScaleMode === 'auto' || savedScaleMode === 'manual') {
        setPosScaleMode(savedScaleMode)
      }
      const savedManualScale = Number(localStorage.getItem('donbalato_pos_manual_scale'))
      if (Number.isFinite(savedManualScale) && savedManualScale >= 65 && savedManualScale <= 115) {
        setPosManualScale(Math.round(savedManualScale))
      }
      const savedDense = localStorage.getItem('donbalato_pos_scale_dense')
      if (savedDense === 'true' || savedDense === 'false') {
        setPosExtraDense(savedDense === 'true')
      }
      const savedPanelLayout = localStorage.getItem(POS_MANUAL_PANEL_LAYOUT_KEY)
      if (savedPanelLayout) {
        const parsed = JSON.parse(savedPanelLayout) as Partial<PosManualPanelLayout>
        const bounded = (value: unknown, fallback: number, min: number, max: number) => {
          const numeric = Number(value)
          return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback
        }
        const restored: PosManualPanelLayout = {
          productsWidth: bounded(parsed.productsWidth, DEFAULT_POS_MANUAL_PANEL_LAYOUT.productsWidth, 180, 3000),
          cartWidth: bounded(parsed.cartWidth, DEFAULT_POS_MANUAL_PANEL_LAYOUT.cartWidth, 180, 3000),
          paymentWidth: bounded(parsed.paymentWidth, DEFAULT_POS_MANUAL_PANEL_LAYOUT.paymentWidth, 180, 3000),
          proMainWidth: bounded(parsed.proMainWidth, DEFAULT_POS_MANUAL_PANEL_LAYOUT.proMainWidth, 180, 5000),
          proPaymentWidth: bounded(parsed.proPaymentWidth, DEFAULT_POS_MANUAL_PANEL_LAYOUT.proPaymentWidth, 180, 3000),
          productsHeight: bounded(parsed.productsHeight, 100, 45, 100),
          cartHeight: bounded(parsed.cartHeight, 100, 45, 100),
          paymentHeight: bounded(parsed.paymentHeight, 100, 45, 100),
        }
        manualPanelLayoutRef.current = restored
        setManualPanelLayout(restored)
        manualPanelLayoutReadyRef.current = true
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateViewport = () => {
      setViewportSize({
        w: window.innerWidth || 1920,
        h: window.innerHeight || 1080,
        screenW: window.screen?.width || window.innerWidth || 1920,
        screenH: window.screen?.height || window.innerHeight || 1080,
      })
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (!showScaleMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (scaleMenuRef.current && !scaleMenuRef.current.contains(target)) {
        setShowScaleMenu(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showScaleMenu])

  const autoScalePct = useMemo(() => {
    const { w, h } = viewportSize
    if (w < 1024) return 100
    if (w <= 1100 || h <= 610) return 75
    if (w <= 1220 || h <= 660) return 80
    if (w <= 1300 || h <= 710) return 83
    if (w <= 1400 || h <= 780) return 86
    if (w <= 1560 || h <= 860) return 92
    if (w <= 1700) return 96
    return 100
  }, [viewportSize])

  const effectiveScalePct = viewportSize.w < 1024
    ? 100
    : (posScaleMode === 'auto' ? autoScalePct : posManualScale)
  const effectiveScale = effectiveScalePct / 100
  const isDenseLayoutActive = viewportSize.w >= 1024 && posExtraDense && effectiveScalePct < 100
  const manualWorkspaceStyle = manualPanelResize && viewportSize.w >= 1024
    ? {
        display: 'grid',
        gridTemplateColumns: proMode
          ? `minmax(0, ${manualPanelLayout.proMainWidth}fr) minmax(240px, ${manualPanelLayout.proPaymentWidth}fr)`
          : `minmax(220px, ${manualPanelLayout.productsWidth}fr) minmax(260px, ${manualPanelLayout.cartWidth}fr) minmax(240px, ${manualPanelLayout.paymentWidth}fr)`,
        gridTemplateRows: proMode ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
        '--manual-products-height': `${manualPanelLayout.productsHeight}%`,
        '--manual-cart-height': `${manualPanelLayout.cartHeight}%`,
        '--manual-payment-height': `${manualPanelLayout.paymentHeight}%`,
      } as React.CSSProperties
    : undefined;

  const selectPosScaleMode = (mode: 'auto' | 'manual', manualVal?: number) => {
    setPosScaleMode(mode)
    try { localStorage.setItem('donbalato_pos_scale_mode', mode) } catch {}
    if (typeof manualVal === 'number') {
      const clamped = Math.max(65, Math.min(110, Math.round(manualVal)))
      setPosManualScale(clamped)
      try { localStorage.setItem('donbalato_pos_manual_scale', String(clamped)) } catch {}
    }
  }

  const togglePosExtraDense = () => {
    setPosExtraDense(prev => {
      const next = !prev
      try { localStorage.setItem('donbalato_pos_scale_dense', String(next)) } catch {}
      return next
    })
  }

  const toggleCompactCart = () => {
    setCompactCart(prev => {
      const next = !prev
      try { localStorage.setItem('donbalato_pos_compact_cart', String(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    if (!proMode || !proSearchOpen) return
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node
      if (!proResultsRef.current?.contains(target) && !searchToolbarRef.current?.contains(target)) {
        setProSearchOpen(false)
      }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [proMode, proSearchOpen])

  const toggleProMode = () => {
    const enabled = !proMode
    setProMode(enabled)
    setProSearchOpen(Boolean(searchTerm))
    try { localStorage.setItem('donbalato_pos_pro_mode', String(enabled)) } catch {}
    searchRef.current?.focus()
  }

  const toggleAutoMode = () => {
    const next = !autoMode
    setAutoMode(next)
    try { localStorage.setItem('donbalato_pos_auto_mode', String(next)) } catch {}
    showToast(next ? '⚡ Modo Auto activado: auto-agrega al quedar 1 producto en búsqueda' : 'Modo Auto desactivado', 'info')
    searchRef.current?.focus()
  }

  const toggleAskQtyMode = () => {
    const next = !askQtyMode
    setAskQtyMode(next)
    try { localStorage.setItem('donbalato_pos_ask_qty', String(next)) } catch {}
    showToast(next ? '🔢 Pedir Cantidad activado: pide unidades antes de agregar' : '⚡ Modo Directo: agrega 1 unidad al hacer clic', 'info')
    searchRef.current?.focus()
  }

  const showCartItemHoverPreview = (event: React.MouseEvent<HTMLElement>, url?: string, name?: string) => {
    if (!url || typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const rect = event.currentTarget.getBoundingClientRect()
    const previewWidth = 240
    const previewHeight = 320
    const gap = 12
    const opensLeft = rect.right + previewWidth + gap > window.innerWidth
    const left = opensLeft
      ? Math.max(12, rect.left - previewWidth - gap)
      : Math.min(rect.right + gap, window.innerWidth - previewWidth - 12)
    const top = Math.max(12, Math.min(
      rect.top + rect.height / 2 - previewHeight / 2,
      window.innerHeight - previewHeight - 12,
    ))
    setHoveredImagePreview({ url, name: name || '', left, top })
  }

  const openQuickQtyModal = (
    p: ProductDoc & { stock?: number },
    selectedPriceField?: string,
    candidates?: (ProductDoc & { stock?: number })[],
    candidateIndex = 0,
  ) => {
    setQuickQtyModal({
      product: p,
      selectedPriceField: selectedPriceField || selectedPriceBySku[p.sku] || getDefaultPriceOption(p)?.field,
      candidates,
      candidateIndex,
    })
    setQuickQtyInput('1')
    setTimeout(() => {
      quickQtyInputRef.current?.focus()
      quickQtyInputRef.current?.select()
    }, 50)
  }

  const handleNextCandidateQuickQty = () => {
    if (!quickQtyModal?.candidates || quickQtyModal.candidates.length <= 1) return
    const nextIdx = ((quickQtyModal.candidateIndex ?? 0) + 1) % quickQtyModal.candidates.length
    const nextProduct = quickQtyModal.candidates[nextIdx]
    const nextPriceField = selectedPriceBySku[nextProduct.sku] || getDefaultPriceOption(nextProduct)?.field
    setQuickQtyModal({
      product: nextProduct,
      selectedPriceField: nextPriceField,
      candidates: quickQtyModal.candidates,
      candidateIndex: nextIdx,
    })
    setQuickQtyInput('1')
    setTimeout(() => {
      quickQtyInputRef.current?.focus()
      quickQtyInputRef.current?.select()
    }, 50)
  }

  const handlePrevCandidateQuickQty = () => {
    if (!quickQtyModal?.candidates || quickQtyModal.candidates.length <= 1) return
    const prevIdx = ((quickQtyModal.candidateIndex ?? 0) - 1 + quickQtyModal.candidates.length) % quickQtyModal.candidates.length
    const prevProduct = quickQtyModal.candidates[prevIdx]
    const prevPriceField = selectedPriceBySku[prevProduct.sku] || getDefaultPriceOption(prevProduct)?.field
    setQuickQtyModal({
      product: prevProduct,
      selectedPriceField: prevPriceField,
      candidates: quickQtyModal.candidates,
      candidateIndex: prevIdx,
    })
    setQuickQtyInput('1')
    setTimeout(() => {
      quickQtyInputRef.current?.focus()
      quickQtyInputRef.current?.select()
    }, 50)
  }

  const handleConfirmQuickQty = () => {
    if (!quickQtyModal) return
    const qty = Math.max(1, parseInt(quickQtyInput, 10) || 1)
    addToCart(quickQtyModal.product, quickQtyModal.selectedPriceField, false, qty)
    showToast(`✅ Agregado: ${qty} x ${quickQtyModal.product.nombre}`, 'ok')
    setQuickQtyModal(null)
    setSearchTerm('')
    setSearchAddedSkus(new Set())
    if (proMode) {
      setProSearchOpen(false)
    }
    searchRef.current?.focus()
  }

  const toggleManualPanelResize = () => {
    const enabled = !manualPanelResize
    if (enabled && !manualPanelLayoutReadyRef.current) {
      const workspaceBounds = workspaceRef.current?.getBoundingClientRect()
      const productBounds = proMode
        ? searchToolbarRef.current?.getBoundingClientRect()
        : productsPanelRef.current?.getBoundingClientRect()
      const cartBounds = cartPanelRef.current?.getBoundingClientRect()
      const paymentBounds = paymentPanelRef.current?.getBoundingClientRect()
      const paymentWidth = paymentBounds?.width || 300
      const measuredMainWidth = proMode
        ? (cartBounds?.width || productBounds?.width || 0)
        : (productBounds?.width || 0) + (cartBounds?.width || 0)
      const mainWidth = measuredMainWidth || Math.max(320, (workspaceBounds?.width || 0) - paymentWidth - 48)
      const captured: PosManualPanelLayout = {
        ...manualPanelLayoutRef.current,
        productsWidth: proMode
          ? mainWidth * 0.49
          : (productBounds?.width || manualPanelLayoutRef.current.productsWidth),
        cartWidth: proMode
          ? mainWidth * 0.51
          : (cartBounds?.width || manualPanelLayoutRef.current.cartWidth),
        paymentWidth: paymentBounds?.width ? paymentWidth : manualPanelLayoutRef.current.paymentWidth,
        proMainWidth: mainWidth || manualPanelLayoutRef.current.proMainWidth,
        proPaymentWidth: paymentBounds?.width ? paymentWidth : manualPanelLayoutRef.current.proPaymentWidth,
        productsHeight: 100,
        cartHeight: 100,
        paymentHeight: 100,
      }
      manualPanelLayoutRef.current = captured
      setManualPanelLayout(captured)
      manualPanelLayoutReadyRef.current = true
      try { localStorage.setItem(POS_MANUAL_PANEL_LAYOUT_KEY, JSON.stringify(captured)) } catch {}
    }
    setManualPanelResize(enabled)
    try { localStorage.setItem(POS_MANUAL_PANEL_MODE_KEY, String(enabled)) } catch {}
    setShowScaleMenu(false)
  }

  const beginManualPanelResize = (kind: PosManualResizeKind) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!manualPanelResize) return
    event.preventDefault()
    event.stopPropagation()

    const current = manualPanelLayoutRef.current
    const productBounds = !proMode ? productsPanelRef.current?.getBoundingClientRect() : null
    const cartBounds = cartPanelRef.current?.getBoundingClientRect()
    const paymentBounds = paymentPanelRef.current?.getBoundingClientRect()
    const layout: PosManualPanelLayout = proMode
      ? {
          ...current,
          proMainWidth: cartBounds?.width || current.proMainWidth,
          proPaymentWidth: paymentBounds?.width || current.proPaymentWidth,
        }
      : {
          ...current,
          productsWidth: productBounds?.width || current.productsWidth,
          cartWidth: cartBounds?.width || current.cartWidth,
          paymentWidth: paymentBounds?.width || current.paymentWidth,
        }
    manualPanelLayoutRef.current = layout
    setManualPanelLayout(layout)
    const heightField = kind === 'products-height'
      ? 'productsHeight'
      : kind === 'cart-height'
        ? 'cartHeight'
        : kind === 'payment-height'
          ? 'paymentHeight'
          : null
    const panelBounds = heightField
      ? (heightField === 'productsHeight' ? productsPanelRef.current : heightField === 'cartHeight' ? cartPanelRef.current : paymentPanelRef.current)?.getBoundingClientRect()
      : null
    const heightPercent = heightField ? layout[heightField] : 100
    const heightLimit = panelBounds?.height && heightPercent > 0
      ? panelBounds.height / (heightPercent / 100)
      : 1

    manualResizeDragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: layout,
      heightLimit,
      scale: effectiveScale,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateManualPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = manualResizeDragRef.current
    if (!drag) return

    const horizontalDelta = event.clientX - drag.startX
    const verticalDelta = event.clientY - drag.startY
    const start = drag.startLayout
    let next = start
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
    const minProducts = 220 * drag.scale
    const minCart = 260 * drag.scale
    const minPayment = 240 * drag.scale

    if (drag.kind === 'products-width') {
      const delta = clamp(horizontalDelta, minProducts - start.productsWidth, start.cartWidth - minCart)
      next = { ...start, productsWidth: start.productsWidth + delta, cartWidth: start.cartWidth - delta }
    } else if (drag.kind === 'cart-width') {
      const delta = clamp(horizontalDelta, minCart - start.cartWidth, start.paymentWidth - minPayment)
      next = { ...start, cartWidth: start.cartWidth + delta, paymentWidth: start.paymentWidth - delta }
    } else if (drag.kind === 'pro-width') {
      const delta = clamp(horizontalDelta, 320 * drag.scale - start.proMainWidth, start.proPaymentWidth - minPayment)
      next = { ...start, proMainWidth: start.proMainWidth + delta, proPaymentWidth: start.proPaymentWidth - delta }
    } else if (drag.kind === 'products-height') {
      next = { ...start, productsHeight: clamp(start.productsHeight + verticalDelta / drag.heightLimit * 100, 45, 100) }
    } else if (drag.kind === 'cart-height') {
      next = { ...start, cartHeight: clamp(start.cartHeight + verticalDelta / drag.heightLimit * 100, 45, 100) }
    } else {
      next = { ...start, paymentHeight: clamp(start.paymentHeight + verticalDelta / drag.heightLimit * 100, 45, 100) }
    }

    manualPanelLayoutRef.current = next
    setManualPanelLayout(next)
  }

  const finishManualPanelResize = () => {
    if (!manualResizeDragRef.current) return
    manualResizeDragRef.current = null
    try { localStorage.setItem(POS_MANUAL_PANEL_LAYOUT_KEY, JSON.stringify(manualPanelLayoutRef.current)) } catch {}
  }

  const sesionCajaRef = useRef<SesionCaja | null>(null)

  // Cart
  const initialCustomerTabsRef = useRef<{ tabs: CustomerSaleTab[]; activeId: string; nextNumber: number } | null>(null)
  if (!initialCustomerTabsRef.current) {
    let tabs: CustomerSaleTab[] = []
    let activeId = ''
    let nextNumber = 2
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`${POS_CUSTOMER_TABS_KEY}_${sede}`) : null
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.tabs)) tabs = parsed.tabs.slice(0, MAX_CUSTOMER_TABS)
        activeId = String(parsed?.activeId || '')
        nextNumber = Math.max(2, Number(parsed?.nextNumber) || 2)
      }
    } catch {}
    if (tabs.length === 0) tabs = [createCustomerSaleTab(1)]
    if (!tabs.some(tab => tab.id === activeId)) activeId = tabs[0].id
    initialCustomerTabsRef.current = { tabs, activeId, nextNumber }
  }
  const initialCustomerState = initialCustomerTabsRef.current
  const initialCustomerTab = initialCustomerState.tabs.find(tab => tab.id === initialCustomerState.activeId) || initialCustomerState.tabs[0]
  const [customerTabs, setCustomerTabs] = useState<CustomerSaleTab[]>(initialCustomerState.tabs)
  const [activeCustomerTabId, setActiveCustomerTabId] = useState(initialCustomerState.activeId)
  const [nextCustomerNumber, setNextCustomerNumber] = useState(initialCustomerState.nextNumber)
  const restoredSaleTokenRef = useRef<string | null>(null)
  const posDraftFullNoticeRef = useRef<string | null>(null)
  const [showCustomerTabModal, setShowCustomerTabModal] = useState(false)
  const [customerTabModalMode, setCustomerTabModalMode] = useState<'new' | 'rename'>('new')
  const [customerTabName, setCustomerTabName] = useState('')
  const [cart, setCart] = useState<CartItem[]>(initialCustomerTab.cart || [])
  const [isGeneratingPriceLabelsPdf, setIsGeneratingPriceLabelsPdf] = useState(false)
  const [descuentoGlobalPct, setDescuentoGlobalPct] = useState(initialCustomerTab.descuentoGlobalPct || 0)
  const [lastSavedCart, setLastSavedCart] = useState<{ cart: CartItem[]; descuento: number; timestamp: number } | null>(null)
  const isFinishingSaleRef = useRef(false)
  const customerTabsRef = useRef<CustomerSaleTab[]>(initialCustomerState.tabs)
  useEffect(() => { customerTabsRef.current = customerTabs }, [customerTabs])
  const activeCustomerTabIdRef = useRef<string>(initialCustomerState.activeId)
  useEffect(() => { activeCustomerTabIdRef.current = activeCustomerTabId }, [activeCustomerTabId])
  const nextCustomerNumberRef = useRef<number>(initialCustomerState.nextNumber)
  useEffect(() => { nextCustomerNumberRef.current = nextCustomerNumber }, [nextCustomerNumber])

  // Payment
  const [pagoActivo, setPagoActivo] = useState<MetodoPago>(initialCustomerTab.pagoActivo || 'efectivo')
  const [montoRecibido, setMontoRecibido] = useState(initialCustomerTab.montoRecibido || '')
  const [accumulateQuickAmounts, setAccumulateQuickAmounts] = useState(true)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POS_QUICK_AMOUNT_ACCUMULATE_KEY)
      if (saved !== null) setAccumulateQuickAmounts(saved !== 'false')
    } catch {}
  }, [])
  const [pagos, setPagos] = useState<PagoEntry[]>(initialCustomerTab.pagos || [])
  const [splitMode, setSplitMode] = useState(Boolean(initialCustomerTab.splitMode))
  const [tipoComprobante, setTipoComprobante] = useState<'comprobante'>('comprobante')
  const [completedSaleModal, setCompletedSaleModal] = useState<VentaPOS | null>(null)
  const [popupBlockedNotice, setPopupBlockedNotice] = useState(false)
  const completedSaleModalRef = useRef<VentaPOS | null>(null)
  useEffect(() => { completedSaleModalRef.current = completedSaleModal }, [completedSaleModal])

  const closeCompletedSaleModal = useCallback((e?: React.SyntheticEvent) => {
    if (e) {
      try {
        e.preventDefault()
        e.stopPropagation()
      } catch (_) {}
    }
    setCompletedSaleModal(null)
    setPopupBlockedNotice(false)
    setCart([])
    setDescuentoGlobalPct(0)
    setPagos([])
    setMontoRecibido('')
    setSplitMode(false)
    setLastSavedCart(null)
    setTimeout(() => {
      try {
        searchRef.current?.focus()
      } catch (_) {}
    }, 50)
  }, [])

  // Caja
  const [sesionCaja, setSesionCaja] = useState<SesionCaja | null>(null)
  const [cajaLoaded, setCajaLoaded] = useState(false)
  // Keep ref in sync for keyboard handler
  useEffect(() => { sesionCajaRef.current = sesionCaja }, [sesionCaja])
  const [cajeroNombre, setCajeroNombre] = useState('')
  const [montoApertura, setMontoApertura] = useState('')
  const [showApertura, setShowApertura] = useState(false)
  const [aperturaDismissed, setAperturaDismissed] = useState(false)
  const [abriendoCaja, setAbriendoCaja] = useState(false)
  const [showCotizacion, setShowCotizacion] = useState(false)
  const [showCartLabelsModal, setShowCartLabelsModal] = useState(false)
  const [cotizacionCopied, setCotizacionCopied] = useState(false)
  const [showCierre, setShowCierre] = useState(false)
  const [efectivoReal, setEfectivoReal] = useState('')
  type ItemCierre = { tipo: 'gasto' | 'anulacion' | 'devolucion'; monto: string; detalle: string; boletaNumero: string }
  const [itemsCierre, setItemsCierre] = useState<ItemCierre[]>([])
  const [cajaGastos, setCajaGastos] = useState<CajaGasto[]>([])
  const [showCajaResumen, setShowCajaResumen] = useState(false)
  const [cajaResumenVentas, setCajaResumenVentas] = useState<VentaPOS[]>([])
  const [showCajaGastos, setShowCajaGastos] = useState(false)
  const [deleteGastoTarget, setDeleteGastoTarget] = useState<CajaGasto | null>(null)
  const [gastoDeleting, setGastoDeleting] = useState(false)
  const [showGastoForm, setShowGastoForm] = useState(false)
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null)
  const [gastoMonto, setGastoMonto] = useState('')
  const [gastoDetalle, setGastoDetalle] = useState('')
  const [gastoTipo, setGastoTipo] = useState<string>('')
  const [gastoCategoria, setGastoCategoria] = useState<string>('')
  const [gastoSaving, setGastoSaving] = useState(false)

  // UI
  const [mobileTab, setMobileTab] = useState<'products' | 'cart' | 'payment'>('products')
  const [fullscreen, setFullscreen] = useState(false)
  const [clock, setClock] = useState(now())
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const [pendingStockAdd, setPendingStockAdd] = useState<{
    product: ProductDoc & { stock?: number }
    priceField?: string
    requestedQty: number
    availableStock: number
    stockDebt: number
    webReservation?: { qty: number; orderCodes: string[]; orderCount?: number } | null
    quantityToAdd?: number
  } | null>(null)
  const [webReservations, setWebReservations] = useState<Record<string, { qty: number; orderCodes: string[]; orderCount?: number }>>({})

  // Helper para consultar si un producto tiene stock reservado en pedidos WEB activos
  const getWebReservation = useCallback((p?: { sku?: string; $id?: string } | null) => {
    if (!p) return null;
    const rawSku = (p.sku || '').trim().toUpperCase();
    const nSku = normSku(p.sku || '');
    const id = (p.$id || '').trim();
    const res = (rawSku && webReservations[rawSku]) || (nSku && webReservations[nSku]) || (id && webReservations[id]) || null;
    return res && res.qty > 0 ? res : null;
  }, [webReservations]);

  // Reservas web: una petición por terminal cada 10 minutos mientras esté visible.
  useEffect(() => {
    if (!posUser) return;
    let cancelled = false;
    let lastFetchTs = 0;
    let inFlight = false;
    const fetchReservations = async () => {
      if (inFlight || cancelled) return;
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        await authReady;
        const token = await auth.currentUser?.getIdToken();
        if (cancelled) return;
        inFlight = true;
        lastFetchTs = Date.now();
        const res = await fetch('/api/pos/web-reservations', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok && data?.reservations) {
          setWebReservations(data.reservations);
        }
      } catch (err) {
        console.warn('[POS] Error cargando reservas web:', err);
      } finally {
        inFlight = false;
      }
    };
    fetchReservations();
    const interval = setInterval(fetchReservations, 600000); // 10 minutos
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (Date.now() - lastFetchTs >= 600000) {
          fetchReservations();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [posUser?.id]);
  const [processing, setProcessing] = useState(false)
  const [returnTarget, setReturnTarget] = useState<VentaPOS | null>(null)
  const [ventasHoy, setVentasHoy] = useState<VentaPOS[]>([])
  const [ventasConsultaLoading, setVentasConsultaLoading] = useState(false)
  const [showQuickAmounts, setShowQuickAmounts] = useState(false)
  const [selectedPriceBySku, setSelectedPriceBySku] = useState<Record<string, string>>({})
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [erpCategories, setErpCategories] = useState<Array<{ $id: string; name: string; icon?: string; imageUrl?: string }>>([])

  // Mapear ID de categoría → nombre para los productos
  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    erpCategories.forEach(c => {
      map.set(c.$id, c.name);
      map.set(c.name, c.name); // también el nombre a sí mismo
    });
    return map;
  }, [erpCategories]);

  // Resolver el nombre real de la categoría de un producto
  const resolveCategory = useCallback((cat: string | undefined): string => {
    if (!cat) return 'General';
    return categoryNameMap.get(cat) || cat;
  }, [categoryNameMap]);
  // Categories come from the already loaded catalog; no additional Firestore query.
  const productCategories = useMemo(() => {
    const names = new Set<string>();
    products.forEach(product => {
      if (product.is_draft || product.status === 'draft') return;
      if (Number(product.precio_detalle || 0) <= 0 && Number(product.precio_mayorista || 0) <= 0) return;
      names.add(resolveCategory(product.category));
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [products, resolveCategory]);
  const [hiddenQuickSkus, setHiddenQuickSkus] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('pos_hidden_quick_skus');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  })

  const hideQuickProduct = (sku: string) => {
    setHiddenQuickSkus(prev => {
      const next = new Set(prev);
      next.add(sku);
      localStorage.setItem('pos_hidden_quick_skus', JSON.stringify([...next]));
      return next;
    });
  }

  const resetHiddenQuick = () => {
    setHiddenQuickSkus(new Set());
    localStorage.removeItem('pos_hidden_quick_skus');
  }

  const [cartAddedItem, setCartAddedItem] = useState<{ nombre: string; precio: number } | null>(null)
  const [revalidationNotice, setRevalidationNotice] = useState<{
    items: Array<{
      sku: string
      nombre: string
      imageUrl?: string
      requestedQty: number
      realStock: number
      missingQty: number
      hasStockIssue: boolean
      oldPrice: number
      newPrice: number
      hasPriceChange: boolean
      actionTaken: 'removed' | 'adjusted_qty' | 'price_updated' | 'none'
      isWebReservationConflict?: boolean
      webReservedQty?: number
      webOrderCodes?: string[]
    }>
    adjustedCartItems: CartItem[]
    deberStockCartItems: CartItem[]
  } | null>(null)
  const [empresaConfig, setEmpresaConfig] = useState<{
    nombreEmpresa: string
    rut: string
    giro: string
    direccion: string
    telefono: string
    email: string
    sucursalLinea: string
    clienteNombre: string
    clienteRut: string
    ivaPorcentaje: number
  }>({
    nombreEmpresa: 'Importadora Carlitos', rut: '78.267.426-9', giro: 'VENTA AL POR MENOR DE JUEGOS Y JUGUETES EN\nCOMERCIOS ESPECIALIZADOS',
    direccion: 'Chacabuco #8 Estacion Central, Estacion Central Santiago,\nChile', telefono: '', email: '',
    sucursalLinea: 'Importadora Carlitos Alameda, # Chacabuco 8',
    clienteNombre: 'Genérico', clienteRut: '66.666.666-6',
    ivaPorcentaje: 19,
  })

  // ─── Vendedora / Cajera / Jefe roles ───────────────────────────────────
  const isVendedora = posUser?.role === 'vendedora'
  const isCajera = posUser?.role === 'cajera'
  const isJefe = posUser?.role === 'jefe'
  const isCajeroExpress = posUser?.rolOperativoPos === 'cajero_express' && isSellerCargo(posUser?.cargo)
  const puedeGenerarCotizacion = Boolean(
    posUser?.rolesAdicionales?.includes('web') === true ||
    (posUser?.cargo || '').toUpperCase().includes('WEB') ||
    (posUser?.cargo || '').toUpperCase().includes('ADMIN') ||
    (posUser?.cargo || '').toUpperCase().includes('SUPREMO') ||
    isAdminEmail(authUser?.email)
  )
  const availableCashiers = loginUsers.filter(user =>
    (user.cargo.toUpperCase().includes('CAJER') || user.rolOperativoPos === 'cajero_express')
    && user.id !== posUser?.id,
  )

  // ─── Modo de venta POS (cajera_cobra | jefe_cobra) ──────────────────────
  type ModoVentaPOS = 'cajera_cobra' | 'jefe_cobra'
  const [modoVentaPOS, setModoVentaPOS] = useState<ModoVentaPOS>('cajera_cobra')
  const [preventaTimeoutMin, setPreventaTimeoutMin] = useState(15)
  const [cajerasGestionanCajas, setCajerasGestionanCajas] = useState(true)
  const [configCajaPermisoLoaded, setConfigCajaPermisoLoaded] = useState(false)
  const [cajaCerradaPorCajera, setCajaCerradaPorCajera] = useState(false)
  const [lastClosedSessionId, setLastClosedSessionId] = useState<string>('')
  const [reanudandoCaja, setReanudandoCaja] = useState(false)
  const [showReanudarOtraCaja, setShowReanudarOtraCaja] = useState(false)
  const [closedSessionsList, setClosedSessionsList] = useState<any[]>([])
  const [loadingClosedSessions, setLoadingClosedSessions] = useState(false)
  const [showAuthModalAlto, setShowAuthModalAlto] = useState(false)
  const [authEmailAlto, setAuthEmailAlto] = useState('')
  const [authPassAlto, setAuthPassAlto] = useState('')
  const [authErrorAlto, setAuthErrorAlto] = useState('')
  const [authorizingAlto, setAuthorizingAlto] = useState(false)
  const nivelAccesoActual = isSellerCargo(posUser?.cargo) ? 'bajo' : normalizePosAccessLevel(posUser?.nivelAccesoPos, posUser?.puedeGestionarCaja ?? cajerasGestionanCajas)
  const permiteGestionarCaja = nivelAccesoActual !== 'bajo' || isCajeroExpress
  const isNivelAlto = isAdminEmail(authUser?.email) || nivelAccesoActual === 'alto'
  const puedeAccederPosAdmin = isAdminEmail(authUser?.email) || nivelAccesoActual === 'medio' || nivelAccesoActual === 'alto'
  const puedeAccederBaseDatos = puedeAccederPosAdmin
  const isSupreme = Boolean(isAdminEmail(authUser?.email))
  const operatorRole = isCajeroExpress
    ? `${posUser?.cargo || 'Vendedora'} (Express)`
    : (posUser?.cargo || (isVendedora ? 'Vendedora' : isJefe ? 'Jefe' : 'Cajera'))
  const operatorAccessLevel: 'alto' | 'medio' | 'bajo' | 'supremo' = isSupreme
    ? 'supremo'
    : nivelAccesoActual === 'alto'
    ? 'alto'
    : nivelAccesoActual === 'medio'
    ? 'medio'
    : 'bajo'
  const operatorAccessLevelLabel =
    operatorAccessLevel === 'supremo'
      ? 'Admin Supremo'
      : operatorAccessLevel === 'alto'
      ? 'Nivel Alto'
      : operatorAccessLevel === 'medio'
      ? 'Nivel Medio'
      : 'Nivel Bajo'

  useEffect(() => {
    if (!puedeGenerarCotizacion) setShowCotizacion(false)
  }, [puedeGenerarCotizacion])

  useEffect(() => {
    if (!isCajeroExpress) return
    if (pagoActivo === 'efectivo') setPagoActivo('debito')
    if (splitMode && pagos.some(payment => payment.metodo === 'efectivo')) {
      setPagos(current => current.filter(payment => payment.metodo !== 'efectivo'))
    }
    setMontoRecibido('')
  }, [isCajeroExpress, pagoActivo, splitMode, pagos])

  // Sincronizar el permiso individual del equipo mientras el POS permanece abierto.
  useEffect(() => {
    if (!db || !posUser?.id || posUser.id === 'default') return
    return onSnapshot(doc(db, 'trabajadores_erp', posUser.id), (snap: any) => {
      if (!snap.exists()) return
      const data = snap.data() || {}
      setPosUser(current => {
        if (!current || current.id !== posUser.id) return current
        const cargo = String(data.cargo || current.cargo)
        const sellerCargo = isSellerCargo(cargo)
        const rolOperativoPos = sellerCargo ? normalizePosSellerRole(data.rolOperativoPos) : undefined
        const role = getOperatorPosRole(cargo, rolOperativoPos)
        const updated = {
          ...current,
          nombre: String(data.nombre || current.nombre),
          cargo,
          role,
          puedeGestionarCaja: sellerCargo ? false : (typeof data.puedeGestionarCaja === 'boolean' ? data.puedeGestionarCaja : null),
          nivelAccesoPos: sellerCargo ? 'bajo' : normalizePosAccessLevel(data.nivelAccesoPos, data.puedeGestionarCaja),
          rolOperativoPos,
          rolesAdicionales: !sellerCargo && Array.isArray(data.rolesAdicionales) && data.rolesAdicionales.includes('web') ? ['web'] as Array<'web'> : [],
        }
        if (data.activo === false || data.posActivo === false) {
          clearPosSession()
          return null
        }
        savePosSession(updated)
        return updated
      })
    })
  }, [posUser?.id])

  // Cargar modo efectivo: override de sede o global desde Appwrite API / Firestore
  useEffect(() => {
    if (!sede) return
    let cancelled = false
    ;(async () => {
      try {
        // 1) Cargar desde ERP Config — caché SWR 60s compartida
        const parsed = await loadErpConfig()
        if (parsed && !cancelled) {
          const overrideMode = parsed.overrides?.[sede]?.modoVentaPOS
          const globalMode = parsed.empresa?.modoVentaPOS
          const effectiveMode = (overrideMode === 'cajera_cobra' || overrideMode === 'jefe_cobra')
            ? overrideMode
            : ((globalMode === 'cajera_cobra' || globalMode === 'jefe_cobra') ? globalMode : null)

          if (effectiveMode) {
            setModoVentaPOS(effectiveMode)
          }
          const t = parsed.empresa?.preventaTimeoutMin
          if (t && Number(t) > 0) setPreventaTimeoutMin(Math.max(1, Math.min(120, Number(t))))
          if (typeof parsed.empresa?.cajerasGestionanCajas === 'boolean') setCajerasGestionanCajas(parsed.empresa.cajerasGestionanCajas)
        }
      } catch {
        if (!cancelled) setModoVentaPOS('cajera_cobra')
      } finally {
        if (!cancelled) setConfigCajaPermisoLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [sede])

  // Listener reactivo unificado de config_pos/empresa y config_pos/sede_${sede} (evita 5 lecturas/listeners duplicados)
  const empresaModoFallbackRef = useRef<ModoVentaPOS>('cajera_cobra')
  const sedeHasOverrideRef = useRef<boolean>(false)

  useEffect(() => {
    if (!db) return
    return onSnapshot(doc(db, 'config_pos', 'empresa'), (snap: any) => {
      if (snap.exists()) {
        const d = snap.data() as any
        if (typeof d.cajerasGestionanCajas === 'boolean') setCajerasGestionanCajas(d.cajerasGestionanCajas)
        const mg = d.modoVentaPOS as ModoVentaPOS | undefined
        empresaModoFallbackRef.current = (mg === 'cajera_cobra' || mg === 'jefe_cobra') ? mg : 'cajera_cobra'
        if (!sedeHasOverrideRef.current) {
          setModoVentaPOS(empresaModoFallbackRef.current)
        }
        setEmpresaConfig({
          nombreEmpresa: typeof d.nombreEmpresa === 'string' ? d.nombreEmpresa : 'Importadora Carlitos',
          rut: typeof d.rut === 'string' ? d.rut : '78.267.426-9',
          giro: typeof d.giro === 'string' ? d.giro : 'VENTA AL POR MENOR DE JUEGOS Y JUGUETES EN\nCOMERCIOS ESPECIALIZADOS',
          direccion: typeof d.direccion === 'string' ? d.direccion : 'Chacabuco #8 Estacion Central, Estacion Central Santiago,\nChile', telefono: d.telefono || '', email: d.email || '',
          sucursalLinea: typeof d.sucursalLinea === 'string' ? d.sucursalLinea : 'Importadora Carlitos Alameda, # Chacabuco 8',
          clienteNombre: typeof d.clienteNombre === 'string' ? d.clienteNombre : 'Genérico',
          clienteRut: typeof d.clienteRut === 'string' ? d.clienteRut : '66.666.666-6',
          ivaPorcentaje: Number.isFinite(Number(d.ivaPorcentaje)) ? Number(d.ivaPorcentaje) : 19,
        })
      }
      setConfigCajaPermisoLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!db || !sede) return
    const unsubSede = onSnapshot(doc(db!, 'config_pos', `sede_${sede}`), (snap: any) => {
      if (snap.exists()) {
        const ds = snap.data() as any
        const ms = ds.modoVentaPOS as ModoVentaPOS | undefined | null
        if (ms === 'cajera_cobra' || ms === 'jefe_cobra') {
          sedeHasOverrideRef.current = true
          setModoVentaPOS(ms)
          return
        }
      }
      sedeHasOverrideRef.current = false
      setModoVentaPOS(empresaModoFallbackRef.current)
    })
    return () => unsubSede()
  }, [sede])

  // ─── Pending sales for cajeras (from vendedoras) ────────────────────────
  const [pendingSales, setPendingSales] = useState<any[]>([])
  const [showPendingSales, setShowPendingSales] = useState(false)

  useEffect(() => {
    if (!db || !posUser || !isCajera || !sede) return
    const q = query(
      collection(db!, 'pos_ventas_pendientes'),
      where('cajeraId', '==', posUser.id),
      where('sede', '==', sede),
      where('estado', '==', 'pendiente'),
    )
    const unsub = onSnapshot(q, (snap: any) => {
      const sales: any[] = []
      snap.forEach((d: any) => sales.push({ id: d.id, ...d.data() }))
      sales.sort((a, b) => (b.creadoAt?.seconds || 0) - (a.creadoAt?.seconds || 0))
      setPendingSales(sales)
    })
    return () => unsub()
  }, [posUser?.id, isCajera, sede])



  const handleRejectPendingSale = (sale: any) => {
    if (!db) return
    const isTransfer = sale.tipoEnvio === 'traspaso_cajera'
    const senderId = sale.enviadoPorId || ''
    if (isTransfer && !sale.devueltoAlRemitente && senderId && senderId !== posUser?.id) {
      updateDoc(doc(db, 'pos_ventas_pendientes', sale.id), {
        estado: 'pendiente',
        cajeraId: senderId,
        cajeraNombre: sale.enviadoPorNombre || 'Cajera',
        enviadoPorId: posUser?.id || '',
        enviadoPorNombre: posUser?.nombre || 'Cajera',
        enviadoPorFoto: posUser?.fotoUrl || '',
        devueltoAlRemitente: true,
      }).then(() => showToast(`Carrito devuelto a ${sale.enviadoPorNombre || 'la cajera que lo pasó'}`, 'info')).catch(() => {})
      return
    }
    updateDoc(doc(db, 'pos_ventas_pendientes', sale.id), { estado: 'rechazada' }).catch(() => {})
  }

  // ─── Pre-ventas pendientes (para rol JEFE, solo activo en modo jefe_cobra) ───
  const [preVentas, setPreVentas] = useState<any[]>([])
  const [showPreVentas, setShowPreVentas] = useState(false)
  // Cuando jefe acepta una pre-venta, guardamos su id para que al "Cobrar" actualicemos esa venta
  const [cobrandoPreventaId, setCobrandoPreventaId] = useState<string | null>(null)

  useEffect(() => {
    if (!posUser || !isJefe || !sede || modoVentaPOS !== 'jefe_cobra') {
      setPreVentas([])
      return
    }
    const unsub = pollPreVentas(sede, (ventas) => {
      const list = ventas.map(v => ({ ...v, id: v.$id, createdAt: { seconds: Math.floor(v.createdAtTs / 1000) } }))
      list.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0))
      setPreVentas(list)
    }, 5000)
    return () => unsub()
  }, [posUser?.id, isJefe, sede, modoVentaPOS])

  const handleAcceptPreventa = (pv: any) => {
    if (!pv || !Array.isArray(pv.items)) return
    // Cargar items al carrito del jefe (reconstruyendo el formato CartItem)
    const items: CartItem[] = pv.items.map((it: any) => ({
      sku: String(it.sku || ''),
      nombre: String(it.nombre || ''),
      cantidad: Number(it.cantidad || 0),
      precioUnitario: Number(it.precioUnitario || 0),
      costoUnitario: Number(it.costoUnitario || 0),
      descuentoPct: Number(it.descuentoPct || 0),
      subtotal: Number(it.subtotal || 0),
      stockDisponible: 9999,
    }))
    setCart(items)
    setDescuentoGlobalPct(Number(pv.descuentoGlobalPct || 0))
    setCobrandoPreventaId(pv.id)
    setShowPreVentas(false)
    showToast(`Pre-venta cargada · ${fmtCLP(Number(pv.total || 0))}`, 'ok')
  }

  const handleRejectPreventa = async (pv: any) => {
    if (!pv?.id) return
    try {
      await updateVentaPos(pv.id, { estado: 'anulada', anuladaEn: Date.now(), anuladaPor: posUser?.nombre || 'jefe', anuladaMotivo: 'rechazada_por_jefe' })
      // Devolver stock reservado al inventario
      try {
        await fetch('/api/pos/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            mode: 'restore',
            ventaId: pv.id,
            sede: pv.sede || sede,
            items: (pv.items || []).map((it: any) => ({
              id: (products.get(it.sku) || products.get(normSku(it.sku)))?.$id || '',
              sku: it.sku,
              cantidad: it.cantidad,
            })),
          }),
        });
      } catch (err) {
        console.warn('Error devolviendo stock en rechazo de pre-venta:', err);
      }
      triggerFullCatalogRefresh();
      showToast('Pre-venta anulada y stock devuelto', 'ok')
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'err')
    }
  }

  // Auto-abrir panel de pre-ventas al jefe cuando llegan nuevas (no estando cobrando una)
  const jefeAutoOpenedRef = useRef<number>(0)
  useEffect(() => {
    if (!isJefe || cobrandoPreventaId) return
    if (preVentas.length > 0 && preVentas.length > jefeAutoOpenedRef.current) {
      setShowPreVentas(true)
    }
    jefeAutoOpenedRef.current = preVentas.length
  }, [isJefe, preVentas.length, cobrandoPreventaId])

  // ─── Vendedora mode: send to cajera ──────────────────────────────────────
  const [showSendToCajera, setShowSendToCajera] = useState(false)
  const [sendingToCajera, setSendingToCajera] = useState(false)
  const [vendedoraSelectedCajera, setVendedoraSelectedCajera] = useState<string | null>(null)
  const [vendedoraClienteEnabled, setVendedoraClienteEnabled] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteRut, setClienteRut] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteCorreo, setClienteCorreo] = useState('')

  const handleSendToCajera = async (cajeraId: string, cajeraNombre: string) => {
    if (!db || !posUser || !sede || cart.length === 0) return
    const esTraspasoEntreCajeras = isCajera && !isVendedora
    setSendingToCajera(true)
    try {
      await authReady
      const activeTab = customerTabs.find(tab => tab.id === activeCustomerTabId)
      // El traspaso mueve el carrito de la atención actual; no crea una venta ni un cliente ficticio.
      let finalClienteNombre = esTraspasoEntreCajeras
        ? (activeTab?.name?.trim() || 'Cliente')
        : clienteNombre.trim()
      if (!esTraspasoEntreCajeras && !finalClienteNombre) {
        const vendorFirstName = posUser.nombre?.split(' ')[0] || 'Vendedor'
        const today = todayStr()
        const key = `pos_client_seq_${posUser.id || 'usr'}_${today}`
        let currentNum = 1
        try {
          const prev = localStorage.getItem(key)
          if (prev) currentNum = parseInt(prev, 10) + 1
          localStorage.setItem(key, String(currentNum))
        } catch {
          currentNum = 1
        }
        finalClienteNombre = `${vendorFirstName} Cliente ${currentNum}`
      }

      const id = `venta_pending_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      await setDoc(doc(db!, 'pos_ventas_pendientes', id), {
        id,
        sede,
        tipoEnvio: esTraspasoEntreCajeras ? 'traspaso_cajera' : 'vendedora',
        enviadoPorId: posUser.id,
        enviadoPorNombre: posUser.nombre,
        enviadoPorFoto: posUser.fotoUrl || '',
        vendedoraId: isVendedora ? posUser.id : '',
        vendedoraNombre: isVendedora ? posUser.nombre : '',
        cajeraId,
        cajeraNombre,
        items: cart.map(c => ({ ...c })),
        descuentoGlobalPct,
        originVendorName: activeTab?.originVendorName || '',
        totalItems: totalItemsCount,
        subtotal: subtotalCart,
        total: totalCart,
        clienteNombre: finalClienteNombre,
        clienteRut: !esTraspasoEntreCajeras && vendedoraClienteEnabled ? (clienteRut.trim() || '') : '',
        clienteTelefono: !esTraspasoEntreCajeras && vendedoraClienteEnabled ? (clienteTelefono.trim() || '') : '',
        clienteCorreo: !esTraspasoEntreCajeras && vendedoraClienteEnabled ? (clienteCorreo.trim() || '') : '',
        clienteRegistrar: !esTraspasoEntreCajeras && vendedoraClienteEnabled,
        estado: 'pendiente',
        fechaStr: todayStr(),
        creadoAtTs: Date.now(),
        creadoAt: serverTimestamp(),
      })
      showToast(esTraspasoEntreCajeras
        ? `Carrito pasado a ${cajeraNombre}`
        : `Cotización enviada a ${cajeraNombre} como "${finalClienteNombre}"`, 'ok')
      if (esTraspasoEntreCajeras) {
        setCustomerTabs(prev => prev.map(tab => tab.id === activeCustomerTabId
          ? { ...tab, pendingSaleId: undefined, originVendorName: undefined }
          : tab))
      }
      setCart([])
      setDescuentoGlobalPct(0)
      setShowSendToCajera(false)
      setClienteNombre('')
      setClienteRut('')
      setClienteTelefono('')
      setClienteCorreo('')
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'err')
    } finally {
      setSendingToCajera(false)
    }
  }

  const nextReceiptCounters = async (payments: PagoEntry[]): Promise<ReceiptCounters> => {
    const hasDebito = payments.some(p => p.metodo === 'debito' && p.monto > 0)
    if (!hasDebito) return { boletaNumero: 0, debitoOrdenNumero: null }

    const ref = doc(db!, 'config_pos', 'correlativos_' + sede)
    let lastError: any = null
    for (let intento = 0; intento < 3; intento++) {
      try {
        return await runTransaction(db!, async (tx: any) => {
          const snap = await tx.get(ref)
          const current = snap.exists() ? (snap.data() as any) : {}
          const nextDebito = (Number(current?.debitoOrdenNumero) || 0) + 1
          tx.set(ref, {
            sede,
            debitoOrdenNumero: nextDebito,
            updatedAt: Date.now(),
          }, { merge: true })
          return { boletaNumero: 0, debitoOrdenNumero: nextDebito }
        })
      } catch (err: any) {
        lastError = err
        await new Promise(r => setTimeout(r, 150 + Math.random() * 250))
      }
    }
    throw lastError || new Error('No se pudo obtener el correlativo del pago con débito tras varios intentos')
  }

  // ─── Load cart from localStorage ───────────────────────────────────────────
  useEffect(() => {
    if (!sede) return
    try {
      if (localStorage.getItem(`${POS_CUSTOMER_TABS_KEY}_${sede}`)) return
      const key = `pos_cart_${sede}`
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.cart && Array.isArray(parsed.cart) && parsed.cart.length > 0) {
          setLastSavedCart(parsed)
        }
      }
    } catch {}
  }, [sede])

  // ─── Save cart to localStorage (debounced 300ms) ──────────────────────────
  useEffect(() => {
    if (!sede) return
    const t = setTimeout(() => {
      try {
        const key = `pos_cart_${sede}`
        if (cart.length > 0) {
          localStorage.setItem(key, JSON.stringify({ cart, descuento: descuentoGlobalPct, timestamp: Date.now() }))
        } else {
          localStorage.removeItem(key)
        }
      } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [cart, descuentoGlobalPct, sede])

  // ─── Load POS login users from Appwrite (Trabajadores de la sucursal) ──────
  useEffect(() => {
    if (!sede) { setLoginLoading(false); return; }
    setLoginLoading(true);

    // Los permisos de sucursal deben reflejar cambios de planilla al entrar.
    fetchTrabajadoresERP(false)
      .then((allTrabajadores) => {
        // La sede puede venir como slug (donbalato-central) o como nombre
        // visible (Importadora Carlitos Central); normalizar separadores evita excluir
        // trabajadores recién creados con el formato de nombre visible.
        const norm = (s: string) => s
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
        const currentSedeNorm = norm(sede);

        // Filter workers for this sucursal respetando la planilla unificada
        const matched = allTrabajadores.filter((w) => {
          if (!w.activo) return false;
          return workerCanAccessBranch(w, sede);
        });

        const activeWorkers = matched.filter(w => w.posActivo !== false);

        const users = activeWorkers
          .map((w) => {
            const sellerCargo = isSellerCargo(w.cargo)
            return {
              id: w.$id,
              nombre: w.nombre,
              cargo: w.cargo || 'Cajera',
              fotoUrl: w.fotoUrl || '',
              posPassword: '',
              posActivo: true,
              puedeGestionarCaja: sellerCargo ? false : w.puedeGestionarCaja,
              nivelAccesoPos: sellerCargo ? 'bajo' as const : normalizePosAccessLevel(w.nivelAccesoPos, w.puedeGestionarCaja),
              rolOperativoPos: sellerCargo ? normalizePosSellerRole(w.rolOperativoPos) : undefined,
              rolesAdicionales: !sellerCargo && Array.isArray(w.rolesAdicionales) && w.rolesAdicionales.includes('web') ? ['web'] as Array<'web'> : [],
            }
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        setLoginUsers(users);

        // Solo reemplazar la sesión de demostración. Una sesión real de Fernanda
        // también se llama "Fernanda" y debe conservarse al recargar el POS.
        setPosUser((prev) => {
          const activePrev = prev;
          if (activePrev && !isAdminEmail(authUser?.email) && !users.some(user => user.id === activePrev.id)) {
            clearPosSession();
            return null;
          }
          if (activePrev && ((activePrev.cargo || '').toUpperCase().includes('ADMIN') || (activePrev.cargo || '').toUpperCase().includes('SUPREMO'))) {
            if (activePrev.role !== 'cajera') {
              const updated = { ...activePrev, role: 'cajera' as const };
              savePosSession(updated);
              return updated;
            }
            return activePrev;
          }
          if (!activePrev || activePrev.id === 'default') {
            const first = users[0];
            if (first) {
              const firstSellerRole = isSellerCargo(first.cargo) ? normalizePosSellerRole(first.rolOperativoPos) : undefined
              const firstIsCashier = getOperatorPosRole(first.cargo, firstSellerRole) === 'cajera'
              const session: PosUserSession = {
                id: first.id,
                nombre: first.nombre,
                cargo: first.cargo,
                fotoUrl: first.fotoUrl,
                puedeGestionarCaja: isSellerCargo(first.cargo) ? false : first.puedeGestionarCaja,
                nivelAccesoPos: isSellerCargo(first.cargo) ? 'bajo' : first.nivelAccesoPos,
                rolOperativoPos: firstSellerRole,
                rolesAdicionales: first.rolesAdicionales || [],
                sede,
                role: firstIsCashier ? 'cajera' : getOperatorPosRole(first.cargo, firstSellerRole),
                loginAt: Date.now(),
              };
              savePosSession(session);
              return session;
            }
          }
          return prev;
        });
      })
      .catch((err) => {
        console.error('Error cargando trabajadores de Appwrite:', err);
      })
      .finally(() => {
        setLoginLoading(false);
      });
  }, [sede, authUser?.email]);

  const handlePosLogin = () => {
    if (!loginSelected) return
    const user = loginUsers.find(u => u.id === loginSelected)
    if (!user) return
    if (user.posPassword && loginPassword !== user.posPassword) {
      setLoginError('Contraseña incorrecta')
      return
    }
    const rolOperativoPos = isSellerCargo(user.cargo) ? normalizePosSellerRole(user.rolOperativoPos) : undefined
    const role = getOperatorPosRole(user.cargo, rolOperativoPos)
    const session: PosUserSession = {
      id: user.id,
      nombre: user.nombre,
      cargo: user.cargo,
      fotoUrl: user.fotoUrl,
      puedeGestionarCaja: isSellerCargo(user.cargo) ? false : user.puedeGestionarCaja,
      nivelAccesoPos: isSellerCargo(user.cargo) ? 'bajo' : normalizePosAccessLevel(user.nivelAccesoPos, user.puedeGestionarCaja),
      rolOperativoPos,
      rolesAdicionales: user.rolesAdicionales || [],
      sede,
      role,
      loginAt: Date.now(),
    }
    savePosSession(session)
    setPosUser(session)
    setLoginPassword('')
    setLoginError('')
    setLoginSelected(null)
  }

  const handlePosLogout = async () => {
    clearPosSession()
    setPosUser(null)
    setLoginSelected(null)
    setLoginPassword('')
    setLoginError('')
    // Cerrar sesión de Firebase Auth y redirigir al login
    try {
      if (authLoggedIn) {
        await authLogout()
      }
    } catch (e) {
      console.warn('Error al cerrar sesión Firebase:', e)
    }
    window.location.href = '/admin/login'
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(now()), 1000)
    return () => clearInterval(t)
  }, [])

  // ─── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: 'ok' | 'err' | 'info' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const downloadPriceLabelsPdf = useCallback(async () => {
    if (cart.length === 0 || isGeneratingPriceLabelsPdf) return
    setIsGeneratingPriceLabelsPdf(true)
    try {
      const uniqueCartItems = new Map<string, CartItem>()
      for (const item of cart) {
        const key = normSku(item.sku || item.productId || item.nombre)
        if (!uniqueCartItems.has(key)) uniqueCartItems.set(key, item)
      }

      const labels = Array.from(uniqueCartItems.values()).map(item => {
        const product = (item.productId ? products.get(item.productId) : undefined)
          || products.get(item.sku)
          || products.get(normSku(item.sku))
        const tiers = product ? [
          { price: Number(product.precio_mayorista || 0), label: product.label_p2 || '', minQty: Number(product.min_qty_2 || 0) },
          { price: Number(product.precio_segundo || product.precio_region || 0), label: product.label_p3 || '', minQty: Number(product.min_qty_3 || 0) },
          { price: Number(product.precio_cuarto || 0), label: product.label_p4 || '' },
          { price: Number(product.precio_5 || 0), label: product.label_p5 || '' },
          { price: Number(product.precio_6 || 0), label: product.label_p6 || '' },
          { price: Number(product.precio_7 || 0), label: product.label_p7 || '' },
          { price: Number(product.precio_8 || 0), label: product.label_p8 || '' },
          { price: Number(product.precio_9 || 0), label: product.label_p9 || '' },
          { price: Number(product.precio_10 || 0), label: product.label_p10 || '' },
        ] : []

        const normalizedQuantityLabel = (label: string) => label
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
        const quantityPrice = tiers
          .filter(tier => tier.price > 0)
          .map(tier => {
            const label = normalizedQuantityLabel(String(tier.label || '').trim())
            const triggerMatch = label.match(/\b(?:a partir de|desde|por|x|caja(?: de)?|pack(?: de)?)\s*(\d+)\b/)
            const unitMatch = label.match(/\b(\d+)\s*(?:unidades|unidad|unid|uds|ud)\b/)
            const quantity = Number(triggerMatch?.[1] || unitMatch?.[1] || tier.minQty || 0)
            return quantity > 1 ? { price: tier.price, quantity } : null
          })
          .find((tier): tier is { price: number; quantity: number } => tier !== null)

        const basePrice = Number(product?.precio_detalle || 0) || Number(item.precioUnitario || 0)
        return {
          name: product?.nombre || item.nombre,
          unitPrice: basePrice,
          ...(quantityPrice ? { quantityPrice: quantityPrice.price, quantity: quantityPrice.quantity } : {}),
        }
      }).filter(item => item.unitPrice > 0)

      if (labels.length === 0) {
        showToast('No hay precios válidos para imprimir.', 'err')
        return
      }

      const { createPosPriceLabelsPdf } = await import('@/lib/posPriceLabelsPdf')
      const pdf = createPosPriceLabelsPdf(labels, { columns: 1, rows: 2 })
      pdf.save(`etiquetas-precios-${sede}-${todayStr()}.pdf`)
      showToast(`PDF listo: ${labels.length} etiqueta${labels.length === 1 ? '' : 's'}.`, 'ok')
    } catch (error) {
      console.error('[POS] No se pudieron generar las etiquetas PDF:', error)
      showToast('No se pudo generar el PDF de etiquetas.', 'err')
    } finally {
      setIsGeneratingPriceLabelsPdf(false)
    }
  }, [cart, isGeneratingPriceLabelsPdf, products, sede, showToast])

  // Las ventas completas se consultan solo cuando se abre el resumen o el cierre
  // de caja. El POS no mantiene una suscripción pasiva a todas las boletas del día.
  const refreshVentasHoy = useCallback(async (): Promise<VentaPOS[]> => {
    if (!sede || !posUser?.id || isVendedora || !sesionCaja?.id) {
      setVentasHoy([])
      return []
    }
    const fechaHoy = todayStr()
    const result = await getVentasPosBySesionCaja(sesionCaja.id, fechaHoy)
    const ventasDelDia = result.filter((v) => {
      const fechaVenta = String(v.fechaStr || '').slice(0, 10)
      if (fechaVenta) return fechaVenta === fechaHoy
      const timestamp = Number(v.fechaTs || v.createdAtTs || 0)
      return timestamp > 0 && getChileDateStr(new Date(timestamp)) === fechaHoy
    })
    const list: VentaPOS[] = ventasDelDia.map((v) => ({
      id: v.$id,
      sede: v.sede,
      cajeroId: (v as any).cajeroId,
      cajeroNombre: v.cajeroNombre,
      clienteNombre: v.clienteNombre,
      sesionCajaId: v.sesionCajaId,
      fechaStr: v.fechaStr,
      fechaTs: v.fechaTs,
      items: v.items as any,
      pagos: v.pagos as any,
      efectivoPagado: Number((v as any).efectivoPagado || 0),
      subtotal: v.subtotal,
      descuentoGlobalPct: v.descuentoGlobalPct,
      descuentoGlobal: v.descuentoGlobal,
      total: v.total,
      vuelto: v.vuelto,
      estado: v.estado as any,
      modoVenta: v.modoVenta,
      tipoComprobante: v.tipoComprobante as any,
      boletaNumero: v.boletaNumero,
      debitoOrdenNumero: v.debitoOrdenNumero,
      metodoPago: (v as any).metodoPago,
      createdAtTs: v.createdAtTs,
    }))
    list.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0))
    setVentasHoy(list.slice(0, 1000))
    return list
  }, [sede, posUser?.id, isVendedora, sesionCaja?.id])

  useEffect(() => {
    setVentasHoy([])
  }, [sede, posUser?.id, isVendedora, sesionCaja?.id])

  const openCajaResumen = useCallback(async () => {
    if (ventasConsultaLoading) return
    setVentasConsultaLoading(true)
    try {
      // El cierre calcula solo las ventas completadas de hoy en esta sesión.
      // Reutilizamos esa misma consulta para que el resumen no mezcle acumulados
      // de días anteriores guardados en la sesión.
      const ventas = await refreshVentasHoy()
      setCajaResumenVentas(ventas)
      setShowCajaResumen(true)
    } catch (error) {
      console.error('[POS] No se pudo actualizar el resumen de caja:', error)
      showToast('No se pudieron consultar las ventas actuales de la caja', 'err')
    } finally {
      setVentasConsultaLoading(false)
    }
  }, [ventasConsultaLoading, refreshVentasHoy, showToast])

  const openCajaCierre = useCallback(async () => {
    setVentasConsultaLoading(true)
    try {
      await refreshVentasHoy()
      setShowCierre(true)
    } catch (error) {
      console.error('[POS] No se pudo consultar ventas para el cierre de caja:', error)
      showToast('No se pudieron consultar las ventas para cerrar la caja', 'err')
    } finally {
      setVentasConsultaLoading(false)
    }
  }, [refreshVentasHoy, showToast])

  const openBasicProductEditor = (product: ProductDoc) => {
    if (!isNivelAlto) {
      showToast('Solo cajeras de Nivel Alto pueden editar productos o fijar precios de emergencia.', 'err')
      return
    }
    const liveStock = stockMap.get(product.$id || '') ?? stockMap.get(normSku(product.sku)) ?? product.stock ?? 0
    const rawPkg = String(product.packageQty || '').trim()
    const cleanPkgNum = parseInt(rawPkg, 10)
    const existingCartItem = cart.find(c => normSku(c.sku) === normSku(product.sku))
    setLightboxProduct(product)
    setBasicProductForm({
      sku: product.sku,
      codigo_barra: product.codigo_barra || '',
      nombre: product.nombre,
      packageQty: cleanPkgNum > 0 ? String(cleanPkgNum) : rawPkg,
      category: product.category || '',
      stock: String(liveStock),
      costo_uni: String(product.costo_uni || 0),
      precio_venta_1: String(product.precio_detalle || 0),
      precio_venta_2: String(product.precio_mayorista || 0),
      precio_venta_3: String(product.precio_segundo || 0),
      imageUrl: product.imageUrl || '',
      precioEmergencia: existingCartItem?.priceField === 'precio_emergencia' ? String(existingCartItem.precioUnitario || '') : '',
      motivoEmergencia: '',
    })
    // Cerrar el lightbox al abrir el editor para que no quede encima
    setLightboxUrl(null)
    setShowBasicProductEditor(true)
  }

  const handleApplyEmergencyPrice = async (overrideProduct?: ProductDoc, closeAfter = true) => {
    const targetProduct = overrideProduct || lightboxProduct
    if (!targetProduct || !isNivelAlto) return
    const customPrice = Math.max(0, Math.round(Number(basicProductForm.precioEmergencia) || 0))
    if (customPrice <= 0) {
      showToast('Ingresa un precio de emergencia válido mayor a $0', 'err')
      return
    }
    const targetSku = basicProductForm.sku.trim().toUpperCase() || targetProduct.sku
    const targetNombre = basicProductForm.nombre.trim() || targetProduct.nombre
    const targetCosto = Math.max(0, Math.round(Number(basicProductForm.costo_uni) || targetProduct.costo_uni || 0))
    const targetPkg = basicProductForm.packageQty.trim() || targetProduct.packageQty || ''
    const targetImg = basicProductForm.imageUrl || targetProduct.imageUrl || ''
    const totalStockForSku = getRealProductStock(targetSku, targetProduct.$id, targetProduct.stock ?? 0)

    setCart(prev => {
      const pNorm = normSku(targetSku)
      const oldNorm = normSku(targetProduct.sku)
      const existingIdx = prev.findIndex(c => normSku(c.sku) === pNorm || normSku(c.sku) === oldNorm || (targetProduct.$id && c.productId === targetProduct.$id))
      if (existingIdx >= 0) {
        return prev.map((c, idx) => {
          if (idx !== existingIdx) return c
          return {
            ...c,
            sku: targetSku,
            nombre: targetNombre,
            precioUnitario: customPrice,
            priceField: 'precio_emergencia',
            priceLabel: 'Precio Emergencia',
            costoUnitario: targetCosto,
            subtotal: Math.round(c.cantidad * customPrice * (1 - (c.descuentoPct || 0) / 100)),
            packageQty: targetPkg,
            imageUrl: targetImg,
          }
        })
      }
      return [
        ...prev,
        {
          productId: targetProduct.$id,
          sku: targetSku,
          nombre: targetNombre,
          cantidad: 1,
          precioUnitario: customPrice,
          priceField: 'precio_emergencia',
          priceLabel: 'Precio Emergencia',
          costoUnitario: targetCosto,
          descuentoPct: 0,
          subtotal: customPrice,
          stockDisponible: totalStockForSku,
          imageUrl: targetImg,
          stockPendiente: totalStockForSku <= 0,
          packageQty: targetPkg,
        },
      ]
    })

    const motivoTxt = basicProductForm.motivoEmergencia.trim()
    const origPrice = Number(targetProduct.precio_detalle || 0)
    fetch('/api/erp/stock-movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: targetProduct.$id || targetProduct.sku,
        sku: targetSku,
        nombre: targetNombre,
        tipo: 'precio_emergencia',
        cantidad: 1,
        sede,
        usuario: posUser?.nombre || 'Cajera Nivel Alto',
        rolUsuario: operatorAccessLevelLabel,
        precioOriginal: origPrice,
        precioEmergencia: customPrice,
        costoUnitario: targetCosto,
        cambios: [
          {
            campo: 'Precio Emergencia (Solo esta venta)',
            antes: origPrice > 0 ? fmtCLP(origPrice) : 'Sin precio (Borrador)',
            despues: fmtCLP(customPrice),
          },
        ],
        nota: `Precio personalizado en venta: ${fmtCLP(customPrice)}${origPrice > 0 ? ` (Catálogo: ${fmtCLP(origPrice)})` : ' (Producto borrador)'}${motivoTxt ? ` · Motivo: ${motivoTxt}` : ''}`,
      }),
    }).catch(() => {})

    if (closeAfter) {
      setShowBasicProductEditor(false)
      showToast(`⚡ Precio de emergencia (${fmtCLP(customPrice)}) aplicado en esta venta`, 'ok')
    }
  }

  const uploadBasicProductImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Selecciona un archivo de imagen', 'err')
      return
    }
    setBasicImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slot', 'product')
      const response = await fetch('/api/admin-supreme/upload-image', { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok || !data.success || !data.imageUrl) throw new Error(data.error || 'No se pudo subir la imagen')
      setBasicProductForm(form => ({ ...form, imageUrl: data.imageUrl }))
      showToast('Imagen cargada correctamente', 'ok')
    } catch (error: any) {
      showToast(error?.message || 'Error subiendo imagen', 'err')
    } finally {
      setBasicImageUploading(false)
    }
  }

  const pasteBasicProductImage = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find(value => value.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        await uploadBasicProductImage(new File([blob], `producto-${Date.now()}.png`, { type: blob.type }))
        return
      }
      showToast('No hay una imagen en el portapapeles', 'info')
    } catch {
      showToast('No se pudo leer el portapapeles. Usa Ctrl+V dentro del editor.', 'err')
    }
  }

  const handleSaveBasicProduct = async () => {
    if (!lightboxProduct || basicProductSaving || !isNivelAlto) return
    const oldProduct = lightboxProduct
    const nextSku = basicProductForm.sku.trim().toUpperCase()
    const nextNombre = basicProductForm.nombre.trim()
    if (!nextSku || !nextNombre) {
      showToast('El SKU y el nombre son obligatorios', 'err')
      return
    }
    const nextBarcode = basicProductForm.codigo_barra.trim()
    const nextPkg = basicProductForm.packageQty.trim()
    const updates = {
      sku: nextSku,
      codigo_barra: nextBarcode,
      nombre: nextNombre,
      packageQty: nextPkg,
      category: basicProductForm.category,
      costo_uni: Math.max(0, Math.round(Number(basicProductForm.costo_uni) || 0)),
      precio_venta_1: Math.max(0, Math.round(Number(basicProductForm.precio_venta_1) || 0)),
      precio_venta_2: Math.max(0, Math.round(Number(basicProductForm.precio_venta_2) || 0)),
      precio_venta_3: Math.max(0, Math.round(Number(basicProductForm.precio_venta_3) || 0)),
      imageUrl: basicProductForm.imageUrl,
    }
    const changed: string[] = []
    const cambiosDetalle: Array<{ campo: string; antes: string; despues: string }> = []
    if (oldProduct.sku !== updates.sku) {
      changed.push(`SKU ${oldProduct.sku} → ${updates.sku}`)
      cambiosDetalle.push({ campo: 'SKU', antes: oldProduct.sku, despues: updates.sku })
    }
    if ((oldProduct.codigo_barra || '') !== updates.codigo_barra) {
      changed.push(`Cód. Barra → ${updates.codigo_barra || 'Vacío'}`)
      cambiosDetalle.push({ campo: 'Código de barras', antes: oldProduct.codigo_barra || 'Sin código', despues: updates.codigo_barra || 'Sin código' })
    }
    if (oldProduct.nombre !== updates.nombre) {
      changed.push(`Nombre: ${oldProduct.nombre} → ${updates.nombre}`)
      cambiosDetalle.push({ campo: 'Nombre', antes: oldProduct.nombre, despues: updates.nombre })
    }
    const oldPkgClean = String(parseInt(String(oldProduct.packageQty || ''), 10) || oldProduct.packageQty || '').trim()
    if (oldPkgClean !== updates.packageQty) {
      changed.push(`Unid/Embalaje: ${oldPkgClean || '0'} → ${updates.packageQty || '0'}`)
      cambiosDetalle.push({ campo: 'Unidades por embalaje', antes: oldPkgClean ? `${oldPkgClean} uds` : 'Sin definir', despues: updates.packageQty ? `${updates.packageQty} uds` : 'Sin definir' })
    }
    if ((oldProduct.costo_uni || 0) !== updates.costo_uni) {
      changed.push(`Costo → ${fmtCLP(updates.costo_uni)}`)
      cambiosDetalle.push({ campo: 'Costo', antes: fmtCLP(oldProduct.costo_uni || 0), despues: fmtCLP(updates.costo_uni) })
    }
    if ((oldProduct.precio_detalle || 0) !== updates.precio_venta_1) {
      changed.push(`Efectivo → ${fmtCLP(updates.precio_venta_1)}`)
      cambiosDetalle.push({ campo: 'Precio Efectivo', antes: fmtCLP(oldProduct.precio_detalle || 0), despues: fmtCLP(updates.precio_venta_1) })
    }
    if ((oldProduct.precio_mayorista || 0) !== updates.precio_venta_2) {
      changed.push(`Embalaje → ${fmtCLP(updates.precio_venta_2)}`)
      cambiosDetalle.push({ campo: 'Precio Embalaje', antes: fmtCLP(oldProduct.precio_mayorista || 0), despues: fmtCLP(updates.precio_venta_2) })
    }
    if ((oldProduct.precio_segundo || 0) !== updates.precio_venta_3) {
      changed.push(`Embalaje 2 → ${fmtCLP(updates.precio_venta_3)}`)
      cambiosDetalle.push({ campo: 'Precio Embalaje 2', antes: fmtCLP(oldProduct.precio_segundo || 0), despues: fmtCLP(updates.precio_venta_3) })
    }
    if ((oldProduct.imageUrl || '') !== updates.imageUrl) {
      changed.push('Imagen actualizada')
      cambiosDetalle.push({ campo: 'Imagen', antes: oldProduct.imageUrl ? 'Foto anterior' : 'Sin foto', despues: 'Foto nueva' })
    }

    const hasEmergencyPriceInput = Math.round(Number(basicProductForm.precioEmergencia) || 0) > 0

    if (changed.length === 0) {
      if (hasEmergencyPriceInput) {
        await handleApplyEmergencyPrice(oldProduct, true)
        return
      }
      setShowBasicProductEditor(false)
      return
    }

    const updatesForRequest: Partial<typeof updates> = { ...updates }

    setBasicProductSaving(true)
    try {
      const response = await fetch('/api/erp/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: oldProduct.$id || oldProduct.sku,
          sku: oldProduct.sku,
          nombre: oldProduct.nombre,
          tipo: 'edicion',
          sede,
          usuario: posUser?.nombre || 'POS',
          rolUsuario: operatorAccessLevelLabel,
          cambios: cambiosDetalle,
          nota: `Edición POS: ${changed.join(' · ')}`,
          updates: updatesForRequest,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo actualizar el producto')
      const saved = data.product
      const updatedProduct: ProductDoc = {
        ...oldProduct,
        sku: saved.sku,
        codigo_barra: saved.codigo_barra ?? updates.codigo_barra,
        nombre: saved.nombre,
        packageQty: saved.packageQty ?? updates.packageQty,
        category: saved.category,
        stock: saved.stock,
        costo_uni: saved.costo_uni,
        precio_detalle: saved.precio_venta_1,
        precio_mayorista: saved.precio_venta_2,
        precio_segundo: saved.precio_venta_3 || 0,
        precio_region: saved.precio_venta_3 || 0,
        imageUrl: saved.imageUrl,
      }
      setProducts(prev => {
        const next = new Map(prev)
        for (const [key, product] of next.entries()) {
          if (product.$id === oldProduct.$id || product.sku === oldProduct.sku) next.delete(key)
        }
        if (updatedProduct.$id) next.set(updatedProduct.$id, updatedProduct)
        next.set(normSku(updatedProduct.sku), updatedProduct)
        if (updatedProduct.codigo_barra) {
          const bcode = updatedProduct.codigo_barra.trim().toUpperCase()
          if (!next.has(bcode) || next.get(bcode)?.$id === updatedProduct.$id) {
            next.set(bcode, updatedProduct)
          }
        }
        return next
      })
      setStockMap(prev => {
        const next = new Map(prev)
        next.delete(normSku(oldProduct.sku))
        if (oldProduct.$id) next.set(oldProduct.$id, saved.stock)
        next.set(normSku(saved.sku), saved.stock)
        return next
      })
      const updateCartProduct = (items: CartItem[]) => items.map(item => {
        if (item.sku !== oldProduct.sku) return item
        const precioUnitario = item.priceField === 'precio_emergencia'
          ? item.precioUnitario
          : item.priceField === 'precio_mayorista'
            ? saved.precio_venta_2
            : item.priceField === 'precio_segundo' || item.priceField === 'precio_region'
              ? Number(saved.precio_venta_3 ?? oldProduct.precio_segundo ?? 0)
              : saved.precio_venta_1
        return {
          ...item,
          sku: saved.sku,
          nombre: saved.nombre,
          imageUrl: saved.imageUrl,
          packageQty: saved.packageQty ?? updates.packageQty,
          costoUnitario: saved.costo_uni,
          precioUnitario,
          subtotal: Math.round(precioUnitario * item.cantidad * (1 - (item.descuentoPct || 0) / 100)),
          stockDisponible: saved.stock,
        }
      })
      setCart(updateCartProduct)
      setCustomerTabs(prev => prev.map(tab => ({ ...tab, cart: updateCartProduct(tab.cart) })))
      setLightboxProduct(updatedProduct)
      setLightboxUrl(saved.imageUrl || null)
      clearPosProductsCache()
      if (hasEmergencyPriceInput) {
        await handleApplyEmergencyPrice(updatedProduct, false)
      }
      setShowBasicProductEditor(false)
      showToast(
        hasEmergencyPriceInput
          ? `Producto actualizado y precio de emergencia aplicado`
          : `Producto actualizado${data.pendienteDescontado > 0 ? ` · ${data.pendienteDescontado} pendiente descontado` : ''}`,
        'ok'
      )
    } catch (error: any) {
      showToast(error?.message || 'Error actualizando producto', 'err')
    } finally {
      setBasicProductSaving(false)
    }
  }

  const loadCustomerTabState = (tab: CustomerSaleTab) => {
    setCart(tab.cart || [])
    setDescuentoGlobalPct(tab.descuentoGlobalPct || 0)
    setPagoActivo(tab.pagoActivo || 'efectivo')
    setMontoRecibido(tab.montoRecibido || '')
    setPagos(tab.pagos || [])
    setSplitMode(Boolean(tab.splitMode))
    setTipoComprobante('comprobante')
    setPendingStockAdd(null)
    setSearchTerm('')
  }

  const currentCustomerTabSnapshot = (tab: CustomerSaleTab): CustomerSaleTab => ({
    ...tab,
    cart,
    descuentoGlobalPct,
    pagoActivo,
    montoRecibido,
    pagos,
    splitMode,
    tipoComprobante,
    updatedAt: Date.now(),
  })

  const handleAcceptPendingSale = (sale: any) => {
    const saleItems: CartItem[] = (sale.items && Array.isArray(sale.items)) ? (sale.items as CartItem[]) : []
    const saleDescuento = typeof sale.descuentoGlobalPct === 'number' ? sale.descuentoGlobalPct : 0
    const esTraspasoEntreCajeras = sale.tipoEnvio === 'traspaso_cajera'
    const senderName = sale.enviadoPorNombre || sale.vendedoraNombre || 'Usuario POS'
    const originVendorName = sale.originVendorName || (esTraspasoEntreCajeras ? undefined : (sale.vendedoraNombre || 'Vendedor'))
    const clientTabName = (sale.clienteNombre || (esTraspasoEntreCajeras ? `Traspaso de ${senderName}` : `${senderName} Cotización`)).trim()

    // Buscar si la pestaña activa está limpia/vacía para reutilizarla
    const activeTab = customerTabs.find(t => t.id === activeCustomerTabId)
    const activeIsCleanAndEmpty = activeTab && cart.length === 0 && !activeTab.originVendorName && activeTab.name.startsWith('Cliente ')

    if (activeIsCleanAndEmpty && activeTab) {
      // Reutilizar la pestaña actual
      const updatedTab: CustomerSaleTab = {
        ...activeTab,
        name: clientTabName,
        cart: saleItems,
        descuentoGlobalPct: saleDescuento,
        originVendorName,
        pendingSaleId: sale.id,
        updatedAt: Date.now(),
      }
      setCustomerTabs(prev => prev.map(tab => tab.id === activeCustomerTabId ? updatedTab : tab))
      loadCustomerTabState(updatedTab)
    } else {
      // Pestaña actual con venta en curso: crear NUEVA pestaña para no borrar lo que la cajera ya tenía
      const newTab = createCustomerSaleTab(nextCustomerNumber, clientTabName, {
        cart: saleItems,
        descuentoGlobalPct: saleDescuento,
        originVendorName,
        pendingSaleId: sale.id,
      })
      setCustomerTabs(prev => [
        ...prev.map(tab => tab.id === activeCustomerTabId ? currentCustomerTabSnapshot(tab) : tab),
        newTab,
      ])
      setNextCustomerNumber(prev => prev + 1)
      setActiveCustomerTabId(newTab.id)
      loadCustomerTabState(newTab)
    }

    // Marcar en Firestore como aceptada
    if (db) {
      updateDoc(doc(db!, 'pos_ventas_pendientes', sale.id), { estado: 'aceptada' }).catch(() => {})
    }
    setShowPendingSales(false)
    setMobileTab('cart')
    showToast(`${esTraspasoEntreCajeras ? 'Carrito de' : 'Cotización de'} ${senderName} abierta en pestaña "${clientTabName}"`, 'ok')
  }

  const switchCustomerTab = (tabId: string) => {
    if (tabId === activeCustomerTabId || processing) return
    const target = customerTabs.find(tab => tab.id === tabId)
    if (!target) return
    setCustomerTabs(prev => prev.map(tab => tab.id === activeCustomerTabId ? currentCustomerTabSnapshot(tab) : tab))
    setActiveCustomerTabId(tabId)
    loadCustomerTabState(target)
    setMobileTab(target.cart.length > 0 ? 'cart' : 'products')
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  const openNewCustomerTab = () => {
    if (customerTabs.length >= MAX_CUSTOMER_TABS) {
      showToast(`Máximo ${MAX_CUSTOMER_TABS} clientes abiertos`, 'info')
      return
    }
    setCustomerTabModalMode('new')
    setCustomerTabName('')
    setShowCustomerTabModal(true)
  }

  const openRenameCustomerTab = () => {
    const active = customerTabs.find(tab => tab.id === activeCustomerTabId)
    if (!active) return
    setCustomerTabModalMode('rename')
    setCustomerTabName(active.name)
    setShowCustomerTabModal(true)
  }

  const submitCustomerTabModal = () => {
    const name = customerTabName.trim()
    if (customerTabModalMode === 'rename') {
      setCustomerTabs(prev => prev.map(tab => tab.id === activeCustomerTabId ? { ...tab, name: name || tab.name } : tab))
      setShowCustomerTabModal(false)
      return
    }
    const newTab = createCustomerSaleTab(nextCustomerNumber, name)
    setCustomerTabs(prev => [
      ...prev.map(tab => tab.id === activeCustomerTabId ? currentCustomerTabSnapshot(tab) : tab),
      newTab,
    ])
    setNextCustomerNumber(prev => prev + 1)
    setActiveCustomerTabId(newTab.id)
    loadCustomerTabState(newTab)
    setMobileTab('products')
    setShowCustomerTabModal(false)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  const closeCustomerTab = (tabId: string) => {
    if (customerTabs.length <= 1 || processing) return
    const tabIndex = customerTabs.findIndex(tab => tab.id === tabId)
    const tab = customerTabs[tabIndex]
    if (!tab) return
    const currentTab = tabId === activeCustomerTabId ? currentCustomerTabSnapshot(tab) : tab
    if (currentTab.cart.length > 0 && !window.confirm(`¿Cerrar ${currentTab.name}? Su carrito tiene productos.`)) return
    const remaining = customerTabs.filter(item => item.id !== tabId)
    setCustomerTabs(remaining)
    if (tabId === activeCustomerTabId) {
      const target = remaining[Math.min(tabIndex, remaining.length - 1)]
      setActiveCustomerTabId(target.id)
      loadCustomerTabState(target)
    }
  }

  // Abrir una venta del historial en una nueva pestaña crea un carrito separado,
  // conservando cualquier carrito que ya estuviera abierto en esta sede.
  useEffect(() => {
    if (!sede || loadingProducts || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('restaurar')
    if (!token || restoredSaleTokenRef.current === token) return
    restoredSaleTokenRef.current = token

    const storageKey = `${RESTORE_SALE_STORAGE_PREFIX}${token}`
    let restoredSale: any = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) restoredSale = JSON.parse(raw)
      localStorage.removeItem(storageKey)
    } catch {
      localStorage.removeItem(storageKey)
    }
    window.history.replaceState(null, '', `/pos/${sede}`)

    if (!restoredSale || !Array.isArray(restoredSale.items) || restoredSale.items.length === 0) {
      showToast('No se encontraron productos para restaurar', 'err')
      return
    }

    const restoredCart: CartItem[] = restoredSale.items.map((item: any) => {
      const sku = String(item.sku || '')
      const product = products.get(sku) || products.get(normSku(sku))
      const cantidad = Number(item.cantidad) || 1
      const precioUnitario = Number(item.precioUnitario) || 0
      const descuentoPct = Number(item.descuentoPct) || 0
      const matchingPrice = inferHistoricalPriceOption(product, precioUnitario)
      const priceField = item.priceField || matchingPrice?.field || (precioUnitario > 0 ? 'precio_historico' : undefined)
      const priceLabel = item.priceLabel || matchingPrice?.label || (priceField === 'precio_historico' ? 'Precio original' : undefined)
      return {
        productId: product?.$id || sku,
        sku,
        nombre: item.nombre || product?.nombre || sku,
        cantidad,
        precioUnitario,
        priceField,
        priceLabel,
        costoUnitario: Number(item.costoUnitario || product?.costo_uni || 0),
        descuentoPct,
        subtotal: Number(item.subtotal) || Math.round(cantidad * precioUnitario * (1 - descuentoPct / 100)),
        stockDisponible: stockMap.get(sku) ?? stockMap.get(normSku(sku)) ?? 999,
        imageUrl: item.imageUrl || product?.imageUrl || '',
        stockPendiente: false,
        embalajeQty: item.embalajeQty ?? product?.embalajeQty,
        packageQty: item.packageQty ?? product?.packageQty,
      }
    })
    const clientName = String(restoredSale.clienteNombre || '').trim()
    const folio = restoredSale.boletaNumero ? ` #${restoredSale.boletaNumero}` : ''
    const tabName = `Venta restaurada${folio}${clientName ? ` · ${clientName}` : ''}`
    const currentTabs = customerTabsRef.current
    const currentId = activeCustomerTabIdRef.current
    const newTab = createCustomerSaleTab(nextCustomerNumberRef.current || nextCustomerNumber, tabName, {
      cart: restoredCart,
      descuentoGlobalPct: Number(restoredSale.descuentoGlobalPct) || 0,
    })
    const updatedTabs = [
      ...currentTabs.map(tab => tab.id === currentId ? currentCustomerTabSnapshot(tab) : tab),
      newTab,
    ]
    const nextNumber = (nextCustomerNumberRef.current || nextCustomerNumber) + 1
    setCustomerTabs(updatedTabs)
    customerTabsRef.current = updatedTabs
    setActiveCustomerTabId(newTab.id)
    activeCustomerTabIdRef.current = newTab.id
    setNextCustomerNumber(nextNumber)
    nextCustomerNumberRef.current = nextNumber
    loadCustomerTabState(newTab)
    setDescuentoGlobalPct(Number(restoredSale.descuentoGlobalPct) || 0)
    setMobileTab('cart')
    showToast(`Venta${folio} restaurada en una nueva canasta`, 'ok')
  }, [sede, loadingProducts, products, stockMap, showToast, nextCustomerNumber, loadCustomerTabState, currentCustomerTabSnapshot])

  // POS Admin guarda las ventas anuladas para rehacerlas en este navegador.
  // Importarlas como pestañas permite corregirlas sin pisar el carrito activo.
  useEffect(() => {
    if (!sede || loadingProducts || typeof window === 'undefined') return
    const storageKey = `${POS_DRAFTS_STORAGE_PREFIX}${sede}`

    let drafts: any[] = []
    try {
      const raw = localStorage.getItem(storageKey)
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) drafts = parsed
    } catch {
      localStorage.removeItem(storageKey)
      return
    }
    const validDrafts = drafts.filter(draft => Array.isArray(draft?.cart) && draft.cart.length > 0)
    if (validDrafts.length === 0) return

    const currentTabs = customerTabsRef.current
    const slotsAvailable = Math.max(0, MAX_CUSTOMER_TABS - currentTabs.length)
    if (slotsAvailable === 0) {
      if (posDraftFullNoticeRef.current !== storageKey) {
        posDraftFullNoticeRef.current = storageKey
        showToast('Hay un borrador de POS Admin, pero las 8 pestañas están ocupadas. Cierra una y se cargará automáticamente.', 'info')
      }
      return
    }
    posDraftFullNoticeRef.current = null

    const draftsToRestore = validDrafts.slice(0, slotsAvailable)
    const currentId = activeCustomerTabIdRef.current
    const updatedTabs = currentTabs.map(tab => tab.id === currentId ? currentCustomerTabSnapshot(tab) : tab)
    let nextNumber = nextCustomerNumberRef.current || nextCustomerNumber
    let lastRestoredTab: CustomerSaleTab | null = null

    for (const draft of draftsToRestore) {
      const restoredCart: CartItem[] = draft.cart.map((item: any) => {
        const sku = String(item.sku || '')
        const product = products.get(sku) || products.get(normSku(sku))
        const cantidad = Number(item.cantidad) || 1
        const precioUnitario = Number(item.precioUnitario) || 0
        const descuentoPct = Number(item.descuentoPct) || 0
        return {
          productId: product?.$id || sku,
          sku,
          nombre: item.nombre || product?.nombre || sku,
          cantidad,
          precioUnitario,
          priceField: item.priceField,
          priceLabel: item.priceLabel,
          costoUnitario: Number(item.costoUnitario || product?.costo_uni || 0),
          descuentoPct,
          subtotal: Number(item.subtotal) || Math.round(cantidad * precioUnitario * (1 - descuentoPct / 100)),
          stockDisponible: stockMap.get(sku) ?? stockMap.get(normSku(sku)) ?? (Number(item.stockDisponible) || 999),
          imageUrl: item.imageUrl || product?.imageUrl || '',
          stockPendiente: false,
          embalajeQty: item.embalajeQty ?? product?.embalajeQty,
          packageQty: item.packageQty ?? product?.packageQty,
        }
      })
      const tabName = String(draft.label || 'Borrador POS Admin').trim()
      lastRestoredTab = createCustomerSaleTab(nextNumber, tabName, {
        cart: restoredCart,
        descuentoGlobalPct: Number(draft.descuentoGlobalPct) || 0,
      })
      updatedTabs.push(lastRestoredTab)
      nextNumber += 1
    }

    const remainingDrafts = drafts.filter(draft => !draftsToRestore.includes(draft))
    if (remainingDrafts.length > 0) localStorage.setItem(storageKey, JSON.stringify(remainingDrafts))
    else localStorage.removeItem(storageKey)

    if (!lastRestoredTab) return
    setCustomerTabs(updatedTabs)
    customerTabsRef.current = updatedTabs
    setActiveCustomerTabId(lastRestoredTab.id)
    activeCustomerTabIdRef.current = lastRestoredTab.id
    setNextCustomerNumber(nextNumber)
    nextCustomerNumberRef.current = nextNumber
    loadCustomerTabState(lastRestoredTab)
    setMobileTab('cart')
    showToast(draftsToRestore.length === 1 ? 'Borrador de POS Admin cargado en una nueva pestaña' : `${draftsToRestore.length} borradores de POS Admin cargados`, 'ok')
  }, [sede, loadingProducts, products, stockMap, customerTabs, showToast, nextCustomerNumber, loadCustomerTabState, currentCustomerTabSnapshot])

  const finishActiveCustomerSale = () => {
    isFinishingSaleRef.current = true

    // 1. Limpieza inmediata y síncrona del carrito y pagos locales
    setCart([])
    setDescuentoGlobalPct(0)
    setPagoActivo('efectivo')
    setMontoRecibido('')
    setPagos([])
    setSplitMode(false)
    setTipoComprobante('comprobante')
    setPendingStockAdd(null)
    setSearchTerm('')
    setLastSavedCart(null)
    if (sede) {
      try { localStorage.removeItem(`pos_cart_${sede}`) } catch (_) {}
    }

    // 2. Gestionar pestañas de clientes de manera atómica con los refs actualizados
    const currentActiveId = activeCustomerTabIdRef.current || activeCustomerTabId
    const currentTabs = (customerTabsRef.current && customerTabsRef.current.length > 0) ? customerTabsRef.current : customerTabs
    const remaining = currentTabs.filter(tab => tab.id !== currentActiveId)

    let nextNum = nextCustomerNumberRef.current || nextCustomerNumber
    let targetTab: CustomerSaleTab
    let updatedTabs: CustomerSaleTab[]

    // Buscar si queda alguna pestaña limpia/vacía de "Cliente N"
    const emptyTab = remaining.find(t => (!t.cart || t.cart.length === 0) && !t.originVendorName)

    if (emptyTab) {
      targetTab = emptyTab
      updatedTabs = remaining
    } else {
      targetTab = createCustomerSaleTab(nextNum)
      nextNum += 1
      updatedTabs = [...remaining, targetTab]
    }

    // Actualizar estado y refs de inmediato
    setCustomerTabs(updatedTabs)
    customerTabsRef.current = updatedTabs

    setActiveCustomerTabId(targetTab.id)
    activeCustomerTabIdRef.current = targetTab.id

    setNextCustomerNumber(nextNum)
    nextCustomerNumberRef.current = nextNum

    loadCustomerTabState(targetTab)
    setLastSavedCart(null)
    setMobileTab('products')

    // Sincronizar inmediatamente en localStorage para garantizar persistencia limpia
    if (sede) {
      try {
        localStorage.setItem(`${POS_CUSTOMER_TABS_KEY}_${sede}`, JSON.stringify({
          tabs: updatedTabs,
          activeId: targetTab.id,
          nextNumber: nextNum,
        }))
      } catch (_) {}
    }

    setTimeout(() => {
      isFinishingSaleRef.current = false
      searchRef.current?.focus()
    }, 150)
  }

  useEffect(() => {
    if (isFinishingSaleRef.current) return
    setCustomerTabs(prev => prev.map(tab => tab.id === activeCustomerTabId ? currentCustomerTabSnapshot(tab) : tab))
  }, [cart, descuentoGlobalPct, pagoActivo, montoRecibido, pagos, splitMode, tipoComprobante, activeCustomerTabId])

  useEffect(() => {
    if (!sede || isFinishingSaleRef.current) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`${POS_CUSTOMER_TABS_KEY}_${sede}`, JSON.stringify({
          tabs: customerTabs,
          activeId: activeCustomerTabId,
          nextNumber: nextCustomerNumber,
        }))
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [customerTabs, activeCustomerTabId, nextCustomerNumber, sede])

  // ─── Load products from Appwrite Cloud ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingProducts(true);

    // Cargar categorías en paralelo
    getFirebaseErpCategories().then(cats => {
      if (!cancelled && cats.length > 0) setErpCategories(cats);
    }).catch(() => {});

    fetchAllFirebaseErpProducts(false, POS_PRODUCTS_CACHE_TTL_MS)
      .then((rawProducts) => {
        if (cancelled) return;
        // El POS solo muestra productos de tienda física; productos web exclusivos y tiendas aliadas se ocultan.
        const appwriteProducts = rawProducts.filter((p: any) => {
          if (isAppwriteProduct(p)) return false;
          if (isWebOnlyProduct(p)) return false;
          const raw = p.rawDocument || {};
          if (p.isVendorProduct === true || raw.isVendorProduct === true || raw.IS_VENDOR_PRODUCT === true) return false;
          const vid = raw.VENDOR_ID || raw.vendorId;
          if (vid && vid !== '__MAIN__' && vid !== 'donbalato') return false;
          const sid = raw.SELLERID || raw.sellerId;
          if (sid && sid !== '__MAIN__' && sid !== 'donbalato') return false;
          return true;
        });
        const map = new Map<string, ProductDoc>();
        const stockMapTemp = new Map<string, number>();

        appwriteProducts.forEach((p) => {
          const rawSku = (p.sku && p.sku !== '-' && p.sku !== 'undefined') ? p.sku : p.$id;
          const displaySku = (p.sku && p.sku !== 'undefined') ? p.sku : '-';
          const primaryKey = p.$id || normSku(rawSku);
          if (!primaryKey) return;

          const itemStock = Number(p.stock) || 0;

          const prodObj: ProductDoc = {
            $id: p.$id,
            sku: displaySku,
            nombre: p.nombre || 'Sin nombre',
            costo_uni: Number(p.costo_uni) || 0,
            precio_detalle: Number(p.precio_venta_1) || 0,
            precio_mayorista: Number(p.precio_venta_2) || Number(p.precio_venta_1) || 0,
            precio_region: Number(p.precio_venta_3) || 0,
            precio_segundo: Number(p.precio_venta_3) || 0,
            precio_cuarto: Number(p.precio_venta_4) || 0,
            precio_5: Number((p as any).precio_venta_5) || 0,
            precio_6: Number((p as any).precio_venta_6) || 0,
            precio_7: Number((p as any).precio_venta_7) || 0,
            precio_8: Number((p as any).precio_venta_8) || 0,
            precio_9: Number((p as any).precio_venta_9) || 0,
            precio_10: Number((p as any).precio_venta_10) || 0,
            label_p2: p.label_p2 || '',
            label_p3: p.label_p3 || '',
            label_p4: p.label_p4 || '',
            label_p5: (p as any).label_p5 || '',
            label_p6: (p as any).label_p6 || '',
            label_p7: (p as any).label_p7 || '',
            label_p8: (p as any).label_p8 || '',
            label_p9: (p as any).label_p9 || '',
            label_p10: (p as any).label_p10 || '',
            min_qty_2: p.min_qty_2,
            min_qty_3: p.min_qty_3,
            is_draft: Boolean(p.is_draft || p.status === 'draft'),
            status: p.status || '',
            imageUrl: p.imageUrl || '',
            codigo_barra: (p.codigo_barra || '').trim(),
            category: p.category || 'General',
            subcategory: p.subcategory || '',
            packageQty: p.packageQty || '',
            boxCode: p.boxCode || '',
            supplier: p.supplier || '',
          };

          map.set(primaryKey, prodObj);
          stockMapTemp.set(primaryKey, itemStock);

          if (p.sku && p.sku !== '-' && p.sku !== primaryKey) {
            const normS = normSku(p.sku);
            map.set(normS, prodObj);
            stockMapTemp.set(normS, itemStock);
          }
        });

        // Registrar códigos de barra en un segundo pase para nunca sobreescribir un SKU ni un ID existente
        appwriteProducts.forEach((p) => {
          const bcode = (p.codigo_barra || '').trim().toUpperCase();
          if (bcode && !map.has(bcode)) {
            const rawSku = (p.sku && p.sku !== '-' && p.sku !== 'undefined') ? p.sku : p.$id;
            const primaryKey = p.$id || normSku(rawSku);
            const prodObj = map.get(primaryKey);
            if (prodObj) {
              map.set(bcode, prodObj);
              stockMapTemp.set(bcode, Number(p.stock) || 0);
            }
          }
        });

        if (!cancelled) {
          setProducts(map);
          setStockMap(stockMapTemp);
          setLoadingProducts(false);
        }
      })
      .catch((err) => {
        console.error('Error cargando productos para POS:', err);
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Load stock & products from Appwrite Cloud ───────────────────────────────────
  const triggerFullCatalogRefresh = useCallback(async (forceRefresh = false) => {
    try {
      const rawProducts = await fetchAllFirebaseErpProducts(forceRefresh, POS_PRODUCTS_CACHE_TTL_MS);
      // El POS solo muestra productos de tienda física; productos web exclusivos y tiendas aliadas se ocultan.
      const appwriteProducts = rawProducts.filter((p: any) => {
        if (isAppwriteProduct(p)) return false;
        if (isWebOnlyProduct(p)) return false;
        const raw = p.rawDocument || {};
        if (p.isVendorProduct === true || raw.isVendorProduct === true || raw.IS_VENDOR_PRODUCT === true) return false;
        const vid = raw.VENDOR_ID || raw.vendorId;
        if (vid && vid !== '__MAIN__' && vid !== 'donbalato') return false;
        const sid = raw.SELLERID || raw.sellerId;
        if (sid && sid !== '__MAIN__' && sid !== 'donbalato') return false;
        return true;
      });
      setProducts((prevMap) => {
        const nextMap = new Map(prevMap);
        appwriteProducts.forEach((p) => {
          const rawSku = (p.sku && p.sku !== '-' && p.sku !== 'undefined') ? p.sku : p.$id;
          const displaySku = (p.sku && p.sku !== 'undefined') ? p.sku : '-';
          const primaryKey = p.$id || normSku(rawSku);
          if (!primaryKey) return;

          const prodObj: ProductDoc = {
            $id: p.$id,
            sku: displaySku,
            nombre: p.nombre || 'Sin nombre',
            costo_uni: Number(p.costo_uni) || 0,
            precio_detalle: Number(p.precio_venta_1) || 0,
            precio_mayorista: Number(p.precio_venta_2) || Number(p.precio_venta_1) || 0,
            precio_region: Number(p.precio_venta_3) || 0,
            precio_segundo: Number(p.precio_venta_3) || 0,
            precio_cuarto: Number(p.precio_venta_4) || 0,
            precio_5: Number((p as any).precio_venta_5) || 0,
            precio_6: Number((p as any).precio_venta_6) || 0,
            precio_7: Number((p as any).precio_venta_7) || 0,
            precio_8: Number((p as any).precio_venta_8) || 0,
            precio_9: Number((p as any).precio_venta_9) || 0,
            precio_10: Number((p as any).precio_venta_10) || 0,
            label_p2: p.label_p2 || '',
            label_p3: p.label_p3 || '',
            label_p4: p.label_p4 || '',
            label_p5: (p as any).label_p5 || '',
            label_p6: (p as any).label_p6 || '',
            label_p7: (p as any).label_p7 || '',
            label_p8: (p as any).label_p8 || '',
            label_p9: (p as any).label_p9 || '',
            label_p10: (p as any).label_p10 || '',
            min_qty_2: p.min_qty_2,
            min_qty_3: p.min_qty_3,
            is_draft: Boolean(p.is_draft || p.status === 'draft'),
            status: p.status || '',
            imageUrl: p.imageUrl || '',
            codigo_barra: (p.codigo_barra || '').trim(),
            category: p.category || 'General',
            subcategory: p.subcategory || '',
            packageQty: p.packageQty || '',
            boxCode: p.boxCode || '',
            supplier: p.supplier || '',
          };
          nextMap.set(primaryKey, prodObj);
          if (p.sku && p.sku !== '-' && p.sku !== primaryKey) nextMap.set(normSku(p.sku), prodObj);
        });

        appwriteProducts.forEach((p) => {
          const bcode = (p.codigo_barra || '').trim().toUpperCase();
          if (bcode && !nextMap.has(bcode)) {
            const rawSku = (p.sku && p.sku !== '-' && p.sku !== 'undefined') ? p.sku : p.$id;
            const primaryKey = p.$id || normSku(rawSku);
            const prodObj = nextMap.get(primaryKey);
            if (prodObj) nextMap.set(bcode, prodObj);
          }
        });
        return nextMap;
      });

      setStockMap((prevMap) => {
        const nextMap = new Map(prevMap);
        appwriteProducts.forEach((p) => {
          const rawSku = (p.sku && p.sku !== '-' && p.sku !== 'undefined') ? p.sku : p.$id;
          const primaryKey = p.$id || normSku(rawSku);
          const itemStock = Number(p.stock) || 0;
          if (primaryKey) nextMap.set(primaryKey, itemStock);
          if (p.sku && p.sku !== '-') nextMap.set(normSku(p.sku), itemStock);
        });
        return nextMap;
      });
    } catch (e) {
      console.error('Error refrescando stock y precios Appwrite:', e);
    }
  }, []);

  useEffect(() => {
    if (!sede) return;
    // Sincronizar cambios de catálogo entre terminales cada 30 minutos, solo con la pestaña visible.
    // La primera carga después de actualizar la caché recupera el catálogo completo una vez;
    // las siguientes usan la sincronización incremental por updatedAt.
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      triggerFullCatalogRefresh();
    }, POS_PRODUCTS_CACHE_TTL_MS);
    return () => clearInterval(intervalId);
  }, [sede, triggerFullCatalogRefresh]);

  // ─── Auto-anulación de pre-ventas expiradas (modo jefe cobra) ───────────────
  useEffect(() => {
    if (!sede || modoVentaPOS !== 'jefe_cobra') return;
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      // 🔒 Solo consultar al servidor si hay pre-ventas registradas para anular
      if (preVentas.length === 0) return;
      fetch('/api/pos/auto-anular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ timeoutMin: preventaTimeoutMin }),
      })
        .then((r) => r.json().catch(() => null))
        .then((json) => {
          if (json?.ok && json.anuladas > 0) {
            console.log(`[auto-anular] ${json.anuladas} pre-venta(s) anulada(s) por timeout`);
            triggerFullCatalogRefresh();
          }
        })
        .catch(() => {});
    }, 180_000); // cada 3 min (antes 60s)
    return () => clearInterval(intervalId);
  }, [sede, modoVentaPOS, preventaTimeoutMin, preVentas.length, triggerFullCatalogRefresh]);

  // ─── Load & listen active caja session (unificado en un único listener para ahorrar lecturas) ───
  useEffect(() => {
    if (!sede) return
    setCajaLoaded(false)
    setSesionCaja(null)
    setCajaGastos([])

    const cacheKey = `yaxsel_pos_caja_session_${sede}_${posUser?.id || 'default'}`
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.estado === 'abierta') {
          setSesionCaja(parsed)
          setCajaGastos(parsed.gastosItems || [])
        }
      }
    } catch {}

    if (!db || !posUser || isVendedora) {
      setCajaLoaded(true)
      return
    }

    let isCancelled = false
    let sessionUnsub: (() => void) | null = null
    let listeningSessionId = ''
    const owner = String(posUser.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
    const pointerId = `active_${sede}_${owner}`

    const stopSessionListener = () => {
      sessionUnsub?.()
      sessionUnsub = null
      listeningSessionId = ''
    }

    const applySessionData = (data: any, fallbackId: string, serverConfirmed: boolean, pointerData: any = {}) => {
      if (isCancelled) return
      const sessionId = String(data.sessionId || data.$id || fallbackId)
      if (data.estado !== 'abierta') {
        setSesionCaja(null)
        setCajaGastos([])
        try { localStorage.removeItem(cacheKey) } catch {}
        const isClosedToday = isSessionFromToday(data) || isSessionFromToday(pointerData)
        if (isClosedToday) {
          setCajaCerradaPorCajera(true)
          if (sessionId) setLastClosedSessionId(sessionId)
          setShowApertura(false)
        } else {
          setCajaCerradaPorCajera(false)
          setLastClosedSessionId('')
        }
        setCajaLoaded(true)
        return
      }

      let gastosItems = Array.isArray(data.gastosItems) ? data.gastosItems : []
      if (!gastosItems.length) { try { gastosItems = JSON.parse(String(data.gastosItemsJson || '[]')) } catch {} }
      const next: SesionCaja = {
        id: sessionId, cajeroId: String(data.cajeroId || posUser.id),
        parentSessionId: String(data.parentSessionId || ''), aperturaObservacion: String(data.aperturaObservacion || ''),
        sede: String(data.sede || sede), cajeroNombre: String(data.cajeroNombre || posUser.nombre), estado: 'abierta',
        montoApertura: Number(data.montoApertura || 0), ventasCount: Number(data.ventasCount || 0),
        totalVentas: Number(data.totalVentas || 0), totalEfectivo: Number(data.totalEfectivo || 0),
        totalDebito: Number(data.totalDebito || 0), totalTransferencia: Number(data.totalTransferencia || 0),
        totalGastos: Number(data.totalGastos || 0), devolucionesPosTotal: Number(data.devolucionesPosTotal || 0),
        devolucionesPosEfectivo: Number(data.devolucionesPosEfectivo || 0),
        devolucionesPosItemsJson: String(data.devolucionesPosItemsJson || '[]'), gastosItems,
        aperturaAt: Number(data.aperturaAtTs || 0), aperturaAtTs: Number(data.aperturaAtTs || 0), fechaStr: String(data.fechaStr || ''),
      }
      setSesionCaja(next)
      setCajaGastos(gastosItems)
      setCajaCerradaPorCajera(false)
      if (serverConfirmed) {
        try { localStorage.setItem(cacheKey, JSON.stringify(next)) } catch {}
      }
      setShowApertura(false)
      setCajaLoaded(true)
    }

    const watchSession = (sessionId: string, pointerData: any = {}) => {
      if (!sessionId || sessionId === pointerId || listeningSessionId === sessionId) return
      stopSessionListener()
      listeningSessionId = sessionId
      sessionUnsub = onSnapshot(
        doc(db, 'caja_sesiones', sessionId),
        /* metadata listener disabled to avoid double triggers on local writes */
        (sessionSnap: any) => {
          if (isCancelled) return
          if (!sessionSnap.exists()) {
            setSesionCaja(null)
            setCajaGastos([])
            setCajaLoaded(true)
            return
          }
          applySessionData(
            { $id: sessionSnap.id, ...sessionSnap.data() },
            sessionSnap.id,
            !sessionSnap.metadata.fromCache,
            pointerData,
          )
        },
        (error: any) => {
          console.error('Error escuchando sesión de caja:', error)
          if (!isCancelled) setCajaLoaded(true)
        },
      )
    }

    const unsub = onSnapshot(
      doc(db, 'caja_sesiones', pointerId),
      async (pointerSnap: any) => {
        if (isCancelled) return
        try {
          if (!pointerSnap.exists()) {
            stopSessionListener()
            const fallbackActive = await getActiveCajaSesion(sede, posUser.id)
            if (isCancelled) return
            if (fallbackActive && fallbackActive.estado === 'abierta') {
              const sessionId = String(fallbackActive.$id || '')
              applySessionData(fallbackActive, sessionId, true)
              watchSession(sessionId)
            } else {
              setSesionCaja(null)
              setCajaGastos([])
              try { localStorage.removeItem(cacheKey) } catch {}
              const latest = await getCajaSesionActual(sede, posUser.id)
              if (!isCancelled) {
                const wasClosed = Boolean(latest?.estado === 'cerrada') && isSessionFromToday(latest)
                setCajaCerradaPorCajera(wasClosed)
                if (wasClosed && (latest as any)?.$id) {
                  setLastClosedSessionId(String((latest as any).$id))
                } else {
                  setLastClosedSessionId('')
                }
              }
            }
            return
          }

          const pointer = pointerSnap.data() || {}
          if (pointer.estado !== 'abierta') {
            stopSessionListener()
            setSesionCaja(null)
            setCajaGastos([])
            try { localStorage.removeItem(cacheKey) } catch {}

            let isClosedToday = isSessionFromToday(pointer)
            const targetId = String(pointer.sessionId || pointerSnap.id || '')

            if (!isClosedToday && targetId && targetId !== pointerSnap.id) {
              try {
                const sSnap = await getDoc(doc(db, 'caja_sesiones', targetId))
                if (sSnap.exists()) isClosedToday = isSessionFromToday(sSnap.data())
              } catch {}
            }

            if (isClosedToday) {
              setCajaCerradaPorCajera(true)
              if (targetId) setLastClosedSessionId(targetId)
              setShowApertura(false)
            } else {
              setCajaCerradaPorCajera(false)
              setLastClosedSessionId('')
            }
            return
          }

          const sessionId = String(pointer.sessionId || pointerSnap.id)
          if (sessionId !== pointerSnap.id) {
            watchSession(sessionId, pointer)
          } else {
            stopSessionListener()
            applySessionData({ $id: pointerSnap.id, ...pointer }, pointerSnap.id, !pointerSnap.metadata.fromCache)
          }
        } catch (err) {
          console.error('Error sincronizando sesión de caja:', err)
        } finally {
          if (!isCancelled) setCajaLoaded(true)
        }
      },
      () => {
        if (!isCancelled) setCajaLoaded(true)
      }
    )

    return () => {
      isCancelled = true
      unsub()
      stopSessionListener()
    }
  }, [sede, posUser?.id, isVendedora])

  // ─── Auto-open apertura when caja is closed ───────────────────────────────
  // Solo aparece al entrar a la página o F5 para cajeras autorizadas.
  // Los vendedores operan exclusivamente en preventa/mesón y nunca abren caja.
  useEffect(() => {
    if (!cajaLoaded) return
    if (!configCajaPermisoLoaded) return
    if (!posUser) return
    if (isVendedora || isSellerCargo(posUser.cargo) || (!isCajera && !permiteGestionarCaja)) {
      setShowApertura(false)
      return
    }
    if (sesionCaja) { setShowApertura(false); return }
    if (isCajera && cajaCerradaPorCajera) { setShowApertura(false); return }
    // Si ya cerró el modal con X, no reabrir automáticamente
    if (aperturaDismissed) return
    setShowApertura(true)
  }, [cajaLoaded, configCajaPermisoLoaded, sesionCaja, posUser, aperturaDismissed, isCajera, isVendedora, cajaCerradaPorCajera, permiteGestionarCaja])

  // ─── Focus search on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 300)
    return () => clearTimeout(t)
  }, [])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (completedSaleModalRef.current && (e.key === 'Escape' || e.key === 'Enter')) {
        e.preventDefault()
        closeCompletedSaleModal()
        return
      }
      if (e.key === 'F1') {
        e.preventDefault()
        if (!e.repeat && !completedSaleModalRef.current) chargeButtonRef.current?.click()
        return
      }
      if (e.key === 'Escape') {
        setCompletedSaleModal(prev => { if (prev) return null; return prev })
        // Cerrar apertura: si hay sesión de caja, solo cancelar. Si no hay, marcar dismissed.
        setShowApertura(prev => {
          if (!prev) return prev
          if (sesionCajaRef.current) return false
          setAperturaDismissed(true)
          return false
        })
        setShowCierre(prev => { if (prev) return false; return prev })
        setSearchTerm('')
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeCompletedSaleModal])

  // ─── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setFullscreen(false)
    }
  }

  // ─── Stock efectivo = Firestore stock − carrito local ─────────────────────
  // Descuenta tanto por SKU como por $id y normSku para que las tarjetas del POS reflejen el carrito al instante.
  const effectiveStockMap = useMemo(() => {
    const map = new Map(stockMap)
    cart.forEach(item => {
      const nSku = normSku(item.sku)
      const prodDoc = products.get(item.sku) || (nSku ? products.get(nSku) : undefined)
      const keys = new Set<string>([item.sku])
      if (nSku) keys.add(nSku)
      if (prodDoc?.$id) keys.add(prodDoc.$id)
      keys.forEach(k => {
        const raw = map.get(k)
        if (raw !== undefined) map.set(k, Math.max(0, raw - item.cantidad))
      })
    })
    return map
  }, [stockMap, cart, products, normSku])

  // Helper para normalizar texto de búsqueda (insensible a tildes, mayúsculas y espacios múltiples)
  const normText = useCallback((s: unknown): string => {
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  // ─── Search & filter products ──────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const cleanSearch = normText(searchTerm);
    const tokens = cleanSearch.split(' ').filter(Boolean);

    // No mostrar productos si no hay búsqueda ni categoría seleccionada
    if (tokens.length === 0 && !selectedCategory) return [];

    const results: (ProductDoc & { stock: number })[] = [];
    const seenIds = new Set<string>();

    products.forEach((p) => {
      if (!p) return;
      if (p.is_draft || p.status === 'draft' || (Number(p.precio_detalle || 0) <= 0 && Number(p.precio_mayorista || 0) <= 0)) return;
      const uid = p.$id || p.sku;
      if (seenIds.has(uid)) return;

      // Filtro por categoría (siempre activo cuando hay una seleccionada)
      if (selectedCategory && resolveCategory(p.category) !== selectedCategory) return;

      // Si no hay búsqueda, mostrar todos los de la categoría seleccionada
      if (tokens.length === 0) {
        seenIds.add(uid);
        const stockKey = p.$id || p.sku;
        const stock = effectiveStockMap.has(stockKey)
          ? (effectiveStockMap.get(stockKey) ?? 0)
          : (stockMap.get(stockKey) ?? 0);
        if (!hideNoStock || stock > 0) {
          results.push({ ...p, stock });
        }
        return;
      }

      const nombreNorm = normText(p.nombre);
      const skuNorm = normText(p.sku);
      const barcodeNorm = normText(p.codigo_barra);
      const fullText = `${nombreNorm} ${skuNorm} ${barcodeNorm}`;

      const matches = tokens.every((token) => fullText.includes(token));

      if (matches) {
        seenIds.add(uid);
        const stockKey = p.$id || p.sku;
        const stock = effectiveStockMap.has(stockKey)
          ? (effectiveStockMap.get(stockKey) ?? 0)
          : (effectiveStockMap.get(p.sku) ?? (stockMap.get(stockKey) ?? (stockMap.get(p.sku) ?? 0)));
        if (hideNoStock && stock <= 0) return;
        results.push({ ...p, stock });
      }
    });

    return results
      .filter(p => !searchAddedSkus.has(p.$id || p.sku) && !searchAddedSkus.has(p.sku))
      .sort((a, b) => {
        const aExact = normText(a.sku) === cleanSearch || normText(a.codigo_barra) === cleanSearch ? -1 : 0;
        const bExact = normText(b.sku) === cleanSearch || normText(b.codigo_barra) === cleanSearch ? -1 : 0;
        if (aExact !== bExact) return aExact - bExact;
        return b.stock - a.stock;
      })
      .slice(0, selectedCategory && !searchTerm ? 200 : 50);
  }, [searchTerm, searchAddedSkus, products, effectiveStockMap, stockMap, hideNoStock, normText, selectedCategory, resolveCategory]);

  // ─── Cart helpers ──────────────────────────────────────────────────────────
  const getPriceOptions = useCallback((p: ProductDoc) => {
    const getCustomLabel = (campo: string, defaultName: string) => {
      if (campo === 'precio_mayorista') {
        return p.label_p2?.trim() || defaultName;
      }
      if (campo === 'precio_segundo' || campo === 'precio_region') {
        return p.label_p3?.trim() || defaultName;
      }
      if (campo === 'precio_cuarto') {
        return p.label_p4?.trim() || defaultName;
      }
      if (campo === 'precio_5') return p.label_p5?.trim() || defaultName;
      if (campo === 'precio_6') return p.label_p6?.trim() || defaultName;
      if (campo === 'precio_7') return p.label_p7?.trim() || defaultName;
      if (campo === 'precio_8') return p.label_p8?.trim() || defaultName;
      if (campo === 'precio_9') return p.label_p9?.trim() || defaultName;
      if (campo === 'precio_10') return p.label_p10?.trim() || defaultName;
      return defaultName;
    };

    const active = listasActivas
      .map((l) => {
        const value = l.campo === 'precio_detalle'
          ? Number(p.precio_detalle || 0)
          : l.campo === 'precio_mayorista'
            ? Number(p.precio_mayorista || 0)
            : l.campo === 'precio_segundo' || l.campo === 'precio_region'
              ? Number(p.precio_segundo || p.precio_region || 0)
              : l.campo === 'precio_cuarto'
                ? Number(p.precio_cuarto || 0)
                : Number((p as any)[l.campo] || 0)
        if (value <= 0) return null
        return {
          field: l.campo,
          label: getCustomLabel(l.campo, l.nombre),
          value,
        }
      })
      .filter((x): x is { field: string; label: string; value: number } => !!x)

    if (active.length > 0) return active

    const fallback = [
      { field: 'precio_detalle', label: nombrePorCampo('precio_detalle'), value: Number(p.precio_detalle || 0) },
      { field: 'precio_mayorista', label: getCustomLabel('precio_mayorista', nombrePorCampo('precio_mayorista')), value: Number(p.precio_mayorista || 0) },
      { field: 'precio_segundo', label: getCustomLabel('precio_segundo', nombrePorCampo('precio_segundo')), value: Number(p.precio_segundo || p.precio_region || 0) },
      { field: 'precio_cuarto', label: getCustomLabel('precio_cuarto', nombrePorCampo('precio_cuarto')), value: Number(p.precio_cuarto || 0) },
      { field: 'precio_5', label: getCustomLabel('precio_5', nombrePorCampo('precio_5')), value: Number(p.precio_5 || 0) },
      { field: 'precio_6', label: getCustomLabel('precio_6', nombrePorCampo('precio_6')), value: Number(p.precio_6 || 0) },
      { field: 'precio_7', label: getCustomLabel('precio_7', nombrePorCampo('precio_7')), value: Number(p.precio_7 || 0) },
      { field: 'precio_8', label: getCustomLabel('precio_8', nombrePorCampo('precio_8')), value: Number(p.precio_8 || 0) },
      { field: 'precio_9', label: getCustomLabel('precio_9', nombrePorCampo('precio_9')), value: Number(p.precio_9 || 0) },
      { field: 'precio_10', label: getCustomLabel('precio_10', nombrePorCampo('precio_10')), value: Number(p.precio_10 || 0) },
    ].filter(x => x.value > 0)

    return fallback
  }, [listasActivas, nombrePorCampo])

  const getDefaultPriceOption = useCallback((p: ProductDoc) => {
    const options = getPriceOptions(p)
    if (options.length === 0) return null
    return options.find((o: any) => o.field === 'precio_detalle')
      || options.find((o: any) => o.field === 'precio_mayorista')
      || options.find((o: any) => o.field === 'precio_segundo')
      || options.find((o: any) => o.field === 'precio_cuarto')
      || options[0]
  }, [getPriceOptions])

  const getPrice = (p: ProductDoc, field?: string) => {
    if (field === 'precio_detalle') return Number(p.precio_detalle || 0)
    if (field === 'precio_mayorista') return Number(p.precio_mayorista || 0)
    if (field === 'precio_segundo') return Number(p.precio_segundo || p.precio_region || 0)
    if (field === 'precio_cuarto') return Number(p.precio_cuarto || 0)
    if (field === 'precio_5') return Number(p.precio_5 || 0)
    if (field === 'precio_6') return Number(p.precio_6 || 0)
    if (field === 'precio_7') return Number(p.precio_7 || 0)
    if (field === 'precio_8') return Number(p.precio_8 || 0)
    if (field === 'precio_9') return Number(p.precio_9 || 0)
    if (field === 'precio_10') return Number(p.precio_10 || 0)
    return getDefaultPriceOption(p)?.value || 0
  }

  const getRealProductStock = (skuVal: string, prodId?: string, fallback = 0): number => {
    if (prodId && stockMap.has(prodId)) return stockMap.get(prodId)!
    const nSku = normSku(skuVal)
    if (nSku && stockMap.has(nSku)) return stockMap.get(nSku)!
    if (skuVal && stockMap.has(skuVal)) return stockMap.get(skuVal)!
    return fallback
  }

  // Cantidad retenida del mismo producto en las OTRAS pestañas de clientes abiertas simultáneamente
  const getReservedInOtherCustomerTabs = (skuVal: string, prodId?: string): number => {
    const nSku = normSku(skuVal)
    let reserved = 0
    for (const tab of customerTabs) {
      if (tab.id === activeCustomerTabId) continue
      for (const item of (tab.cart || [])) {
        if (normSku(item.sku) === nSku || (prodId && item.productId === prodId)) {
          reserved += Number(item.cantidad) || 0
        }
      }
    }
    return reserved
  }

  const addToCart = (
    p: ProductDoc & { stock?: number },
    selectedPriceField?: string,
    forceAdd = false,
    quantityToAdd = 1,
  ) => {
    const qtyToAdd = Math.max(1, Math.floor(quantityToAdd || 1))
    const priceOption = selectedPriceField
      ? getPriceOptions(p).find((o: any) => o.field === selectedPriceField) || getDefaultPriceOption(p)
      : getDefaultPriceOption(p)
    const precio = priceOption?.value || 0
    if (p.is_draft || p.status === 'draft' || precio <= 0) {
      if (isNivelAlto) {
        openBasicProductEditor(p)
        showToast(`⚡ ${p.sku} sin precio en lista — aplica un precio de emergencia o edita el producto`, 'info')
      } else {
        showToast(`⚠️ ${p.sku} es un BORRADOR sin precio asignado (requiere Nivel Alto)`, 'err')
      }
      return
    }
    const stockDisp = getRealProductStock(p.sku, p.$id, p.stock ?? (effectiveStockMap.get(p.sku) ?? 0));
    const totalStockForSku = stockDisp;
    // Sumar todas las líneas del mismo producto en el carrito actual + otras pestañas de clientes abiertas
    const pNormSku = normSku(p.sku)
    const inCurrentCart = cart
      .filter(c => normSku(c.sku) === pNormSku || (p.$id && c.productId === p.$id))
      .reduce((sum, c) => sum + c.cantidad, 0)
    const inOtherTabs = getReservedInOtherCustomerTabs(p.sku, p.$id)
    const totalQtyInCartForProduct = inCurrentCart + inOtherTabs

    // Verificar stock antes de agregar. Si no hay stock o se supera, pedir confirmación.
    if (!forceAdd) {
      if (totalStockForSku <= 0) {
        const webRes = getWebReservation(p);
        setPendingStockAdd({
          product: p,
          priceField: selectedPriceField,
          requestedQty: totalQtyInCartForProduct + qtyToAdd,
          availableStock: Math.max(0, totalStockForSku),
          stockDebt: Math.max(0, totalQtyInCartForProduct + qtyToAdd - totalStockForSku),
          webReservation: webRes,
          quantityToAdd: qtyToAdd,
        })
        return
      }
      if (totalQtyInCartForProduct + qtyToAdd > totalStockForSku && totalStockForSku > 0) {
        const webRes = getWebReservation(p);
        setPendingStockAdd({
          product: p,
          priceField: selectedPriceField,
          requestedQty: totalQtyInCartForProduct + qtyToAdd,
          availableStock: totalStockForSku,
          stockDebt: Math.max(0, totalQtyInCartForProduct + qtyToAdd - totalStockForSku),
          webReservation: webRes,
          quantityToAdd: qtyToAdd,
        })
        return
      }
    }
    setCart(prev => {
      const existing = prev.find(c => c.sku === p.sku && (c.priceField || '') === (priceOption?.field || ''))
      const prevTotalForProduct = prev
        .filter(c => normSku(c.sku) === pNormSku || (p.$id && c.productId === p.$id))
        .reduce((sum, c) => sum + c.cantidad, 0) + inOtherTabs
      const exceedsStock = (prevTotalForProduct + qtyToAdd) > totalStockForSku

      if (existing) {
        if (prevTotalForProduct >= totalStockForSku && totalStockForSku > 0) {
          showToast(`⚠️ ${p.sku}: ${prevTotalForProduct + qtyToAdd} uds superan el stock (${totalStockForSku}) — quedará pendiente`, 'info');
        } else if (totalStockForSku <= 0) {
          showToast(`⚠️ ${p.sku} sin stock — venta pendiente`, 'info');
        }
        const nextQty = existing.cantidad + qtyToAdd
        return prev.map(c => c.sku === p.sku && (c.priceField || '') === (priceOption?.field || '') ? {
          ...c,
          cantidad: nextQty,
          stockDisponible: totalStockForSku,
          stockPendiente: c.stockPendiente || forceAdd || exceedsStock,
          boxCode: c.boxCode || p.boxCode || '',
          subtotal: nextQty * c.precioUnitario * (1 - c.descuentoPct / 100),
        } : c)
      }
      if (stockDisp <= 0 || exceedsStock) {
        showToast(`⚠️ ${p.sku} sin stock suficiente — venta pendiente`, 'info')
      }
      return [...prev, {
        productId: p.$id,
        sku: p.sku,
        nombre: p.nombre,
        cantidad: qtyToAdd,
        precioUnitario: precio,
        priceField: priceOption?.field,
        priceLabel: priceOption?.label,
        costoUnitario: p.costo_uni,
        descuentoPct: 0,
        subtotal: qtyToAdd * precio,
        stockDisponible: totalStockForSku,
        imageUrl: p.imageUrl || '',
        stockPendiente: forceAdd || (stockDisp <= 0) || exceedsStock,
        packageQty: p.packageQty || '',
        boxCode: p.boxCode || '',
      }]
    })

    // Show "added to cart" notification on mobile
    setCartAddedItem({ nombre: p.nombre, precio })
    setTimeout(() => setCartAddedItem(null), 2000)

    // Marcar este SKU como "ya agregado" en la búsqueda actual.
    // Esto lo saca de la lista visible sin limpiar el buscador,
    // para que la cajera pueda seguir eligiendo los demás resultados.
    if (searchTerm) {
      setSearchAddedSkus(prev => {
        const next = new Set(prev)
        next.add(p.$id || p.sku)
        next.add(p.sku)
        return next
      })
    }

    searchRef.current?.focus()
  }

  // ─── Modo Auto (auto-abrir modal de cantidad o agregar directo cuando la búsqueda reduzca a exactamente 1 tarjeta) ───
  useEffect(() => {
    if (!autoMode) return
    const term = searchTerm.trim()
    if (term.length < 2) return
    if (filteredProducts.length !== 1) return

    const targetProd = filteredProducts[0]
    const queryKey = `${term}__${targetProd.sku}`
    if (lastAutoAddedQueryRef.current === queryKey) return

    const timer = setTimeout(() => {
      if (filteredProducts.length === 1 && filteredProducts[0].sku === targetProd.sku) {
        lastAutoAddedQueryRef.current = queryKey
        if (askQtyMode) {
          openQuickQtyModal(targetProd, selectedPriceBySku[targetProd.sku], filteredProducts, 0)
        } else {
          addToCart(targetProd, selectedPriceBySku[targetProd.sku])
          showToast(`⚡ Agregado (Modo Auto): ${targetProd.nombre}`, 'ok')
          setSearchTerm('')
          setSearchAddedSkus(new Set())
          if (proMode) setProSearchOpen(false)
          searchRef.current?.focus()
        }
      }
    }, 280)

    return () => clearTimeout(timer)
  }, [autoMode, askQtyMode, searchTerm, filteredProducts, proMode, selectedPriceBySku])

  const updateCartQty = (sku: string, priceField: string | undefined, delta: number) => {
    setCart(prev => {
      const targetLine = prev.find(c => c.sku === sku && (c.priceField || '') === (priceField || ''))
      if (!targetLine) return prev
      const cNorm = normSku(sku)
      const otherLinesQty = prev
        .filter(c => (normSku(c.sku) === cNorm || (targetLine.productId && c.productId === targetLine.productId)) && !(c.sku === sku && (c.priceField || '') === (priceField || '')))
        .reduce((sum, c) => sum + c.cantidad, 0) + getReservedInOtherCustomerTabs(sku, targetLine.productId)
      const totalStock = getRealProductStock(sku, targetLine.productId, targetLine.stockDisponible)
      const newQty = Math.max(0, targetLine.cantidad + delta)
      const totalProductQty = otherLinesQty + newQty
      const exceedsStock = totalProductQty > totalStock
      if (delta > 0 && exceedsStock && totalStock > 0) {
        showToast(`⚠️ ${totalProductQty} uds superan stock (${totalStock}) — venta pendiente`, 'info')
      }
      return prev.map(c => {
        if (c.sku !== sku || (c.priceField || '') !== (priceField || '')) return c
        return {
          ...c,
          cantidad: newQty,
          stockDisponible: totalStock,
          stockPendiente: c.stockPendiente || (newQty > 0 && exceedsStock),
          subtotal: newQty * c.precioUnitario * (1 - c.descuentoPct / 100)
        }
      })
    })
  }

  const setCartQty = (sku: string, priceField: string | undefined, qty: number) => {
    const safeQty = Math.max(0, Math.floor(isNaN(qty) ? 0 : qty))
    setCart(prev => {
      const targetLine = prev.find(c => c.sku === sku && (c.priceField || '') === (priceField || ''))
      if (!targetLine) return prev
      const cNorm = normSku(sku)
      const otherLinesQty = prev
        .filter(c => (normSku(c.sku) === cNorm || (targetLine.productId && c.productId === targetLine.productId)) && !(c.sku === sku && (c.priceField || '') === (priceField || '')))
        .reduce((sum, c) => sum + c.cantidad, 0) + getReservedInOtherCustomerTabs(sku, targetLine.productId)
      const totalStock = getRealProductStock(sku, targetLine.productId, targetLine.stockDisponible)
      const totalProductQty = otherLinesQty + safeQty
      const exceedsStock = totalProductQty > totalStock
      if (exceedsStock && safeQty > 0) {
        showToast(`⚠️ ${totalProductQty} uds superan stock (${totalStock}) — venta pendiente`, 'info')
      }
      return prev.map(c => {
        if (c.sku !== sku || (c.priceField || '') !== (priceField || '')) return c
        return {
          ...c,
          cantidad: safeQty,
          stockDisponible: totalStock,
          stockPendiente: c.stockPendiente || (safeQty > 0 && exceedsStock),
          subtotal: safeQty * c.precioUnitario * (1 - c.descuentoPct / 100)
        }
      })
    })
  }

  const setCartDiscount = (sku: string, priceField: string | undefined, pct: number) => {
    const p = Math.max(0, Math.min(100, pct))
    setCart(prev => prev.map(c => {
      if (c.sku !== sku || (c.priceField || '') !== (priceField || '')) return c
      return { ...c, descuentoPct: p, subtotal: c.cantidad * c.precioUnitario * (1 - p / 100) }
    }))
  }

  const setCartPriceField = (sku: string, currentField: string | undefined, nextField: string) => {
    const useCurrentTierPrice = nextField.startsWith('__current__:')
    const resolvedNextField = useCurrentTierPrice ? nextField.slice('__current__:'.length) : nextField
    if ((currentField || '') === (resolvedNextField || '') && !useCurrentTierPrice) return
    const product = products.get(sku) || products.get(normSku(sku))
    if (!product) return
    const priceOption = getPriceOptions(product).find((o: any) => o.field === resolvedNextField)
    if (!priceOption) return
    setCart(prev => {
      const sourceLine = prev.find(c => c.sku === sku && (c.priceField || '') === (currentField || ''))
      if (!sourceLine) return prev
      const existingTarget = prev.find(c => c.sku === sku && (c.priceField || '') === (priceOption.field || '') && c !== sourceLine)
      if (existingTarget) {
        // Fusionar ambas líneas si ya existía el mismo SKU con el precio destino
        const mergedQty = existingTarget.cantidad + sourceLine.cantidad
        return prev
          .filter(c => c !== sourceLine)
          .map(c => c === existingTarget ? {
            ...c,
            cantidad: mergedQty,
            priceField: priceOption.field,
            priceLabel: priceOption.label,
            precioUnitario: priceOption.value,
            subtotal: mergedQty * priceOption.value * (1 - c.descuentoPct / 100),
          } : c)
      }
      return prev.map(c => {
        if (c !== sourceLine) return c
        return {
          ...c,
          priceField: priceOption.field,
          priceLabel: priceOption.label,
          precioUnitario: priceOption.value,
          subtotal: c.cantidad * priceOption.value * (1 - c.descuentoPct / 100),
        }
      })
    })
  }


  const removeFromCart = (sku: string, priceField?: string) => {
    setCart(prev => prev.filter(c => !(c.sku === sku && (c.priceField || '') === (priceField || ''))))
  }

  const restoreLastCart = () => {
    if (!lastSavedCart) return
    setCart(lastSavedCart.cart)
    setDescuentoGlobalPct(lastSavedCart.descuento || 0)
    setLastSavedCart(null)
    showToast('Carrito recuperado', 'ok')
  }

  // ─── Totals ────────────────────────────────────────────────────────────────
  const subtotalCart = useMemo(() => cart.reduce((sum, c) => sum + c.subtotal, 0), [cart])
  const descuentoGlobalMonto = useMemo(() => Math.round(subtotalCart * descuentoGlobalPct / 100), [subtotalCart, descuentoGlobalPct])
  const totalCart = useMemo(() => Math.round(subtotalCart - descuentoGlobalMonto), [subtotalCart, descuentoGlobalMonto])
  const totalItemsCount = useMemo(() => cart.reduce((s, c) => s + c.cantidad, 0), [cart])



  // Productos del carrito actual convertidos al modelo de etiquetas de precios PDF
  const cartProductsForLabels = useMemo<RecentPriceLabelProduct[]>(() => {
    const seenKeys = new Set<string>();
    const list: RecentPriceLabelProduct[] = [];

    for (const item of cart) {
      const rawSku = (item.sku || '').trim();
      const lookupKey = rawSku || item.productId || item.nombre;
      if (seenKeys.has(lookupKey)) continue;
      seenKeys.add(lookupKey);

      // Buscar el producto en el catálogo en memoria (por ID, SKU original o SKU normalizado)
      const product = (item.productId ? products.get(item.productId) : undefined)
        || (rawSku ? products.get(rawSku) : undefined)
        || (rawSku ? products.get(normSku(rawSku)) : undefined);

      const p1 = Number(product?.precio_detalle || item.precioUnitario || 0);
      const p2 = Number(product?.precio_mayorista || (item.priceField === 'precio_mayorista' ? item.precioUnitario : 0));
      const p3 = Number(product?.precio_segundo || product?.precio_region || (item.priceField === 'precio_segundo' ? item.precioUnitario : 0));

      list.push({
        sku: product?.sku || item.sku || '-',
        nombre: product?.nombre || item.nombre || 'Sin nombre',
        imageUrl: item.imageUrl || product?.imageUrl || null,
        codigo_barra: product?.codigo_barra || '',
        categoria: product?.category || '',
        subcategoria: product?.subcategory || '',
        proveedor: product?.supplier || '',
        cantidad_embalaje: product?.packageQty || item.packageQty || (item.embalajeQty ? String(item.embalajeQty) : ''),
        precio_venta_1: p1,
        precio_venta_2: p2,
        precio_venta_3: p3,
        min_qty_2: product?.min_qty_2,
        min_qty_3: product?.min_qty_3,
        label_p2: product?.label_p2 || '',
        label_p3: product?.label_p3 || '',
        stock: product?.stock ?? item.stockDisponible,
      });
    }

    return list;
  }, [cart, products]);

  // Payment
  const totalPagado = useMemo(() => pagos.reduce((s, p) => s + p.monto, 0), [pagos])
  const restante = useMemo(() => Math.max(0, totalCart - totalPagado), [totalCart, totalPagado])
  const vuelto = useMemo(() => {
    if (splitMode) {
      return Math.max(0, totalPagado - totalCart)
    }
    const efectivoEntry = Number(montoRecibido) || 0
    return Math.max(0, efectivoEntry - totalCart)
  }, [montoRecibido, totalCart, splitMode, totalPagado])

  // ─── Caja operations ──────────────────────────────────────────────────────
  const handleAbrirCaja = async () => {
    if (!sede || abriendoCaja) return;
    if (!posUser || !matchBranchSlug(posUser.sede, sede) || (authLoggedIn && (!matchBranchSlug(branchAccess.sede, sede) || branchAccess.status !== 'allowed'))) {
      showToast('Tu cuenta no tiene acceso a esta sucursal.', 'err')
      return
    }
    if (isVendedora || isSellerCargo(posUser?.cargo) || (!isCajera && !permiteGestionarCaja)) {
      showToast('Los vendedores operan en modo preventa y no abren caja.', 'err')
      setShowApertura(false)
      return
    }
    if (!configCajaPermisoLoaded) { showToast('Cargando permisos de caja. Inténtalo en un momento.', 'err'); return }
    if (isCajera && cajaCerradaPorCajera) {
      if (!isNivelAlto) {
        showToast('Tu caja fue cerrada (corte realizado). Pide a una cajera o administradora con nivel Alto que la reanude.', 'err')
      } else {
        showToast('Esta caja tiene un corte previo. Usa "Reanudar mi caja" para restaurar tus ventas y gastos intactos.', 'info')
      }
      setShowApertura(false)
      return
    }
    const nombre = posUser ? posUser.nombre : (cajeroNombre.trim() || 'Cajera');
    const monto = Number(montoApertura) || 0;
    const cajaOwnerId = String(posUser?.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
    const pointerId = `active_${sede}_${cajaOwnerId}`

    setAbriendoCaja(true)
    try {
      // Protección de idempotencia: si ya tiene una sesión abierta activa, no duplicar
      if (db) {
        try {
          const { getDoc, doc } = await import('firebase/firestore')
          const pointerSnap = await getDoc(doc(db, 'caja_sesiones', pointerId))
          if (pointerSnap.exists() && pointerSnap.data()?.estado === 'abierta') {
            setShowApertura(false)
            setCajeroNombre('')
            setMontoApertura('')
            showToast(`Caja ya está abierta para ${nombre}`, 'ok')
            return
          }
        } catch {}
      }

      const cajaId = `caja_${String(sede).replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const sessionData: SesionCaja = {
        id: cajaId,
        cajeroId: posUser?.id || cajaOwnerId,
        sede,
        cajeroNombre: nombre,
        estado: 'abierta',
        montoApertura: monto,
        ventasCount: 0,
        totalVentas: 0,
        totalEfectivo: 0,
        totalDebito: 0,
        totalTransferencia: 0,
        totalGastos: 0,
        gastosItems: [],
        aperturaAt: Date.now(),
        aperturaAtTs: Date.now(),
        fechaStr: todayStr(),
      };

      await createCajaSesion(sessionData, cajaId)
      await setActiveCajaSesion(sede, sessionData, posUser?.id);

      localStorage.setItem(`yaxsel_pos_caja_session_${sede}_${posUser?.id || 'default'}`, JSON.stringify(sessionData));
      setSesionCaja(sessionData);
      setCajaCerradaPorCajera(false)
      setCajaGastos([]);
      showToast(`Caja abierta por ${nombre} (${fmtCLP(monto)})`, 'ok');
      setShowApertura(false);
      setCajeroNombre('');
      setMontoApertura('');
    } catch (e: any) {
      showToast(`Error abriendo caja: ${e?.message || String(e)}`, 'err');
    } finally {
      setAbriendoCaja(false)
    }
  };

  const handleReanudarCaja = async (targetSessionId?: string, targetNombre?: string, customToken?: string) => {
    const sId = targetSessionId || lastClosedSessionId
    const cName = targetNombre || posUser?.nombre || 'esta cajera'
    if (!sId) {
      showToast('No se encontró el identificador de la sesión a reanudar. Puedes reanudarla desde Cerrar/Reabrir cajas en el panel.', 'err')
      return
    }
    if (reanudandoCaja) return
    const confirmed = window.confirm(
      `¿Deseas reanudar la caja de ${cName}?\n\n• El corte anterior quedará ANULADO.\n• Se restaurarán todas las ventas, gastos y monto de apertura.\n• La caja volverá al estado ABIERTA como si nunca se hubiera cerrado.`
    )
    if (!confirmed) return

    setReanudandoCaja(true)
    try {
      const { auth } = await import('@/lib/firebase')
      const token = customToken || (await auth.currentUser?.getIdToken())
      if (!token) throw new Error('No se pudo autenticar. Inicia sesión nuevamente.')
      const res = await fetch('/api/pos/cash-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'reopen',
          sede,
          sessionId: sId,
          observacion: `Reanudación desde terminal POS por ${posUser?.nombre || 'usuario'}`,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'No se pudo reanudar la caja')
      }
      showToast(`¡Caja de ${cName} reanudada con éxito! Ventas y gastos recuperados.`, 'ok')
      setCajaCerradaPorCajera(false)
      setShowReanudarOtraCaja(false)
      setShowAuthModalAlto(false)
    } catch (err: any) {
      console.error('[POS] Error reanudando caja:', err)
      showToast(err?.message || 'Error reanudando la caja', 'err')
    } finally {
      setReanudandoCaja(false)
    }
  }

  const openModalReanudarOtras = async () => {
    setShowReanudarOtraCaja(true)
    setLoadingClosedSessions(true)
    try {
      const { auth } = await import('@/lib/firebase')
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('No autenticado')
      const res = await fetch(`/api/pos/cash-management?sede=${encodeURIComponent(sede)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await res.json()
      if (data?.ok && Array.isArray(data.sessions)) {
        const closed = data.sessions.filter((s: any) => {
          const isClosed = s.estado === 'cerrada' || s.estado === 'cierre_pendiente' || (s.estado !== 'abierta' && s.montoCierre !== undefined)
          return isClosed && isSessionFromToday(s)
        })
        setClosedSessionsList(closed)
      }
    } catch (err) {
      console.error('[POS] Error cargando sesiones cerradas:', err)
      showToast('No se pudieron consultar las cajas cerradas', 'err')
    } finally {
      setLoadingClosedSessions(false)
    }
  }

  const handleAuthorizeWithAlto = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthorizingAlto(true)
    setAuthErrorAlto('')
    try {
      const { auth } = await import('@/lib/firebase')
      const { signInWithEmailAndPassword } = await import('firebase/auth')
      const credential = await signInWithEmailAndPassword(auth, authEmailAlto.trim(), authPassAlto)
      const token = await credential.user.getIdToken()
      await handleReanudarCaja(lastClosedSessionId, posUser?.nombre, token)
      setAuthEmailAlto('')
      setAuthPassAlto('')
      setShowAuthModalAlto(false)
    } catch (err: any) {
      console.error('Error al autorizar con usuario Alto:', err)
      setAuthErrorAlto(err?.message || 'Credenciales inválidas o sin autorización.')
    } finally {
      setAuthorizingAlto(false)
    }
  }

  const openNewCajaGasto = () => {
    setEditingGastoId(null)
    setGastoMonto('')
    setGastoDetalle('')
    setGastoTipo('')
    setGastoCategoria('')
    setShowGastoForm(true)
  }

  const openEditCajaGasto = (gasto: CajaGasto) => {
    setEditingGastoId(gasto.id)
    setGastoMonto(String(gasto.monto))
    setGastoDetalle(gasto.detalle)
    setGastoTipo(gasto.tipo || '')
    setGastoCategoria(gasto.categoria || '')
    setShowGastoForm(true)
  }

  const handleSaveCajaGasto = async () => {
    if (!sesionCaja || gastoSaving) return
    const monto = Math.round(Number(gastoMonto) || 0)
    const detalle = gastoDetalle.trim()
    if (monto <= 0) {
      showToast('Ingresa un monto válido', 'err')
      return
    }
    if (!detalle) {
      showToast('Indica para qué se retiró el dinero', 'err')
      return
    }
    if (!ERP_GASTO_TIPOS.some(tipo => tipo === gastoTipo) || !ERP_GASTO_CATEGORIAS.some(categoria => categoria === gastoCategoria)) {
      showToast('Selecciona el tipo y la categoría del gasto', 'err')
      return
    }
    setGastoSaving(true)
    const gasto: CajaGasto = editingGastoId
      ? { ...cajaGastos.find(item => item.id === editingGastoId)!, monto, detalle, tipo: gastoTipo, categoria: gastoCategoria }
      : {
          id: `gasto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          monto,
          detalle,
          tipo: gastoTipo,
          categoria: gastoCategoria,
          usuario: posUser?.nombre || sesionCaja.cajeroNombre,
          createdAtTs: Date.now(),
        }
    const next = editingGastoId
      ? cajaGastos.map(item => item.id === editingGastoId ? gasto : item)
      : [...cajaGastos, gasto]
    const totalGastos = next.reduce((sum, item) => sum + item.monto, 0)
    try {
      await updateCajaSesion(sesionCaja.id, { gastosItems: next, totalGastos })
      const updatedSession = { ...sesionCaja, gastosItems: next, totalGastos }
      setCajaGastos(next)
      setSesionCaja(updatedSession)
      localStorage.setItem(`yaxsel_pos_caja_session_${sede}_${posUser?.id || 'default'}`, JSON.stringify(updatedSession))
      setShowGastoForm(false)
      setGastoMonto('')
      setGastoDetalle('')
      setGastoTipo('Operacional')
      setGastoCategoria('Suministros')
      setEditingGastoId(null)
      showToast(editingGastoId ? 'Gasto actualizado' : 'Retiro registrado en caja', 'ok')
    } catch (error: any) {
      showToast(`Error guardando gasto: ${error?.message || error}`, 'err')
    } finally {
      setGastoSaving(false)
    }
  }

  const handleDeleteCajaGasto = async () => {
    if (!sesionCaja || !deleteGastoTarget || gastoDeleting) return
    setGastoDeleting(true)
    const next = cajaGastos.filter(item => item.id !== deleteGastoTarget.id)
    const totalGastos = next.reduce((sum, item) => sum + Number(item.monto || 0), 0)
    try {
      await updateCajaSesion(sesionCaja.id, { gastosItems: next, totalGastos })
      const updatedSession = { ...sesionCaja, gastosItems: next, totalGastos }
      setCajaGastos(next)
      setSesionCaja(updatedSession)
      localStorage.setItem(`yaxsel_pos_caja_session_${sede}_${posUser?.id || 'default'}`, JSON.stringify(updatedSession))
      setDeleteGastoTarget(null)
      showToast('Salida de efectivo eliminada', 'ok')
    } catch (error: any) {
      showToast(`Error eliminando salida: ${error?.message || error}`, 'err')
    } finally {
      setGastoDeleting(false)
    }
  }

  const handleCerrarCaja = async () => {
    if (!db || !sesionCaja) return
    if (isCajera && !permiteGestionarCaja) { showToast('El cierre de esta caja debe hacerlo un administrador desde el ERP.', 'err'); return }
    const efectivoRealNum = Number(efectivoReal) || 0
    // Abrir ventana antes de llamadas async para evitar bloqueo de popup en navegadores
    const printWindow = openBlankReceiptWindow()
    const gastosItems: Array<{ tipo: 'gasto' | 'anulacion' | 'devolucion'; tipoGasto: string; categoria: string; monto: number; detalle: string; boletaNumero: string; usuario?: string; createdAtTs?: number; posGastoId?: string }> = [
      ...cajaGastos.map(it => ({ tipo: 'gasto' as const, tipoGasto: it.tipo || 'Operacional', categoria: it.categoria || 'Suministros', monto: it.monto, detalle: it.detalle, boletaNumero: '', usuario: it.usuario, createdAtTs: it.createdAtTs, posGastoId: it.id })),
      ...itemsCierre.filter(it => it.tipo === 'gasto').map(it => ({ tipo: it.tipo, tipoGasto: 'Otros', categoria: 'Otros', monto: Number(it.monto) || 0, detalle: it.detalle, boletaNumero: it.boletaNumero, posGastoId: (it as any).posGastoId })),
    ]
    const anulacionesItems = itemsCierre.filter(it => it.tipo === 'anulacion').map(it => ({ tipo: it.tipo, monto: Number(it.monto) || 0, detalle: it.detalle, boletaNumero: it.boletaNumero }))
    const devolucionesItems = itemsCierre.filter(it => it.tipo === 'devolucion').map(it => ({ tipo: it.tipo, monto: Number(it.monto) || 0, detalle: it.detalle, boletaNumero: it.boletaNumero }))
    const totalGastos = gastosItems.reduce((s, it) => s + it.monto, 0)
    const totalAnulaciones = anulacionesItems.reduce((s, it) => s + it.monto, 0)
    const totalDevolucionesManuales = devolucionesItems.reduce((s, it) => s + it.monto, 0)
    const totalDevolucionesPos = Number(sesionCaja.devolucionesPosTotal || 0)
    const totalDevoluciones = totalDevolucionesManuales + totalDevolucionesPos
    const devolucionesPosItems = (() => { try { return JSON.parse(sesionCaja.devolucionesPosItemsJson || '[]') } catch { return [] } })()
    const todasDevolucionesItems = [...devolucionesItems, ...devolucionesPosItems.map((item: any) => ({ tipo: 'devolucion', monto: Number(item.total || 0), detalle: item.reason || 'Devolución POS', boletaNumero: item.boletaNumero || '', returnId: item.returnId }))]

    try {
      // Anular pre-ventas pendientes (no cobradas) de esta sesión de caja y devolver su stock reservado
      const preVentasPendientes = ventasHoy.filter((v: any) => v.estado === 'pre_venta' && v.sesionCajaId === sesionCaja.id)
      if (preVentasPendientes.length > 0) {
        await Promise.all(preVentasPendientes.map(async (pv: any) => {
          await updateVentaPos(pv.id, {
            estado: 'anulada',
            anuladaEn: Date.now(),
            anuladaPor: 'cierre_caja_auto',
            motivoAnulacion: 'Pre-venta no cobrada al cierre de caja',
          }).catch(() => {})
          if (pv.stockReservado && Array.isArray(pv.items) && pv.items.length > 0) {
            const restorePayload = pv.items
              .map((it: any) => ({
                id: it.productId || products.get(it.sku)?.$id || it.sku,
                sku: it.sku,
                nombre: it.nombre,
                cantidad: Number(it.cantidad) || 0,
              }))
              .filter((it: any) => it.id && it.cantidad > 0)
            if (restorePayload.length > 0) {
              await fetch('/api/pos/stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  mode: 'restore',
                  items: restorePayload,
                  ventaId: pv.id,
                  sede: pv.sede || sede,
                  boletaNumero: pv.boletaNumero,
                  cajeroNombre: posUser?.nombre || 'Cierre Caja',
                  motivo: 'Pre-venta no cobrada al cierre de caja',
                }),
              }).catch(() => {})
              patchErpProductsLocalCacheStock(restorePayload.map((r: any) => ({ id: r.id, sku: r.sku, delta: r.cantidad })))
            }
          }
        }))
      }
      const ventasCompletadas = ventasHoy.filter(v => v.estado === 'completada' && v.sesionCajaId === sesionCaja.id)

      const totalVueltos = ventasCompletadas.reduce((sum, v) => sum + (v.vuelto || 0), 0)
      const totalEfectivo = ventasCompletadas.reduce((sum, v) => sum + getSaleEfectivoNeto(v), 0)
      const totalDebito = ventasCompletadas.reduce((sum, v) => {
        const pgs = getSalePagos(v)
        return sum + pgs.filter(p => p.metodo === 'debito').reduce((s, p) => s + (Number(p.monto) || 0), 0)
      }, 0)
      const totalTransferencia = ventasCompletadas.reduce((sum, v) => {
        const pgs = getSalePagos(v)
        return sum + pgs.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + (Number(p.monto) || 0), 0)
      }, 0)
      const totalVentasOriginal = ventasCompletadas.reduce((sum, v) => sum + Number(v.total || 0), 0)
      const totalVentas = Math.max(0, totalVentasOriginal - totalDevolucionesPos)

      const efectivoTeoricoAntesGastos = totalEfectivo + (Number(sesionCaja.montoApertura) || 0)
      const devolucionesEfectivo = Number(sesionCaja.devolucionesPosEfectivo || 0) + totalDevolucionesManuales
      const efectivoTeorico = efectivoTeoricoAntesGastos - totalGastos - devolucionesEfectivo
      const diferencia = efectivoRealNum - efectivoTeorico

      const ahora = new Date()
      const fechaHoy = todayStr()
      const [yyyy, MM, dd] = fechaHoy.split('-')

      const corteId = `corte_${sesionCaja.id}`
      const corteData = {
        id: corteId,
        sesionCajaId: sesionCaja.id,
        sede: sede,
        cajeroNombre: sesionCaja.cajeroNombre,
        aperturaAt: sesionCaja.aperturaAt,
        cierreAt: serverTimestamp(),
        fechaStr: fechaHoy,
        fecha: fechaHoy,
        fechaCierreStr: ahora.toLocaleDateString('es-CL'),
        horaCierreStr: ahora.toLocaleTimeString('es-CL'),
        montoApertura: sesionCaja.montoApertura,
        ventasCount: ventasCompletadas.length,
        totalEfectivo,
        totalDebito,
        totalTransferencia,
        totalVentas,
        totalVueltos,
        efectivoTeorico,
        efectivoReal: efectivoRealNum,
        gastos: totalGastos,
        gastosItems,
        anulacionesItems,
        devolucionesItems: todasDevolucionesItems,
        totalAnulaciones,
        totalDevoluciones,
        diferencia,
        createdAt: serverTimestamp(),
      }

      await createCorteCaja(corteData, corteId)

      // Calcular ganancias por producto desde los items de las ventas (costoUnitario ya está guardado)
      const skuMap = new Map<string, { sku: string; nombre: string; cantidadVendida: number; ventasBrutas: number; costoNeto: number }>()
      for (const venta of ventasCompletadas) {
        for (const item of (venta.items || [])) {
          const sku = String(item.sku || '').trim().toUpperCase()
          if (!sku) continue
          const producto = products.get(String(item.sku || '')) || products.get(normSku(item.sku))
          const costoUnitario = Number(item.costoUnitario) > 0
            ? Number(item.costoUnitario)
            : Number(producto?.costo_uni) || 0
          const cur = skuMap.get(sku) || { sku, nombre: item.nombre || '', cantidadVendida: 0, ventasBrutas: 0, costoNeto: 0 }
          cur.cantidadVendida += item.cantidad || 0
          cur.ventasBrutas += item.subtotal || 0
          cur.costoNeto += Math.round(costoUnitario * (item.cantidad || 0))
          skuMap.set(sku, cur)
        }
      }
      for (const devolucion of devolucionesPosItems) {
        for (const item of (Array.isArray(devolucion.items) ? devolucion.items : [])) {
          const sku = String(item.sku || '').trim().toUpperCase()
          const current = skuMap.get(sku)
          if (!current) continue
          current.cantidadVendida = Math.max(0, current.cantidadVendida - Number(item.quantity || 0))
          current.ventasBrutas = Math.max(0, current.ventasBrutas - Number(item.amount || 0))
          if (item.restock) current.costoNeto = Math.max(0, current.costoNeto - Number(item.costUnitario || 0) * Number(item.quantity || 0))
        }
      }
      const topProducts = Array.from(skuMap.values())
        .map(p => ({ ...p, ventasNetas: p.ventasBrutas - p.costoNeto }))
        .sort((a, b) => b.ventasBrutas - a.ventasBrutas)

      const totalBruto = totalVentas

      // Sincronizar en cuadres_erp (colección principal del ERP)
      const fechaDocId = `${sede}__${fechaHoy}`
      const cuadreRef = doc(db!, 'cuadres_erp', fechaDocId)
      const reportRef = doc(db!, 'reports', sede as string, yyyy, MM, 'days', dd)
      const reportRefNew = doc(db!, 'sedes', sede as string, 'reports', fechaHoy)

      try {
        const cajeroKey = sesionCaja.cajeroNombre || ''
        const newGastos = gastosItems.map(g => ({
          monto: g.monto,
          tipo: g.tipoGasto,
          categoria: g.categoria,
          detalle: g.detalle || '',
          observacion: g.detalle || '',
          boletaNumero: g.boletaNumero || '',
          cajero: sesionCaja.cajeroNombre,
          sesionCajaId: sesionCaja.id,
          ...(g.posGastoId ? { posGastoId: g.posGastoId } : {}),
        }))
        const newAnuladas = anulacionesItems.map((a, index) => ({ ...a, sesionCajaId: sesionCaja.id, itemId: `${sesionCaja.id}:anulacion:${index}` }))
        const newDevoluciones = todasDevolucionesItems.map((d: any, index: number) => ({ ...d, sesionCajaId: sesionCaja.id, itemId: d.returnId || `${sesionCaja.id}:devolucion:${index}` }))
        const mergeExpenses = (previous: any[], incoming: any[]) => {
          const result = [...previous]
          const known = new Set(result.map(g => String(g?.posGastoId || g?.id || '')).filter(Boolean))
          for (const gasto of incoming) {
            const key = String(gasto?.posGastoId || gasto?.id || '')
            if (key && known.has(key)) continue
            if (key) known.add(key)
            result.push(gasto)
          }
          return result
        }
        const mergeItems = (previous: any[], incoming: any[]) => {
          const result = [...previous]
          const known = new Set(result.map(item => String(item?.itemId || item?.returnId || item?.id || '')).filter(Boolean))
          for (const item of incoming) {
            const key = String(item?.itemId || item?.returnId || item?.id || '')
            if (key && known.has(key)) continue
            if (key) known.add(key)
            result.push(item)
          }
          return result
        }
        const mergeProducts = (productsToMerge: any[]) => {
          const map = new Map<string, any>()
          for (const product of productsToMerge) {
            const sku = String(product?.sku || '').trim().toUpperCase()
            if (!sku) continue
            const current = map.get(sku) || { ...product, cantidadVendida: 0, ventasBrutas: 0, costoNeto: 0, ventasNetas: 0 }
            current.cantidadVendida += Number(product.cantidadVendida) || 0
            current.ventasBrutas += Number(product.ventasBrutas) || 0
            current.costoNeto += Number(product.costoNeto) || 0
            current.ventasNetas = current.ventasBrutas - current.costoNeto
            map.set(sku, current)
          }
          return Array.from(map.values()).sort((a, b) => b.ventasBrutas - a.ventasBrutas)
        }

        await runTransaction(db!, async (transaction) => {
          const snapshot = await transaction.get(cuadreRef)
          const prev: any = snapshot.exists() ? snapshot.data() : {}
          const previousCashiers: string[] = Array.isArray(prev.cajerosListos)
            ? prev.cajerosListos
            : (prev.cajeroNombre ? String(prev.cajeroNombre).split(',').map((name: string) => name.trim()).filter(Boolean) : [])
          const cajerosListosConsolidados = Array.from(new Set([...previousCashiers, cajeroKey].filter(Boolean)))
          const previousCashierRow = prev.montosPorCajera?.[cajeroKey] || {}
          const previousSessionIds: string[] = Array.isArray(previousCashierRow.sessionIds) ? previousCashierRow.sessionIds : []
          const sessionAlreadyIncluded = previousSessionIds.includes(sesionCaja.id)
          const sessionIds = sessionAlreadyIncluded ? previousSessionIds : [...previousSessionIds, sesionCaja.id]
          const added = (value: number) => sessionAlreadyIncluded ? 0 : (Number(value) || 0)
          const cashierExpenses = mergeExpenses(
            Array.isArray(previousCashierRow.gastos) ? previousCashierRow.gastos : [],
            sessionAlreadyIncluded ? [] : newGastos,
          )
          const cashierTopProducts = mergeProducts([
            ...(Array.isArray(previousCashierRow.topProducts) ? previousCashierRow.topProducts : []),
            ...(sessionAlreadyIncluded ? [] : topProducts),
          ])
          const montosPorCajera = {
            ...(prev.montosPorCajera || {}),
            [cajeroKey]: {
              ...previousCashierRow,
              efectivo: (Number(previousCashierRow.efectivo) || 0) + added(totalEfectivo),
              efectivoReal: (Number(previousCashierRow.efectivoReal) || 0) + added(efectivoRealNum),
              debito: (Number(previousCashierRow.debito) || 0) + added(totalDebito),
              transferencia: (Number(previousCashierRow.transferencia) || 0) + added(totalTransferencia),
              totalBruto: (Number(previousCashierRow.totalBruto) || 0) + added(totalBruto),
              diferencia: (Number(previousCashierRow.diferencia) || 0) + added(diferencia),
              ventasCount: (Number(previousCashierRow.ventasCount) || 0) + added(ventasCompletadas.length),
              gastosTotales: cashierExpenses.reduce((sum: number, gasto: any) => sum + (Number(gasto?.monto) || 0), 0),
              gastos: cashierExpenses,
              topProducts: cashierTopProducts,
              sessionIds,
              fechaCierre: new Date().toISOString(),
            },
          }
          const cashierRows = Object.values(montosPorCajera)
          const mergedMontos = {
            efectivoSistema: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.efectivo) || 0), 0),
            efectivoReal: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.efectivoReal) || 0), 0),
            debitoSistema: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.debito) || 0), 0),
            debitoReal: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.debito) || 0), 0),
            transferencias: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.transferencia) || 0), 0),
          }
          const mergedGastos = mergeExpenses(Array.isArray(prev.gastos) ? prev.gastos : [], sessionAlreadyIncluded ? [] : newGastos)
          const mergedGastosTotales = mergedGastos.reduce((sum: number, gasto: any) => sum + (Number(gasto?.monto) || 0), 0)
          const mergedGastosMercaderia = sumarGastosMercaderia(mergedGastos)
          const mergedGastosQueAfectanGanancia = sumarGastosQueAfectanGanancia(mergedGastos)
          const mergedTotalBruto = cashierRows.reduce((sum: number, row: any) => sum + (Number(row.totalBruto) || 0), 0)
          const mergedTotalNeto = mergedTotalBruto - mergedGastosTotales
          const mergedDifTotal = cashierRows.reduce((sum: number, row: any) => sum + (Number(row.diferencia) || 0), 0)
          const mergedDifEf = mergedMontos.efectivoReal - mergedMontos.efectivoSistema
          // Rebuild the daily product aggregate from each cashier's own row.
          // Merging the old day aggregate with a new session can retain duplicated
          // products from legacy/imported closes even when the cashier totals are correct.
          const cashierRowsHaveProductDetails = cashierRows
            .filter((row: any) => Number(row.totalBruto) > 0)
            .every((row: any) => Array.isArray(row.topProducts) && row.topProducts.length > 0)
          const mergedTopProducts = cashierRowsHaveProductDetails
            ? mergeProducts(cashierRows.flatMap((row: any) => Array.isArray(row.topProducts) ? row.topProducts : []))
            : mergeProducts([
              ...(Array.isArray(prev.topProducts) ? prev.topProducts : []),
              ...(sessionAlreadyIncluded ? [] : topProducts),
            ])
          const mergedCostoProductos = mergedTopProducts.reduce((sum: number, product: any) => sum + (Number(product.costoNeto) || 0), 0)
          const mergedGananciaBruta = mergedTotalBruto - mergedCostoProductos
          const mergedAnuladas = mergeItems(Array.isArray(prev.anuladas) ? prev.anuladas : [], sessionAlreadyIncluded ? [] : newAnuladas)
          const mergedDevoluciones = mergeItems(Array.isArray(prev.devoluciones) ? prev.devoluciones : [], sessionAlreadyIncluded ? [] : newDevoluciones)
          const nowIso = new Date().toISOString()
          const consolidatedData = {
            $id: fechaDocId,
            sede: sede as string,
            fecha: fechaHoy,
            estado: 'enviado',
            origenPOS: true,
            cajerosListos: cajerosListosConsolidados,
            cajeroNombre: cajerosListosConsolidados.join(', '),
            montos: mergedMontos,
            montosPorCajera,
            efectivoSistema: mergedMontos.efectivoSistema,
            efectivoReal: mergedMontos.efectivoReal,
            debitoSistema: mergedMontos.debitoSistema,
            debitoReal: mergedMontos.debitoReal,
            transferencias: mergedMontos.transferencias,
            calculos: {
              gastosTotales: mergedGastosTotales,
              gastosMercaderia: mergedGastosMercaderia,
              gastosQueAfectanGanancia: mergedGastosQueAfectanGanancia,
              totalBruto: mergedTotalBruto,
              totalNeto: mergedTotalNeto,
              costoProductos: mergedCostoProductos,
              gananciaBruta: mergedGananciaBruta,
              diferenciaTotal: mergedDifTotal,
              diferenciaEfectivo: mergedDifEf,
              diferenciaDebito: 0,
            },
            costoProductos: mergedCostoProductos,
            gananciaBruta: mergedGananciaBruta,
            gastosTotales: mergedGastosTotales,
            totalBruto: mergedTotalBruto,
            totalNeto: mergedTotalNeto,
            diferenciaTotal: mergedDifTotal,
            diferenciaEfectivo: mergedDifEf,
            diferenciaDebito: 0,
            gastos: mergedGastos,
            gastosJson: JSON.stringify(mergedGastos),
            anuladas: mergedAnuladas.map((item: any) => ({ ...item, monto: Number(item.monto) || 0, observacion: item.observacion || item.detalle || '' })),
            anuladasJson: JSON.stringify(mergedAnuladas),
            devoluciones: mergedDevoluciones.map((item: any) => ({ ...item, monto: Number(item.monto) || 0, observacion: item.observacion || item.detalle || '' })),
            devolucionesJson: JSON.stringify(mergedDevoluciones),
            topProducts: mergedTopProducts,
            topProductsJson: JSON.stringify(mergedTopProducts),
            ventasCount: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.ventasCount) || 0), 0),
            createdAt: prev.createdAt || nowIso,
            updatedAt: nowIso,
          }
          transaction.set(cuadreRef, consolidatedData, { merge: true })
          transaction.set(reportRef, { ...consolidatedData, updatedAt: serverTimestamp() }, { merge: true })
          transaction.set(reportRefNew, { ...consolidatedData, updatedAt: serverTimestamp() }, { merge: true })
        })
      } catch (errCuadre) {
        console.error('[POS] Error guardando en cuadres_erp:', errCuadre)
      }
      await setActiveCajaSesion(sede, {
        ...sesionCaja,
        estado: 'cerrada',
        cierrePor: posUser?.id || 'pos',
        cierrePorNombre: posUser?.nombre || 'POS',
        cierreAt: Date.now(),
        cierreAtTs: Date.now(),
        montoCierre: efectivoRealNum,
        ventasCount: ventasCompletadas.length,
        totalVentas,
        totalEfectivo,
        totalDebito,
        totalTransferencia,
        totalGastos,
        gastosItems: cajaGastos,
      }, posUser?.id);

      try {
        await updateCajaSesion(sesionCaja.id, {
          estado: 'cerrada',
          cierrePor: posUser?.id || 'pos',
          cierrePorNombre: posUser?.nombre || 'POS',
          cierreAt: Date.now(),
          cierreAtTs: Date.now(),
          montoCierre: efectivoRealNum,
          ventasCount: ventasCompletadas.length,
          totalVentas,
          totalEfectivo,
          totalDebito,
          totalTransferencia,
          totalGastos,
          gastosItems: cajaGastos,
        });
      } catch {}

      // Preparar e imprimir comprobante térmico de corte de caja
      const cortePrintData: CorteCajaData = {
        corteId,
        sesionCajaId: sesionCaja.id,
        sede,
        sedeNombre,
        cajeroNombre: sesionCaja.cajeroNombre,
        fechaStr: fechaHoy,
        fechaCierreStr: ahora.toLocaleDateString('es-CL'),
        horaCierreStr: ahora.toLocaleTimeString('es-CL'),
        aperturaAt: sesionCaja.aperturaAt,
        montoApertura: sesionCaja.montoApertura,
        ventasCount: ventasCompletadas.length,
        totalVentas,
        totalEfectivo,
        totalDebito,
        totalTransferencia,
        totalVueltos,
        efectivoTeorico,
        efectivoReal: efectivoRealNum,
        gastos: totalGastos,
        gastosItems,
        anulacionesItems,
        devolucionesItems: todasDevolucionesItems,
        totalAnulaciones,
        totalDevoluciones,
        diferencia,
      };

      openCorteCajaPrintWindow(cortePrintData, printWindow);

      const closedSessionId = sesionCaja.id;
      try { localStorage.removeItem(`yaxsel_pos_caja_session_${sede}_${posUser?.id || 'default'}`); } catch {}
      setSesionCaja(null);
      setCajaCerradaPorCajera(true);
      setLastClosedSessionId(closedSessionId);
      showToast('Caja cerrada y corte guardado e impreso con éxito', 'ok');
      setShowCierre(false);
      setEfectivoReal('');
      setItemsCierre([]);
      setCajaGastos([]);
    } catch (e: any) {
      if (printWindow) {
        try { printWindow.close(); } catch {}
      }
      showToast(`Error: ${e.message}`, 'err');
    }
  }

  // ─── Print receipt ─────────────────────────────────────────────────────────
  const printReceipt = (venta: VentaPOS, existingWindow?: Window | null, esPreVenta = false) => {
    const resolvedDate = (venta.fecha?.toDate ? venta.fecha.toDate() : null)
      || (venta.fecha instanceof Date ? venta.fecha : null)
      || (venta.fechaTs ? new Date(venta.fechaTs) : null)
      || (venta.createdAtTs ? new Date(venta.createdAtTs) : null)
      || ((venta as any).createdAt?.toDate ? (venta as any).createdAt.toDate() : null)
      || ((venta as any).createdAt ? new Date((venta as any).createdAt) : null)
      || (venta.fechaStr ? new Date(`${venta.fechaStr}T12:00:00`) : new Date());

    const formattedData: ReceiptData = {
      ventaId: venta.id || `v${Date.now()}`,
      boletaNumero: 0,
      debitoOrdenNumero: venta.debitoOrdenNumero ?? null,
      cajero: venta.cajeroNombre || 'Cajera',
      sedeNombre,
      fecha: resolvedDate,
      fechaTs: venta.fechaTs,
      createdAtTs: venta.createdAtTs,
      fechaStr: venta.fechaStr,
      subtotal: Number(venta.subtotal || 0),
      descuentoGlobalPct: Number(venta.descuentoGlobalPct || 0),
      descuentoGlobal: Number(venta.descuentoGlobal || 0),
      total: Number(venta.total || 0),
      efectivoPagado: Number(venta.efectivoPagado || 0),
      vuelto: Number(venta.vuelto || 0),
      metodoPago: (venta as any).metodoPago || ((venta.pagos && venta.pagos.length > 0) ? venta.pagos[0].metodo : undefined),
      pagos: (venta.pagos || []).map(p => ({ metodo: p.metodo, monto: Number(p.monto || 0) })),
      items: (venta.items || []).map(it => ({
        sku: it.sku,
        nombre: it.nombre,
        cantidad: Number(it.cantidad || 0),
        precioUnitario: Number(it.precioUnitario || 0),
        subtotal: Number(it.subtotal || 0),
        embalajeQty: it.embalajeQty,
        packageQty: it.packageQty,
        boxCode: it.boxCode,
      })),
      esPreVenta,
      tipoComprobante: 'comprobante',
    };
    return existingWindow
      ? openReceiptPrintWindow(formattedData, existingWindow, empresaConfig)
      : openReceiptPrintWindow(formattedData, empresaConfig);
  };

  // ─── Generar Cotización (no requiere caja abierta) ────────────────────────
  const handleGenerarCotizacion = () => {
    if (!puedeGenerarCotizacion) return
    if (cart.length === 0) { showToast('Carrito vacío', 'err'); return }
    setShowCotizacion(true)
  };

  const cotizacionTexto = useMemo(() => {
    if (cart.length === 0) return ''
    const fecha = new Date().toLocaleDateString('es-CL')
    const lineas = cart.map((item, i) => {
      const desc = item.descuentoPct > 0 ? ` (-${item.descuentoPct}%)` : ''
      const embLabel = formatEmbalajeBoletaLabel(item)
      const embText = embLabel ? ` *${embLabel.trim()}*` : ''
      return `${i + 1}. ${item.nombre}${embText}${desc}\n   ${item.cantidad} x ${fmtCLP(item.precioUnitario)} = ${fmtCLP(item.subtotal)}`
    }).join('\n')
    const subtotal = cart.reduce((s, c) => s + c.subtotal, 0)
    const descuento = Math.round(subtotal * descuentoGlobalPct / 100)
    const total = Math.max(0, subtotal - descuento)
    let txt = `🛒 *COTIZACIÓN - Importadora Carlitos* 🛒\n📅 ${fecha}\n\n${lineas}\n`
    if (descuento > 0) txt += `\nDescuento: -${fmtCLP(descuento)}`
    txt += `\n\n*TOTAL: ${fmtCLP(total)}*\n\n_Valores sujetos a cambio sin previo aviso._\n_Stock sujeto a disponibilidad._`
    return txt
  }, [cart, descuentoGlobalPct])

  const copiarCotizacion = async () => {
    try {
      await navigator.clipboard.writeText(cotizacionTexto)
      setCotizacionCopied(true)
      setTimeout(() => setCotizacionCopied(false), 2000)
      showToast('Cotización copiada al portapapeles', 'ok')
    } catch {
      showToast('No se pudo copiar', 'err')
    }
  }

  const enviarCotizacionWhatsApp = () => {
    const txt = encodeURIComponent(cotizacionTexto)
    window.open(`https://wa.me/?text=${txt}`, '_blank')
  }

  // ─── Complete Sale ─────────────────────────────────────────────────────────
  const confirmingSaleLockRef = useRef(false)
  const handleCompleteSale = async (forcedCart?: CartItem[], skipRevalidate = false) => {
    if (!db || !sede) return
    if (!posUser || !matchBranchSlug(posUser.sede, sede) || (authLoggedIn && (!matchBranchSlug(branchAccess.sede, sede) || branchAccess.status !== 'allowed'))) {
      showToast('Tu cuenta no tiene acceso a esta sucursal.', 'err')
      return
    }
    if (sesionCaja && sesionCaja.sede && !matchBranchSlug(sesionCaja.sede, sede)) {
      showToast('La caja activa pertenece a otra sucursal. Reabre caja en esta sucursal para continuar.', 'err')
      return
    }
    if (processing || confirmingSaleLockRef.current) return
    if (isCajeroExpress && (pagoActivo === 'efectivo' || (splitMode && pagos.some(payment => payment.metodo === 'efectivo')))) {
      showToast('Cajero Express solo puede cobrar con débito o transferencia.', 'err')
      return
    }
    const cartToProcess = forcedCart || cart
    if (cartToProcess.length === 0) { showToast('Carrito vacío', 'err'); return }
    if (cartToProcess.some(c => c.cantidad <= 0)) {
      showToast('Hay productos con 0 unidades en el carrito. Ajusta la cantidad o elimínalos para cobrar.', 'err')
      return
    }
    if (!sesionCaja) {
      // Si la caja está cerrada, mostrar el modal de apertura en vez de solo un toast
      if (isCajera && cajaCerradaPorCajera && !permiteGestionarCaja) {
        showToast('La caja está cerrada. Pide a un administrador que la reabra desde el ERP.', 'err')
        return
      }
      setAperturaDismissed(false)
      setShowApertura(true)
      showToast('Debes abrir la caja para vender', 'err')
      return
    }
    if (sesionCaja.sede !== sede || sesionCaja.cajeroId !== posUser.id) {
      showToast('La caja abierta pertenece a otra sucursal o trabajador. Vuelve a abrir tu caja.', 'err')
      return
    }
    if (typeof window !== 'undefined' && !navigator.onLine) {
      showToast('Sin conexión a internet. Espera que vuelva la señal antes de cobrar.', 'err')
      return
    }

    triggerSakuraRain()

    const preliminarySubtotal = cartToProcess.reduce((sum, c) => sum + c.subtotal, 0)
    const preliminaryDescuento = Math.round(preliminarySubtotal * descuentoGlobalPct / 100)
    const preliminaryTotal = Math.max(0, Math.round(preliminarySubtotal - preliminaryDescuento))

    // ═══ Modo jefe_cobra: cajera genera PRE-VENTA, no cobra ═══
    const esPreVenta = modoVentaPOS === 'jefe_cobra' && isCajera && !isCajeroExpress

    // Validate payment (solo si no es pre-venta)
    let finalPagos: PagoEntry[] = []
    if (!esPreVenta) {
      if (splitMode) {
        let currentPagos = [...pagos]
        const pendingMonto = Number(montoRecibido) || 0
        if (pendingMonto > 0) {
          currentPagos.push({ metodo: pagoActivo, monto: pendingMonto })
        }
        const currentTotalPagado = currentPagos.reduce((s, p) => s + p.monto, 0)
        if (currentTotalPagado < preliminaryTotal) {
          showToast(`Faltan ${fmtCLP(Math.max(0, preliminaryTotal - currentTotalPagado))} por pagar`, 'err')
          return
        }
        finalPagos = currentPagos
      } else {
        if (pagoActivo === 'efectivo') {
          const rawMonto = Number(montoRecibido)
          if (!montoRecibido || rawMonto <= 0) {
            showToast('Ingresa el monto recibido en efectivo (o presiona "Exacto")', 'err')
            return
          }
          // Blindaje contra escáner accidental de código de barras (ej. EAN-13 de 13 dígitos)
          const monto = rawMonto > 50_000_000 ? preliminaryTotal : rawMonto
          if (monto < preliminaryTotal) {
            showToast(`Monto insuficiente. Faltan ${fmtCLP(preliminaryTotal - monto)}`, 'err')
            return
          }
          finalPagos = [{ metodo: 'efectivo', monto: preliminaryTotal }]
        } else {
          finalPagos = [{ metodo: pagoActivo, monto: preliminaryTotal }]
        }
      }
    }

    // ═══ Jefe cobrando pre-venta existente ═══
    const esCobroPreventa = isJefe && !!cobrandoPreventaId

    // Open popup before any async ops so browser doesn't block it
    confirmingSaleLockRef.current = true
    const receiptWindow = openReceiptPrintWindow(undefined, null)
    setProcessing(true)

    // En tienda física, la venta nunca se frena: si el cliente tiene el producto en mesón,
    // se cobra directamente el 100% de los productos del carrito sin mostrar popups ni modificarlo.
    // Si no hay stock suficiente en la base de datos, el backend permite stock negativo y registra deuda en stock_pending.
    const finalCartItems: CartItem[] = cartToProcess.map((item) => {
      if (Number(item.costoUnitario) > 0) return item
      const producto = products.get(String(item.sku || '')) || products.get(normSku(item.sku))
      const costoUnitario = Number(producto?.costo_uni) || 0
      return costoUnitario > 0 ? { ...item, costoUnitario } : item
    })
    let stockDecremented = false
    const ventaId = esCobroPreventa ? cobrandoPreventaId! : genId()

    try {
      const now = Date.now()

      // ═══ Race condition: verificar que la pre-venta no fue auto-anulada ═══
      if (esCobroPreventa) {
        try {
          const pvCheck = await getVentaPosById(ventaId)
          if (!pvCheck || pvCheck.estado !== 'pre_venta') {
            if (receiptWindow) receiptWindow.close()
            setProcessing(false)
            setCobrandoPreventaId(null)
            setCart([])
            showToast('La pre-venta fue anulada por timeout. Vuelve a crearla.', 'err')
            triggerFullCatalogRefresh()
            return
          }
        } catch (err) {
          console.warn('No se pudo verificar estado de pre-venta:', err)
        }
      }

      const processFinalSubtotal = Math.round(finalCartItems.reduce((sum: number, item: CartItem) => sum + item.subtotal, 0));
      const processFinalDescuento = Math.round(processFinalSubtotal * descuentoGlobalPct / 100);
      const processFinalTotal = Math.max(0, Math.round(processFinalSubtotal - processFinalDescuento));
      const montoEfectivoIngresadoRaw = Number(montoRecibido) || processFinalTotal
      const montoEfectivoIngresado = montoEfectivoIngresadoRaw > 50_000_000 ? processFinalTotal : montoEfectivoIngresadoRaw
      const vuelto = esPreVenta
        ? 0
        : splitMode
          ? Math.max(0, totalPagado - processFinalTotal)
          : pagoActivo === 'efectivo'
            ? Math.max(0, montoEfectivoIngresado - processFinalTotal)
            : 0
      const efectivoPagado = esPreVenta
        ? 0
        : splitMode
          ? Math.round(finalPagos.filter(p => p.metodo === 'efectivo').reduce((sum, p) => sum + (Number(p.monto) || 0), 0))
          : pagoActivo === 'efectivo'
            ? Math.round(Math.max(processFinalTotal, montoEfectivoIngresado))
            : 0;

      if (!esPreVenta && (!finalPagos || finalPagos.length === 0)) {
        finalPagos = [{ metodo: pagoActivo || 'efectivo', monto: processFinalTotal }]
      }

      const activeCustomerTab = customerTabs.find(tab => tab.id === activeCustomerTabId)

      const ventaData: any = {
        sede,
        cajeroId: posUser?.id || sesionCaja.cajeroId,
        cajeroNombre: posUser?.nombre || sesionCaja.cajeroNombre,
        clienteNombre: activeCustomerTab?.name || 'Cliente',
        vendedorNombre: activeCustomerTab?.originVendorName || '',
        vendedoraNombre: activeCustomerTab?.originVendorName || '',
        pendingSaleId: activeCustomerTab?.pendingSaleId || null,
        sesionCajaId: sesionCaja.id,
        fechaTs: now,
        fechaStr: todayStr(),
        tienePrecioEmergencia: finalCartItems.some((c: CartItem) => c.priceField === 'precio_emergencia'),
        items: finalCartItems.map((c: CartItem) => {
          const embQty = resolveEmbalajeQty(c);
          const prodRef = products.get(c.sku) || products.get(normSku(c.sku));
          return {
            sku: c.sku,
            nombre: c.nombre,
            cantidad: c.cantidad,
            precioUnitario: c.precioUnitario,
            priceField: c.priceField || '',
            priceLabel: c.priceLabel || '',
            esPrecioEmergencia: c.priceField === 'precio_emergencia',
            precioCatalogoRef: Number(prodRef?.precio_detalle || 0),
            costoUnitario: c.costoUnitario,
            descuentoPct: c.descuentoPct,
            subtotal: Math.round(c.subtotal),
            imageUrl: c.imageUrl || '',
            embalajeQty: embQty > 1 ? embQty : null,
            packageQty: c.packageQty || (embQty > 1 ? `${embQty}PCS` : null),
            boxCode: c.boxCode || prodRef?.boxCode || '',
          };
        }),
        subtotal: processFinalSubtotal,
        descuentoGlobalPct,
        descuentoGlobal: processFinalDescuento,
        total: processFinalTotal,
        efectivoPagado,
        metodoPago: esPreVenta ? '' : (finalPagos.length === 1 ? finalPagos[0].metodo : (finalPagos.length > 1 ? 'mixto' : (pagoActivo || 'efectivo'))),
        pagos: esPreVenta ? [] : (finalPagos.length > 0 ? finalPagos.map(p => ({ metodo: p.metodo, monto: Math.round(p.monto) })) : [{ metodo: pagoActivo || 'efectivo', monto: processFinalTotal }]),
        vuelto,
        estado: esPreVenta ? 'pre_venta' : 'completada',
        modoVenta: modoVentaPOS,
        tipoComprobante: 'comprobante',
        createdAtTs: now,
      }
      if (esCobroPreventa) {
        ventaData.cobradoPorJefe = true
        ventaData.jefeNombre = posUser?.nombre || ''
        ventaData.cobradaEnTs = now
      }

      let receiptCounters: ReceiptCounters = { boletaNumero: 0, debitoOrdenNumero: null }

      if (esPreVenta) {
        // PRE-VENTA: descontar stock al instante (reserva), no asignar boleta real, no actualizar totales de caja
        // El stock se descuenta ahora para que la web no muestre stock fantasma.
        // Si el jefe no confirma el pago en el timeout, la auto-anulación devuelve el stock.
        try {
          const stockRes = await fetch('/api/pos/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              mode: 'decrement',
              ventaId,
              sede,
              cajeroNombre: posUser?.nombre ? (posUser.nombre.toLowerCase().startsWith('cajer') ? posUser.nombre : `Cajera: ${posUser.nombre}`) : (sesionCaja?.cajeroNombre ? `Cajera: ${sesionCaja.cajeroNombre}` : 'Cajera POS'),
              clienteNombre: activeCustomerTab?.name || clienteNombre || 'Cliente',
              items: finalCartItems.map((ci: CartItem) => ({
                id: (products.get(ci.sku) || products.get(normSku(ci.sku)))?.$id || '',
                sku: ci.sku,
                cantidad: ci.cantidad,
                nombre: ci.nombre,
              })),
            }),
          });
          const stockJson = await stockRes.json().catch(() => null);
          if (!stockJson?.ok) {
            if (receiptWindow) receiptWindow.close();
            setProcessing(false);
            showToast(stockJson?.error || 'Error al reservar stock para pre-venta. Abortado.', 'err');
            triggerFullCatalogRefresh();
            return;
          }
          stockDecremented = true;
        } catch (err: any) {
          if (receiptWindow) receiptWindow.close();
          setProcessing(false);
          showToast(`Error de conexión al reservar stock: ${err.message}`, 'err');
          return;
        }
        // Descontar también del stockMap local (en todas sus llaves: $id, sku y normSku) y de la caché localStorage/RAM
        setStockMap((prevMap) => {
          const nextMap = new Map(prevMap);
          finalCartItems.forEach((item: CartItem) => {
            const nSku = normSku(item.sku);
            const prodDoc = products.get(item.sku) || (nSku ? products.get(nSku) : undefined);
            const keys = new Set<string>([item.sku]);
            if (nSku) keys.add(nSku);
            if (prodDoc?.$id) keys.add(prodDoc.$id);
            keys.forEach((k) => {
              const currentStock = nextMap.get(k) ?? 0;
              nextMap.set(k, Math.max(0, currentStock - item.cantidad));
            });
          });
          return nextMap;
        });
        patchErpProductsLocalCacheStock(
          finalCartItems.map((ci: CartItem) => ({
            id: (products.get(ci.sku) || products.get(normSku(ci.sku)))?.$id || '',
            sku: ci.sku,
            delta: -ci.cantidad,
          }))
        );
        ventaData.boletaNumero = 0
        ventaData.debitoOrdenNumero = null
        ventaData.stockReservado = true
        await createVentaPos(ventaData, ventaId)
      } else {
        // VENTA NORMAL o cobro de pre-venta
        // ═══ DESCUENTO ATÓMICO EN FIRESTORE (runTransaction) ═══
        // Solo descontar stock si NO es cobro de pre-venta (el stock ya se reservó al emitir la pre-venta).
        // En cobro de pre-venta, el stock ya está descontado, solo cambiamos estado a completada.
        if (!esCobroPreventa) {
          try {
            const stockRes = await fetch('/api/pos/stock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store',
              body: JSON.stringify({
                mode: 'decrement',
                ventaId,
                sede,
                cajeroNombre: posUser?.nombre ? (posUser.nombre.toLowerCase().startsWith('cajer') ? posUser.nombre : `Cajera: ${posUser.nombre}`) : (sesionCaja?.cajeroNombre ? `Cajera: ${sesionCaja.cajeroNombre}` : 'Cajera POS'),
                clienteNombre: activeCustomerTab?.name || clienteNombre || 'Cliente',
                items: finalCartItems.map((ci: CartItem) => ({
                  id: (products.get(ci.sku) || products.get(normSku(ci.sku)))?.$id || '',
                  sku: ci.sku,
                  cantidad: ci.cantidad,
                  nombre: ci.nombre,
                })),
              }),
            });
            const stockJson = await stockRes.json().catch(() => null);
            if (!stockJson?.ok) {
              if (receiptWindow) receiptWindow.close();
              setProcessing(false);
              showToast(stockJson?.error || 'Error al descontar stock en base de datos. Cobro abortado.', 'err');
              triggerFullCatalogRefresh(true);
              return;
            }
            stockDecremented = true;
          } catch (err: any) {
            if (receiptWindow) receiptWindow.close();
            setProcessing(false);
            showToast(`Error de conexión al descontar stock: ${err.message}`, 'err');
            return;
          }
          // Deduct sold quantities from local stockMap state (all keys: $id, sku, normSku) + localStorage/RAM cache
          setStockMap((prevMap) => {
            const nextMap = new Map(prevMap);
            finalCartItems.forEach((item: CartItem) => {
              const nSku = normSku(item.sku);
              const prodDoc = products.get(item.sku) || (nSku ? products.get(nSku) : undefined);
              const keys = new Set<string>([item.sku]);
              if (nSku) keys.add(nSku);
              if (prodDoc?.$id) keys.add(prodDoc.$id);
              keys.forEach((k) => {
                const currentStock = nextMap.get(k) ?? 0;
                nextMap.set(k, Math.max(0, currentStock - item.cantidad));
              });
            });
            return nextMap;
          });
          patchErpProductsLocalCacheStock(
            finalCartItems.map((ci: CartItem) => ({
              id: (products.get(ci.sku) || products.get(normSku(ci.sku)))?.$id || '',
              sku: ci.sku,
              delta: -ci.cantidad,
            }))
          );
        }
        const effectivePagos = finalPagos.length > 0 ? finalPagos : [{ metodo: pagoActivo || 'efectivo', monto: processFinalTotal }]
        const rawEfec = effectivePagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0)
        const efectivoTotal = Math.max(0, rawEfec - (splitMode ? (vuelto || 0) : 0))
        const debitoTotal = effectivePagos.filter(p => p.metodo === 'debito').reduce((s, p) => s + p.monto, 0)
        const transTotal = effectivePagos.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + p.monto, 0)
        receiptCounters = await nextReceiptCounters(effectivePagos)
        ventaData.boletaNumero = receiptCounters.boletaNumero
        ventaData.debitoOrdenNumero = receiptCounters.debitoOrdenNumero

        if (esCobroPreventa) {
          // Actualizar venta existente (mantener id original de la pre-venta)
          await updateVentaPos(ventaId, ventaData)
        } else {
          await createVentaPos(ventaData, ventaId)
        }
        if (sesionCaja) {
          const updatedSession: SesionCaja = {
            ...sesionCaja,
            ventasCount: (sesionCaja.ventasCount || 0) + 1,
            totalVentas: (sesionCaja.totalVentas || 0) + processFinalTotal,
            totalEfectivo: (sesionCaja.totalEfectivo || 0) + efectivoTotal,
            totalDebito: (sesionCaja.totalDebito || 0) + debitoTotal,
            totalTransferencia: (sesionCaja.totalTransferencia || 0) + transTotal,
          };
          setSesionCaja(updatedSession);
          try { localStorage.setItem(`yaxsel_pos_caja_session_${sede}_${posUser?.id || 'default'}`, JSON.stringify(updatedSession)); } catch {}
          // Contadores atómicos en Firestore para que dos cajas abiertas en equipos distintos no se pisen.
          adjustCajaSesion(sesionCaja.id, {
            ventasCount: 1,
            totalVentas: processFinalTotal,
            totalEfectivo: efectivoTotal,
            totalDebito: debitoTotal,
            totalTransferencia: transTotal,
          }).catch((error) => console.error('[POS] No se pudieron actualizar los acumulados de caja:', error))
        }
      }

      // Print receipt
      const completedVenta: VentaPOS = {
        id: ventaId,
        sede,
        cajeroNombre: posUser?.nombre || sesionCaja.cajeroNombre,
        clienteNombre: customerTabs.find(tab => tab.id === activeCustomerTabId)?.name || 'Cliente',
        sesionCajaId: sesionCaja.id,
        fecha: now,
        fechaTs: now,
        fechaStr: todayStr(),
        items: finalCartItems.map((c: CartItem) => {
          const prodRef = products.get(c.sku) || products.get(normSku(c.sku));
          return {
            sku: c.sku,
            nombre: c.nombre,
            cantidad: c.cantidad,
            precioUnitario: c.precioUnitario,
            priceField: c.priceField || '',
            priceLabel: c.priceLabel || '',
            costoUnitario: c.costoUnitario,
            descuentoPct: c.descuentoPct,
            subtotal: Math.round(c.subtotal),
            imageUrl: c.imageUrl || '',
            boxCode: c.boxCode || prodRef?.boxCode || '',
          };
        }),
        subtotal: processFinalSubtotal,
        descuentoGlobalPct,
        descuentoGlobal: processFinalDescuento,
        total: processFinalTotal,
        efectivoPagado,
        metodoPago: esPreVenta ? '' : (finalPagos.length === 1 ? finalPagos[0].metodo : (finalPagos.length > 1 ? 'mixto' : (pagoActivo || 'efectivo'))),
        pagos: esPreVenta ? [] : finalPagos.map((p: any) => ({ metodo: p.metodo, monto: Math.round(p.monto) })),
        vuelto,
        estado: esPreVenta ? ('pre_venta' as any) : 'completada',
        boletaNumero: receiptCounters.boletaNumero,
        debitoOrdenNumero: receiptCounters.debitoOrdenNumero,
        tipoComprobante: 'comprobante',
        createdAt: now,
        createdAtTs: now,
      }
      // 1. Cerrar la atención completada y limpiar el carrito DE INMEDIATO
      finishActiveCustomerSale()

      // 2. Si tenía cotización pendiente de vendedora, marcarla como completada en Firestore
      const completedPendingSaleId = customerTabsRef.current.find(tab => tab.id === activeCustomerTabIdRef.current)?.pendingSaleId
        || customerTabs.find(tab => tab.id === activeCustomerTabId)?.pendingSaleId
      if (db && completedPendingSaleId) {
        updateDoc(doc(db!, 'pos_ventas_pendientes', completedPendingSaleId), {
          estado: 'completada',
          ventaId,
          completadaEnTs: now,
        }).catch(() => {})
      }

      // 3. Imprimir comprobante y mostrar modal si corresponde
      const printWin = printReceipt(completedVenta, receiptWindow, esPreVenta)
      const wasBlocked = !printWin || printWin.closed
      setPopupBlockedNotice(wasBlocked)
      if (!esPreVenta) {
        setCompletedSaleModal(completedVenta)
      }
      if (esCobroPreventa) setCobrandoPreventaId(null)
      const tienePendientes = finalCartItems.some(i => i.stockPendiente || (stockMap.get(i.sku) ?? 0) < i.cantidad);
      showToast(
        esPreVenta
          ? `Pre-venta ${fmtCLP(processFinalTotal)} enviada al jefe ✓`
          : esCobroPreventa
            ? `Pre-venta cobrada ${fmtCLP(processFinalTotal)} ✓`
            : tienePendientes
              ? `Venta ${fmtCLP(processFinalTotal)} completada ✓ (Stock pendiente registrado)`
              : `Venta ${fmtCLP(processFinalTotal)} completada ✓`,
        'ok'
      )
      searchRef.current?.focus()
    } catch (e: any) {
      if (receiptWindow && !receiptWindow.closed) {
        try { receiptWindow.close() } catch (_) {}
      }
      if (stockDecremented) {
        // Rollback automático: restituir el stock en Firestore para evitar stock negativo fantasma por reintentos
        try {
          await fetch('/api/pos/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              mode: 'restore',
              ventaId,
              sede,
              items: finalCartItems.map((ci: CartItem) => ({
                id: (products.get(ci.sku) || products.get(normSku(ci.sku)))?.$id || '',
                sku: ci.sku,
                cantidad: ci.cantidad,
                nombre: ci.nombre,
              })),
            }),
          });
          // Restituir en el estado local del POS
          setStockMap((prevMap) => {
            const nextMap = new Map(prevMap);
            finalCartItems.forEach((item: CartItem) => {
              const currentStock = nextMap.get(item.sku) || 0;
              nextMap.set(item.sku, currentStock + item.cantidad);
            });
            return nextMap;
          });
        } catch (rollbackErr) {
          console.error('[POS] Error al revertir stock tras fallo de venta:', rollbackErr);
        }
      }
      showToast(`Error al guardar: ${e.message}. Stock restituido.`, 'err')
    } finally {
      // Cooldown de seguridad para evitar multi-clicks de cajeras impacientes cuando la conexión fluctúa
      setTimeout(() => {
        confirmingSaleLockRef.current = false
        setProcessing(false)
      }, 1000)
    }
  }

  // ─── Editar método de pago ─────────────────────────────────────────────────
  const EDIT_PAGO_PIN = '988189813'

  const openEditPago = (v: VentaPOS) => {
    if (nivelAccesoActual !== 'alto') return
    setEditPagoTarget(v)
    setEditPagoPin('')
    setEditPagoPinError(false)
    setEditPagoPinOk(true)
    setEditPagoReason('')
    // Pre-seleccionar el método actual (el primero si hay varios)
    const current = (getSalePagos(v)[0]?.metodo as MetodoPago) || 'efectivo'
    setEditPagoMetodo(current)
  }

  const handleEditPagoPin = () => {
    if (editPagoPin !== EDIT_PAGO_PIN) {
      setEditPagoPinError(true)
      setEditPagoPin('')
      return
    }
    setEditPagoPinError(false)
    setEditPagoPinOk(true)
  }

  const handleEditPagoSave = async () => {
    if (!editPagoTarget || !db) return
    if (nivelAccesoActual !== 'alto' || !editPagoReason.trim()) {
      showToast('Indica el motivo de la edición para dejarlo registrado.', 'err')
      return
    }
    setEditPagoSaving(true)
    try {
      // Reconstruir pagos con nuevo método, manteniendo montos
      const basePagos = getSalePagos(editPagoTarget)
      const newPagos = basePagos.map((p: any, i: number) =>
        i === 0 ? { ...p, metodo: editPagoMetodo } : p
      )
      // Si solo hay un pago, simplemente reemplazar todo
      const finalPagos = basePagos.length <= 1
        ? [{ metodo: editPagoMetodo, monto: editPagoTarget.total }]
        : newPagos
      const efectivoPagado = editPagoMetodo === 'efectivo'
        ? Math.round(finalPagos.filter(p => p.metodo === 'efectivo').reduce((sum, p) => sum + (Number(p.monto) || 0), 0) + (finalPagos.length === 1 ? Number(editPagoTarget.vuelto || 0) : 0))
        : 0

      await updateVentaPos(editPagoTarget.id, {
        pagos: finalPagos,
        metodoPago: editPagoMetodo,
        efectivoPagado,
        historialEdiciones: [...(((editPagoTarget as any).historialEdiciones || []) as any[]), { razon: editPagoReason.trim(), editadoPor: posUser?.nombre || 'Usuario POS', editadoEn: Date.now() }],
      })

      // Actualizar sesión de caja si corresponde
      if (sesionCaja && editPagoTarget.sesionCajaId === sesionCaja.id) {
        const oldPagos = getSalePagos(editPagoTarget)
        const oldEf = oldPagos.filter((p: any) => p.metodo === 'efectivo').reduce((s: number, p: any) => s + (Number(p.monto) || 0), 0)
        const oldDb = oldPagos.filter((p: any) => p.metodo === 'debito').reduce((s: number, p: any) => s + (Number(p.monto) || 0), 0)
        const oldTr = oldPagos.filter((p: any) => p.metodo === 'transferencia').reduce((s: number, p: any) => s + (Number(p.monto) || 0), 0)
        const newEf = finalPagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + (Number(p.monto) || 0), 0)
        const newDb = finalPagos.filter(p => p.metodo === 'debito').reduce((s, p) => s + (Number(p.monto) || 0), 0)
        const newTr = finalPagos.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + (Number(p.monto) || 0), 0)
        const updatedSession = {
          ...sesionCaja,
          totalEfectivo: (sesionCaja.totalEfectivo || 0) + (newEf - oldEf),
          totalDebito: (sesionCaja.totalDebito || 0) + (newDb - oldDb),
          totalTransferencia: (sesionCaja.totalTransferencia || 0) + (newTr - oldTr),
        }
        setSesionCaja(updatedSession)
        adjustCajaSesion(sesionCaja.id, {
          totalEfectivo: newEf - oldEf,
          totalDebito: newDb - oldDb,
          totalTransferencia: newTr - oldTr,
        }).catch((error) => console.error('[POS] No se pudieron sincronizar los medios de pago de caja:', error))
      }

      // Mantener al día el conjunto ya consultado para el cierre/resumen abierto.
      setVentasHoy(prev => prev.map(v => v.id === editPagoTarget.id ? { ...v, pagos: finalPagos, metodoPago: editPagoMetodo, efectivoPagado } : v))

      showToast('Método de pago actualizado', 'ok')
      setEditPagoTarget(null)
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'err')
    }
    setEditPagoSaving(false)
  }

  // ─── Rehacer / Clonar venta al carrito ─────────────────────────────────────
  const handleRehacerVenta = (venta: VentaPOS) => {
    let rawItems: any[] = [];
    if (typeof venta.itemsJson === 'string' && venta.itemsJson) {
      try { rawItems = JSON.parse(venta.itemsJson); } catch (_) {}
    }
    if (rawItems.length === 0 && Array.isArray(venta.items)) {
      rawItems = venta.items;
    }
    if (!rawItems || rawItems.length === 0) {
      showToast('Esta venta no contiene productos para rehacer', 'err');
      return;
    }
    const clonedCart: CartItem[] = rawItems.map((it: any) => {
      const prod = products.get(it.sku) || products.get(normSku(it.sku));
      const cant = Number(it.cantidad || 1);
      const precioUni = Number(it.precioUnitario || 0);
      const descPct = Number(it.descuentoPct || 0);
      const sub = Number(it.subtotal || Math.round(cant * precioUni * (1 - descPct / 100)));
      const matchingPrice = inferHistoricalPriceOption(prod, precioUni);
      const priceField = it.priceField || matchingPrice?.field || (precioUni > 0 ? 'precio_historico' : undefined);
      const priceLabel = it.priceLabel || matchingPrice?.label || (priceField === 'precio_historico' ? 'Precio original' : undefined);
      return {
        productId: prod?.$id || it.sku,
        sku: it.sku,
        nombre: it.nombre || prod?.nombre || it.sku,
        cantidad: cant,
        precioUnitario: precioUni,
        priceField,
        priceLabel,
        costoUnitario: Number(it.costoUnitario || prod?.costo_uni || 0),
        descuentoPct: descPct,
        subtotal: sub,
        stockDisponible: stockMap.get(it.sku) ?? 999,
        imageUrl: it.imageUrl || prod?.imageUrl || '',
        stockPendiente: false,
        embalajeQty: it.embalajeQty ?? prod?.embalajeQty,
        packageQty: it.packageQty ?? prod?.packageQty,
      };
    });

    setCart(clonedCart);
    setDescuentoGlobalPct(Number(venta.descuentoGlobalPct) || 0);
    setMobileTab('cart');
    showToast(`Venta cargada al carrito (${fmtCLP(venta.total)}) lista para procesar`, 'ok');
  };

  // ─── Anular venta ──────────────────────────────────────────────────────────
  const handleAnular = async (venta: VentaPOS) => {
    if (nivelAccesoActual === 'bajo') { showToast('Tu nivel de permiso no permite anular boletas.', 'err'); return }
    if (!confirm(`¿Anular venta por ${fmtCLP(venta.total)}?`)) return
    try {
      // Si era pre-venta con stock reservado, devolver el stock
      const eraPreVentaConStock = venta.estado === 'pre_venta' || (venta as any).stockReservado
      await updateVentaPos(venta.id, { estado: 'anulada', anuladaEn: Date.now(), anuladaMotivo: 'anulacion_manual' })
      const anularCajero = posUser?.nombre ? (posUser.nombre.toLowerCase().startsWith('cajer') ? posUser.nombre : `Cajera: ${posUser.nombre}`) : (sesionCaja?.cajeroNombre ? `Cajera: ${sesionCaja.cajeroNombre}` : 'Sistema POS');
      const anularBoleta = (venta as any).boletaNumero || (venta as any).ticketId || (venta as any).folio || '';
      const anularCliente = (venta as any).clienteNombre || (venta as any).cliente?.nombre || '';

      if (eraPreVentaConStock) {
        try {
          await fetch('/api/pos/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              mode: 'restore',
              ventaId: venta.id,
              sede: venta.sede || sede,
              cajeroNombre: anularCajero,
              boletaNumero: anularBoleta,
              clienteNombre: anularCliente,
              motivo: 'Pre-venta anulada',
              items: (venta.items || []).map((it: any) => ({
                id: (products.get(it.sku) || products.get(normSku(it.sku)))?.$id || '',
                sku: it.sku,
                cantidad: it.cantidad,
              })),
            }),
          });
        } catch (err) {
          console.warn('Error restituyendo stock en anulación:', err);
        }
      } else {
        // Venta completada normal: restaurar stock
        try {
          await fetch('/api/pos/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              mode: 'restore',
              ventaId: venta.id,
              sede: venta.sede || sede,
              cajeroNombre: anularCajero,
              boletaNumero: anularBoleta,
              clienteNombre: anularCliente,
              motivo: 'Anulación manual en POS',
              items: (venta.items || []).map((it: any) => ({
                id: (products.get(it.sku) || products.get(normSku(it.sku)))?.$id || '',
                sku: it.sku,
                cantidad: it.cantidad,
              })),
            }),
          });
        } catch (err) {
          console.warn('Error restituyendo stock en anulación:', err);
        }
      }
      const restoredItems = (venta.items || []).map((it: any) => ({
        id: (products.get(it.sku) || products.get(normSku(it.sku)))?.$id || '',
        sku: it.sku,
        delta: Number(it.cantidad || 0),
      }));
      patchErpProductsLocalCacheStock(restoredItems);
      setStockMap((prevMap) => {
        const nextMap = new Map(prevMap);
        (venta.items || []).forEach((it: any) => {
          const qty = Number(it.cantidad || 0);
          if (qty <= 0) return;
          const nSku = normSku(it.sku);
          const prodDoc = products.get(it.sku) || (nSku ? products.get(nSku) : undefined);
          const keys = new Set<string>([it.sku]);
          if (nSku) keys.add(nSku);
          if (prodDoc?.$id) keys.add(prodDoc.$id);
          keys.forEach((k) => {
            const cur = nextMap.get(k) ?? 0;
            nextMap.set(k, cur + qty);
          });
        });
        return nextMap;
      });
      // Update caja session (Appwrite)
      if (sesionCaja && venta.sesionCajaId === sesionCaja.id) {
        const ef = (venta.pagos || []).filter((p: any) => p.metodo === 'efectivo').reduce((s: number, p: any) => s + (p.monto || 0), 0)
        const db2 = (venta.pagos || []).filter((p: any) => p.metodo === 'debito').reduce((s: number, p: any) => s + (p.monto || 0), 0)
        const tr = (venta.pagos || []).filter((p: any) => p.metodo === 'transferencia').reduce((s: number, p: any) => s + (p.monto || 0), 0)
        const updatedSession = {
          ...sesionCaja,
          ventasCount: Math.max(0, (sesionCaja.ventasCount || 0) - 1),
          totalVentas: Math.max(0, (sesionCaja.totalVentas || 0) - venta.total),
          totalEfectivo: Math.max(0, (sesionCaja.totalEfectivo || 0) - ef),
          totalDebito: Math.max(0, (sesionCaja.totalDebito || 0) - db2),
          totalTransferencia: Math.max(0, (sesionCaja.totalTransferencia || 0) - tr),
        }
        setSesionCaja(updatedSession)
        adjustCajaSesion(sesionCaja.id, {
          ventasCount: -1,
          totalVentas: -Number(venta.total || 0),
          totalEfectivo: -ef,
          totalDebito: -db2,
          totalTransferencia: -tr,
        }).catch((error) => console.error('[POS] No se pudieron sincronizar la anulación con caja:', error))
      }
      showToast('Venta anulada y stock restaurado', 'info')
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'err')
    }
  }

  // ─── Add split payment ─────────────────────────────────────────────────────
  const addSplitPago = () => {
    const monto = Number(montoRecibido)
    if (!monto || monto <= 0) return
    setPagos(prev => [...prev, { metodo: pagoActivo, monto }])
    setMontoRecibido('')
  }

  // ─── Barcode detection (auto-submit on Enter from search) ──────────────────
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const rawTerm = searchTerm.trim()
      if (!rawTerm) return
      const term = rawTerm.toUpperCase()
      const cleanTerm = normText(rawTerm)

      // Exact SKU match → add directly
      const exact = products.get(term) || products.get(normSku(term)) || products.get(rawTerm)
      if (exact) {
        addToCart({ ...exact, stock: stockMap.get(exact.sku) || stockMap.get(exact.$id || '') || 0 })
        setSearchTerm('')
        return
      }
      // Exact codigo_barra match → add directly
      let cbMatch: (ProductDoc & { stock: number }) | undefined
      products.forEach(p => {
        if (!cbMatch && (normText(p.codigo_barra) === cleanTerm || normText(p.sku) === cleanTerm)) {
          cbMatch = { ...p, stock: stockMap.get(p.sku) || stockMap.get(p.$id || '') || 0 }
        }
      })
      if (cbMatch) {
        addToCart(cbMatch)
        setSearchTerm('')
        setSearchAddedSkus(new Set())
        if (proMode) setProSearchOpen(false)
        return
      }

      // En Modo Auto: si presiona Enter y hay tarjetas filtradas, abre la ventana de cantidad (o agrega directo si askQtyMode es false)
      if (autoMode && filteredProducts.length > 0) {
        const first = filteredProducts[0]
        if (askQtyMode) {
          openQuickQtyModal(first, selectedPriceBySku[first.sku], filteredProducts, 0)
        } else {
          addToCart(first, selectedPriceBySku[first.sku])
          showToast(`⚡ Agregado (Modo Auto): ${first.nombre}`, 'ok')
          setSearchTerm('')
          setSearchAddedSkus(new Set())
          if (proMode) setProSearchOpen(false)
          searchRef.current?.focus()
        }
        return
      }

      // If only 1 result, open quantity modal or add directly
      if (filteredProducts.length === 1) {
        const only = filteredProducts[0]
        if (askQtyMode) {
          openQuickQtyModal(only, selectedPriceBySku[only.sku], filteredProducts, 0)
        } else {
          addToCart(only, selectedPriceBySku[only.sku])
          showToast(`⚡ Agregado: ${only.nombre}`, 'ok')
          setSearchTerm('')
          setSearchAddedSkus(new Set())
          if (proMode) setProSearchOpen(false)
          searchRef.current?.focus()
        }
        return
      }
    }
  }

  const handleBarcodeDetected = (code: string) => {
    const term = code.trim().toUpperCase()
    // 1. Exact SKU match
    const exactSku = products.get(term)
    if (exactSku) {
      addToCart({ ...exactSku, stock: stockMap.get(term) || 0 })
      showToast(`✅ ${exactSku.nombre}`, 'ok')
      return
    }
    // 2. Exact codigo_barra match
    let cbMatch: (ProductDoc & { stock: number }) | undefined
    products.forEach(p => {
      if ((p.codigo_barra || '').trim().toUpperCase() === term) {
        cbMatch = { ...p, stock: stockMap.get(p.sku) || 0 }
      }
    })
    if (cbMatch) {
      addToCart(cbMatch)
      showToast(`✅ ${cbMatch.nombre}`, 'ok')
      return
    }
    // 3. Fallback: put in search bar
    setSearchTerm(code.trim())
    showToast(`Código ${code} — sin coincidencia`, 'info')
  }

  // ─── Quick amounts for cash ────────────────────────────────────────────────
  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000]
  const handleQuickCashAmount = (amount: number) => {
    setMontoRecibido(prev => String(accumulateQuickAmounts ? (Number(prev) || 0) + amount : amount))
  }
  const toggleQuickAmountAccumulation = () => {
    const next = !accumulateQuickAmounts
    setAccumulateQuickAmounts(next)
    try { localStorage.setItem(POS_QUICK_AMOUNT_ACCUMULATE_KEY, String(next)) } catch {}
  }
  const rawCashierThemeId = String(posUser?.id || '').trim()
  const activeAccountThemeKey = rawCashierThemeId && rawCashierThemeId !== 'default' ? rawCashierThemeId : `default_${sede}`
  const committedPosTheme = posThemeOwnerId === activeAccountThemeKey ? posPersonalTheme : DEFAULT_POS_PERSONAL_THEME
  const effectivePosTheme = showPosThemeEditor ? draftPosTheme : committedPosTheme
  const isNekoPosTheme = isPosNekoTheme(effectivePosTheme.presetId)
  const hasMikanAnimations = isPosNekoAnimatedTheme(effectivePosTheme.presetId)
  const activeNekoVariant = effectivePosTheme.presetId === 'neko-nocturno' ? 'fernanda' : 'mikan'
  const activeCachedWallpaper =
    effectivePosTheme.presetId === 'neko-mikan'
      ? cachedNekoWallpaper
      : effectivePosTheme.presetId === 'neko-nocturno'
      ? cachedNekoFernandaWallpaper
      : effectivePosTheme.presetId === 'capy-matcha'
      ? cachedCapyWallpaper
      : effectivePosTheme.presetId === 'jasmine-lavender'
      ? cachedJasmineWallpaper
      : effectivePosTheme.presetId === 'sakura-coquette'
      ? cachedSakuraWallpaper
      : undefined
  const posSkinTokens = resolvePosSkinTokens(effectivePosTheme, activeCachedWallpaper)

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (!sede || (!SEDES[sede] && !Object.keys(SEDES).some(s => matchBranchSlug(s, sede)))) {
    return (
      <div className={`${design.surface} min-h-screen bg-[#f4f6f3] flex items-center justify-center p-4`}>
        <div className="bg-white border border-[#dce5e0] rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-[#087f73] flex items-center justify-center shadow-lg shadow-teal-900/10">
              <Store size={22} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#405566]">Punto de Venta</h1>
          </div>
          <p className="text-slate-500 text-sm mb-6 ml-1">Selecciona la sucursal para abrir el POS:</p>
          <div className="space-y-3">
            {Object.entries(SEDES).map(([slug, name]) => (
              <button key={slug} onClick={() => router.push(`/pos/${slug}`)}
                className="w-full flex items-center gap-3 bg-white hover:bg-[#eaf5f1] border border-[#dce5e0] hover:border-[#087f73] rounded-2xl px-4 py-4 text-left transition-all group">
                <div className="w-10 h-10 rounded-xl bg-teal-50 group-hover:bg-[#087f73] flex items-center justify-center shrink-0 transition">
                  <Store size={18} className="text-[#087f73] group-hover:text-white" />
                </div>
                <div>
                  <div className="text-[#405566] font-semibold">{name}</div>
                  <div className="text-slate-400 text-xs">{slug}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Acceso de sucursal ────────────────────────────────────────────────────
  if (!authLoading && !authLoggedIn) {
    return <main className={`${design.surface} min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-5 text-center`}>
      <Lock size={32} className="text-amber-700" />
      <h1 className="text-xl font-bold text-slate-900">Inicia sesión para usar el POS</h1>
      <p className="max-w-md text-sm text-slate-600">Necesitamos identificar tu cuenta para verificar las sucursales asignadas en Planilla unificada.</p>
      <button onClick={() => router.push(`/admin/login?next=${encodeURIComponent(`/pos/${sede}`)}`)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Iniciar sesión</button>
    </main>
  }
  if (!authLoading && authLoggedIn && matchBranchSlug(branchAccess.sede, sede) && branchAccess.status === 'denied') {
    return <main className={`${design.surface} min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-5 text-center`}>
      <Lock size={32} className="text-amber-700" />
      <h1 className="text-xl font-bold text-slate-900">Sucursal no asignada</h1>
      <p className="max-w-md text-sm text-slate-600">Tu ficha de planilla no autoriza operar en {sedeNombre}. Pide que te habiliten esta sucursal si necesitas trabajar en ambas.</p>
      <button onClick={() => router.replace('/pos-acceso')} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Ir a mi sucursal</button>
    </main>
  }

  // ─── POS Loading Screen ────────────────────────────────────────────────────
  if (loginLoading || authLoading || (authLoggedIn && (!matchBranchSlug(branchAccess.sede, sede) || branchAccess.status === 'checking'))) {
    return (
      <div className={`${design.surface} min-h-screen bg-[#f4f6f3] flex flex-col items-center justify-center`}>
        <div className="mb-6"><PosBrand /></div>
        <p className="text-sm text-slate-600 font-medium animate-pulse">Cargando punto de venta...</p>
        <div className="mt-4 w-48 sm:w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#087f73] to-[#08a88f] animate-[loadingBar_1.5s_ease-in-out_infinite] rounded-full" style={{ width: '40%' }} />
        </div>
        <style>{`
          @keyframes loadingBar {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(150%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>
    )
  }

  if (!posUser && loginUsers.length === 0) {
    return <main className={`${design.surface} min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-5 text-center`}>
      <Lock size={32} className="text-amber-700" />
      <h1 className="text-xl font-bold text-slate-900">Sin personal autorizado</h1>
      <p className="max-w-md text-sm text-slate-600">No hay trabajadores activos asignados a {sedeNombre}. Revisa la sucursal en Planilla unificada.</p>
      <button onClick={() => router.replace('/pos-acceso')} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Volver</button>
    </main>
  }

  // ─── POS Login Screen ──────────────────────────────────────────────────────
  const anyHasPassword = loginUsers.some(u => !!u.posPassword)
  if (!posUser && anyHasPassword && !loginLoading) {
    const selectedUser = loginUsers.find(u => u.id === loginSelected)
    return (
      <div className={`${design.surface} min-h-screen bg-[#f4f6f3] flex flex-col items-center justify-center px-4 py-8`}>
        {selectedUser && (isAdminEmail(authUser?.email) || normalizePosAccessLevel(selectedUser.nivelAccesoPos, selectedUser.puedeGestionarCaja) !== 'bajo') && <button onClick={() => router.push(`/pos-admin/${sede || DEFAULT_SEDE}`)} className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 transition"><ChevronLeft size={24} /></button>}

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-6"><PosBrand /></div>
          <h2 className="text-xl font-bold text-slate-800">Punto de Venta</h2>
          <p className="text-sm text-slate-500 mt-1">{sedeNombre}</p>
          <p className="text-xs text-slate-400 mt-0.5">Selecciona tu cuenta para ingresar</p>
        </div>

        {!loginSelected ? (
          <>
            {/* User circles */}
            <div className="flex flex-wrap justify-center gap-6 mb-8 max-w-lg">
              {loginUsers.filter(u => !!u.posPassword).map(u => {
                const isCaj = getOperatorPosRole(u.cargo, u.rolOperativoPos) === 'cajera'
                const cargoUp = u.cargo.toUpperCase()
                const isFemale = cargoUp.includes('CAJERA') || cargoUp.includes('VENDEDORA')
                const ringColor = isFemale ? 'ring-pink-300 hover:ring-pink-400' : 'ring-blue-300 hover:ring-blue-400'
                return (
                  <div key={u.id} className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => { setLoginSelected(u.id); setLoginPassword(''); setLoginError('') }}
                      className={`relative w-20 h-20 rounded-full overflow-hidden shadow-lg ring-4 ${ringColor} hover:scale-110 hover:shadow-xl active:scale-95 transition-all cursor-pointer`}
                    >
                      {u.fotoUrl ? (
                        <img src={u.fotoUrl} alt={u.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-2xl font-bold text-white ${isCaj ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-gradient-to-br from-blue-400 to-indigo-500'}`}>
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </button>
                    <span className="text-sm font-semibold text-gray-800">{u.nombre}</span>
                    {(() => {
                      const uLevel = isSellerCargo(u.cargo) ? 'bajo' : normalizePosAccessLevel(u.nivelAccesoPos, u.puedeGestionarCaja ?? cajerasGestionanCajas)
                      const uLevelLabel = uLevel === 'alto' ? 'Nivel Alto' : uLevel === 'medio' ? 'Nivel Medio' : 'Nivel Bajo'
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${isCaj ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                            {u.cargo || (isCaj ? 'Cajera' : 'Vendedora')}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                            uLevel === 'alto'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : uLevel === 'medio'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {uLevelLabel}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {/* Password input */}
            <div className="w-full max-w-xs">
              <div className="flex flex-col items-center mb-6">
                <div className={`relative w-20 h-20 rounded-full overflow-hidden shadow-lg ring-4 mb-3 ${
                  selectedUser && (selectedUser.cargo.toUpperCase().includes('CAJERA') || selectedUser.cargo.toUpperCase().includes('VENDEDORA'))
                    ? 'ring-pink-300' : 'ring-blue-300'
                }`}>
                  {selectedUser?.fotoUrl ? (
                    <img src={selectedUser.fotoUrl} alt={selectedUser.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-2xl font-bold text-white">
                      {selectedUser?.nombre.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="font-bold text-gray-900">{selectedUser?.nombre}</div>
                {selectedUser && (() => {
                  const sLevel = isSellerCargo(selectedUser.cargo) ? 'bajo' : normalizePosAccessLevel(selectedUser.nivelAccesoPos, selectedUser.puedeGestionarCaja ?? cajerasGestionanCajas)
                  const sLevelLabel = sLevel === 'alto' ? 'Nivel Alto' : sLevel === 'medio' ? 'Nivel Medio' : 'Nivel Bajo'
                  return (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs font-semibold text-gray-600">{selectedUser.cargo}</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sLevel === 'alto'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sLevel === 'medio'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {sLevelLabel}
                      </span>
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={loginShowPw ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={e => { setLoginPassword(e.target.value); setLoginError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') handlePosLogin() }}
                    placeholder="Contraseña"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 pr-10"
                    autoFocus
                  />
                  <button type="button" onClick={() => setLoginShowPw(!loginShowPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {loginShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {loginError && <p className="text-xs text-red-500 text-center">{loginError}</p>}
                <button
                  onClick={handlePosLogin}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition active:scale-[0.98]"
                >
                  Ingresar
                </button>
                <button
                  onClick={() => { setLoginSelected(null); setLoginPassword(''); setLoginError('') }}
                  className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition"
                >
                  ← Elegir otra persona
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      data-pos-personal-theme="true"
      data-pos-custom-skin={posSkinTokens.isCustom ? 'true' : 'false'}
      data-pos-skin={effectivePosTheme.presetId}
      data-pos-pattern={effectivePosTheme.pattern}
      data-pos-mode={effectivePosTheme.mode}
      data-pos-toolbar-tone={posSkinTokens.toolbarTone}
      data-pos-shape={effectivePosTheme.shape}
      data-pos-card={effectivePosTheme.cardFinish}
      data-pos-scale-dense={isDenseLayoutActive ? 'true' : 'false'}
      className={`${design.surface} ${posLayout.terminal}`}
      style={{
        ...posSkinTokens.style,
        ...(effectiveScale !== 1 && viewportSize.w >= 1024
          ? {
              zoom: effectiveScale,
              height: `calc(100dvh / ${effectiveScale})`,
              maxHeight: `calc(100dvh / ${effectiveScale})`,
            }
          : {}),
      }}
    >
      {effectivePosTheme.presetId === 'sakura-coquette' && (
        <PosSakuraRain trigger={sakuraRainTrigger} />
      )}
      {hasMikanAnimations && (
        <PosNekoRain trigger={sakuraRainTrigger} nekoVariant={activeNekoVariant} />
      )}
      {effectivePosTheme.presetId === 'capy-matcha' && (
        <PosCapyRain trigger={sakuraRainTrigger} />
      )}
      {effectivePosTheme.presetId === 'jasmine-lavender' && (
        <PosJasmineRain trigger={sakuraRainTrigger} />
      )}
      <PosThemeStudio
        open={showPosThemeEditor}
        operatorName={posUser?.nombre}
        value={draftPosTheme}
        saving={posThemeSaving}
        onChange={setDraftPosTheme}
        onCancel={cancelPosThemeStudio}
        onSave={savePosPersonalTheme}
      />
      <PosToolbar
        branch={sedeNombre}
        operator={posUser?.nombre}
        photo={posUser?.fotoUrl}
        roleLabel={operatorRole}
        accessLevel={operatorAccessLevel}
        accessLevelLabel={operatorAccessLevelLabel}
        clock={clock}
        hasSession={Boolean(sesionCaja)}
        seller={isVendedora}
        loadingSession={ventasConsultaLoading || (!sesionCaja && !configCajaPermisoLoaded)}
        sessionDetail={
          sesionCaja
            ? 'Ef. ' + fmtCLP(Number(sesionCaja.totalEfectivo || 0)) + ' · ' + fmtN(Number(sesionCaja.ventasCount || 0)) + ' ventas'
            : cajaCerradaPorCajera
            ? (isNivelAlto ? 'Caja cerrada · Reanudar' : 'Caja cerrada (Corte)')
            : isVendedora
            ? 'Envío a cajera'
            : undefined
        }
        onSession={() => {
          if (sesionCaja) {
            void openCajaResumen();
          } else if (cajaCerradaPorCajera) {
            if (isNivelAlto) {
              handleReanudarCaja();
            } else {
              setShowAuthModalAlto(true);
            }
          } else if (!isVendedora && configCajaPermisoLoaded) {
            setShowApertura(true);
          } else {
            setMobileTab('payment');
          }
        }}
        onAdmin={puedeAccederPosAdmin ? () => router.push('/pos-admin/' + (sede || DEFAULT_SEDE)) : undefined}
        fullscreen={fullscreen} onFullscreen={toggleFullscreen}
        actions={[
          { label: 'Historial y comprobantes', icon: Receipt, onClick: () => { window.open('/pos/' + sede + '/historial', '_blank', 'noopener,noreferrer'); } },
          ...(sesionCaja ? [
            { label: 'Registrar retiro de caja', icon: Minus, onClick: openNewCajaGasto },
            { label: 'Ver y editar gastos', icon: FileText, count: cajaGastos.length, onClick: () => setShowCajaGastos(true) },
            { label: 'Mis notas', icon: Edit3, onClick: () => { if (proMode) toggleProMode(); setSearchTerm(''); setSelectedCategory(''); setCashierSpaceView('notes'); setMobileTab('products'); } },
            { label: 'Inspiración', icon: Palette, onClick: () => { if (proMode) toggleProMode(); setSearchTerm(''); setSelectedCategory(''); setCashierSpaceView('inspiration'); setMobileTab('products'); } },
          ] : []),
          ...(puedeAccederBaseDatos ? [{ label: 'Catálogo de productos', icon: Database, onClick: () => { window.open('/erp-dashboard/base-datos', '_blank', 'noopener,noreferrer'); } }] : []),
          { label: 'Personalizar mi espacio', icon: Palette, disabled: posThemeLoading, onClick: openPosThemeStudio },
          ...((posUserModules.includes('web') || posUserModules.includes('admin_supreme')) ? [{ label: 'Administración web', icon: Globe, onClick: () => { window.open('/admin/dashboard', '_blank', 'noopener,noreferrer'); } }] : []),
          ...((isAdminEmail(authUser?.email) && (posUserModules.includes('erp') || posUserModules.includes('erp_admin'))) ? [{ label: 'Abrir ERP', icon: BarChart3, onClick: () => { window.open('/erp-dashboard', '_blank', 'noopener,noreferrer'); } }] : []),
          ...(posUser ? [{ label: 'Cerrar sesión de operador', icon: LogOut, danger: true, onClick: () => { void handlePosLogout(); } }] : []),
        ] satisfies PosToolbarAction[]}
      >
        {isCajera && pendingSales.length > 0 && <button type="button" className={posLayout.pendingButton} onClick={() => setShowPendingSales(true)}><Send size={15} /> {pendingSales.length} pendientes</button>}
        {isJefe && <button type="button" className={posLayout.pendingButton} onClick={() => setShowPreVentas(true)}><Receipt size={15} /> Preventas {preVentas.length > 0 ? '(' + preVentas.length + ')' : ''}</button>}
      </PosToolbar>
      <PosCustomerTabs
        tabs={customerTabs.map(tab => {
          const currentCart = tab.id === activeCustomerTabId ? cart : tab.cart;
          return { id: tab.id, name: tab.name, originVendorName: tab.originVendorName,
            itemCount: currentCart.reduce((sum, item) => sum + item.cantidad, 0),
            total: fmtCLP(currentCart.reduce((sum, item) => sum + item.subtotal, 0)) };
        })}
        activeId={activeCustomerTabId} maxTabs={MAX_CUSTOMER_TABS}
        onSelect={switchCustomerTab} onRename={openRenameCustomerTab} onClose={closeCustomerTab} onNew={openNewCustomerTab}
      />

      {/* Banner: cajera en modo jefe_cobra */}
      {isCajera && modoVentaPOS === 'jefe_cobra' && (
        <div className="bg-amber-50 border-b border-amber-300 px-3 lg:px-6 py-2 flex items-center gap-2 text-amber-900 text-xs lg:text-sm">
          <Receipt size={14} className="text-amber-700 shrink-0" />
          <span><strong>Modo PRE-VENTA activo:</strong> al finalizar, se imprime un comprobante de pre-venta y el jefe debe cobrar. El stock queda reservado hasta que el jefe cobre o se anule la preventa.</span>
        </div>
      )}
      {/* Banner: jefe cobrando pre-venta */}
      {isJefe && cobrandoPreventaId && (
        <div className="bg-[#eaf5f1] border-b border-emerald-300 px-3 lg:px-6 py-2 flex items-center gap-2 text-emerald-900 text-xs lg:text-sm">
          <CheckCircle size={14} className="text-emerald-700 shrink-0" />
          <span><strong>Cobrando pre-venta {cobrandoPreventaId.slice(-6).toUpperCase()}:</strong> elige el método de pago y procesa. Al confirmar se generará un comprobante interno con el stock ya reservado.</span>
          <button
            onClick={() => { setCobrandoPreventaId(null); setCart([]); setDescuentoGlobalPct(0); }}
            className="ml-auto text-xs bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-md px-2 py-1 font-semibold"
          >Cancelar</button>
        </div>
      )}

      {/* ─── Main area: 3 columns (desktop) / tabs (mobile) ─────────────── */}
      <div ref={workspaceRef} data-pro={proMode} data-panel-resize={manualPanelResize} data-mobile-tab={mobileTab} data-has-cart={cart.length > 0} style={manualWorkspaceStyle} className={`${posLayout.workspace} flex-1 flex overflow-hidden min-h-0 lg:pb-0 ${cart.length > 0 && mobileTab === 'products' ? 'pb-[134px]' : 'pb-[70px]'}`}>

        {proMode && proSearchOpen && Boolean(searchTerm || selectedCategory) && (
          <button type="button" tabIndex={-1} aria-label="Cerrar búsqueda" className={posLayout.searchBackdrop} onClick={() => setProSearchOpen(false)} />
        )}

        {/* ═══ LEFT: Products search + grid ═══════════════════════════════ */}
        <div ref={productsPanelRef} data-pos="products" className={`flex-1 flex flex-col border-r border-gray-200  min-w-0 bg-gradient-to-b from-slate-50 to-slate-100/40   lg:bg-white  ${mobileTab !== 'products' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search bar */}
          <div ref={searchToolbarRef} data-pos="search-toolbar" className="p-3 lg:p-4 border-b border-slate-200  bg-white ">
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onFocus={() => setProSearchOpen(true)}
                onChange={e => { setSearchTerm(e.target.value); setSearchAddedSkus(new Set()); setProSearchOpen(true) }}
                aria-controls={proMode ? "pos-search-results" : undefined}
                aria-expanded={proMode ? proSearchOpen && Boolean(searchTerm || selectedCategory) : undefined}
                onKeyDown={handleSearchKeyDown}
                aria-label="Buscar producto por nombre, SKU o código de barras"
                placeholder="Buscar o escanear producto…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-9 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:bg-white text-sm lg:text-base font-medium transition-all"
                autoComplete="off"
              />
              {searchTerm && (
                <button onClick={() => { setSearchTerm(''); setSearchAddedSkus(new Set()); searchRef.current?.focus() }}
                  className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  title="Limpiar búsqueda">
                  <X size={18} />
                </button>
              )}
            </div>
            <div data-pos="search-tools" className="flex items-center justify-between gap-1.5 mt-1.5 flex-wrap">
              <div data-pos="mode-toggles" className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={toggleProMode}
                  aria-pressed={proMode}
                  aria-label={`Modo Pro: ${proMode ? 'activo' : 'desactivado'}. ${proMode ? 'Vista compacta' : 'Vista normal'}`}
                  data-pos="pro-mode-toggle"
                  title={proMode ? "Desactivar Modo Pro" : "Activar buscador amplio y carrito compacto"}
                  className={`hidden lg:inline-flex h-[30px] min-h-[30px] shrink-0 items-center gap-1.5 rounded-lg border px-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                    proMode
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-sm"
                  }`}
                >
                  <span
                    data-pos="pro-mode-icon"
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                      proMode ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    <Zap size={13} />
                  </span>
                  <span className="whitespace-nowrap text-[10px] font-extrabold leading-none">
                    Pro
                  </span>
                  <span
                    data-pos="pro-mode-switch"
                    aria-hidden="true"
                    className={`relative ml-0.5 h-4 w-7 rounded-full p-0.5 transition-colors ${
                      proMode ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                        proMode ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleAutoMode}
                  aria-pressed={autoMode}
                  aria-label={`Modo Auto: ${autoMode ? 'activo' : 'desactivado'}. ${autoMode ? 'Agrega automáticamente al encontrar un producto' : 'No agrega automáticamente'}`}
                  data-pos="auto-mode-toggle"
                  title={autoMode ? "Desactivar Modo Automático" : "Activar Modo Auto: auto-agrega al quedar 1 producto en búsqueda"}
                  className={`hidden lg:inline-flex h-[30px] min-h-[30px] shrink-0 items-center gap-1.5 rounded-lg border px-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 ${
                    autoMode
                      ? "border-rose-300 bg-rose-50 text-rose-950 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/50 hover:shadow-sm"
                  }`}
                >
                  <span
                    data-pos="auto-mode-icon"
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                      autoMode ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    <Sparkles size={13} />
                  </span>
                  <span className="whitespace-nowrap text-[10px] font-extrabold leading-none">
                    Auto
                  </span>
                  <span
                    data-pos="auto-mode-switch"
                    aria-hidden="true"
                    className={`relative ml-0.5 h-4 w-7 rounded-full p-0.5 transition-colors ${
                      autoMode ? "bg-rose-500" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                        autoMode ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleAskQtyMode}
                  aria-pressed={askQtyMode}
                  aria-label={`Pedir cantidad: ${askQtyMode ? 'activado' : 'desactivado'}. ${askQtyMode ? 'Pregunta cuántas unidades agregar' : 'Agrega una unidad directamente'}`}
                  data-pos="ask-qty-toggle"
                  title={askQtyMode ? "Desactivar Pedir Cantidad (agregar 1 ud directo sin preguntar)" : "Activar Pedir Cantidad (preguntar unidades antes de agregar)"}
                  className={`hidden lg:inline-flex h-[30px] min-h-[30px] shrink-0 items-center gap-1.5 rounded-lg border px-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
                    askQtyMode
                      ? "border-amber-300 bg-amber-50 text-amber-950 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-sm"
                  }`}
                >
                  <span
                    data-pos="ask-qty-icon"
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                      askQtyMode ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    <Hash size={13} />
                  </span>
                  <span className="whitespace-nowrap text-[10px] font-extrabold leading-none">
                    Cantidad
                  </span>
                  <span
                    data-pos="ask-qty-switch"
                    aria-hidden="true"
                    className={`relative ml-0.5 h-4 w-7 rounded-full p-0.5 transition-colors ${
                      askQtyMode ? "bg-amber-500" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                        askQtyMode ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => triggerFullCatalogRefresh(true)}
                disabled={loadingProducts}
                data-pos="catalog-refresh"
                aria-label="Actualizar stock y productos"
                className="ml-auto grid h-[30px] w-[30px] min-h-[30px] shrink-0 place-items-center rounded-md text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                title="Refrescar stock y productos desde la base de datos"
              >
                <RefreshCw size={16} className={loadingProducts ? 'animate-spin' : ''} />
              </button>
              {cashierSpaceView && (
                <button
                  type="button"
                  onClick={() => setCashierSpaceView(null)}
                  data-pos="cashier-hide"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition hover:opacity-75"
                  aria-label={`Ocultar ${cashierSpaceView === 'notes' ? 'notas' : 'foto de inspiración'}`}
                  title={`Ocultar ${cashierSpaceView === 'notes' ? 'notas' : 'inspiración'}`}
                >
                  <EyeOff size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Product list */}
          <div id="pos-search-results" ref={proResultsRef} data-pos="search-results" data-open={proSearchOpen && Boolean(searchTerm || selectedCategory)} className={`flex-1 min-h-0 overflow-y-auto ${cashierSpaceView === 'inspiration' && !searchTerm && !selectedCategory ? 'p-0' : 'p-3 lg:p-4'} space-y-2`}>
            {proMode && proSearchOpen && (searchTerm || selectedCategory) && (
              <div className="hidden lg:flex items-center justify-between border-b border-slate-100 pb-2 mb-2 ">
                <span className="text-sm font-bold text-slate-800 ">Elegir producto</span>
                <button type="button" onClick={() => { setSearchTerm(''); setSelectedCategory(''); setProSearchOpen(false) }} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 " aria-label="Cerrar resultados">
                  Volver al carrito <X size={16} />
                </button>
              </div>
            )}
            {loadingProducts && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-48 h-48 sm:w-64 sm:h-64">
                  <RefreshCw className='animate-spin' />
                </div>
                <p className="mt-4 text-sm text-gray-500  font-medium animate-pulse">Cargando productos...</p>
                {/* Barra de progreso indeterminada */}
                <div className="mt-3 w-48 sm:w-64 h-1.5 bg-gray-200  rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 animate-[loadingBar_1.5s_ease-in-out_infinite] rounded-full" style={{ width: '40%' }} />
                </div>
              </div>
            )}
            {!loadingProducts && !searchTerm && !selectedCategory && (
              cashierSpaceView ? (
                <PosCashierSpacePanel
                  view={cashierSpaceView}
                  cashierId={posUser?.id || 'default'}
                  cashierName={posUser?.nombre || 'Cajera'}
                  onClose={() => setCashierSpaceView(null)}
                />
              ) : effectivePosTheme.presetId === 'sakura-coquette' ? (
                <PosSakuraSearchEmptyHero />
              ) : isNekoPosTheme ? (
                hasMikanAnimations ? <PosNekoSearchEmptyHero nekoVariant={activeNekoVariant} /> : (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-5 py-10 text-center">
                    <div className="mb-4 grid h-20 w-20 place-items-center rounded-[26px] border shadow-sm" style={{ background: 'var(--pos-panel-bg)', borderColor: 'var(--pos-personal-accent-border)', color: 'var(--pos-accent)' }}>
                      <ThemeMascotEmblem presetId={effectivePosTheme.presetId} catDesign={effectivePosTheme.catDesign} customColors={effectivePosTheme.customColors} />
                    </div>
                    <span className="text-sm font-extrabold" style={{ color: 'var(--pos-ink-strong)' }}>El michi cuida esta caja</span>
                    <span className="mt-1 max-w-xs text-xs" style={{ color: 'var(--pos-muted)' }}>Busca un producto o escanea su código para comenzar la venta.</span>
                  </div>
                )
              ) : effectivePosTheme.presetId === 'capy-matcha' ? (
                <PosCapySearchEmptyHero />
              ) : effectivePosTheme.presetId === 'jasmine-lavender' ? (
                <PosJasmineSearchEmptyHero />
              ) : (
                <div className={posLayout.searchEmpty}>
                  <div className="w-16 h-16 rounded-2xl bg-slate-100  flex items-center justify-center mb-3 text-slate-500 shadow-xs">
                    <ScanBarcode size={32} strokeWidth={1.5} />
                  </div>
                  <span className="text-sm sm:text-base font-bold text-slate-700 ">Una venta empieza aquí</span>
                  <span className="text-xs text-slate-400  mt-1 max-w-xs text-center">
                    Busca por nombre o escanea un código. Enter agrega una coincidencia exacta; puedes seguir escaneando.
                  </span>
                </div>
              )
            )}
            {!loadingProducts && (searchTerm || selectedCategory) && filteredProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 ">
                <Package size={48} className="mb-3 opacity-40" />
                <span className="text-base lg:text-lg font-medium">{searchAddedSkus.size > 0 ? 'Ya está en tu venta' : 'No encontramos coincidencias'}</span>
                <span className="text-xs lg:text-sm text-gray-500  mt-1">
                  {searchAddedSkus.size > 0 ? 'Escanea otro producto o cambia la búsqueda para seguir.' : selectedCategory ? 'Prueba otra categoría o borra el filtro.' : 'Revisa el nombre, SKU o código de barras.'}
                </span>
              </div>
            )}
            {/* Header cuando hay categoría seleccionada */}
            {!loadingProducts && selectedCategory && !searchTerm && (
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-2">
                  <FolderOpen size={14} className="text-emerald-600" />
                  <h3 className="text-xs font-bold text-gray-700 ">{selectedCategory}</h3>
                  <span className="text-[9px] text-gray-400  bg-gray-100  px-1.5 py-0.5 rounded-full">{filteredProducts.length}</span>
                </div>
                <button
                  onClick={() => setSelectedCategory('')}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-rose-500 transition"
                >
                  <X size={11} /> Quitar filtro
                </button>
              </div>
            )}
            {/* Header cuando se busca por texto */}
            {!loadingProducts && searchTerm && filteredProducts.length > 0 && (
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-emerald-600" />
                  <h3 className="text-xs font-bold text-gray-700 ">Resultados de búsqueda</h3>
                  <span className="text-[9px] text-gray-400  bg-gray-100  px-1.5 py-0.5 rounded-full">{filteredProducts.length}</span>
                </div>
              </div>
            )}
            {/* Grilla adaptativa: 1 columna en pantallas POS/laptop donde el carrito y pago ocupan espacio, 2 en 2xl, 3 en pantallas gigantes */}
            {filteredProducts.length > 0 && (
              <div data-pos="search-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 min-[1900px]:grid-cols-3 gap-2.5">
                {filteredProducts.map((p, idx) => {
                  const selectedPrice = selectedPriceBySku[p.sku] || getDefaultPriceOption(p)?.field;
                  const reservation = getWebReservation(p);
                  const packageUnits = parseInt(String(p.packageQty || 0), 10);
                  return <PosProductCard
                    key={p.$id || p.sku + '_' + idx}
                    proMode={proMode}
                    name={p.nombre} sku={p.sku} image={p.imageUrl} stock={p.stock}
                    stockLabel={p.stock > 0 ? fmtN(p.stock) + ' disponibles' : 'Agotado'}
                    price={fmtCLP(getPrice(p, selectedPrice))}
                    prices={getPriceOptions(p).map(option => ({ field: option.field, label: option.label, formatted: fmtCLP(option.value) }))}
                    selectedPrice={selectedPrice}
                    cost={p.costo_uni > 0 ? fmtCLP(p.costo_uni) : undefined}
                    packageLabel={packageUnits > 0 ? 'Embalaje: ' + packageUnits + ' uds' : undefined}
                    boxCode={p.boxCode} barcode={p.codigo_barra}
                    reservation={reservation && reservation.qty > 0 ? {
                      label: reservation.qty + ' reservados web',
                      detail: reservation.orderCodes.length > 0
                        ? 'Pedidos: ' + reservation.orderCodes.join(', ')
                        : `${reservation.orderCount || 1} pedido(s) web; consultar al encargado`,
                    } : undefined}
                    onAdd={() => {
                      if (askQtyMode) {
                        openQuickQtyModal(p, selectedPrice)
                      } else {
                        addToCart(p, selectedPrice)
                        if (proMode) {
                          setProSearchOpen(false)
                          setSearchTerm('')
                          setSearchAddedSkus(new Set())
                        }
                      }
                    }}
                    onImage={() => openProductLightbox(p, p.imageUrl)}
                    onPriceChange={field => setSelectedPriceBySku(previous => ({ ...previous, [p.sku]: field }))}
                  />;
                })}
              </div>
            )}
          </div>

          {manualPanelResize && viewportSize.w >= 1024 && !proMode && <>
            <button type="button" data-pos="panel-resize-handle" aria-label="Cambiar ancho de productos" title="Arrastra para cambiar el ancho" className={`${posLayout.panelResizeWidth} ${posLayout.panelResizeRight}`} onPointerDown={beginManualPanelResize('products-width')} onPointerMove={updateManualPanelResize} onPointerUp={finishManualPanelResize} onPointerCancel={finishManualPanelResize} onLostPointerCapture={finishManualPanelResize}><span aria-hidden="true" /></button>
            <button type="button" data-pos="panel-resize-handle" aria-label="Cambiar alto de productos" title="Arrastra para cambiar el alto" className={posLayout.panelResizeHeight} onPointerDown={beginManualPanelResize('products-height')} onPointerMove={updateManualPanelResize} onPointerUp={finishManualPanelResize} onPointerCancel={finishManualPanelResize} onLostPointerCapture={finishManualPanelResize}><span aria-hidden="true" /></button>
          </>}
        </div>

        {/* ═══ CENTER: Cart ═══════════════════════════════════════════════ */}
        <div ref={cartPanelRef} data-pos="cart" className={`w-full lg:w-[360px] min-[1200px]:w-[420px] xl:w-[430px] 2xl:w-[470px] h-full flex flex-col min-h-0 bg-white  border-r border-slate-200  lg:shrink-0 ${mobileTab !== 'cart' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Cart header (ultra compacto) */}
          <div data-pos="cart-header" className="relative z-30 flex items-center justify-between px-3 py-1.5 border-b border-slate-200  bg-white  shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-6 h-6 rounded-md bg-emerald-100  flex items-center justify-center shrink-0">
                <ShoppingCart size={13} className="text-emerald-700 " />
              </div>
              <span className="font-bold text-sm text-gray-900 truncate">Venta actual</span>
              {totalItemsCount > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0">{totalItemsCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={compactCart}
                onClick={toggleCompactCart}
                title={compactCart ? "Modo compacto activo (sin fotos). Toca para ver fotos" : "Compactar tarjetas (sin fotos, más espacio en pantalla)"}
                className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-lg border text-xs font-semibold transition cursor-pointer select-none ${
                  compactCart
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-[11px] font-bold">Compacto</span>
                <span
                  aria-hidden="true"
                  className={`relative inline-block h-4 w-7 rounded-full p-0.5 transition-colors ${
                    compactCart ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`block h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${
                      compactCart ? "translate-x-3" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>



              <button
                type="button"
                onClick={() => {
                  if (cart.length === 0) {
                    showToast('Agrega productos al carrito para imprimir etiquetas', 'err');
                    return;
                  }
                  setShowCartLabelsModal(true);
                }}
                disabled={cart.length === 0}
                title={cart.length === 0 ? "Agrega productos al carrito para imprimir etiquetas PDF" : "Imprimir etiquetas de precios en PDF para los productos del carrito actual"}
                className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-lg border text-xs font-semibold transition cursor-pointer select-none ${
                  cart.length > 0
                    ? "bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100 hover:border-sky-400 shadow-2xs active:scale-95"
                    : "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                }`}
              >
                <Printer size={13} className={cart.length > 0 ? "text-sky-700" : "text-slate-400"} />
                <span className="text-[11px] font-bold">PDF</span>
                {cart.length > 0 && (
                  <span className="bg-sky-600 text-white text-[10px] px-1 rounded-full font-bold leading-tight">
                    {cart.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={manualPanelResize}
                onClick={toggleManualPanelResize}
                title={manualPanelResize ? "Ajuste manual de paneles activo. Toca para desactivar" : "Activar ajuste manual de ancho y alto de paneles"}
                className={`hidden lg:inline-flex items-center gap-1.5 py-0.5 px-2 rounded-lg border text-xs font-semibold transition cursor-pointer select-none ${
                  manualPanelResize
                    ? "bg-teal-50 border-teal-300 text-teal-900 shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-[11px] font-bold">Paneles</span>
                <span
                  aria-hidden="true"
                  className={`relative inline-block h-4 w-7 rounded-full p-0.5 transition-colors ${
                    manualPanelResize ? "bg-teal-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`block h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${
                      manualPanelResize ? "translate-x-3" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>

              {/* Botón e interruptor de Escala / Resize de pantalla para monitores 1024 / 1200 / 1366x768 */}
              <div ref={scaleMenuRef} className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => setShowScaleMenu(prev => !prev)}
                  aria-expanded={showScaleMenu}
                  title="Ajustar tamaño y escala de todo el POS (Automático o Manual para monitores 1366x768, 1200px, 1024px)"
                  className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-lg border text-xs font-semibold transition cursor-pointer select-none ${
                    showScaleMenu || effectiveScalePct < 100
                      ? "bg-teal-50 border-teal-300 text-teal-900 shadow-2xs"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {effectiveScalePct < 100 ? (
                    <Minimize2 size={11} className="text-teal-700 shrink-0" />
                  ) : (
                    <Maximize2 size={11} className="text-slate-500 shrink-0" />
                  )}
                  <span className="text-[11px] font-bold">
                    {posScaleMode === 'auto' ? `Auto ${effectiveScalePct}%` : `${effectiveScalePct}%`}
                  </span>
                </button>

                {showScaleMenu && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-[296px] rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xl shadow-2xl p-3 text-slate-800 z-50 select-none"
                    style={{ boxShadow: '0 20px 44px -10px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(15, 23, 42, 0.05)' }}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          <Minimize2 size={13} className="text-teal-600" />
                          <span>Escala de Pantalla POS</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Ventana: <strong className="text-slate-700">{viewportSize.w}×{viewportSize.h}px</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowScaleMenu(false)}
                        className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
                        title="Cerrar"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {/* 1. Modo Automático */}
                    <button
                      type="button"
                      onClick={() => selectPosScaleMode('auto')}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer mb-2.5 ${
                        posScaleMode === 'auto'
                          ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-extrabold">1. Ajuste Automático</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                            posScaleMode === 'auto' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {autoScalePct}%
                          </span>
                        </div>
                        <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                          Adapta todo el POS según el monitor ({viewportSize.w <= 1400 ? 'Monitor compacto detectado' : 'Pantalla amplia'})
                        </span>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          posScaleMode === 'auto' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {posScaleMode === 'auto' && <Check size={10} />}
                      </span>
                    </button>

                    {/* 2. Modo Manual */}
                    <div
                      className={`p-2.5 rounded-xl border transition ${
                        posScaleMode === 'manual'
                          ? 'bg-teal-50/50 border-teal-300'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-extrabold text-slate-800">2. Tamaño Manual</span>
                        <span className="text-[11px] font-black text-teal-700 bg-teal-100/80 px-1.5 py-0.2 rounded-md tabular-nums">
                          {posScaleMode === 'manual' ? `${posManualScale}%` : `${effectiveScalePct}%`}
                        </span>
                      </div>

                      {/* Barra deslizante + botones - / + */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <button
                          type="button"
                          onClick={() => selectPosScaleMode('manual', (posScaleMode === 'manual' ? posManualScale : effectiveScalePct) - 3)}
                          className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold transition cursor-pointer shrink-0 active:scale-95"
                          title="Reducir tamaño (-3%)"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="range"
                          min={70}
                          max={105}
                          step={1}
                          value={posScaleMode === 'manual' ? posManualScale : effectiveScalePct}
                          onChange={e => selectPosScaleMode('manual', Number(e.target.value))}
                          className="flex-1 accent-teal-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                          aria-label="Porcentaje de escala del POS"
                        />
                        <button
                          type="button"
                          onClick={() => selectPosScaleMode('manual', (posScaleMode === 'manual' ? posManualScale : effectiveScalePct) + 3)}
                          className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold transition cursor-pointer shrink-0 active:scale-95"
                          title="Aumentar tamaño (+3%)"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Presets por resolución de monitor de cajera */}
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { pct: 75, label: '75%', sub: '1024px' },
                          { pct: 80, label: '80%', sub: '1200px' },
                          { pct: 85, label: '85%', sub: '1366×768' },
                          { pct: 90, label: '90%', sub: '1440px' },
                          { pct: 95, label: '95%', sub: '1600px' },
                          { pct: 100, label: '100%', sub: 'Normal' },
                        ].map(preset => {
                          const isSelected = posScaleMode === 'manual' && posManualScale === preset.pct
                          return (
                            <button
                              key={preset.pct}
                              type="button"
                              onClick={() => selectPosScaleMode('manual', preset.pct)}
                              className={`py-1 px-1.5 rounded-lg border text-center transition cursor-pointer ${
                                isSelected
                                  ? 'bg-teal-600 border-teal-600 text-white shadow-2xs'
                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="text-[11px] font-extrabold leading-none">{preset.label}</div>
                              <div className={`text-[8.5px] font-semibold mt-0.5 leading-none ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                                {preset.sub}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className={`mt-2 p-2.5 rounded-xl border transition ${manualPanelResize ? 'bg-teal-50/60 border-teal-300' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold text-slate-800">3. Tamaño manual de paneles</span>
                          <span className="block text-[9px] text-slate-500 mt-0.5 leading-tight">Ajusta productos, carrito y cobro con el mouse</span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={manualPanelResize}
                          aria-label={manualPanelResize ? 'Desactivar ajuste manual de paneles' : 'Activar ajuste manual de paneles'}
                          onClick={toggleManualPanelResize}
                          className={`shrink-0 rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition ${manualPanelResize ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {manualPanelResize ? 'Activo' : 'Activar'}
                        </button>
                      </div>
                      {manualPanelResize && (
                        <p className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-[9px] leading-relaxed text-slate-600">
                          Arrastra las asas laterales para el ancho y las inferiores para el alto. Se guardan en este equipo.
                        </p>
                      )}
                    </div>

                    {/* 4. Compactar márgenes + Acción rápida */}
                    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={posExtraDense}
                        onClick={togglePosExtraDense}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 transition cursor-pointer text-left"
                      >
                        <div>
                          <span className="block text-[10.5px] font-bold text-slate-800">Compactar bordes y paneles</span>
                          <span className="block text-[9px] text-slate-400">Reduce rellenos de barra, buscador y pago</span>
                        </div>
                        <span
                          className={`relative inline-block h-4 w-7 rounded-full p-0.5 transition-colors shrink-0 ${
                            posExtraDense ? 'bg-teal-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`block h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${
                              posExtraDense ? 'translate-x-3' : 'translate-x-0'
                            }`}
                          />
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          selectPosScaleMode('manual', 82)
                          if (!posExtraDense) togglePosExtraDense()
                          if (!compactCart) toggleCompactCart()
                          setShowScaleMenu(false)
                        }}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[10.5px] font-extrabold shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.99]"
                      >
                        <Zap size={12} />
                        <span> Súper Compacto (82% + Lista delgada)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <button onClick={() => { setCart([]); setDescuentoGlobalPct(0); setPagos([]) }}
                  className="text-red-500 hover:text-red-600 text-xs flex items-center gap-1 font-medium transition py-0.5 px-1.5 rounded hover:bg-red-50 cursor-pointer">
                  <Trash2 size={12} /> Vaciar
                </button>
              )}
              {cart.length === 0 && lastSavedCart && (
                <button onClick={restoreLastCart}
                  className="text-blue-600 hover:text-blue-700 text-xs flex items-center gap-1 font-medium transition py-0.5 px-1.5 rounded hover:bg-blue-50 cursor-pointer">
                  <RotateCcw size={12} /> Recuperar
                </button>
              )}
            </div>
          </div>

          {/* Banner de cotización enviada por vendedor */}
          {(() => {
            const activeTab = customerTabs.find(t => t.id === activeCustomerTabId)
            if (!activeTab?.originVendorName) return null
            return (
              <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-blue-50 to-sky-50   border-b border-blue-200  text-xs shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Send size={13} className="text-blue-600  shrink-0" />
                  <span className="text-blue-950  truncate">
                    <strong>{activeTab.originVendorName}</strong> mandó cotización para <strong>{activeTab.name}</strong>
                  </span>
                </div>
                <span className="text-[10px] bg-blue-500 text-white font-extrabold px-1.5 py-0.2 rounded-full shrink-0 shadow-sm ml-2">
                  Cotización
                </span>
              </div>
            )
          })()}

          {/* Cart items cards */}
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          {effectivePosTheme.presetId === 'sakura-coquette' && (
            <PosSakuraAmbientField variant="cart" />
          )}
          {hasMikanAnimations && (
            <PosNekoAmbientField variant="cart" nekoVariant={activeNekoVariant} />
          )}
          {effectivePosTheme.presetId === 'capy-matcha' && (
            <PosCapyAmbientField variant="cart" />
          )}
          {effectivePosTheme.presetId === 'jasmine-lavender' && (
            <PosJasmineAmbientField variant="cart" />
          )}
          <div data-pos="cart-items" className="relative z-10 flex-1 min-h-0 overflow-y-auto bg-slate-100/70  p-1.5 sm:p-2 space-y-1.5">
            {cart.length === 0 ? (
              effectivePosTheme.presetId === 'sakura-coquette' ? (
                <PosSakuraCartEmptyArt />
              ) : isNekoPosTheme ? (
                hasMikanAnimations ? <PosNekoCartEmptyArt nekoVariant={activeNekoVariant} /> : (
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-4 py-10 text-center">
                    <div className="mb-3 grid h-[76px] w-[76px] place-items-center rounded-[25px] border" style={{ background: 'var(--pos-panel-bg)', borderColor: 'var(--pos-personal-accent-border)' }}>
                      <ThemeMascotEmblem presetId={effectivePosTheme.presetId} catDesign={effectivePosTheme.catDesign} customColors={effectivePosTheme.customColors} />
                    </div>
                    <span className="text-sm font-extrabold" style={{ color: 'var(--pos-ink-strong)' }}>El michi espera tu primera venta</span>
                    <span className="mt-1 text-xs" style={{ color: 'var(--pos-muted)' }}>Agrega un producto para llenar el carrito.</span>
                  </div>
                )
              ) : effectivePosTheme.presetId === 'capy-matcha' ? (
                <PosCapyCartEmptyArt />
              ) : effectivePosTheme.presetId === 'jasmine-lavender' ? (
                <PosJasmineCartEmptyArt />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400  py-12">
                  <ShoppingCart size={36} className="mb-2 opacity-20" />
                  <span className="text-sm font-medium text-gray-500 ">Carrito vacío</span>
                  <span className="text-xs text-gray-400  mt-0.5">Busca por nombre y agrega productos al carrito</span>
                </div>
              )
            ) : (
              <div
                data-pos={compactCart ? "cart-grid-compact" : "cart-grid"}
                className={compactCart ? "bg-white border-y border-slate-200 divide-y divide-slate-100 overflow-hidden" : "space-y-1"}
              >
                {compactCart && (
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-500 border-t-2 border-emerald-500 border-b border-slate-200 bg-white select-none">
                    <span className="w-[74px] shrink-0 text-center">Cant.</span>
                    <span className="flex-1 min-w-0">Detalle</span>
                    <span className="shrink-0 w-24 sm:w-28 text-center">Precio Prod.</span>
                    <span className="shrink-0 w-14 sm:w-16 text-right">Sub Total</span>
                    <span className="w-4 shrink-0" />
                  </div>
                )}
                {cart.map((item, idx) => {
                  const product = (item.productId ? products.get(item.productId) : null) || products.get(item.sku) || products.get(normSku(item.sku));
                  const itemImageUrl = item.imageUrl || product?.imageUrl;
                  const rawPkgQty = item.packageQty || product?.packageQty;
                  const pkgUnits = rawPkgQty ? parseInt(String(rawPkgQty), 10) : 0;
                  const priceOptions = product ? getPriceOptions(product) : [];
                  const selectedPriceOption = priceOptions.find(option => option.field === item.priceField);
                  const selectedPriceChanged = !!selectedPriceOption && Math.round(Number(selectedPriceOption.value)) !== Math.round(Number(item.precioUnitario));
                  const totalStock = stockMap.has(item.sku) ? (stockMap.get(item.sku) ?? item.stockDisponible) : item.stockDisponible;
                  const remainingStock = totalStock - item.cantidad;

                  if (compactCart) {
                    return (
                      <div
                        key={`${item.sku}-${item.priceField || 'default'}`}
                        data-pos="cart-row-compact"
                        className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-50/90 transition-colors"
                      >
                        {/* 1. Cantidad: Sin contenedor circular/rosa/gris */}
                        <div className="w-[74px] shrink-0 flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.sku, item.priceField, -1)}
                            className="w-5.5 h-5.5 rounded-md bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            aria-label="Restar 1"
                            title="Restar 1"
                          >
                            <Minus size={11} className="stroke-[2.5]" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.cantidad === 0 ? '0' : String(item.cantidad)}
                            onFocus={e => e.target.select()}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 5)
                              const parsed = raw === '' ? 0 : parseInt(raw, 10)
                              setCartQty(item.sku, item.priceField, parsed)
                            }}
                            onWheel={e => e.currentTarget.blur()}
                            className={`w-7 h-5.5 text-center text-xs font-black p-0 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded border transition-colors ${
                              item.cantidad === 0
                                ? 'bg-rose-50 text-rose-700 border-rose-300 font-extrabold ring-1 ring-rose-200'
                                : 'text-slate-900 border-transparent bg-transparent hover:border-slate-300 focus:border-emerald-500'
                            }`}
                            style={{ outline: 'none', boxShadow: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.sku, item.priceField, 1)}
                            className="w-5.5 h-5.5 rounded-md bg-emerald-600 hover:bg-emerald-700 active:scale-90 text-white flex items-center justify-center transition cursor-pointer"
                            aria-label="Sumar 1"
                            title="Sumar 1"
                          >
                            <Plus size={11} className="stroke-[2.5]" />
                          </button>
                        </div>

                        {/* 2. Detalle (Nombre + subtítulo) */}
                        <div className="flex-1 min-w-0 pr-1">
                          <h4 className="text-[11px] font-bold text-slate-900 truncate leading-tight uppercase" title={item.nombre}>
                            {item.nombre}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[9.5px] text-slate-500 font-medium leading-none mt-0.5">
                            <span className="font-mono text-slate-500">{item.sku}</span>
                            {pkgUnits > 0 && <span className="text-sky-700 font-bold">· {pkgUnits}u/emb</span>}
                            {remainingStock <= 0 ? (
                              <span className="text-red-500 font-bold">· Venta Sin Stock</span>
                            ) : remainingStock <= 5 ? (
                              <span className="text-amber-600 font-bold">· Quedan {remainingStock}</span>
                            ) : null}
                          </div>
                        </div>

                        {/* 3. Precio Prod. + Icono de imagen (ampliado) */}
                        <div className="shrink-0 w-24 sm:w-28 flex items-center justify-center gap-1.5">
                          {product && priceOptions.length > 1 ? (
                            <select
                              aria-label={`Lista de precios de ${item.nombre}`}
                              value={selectedPriceChanged ? `__saved__:${item.priceField}` : (item.priceField || getDefaultPriceOption(product)?.field || '')}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setCartPriceField(item.sku, item.priceField, e.target.value)}
                              className="flex-1 min-w-0 bg-white border border-slate-300 hover:border-slate-400 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-slate-700 truncate focus:outline-none cursor-pointer shadow-2xs text-center"
                            >
                              {(item.priceField === 'precio_historico' || item.priceField === 'precio_emergencia' || selectedPriceChanged) && (
                                <option value={selectedPriceChanged ? `__saved__:${item.priceField}` : (item.priceField || 'precio_historico')}>
                                  {item.priceField === 'precio_emergencia' ? `⚡ ${fmtCLP(item.precioUnitario)}` : fmtCLP(item.precioUnitario)}
                                </option>
                              )}
                              {priceOptions.map((opt) => (
                                <option key={opt.field} value={selectedPriceChanged && opt.field === item.priceField ? `__current__:${opt.field}` : opt.field}>
                                  {fmtCLP(opt.value)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex-1 min-w-0 bg-white border border-slate-300 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-slate-700 text-center truncate shadow-2xs">
                              {item.priceField === 'precio_emergencia' ? `⚡ ${fmtCLP(item.precioUnitario)}` : fmtCLP(item.precioUnitario)}
                            </div>
                          )}

                          {/* Icono de imagen interactivo (más grandecito) */}
                          {itemImageUrl || isNivelAlto ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openProductLightbox((product || { sku: item.sku, nombre: item.nombre }) as any, itemImageUrl)
                              }}
                              onMouseEnter={(e) => showCartItemHoverPreview(e, itemImageUrl, item.nombre)}
                              onMouseLeave={() => setHoveredImagePreview(null)}
                              className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 flex items-center justify-center transition cursor-pointer shadow-2xs shrink-0 active:scale-95"
                              title={itemImageUrl ? `Ver foto de ${item.nombre}` : `Editar ${item.nombre}`}
                              aria-label={itemImageUrl ? `Ver foto de ${item.nombre}` : `Editar ${item.nombre}`}
                            >
                              <ImageIcon size={15} className="stroke-[2.2]" />
                            </button>
                          ) : (
                            <div className="w-7 h-7 shrink-0" />
                          )}
                        </div>

                        {/* 4. Sub Total */}
                        <div className="shrink-0 w-14 sm:w-16 text-right">
                          <strong className="text-xs font-bold text-slate-800 tabular-nums">
                            {fmtCLP(item.subtotal)}
                          </strong>
                        </div>

                        {/* 5. Eliminar (X) */}
                        <div className="w-4 shrink-0 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.sku, item.priceField)}
                            className="text-slate-400 hover:text-red-500 rounded-full p-0.5 hover:bg-red-50 transition cursor-pointer"
                            title="Quitar del carrito"
                            aria-label={`Quitar ${item.nombre}`}
                          >
                            <XCircle size={13} className="stroke-[1.75]" />
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                  <div
                    key={`${item.sku}-${item.priceField || 'default'}`}
                    data-pos="cart-card"
                    className="rounded-xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 hover:shadow-sm transition-all p-2.5 sm:p-3"
                  >
                    {/* Top: Imagen + Info (Nombre + Badges) + Quitar */}
                    <div className="flex items-center gap-2.5">
                      {/* Imagen del producto (modo normal) */}
                      {itemImageUrl ? (
                        <div
                          className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-xl overflow-hidden bg-slate-50 border border-slate-200/90 flex items-center justify-center group/img shadow-2xs"
                          onMouseEnter={(e) => showCartItemHoverPreview(e, itemImageUrl, item.nombre)}
                          onMouseLeave={() => setHoveredImagePreview(null)}
                        >
                          <img
                            src={itemImageUrl}
                            alt={item.nombre}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            onClick={() => { if (product) openProductLightbox(product, itemImageUrl) }}
                            className="absolute inset-0 bg-black/0 hover:bg-black/40 transition flex items-center justify-center text-white opacity-0 group-hover/img:opacity-100 cursor-pointer"
                            title="Ampliar imagen"
                          >
                            <Maximize2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { if (product && isNivelAlto) openProductLightbox(product) }}
                          className={`w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-xl bg-slate-100 border border-slate-200/90 flex items-center justify-center text-slate-300 ${isNivelAlto ? 'hover:border-teal-300 hover:text-teal-600 cursor-pointer transition' : ''}`}
                          title={isNivelAlto ? `Editar ${item.nombre}` : item.nombre}
                        >
                          <Package size={22} />
                        </button>
                      )}

                      {/* Info principal: Título, SKU, Embalaje, Stock */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-bold text-slate-900 leading-snug text-xs sm:text-sm line-clamp-2" title={item.nombre}>
                            {item.nombre}
                          </h4>
                          <button
                            onClick={() => removeFromCart(item.sku, item.priceField)}
                            className="text-slate-400 hover:text-red-500 transition p-0.5 -mr-0.5 rounded hover:bg-red-50 shrink-0 cursor-pointer"
                            aria-label={`Quitar ${item.nombre} del carrito`}
                            title="Quitar del carrito"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {/* Badges: SKU + EMBALAJE + Stock */}
                        <div data-pos="cart-meta" className="flex items-center gap-1 flex-wrap mt-1">
                          <span className="font-mono text-[9px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded font-semibold leading-none">
                            {item.sku}
                          </span>

                          {/* 📦 Cantidad por Embalaje destacado */}
                          {pkgUnits > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-sky-800 bg-sky-50 border border-sky-200 px-1 py-0.2 rounded leading-none"
                              title={`Cantidad por embalaje / caja cerrada: ${pkgUnits} unidades`}
                            >
                              <Package size={8} className="text-sky-600 shrink-0" />
                              <span>Emb: {pkgUnits}u</span>
                              {item.cantidad >= pkgUnits && (
                                <span className="text-[8px] text-sky-600 font-extrabold ml-0.5">
                                  ({(item.cantidad / pkgUnits).toFixed(1).replace('.0', '')} emb)
                                </span>
                              )}
                            </span>
                          )}

                          {/* Stock disponible / deudor */}
                          <span className={`text-[9px] font-semibold px-1 py-0.2 rounded leading-none ${
                            remainingStock < 0
                              ? 'bg-red-100 text-red-700 font-bold'
                              : remainingStock <= 5
                              ? 'bg-amber-100 text-amber-700 font-bold'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            Stock: <span className="font-bold">{remainingStock}</span>/{totalStock}
                          </span>

                          {item.cantidad <= 0 && (
                            <span className="text-[9px] font-extrabold text-rose-700 bg-rose-100 border border-rose-300 px-1.5 py-0.2 rounded leading-none">
                              ⚠️ 0 UDS (AJUSTAR PARA COBRAR)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom: Barra horizontal unificada de cantidad + caja + precio + subtotal */}
                    <div data-pos="cart-controls" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-t border-slate-100 pt-1.5 2xl:flex 2xl:justify-between 2xl:gap-1.5 mt-2">
                      {/* Controles de cantidad: - [qty] + y +1 Caja */}
                      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 2xl:shrink-0">
                        {/* Controles de cantidad: Sin contenedor circular/rosa/gris */}
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.sku, item.priceField, -1)}
                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            aria-label={`Restar una unidad de ${item.nombre}`} title="Restar 1"
                          >
                            <Minus size={11} className="stroke-[2.5]" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.cantidad === 0 ? '0' : String(item.cantidad)}
                            onFocus={e => e.target.select()}
                            aria-label={`Cantidad de ${item.nombre}`}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 5)
                              const parsed = raw === '' ? 0 : parseInt(raw, 10)
                              setCartQty(item.sku, item.priceField, parsed)
                            }}
                            onWheel={e => e.currentTarget.blur()}
                            className={`w-9 sm:w-10 h-6 text-center text-xs font-black p-0 leading-none rounded border transition-colors ${
                              item.cantidad === 0
                                ? 'bg-rose-50 text-rose-700 border-rose-300 font-extrabold ring-1 ring-rose-200'
                                : 'text-slate-900 border-slate-200 bg-white hover:border-slate-300 focus:border-emerald-500'
                            }`}
                            style={{ outline: 'none', boxShadow: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.sku, item.priceField, 1)}
                            className="w-6 h-6 rounded-md bg-emerald-600 hover:bg-emerald-700 active:scale-90 text-white flex items-center justify-center transition cursor-pointer"
                            aria-label={`Sumar una unidad de ${item.nombre}`} title="Sumar 1"
                          >
                            <Plus size={11} className="stroke-[2.5]" />
                          </button>
                        </div>

                        {pkgUnits > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextPkgQty = (item.cantidad < pkgUnits || item.cantidad % pkgUnits !== 0)
                                ? pkgUnits
                                : item.cantidad + pkgUnits
                              setCartQty(item.sku, item.priceField, nextPkgQty)
                            }}
                            className="h-7 px-2 rounded-lg bg-sky-50  hover:bg-sky-100  text-sky-800  text-[10px] font-black border border-sky-200  transition flex items-center gap-1 active:scale-95 shadow-2xs whitespace-nowrap shrink-0"
                            title={`Fijar o sumar embalaje completo (${pkgUnits} uds)`}
                          >
                            <Plus size={9} className="stroke-[2.5]" />
                            <span>{proMode ? `${pkgUnits}u` : `+1 Caja (${pkgUnits}u)`}</span>
                          </button>
                        )}
                      </div>

                      {/* Selector de precio o etiqueta */}
                      <div data-pos="cart-price" className="col-span-2 row-start-2 w-full min-w-0 max-w-none text-left 2xl:col-span-1 2xl:row-auto 2xl:flex-1 2xl:max-w-[155px] 2xl:text-center">
                        {product && priceOptions.length > 1 ? (
                          <select
                            aria-label={`Lista de precios de ${item.nombre}`}
                            value={selectedPriceChanged ? `__saved__:${item.priceField}` : (item.priceField || getDefaultPriceOption(product)?.field || '')}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onChange={(e) => setCartPriceField(item.sku, item.priceField, e.target.value)}
                            className="w-full bg-slate-50  border border-slate-200  rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-800  focus:outline-none focus:border-emerald-500 touch-manipulation truncate"
                          >
                            {(item.priceField === 'precio_historico' || item.priceField === 'precio_emergencia' || selectedPriceChanged) && (
                              <option value={selectedPriceChanged ? `__saved__:${item.priceField}` : (item.priceField || 'precio_historico')} key={`historico-${item.priceField || item.sku}`}>
                                {item.priceField === 'precio_emergencia'
                                  ? `⚡ Emergencia · ${fmtCLP(item.precioUnitario)}`
                                  : `${item.priceLabel || selectedPriceOption?.label || 'Precio original'} · ${fmtCLP(item.precioUnitario)} (guardado)`}
                              </option>
                            )}
                            {priceOptions.map((opt) => (
                              <option key={opt.field} value={selectedPriceChanged && opt.field === item.priceField ? `__current__:${opt.field}` : opt.field}>
                                {opt.label} · {fmtCLP(opt.value)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-[10px] text-slate-500  font-medium truncate" title={`${item.priceLabel || 'Precio'}: ${fmtCLP(item.precioUnitario)} c/u`}>
                            {item.priceField === 'precio_emergencia' && <span className="text-amber-600 font-extrabold mr-1">⚡ Emergencia</span>}
                            <strong className="text-slate-800  font-bold">{fmtCLP(item.precioUnitario)}</strong> c/u
                          </div>
                        )}
                      </div>

                      {/* Subtotal */}
                      <div data-pos="cart-subtotal" className="col-start-2 row-start-1 shrink-0 text-right 2xl:col-auto 2xl:row-auto">
                        <span className="text-xs sm:text-sm font-black text-emerald-600  leading-none tabular-nums">
                          {fmtCLP(item.subtotal)}
                        </span>
                        {item.descuentoPct > 0 && <small className="block text-[10px] text-slate-500 mt-1">Descuento {item.descuentoPct}% incluido</small>}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
          </div>

          {/* Cart totals (ultra compacto) */}
          {cart.length > 0 && (
            <div data-pos="cart-total" className="mt-auto shrink-0 border-t border-slate-200  bg-white  px-3 py-1.5 sm:px-4 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] ">
              {descuentoGlobalMonto > 0 && <div className={posLayout.discountSummary}>
                <span>Subtotal</span><strong>{fmtCLP(subtotalCart)}</strong>
                <span>Descuento ({descuentoGlobalPct}%)</span><strong>−{fmtCLP(descuentoGlobalMonto)}</strong>
              </div>}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-black text-slate-700  uppercase tracking-wider">TOTAL</span>
                  <span className="text-[11px] text-slate-400  font-medium">({totalItemsCount} {totalItemsCount === 1 ? 'ítem' : 'ítems'})</span>
                </div>
                <div className="text-right">
                  <span className="text-lg sm:text-xl font-black text-emerald-600  tabular-nums leading-none">
                    {fmtCLP(totalCart)}
                  </span>
                </div>
              </div>
              {/* Botón directo para pasar a cobrar en móvil cuando está en la pestaña Carrito */}
              <button
                type="button"
                onClick={() => setMobileTab('payment')}
                className="w-full mt-1.5 py-2.5 rounded-xl bg-[#087f73] hover:bg-[#06695f] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 lg:hidden active:scale-[0.98] transition"
              >
                {isVendedora ? <><Send size={16} /> Enviar a Cajera ({fmtCLP(totalCart)})</> : <><Receipt size={16} /> Continuar al Cobro ({fmtCLP(totalCart)})</>}
              </button>
            </div>
          )}
          {manualPanelResize && viewportSize.w >= 1024 && <>
            {!proMode && <button type="button" data-pos="panel-resize-handle" aria-label="Cambiar ancho del carrito" title="Arrastra para cambiar el ancho" className={`${posLayout.panelResizeWidth} ${posLayout.panelResizeRight}`} onPointerDown={beginManualPanelResize('cart-width')} onPointerMove={updateManualPanelResize} onPointerUp={finishManualPanelResize} onPointerCancel={finishManualPanelResize} onLostPointerCapture={finishManualPanelResize}><span aria-hidden="true" /></button>}
            <button type="button" data-pos="panel-resize-handle" aria-label="Cambiar alto del carrito" title="Arrastra para cambiar el alto" className={posLayout.panelResizeHeight} onPointerDown={beginManualPanelResize('cart-height')} onPointerMove={updateManualPanelResize} onPointerUp={finishManualPanelResize} onPointerCancel={finishManualPanelResize} onLostPointerCapture={finishManualPanelResize}><span aria-hidden="true" /></button>
          </>}
        </div>

        {/* ═══ RIGHT: Payment panel ═══════════════════════════════════════ */}
        <div ref={paymentPanelRef} data-pos="payment" className={`w-full lg:w-[280px] xl:w-[300px] 2xl:w-[330px] flex-col bg-white  lg:shrink-0 min-h-0 overflow-y-auto border-l border-gray-200  ${mobileTab !== 'payment' ? 'hidden lg:flex' : 'flex'}`}>

          {/* ── Vendedora: cajera selection + client ─────────────────────── */}
          {isVendedora ? (
          <div data-pos="seller-payment" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div data-pos="payment-scroll">
            {/* Total summary */}
            <div className="px-5 py-4 border-b border-gray-100  bg-gradient-to-r from-blue-50/50 to-indigo-50/50  ">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500  font-semibold mb-0.5">Total a enviar</div>
                <div className="text-3xl font-black text-gray-900 ">{fmtCLP(totalCart)}</div>
                <div className="text-xs text-gray-500  mt-0.5">{totalItemsCount} producto{totalItemsCount > 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Select cajera */}
            <div className="px-5 py-4 border-b border-gray-100 ">
              <div className="text-xs font-bold text-gray-700  uppercase tracking-wide mb-3">Seleccionar cajera</div>
              <div className="flex gap-2.5 justify-center flex-wrap">
                {availableCashiers.map(caj => {
                  const selected = vendedoraSelectedCajera === caj.id
                  return (
                    <button
                      key={caj.id}
                      aria-pressed={selected}
                      onClick={() => setVendedoraSelectedCajera(selected ? null : caj.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all w-28 ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50  shadow-lg shadow-emerald-500/20 scale-105'
                          : 'border-gray-200  bg-white  hover:border-emerald-300 '
                      }`}
                    >
                      {caj.fotoUrl ? (
                        <img src={caj.fotoUrl} alt={caj.nombre} className={`w-14 h-14 rounded-full object-cover ring-2 ${selected ? 'ring-emerald-400' : 'ring-gray-200 '}`} />
                      ) : (
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white ${selected ? 'bg-emerald-500' : 'bg-gradient-to-br from-emerald-400 to-teal-500'}`}>
                          {caj.nombre.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className={`text-xs font-semibold truncate w-full text-center ${selected ? 'text-emerald-700 ' : 'text-gray-700 '}`}>{caj.nombre.split(' ')[0]}</span>
                      {selected && <Check size={14} className="text-emerald-600 " />}
                    </button>
                  )
                })}
                {availableCashiers.length === 0 && (
                  <p className="text-xs text-gray-400  text-center py-2">No hay cajeras disponibles</p>
                )}
              </div>
            </div>

            {/* Client toggle + name */}
            <div className="px-5 py-4 border-b border-gray-100 ">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700  uppercase tracking-wide">Registrar cliente</span>
                <button
                  role="switch" aria-label="Registrar datos del cliente" aria-checked={vendedoraClienteEnabled}
                  onClick={() => setVendedoraClienteEnabled(!vendedoraClienteEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${vendedoraClienteEnabled ? 'bg-emerald-500' : 'bg-gray-300 '}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${vendedoraClienteEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {!vendedoraClienteEnabled && (
                <input
                  type="text"
                  value={clienteNombre}
                  onChange={e => setClienteNombre(e.target.value)}
                  aria-label="Nombre del cliente" placeholder="Nombre del cliente"
                  className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100  mt-2"
                  autoFocus
                />
              )}
              {vendedoraClienteEnabled && (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={clienteNombre}
                    onChange={e => setClienteNombre(e.target.value)}
                    aria-label="Nombre del cliente" placeholder="Nombre del cliente"
                    className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                    autoFocus
                  />
                  <input
                    type="tel"
                    value={clienteTelefono}
                    onChange={e => setClienteTelefono(e.target.value)}
                    aria-label="Teléfono del cliente" placeholder="Teléfono"
                    className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                  />
                  <input
                    type="email"
                    value={clienteCorreo}
                    onChange={e => setClienteCorreo(e.target.value)}
                    aria-label="Correo del cliente" placeholder="Correo"
                    className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                  />
                  <input
                    type="text"
                    value={clienteRut}
                    onChange={e => setClienteRut(e.target.value)}
                    aria-label="RUT del cliente" placeholder="RUT"
                    className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                  />
                </div>
              )}
            </div>

            </div>
            {/* Enviar permanece visible; solo los datos de la venta hacen scroll. */}
            <div data-pos="checkout" className="px-5 py-5">
            {cart.length > 0 && <PosCheckoutSummary
              total={fmtCLP(totalCart)} units={totalItemsCount} lines={cart.length} sending={isVendedora}
              change={!isVendedora && ((pagoActivo === 'efectivo' && !splitMode && Number(montoRecibido) > totalCart) || (splitMode && totalPagado > totalCart)) ? fmtCLP(vuelto) : undefined}
              remaining={!isVendedora && splitMode && restante > 0 ? fmtCLP(restante) : undefined}
            />}
              <button
                data-pos="charge"
                onClick={() => {
                  triggerSakuraRain()
                  const caj = loginUsers.find(u => u.id === vendedoraSelectedCajera)
                  if (caj) handleSendToCajera(caj.id, caj.nombre)
                }}
                disabled={cart.length === 0 || !vendedoraSelectedCajera || sendingToCajera}
                className={`relative overflow-hidden w-full py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-3 shadow-lg ${
                  cart.length > 0 && vendedoraSelectedCajera && !sendingToCajera
                    ? 'bg-[#087f73] hover:bg-[#06695f] text-white shadow-emerald-500/20 active:scale-[0.97]'
                    : 'bg-gray-200  text-gray-400  cursor-not-allowed shadow-none'
                }`}
              >
                {effectivePosTheme.presetId === 'sakura-coquette' && <PosSakuraChargeParticles />}
                {hasMikanAnimations && <PosNekoChargeParticles nekoVariant={activeNekoVariant} />}
                {effectivePosTheme.presetId === 'capy-matcha' && <PosCapyChargeParticles />}
                {effectivePosTheme.presetId === 'jasmine-lavender' && <PosJasmineChargeParticles />}
                <span data-pos="charge-label" className="relative z-10 inline-flex items-center justify-center gap-3">
                  {sendingToCajera ? (
                    <><Loader2 size={20} className="animate-spin" /> Enviando...</>
                  ) : (
                    <><Send size={20} /> Enviar a Cajera</>
                  )}
                </span>
              </button>
              {!vendedoraSelectedCajera && cart.length > 0 && (
                <p className="text-amber-500 text-[11px] text-center mt-2 font-medium">Selecciona una cajera arriba</p>
              )}
            </div>
          </div>
          ) : (
          <>
          <div data-pos="payment-scroll">
          {/* ── Cajera: normal payment methods ──────────────────────────── */}
          <div data-pos="payment-methods" className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-bold text-gray-900">Medio de pago</span>
              <button aria-pressed={splitMode} onClick={() => { setSplitMode(!splitMode); setPagos([]) }}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${splitMode ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {splitMode ? 'Dividido ✓' : 'Dividir'}
              </button>
            </div>
            <div className={`grid ${isCajeroExpress ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 sm:gap-2`}>
              {([
                { key: 'efectivo' as MetodoPago, icon: <Banknote size={20} />, label: 'Efectivo', activeCls: 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' },
                { key: 'debito' as MetodoPago, icon: <CreditCard size={20} />, label: 'Débito', activeCls: 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' },
                { key: 'transferencia' as MetodoPago, icon: <ArrowRightLeft size={20} />, label: 'Transfer', activeCls: 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' },
              ] as const).filter(m => !isCajeroExpress || m.key !== 'efectivo').map(m => (
                <button key={m.key} aria-pressed={pagoActivo === m.key} onClick={() => setPagoActivo(m.key)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl border-2 transition-all active:scale-95 ${
                    pagoActivo === m.key
                      ? m.activeCls
                      : 'bg-white border-slate-200 text-gray-500 hover:border-slate-300'
                  }`}>
                  {m.icon}
                  <span className="text-[11px] sm:text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800" role="status">
              <strong>Comprobante interno.</strong> No es un documento tributario; la emisión fiscal no está conectada.
            </div>
          </div>

          {/* Amount input */}
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-gray-200">
            {pagoActivo === 'efectivo' && !splitMode && (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-500 block font-medium">Monto recibido (efectivo)</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={accumulateQuickAmounts}
                    aria-label="Sumar los atajos de efectivo"
                    title={accumulateQuickAmounts ? 'Cada toque suma el monto al valor recibido.' : 'Cada toque reemplaza el valor recibido.'}
                    onClick={toggleQuickAmountAccumulation}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold transition ${accumulateQuickAmounts ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
                  >
                    <span>{accumulateQuickAmounts ? 'Sumar' : 'Reemplazar'}</span>
                    <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${accumulateQuickAmounts ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                      <span className={`absolute h-3 w-3 rounded-full bg-white shadow-sm transition-all ${accumulateQuickAmounts ? 'left-3.5' : 'left-0.5'}`} />
                    </span>
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl sm:text-2xl font-bold text-gray-400">$</span>
                  <input type="text" inputMode="numeric" aria-label="Monto recibido en efectivo"
                    value={montoRecibido ? Number(montoRecibido).toLocaleString('es-CL') : ''}
                    onChange={e => {
                      const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                      setMontoRecibido(digits);
                    }}
                    placeholder="0"
                    className={`w-full bg-gray-50 border-2 rounded-xl pl-9 sm:pl-10 pr-3 py-2 sm:py-2.5 text-xl sm:text-2xl text-center font-bold focus:outline-none focus:ring-2 transition-colors ${
                      !montoRecibido
                        ? 'border-amber-300 text-gray-900 focus:border-amber-500 focus:ring-amber-100'
                        : Number(montoRecibido) < totalCart
                          ? 'border-rose-300 text-rose-700 focus:border-rose-500 focus:ring-rose-100'
                          : 'border-emerald-400 text-emerald-800 focus:border-emerald-500 focus:ring-emerald-100'
                    }`}
                    onKeyDown={e => { if (e.key === 'Enter') { handleCompleteSale() } }}
                  />
                </div>
                {montoRecibido && Number(montoRecibido) < totalCart && (
                  <div className="text-xs text-rose-600 font-bold mt-1 text-center">
                    Monto insuficiente · Faltan {fmtCLP(totalCart - Number(montoRecibido))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2.5">
                  {quickAmounts.map(a => (
                    <button key={a} onClick={() => handleQuickCashAmount(a)}
                      className="bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 hover:text-emerald-800 font-bold transition active:scale-95">
                      {fmtN(a)}
                    </button>
                  ))}
                  <button onClick={() => setMontoRecibido(String(totalCart))}
                    className="bg-emerald-100 hover:bg-emerald-200 border border-emerald-400 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-emerald-700 font-extrabold transition active:scale-95">
                    Exacto
                  </button>
                </div>
              </>
            )}
            {splitMode && (
              <>
                <label className="text-xs text-gray-500 mb-2 block font-medium">Monto ({pagoActivo})</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">$</span>
                    <input type="text" inputMode="numeric" aria-label={`Monto del pago por ${pagoActivo}`}
                      value={montoRecibido ? Number(montoRecibido).toLocaleString('es-CL') : ''}
                      onChange={e => {
                        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                        setMontoRecibido(digits);
                      }}
                      placeholder="Monto"
                      className="w-full bg-white border-2 border-gray-300 rounded-xl pl-9 pr-3 py-2.5 text-gray-900 text-center font-bold focus:outline-none focus:border-slate-500"
                    onKeyDown={e => { if (e.key === 'Enter') addSplitPago() }}
                  />
                  </div>
                  <button aria-label="Agregar pago dividido" onClick={addSplitPago}
                    className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-4 py-2.5 font-bold transition">
                    <Plus size={18} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (restante > 0) {
                      setPagos(prev => [...prev, { metodo: pagoActivo, monto: restante }])
                      setMontoRecibido('')
                    }
                  }}
                  className="w-full mt-2 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Usar restante: {fmtCLP(restante)}
                </button>
                {pagos.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {pagos.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <span className="text-gray-700 capitalize font-medium">{p.metodo}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{fmtCLP(p.monto)}</span>
                          <button onClick={() => setPagos(prev => prev.filter((_, j) => j !== i))}
                            className="text-red-500 hover:text-red-600"><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-gray-500 pt-1">
                      <span>Total pagado:</span>
                      <span className={totalPagado >= totalCart ? 'text-green-600 font-bold' : 'text-amber-600 font-bold'}>
                        {fmtCLP(totalPagado)} / {fmtCLP(totalCart)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
            {pagoActivo !== 'efectivo' && !splitMode && (
              <div className="text-center py-4">
                <div className="text-2xl font-bold text-gray-900 mb-1">{fmtCLP(totalCart)}</div>
                <span className="text-sm text-gray-500 capitalize">{pagoActivo === 'debito' ? 'Pago con tarjeta débito' : 'Pago por transferencia'}</span>
              </div>
            )}
          </div>

          </div>
          {/* Confirm button (cajera only — vendedora has its own panel above) */}
          <div data-pos="checkout" className="px-3.5 sm:px-5 py-3 sm:py-4">
            {cart.length > 0 && <PosCheckoutSummary
              total={fmtCLP(totalCart)} units={totalItemsCount} lines={cart.length} sending={isVendedora}
              change={!isVendedora && ((pagoActivo === 'efectivo' && !splitMode && Number(montoRecibido) > totalCart) || (splitMode && totalPagado > totalCart)) ? fmtCLP(vuelto) : undefined}
              remaining={!isVendedora && splitMode && restante > 0 ? fmtCLP(restante) : undefined}
            />}
            {(() => {
              const esPreVenta = modoVentaPOS === 'jefe_cobra' && isCajera && !isCajeroExpress
              const hasZeroQtyItems = cart.some(c => c.cantidad <= 0)
              const isCashBlocked = !esPreVenta && pagoActivo === 'efectivo' && !splitMode && (!montoRecibido || Number(montoRecibido) < totalCart)
              const isSplitIncomplete = !esPreVenta && splitMode && (totalPagado + (Number(montoRecibido) || 0)) < totalCart
              const isChargeDisabled = cart.length === 0 || !sesionCaja || processing || sendingToCajera || isCashBlocked || isSplitIncomplete || hasZeroQtyItems

              return (
                <>
                  <button ref={chargeButtonRef} data-pos="charge"
                    onClick={() => handleCompleteSale()}
                    disabled={isChargeDisabled}
                    className={`relative overflow-hidden w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-lg sm:text-xl font-black tracking-wide transition-all flex items-center justify-center gap-2.5 ${
                      !isChargeDisabled
                        ? 'bg-[#087f73] hover:bg-[#06695f] text-white shadow-md shadow-emerald-100/60 active:scale-[0.97]'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}>
                    {effectivePosTheme.presetId === 'sakura-coquette' && <PosSakuraChargeParticles />}
                    {hasMikanAnimations && <PosNekoChargeParticles nekoVariant={activeNekoVariant} />}
                    {effectivePosTheme.presetId === 'capy-matcha' && <PosCapyChargeParticles />}
                    {effectivePosTheme.presetId === 'jasmine-lavender' && <PosJasmineChargeParticles />}
                    <span data-pos="charge-label" className="relative z-10 inline-flex items-center justify-center gap-2.5">
                      {processing ? (
                        <><Loader2 size={20} className="animate-spin" /> Procesando...</>
                      ) : (
                        <><Receipt size={20} /> {isCajera && modoVentaPOS === 'jefe_cobra' ? 'Crear preventa' : 'Cobrar'} {totalCart > 0 ? fmtCLP(totalCart) : ''}</>
                      )}
                    </span>
                  </button>
                  {cart.length > 0 && sesionCaja && !processing && hasZeroQtyItems && (
                    <p className="mt-2 text-center text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg py-1.5 px-2.5">
                      ⚠️ Hay productos con 0 unidades en el carrito. Ajusta la cantidad o elimínalos para cobrar.
                    </p>
                  )}
                  {cart.length > 0 && sesionCaja && !processing && !hasZeroQtyItems && isCashBlocked && montoRecibido && Number(montoRecibido) < totalCart && (
                    <p className="mt-2 text-center text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-2.5">
                      ⚠️ Monto insuficiente (faltan {fmtCLP(totalCart - Number(montoRecibido))})
                    </p>
                  )}
                  {cart.length > 0 && sesionCaja && !processing && !hasZeroQtyItems && isSplitIncomplete && (
                    <p className="mt-2 text-center text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-2.5">
                      ⚠️ Pago dividido incompleto (faltan ${fmtCLP(Math.max(0, totalCart - totalPagado - (Number(montoRecibido) || 0)))})
                    </p>
                  )}
                </>
              )
            })()}
            {!sesionCaja && cart.length > 0 && <p className="mt-2 text-center text-xs text-rose-700">Abre la caja para cobrar esta venta.</p>}
            {(isCajera || puedeGenerarCotizacion) && <details className={posLayout.saleOptions}><summary>Opciones de venta</summary><div>
            {isCajera && (
              <button
                type="button"
                onClick={() => setShowSendToCajera(true)}
                disabled={cart.length === 0 || sendingToCajera || processing}
                className={`w-full mt-2.5 py-2.5 sm:py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                  cart.length > 0 && !sendingToCajera && !processing
                    ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:border-sky-300    '
                    : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed   '
                }`}
              >
                <ArrowRightLeft size={17} /> Pasar carrito a otra cajera
              </button>
            )}
            {isCajera && cart.length > 0 && (
              <p className="mt-1.5 text-center text-[10px] leading-relaxed text-slate-500 ">
                Transfiere el carrito; no realiza el cobro ni registra una venta.
              </p>
            )}
            {!sesionCaja && cart.length > 0 && (
              <p className="text-red-500 text-xs text-center mt-1.5">Abre la caja primero</p>
            )}
            {/* Botón de Cotización — funciona con o sin caja abierta */}
            {puedeGenerarCotizacion && <button
              onClick={handleGenerarCotizacion}
              disabled={cart.length === 0}
              className={`w-full mt-2 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                cart.length > 0
                  ? 'bg-[#405566] hover:bg-[#304554] text-white shadow-md active:scale-[0.98]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200'
              }`}
              title="Generar cotización formal en PDF con imágenes y precios mayoristas"
            >
              <FileText size={16} /> Generar Cotización PDF
            </button>}
            </div></details>}
          </div>

          {/* Caja actions (hidden for vendedoras) */}
          {!isVendedora && (
          <details data-pos="cash-actions" open={!sesionCaja}><summary>Gestión de caja</summary><div className="space-y-2">
            {!sesionCaja ? (
              <div className="space-y-2">
                {isCajera && cajaCerradaPorCajera ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-center space-y-2.5">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-900">
                      <Lock size={14} className="text-amber-700" />
                      <span>Caja cerrada (Corte realizado)</span>
                    </div>
                    {isNivelAlto ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-amber-800 leading-tight">
                          Tienes permiso de <strong>Nivel Alto</strong> para reanudar esta caja. Se anulará el corte anterior y se recuperarán todas las ventas y gastos.
                        </p>
                        <button
                          onClick={() => handleReanudarCaja()}
                          disabled={reanudandoCaja}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-xs font-bold transition shadow-sm disabled:opacity-60"
                        >
                          {reanudandoCaja ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                          <span>{reanudandoCaja ? 'Reanudando...' : 'Reanudar mi caja cerrada'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[11px] text-amber-800 leading-tight">
                          Tu nivel actual no permite reanudar cajas. Pide a una cajera o administradora con <strong>Nivel Alto</strong> que reanude tu turno.
                        </p>
                        <button
                          onClick={() => setShowAuthModalAlto(true)}
                          className="w-full flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-2 text-xs font-bold transition"
                        >
                          <LockOpen size={13} />
                          <span>Autorizar aquí con Nivel Alto</span>
                        </button>
                      </div>
                    )}

                    {/* Botón para que usuarias con Nivel Alto puedan reanudar la de otras cajeras */}
                    {isNivelAlto && (
                      <button
                        onClick={openModalReanudarOtras}
                        className="w-full flex items-center justify-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl py-1.5 text-[11px] font-semibold transition"
                      >
                        <User size={12} />
                        <span>Reanudar caja de otra cajera</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={() => configCajaPermisoLoaded && setShowApertura(true)} disabled={!configCajaPermisoLoaded}
                      className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 rounded-xl py-3 text-sm font-semibold transition">
                      <Unlock size={16} /> Abrir Caja
                    </button>
                    {isNivelAlto && (
                      <button
                        onClick={openModalReanudarOtras}
                        className="w-full flex items-center justify-center gap-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl py-2 text-xs font-semibold transition"
                      >
                        <LockOpen size={13} className="text-slate-500" />
                        <span>Reanudar caja de otra cajera</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (!isCajera || (configCajaPermisoLoaded && permiteGestionarCaja)) ? (
              <button onClick={openCajaCierre} disabled={ventasConsultaLoading}
                className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 border border-red-300 text-red-600 rounded-xl py-2.5 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70">
                {ventasConsultaLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} {ventasConsultaLoading ? 'Consultando caja…' : 'Cerrar Caja'}
              </button>
            ) : <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-600">El administrador gestiona el cierre de esta caja.</div>}
            {isNivelAlto && sesionCaja && (
              <button
                onClick={openModalReanudarOtras}
                className="w-full flex items-center justify-center gap-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl py-2 text-xs font-semibold transition"
              >
                <LockOpen size={13} className="text-slate-500" />
                <span>Reanudar otra caja cerrada</span>
              </button>
            )}
            <button onClick={() => window.open(`/pos/${sede}/historial`, '_blank', 'noopener,noreferrer')}
              className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium transition">
              <BarChart3 size={16} /> Historial de ventas
            </button>
          </div></details>
          )}

          {manualPanelResize && viewportSize.w >= 1024 && <>
            {proMode && <button type="button" data-pos="panel-resize-handle" aria-label="Cambiar ancho del panel de cobro" title="Arrastra para cambiar el ancho" className={`${posLayout.panelResizeWidth} ${posLayout.panelResizeLeft}`} onPointerDown={beginManualPanelResize('pro-width')} onPointerMove={updateManualPanelResize} onPointerUp={finishManualPanelResize} onPointerCancel={finishManualPanelResize} onLostPointerCapture={finishManualPanelResize}><span aria-hidden="true" /></button>}
            <button type="button" data-pos="panel-resize-handle" aria-label="Cambiar alto del panel de cobro" title="Arrastra para cambiar el alto" className={posLayout.panelResizeHeight} onPointerDown={beginManualPanelResize('payment-height')} onPointerMove={updateManualPanelResize} onPointerUp={finishManualPanelResize} onPointerCancel={finishManualPanelResize} onLostPointerCapture={finishManualPanelResize}><span aria-hidden="true" /></button>
          </>}
          </>
          )}
        </div>
      </div>

      {/* ═══ MOBILE: sticky total bar (confort cajera/vendedora: total + cobro/envío siempre visible) ═══ */}
      {cart.length > 0 && mobileTab === 'products' && (
        <div data-pos="mobile-total" className="fixed bottom-[64px] left-0 right-0 lg:hidden z-40 px-3 pb-2">
          <button
            onClick={() => setMobileTab('payment')}
            className={`relative overflow-hidden w-full flex items-center justify-between bg-gradient-to-r ${
              isVendedora
                ? 'from-blue-600 to-sky-600 shadow-blue-500/30'
                : 'from-emerald-500 to-teal-500 shadow-emerald-500/30'
            } text-white rounded-2xl px-5 py-3.5 shadow-xl active:scale-[0.98] transition-all`}
          >
            {effectivePosTheme.presetId === 'sakura-coquette' && <PosSakuraChargeParticles />}
            {hasMikanAnimations && <PosNekoChargeParticles nekoVariant={activeNekoVariant} />}
            {effectivePosTheme.presetId === 'capy-matcha' && <PosCapyChargeParticles />}
            {effectivePosTheme.presetId === 'jasmine-lavender' && <PosJasmineChargeParticles />}
            <span className="relative z-10 flex items-center gap-2 text-sm font-bold">
              <ShoppingCart size={18} />
              {totalItemsCount} ítem{totalItemsCount !== 1 ? 's' : ''}
            </span>
            <span className="relative z-10 flex items-center gap-2">
              <span className="text-lg font-black tabular-nums">{fmtCLP(totalCart)}</span>
              <span className="bg-white/25 rounded-lg px-2.5 py-1 text-xs font-extrabold flex items-center gap-1">
                {isVendedora ? <><Send size={12} /> ENVIAR →</> : 'COBRAR →'}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* ═══ MOBILE BOTTOM NAV ═══════════════════════════════════════════ */}
      <div role="navigation" aria-label="Áreas del punto de venta" data-pos="mobile-nav" className="fixed bottom-0 left-0 right-0 lg:hidden bg-white/95  backdrop-blur-lg border-t border-slate-200  flex z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          aria-pressed={mobileTab === 'products'} onClick={() => setMobileTab('products')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-all duration-200 relative ${
            mobileTab === 'products' ? 'text-emerald-600 ' : 'text-gray-400 '
          }`}
        >
          {mobileTab === 'products' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-emerald-500 rounded-b-full" />}
          <div className={`p-1.5 rounded-xl transition-all ${mobileTab === 'products' ? 'bg-emerald-100  scale-110' : ''}`}>
            <Search size={20} />
          </div>
          Productos
        </button>
        <button
          aria-pressed={mobileTab === 'cart'} onClick={() => setMobileTab('cart')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-all duration-200 relative ${
            mobileTab === 'cart' ? 'text-emerald-600 ' : 'text-gray-400 '
          }`}
        >
          {mobileTab === 'cart' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-emerald-500 rounded-b-full" />}
          <div className={`p-1.5 rounded-xl transition-all relative ${mobileTab === 'cart' ? 'bg-emerald-100  scale-110' : ''}`}>
            <ShoppingCart size={20} />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 shadow-sm animate-bounce" style={{animationDuration:'2s'}}>
                {totalItemsCount > 9 ? '9+' : totalItemsCount}
              </span>
            )}
          </div>
          Carrito
        </button>
        <button
          aria-pressed={mobileTab === 'payment'} onClick={() => setMobileTab('payment')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-all duration-200 relative ${
            mobileTab === 'payment'
              ? (isVendedora ? 'text-blue-600 ' : 'text-emerald-600 ')
              : 'text-gray-400 '
          }`}
        >
          {mobileTab === 'payment' && (
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 ${isVendedora ? 'bg-blue-500' : 'bg-emerald-500'} rounded-b-full`} />
          )}
          <div className={`p-1.5 rounded-xl transition-all ${
            mobileTab === 'payment'
              ? (isVendedora ? 'bg-blue-100  scale-110' : 'bg-emerald-100  scale-110')
              : ''
          }`}>
            {isVendedora ? <Send size={20} /> : <DollarSign size={20} />}
          </div>
          {isVendedora ? (
            cart.length > 0 && totalCart > 0 ? (
              <span className="text-[10px] font-extrabold text-blue-600  tabular-nums">{fmtCLP(totalCart)}</span>
            ) : 'Enviar'
          ) : (
            cart.length > 0 && totalCart > 0 ? (
              <span className="text-[10px] font-extrabold text-emerald-600  tabular-nums">{fmtCLP(totalCart)}</span>
            ) : 'Cobrar'
          )}
        </button>
      </div>

      {/* ═══ MOBILE: "Added to cart" notification ═══════════════════════ */}
      {cartAddedItem && (
        <div role="status" className="fixed top-16 left-1/2 -translate-x-1/2 lg:hidden z-50 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/30 border border-emerald-400/30">
            <CheckCircle size={16} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold truncate max-w-[200px]">{cartAddedItem.nombre}</div>
              <div className="text-[10px] text-emerald-100">{fmtCLP(cartAddedItem.precio)} agregado al carrito</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODALS ══════════════════════════════════════════════════════ */}

      {/* ═══ MODAL FLOTANTE DE VENTA EXITOSA Y COMPROBANTE INTERNO ═══ */}
      {completedSaleModal && <PosSaleResult
        receipt="Comprobante interno"
        operator={completedSaleModal.cajeroNombre || 'Cajera'}
        total={fmtCLP(completedSaleModal.total)}
        method={completedSaleModal.metodoPago === 'efectivo' ? 'Efectivo' : completedSaleModal.metodoPago === 'debito' ? 'Débito' : completedSaleModal.metodoPago === 'transferencia' ? 'Transferencia' : completedSaleModal.metodoPago === 'mixto' ? 'Pago dividido' : (completedSaleModal.metodoPago || 'Venta')}
        change={Number(completedSaleModal.vuelto || 0) > 0 ? fmtCLP(completedSaleModal.vuelto || 0) : undefined}
        popupBlocked={popupBlockedNotice}
        sakuraMode={effectivePosTheme.presetId === 'sakura-coquette'}
        nekoMode={hasMikanAnimations}
        nekoVariant={activeNekoVariant}
        capyMode={effectivePosTheme.presetId === 'capy-matcha'}
        jasmineMode={effectivePosTheme.presetId === 'jasmine-lavender'}
        onClose={closeCompletedSaleModal}
        onPrint={() => { printReceipt(completedSaleModal, null); closeCompletedSaleModal(); }}
      />}

      {showCajaResumen && sesionCaja && (() => {
        const ventasCompletadas = cajaResumenVentas.filter(v => v.estado === 'completada' && v.sesionCajaId === sesionCaja.id)
        const ventasCount = ventasCompletadas.length
        const totalEfectivo = ventasCompletadas.reduce((sum, venta) => sum + getSaleEfectivoNeto(venta), 0)
        const totalDebito = ventasCompletadas.reduce((sum, venta) => sum + getSalePagos(venta).filter(p => p.metodo === 'debito').reduce((s, p) => s + (Number(p.monto) || 0), 0), 0)
        const totalTransferencia = ventasCompletadas.reduce((sum, venta) => sum + getSalePagos(venta).filter(p => p.metodo === 'transferencia').reduce((s, p) => s + (Number(p.monto) || 0), 0), 0)
        const totalVentas = ventasCompletadas.reduce((sum, venta) => sum + Number(venta.total || 0), 0)
        const totalGastos = cajaGastos.reduce((sum, gasto) => sum + gasto.monto, 0)
        const efectivoEsperado = (Number(sesionCaja.montoApertura) || 0) + totalEfectivo - totalGastos - Number(sesionCaja.devolucionesPosEfectivo || 0)
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setShowCajaResumen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-cash-summary-title"
              data-pos="cash-summary-dialog"
              className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[26px] border shadow-2xl"
              style={{ background: 'var(--pos-panel-bg, #fff)', borderColor: 'var(--pos-line, #d1d5db)', color: 'var(--pos-ink, #334155)', boxShadow: 'var(--pos-card-shadow, 0 24px 70px rgba(0,0,0,.24))' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ background: 'var(--pos-toolbar-bg, var(--pos-panel-sub-bg, #f8fafc))', borderColor: 'var(--pos-line, #e2e8f0)' }}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 rounded-full border p-1.5 shadow-sm" style={{ background: 'var(--pos-panel-bg, #fff)', borderColor: 'var(--pos-personal-accent-border, #a7dfd0)' }}>
                    <ThemeMascotEmblem presetId={effectivePosTheme.presetId} catDesign={effectivePosTheme.catDesign} customColors={effectivePosTheme.customColors} />
                    {isNekoPosTheme && <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border shadow-sm" style={{ background: 'var(--pos-soft, #fff4e8)', borderColor: 'var(--pos-personal-accent-border, #f6bd8e)', color: 'var(--pos-accent, #df7229)' }}><PawPrint size={11} strokeWidth={2.5} /></span>}
                  </div>
                  <div className="min-w-0">
                    <p className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ color: 'var(--pos-personal-accent-text, var(--pos-accent, #087f73))', background: 'var(--pos-soft, #eaf5f1)', borderColor: 'var(--pos-personal-accent-border, #a7dfd0)' }}>Caja abierta</p>
                    <h2 id="pos-cash-summary-title" className="mt-1 text-xl font-black" style={{ color: 'var(--pos-ink-strong, #1e293b)' }}>Resumen de caja</h2>
                    <p className="text-xs" style={{ color: 'var(--pos-muted, #64748b)' }}>{fmtN(ventasCount)} ventas realizadas</p>
                  </div>
                </div>
                <button onClick={() => setShowCajaResumen(false)} aria-label="Cerrar resumen de caja" className="grid h-9 w-9 shrink-0 place-content-center rounded-full transition hover:opacity-75" style={{ background: 'var(--pos-soft, #f1f5f9)', color: 'var(--pos-accent, #087f73)' }}><X size={16} /></button>
              </div>
              <div className="space-y-3 p-4 sm:p-5">
                <div className="rounded-2xl border p-4" style={{ background: 'var(--pos-soft, #eaf5f1)', borderColor: 'var(--pos-personal-accent-border, #a7dfd0)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--pos-muted, #64748b)' }}>Total vendido</p>
                  <p className="mt-1 text-3xl font-black tracking-tight" style={{ color: 'var(--pos-accent, #087f73)' }}>{fmtCLP(totalVentas)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0 rounded-2xl border px-2 py-3 text-center" style={{ background: 'var(--pos-panel-sub-bg, #f8fafc)', borderColor: 'var(--pos-line, #e2e8f0)' }}>
                    <Banknote size={17} className="mx-auto" style={{ color: 'var(--pos-accent, #087f73)' }} />
                    <p className="mt-1 text-[10px] font-semibold" style={{ color: 'var(--pos-muted, #64748b)' }}>Efectivo</p>
                    <p className="mt-0.5 break-words text-xs font-black sm:text-sm" style={{ color: 'var(--pos-ink-strong, #1e293b)' }}>{fmtCLP(totalEfectivo)}</p>
                  </div>
                  <div className="min-w-0 rounded-2xl border px-2 py-3 text-center" style={{ background: 'var(--pos-panel-sub-bg, #f8fafc)', borderColor: 'var(--pos-line, #e2e8f0)' }}>
                    <CreditCard size={17} className="mx-auto" style={{ color: 'var(--pos-accent, #087f73)' }} />
                    <p className="mt-1 text-[10px] font-semibold" style={{ color: 'var(--pos-muted, #64748b)' }}>Débito</p>
                    <p className="mt-0.5 break-words text-xs font-black sm:text-sm" style={{ color: 'var(--pos-ink-strong, #1e293b)' }}>{fmtCLP(totalDebito)}</p>
                  </div>
                  <div className="min-w-0 rounded-2xl border px-2 py-3 text-center" style={{ background: 'var(--pos-panel-sub-bg, #f8fafc)', borderColor: 'var(--pos-line, #e2e8f0)' }}>
                    <ArrowRightLeft size={17} className="mx-auto" style={{ color: 'var(--pos-accent, #087f73)' }} />
                    <p className="mt-1 text-[10px] font-semibold" style={{ color: 'var(--pos-muted, #64748b)' }}>Transferencia</p>
                    <p className="mt-0.5 break-words text-xs font-black sm:text-sm" style={{ color: 'var(--pos-ink-strong, #1e293b)' }}>{fmtCLP(totalTransferencia)}</p>
                  </div>
                </div>
                <div className="space-y-2 rounded-2xl border p-4 text-sm" style={{ background: 'var(--pos-panel-sub-bg, #f8fafc)', borderColor: 'var(--pos-line, #e2e8f0)' }}>
                  <div className="flex justify-between gap-3" style={{ color: 'var(--pos-muted, #64748b)' }}><span>Dinero de apertura</span><span className="font-bold" style={{ color: 'var(--pos-ink-strong, #1e293b)' }}>{fmtCLP(sesionCaja.montoApertura)}</span></div>
                  <div className="flex justify-between gap-3" style={{ color: 'var(--pos-muted, #64748b)' }}><span>Ventas en efectivo</span><span className="font-bold" style={{ color: 'var(--pos-accent, #087f73)' }}>+{fmtCLP(totalEfectivo)}</span></div>
                  <div className="flex justify-between gap-3" style={{ color: 'var(--pos-muted, #64748b)' }}><span>Retiros y gastos</span><span className="font-bold text-rose-600">-{fmtCLP(totalGastos)}</span></div>
                  <div className="flex justify-between gap-3 border-t pt-2 text-base" style={{ borderColor: 'var(--pos-line, #e2e8f0)' }}><span className="font-black" style={{ color: 'var(--pos-ink-strong, #1e293b)' }}>Efectivo que debe tener</span><span className="font-black" style={{ color: 'var(--pos-accent, #087f73)' }}>{fmtCLP(efectivoEsperado)}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setShowCajaResumen(false); openNewCajaGasto() }} className="rounded-xl border px-3 py-3 text-xs font-bold transition hover:opacity-75" style={{ borderColor: 'var(--pos-personal-accent-border, #a7dfd0)', background: 'var(--pos-panel-bg, #fff)', color: 'var(--pos-accent, #087f73)' }}><Minus size={14} className="mr-1 inline" />Registrar retiro</button>
                  <button onClick={() => { setShowCajaResumen(false); setShowCajaGastos(true) }} className="rounded-xl border px-3 py-3 text-xs font-bold transition hover:opacity-75" style={{ borderColor: 'var(--pos-personal-accent-border, #a7dfd0)', background: 'var(--pos-panel-sub-bg, #f8fafc)', color: 'var(--pos-accent, #087f73)' }}><FileText size={14} className="mr-1 inline" />Ver gastos ({cajaGastos.length})</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {showCajaGastos && (
        <div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm transition-all sm:items-center sm:p-4"
          onClick={() => setShowCajaGastos(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="caja-gastos-title"
            className="flex h-[92dvh] max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-3xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-[#dce5e0] bg-[#f7faf5] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-content-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <Banknote size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                      Control de gaveta
                    </span>
                    <span className="text-[11px] font-medium text-[#61736f]">
                      {sedeNombre || 'Importadora Carlitos'}
                    </span>
                  </div>
                  <h2 id="caja-gastos-title" className="truncate text-base font-bold text-[#405566] sm:text-lg">
                    Retiros y Salidas de Efectivo
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCajaGastos(false)}
                aria-label="Cerrar gastos"
                className="grid h-9 w-9 place-content-center rounded-xl border border-[#dce5e0] bg-white text-[#61736f] transition hover:bg-emerald-50 hover:text-emerald-700"
              >
                <X size={17} />
              </button>
            </div>

            {/* Financial Summary Card */}
            <div className="border-b border-[#dce5e0] bg-white px-5 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#61736f]">
                    Total Retirado de Caja
                  </p>
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-[#b72449] sm:text-3xl">
                    -{fmtCLP(cajaGastos.reduce((sum, gasto) => sum + gasto.monto, 0))}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5e0] bg-[#f4f6f3] px-2.5 py-1 text-[10px] font-bold text-[#405566]">
                    <Minus size={11} className="stroke-[3] text-[#b72449]" />
                    {cajaGastos.length} {cajaGastos.length === 1 ? 'salida registrada' : 'salidas registradas'}
                  </span>
                  <p className="mt-1 text-[10px] text-[#61736f]">
                    Descontado del arqueo de efectivo
                  </p>
                </div>
              </div>
            </div>

            {/* Expenses List */}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/70 p-4 sm:max-h-[50vh]">
              {cajaGastos.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12 px-4 text-center">
                  <div className="mb-3 grid h-12 w-12 place-content-center rounded-2xl bg-slate-100 text-slate-400">
                    <Receipt size={24} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">No hay salidas ni retiros registrados</p>
                  <p className="mt-1 max-w-xs text-xs text-slate-400 leading-relaxed">
                    Todo el dinero recaudado en efectivo permanece en la gaveta para el cuadre de caja.
                  </p>
                </div>
              ) : (
                cajaGastos.map(gasto => {
                  let timeStr = ''
                  try {
                    const d = new Date(gasto.createdAtTs)
                    timeStr = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) + ' hrs'
                  } catch {
                    timeStr = ''
                  }
                  return (
                    <div
                      key={gasto.id}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-content-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100/80">
                          <Minus size={15} className="stroke-[2.5]" />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words text-xs font-bold text-slate-900 sm:text-sm leading-snug">
                            {gasto.detalle}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                              {gasto.tipo || 'Operacional'}
                            </span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                              {gasto.categoria || 'Suministros'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              · {timeStr} {gasto.usuario ? `· ${gasto.usuario}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-black tabular-nums text-rose-600 sm:text-base">
                          -{fmtCLP(gasto.monto)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setShowCajaGastos(false); openEditCajaGasto(gasto) }}
                            className="grid h-8 w-8 place-content-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            title="Editar salida"
                            aria-label={`Editar salida: ${gasto.detalle}`}
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteGastoTarget(gasto)}
                            className="grid h-8 w-8 place-content-center rounded-xl border border-slate-200/80 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            title="Eliminar salida"
                            aria-label={`Eliminar salida: ${gasto.detalle}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#dce5e0] bg-[#f8fbf7] p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:p-4">
              <button
                type="button"
                onClick={() => { setShowCajaGastos(false); openNewCajaGasto() }}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] sm:text-sm"
              >
                <Plus size={16} className="stroke-[2.5]" />
                Registrar Salida de Efectivo
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteGastoTarget && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => !gastoDeleting && setDeleteGastoTarget(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-caja-gasto-title"
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-content-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                <Trash2 size={22} />
              </div>
              <h2 id="delete-caja-gasto-title" className="text-base font-black text-slate-900">
                ¿Eliminar este retiro de caja?
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                El monto volverá a computarse como efectivo esperado en la gaveta para el arqueo.
              </p>
            </div>

            <div className="mx-5 mb-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-center">
              <p className="text-xs font-bold text-slate-800 break-words">{deleteGastoTarget.detalle}</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-rose-600">
                -{fmtCLP(deleteGastoTarget.monto)}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                {deleteGastoTarget.tipo || 'Operacional'} · {deleteGastoTarget.categoria || 'Suministros'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                disabled={gastoDeleting}
                onClick={() => setDeleteGastoTarget(null)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={gastoDeleting}
                onClick={handleDeleteCajaGasto}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                {gastoDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {gastoDeleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGastoForm && (
        <PosCashOutDialog
          editing={Boolean(editingGastoId)}
          branch={sedeNombre}
          operator={posUser?.nombre || cajeroNombre || sesionCaja?.cajeroNombre || 'Cajero activo'}
          availableCash={
            sesionCaja
              ? (Number(sesionCaja.montoApertura) || 0) +
                Number(sesionCaja.totalEfectivo || 0) -
                cajaGastos
                  .filter(item => item.id !== editingGastoId)
                  .reduce((sum, item) => sum + Number(item.monto || 0), 0) -
                Number(sesionCaja.devolucionesPosEfectivo || 0)
              : undefined
          }
          recordedCount={cajaGastos.length}
          amount={gastoMonto}
          detail={gastoDetalle}
          expenseType={gastoTipo}
          category={gastoCategoria}
          types={ERP_GASTO_TIPOS}
          categories={ERP_GASTO_CATEGORIAS}
          saving={gastoSaving}
          formatMoney={fmtCLP}
          onAmount={setGastoMonto}
          onDetail={setGastoDetalle}
          onType={setGastoTipo}
          onCategory={setGastoCategoria}
          onPreset={preset => {
            setGastoDetalle(preset.detalle)
            setGastoTipo(preset.tipo)
            setGastoCategoria(preset.categoria)
          }}
          onViewRecorded={() => {
            setShowGastoForm(false)
            setShowCajaGastos(true)
          }}
          onSave={handleSaveCajaGasto}
          onClose={() => {
            if (!gastoSaving) setShowGastoForm(false)
          }}
        />
      )}

      {/* Apertura de caja */}
      {showApertura && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="pos-apertura-title" className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[calc(100dvh-32px)] overflow-y-auto shadow-2xl border border-gray-200 relative">
            {/* Botón X para cerrar el modal sin abrir caja */}
            {!sesionCaja && (
              <button
                onClick={() => { setAperturaDismissed(true); setShowApertura(false) }}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                title="Cerrar y operar sin caja"
              >
                <X size={18} />
              </button>
            )}
            {!sesionCaja && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
                <span className="text-amber-600 text-lg">⚠️</span>
                <p className="text-xs font-semibold text-amber-700">La caja está cerrada. Debes abrirla para operar.</p>
              </div>
            )}
            <h2 id="pos-apertura-title" className="text-xl font-bold text-gray-900 mb-2">Abrir caja</h2>
            <p className="text-sm text-gray-500 mb-6">Ingresa los datos para abrir la caja del día</p>
            <div className="space-y-4">
              {posUser ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  {posUser.fotoUrl ? (
                    <CajeraAvatar
                      src={posUser.fotoUrl}
                      alt={posUser.nombre}
                      className="w-10 h-10 rounded-full overflow-hidden"
                      fallback={<div className="w-10 h-10 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold">{posUser.nombre.charAt(0)}</div>}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold">{posUser.nombre.charAt(0)}</div>
                  )}
                  <div>
                    <div className="font-bold text-emerald-900 text-sm">{posUser.nombre}</div>
                    <div className="text-xs text-emerald-700 font-medium">{posUser.cargo} · {operatorAccessLevelLabel}</div>
                  </div>
                </div>
              ) : (
              <div>
                <label className="text-sm text-gray-700 mb-1.5 block font-medium">Nombre del Cajero *</label>
                <input type="text" aria-label="Nombre del cajero" value={cajeroNombre} onChange={e => setCajeroNombre(e.target.value)}
                  placeholder="Ej: María"
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-[#087f73] focus:ring-2 focus:ring-teal-100"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && !abriendoCaja) handleAbrirCaja() }}
                />
              </div>
              )}
              <div>
                <label className="text-sm text-gray-700 mb-1.5 block font-medium">*Ingrese Monto de Apertura de Caja (CLP)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                  <input type="text" inputMode="numeric"
                    aria-label="Monto de apertura en pesos chilenos"
                    value={montoApertura ? Number(montoApertura).toLocaleString('es-CL') : ''}
                    onChange={e => {
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      setMontoApertura(digits);
                    }}
                    placeholder="0"
                    onKeyDown={e => { if (e.key === 'Enter' && !abriendoCaja) handleAbrirCaja() }}
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-gray-900 focus:outline-none focus:border-[#087f73] focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              </div>
            </div>
            <div className="mt-8 grid gap-2">
              <button onClick={handleAbrirCaja}
                disabled={abriendoCaja}
                className="w-full bg-[#087f73] hover:bg-[#06695f] text-white rounded-xl py-3 font-bold transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {abriendoCaja && <Loader2 size={18} className="animate-spin" />}
                {abriendoCaja ? 'Abriendo caja...' : 'Abrir Caja'}
              </button>
              <button
                onClick={() => { setShowApertura(false); router.push(`/pos/${sede}/historial`); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 py-2.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100"
              >
                <BarChart3 size={16} />
                Ver Historial de Ventas (Turnos Anteriores / Caja Cerrada)
              </button>
              {!sesionCaja && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setShowApertura(false); router.push(`/pos/${sede}/historial`) }}
                    className="rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    Salir del POS
                  </button>
                  <button
                    onClick={handlePosLogout}
                    className="rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
              {sesionCaja && (
                <button onClick={() => setShowApertura(false)} className="w-full py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800">
                  Cancelar
                </button>
              )}
              {!sesionCaja && (
                <button onClick={() => { setAperturaDismissed(true); setShowApertura(false) }} className="w-full py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800">
                  Cerrar y continuar sin caja
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cierre de caja */}
      {showCierre && sesionCaja && (() => {
        const ventasCompletadas = ventasHoy.filter(v => v.estado === 'completada' && v.sesionCajaId === sesionCaja.id)
        const totalEfectivo = ventasCompletadas.reduce((sum, v) => sum + getSaleEfectivoNeto(v), 0)
        const totalDebito = ventasCompletadas.reduce((sum, v) => sum + getSalePagos(v).filter(p => p.metodo === 'debito').reduce((s, p) => s + (Number(p.monto) || 0), 0), 0)
        const totalTransferencia = ventasCompletadas.reduce((sum, v) => sum + getSalePagos(v).filter(p => p.metodo === 'transferencia').reduce((s, p) => s + (Number(p.monto) || 0), 0), 0)
        const totalVentas = ventasCompletadas.reduce((sum, v) => sum + Number(v.total || 0), 0)
        const totalVueltos = ventasCompletadas.reduce((sum, v) => sum + (v.vuelto || 0), 0)
        const totalGastosRegistrados = cajaGastos.reduce((sum, gasto) => sum + gasto.monto, 0)
        const totalGastosCierre = itemsCierre.filter(it => it.tipo === 'gasto').reduce((s, it) => s + (Number(it.monto) || 0), 0)
        const totalGastosUI = totalGastosRegistrados + totalGastosCierre
        const efectivoRealNum = Number(efectivoReal) || 0
        const totalAnulacionesUI = itemsCierre.filter(it => it.tipo === 'anulacion').reduce((s, it) => s + (Number(it.monto) || 0), 0)
        const totalDevolucionesUI = itemsCierre.filter(it => it.tipo === 'devolucion').reduce((s, it) => s + (Number(it.monto) || 0), 0)
        const efectivoTeoricoAntesGastos = totalEfectivo + (Number(sesionCaja.montoApertura) || 0)
        const efectivoTeorico = efectivoTeoricoAntesGastos - totalGastosUI - totalDevolucionesUI - Number(sesionCaja.devolucionesPosEfectivo || 0)
        const totalItemsMonto = totalAnulacionesUI + totalDevolucionesUI
        const diferencia = efectivoRealNum - efectivoTeorico
        const TIPO_CONFIG = {
          gasto:     { label: '📦 Gasto',      color: 'border-gray-300 bg-gray-50' },
          anulacion: { label: '🚫 Anulación',   color: 'border-red-200 bg-red-50' },
          devolucion:{ label: '🔄 Devolución',  color: 'border-amber-200 bg-amber-50' },
        }

        return (
          <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
            <div className="min-h-full flex items-start justify-center p-4 py-6">
            <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Comprobante Cierre de Caja</h2>
              <p className="text-sm text-gray-500 mb-4">Sucursal: {sedeNombre}</p>
              
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-[#eaf5f1] rounded-xl p-4 border border-[#bdddd1]">
                  <div className="text-xs text-[#087f73] font-bold mb-2">APERTURA</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Cajero:</span><span className="font-semibold text-gray-900">{sesionCaja.cajeroNombre}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Fecha:</span><span className="text-gray-900">{sesionCaja.aperturaAt?.toDate?.().toLocaleDateString('es-CL') || '--'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Hora:</span><span className="text-gray-900">{sesionCaja.aperturaAt?.toDate?.().toLocaleTimeString('es-CL') || '--'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Monto:</span><span className="font-bold text-[#087f73]">{fmtCLP(sesionCaja.montoApertura)}</span></div>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="text-xs text-[#405566] font-bold mb-2">CIERRE</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Fecha:</span><span className="text-gray-900">{new Date().toLocaleDateString('es-CL')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Hora:</span><span className="text-gray-900">{new Date().toLocaleTimeString('es-CL')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Ventas:</span><span className="font-bold text-gray-900">{ventasCompletadas.length}</span></div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 mb-4">
                <h3 className="font-bold text-gray-900 mb-3 text-sm">Resumen de Caja</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-gray-200">
                    <span className="text-gray-600">TOTAL EFECTIVO ({ventasCompletadas.filter(v => getSalePagos(v).some(p => p.metodo === 'efectivo')).length} Ventas)</span>
                    <span className="font-bold text-green-700">{fmtCLP(totalEfectivo)}</span>
                  </div>
                  <div className="flex justify-between py-1"><span className="text-gray-500 pl-4">Apertura</span><span className="text-gray-900">+{fmtCLP(sesionCaja.montoApertura)}</span></div>
                  {totalVueltos > 0 && (
                    <div className="flex justify-between py-1 text-xs text-gray-400"><span className="pl-4">ℹ️ Vueltos entregados</span><span className="text-gray-500">{fmtCLP(totalVueltos)}</span></div>
                  )}
                  <div className="flex justify-between py-1"><span className="text-gray-500 pl-4">Retiros y gastos</span><span className="font-semibold text-rose-600">-{fmtCLP(totalGastosUI)}</span></div>
                  <div className="flex justify-between py-1.5 border-y border-gray-200 bg-white/60 px-2 rounded-lg">
                    <span className="font-bold text-gray-700">Efectivo que debe haber</span>
                    <span className="font-black text-emerald-700">{fmtCLP(efectivoTeorico)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-200">
                    <span className="text-gray-600">T.Débito ({ventasCompletadas.filter(v => getSalePagos(v).some(p => p.metodo.toLowerCase() === 'debito')).length} Ventas)</span>
                    <span className="font-bold text-blue-700">{fmtCLP(totalDebito)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-200">
                    <span className="text-gray-600">TRANSFERENCIA ({ventasCompletadas.filter(v => getSalePagos(v).some(p => p.metodo.toLowerCase() === 'transferencia')).length} Ventas)</span>
                    <span className="font-bold text-purple-700">{fmtCLP(totalTransferencia)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-300 font-bold text-base">
                    <span className="text-gray-900">Total</span>
                    <span className="text-green-600">{fmtCLP(totalVentas)}</span>
                  </div>
                </div>
              </div>

              {(() => {
                const faltante = Math.max(0, -diferencia)
                const sobrante = Math.max(0, diferencia)
                const justificado = totalItemsMonto
                const pendiente = Math.max(0, faltante - justificado)
                const sinDatos = !efectivoReal
                const cuadra = !sinDatos && diferencia === 0
                const sobra = !sinDatos && diferencia > 0
                const falta = !sinDatos && pendiente > 0
                const panelBg = sinDatos
                  ? 'bg-yellow-50 border-yellow-200'
                  : cuadra ? 'bg-green-50 border-green-300'
                  : sobra ? 'bg-orange-50 border-orange-300'
                  : 'bg-red-50 border-red-300'
                const dividerColor = sinDatos
                  ? 'border-yellow-300'
                  : cuadra ? 'border-green-300'
                  : sobra ? 'border-orange-300'
                  : 'border-red-300'
                const labelColor = sinDatos
                  ? 'text-gray-700'
                  : cuadra ? 'text-green-800'
                  : sobra ? 'text-orange-800'
                  : 'text-red-800'
                const inputFocus = sinDatos
                  ? 'focus:border-yellow-500 focus:ring-yellow-100'
                  : cuadra ? 'focus:border-green-500 focus:ring-green-100'
                  : sobra ? 'focus:border-orange-500 focus:ring-orange-100'
                  : 'focus:border-red-500 focus:ring-red-100'
                return (
                <div className={`rounded-xl p-5 border mb-4 space-y-3 transition-colors duration-300 ${panelBg}`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`font-bold text-sm ${labelColor}`}>
                      {sinDatos ? '📋 Datos reales de cierre'
                        : cuadra ? '✅ Caja cuadrada correctamente'
                        : sobra ? `🟠 Sobrante en caja: ${fmtCLP(sobrante)}`
                        : `⚠️ Faltante sin justificar: ${fmtCLP(pendiente)}`}
                    </h3>
                  </div>

                  <div>
                    <label className={`text-xs mb-1 block font-medium ${labelColor}`}>Efectivo Real en Caja (CLP) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={efectivoReal ? Number(efectivoReal).toLocaleString('es-CL') : ''}
                        onChange={e => {
                          const digits = e.target.value.replace(/[^0-9]/g, '');
                          setEfectivoReal(digits);
                        }}
                        placeholder="0"
                        onWheel={e => e.currentTarget.blur()}
                        className={`w-full bg-white border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-gray-900 focus:outline-none focus:ring-2 ${inputFocus}`}
                      />
                    </div>
                  </div>

                  {cajaGastos.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-white/70 p-3">
                      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-rose-700">Gastos ya registrados</span><span className="text-xs font-black text-rose-700">-{fmtCLP(totalGastosRegistrados)}</span></div>
                      <div className="space-y-1">
                        {cajaGastos.map(gasto => <div key={gasto.id} className="flex justify-between gap-3 text-[11px] text-slate-500"><span className="truncate">{gasto.detalle}</span><span className="shrink-0 font-bold">{fmtCLP(gasto.monto)}</span></div>)}
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${labelColor}`}>Otros ajustes de cierre</span>
                      <button
                        type="button"
                        onClick={() => setItemsCierre(prev => [...prev, { tipo: 'gasto', monto: '', detalle: '', boletaNumero: '' }])}
                        className="text-xs bg-gray-800 text-white px-2.5 py-1 rounded-lg hover:bg-gray-700 transition"
                      >+ Agregar</button>
                    </div>
                    {itemsCierre.length === 0 && <p className="text-xs text-gray-400 italic">Sin ítems registrados</p>}
                    <div className="space-y-2">
                      {itemsCierre.map((item, idx) => (
                        <div key={idx} className={`border rounded-xl p-3 ${TIPO_CONFIG[item.tipo].color}`}>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <select
                              value={item.tipo}
                              onChange={e => setItemsCierre(prev => prev.map((it, i) => i === idx ? { ...it, tipo: e.target.value as any } : it))}
                              className="border rounded-lg px-2 py-1.5 text-xs font-semibold h-9 bg-white"
                            >
                              <option value="gasto">📦 Gasto</option>
                              <option value="anulacion">🚫 Anulación</option>
                              <option value="devolucion">🔄 Devolución</option>
                            </select>
                            <input
                              type="number"
                              value={item.monto}
                              onChange={e => setItemsCierre(prev => prev.map((it, i) => i === idx ? { ...it, monto: e.target.value } : it))}
                              placeholder="Monto $"
                              onWheel={e => e.currentTarget.blur()}
                              className="w-28 border rounded-lg px-2 py-1.5 h-9 text-sm bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setItemsCierre(prev => prev.filter((_, i) => i !== idx))}
                              className="ml-auto text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1"
                            >✕</button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={item.detalle}
                              onChange={e => setItemsCierre(prev => prev.map((it, i) => i === idx ? { ...it, detalle: e.target.value } : it))}
                              placeholder={item.tipo === 'devolucion' ? 'Producto / motivo *' : 'Descripción / detalle *'}
                              className="border rounded-lg px-2 py-2 text-sm w-full bg-white"
                            />
                            <input
                              type="text"
                              value={item.boletaNumero}
                              onChange={e => setItemsCierre(prev => prev.map((it, i) => i === idx ? { ...it, boletaNumero: e.target.value } : it))}
                              placeholder="N° Boleta (si aplica)"
                              className="border rounded-lg px-2 py-2 text-sm w-full bg-white"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`space-y-1.5 text-sm pt-2 border-t ${dividerColor}`}>
                    <div className="flex justify-between"><span className="text-gray-600">Efectivo Teórico:</span><span className="font-semibold text-gray-900">{fmtCLP(efectivoTeorico)}</span></div>
                    {efectivoRealNum > 0 && <>
                      <div className="flex justify-between"><span className="text-gray-600">Efectivo Real:</span><span className="font-semibold text-gray-900">{fmtCLP(efectivoRealNum)}</span></div>
                      <div className="flex justify-between font-bold">
                        <span className={diferencia >= 0 ? 'text-green-700' : 'text-red-700'}>Diferencia:</span>
                        <span className={diferencia >= 0 ? 'text-green-700' : 'text-red-700'}>{diferencia >= 0 ? '+' : ''}{fmtCLP(diferencia)}</span>
                      </div>
                    </>}
                    {totalGastosUI > 0 && <div className="flex justify-between"><span className="text-gray-600">Gastos:</span><span className="font-semibold text-red-600">-{fmtCLP(totalGastosUI)}</span></div>}
                    {totalAnulacionesUI > 0 && <div className="flex justify-between"><span className="text-gray-600">Anulaciones:</span><span className="font-semibold text-red-600">-{fmtCLP(totalAnulacionesUI)}</span></div>}
                    {totalDevolucionesUI > 0 && <div className="flex justify-between"><span className="text-gray-600">Devoluciones:</span><span className="font-semibold text-amber-600">-{fmtCLP(totalDevolucionesUI)}</span></div>}
                    {totalItemsMonto > 0 && <div className={`flex justify-between font-semibold border-t pt-1.5 ${dividerColor}`}><span className="text-gray-700">Total justificado:</span><span className="text-gray-800">-{fmtCLP(totalItemsMonto)}</span></div>}
                    {!sinDatos && (
                      <div className={`flex justify-between font-bold text-base pt-1 border-t ${dividerColor}`}>
                        <span className={cuadra ? 'text-green-700' : sobra ? 'text-orange-700' : 'text-red-700'}>
                          {cuadra ? '✅ Cuadra' : sobra ? '🟠 Sobrante' : '❌ Faltante sin justificar'}
                        </span>
                        <span className={cuadra ? 'text-green-700' : sobra ? 'text-orange-700' : 'text-red-700'}>
                          {cuadra ? fmtCLP(0) : sobra ? `+${fmtCLP(sobrante)}` : fmtCLP(pendiente)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                )
              })()}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center text-xs text-slate-600 flex items-center justify-center gap-1.5 font-medium">
                <Printer size={14} className="text-slate-500 shrink-0" />
                <span>Al confirmar, el corte se imprimirá automáticamente en la impresora térmica.</span>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowCierre(false); setEfectivoReal(''); setItemsCierre([]) }}
                  className="flex-1 text-gray-600 hover:text-gray-800 font-medium transition text-sm py-3">
                  Cancelar
                </button>
                <button
                  onClick={handleCerrarCaja}
                  disabled={!efectivoReal}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl py-3 font-bold transition flex items-center justify-center gap-2 shadow-sm">
                  <Printer size={16} />
                  <span>Cerrar e Imprimir Corte</span>
                </button>
              </div>
            </div>
            </div>
          </div>
        )
      })()}
      {/* Modal editar método de pago */}
      {editPagoTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Edit3 size={16} className="text-[#087f73]" />
                <span className="font-bold text-gray-900 text-sm">Editar forma de pago</span>
              </div>
              <button onClick={() => setEditPagoTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Venta info */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
                <div className="font-bold text-gray-900">{fmtCLP(editPagoTarget.total)}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Pago actual: <span className="font-semibold capitalize">{(editPagoTarget.pagos || []).map((p: any) => p.metodo).join(' + ')}</span>
                </div>
              </div>

              {!editPagoPinOk ? (
                /* Paso 1: PIN */
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ingresa el PIN</label>
                  <input
                    type="password"
                    value={editPagoPin}
                    onChange={e => { setEditPagoPin(e.target.value); setEditPagoPinError(false) }}
                    onKeyDown={e => e.key === 'Enter' && handleEditPagoPin()}
                    placeholder="PIN de seguridad"
                    autoFocus
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 ${editPagoPinError ? 'border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:ring-teal-100 focus:border-teal-500'}`}
                  />
                  {editPagoPinError && <p className="text-xs text-red-600 text-center font-medium">PIN incorrecto</p>}
                  <button
                    onClick={handleEditPagoPin}
                    className="w-full py-2.5 bg-[#087f73] hover:bg-[#06695f] text-white rounded-xl text-sm font-bold transition"
                  >
                    Confirmar PIN
                  </button>
                </div>
              ) : (
                /* Paso 2: Seleccionar método */
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-600">Motivo de edición · obligatorio<textarea value={editPagoReason} onChange={e => setEditPagoReason(e.target.value)} maxLength={500} rows={2} placeholder="Explica por qué se modifica esta boleta" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500" /></label>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nuevo método de pago</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['efectivo', 'debito', 'transferencia'] as MetodoPago[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setEditPagoMetodo(m)}
                        className={`py-2.5 rounded-xl text-xs font-bold capitalize border-2 transition ${
                          editPagoMetodo === m
                            ? 'border-teal-500 bg-teal-50 text-teal-800'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {m === 'efectivo' ? '💵 Efectivo' : m === 'debito' ? '💳 Débito' : '📲 Transfer'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleEditPagoSave}
                    disabled={editPagoSaving || !editPagoReason.trim()}
                    className="w-full py-2.5 bg-[#087f73] hover:bg-[#06695f] disabled:opacity-60 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
                  >
                    {editPagoSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {editPagoSaving ? 'Guardando...' : 'Guardar cambio'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Crear o renombrar pestaña de cliente */}
      {showCustomerTabModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4" onClick={() => setShowCustomerTabModal(false)}>
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl animate-[scaleIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {customerTabModalMode === 'new' ? 'Nueva atención' : 'Editar atención'}
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-900">
                  {customerTabModalMode === 'new' ? 'Atender otro cliente' : 'Cambiar nombre'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {customerTabModalMode === 'new'
                    ? `Escribe un nombre para identificar la venta. Si lo dejas vacío se usará Cliente ${nextCustomerNumber}.`
                    : 'Usa un nombre corto para encontrar esta venta rápidamente.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerTabModal(false)}
                className="grid h-8 w-8 shrink-0 place-content-center rounded-full bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
            <input
              value={customerTabName}
              onChange={e => setCustomerTabName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCustomerTabModal() }}
              placeholder={customerTabModalMode === 'new' ? `Cliente ${nextCustomerNumber} (opcional)` : 'Nombre del cliente'}
              maxLength={30}
              autoFocus
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
            />
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowCustomerTabModal(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitCustomerTabModal}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 active:scale-[0.98] transition"
              >
                {customerTabModalMode === 'new' ? 'Abrir venta' : 'Guardar nombre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div role={toast.type === 'err' ? 'alert' : 'status'} className={`max-w-[calc(100vw-24px)] fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold z-50 animate-[fadeIn_0.2s] border ${
          toast.type === 'ok' ? 'bg-green-50 text-green-800 border-green-200' :
          toast.type === 'err' ? 'bg-red-50 text-red-800 border-red-200' :
          'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          {toast.type === 'ok' && <CheckCircle size={18} className="text-green-600" />}
          {toast.type === 'err' && <AlertCircle size={18} className="text-red-600" />}
          {toast.msg}
        </div>
      )}

      {/* Confirmación de producto sin stock */}
      {pendingStockAdd && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          onClick={() => setPendingStockAdd(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl animate-[scaleIn_0.25s_cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ boxShadow: '0 24px 64px -12px rgba(15,23,42,0.3)' }}
          >
            {/* Header */}
            <div className="relative px-5 pt-5 pb-4">
              <div className="flex items-start gap-3">
                <img
                  src="https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789438033206-advertencia.png"
                  alt="Alerta de stock"
                  className="h-14 w-14 object-contain shrink-0 animate-[alertPulse_1.6s_ease-in-out_infinite]"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-slate-900 tracking-tight leading-tight">Sin stock disponible</h3>
                  <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Venta pendiente</p>
                  </div>
                </div>
                <button
                  onClick={() => setPendingStockAdd(null)}
                  className="shrink-0 grid h-8 w-8 place-content-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all duration-200 hover:scale-110 active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body: producto */}
            <div className="px-5 py-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 transition-all duration-200 hover:bg-slate-100/60">
                {pendingStockAdd.product.imageUrl ? (
                  <img
                    src={pendingStockAdd.product.imageUrl}
                    alt={pendingStockAdd.product.nombre}
                    className="h-14 w-14 rounded-xl object-cover shrink-0 border border-slate-200"
                  />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-content-center rounded-xl bg-white border border-slate-200 text-slate-300">
                    <Package size={22} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{pendingStockAdd.product.nombre}</p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">{pendingStockAdd.product.sku}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Disponible</p>
                  <p className="text-lg font-black text-slate-400 leading-none mt-0.5">{pendingStockAdd.availableStock}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Hay en stock</p>
                  <p className="mt-0.5 text-base font-black text-slate-500">{pendingStockAdd.availableStock}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Debiendo stock</p>
                  <p className="mt-0.5 text-base font-black text-rose-600">{pendingStockAdd.stockDebt}</p>
                  {pendingStockAdd.stockDebt > pendingStockAdd.requestedQty && (
                    <p className="mt-0.5 text-[8px] text-slate-400 font-medium">
                      {pendingStockAdd.stockDebt - pendingStockAdd.requestedQty} + {pendingStockAdd.requestedQty} nuevo
                    </p>
                  )}
                </div>
              </div>

              {pendingStockAdd.webReservation && pendingStockAdd.webReservation.qty > 0 && (
                <div className="mt-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl shrink-0 leading-none">⚠️</span>
                    <div className="text-xs flex-1">
                      <p className="font-extrabold text-amber-950 uppercase tracking-wide">
                        ¡Atención Cajera! {pendingStockAdd.webReservation.qty} {pendingStockAdd.webReservation.qty === 1 ? 'unidad reservada' : 'unidades reservadas'} para pedidos WEB
                      </p>
                      <p className="mt-1 font-semibold text-amber-900 leading-snug">
                        Hay {pendingStockAdd.webReservation.qty} {pendingStockAdd.webReservation.qty === 1 ? 'unidad física apartada' : 'unidades físicas apartadas'} en {(pendingStockAdd.webReservation.orderCount || pendingStockAdd.webReservation.orderCodes.length) === 1 ? 'el pedido web' : 'pedidos web'}.
                        {pendingStockAdd.webReservation.orderCodes.length > 0 && <span className="font-black text-amber-950 ml-1 underline">{pendingStockAdd.webReservation.orderCodes.slice(0, 4).join(', ')}{pendingStockAdd.webReservation.orderCodes.length > 4 ? ` (+${pendingStockAdd.webReservation.orderCodes.length - 4})` : ''}</span>}
                      </p>
                      <div className="mt-2 text-[11px] font-bold text-amber-950 bg-amber-100/90 p-2 rounded-xl border border-amber-300/80 leading-tight">
                        📢 <span className="underline font-black">Consulta al bodeguero / encargado web</span> antes de tomar este producto del mostrador o estante.
                        <span className="block mt-0.5 text-[10px] font-normal text-amber-800">Si lo vendes en caja física, podrías dejar sin stock el pedido web ya confirmado o en proceso.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                Este producto no tiene stock disponible. Si lo agregas, la venta quedará
                <span className="font-bold text-slate-700"> pendiente</span> y el stock se descontará más adelante al completar la venta.
              </p>
            </div>

            {/* Footer: acciones */}
            <div className="px-5 pb-5 pt-2 flex gap-2.5">
              <button
                onClick={() => setPendingStockAdd(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.97] transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const item = pendingStockAdd
                  setPendingStockAdd(null)
                  if (item) addToCart(item.product, item.priceField, true)
                }}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 active:scale-[0.97] transition-all duration-200"
                style={{ boxShadow: '0 4px 14px -2px rgba(15,23,42,0.25)' }}
              >
                Agregar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {showPendingSales && isCajera && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white  border border-slate-200  rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900  flex items-center gap-2">
                <Send size={18} className="text-blue-600 " /> Pendientes recibidos
              </h2>
              <button onClick={() => setShowPendingSales(false)} className="text-gray-400 hover:text-gray-600 "><X size={20} /></button>
            </div>

            {pendingSales.length === 0 ? (
              <p className="text-sm text-gray-400  text-center py-8">No hay carritos ni cotizaciones pendientes</p>
            ) : (
              <div className="space-y-3">
                {pendingSales.map(sale => {
                  const esTraspasoEntreCajeras = sale.tipoEnvio === 'traspaso_cajera'
                  const senderId = sale.enviadoPorId || sale.vendedoraId
                  const senderName = sale.enviadoPorNombre || sale.vendedoraNombre || 'Usuario POS'
                  const senderUser = loginUsers.find(u => u.id === senderId)
                  return (
                  <div key={sale.id} className="rounded-xl border border-blue-200  bg-blue-50/40  p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {sale.enviadoPorFoto || senderUser?.fotoUrl ? (
                          <img src={sale.enviadoPorFoto || senderUser?.fotoUrl || ''} alt={senderName} className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-200 " />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-blue-200 ">
                            {senderName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-gray-900 ">{senderName}</div>
                          <div className="text-[10px] text-gray-500 ">{sale.devueltoAlRemitente ? 'Carrito devuelto por' : esTraspasoEntreCajeras ? 'Cajera que pasa el carrito' : 'Vendedor(a)'}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-blue-700 ">{fmtCLP(sale.total || 0)}</div>
                        <div className="text-[10px] text-gray-500 ">{sale.totalItems || 0} items</div>
                      </div>
                    </div>
                    {sale.clienteNombre && (
                      <div className="text-xs text-gray-700  mb-2 bg-white  rounded-lg px-2.5 py-1.5 border border-gray-100 ">
                        👤 <span className="font-bold">{sale.clienteNombre}</span>
                        {sale.clienteRut && <span className="ml-2 text-gray-400 ">RUT: {sale.clienteRut}</span>}
                        {sale.clienteTelefono && <span className="ml-2 text-gray-400 ">Tel: {sale.clienteTelefono}</span>}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-500  mb-2.5">
                      {sale.items?.slice(0, 3).map((it: any, i: number) => (
                        <span key={i}>{it.nombre} x{it.cantidad}{i < Math.min(sale.items.length, 3) - 1 ? ', ' : ''}</span>
                      ))}
                      {sale.items?.length > 3 && <span> +{sale.items.length - 3} más</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptPendingSale(sale)}
                        className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition shadow-sm"
                      >Abrir en pestaña</button>
                      <button
                        onClick={() => handleRejectPendingSale(sale)}
                        className="px-3 py-2 rounded-lg bg-red-50  hover:bg-red-100  text-red-600  text-xs font-semibold transition border border-red-200 "
                      >{esTraspasoEntreCajeras && !sale.devueltoAlRemitente ? 'Devolver' : 'Rechazar'}</button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de pre-ventas para JEFE */}
      {showPreVentas && isJefe && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Receipt size={18} className="text-amber-600" /> Pre-ventas por cobrar
              </h2>
              <button onClick={() => setShowPreVentas(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {preVentas.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay pre-ventas pendientes</p>
            ) : (
              <div className="space-y-3">
                {preVentas.map((pv: any) => (
                  <div key={pv.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-amber-200">
                          {(pv.cajeroNombre || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{pv.cajeroNombre || 'Cajera'}</div>
                          <div className="text-[10px] text-gray-500">Cajera · Pre-venta</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-amber-700">{fmtCLP(pv.total || 0)}</div>
                        <div className="text-[10px] text-gray-500">{(pv.items || []).reduce((s: number, it: any) => s + Number(it.cantidad || 0), 0)} items</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                      {(pv.items || []).slice(0, 3).map((it: any, i: number) => (
                        <span key={i}>{it.nombre} x{it.cantidad}{i < Math.min((pv.items || []).length, 3) - 1 ? ', ' : ''}</span>
                      ))}
                      {(pv.items || []).length > 3 && <span> +{(pv.items || []).length - 3} más</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptPreventa(pv)}
                        className="flex-1 py-2 rounded-lg bg-[#087f73] hover:bg-[#06695f] text-white text-xs font-bold transition"
                      >Cargar y Cobrar</button>
                      <button
                        onClick={() => handleRejectPreventa(pv)}
                        className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition border border-red-200"
                      >Anular</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send to Cajera modal (vendedora mode) */}
      {showSendToCajera && (isVendedora || isCajera) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white  border border-slate-200  rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900  mb-1 flex items-center gap-2">
              <Send size={18} className="text-blue-600 " /> {isVendedora ? 'Enviar cotización a cajera' : 'Pasar carrito a otra cajera'}
            </h2>
            <p className="text-xs text-gray-500  mb-4">
              {totalItemsCount} producto{totalItemsCount > 1 ? 's' : ''} · Total: <span className="font-bold text-gray-900 ">{fmtCLP(totalCart)}</span>
              {isCajera && <span className="block mt-1">El carrito se transfiere sin registrar ni cobrar la venta.</span>}
            </p>

            {/* Customer data is only requested for vendor quotes. */}
            {isVendedora && <div className="space-y-3 mb-5">
              <div className="text-xs font-bold text-gray-700  uppercase tracking-wide">Datos del cliente</div>
              <div>
                <label className="text-xs text-gray-600  mb-1 block">Nombre *</label>
                <input
                  type="text"
                  value={clienteNombre}
                  onChange={e => setClienteNombre(e.target.value)}
                  aria-label="Nombre del cliente" placeholder="Nombre del cliente"
                  className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600  mb-1 block">RUT (opcional)</label>
                  <input
                    type="text"
                    value={clienteRut}
                    onChange={e => setClienteRut(e.target.value)}
                    placeholder="12.345.678-9"
                    className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600  mb-1 block">Teléfono (opcional)</label>
                  <input
                    type="tel"
                    value={clienteTelefono}
                    onChange={e => setClienteTelefono(e.target.value)}
                    placeholder="+56954592656"
                    className="w-full border border-gray-200     rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 "
                  />
                </div>
              </div>
            </div>}

            {/* Select cajera */}
            <div className="text-xs font-bold text-gray-700  uppercase tracking-wide mb-3">Seleccionar cajera</div>
            <div className="space-y-2 mb-4">
              {availableCashiers.map(caj => (
                <button
                  key={caj.id}
                  onClick={() => handleSendToCajera(caj.id, caj.nombre)}
                  disabled={sendingToCajera}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200   hover:border-emerald-300  hover:bg-emerald-50  transition text-left"
                >
                  {caj.fotoUrl ? (
                    <img src={caj.fotoUrl} alt={caj.nombre} className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200 " />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                      {caj.nombre.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900  text-sm">{caj.nombre}</div>
                    <div className="text-[10px] text-gray-500 ">{caj.cargo}</div>
                  </div>
                  <Send size={14} className="text-emerald-500  shrink-0" />
                </button>
              ))}
              {availableCashiers.length === 0 && (
                <p className="text-xs text-gray-400  text-center py-4">No hay cajeras disponibles en esta sucursal</p>
              )}
            </div>

            <button
              onClick={() => setShowSendToCajera(false)}
              className="w-full py-2.5 rounded-xl border border-gray-200  hover:bg-gray-50  text-sm font-medium text-gray-600  transition"
            >Cancelar</button>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {/* Lightbox */}
      {(lightboxUrl || (lightboxProduct && !showBasicProductEditor)) && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={closeProductLightbox}
        >
          <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            {lightboxUrl ? (
              <img src={lightboxUrl} alt={lightboxProduct?.nombre || 'producto'} className="w-full rounded-2xl shadow-2xl object-contain max-h-[70vh] bg-white" />
            ) : (
              <div className="w-full h-56 rounded-2xl shadow-2xl bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Package size={48} />
                <span className="text-xs font-semibold">Sin imagen registrada</span>
              </div>
            )}
            {lightboxProduct && (
              <div className="mt-3 rounded-2xl bg-white p-3.5 shadow-xl">
                <div className={isNivelAlto ? "mb-2.5 min-w-0" : "min-w-0"}>
                  <p className="truncate text-sm font-black text-slate-900">{lightboxProduct.nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-slate-500">
                    <span>SKU: {lightboxProduct.sku}</span>
                    {lightboxProduct.codigo_barra && <span>· Cód: {lightboxProduct.codigo_barra}</span>}
                  </div>
                </div>
                {isNivelAlto && (
                  <button
                    type="button"
                    onClick={() => openBasicProductEditor(lightboxProduct)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#087f73] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#06695f] active:scale-[0.98] cursor-pointer"
                  >
                    <Edit3 size={14} /> Editar producto / Precio emergencia
                  </button>
                )}
              </div>
            )}
            <button
              onClick={closeProductLightbox}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 transition cursor-pointer"
              aria-label="Cerrar imagen"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {showBasicProductEditor && lightboxProduct && isNivelAlto && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4" onClick={() => !basicProductSaving && setShowBasicProductEditor(false)}>
          <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur px-5 py-3.5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">Edición rápida desde POS · Nivel Alto</p>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">Editar producto</h2>
                <p className="text-[11px] text-slate-400">Los cambios y precios personalizados quedan registrados en auditoría.</p>
              </div>
              <button disabled={basicProductSaving} onClick={() => setShowBasicProductEditor(false)} className="grid h-8 w-8 place-content-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40 cursor-pointer"><X size={16} /></button>
            </div>

            <div className="grid gap-5 p-4 sm:p-5 sm:grid-cols-[195px_minmax(0,1fr)] items-start">
              {/* Columna Izquierda: Imagen + Precio de Emergencia debajo */}
              <div className="space-y-3">
                <div
                  tabIndex={0}
                  onPaste={e => {
                    const file = Array.from(e.clipboardData?.files || []).find(item => item.type.startsWith('image/'))
                    if (!file) return
                    e.preventDefault()
                    uploadBasicProductImage(file)
                  }}
                  className="outline-none"
                >
                  {basicProductForm.imageUrl ? (
                    <img src={basicProductForm.imageUrl} alt={basicProductForm.nombre} className="aspect-square w-36 sm:w-full mx-auto rounded-2xl border border-slate-200 object-cover shadow-xs" />
                  ) : (
                    <div className="grid aspect-square w-36 sm:w-full mx-auto place-content-center rounded-2xl bg-slate-100 border border-slate-200 text-slate-300">
                      <Package size={36} />
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <label className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1.5 text-center text-[10px] font-bold text-slate-600 hover:bg-slate-200 transition">
                      <Camera size={12} className="mr-1 inline" />{basicProductForm.imageUrl ? 'Cambiar' : 'Subir'}
                      <input type="file" accept="image/*" className="hidden" disabled={basicImageUploading} onChange={e => { const file = e.target.files?.[0]; if (file) uploadBasicProductImage(file); e.target.value = '' }} />
                    </label>
                    <button type="button" disabled={basicImageUploading} onClick={pasteBasicProductImage} className="rounded-lg bg-teal-50 px-2 py-1.5 text-[10px] font-bold text-[#087f73] hover:bg-teal-100 disabled:opacity-50 transition cursor-pointer">Pegar</button>
                  </div>
                </div>

                {/* Bloque de Precio de Emergencia / Borrador debajo de la imagen */}
                <div className="rounded-2xl border border-amber-300 bg-gradient-to-b from-amber-50/90 to-orange-50/50 p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-900">
                      <Zap size={12} className="text-amber-600 fill-amber-500 shrink-0" />
                      Precio Emergencia
                    </span>
                    <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[8.5px] font-extrabold text-amber-900">
                      Solo esta venta
                    </span>
                  </div>
                  <p className="text-[10px] leading-snug text-amber-800/90 mb-2">
                    Aplica un precio personalizado o de borrador para vender ahora sin alterar la lista fija.
                  </p>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-amber-700">$</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Monto venta..."
                        value={basicProductForm.precioEmergencia}
                        onChange={e => setBasicProductForm(form => ({ ...form, precioEmergencia: e.target.value }))}
                        onWheel={e => e.currentTarget.blur()}
                        className="w-full rounded-xl border border-amber-300 bg-white py-1.5 pl-6 pr-2 text-xs font-black text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Motivo (ej: autorizado jefe)"
                      value={basicProductForm.motivoEmergencia}
                      onChange={e => setBasicProductForm(form => ({ ...form, motivoEmergencia: e.target.value }))}
                      className="w-full rounded-xl border border-amber-200/90 bg-white/90 px-2.5 py-1.5 text-[10px] font-medium text-slate-700 placeholder-slate-400 outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={basicProductSaving || basicImageUploading}
                      onClick={() => handleApplyEmergencyPrice()}
                      className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-extrabold text-[11px] py-2 px-2.5 shadow-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Zap size={12} /> Aplicar a esta venta
                    </button>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Datos del producto y Precios */}
              <div className="space-y-3.5 min-w-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">
                    SKU
                    <input
                      value={basicProductForm.sku}
                      onChange={e => setBasicProductForm(form => ({ ...form, sku: e.target.value.toUpperCase() }))}
                      placeholder="SKU del producto"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Código de barras
                    <input
                      value={basicProductForm.codigo_barra}
                      onChange={e => setBasicProductForm(form => ({ ...form, codigo_barra: e.target.value }))}
                      placeholder="Escanea o escribe código"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_165px]">
                  <label className="block text-xs font-bold text-slate-600">
                    Nombre del producto
                    <input
                      value={basicProductForm.nombre}
                      onChange={e => setBasicProductForm(form => ({ ...form, nombre: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                    />
                  </label>
                  <label className="block text-xs font-bold text-slate-600">
                    Unidades por embalaje
                    <div className="relative mt-1">
                      <input
                        type="number"
                        min="0"
                        placeholder="Ej: 24"
                        value={basicProductForm.packageQty}
                        onChange={e => setBasicProductForm(form => ({ ...form, packageQty: e.target.value }))}
                        onWheel={e => e.currentTarget.blur()}
                        className="w-full rounded-xl border border-sky-300 bg-sky-50/40 px-3 py-2 pr-10 text-xs sm:text-sm font-extrabold text-sky-950 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-50 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-sky-700 pointer-events-none">
                        uds/caja
                      </span>
                    </div>
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold text-slate-600">Precios de catálogo</span>
                    <span className="text-[10px] font-semibold text-slate-400">Stock actual en sala: <strong className="text-slate-700">{basicProductForm.stock} uds</strong></span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { key: 'costo_uni', label: 'Costo', box: 'border-rose-200 bg-rose-50/80', text: 'text-rose-700', input: 'border-rose-200 focus:border-rose-400' },
                      { key: 'precio_venta_1', label: 'Efectivo', box: 'border-emerald-200 bg-emerald-50/80', text: 'text-emerald-700', input: 'border-emerald-200 focus:border-emerald-400' },
                      { key: 'precio_venta_2', label: 'Embalaje', box: 'border-teal-200 bg-teal-50/80', text: 'text-teal-800', input: 'border-teal-200 focus:border-teal-400' },
                      { key: 'precio_venta_3', label: 'Embalaje 2', box: 'border-amber-200 bg-amber-50/80', text: 'text-amber-800', input: 'border-amber-200 focus:border-amber-400' },
                    ].map(field => (
                      <label key={field.key} className={`rounded-xl border p-2 text-[10px] font-black uppercase tracking-wide ${field.box} ${field.text} min-w-0`}>
                        <span className="block truncate">{field.label}</span>
                        <div className="relative mt-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold opacity-60 pointer-events-none">$</span>
                          <input
                            type="number"
                            min="0"
                            value={basicProductForm[field.key as keyof typeof basicProductForm]}
                            onChange={e => setBasicProductForm(form => ({ ...form, [field.key]: e.target.value }))}
                            onWheel={e => e.currentTarget.blur()}
                            className={`w-full rounded-lg border bg-white py-1.5 pl-4.5 pr-1.5 text-xs sm:text-[13px] font-extrabold tabular-nums text-slate-900 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${field.input}`}
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 grid grid-cols-2 gap-2.5 border-t border-slate-100 bg-white/95 backdrop-blur px-4 py-3.5 sm:px-5">
              <button
                disabled={basicProductSaving || basicImageUploading}
                onClick={() => setShowBasicProductEditor(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={basicProductSaving || basicImageUploading}
                onClick={handleSaveBasicProduct}
                className="rounded-xl bg-[#087f73] px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#06695f] disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {basicProductSaving ? 'Guardando cambios...' : basicImageUploading ? 'Subiendo imagen...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCR Scanner Modal */}

      {/* Modal de Revalidación: Tarjetas Rojas de Advertencia y Decisión de la Cajera */}
      {revalidationNotice && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl border border-red-200 animate-in fade-in zoom-in duration-200 my-auto">
            {/* Header */}
            <div className="flex items-start gap-4 pb-5 border-b border-red-100 mb-6">
              <div className="p-3 bg-red-100 border border-red-200 rounded-2xl text-red-600 shrink-0">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-red-600 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
                    Atención Cajera · Advertencia de Stock
                  </span>
                </div>
                <h3 className="font-black text-xl sm:text-2xl text-slate-900 tracking-tight">
                  Advertencia de Stock Físico en Tienda
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1 leading-relaxed">
                  Los precios de venta en tu carrito <strong>se respetan al 100%</strong>. Elige cómo deseas gestionar las cantidades para completar esta venta:
                </p>
              </div>
            </div>

            {/* Product Cards List con Fondo Rojo */}
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 mb-6">
              {revalidationNotice.items.map((item, idx) => (
                <div key={idx} className="bg-red-50/70 rounded-2xl p-4 sm:p-5 border-2 border-red-400 shadow-sm relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" />
                  <div className="flex items-start gap-4">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.nombre}
                        onClick={() => openProductLightbox({ sku: item.sku, nombre: item.nombre } as any, item.imageUrl)}
                        className="w-16 h-16 rounded-xl object-cover bg-white border-2 border-red-200 shrink-0 cursor-zoom-in hover:scale-105 transition shadow-sm"
                        title="Click para ampliar imagen"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-400 font-bold shrink-0">
                        <Package size={24} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="font-bold text-slate-900 text-base truncate">{item.nombre}</h4>
                        <span className="text-[10px] font-mono font-bold bg-white text-slate-700 px-2 py-0.5 rounded-md border border-red-200 shrink-0">
                          SKU: {item.sku}
                        </span>
                      </div>

                      {/* Grid de Métricas Reales */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                        {/* Tarjeta de Stock */}
                        <div className="p-3 rounded-xl border bg-white border-red-200 text-slate-800 shadow-xs">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1 text-red-700">
                            <Package size={14} className="text-red-600" />
                            <span>Estado de Stock</span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Solicitado:</span>
                              <strong className="text-slate-900 font-bold">{item.requestedQty} ud(s)</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">En tienda física:</span>
                              <strong className="text-red-600 font-black">{item.realStock} ud(s)</strong>
                            </div>
                            {item.missingQty > 0 && (
                              <div className="flex justify-between border-t border-red-100 pt-1 text-rose-700 font-extrabold">
                                <span>Faltan por entregar (Deuda):</span>
                                <span>{item.missingQty} ud(s)</span>
                              </div>
                            )}
                          </div>

                          {item.isWebReservationConflict && (
                            <div className="mt-2.5 p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold leading-tight flex items-center gap-1.5">
                              <Globe size={13} className="shrink-0 text-amber-600" />
                              <span>Stock reservado por pedido web ({item.webReservedQty} ud en {item.webOrderCodes?.join(', ') || 'online'}).</span>
                            </div>
                          )}
                        </div>

                        {/* Tarjeta de Precio (Respetado) */}
                        <div className="p-3 rounded-xl border bg-white border-slate-200 text-slate-800 shadow-xs">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1 text-emerald-700">
                            <DollarSign size={14} className="text-emerald-600" />
                            <span>Precio en Carrito</span>
                          </div>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xs text-slate-500">Precio acordado:</span>
                            <span className="text-base font-black text-slate-900">{fmtCLP(item.oldPrice)}</span>
                          </div>
                          <p className="text-[11px] font-semibold text-emerald-700 mt-2">✓ Precio respetado sin modificaciones</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Acciones de la Cajera */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    const nextCart = revalidationNotice.deberStockCartItems;
                    setCart(nextCart);
                    setRevalidationNotice(null);
                    handleCompleteSale(nextCart, true);
                  }}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Check size={18} />
                  Vender de todas formas (Deber Stock)
                </button>
                <button
                  onClick={() => {
                    setCart(revalidationNotice.adjustedCartItems);
                    setRevalidationNotice(null);
                    showToast('Carrito ajustado al stock disponible en tienda.', 'info');
                  }}
                  className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <RefreshCw size={18} />
                  Ajustar a Stock Disponible
                </button>
              </div>

              <button
                onClick={() => {
                  setRevalidationNotice(null);
                }}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
              >
                <X size={16} />
                Volver al Carrito (Revisar sin modificar)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS mobile keyframes */}
      <style>{`
        @keyframes slideUp { 0%{transform:translate(-50%,20px);opacity:0} 100%{transform:translate(-50%,0);opacity:1} }
        @keyframes fadeIn { 0%{opacity:0} 100%{opacity:1} }
        @keyframes scaleIn { 0%{transform:scale(0.92);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes alertPulse {
          0%, 100% { transform: scale(1); opacity: 1 }
          50% { transform: scale(1.12); opacity: 0.85 }
        }
        @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .animated-gradient {
          background-size: 200% 200%;
          animation: gradientShift 4s ease infinite;
        }
        [data-pos-personal-theme] [class*="bg-emerald-500"],
        [data-pos-personal-theme] [class*="bg-emerald-600"],
        [data-pos-personal-theme] [class*="bg-emerald-700"] {
          background-color: var(--pos-personal-accent) !important;
        }
        [data-pos-personal-theme] [class~="bg-emerald-50"],
        [data-pos-personal-theme] [class~="bg-emerald-100"],
        [data-pos-personal-theme] [class*="bg-emerald-50/"],
        [data-pos-personal-theme] [class*="bg-emerald-100/"],
        [data-pos-personal-theme] [class*="bg-emerald-950/"] {
          background-color: var(--pos-personal-accent-soft) !important;
        }
        [data-pos-personal-theme] [class*="text-emerald-"] {
          color: var(--pos-personal-accent-text) !important;
        }
        [data-pos-personal-theme] [class*="border-emerald-"] {
          border-color: var(--pos-personal-accent-border) !important;
        }
        [data-pos-personal-theme] [class*="from-emerald-"] {
          --tw-gradient-from: var(--pos-personal-accent) var(--tw-gradient-from-position) !important;
        }
        [data-pos-personal-theme] [class*="to-emerald-"],
        [data-pos-personal-theme] [class*="to-teal-"] {
          --tw-gradient-to: var(--pos-accent-2, var(--pos-personal-accent)) var(--tw-gradient-to-position) !important;
        }
      `}</style>

      {/* ═══ MODAL DE COTIZACIÓN PROFESIONAL (PDF CON FOTOS Y PRECIOS MAYORISTAS) ═══ */}
      <PosCotizacionModal
        isOpen={showCotizacion && puedeGenerarCotizacion}
        onClose={() => setShowCotizacion(false)}
        cart={cart}
        descuentoGlobalPct={descuentoGlobalPct}
        sede={sede}
        posUser={posUser}
        activeTabName={customerTabs.find(t => t.id === activeCustomerTabId)?.name || ''}
        products={products}
        empresaConfig={empresaConfig}
        showToast={showToast}
      />



      {/* ═══ MODAL DE ETIQUETAS PDF DEL CARRITO ACTUAL ═══ */}
      {showCartLabelsModal && (
        <RecentPriceLabelsModal
          products={cartProductsForLabels}
          onClose={() => setShowCartLabelsModal(false)}
          title="Etiquetas de Precios · Carrito de Venta"
          subtitle="Productos del carrito de venta actual · Selecciona precios y formato para descargar el PDF"
          initialLimit={0}
        />
      )}
      {returnTarget && <PosReturnModal
        sale={returnTarget}
        sede={sede}
        refundSessionId={sesionCaja?.estado === 'abierta' ? sesionCaja.id : undefined}
        cashierName={posUser?.nombre}
        onClose={() => setReturnTarget(null)}
        onSuccess={(record) => {
          setSesionCaja(previous => {
            if (!previous || previous.id !== record.refundSessionId) return previous
            let items: any[] = []
            try { items = JSON.parse(previous.devolucionesPosItemsJson || '[]') } catch {}
            return {
              ...previous,
              devolucionesPosTotal: (previous.devolucionesPosTotal || 0) + Number(record.total || 0),
              devolucionesPosEfectivo: (previous.devolucionesPosEfectivo || 0) + (record.paymentMethod === 'efectivo' ? Number(record.total || 0) : 0),
              devolucionesPosItemsJson: JSON.stringify([...items, record]),
            }
          })
        }}
      />}

      {/* Modal para que usuaria con Nivel Alto reanude otra caja cerrada */}
      {showReanudarOtraCaja && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs" onClick={() => setShowReanudarOtraCaja(false)}>
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                  <Unlock size={18} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">Reanudar caja cerrada</h3>
                  <p className="text-xs text-slate-500">Autorización Nivel Alto · Turnos del día</p>
                </div>
              </div>
              <button onClick={() => setShowReanudarOtraCaja(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Selecciona la caja que deseas reanudar. Al reanudarla, se <strong>anulará el corte previo</strong> y la cajera recuperará todas sus ventas y gastos intactos en su terminal.
            </p>

            {loadingClosedSessions ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm font-semibold text-slate-500">
                <Loader2 size={16} className="animate-spin text-emerald-600" />
                Cargando cajas cerradas...
              </div>
            ) : closedSessionsList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                No hay cajas cerradas pendientes de reanudar en esta sede hoy.
              </div>
            ) : (
              <div className="space-y-2">
                {closedSessionsList.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900 truncate">{session.cajeroNombre || 'Cajera'}</strong>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase">Cerrada</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Apertura: {fmtCLP(session.montoApertura || 0)} · Cierre: {fmtCLP(session.montoCierre || 0)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Ventas: {session.ventasCount || 0} boletas ({fmtCLP(session.totalVentas || 0)})
                      </p>
                    </div>
                    <button
                      onClick={() => handleReanudarCaja(session.id, session.cajeroNombre)}
                      disabled={reanudandoCaja}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-bold transition shadow-2xs disabled:opacity-60"
                    >
                      {reanudandoCaja ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                      <span>Reanudar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para autorizar reanudación en el mismo terminal con credenciales de usuario Nivel Alto */}
      {showAuthModalAlto && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs" onClick={() => setShowAuthModalAlto(false)}>
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-bold">
                  <ShieldAlert size={18} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">Autorización Nivel Alto</h3>
                  <p className="text-xs text-slate-500">Reanudación de caja cerrada</p>
                </div>
              </div>
              <button onClick={() => setShowAuthModalAlto(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Ingresa el correo y contraseña de un usuario o cajera con <strong>Nivel Alto</strong> para desbloquear y reanudar esta caja inmediatamente en este terminal.
            </p>

            <form onSubmit={handleAuthorizeWithAlto} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  value={authEmailAlto}
                  onChange={e => setAuthEmailAlto(e.target.value)}
                  required
                  placeholder="Correo del usuario"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={authPassAlto}
                  onChange={e => setAuthPassAlto(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>

              {authErrorAlto && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs font-medium text-rose-700">
                  {authErrorAlto}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModalAlto(false)}
                  disabled={authorizingAlto}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={authorizingAlto || !authEmailAlto.trim() || !authPassAlto.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-bold transition shadow-sm disabled:opacity-60"
                >
                  {authorizingAlto ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                  <span>{authorizingAlto ? 'Validando...' : 'Autorizar y Reanudar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Portal de previsualización flotante al pasar el mouse sobre imágenes */}
      {hoveredImagePreview && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[10000] grid grid-rows-[minmax(0,1fr)_auto] gap-2 w-[240px] h-[320px] p-2.5 rounded-2xl bg-white border-2 border-emerald-500 shadow-2xl pointer-events-none transition-all"
          style={{ left: hoveredImagePreview.left, top: hoveredImagePreview.top }}
          aria-hidden="true"
        >
          <img src={hoveredImagePreview.url} alt="" className="w-full h-full min-h-0 object-contain rounded-xl bg-slate-50" />
          <span className="line-clamp-2 px-1 text-xs font-bold text-slate-800 leading-snug">{hoveredImagePreview.name}</span>
        </div>,
        document.body
      )}

      {/* Modal de Cantidad Rápida al tocar tarjeta de producto o '+' */}
      {quickQtyModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col md:flex-row max-h-[92vh] sm:max-h-[90vh]"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setQuickQtyModal(null)
                searchRef.current?.focus()
              }
              if (e.key === 'Tab' && quickQtyModal.candidates && quickQtyModal.candidates.length > 1) {
                e.preventDefault()
                if (e.shiftKey) {
                  handlePrevCandidateQuickQty()
                } else {
                  handleNextCandidateQuickQty()
                }
              }
            }}
          >
            {/* LADO IZQUIERDO: Foto grande del producto y datos visuales clave */}
            <div className="w-full md:w-72 bg-gradient-to-b from-slate-50 via-slate-100/70 to-slate-100 p-4 sm:p-5 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-slate-200/80 shrink-0">
              <div className="w-full flex items-center justify-between text-[11px] font-bold text-slate-500 mb-2">
                <span className="uppercase tracking-wider">Detalle del Producto</span>
                <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {fmtCLP(getPrice(quickQtyModal.product, quickQtyModal.selectedPriceField))}
                </span>
              </div>

              {/* Imagen en grande */}
              <div className="relative w-full aspect-square max-w-[200px] md:max-w-[240px] max-h-56 md:max-h-64 rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden flex items-center justify-center p-2.5 my-auto group">
                {quickQtyModal.product.imageUrl ? (
                  <img
                    src={quickQtyModal.product.imageUrl}
                    alt={quickQtyModal.product.nombre}
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Package size={52} className="text-slate-300" />
                    <span className="text-xs font-semibold text-slate-400">Sin foto</span>
                  </div>
                )}
              </div>

              {/* Badges de SKU, Stock y Embalaje debajo de la foto */}
              <div className="w-full flex flex-wrap items-center justify-center gap-1.5 mt-3 text-xs">
                <span className="font-mono text-slate-600 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  SKU: <strong className="text-slate-800">{quickQtyModal.product.sku}</strong>
                </span>
                <span className="text-slate-600 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  Stock: <strong className="text-slate-800">{quickQtyModal.product.stock ?? 0} u.</strong>
                </span>
                {(() => {
                  const pkg = parseInt(String(quickQtyModal.product.packageQty || 0), 10)
                  if (pkg > 1) {
                    return (
                      <span className="text-sky-700 bg-sky-50 px-2 py-1 rounded-lg border border-sky-200 font-bold shadow-2xs">
                        📦 Caja: {pkg}u
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </div>

            {/* LADO DERECHO: Nombre, candidatos, cantidad, atajos y acciones */}
            <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 bg-white overflow-y-auto">
              <div>
                {/* Header con nombre y botón cerrar */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="min-w-0 pr-2">
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">
                      {quickQtyModal.product.nombre}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Precio seleccionado: <strong className="text-emerald-700 font-sans font-bold">{fmtCLP(getPrice(quickQtyModal.product, quickQtyModal.selectedPriceField))}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickQtyModal(null)
                      searchRef.current?.focus()
                    }}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition shrink-0 cursor-pointer"
                    title="Cerrar [Esc]"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Barra de candidatos cuando hay más de una coincidencia */}
                {quickQtyModal.candidates && quickQtyModal.candidates.length > 1 && (
                  <div className="mt-3 px-3.5 py-2 bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-amber-900">
                      Coincidencia {((quickQtyModal.candidateIndex ?? 0) + 1)} de {quickQtyModal.candidates.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handlePrevCandidateQuickQty}
                        title="Candidato anterior (Shift+Tab)"
                        className="p-1 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-amber-200 shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextCandidateQuickQty}
                        title="Probar siguiente producto (Tab)"
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-extrabold text-[11px] shadow-2xs transition flex items-center gap-1 active:scale-95 cursor-pointer"
                      >
                        <span>Siguiente (Tab)</span>
                        <ChevronRight size={13} className="stroke-[3]" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Selector de cantidad */}
                <div className="mt-4 sm:mt-5 space-y-4">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider text-center">
                    ¿Cuántas unidades deseas agregar?
                  </label>

                  {/* Big Quantity input with +/- */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const curr = parseInt(quickQtyInput, 10) || 1
                        setQuickQtyInput(String(Math.max(1, curr - 1)))
                        quickQtyInputRef.current?.focus()
                      }}
                      className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xl flex items-center justify-center transition cursor-pointer active:scale-95"
                    >
                      <Minus size={20} className="stroke-[3]" />
                    </button>
                    <input
                      ref={quickQtyInputRef}
                      type="text"
                      inputMode="numeric"
                      value={quickQtyInput}
                      onChange={e => {
                        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 5)
                        setQuickQtyInput(digits)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleConfirmQuickQty()
                        }
                      }}
                      className="w-28 sm:w-32 h-12 text-center text-2xl font-black text-slate-900 bg-slate-50 border-2 border-emerald-500 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const curr = parseInt(quickQtyInput, 10) || 0
                        setQuickQtyInput(String(curr + 1))
                        quickQtyInputRef.current?.focus()
                      }}
                      className="w-12 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl flex items-center justify-center transition cursor-pointer active:scale-95"
                    >
                      <Plus size={20} className="stroke-[3]" />
                    </button>
                  </div>

                  {/* Quick shortcut pills: 1, 3, 6, 12, 24 + embalaje */}
                  <div>
                    <span className="block text-[11px] font-bold text-slate-400 mb-2 text-center">Atajos rápidos:</span>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                      {[1, 2, 3, 6, 12, 24].map(q => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => {
                            setQuickQtyInput(String(q))
                            quickQtyInputRef.current?.focus()
                          }}
                          className={`px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-extrabold transition cursor-pointer active:scale-95 ${
                            quickQtyInput === String(q)
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                              : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                      {(() => {
                        const pkg = parseInt(String(quickQtyModal.product.packageQty || 0), 10)
                        if (pkg > 1 && ![1, 2, 3, 6, 12, 24].includes(pkg)) {
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickQtyInput(String(pkg))
                                quickQtyInputRef.current?.focus()
                              }}
                              className={`px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-extrabold transition cursor-pointer active:scale-95 ${
                                quickQtyInput === String(pkg)
                                  ? 'bg-sky-600 text-white border-sky-600 shadow-md'
                                  : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200'
                              }`}
                            >
                              📦 Caja ({pkg}u)
                            </button>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-4 mt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setQuickQtyModal(null)
                    searchRef.current?.focus()
                  }}
                  className="py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <X size={16} /> Cancelar [Esc]
                </button>
                <button
                  type="button"
                  onClick={handleConfirmQuickQty}
                  className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-extrabold shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check size={18} /> Agregar [Enter]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
