'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  LayoutGrid,
  Layers,
  List,
  Loader2,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  clearPosProductsCache,
  createFirebaseErpProduct,
  deleteFirebaseErpProduct,
  fetchAllFirebaseErpProducts,
  purgeServerProductsCache,
  updateFirebaseErpProduct,
  type FirebaseErpProduct,
} from '@/lib/firebaseErpService';
import OrdersCloudMascot from '@/components/admin/OrdersCloudMascot';
import StockRiskBadge from '@/components/admin/StockRiskBadge';
import { getProductRisk, type ProductRisk } from '@/lib/stock-risk';

type ErpProduct = {
  id: string;
  code: string;
  name: string;
  descripcion: string;
  precio: number;
  costo: number;
  stock: number;
  categoria: string;
  marca: string;
  imageUrl: string;
  publicado: boolean;
  isactive: boolean;
  ilimitado: boolean;
  raw: Record<string, any>;
};

function mapFirebaseProductToView(item: FirebaseErpProduct): ErpProduct {
  const raw = (item.rawDocument || {}) as Record<string, any>;
  const rawWebStock = raw.WEB_STOCK ?? raw.web_stock;
  const unlimited = Boolean(
    item.ilimitado ||
      raw.ILIMITADO === true ||
      raw.ilimitado === true ||
      Number(rawWebStock ?? item.stock) >= 99999
  );
  const effectiveWebStock =
    rawWebStock !== undefined ? Math.max(0, Math.trunc(Number(rawWebStock) || 0)) : Math.max(0, Math.trunc(Number(item.stock) || 0));

  return {
    id: item.$id,
    code: item.sku || item.$id,
    name: item.nombre || String(raw.NAME || ''),
    descripcion: item.description || String(raw.DESCRIPTION || ''),
    precio: Number(item.precio_venta_1 || raw.PRICE || 0),
    costo: Number(item.costo_uni || raw.COST || 0),
    stock: unlimited ? 0 : effectiveWebStock,
    categoria: item.category === 'General' && !raw.CATEGORYID ? '' : (item.category || String(raw.CATEGORYID || '')),
    marca: String(raw.BRAND || item.supplier || ''),
    imageUrl: item.imageUrl || String(raw.IMAGEURL || ''),
    publicado: Boolean(item.show_in_web),
    isactive: item.isactive !== false,
    ilimitado: unlimited,
    raw: {
      ...raw,
      WEB_STOCK: unlimited ? 99999 : effectiveWebStock,
      IMAGEURL2: item.imageUrl2 || raw.IMAGEURL2 || '',
      IMAGEURL3: item.imageUrl3 || raw.IMAGEURL3 || '',
    },
  };
}

async function fetchFirebaseErpProducts(forceRefresh = false): Promise<ErpProduct[]> {
  if (forceRefresh) {
    clearPosProductsCache({ onlyWorkspace: true });
  }
  const items = await fetchAllFirebaseErpProducts(forceRefresh);
  return items.map(mapFirebaseProductToView);
}

function invalidateFirebaseProductsCache() {
  clearPosProductsCache({ onlyWorkspace: true });
  purgeServerProductsCache();
}

type ProductFormState = {
  name: string;
  description: string;
  price: string;
  cost: string;
  stock: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  content: string;
  imageUrl: string;
  imageUrl2: string;
  imageUrl3: string;
  visible: boolean;
  unlimitedStock: boolean;
};

type VisibilityFilter = 'all' | 'visible' | 'hidden';
type FlowStageFilter =
  | 'all'
  | 'draft'
  | 'with_photo'
  | 'with_margin'
  | 'in_stock'
  | 'published'
  | 'low_stock'
  | 'hidden';
type SortKey =
  | 'recent'
  | 'name_asc'
  | 'name_desc'
  | 'price_desc'
  | 'price_asc'
  | 'stock_desc'
  | 'stock_asc'
  | 'margin_desc'
  | 'margin_asc';
type ViewMode = 'table' | 'grid';

const EMPTY_FORM: ProductFormState = {
  name: '',
  description: '',
  price: '',
  cost: '',
  stock: '0',
  category: '',
  brand: '',
  size: '',
  color: '',
  content: '',
  imageUrl: '',
  imageUrl2: '',
  imageUrl3: '',
  visible: true,
  unlimitedStock: false,
};

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Estándar', 'Única'];
const QUICK_CONTENTS = ['30 ml', '50 ml', '100 ml', '150 ml', '200 ml', '250 ml', '1 Unidad', 'Set x3'];
const QUICK_STOCK_PRESETS = [0, 5, 10, 25, 50, 100];

const FLOW_STAGES = ['draft', 'with_photo', 'with_margin', 'in_stock', 'published'] as const;

const FLOW_STAGE_COLORS: Record<string, { color: string; bg: string }> = {
  draft:       { color: '#f97316', bg: '#fff7ed' },
  with_photo:  { color: '#60a5fa', bg: '#f5f9ff' },
  with_margin: { color: '#a78bfa', bg: '#f3effe' },
  in_stock:    { color: '#34d399', bg: '#f0fdf4' },
  published:   { color: '#4ade80', bg: '#f7fef9' },
  low_stock:   { color: '#eab308', bg: '#fefce8' },
  hidden:      { color: '#f87171', bg: '#feebeb' },
};

const FLOW_STAGE_CONFIG: Record<string, { label: string; desc: string; bg: string; text: string }> = {
  all:         { label: 'Todos',             desc: 'Todo el catálogo web',                                bg: 'bg-gray-100',    text: 'text-gray-700' },
  draft:       { label: 'Por Completar',     desc: 'Productos sin foto principal o con precio $0.',       bg: 'bg-orange-100',  text: 'text-orange-700' },
  with_photo:  { label: 'Con Galería HD',    desc: 'Productos con fotografía lista para vitrina.',        bg: 'bg-blue-100',    text: 'text-blue-700' },
  with_margin: { label: 'Margen Calculado',  desc: 'Productos con costo y ganancia unitaria configurada.',bg: 'bg-violet-100',  text: 'text-violet-700' },
  in_stock:    { label: 'Stock Disponible',  desc: 'Productos con stock físico > 0 o Stock ∞ Ilimitado.', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  published:   { label: 'En Vitrina Web',    desc: 'Publicados, con stock activo y visibles al público.', bg: 'bg-green-100',   text: 'text-green-700' },
  low_stock:   { label: 'Stock Crítico / 0', desc: 'Productos agotados (0 uds) o por agotarse (≤ 5 uds).',bg: 'bg-yellow-100',  text: 'text-yellow-800' },
  hidden:      { label: 'Oculto en Tienda',  desc: 'Productos pausados que no se muestran a clientes.',   bg: 'bg-red-100',     text: 'text-red-700' },
};

const FLOW_STAGE_SVG: Record<string, React.ReactNode> = {
  draft: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  with_photo: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  with_margin: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  in_stock: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  ),
  published: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-5" />
    </svg>
  ),
  low_stock: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  hidden: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
};

function formatCurrency(value: number) {
  return `$${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('es-CL')}`;
}

function formatDisplayCode(code: string): string {
  const raw = String(code || '').trim();
  if (!raw) return 'SIN-SKU';
  if (/^prod_\d+_[a-z0-9]+$/i.test(raw)) {
    const parts = raw.split('_');
    const suffix = (parts[parts.length - 1] || raw.slice(-4)).toUpperCase();
    return `SKU-${suffix}`;
  }
  if (raw.length > 16 && !raw.includes(' ')) {
    return `#${raw.slice(-6).toUpperCase()}`;
  }
  return raw;
}

function isProductVisible(product: ErpProduct) {
  return product.publicado !== false && product.isactive !== false;
}

function isUnlimitedStockProduct(product: ErpProduct) {
  return Boolean(
    product.ilimitado ||
      product.raw?.ILIMITADO === true ||
      product.raw?.ilimitado === true ||
      Number(product.raw?.WEB_STOCK ?? product.stock) >= 99999
  );
}

function getWebStock(product: ErpProduct) {
  if (isUnlimitedStockProduct(product)) return 0;
  const rawWebStock = product.raw?.WEB_STOCK ?? product.raw?.web_stock;
  const value = rawWebStock !== undefined ? rawWebStock : product.stock;
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function getProductAttributes(product: ErpProduct) {
  return {
    size: String(product.raw?.WEB_SIZE || product.raw?.web_size || '').trim(),
    color: String(product.raw?.WEB_COLOR || product.raw?.web_color || '').trim(),
    content: String(product.raw?.WEB_VOLUME || product.raw?.web_volume || '').trim(),
  };
}

function getProductGallery(product: ErpProduct): string[] {
  const urls = [
    product.imageUrl,
    String(product.raw?.IMAGEURL2 || ''),
    String(product.raw?.IMAGEURL3 || ''),
  ]
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
}

function computeMargin(price: number, cost: number) {
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  if (p <= 0 || c <= 0) return null;
  const profit = p - c;
  const pct = Math.round((profit / p) * 100);
  return { profit, pct };
}

function getProductWebRisk(product: ErpProduct): ProductRisk {
  const unlimited = isUnlimitedStockProduct(product);
  const stock = getWebStock(product);
  if (unlimited) {
    return {
      pct: 100,
      level: 'verde',
      cobertura: 999,
      pisoCritico: 0,
      velocity: 0,
      coldStart: false,
      label: 'Stock web ilimitado (∞) · Siempre disponible en tienda',
    };
  }
  return getProductRisk({
    stock,
    salesVelocity7d: 0,
    maxBatchSize: 1,
    price: Number(product.precio) || 2500,
  });
}

function getProductPrimaryStatus(product: ErpProduct): {
  key: FlowStageFilter;
  label: string;
  color: string;
  bg: string;
} {
  const visible = isProductVisible(product);
  const unlimited = isUnlimitedStockProduct(product);
  const stock = getWebStock(product);
  const hasPhoto = Boolean(product.imageUrl);
  const hasPrice = (Number(product.precio) || 0) > 0;

  if (!visible) {
    return {
      key: 'hidden',
      label: 'Oculto',
      color: FLOW_STAGE_COLORS.hidden.color,
      bg: FLOW_STAGE_COLORS.hidden.bg,
    };
  }
  if (!unlimited && stock <= 0) {
    return {
      key: 'low_stock',
      label: 'Agotado (0)',
      color: '#ef4444',
      bg: '#feebeb',
    };
  }
  if (!hasPhoto || !hasPrice) {
    return {
      key: 'draft',
      label: !hasPhoto ? 'Sin Foto' : 'Sin Precio',
      color: FLOW_STAGE_COLORS.draft.color,
      bg: FLOW_STAGE_COLORS.draft.bg,
    };
  }
  if (!unlimited && stock <= 5) {
    return {
      key: 'low_stock',
      label: `Stock Bajo (${stock})`,
      color: FLOW_STAGE_COLORS.low_stock.color,
      bg: FLOW_STAGE_COLORS.low_stock.bg,
    };
  }
  return {
    key: 'published',
    label: unlimited ? 'En Vitrina · ∞' : 'En Vitrina Web',
    color: '#10b981',
    bg: '#f0fdf4',
  };
}

function matchesFlowStage(product: ErpProduct, stage: FlowStageFilter): boolean {
  if (stage === 'all') return true;
  const visible = isProductVisible(product);
  const unlimited = isUnlimitedStockProduct(product);
  const stock = getWebStock(product);
  const hasPhoto = Boolean(product.imageUrl);
  const hasPrice = (Number(product.precio) || 0) > 0;
  const margin = computeMargin(product.precio, product.costo);

  switch (stage) {
    case 'draft':
      return !hasPhoto || !hasPrice;
    case 'with_photo':
      return hasPhoto;
    case 'with_margin':
      return Boolean(margin && margin.profit > 0);
    case 'in_stock':
      return unlimited || stock > 0;
    case 'published':
      return visible && hasPrice && (unlimited || stock > 0);
    case 'low_stock':
      return !unlimited && stock <= 5;
    case 'hidden':
      return !visible;
    default:
      return true;
  }
}

function toFormState(product: ErpProduct): ProductFormState {
  const attributes = getProductAttributes(product);
  const unlimitedStock = isUnlimitedStockProduct(product);
  return {
    name: product.name || '',
    description: product.descripcion || '',
    price: String(Math.max(0, Math.round(Number(product.precio) || 0))),
    cost: product.costo ? String(Math.max(0, Math.round(Number(product.costo) || 0))) : '',
    stock: String(getWebStock(product)),
    category: product.categoria || '',
    brand: product.marca || '',
    size: attributes.size,
    color: attributes.color,
    content: attributes.content,
    imageUrl: product.imageUrl || '',
    imageUrl2: String(product.raw?.IMAGEURL2 || ''),
    imageUrl3: String(product.raw?.IMAGEURL3 || ''),
    visible: isProductVisible(product),
    unlimitedStock,
  };
}

function getNextManualCode(products: ErpProduct[]) {
  const highestNumber = products.reduce((max, item) => {
    const match = /^WEB-(\d+)$/i.exec(String(item.code || '').trim());
    if (!match) return max;
    return Math.max(max, Number(match[1]) || 0);
  }, 0);
  return `WEB-${String(highestNumber + 1).padStart(4, '0')}`;
}

export default function WebProductsWorkspace() {
  const [products, setProducts] = useState<ErpProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeUploadSlot, setActiveUploadSlot] = useState<1 | 2 | 3>(1);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [quickStockSavingId, setQuickStockSavingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [flowFilter, setFlowFilter] = useState<FlowStageFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ErpProduct | null>(null);
  const [timelineProductId, setTimelineProductId] = useState<string | null>(null);
  const [quickAdjustProduct, setQuickAdjustProduct] = useState<ErpProduct | null>(null);
  const [quickAdjustPrice, setQuickAdjustPrice] = useState('');
  const [quickAdjustCost, setQuickAdjustCost] = useState('');
  const [quickAdjustStock, setQuickAdjustStock] = useState('');
  const [quickAdjustUnlimited, setQuickAdjustUnlimited] = useState(false);
  const [quickAdjustSaving, setQuickAdjustSaving] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<{ url: string; title: string; sku?: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storedCategories, setStoredCategories] = useState<string[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/public-data/categories', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      const docs = Array.isArray(data?.documents) ? data.documents : [];
      const names = docs
        .map((doc: any) => String(doc?.NAME || doc?.name || '').trim())
        .filter(Boolean);
      setStoredCategories(Array.from(new Set(names)));
    } catch {
      // Categories still derive from loaded products if the endpoint fails.
    }
  }, []);

  const loadProducts = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchFirebaseErpProducts(forceRefresh);
      setProducts(items);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(false);
    loadCategories();
  }, [loadCategories, loadProducts]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  const categories = useMemo(() => {
    return Array.from(
      new Set([
        ...storedCategories,
        ...products.map((item) => item.categoria.trim()).filter(Boolean),
        form.category.trim(),
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [form.category, products, storedCategories]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const cat = p.categoria.trim() || 'Sin categoría';
      map[cat] = (map[cat] || 0) + 1;
    }
    return map;
  }, [products]);

  const brands = useMemo(() => {
    return Array.from(
      new Set(products.map((item) => item.marca.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  const flowCounts = useMemo(() => {
    const map: Record<string, number> = {
      draft: 0,
      with_photo: 0,
      with_margin: 0,
      in_stock: 0,
      published: 0,
      low_stock: 0,
      hidden: 0,
    };
    for (const p of products) {
      for (const key of Object.keys(map) as FlowStageFilter[]) {
        if (matchesFlowStage(p, key)) {
          map[key] += 1;
        }
      }
    }
    return map;
  }, [products]);

  const stats = useMemo(() => {
    const total = products.length;
    const visible = products.filter(isProductVisible).length;
    const hidden = total - visible;
    const unlimited = products.filter(isUnlimitedStockProduct).length;
    const outOfStock = products.filter((p) => !isUnlimitedStockProduct(p) && getWebStock(p) === 0).length;
    const lowStock = products.filter((p) => {
      if (isUnlimitedStockProduct(p)) return false;
      const s = getWebStock(p);
      return s > 0 && s <= 5;
    }).length;
    const withoutPhoto = products.filter((p) => !p.imageUrl).length;
    const incomplete = products.filter((p) => !p.imageUrl || (Number(p.precio) || 0) <= 0).length;

    let marginSum = 0;
    let marginCount = 0;
    let totalCatalogValue = 0;
    let totalPriceSum = 0;
    let topMarginProduct: { name: string; pct: number; profit: number } | null = null;

    for (const p of products) {
      const price = Math.max(0, Number(p.precio) || 0);
      totalPriceSum += price;
      const m = computeMargin(p.precio, p.costo);
      if (m && m.pct > -100 && m.pct <= 100) {
        marginSum += m.pct;
        marginCount += 1;
        if (!topMarginProduct || m.pct > topMarginProduct.pct) {
          topMarginProduct = { name: p.name, pct: m.pct, profit: m.profit };
        }
      }
      if (!isUnlimitedStockProduct(p)) {
        totalCatalogValue += getWebStock(p) * price;
      } else {
        totalCatalogValue += price;
      }
    }
    const avgMargin = marginCount > 0 ? Math.round(marginSum / marginCount) : null;
    const avgPrice = total > 0 ? Math.round(totalPriceSum / total) : 0;

    return {
      total,
      visible,
      hidden,
      unlimited,
      outOfStock,
      lowStock,
      withoutPhoto,
      incomplete,
      avgMargin,
      avgPrice,
      topMarginProduct,
      totalCatalogValue,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = products.filter((product) => {
      const visible = isProductVisible(product);
      if (visibilityFilter === 'visible' && !visible) return false;
      if (visibilityFilter === 'hidden' && visible) return false;

      if (flowFilter !== 'all' && !matchesFlowStage(product, flowFilter)) return false;

      if (categoryFilter !== 'all') {
        const pCat = product.categoria.trim() || 'Sin categoría';
        if (pCat !== categoryFilter) return false;
      }

      if (!query) return true;
      const attributes = getProductAttributes(product);
      const displaySku = formatDisplayCode(product.code);
      return [
        product.name,
        product.descripcion,
        product.categoria,
        product.marca,
        product.code,
        displaySku,
        attributes.size,
        attributes.color,
        attributes.content,
      ].some((field) => String(field || '').toLowerCase().includes(query));
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'es');
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name, 'es');
      if (sortBy === 'price_desc') return (Number(b.precio) || 0) - (Number(a.precio) || 0);
      if (sortBy === 'price_asc') return (Number(a.precio) || 0) - (Number(b.precio) || 0);
      if (sortBy === 'stock_desc' || sortBy === 'stock_asc') {
        const sa = isUnlimitedStockProduct(a) ? 999999 : getWebStock(a);
        const sb = isUnlimitedStockProduct(b) ? 999999 : getWebStock(b);
        return sortBy === 'stock_desc' ? sb - sa : sa - sb;
      }
      if (sortBy === 'margin_desc' || sortBy === 'margin_asc') {
        const ma = computeMargin(a.precio, a.costo)?.pct ?? -999;
        const mb = computeMargin(b.precio, b.costo)?.pct ?? -999;
        return sortBy === 'margin_desc' ? mb - ma : ma - mb;
      }
      return 0;
    });
  }, [categoryFilter, flowFilter, products, search, sortBy, visibilityFilter]);

  function toggleSortColumn(col: 'recent' | 'price' | 'stock' | 'margin' | 'name') {
    setSortBy((curr) => {
      if (col === 'recent') return 'recent';
      if (col === 'price') return curr === 'price_desc' ? 'price_asc' : 'price_desc';
      if (col === 'stock') return curr === 'stock_desc' ? 'stock_asc' : 'stock_desc';
      if (col === 'margin') return curr === 'margin_desc' ? 'margin_asc' : 'margin_desc';
      if (col === 'name') return curr === 'name_asc' ? 'name_desc' : 'name_asc';
      return 'recent';
    });
  }

  function openCreateDrawer() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setActiveUploadSlot(1);
    setShowUrlInput(false);
    setCreatingCategory(false);
    setNewCategoryName('');
    setError(null);
    setNotice(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(product: ErpProduct) {
    setEditingProduct(product);
    setForm(toFormState(product));
    setActiveUploadSlot(1);
    setShowUrlInput(false);
    setCreatingCategory(false);
    setNewCategoryName('');
    setError(null);
    setNotice(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving || uploadingImage) return;
    setDrawerOpen(false);
    setEditingProduct(null);
    setShowUrlInput(false);
    setCreatingCategory(false);
    setNewCategoryName('');
  }

  function updateField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function getActiveSlotUrl() {
    if (activeUploadSlot === 2) return form.imageUrl2;
    if (activeUploadSlot === 3) return form.imageUrl3;
    return form.imageUrl;
  }

  function setSlotUrl(slot: 1 | 2 | 3, url: string) {
    if (slot === 2) updateField('imageUrl2', url);
    else if (slot === 3) updateField('imageUrl3', url);
    else updateField('imageUrl', url);
  }

  async function handleCreateCategory() {
    const cleanName = newCategoryName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setError('Escribe el nombre de la categoría.');
      return;
    }

    const existing = categories.find((item) => item.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      updateField('category', existing);
      setCreatingCategory(false);
      setNewCategoryName('');
      setNotice(`Categoría "${existing}" seleccionada.`);
      return;
    }

    setSavingCategory(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/create-category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: cleanName }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo crear la categoría.');
      }

      const savedName = String(data.category?.name || cleanName).trim();
      setStoredCategories((current) => Array.from(new Set([...current, savedName])));
      updateField('category', savedName);
      setCreatingCategory(false);
      setNewCategoryName('');
      setNotice(`Categoría "${savedName}" creada.`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear la categoría.');
    } finally {
      setSavingCategory(false);
    }
  }

  async function uploadSelectedImage(file: File, targetSlot: 1 | 2 | 3 = activeUploadSlot) {
    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.');
      return;
    }

    setUploadingImage(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'No se pudo subir la imagen.');
      }

      setSlotUrl(targetSlot, String(data.url));
      setNotice(
        targetSlot === 1
          ? 'Foto principal optimizada y cargada.'
          : `Foto #${targetSlot} de galería cargada.`
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadSelectedImage(file, activeUploadSlot);
    }
  }

  function handleImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingImage(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void uploadSelectedImage(file, activeUploadSlot);
    }
  }

  function handleImagePaste(event: ClipboardEvent<HTMLElement>) {
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) =>
      item.type.startsWith('image/')
    );
    const file = imageItem?.getAsFile();
    if (file) {
      event.preventDefault();
      void uploadSelectedImage(file, activeUploadSlot);
    }
  }

  async function handlePasteFromClipboardButton() {
    if (!navigator.clipboard?.read) {
      setError('Usa Ctrl+V (o Cmd+V en Mac) para pegar la imagen copiada.');
      return;
    }

    setError(null);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1] || 'png';
          const file = new File([blob], `portapapeles.${extension}`, { type: imageType });
          await uploadSelectedImage(file, activeUploadSlot);
          return;
        }
      }
      setError('No hay ninguna imagen copiada en el portapapeles.');
    } catch {
      setError('Tu navegador pidió confirmar el pegado: presiona Ctrl+V dentro del recuadro.');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = form.name.trim();
    const cleanPrice = Math.max(0, Math.round(Number(form.price) || 0));
    const cleanCost = Math.max(0, Math.round(Number(form.cost) || 0));
    const cleanStock = form.unlimitedStock ? 0 : Math.max(0, Math.trunc(Number(form.stock) || 0));
    const cleanCategory = form.category.trim();
    const cleanBrand = form.brand.trim();
    const cleanDescription = form.description.trim();
    const cleanSize = form.size.trim();
    const cleanColor = form.color.trim();
    const cleanContent = form.content.trim();
    const cleanImageUrl = form.imageUrl.trim();
    const cleanImageUrl2 = form.imageUrl2.trim();
    const cleanImageUrl3 = form.imageUrl3.trim();

    if (!cleanName) {
      setError('Escribe el nombre del producto.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const effectiveWebStock = form.unlimitedStock ? 99999 : cleanStock;

      if (editingProduct) {
        const ok = await updateFirebaseErpProduct(editingProduct.id, {
          nombre: cleanName,
          description: cleanDescription,
          precio_venta_1: cleanPrice,
          costo_uni: cleanCost,
          web_stock: effectiveWebStock,
          ilimitado: form.unlimitedStock,
          category: cleanCategory,
          brand: cleanBrand,
          web_size: cleanSize,
          web_color: cleanColor,
          web_volume: cleanContent,
          imageUrl: cleanImageUrl,
          imageUrl2: cleanImageUrl2,
          imageUrl3: cleanImageUrl3,
          show_in_web: form.visible,
          isactive: form.visible,
          is_draft: false,
          web_managed: true,
        });
        if (!ok) throw new Error('No se pudo guardar el producto.');
        setNotice(`Producto "${cleanName}" actualizado.`);
      } else {
        const createdId = await createFirebaseErpProduct({
          sku: getNextManualCode(products),
          nombre: cleanName,
          descripcion: cleanDescription,
          precio_venta_1: cleanPrice,
          costo_uni: cleanCost,
          stock: effectiveWebStock,
          web_stock: effectiveWebStock,
          category: cleanCategory,
          brand: cleanBrand,
          web_size: cleanSize,
          web_color: cleanColor,
          web_volume: cleanContent,
          imageUrl: cleanImageUrl,
          imageUrl2: cleanImageUrl2,
          imageUrl3: cleanImageUrl3,
          show_in_web: form.visible,
          isactive: form.visible,
          web_only: true,
          is_draft: false,
          web_managed: true,
        });
        if (!createdId) throw new Error('No se pudo crear el producto.');
        if (form.unlimitedStock) {
          await updateFirebaseErpProduct(createdId, { ilimitado: true });
        }
        setNotice(`Producto "${cleanName}" agregado al catálogo.`);
      }

      invalidateFirebaseProductsCache();
      await loadProducts(true);
      setDrawerOpen(false);
      setEditingProduct(null);
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleVisibility(product: ErpProduct) {
    const nextVisible = !isProductVisible(product);
    setTogglingId(product.id);
    setError(null);
    setNotice(null);
    try {
      const ok = await updateFirebaseErpProduct(product.id, {
        show_in_web: nextVisible,
        isactive: nextVisible,
        is_draft: false,
        web_managed: true,
      });
      if (!ok) throw new Error('No se pudo cambiar la visibilidad.');
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                publicado: nextVisible,
                isactive: nextVisible,
                raw: { ...item.raw, SHOW_IN_WEB: nextVisible, ISACTIVE: nextVisible },
              }
            : item
        )
      );
      setNotice(
        nextVisible
          ? `"${product.name}" ahora está visible en la tienda.`
          : `"${product.name}" quedó oculto de la tienda.`
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar la visibilidad.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleQuickStockStep(product: ErpProduct, deltaOrUnlimited: number | 'unlimited') {
    setQuickStockSavingId(product.id);
    setError(null);
    try {
      if (deltaOrUnlimited === 'unlimited') {
        const nextUnlimited = !isUnlimitedStockProduct(product);
        const fallbackStock = Math.max(1, getWebStock(product) || 10);
        const ok = await updateFirebaseErpProduct(product.id, {
          ilimitado: nextUnlimited,
          web_stock: nextUnlimited ? 99999 : fallbackStock,
          web_managed: true,
        });
        if (!ok) throw new Error('No se pudo actualizar el modo de stock.');
        invalidateFirebaseProductsCache();
        await loadProducts(true);
        setNotice(
          nextUnlimited
            ? `"${product.name}" configurado con Stock ∞ Ilimitado.`
            : `"${product.name}" cambió a stock por unidades (${fallbackStock} uds).`
        );
      } else {
        const currentStock = getWebStock(product);
        const nextStock = Math.max(0, currentStock + deltaOrUnlimited);
        const ok = await updateFirebaseErpProduct(product.id, {
          ilimitado: false,
          web_stock: nextStock,
          web_managed: true,
        });
        if (!ok) throw new Error('No se pudo actualizar el stock.');
        setProducts((current) =>
          current.map((item) =>
            item.id === product.id
              ? {
                  ...item,
                  stock: nextStock,
                  ilimitado: false,
                  raw: { ...item.raw, WEB_STOCK: nextStock, ILIMITADO: false, ilimitado: false },
                }
              : item
          )
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Error al ajustar stock.');
    } finally {
      setQuickStockSavingId(null);
    }
  }

  function openQuickAdjustModal(product: ErpProduct) {
    setQuickAdjustProduct(product);
    setQuickAdjustPrice(String(Math.max(0, Math.round(Number(product.precio) || 0))));
    setQuickAdjustCost(String(Math.max(0, Math.round(Number(product.costo) || 0))));
    setQuickAdjustStock(String(getWebStock(product)));
    setQuickAdjustUnlimited(isUnlimitedStockProduct(product));
  }

  async function saveQuickAdjust() {
    if (!quickAdjustProduct) return;
    setQuickAdjustSaving(true);
    setError(null);
    try {
      const nextPrice = Math.max(0, Math.round(Number(quickAdjustPrice) || 0));
      const nextCost = Math.max(0, Math.round(Number(quickAdjustCost) || 0));
      const nextStock = quickAdjustUnlimited ? 99999 : Math.max(0, Math.trunc(Number(quickAdjustStock) || 0));

      const ok = await updateFirebaseErpProduct(quickAdjustProduct.id, {
        precio_venta_1: nextPrice,
        costo_uni: nextCost,
        web_stock: nextStock,
        ilimitado: quickAdjustUnlimited,
        is_draft: false,
        web_managed: true,
      });
      if (!ok) throw new Error('No se pudo guardar el ajuste rápido.');
      invalidateFirebaseProductsCache();
      await loadProducts(true);
      setNotice(`Stock y precio de "${quickAdjustProduct.name}" actualizados.`);
      setQuickAdjustProduct(null);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar ajuste rápido.');
    } finally {
      setQuickAdjustSaving(false);
    }
  }

  async function handleDuplicateProduct(product: ErpProduct) {
    setDuplicatingId(product.id);
    setError(null);
    try {
      const newSku = getNextManualCode(products);
      const attrs = getProductAttributes(product);
      const unlimited = isUnlimitedStockProduct(product);
      const stockVal = unlimited ? 99999 : getWebStock(product);
      const createdId = await createFirebaseErpProduct({
        sku: newSku,
        nombre: `${product.name} (Copia)`,
        descripcion: product.descripcion || '',
        precio_venta_1: Math.max(0, Math.round(Number(product.precio) || 0)),
        costo_uni: Math.max(0, Math.round(Number(product.costo) || 0)),
        stock: stockVal,
        web_stock: stockVal,
        category: product.categoria || '',
        brand: product.marca || '',
        web_size: attrs.size,
        web_color: attrs.color,
        web_volume: attrs.content,
        imageUrl: product.imageUrl || '',
        imageUrl2: String(product.raw?.IMAGEURL2 || ''),
        imageUrl3: String(product.raw?.IMAGEURL3 || ''),
        show_in_web: false,
        isactive: false,
        web_only: true,
        is_draft: false,
        web_managed: true,
      });
      if (!createdId) throw new Error('No se pudo duplicar el producto.');
      if (unlimited) {
        await updateFirebaseErpProduct(createdId, { ilimitado: true });
      }
      invalidateFirebaseProductsCache();
      await loadProducts(true);
      setNotice(`Copia de "${product.name}" creada como oculta (${newSku}).`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo duplicar el producto.');
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleDelete(product: ErpProduct) {
    if (!window.confirm(`¿Eliminar "${product.name}" del catálogo web?`)) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const ok = await deleteFirebaseErpProduct(product.id);
      if (!ok) throw new Error('No se pudo eliminar el producto.');
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
      setNotice(`Producto "${product.name}" eliminado.`);
      if (editingProduct?.id === product.id) {
        setDrawerOpen(false);
        setEditingProduct(null);
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el producto.');
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (filteredProducts.length > 0 && selected.size === filteredProducts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredProducts.map((p) => p.id)));
    }
  }

  async function handleBulkAction(action: 'show' | 'hide' | 'unlimited' | 'delete') {
    if (selected.size === 0) return;
    if (action === 'delete' && !window.confirm(`¿Eliminar ${selected.size} producto(s) seleccionados?`)) {
      return;
    }
    setBulkUpdating(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      for (const id of ids) {
        const prod = products.find((p) => p.id === id);
        if (!prod) continue;
        if (action === 'delete') {
          await deleteFirebaseErpProduct(id);
        } else if (action === 'show' || action === 'hide') {
          const nextVis = action === 'show';
          await updateFirebaseErpProduct(id, {
            show_in_web: nextVis,
            isactive: nextVis,
            is_draft: false,
            web_managed: true,
          });
        } else if (action === 'unlimited') {
          await updateFirebaseErpProduct(id, {
            ilimitado: true,
            web_stock: 99999,
            web_managed: true,
          });
        }
      }
      invalidateFirebaseProductsCache();
      await loadProducts(true);
      setSelected(new Set());
      setNotice(`Acción masiva aplicada a ${ids.length} producto(s).`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar la acción masiva.');
    } finally {
      setBulkUpdating(false);
    }
  }

  function exportCatalogCsv() {
    if (filteredProducts.length === 0) return;
    const headers = ['SKU', 'Nombre', 'Categoria', 'Marca', 'Precio Web', 'Costo', 'Stock Web', 'Ilimitado', 'Visible', 'Talla', 'Color', 'Contenido'];
    const rows = filteredProducts.map((p) => {
      const attrs = getProductAttributes(p);
      return [
        p.code,
        `"${String(p.name || '').replace(/"/g, '""')}"`,
        `"${String(p.categoria || '').replace(/"/g, '""')}"`,
        `"${String(p.marca || '').replace(/"/g, '""')}"`,
        Math.round(Number(p.precio) || 0),
        Math.round(Number(p.costo) || 0),
        getWebStock(p),
        isUnlimitedStockProduct(p) ? 'SI' : 'NO',
        isProductVisible(p) ? 'SI' : 'NO',
        `"${attrs.size}"`,
        `"${attrs.color}"`,
        `"${attrs.content}"`,
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `catalogo-web-carlitos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Catálogo exportado (${filteredProducts.length} productos).`);
  }

  function applyMarginPreset(pctMarkup: number) {
    const baseCost = Math.max(0, Number(form.cost) || 0);
    if (baseCost <= 0) {
      setError('Ingresa primero el Costo unitario ($) para calcular el precio automáticamente.');
      return;
    }
    const suggestedPrice = Math.round((baseCost * (1 + pctMarkup / 100)) / 10) * 10;
    updateField('price', String(suggestedPrice));
  }

  const formMargin = useMemo(
    () => computeMargin(Number(form.price) || 0, Number(form.cost) || 0),
    [form.cost, form.price]
  );

  const activeSlotUrl = getActiveSlotUrl();

  const criticalCount = stats.outOfStock + stats.incomplete;

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* 1. TOP HEADER BAR — Esencia Yaxsell (/orders) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold text-gray-900">Productos web</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Catálogo web independiente
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''}
            {categories.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">
                · {categories.length} categoría{categories.length !== 1 ? 's' : ''}
              </span>
            )}
            {brands.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">
                · {brands.length} marca{brands.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            <Globe className="w-4 h-4 text-indigo-500" />
            <span className="hidden sm:inline">Ver tienda</span>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>

          <button
            type="button"
            onClick={exportCatalogCsv}
            disabled={filteredProducts.length === 0}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              invalidateFirebaseProductsCache();
              void loadProducts(true);
              void loadCategories();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 transition disabled:opacity-60 cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          <button
            type="button"
            onClick={openCreateDrawer}
            className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-indigo-700 transition shadow-sm shadow-indigo-600/20 cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Agregar producto</span>
          </button>
        </div>
      </div>

      {/* 2. HERO MASCOT & KPI CARDS — Misma identidad visual de /orders */}
      <div className="space-y-3">
        <section
          className="relative flex min-h-[112px] items-center overflow-hidden rounded-3xl border border-sky-100 px-3 py-2 shadow-sm sm:min-h-[132px] sm:px-5"
          style={{ background: 'linear-gradient(110deg, #f1f8ff 0%, #f8f7ff 58%, #fff9ed 100%)' }}
          aria-label="Resumen del catálogo web"
        >
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-sky-100/50 blur-2xl" />
          <OrdersCloudMascot />
          <div className="relative min-w-0 flex-1 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700 sm:text-xs">
              Resumen de tu Catálogo Web
            </p>
            <h2 className="mt-1 text-base font-extrabold tracking-tight text-slate-900 sm:text-xl">
              {stats.visible > 0
                ? '¡Vitrina activa y lista para vender! 🎉'
                : '¡Armemos tu vitrina web ganadora! 🚀'}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
              Tienes{' '}
              <strong className="text-slate-900">
                {stats.visible} {stats.visible === 1 ? 'producto publicado' : 'productos publicados'}
              </strong>{' '}
              de {stats.total} en total
              {stats.avgMargin !== null ? (
                <>
                  {' '}con una rentabilidad promedio del{' '}
                  <strong className="text-emerald-700">{stats.avgMargin}%</strong>.
                </>
              ) : (
                '. Agrega costos unitarios para medir tu margen en vivo.'
              )}
            </p>

            {criticalCount > 0 && (
              <div
                onClick={() => {
                  setVisibilityFilter('all');
                  setFlowFilter(stats.incomplete > 0 ? 'draft' : 'low_stock');
                }}
                className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 cursor-pointer hover:brightness-105 transition"
                title="Clic para filtrar productos por completar o sin stock"
              >
                <span className="text-base shrink-0">⚡</span>
                <span>
                  <strong>¡Optimiza tu vitrina!</strong>{' '}
                  {stats.incomplete > 0 && `${stats.incomplete} sin foto o precio`}
                  {stats.incomplete > 0 && stats.outOfStock > 0 && ' · '}
                  {stats.outOfStock > 0 && `${stats.outOfStock} agotado${stats.outOfStock !== 1 ? 's' : ''} (0 uds)`}
                </span>
                <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-lg text-[10px] uppercase font-black shrink-0">
                  Revisar →
                </span>
              </div>
            )}
          </div>

          <div className="relative ml-2 hidden shrink-0 flex-col gap-2 pr-1 sm:flex">
            <div
              onClick={() => {
                setFlowFilter('published');
                setVisibilityFilter('all');
              }}
              className="rounded-2xl border border-white/90 bg-white/80 px-3.5 py-2 text-right shadow-sm cursor-pointer hover:bg-white transition"
              title="Filtrar publicados en vitrina"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">En Vitrina</p>
              <p className="text-lg font-black leading-tight text-emerald-600">
                {stats.visible} <span className="text-xs font-bold text-slate-400">/ {stats.total}</span>
              </p>
            </div>
            <div
              onClick={() => {
                setFlowFilter(stats.withoutPhoto > 0 ? 'draft' : 'low_stock');
                setVisibilityFilter('all');
              }}
              className={`rounded-2xl border px-3.5 py-2 text-right shadow-sm cursor-pointer transition ${
                criticalCount > 0
                  ? 'border-amber-200 bg-amber-50/90 hover:bg-amber-100'
                  : 'border-emerald-100 bg-emerald-50/85 hover:bg-emerald-100'
              }`}
              title="Filtrar productos por revisar"
            >
              <p className={`text-[10px] font-bold uppercase tracking-wide ${criticalCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {criticalCount > 0 ? '⚠️ Por revisar' : '✓ Salud Web'}
              </p>
              <p className={`text-lg font-black leading-tight ${criticalCount > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {criticalCount > 0 ? criticalCount : '100%'}
              </p>
            </div>
          </div>
        </section>

        {/* 4 Glossy KPI Cards con barra superior de 3px */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Card 1: Catálogo Total */}
          <div
            onClick={() => {
              setFlowFilter('all');
              setVisibilityFilter('all');
            }}
            className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden cursor-pointer hover:shadow-md transition"
            style={{
              background: 'linear-gradient(145deg, rgba(238,242,255,0.65), rgba(255,255,255,0.96))',
              boxShadow: '0 4px 16px -8px rgba(79,70,229,0.12)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
              style={{ background: 'linear-gradient(90deg, #6366f1, #4f46e5)' }}
            />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(99,102,241,0.14), rgba(79,70,229,0.06))' }}
              >
                <Package className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">
                Catálogo Total
              </p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight tabular-nums">
              {stats.total} <span className="text-xs font-bold text-gray-400">prod.</span>
            </p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">
              {categories.length} categorías · {stats.unlimited} con stock ∞
            </p>
          </div>

          {/* Card 2: En Vitrina Web */}
          <div
            onClick={() => {
              setVisibilityFilter('visible');
              setFlowFilter('all');
            }}
            className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden cursor-pointer hover:shadow-md transition"
            style={{
              background: 'linear-gradient(145deg, rgba(236,253,245,0.65), rgba(255,255,255,0.96))',
              boxShadow: '0 4px 16px -8px rgba(5,150,105,0.12)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
              style={{ background: 'linear-gradient(90deg, #10b981, #059669)' }}
            />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.14), rgba(5,150,105,0.06))' }}
              >
                <Eye className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">
                En Vitrina Web
              </p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight tabular-nums">
              {stats.visible} <span className="text-xs font-bold text-emerald-600">activos</span>
            </p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">
              {stats.hidden} ocultos · {stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0}% publicado
            </p>
          </div>

          {/* Card 3: Producto Top Rentabilidad */}
          <div
            onClick={() => setSortBy('margin_desc')}
            className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden cursor-pointer hover:shadow-md transition"
            style={{
              background: 'linear-gradient(145deg, rgba(255,251,235,0.65), rgba(255,255,255,0.96))',
              boxShadow: '0 4px 16px -8px rgba(217,119,6,0.12)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
              style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}
            />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(245,158,11,0.14), rgba(217,119,6,0.06))' }}
              >
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">
                Top Rentabilidad
              </p>
            </div>
            {stats.topMarginProduct ? (
              <>
                <p className="text-sm sm:text-base font-extrabold text-gray-900 truncate tracking-tight">
                  {stats.topMarginProduct.name}
                </p>
                <p className="text-[10px] text-amber-600 mt-0.5 font-bold">
                  +{stats.topMarginProduct.pct}% margen (+{formatCurrency(stats.topMarginProduct.profit)}/ud.)
                </p>
              </>
            ) : (
              <>
                <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">—</p>
                <p className="text-[10px] text-gray-400 mt-1 font-medium">Agrega costos para calcular</p>
              </>
            )}
          </div>

          {/* Card 4: Precio Promedio & Valor */}
          <div
            onClick={() => setSortBy('price_desc')}
            className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden cursor-pointer hover:shadow-md transition"
            style={{
              background: 'linear-gradient(145deg, rgba(240,253,244,0.65), rgba(255,255,255,0.96))',
              boxShadow: '0 4px 16px -8px rgba(22,163,74,0.12)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
              style={{ background: 'linear-gradient(90deg, #22c55e, #16a34a)' }}
            />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(34,197,94,0.14), rgba(22,163,74,0.06))' }}
              >
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">
                Precio Prom. Web
              </p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight tabular-nums">
              {formatCurrency(stats.avgPrice)}
            </p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">
              {stats.avgMargin !== null ? `Margen prom. ${stats.avgMargin}%` : 'Valorizado en catálogo'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. FLUJO DEL CATÁLOGO WEB — Gemelo exacto del Flujo del Pedido de /orders */}
      {(() => {
        const goStage = (stage: FlowStageFilter, isActive: boolean) => {
          setFlowFilter(isActive ? 'all' : stage);
          if (stage === 'hidden') setVisibilityFilter('all');
        };
        const counts = FLOW_STAGES.map((st) => flowCounts[st] || 0);
        let furthestIdx = -1;
        counts.forEach((c, i) => {
          if (c > 0 && FLOW_STAGES[i] !== 'draft') furthestIdx = i;
        });

        const renderNode = (stage: FlowStageFilter, count: number) => {
          const sc = FLOW_STAGE_COLORS[stage] || { color: '#6b7280', bg: '#f3f4f6' };
          const cfg = FLOW_STAGE_CONFIG[stage] || { label: stage, desc: '' };
          const isActive = flowFilter === stage;
          const dim = count === 0;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => goStage(stage, isActive)}
              title={`${cfg.label} · ${count} producto${count !== 1 ? 's' : ''}`}
              className="group flex flex-col items-center gap-1.5 sm:gap-2 flex-shrink-0 relative z-10 cursor-pointer w-[72px] sm:w-[86px]"
            >
              <div
                className="relative"
                style={{ animation: isActive ? 'kcFloat 2.6s ease-in-out infinite' : undefined }}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-[12px] sm:rounded-[14px]"
                    style={{ ['--kc' as any]: `${sc.color}66`, animation: 'kcPulseRing 1.9s ease-out infinite' }}
                  />
                )}
                <div
                  className="relative flex items-center justify-center rounded-[12px] sm:rounded-[14px] transition-all duration-300 group-hover:-translate-y-0.5"
                  style={{
                    width: isActive ? 44 : 38,
                    height: isActive ? 44 : 38,
                    background: dim
                      ? 'linear-gradient(160deg,#ffffff,#eef2f7)'
                      : `linear-gradient(160deg, rgba(255,255,255,0.28), rgba(0,0,0,0.16)), ${sc.color}`,
                    border: dim ? `1.5px dashed ${sc.color}4d` : '1px solid rgba(255,255,255,0.35)',
                    boxShadow: isActive
                      ? `0 0 0 3px ${sc.color}18, 0 6px 14px -6px ${sc.color}66, inset 0 1px 1px rgba(255,255,255,0.5)`
                      : dim
                        ? 'none'
                        : `0 4px 10px -4px ${sc.color}55, inset 0 1px 1px rgba(255,255,255,0.4)`,
                  }}
                >
                  {FLOW_STAGE_SVG[stage] &&
                    React.cloneElement(FLOW_STAGE_SVG[stage] as any, {
                      width: isActive ? 18 : 15,
                      height: isActive ? 18 : 15,
                      style: {
                        color: dim ? sc.color : '#fff',
                        opacity: dim ? 0.55 : 1,
                        filter: dim ? 'none' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
                      },
                    })}
                  {!dim && (
                    <span
                      className="absolute inset-x-1 top-1 h-1/3 rounded-full"
                      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }}
                    />
                  )}
                  {count > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[18px] h-[18px] sm:min-w-[21px] sm:h-[21px] flex items-center justify-center text-[9px] sm:text-[10px] font-extrabold rounded-full px-1 border-2 sm:border-[2.5px]"
                      style={{
                        background: isActive ? '#fff' : `linear-gradient(135deg, ${sc.color}, ${sc.color}cc)`,
                        color: isActive ? sc.color : '#fff',
                        borderColor: isActive ? sc.color : '#fff',
                        boxShadow: `0 2px 5px -1px ${sc.color}55`,
                        animation: 'kcBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                      }}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="text-[9px] sm:text-[10px] font-bold leading-tight text-center transition"
                style={{ color: isActive ? sc.color : dim ? '#c2cbd6' : '#475569' }}
              >
                {cfg.label}
              </span>
            </button>
          );
        };

        const renderDashedSep = (key: string) => (
          <div key={key} className="flex items-center self-start mt-[18px] sm:mt-[22px] flex-shrink-0 px-1">
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
              <div className="w-1 h-0.5 bg-gray-300 rounded-full" />
              <div className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
            </div>
          </div>
        );

        return (
          <div
            className="relative rounded-[20px] overflow-hidden border border-white/70 shadow-[0_6px_24px_-12px_rgba(79,70,229,0.12)]"
            style={{
              background:
                'linear-gradient(135deg, rgba(238,242,255,0.85), rgba(255,255,255,0.92) 45%, rgba(248,250,252,0.9))',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <div
              className="absolute -top-16 -left-10 w-56 h-56 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.05), transparent 70%)' }}
            />
            <div
              className="absolute -bottom-20 right-10 w-56 h-56 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.04), transparent 70%)' }}
            />
            <div className="absolute top-0 left-0 right-0 h-px overflow-hidden pointer-events-none">
              <div
                className="h-px w-1/3"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)',
                  animation: 'kcSheen 4.5s linear infinite',
                }}
              />
            </div>

            <div className="relative flex items-start sm:items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-1 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(145deg,#6366f1,#4f46e5)',
                    boxShadow: '0 4px 10px -4px rgba(79,70,229,0.4), inset 0 1px 1px rgba(255,255,255,0.4)',
                  }}
                >
                  <Sparkles className="w-4 h-4 text-white" />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-gray-900 leading-tight tracking-tight">
                    Flujo de Salud del Catálogo Web
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 leading-tight font-medium">
                    {stats.total} productos evaluados · toca una etapa para filtrar en tiempo real
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {(flowFilter !== 'all' || visibilityFilter !== 'all' || categoryFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFlowFilter('all');
                      setVisibilityFilter('all');
                      setCategoryFilter('all');
                      setSearch('');
                    }}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition flex-shrink-0 shadow-sm cursor-pointer"
                  >
                    Ver todos ({stats.total})
                  </button>
                )}
              </div>
            </div>

            <div className="relative px-4 sm:px-5 pb-5 pt-3 overflow-x-auto">
              <div className="flex items-start gap-0 w-full min-w-max relative">
                {FLOW_STAGES.map((stage, idx) => {
                  const a = FLOW_STAGE_COLORS[stage]?.color || '#6b7280';
                  const b = FLOW_STAGE_COLORS[FLOW_STAGES[idx + 1]]?.color || a;
                  const filled = idx >= 0 && idx < furthestIdx;
                  return (
                    <React.Fragment key={stage}>
                      {renderNode(stage, counts[idx])}
                      {idx < FLOW_STAGES.length - 1 && (
                        <div
                          className="relative self-start mt-[19px] sm:mt-[20px] flex-shrink-0 -mx-1 w-6 sm:w-9 lg:w-12 rounded-full overflow-hidden"
                          style={{
                            height: 3,
                            background: filled ? `linear-gradient(90deg, ${a}, ${b})` : '#e5e7eb',
                          }}
                        >
                          {filled && (
                            <span
                              className="absolute inset-0"
                              style={{
                                background:
                                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
                                animation: `kcShimmer 2.4s linear ${idx * 0.18}s infinite`,
                              }}
                            />
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                <div className="flex-1 min-w-[28px]" />
                {renderNode('low_stock', flowCounts.low_stock)}
                {renderDashedSep('sep-hidden')}
                {renderNode('hidden', flowCounts.hidden)}
              </div>
            </div>

            <style>{`
              @keyframes kcShimmer { 0% { transform: translateX(-110%); } 100% { transform: translateX(220%); } }
              @keyframes kcSheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
              @keyframes kcPulseRing { 0% { box-shadow: 0 0 0 0 var(--kc); } 70% { box-shadow: 0 0 0 11px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
              @keyframes kcFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
              @keyframes kcBadgePop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
          </div>
        );
      })()}

      {/* 4. BARRA DE FILTROS TÁCTILES + SELECTOR DE CATEGORÍAS — Estilo /orders */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        <button
          type="button"
          onClick={() => {
            setVisibilityFilter('all');
            setFlowFilter('all');
          }}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition cursor-pointer ${
            visibilityFilter === 'all' && flowFilter === 'all'
              ? 'bg-gray-900 text-white shadow-md ring-2 ring-gray-900 ring-inset'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          Todos ({stats.total})
        </button>

        <button
          type="button"
          onClick={() => {
            setVisibilityFilter(visibilityFilter === 'visible' ? 'all' : 'visible');
            setFlowFilter('all');
          }}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-green-100 text-green-700 border border-green-200 cursor-pointer ${
            visibilityFilter === 'visible' ? 'ring-2 ring-green-500 ring-inset shadow-sm' : 'hover:opacity-85'
          }`}
        >
          Visibles ({stats.visible})
        </button>

        <button
          type="button"
          onClick={() => {
            setVisibilityFilter(visibilityFilter === 'hidden' ? 'all' : 'hidden');
            setFlowFilter('all');
          }}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-red-100 text-red-700 border border-red-200 cursor-pointer ${
            visibilityFilter === 'hidden' ? 'ring-2 ring-red-500 ring-inset shadow-sm' : 'hover:opacity-85'
          }`}
        >
          Ocultos ({stats.hidden})
        </button>

        <button
          type="button"
          onClick={() => setShowStatusModal(true)}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 cursor-pointer ${
            flowFilter !== 'all' ? 'ring-2 ring-indigo-500 ring-inset shadow-sm text-indigo-700 font-bold' : ''
          }`}
        >
          Más estados ▾
        </button>

        {/* Selector accesible nativo oculto o sincronizado para compatibilidad con tests/accesibilidad */}
        <select
          aria-label="Filtrar por visibilidad"
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
          className="sr-only"
        >
          <option value="all">Todos</option>
          <option value="visible">Visibles</option>
          <option value="hidden">Ocultos</option>
        </select>

        {/* Dropdown de Categorías (como 🏪 Tiendas en /orders) */}
        <div className="relative inline-block" ref={categoryDropdownRef}>
          <button
            type="button"
            onClick={() => setShowCategoryDropdown((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition border cursor-pointer ${
              categoryFilter !== 'all'
                ? 'bg-indigo-100 text-indigo-900 border-indigo-300 ring-2 ring-indigo-500/30 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span>📂 Categorías</span>
            {categoryFilter !== 'all' && (
              <span className="text-xs font-bold text-indigo-800 truncate max-w-[140px]">
                : {categoryFilter}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {showCategoryDropdown && (
            <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-40">
              <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 flex items-center justify-between">
                <span>Categorías web</span>
                <span>{categories.length}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setShowCategoryDropdown(false);
                }}
                className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-gray-50 transition cursor-pointer ${
                  categoryFilter === 'all' ? 'text-indigo-600 bg-indigo-50/60 font-bold' : 'text-gray-700'
                }`}
              >
                <span>🌐 Todas las categorías</span>
                <span className="text-[10px] text-gray-400 font-mono">{products.length}</span>
              </button>
              <div className="max-h-60 overflow-y-auto">
                {Object.entries(categoryCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([catName, count]) => {
                    const isSelected = categoryFilter === catName;
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(catName);
                          setShowCategoryDropdown(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-indigo-50/50 transition cursor-pointer ${
                          isSelected ? 'text-indigo-700 bg-indigo-50 font-bold' : 'text-gray-700'
                        }`}
                      >
                        <span className="truncate pr-2">🏷️ {catName}</span>
                        <span className="text-[10px] text-indigo-600 font-bold font-mono">{count}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Selector de Vista: Tarjetas Flujo (PC) vs Vitrina Grid */}
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden sm:ml-auto shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Flujo PC</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Vitrina</span>
          </button>
        </div>
      </div>

      {/* Modal flotante "Más estados" — idéntico al de /orders */}
      {showStatusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowStatusModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-sm font-bold text-gray-800">Filtrar por etapa del catálogo</h3>
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {(
                ['draft', 'with_photo', 'with_margin', 'in_stock', 'published', 'low_stock', 'hidden'] as FlowStageFilter[]
              ).map((key) => {
                const color = FLOW_STAGE_COLORS[key]?.color || '#6b7280';
                const bg = FLOW_STAGE_COLORS[key]?.bg || '#f3f4f6';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setFlowFilter(key);
                      setVisibilityFilter('all');
                      setShowStatusModal(false);
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition cursor-pointer ${
                      flowFilter === key ? 'ring-2 ring-offset-1 shadow-sm' : 'hover:shadow-md'
                    } hover:scale-105`}
                    style={{ background: bg, borderColor: `${color}33`, color }}
                  >
                    <div style={{ color }}>
                      {FLOW_STAGE_SVG[key] &&
                        React.cloneElement(FLOW_STAGE_SVG[key] as any, { width: 28, height: 28 })}
                    </div>
                    <span className="text-xs font-bold text-center" style={{ color }}>
                      {FLOW_STAGE_CONFIG[key]?.label || key}
                    </span>
                    <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full bg-white/80">
                      {flowCounts[key] || 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. BUSCADOR + ALERTAS + BARRA DE ACCIONES MASIVAS */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            aria-label="Buscar productos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código SKU (ej: WEB-0001), nombre, categoría, marca, talla, color o aroma..."
            className="w-full pl-10 pr-12 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
              title="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Barra de Acciones Masivas (como en /orders) */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 bg-indigo-50 border border-indigo-200 rounded-xl overflow-x-auto">
          <span className="text-sm font-bold text-indigo-700">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <span className="text-indigo-300">|</span>
          <span className="text-xs font-semibold text-indigo-600">Acción rápida:</span>
          <button
            type="button"
            onClick={() => void handleBulkAction('show')}
            disabled={bulkUpdating}
            className="px-3 py-1 rounded-xl text-xs font-bold transition bg-green-100 text-green-700 hover:bg-green-200 border border-green-200 cursor-pointer disabled:opacity-60"
          >
            Mostrar en tienda
          </button>
          <button
            type="button"
            onClick={() => void handleBulkAction('hide')}
            disabled={bulkUpdating}
            className="px-3 py-1 rounded-xl text-xs font-bold transition bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200 cursor-pointer disabled:opacity-60"
          >
            Ocultar de tienda
          </button>
          <button
            type="button"
            onClick={() => void handleBulkAction('unlimited')}
            disabled={bulkUpdating}
            className="px-3 py-1 rounded-xl text-xs font-bold transition bg-sky-100 text-sky-800 hover:bg-sky-200 border border-sky-200 cursor-pointer disabled:opacity-60"
          >
            ∞ Stock Ilimitado
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs font-semibold text-indigo-500 hover:text-indigo-700 cursor-pointer"
          >
            Limpiar selección
          </button>
          <button
            type="button"
            onClick={() => void handleBulkAction('delete')}
            disabled={bulkUpdating}
            className="px-3 py-1 rounded-xl text-xs font-bold transition bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 cursor-pointer disabled:opacity-60"
          >
            Eliminar ({selected.size})
          </button>
        </div>
      )}

      {/* 6. CONTENEDOR PRINCIPAL: MOBILE CARDS + DESKTOP TARJETAS HORIZONTALES YAXSELL */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* VISTA MÓVIL: Tarjetas Táctiles Yaxsell */}
        <div className="block sm:hidden p-2 space-y-2.5">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl border border-gray-100 space-y-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-gray-100 rounded" />
                  <div className="h-4 w-16 bg-gray-100 rounded" />
                </div>
                <div className="h-4 w-44 bg-gray-100 rounded" />
                <div className="h-8 w-full bg-gray-100 rounded-xl" />
              </div>
            ))
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-gray-500 font-bold text-sm">
                {products.length === 0 ? 'Aún no hay productos cargados' : 'No se encontraron productos'}
              </p>
              <button
                type="button"
                onClick={products.length === 0 ? openCreateDrawer : () => {
                  setSearch('');
                  setVisibilityFilter('all');
                  setFlowFilter('all');
                  setCategoryFilter('all');
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                {products.length === 0 ? '+ Agregar primer producto' : 'Limpiar filtros'}
              </button>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const visible = isProductVisible(product);
              const unlimited = isUnlimitedStockProduct(product);
              const webStock = getWebStock(product);
              const attributes = getProductAttributes(product);
              const gallery = getProductGallery(product);
              const margin = computeMargin(product.precio, product.costo);
              const primaryStatus = getProductPrimaryStatus(product);
              const pRisk = getProductWebRisk(product);
              const isSel = selected.has(product.id);

              return (
                <div
                  key={product.id}
                  onClick={() => openEditDrawer(product)}
                  className={`relative rounded-2xl p-3.5 transition-all cursor-pointer border ${
                    isSel ? 'ring-2 ring-indigo-500 border-indigo-400' : 'border-gray-200/80'
                  }`}
                  style={{ background: isSel ? '#eef2ff' : primaryStatus.bg }}
                >
                  <div
                    className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r"
                    style={{ background: primaryStatus.color }}
                  />

                  {/* Fila 1 Móvil: Checkbox + SKU + Categoría + Estado */}
                  <div className="flex items-center justify-between gap-2 mb-2.5 pl-1.5">
                    <div className="flex items-center gap-2 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(product.id)}
                        className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer"
                      />
                      <span
                        className="font-mono text-xs text-indigo-600 font-extrabold truncate"
                        title={product.code}
                      >
                        {formatDisplayCode(product.code)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-gray-700 border border-gray-200 truncate max-w-[120px]">
                        {product.categoria || 'Sin categoría'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimelineProductId(product.id);
                      }}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white shrink-0 shadow-sm cursor-pointer"
                      style={{ background: primaryStatus.color }}
                    >
                      {primaryStatus.label}
                    </button>
                  </div>

                  {/* Fila 2 Móvil: Foto + Nombre + Precio */}
                  <div className="flex items-center gap-3 mb-2.5 pl-1.5">
                    <div
                      className="relative w-14 h-14 rounded-xl overflow-hidden bg-white border border-gray-200 shrink-0"
                      style={{ width: 56, height: 56, minWidth: 56, minHeight: 56 }}
                      onClick={(e) => {
                        if (product.imageUrl) {
                          e.stopPropagation();
                          setZoomImageUrl({
                            url: product.imageUrl,
                            title: product.name,
                            sku: formatDisplayCode(product.code),
                          });
                        }
                      }}
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      {gallery.length > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded bg-black/70 text-[9px] font-bold text-white leading-none">
                          +{gallery.length - 1}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-sm font-extrabold text-gray-900 truncate">{product.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {product.marca && (
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 leading-none">
                            {product.marca}
                          </span>
                        )}
                        {attributes.size && (
                          <span className="text-[10px] font-semibold text-gray-600 bg-white/80 px-1.5 py-0.5 rounded border border-gray-200 leading-none">
                            T:{attributes.size}
                          </span>
                        )}
                        {attributes.content && (
                          <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 leading-none">
                            {attributes.content}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-base font-extrabold text-gray-900 tabular-nums">
                        {formatCurrency(product.precio)}
                      </p>
                      {margin && (
                        <p className="text-[10px] font-bold text-emerald-700">+{margin.pct}% margen</p>
                      )}
                    </div>
                  </div>

                  {/* Fila 3 Móvil: Barra Líquida de Stock + Acciones */}
                  <div
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white/85 border border-slate-200/80 shadow-sm ml-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <StockRiskBadge risk={pRisk} compact />
                      <span className="text-[11px] font-bold text-slate-700 truncate">
                        {unlimited ? '∞ Ilimitado' : `${webStock} uds`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleVisibility(product)}
                        disabled={togglingId === product.id}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition cursor-pointer"
                      >
                        {visible ? 'Ocultar' : 'Mostrar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditDrawer(product)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* VISTA DESKTOP (PC): Toolbar + Lista de Tarjetas Horizontales Yaxsell / Vitrina Grid */}
        <div className="hidden sm:block">
          {/* Toolbar Superior PC — Una sola fila limpia idéntica a /orders */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-100 bg-gray-50/70 flex-wrap xl:flex-nowrap">
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={filteredProducts.length > 0 && selected.size === filteredProducts.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer"
              />
              <span className="text-xs font-semibold text-gray-500">
                {selected.size > 0
                  ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`
                  : 'Seleccionar todo'}
              </span>
            </label>

            {/* Chips rápidos interactivos de segmento */}
            <div className="hidden lg:flex items-center gap-2 ml-1 pl-3 border-l border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setFlowFilter((prev) => (prev === 'published' ? 'all' : 'published'))}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  flowFilter === 'published'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: 'linear-gradient(155deg,#10b981,#059669)' }}
                />
                <span>En Vitrina</span>
                <span
                  className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-full leading-none ${
                    flowFilter === 'published' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {flowCounts.published}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFlowFilter((prev) => (prev === 'with_photo' ? 'all' : 'with_photo'))}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  flowFilter === 'with_photo'
                    ? 'bg-sky-100 text-sky-800 border-sky-300 ring-2 ring-sky-500/20 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: 'linear-gradient(155deg,#38bdf8,#0284c7)' }}
                />
                <span>Con Foto HD</span>
                <span
                  className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-full leading-none ${
                    flowFilter === 'with_photo' ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {flowCounts.with_photo}
                </span>
              </button>

              {flowCounts.low_stock > 0 && (
                <button
                  type="button"
                  onClick={() => setFlowFilter((prev) => (prev === 'low_stock' ? 'all' : 'low_stock'))}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                    flowFilter === 'low_stock'
                      ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-500/20 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: 'linear-gradient(155deg,#f59e0b,#d97706)' }}
                  />
                  <span>Stock Bajo / 0</span>
                  <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-full leading-none bg-amber-100 text-amber-800">
                    {flowCounts.low_stock}
                  </span>
                </button>
              )}
            </div>

            {/* Botones de Ordenamiento direccionales compactos al extremo derecho (como /orders) */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-0.5 hidden md:inline">
                Ordenar
              </span>

              <button
                type="button"
                onClick={() => toggleSortColumn('recent')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  sortBy === 'recent'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span>Recientes</span>
                {sortBy === 'recent' ? <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-35" />}
              </button>

              <button
                type="button"
                onClick={() => toggleSortColumn('price')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  sortBy.startsWith('price_')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span>Precio</span>
                {sortBy === 'price_desc' ? (
                  <ArrowDown className="w-3 h-3" />
                ) : sortBy === 'price_asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-35" />
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleSortColumn('stock')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  sortBy.startsWith('stock_')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span>Stock</span>
                {sortBy === 'stock_desc' ? (
                  <ArrowDown className="w-3 h-3" />
                ) : sortBy === 'stock_asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-35" />
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleSortColumn('margin')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  sortBy.startsWith('margin_')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span>Margen</span>
                {sortBy === 'margin_desc' ? (
                  <ArrowDown className="w-3 h-3" />
                ) : sortBy === 'margin_asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-35" />
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleSortColumn('name')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  sortBy.startsWith('name_')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span>Nombre</span>
                {sortBy === 'name_asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : sortBy === 'name_desc' ? (
                  <ArrowDown className="w-3 h-3" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-35" />
                )}
              </button>
            </div>
          </div>

          {/* CONTENIDO PC: Estado de Carga / Vacío / Lista de Tarjetas Horizontales o Grid */}
          {loading ? (
            <div className="p-3 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-stretch rounded-2xl border-2 border-gray-100 overflow-hidden animate-pulse p-4 gap-4"
                >
                  <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2.5 py-1">
                    <div className="h-4 w-56 bg-gray-100 rounded" />
                    <div className="h-3.5 w-80 bg-gray-100 rounded" />
                  </div>
                  <div className="w-32 space-y-2 py-1">
                    <div className="h-5 w-24 bg-gray-100 rounded ml-auto" />
                    <div className="h-6 w-28 bg-gray-100 rounded-full ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-14 text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                <Package className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-gray-900">
                {products.length === 0
                  ? 'Aún no hay productos cargados en tu catálogo web'
                  : 'No se encontraron productos con estos filtros'}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
                {products.length === 0
                  ? 'Crea tu primer producto con galería de fotos, precio web, costo unitario y control de stock independiente.'
                  : 'Prueba limpiando los filtros activos o buscando con otro código SKU o palabra clave.'}
              </p>
              <div className="pt-1 flex items-center justify-center gap-2">
                {products.length === 0 ? (
                  <button
                    type="button"
                    onClick={openCreateDrawer}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar primer producto
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setVisibilityFilter('all');
                      setFlowFilter('all');
                      setCategoryFilter('all');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition cursor-pointer"
                  >
                    Restablecer todos los filtros
                  </button>
                )}
              </div>
            </div>
          ) : viewMode === 'table' ? (
            /* MODO PRINCIPAL PC: TARJETAS HORIZONTALES YAXSELL (Gemelas de /orders) */
            <div className="p-3 space-y-2.5">
              {filteredProducts.map((product) => {
                const visible = isProductVisible(product);
                const unlimited = isUnlimitedStockProduct(product);
                const webStock = getWebStock(product);
                const attributes = getProductAttributes(product);
                const gallery = getProductGallery(product);
                const margin = computeMargin(product.precio, product.costo);
                const primaryStatus = getProductPrimaryStatus(product);
                const pRisk = getProductWebRisk(product);
                const isSel = selected.has(product.id);
                const isEditingThis = drawerOpen && editingProduct?.id === product.id;
                const displaySku = formatDisplayCode(product.code);
                const cardBg = isSel || isEditingThis ? '#eef2ff' : primaryStatus.bg;

                return (
                  <div
                    key={product.id}
                    onClick={() => openEditDrawer(product)}
                    className={`group flex flex-col rounded-2xl border transition-all cursor-pointer p-3.5 sm:p-4 gap-3 shadow-sm hover:shadow-md ${
                      isSel || isEditingThis
                        ? 'ring-2 ring-indigo-500 border-indigo-400'
                        : 'border-gray-200/90'
                    }`}
                    style={{ background: cardBg }}
                  >
                    {/* FILA 1 PC: Bloque Izquierdo (Checkbox + Miniatura 64x64 + Identidad) | Bloque Derecho (Precio + Costo + Estado) */}
                    <div className="flex items-center justify-between gap-4 flex-nowrap">
                      {/* Bloque Izquierdo con overflow-hidden para impedir cualquier desborde */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 overflow-hidden">
                        {/* Checkbox */}
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(product.id)}
                            className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer"
                          />
                        </div>

                        {/* Miniatura bloqueada estrictamente a 64x64px con Zoom Lightbox en Hover */}
                        <div
                          className="relative w-16 h-16 rounded-xl overflow-hidden bg-white border border-gray-200/90 shadow-sm shrink-0 group/img"
                          style={{ width: 64, height: 64, minWidth: 64, minHeight: 64 }}
                          onClick={(e) => {
                            if (product.imageUrl) {
                              e.stopPropagation();
                              setZoomImageUrl({
                                url: product.imageUrl,
                                title: product.name,
                                sku: displaySku,
                              });
                            }
                          }}
                        >
                          {product.imageUrl ? (
                            <>
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover transition duration-300 group-hover/img:scale-105"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                loading="lazy"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomImageUrl({
                                    url: product.imageUrl,
                                    title: product.name,
                                    sku: displaySku,
                                  });
                                }}
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                                title="Ampliar fotografía"
                              >
                                <ZoomIn size={16} className="drop-shadow" />
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-slate-50">
                              <ImageIcon size={18} />
                              <span className="text-[8px] font-bold uppercase mt-0.5 text-gray-400">Sin foto</span>
                            </div>
                          )}
                          {gallery.length > 1 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-[9px] font-extrabold text-white backdrop-blur-sm leading-none">
                              📷 {gallery.length}
                            </span>
                          )}
                        </div>

                        {/* Info central del Producto: Fila A (Título protagonista) + Fila B (SKU, Categoría, Marca, Descripción) */}
                        <div className="min-w-0 flex-1 overflow-hidden">
                          {/* Fila A: Barra de color + Nombre del producto en grande + Variantes / Alertas */}
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-1.5 h-4 rounded-full shrink-0"
                              style={{ background: primaryStatus.color }}
                            />
                            <p
                              className="font-extrabold text-gray-900 text-sm lg:text-base truncate group-hover:text-indigo-700 transition-colors"
                              title={product.name}
                            >
                              {product.name || 'Producto sin nombre'}
                            </p>

                            {(attributes.size || attributes.color || attributes.content) && (
                              <div className="hidden md:flex items-center gap-1 shrink-0">
                                {attributes.size && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/90 text-slate-700 border border-slate-200">
                                    Talla: {attributes.size}
                                  </span>
                                )}
                                {attributes.color && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/90 text-slate-700 border border-slate-200">
                                    {attributes.color}
                                  </span>
                                )}
                                {attributes.content && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50/90 text-sky-800 border border-sky-200">
                                    {attributes.content}
                                  </span>
                                )}
                              </div>
                            )}

                            {!product.imageUrl && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200 shrink-0">
                                ⚠️ FALTA FOTO
                              </span>
                            )}
                            {!unlimited && webStock <= 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-500 text-white rounded animate-pulse shrink-0">
                                AGOTADO
                              </span>
                            )}
                            {margin && margin.pct >= 45 && (
                              <span className="hidden xl:inline-flex text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded border border-emerald-200 shrink-0">
                                🔥 ALTO MARGEN
                              </span>
                            )}
                          </div>

                          {/* Fila B: SKU limpio + Categoría + Marca + Descripción en 1 línea */}
                          <div className="flex items-center gap-2 mt-1.5 min-w-0 overflow-hidden">
                            <span
                              className="font-mono text-xs text-indigo-600 font-extrabold shrink-0"
                              title={`Código completo: ${product.code}`}
                            >
                              {displaySku}
                            </span>

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 text-gray-700 border border-gray-200 text-[11px] font-bold shrink-0 max-w-[165px] truncate">
                              🏷️ {product.categoria || 'Sin categoría'}
                            </span>

                            {product.marca && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold shrink-0 max-w-[130px] truncate">
                                {product.marca}
                              </span>
                            )}

                            {unlimited && (
                              <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold shrink-0">
                                <InfinityIcon className="w-3 h-3" />
                                Stock Ilimitado
                              </span>
                            )}

                            {product.descripcion && (
                              <span
                                className="hidden md:inline text-xs text-gray-500 truncate min-w-0"
                                title={product.descripcion}
                              >
                                · {product.descripcion}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bloque Derecho Fijo: Precio + Costo/Ganancia + Botón Glossy de Estado */}
                      <div className="flex items-center gap-3.5 shrink-0 pl-3 border-l border-gray-200/60">
                        <div className="text-right">
                          <p className="font-extrabold text-gray-900 text-base lg:text-lg leading-tight tabular-nums whitespace-nowrap">
                            {formatCurrency(product.precio)}
                          </p>
                          <p className="text-[11px] text-gray-500 font-semibold mt-0.5 tabular-nums whitespace-nowrap">
                            {product.costo > 0 ? (
                              <>
                                Costo: {formatCurrency(product.costo)}
                                {margin && (
                                  <span
                                    className={`ml-1 font-extrabold ${
                                      margin.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                    }`}
                                  >
                                    ({margin.profit >= 0 ? '+' : ''}
                                    {margin.pct}%)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400">Sin costo reg.</span>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimelineProductId(product.id);
                          }}
                          className="text-xs font-extrabold px-4 py-2 rounded-full text-center whitespace-nowrap cursor-pointer hover:opacity-90 transition text-white shadow-sm shrink-0"
                          style={{ background: primaryStatus.color, minWidth: 122 }}
                          title="Clic para abrir estado y línea de salud del producto"
                        >
                          {primaryStatus.label}
                        </button>
                      </div>
                    </div>

                    {/* FILA 2: Barra Líquida de Salud de Stock + Rentabilidad + Controles Rápidos Inline */}
                    <div
                      className="flex items-center justify-between gap-3 pt-2.5 border-t border-gray-200/60 flex-wrap lg:flex-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Izquierda: Semáforo líquido StockRiskBadge + Unidades + Ganancia neta */}
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Salud Stock:
                          </span>
                          <StockRiskBadge risk={pRisk} compact />
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            unlimited
                              ? 'bg-sky-50 text-sky-800 border-sky-200'
                              : webStock <= 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : webStock <= 5
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {unlimited ? (
                            <>
                              <InfinityIcon className="w-3.5 h-3.5" />
                              <span>Disponible siempre</span>
                            </>
                          ) : (
                            <span>
                              📦 {webStock} {webStock === 1 ? 'unidad' : 'unidades'} web
                            </span>
                          )}
                        </span>

                        {margin && (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              margin.profit >= 0
                                ? 'bg-white/90 text-emerald-700 border-emerald-200/80'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            💰 Ganancia: {margin.profit >= 0 ? '+' : ''}
                            {formatCurrency(margin.profit)} / ud.
                          </span>
                        )}
                      </div>

                      {/* Derecha: Stepper de Stock en 1 clic + Ajuste Rápido + Visibilidad + Duplicar + Editar */}
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0 ml-auto">
                        {/* Stepper rápido de stock */}
                        <div className="inline-flex items-center bg-white/95 border border-gray-200 rounded-xl p-0.5 shadow-sm">
                          <button
                            type="button"
                            disabled={quickStockSavingId === product.id || (!unlimited && webStock <= 0)}
                            onClick={() => void handleQuickStockStep(product, -1)}
                            className="w-6 h-6 rounded-lg text-xs font-black text-gray-600 hover:bg-gray-100 disabled:opacity-35 transition cursor-pointer"
                            title="Restar 1 unidad de stock web"
                          >
                            −
                          </button>
                          <span className="px-2 text-[11px] font-mono font-extrabold text-gray-800 tabular-nums">
                            {quickStockSavingId === product.id ? '…' : unlimited ? '∞' : webStock}
                          </span>
                          <button
                            type="button"
                            disabled={quickStockSavingId === product.id}
                            onClick={() => void handleQuickStockStep(product, 1)}
                            className="w-6 h-6 rounded-lg text-xs font-black text-indigo-600 hover:bg-indigo-50 disabled:opacity-35 transition cursor-pointer"
                            title="Sumar 1 unidad de stock web"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            disabled={quickStockSavingId === product.id}
                            onClick={() => void handleQuickStockStep(product, 'unlimited')}
                            className={`px-1.5 h-6 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              unlimited
                                ? 'bg-sky-600 text-white'
                                : 'text-gray-400 hover:text-sky-700 hover:bg-sky-50'
                            }`}
                            title="Alternar Stock ∞ Ilimitado"
                          >
                            ∞
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => openQuickAdjustModal(product)}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition flex items-center gap-1 cursor-pointer"
                          title="Ajuste rápido de precio, costo y stock"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Ajuste rápido</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleVisibility(product)}
                          disabled={togglingId === product.id}
                          className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                            visible
                              ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                              : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{togglingId === product.id ? '…' : visible ? 'Ocultar' : 'Publicar'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDuplicateProduct(product)}
                          disabled={duplicatingId === product.id}
                          className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition cursor-pointer"
                          title="Duplicar producto"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditDrawer(product)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* MODO SECUNDARIO: VITRINA GRID BOUTIQUE */
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => {
                const visible = isProductVisible(product);
                const unlimited = isUnlimitedStockProduct(product);
                const webStock = getWebStock(product);
                const margin = computeMargin(product.precio, product.costo);
                const gallery = getProductGallery(product);
                const pRisk = getProductWebRisk(product);
                const primaryStatus = getProductPrimaryStatus(product);
                const displaySku = formatDisplayCode(product.code);

                return (
                  <article
                    key={product.id}
                    onClick={() => openEditDrawer(product)}
                    className="group flex flex-col rounded-2xl border border-gray-200/90 bg-white overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div
                      className="relative aspect-square bg-slate-50 overflow-hidden border-b border-gray-100"
                      style={{ aspectRatio: '1 / 1' }}
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                          <ImageIcon className="w-10 h-10" />
                          <span className="text-xs font-semibold text-gray-400 mt-1">Sin imagen</span>
                        </div>
                      )}

                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-extrabold text-white shadow-sm"
                          style={{ background: primaryStatus.color }}
                        >
                          {primaryStatus.label}
                        </span>
                        {gallery.length > 1 && (
                          <span className="px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-bold backdrop-blur-sm">
                            📷 {gallery.length}
                          </span>
                        )}
                      </div>

                      {product.imageUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomImageUrl({ url: product.imageUrl, title: product.name, sku: displaySku });
                          }}
                          className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-xl bg-white/90 hover:bg-white text-gray-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          title="Ampliar foto"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-gray-400 mb-1">
                          <span className="text-indigo-600 uppercase truncate">
                            {product.categoria || 'Sin categoría'}
                          </span>
                          <span className="font-mono shrink-0" title={product.code}>
                            {displaySku}
                          </span>
                        </div>
                        <h3 className="text-sm font-extrabold text-gray-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                          {product.name}
                        </h3>
                      </div>

                      <div className="space-y-2.5 pt-2 border-t border-gray-100">
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <p className="text-base font-black text-gray-900 tabular-nums">
                              {formatCurrency(product.precio)}
                            </p>
                            {margin && (
                              <p className="text-[10px] font-bold text-emerald-600">
                                +{margin.pct}% ({formatCurrency(margin.profit)})
                              </p>
                            )}
                          </div>
                          <StockRiskBadge risk={pRisk} compact />
                        </div>

                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => void handleToggleVisibility(product)}
                            disabled={togglingId === product.id}
                            className="flex-1 py-1.5 rounded-xl text-xs font-bold border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                          >
                            {visible ? 'Ocultar' : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditDrawer(product)}
                            className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
                          >
                            Editar ({unlimited ? '∞' : webStock})
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Barra Resumen Inferior (PC) — idéntica a /orders */}
          {filteredProducts.length > 0 && !loading && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 border-t-2 border-gray-200 bg-gray-50">
              <div>
                <p className="text-sm font-bold text-gray-700">
                  {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''} en vista
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Modo inventario web independiente · Importadora Carlitos
                </p>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-right">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">En Vitrina</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {filteredProducts.filter(isProductVisible).length} visibles
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Stock ∞</p>
                  <p className="text-sm font-semibold text-sky-600">
                    {filteredProducts.filter(isUnlimitedStockProduct).length} ilimitados
                  </p>
                </div>
                {stats.avgMargin !== null && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Margen ∅</p>
                    <p className="text-sm font-semibold text-gray-700">{stats.avgMargin}%</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    Valor Referencial
                  </p>
                  <p className="text-base font-extrabold text-gray-900 tabular-nums">
                    {formatCurrency(stats.totalCatalogValue)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7. MODAL: LÍNEA DE SALUD Y ESTADO DEL PRODUCTO (Gemelo de Línea de Tiempo de /orders) */}
      {timelineProductId && (() => {
        const tProd = products.find((p) => p.id === timelineProductId);
        if (!tProd) return null;
        const primaryStatus = getProductPrimaryStatus(tProd);
        const visible = isProductVisible(tProd);
        const unlimited = isUnlimitedStockProduct(tProd);
        const webStock = getWebStock(tProd);
        const margin = computeMargin(tProd.precio, tProd.costo);
        const checks = [
          {
            key: 'with_photo',
            ok: Boolean(tProd.imageUrl),
            label: 'Fotografía HD cargada',
            desc: tProd.imageUrl ? 'El producto cuenta con imagen principal optimizada.' : 'Falta subir la foto principal del producto.',
          },
          {
            key: 'price',
            ok: (Number(tProd.precio) || 0) > 0,
            label: `Precio de venta configurado (${formatCurrency(tProd.precio)})`,
            desc: (Number(tProd.precio) || 0) > 0 ? 'Listo para cobrar en el checkout web.' : 'El precio está en $0.',
          },
          {
            key: 'with_margin',
            ok: Boolean(margin && margin.profit > 0),
            label: margin ? `Rentabilidad calculada (+${margin.pct}% · +${formatCurrency(margin.profit)})` : 'Costo unitario opcional pendiente',
            desc: margin ? 'Tu ganancia por unidad está monitoreada.' : 'Agrega el costo unitario para medir ganancias reales.',
          },
          {
            key: 'in_stock',
            ok: unlimited || webStock > 0,
            label: unlimited ? 'Stock Web Ilimitado (∞)' : `Stock Web disponible (${webStock} uds)`,
            desc: unlimited ? 'Nunca se agota en la vitrina online.' : webStock > 0 ? 'Con unidades listas para despacho.' : 'Sin stock disponible (0 unidades).',
          },
          {
            key: 'published',
            ok: visible && (Number(tProd.precio) || 0) > 0 && (unlimited || webStock > 0),
            label: visible ? 'Publicado en Vitrina Web' : 'Oculto a compradores',
            desc: visible ? 'Los clientes pueden ver y comprar este producto.' : 'Producto pausado temporalmente en la tienda.',
          },
        ];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => setTimelineProductId(null)}
          >
            <div
              className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-white shadow-sm"
                    style={{ background: primaryStatus.color }}
                  >
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-800 truncate">{tProd.name}</h3>
                    <p className="text-xs text-indigo-600 font-mono font-bold" title={tProd.code}>
                      {formatDisplayCode(tProd.code)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTimelineProductId(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                {checks.map((step, idx) => (
                  <div key={step.key} className="flex items-start gap-3 relative pb-1">
                    {idx < checks.length - 1 && (
                      <div
                        className="absolute left-[14px] top-8 bottom-0 w-[2px] rounded-full"
                        style={{ background: step.ok ? '#10b981' : '#e5e7eb', opacity: step.ok ? 0.5 : 1 }}
                      />
                    )}
                    <div
                      className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${
                        step.ok
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                          : 'bg-amber-100 text-amber-700 border border-amber-300'
                      }`}
                    >
                      {step.ok ? '✓' : '!'}
                    </div>
                    <div className="pt-0.5 flex-1">
                      <p className={`text-xs font-bold ${step.ok ? 'text-gray-900' : 'text-amber-800'}`}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-gray-400 leading-snug mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await handleToggleVisibility(tProd);
                    setTimelineProductId(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    visible
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {visible ? 'Ocultar de tienda' : 'Publicar en vitrina'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = tProd;
                    setTimelineProductId(null);
                    openEditDrawer(target);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
                >
                  Editar completo →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 8. MODAL: AJUSTE RÁPIDO DE PRECIO, COSTO Y STOCK WEB */}
      {quickAdjustProduct && (() => {
        const previewMargin = computeMargin(Number(quickAdjustPrice) || 0, Number(quickAdjustCost) || 0);
        const previewRisk: ProductRisk = quickAdjustUnlimited
          ? {
              pct: 100,
              level: 'verde',
              cobertura: 999,
              pisoCritico: 0,
              velocity: 0,
              coldStart: false,
              label: 'Stock ilimitado',
            }
          : getProductRisk({
              stock: Math.max(0, Number(quickAdjustStock) || 0),
              salesVelocity7d: 0,
              price: Math.max(0, Number(quickAdjustPrice) || 2500),
            });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => !quickAdjustSaving && setQuickAdjustProduct(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/80">
                <div className="min-w-0 pr-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                    ⚡ Ajuste Rápido Comercial
                  </p>
                  <h3 className="text-sm font-extrabold text-gray-900 truncate mt-0.5">
                    {quickAdjustProduct.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickAdjustProduct(null)}
                  className="w-8 h-8 rounded-full hover:bg-gray-200/70 flex items-center justify-center text-gray-400 text-xl cursor-pointer"
                >
                  ×
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Precio web ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={quickAdjustPrice}
                      onChange={(e) => setQuickAdjustPrice(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Costo unitario ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={quickAdjustCost}
                      onChange={(e) => setQuickAdjustCost(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {Number(quickAdjustCost) > 0 && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs">
                    <span className="font-bold text-emerald-800">
                      {previewMargin
                        ? `Ganancia: ${formatCurrency(previewMargin.profit)} (${previewMargin.pct}%)`
                        : 'Calcula tu precio:'}
                    </span>
                    <div className="flex items-center gap-1">
                      {[30, 50, 80, 100].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            const c = Math.max(0, Number(quickAdjustCost) || 0);
                            setQuickAdjustPrice(String(Math.round((c * (1 + m / 100)) / 10) * 10));
                          }}
                          className="px-2 py-0.5 rounded-lg bg-white text-emerald-700 border border-emerald-200 text-[10px] font-extrabold hover:bg-emerald-100 cursor-pointer"
                        >
                          {m === 100 ? 'x2' : `+${m}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Stock Web Exclusivo</span>
                    <StockRiskBadge risk={previewRisk} compact />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      disabled={quickAdjustUnlimited}
                      value={quickAdjustUnlimited ? '' : quickAdjustStock}
                      placeholder={quickAdjustUnlimited ? '∞ Ilimitado' : '0'}
                      onChange={(e) => setQuickAdjustStock(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setQuickAdjustUnlimited((v) => !v)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer flex items-center gap-1.5 ${
                        quickAdjustUnlimited
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <InfinityIcon className="w-4 h-4" />
                      <span>Ilimitado</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {QUICK_STOCK_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setQuickAdjustUnlimited(false);
                          setQuickAdjustStock(String(preset));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 cursor-pointer"
                      >
                        {preset} uds
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setQuickAdjustProduct(null)}
                    disabled={quickAdjustSaving}
                    className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveQuickAdjust()}
                    disabled={quickAdjustSaving}
                    className="flex-[1.6] py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {quickAdjustSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Guardar cambios
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 9. LIGHTBOX / ZOOM MODAL DE FOTOGRAFÍA — Idéntico a /orders */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/90">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-sm font-black text-gray-900 truncate">{zoomImageUrl.title}</p>
                {zoomImageUrl.sku && (
                  <p className="text-xs font-mono font-semibold text-indigo-600 mt-0.5">
                    SKU: {zoomImageUrl.sku}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomImageUrl(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition text-sm font-bold cursor-pointer"
                title="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-900 flex items-center justify-center min-h-[280px] max-h-[75vh]">
              <img
                src={zoomImageUrl.url}
                alt={zoomImageUrl.title}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* 10. DRAWER LATERAL DE EDICIÓN / CREACIÓN — Portal Yaxsell + Fix pr-14 del botón N */}
      {drawerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex justify-end"
            style={{ background: 'rgba(15, 23, 42, 0.38)', backdropFilter: 'blur(4px)', animation: 'kcFadeIn 0.2s ease-out' }}
            onClick={closeDrawer}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-form-title"
              onClick={(e) => e.stopPropagation()}
              onPaste={handleImagePaste}
              style={{ animation: 'kcSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
              className="bg-[#F8FAFC] h-full w-full max-w-[540px] shadow-2xl flex flex-col relative border-l border-gray-200 overflow-hidden"
            >
              {/* Header del Drawer estilo /orders */}
              <div className="px-5 py-4 border-b border-gray-200/80 flex items-center justify-between bg-white shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 id="product-form-title" className="text-base sm:text-lg font-extrabold text-gray-900">
                      {editingProduct ? 'Editar producto' : 'Agregar producto'}
                    </h2>
                    {editingProduct && (
                      <span
                        className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100"
                        title={editingProduct.code}
                      >
                        {formatDisplayCode(editingProduct.code)}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        form.visible
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {form.visible ? '🌐 Visible en web' : '🔒 Oculto'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Completa fotos, precios, margen y atributos de vitrina.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Cerrar formulario"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xl font-bold leading-none transition cursor-pointer"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                  {/* Resumen Financiero Superior tipo /orders */}
                  <div className="bg-indigo-50/60 rounded-2xl p-3.5 border border-indigo-100 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block">
                        Precio en Vitrina
                      </span>
                      <span className="text-2xl font-black text-gray-900 tabular-nums">
                        {formatCurrency(Number(form.price) || 0)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block mb-1">
                        Rentabilidad & Stock
                      </span>
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        {formMargin ? (
                          <span
                            className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${
                              formMargin.profit >= 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {formMargin.profit >= 0 ? '+' : ''}
                            {formatCurrency(formMargin.profit)} ({formMargin.pct}%)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">
                            Sin costo
                          </span>
                        )}
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200">
                          {form.unlimitedStock ? '∞ Ilimitado' : `${Math.max(0, Number(form.stock) || 0)} uds`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 1: GALERÍA 3 FOTOS + VISTA PREVIA EN VIVO */}
                  <section className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-600" />
                        Foto principal y galería
                      </span>

                      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                        {([1, 2, 3] as const).map((slot) => {
                          const hasImg = Boolean(
                            slot === 1 ? form.imageUrl : slot === 2 ? form.imageUrl2 : form.imageUrl3
                          );
                          const isCurr = activeUploadSlot === slot;
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setActiveUploadSlot(slot)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                isCurr ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                              }`}
                            >
                              <span>Foto {slot}</span>
                              {hasImg && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageInputChange}
                      className="hidden"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                      {/* Dropzone Izquierdo */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDraggingImage(true);
                        }}
                        onDragLeave={() => setDraggingImage(false)}
                        onDrop={handleImageDrop}
                        className={`sm:col-span-7 rounded-2xl border-2 border-dashed p-3.5 transition flex flex-col justify-between gap-3 ${
                          draggingImage
                            ? 'border-indigo-500 bg-indigo-50/60'
                            : 'border-gray-200 bg-slate-50/70 hover:border-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="relative w-20 h-20 rounded-xl bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center shadow-sm"
                            style={{ width: 80, height: 80, minWidth: 80, minHeight: 80 }}
                          >
                            {activeSlotUrl ? (
                              <>
                                <img
                                  src={activeSlotUrl}
                                  alt="Preview"
                                  className="w-full h-full object-cover"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setSlotUrl(activeUploadSlot, '')}
                                  aria-label="Quitar imagen"
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-600 transition cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <div className="text-center text-gray-300">
                                <Upload className="w-5 h-5 mx-auto" />
                                <span className="text-[9px] font-bold block mt-0.5 text-gray-400">
                                  Slot {activeUploadSlot}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingImage}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-sm cursor-pointer disabled:opacity-60"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                {uploadingImage ? 'Subiendo…' : 'Elegir imagen'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handlePasteFromClipboardButton()}
                                disabled={uploadingImage}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition cursor-pointer"
                              >
                                Pegar imagen
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-400 leading-snug">
                              Arrastra aquí o presiona <strong>Ctrl+V</strong>. Se optimiza a WebP automáticamente.
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowUrlInput((v) => !v)}
                              className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                            >
                              {showUrlInput ? 'Ocultar enlace URL' : 'Pegar enlace URL directo'}
                            </button>
                          </div>
                        </div>

                        {showUrlInput && (
                          <input
                            type="url"
                            value={activeSlotUrl}
                            onChange={(e) => setSlotUrl(activeUploadSlot, e.target.value)}
                            placeholder="https://ejemplo.com/imagen.webp"
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </div>

                      {/* Mini Card Vista Previa Tienda en Vivo */}
                      <div className="sm:col-span-5 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-500">
                            Vista Previa Vitrina
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        </div>
                        <div
                          className="aspect-[4/3] rounded-xl bg-slate-50 border border-gray-100 overflow-hidden mb-2 flex items-center justify-center"
                          style={{ aspectRatio: '4 / 3', maxHeight: 112 }}
                        >
                          {form.imageUrl ? (
                            <img
                              src={form.imageUrl}
                              alt="Vitrina"
                              className="w-full h-full object-cover"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-gray-300" />
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase text-indigo-600 truncate">
                            {form.category || 'Categoría'}
                          </p>
                          <p className="text-xs font-extrabold text-gray-900 truncate">
                            {form.name || 'Nombre del producto'}
                          </p>
                          <p className="text-xs font-black text-emerald-600 mt-0.5 tabular-nums">
                            {formatCurrency(Number(form.price) || 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* SECCIÓN 2: IDENTIDAD, CATEGORÍA Y MARCA */}
                  <section className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Nombre del producto <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="Ej. Perfume Lattafa Khamrah EDP 100ml"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-gray-700">Descripción</label>
                        <span className="text-[10px] text-gray-400">{form.description.length} caract.</span>
                      </div>
                      <textarea
                        rows={2}
                        value={form.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        placeholder="Notas aromáticas, materiales, beneficios o qué incluye..."
                        className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label htmlFor="web-product-category" className="text-xs font-bold text-gray-700">
                            Categoría
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setCreatingCategory((c) => !c);
                              setNewCategoryName('');
                            }}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            + Crear categoría
                          </button>
                        </div>
                        <select
                          id="web-product-category"
                          value={form.category}
                          onChange={(e) => updateField('category', e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Marca</label>
                        <input
                          type="text"
                          list="web-product-brands"
                          value={form.brand}
                          onChange={(e) => updateField('brand', e.target.value)}
                          placeholder="Ej. Lattafa, Dior, Zara"
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <datalist id="web-product-brands">
                          {brands.map((brand) => (
                            <option key={brand} value={brand} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {creatingCategory && (
                      <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-indigo-600 shrink-0" />
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Ej. Perfumes Árabes"
                          aria-label="Nombre de la categoría"
                          className="flex-1 min-w-[150px] px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateCategory()}
                          disabled={savingCategory}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer disabled:opacity-60"
                        >
                          {savingCategory ? 'Creando…' : 'Crear'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingCategory(false);
                            setNewCategoryName('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </section>

                  {/* SECCIÓN 3: PRECIO, COSTO Y STOCK WEB */}
                  <section className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        Precio, Costo e Inventario Web
                      </span>
                      <div className="flex items-center gap-1">
                        {[30, 50, 80, 100].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => applyMarginPreset(m)}
                            className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold hover:bg-emerald-100 transition cursor-pointer"
                            title={`Calcular precio con +${m}% sobre el costo`}
                          >
                            {m === 100 ? 'x2' : `+${m}%`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Precio web ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={form.price}
                          onChange={(e) => updateField('price', e.target.value)}
                          placeholder="19990"
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Costo unitario ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.cost}
                          onChange={(e) => updateField('cost', e.target.value)}
                          placeholder="10000"
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Stock web
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={form.unlimitedStock}
                          value={form.unlimitedStock ? '' : form.stock}
                          onChange={(e) => updateField('stock', e.target.value)}
                          placeholder={form.unlimitedStock ? '∞ Ilimitado' : '0'}
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Botones rápidos de Stock Ilimitado y Presets */}
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50/70 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.unlimitedStock}
                          onChange={(e) => updateField('unlimitedStock', e.target.checked)}
                          className="w-4 h-4 rounded text-sky-600 border-gray-300"
                        />
                        <span className="text-xs font-extrabold text-sky-800 flex items-center gap-1">
                          <InfinityIcon className="w-3.5 h-3.5" />
                          Stock ilimitado (siempre disponible)
                        </span>
                      </label>

                      <div className="flex items-center gap-1 flex-wrap">
                        {QUICK_STOCK_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              updateField('unlimitedStock', false);
                              updateField('stock', String(preset));
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-[11px] font-bold text-gray-600 transition cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* SECCIÓN 4: VARIANTES & ATRIBUTOS (Talla, Color, Contenido) */}
                  <section className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm space-y-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-600" />
                      Variantes y especificaciones (opcional)
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          <Ruler className="w-3 h-3 inline mr-1 text-gray-400" />
                          Talla
                        </label>
                        <input
                          type="text"
                          list="quick-sizes-list"
                          value={form.size}
                          onChange={(e) => updateField('size', e.target.value)}
                          placeholder="M, L, XL, 42"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <datalist id="quick-sizes-list">
                          {QUICK_SIZES.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          <Palette className="w-3 h-3 inline mr-1 text-gray-400" />
                          Color
                        </label>
                        <input
                          type="text"
                          value={form.color}
                          onChange={(e) => updateField('color', e.target.value)}
                          placeholder="Negro, Dorado, Azul"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          <Tag className="w-3 h-3 inline mr-1 text-gray-400" />
                          Contenido
                        </label>
                        <input
                          type="text"
                          list="quick-contents-list"
                          value={form.content}
                          onChange={(e) => updateField('content', e.target.value)}
                          placeholder="100 ml, Set x3"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <datalist id="quick-contents-list">
                          {QUICK_CONTENTS.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                  </section>

                  {/* SECCIÓN 5: VISIBILIDAD EN TIENDA */}
                  <label className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm cursor-pointer hover:border-indigo-200 transition">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          form.visible ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {form.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </div>
                      <div>
                        <span className="text-sm font-bold text-gray-900 block">Mostrar en la tienda</span>
                        <span className="text-xs text-gray-500">
                          {form.visible
                            ? 'Activo y visible inmediatamente para los clientes.'
                            : 'Guardado en borrador privado (oculto al público).'}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.visible}
                      onChange={(e) => updateField('visible', e.target.checked)}
                      className="w-5 h-5 rounded text-indigo-600 border-gray-300 cursor-pointer"
                    />
                  </label>
                </div>

                {/* FOOTER STICKY CON pr-14 PARA EVITAR EL BOTÓN N DE NEXT.JS */}
                <div className="px-5 py-3.5 pr-14 border-t border-gray-200 bg-white flex items-center justify-between gap-2.5 shrink-0">
                  {editingProduct ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(editingProduct)}
                      disabled={saving || uploadingImage}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={closeDrawer}
                      disabled={saving || uploadingImage}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs sm:text-sm font-bold hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving || uploadingImage}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer active:scale-[0.99] disabled:opacity-60"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Guardando…</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 stroke-[2.5]" />
                          <span>Guardar producto</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            <style>{`
              @keyframes kcSlideIn {
                0% { transform: translateX(100%); }
                100% { transform: translateX(0); }
              }
              @keyframes kcFadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
              }
            `}</style>
          </div>,
          document.body
        )}
    </div>
  );
}
