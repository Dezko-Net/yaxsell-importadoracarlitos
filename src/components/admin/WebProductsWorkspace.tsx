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
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  LayoutGrid,
  List,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { uploadFile, withPrefix } from '@/lib/db';
import { compressProductImageClient } from '@/lib/compress-product-image-client';
import {
  clearPosProductsCache,
  createFirebaseErpProduct,
  deleteFirebaseErpProduct,
  fetchAllFirebaseErpProducts,
  purgeServerProductsCache,
  updateFirebaseErpProduct,
  type FirebaseErpProduct,
} from '@/lib/firebaseErpService';
import {
  ReadinessRing,
  STUDIO_SCOPED_CSS,
  triggerHaptic,
} from './products-web/ProductStudioComponents';
import {
  MobileFloatingIsland,
  ProductStudioSheet,
  QuickCommercialSheet,
  type StudioProductFormState,
} from './products-web/ProductStudioSheet';

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
    rawWebStock !== undefined
      ? Math.max(0, Math.trunc(Number(rawWebStock) || 0))
      : Math.max(0, Math.trunc(Number(item.stock) || 0));

  return {
    id: item.$id,
    code: item.sku || item.$id,
    name: item.nombre || String(raw.NAME || ''),
    descripcion: item.description || String(raw.DESCRIPTION || ''),
    precio: Number(item.precio_venta_1 || raw.PRICE || 0),
    costo: Number(item.costo_uni || raw.COST || 0),
    stock: unlimited ? 0 : effectiveWebStock,
    categoria:
      item.category === 'General' && !raw.CATEGORYID
        ? ''
        : item.category || String(raw.CATEGORYID || ''),
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

type ProductFormState = StudioProductFormState;

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

const DRAFT_STORAGE_KEY = 'yaxsell_carlitos_product_draft_v1';

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

const FLOW_STAGE_COLORS: Record<string, { color: string; bg: string }> = {
  draft: { color: '#9a3412', bg: '#fff7ed' },
  with_photo: { color: '#334155', bg: '#f1f5f9' },
  with_margin: { color: '#334155', bg: '#f1f5f9' },
  in_stock: { color: '#166534', bg: '#f0fdf4' },
  published: { color: '#166534', bg: '#f0fdf4' },
  low_stock: { color: '#92400e', bg: '#fffbeb' },
  hidden: { color: '#475569', bg: '#f1f5f9' },
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
      label: 'Agotado',
      color: '#991b1b',
      bg: '#fef2f2',
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
      label: `Quedan ${stock}`,
      color: FLOW_STAGE_COLORS.low_stock.color,
      bg: FLOW_STAGE_COLORS.low_stock.bg,
    };
  }
  return {
    key: 'published',
    label: unlimited ? 'Activo · ∞' : 'En Vitrina',
    color: '#166534',
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

const ITEMS_PER_PAGE = 20;

function buildPaginationItems(
  current: number,
  total: number
): Array<number | 'ellipsis-start' | 'ellipsis-end'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, 'ellipsis-end', total];
  }
  if (current >= total - 2) {
    return [1, 'ellipsis-start', total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis-start', current - 1, current, current + 1, 'ellipsis-end', total];
}

function getCardStripeColor(statusKey: FlowStageFilter, webStock: number, unlimited: boolean): string {
  if (statusKey === 'published') return '#10b981';
  if (statusKey === 'draft') return '#f59e0b';
  if (statusKey === 'low_stock') return !unlimited && webStock <= 0 ? '#ef4444' : '#f59e0b';
  return '#94a3b8';
}

export default function WebProductsWorkspace() {
  const [products, setProducts] = useState<ErpProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeUploadSlot, setActiveUploadSlot] = useState<1 | 2 | 3>(1);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [quickStockSavingId, setQuickStockSavingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [flowFilter, setFlowFilter] = useState<FlowStageFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [mobileGridMode, setMobileGridMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ErpProduct | null>(null);
  const [quickAdjustProduct, setQuickAdjustProduct] = useState<ErpProduct | null>(null);
  const [quickAdjustPrice, setQuickAdjustPrice] = useState('');
  const [quickAdjustCost, setQuickAdjustCost] = useState('');
  const [quickAdjustStock, setQuickAdjustStock] = useState('');
  const [quickAdjustUnlimited, setQuickAdjustUnlimited] = useState(false);
  const [quickAdjustSaving, setQuickAdjustSaving] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<{
    url: string;
    title: string;
    sku?: string;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [savedDraft, setSavedDraft] = useState<ProductFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storedCategories, setStoredCategories] = useState<string[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const catalogTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Load saved draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProductFormState;
        if (parsed && (parsed.name || parsed.imageUrl || parsed.price)) {
          setSavedDraft(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Auto-persist unsaved new-product drafts (Linear zero-loss pattern)
  useEffect(() => {
    if (!drawerOpen || editingProduct) return;
    const hasContent = Boolean(
      form.name.trim() ||
        form.imageUrl.trim() ||
        form.price.trim() ||
        form.description.trim()
    );
    if (!hasContent) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
        setSavedDraft(form);
      } catch {
        // ignore quota errors
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [drawerOpen, editingProduct, form]);

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
      new Set(
        [
          ...storedCategories,
          ...products.map((item) => item.categoria.trim()).filter(Boolean),
          form.category.trim(),
        ].filter(Boolean)
      )
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
    const outOfStock = products.filter(
      (p) => !isUnlimitedStockProduct(p) && getWebStock(p) === 0
    ).length;
    const lowStock = products.filter((p) => {
      if (isUnlimitedStockProduct(p)) return false;
      const s = getWebStock(p);
      return s > 0 && s <= 5;
    }).length;
    const withoutPhoto = products.filter((p) => !p.imageUrl).length;
    const incomplete = products.filter(
      (p) => !p.imageUrl || (Number(p.precio) || 0) <= 0
    ).length;

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
    const activePct = total > 0 ? Math.round((visible / total) * 100) : 0;

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
      activePct,
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

  useEffect(() => {
    setCurrentPage(1);
  }, [search, visibilityFilter, flowFilter, categoryFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pageEndIndex = Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredProducts.length);
  const paginatedProducts = useMemo(
    () => filteredProducts.slice(pageStartIndex, pageEndIndex),
    [filteredProducts, pageStartIndex, pageEndIndex]
  );
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages]
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.max(1, Math.min(totalPages, nextPage));
      if (clamped === safePage) return;
      triggerHaptic('light');
      setCurrentPage(clamped);
      requestAnimationFrame(() => {
        catalogTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [safePage, totalPages]
  );

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

  function cycleMobileSort() {
    triggerHaptic('light');
    const order: SortKey[] = ['recent', 'price_desc', 'margin_desc', 'stock_asc', 'name_asc'];
    const idx = order.indexOf(sortBy);
    setSortBy(order[(idx + 1) % order.length]);
  }

  const mobileSortLabel = useMemo(() => {
    if (sortBy === 'price_desc') return 'Mayor precio';
    if (sortBy === 'price_asc') return 'Menor precio';
    if (sortBy === 'margin_desc') return 'Mayor margen';
    if (sortBy === 'stock_asc') return 'Menor stock';
    if (sortBy === 'name_asc') return 'A → Z';
    return 'Recientes';
  }, [sortBy]);

  function openCreateDrawer() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setActiveUploadSlot(1);
    setImagePreviewError(false);
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
    setImagePreviewError(false);
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
    setImagePreviewError(false);
    setCreatingCategory(false);
    setNewCategoryName('');
  }

  function updateField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setSlotUrl(slot: 1 | 2 | 3, url: string) {
    if (slot === 2) updateField('imageUrl2', url);
    else if (slot === 3) updateField('imageUrl3', url);
    else updateField('imageUrl', url);
  }

  function clearSavedDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedDraft(null);
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
      if (!auth.currentUser) throw new Error('Inicia sesión nuevamente para subir imágenes.');
      const compressed = await compressProductImageClient(file);
      const extension =
        compressed.type === 'image/webp'
          ? 'webp'
          : compressed.type === 'image/png'
            ? 'png'
            : compressed.type === 'image/jpeg'
              ? 'jpg'
              : (compressed.name.split('.').pop() || 'img').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const id =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await uploadFile(withPrefix('products', `${id}.${extension}`), compressed);
      setImagePreviewError(false);
      setSlotUrl(targetSlot, result.url);
      setNotice(
        targetSlot === 1
          ? 'Foto principal optimizada y cargada.'
          : `Foto #${targetSlot} de galería cargada.`
      );
    } catch (err: any) {
      setError(
        err?.code === 'storage/unauthorized'
          ? 'No tienes permiso para subir imágenes. Vuelve a iniciar sesión como administrador.'
          : err?.message || 'No se pudo subir la imagen.'
      );
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
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const text = event.clipboardData?.getData('text/plain')?.trim() || '';
    if (/^https?:\/\//i.test(text)) {
      event.preventDefault();
      setImagePreviewError(false);
      setSlotUrl(activeUploadSlot, text);
      setError(null);
    }
  }

  async function handlePasteFromClipboardButton() {
    setError(null);
    try {
      if (!navigator.clipboard?.read) {
        const text = (await navigator.clipboard?.readText?.())?.trim() || '';
        if (/^https?:\/\//i.test(text)) {
          setImagePreviewError(false);
          setSlotUrl(activeUploadSlot, text);
          return;
        }
        setError('Usa Ctrl+V (o Cmd+V en Mac) para pegar la imagen copiada.');
        return;
      }
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
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const text = (await (await item.getType('text/plain')).text()).trim();
          if (/^https?:\/\//i.test(text)) {
            setImagePreviewError(false);
            setSlotUrl(activeUploadSlot, text);
            return;
          }
        }
      }
      setError('No hay ninguna imagen ni enlace de imagen copiado en el portapapeles.');
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
        clearSavedDraft();
        setNotice(`Producto "${cleanName}" agregado al catálogo.`);
      }

      triggerHaptic('success');
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
    triggerHaptic('medium');
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

  async function handleQuickStockStep(
    product: ErpProduct,
    deltaOrUnlimited: number | 'unlimited'
  ) {
    triggerHaptic('light');
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
    triggerHaptic('light');
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
      const nextStock = quickAdjustUnlimited
        ? 99999
        : Math.max(0, Math.trunc(Number(quickAdjustStock) || 0));

      const ok = await updateFirebaseErpProduct(quickAdjustProduct.id, {
        precio_venta_1: nextPrice,
        costo_uni: nextCost,
        web_stock: nextStock,
        ilimitado: quickAdjustUnlimited,
        is_draft: false,
        web_managed: true,
      });
      if (!ok) throw new Error('No se pudo guardar el ajuste rápido.');
      triggerHaptic('success');
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
    triggerHaptic('light');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allPageSelected =
    paginatedProducts.length > 0 && paginatedProducts.every((p) => selected.has(p.id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const p of paginatedProducts) next.delete(p.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const p of paginatedProducts) next.add(p.id);
        return next;
      });
    }
  }

  async function handleBulkAction(action: 'show' | 'hide' | 'unlimited' | 'delete') {
    if (selected.size === 0) return;
    if (
      action === 'delete' &&
      !window.confirm(`¿Eliminar ${selected.size} producto(s) seleccionados?`)
    ) {
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
    const headers = [
      'SKU',
      'Nombre',
      'Categoria',
      'Marca',
      'Precio Web',
      'Costo',
      'Stock Web',
      'Ilimitado',
      'Visible',
      'Talla',
      'Color',
      'Contenido',
    ];
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

  const resetAllFilters = () => {
    setSearch('');
    setVisibilityFilter('all');
    setFlowFilter('all');
    setCategoryFilter('all');
  };

  // Stage pills for mobile & desktop quick diagnostic rail
  const stagePills: Array<{
    id: string;
    label: string;
    count: number;
    active: boolean;
    dotColor: string;
    onClick: () => void;
  }> = [
    {
      id: 'all',
      label: 'Todos',
      count: stats.total,
      active: visibilityFilter === 'all' && flowFilter === 'all',
      dotColor: '#64748b',
      onClick: () => {
        setVisibilityFilter('all');
        setFlowFilter('all');
      },
    },
    {
      id: 'visible',
      label: 'En Vitrina',
      count: stats.visible,
      active: visibilityFilter === 'visible' && flowFilter === 'all',
      dotColor: '#16a34a',
      onClick: () => {
        setVisibilityFilter(visibilityFilter === 'visible' ? 'all' : 'visible');
        setFlowFilter('all');
      },
    },
    {
      id: 'draft',
      label: 'Por Completar',
      count: flowCounts.draft,
      active: flowFilter === 'draft',
      dotColor: '#d97706',
      onClick: () => {
        setVisibilityFilter('all');
        setFlowFilter(flowFilter === 'draft' ? 'all' : 'draft');
      },
    },
    {
      id: 'low_stock',
      label: 'Stock Bajo / 0',
      count: flowCounts.low_stock,
      active: flowFilter === 'low_stock',
      dotColor: '#ca8a04',
      onClick: () => {
        setVisibilityFilter('all');
        setFlowFilter(flowFilter === 'low_stock' ? 'all' : 'low_stock');
      },
    },
    {
      id: 'hidden',
      label: 'Ocultos',
      count: stats.hidden,
      active: visibilityFilter === 'hidden',
      dotColor: '#94a3b8',
      onClick: () => {
        setVisibilityFilter(visibilityFilter === 'hidden' ? 'all' : 'hidden');
        setFlowFilter('all');
      },
    },
  ];

  return (
    <div className="wpw-app space-y-3 sm:space-y-4 pb-24 sm:pb-4">
      <style>{STUDIO_SCOPED_CSS}</style>

      {/* ═══════════════ 1. BENTO + FRANJA MOBILE HERO & DESKTOP TOP BAR ═══════════════ */}
      <div className="sm:hidden wpw-island-border rounded-[24px] p-4 text-slate-900 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>Catálogo Web Independiente</span>
            </div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
              Productos Web
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="wpw-micro-btn w-9 h-9 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 active:scale-90 transition"
              title="Ver tienda en vivo"
            >
              <Globe className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={exportCatalogCsv}
              disabled={filteredProducts.length === 0}
              className="wpw-micro-btn w-9 h-9 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 active:scale-90 transition disabled:opacity-40 cursor-pointer"
              title="Exportar CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                invalidateFirebaseProductsCache();
                void loadProducts(true);
                void loadCategories();
              }}
              disabled={loading}
              className="wpw-micro-btn w-9 h-9 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 active:scale-90 transition cursor-pointer"
              title="Sincronizar catálogo"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Compact Bento Telemetry Strip inside Mobile Hero */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <div
            onClick={() => {
              setVisibilityFilter('visible');
              setFlowFilter('all');
            }}
            className="rounded-2xl bg-slate-50 border border-slate-300 border-l-[3px] border-l-emerald-500 p-2.5 cursor-pointer active:scale-95 transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
              En Vitrina
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-black text-slate-900 tabular-nums">
                {stats.visible}
              </span>
              <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                /{stats.total}
              </span>
            </div>
            <span className="text-[9px] font-semibold text-emerald-700 block">
              {stats.activePct}% activo
            </span>
          </div>

          <div
            onClick={() => setSortBy('margin_desc')}
            className="rounded-2xl bg-slate-50 border border-slate-300 border-l-[3px] border-l-indigo-500 p-2.5 cursor-pointer active:scale-95 transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
              Margen ∅
            </span>
            <div className="text-lg font-black text-emerald-700 tabular-nums mt-0.5">
              {stats.avgMargin !== null ? `${stats.avgMargin}%` : '—'}
            </div>
            <span className="text-[9px] font-semibold text-slate-500 truncate block">
              {stats.unlimited} stock ∞
            </span>
          </div>

          <div
            onClick={() => setSortBy('price_desc')}
            className="rounded-2xl bg-slate-50 border border-slate-300 border-l-[3px] border-l-violet-500 p-2.5 cursor-pointer active:scale-95 transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
              Ticket ∅
            </span>
            <div className="text-sm font-black text-slate-900 tabular-nums mt-1 truncate">
              {formatCurrency(stats.avgPrice)}
            </div>
            <span className="text-[9px] font-semibold text-slate-500 truncate block">
              {categories.length} categ.
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Header + 4 Bento KPI Cards */}
      <div className="hidden sm:block space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Productos web</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-300 text-[11px] font-bold shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Catálogo web independiente
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 font-semibold">
              {filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''}
              {filteredProducts.length > 0 && ` · Pág. ${safePage}/${totalPages} (${ITEMS_PER_PAGE}/pág.)`}
              {categories.length > 0 && ` · ${categories.length} categorías`}
              {brands.length > 0 && ` · ${brands.length} marcas`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition shadow-2xs"
            >
              <Globe className="w-4 h-4 text-slate-500" />
              <span>Ver tienda</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>

            <button
              type="button"
              onClick={exportCatalogCsv}
              disabled={filteredProducts.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                invalidateFirebaseProductsCache();
                void loadProducts(true);
                void loadCategories();
              }}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition disabled:opacity-60 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>

            <button
              type="button"
              onClick={openCreateDrawer}
              className="wpw-cta-shimmer flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs sm:text-sm font-black transition shadow-sm cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Agregar producto</span>
            </button>
          </div>
        </div>

        {/* Desktop 4 Bento Telemetry Cards (Bento + Franja) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            onClick={resetAllFilters}
            className="wpw-bento-frame relative rounded-2xl border-t-[3px] border-t-indigo-500 p-4 overflow-hidden cursor-pointer hover:border-slate-400 transition flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-extrabold">
                Catálogo Total
              </p>
              <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums mt-1">
                {stats.total} <span className="text-xs font-bold text-slate-400">SKUs</span>
              </p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {categories.length} categorías · {stats.unlimited} stock ∞
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div
            onClick={() => {
              setVisibilityFilter('visible');
              setFlowFilter('all');
            }}
            className="wpw-bento-frame relative rounded-2xl border-t-[3px] border-t-emerald-500 p-4 overflow-hidden cursor-pointer hover:border-slate-400 transition flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-extrabold">
                Salud Vitrina
              </p>
              <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums mt-1">
                {stats.visible}{' '}
                <span className="text-xs font-bold text-slate-400">publicados</span>
              </p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {stats.hidden} ocultos · {stats.incomplete} por pulir
              </p>
            </div>
            <ReadinessRing score={stats.activePct} size={44} />
          </div>

          <div
            onClick={() => setSortBy('margin_desc')}
            className="wpw-bento-frame relative rounded-2xl border-t-[3px] border-t-amber-500 p-4 overflow-hidden cursor-pointer hover:border-slate-400 transition flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-extrabold">
                Estrella de Margen
              </p>
              {stats.topMarginProduct ? (
                <>
                  <p className="text-sm font-black text-slate-900 truncate mt-1.5">
                    {stats.topMarginProduct.name}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-bold mt-0.5">
                    +{stats.topMarginProduct.pct}% (+{formatCurrency(stats.topMarginProduct.profit)} c/u)
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-slate-900 mt-1">—</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Registra costos unitarios</p>
                </>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div
            onClick={() => setSortBy('price_desc')}
            className="wpw-bento-frame relative rounded-2xl border-t-[3px] border-t-violet-500 p-4 overflow-hidden cursor-pointer hover:border-slate-400 transition flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-extrabold">
                Ticket Promedio
              </p>
              <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums mt-1">
                {formatCurrency(stats.avgPrice)}
              </p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {stats.avgMargin !== null ? `Margen prom. ${stats.avgMargin}%` : 'Valorizado web'}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 border border-violet-200 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ 2. UNIFIED NATIVE SEARCH + STAGE PILLS + FILTERS (BENTO + FRANJA) ═══════════════ */}
      <div
        ref={catalogTopRef}
        className="wpw-bento-frame scroll-mt-3 rounded-[22px] border-t-[3px] border-t-indigo-500 p-2.5 sm:p-3.5 space-y-2.5"
      >
        {/* Search Input + Category Dropdown + Mobile Sort/Grid Switch */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar perfume, prenda, SKU, marca o aroma…"
              className="w-full pl-9 pr-9 py-2.5 rounded-2xl bg-slate-100/90 focus:bg-white border border-slate-300 focus:border-indigo-500 text-[16px] sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="wpw-micro-btn absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
            {/* Category Selector */}
            <div className="relative" ref={categoryDropdownRef}>
              <button
                type="button"
                onClick={() => setShowCategoryDropdown((v) => !v)}
                className={`wpw-micro-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold transition border cursor-pointer ${
                  categoryFilter !== 'all'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="truncate max-w-[135px]">
                  {categoryFilter !== 'all' ? categoryFilter : 'Categorías'}
                </span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showCategoryDropdown && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-300 py-1.5 z-50">
                  <div className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                    <span>Filtrar por colección</span>
                    <span>{categories.length}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setShowCategoryDropdown(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-bold flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      categoryFilter === 'all' ? 'text-indigo-700 bg-indigo-50/70' : 'text-slate-700'
                    }`}
                  >
                    <span>Todas las categorías</span>
                    <span className="text-[10px] font-mono text-slate-400">{products.length}</span>
                  </button>
                  <div className="max-h-60 overflow-y-auto">
                    {Object.entries(categoryCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([catName, count]) => (
                        <button
                          key={catName}
                          type="button"
                          onClick={() => {
                            setCategoryFilter(catName);
                            setShowCategoryDropdown(false);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-xs font-bold flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                            categoryFilter === catName
                              ? 'text-indigo-700 bg-indigo-50/70'
                              : 'text-slate-700'
                          }`}
                        >
                          <span className="truncate pr-2">{catName}</span>
                          <span className="text-[10px] text-slate-500 font-mono font-extrabold">
                            {count}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Sort Cycler + 2x2 Grid Switch */}
            <div className="flex sm:hidden items-center gap-1.5">
              <button
                type="button"
                onClick={cycleMobileSort}
                className="wpw-micro-btn inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-extrabold text-slate-700 active:scale-95 transition cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span>{mobileSortLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMobileGridMode((v) => !v);
                }}
                className="wpw-micro-btn w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 flex items-center justify-center active:scale-95 transition cursor-pointer"
                aria-label="Alternar vista cuadrícula móvil"
              >
                {mobileGridMode ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              </button>
            </div>

            {/* Desktop View Mode Switcher */}
            <div className="hidden sm:flex bg-slate-100 p-0.5 rounded-xl border border-slate-300">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Lista Pro</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Vitrina</span>
              </button>
            </div>
          </div>
        </div>

        {/* Synced sr-only select for accessibility compatibility */}
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

        {/* Fluid Spring Diagnostic Stage Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-slate-100 border border-slate-300/90">
          {stagePills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                pill.onClick();
              }}
              className={`wpw-micro-btn relative shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer select-none ${
                pill.active
                  ? 'text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {pill.active && (
                <motion.span
                  layoutId="wpw-stage-active-capsule"
                  transition={{ type: 'spring', stiffness: 430, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-white border border-slate-300 shadow-xs"
                />
              )}
              <span
                className="relative z-10 w-2 h-2 rounded-full shrink-0"
                style={{ background: pill.dotColor }}
              />
              <span className="relative z-10">{pill.label}</span>
              <span
                className={`relative z-10 text-[10px] font-black px-1.5 py-0.2 rounded-full tabular-nums ${
                  pill.active ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-200/90 text-slate-600'
                }`}
              >
                {pill.count}
              </span>
            </button>
          ))}
        </div>

        {/* Quick Top Pagination Bar (Mobile & Compact View) */}
        {!loading && filteredProducts.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] font-bold text-slate-600">
            <span className="tabular-nums">
              Mostrando <strong className="text-slate-900">{pageStartIndex + 1}–{pageEndIndex}</strong> de{' '}
              <strong className="text-slate-900">{filteredProducts.length}</strong> ({ITEMS_PER_PAGE}/pág.)
            </span>
            {totalPages > 1 && (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => goToPage(safePage - 1)}
                  className="wpw-micro-btn w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 disabled:opacity-35 cursor-pointer"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-extrabold tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goToPage(safePage + 1)}
                  className="wpw-micro-btn w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 disabled:opacity-35 cursor-pointer"
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline Feedback Banners */}
      {error && (
        <div
          role="alert"
          className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs sm:text-sm font-bold text-rose-700 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="wpw-micro-btn text-rose-500 hover:text-rose-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-bold text-emerald-800 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700 shrink-0 stroke-[2.5]" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
            className="wpw-micro-btn shrink-0 text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Desktop Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="hidden sm:flex items-center gap-2 flex-wrap p-3 bg-white text-slate-800 border border-slate-200 rounded-2xl shadow-sm">
          <span className="px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-black tabular-nums">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => void handleBulkAction('show')}
            disabled={bulkUpdating}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80 transition cursor-pointer disabled:opacity-60"
          >
            Publicar en vitrina
          </button>
          <button
            type="button"
            onClick={() => void handleBulkAction('hide')}
            disabled={bulkUpdating}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80 transition cursor-pointer disabled:opacity-60"
          >
            Ocultar
          </button>
          <button
            type="button"
            onClick={() => void handleBulkAction('unlimited')}
            disabled={bulkUpdating}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80 transition cursor-pointer disabled:opacity-60"
          >
            ∞ Stock Ilimitado
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            Cancelar selección
          </button>
          <button
            type="button"
            onClick={() => void handleBulkAction('delete')}
            disabled={bulkUpdating}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition cursor-pointer disabled:opacity-60"
          >
            Eliminar ({selected.size})
          </button>
        </div>
      )}

      {/* ═══════════════ 3. MAIN CATALOG SURFACE (NATIVE MOBILE + DESKTOP · 20 POR PÁGINA) ═══════════════ */}
      <div className="sm:bg-white sm:rounded-[24px] sm:border sm:border-slate-300 sm:border-t-[3px] sm:border-t-indigo-500 sm:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)] overflow-hidden">
        {/* ── MOBILE SURFACE: TACTILE LIST OR 2x2 BOUTIQUE GRID ── */}
        <div className="block sm:hidden space-y-3">
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-[22px] bg-white border border-slate-300 border-l-[4px] border-l-indigo-400 space-y-3 animate-pulse shadow-xs"
                >
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 w-24 bg-slate-100 rounded" />
                      <div className="h-4 w-40 bg-slate-100 rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="h-11 bg-slate-100 rounded-xl" />
                    <div className="h-11 bg-slate-100 rounded-xl" />
                    <div className="h-11 bg-slate-100 rounded-xl" />
                  </div>
                  <div className="h-9 w-full bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="wpw-bento-frame rounded-[24px] border-t-[3px] border-t-indigo-500 p-8 text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
                <Package className="w-7 h-7" />
              </div>
              <p className="text-slate-900 font-black text-base">
                {products.length === 0
                  ? 'Tu catálogo web está listo para despegar'
                  : 'Sin coincidencias con estos filtros'}
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {products.length === 0
                  ? 'Toca el botón inferior para crear tu primer producto con cámara directa y cálculo de ganancia.'
                  : 'Limpia la búsqueda o cambia de etapa para volver a ver tu inventario.'}
              </p>
              <button
                type="button"
                onClick={products.length === 0 ? openCreateDrawer : resetAllFilters}
                className="wpw-cta-shimmer px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black shadow-sm cursor-pointer active:scale-[0.98] transition"
              >
                {products.length === 0 ? '+ Crear primer producto' : 'Restablecer filtros'}
              </button>
            </div>
          ) : mobileGridMode ? (
            /* MODO MÓVIL BOUTIQUE 2x2 */
            <div className="grid grid-cols-2 gap-2.5">
              {paginatedProducts.map((product) => {
                const unlimited = isUnlimitedStockProduct(product);
                const webStock = getWebStock(product);
                const gallery = getProductGallery(product);
                const margin = computeMargin(product.precio, product.costo);
                const primaryStatus = getProductPrimaryStatus(product);
                const stripeColor = getCardStripeColor(primaryStatus.key, webStock, unlimited);
                const hasCost = (Number(product.costo) || 0) > 0;

                return (
                  <div
                    key={product.id}
                    onClick={() => openEditDrawer(product)}
                    style={{ borderTop: `3px solid ${stripeColor}` }}
                    className="wpw-bento-frame rounded-[22px] overflow-hidden active:scale-[0.98] transition flex flex-col justify-between cursor-pointer"
                  >
                    <div className="relative aspect-square bg-slate-100 overflow-hidden border-b border-slate-200">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                          <ImageIcon className="w-7 h-7" />
                        </div>
                      )}

                      <span
                        className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold border border-black/10 shadow-2xs"
                        style={{ background: primaryStatus.bg, color: primaryStatus.color }}
                      >
                        {primaryStatus.label}
                      </span>

                      {gallery.length > 1 && (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/65 text-[9px] font-bold text-white">
                          1/{gallery.length}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openQuickAdjustModal(product);
                        }}
                        className="wpw-micro-btn absolute bottom-2 left-2 w-7 h-7 rounded-xl bg-white/95 backdrop-blur-md text-slate-700 border border-slate-300 shadow-xs flex items-center justify-center cursor-pointer"
                        aria-label="Ajuste comercial rápido"
                      >
                        <Zap className="w-3.5 h-3.5 text-indigo-600" />
                      </button>
                    </div>

                    <div className="p-2.5 space-y-2">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 truncate">
                            {product.categoria || 'Sin categoría'}
                          </p>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 tabular-nums shrink-0">
                            {unlimited ? '∞' : `${webStock}u`}
                          </span>
                        </div>
                        <p className="text-xs font-extrabold text-slate-900 line-clamp-2 leading-snug min-h-[32px] mt-0.5">
                          {product.name}
                        </p>
                      </div>

                      <div className="pt-1.5 border-t border-slate-200/80 space-y-1">
                        <div className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="font-bold text-indigo-800">🏷️ Venta</span>
                          <span className="font-black text-slate-900">{formatCurrency(product.precio)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] tabular-nums">
                          <span className="font-bold text-amber-800">📦 Costo</span>
                          <span className="font-bold text-slate-700">
                            {hasCost ? formatCurrency(product.costo) : 'S/costo'}
                          </span>
                        </div>
                        {margin ? (
                          <div
                            className={`px-2 py-1 rounded-lg border text-[10px] font-black flex items-center justify-between tabular-nums ${
                              margin.profit >= 0
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 text-rose-700'
                            }`}
                          >
                            <span>💵 c/u</span>
                            <span>
                              {margin.profit >= 0 ? '+' : ''}
                              {formatCurrency(margin.profit)} ({margin.pct}%)
                            </span>
                          </div>
                        ) : (
                          <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-400 text-center">
                            Sin ganancia calc.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* MODO MÓVIL TARJETAS TÁCTILES PRO CON DESGLOSE BENTO (VENTA · COSTO · GANANCIA C/U) */
            <div className="space-y-3">
              {paginatedProducts.map((product) => {
                const visible = isProductVisible(product);
                const unlimited = isUnlimitedStockProduct(product);
                const webStock = getWebStock(product);
                const attributes = getProductAttributes(product);
                const gallery = getProductGallery(product);
                const margin = computeMargin(product.precio, product.costo);
                const primaryStatus = getProductPrimaryStatus(product);
                const isSel = selected.has(product.id);
                const displaySku = formatDisplayCode(product.code);
                const stripeColor = getCardStripeColor(primaryStatus.key, webStock, unlimited);
                const hasCost = (Number(product.costo) || 0) > 0;

                return (
                  <div
                    key={product.id}
                    onClick={() => openEditDrawer(product)}
                    style={{ borderLeft: `4px solid ${isSel ? '#4f46e5' : stripeColor}` }}
                    className={`wpw-bento-frame relative rounded-[22px] p-3.5 transition-all cursor-pointer active:scale-[0.99] ${
                      isSel ? 'ring-2 ring-indigo-500/40 bg-indigo-50/20' : ''
                    }`}
                  >
                    {/* Row 1: Checkbox + SKU + Category + Status Pill */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div
                        className="flex items-center gap-2 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(product.id)}
                          className="wpw-checkbox rounded text-indigo-600 border-slate-300 cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-slate-600 font-bold truncate">
                          {displaySku}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/90 text-slate-700 truncate max-w-[140px]">
                          {product.categoria || 'General'}
                        </span>
                      </div>

                      <span
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-black/10 shrink-0"
                        style={{ background: primaryStatus.bg, color: primaryStatus.color }}
                      >
                        {primaryStatus.label}
                      </span>
                    </div>

                    {/* Row 2: Crisp 64x64 Squircle Thumbnail + Full-Width Product Name & Chips */}
                    <div className="flex items-center gap-3 mb-2.5">
                      <div
                        className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-300 shrink-0"
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
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                        {gallery.length > 1 && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-white leading-none">
                            +{gallery.length - 1}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-black text-slate-900 line-clamp-2 leading-snug">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {product.marca && (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                              {product.marca}
                            </span>
                          )}
                          {attributes.content && (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                              {attributes.content}
                            </span>
                          )}
                          {attributes.size && (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                              T:{attributes.size}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: 3-Column Bento Financial Breakdown (Venta · Costo · Sacas c/u) */}
                    <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                      {/* Precio Venta */}
                      <div className="rounded-xl bg-[#eef2ff] border border-indigo-200 border-l-[3px] border-l-indigo-600 px-2 py-1.5 min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-wider text-indigo-800 block truncate">
                          🏷️ Venta
                        </span>
                        <span className="text-[13px] font-black text-slate-900 tabular-nums block truncate mt-0.5">
                          {formatCurrency(product.precio)}
                        </span>
                      </div>

                      {/* Costo Base */}
                      <div
                        className="rounded-xl bg-[#fffbeb] border border-amber-200 border-l-[3px] border-l-amber-500 px-2 py-1.5 min-w-0"
                        onClick={(e) => {
                          if (!hasCost) {
                            e.stopPropagation();
                            openQuickAdjustModal(product);
                          }
                        }}
                      >
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-900 block truncate">
                          📦 Costo
                        </span>
                        {hasCost ? (
                          <span className="text-[13px] font-extrabold text-slate-800 tabular-nums block truncate mt-0.5">
                            {formatCurrency(product.costo)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-extrabold text-amber-700 underline decoration-dotted block truncate mt-0.5">
                            + Fijar costo
                          </span>
                        )}
                      </div>

                      {/* Ganancia por unidad (Cuánto sacas c/u + %) */}
                      {margin ? (
                        <div
                          className={`rounded-xl border border-l-[3px] px-2 py-1.5 min-w-0 ${
                            margin.profit >= 0
                              ? 'bg-emerald-50/90 border-emerald-200 border-l-emerald-600'
                              : 'bg-rose-50 border-rose-200 border-l-rose-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-0.5">
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider truncate ${
                                margin.profit >= 0 ? 'text-emerald-900' : 'text-rose-800'
                              }`}
                            >
                              💵 Sacas
                            </span>
                            <span
                              className={`text-[9px] font-black px-1 rounded tabular-nums shrink-0 ${
                                margin.profit >= 0
                                  ? 'bg-emerald-200/80 text-emerald-900'
                                  : 'bg-rose-200/80 text-rose-900'
                              }`}
                            >
                              {margin.profit >= 0 ? '+' : ''}
                              {margin.pct}%
                            </span>
                          </div>
                          <span
                            className={`text-[13px] font-black tabular-nums block truncate mt-0.5 ${
                              margin.profit >= 0 ? 'text-emerald-800' : 'text-rose-700'
                            }`}
                          >
                            {margin.profit >= 0 ? '+' : ''}
                            {formatCurrency(margin.profit)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="rounded-xl bg-slate-50 border border-slate-200 border-l-[3px] border-l-slate-400 px-2 py-1.5 min-w-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            openQuickAdjustModal(product);
                          }}
                        >
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block truncate">
                            💵 Sacas c/u
                          </span>
                          <span className="text-[11px] font-bold text-slate-400 block truncate mt-0.5">
                            Falta costo
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Row 4: Inline Thumb Stock Stepper + Express Commercial + Visibility + Edit */}
                    <div
                      className="flex items-center justify-between gap-1.5 pt-2.5 border-t border-slate-200/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Direct Mobile Stock Stepper */}
                      <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-300">
                        <button
                          type="button"
                          disabled={
                            quickStockSavingId === product.id || (!unlimited && webStock <= 0)
                          }
                          onClick={() => void handleQuickStockStep(product, -1)}
                          className="wpw-micro-btn w-7 h-7 rounded-lg text-sm font-black text-slate-700 active:bg-white disabled:opacity-35 cursor-pointer"
                          aria-label="Restar 1 unidad"
                        >
                          −
                        </button>
                        <span className="px-2 text-xs font-mono font-black text-slate-900 tabular-nums min-w-[32px] text-center">
                          {quickStockSavingId === product.id ? '…' : unlimited ? '∞' : webStock}
                        </span>
                        <button
                          type="button"
                          disabled={quickStockSavingId === product.id}
                          onClick={() => void handleQuickStockStep(product, 1)}
                          className="wpw-micro-btn w-7 h-7 rounded-lg text-sm font-black text-slate-700 active:bg-white disabled:opacity-35 cursor-pointer"
                          aria-label="Sumar 1 unidad"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          disabled={quickStockSavingId === product.id}
                          onClick={() => void handleQuickStockStep(product, 'unlimited')}
                          className={`wpw-micro-btn px-2 h-7 rounded-lg text-[11px] font-black transition cursor-pointer ${
                            unlimited ? 'bg-white text-slate-900 shadow-2xs border border-slate-200' : 'text-slate-400'
                          }`}
                          aria-label="Alternar stock ilimitado"
                        >
                          ∞
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openQuickAdjustModal(product)}
                          className="wpw-micro-btn w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center active:scale-90 transition cursor-pointer"
                          title="Ajuste rápido de precio, costo y margen"
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleVisibility(product)}
                          disabled={togglingId === product.id}
                          className={`wpw-micro-btn w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition cursor-pointer ${
                            visible
                              ? 'bg-white text-slate-700 border-slate-300'
                              : 'bg-slate-100 text-slate-400 border-slate-300'
                          }`}
                          title={visible ? 'Ocultar de tienda' : 'Publicar en tienda'}
                        >
                          {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditDrawer(product)}
                          className="wpw-micro-btn px-3 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold active:scale-95 transition cursor-pointer"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mobile Bento Pagination Bar (20 por página) */}
          {!loading && filteredProducts.length > 0 && totalPages > 1 && (
            <div className="wpw-bento-frame rounded-[22px] border-t-[3px] border-t-indigo-500 p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600 tabular-nums">
                  Ítems <strong className="text-slate-900">{pageStartIndex + 1}–{pageEndIndex}</strong> de{' '}
                  <strong className="text-slate-900">{filteredProducts.length}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-extrabold tabular-nums">
                  Página {safePage} de {totalPages}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => goToPage(safePage - 1)}
                  className="wpw-micro-btn px-2.5 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-extrabold flex items-center gap-1 disabled:opacity-35 active:scale-95 transition cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Ant.</span>
                </button>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {paginationItems.map((item) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goToPage(item)}
                        className={`wpw-micro-btn min-w-[34px] h-9 px-2 rounded-xl text-xs font-black tabular-nums border transition active:scale-95 cursor-pointer ${
                          item === safePage
                            ? 'wpw-cta-shimmer bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span
                        key={item}
                        className="px-1 text-xs font-black text-slate-400 select-none"
                      >
                        …
                      </span>
                    )
                  )}
                </div>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goToPage(safePage + 1)}
                  className="wpw-micro-btn px-2.5 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-extrabold flex items-center gap-1 disabled:opacity-35 active:scale-95 transition cursor-pointer shrink-0"
                >
                  <span>Sig.</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── DESKTOP SURFACE: TOOLBAR + CARDS / GRID + PAGINACIÓN (20/PÁG.) ── */}
        <div className="hidden sm:block">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 bg-slate-50 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700">
                {selected.size > 0
                  ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`
                  : `Seleccionar página (${paginatedProducts.length})`}
              </span>
            </label>

            {allPageSelected &&
              filteredProducts.length > paginatedProducts.length &&
              selected.size < filteredProducts.length && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set(filteredProducts.map((p) => p.id)))}
                  className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  Seleccionar los {filteredProducts.length} productos
                </button>
              )}

            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide mr-1 hidden md:inline">
                Ordenar
              </span>

              {(
                [
                  { col: 'recent', label: 'Recientes', match: sortBy === 'recent', asc: false },
                  {
                    col: 'price',
                    label: 'Precio',
                    match: sortBy.startsWith('price_'),
                    asc: sortBy === 'price_asc',
                  },
                  {
                    col: 'stock',
                    label: 'Stock',
                    match: sortBy.startsWith('stock_'),
                    asc: sortBy === 'stock_asc',
                  },
                  {
                    col: 'margin',
                    label: 'Margen',
                    match: sortBy.startsWith('margin_'),
                    asc: sortBy === 'margin_asc',
                  },
                  {
                    col: 'name',
                    label: 'Nombre',
                    match: sortBy.startsWith('name_'),
                    asc: sortBy === 'name_asc',
                  },
                ] as const
              ).map((s) => (
                <button
                  key={s.col}
                  type="button"
                  onClick={() => toggleSortColumn(s.col)}
                  className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    s.match
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{s.label}</span>
                  {s.match ? (
                    s.asc ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-35" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-3.5 space-y-2.5 bg-[#eef2f6]/55">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-stretch rounded-2xl bg-white border border-slate-300 p-4 gap-4 animate-pulse"
                >
                  <div className="w-16 h-16 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2.5 py-1">
                    <div className="h-4 w-56 bg-slate-100 rounded" />
                    <div className="h-3.5 w-80 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-14 text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Package className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                {products.length === 0
                  ? 'Aún no hay productos cargados en tu catálogo web'
                  : 'No se encontraron productos con estos filtros'}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                {products.length === 0
                  ? 'Crea tu primer producto con estudio fotográfico HD, precio web, margen en vivo y control de stock.'
                  : 'Prueba limpiando los filtros activos o buscando con otra palabra clave.'}
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={products.length === 0 ? openCreateDrawer : resetAllFilters}
                  className="wpw-cta-shimmer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-extrabold transition shadow-sm cursor-pointer active:scale-[0.98]"
                >
                  {products.length === 0 ? (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Agregar primer producto</span>
                    </>
                  ) : (
                    <span>Restablecer todos los filtros</span>
                  )}
                </button>
              </div>
            </div>
          ) : viewMode === 'table' ? (
            <div className="p-3.5 space-y-3 bg-[#eef2f6]/55">
              {paginatedProducts.map((product) => {
                const visible = isProductVisible(product);
                const unlimited = isUnlimitedStockProduct(product);
                const webStock = getWebStock(product);
                const attributes = getProductAttributes(product);
                const gallery = getProductGallery(product);
                const margin = computeMargin(product.precio, product.costo);
                const primaryStatus = getProductPrimaryStatus(product);
                const isSel = selected.has(product.id);
                const isEditingThis = drawerOpen && editingProduct?.id === product.id;
                const displaySku = formatDisplayCode(product.code);
                const stripeColor = getCardStripeColor(primaryStatus.key, webStock, unlimited);
                const hasCost = (Number(product.costo) || 0) > 0;

                return (
                  <div
                    key={product.id}
                    onClick={() => openEditDrawer(product)}
                    style={{ borderLeft: `4px solid ${isSel || isEditingThis ? '#4f46e5' : stripeColor}` }}
                    className={`wpw-bento-frame group flex flex-col rounded-2xl transition-all cursor-pointer p-4 gap-3 hover:border-slate-400 ${
                      isSel || isEditingThis ? 'ring-2 ring-indigo-500/40 bg-indigo-50/15' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap xl:flex-nowrap">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 overflow-hidden">
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(product.id)}
                            className="w-4 h-4 rounded text-indigo-600 border-slate-300 cursor-pointer"
                          />
                        </div>

                        <div
                          className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-50 border border-slate-300 shrink-0 group/img"
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
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                className="transition duration-300 group-hover/img:scale-105"
                                loading="lazy"
                              />
                              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <ZoomIn size={16} />
                              </span>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                              <ImageIcon size={18} />
                              <span className="text-[8px] font-bold uppercase mt-0.5 text-slate-400">
                                Sin foto
                              </span>
                            </div>
                          )}
                          {gallery.length > 1 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-white leading-none">
                              1/{gallery.length}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: primaryStatus.color }}
                            />
                            <p className="font-extrabold text-slate-900 text-base truncate">
                              {product.name || 'Producto sin nombre'}
                            </p>
                            {(attributes.size || attributes.color || attributes.content) && (
                              <div className="hidden md:flex items-center gap-1 shrink-0">
                                {attributes.content && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                                    {attributes.content}
                                  </span>
                                )}
                                {attributes.size && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                                    Talla {attributes.size}
                                  </span>
                                )}
                                {attributes.color && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                                    {attributes.color}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1.5 min-w-0 overflow-hidden">
                            <span className="font-mono text-xs text-slate-600 font-bold shrink-0">
                              {displaySku}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold shrink-0 max-w-[165px] truncate">
                              {product.categoria || 'Sin categoría'}
                            </span>
                            {product.marca && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold shrink-0 max-w-[130px] truncate">
                                {product.marca}
                              </span>
                            )}
                            {product.descripcion && (
                              <span className="hidden lg:inline text-xs text-slate-400 truncate min-w-0">
                                · {product.descripcion}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Desktop 3-Cell Bento Commercial Strip: Venta · Costo · Sacas c/u */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="rounded-xl bg-[#eef2ff] border border-indigo-200 border-l-[3px] border-l-indigo-600 px-3 py-1.5 min-w-[98px]">
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-800 block">
                            🏷️ Venta
                          </span>
                          <span className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">
                            {formatCurrency(product.precio)}
                          </span>
                        </div>

                        <div
                          className="rounded-xl bg-[#fffbeb] border border-amber-200 border-l-[3px] border-l-amber-500 px-3 py-1.5 min-w-[96px]"
                          onClick={(e) => {
                            if (!hasCost) {
                              e.stopPropagation();
                              openQuickAdjustModal(product);
                            }
                          }}
                        >
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-900 block">
                            📦 Costo
                          </span>
                          {hasCost ? (
                            <span className="text-sm font-extrabold text-slate-800 tabular-nums whitespace-nowrap">
                              {formatCurrency(product.costo)}
                            </span>
                          ) : (
                            <span className="text-xs font-extrabold text-amber-700 underline decoration-dotted whitespace-nowrap">
                              + Fijar costo
                            </span>
                          )}
                        </div>

                        {margin ? (
                          <div
                            className={`rounded-xl border border-l-[3px] px-3 py-1.5 min-w-[122px] ${
                              margin.profit >= 0
                                ? 'bg-emerald-50/90 border-emerald-200 border-l-emerald-600'
                                : 'bg-rose-50 border-rose-200 border-l-rose-600'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span
                                className={`text-[9px] font-black uppercase tracking-wider ${
                                  margin.profit >= 0 ? 'text-emerald-900' : 'text-rose-800'
                                }`}
                              >
                                💵 Sacas c/u
                              </span>
                              <span
                                className={`text-[9px] font-black px-1.5 rounded tabular-nums ${
                                  margin.profit >= 0
                                    ? 'bg-emerald-200/80 text-emerald-900'
                                    : 'bg-rose-200/80 text-rose-900'
                                }`}
                              >
                                {margin.profit >= 0 ? '+' : ''}
                                {margin.pct}%
                              </span>
                            </div>
                            <span
                              className={`text-sm font-black tabular-nums whitespace-nowrap ${
                                margin.profit >= 0 ? 'text-emerald-800' : 'text-rose-700'
                              }`}
                            >
                              {margin.profit >= 0 ? '+' : ''}
                              {formatCurrency(margin.profit)}
                            </span>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-slate-50 border border-slate-200 border-l-[3px] border-l-slate-400 px-3 py-1.5 min-w-[110px]">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                              💵 Sacas c/u
                            </span>
                            <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
                              Falta costo
                            </span>
                          </div>
                        )}

                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full text-center whitespace-nowrap border border-black/10 shrink-0"
                          style={{ background: primaryStatus.bg, color: primaryStatus.color }}
                        >
                          {primaryStatus.label}
                        </span>
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 flex-wrap lg:flex-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            !unlimited && webStock <= 0
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          {unlimited ? (
                            <>
                              <InfinityIcon className="w-3.5 h-3.5" />
                              <span>Disponible siempre</span>
                            </>
                          ) : (
                            <span>
                              {webStock} {webStock === 1 ? 'unidad' : 'unidades'} web
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap shrink-0 ml-auto">
                        <div className="inline-flex items-center bg-slate-100 border border-slate-300 rounded-xl p-0.5">
                          <button
                            type="button"
                            disabled={
                              quickStockSavingId === product.id || (!unlimited && webStock <= 0)
                            }
                            onClick={() => void handleQuickStockStep(product, -1)}
                            className="w-6 h-6 rounded-lg text-xs font-black text-slate-600 hover:bg-white disabled:opacity-35 transition cursor-pointer"
                          >
                            −
                          </button>
                          <span className="px-2 text-[11px] font-mono font-extrabold text-slate-800 tabular-nums">
                            {quickStockSavingId === product.id ? '…' : unlimited ? '∞' : webStock}
                          </span>
                          <button
                            type="button"
                            disabled={quickStockSavingId === product.id}
                            onClick={() => void handleQuickStockStep(product, 1)}
                            className="w-6 h-6 rounded-lg text-xs font-black text-slate-700 hover:bg-white disabled:opacity-35 transition cursor-pointer"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            disabled={quickStockSavingId === product.id}
                            onClick={() => void handleQuickStockStep(product, 'unlimited')}
                            className={`px-1.5 h-6 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              unlimited
                                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                                : 'text-slate-400 hover:text-slate-700'
                            }`}
                          >
                            ∞
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => openQuickAdjustModal(product)}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Ajuste rápido</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleVisibility(product)}
                          disabled={togglingId === product.id}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{togglingId === product.id ? '…' : visible ? 'Ocultar' : 'Publicar'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDuplicateProduct(product)}
                          disabled={duplicatingId === product.id}
                          className="p-1.5 rounded-xl bg-white border border-slate-300 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                          title="Duplicar producto"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditDrawer(product)}
                          className="text-[11px] font-extrabold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition flex items-center gap-1 cursor-pointer"
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
            /* DESKTOP VITRINA GRID */
            <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 bg-[#eef2f6]/55">
              {paginatedProducts.map((product) => {
                const visible = isProductVisible(product);
                const unlimited = isUnlimitedStockProduct(product);
                const webStock = getWebStock(product);
                const margin = computeMargin(product.precio, product.costo);
                const gallery = getProductGallery(product);
                const primaryStatus = getProductPrimaryStatus(product);
                const displaySku = formatDisplayCode(product.code);
                const stripeColor = getCardStripeColor(primaryStatus.key, webStock, unlimited);
                const hasCost = (Number(product.costo) || 0) > 0;

                return (
                  <article
                    key={product.id}
                    onClick={() => openEditDrawer(product)}
                    style={{ borderTop: `3px solid ${stripeColor}` }}
                    className="wpw-bento-frame group flex flex-col rounded-2xl overflow-hidden hover:border-slate-400 transition-all cursor-pointer"
                  >
                    <div className="relative aspect-square bg-slate-50 overflow-hidden border-b border-slate-200">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          className="transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                          <ImageIcon className="w-10 h-10" />
                          <span className="text-xs font-semibold text-slate-400 mt-1">
                            Sin imagen
                          </span>
                        </div>
                      )}

                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-black/10 shadow-2xs"
                          style={{ background: primaryStatus.bg, color: primaryStatus.color }}
                        >
                          {primaryStatus.label}
                        </span>
                        {gallery.length > 1 && (
                          <span className="px-2 py-0.5 rounded-full bg-black/65 text-white text-[10px] font-bold backdrop-blur-sm">
                            1/{gallery.length}
                          </span>
                        )}
                      </div>

                      {product.imageUrl && (
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
                          className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-xl bg-white/95 hover:bg-white text-slate-700 border border-slate-300 shadow-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-slate-500 mb-1">
                          <span className="uppercase truncate">
                            {product.categoria || 'Sin categoría'}
                          </span>
                          <span className="font-mono shrink-0">{displaySku}</span>
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900 line-clamp-2 leading-snug">
                          {product.name}
                        </h3>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-200/80">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-xl bg-[#eef2ff] border border-indigo-200 border-l-[3px] border-l-indigo-600 px-2 py-1">
                            <span className="text-[9px] font-black uppercase text-indigo-800 block">
                              🏷️ Venta
                            </span>
                            <span className="text-xs font-black text-slate-900 tabular-nums">
                              {formatCurrency(product.precio)}
                            </span>
                          </div>
                          <div className="rounded-xl bg-[#fffbeb] border border-amber-200 border-l-[3px] border-l-amber-500 px-2 py-1">
                            <span className="text-[9px] font-black uppercase text-amber-900 block">
                              📦 Costo
                            </span>
                            <span className="text-xs font-extrabold text-slate-800 tabular-nums">
                              {hasCost ? formatCurrency(product.costo) : 'S/costo'}
                            </span>
                          </div>
                        </div>

                        {margin ? (
                          <div
                            className={`rounded-xl border border-l-[3px] px-2.5 py-1.5 flex items-center justify-between text-[11px] font-black tabular-nums ${
                              margin.profit >= 0
                                ? 'bg-emerald-50/90 border-emerald-200 border-l-emerald-600 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 border-l-rose-600 text-rose-700'
                            }`}
                          >
                            <span>💵 Sacas c/u</span>
                            <span>
                              {margin.profit >= 0 ? '+' : ''}
                              {formatCurrency(margin.profit)} ({margin.pct}%)
                            </span>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-400 text-center">
                            Sin costo registrado
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => void handleToggleVisibility(product)}
                            disabled={togglingId === product.id}
                            className="flex-1 py-1.5 rounded-xl text-xs font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            {visible ? 'Ocultar' : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditDrawer(product)}
                            className="flex-1 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 transition cursor-pointer"
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

          {/* Desktop Pagination Bar (20 productos por página) */}
          {filteredProducts.length > 0 && !loading && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-white">
              <div className="text-xs font-bold text-slate-600 tabular-nums">
                Mostrando <strong className="text-slate-900">{pageStartIndex + 1}–{pageEndIndex}</strong> de{' '}
                <strong className="text-slate-900">{filteredProducts.length}</strong> productos ·{' '}
                <span className="text-indigo-700 font-extrabold">
                  Página {safePage} de {totalPages} ({ITEMS_PER_PAGE} por página)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => goToPage(safePage - 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-extrabold disabled:opacity-35 transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>

                {paginationItems.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => goToPage(item)}
                      className={`min-w-[34px] h-8 px-2.5 rounded-xl text-xs font-black tabular-nums border transition cursor-pointer ${
                        item === safePage
                          ? 'wpw-cta-shimmer bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span
                      key={item}
                      className="px-1 text-xs font-black text-slate-400 select-none"
                    >
                      …
                    </span>
                  )
                )}

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goToPage(safePage + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-extrabold disabled:opacity-35 transition cursor-pointer"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Desktop Footer Telemetry Summary */}
          {filteredProducts.length > 0 && !loading && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <div>
                <p className="text-sm font-extrabold text-slate-800">
                  {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''} filtrados · {paginatedProducts.length} en esta página
                </p>
                <p className="text-[11px] text-slate-500">
                  Inventario web independiente · Importadora Carlitos
                </p>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-right">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">En Vitrina</p>
                  <p className="text-sm font-extrabold text-slate-800">
                    {filteredProducts.filter(isProductVisible).length} activos
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Stock ∞</p>
                  <p className="text-sm font-extrabold text-slate-800">
                    {filteredProducts.filter(isUnlimitedStockProduct).length} ilimitados
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Valor Referencial</p>
                  <p className="text-base font-black text-slate-900 tabular-nums">
                    {formatCurrency(stats.totalCatalogValue)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ 4. MOBILE FLOATING THUMB ISLAND ═══════════════ */}
      <MobileFloatingIsland
        hidden={drawerOpen || Boolean(quickAdjustProduct) || Boolean(zoomImageUrl)}
        selectedCount={selected.size}
        bulkUpdating={bulkUpdating}
        mobileGridMode={mobileGridMode}
        onToggleMobileGrid={() => setMobileGridMode((v) => !v)}
        onFocusSearch={() => {
          searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => searchInputRef.current?.focus(), 220);
        }}
        onOpenCreate={openCreateDrawer}
        onBulkAction={(act) => void handleBulkAction(act)}
        onClearSelection={() => setSelected(new Set())}
      />

      {/* ═══════════════ 5. EXPRESS COMMERCIAL SPRING SHEET ═══════════════ */}
      <QuickCommercialSheet
        product={quickAdjustProduct}
        price={quickAdjustPrice}
        setPrice={setQuickAdjustPrice}
        cost={quickAdjustCost}
        setCost={setQuickAdjustCost}
        stock={quickAdjustStock}
        setStock={setQuickAdjustStock}
        unlimited={quickAdjustUnlimited}
        setUnlimited={setQuickAdjustUnlimited}
        saving={quickAdjustSaving}
        onSave={() => void saveQuickAdjust()}
        onClose={() => setQuickAdjustProduct(null)}
        formatCurrency={formatCurrency}
      />

      {/* ═══════════════ 6. PORTAL LIGHTBOX ZOOM ═══════════════ */}
      {zoomImageUrl &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[1020] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={() => setZoomImageUrl(null)}
          >
            <div
              className="relative max-w-lg w-full bg-white rounded-[28px] overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-black text-slate-900 truncate">{zoomImageUrl.title}</p>
                  {zoomImageUrl.sku && (
                    <p className="text-xs font-mono font-bold text-slate-500">{zoomImageUrl.sku}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setZoomImageUrl(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 bg-slate-50 flex items-center justify-center min-h-[280px] max-h-[75vh]">
                <img
                  src={zoomImageUrl.url}
                  alt={zoomImageUrl.title}
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-2xl"
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ═══════════════ 7. SPATIAL iOS PRODUCT STUDIO SHEET ═══════════════ */}
      <ProductStudioSheet
        open={drawerOpen}
        editingProduct={editingProduct}
        displaySku={editingProduct ? formatDisplayCode(editingProduct.code) : undefined}
        form={form}
        saving={saving}
        uploadingImage={uploadingImage}
        activeUploadSlot={activeUploadSlot}
        setActiveUploadSlot={setActiveUploadSlot}
        imagePreviewError={imagePreviewError}
        setImagePreviewError={setImagePreviewError}
        draggingImage={draggingImage}
        setDraggingImage={setDraggingImage}
        error={error}
        notice={notice}
        categories={categories}
        brands={brands}
        creatingCategory={creatingCategory}
        setCreatingCategory={setCreatingCategory}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        savingCategory={savingCategory}
        onCreateCategory={() => void handleCreateCategory()}
        fileInputRef={fileInputRef}
        onImageInputChange={handleImageInputChange}
        onImageDrop={handleImageDrop}
        onImagePaste={handleImagePaste}
        onPasteClipboardButton={() => void handlePasteFromClipboardButton()}
        onUpdateField={updateField}
        onSetSlotUrl={setSlotUrl}
        onApplyMarginPreset={applyMarginPreset}
        onSubmit={handleSubmit}
        onClose={closeDrawer}
        onDelete={editingProduct ? () => void handleDelete(editingProduct) : undefined}
        savedDraft={savedDraft}
        onRestoreDraft={() => {
          if (savedDraft) {
            triggerHaptic('medium');
            setForm(savedDraft);
          }
        }}
        onDiscardDraft={clearSavedDraft}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}
