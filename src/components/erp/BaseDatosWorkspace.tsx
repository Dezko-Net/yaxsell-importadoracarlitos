'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, MapPin, ChevronRight, ChevronDown, Package, Store, Download, Upload, Search, RefreshCw, Save, Trash2, Plus, Check, AlertCircle, Globe, Eye, EyeOff, ExternalLink, DollarSign, Boxes, X, Edit2, Database, BarChart2, History, ArrowUp, ArrowDown, ArrowDownCircle, Edit3, Calendar, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getServices, PRODUCTS_COLLECTION, MEDIA_PREFIXES, uploadFile, Query, ID } from '@/lib/db';
import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { fetchAllFirebaseErpProducts, updateFirebaseErpProduct, createFirebaseErpProduct, deleteFirebaseErpProduct, getFirebaseErpCategories, getFirebaseErpSubcategories, clearPosProductsCache, purgeServerProductsCache, FirebaseErpProduct, isAppwriteProduct } from '@/lib/firebaseErpService';
import { DEFAULT_SEDE, SEDE_SLUGS, SEDES as SEDES_LABELS, type SedeSlug } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import BaseDatosAIChatbot from '@/components/erp/BaseDatosAIChatbot';
import RecentPriceLabelsModal, { type RecentPriceLabelProduct } from '@/components/erp/RecentPriceLabelsModal';
import StoreImage from '@/components/StoreImage';

function usePriceListConfig() {
  return {
    config: {},
    listasActivas: ['precio_detalle', 'precio_mayorista', 'precio_segundo', 'precio_cuarto'],
    listasParaCosto: [
      { campo: 'precio_detalle', nombre: 'Efectivo' },
      { campo: 'precio_mayorista', nombre: 'Embalaje' },
      { campo: 'precio_segundo', nombre: 'Embalaje 2' },
      { campo: 'precio_cuarto', nombre: 'Precio especial' },
    ],
    nombrePorCampo: (campo: string) => {
      if (campo === 'precio_detalle') return 'Efectivo';
      if (campo === 'precio_mayorista') return 'Embalaje';
      if (campo === 'precio_segundo') return 'Embalaje 2';
      if (campo === 'precio_cuarto') return 'Precio especial';
      return campo;
    },
  };
}

function parseMoney(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Math.round(val);
  let s = String(val).trim();
  if (!s) return 0;
  s = s.replace(/\$/g, '').replace(/\s+/g, '').replace(/%/g, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0] + '.' + parts[1];
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = parts.join('');
    } else if (parts[1]?.length === 3) {
      s = parts.join('');
    }
  }
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : Math.round(n);
}

function formatFechaHoraChile(ts: number | string | undefined, fallbackStr?: string): string {
  if (!ts) return fallbackStr || '—';
  const num = Number(ts);
  if (isNaN(num) || num <= 0) {
    return fallbackStr || '—';
  }
  try {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(num));
  } catch {
    return fallbackStr || '—';
  }
}

function norm(s: any): string {
  const t = String(s ?? '').toLowerCase();
  return t
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCSV(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return lines.join('\n');
}

function toProductTimestamp(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value?.toMillis === 'function') {
    const timestamp = Number(value.toMillis());
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
  }
  if (typeof value?.toDate === 'function') return toProductTimestamp(value.toDate());
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
  }
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
    return timestamp < 1e12 ? timestamp * 1000 : timestamp;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getProductCreatedAt(raw: any): number | undefined {
  if (!raw) return undefined;
  for (const value of [raw.$createdAt, raw.createdAt, raw.created_at, raw.CREATED_AT, raw.CREATEDAT]) {
    const timestamp = toProductTimestamp(value);
    if (timestamp) return timestamp;
  }
  return undefined;
}

type ProductRow = {
  sku: string;
  isAutoSku?: boolean;
  nombre: string;
  codigo_barra: string;
  categoria?: string;
  subcategoria?: string;
  proveedor?: string;
  cantidad_embalaje?: string;
  box_code?: string;
  stock?: number;
  ilimitado: boolean;
  costo_uni: number;
  precio_venta_1?: number;
  precio_venta_2?: number;
  precio_venta_2_etiqueta?: number;
  precio_venta_3?: number;
  precio_venta_4?: number;
  precio_venta_5?: number;
  precio_venta_6?: number;
  precio_venta_7?: number;
  precio_venta_8?: number;
  precio_venta_9?: number;
  precio_venta_10?: number;
  label_p2?: string;
  label_p3?: string;
  label_p4?: string;
  label_p5?: string;
  label_p6?: string;
  label_p7?: string;
  label_p8?: string;
  label_p9?: string;
  label_p10?: string;
  min_qty_2?: number;
  min_qty_3?: number;
  is_draft?: boolean;
  status?: string;
  ajuste_menos10?: boolean;
  updatedAt?: number;
  createdAt?: number;
  rowId?: string;
  imageUrl?: string | null;
  show_in_web: boolean;
  web_only?: boolean;
  origen?: string;
  is_temporary?: boolean;
};

type StockRow = {
  sku: string;
  stock: number;
  updatedAt?: number;
  rowId?: string;
  ilimitado?: boolean;
  origen?: string;
};

type BaseDatosTab = 'maestro' | 'stock' | 'precios' | 'ventas' | 'nuevo' | 'pendiente' | 'monitoreo';

const BASE_DATOS_VIEWS: Array<{ value: string; label: string; tab: BaseDatosTab }> = [
  { value: 'borradores', label: 'Borradores', tab: 'maestro' },
  { value: 'inventario', label: 'Inventario', tab: 'stock' },
  { value: 'productos-web', label: 'Productos web', tab: 'maestro' },
  { value: 'costos', label: 'Costos', tab: 'maestro' },
  { value: 'precios', label: 'Precios', tab: 'precios' },
  { value: 'pendientes', label: 'Productos pendientes', tab: 'pendiente' },
  { value: 'monitoreo', label: 'Monitoreo de productos', tab: 'monitoreo' },
];

const BASE_DATOS_VIEW_IMAGES: Record<string, { src: string; alt: string }> = {
  inventario: {
    src: 'https://cdn3d.iconscout.com/3d/premium/thumb/inventory-management-3d-icon-png-download-10948586.png',
    alt: 'Inventario',
  },
  'productos-web': {
    src: 'https://cdn3d.iconscout.com/3d/premium/thumb/monitoreo-web-3d-icon-png-download-11641275.png',
    alt: 'Productos web',
  },
  costos: {
    src: 'https://cdn3d.iconscout.com/3d/premium/thumb/mejor-precio-3d-icon-png-download-6715429.png',
    alt: 'Costos',
  },
  precios: {
    src: 'https://cdn3d.iconscout.com/3d/premium/thumb/valor-3d-icon-png-download-11513813.png',
    alt: 'Precios',
  },
  pendientes: {
    src: 'https://cdn3d.iconscout.com/3d/premium/thumb/inventory-stock-3d-icon-png-download-14313533.png',
    alt: 'Productos pendientes',
  },
  monitoreo: {
    src: 'https://cdn3d.iconscout.com/3d/premium/thumb/monitoreo-seo-3d-icon-png-download-6715475.png',
    alt: 'Monitoreo de productos',
  },
};

export default function BaseDatosWorkspace() {
  return <Suspense fallback={<div className="p-6 text-sm font-semibold text-slate-500">Cargando Base de Datos…</div>}><BaseDeDatosRouteContent /></Suspense>;
}

export function BaseDatosEmbedded({ view = 'inventario' }: { view?: string }) {
  return <BaseDeDatosContent viewValue={view} embedded />;
}

function BaseDeDatosRouteContent() {
  const searchParams = useSearchParams();
  // Sin `vista` se conserva la Base de Datos general con sus pestañas y filtros.
  return <BaseDeDatosContent viewValue={searchParams.get('vista') || ''} />;
}

function BaseDeDatosContent({ viewValue, embedded = false }: { viewValue: string; embedded?: boolean }) {
  const currentView = BASE_DATOS_VIEWS.find(view => view.value === viewValue) || null;
  const currentViewImage = (currentView && BASE_DATOS_VIEW_IMAGES[currentView.value]) || BASE_DATOS_VIEW_IMAGES.inventario;
  const isWebProductsView = currentView?.value === 'productos-web';
  const { inventoryMode } = useStoreSettings();
  const isIndependentWeb = isWebProductsView && inventoryMode === 'web_independent';
  const isDraftsView = currentView?.value === 'borradores';
  const returnToListTab: BaseDatosTab = embedded && currentView?.value === 'inventario' ? 'stock' : 'maestro';
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);

  const uploadProductPhoto = async (file: File) => {
    if (isIndependentWeb) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const result = await uploadFile(`${MEDIA_PREFIXES.products}${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`, file);
      return { success: true, imageUrl: result.url, error: '' };
    }
    const form = new FormData();
    form.append('file', file);
    form.append('slot', 'product');
    const response = await fetch('/api/admin-supreme/upload-image', { method: 'POST', body: form });
    return response.json();
  };

  // Cortina lateral: abrir al hover en el borde izquierdo
  useEffect(() => {
    if (embedded) return;
    const handleMouseMove = (e: MouseEvent) => {
      const xOpen = window.innerWidth * 0.02;
      const yMid = window.innerHeight * 0.5;
      const yRange = window.innerHeight * 0.15;
      const closeThreshold = 320; // ancho del panel + margen
      if (e.clientX <= xOpen && Math.abs(e.clientY - yMid) <= yRange && !leftPanelOpen) {
        setLeftPanelOpen(true);
      } else if (e.clientX > closeThreshold && leftPanelOpen) {
        setLeftPanelOpen(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [leftPanelOpen, embedded]);

  const { config: priceListConfig, listasActivas: plActivas, listasParaCosto: plParaCosto, nombrePorCampo: plNombre } = usePriceListConfig();
  const [tab, setTab] = useState<BaseDatosTab>(currentView?.tab || 'maestro');

  useEffect(() => {
    setTab(currentView?.tab || 'maestro');
  }, [currentView?.tab]);
  
  const [savingNewProduct, setSavingNewProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [erpCategories, setErpCategories] = useState<Array<{ $id: string; name: string }>>([]);
  const [erpSubcategories, setErpSubcategories] = useState<Array<{ $id: string; name: string; categoryId: string; parentSubcategoryId?: string }>>([]);
  const [newProduct, setNewProduct] = useState({
    sku: '',
    codigo_barra: '',
    nombre: '',
    descripcion: '',
    category: '',
    subcategory: '',
    proveedor: '',
    cantidad_embalaje: '',
    box_code: '',
    section: '',
    tags: '',
    features: '',
    unlimited: false,
    visible: true,
    show_in_web: currentView?.value === 'productos-web',
    stock: '0',
    costo_uni: '0',
    precio_venta_1: '0',
    precio_venta_2: '0',
    precio_venta_3: '0',
    precio_venta_4: '0',
    precio_venta_5: '0',
    precio_venta_6: '0',
    precio_venta_7: '0',
    precio_venta_8: '0',
    precio_venta_9: '0',
    precio_venta_10: '0',
    label_p2: '',
    label_p3: '',
    label_p4: '',
    label_p5: '',
    label_p6: '',
    label_p7: '',
    label_p8: '',
    label_p9: '',
    label_p10: '',
    is_draft: false,
    // Paquete
    packqty: '0',
    packprice: '0',
    // Embalaje
    embalajeqty: '0',
    embalajeprice: '0',
    // Promoción
    promo_qty: '0',
    promo_price: '0',
    // Mayorista
    wholesale_min_qty: '0',
    wholesale_price: '0',
    pack_discount_pct: '0',
    pack_min_packs: '0',
    // Ficha técnica
    details: '',
    usage: '',
    ingredients: '',
    // Avanzadas
    current_price: '0',
    disable_discounts: false,
    imageUrl: '',
  });
  const [initialStockPackages, setInitialStockPackages] = useState('');

  const [sede, setSede] = useState<SedeSlug>(DEFAULT_SEDE);
  const [channel, setChannel] = useState<'tienda' | 'appwrite'>('tienda');
  const [prodRows, setProdRows] = useState<ProductRow[]>([]);
  const [showRecentPriceLabels, setShowRecentPriceLabels] = useState(false);
  const recentPriceLabelProducts = useMemo<RecentPriceLabelProduct[]>(() => prodRows
    .map((product, originalIndex) => ({ product, originalIndex }))
    .filter(({ product }) => !product.web_only && !product.is_draft && product.status !== 'draft' && !isAppwriteProduct(product))
    .sort((a, b) => {
      const createdA = Number(a.product.createdAt || 0);
      const createdB = Number(b.product.createdAt || 0);
      if (createdA && createdB && createdA !== createdB) return createdB - createdA;
      if (createdA && !createdB) return -1;
      if (!createdA && createdB) return 1;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ product }) => ({
      sku: product.sku,
      nombre: product.nombre,
      imageUrl: product.imageUrl,
      codigo_barra: product.codigo_barra,
      categoria: product.categoria,
      subcategoria: product.subcategoria,
      proveedor: product.proveedor,
      cantidad_embalaje: product.cantidad_embalaje,
      precio_venta_1: product.precio_venta_1,
      precio_venta_2: product.precio_venta_2_etiqueta ?? product.precio_venta_2,
      precio_venta_3: product.precio_venta_3,
      min_qty_2: product.min_qty_2,
      min_qty_3: product.min_qty_3,
      label_p2: product.label_p2,
      label_p3: product.label_p3,
      stock: product.stock,
      createdAt: product.createdAt,
    })), [prodRows]);
  const isCurrentWebOnly = isWebProductsView || Boolean(editingSku && prodRows.find(p => p.sku === editingSku)?.web_only);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [priceRows, setPriceRows] = useState<Array<{
    sku: string;
    precio_detalle: number;
    precio_mayorista: number;
    precio_segundo?: number;
    precio_cuarto?: number;
    precio_5?: number;
    precio_6?: number;
    precio_7?: number;
    precio_8?: number;
    precio_9?: number;
    precio_10?: number;
    precio_auto?: boolean;
    label_p2?: string;
    label_p3?: string;
    label_p4?: string;
    label_p5?: string;
    label_p6?: string;
    label_p7?: string;
    label_p8?: string;
    label_p9?: string;
    label_p10?: string;
    rowId?: string;
  }>>([]);
  const [showExtraPrices, setShowExtraPrices] = useState(false);
  const [showAllPriceColumns, setShowAllPriceColumns] = useState(false);
  const [salesRows, setSalesRows] = useState<Array<{ sku: string; nombre: string; cantidadVendida: number; ventasBrutas: number; costoNeto: number; costoUnitarioCalculado: number }>>([]);
  
  // Paginación y caché local (20 en 20 productos)
  const [currentPage, setCurrentPage] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('erp_base_datos_page');
      if (saved) {
        const p = parseInt(saved, 10);
        if (!isNaN(p) && p > 0) return p;
      }
    }
    return 1;
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('erp_base_datos_pagesize_v2');
      if (saved) {
        const ps = parseInt(saved, 10);
        if (!isNaN(ps) && ps > 0) return ps;
      }
    }
    return 10;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('erp_base_datos_page', String(currentPage));
      sessionStorage.setItem('erp_base_datos_pagesize_v2', String(pageSize));
    }
  }, [currentPage, pageSize]);
  
  const [file, setFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [imageModal, setImageModal] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortRows = (rows: any[], field: string, dir: 'asc' | 'desc'): any[] => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let av: any, bv: any;
      if (field === 'costo') { av = Math.round(a.costo_uni || 0); bv = Math.round(b.costo_uni || 0); }
      else if (field === 'precio_menor') { av = precioMasBajo(a); bv = precioMasBajo(b); }
      else if (field === 'nombre') { av = String(a.nombre || '').toLowerCase(); bv = String(b.nombre || '').toLowerCase(); }
      else if (field === 'categoria') { av = String(a.categoria || '').toLowerCase(); bv = String(b.categoria || '').toLowerCase(); }
      else if (field === 'sku') { av = String(a.sku || '').toLowerCase(); bv = String(b.sku || '').toLowerCase(); }
      else if (field === 'stock') { av = Number(a.stock || 0); bv = Number(b.stock || 0); }
      else if (field === 'p1') { av = Math.round(a.precio_detalle || 0); bv = Math.round(b.precio_detalle || 0); }
      else if (field === 'p2') { av = Math.round(a.precio_mayorista || 0); bv = Math.round(b.precio_mayorista || 0); }
      else if (field === 'p3') { av = Math.round(a.precio_segundo || 0); bv = Math.round(b.precio_segundo || 0); }
      else if (field === 'p4') { av = Math.round(a.precio_cuarto || 0); bv = Math.round(b.precio_cuarto || 0); }
      else return 0;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  };
  const [skuFilter, setSkuFilter] = useState<'todos' | 'vt' | 'db' | 'num'>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activos' | 'borradores'>('todos');
  const [onlyNoCost, setOnlyNoCost] = useState(false);
  const [openWithCost, setOpenWithCost] = useState(false);
  const [openNoCost, setOpenNoCost] = useState(false);
  const [costoGeneralSearch, setCostoGeneralSearch] = useState('');
  const [showLatestFirst, setShowLatestFirst] = useState(false);
  const [stage, setStage] = useState<'choose' | 'santiago' | 'sede'>('choose');

  const [dynamicSedes, setDynamicSedes] = useState<Array<{ slug: string; name: string; active: boolean; icon?: string; color?: string }>>([
    { slug: 'donbalato-central', name: 'Importadora Carlitos Central', active: true, icon: '🏪', color: 'blue' },
  ]);

  useEffect(() => {
    getFirebaseErpCategories().then(setErpCategories).catch(() => {});
    getFirebaseErpSubcategories().then(setErpSubcategories).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/admin-supreme/load-config')
      .then(res => res.json())
      .then(res => {
        if (res.ok && res.data) {
          try {
            const parsed = JSON.parse(res.data);
            if (Array.isArray(parsed.branches) && parsed.branches.length > 0) {
              const branches = parsed.branches.map((b: any) => ({
                slug: b.slug || b.name?.toLowerCase().replace(/\s+/g, '-'),
                name: b.name || b.slug,
                active: b.active !== false,
                icon: b.icon || '🏪',
                color: b.color || 'emerald',
              }));
              setDynamicSedes(branches);
            }
          } catch (e) {
            console.error('Error parsing branches:', e);
          }
        }
      })
      .catch(err => console.error('Error loading config branches:', err));
  }, []);

  const configuredBranches = dynamicSedes;
  const activeBranches = useMemo(() => configuredBranches.filter(b => b.active), [configuredBranches]);

  const webCount = useMemo(() => prodRows.filter(p => p.show_in_web).length, [prodRows]);
  const soloTiendaCount = useMemo(() => prodRows.filter(p => !p.show_in_web).length, [prodRows]);

  const [showHasDM, setShowHasDM] = useState(false);
  const [showHasDMSegundo, setShowHasDMSegundo] = useState(false);
  const [showIncompleteEither, setShowIncompleteEither] = useState(false);
  const [showOnlyEstimated, setShowOnlyEstimated] = useState(false);
  const [exportProgress, setExportProgress] = useState<number>(-1);
  const [loadProgress, setLoadProgress] = useState<number>(-1);

  const [showFilters, setShowFilters] = useState(true);
  const [search, setSearch] = useState('');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get('sku');
    if (sku) {
      setTab('maestro');
      setSearch(sku);
    }
  }, []);
  const [showCodigoBarra, setShowCodigoBarra] = useState(false);

  const [generalCosts, setGeneralCosts] = useState<Array<{ sku: string; nombre: string; costo_uni: number }>>([]);
  const [loadingGeneral, setLoadingGeneral] = useState<boolean>(false);
  const [costFile, setCostFile] = useState<File | null>(null);
  
  const generalCostDraftBySkuRef = useRef<Record<string, string>>({});
  const costoDraftByRowIdRef = useRef<Record<string, string>>({});
  const precioBajoDraftBySkuRef = useRef<Record<string, string>>({});

  // Modal para añadir stock (+)
  const [addStockModal, setAddStockModal] = useState<{ row: any; prod: any; docId: string } | null>(null);
  const [addStockQty, setAddStockQty] = useState('');
  const [addStockLooseQty, setAddStockLooseQty] = useState('');
  const [addStockPackages, setAddStockPackages] = useState('');
  const [addStockUnitsPerPackage, setAddStockUnitsPerPackage] = useState('');
  const [addStockSaving, setAddStockSaving] = useState(false);
  // Modal para compensar stock pendiente
  const [compensarModal, setCompensarModal] = useState<{ item: any; prod: any; docId: string; stockRow: any } | null>(null);
  const [compensarQty, setCompensarQty] = useState('');
  const [compensarSaving, setCompensarSaving] = useState(false);
  // Estado de guardado por SKU para el input directo
  const [stockSavingSku, setStockSavingSku] = useState<string | null>(null);
  // Modal historial de movimientos por producto
  const [stockHistoryModal, setStockHistoryModal] = useState<{ sku: string; nombre: string } | null>(null);
  const [stockHistoryMovements, setStockHistoryMovements] = useState<any[]>([]);
  const [stockHistorySummary, setStockHistorySummary] = useState<any>(null);
  const [stockHistoryLoading, setStockHistoryLoading] = useState(false);
  // Stock pendiente (ventas sin stock)
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Monitoreo de movimientos de stock (auditoría)
  const [movements, setMovements] = useState<any[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsFilterTipo, setMovementsFilterTipo] = useState('');
  const [movementsSearch, setMovementsSearch] = useState('');

  const getUnitsPerPackage = (prod: any) => {
    const rawQty = prod?.cantidad_embalaje ?? prod?.packageQty ?? prod?.rawDocument?.PACKAGE_QTY ?? prod?.rawDocument?.QUANTITY ?? prod?.rawDocument?.packageQty ?? prod?.rawDocument?.cantidad_embalaje ?? prod?.rawDocument?.EMBALAJE_QTY ?? prod?.rawDocument?.embalajeqty;
    const qty = Number(String(rawQty ?? '').replace(',', '.').replace(/[^0-9.]/g, ''));
    return Number.isFinite(qty) ? Math.floor(qty) : 0;
  };

  const parsePackageUnits = (raw: string) => Number(String(raw || '').match(/\d+/)?.[0] || 0);

  const setPackageQuantityForProductForm = (value: string) => {
    const packages = Number(initialStockPackages) || 0;
    const unitsPerPackage = parsePackageUnits(value);
    setNewProduct(product => ({
      ...product,
      cantidad_embalaje: value,
      ...(packages > 0 && unitsPerPackage > 0 && { stock: String(packages * unitsPerPackage) }),
    }));
  };

  const setInitialPackagesForProductForm = (value: string) => {
    const packagesText = value.replace(/[^0-9]/g, '');
    const unitsPerPackage = parsePackageUnits(newProduct.cantidad_embalaje);
    setInitialStockPackages(packagesText);
    if (unitsPerPackage > 0 && Number(packagesText) > 0) {
      setNewProduct(product => ({ ...product, stock: String(Number(packagesText) * unitsPerPackage) }));
    }
  };

  const setInitialStockUnitsForProductForm = (value: string) => {
    setInitialStockPackages('');
    setNewProduct(product => ({ ...product, stock: value.replace(/[^0-9]/g, '') }));
  };

  const setAddStockByPackages = (packageCount: string) => {
    setAddStockPackages(packageCount);
    const unitsPerPackage = Number(addStockUnitsPerPackage) || getUnitsPerPackage(addStockModal?.prod);
    const packages = Number(packageCount) || 0;
    setAddStockQty(unitsPerPackage > 0 && packages > 0 ? String(unitsPerPackage * packages) : '');
  };

  const addStockPackageStep = (step: number) => {
    setAddStockByPackages(String((Number(addStockPackages) || 0) + step));
  };

  const setAddStockPackageSize = (rawSize: string) => {
    const packageSize = rawSize.replace(/[^0-9]/g, '');
    setAddStockUnitsPerPackage(packageSize);
    const packages = Number(addStockPackages) || 0;
    setAddStockQty(packageSize && packages > 0 ? String(Number(packageSize) * packages) : '');
  };

  const openAddStockModal = (row: any, prod: any, docId: string) => {
    setAddStockModal({ row, prod, docId });
    setAddStockQty('');
    setAddStockLooseQty('');
    setAddStockPackages('');
    setAddStockUnitsPerPackage(String(getUnitsPerPackage(prod) || ''));
  };

  const clearStockMovementsCache = () => {
    if (typeof window === 'undefined') return;
    try { sessionStorage.removeItem('erp_stock_movements_cache_v1'); } catch {}
  };

  const loadMovements = async (forceRefresh = false) => {
    setMovementsLoading(true);
    try {
      const cacheKey = 'erp_stock_movements_cache_v1';
      if (!forceRefresh && typeof window !== 'undefined') {
        try {
          const cachedRaw = sessionStorage.getItem(cacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.movements) && Date.now() - Number(cached.timestamp || 0) < 60_000) {
              setMovements(cached.movements);
              return;
            }
          }
        } catch { sessionStorage.removeItem(cacheKey); }
      }
      const res = await fetch('/api/erp/stock-movements?limit=500');
      const data = await res.json();
      if (data.ok) {
        const nextMovements = data.movements || [];
        setMovements(nextMovements);
        if (typeof window !== 'undefined') {
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), movements: nextMovements })); } catch {}
        }
      }
    } catch (err) {
      console.warn('Error cargando movimientos de stock:', err);
    } finally {
      setMovementsLoading(false);
    }
  };

  const openStockHistory = async (sku: string, nombre: string, rowId?: string) => {
    setStockHistoryModal({ sku, nombre });
    setStockHistoryMovements([]);
    setStockHistorySummary(null);
    setStockHistoryLoading(true);
    try {
      const prod = prodRows.find(p => p.sku === sku);
      const pid = rowId || prod?.rowId || '';
      const url = `/api/erp/stock-movements?sku=${encodeURIComponent(sku)}${pid ? `&productId=${encodeURIComponent(pid)}` : ''}&limit=2000`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setStockHistoryMovements(data.movements || []);
        setStockHistorySummary(data.summary || null);
      }
    } catch (err) {
      console.warn('Error cargando historial de stock:', err);
    } finally {
      setStockHistoryLoading(false);
    }
  };

  const filteredMovements = useMemo(() => {
    let list = movements;
    if (movementsFilterTipo) list = list.filter(m => m.tipo === movementsFilterTipo);
    if (!movementsSearch.trim()) return list;
    const tokens = norm(movementsSearch).split(' ').filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter(m => {
      const target = norm(`${m.nombre || ''} ${m.sku || ''} ${m.usuario || ''} ${m.nota || ''}`);
      return tokens.every(token => target.includes(token));
    });
  }, [movements, movementsSearch, movementsFilterTipo]);

  const paginatedPendingItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return pendingItems.slice(start, start + pageSize);
  }, [pendingItems, currentPage, pageSize]);

  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMovements.slice(start, start + pageSize);
  }, [filteredMovements, currentPage, pageSize]);

  const isSinglePriceSede = stage === 'sede' && sede === 'copiapo';
  const isTwoPriceSede = stage === 'sede' && sede !== 'copiapo';

  const ensureRowId = (r: ProductRow): ProductRow => {
    if (r.rowId) return r;
    return { ...r, rowId: `${Date.now()}_${Math.random().toString(36).slice(2)}` };
  };

  const precioMasBajo = (r: ProductRow): number => {
    const ps = [
      Math.round(Number((r as any)?.precio_venta_1) || 0),
      Math.round(Number((r as any)?.precio_venta_2) || 0),
      Math.round(Number((r as any)?.precio_venta_3) || 0),
      Math.round(Number((r as any)?.precio_venta_4) || 0),
      Math.round(Number((r as any)?.precio_venta_5) || 0),
      Math.round(Number((r as any)?.precio_venta_6) || 0),
      Math.round(Number((r as any)?.precio_venta_7) || 0),
      Math.round(Number((r as any)?.precio_venta_8) || 0),
      Math.round(Number((r as any)?.precio_venta_9) || 0),
      Math.round(Number((r as any)?.precio_venta_10) || 0),
    ].filter((n) => n > 0);
    if (!ps.length) return 0;
    return Math.min(...ps);
  };

  const getPrecioMasBajoFromPriceRows = (sku: string): number => {
    const priceRow = priceRows.find(p => p.sku === sku);
    if (!priceRow) return 0;
    const ps = [
      Math.round(priceRow.precio_detalle || 0),
      Math.round(priceRow.precio_mayorista || 0),
      Math.round(priceRow.precio_segundo || 0),
      Math.round(priceRow.precio_cuarto || 0),
      Math.round((priceRow as any).precio_5 || 0),
      Math.round((priceRow as any).precio_6 || 0),
      Math.round((priceRow as any).precio_7 || 0),
      Math.round((priceRow as any).precio_8 || 0),
      Math.round((priceRow as any).precio_9 || 0),
      Math.round((priceRow as any).precio_10 || 0),
    ].filter(x => x > 0);
    if (!ps.length) return 0;
    return Math.min(...ps);
  };

  const precioMasBajoFromPriceRow = (r: { precio_detalle: number; precio_mayorista: number; precio_segundo?: number; precio_cuarto?: number }): number => {
    const precios: number[] = [];
    for (const l of plParaCosto) {
      const v = l.campo === 'precio_detalle' ? r.precio_detalle : l.campo === 'precio_mayorista' ? r.precio_mayorista : l.campo === 'precio_segundo' ? (r.precio_segundo ?? 0) : (r.precio_cuarto ?? 0);
      if (Math.round(Number(v) || 0) > 0) precios.push(Math.round(Number(v) || 0));
    }
    if (!precios.length) {
      const b = Math.round(Number(r?.precio_mayorista) || 0);
      const c = Math.round(Number(r?.precio_segundo) || 0);
      const d = Math.round(Number(r?.precio_cuarto) || 0);
      if (d > 0 && [b, c].some(value => value > 0)) return Math.min(d, ...[b, c].filter(value => value > 0));
      if (d > 0) return d;
      if (b > 0 && c > 0) return Math.min(b, c);
      if (b > 0) return b;
      if (c > 0) return c;
      return Math.round(Number(r?.precio_detalle) || 0);
    }
    return Math.min(...precios);
  };

  // Cargar productos desde Firebase con caché local de 24h
  const loadAppwriteProducts = async (forceRefresh = false) => {
    setLoading(true);
    setLoadingGeneral(true);
    setLoadProgress(20);
    try {
      const items = await fetchAllFirebaseErpProducts(forceRefresh);
      setLoadProgress(60);

      const getWorkspaceStock = (item: FirebaseErpProduct) => isIndependentWeb
        ? Number(item.rawDocument?.WEB_STOCK ?? item.rawDocument?.web_stock ?? item.stock ?? 0) || 0
        : item.stock;

      const donBalatoItems = items.filter((item: any) => {
        const raw = item.rawDocument || {};
        if (item.isVendorProduct === true || raw.isVendorProduct === true || raw.IS_VENDOR_PRODUCT === true) return false;
        const vid = raw.VENDOR_ID || raw.vendorId;
        if (vid && !['__MAIN__', 'donbalato', 'carlitos', 'importadora-carlitos', 'importadora_carlitos'].includes(vid)) return false;
        const sid = raw.SELLERID || raw.sellerId;
        if (sid && !['__MAIN__', 'donbalato', 'carlitos', 'importadora-carlitos', 'importadora_carlitos'].includes(sid)) return false;
        return true;
      });

      const pRows: ProductRow[] = donBalatoItems.map((item) => ({
        sku: item.sku,
        isAutoSku: item.isAutoSku,
        nombre: item.nombre,
        codigo_barra: item.codigo_barra,
        categoria: item.category,
        subcategoria: item.subcategory,
        proveedor: item.supplier || item.rawDocument?.BRAND || item.rawDocument?.SUPPLIER || item.rawDocument?.supplier || item.rawDocument?.proveedor || '',
        cantidad_embalaje: item.packageQty || item.rawDocument?.PACKAGE_QTY || item.rawDocument?.QUANTITY || item.rawDocument?.packageQty || item.rawDocument?.cantidad_embalaje || '',
        box_code: item.boxCode || item.rawDocument?.BOX_CODE || item.rawDocument?.box_code || item.rawDocument?.boxCode || '',
        stock: getWorkspaceStock(item),
        ilimitado: Boolean(Number(getWorkspaceStock(item)) >= 99999 || item.is_temporary),
        costo_uni: item.costo_uni,
        precio_venta_1: item.precio_venta_1,
        precio_venta_2: item.precio_venta_2,
        precio_venta_2_etiqueta: (() => {
          const raw = item.rawDocument || {};
          const secondPrice = [raw.WHOLESALEPRICE, raw.precio_venta_2, raw.wholesalePrice, raw.wholesale_price, raw.PRICE2, raw.PRICE_2, raw.P2]
            .find(value => value !== undefined && value !== null && String(value).trim() !== '');
          return secondPrice === undefined ? (item.rawDocument ? 0 : item.precio_venta_2) : parseMoney(secondPrice);
        })(),
        precio_venta_3: item.precio_venta_3,
        precio_venta_4: item.precio_venta_4,
        precio_venta_5: item.precio_venta_5 || Number(item.rawDocument?.PRICE5 ?? item.rawDocument?.precio_venta_5 ?? 0),
        precio_venta_6: item.precio_venta_6 || Number(item.rawDocument?.PRICE6 ?? item.rawDocument?.precio_venta_6 ?? 0),
        precio_venta_7: item.precio_venta_7 || Number(item.rawDocument?.PRICE7 ?? item.rawDocument?.precio_venta_7 ?? 0),
        precio_venta_8: item.precio_venta_8 || Number(item.rawDocument?.PRICE8 ?? item.rawDocument?.precio_venta_8 ?? 0),
        precio_venta_9: item.precio_venta_9 || Number(item.rawDocument?.PRICE9 ?? item.rawDocument?.precio_venta_9 ?? 0),
        precio_venta_10: item.precio_venta_10 || Number(item.rawDocument?.PRICE10 ?? item.rawDocument?.precio_venta_10 ?? 0),
        label_p2: item.label_p2 || item.rawDocument?.LABEL_P2 || item.rawDocument?.label_p2 || item.rawDocument?.p2_label || item.rawDocument?.p2Label || item.rawDocument?.labelP2 || item.rawDocument?.etiqueta_p2 || item.rawDocument?.ETIQUETA_P2 || '',
        label_p3: item.label_p3 || item.rawDocument?.LABEL_P3 || item.rawDocument?.label_p3 || item.rawDocument?.p3_label || item.rawDocument?.p3Label || item.rawDocument?.labelP3 || item.rawDocument?.etiqueta_p3 || item.rawDocument?.ETIQUETA_P3 || '',
        label_p4: item.label_p4 || item.rawDocument?.LABEL_P4 || item.rawDocument?.label_p4 || item.rawDocument?.p4_label || item.rawDocument?.p4Label || item.rawDocument?.labelP4 || item.rawDocument?.etiqueta_p4 || item.rawDocument?.ETIQUETA_P4 || '',
        label_p5: item.label_p5 || item.rawDocument?.LABEL_P5 || item.rawDocument?.label_p5 || '',
        label_p6: item.label_p6 || item.rawDocument?.LABEL_P6 || item.rawDocument?.label_p6 || '',
        label_p7: item.label_p7 || item.rawDocument?.LABEL_P7 || item.rawDocument?.label_p7 || '',
        label_p8: item.label_p8 || item.rawDocument?.LABEL_P8 || item.rawDocument?.label_p8 || '',
        label_p9: item.label_p9 || item.rawDocument?.LABEL_P9 || item.rawDocument?.label_p9 || '',
        label_p10: item.label_p10 || item.rawDocument?.LABEL_P10 || item.rawDocument?.label_p10 || '',
        min_qty_2: item.min_qty_2,
        min_qty_3: item.min_qty_3,
        is_draft: item.is_draft,
        status: item.status,
        updatedAt: Date.now(),
        createdAt: getProductCreatedAt(item.rawDocument),
        rowId: item.$id,
        imageUrl: item.imageUrl,
        show_in_web: item.show_in_web,
        web_only: item.web_only,
        origen: item.origen,
        is_temporary: item.is_temporary,
      }));

      const prRows = items.map((item) => ({
        sku: item.sku,
        precio_detalle: item.precio_venta_1,
        precio_mayorista: item.precio_venta_2,
        precio_segundo: item.precio_venta_3,
        precio_cuarto: item.precio_venta_4,
        precio_5: item.precio_venta_5 || Number(item.rawDocument?.PRICE5 ?? item.rawDocument?.precio_venta_5 ?? 0),
        precio_6: item.precio_venta_6 || Number(item.rawDocument?.PRICE6 ?? item.rawDocument?.precio_venta_6 ?? 0),
        precio_7: item.precio_venta_7 || Number(item.rawDocument?.PRICE7 ?? item.rawDocument?.precio_venta_7 ?? 0),
        precio_8: item.precio_venta_8 || Number(item.rawDocument?.PRICE8 ?? item.rawDocument?.precio_venta_8 ?? 0),
        precio_9: item.precio_venta_9 || Number(item.rawDocument?.PRICE9 ?? item.rawDocument?.precio_venta_9 ?? 0),
        precio_10: item.precio_venta_10 || Number(item.rawDocument?.PRICE10 ?? item.rawDocument?.precio_venta_10 ?? 0),
        label_p2: item.label_p2 || item.rawDocument?.LABEL_P2 || item.rawDocument?.label_p2 || item.rawDocument?.p2_label || item.rawDocument?.p2Label || item.rawDocument?.labelP2 || item.rawDocument?.etiqueta_p2 || item.rawDocument?.ETIQUETA_P2 || '',
        label_p3: item.label_p3 || item.rawDocument?.LABEL_P3 || item.rawDocument?.label_p3 || item.rawDocument?.p3_label || item.rawDocument?.p3Label || item.rawDocument?.labelP3 || item.rawDocument?.etiqueta_p3 || item.rawDocument?.ETIQUETA_P3 || '',
        label_p4: item.label_p4 || item.rawDocument?.LABEL_P4 || item.rawDocument?.label_p4 || item.rawDocument?.p4_label || item.rawDocument?.p4Label || item.rawDocument?.labelP4 || item.rawDocument?.etiqueta_p4 || item.rawDocument?.ETIQUETA_P4 || '',
        label_p5: item.label_p5 || item.rawDocument?.LABEL_P5 || item.rawDocument?.label_p5 || '',
        label_p6: item.label_p6 || item.rawDocument?.LABEL_P6 || item.rawDocument?.label_p6 || '',
        label_p7: item.label_p7 || item.rawDocument?.LABEL_P7 || item.rawDocument?.label_p7 || '',
        label_p8: item.label_p8 || item.rawDocument?.LABEL_P8 || item.rawDocument?.label_p8 || '',
        label_p9: item.label_p9 || item.rawDocument?.LABEL_P9 || item.rawDocument?.label_p9 || '',
        label_p10: item.label_p10 || item.rawDocument?.LABEL_P10 || item.rawDocument?.label_p10 || '',
        rowId: item.$id,
      }));

      const gCosts = items.map((item) => ({
        sku: item.sku,
        nombre: item.nombre,
        costo_uni: item.costo_uni,
      }));

      const sRows: StockRow[] = items.map((item) => ({
        sku: item.sku,
        stock: getWorkspaceStock(item),
        rowId: item.$id,
        ilimitado: Boolean(Number(getWorkspaceStock(item)) >= 99999 || item.is_temporary),
        origen: item.origen,
      }));

      setProdRows(pRows);
      setPriceRows(prRows);
      setGeneralCosts(gCosts);
      setStockRows(sRows);
      setLoadProgress(100);
      setMessage(`✅ ${items.length} productos cargados dinámicamente.`);
    } catch (err: any) {
      console.error('Error cargando productos:', err);
      setMessage('❌ Error cargando productos: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
      setLoadingGeneral(false);
      setTimeout(() => setLoadProgress(-1), 1000);
    }
  };

  useEffect(() => {
    // Reutiliza la caché local de 24 h al entrar a cada sección; Actualizar fuerza una lectura nueva.
    loadAppwriteProducts();
  }, [stage, sede, isIndependentWeb]);

  const appwriteTempCount = useMemo(() => {
    return prodRows.filter(r => isAppwriteProduct(r)).length;
  }, [prodRows]);

  const tiendaCount = useMemo(() => {
    return prodRows.filter(r => !isAppwriteProduct(r)).length;
  }, [prodRows]);

  // Filtrado reactivo en tiempo real para Maestro, Precios y Stock según Canal (Tienda vs Appwrite) y Búsqueda
  const effectiveStatusFilter = isDraftsView ? 'borradores' : statusFilter;
  const filteredProdRows = useMemo(() => {
    let list = prodRows;
    if (isWebProductsView) {
      list = list.filter(r => r.web_only === true || (isIndependentWeb && r.show_in_web));
    } else if (channel === 'appwrite') {
      list = list.filter(r => isAppwriteProduct(r));
    } else {
      list = list.filter(r => !isAppwriteProduct(r));
    }
    if (effectiveStatusFilter === 'activos') {
      list = list.filter(r => !r.is_draft && r.status !== 'draft' && Number(r.precio_venta_1 || 0) > 0);
    } else if (effectiveStatusFilter === 'borradores') {
      list = list.filter(r => Boolean(r.is_draft || r.status === 'draft' || Number(r.precio_venta_1 || 0) <= 0));
    }
    if (!search.trim()) return list;
    const tokens = norm(search).split(' ').filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter(r => {
      const target = norm(`${r.nombre || ''} ${r.sku || ''} ${r.codigo_barra || ''} ${r.box_code || ''} ${r.proveedor || ''} ${r.categoria || ''} ${r.subcategoria || ''}`);
      return tokens.every(token => target.includes(token));
    });
  }, [prodRows, search, channel, effectiveStatusFilter, isWebProductsView, isIndependentWeb]);

  const filteredPriceRows = useMemo(() => {
    let list = priceRows;
    if (channel === 'appwrite') {
      const awSkus = new Set(prodRows.filter(p => isAppwriteProduct(p)).map(p => p.sku));
      list = list.filter(r => awSkus.has(r.sku));
    } else {
      const tiendaSkus = new Set(prodRows.filter(p => !isAppwriteProduct(p)).map(p => p.sku));
      list = list.filter(r => tiendaSkus.has(r.sku));
    }
    if (effectiveStatusFilter === 'activos') {
      list = list.filter(r => {
        const prod = prodRows.find(p => p.sku === r.sku);
        return prod ? (!prod.is_draft && prod.status !== 'draft' && Number(prod.precio_venta_1 || 0) > 0) : true;
      });
    } else if (effectiveStatusFilter === 'borradores') {
      list = list.filter(r => {
        const prod = prodRows.find(p => p.sku === r.sku);
        return prod ? Boolean(prod.is_draft || prod.status === 'draft' || Number(prod.precio_venta_1 || 0) <= 0) : false;
      });
    }
    if (!search.trim()) return list;
    const tokens = norm(search).split(' ').filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter(r => {
      const prod = prodRows.find(p => p.sku === r.sku);
      const target = prod
        ? norm(`${prod.nombre || ''} ${r.sku || ''} ${prod.codigo_barra || ''} ${prod.box_code || ''} ${prod.proveedor || ''} ${prod.categoria || ''}`)
        : norm(r.sku || '');
      return tokens.every(token => target.includes(token));
    });
  }, [priceRows, prodRows, search, channel, effectiveStatusFilter]);

  const filteredStockRows = useMemo(() => {
    let list = stockRows;
    if (channel === 'appwrite') {
      const awSkus = new Set(prodRows.filter(p => isAppwriteProduct(p)).map(p => p.sku));
      list = list.filter(r => awSkus.has(r.sku));
    } else {
      const tiendaSkus = new Set(prodRows.filter(p => !isAppwriteProduct(p)).map(p => p.sku));
      list = list.filter(r => tiendaSkus.has(r.sku));
    }
    if (effectiveStatusFilter === 'activos') {
      list = list.filter(r => {
        const prod = prodRows.find(p => p.sku === r.sku);
        return prod ? (!prod.is_draft && prod.status !== 'draft' && Number(prod.precio_venta_1 || 0) > 0) : true;
      });
    } else if (effectiveStatusFilter === 'borradores') {
      list = list.filter(r => {
        const prod = prodRows.find(p => p.sku === r.sku);
        return prod ? Boolean(prod.is_draft || prod.status === 'draft' || Number(prod.precio_venta_1 || 0) <= 0) : false;
      });
    }
    if (!search.trim()) return list;
    const tokens = norm(search).split(' ').filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter(r => {
      const prod = prodRows.find(p => p.sku === r.sku);
      const target = prod
        ? norm(`${prod.nombre || ''} ${r.sku || ''} ${prod.codigo_barra || ''} ${prod.box_code || ''} ${prod.proveedor || ''} ${prod.categoria || ''}`)
        : norm(r.sku || '');
      return tokens.every(token => target.includes(token));
    });
  }, [stockRows, prodRows, search, channel, effectiveStatusFilter]);

  // Resetear a página 1 al cambiar de canal, pestaña, búsqueda o filtro
  useEffect(() => {
    setCurrentPage(1);
  }, [channel, tab, search, skuFilter, statusFilter, movementsSearch, movementsFilterTipo]);

  // Auto-marcar "Disponible para venta en Tienda" según stock
  // Cuando hay stock > 0 o está ilimitado → visible = true
  // Cuando stock = 0 y no ilimitado → visible = false
  useEffect(() => {
    const hasStock = newProduct.unlimited || (Number(newProduct.stock) > 0);
    setNewProduct(prev => {
      if (prev.visible === hasStock) return prev; // sin cambios
      return { ...prev, visible: hasStock };
    });
  }, [newProduct.stock, newProduct.unlimited]);

  // Total de items en la pestaña activa
  const currentTabItemsCount = useMemo(() => {
    if (tab === 'maestro') return filteredProdRows.length;
    if (tab === 'precios') return filteredPriceRows.length;
    if (tab === 'stock') return filteredStockRows.length;
    if (tab === 'pendiente') return pendingItems.length;
    if (tab === 'monitoreo') return filteredMovements.length;
    return 0;
  }, [tab, filteredProdRows.length, filteredPriceRows.length, filteredStockRows.length, pendingItems.length, filteredMovements.length]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(currentTabItemsCount / pageSize));
  }, [currentTabItemsCount, pageSize]);

  // Asegurar que la página no sobrepase el total
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Paginación local de los productos cargados en memoria.
  const paginatedProdRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const rows = sortField ? sortRows(filteredProdRows, sortField, sortDir) : filteredProdRows;
    return rows.slice(start, start + pageSize);
  }, [filteredProdRows, currentPage, pageSize, sortField, sortDir]);

  const paginatedPriceRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const rows = sortField ? sortRows(filteredPriceRows, sortField, sortDir) : filteredPriceRows;
    return rows.slice(start, start + pageSize);
  }, [filteredPriceRows, currentPage, pageSize, sortField, sortDir]);

  const paginatedStockRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const rows = sortField ? sortRows(filteredStockRows, sortField, sortDir) : filteredStockRows;
    return rows.slice(start, start + pageSize);
  }, [filteredStockRows, currentPage, pageSize, sortField, sortDir]);

  // Números de página con elipsis inteligente
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  // Purgar en 1 clic todos los productos temporales de Appwrite
  const handlePurgeAppwriteProducts = async () => {
    if (!confirm(`⚠️ ¿ATENCIÓN: Estás seguro de eliminar todos los ${appwriteTempCount} productos temporales migrados de Appwrite?\n\nLos 247 productos originales de la tienda física (Importadora Carlitos) quedarán 100% intactos.`)) {
      return;
    }
    setLoading(true);
    setMessage('Purgando productos temporales de Appwrite...');
    try {
      const res = await fetch('/api/admin/purge-appwrite-products', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al purgar');
      
      clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
      setMessage(`✅ ${data.message || 'Productos temporales de Appwrite eliminados.'}`);
      await loadAppwriteProducts(true);
      if (channel === 'appwrite') setChannel('tienda');
    } catch (e: any) {
      setMessage(`❌ Error al purgar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  // Cambiar visibilidad Web de un producto individual (Publicar / Ocultar de Web)
  const toggleWebVisibility = async (row: ProductRow) => {
    const newStatus = !row.show_in_web;
    const docId = row.rowId || row.sku;
    
    // Actualización optimista local inmediata
    setProdRows(prev => prev.map(p => p.sku === row.sku ? { ...p, show_in_web: newStatus } : p));
    
    try {
      const ok = await updateFirebaseErpProduct(docId, { show_in_web: newStatus });
      if (ok) {
        setMessage(newStatus 
          ? `🌐 "${row.nombre}" se publicó en la Tienda Web.` 
          : `🏪 "${row.nombre}" ahora es exclusivo de Tienda (oculto en la web).`
        );
        clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
        loadAppwriteProducts(true);
      } else {
        setProdRows(prev => prev.map(p => p.sku === row.sku ? { ...p, show_in_web: !newStatus } : p));
        setMessage(`❌ Error al actualizar visibilidad de "${row.nombre}".`);
      }
    } catch (e: any) {
      setProdRows(prev => prev.map(p => p.sku === row.sku ? { ...p, show_in_web: !newStatus } : p));
      setMessage(`❌ Error: ${e?.message || e}`);
    }
  };

  // Publicar u ocultar en masa los productos visibles actualmente
  const bulkSetWebVisibility = async (status: boolean) => {
    const targets = filteredProdRows.filter(p => p.show_in_web !== status);
    if (!targets.length) {
      alert(`Todos los productos mostrados ya están como "${status ? 'En Web' : 'Solo Tienda'}".`);
      return;
    }
    if (!confirm(`¿Deseas ${status ? 'publicar en la Web' : 'ocultar de la Web'} ${targets.length} productos?`)) return;

    setLoading(true);
    setMessage(`Sincronizando ${targets.length} productos...`);

    const targetSkus = new Set(targets.map(t => t.sku));
    setProdRows(prev => prev.map(p => targetSkus.has(p.sku) ? { ...p, show_in_web: status } : p));

    try {
      let count = 0;
      for (const t of targets) {
        await updateFirebaseErpProduct(t.rowId || t.sku, { show_in_web: status });
        count++;
      }
      setMessage(`✅ ${count} productos ${status ? 'publicados en la Web' : 'marcados como Solo Tienda'}.`);
      clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
      loadAppwriteProducts(true);
    } catch (err: any) {
      setMessage(`❌ Error en actualización masiva: ${err?.message || err}`);
      loadAppwriteProducts();
    } finally {
      setLoading(false);
    }
  };

  // Sincronizar "Disponible en Tienda" (isactive) según stock:
  // Productos con stock > 0 o ilimitado → isactive = true
  // Productos con stock = 0 → isactive = false
  const bulkSyncDisponiblePorStock = async () => {
    const conStock = prodRows.filter(p => (Number(p.stock) > 0 || p.ilimitado) && !isAppwriteProduct(p));
    const sinStock = prodRows.filter(p => Number(p.stock) <= 0 && !p.ilimitado && !isAppwriteProduct(p));
    const total = conStock.length + sinStock.length;
    if (total === 0) {
      alert('No hay productos de tienda para sincronizar.');
      return;
    }
    if (!confirm(`Se marcarán ${conStock.length} producto(s) con stock como DISPONIBLES y ${sinStock.length} sin stock como NO disponibles. ¿Continuar?`)) return;

    setLoading(true);
    setMessage(`Sincronizando ${total} productos...`);
    try {
      let count = 0;
      for (const p of conStock) {
        await updateFirebaseErpProduct(p.rowId || p.sku, { isactive: true });
        count++;
      }
      for (const p of sinStock) {
        await updateFirebaseErpProduct(p.rowId || p.sku, { isactive: false });
        count++;
      }
      setMessage(`✅ ${count} productos sincronizados: ${conStock.length} disponibles, ${sinStock.length} no disponibles.`);
      loadAppwriteProducts(true);
    } catch (err: any) {
      setMessage(`❌ Error: ${err?.message || err}`);
      setLoading(false);
    }
  };

  // Guardar stock directo (set) con botón + registrar movimiento
  const saveStockDirect = async (docId: string, sku: string, val: number) => {
    setStockSavingSku(sku);
    try {
      if (isIndependentWeb) {
        if (!Number.isFinite(val) || val < 0) throw new Error('El stock debe ser un número mayor o igual a cero');
        const saved = await updateFirebaseErpProduct(docId, { web_stock: val });
        if (!saved) throw new Error('No se pudo guardar el stock web');
        setStockRows(list => list.map(x => x.sku === sku ? { ...x, stock: val } : x));
        setProdRows(list => list.map(x => x.sku === sku ? { ...x, stock: val } : x));
        setMessage(`✅ Stock web actualizado para ${sku}: ${val} unidades`);
        return true;
      }
      const res = await fetch('/api/erp/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: docId,
          sku,
          nombre: prodRows.find(p => p.sku === sku)?.nombre || sku,
          tipo: 'set',
          cantidad: val,
          usuario: user?.name || user?.email || 'Cajera/ERP',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      setStockRows(list => list.map(x => x.sku === sku ? { ...x, stock: data.stockNuevo } : x));
      setProdRows(list => list.map(x => x.sku === sku ? { ...x, stock: data.stockNuevo } : x));
      setMessage(`✅ Stock actualizado para ${sku}: ${data.stockNuevo} unidades`);
      clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
      clearStockMovementsCache();
      schedulePendingRefresh();
      return true;
    } catch (err: any) {
      setMessage(`❌ Error guardando stock: ${err?.message || err}`);
      return false;
    } finally {
      setStockSavingSku(null);
    }
  };

  // Cargar stock pendiente
  const loadPendingItems = async (forceRefresh = false) => {
    setPendingLoading(true);
    try {
      const cacheKey = 'erp_pending_items_cache_v1';
      if (!forceRefresh && typeof window !== 'undefined') {
        try {
          const cachedRaw = sessionStorage.getItem(cacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.items) && Date.now() - Number(cached.timestamp || 0) < 30_000) {
              setPendingItems(cached.items);
              return;
            }
          }
        } catch { sessionStorage.removeItem(cacheKey); }
      }
      const res = await fetch('/api/erp/stock-pending', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        const nextItems = data.items || [];
        setPendingItems(nextItems);
        if (typeof window !== 'undefined') {
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), items: nextItems })); } catch {}
        }
      }
    } catch (err) {
      console.warn('Error cargando stock pendiente:', err);
    } finally {
      setPendingLoading(false);
    }
  };

  const clearPendingItemsCache = () => {
    if (typeof window === 'undefined') return;
    try { sessionStorage.removeItem('erp_pending_items_cache_v1'); } catch {}
  };

  const schedulePendingRefresh = () => {
    if (!embedded && tab !== 'pendiente' && currentView?.value !== 'pendientes') return;
    clearPendingItemsCache();
    setTimeout(() => loadPendingItems(true), 500);
  };

  // En el workspace completo se necesita el contador del tab; las páginas integradas cargan pendientes al abrirse.
  useEffect(() => {
    if (!embedded && tab !== 'pendiente') loadPendingItems();
  }, [embedded]);

  // Cargar datos al entrar a la pestaña (sin auto-refresh para no consumir llamadas)
  useEffect(() => {
    if (tab === 'pendiente') loadPendingItems();
    if (tab === 'monitoreo') loadMovements();
  }, [tab]);

  // Añadir stock (+) usando el modal
  const handleAddStock = async (mode: 'packages' | 'units') => {
    if (!addStockModal) return;
    const configuredPackageSize = getUnitsPerPackage(addStockModal.prod);
    const packageSize = Number(addStockUnitsPerPackage) || configuredPackageSize;
    const qty = mode === 'packages' ? Number(addStockQty) || 0 : Number(addStockLooseQty) || 0;
    if (qty <= 0) return;
    setAddStockSaving(true);
    try {
      if (packageSize > 0 && packageSize !== configuredPackageSize) {
        const saved = await updateFirebaseErpProduct(addStockModal.docId, { cantidad_embalaje: String(packageSize) });
        if (!saved) throw new Error('No se pudo guardar las piezas por embalaje');
      }
      if (isIndependentWeb) {
        const productRef = doc(db, PRODUCTS_COLLECTION, addStockModal.docId);
        const newStock = await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(productRef);
          if (!snapshot.exists()) throw new Error('Producto no encontrado');
          const product = snapshot.data();
          const current = Number(product.WEB_STOCK ?? product.web_stock ?? product.STOCK ?? product.stock ?? 0) || 0;
          const next = Math.max(0, current + qty);
          transaction.update(productRef, { WEB_STOCK: next, web_stock: next, updatedAt: Date.now() });
          return next;
        });
        setStockRows(list => list.map(x => x.sku === addStockModal.row.sku ? { ...x, stock: newStock } : x));
        setProdRows(list => list.map(x => x.sku === addStockModal.row.sku ? { ...x, stock: newStock } : x));
        setMessage(`✅ ${qty} unidades añadidas al stock web. Total: ${newStock}`);
        setAddStockModal(null);
        setAddStockQty(''); setAddStockLooseQty(''); setAddStockPackages(''); setAddStockUnitsPerPackage('');
        clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
        purgeServerProductsCache();
        await loadAppwriteProducts(true);
        return;
      }
      const res = await fetch('/api/erp/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: addStockModal.docId,
          sku: addStockModal.row.sku,
          nombre: addStockModal.prod?.nombre || addStockModal.row.sku,
          tipo: 'add',
          cantidad: qty,
          usuario: user?.name || user?.email || 'Cajera/ERP',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      setStockRows(list => list.map(x => x.sku === addStockModal.row.sku ? { ...x, stock: data.stockNuevo } : x));
      setProdRows(list => list.map(x => x.sku === addStockModal.row.sku ? {
        ...x,
        stock: data.stockNuevo,
        ...(packageSize > 0 && { cantidad_embalaje: String(packageSize) }),
      } : x));
      setMessage(`✅ ${qty} unidades añadidas a ${addStockModal.row.sku}. Stock total: ${data.stockNuevo}`);
      setAddStockModal(null);
      setAddStockQty('');
      setAddStockLooseQty('');
      setAddStockPackages('');
      setAddStockUnitsPerPackage('');
      clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
      clearStockMovementsCache();
      schedulePendingRefresh();
    } catch (err: any) {
      setMessage(`❌ Error: ${err?.message || err}`);
    } finally {
      setAddStockSaving(false);
    }
  };

  // Compensar stock pendiente con ingreso de mercadería física
  const handleCompensarSubmit = async () => {
    if (!compensarModal) return;
    const qty = Number(compensarQty) || 0;
    if (qty <= 0) return;
    setCompensarSaving(true);
    try {
      const res = await fetch('/api/erp/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: compensarModal.docId,
          sku: compensarModal.item.sku,
          nombre: compensarModal.prod?.nombre || compensarModal.item.nombre || compensarModal.item.sku,
          tipo: 'add',
          cantidad: qty,
          usuario: user?.name || user?.email || 'Jefe/ERP',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error compensando stock');

      const stockNuevo = data.stockNuevo;
      const desc = data.pendienteDescontado || 0;
      const rest = data.pendienteRestante || 0;

      // Actualizar tablas locales
      setStockRows(list => list.map(x => x.sku === compensarModal.item.sku ? { ...x, stock: stockNuevo } : x));
      setProdRows(list => list.map(x => x.sku === compensarModal.item.sku ? { ...x, stock: stockNuevo } : x));

      // Actualizar pendingItems inmediatamente
      if (rest > 0) {
        setPendingItems(list => list.map(p => p.sku === compensarModal.item.sku ? { ...p, pendiente: rest } : p));
      } else {
        setPendingItems(list => list.filter(p => p.sku !== compensarModal.item.sku));
      }

      setMessage(`✅ Ingreso de ${qty} uds a ${compensarModal.item.sku}: Se compensaron ${desc} uds pendientes (${rest === 0 ? 'Deuda saldada a 0' : `quedan ${rest} debiendo`}). Stock final disponible: ${stockNuevo}.`);
      setCompensarModal(null);
      setCompensarQty('');
      clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
      clearStockMovementsCache();
      clearPendingItemsCache();
    } catch (err: any) {
      setMessage(`❌ Error compensando: ${err?.message || err}`);
    } finally {
      setCompensarSaving(false);
    }
  };

  const exportToExcel = () => {
    if (!prodRows.length) {
      alert('No hay productos para exportar');
      return;
    }
    const dataToExport = prodRows.map((p, idx) => ({
      '#': idx + 1,
      'SKU': p.sku,
      'Código de Barra': p.codigo_barra || '',
      'Nombre del Producto': p.nombre,
      'Categoría': p.categoria || '',
      'Subcategoría': p.subcategoria || '',
      'Destino / Canal': p.web_only ? 'Solo Web' : p.show_in_web ? 'Tienda Web & POS' : 'Solo Tienda (POS)',
      'Stock': p.stock || 0,
      'Costo Unitario': p.costo_uni || 0,
      'P1 Efectivo': p.precio_venta_1 || 0,
      'P2 Embalaje': p.precio_venta_2 || 0,
      'P3 Embalaje 2': p.precio_venta_3 || 0,
      'P4 Precio especial': p.precio_venta_4 || 0,
      'P5': p.precio_venta_5 || 0,
      'P6': p.precio_venta_6 || 0,
      'P7': p.precio_venta_7 || 0,
      'P8': p.precio_venta_8 || 0,
      'P9': p.precio_venta_9 || 0,
      'P10': p.precio_venta_10 || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `inventario_importadora_carlitos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Guardar Maestro en Appwrite
  const saveMaestro = async () => {
    setLoading(true);
    setMessage('');
    try {
      let total = 0;
      for (const r of prodRows) {
        if (!r.sku) continue;
        await updateFirebaseErpProduct(r.rowId || r.sku, {
          nombre: r.nombre,
          codigo_barra: r.codigo_barra,
          costo_uni: Math.round(r.costo_uni),
          precio_venta_1: Math.round(Number(r.precio_venta_1) || 0),
          precio_venta_2: Math.round(Number(r.precio_venta_2) || 0),
          precio_venta_3: Math.round(Number(r.precio_venta_3) || 0),
          precio_venta_4: Math.round(Number(r.precio_venta_4) || 0),
          precio_venta_5: Math.round(Number((r as any).precio_venta_5) || 0),
          precio_venta_6: Math.round(Number((r as any).precio_venta_6) || 0),
          precio_venta_7: Math.round(Number((r as any).precio_venta_7) || 0),
          precio_venta_8: Math.round(Number((r as any).precio_venta_8) || 0),
          precio_venta_9: Math.round(Number((r as any).precio_venta_9) || 0),
          precio_venta_10: Math.round(Number((r as any).precio_venta_10) || 0),
        });
        total++;
      }
      setMessage(`✅ Maestro guardado correctamente en Appwrite. (${total} productos)`);
      loadAppwriteProducts();
    } catch (e: any) {
      setMessage('Error guardando Maestro: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  // Guardar Precios en Appwrite
  const savePrecios = async (rows?: Array<{ sku: string; precio_detalle: number; precio_mayorista: number; precio_segundo?: number; precio_cuarto?: number; precio_5?: number; precio_6?: number; precio_7?: number; precio_8?: number; precio_9?: number; precio_10?: number }>) => {
    setLoading(true);
    setMessage('');
    try {
      let total = 0;
      for (const r of (rows || priceRows)) {
        if (!r.sku) continue;
        const matching = prodRows.find(p => p.sku === r.sku);
        const docId = matching?.rowId || r.sku;
        await updateFirebaseErpProduct(docId, {
          precio_venta_1: Math.round(r.precio_detalle) || 0,
          precio_venta_2: Math.round(r.precio_mayorista) || 0,
          precio_venta_3: Math.round(r.precio_segundo || 0),
          precio_venta_4: Math.round(r.precio_cuarto || 0),
          precio_venta_5: Math.round((r as any).precio_5 || 0),
          precio_venta_6: Math.round((r as any).precio_6 || 0),
          precio_venta_7: Math.round((r as any).precio_7 || 0),
          precio_venta_8: Math.round((r as any).precio_8 || 0),
          precio_venta_9: Math.round((r as any).precio_9 || 0),
          precio_venta_10: Math.round((r as any).precio_10 || 0),
        });
        total++;
      }
      setMessage(`✅ Precios guardados correctamente en Appwrite. Total: ${total}.`);
    } catch (e: any) {
      setMessage('Error guardando precios: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  // Guardar Stock en Firebase (solo filas modificadas, auditadas vía /api/erp/stock-movements)
  const saveStock = async () => {
    setLoading(true);
    setMessage('');
    try {
      let total = 0;
      for (const r of stockRows) {
        if (!r.sku) continue;
        const matching = prodRows.find(p => p.sku === r.sku);
        const nextStock = Math.round(r.stock);
        const prevStock = Math.round(matching?.stock ?? 0);
        if (matching && nextStock === prevStock) continue;
        const docId = matching?.rowId || r.sku;
        if (isIndependentWeb) {
          const saved = await updateFirebaseErpProduct(docId, { web_stock: nextStock });
          if (!saved) throw new Error(`No se pudo guardar el stock web de ${r.sku}`);
          total++;
          continue;
        }
        const res = await fetch('/api/erp/stock-movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: docId,
            sku: r.sku,
            nombre: matching?.nombre || r.sku,
            tipo: 'set',
            cantidad: nextStock,
            usuario: 'Base de Datos ERP',
            nota: `Ajuste masivo en pestaña Stock (${prevStock} → ${nextStock})`,
          }),
        });
        if (!res.ok) {
          await updateFirebaseErpProduct(docId, { stock: nextStock });
        }
        total++;
      }
      if (total > 0) {
        clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
        await loadAppwriteProducts(true);
      }
      setMessage(total > 0 ? `✅ Stock actualizado y auditado (${total} productos modificados).` : 'ℹ️ No hubo cambios de stock para guardar.');
    } catch (e: any) {
      setMessage('Error guardando Stock: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  // Eliminar producto de Appwrite
  const deleteProducto = async (sku: string) => {
    if (!sku) return;
    if (!confirm(`¿Eliminar producto ${sku} de Appwrite?`)) return;
    try {
      const matching = prodRows.find(p => p.sku === sku);
      const docId = matching?.rowId || sku;
      await deleteFirebaseErpProduct(docId);
      setProdRows(list => list.filter(r => r.sku !== sku));
      setPriceRows(list => list.filter(r => r.sku !== sku));
      setGeneralCosts(list => list.filter(r => r.sku !== sku));
      setStockRows(list => list.filter(r => r.sku !== sku));
      setMessage(`🗑️ Producto ${sku} eliminado de Appwrite.`);
    } catch (e: any) {
      setMessage('Error eliminando: ' + (e?.message || String(e)));
    }
  };

  // Guardar fila individual de costo
  const saveCostoRow = async (r: ProductRow) => {
    try {
      const sku = String(r.sku || '').trim();
      if (!sku) return;
      const rowId = r.rowId || sku;
      const draft = rowId ? costoDraftByRowIdRef.current[rowId] : undefined;
      const nuevo = Math.round(parseMoney(draft ?? r.costo_uni));

      await updateFirebaseErpProduct(rowId, { costo_uni: nuevo });

      setProdRows(list => list.map(x => (x === r ? { ...x, costo_uni: nuevo } : x)));
      setGeneralCosts(list => list.map(x => (x.sku === sku ? { ...x, costo_uni: nuevo } : x)));
      if (rowId) delete costoDraftByRowIdRef.current[rowId];
      setMessage(`Guardado costo: ${sku}`);
    } catch (e: any) {
      setMessage('Error guardando costo: ' + (e?.message || String(e)));
    }
  };

  // Guardar fila individual de precio bajo
  const savePrecioBajoMaestroRow = async (r: ProductRow) => {
    try {
      const sku = String(r?.sku || '').trim();
      if (!sku) return;
      const draft = precioBajoDraftBySkuRef.current[sku];
      const nuevoBajo = Math.round(parseMoney(draft ?? precioMasBajo(r)));

      const v1 = Math.round(Number((r as any)?.precio_venta_1) || 0);
      const v2 = Math.round(Number((r as any)?.precio_venta_2) || 0);
      const nuevoVenta2 = nuevoBajo;
      const nuevoVenta1 = Math.max(v1 > 0 ? v1 : 0, nuevoBajo, v2 > 0 ? v2 : 0);

      const rowId = r.rowId || sku;
      await updateFirebaseErpProduct(rowId, {
        precio_venta_1: Math.round(nuevoVenta1),
        precio_venta_2: Math.round(nuevoVenta2),
      });

      setProdRows(list => list.map(x => x.sku === sku ? { ...x, precio_venta_1: nuevoVenta1, precio_venta_2: nuevoVenta2 } : x));
      setPriceRows(list => list.map(x => x.sku === sku ? { ...x, precio_detalle: nuevoVenta1, precio_mayorista: nuevoVenta2 } : x));

      delete precioBajoDraftBySkuRef.current[sku];
      setMessage(`Guardado precio bajo: ${sku}`);
    } catch (e: any) {
      setMessage('Error guardando precio bajo: ' + (e?.message || String(e)));
    }
  };

  const generateNewProductSku = () => {
    let sku = '';
    do {
      sku = `DB-${Date.now().toString(36).slice(-5).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    } while (prodRows.some(product => product.sku.toLowerCase() === sku.toLowerCase()));
    setNewProduct(product => ({ ...product, sku }));
  };

  const resetNewProduct = () => {
    setInitialStockPackages('');
    setShowExtraPrices(false);
    setNewProduct({
      sku: '', codigo_barra: '', nombre: '', descripcion: '', category: '', subcategory: '',
      proveedor: '', cantidad_embalaje: '', box_code: '', section: '', tags: '', features: '',
      unlimited: false, visible: true, show_in_web: isWebProductsView, stock: '0', costo_uni: '0',
      precio_venta_1: '0', precio_venta_2: '0', precio_venta_3: '0', precio_venta_4: '0',
      precio_venta_5: '0', precio_venta_6: '0', precio_venta_7: '0', precio_venta_8: '0', precio_venta_9: '0', precio_venta_10: '0',
      label_p2: '', label_p3: '', label_p4: '', label_p5: '', label_p6: '', label_p7: '', label_p8: '', label_p9: '', label_p10: '',
      is_draft: false,
      packqty: '0', packprice: '0', embalajeqty: '0', embalajeprice: '0',
      promo_qty: '0', promo_price: '0',
      wholesale_min_qty: '0', wholesale_price: '0', pack_discount_pct: '0', pack_min_packs: '0',
      details: '', usage: '', ingredients: '',
      current_price: '0', disable_discounts: false,
      imageUrl: '',
    });
  };

  const editProduct = (row: ProductRow) => {
    const pkgSize = parsePackageUnits(row.cantidad_embalaje || '');
    if (pkgSize > 0 && Number(row.stock || 0) > 0) {
      setInitialStockPackages(String(Math.floor(Number(row.stock) / pkgSize)));
    } else {
      setInitialStockPackages('');
    }
    setEditingSku(row.sku);
    const priceRow = priceRows.find(p => p.sku === row.sku);
    const hasExtra = [
      Number(row.precio_venta_5 || (priceRow as any)?.precio_5 || 0),
      Number(row.precio_venta_6 || (priceRow as any)?.precio_6 || 0),
      Number(row.precio_venta_7 || (priceRow as any)?.precio_7 || 0),
      Number(row.precio_venta_8 || (priceRow as any)?.precio_8 || 0),
      Number(row.precio_venta_9 || (priceRow as any)?.precio_9 || 0),
      Number(row.precio_venta_10 || (priceRow as any)?.precio_10 || 0),
    ].some(v => v > 0);
    setShowExtraPrices(hasExtra);
    setNewProduct({
      sku: row.sku,
      codigo_barra: row.codigo_barra || '',
      nombre: row.nombre,
      descripcion: '',
      category: row.categoria || '',
      subcategory: row.subcategoria || '',
      proveedor: row.proveedor || '',
      cantidad_embalaje: row.cantidad_embalaje || '',
      box_code: row.box_code || '',
      section: '',
      tags: '',
      features: '',
      unlimited: row.ilimitado,
      visible: row.show_in_web ?? true,
      show_in_web: row.show_in_web ?? false,
      stock: String(row.stock ?? 0),
      costo_uni: String(row.costo_uni ?? 0),
      precio_venta_1: String(row.precio_venta_1 || priceRow?.precio_detalle || 0),
      precio_venta_2: String(row.precio_venta_2 || priceRow?.precio_mayorista || 0),
      precio_venta_3: String(row.precio_venta_3 || priceRow?.precio_segundo || 0),
      precio_venta_4: String(row.precio_venta_4 || priceRow?.precio_cuarto || 0),
      precio_venta_5: String(row.precio_venta_5 || (priceRow as any)?.precio_5 || 0),
      precio_venta_6: String(row.precio_venta_6 || (priceRow as any)?.precio_6 || 0),
      precio_venta_7: String(row.precio_venta_7 || (priceRow as any)?.precio_7 || 0),
      precio_venta_8: String(row.precio_venta_8 || (priceRow as any)?.precio_8 || 0),
      precio_venta_9: String(row.precio_venta_9 || (priceRow as any)?.precio_9 || 0),
      precio_venta_10: String(row.precio_venta_10 || (priceRow as any)?.precio_10 || 0),
      label_p2: row.label_p2 || priceRow?.label_p2 || '',
      label_p3: row.label_p3 || priceRow?.label_p3 || '',
      label_p4: row.label_p4 || priceRow?.label_p4 || '',
      label_p5: row.label_p5 || (priceRow as any)?.label_p5 || '',
      label_p6: row.label_p6 || (priceRow as any)?.label_p6 || '',
      label_p7: row.label_p7 || (priceRow as any)?.label_p7 || '',
      label_p8: row.label_p8 || (priceRow as any)?.label_p8 || '',
      label_p9: row.label_p9 || (priceRow as any)?.label_p9 || '',
      label_p10: row.label_p10 || (priceRow as any)?.label_p10 || '',
      is_draft: Boolean(row.is_draft || row.status === 'draft' || Number(row.precio_venta_1 || 0) <= 0),
      packqty: '0',
      packprice: '0',
      embalajeqty: '0',
      embalajeprice: '0',
      promo_qty: '0',
      promo_price: '0',
      wholesale_min_qty: '0',
      wholesale_price: '0',
      pack_discount_pct: '0',
      pack_min_packs: '0',
      details: '',
      usage: '',
      ingredients: '',
      current_price: '0',
      disable_discounts: false,
      imageUrl: row.imageUrl || '',
    });
    setTab('nuevo');
  };

  const saveNewProduct = async (createAnother: boolean, asDraft = false) => {
    const sku = newProduct.sku.trim();
    const nombre = newProduct.nombre.trim();
    if (!sku || !nombre) {
      setMessage('SKU y nombre del producto son obligatorios.');
      return;
    }
    const isDraft = asDraft || (parseMoney(newProduct.precio_venta_1) <= 0);
    if (!isDraft && parseMoney(newProduct.precio_venta_1) <= 0) {
      setMessage(isCurrentWebOnly ? 'El precio web es obligatorio y debe ser mayor a 0 (o guárdalo como Borrador).' : 'El precio de venta P1 (Efectivo) es obligatorio y debe ser mayor a 0 (o guárdalo como Borrador).');
      return;
    }
    if (!editingSku && prodRows.some(product => product.sku.toLowerCase() === sku.toLowerCase())) {
      setMessage(`Ya existe un producto con el SKU ${sku}.`);
      return;
    }

    setSavingNewProduct(true);
    setMessage(editingSku ? (isDraft ? 'Actualizando borrador…' : 'Actualizando producto…') : (isDraft ? 'Guardando borrador…' : 'Guardando producto…'));
    try {
      if (editingSku) {
        const row = prodRows.find(p => p.sku === editingSku);
        const productId = row?.rowId || editingSku;
        const prevRowStock = Math.round(Number(row?.stock ?? 0));
        const targetStock = newProduct.unlimited ? 999999 : Math.max(0, parseInt(newProduct.stock, 10) || 0);
        const stockChanged = newProduct.unlimited !== Boolean(row?.ilimitado) || (!newProduct.unlimited && targetStock !== prevRowStock);

        const ok = await updateFirebaseErpProduct(productId, {
          sku,
          nombre,
          category: newProduct.category.trim(),
          subcategory: newProduct.subcategory.trim(),
          codigo_barra: newProduct.codigo_barra.trim(),
          proveedor: newProduct.proveedor.trim(),
          cantidad_embalaje: newProduct.cantidad_embalaje.trim(),
          box_code: newProduct.box_code.trim(),
          label_p2: newProduct.label_p2.trim(),
          label_p3: newProduct.label_p3.trim(),
          label_p4: newProduct.label_p4.trim(),
          label_p5: newProduct.label_p5.trim(),
          label_p6: newProduct.label_p6.trim(),
          label_p7: newProduct.label_p7.trim(),
          label_p8: newProduct.label_p8.trim(),
          label_p9: newProduct.label_p9.trim(),
          label_p10: newProduct.label_p10.trim(),
          is_draft: isDraft,
          status: isDraft ? 'draft' : 'active',
          precio_venta_1: parseMoney(newProduct.precio_venta_1),
          precio_venta_2: parseMoney(newProduct.precio_venta_2),
          precio_venta_3: parseMoney(newProduct.precio_venta_3),
          precio_venta_4: parseMoney(newProduct.precio_venta_4),
          precio_venta_5: parseMoney(newProduct.precio_venta_5),
          precio_venta_6: parseMoney(newProduct.precio_venta_6),
          precio_venta_7: parseMoney(newProduct.precio_venta_7),
          precio_venta_8: parseMoney(newProduct.precio_venta_8),
          precio_venta_9: parseMoney(newProduct.precio_venta_9),
          precio_venta_10: parseMoney(newProduct.precio_venta_10),
          costo_uni: parseMoney(newProduct.costo_uni),
          isactive: isDraft ? false : newProduct.visible,
          show_in_web: isDraft ? false : (isIndependentWeb ? newProduct.visible : (isWebProductsView || newProduct.show_in_web)),
          web_only: isIndependentWeb ? Boolean(row?.web_only) : (isWebProductsView ? true : Boolean(row?.web_only)),
          imageUrl: newProduct.imageUrl,
          ...(isIndependentWeb ? { web_stock: targetStock } : { ilimitado: Boolean(newProduct.unlimited), ...(newProduct.unlimited && { stock: 999999 }) }),
        });
        if (!ok) throw new Error('No se pudo actualizar el producto.');

        if (stockChanged && !newProduct.unlimited && !isIndependentWeb) {
          const saved = await saveStockDirect(productId, sku, targetStock);
          if (!saved) throw new Error('No se pudo guardar el stock');
        }

        const finalStock = newProduct.unlimited ? 999999 : targetStock;

        setProdRows(list => list.map(p => p.sku === editingSku ? {
          ...p,
          sku, nombre,
          codigo_barra: newProduct.codigo_barra.trim(),
          categoria: newProduct.category.trim(),
          subcategoria: newProduct.subcategory.trim(),
          proveedor: newProduct.proveedor.trim(),
          cantidad_embalaje: newProduct.cantidad_embalaje.trim(),
          box_code: newProduct.box_code.trim(),
          label_p2: newProduct.label_p2.trim(),
          label_p3: newProduct.label_p3.trim(),
          label_p4: newProduct.label_p4.trim(),
          label_p5: newProduct.label_p5.trim(),
          label_p6: newProduct.label_p6.trim(),
          label_p7: newProduct.label_p7.trim(),
          label_p8: newProduct.label_p8.trim(),
          label_p9: newProduct.label_p9.trim(),
          label_p10: newProduct.label_p10.trim(),
          is_draft: isDraft,
          status: isDraft ? 'draft' : 'active',
          stock: finalStock,
          ilimitado: Boolean(newProduct.unlimited),
          costo_uni: parseMoney(newProduct.costo_uni),
          precio_venta_1: parseMoney(newProduct.precio_venta_1),
          precio_venta_2: parseMoney(newProduct.precio_venta_2),
          precio_venta_3: parseMoney(newProduct.precio_venta_3),
          precio_venta_4: parseMoney(newProduct.precio_venta_4),
          precio_venta_5: parseMoney(newProduct.precio_venta_5),
          precio_venta_6: parseMoney(newProduct.precio_venta_6),
          precio_venta_7: parseMoney(newProduct.precio_venta_7),
          precio_venta_8: parseMoney(newProduct.precio_venta_8),
          precio_venta_9: parseMoney(newProduct.precio_venta_9),
          precio_venta_10: parseMoney(newProduct.precio_venta_10),
          imageUrl: newProduct.imageUrl || null,
          show_in_web: isDraft ? false : (isIndependentWeb ? newProduct.visible : (isWebProductsView || newProduct.show_in_web)),
          web_only: isWebProductsView ? true : Boolean(row?.web_only),
          updatedAt: Date.now(),
        } : p));
        setPriceRows(list => list.map(pr => pr.sku === editingSku ? {
          ...pr,
          sku,
          precio_detalle: parseMoney(newProduct.precio_venta_1),
          precio_mayorista: parseMoney(newProduct.precio_venta_2),
          precio_segundo: parseMoney(newProduct.precio_venta_3),
          precio_cuarto: parseMoney(newProduct.precio_venta_4),
          precio_5: parseMoney(newProduct.precio_venta_5),
          precio_6: parseMoney(newProduct.precio_venta_6),
          precio_7: parseMoney(newProduct.precio_venta_7),
          precio_8: parseMoney(newProduct.precio_venta_8),
          precio_9: parseMoney(newProduct.precio_venta_9),
          precio_10: parseMoney(newProduct.precio_venta_10),
          label_p2: newProduct.label_p2.trim(),
          label_p3: newProduct.label_p3.trim(),
          label_p4: newProduct.label_p4.trim(),
          label_p5: newProduct.label_p5.trim(),
          label_p6: newProduct.label_p6.trim(),
          label_p7: newProduct.label_p7.trim(),
          label_p8: newProduct.label_p8.trim(),
          label_p9: newProduct.label_p9.trim(),
          label_p10: newProduct.label_p10.trim(),
        } : pr));
        setStockRows(list => list.map(sr => sr.sku === editingSku ? { ...sr, sku, stock: finalStock, ilimitado: Boolean(newProduct.unlimited) } : sr));
        setGeneralCosts(list => list.map(gc => gc.sku === editingSku ? { ...gc, sku, nombre, costo_uni: parseMoney(newProduct.costo_uni) } : gc));
        setMessage(isDraft ? `✅ Producto "${nombre}" guardado como BORRADOR (en espera de precios).` : `Producto "${nombre}" actualizado correctamente.`);
        setEditingSku(null);
        resetNewProduct();
        if (!createAnother) setTab(returnToListTab);
      } else {
        const createdId = await createFirebaseErpProduct({
          sku,
          nombre,
          descripcion: newProduct.descripcion.trim(),
          codigo_barra: newProduct.codigo_barra.trim(),
          category: newProduct.category.trim(),
          subcategory: newProduct.subcategory.trim(),
          proveedor: newProduct.proveedor.trim(),
          cantidad_embalaje: newProduct.cantidad_embalaje.trim(),
          box_code: newProduct.box_code.trim(),
          label_p2: newProduct.label_p2.trim(),
          label_p3: newProduct.label_p3.trim(),
          label_p4: newProduct.label_p4.trim(),
          label_p5: newProduct.label_p5.trim(),
          label_p6: newProduct.label_p6.trim(),
          label_p7: newProduct.label_p7.trim(),
          label_p8: newProduct.label_p8.trim(),
          label_p9: newProduct.label_p9.trim(),
          label_p10: newProduct.label_p10.trim(),
          is_draft: isDraft,
          status: isDraft ? 'draft' : 'active',
          section: newProduct.section ? Number(newProduct.section) : undefined,
          tags: newProduct.tags.trim(),
          features: newProduct.features.trim(),
          precio_venta_1: parseMoney(newProduct.precio_venta_1),
          precio_venta_2: parseMoney(newProduct.precio_venta_2),
          precio_venta_3: parseMoney(newProduct.precio_venta_3),
          precio_venta_4: parseMoney(newProduct.precio_venta_4),
          precio_venta_5: parseMoney(newProduct.precio_venta_5),
          precio_venta_6: parseMoney(newProduct.precio_venta_6),
          precio_venta_7: parseMoney(newProduct.precio_venta_7),
          precio_venta_8: parseMoney(newProduct.precio_venta_8),
          precio_venta_9: parseMoney(newProduct.precio_venta_9),
          precio_venta_10: parseMoney(newProduct.precio_venta_10),
          costo_uni: parseMoney(newProduct.costo_uni),
          stock: isIndependentWeb ? 0 : (newProduct.unlimited ? 999999 : parseMoney(newProduct.stock)),
          ...(isIndependentWeb ? { web_stock: newProduct.unlimited ? 999999 : parseMoney(newProduct.stock) } : {}),
          isactive: isDraft ? false : newProduct.visible,
          show_in_web: isWebProductsView ? (!isDraft && (!isIndependentWeb || newProduct.visible)) : false,
          web_only: isWebProductsView,
          packqty: parseMoney(newProduct.packqty) || undefined,
          packprice: parseMoney(newProduct.packprice) || undefined,
          embalajeqty: parseMoney(newProduct.embalajeqty) || undefined,
          embalajeprice: parseMoney(newProduct.embalajeprice) || undefined,
          promo_qty: parseMoney(newProduct.promo_qty) || undefined,
          promo_price: parseMoney(newProduct.promo_price) || undefined,
          wholesale_min_qty: parseMoney(newProduct.wholesale_min_qty) || undefined,
          wholesale_price: parseMoney(newProduct.wholesale_price) || undefined,
          pack_discount_pct: parseMoney(newProduct.pack_discount_pct) || undefined,
          pack_min_packs: parseMoney(newProduct.pack_min_packs) || undefined,
          details: newProduct.details.trim(),
          usage: newProduct.usage.trim(),
          ingredients: newProduct.ingredients.trim(),
          current_price: parseMoney(newProduct.current_price) || undefined,
          disable_discounts: newProduct.disable_discounts,
          imageUrl: newProduct.imageUrl,
        });
        if (!createdId) throw new Error('No se pudo crear el producto.');
        const newRow: ProductRow = {
          sku,
          isAutoSku: false,
          nombre,
          codigo_barra: newProduct.codigo_barra.trim(),
          categoria: newProduct.category.trim(),
          subcategoria: newProduct.subcategory.trim(),
          proveedor: newProduct.proveedor.trim(),
          cantidad_embalaje: newProduct.cantidad_embalaje.trim(),
          box_code: newProduct.box_code.trim(),
          label_p2: newProduct.label_p2.trim(),
          label_p3: newProduct.label_p3.trim(),
          label_p4: newProduct.label_p4.trim(),
          label_p5: newProduct.label_p5.trim(),
          label_p6: newProduct.label_p6.trim(),
          label_p7: newProduct.label_p7.trim(),
          label_p8: newProduct.label_p8.trim(),
          label_p9: newProduct.label_p9.trim(),
          label_p10: newProduct.label_p10.trim(),
          is_draft: isDraft,
          status: isDraft ? 'draft' : 'active',
          stock: newProduct.unlimited ? 999999 : parseMoney(newProduct.stock),
          ilimitado: newProduct.unlimited,
          costo_uni: parseMoney(newProduct.costo_uni),
          precio_venta_1: parseMoney(newProduct.precio_venta_1),
          precio_venta_2: parseMoney(newProduct.precio_venta_2),
          precio_venta_3: parseMoney(newProduct.precio_venta_3),
          precio_venta_4: parseMoney(newProduct.precio_venta_4),
          precio_venta_5: parseMoney(newProduct.precio_venta_5),
          precio_venta_6: parseMoney(newProduct.precio_venta_6),
          precio_venta_7: parseMoney(newProduct.precio_venta_7),
          precio_venta_8: parseMoney(newProduct.precio_venta_8),
          precio_venta_9: parseMoney(newProduct.precio_venta_9),
          precio_venta_10: parseMoney(newProduct.precio_venta_10),
          updatedAt: Date.now(),
          createdAt: Date.now(),
          rowId: createdId,
          imageUrl: newProduct.imageUrl || null,
          show_in_web: isWebProductsView ? (!isDraft && (!isIndependentWeb || newProduct.visible)) : false,
          web_only: isWebProductsView,
          visible: isDraft ? false : newProduct.visible,
          unlimited: newProduct.unlimited,
        } as ProductRow;
        setProdRows(list => [newRow, ...list]);
        setPriceRows(list => [{
          sku,
          precio_detalle: parseMoney(newProduct.precio_venta_1),
          precio_mayorista: parseMoney(newProduct.precio_venta_2),
          precio_segundo: parseMoney(newProduct.precio_venta_3),
          precio_cuarto: parseMoney(newProduct.precio_venta_4),
          precio_5: parseMoney(newProduct.precio_venta_5),
          precio_6: parseMoney(newProduct.precio_venta_6),
          precio_7: parseMoney(newProduct.precio_venta_7),
          precio_8: parseMoney(newProduct.precio_venta_8),
          precio_9: parseMoney(newProduct.precio_venta_9),
          precio_10: parseMoney(newProduct.precio_venta_10),
          label_p2: newProduct.label_p2.trim(),
          label_p3: newProduct.label_p3.trim(),
          label_p4: newProduct.label_p4.trim(),
          label_p5: newProduct.label_p5.trim(),
          label_p6: newProduct.label_p6.trim(),
          label_p7: newProduct.label_p7.trim(),
          label_p8: newProduct.label_p8.trim(),
          label_p9: newProduct.label_p9.trim(),
          label_p10: newProduct.label_p10.trim(),
          rowId: createdId,
        }, ...list]);
        setStockRows(list => [{ sku, stock: newProduct.unlimited ? 999999 : parseMoney(newProduct.stock), ilimitado: newProduct.unlimited }, ...list]);
        setGeneralCosts(list => [{ sku, nombre, costo_uni: parseMoney(newProduct.costo_uni) }, ...list]);
        setMessage(isDraft ? `✅ Producto "${nombre}" guardado como BORRADOR (en espera de precios del jefe).` : `Producto "${nombre}" creado correctamente.`);
        resetNewProduct();
        if (!createAnother) setTab(returnToListTab);
      }
    } catch (error: any) {
      console.error('❌ Error en saveNewProduct:', error);
      setMessage(error?.message || 'No se pudo crear el producto. Revisa la consola para más detalles.');
    } finally {
      setSavingNewProduct(false);
    }
  };

  const renderPaginationControls = () => {
    if (tab === 'nuevo' || currentTabItemsCount === 0) return null;
    const startItem = Math.min((currentPage - 1) * pageSize + 1, currentTabItemsCount);
    const endItem = Math.min(currentPage * pageSize, currentTabItemsCount);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white px-3 sm:px-4 py-2.5 border border-slate-200/80 rounded-xl shadow-sm text-xs select-none my-2">
        <div className="flex items-center gap-2 text-slate-600 font-medium text-center">
          <span>
            <strong className="text-slate-900 font-bold">{startItem}</strong>–<strong className="text-slate-900 font-bold">{endItem}</strong> de <strong className="text-indigo-600 font-bold">{currentTabItemsCount}</strong>
          </span>
          <span className="hidden md:inline-block text-slate-300">|</span>
          <span className="hidden md:inline-block text-slate-400">
            Pág. <strong className="text-slate-700">{currentPage}</strong> de <strong className="text-slate-700">{totalPages}</strong>
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-center">
          {/* Primero */}
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed font-bold transition"
            title="Primera página"
          >
            «
          </button>

          {/* Anterior */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="h-8 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed font-bold transition flex items-center gap-1"
          >
            ‹ Anterior
          </button>

          {/* Números de página con elipsis */}
          <div className="flex items-center gap-1">
            {pageNumbers.map((pNum, idx) => {
              if (pNum === '...') {
                return (
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400 font-bold">
                    …
                  </span>
                );
              }
              const num = Number(pNum);
              const isActive = currentPage === num;
              return (
                <button
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  className={`min-w-[32px] h-8 px-2.5 rounded-lg text-xs font-black transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>

          {/* Siguiente */}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="h-8 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed font-bold transition flex items-center gap-1"
          >
            Siguiente ›
          </button>

          {/* Último */}
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed font-bold transition"
            title="Última página"
          >
            »
          </button>
        </div>

        {/* Versión compacta para móvil */}
        <div className="flex sm:hidden items-center justify-between w-full gap-2 pt-1 border-t border-slate-100">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex-1 h-8 px-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold disabled:opacity-30 flex items-center justify-center gap-1 active:scale-95 transition"
          >
            ‹ Anterior
          </button>
          <span className="text-xs font-black text-slate-700 px-2 shrink-0">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="flex-1 h-8 px-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-30 flex items-center justify-center gap-1 active:scale-95 transition"
          >
            Siguiente ›
          </button>
        </div>

        {/* Selector de tamaño */}
        <div className="flex shrink-0 flex-nowrap items-center gap-2 text-slate-500 font-medium">
          <span className="whitespace-nowrap text-[11px]">Por pág:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-10 w-[72px] min-w-[72px] shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-0 text-center text-xs font-bold leading-normal text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
    );
  };

  const labelForSede = (slug: string) => {
    const branch = configuredBranches.find(b => b.slug === slug);
    return branch?.name || SEDES_LABELS[slug as SedeSlug] || slug;
  };

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-content-center bg-white text-sm font-bold text-slate-500">
        Verificando credenciales de acceso...
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }
  return (
    <div className={`relative text-slate-800 ${embedded ? 'w-full' : 'min-h-screen overflow-hidden bg-[#f7f9fc]'}`}>
      {!embedded && <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-36 top-20 h-80 w-80 rounded-full bg-indigo-100/60 blur-3xl" />
        <div className="absolute -right-32 top-52 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-50 blur-3xl" />
      </div>}

      <div className={`relative m-0 w-full ${embedded ? 'max-w-[1600px] mx-auto px-[3%] pt-5 sm:pt-6 pb-12' : 'max-w-none px-3 sm:px-4 lg:px-6 py-3 sm:py-5'}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Cortina lateral izquierda: aparece al hover en el borde */}
          {!embedded && <div
            className={`hidden lg:block fixed left-0 top-16 bottom-4 w-72 z-[100] transition-transform duration-300 ease-out ${leftPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="h-full overflow-y-auto px-3 pb-4 bg-gradient-to-b from-white via-slate-50 to-indigo-50/30 backdrop-blur-md shadow-2xl rounded-r-3xl border-r border-slate-200/50">
              {/* Header de la cortina */}
              <div className="sticky top-0 z-10 -mx-3 px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-slate-100 rounded-tr-3xl mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-content-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800">Base de Datos</div>
                    <div className="text-[9px] text-slate-400">Panel de control</div>
                  </div>
                </div>
              </div>

              {/* Canales de Venta */}
              <div className="mb-3">
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  <Store className="h-3 w-3 text-indigo-500" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Canales</span>
                  <span className="ml-auto text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Misma BD</span>
                </div>
                <div className="space-y-2">
                  {/* Tienda Física (POS) */}
                  <button
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-all duration-200 group border ${channel === 'tienda' ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30'}`}
                    onClick={() => setChannel('tienda')}
                  >
                    <div className={`grid h-8 w-8 shrink-0 place-content-center rounded-lg transition-all ${channel === 'tienda' ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
                      <Store size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${channel === 'tienda' ? 'text-emerald-700' : 'text-slate-700'}`}>Tienda POS</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${channel === 'tienda' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                          {tiendaCount}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400 truncate mt-0.5">Tienda física</div>
                    </div>
                    {channel === 'tienda'
                      ? <span className="text-[8px] font-black uppercase text-emerald-600">●</span>
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />}
                  </button>

                  {/* Temporales Appwrite */}
                  {appwriteTempCount > 0 && (
                    <button
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-all duration-200 group border ${channel === 'appwrite' ? 'bg-pink-50 border-pink-300 shadow-sm' : 'bg-white border-slate-200 hover:border-pink-200 hover:bg-pink-50/30'}`}
                      onClick={() => setChannel('appwrite')}
                    >
                      <div className={`grid h-8 w-8 shrink-0 place-content-center rounded-lg transition-all ${channel === 'appwrite' ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white' : 'bg-pink-50 text-pink-600'}`}>
                        <Package size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${channel === 'appwrite' ? 'text-pink-700' : 'text-slate-700'}`}>Temporales</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${channel === 'appwrite' ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-700'}`}>
                            {appwriteTempCount}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 truncate mt-0.5">Stock ilimitado</div>
                      </div>
                      {channel === 'appwrite'
                        ? <span className="text-[8px] font-black uppercase text-pink-600">●</span>
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Resumen compacto */}
              <div className="mb-3 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-sm">
                <div className="mb-2 flex items-center gap-1.5 px-0.5">
                  <BarChart2 className="h-3 w-3 text-slate-500" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Resumen</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Total', val: prodRows.length || 0, color: '#8b5cf6' },
                    { label: 'Con costo', val: generalCosts.filter(r => Math.round(r.costo_uni) > 0).length, color: '#10b981' },
                    { label: 'Sin costo', val: generalCosts.filter(r => Math.round(r.costo_uni) <= 0).length, color: '#f43f5e' },
                  ].map((s, i) => (
                    <div key={i} className="rounded-lg px-1.5 py-1.5 text-center" style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
                      <div className="text-sm font-black" style={{ color: s.color, lineHeight: 1 }}>{s.val.toLocaleString()}</div>
                      <div className="text-[8px] font-bold mt-0.5" style={{ color: `${s.color}cc` }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sucursales */}
              <div className="mb-3">
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  <Building2 className="h-3 w-3 text-indigo-500" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Sucursales</span>
                  <span className="ml-auto text-[8px] font-bold text-slate-400">{activeBranches.length} activas</span>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white overflow-hidden shadow-sm">
                  {activeBranches.map((branch, idx) => (
                    <button
                      key={branch.slug}
                      onClick={() => setSede(branch.slug as SedeSlug)}
                      className={`group flex items-center gap-2.5 px-2.5 py-2 text-left transition w-full ${sede === branch.slug ? 'bg-emerald-50/60' : 'hover:bg-slate-50'} ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                    >
                      <div className="grid h-7 w-7 shrink-0 place-content-center rounded-lg border border-sky-100 bg-sky-50 text-sm">{branch.icon || '🏬'}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-slate-700">{branch.name}</div>
                      </div>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Distribución por canal */}
              <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-1.5 px-0.5">
                  <BarChart2 className="h-3 w-3 text-slate-500" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Distribución</span>
                </div>
                {[
                  { label: 'Solo Web', val: prodRows.filter(r => r.web_only).length, color: '#0ea5e9' },
                  { label: 'POS + Web', val: prodRows.filter(r => !r.web_only && r.show_in_web).length, color: '#8b5cf6' },
                  { label: 'Solo POS', val: prodRows.filter(r => !r.web_only && !r.show_in_web).length, color: '#10b981' },
                ].map((item) => {
                  const pct = prodRows.length ? Math.round((item.val / prodRows.length) * 100) : 0;
                  return (
                    <div key={item.label} className="mb-2 flex items-center gap-2 last:mb-0">
                      <span className="w-8 shrink-0 text-[9px] font-bold" style={{ color: item.color }}>{item.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: item.color }} />
                      </div>
                      <span className="w-14 text-right text-[9px] font-bold text-slate-500">{item.val} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>}

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-indigo-50/30 px-3 sm:px-5 py-3 sm:py-4">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="h-14 w-14 sm:h-20 sm:w-20 shrink-0 overflow-hidden">
                    <img
                      src={currentViewImage.src}
                      alt={currentViewImage.alt}
                      className="h-14 w-14 sm:h-20 sm:w-20 object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate">{currentView?.label || 'Costo General'}</h2>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-slate-400 hidden sm:block">{isWebProductsView ? 'Catálogo web exclusivo · estos productos no aparecen en el POS' : 'Base central compartida por todas las sucursales'}</p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${isWebProductsView ? 'border-sky-200 bg-sky-50 text-sky-700' : channel === 'appwrite' ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {isWebProductsView ? 'Solo Web' : channel === 'appwrite' ? 'Temporales' : 'POS general'}
                      </span>
                      <span className="text-[9px] text-slate-400">{filteredProdRows.length} productos</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {[
                    { label: isWebProductsView ? 'Web' : 'Total', val: isWebProductsView ? prodRows.filter(r => r.web_only).length : prodRows.length, color: '#64748b' },
                    { label: 'Con costo', val: isWebProductsView ? prodRows.filter(r => r.web_only && Math.round(r.costo_uni) > 0).length : generalCosts.filter(r => Math.round(r.costo_uni) > 0).length, color: '#10b981' },
                    { label: 'Sin costo', val: isWebProductsView ? prodRows.filter(r => r.web_only && Math.round(r.costo_uni) <= 0).length : generalCosts.filter(r => Math.round(r.costo_uni) <= 0).length, color: '#f43f5e' },
                  ].map((item) => (
                    <span key={item.label} className="rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-extrabold" style={{ background: `${item.color}15`, color: item.color, border: `1.5px solid ${item.color}30` }}>
                      {item.val.toLocaleString()} <span className="hidden sm:inline">{item.label}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Selector móvil de Canales (visible solo cuando la barra lateral está oculta < lg) */}
              {!isWebProductsView && <div className="lg:hidden flex items-center gap-1.5 px-3 sm:px-5 py-2 bg-slate-50 border-b border-slate-200/80 overflow-x-auto [scrollbar-width:none]">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Canal:</span>
                <button
                  onClick={() => setChannel('tienda')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 shrink-0 ${
                    channel === 'tienda'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <Store size={12} />
                  <span>Tienda POS</span>
                  <span className={`text-[10px] font-black px-1 rounded-full ${channel === 'tienda' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    {tiendaCount}
                  </span>
                </button>
                {appwriteTempCount > 0 && (
                  <button
                    onClick={() => setChannel('appwrite')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 shrink-0 ${
                      channel === 'appwrite'
                        ? 'bg-pink-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    <Package size={12} />
                    <span>Temporales</span>
                    <span className={`text-[10px] font-black px-1 rounded-full ${channel === 'appwrite' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700'}`}>
                      {appwriteTempCount}
                    </span>
                  </button>
                )}
              </div>}

              {/* Barra de Acciones desplazable horizontalmente en móvil */}
              <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-100 bg-slate-50/50 px-3 sm:px-5 py-2 sm:py-2.5 overflow-x-auto [scrollbar-width:none] flex-nowrap">
                <span className="hidden sm:inline mr-1 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 shrink-0">Acciones</span>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap shrink-0">
                  {/* Acciones generales solo en la vista completa */}
                  {!currentView && appwriteTempCount > 0 && (
                    <button
                      onClick={handlePurgeAppwriteProducts}
                      disabled={loading}
                      className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200 hover:bg-rose-100 transition shadow-sm disabled:opacity-50 shrink-0 whitespace-nowrap"
                      title="Eliminar todos los productos temporales de Appwrite en 1 solo clic"
                    >
                      <Trash2 size={13} /> <span>Purgar</span> ({appwriteTempCount})
                    </button>
                  )}
                  {!currentView && <button
                    onClick={exportToExcel}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition shadow-sm shrink-0 whitespace-nowrap"
                    title="Descargar inventario en Excel con columna de Canal"
                  >
                    <Download size={13} /> <span>Excel</span>
                  </button>}
                  {(!currentView || (embedded && currentView.value === 'inventario')) && tab !== 'nuevo' && (
                    <button
                      type="button"
                      onClick={() => setShowRecentPriceLabels(true)}
                      disabled={loading || recentPriceLabelProducts.length === 0}
                      title="Elegir productos recientes y descargar sus etiquetas de precios en PDF"
                      className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                    >
                      <Printer size={14} /> <span>Etiquetas PDF</span>
                    </button>
                  )}
                  {embedded && ['inventario', 'productos-web'].includes(currentView?.value || '') && tab === 'nuevo' && <button
                    onClick={() => setTab(returnToListTab)}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-200 hover:bg-slate-50 transition shrink-0 whitespace-nowrap"
                  >
                    {isWebProductsView ? 'Volver a productos web' : 'Volver a inventario'}
                  </button>}
                  {!currentView && <button
                    onClick={bulkSyncDisponiblePorStock}
                    disabled={loading}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200 hover:bg-amber-100 transition shadow-sm disabled:opacity-50 shrink-0 whitespace-nowrap"
                    title="Marcar productos con stock como disponibles en tienda y sin stock como no disponibles"
                  >
                    <Check size={13} /> <span>Sync Disponible</span>
                  </button>}
                  {!currentView && <button
                    onClick={() => setTab('monitoreo')}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 text-xs font-bold border border-violet-200 hover:bg-violet-100 transition shadow-sm shrink-0 whitespace-nowrap"
                    title="Ver auditoría y monitoreo de stock"
                  >
                    <History size={13} /> <span>Monitoreo</span>
                  </button>}
                  <button
                    onClick={() => {
                      clearPosProductsCache({ onlyWorkspace: isIndependentWeb });
                      loadAppwriteProducts(true);
                      if (!embedded || currentView?.value === 'pendientes') loadPendingItems(true);
                      if (tab === 'monitoreo') loadMovements(true);
                    }}
                    className={`flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition shrink-0 whitespace-nowrap ${embedded ? 'border border-sky-200 bg-sky-50 text-sky-800 shadow-sm hover:border-sky-300 hover:bg-sky-100' : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'}`}
                    title="Limpiar caché y recargar desde Firebase"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> <span>Actualizar</span>
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                {/* Barra de búsqueda y Tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                  <div className="relative flex-1 w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="search"
                      inputMode="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nombre, SKU, código de barra, categoría..."
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition shadow-sm"
                    />
                  </div>

                  {embedded && ['inventario', 'productos-web'].includes(currentView?.value || '') && tab !== 'nuevo' && (
                    <button
                      type="button"
                      onClick={() => { setEditingSku(null); resetNewProduct(); setTab('nuevo'); }}
                      title={isWebProductsView ? 'Crear un producto exclusivo para la web' : 'Crear producto desde Inventario'}
                      className={`group inline-flex min-h-12 w-full shrink-0 items-center justify-between gap-4 rounded-xl border bg-gradient-to-b from-white px-3.5 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 sm:w-auto sm:min-w-[205px] ${isWebProductsView ? 'border-sky-200 to-sky-50 text-sky-900 hover:border-sky-300 hover:to-sky-100 hover:shadow-[0_5px_14px_rgba(14,165,233,0.16)] focus-visible:ring-sky-100' : 'border-emerald-200 to-emerald-50 text-emerald-900 hover:border-emerald-300 hover:to-emerald-100 hover:shadow-[0_5px_14px_rgba(16,185,129,0.16)] focus-visible:ring-emerald-100'}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`grid h-9 w-9 place-items-center rounded-lg ring-1 transition ${isWebProductsView ? 'bg-sky-100 text-sky-700 ring-sky-200/80 group-hover:bg-sky-200' : 'bg-emerald-100 text-emerald-700 ring-emerald-200/80 group-hover:bg-emerald-200'}`}>
                          <Plus size={18} strokeWidth={2.5} />
                        </span>
                        <span>
                          <span className="block text-sm font-extrabold leading-tight">{isWebProductsView ? 'Crear producto web' : 'Crear producto'}</span>
                          <span className={`mt-0.5 block text-[10px] font-medium ${isWebProductsView ? 'text-sky-700/75' : 'text-emerald-700/75'}`}>{isWebProductsView ? 'Exclusivo para la tienda web' : 'Añadir al inventario'}</span>
                        </span>
                      </span>
                      <ChevronRight size={16} className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${isWebProductsView ? 'text-sky-600' : 'text-emerald-600'}`} />
                    </button>
                  )}

                  {currentView ? (!embedded && (
                    <nav aria-label="Secciones de productos" className="flex w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 [scrollbar-width:none] sm:w-auto">
                      {BASE_DATOS_VIEWS.map(view => (
                        <Link key={view.value} href={`/erp-dashboard/base-datos?vista=${view.value}`} onClick={() => setTab(view.tab)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-3.5 ${currentView.value === view.value ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                          {view.label}
                        </Link>
                      ))}
                    </nav>
                  )) : (
                  /* Pestañas internas de la vista completa */
                  <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 overflow-x-auto [scrollbar-width:none] flex-nowrap">
                    <button
                      onClick={() => setTab('maestro')}
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition whitespace-nowrap shrink-0 ${tab === 'maestro' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'}`}
                    >
                      <DollarSign size={13} /> Costos
                      <span className={`ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${tab === 'maestro' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'}`}>
                        {filteredProdRows.filter(r => Math.round(r.costo_uni || 0) <= 0).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setTab('precios')}
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition whitespace-nowrap shrink-0 ${tab === 'precios' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'}`}
                    >
                      <DollarSign size={13} /> Precios
                      <span className={`ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${tab === 'precios' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'}`}>
                        {filteredPriceRows.filter(r => Math.round(r.precio_detalle || 0) <= 0 && Math.round(r.precio_mayorista || 0) <= 0).length}
                      </span>
                    </button>
                    <button
                      onClick={() => { setTab('stock'); }}
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition whitespace-nowrap shrink-0 ${tab === 'stock' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'}`}
                    >
                      <Boxes size={13} /> Stock
                      <span className={`ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${tab === 'stock' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'}`}>
                        {filteredStockRows.filter(r => Math.round(Number(r.stock || 0)) <= 0).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setTab('pendiente')}
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition whitespace-nowrap shrink-0 ${tab === 'pendiente' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'}`}
                    >
                      <AlertCircle size={13} /> Pendiente
                      <span className={`ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${tab === 'pendiente' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'}`}>
                        {pendingItems.length}
                      </span>
                    </button>
                    <button
                      onClick={() => setTab('monitoreo')}
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition whitespace-nowrap shrink-0 ${tab === 'monitoreo' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'}`}
                    >
                      <History size={13} /> Monitoreo
                      {movements.length > 0 && (
                        <span className={`ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${tab === 'monitoreo' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-600'}`}>
                          {movements.length}
                        </span>
                      )}
                    </button>
                    {sortField && (
                      <button
                        onClick={() => { setSortField(null); setSortDir('desc') }}
                        className="inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-md transition whitespace-nowrap shrink-0"
                        title="Quitar ordenamiento"
                      >
                        <RefreshCw size={13} /> Reset
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingSku(null); resetNewProduct(); setTab('nuevo'); }}
                      className={`inline-flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition whitespace-nowrap shrink-0 ml-auto ${tab === 'nuevo' ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                    >
                      <Plus size={15} /> Crear
                    </button>
                  </div>
                  )}
                </div>

                {/* Filtro por estado: Todos / Activos / Borradores */}
                {!currentView && <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado:</span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('todos')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${statusFilter === 'todos' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                  >
                    Todos ({prodRows.filter(p => channel === 'appwrite' ? isAppwriteProduct(p) : !isAppwriteProduct(p)).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('activos')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${statusFilter === 'activos' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'}`}
                  >
                    Activos ({prodRows.filter(p => (channel === 'appwrite' ? isAppwriteProduct(p) : !isAppwriteProduct(p)) && !p.is_draft && p.status !== 'draft' && Number(p.precio_venta_1 || 0) > 0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('borradores')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${statusFilter === 'borradores' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50'}`}
                  >
                    📝 Borradores ({prodRows.filter(p => (channel === 'appwrite' ? isAppwriteProduct(p) : !isAppwriteProduct(p)) && Boolean(p.is_draft || p.status === 'draft' || Number(p.precio_venta_1 || 0) <= 0)).length})
                  </button>
                </div>}

                {message && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-900 text-xs font-semibold flex items-center justify-between">
                    <span>{message}</span>
                    <button onClick={() => setMessage('')} className="text-slate-400 hover:text-slate-600 text-xs ml-2">✕</button>
                  </div>
                )}

                {/* Control superior de paginación */}
                {['maestro', 'precios', 'stock'].includes(tab) && renderPaginationControls()}

                {tab === 'maestro' && (
                  <>
                  {/* Versión mobile: tarjetas */}
                  <div className="sm:hidden space-y-3">
                    {filteredProdRows.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                        <p className="font-semibold">No se encontraron productos</p>
                        {search && <p className="text-[11px] mt-1">Intenta con otro término</p>}
                      </div>
                    ) : (
                      paginatedProdRows.map((r) => {
                        const isAppwrite = isAppwriteProduct(r);
                        const isUnlimited = Number(r.stock || 0) >= 99999 || r.ilimitado || isAppwrite;
                        return (
                          <div key={r.rowId || r.sku} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-start gap-3 p-3">
                              {r.imageUrl ? (
                                <button onClick={() => setImageModal(r.imageUrl || null)} className="h-16 w-16 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm cursor-zoom-in">
                                  <StoreImage src={r.imageUrl} alt={r.nombre} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                </button>
                              ) : (
                                <div className="h-16 w-16 rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                                  <Package size={22} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-800 text-sm leading-tight truncate">{r.nombre}</div>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-[11px] text-indigo-500 font-bold">{r.sku}</span>
                                  {r.isAutoSku && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">AUTO</span>}
                                  {isAppwrite && <span className="text-[9px] font-bold text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded">TEMP</span>}
                                  {(r.is_draft || r.status === 'draft' || Number(r.precio_venta_1 || 0) <= 0) && (
                                    <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded tracking-wide">BORRADOR</span>
                                  )}
                                </div>
                                {r.categoria && (
                                  <span className="mt-1.5 inline-block rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">{r.categoria}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50/70 border-t border-slate-100">
                              <div className="flex items-center gap-3">
                                <div>
                                  <div className="text-[9px] font-bold uppercase text-slate-400">Costo</div>
                                  {Math.round(r.costo_uni || 0) > 0 ? (
                                    <span className="text-sm font-bold text-emerald-700">${(r.costo_uni || 0).toLocaleString()}</span>
                                  ) : (
                                    <span className="text-sm font-bold text-rose-600">$0</span>
                                  )}
                                </div>
                                <div>
                                  <div className="text-[9px] font-bold uppercase text-slate-400">{isWebProductsView ? 'Precio web' : 'P. menor'}</div>
                                  {(() => {
                                    const menor = precioMasBajo(r);
                                    if (menor <= 0) return <span className="text-sm font-bold text-slate-400">—</span>;
                                    const pierde = Math.round(r.costo_uni || 0) > 0 && Math.round(r.costo_uni || 0) >= menor;
                                    return <span className={`text-sm font-bold ${pierde ? 'text-rose-600' : 'text-emerald-700'}`}>${menor.toLocaleString()}</span>;
                                  })()}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openAddStockModal(r, r, r.rowId || r.sku)}
                                  className="px-2 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1"
                                  title="Añadir stock"
                                >
                                  <Plus size={13} /> Stock
                                </button>
                                <button onClick={() => editProduct(r)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => deleteProducto(r.sku)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Versión desktop: tabla */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 -mx-1 sm:mx-0">
                    <table className="w-full min-w-[760px] text-left text-base">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200 sticky top-0">
                        <tr className="text-xs tracking-wider">
                          <th className="p-4 text-center w-20">Foto</th>
                          <th className="p-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('nombre')}>Producto {sortField === 'nombre' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('categoria')}>Categoría {sortField === 'categoria' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-right cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('costo')}>Costo {sortField === 'costo' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-right cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('precio_menor')}>{isWebProductsView ? 'Precio Web' : 'P. Menor'} {sortField === 'precio_menor' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-center w-28">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredProdRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400">
                              <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                              <p className="font-semibold">No se encontraron productos</p>
                              {search && <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>}
                            </td>
                          </tr>
                        ) : (
                          paginatedProdRows.map((r) => {
                            const isAppwrite = isAppwriteProduct(r);
                            const stockNum = Number(r.stock || 0);
                            return (
                              <tr key={r.rowId || r.sku} className="hover:bg-slate-50/70 transition-colors">
                                {/* Foto */}
                                <td className="p-4 text-center">
                                  {r.imageUrl ? (
                                    <button onClick={() => setImageModal(r.imageUrl || null)} className="h-20 w-20 mx-auto rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm hover:ring-2 hover:ring-indigo-400 transition cursor-zoom-in block">
                                      <StoreImage src={r.imageUrl} alt={r.nombre} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                    </button>
                                  ) : (
                                    <div className="h-20 w-20 mx-auto rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                                      <Package size={28} />
                                    </div>
                                  )}
                                </td>
                                {/* Producto: nombre + SKU + código barra + badges */}
                                <td className="p-4">
                                  <div className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="font-bold text-slate-800 text-base leading-tight">{r.nombre}</div>
                                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono text-xs text-indigo-500 font-bold">{r.sku}</span>
                                      {r.isAutoSku && (
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">AUTO</span>
                                      )}
                                      {isAppwrite && (
                                        <span className="text-[10px] font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded">TEMP</span>
                                      )}
                                      {(r.is_draft || r.status === 'draft' || Number(r.precio_venta_1 || 0) <= 0) && (
                                        <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded tracking-wide">BORRADOR</span>
                                      )}
                                      {r.codigo_barra && (
                                        <span className="font-mono text-[11px] text-slate-400">{r.codigo_barra}</span>
                                      )}
                                      {r.box_code && (
                                        <span className="font-mono text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">Cód: {r.box_code}</span>
                                      )}
                                      {r.proveedor && (
                                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{r.proveedor}</span>
                                      )}
                                      {r.cantidad_embalaje && (
                                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Emb: {r.cantidad_embalaje}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                {/* Categoría */}
                                <td className="p-4">
                                  {r.categoria ? (
                                    <span className="inline-block rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 font-medium">{r.categoria}</span>
                                  ) : (
                                    <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">—</span>
                                  )}
                                </td>
                                {/* Costo */}
                                <td className="p-4 text-right">
                                  {Math.round(r.costo_uni || 0) > 0 ? (
                                    <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-base font-bold text-emerald-700">${(r.costo_uni || 0).toLocaleString()}</span>
                                  ) : (
                                    <span className="inline-block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-base font-bold text-rose-600">$0</span>
                                  )}
                                </td>
                                {/* Precio menor (el más bajo de los 3 precios) */}
                                <td className="p-4 text-right">
                                  {(() => {
                                    const menor = precioMasBajo(r);
                                    const costo = Math.round(r.costo_uni || 0);
                                    if (menor <= 0) {
                                      return <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base font-bold text-slate-400">—</span>;
                                    }
                                    const pierde = costo > 0 && costo >= menor;
                                    return (
                                      <span className={`inline-block rounded-lg border px-3 py-2 text-base font-bold ${pierde ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                                        ${menor.toLocaleString()}
                                        {pierde && <span className="block text-[10px] font-bold text-rose-500 mt-0.5">{'⚠ Costo >= precio'}</span>}
                                      </span>
                                    );
                                  })()}
                                </td>
                                {/* Acciones */}
                                <td className="p-4 text-center">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      onClick={() => openAddStockModal(r, r, r.rowId || r.sku)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                                      title="Añadir stock"
                                    >
                                      <Plus size={14} /> Stock
                                    </button>
                                    <button onClick={() => editProduct(r)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar producto">
                                      <Edit2 size={18} />
                                    </button>
                                    <button onClick={() => deleteProducto(r.sku)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar producto">
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}

                {tab === 'precios' && (
                  <>
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <div className="text-xs font-semibold text-slate-500">
                      Edita precios con <span className="font-extrabold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Enter</span>. El POS solo mostrará a los cajeros los precios con valor mayor a $0.
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAllPriceColumns(!showAllPriceColumns)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                        showAllPriceColumns
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {showAllPriceColumns ? '▲ Ocultar columnas P5 a P10' : '⚙️ Mostrar columnas P5 a P10'}
                    </button>
                  </div>

                  {/* Versión mobile: tarjetas con inputs */}
                  <div className="sm:hidden space-y-3">
                    {filteredPriceRows.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                        <p className="font-semibold">No se encontraron productos</p>
                      </div>
                    ) : (
                      paginatedPriceRows.map((r) => {
                        const prod = prodRows.find(p => p.sku === r.sku);
                        const docId = (r as any).rowId || prod?.rowId || r.sku;
                        return (
                          <div key={r.sku} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-start gap-3 p-3">
                              {prod?.imageUrl ? (
                                <button onClick={() => setImageModal(prod.imageUrl!)} className="h-14 w-14 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm cursor-zoom-in">
                                  <StoreImage src={prod.imageUrl} alt={prod.nombre} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                </button>
                              ) : (
                                <div className="h-14 w-14 rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                                  <Package size={20} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-800 text-sm leading-tight truncate">{prod?.nombre || '—'}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[11px] text-indigo-500 font-bold">{r.sku}</span>
                                  {(prod?.is_draft || prod?.status === 'draft' || Number(prod?.precio_venta_1 || 0) <= 0) && (
                                    <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded">BORRADOR</span>
                                  )}
                                  {prod && (
                                    <button
                                      type="button"
                                      onClick={() => editProduct(prod)}
                                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors ml-auto"
                                      title="Editar producto"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 pb-3">
                              {[
                                { key: 'precio_detalle', val: r.precio_detalle, label: 'Efectivo', color: 'emerald', field: 'precio_venta_1' },
                                { key: 'precio_mayorista', val: r.precio_mayorista, label: 'Embalaje', color: 'indigo', field: 'precio_venta_2' },
                                { key: 'precio_segundo', val: r.precio_segundo, label: 'Embalaje 2', color: 'purple', field: 'precio_venta_3' },
                                { key: 'precio_cuarto', val: r.precio_cuarto, label: 'P4 Especial', color: 'orange', field: 'precio_venta_4' },
                                ...(showAllPriceColumns ? [
                                  { key: 'precio_5', val: (r as any).precio_5 || 0, label: 'P5', color: 'slate', field: 'precio_venta_5' },
                                  { key: 'precio_6', val: (r as any).precio_6 || 0, label: 'P6', color: 'slate', field: 'precio_venta_6' },
                                  { key: 'precio_7', val: (r as any).precio_7 || 0, label: 'P7', color: 'slate', field: 'precio_venta_7' },
                                  { key: 'precio_8', val: (r as any).precio_8 || 0, label: 'P8', color: 'slate', field: 'precio_venta_8' },
                                  { key: 'precio_9', val: (r as any).precio_9 || 0, label: 'P9', color: 'slate', field: 'precio_venta_9' },
                                  { key: 'precio_10', val: (r as any).precio_10 || 0, label: 'P10', color: 'slate', field: 'precio_venta_10' },
                                ] : []),
                              ].map(p => (
                                <div key={p.key}>
                                  <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">{p.label}</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    defaultValue={p.val}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const val = parseMoney((e.target as HTMLInputElement).value);
                                      await updateFirebaseErpProduct(docId, { [p.field]: val });
                                      setPriceRows(list => list.map(x => x.sku === r.sku ? { ...x, [p.key]: val } : x));
                                      setProdRows(list => list.map(x => x.sku === r.sku ? { ...x, [p.field]: val } : x));
                                      setMessage(`✅ ${p.label} actualizado: $${val.toLocaleString()}`);
                                      (e.target as HTMLInputElement).blur();
                                    }}
                                    className={`w-full px-2 py-2 border rounded-lg text-right font-bold text-sm bg-white focus:outline-none focus:ring-2 ${
                                      p.color === 'emerald' ? 'border-emerald-300 text-emerald-800 focus:ring-emerald-500' :
                                      p.color === 'indigo' ? 'border-indigo-300 text-indigo-800 focus:ring-indigo-500' :
                                      p.color === 'orange' ? 'border-orange-300 text-orange-800 focus:ring-orange-500' :
                                      p.color === 'purple' ? 'border-purple-300 text-purple-800 focus:ring-purple-500' :
                                      'border-slate-300 text-slate-800 focus:ring-indigo-400'
                                    }`}
                                  />
                                  {p.key === 'precio_mayorista' && (prod?.label_p2 || r.label_p2) && (
                                    <span className="block text-[9px] font-bold text-indigo-600 truncate mt-0.5">🏷️ {prod?.label_p2 || r.label_p2}</span>
                                  )}
                                  {p.key === 'precio_segundo' && (prod?.label_p3 || r.label_p3) && (
                                    <span className="block text-[9px] font-bold text-purple-600 truncate mt-0.5">🏷️ {prod?.label_p3 || r.label_p3}</span>
                                  )}
                                  {p.key === 'precio_cuarto' && (prod?.label_p4 || r.label_p4) && (
                                    <span className="block text-[9px] font-bold text-orange-600 truncate mt-0.5">🏷️ {prod?.label_p4 || r.label_p4}</span>
                                  )}
                                  {p.key.startsWith('precio_') && !['precio_detalle', 'precio_mayorista', 'precio_segundo', 'precio_cuarto'].includes(p.key) && (
                                    (() => {
                                      const num = p.key.replace('precio_', '');
                                      const tag = (prod as any)?.[`label_p${num}`] || (r as any)?.[`label_p${num}`];
                                      return tag ? <span className="block text-[9px] font-bold text-slate-600 truncate mt-0.5">🏷️ {tag}</span> : null;
                                    })()
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Versión desktop: tabla */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 -mx-1 sm:mx-0">
                    <table className="w-full min-w-[920px] text-left text-base">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200 sticky top-0">
                        <tr className="text-xs tracking-wider">
                          <th className="p-4 text-center w-20">Foto</th>
                          <th className="p-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('sku')}>SKU {sortField === 'sku' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('nombre')}>Nombre {sortField === 'nombre' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-right cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('p1')}>P1 Efectivo {sortField === 'p1' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-right cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('p2')}>P2 Embalaje {sortField === 'p2' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-right cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('p3')}>P3 Embalaje 2 {sortField === 'p3' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 text-right cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('p4')}>P4 Especial {sortField === 'p4' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          {showAllPriceColumns && (
                            <>
                              <th className="p-4 text-right text-slate-600">P5</th>
                              <th className="p-4 text-right text-slate-600">P6</th>
                              <th className="p-4 text-right text-slate-600">P7</th>
                              <th className="p-4 text-right text-slate-600">P8</th>
                              <th className="p-4 text-right text-slate-600">P9</th>
                              <th className="p-4 text-right text-slate-600">P10</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredPriceRows.length === 0 ? (
                          <tr>
                            <td colSpan={showAllPriceColumns ? 13 : 7} className="py-12 text-center text-slate-400">
                              <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                              <p className="font-semibold">No se encontraron productos</p>
                            </td>
                          </tr>
                        ) : (
                          paginatedPriceRows.map((r) => {
                            const prod = prodRows.find(p => p.sku === r.sku);
                            const docId = (r as any).rowId || prod?.rowId || r.sku;
                            return (
                              <tr key={r.sku} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-center">
                                  {prod?.imageUrl ? (
                                    <button onClick={() => setImageModal(prod.imageUrl!)} className="h-20 w-20 mx-auto rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm hover:ring-2 hover:ring-indigo-400 transition cursor-zoom-in block">
                                      <StoreImage src={prod.imageUrl} alt={prod.nombre} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                    </button>
                                  ) : (
                                    <div className="h-20 w-20 mx-auto rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                                      <Package size={28} />
                                    </div>
                                  )}
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold text-indigo-600 text-sm">{r.sku}</span>
                                    {(prod?.is_draft || prod?.status === 'draft' || Number(prod?.precio_venta_1 || 0) <= 0) && (
                                      <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded tracking-wide">BORRADOR</span>
                                    )}
                                    {prod && (
                                      <button
                                        type="button"
                                        onClick={() => editProduct(prod)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Editar producto completo (incluye etiquetas POS)"
                                      >
                                        <Edit2 size={15} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="font-bold text-slate-800 text-base">{prod?.nombre || '—'}</div>
                                  </div>
                                </td>
                                <td className="p-4 text-right">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    defaultValue={r.precio_detalle}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const val = parseMoney((e.target as HTMLInputElement).value);
                                      await updateFirebaseErpProduct(docId, { precio_venta_1: val });
                                      setPriceRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_detalle: val } : x));
                                      setProdRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_venta_1: val } : x));
                                      setMessage(`✅ Efectivo actualizado para ${r.sku}: $${val.toLocaleString()}`);
                                      (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-28 px-3 py-2 border border-emerald-300 rounded-lg text-right font-bold text-emerald-800 bg-emerald-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-base"
                                  />
                                </td>
                                <td className="p-4 text-right">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    defaultValue={r.precio_mayorista}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const val = parseMoney((e.target as HTMLInputElement).value);
                                      await updateFirebaseErpProduct(docId, { precio_venta_2: val });
                                      setPriceRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_mayorista: val } : x));
                                      setProdRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_venta_2: val } : x));
                                      setMessage(`✅ Embalaje actualizado para ${r.sku}: $${val.toLocaleString()}`);
                                      (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-28 px-3 py-2 border border-indigo-300 rounded-lg text-right font-bold text-indigo-800 bg-indigo-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
                                  />
                                  {(prod?.label_p2 || r.label_p2) && (
                                    <div className="mt-1 text-[10px] font-bold text-indigo-600 truncate max-w-[120px] ml-auto">
                                      🏷️ {prod?.label_p2 || r.label_p2}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 text-right">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    defaultValue={r.precio_segundo || 0}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const val = parseMoney((e.target as HTMLInputElement).value);
                                      await updateFirebaseErpProduct(docId, { precio_venta_3: val });
                                      setPriceRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_segundo: val } : x));
                                      setProdRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_venta_3: val } : x));
                                      setMessage(`✅ Embalaje 2 actualizado para ${r.sku}: $${val.toLocaleString()}`);
                                      (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-28 px-3 py-2 border border-purple-300 rounded-lg text-right font-bold text-purple-800 bg-purple-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-base"
                                  />
                                  {(prod?.label_p3 || r.label_p3) && (
                                    <div className="mt-1 text-[10px] font-bold text-purple-600 truncate max-w-[120px] ml-auto">
                                      🏷️ {prod?.label_p3 || r.label_p3}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 text-right">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    defaultValue={r.precio_cuarto || 0}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const val = parseMoney((e.target as HTMLInputElement).value);
                                      await updateFirebaseErpProduct(docId, { precio_venta_4: val });
                                      setPriceRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_cuarto: val } : x));
                                      setProdRows(list => list.map(x => x.sku === r.sku ? { ...x, precio_venta_4: val } : x));
                                      setMessage(`✅ Precio especial actualizado para ${r.sku}: $${val.toLocaleString()}`);
                                      (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-28 px-3 py-2 border border-orange-300 rounded-lg text-right font-bold text-orange-800 bg-orange-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-base"
                                  />
                                  {(prod?.label_p4 || r.label_p4) && (
                                    <div className="mt-1 text-[10px] font-bold text-orange-600 truncate max-w-[120px] ml-auto">
                                      🏷️ {prod?.label_p4 || r.label_p4}
                                    </div>
                                  )}
                                </td>
                                {showAllPriceColumns && [5, 6, 7, 8, 9, 10].map(num => {
                                  const priceKey = `precio_${num}`;
                                  const fieldKey = `precio_venta_${num}`;
                                  const labelKey = `label_p${num}`;
                                  const val = Number((r as any)[priceKey] || (prod as any)?.[fieldKey] || 0);
                                  const tag = (prod as any)?.[labelKey] || (r as any)?.[labelKey];
                                  return (
                                    <td key={num} className="p-4 text-right">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        defaultValue={val}
                                        onKeyDown={async (e) => {
                                          if (e.key !== 'Enter') return;
                                          const newVal = parseMoney((e.target as HTMLInputElement).value);
                                          await updateFirebaseErpProduct(docId, { [fieldKey]: newVal });
                                          setPriceRows(list => list.map(x => x.sku === r.sku ? { ...x, [priceKey]: newVal } : x));
                                          setProdRows(list => list.map(x => x.sku === r.sku ? { ...x, [fieldKey]: newVal } : x));
                                          setMessage(`✅ P${num} actualizado para ${r.sku}: $${newVal.toLocaleString()}`);
                                          (e.target as HTMLInputElement).blur();
                                        }}
                                        className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-right font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
                                      />
                                      {tag && (
                                        <div className="mt-1 text-[10px] font-bold text-slate-500 truncate max-w-[120px] ml-auto">
                                          🏷️ {tag}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}

                {tab === 'stock' && (
                  <>
                  {/* Versión mobile: tarjetas */}
                  <div className="sm:hidden space-y-3">
                    {filteredStockRows.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                        <p className="font-semibold">No se encontraron productos</p>
                      </div>
                    ) : (
                      paginatedStockRows.map((r) => {
                        const prod = prodRows.find(p => p.sku === r.sku);
                        const docId = (r as any).rowId || prod?.rowId || r.sku;
                        const isUnlimited = r.ilimitado || Number(r.stock) >= 99999 || prod?.origen === 'appwrite' || String(prod?.rowId || '').startsWith('aw_');
                        return (
                          <div key={r.sku} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-start gap-3 p-3">
                              {prod?.imageUrl ? (
                                <button onClick={() => setImageModal(prod.imageUrl!)} className="h-14 w-14 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm cursor-zoom-in">
                                  <StoreImage src={prod.imageUrl} alt={prod.nombre} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                </button>
                              ) : (
                                <div className="h-14 w-14 rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                                  <Package size={20} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-800 text-sm leading-tight truncate">{prod?.nombre || '—'}</div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="font-mono text-[11px] text-indigo-500 font-bold">{r.sku}</span>
                                  {(prod?.is_draft || prod?.status === 'draft' || Number(prod?.precio_venta_1 || 0) <= 0) && (
                                    <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded">BORRADOR</span>
                                  )}
                                  {isAppwriteProduct(prod) && (
                                    <span className="text-[9px] font-bold text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded">TEMP</span>
                                  )}
                                </div>
                                {prod?.categoria && (
                                  <div className="mt-1">
                                    <span className="inline-block rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">{prod.categoria}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="px-3 pb-3">
                              <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Stock actual</label>
                              {isUnlimited ? (
                                <span className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-bold bg-purple-100 text-purple-800 border border-purple-200 w-full justify-center">
                                  ♾️ Ilimitado
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    defaultValue={r.stock}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const val = Number((e.target as HTMLInputElement).value) || 0;
                                      await saveStockDirect(docId, r.sku, val);
                                      (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-center font-bold text-base bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <button
                                    onClick={async (e) => {
                                      const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement);
                                      const val = Number(input?.value) || 0;
                                      await saveStockDirect(docId, r.sku, val);
                                    }}
                                    disabled={stockSavingSku === r.sku}
                                    className="shrink-0 px-3 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-50"
                                    title="Guardar stock"
                                  >
                                    {stockSavingSku === r.sku ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                  </button>
                                  <button
                                    onClick={() => openAddStockModal(r, prod, docId)}
                                    className="shrink-0 px-3 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
                                    title="Añadir stock"
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <button
                                    onClick={() => openStockHistory(r.sku, prod?.nombre || r.sku, docId)}
                                    className="shrink-0 px-3 py-2.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition"
                                    title="Historial de movimientos"
                                  >
                                    <History size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Versión desktop: tabla */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 -mx-1 sm:mx-0">
                    <table className="w-full min-w-[800px] text-left text-base">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200 sticky top-0">
                        <tr className="text-xs tracking-wider">
                          <th className="p-4 text-center w-20">Foto</th>
                          <th className="p-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('sku')}>SKU {sortField === 'sku' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('nombre')}>Nombre {sortField === 'nombre' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                          <th className="p-4">Categoría</th>
                          <th className="p-4 text-center cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('stock')}>Stock Actual {sortField === 'stock' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredStockRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400">
                              <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                              <p className="font-semibold">No se encontraron productos</p>
                            </td>
                          </tr>
                        ) : (
                          paginatedStockRows.map((r) => {
                            const prod = prodRows.find(p => p.sku === r.sku);
                            const docId = (r as any).rowId || prod?.rowId || r.sku;
                            return (
                              <tr key={r.sku} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-center">
                                  {prod?.imageUrl ? (
                                    <button onClick={() => setImageModal(prod.imageUrl!)} className="h-20 w-20 mx-auto rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm hover:ring-2 hover:ring-indigo-400 transition cursor-zoom-in block">
                                      <StoreImage src={prod.imageUrl} alt={prod.nombre} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                    </button>
                                  ) : (
                                    <div className="h-20 w-20 mx-auto rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                                      <Package size={28} />
                                    </div>
                                  )}
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold text-indigo-600 text-sm">{r.sku}</span>
                                    {(prod?.is_draft || prod?.status === 'draft' || Number(prod?.precio_venta_1 || 0) <= 0) && (
                                      <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded tracking-wide">BORRADOR</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="font-bold text-slate-800 text-base">{prod?.nombre || '—'}</div>
                                    {isAppwriteProduct(prod) && (
                                      <span className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-200 shrink-0" title="Producto temporal migrado de Appwrite">
                                        🏷️ Appwrite (Temp)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">
                                  {prod?.categoria ? (
                                    <span className="inline-block rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 font-medium">{prod.categoria}</span>
                                  ) : (
                                    <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="p-4 text-center">
                                  {r.ilimitado || Number(r.stock) >= 99999 || prod?.origen === 'appwrite' || String(prod?.rowId || '').startsWith('aw_') ? (
                                    <span className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-bold bg-purple-100 text-purple-800 border border-purple-200" title="Stock ilimitado">
                                      ♾️ Ilimitado
                                    </span>
                                  ) : (
                                    <div className="inline-flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        defaultValue={r.stock}
                                        onKeyDown={async (e) => {
                                          if (e.key !== 'Enter') return;
                                          const val = Number((e.target as HTMLInputElement).value) || 0;
                                          await saveStockDirect(docId, r.sku, val);
                                          (e.target as HTMLInputElement).blur();
                                        }}
                                        className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-center font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
                                      />
                                      <button
                                        onClick={async (e) => {
                                          const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement);
                                          const val = Number(input?.value) || 0;
                                          await saveStockDirect(docId, r.sku, val);
                                        }}
                                        disabled={stockSavingSku === r.sku}
                                        className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                                        title="Guardar stock"
                                      >
                                        {stockSavingSku === r.sku ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                      </button>
                                      <button
                                        onClick={() => openAddStockModal(r, prod, docId)}
                                        className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                                        title="Añadir stock"
                                      >
                                        <Plus size={14} />
                                      </button>
                                      <button
                                        onClick={() => openStockHistory(r.sku, prod?.nombre || r.sku, docId)}
                                        className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
                                        title="Ver historial de movimientos de stock"
                                      >
                                        <History size={14} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}

                {/* Control inferior de paginación */}
                {['maestro', 'precios', 'stock'].includes(tab) && renderPaginationControls()}

                {tab === 'pendiente' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-50 to-orange-50/50 p-4 rounded-2xl border border-amber-200">
                      <div>
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <AlertCircle size={18} className="text-amber-600" /> Stock Pendiente por Reponer
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-900">
                            {pendingItems.length} {pendingItems.length === 1 ? 'producto' : 'productos'}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-600 mt-1">
                          Productos vendidos en caja física con saldo negativo. Total deuda acumulada para Daniel: <strong>{pendingItems.reduce((acc: number, i: any) => acc + (Number(i.pendiente) || 0), 0)} unidades</strong>.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadPendingItems(true)}
                          disabled={pendingLoading}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-amber-800 text-xs font-bold border border-amber-300 hover:bg-amber-100 transition disabled:opacity-50 shadow-xs"
                        >
                          <RefreshCw size={14} className={pendingLoading ? 'animate-spin' : ''} /> Actualizar
                        </button>
                      </div>
                    </div>

                    {renderPaginationControls()}

                    {pendingLoading ? (
                      <div className="py-12 text-center text-slate-400">
                        <RefreshCw className="mx-auto h-8 w-8 mb-2 animate-spin opacity-40" />
                        <p className="font-semibold">Cargando pendientes...</p>
                      </div>
                    ) : pendingItems.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <Check size={32} className="mx-auto mb-2 text-emerald-400" />
                        <p className="font-semibold">No hay stock pendiente</p>
                        <p className="text-xs mt-1">Todos los productos tienen stock o no se han vendido sin stock.</p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile: tarjetas */}
                        <div className="sm:hidden space-y-2">
                          {paginatedPendingItems.map((item: any) => {
                            const prod = prodRows.find(p => p.sku === item.sku || (item.productId && p.rowId === item.productId));
                            return (
                              <div key={item.sku} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                                <div className="flex items-start gap-3">
                                  {prod?.imageUrl ? (
                                    <button onClick={() => setImageModal(prod.imageUrl!)} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                      <StoreImage src={prod.imageUrl} alt={item.nombre || item.sku} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                      <span className="absolute bottom-1 left-1 grid h-6 w-6 place-content-center rounded-full bg-white/90 text-indigo-600 shadow"><Search size={11} /></span>
                                    </button>
                                  ) : (
                                    <div className="h-16 w-16 rounded-xl bg-slate-100 border border-slate-200 grid place-content-center text-slate-300">
                                      <Package size={24} />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-800 text-sm truncate">{item.nombre || item.sku}</div>
                                    <div className="font-mono text-[11px] text-indigo-500 font-bold">{item.sku}</div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-[9px] font-bold uppercase text-amber-600">Pendiente</div>
                                    <div className="text-xl font-black text-amber-700">{item.pendiente}</div>
                                  </div>
                                </div>
                                {item.ultimaVentaFecha && (
                                  <div className="mt-1.5 text-[10px] text-slate-400">Última venta: {item.ultimaVentaFecha}</div>
                                )}
                                <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex justify-end">
                                  <button
                                    onClick={() => {
                                      const stockRow = stockRows.find(s => s.sku === item.sku);
                                      setCompensarModal({ item, prod, docId: prod?.rowId || item.sku, stockRow });
                                      setCompensarQty('');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-xs transition"
                                  >
                                    <ArrowDownCircle size={14} /> Compensar Stock
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop: tabla */}
                        <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                              <tr className="text-xs tracking-wider">
                                <th className="p-4">Producto</th>
                                <th className="p-4">SKU</th>
                                <th className="p-4">Nombre</th>
                                <th className="p-4 text-center">Pendiente</th>
                                <th className="p-4">Última venta</th>
                                <th className="p-4 text-center">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {paginatedPendingItems.map((item: any) => {
                                const prod = prodRows.find(p => p.sku === item.sku || (item.productId && p.rowId === item.productId));
                                const docId = prod?.rowId || item.sku;
                                return (
                                  <tr key={item.sku} className="hover:bg-amber-50/30 transition-colors">
                                    <td className="p-4">
                                      {prod?.imageUrl ? (
                                        <button onClick={() => setImageModal(prod.imageUrl!)} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:ring-2 hover:ring-indigo-300 transition">
                                          <StoreImage src={prod.imageUrl} alt={item.nombre || item.sku} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                          <span className="absolute bottom-1 left-1 grid h-6 w-6 place-content-center rounded-full bg-white/90 text-indigo-600 shadow"><Search size={11} /></span>
                                        </button>
                                      ) : (
                                        <div className="h-20 w-20 rounded-xl bg-slate-100 border border-slate-200 grid place-content-center text-slate-300">
                                          <Package size={28} />
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-4">
                                      <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold text-indigo-600 text-sm">{item.sku}</span>
                                    </td>
                                    <td className="p-4">
                                      <div className="font-bold text-slate-800">{item.nombre || item.sku}</div>
                                      {prod?.categoria && (
                                        <span className="inline-block mt-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">{prod.categoria}</span>
                                      )}
                                    </td>
                                    <td className="p-4 text-center">
                                      <span className="inline-flex items-center px-3 py-2 rounded-lg text-lg font-black bg-amber-100 text-amber-700 border border-amber-200">
                                        {item.pendiente}
                                      </span>
                                    </td>
                                    <td className="p-4 text-xs text-slate-500">{item.ultimaVentaFecha || '—'}</td>
                                    <td className="p-4 text-center">
                                      <button
                                        onClick={() => {
                                          const stockRow = stockRows.find(s => s.sku === item.sku);
                                          setCompensarModal({ item, prod, docId, stockRow });
                                          setCompensarQty('');
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-xs transition"
                                      >
                                        <ArrowDownCircle size={14} /> Compensar Stock
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    {renderPaginationControls()}
                  </div>
                )}

                {tab === 'monitoreo' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-violet-50 to-indigo-50/50 p-4 rounded-2xl border border-violet-100">
                      <div>
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <History size={18} className="text-violet-600" /> Monitoreo y Auditoría de Stock
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Historial en tiempo real de todos los cambios de stock: quién modificó, añadió o descontó stock, con fecha, hora y detalle.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href="/erp-dashboard/historial-stock"
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white text-violet-700 text-xs font-bold border border-violet-200 hover:bg-violet-50 transition shadow-xs"
                          title="Abrir vista dedicada en pestaña nueva"
                        >
                          <ExternalLink size={13} /> Pantalla Completa
                        </a>
                        <button
                          onClick={() => loadMovements(true)}
                          disabled={movementsLoading}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition shadow-xs disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={movementsLoading ? 'animate-spin' : ''} /> Actualizar
                        </button>
                      </div>
                    </div>

                    {/* Filtros de monitoreo */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                          type="search"
                          value={movementsSearch}
                          onChange={(e) => setMovementsSearch(e.target.value)}
                          placeholder="Filtrar por SKU, nombre de producto, usuario (ej. IA, Cajera)..."
                          className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition shadow-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { key: '', label: 'Todos' },
                          { key: 'add', label: '+ Añadido' },
                          { key: 'set', label: 'Ajuste' },
                          { key: 'resta', label: '- Resta' },
                          { key: 'venta', label: 'Venta' },
                          { key: 'edicion', label: 'Edición' },
                        ].map(f => (
                          <button
                            key={f.key}
                            onClick={() => setMovementsFilterTipo(f.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${movementsFilterTipo === f.key ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {renderPaginationControls()}

                    {/* Tabla / Lista */}
                    {movementsLoading ? (
                      <div className="py-16 text-center text-slate-400">
                        <RefreshCw className="mx-auto h-7 w-7 mb-2 animate-spin opacity-40 text-violet-500" />
                        <p className="font-semibold text-sm">Cargando movimientos de stock...</p>
                      </div>
                    ) : filteredMovements.length === 0 ? (
                      <div className="py-16 text-center text-slate-400">
                        <Package className="mx-auto h-9 w-9 mb-2 opacity-40" />
                        <p className="font-semibold text-sm">No se encontraron movimientos</p>
                        <p className="text-xs mt-1">Los cambios que realices en el stock se registrarán automáticamente aquí.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                        <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                            <tr className="text-[11px] tracking-wider">
                              <th className="p-3">Foto</th>
                              <th className="p-3">Producto / SKU</th>
                              <th className="p-3 text-center">Tipo</th>
                              <th className="p-3 text-center">Ant.</th>
                              <th className="p-3 text-center">Cambio</th>
                              <th className="p-3 text-center">Nuevo</th>
                              <th className="p-3">Fecha & Hora</th>
                              <th className="p-3">Usuario / Responsable</th>
                              <th className="p-3">Nota</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {paginatedMovements.map((m: any) => {
                              const isPos = m.cantidad > 0;
                              const isAdd = m.tipo === 'add';
                              const isSet = m.tipo === 'set';
                              const isVenta = m.tipo === 'venta';
                              const isEdit = m.tipo === 'edicion';
                              const prod = prodRows.find(p => p.sku === m.sku || (m.productId && p.rowId === m.productId));
                              return (
                                <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="p-3">
                                    {prod?.imageUrl ? (
                                      <button onClick={() => setImageModal(prod.imageUrl!)} className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:ring-2 hover:ring-violet-300 transition">
                                        <StoreImage src={prod.imageUrl} alt={m.nombre || m.sku} width={160} height={160} className="h-full w-full object-cover" loading="lazy" />
                                        <span className="absolute bottom-1 left-1 grid h-6 w-6 place-content-center rounded-full bg-white/90 text-violet-600 shadow"><Search size={11} /></span>
                                      </button>
                                    ) : (
                                      <div className="h-16 w-16 rounded-xl bg-slate-100 border border-slate-200 grid place-content-center text-slate-300">
                                        <Package size={22} />
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <div className="font-bold text-slate-800 leading-tight max-w-[240px] truncate">{m.nombre || '—'}</div>
                                    <span className="font-mono text-[11px] font-bold text-indigo-600">{m.sku}</span>
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${isAdd ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isSet ? 'bg-amber-50 text-amber-700 border-amber-200' : isVenta ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : isEdit ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                      {isAdd ? '+ Añadido' : isSet ? 'Ajuste' : isVenta ? 'Venta' : isEdit ? 'Edición' : m.tipo}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center font-bold text-slate-500">{m.stockAnterior ?? '—'}</td>
                                  <td className="p-3 text-center">
                                    <span className={`font-black ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {isPos ? `+${m.cantidad}` : m.cantidad}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center font-black text-slate-900 bg-slate-50/50">{m.stockNuevo}</td>
                                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                                    {m.fechaHora || m.fecha || (m.fechaTs ? new Date(m.fechaTs).toLocaleString('es-CL') : '—')}
                                  </td>
                                  <td className="p-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      {m.usuario || 'Sistema'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-xs text-slate-400 max-w-[180px] truncate">{m.nota || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {renderPaginationControls()}
                  </div>
                )}

                {tab === 'nuevo' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur-xl">
                    {/* Header estilo navbar */}
                    <div className={`flex items-center justify-between border-b px-4 sm:px-6 py-4 ${isWebProductsView ? 'border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50' : 'border-slate-300 bg-gradient-to-r from-emerald-50 to-teal-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm ${isWebProductsView ? 'bg-gradient-to-br from-sky-500 to-indigo-500' : 'bg-gradient-to-br from-emerald-500 to-teal-500'}`}>
                          {isWebProductsView ? <Globe size={20} /> : <Plus size={20} />}
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-800">{editingSku ? 'Editar producto' : isWebProductsView ? 'Crear producto web' : 'Crear nuevo producto'}</h3>
                          <p className="mt-0.5 text-[10px] text-slate-500">{editingSku ? 'Modifica la información del producto.' : isIndependentWeb ? 'Este producto se gestionará desde el catálogo web.' : isWebProductsView ? 'Este producto quedará disponible para la web y oculto en el POS.' : 'Completa la información para agregarlo a la base general.'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button type="button" onClick={() => { setEditingSku(null); resetNewProduct(); setTab(returnToListTab); }} className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
                          Volver
                        </button>
                        <button
                          type="button"
                          onClick={() => saveNewProduct(false, true)}
                          disabled={savingNewProduct}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 px-3 sm:px-4 py-1.5 text-xs font-black shadow-sm transition disabled:opacity-50"
                          title="Guarda el producto sin exigir precios ni costos, no se publicará ni se podrá vender en caja hasta asignarle precio."
                        >
                          📝 {savingNewProduct ? 'Guardando…' : 'Guardar como Borrador'}
                        </button>
                        <button type="button" onClick={() => saveNewProduct(false, false)} disabled={savingNewProduct} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-3 sm:px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:from-indigo-600 hover:to-blue-600 disabled:opacity-50">
                          <Save size={14} /> {savingNewProduct ? 'Guardando…' : editingSku ? 'Actualizar' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => saveNewProduct(true, false)} disabled={savingNewProduct} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 sm:px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50">
                          <Plus size={14} /> <span className="hidden sm:inline">Guardar y crear otro</span><span className="sm:hidden">Otro</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid items-start gap-5 p-4 sm:p-6 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
                      {/* ═══════ COLUMNA IZQUIERDA ═══════ */}
                      <div className="space-y-4">
                        {/* 1. Información básica */}
                      {/* ═══════ DATOS ADICIONALES ═══════ */}
                      {/* 1. Organización y detalles */}
                      <div className="rounded-2xl border border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-content-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-xs font-black text-white shadow-sm">1</span>
                          <div className="flex items-center gap-1.5">
                            <Boxes size={14} className="text-purple-600" />
                            <h4 className="text-xs font-black text-slate-800">Organización y detalles</h4>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-slate-700">Proveedor <span className="text-slate-400">(opcional)</span></label>
                            <input value={newProduct.proveedor} onChange={e => setNewProduct(product => ({ ...product, proveedor: e.target.value }))} placeholder="Ej: DON LEE, YUANDA" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none transition placeholder:text-slate-500 focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-slate-700">Cod. caja <span className="text-slate-400">(opcional)</span></label>
                            <input value={newProduct.box_code} onChange={e => setNewProduct(product => ({ ...product, box_code: e.target.value }))} placeholder="Ej: 8214, K3X" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono outline-none transition placeholder:text-slate-500 focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-slate-700">Cantidad por embalaje <span className="text-slate-400">(opcional)</span></label>
                            <input value={newProduct.cantidad_embalaje} onChange={e => setPackageQuantityForProductForm(e.target.value)} placeholder="Ej: 60PCS, 24 unid" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none transition placeholder:text-slate-500 focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
                          </div>
                        </div>
                      </div>

                        <div className="rounded-2xl border border-indigo-300 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 sm:p-6 shadow-sm">
                          <div className="mb-5 flex items-center gap-3 border-b border-indigo-200 pb-4">
                            <div className="grid h-10 w-10 place-content-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-sm">
                              <Package size={20} />
                            </div>
                            <div>
                              <h4 className="text-base font-black text-slate-800">Detalle de producto</h4>
                              <p className="mt-0.5 text-xs text-slate-500">Los campos marcados con <span className="text-rose-500 font-bold">*</span> son obligatorios.</p>
                            </div>
                          </div>
                          <div className="space-y-5">
                            {/* Foto del producto */}
                            <div
                              onPaste={async (e) => {
                                const items = e.clipboardData?.items;
                                if (!items) return;
                                for (const it of items) {
                                  if (it.type.startsWith('image/')) {
                                    const f = it.getAsFile();
                                    if (!f) return;
                                    e.preventDefault();
                                    setUploadingImage(true);
                                    try {
                                      const json = await uploadProductPhoto(f);
                                      if (json.success && json.imageUrl) {
                                        setNewProduct(p => ({ ...p, imageUrl: json.imageUrl }));
                                        setMessage('Foto pegada correctamente.');
                                      } else {
                                        setMessage(json.error || 'Error al subir la foto.');
                                      }
                                    } catch (err: any) {
                                      setMessage(err?.message || 'Error al subir la foto.');
                                    } finally {
                                      setUploadingImage(false);
                                    }
                                    return;
                                  }
                                }
                              }}
                            >
                              <label className="mb-2 block text-sm font-bold text-slate-700">Foto del producto <span className="text-slate-400 text-xs font-normal">(puedes pegar con Ctrl+V)</span></label>
                              <div className="flex items-center gap-3">
                                {newProduct.imageUrl ? (
                                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                    <img src={newProduct.imageUrl} alt="preview" className="h-full w-full object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => setNewProduct(p => ({ ...p, imageUrl: '' }))}
                                      className="absolute top-0.5 right-0.5 grid h-5 w-5 place-content-center rounded-full bg-rose-500 text-white shadow hover:bg-rose-600"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="grid h-20 w-20 shrink-0 place-content-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-300">
                                    <Package size={24} />
                                  </div>
                                )}
                                <label className="cursor-pointer rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition">
                                  {newProduct.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0];
                                      if (!f) return;
                                      setUploadingImage(true);
                                      try {
                                        const json = await uploadProductPhoto(f);
                                        if (json.success && json.imageUrl) {
                                          setNewProduct(p => ({ ...p, imageUrl: json.imageUrl }));
                                          setMessage('Foto subida correctamente.');
                                        } else {
                                          setMessage(json.error || 'Error al subir la foto.');
                                        }
                                      } catch (err: any) {
                                        setMessage(err?.message || 'Error al subir la foto.');
                                      } finally {
                                        setUploadingImage(false);
                                      }
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const items = await navigator.clipboard.read();
                                      for (const it of items) {
                                        if (it.types.includes('image/png') || it.types.includes('image/jpeg')) {
                                          const blob = await it.getType(it.types.find(t => t.startsWith('image/'))!);
                                          const f = new File([blob], `pasted-${Date.now()}.png`, { type: blob.type });
                                          setUploadingImage(true);
                                          try {
                                            const json = await uploadProductPhoto(f);
                                            if (json.success && json.imageUrl) {
                                              setNewProduct(p => ({ ...p, imageUrl: json.imageUrl }));
                                              setMessage('Foto pegada correctamente.');
                                            } else {
                                              setMessage(json.error || 'Error al subir la foto.');
                                            }
                                          } catch (err: any) {
                                            setMessage(err?.message || 'Error al subir la foto.');
                                          } finally {
                                            setUploadingImage(false);
                                          }
                                          return;
                                        }
                                      }
                                      setMessage('No hay imagen en el portapapeles.');
                                    } catch {
                                      setMessage('No se pudo leer el portapapeles. Usa Ctrl+V sobre el área de foto.');
                                    }
                                  }}
                                  className="rounded-xl bg-purple-100 hover:bg-purple-200 px-4 py-2.5 text-xs font-bold text-purple-700 transition"
                                  title="Pegar imagen del portapapeles"
                                >
                                  Pegar
                                </button>
                                {uploadingImage && <span className="text-xs text-slate-400">Subiendo…</span>}
                              </div>
                            </div>
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <label className="text-sm font-bold text-slate-700"><span className="text-rose-500">*</span> SKU</label>
                                <button type="button" onClick={generateNewProductSku} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 shadow-sm transition hover:bg-indigo-50"><RefreshCw size={12} /> Generar</button>
                              </div>
                              <input value={newProduct.sku} onChange={e => setNewProduct(product => ({ ...product, sku: e.target.value }))} placeholder="Ingrese SKU" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-mono outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-bold text-slate-700"><span className="text-rose-500">*</span> Código de Barra</label>
                              <input value={newProduct.codigo_barra} onChange={e => setNewProduct(product => ({ ...product, codigo_barra: e.target.value }))} placeholder="Ingrese Código de Barra" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-mono outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-bold text-slate-700"><span className="text-rose-500">*</span> Nombre de Producto</label>
                              <input value={newProduct.nombre} onChange={e => setNewProduct(product => ({ ...product, nombre: e.target.value }))} placeholder="EJ: Samsung Galaxy S8 32GB Negro" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Categoría <span className="text-slate-400 text-xs font-normal">(opcional)</span></label>
                                <select value={newProduct.category} onChange={e => setNewProduct(product => ({ ...product, category: e.target.value, subcategory: '' }))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                                  <option value="">Sin categoría</option>
                                  {erpCategories.map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Subcategoría <span className="text-slate-400 text-xs font-normal">(opcional)</span></label>
                                <select value={newProduct.subcategory} onChange={e => setNewProduct(product => ({ ...product, subcategory: e.target.value }))} disabled={!newProduct.category} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400">
                                  <option value="">Ninguna</option>
                                  {erpSubcategories.filter(s => s.categoryId === newProduct.category && !s.parentSubcategoryId).map(s => <option key={s.$id} value={s.$id}>{s.name}</option>)}
                                </select>
                              </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <label className="block text-sm font-bold text-slate-700">
                                    {editingSku ? 'Stock actual' : 'Stock inicial'}
                                  </label>
                                  {editingSku && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const r = prodRows.find(p => p.sku === editingSku);
                                        if (r) openAddStockModal(r, r, r.rowId || editingSku);
                                      }}
                                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2.5 py-1 transition"
                                      title="Sumar stock por embalajes o piezas"
                                    >
                                      <Plus size={13} /> Añadir stock
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  disabled={newProduct.unlimited}
                                  value={newProduct.unlimited ? 'Ilimitado' : newProduct.stock}
                                  onChange={e => setInitialStockUnitsForProductForm(e.target.value)}
                                  placeholder="0"
                                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-500"
                                />
                                {editingSku && (
                                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                                    ✓ Puedes editar el stock directamente aquí o usar el botón <strong>+ Añadir stock</strong> para sumar por cajas.
                                  </p>
                                )}
                                {parsePackageUnits(newProduct.cantidad_embalaje) > 0 && !newProduct.unlimited && (
                                  <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                                    <label htmlFor="initial-stock-packages" className="block text-xs font-bold text-indigo-800 mb-1.5">Embalajes en stock {editingSku ? 'actual' : 'inicial'}</label>
                                    <input id="initial-stock-packages" type="text" inputMode="numeric" value={initialStockPackages} onChange={e => setInitialPackagesForProductForm(e.target.value)} placeholder="Cantidad de embalajes" className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                                    <p className="mt-1.5 text-[11px] font-medium text-indigo-700">
                                      {initialStockPackages ? `${initialStockPackages} × ${parsePackageUnits(newProduct.cantidad_embalaje)} pcs = ${Number(newProduct.stock) || 0} pcs` : `Cada embalaje suma ${parsePackageUnits(newProduct.cantidad_embalaje)} pcs al stock.`}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Cantidad por embalaje <span className="text-slate-400 text-xs font-normal">(opcional)</span></label>
                                <input value={newProduct.cantidad_embalaje} onChange={e => setPackageQuantityForProductForm(e.target.value)} placeholder="Ej: 150PCS, 24 unid" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                              </div>
                            </div>

                            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition ${newProduct.unlimited ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                              <input type="checkbox" checked={newProduct.unlimited} onChange={e => setNewProduct(product => ({ ...product, unlimited: e.target.checked }))} className="h-5 w-5 accent-amber-600" />
                              <div>
                                <span className="block text-sm font-bold text-slate-700">Vender sin stock (ilimitado)</span>
                                <span className="block text-xs text-slate-500">El producto se vende sin controlar inventario</span>
                              </div>
                            </label>

                            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition ${newProduct.visible ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                              <input type="checkbox" checked={newProduct.visible} onChange={e => setNewProduct(product => ({ ...product, visible: e.target.checked }))} className="h-5 w-5 accent-emerald-600" />
                              <div>
                                <span className="block text-sm font-bold text-slate-700">{isWebProductsView ? 'Disponible para venta en Web' : 'Disponible para venta en Tienda'}</span>
                                <span className="block text-xs text-slate-500">{isIndependentWeb ? 'El producto aparece en el catálogo web.' : isWebProductsView ? 'El producto aparece en el catálogo web. Nunca se mostrará en el POS.' : 'El producto aparece en el POS'}</span>
                              </div>
                            </label>
                          </div>
                        </div>

                      </div>

                      <aside className="lg:sticky lg:top-24 overflow-hidden rounded-2xl border border-indigo-300 bg-white shadow-xl shadow-indigo-100/50">
                        <div className="flex items-center justify-between border-b border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 place-content-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-sm">
                              <DollarSign size={16} />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-slate-800">{isCurrentWebOnly ? 'Precio Tienda Web' : 'Listado de precios'}</h4>
                              <p className="text-[9px] text-slate-500">{isCurrentWebOnly ? 'Único precio oficial para la venta en la web.' : 'Valores del producto por canal.'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 p-4">
                          {(isCurrentWebOnly ? [
                            { key: 'precio_venta_1', label: 'Precio Web *', help: 'Único precio visible en la tienda online', accent: 'border-emerald-300', labelColor: 'text-emerald-700' },
                            { key: 'costo_uni', label: 'Costo unitario', help: 'Costo interno de compra (opcional para margen)', accent: 'border-slate-300', labelColor: 'text-slate-700' },
                          ] : [
                            { key: 'costo_uni', label: 'Costo unitario', help: 'Costo interno del producto', accent: 'border-slate-300', labelColor: 'text-slate-700' },
                            { key: 'precio_venta_1', label: 'P1 · Precio Efectivo *', help: 'Precio público en efectivo', accent: 'border-emerald-300', labelColor: 'text-emerald-700' },
                            { key: 'precio_venta_2', label: 'P2 · Precio Embalaje', help: 'Precio por embalaje o caja', accent: 'border-indigo-300', labelColor: 'text-indigo-700' },
                            { key: 'precio_venta_3', label: 'P3 · Precio Embalaje 2', help: 'Segundo precio por embalaje (mayor volumen)', accent: 'border-purple-300', labelColor: 'text-purple-700' },
                            { key: 'precio_venta_4', label: 'P4 · Precio especial', help: 'Cuarto nivel de precio opcional', accent: 'border-orange-300', labelColor: 'text-orange-700' },
                          ]).map(price => (
                            <div key={price.key} className={`rounded-xl border ${price.accent} bg-white p-3 shadow-sm`}>
                              <label className={`block text-[10px] font-black uppercase tracking-wide ${price.labelColor}`}>{price.label}</label>
                              <p className="mb-2 text-[9px] text-slate-500">{price.help}</p>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={newProduct[price.key as 'costo_uni' | 'precio_venta_1' | 'precio_venta_2' | 'precio_venta_3' | 'precio_venta_4']}
                                  onChange={e => setNewProduct(product => ({ ...product, [price.key]: e.target.value }))}
                                  onWheel={e => e.currentTarget.blur()}
                                  className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-2.5 pl-7 pr-3 text-xs font-bold outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                                />
                              </div>
                              {!isCurrentWebOnly && price.key === 'precio_venta_2' && (
                                <div className="mt-2.5 pt-2 border-t border-indigo-100">
                                  <label className="block text-[9px] font-bold text-indigo-700 mb-1">Etiqueta POS (ej: x 1, Embalaje):</label>
                                  <input
                                    type="text"
                                    placeholder="Ej: x 1 (por defecto: Embalaje)"
                                    value={newProduct.label_p2}
                                    onChange={e => setNewProduct(product => ({ ...product, label_p2: e.target.value }))}
                                    className="w-full rounded-lg border border-indigo-200 bg-indigo-50/30 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white focus:ring-1 focus:ring-indigo-200"
                                  />
                                </div>
                              )}
                              {!isCurrentWebOnly && price.key === 'precio_venta_3' && (
                                <div className="mt-2.5 pt-2 border-t border-purple-100">
                                  <label className="block text-[9px] font-bold text-purple-700 mb-1">Etiqueta POS (ej: x 5, A partir de 5):</label>
                                  <input
                                    type="text"
                                    placeholder="Ej: x 5 (por defecto: Embalaje 2)"
                                    value={newProduct.label_p3}
                                    onChange={e => setNewProduct(product => ({ ...product, label_p3: e.target.value }))}
                                    className="w-full rounded-lg border border-purple-200 bg-purple-50/30 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-purple-400 focus:bg-white focus:ring-1 focus:ring-purple-200"
                                  />
                                </div>
                              )}
                              {!isCurrentWebOnly && price.key === 'precio_venta_4' && (
                                <div className="mt-2.5 pt-2 border-t border-orange-100">
                                  <label className="block text-[9px] font-bold text-orange-700 mb-1">Etiqueta POS (ej: Especial, Mayorista 3):</label>
                                  <input
                                    type="text"
                                    placeholder="Ej: Especial (por defecto: Precio especial)"
                                    value={newProduct.label_p4}
                                    onChange={e => setNewProduct(product => ({ ...product, label_p4: e.target.value }))}
                                    className="w-full rounded-lg border border-orange-200 bg-orange-50/30 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-400 focus:bg-white focus:ring-1 focus:ring-orange-200"
                                  />
                                </div>
                              )}
                            </div>
                          ))}

                          {!isCurrentWebOnly && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setShowExtraPrices(!showExtraPrices)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-xs font-bold text-indigo-700 transition"
                              >
                                {showExtraPrices ? '▲ Ocultar precios adicionales (P5 - P10)' : '▼ Habilitar precios adicionales (P5 a P10)'}
                              </button>
                            </div>
                          )}

                          {!isCurrentWebOnly && showExtraPrices && (
                            <div className="space-y-3 pt-1 border-t border-indigo-100">
                              {[
                                { key: 'precio_venta_5', labelKey: 'label_p5', num: 5, label: 'P5 · Precio 5', help: 'Quinto nivel de precio opcional' },
                                { key: 'precio_venta_6', labelKey: 'label_p6', num: 6, label: 'P6 · Precio 6', help: 'Sexto nivel de precio opcional' },
                                { key: 'precio_venta_7', labelKey: 'label_p7', num: 7, label: 'P7 · Precio 7', help: 'Séptimo nivel de precio opcional' },
                                { key: 'precio_venta_8', labelKey: 'label_p8', num: 8, label: 'P8 · Precio 8', help: 'Octavo nivel de precio opcional' },
                                { key: 'precio_venta_9', labelKey: 'label_p9', num: 9, label: 'P9 · Precio 9', help: 'Noveno nivel de precio opcional' },
                                { key: 'precio_venta_10', labelKey: 'label_p10', num: 10, label: 'P10 · Precio 10', help: 'Décimo nivel de precio opcional' },
                              ].map(p => (
                                <div key={p.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                  <label className="block text-[10px] font-black uppercase tracking-wide text-slate-700">{p.label}</label>
                                  <p className="mb-2 text-[9px] text-slate-500">{p.help}</p>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={(newProduct as any)[p.key]}
                                      onChange={e => setNewProduct(prod => ({ ...prod, [p.key]: e.target.value }))}
                                      onWheel={e => e.currentTarget.blur()}
                                      className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-2.5 pl-7 pr-3 text-xs font-bold outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                                    />
                                  </div>
                                  <div className="mt-2.5 pt-2 border-t border-slate-100">
                                    <label className="block text-[9px] font-bold text-slate-700 mb-1">Etiqueta POS (ej: Distribuidor, Especial {p.num}):</label>
                                    <input
                                      type="text"
                                      placeholder={`Ej: Precio ${p.num}`}
                                      value={(newProduct as any)[p.labelKey]}
                                      onChange={e => setNewProduct(prod => ({ ...prod, [p.labelKey]: e.target.value }))}
                                      className="w-full rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white focus:ring-1 focus:ring-indigo-200"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </aside>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de imagen */}
      {imageModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setImageModal(null)}
        >
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition" onClick={() => setImageModal(null)}>
            <X size={24} />
          </button>
          <img
            src={imageModal}
            alt="Producto"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Modal de añadir stock (+) */}
      {addStockModal && (() => {
        const configuredUnitsPerPackage = getUnitsPerPackage(addStockModal.prod);
        const unitsPerPackage = configuredUnitsPerPackage || Number(addStockUnitsPerPackage) || 0;
        return (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => { setAddStockModal(null); setAddStockQty(''); setAddStockLooseQty(''); setAddStockPackages(''); setAddStockUnitsPerPackage(''); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Plus className="text-indigo-600" size={22} />
                Añadir Stock
              </h3>
              <button onClick={() => { setAddStockModal(null); setAddStockQty(''); setAddStockLooseQty(''); setAddStockPackages(''); setAddStockUnitsPerPackage(''); }} className="text-slate-400 hover:text-slate-600 transition">
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              {addStockModal.prod?.imageUrl ? (
                <img src={addStockModal.prod.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 grid place-content-center text-slate-300">
                  <Package size={20} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800 text-sm truncate">{addStockModal.prod?.nombre || addStockModal.row.sku}</div>
                <div className="font-mono text-[11px] text-indigo-500 font-bold">{addStockModal.row.sku}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[9px] font-bold uppercase text-slate-400">Stock actual</div>
                <div className="text-xl font-black text-slate-700">{addStockModal.row.stock}</div>
              </div>
            </div>

            {!configuredUnitsPerPackage && (
              <div>
                <label htmlFor="add-stock-units-per-package" className="block text-sm font-bold text-slate-700 mb-1.5">¿Cuántas pcs trae cada embalaje?</label>
                <input
                  id="add-stock-units-per-package"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={addStockUnitsPerPackage}
                  onChange={e => setAddStockPackageSize(e.target.value)}
                  placeholder="Ej: 12"
                  className="w-full rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3 text-center text-2xl font-black text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
                <p className="mt-1 text-xs text-slate-500">Lo guardaré en la ficha del producto cuando agregues el stock.</p>
              </div>
            )}

            {unitsPerPackage > 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-indigo-500">Contenido por embalaje</div>
                    <div className="text-lg font-black text-indigo-900">{unitsPerPackage} pcs</div>
                  </div>
                  <Package size={22} className="text-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">¿Cuántos embalajes vas a agregar?</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 5, 10, 40].map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => addStockPackageStep(count)}
                        className="rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm font-black text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        +{count} {count === 1 ? 'embalaje' : 'embalajes'}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <label htmlFor="add-stock-package-count" className="text-sm font-semibold text-slate-600 shrink-0">Otra cantidad</label>
                    <input
                      id="add-stock-package-count"
                      type="text"
                      inputMode="numeric"
                      value={addStockPackages}
                      onChange={e => setAddStockByPackages(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter' && !addStockSaving) handleAddStock('packages'); }}
                      placeholder="N.º de embalajes"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-center text-lg font-black text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="add-stock-loose-qty" className="block text-sm font-bold text-slate-700 mb-1.5">Unidades sueltas</label>
              <div className="flex items-center gap-3">
                <input
                  id="add-stock-loose-qty"
                  type="text"
                  inputMode="numeric"
                  value={addStockLooseQty}
                  onChange={e => setAddStockLooseQty(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter' && !addStockSaving) handleAddStock('units'); }}
                  placeholder="Cantidad de pcs sueltas"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-lg font-black text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-xs font-bold text-slate-500">pcs</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Stock si agregas estas unidades: <strong>{Number(addStockModal.row.stock) + (Number(addStockLooseQty) || 0)}</strong>
              </p>
            </div>

            {unitsPerPackage > 0 && Number(addStockQty) > 0 && (
              <p className="text-xs text-indigo-700">
                {addStockPackages} embalajes × {unitsPerPackage} pcs = <strong>{addStockQty} pcs</strong>. Stock resultante: <strong>{Number(addStockModal.row.stock) + Number(addStockQty)}</strong>
              </p>
            )}

            {unitsPerPackage <= 0 && (
              <div>
                <p className="text-[11px] text-slate-500">Completa las piezas por embalaje para habilitar la entrada por embalajes, o agrega unidades sueltas.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setAddStockModal(null); setAddStockQty(''); setAddStockLooseQty(''); setAddStockPackages(''); setAddStockUnitsPerPackage(''); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAddStock('units')}
                disabled={addStockSaving || !addStockLooseQty || Number(addStockLooseQty) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-sm font-bold hover:bg-indigo-50 transition disabled:opacity-50"
              >
                {addStockSaving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                Añadir unidades
              </button>
              <button
                onClick={() => handleAddStock('packages')}
                disabled={addStockSaving || !addStockQty || Number(addStockQty) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {addStockSaving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                Añadir embalajes
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal Compensar Stock Pendiente */}
      {compensarModal && (() => {
        const item = compensarModal.item;
        const prod = compensarModal.prod;
        const pendiente = Number(item.pendiente || 0);
        const qty = Number(compensarQty) || 0;
        const deudaPagada = Math.min(pendiente, qty);
        const pendienteRestante = Math.max(0, pendiente - deudaPagada);
        const stockAnt = Number(compensarModal.stockRow?.stock ?? prod?.stock ?? 0);
        const stockBase = Math.max(0, stockAnt);
        const sobrante = Math.max(0, qty - deudaPagada);
        const stockResultante = pendienteRestante > 0 ? -pendienteRestante : stockBase + sobrante;

        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={() => { setCompensarModal(null); setCompensarQty(''); }}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <ArrowDownCircle size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Compensar Stock Pendiente
                    </h3>
                    <p className="text-xs text-slate-500">Ingreso de mercadería física a tienda</p>
                  </div>
                </div>
                <button
                  onClick={() => { setCompensarModal(null); setCompensarQty(''); }}
                  className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Ficha Producto & Deuda Actual */}
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50/40 border border-amber-200">
                {prod?.imageUrl ? (
                  <img src={prod.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover border border-amber-200 bg-white shadow-xs" />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-white border border-amber-200 grid place-content-center text-amber-400">
                    <Package size={24} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 text-sm truncate">{prod?.nombre || item.nombre || item.sku}</div>
                  <div className="font-mono text-xs text-indigo-600 font-bold mt-0.5">{item.sku}</div>
                  {item.ultimaVentaFecha && (
                    <div className="text-[11px] text-slate-500 mt-0.5">Última venta: {item.ultimaVentaFecha}</div>
                  )}
                </div>
                <div className="text-right shrink-0 bg-white px-3 py-2 rounded-xl border border-amber-200 shadow-xs">
                  <div className="text-[10px] font-extrabold uppercase text-amber-600 tracking-wider">Deuda Pendiente</div>
                  <div className="text-2xl font-black text-rose-600">-{pendiente}</div>
                </div>
              </div>

              {/* Input Unidades Físicas Entrantes */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  Cantidad Física que Ingresa a Tienda (Unidades)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={compensarQty}
                    onChange={e => setCompensarQty(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter' && !compensarSaving && Number(compensarQty) > 0) handleCompensarSubmit(); }}
                    placeholder="Ej: 100"
                    className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-2xl text-center text-3xl font-black text-slate-900 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-none transition shadow-inner"
                  />
                  {/* Botones rápidos */}
                  <div className="flex gap-1.5 justify-center mt-2">
                    {[pendiente, pendiente * 2, 50, 100].filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx).slice(0, 4).map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCompensarQty(String(preset))}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition"
                      >
                        +{preset} uds
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tarjeta de Desglose Matemático en Vivo */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                  Desglose de Compensación:
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <span className="flex items-center gap-1.5">📥 Ingreso físico reportado:</span>
                  <strong className="text-slate-900 font-mono text-sm">+{qty} uds</strong>
                </div>

                <div className="flex justify-between items-center text-amber-700">
                  <span className="flex items-center gap-1.5">⚠️ Compensación de ventas debidas:</span>
                  <strong className="font-mono text-sm">-{deudaPagada} uds</strong>
                </div>

                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                  <span className="font-bold text-slate-800">✨ Stock físico final disponible en tienda:</span>
                  <span className={`font-mono font-black text-base ${stockResultante > 0 ? 'text-emerald-600' : stockResultante === 0 ? 'text-slate-700' : 'text-rose-600'}`}>
                    {stockResultante} uds
                  </span>
                </div>

                <div className="pt-1 text-[11px]">
                  {qty === 0 ? (
                    <span className="text-slate-400 italic">Ingresa una cantidad para calcular el nuevo stock.</span>
                  ) : pendienteRestante === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">
                      ✅ La deuda pendiente quedará saldada a 0.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-100/70 px-2 py-0.5 rounded-md">
                      ⏳ Aún quedarán {pendienteRestante} unidades debiéndose después de este ingreso.
                    </span>
                  )}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setCompensarModal(null); setCompensarQty(''); }}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCompensarSubmit}
                  disabled={compensarSaving || !compensarQty || Number(compensarQty) <= 0}
                  className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
                >
                  {compensarSaving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                  Confirmar Ingreso y Compensar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de historial de movimientos de stock por producto (Diseño 100% Claro y Limpio) */}
      {stockHistoryModal && (() => {
        const prod = prodRows.find(p => p.sku === stockHistoryModal.sku);
        const currentStockVal = prod?.stock ?? 0;
        const totalVentasCaja = stockHistorySummary?.totalVentasCaja ?? stockHistoryMovements
          .filter(m => m.tipo === 'venta' || (m.tipo === 'resta' && !m.usuario?.includes('Web')))
          .reduce((acc, m) => acc + Math.abs(Number(m.cantidad ?? 0)), 0);
        const totalAnulacionesCaja = stockHistorySummary?.totalAnulacionesCaja ?? stockHistoryMovements
          .filter(m => m.tipo === 'anulacion' || (Number(m.cantidad ?? 0) > 0 && m.nota?.toLowerCase().includes('restitución stock pos')))
          .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);
        const totalVentasWeb = stockHistorySummary?.totalVentasWeb ?? stockHistoryMovements
          .filter(m => m.tipo === 'venta_web')
          .reduce((acc, m) => acc + Math.abs(Number(m.cantidad ?? 0)), 0);
        const movimientoTimestamp = (m: any) => {
          const values = [m.fechaTs, m.fecha, m.createdAt, m.fechaHora];
          for (const value of values) {
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
            if (value && typeof value.toMillis === 'function') return value.toMillis();
            if (typeof value === 'string' && value.trim()) {
              const numeric = Number(value);
              if (Number.isFinite(numeric) && numeric > 0) return numeric;
              const parsed = Date.parse(value);
              if (Number.isFinite(parsed)) return parsed;
            }
          }
          return 0;
        };
        const totalStockInicial = Number(stockHistorySummary?.totalStockInicial ?? (() => {
          const primero = [...stockHistoryMovements].sort((a, b) => movimientoTimestamp(a) - movimientoTimestamp(b))[0];
          return Math.max(0, Number(primero?.stockAnterior) || 0);
        })());
        const totalIngresos = stockHistorySummary?.totalIngresos ?? stockHistoryMovements
          .filter(m => ['add', 'ingreso_daniel'].includes(m.tipo) && Number(m.cantidad ?? 0) > 0)
          .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0) + totalStockInicial;
        const totalDevolucionesWeb = stockHistorySummary?.totalDevolucionesWeb ?? stockHistoryMovements
          .filter(m => ['cancelacion_web', 'expiracion_web'].includes(m.tipo))
          .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);
        const totalVentasCajaNetas = totalVentasCaja - totalAnulacionesCaja;
        const totalVentasWebNetas = totalVentasWeb - totalDevolucionesWeb;

        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setStockHistoryModal(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header 100% Claro */}
              <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <History size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-200">
                        {stockHistoryModal.sku}
                      </span>
                      <h3 className="text-base sm:text-lg font-black text-slate-800 truncate">{stockHistoryModal.nombre}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">Historial cronológico de movimientos (Hora oficial de Chile)</p>
                  </div>
                </div>
                <button
                  onClick={() => setStockHistoryModal(null)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition p-2 rounded-xl shrink-0 ml-2"
                  title="Cerrar ventana"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Barra Resumen Rápido (Cards Claras con Web y Caja) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 border-b border-slate-200 text-center">
                <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">📦 Total ingresado</div>
                  <div className="text-sm sm:text-lg font-black text-emerald-700 mt-0.5">+{totalIngresos} <span className="text-[11px] font-bold text-emerald-600">uds</span></div>
                  {totalStockInicial > 0 && <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">Incluye {totalStockInicial} uds de stock inicial</div>}
                </div>
                <div className="bg-white p-3 rounded-2xl border border-rose-200 shadow-xs">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-rose-600">🛒 Ventas Caja</div>
                  <div className="text-sm sm:text-lg font-black text-rose-700 mt-0.5">
                    {totalVentasCajaNetas} <span className="text-[11px] font-bold text-rose-600">uds vendidas</span>
                    {totalAnulacionesCaja > 0 && (
                      <span className="block text-[10px] text-rose-600 font-bold">{totalAnulacionesCaja} anuladas · aparte</span>
                    )}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-purple-200 shadow-xs">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-purple-600">🌐 Ventas Web</div>
                  <div className="text-sm sm:text-lg font-black text-purple-700 mt-0.5">
                    {totalVentasWebNetas} <span className="text-[11px] font-bold text-purple-600">uds vendidas</span>
                    {totalDevolucionesWeb > 0 && <span className="block text-[10px] text-rose-600 font-bold">{totalDevolucionesWeb} devueltas · aparte</span>}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-indigo-200 shadow-xs">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-600">🎯 Stock Tienda</div>
                  <div className="text-sm sm:text-lg font-black text-indigo-700 mt-0.5">{currentStockVal} <span className="text-[11px] font-bold text-indigo-600">uds</span></div>
                </div>
              </div>

              {/* Lista de Movimientos en diseño claro */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {stockHistoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                    <RefreshCw size={26} className="animate-spin text-indigo-600" />
                    <span className="text-sm font-bold text-slate-600">Consultando movimientos...</span>
                  </div>
                ) : stockHistoryMovements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
                    <History size={36} className="opacity-30 text-slate-400" />
                    <p className="text-sm font-bold text-slate-600">Sin movimientos registrados para este producto</p>
                    <p className="text-xs text-slate-400">Los ingresos de Daniel, ventas y ediciones aparecerán aquí.</p>
                  </div>
                ) : (
                  stockHistoryMovements.map((m, i) => {
                    const isVentaCaja = m.tipo === 'venta' || (m.tipo === 'resta' && !m.usuario?.includes('Web'));
                    const isAnulacionCaja = m.tipo === 'anulacion' || (Number(m.cantidad ?? 0) > 0 && m.nota?.toLowerCase().includes('restitución stock pos'));
                    const isVentaWeb = m.tipo === 'venta_web';
                    const isDevolucionWeb = m.tipo === 'cancelacion_web' || m.tipo === 'expiracion_web';
                    const isIngreso = m.tipo === 'ingreso_daniel' || m.tipo === 'add';
                    const isEdicion = m.tipo === 'edicion';
                    const isAjuste = m.tipo === 'ajuste' || m.tipo === 'set';

                    const delta = Number(m.cantidad ?? 0);
                    const stockNuevo = Number(m.stockNuevo ?? 0);
                    const stockAnterior = Number(m.stockAnterior ?? 0);

                    // Formateo de fecha y hora chilena
                    const fechaHoraChile = formatFechaHoraChile(m.fechaTs, m.fechaHora || m.fecha);

                    let cardTheme = 'border-slate-200 bg-white';
                    let badgeTheme = 'bg-slate-100 text-slate-700 border-slate-200';
                    let badgeText = 'MOVIMIENTO';
                    let deltaBadge = 'bg-slate-100 text-slate-800 border-slate-300';

                    if (isVentaWeb) {
                      cardTheme = 'border-purple-200 bg-white hover:border-purple-300';
                      badgeTheme = 'bg-purple-50 text-purple-700 border-purple-200';
                      badgeText = '🌐 VENTA WEB (PEDIDO)';
                      deltaBadge = 'bg-purple-600 text-white border-purple-700';
                    } else if (isDevolucionWeb) {
                      cardTheme = 'border-teal-200 bg-white hover:border-teal-300';
                      badgeTheme = 'bg-teal-50 text-teal-700 border-teal-200';
                      badgeText = m.tipo === 'expiracion_web' ? '↩️ RESTITUCIÓN (EXPIRACIÓN)' : '↩️ RESTITUCIÓN (CANCELACIÓN)';
                      deltaBadge = 'bg-teal-600 text-white border-teal-700';
                    } else if (isAnulacionCaja) {
                      cardTheme = 'border-teal-200 bg-white hover:border-teal-300';
                      badgeTheme = 'bg-teal-50 text-teal-700 border-teal-200';
                      badgeText = '↩️ ANULACIÓN VENTA CAJA (POS)';
                      deltaBadge = 'bg-teal-600 text-white border-teal-700';
                    } else if (isVentaCaja) {
                      cardTheme = 'border-rose-200 bg-white hover:border-rose-300';
                      badgeTheme = 'bg-rose-50 text-rose-700 border-rose-200';
                      badgeText = '🛒 VENTA EN CAJA (POS)';
                      deltaBadge = 'bg-rose-500 text-white border-rose-600';
                    } else if (isIngreso) {
                      cardTheme = 'border-emerald-200 bg-white hover:border-emerald-300';
                      badgeTheme = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      badgeText = m.tipo === 'ingreso_daniel' ? '📦 INGRESO DANIEL (WHATSAPP)' : '📦 INGRESO MERCADERÍA';
                      deltaBadge = 'bg-emerald-500 text-white border-emerald-600';
                    } else if (isEdicion) {
                      cardTheme = 'border-amber-200 bg-white hover:border-amber-300';
                      badgeTheme = 'bg-amber-50 text-amber-800 border-amber-200';
                      badgeText = '✏️ EDICIÓN MANUAL EN POS';
                      deltaBadge = 'bg-amber-500 text-white border-amber-600';
                    } else if (isAjuste) {
                      cardTheme = 'border-sky-200 bg-white hover:border-sky-300';
                      badgeTheme = 'bg-sky-50 text-sky-800 border-sky-200';
                      badgeText = '⚖️ AJUSTE / CUADRE';
                      deltaBadge = 'bg-sky-500 text-white border-sky-600';
                    }

                    return (
                      <div
                        key={m.id || i}
                        className={`rounded-2xl border ${cardTheme} p-4 shadow-xs transition`}
                      >
                        {/* Fila superior: Tipo, Usuario y Fecha Chilena */}
                        <div className="flex items-start justify-between gap-2 flex-wrap mb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-wider ${badgeTheme}`}>
                              {badgeText}
                            </span>
                            {m.usuario && (
                              <span className="text-xs font-bold text-slate-700 bg-slate-50 px-2.5 py-0.5 rounded-lg border border-slate-200 flex items-center gap-1">
                                👤 {m.usuario}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1 font-mono">
                            🕐 {fechaHoraChile}
                          </span>
                        </div>

                        {/* Bloque visual de Stock claro */}
                        <div className="flex items-center gap-2 sm:gap-4 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200 mb-2 text-center">
                          <div className="flex-1">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Stock Antes</div>
                            <div className="text-base font-black text-slate-700">{stockAnterior} uds</div>
                          </div>

                          <div className="shrink-0">
                            <span className={`text-xs sm:text-sm font-black px-3 py-1 rounded-xl shadow-xs border ${deltaBadge}`}>
                              {delta > 0 ? `+${delta} uds` : delta < 0 ? `${delta} uds` : '0 uds'}
                            </span>
                          </div>

                          <div className="flex-1">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Stock Resultante</div>
                            <div className={`text-base font-black ${stockNuevo < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              {stockNuevo} uds
                            </div>
                          </div>
                        </div>

                        {/* Nota explicativa clara */}
                        {m.nota && (
                          <div className="text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-start gap-2">
                            <span className="text-slate-400 font-bold shrink-0">💬</span>
                            <span className="leading-relaxed font-medium">{m.nota}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer Claro */}
              <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">
                  {stockHistoryMovements.length} movimiento(s) auditado(s)
                </span>
                <button
                  onClick={() => setStockHistoryModal(null)}
                  className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold border border-slate-300 transition shadow-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showRecentPriceLabels && (!currentView || (embedded && currentView.value === 'inventario')) && (
        <RecentPriceLabelsModal
          products={recentPriceLabelProducts}
          onClose={() => setShowRecentPriceLabels(false)}
        />
      )}

      {/* Asistente IA Flotante para Base de Datos & Auditoría (Móvil y Desktop) */}
      <BaseDatosAIChatbot />

    </div>
  );
}
