'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Store,
  Globe,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Filter,
  Layers,
  ArrowRight,
  ExternalLink,
  Plus,
  Boxes,
  Tag,
  Barcode,
  Check,
  Package,
  TrendingUp,
  Sparkles,
  ShoppingBag,
  Building2,
  ChevronRight,
  X,
  Pencil,
  ArrowUpDown,
} from 'lucide-react';
import {
  fetchAllFirebaseErpProducts,
  updateFirebaseErpProduct,
  getFirebaseErpCategories,
  getFirebaseErpSubcategories,
  purgeServerProductsCache,
  isWebVisible,
  isAppwriteProduct,
  FirebaseErpProduct,
} from '@/lib/firebaseErpService';
import EpicPagination from '@/components/admin/EpicPagination';
import SharedProductEditor from './SharedProductEditor';
import StockRiskBadge from '@/components/admin/StockRiskBadge';
import ProductFlowNav from '@/components/admin/ProductFlowNav';
import { getProductRisk } from '@/lib/stock-risk';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { useStoreSettings } from '@/hooks/useStoreSettings';

type FilterStatus = 'all' | 'pending' | 'published';
type StockFilter = 'all' | 'in_stock' | 'out_of_stock';
type SourceFilter = 'all' | 'tienda' | 'appwrite';

function getProductCreatedTime(product: FirebaseErpProduct): number {
  const raw = product.rawDocument || product;
  const value = raw.$createdAt ?? raw.createdAt ?? raw.CREATEDAT ?? raw.created_at ?? (product as any).createdAt;

  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
  }

  const parsed = typeof value === 'string' && /^\d{10,13}$/.test(value)
    ? Number(value)
    : Date.parse(String(value || ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

export default function StoreCatalogPage() {
  const { inventoryMode } = useStoreSettings();
  const [products, setProducts] = useState<FirebaseErpProduct[]>([]);
  const [categories, setCategories] = useState<Array<{ $id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('pending');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('tienda');
  const [onlyWithoutImage, setOnlyWithoutImage] = useState(false);
  const [onlyWithoutCategory, setOnlyWithoutCategory] = useState(false);
  const [onlyGreenFilter, setOnlyGreenFilter] = useState(false);
  const [sortRedFirst, setSortRedFirst] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<FirebaseErpProduct | null>(null);

  // Selección masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // Notificación toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  // Carga inicial de datos
  const loadData = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const [prods, cats] = await Promise.all([
        fetchAllFirebaseErpProducts(force),
        getFirebaseErpCategories(),
      ]);
      setProducts(prods.map((product) => {
        const raw = product.rawDocument || product;
        const erpStock = Number(raw.STOCK ?? raw.stock ?? product.stock ?? 0) || 0;
        const webStock = Number(raw.WEB_STOCK ?? raw.web_stock ?? erpStock) || 0;
        return { ...product, stock: inventoryMode === 'web_independent' ? webStock : erpStock };
      }));
      setCategories(cats);
    } catch (err: any) {
      console.error('Error al cargar catálogo de tienda:', err);
      showToast('Error al conectar con la base de datos de tienda.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [inventoryMode]);

  // Carga con caché local al entrar al catálogo para ahorrar lecturas (recarga manual con botón Refresh)
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Detector robusto de visibilidad en tienda web
  const isProductInWeb = useCallback((p: FirebaseErpProduct): boolean => {
    return isWebVisible(p);
  }, []);

  // Métricas calculadas
  const stats = useMemo(() => {
    const total = products.length;
    const published = products.filter((p) => isProductInWeb(p)).length;
    const review = products.filter((p) => p.web_publish_pending && !isProductInWeb(p)).length;
    const pending = products.filter((p) => !isProductInWeb(p) && !p.web_publish_pending).length;
    const totalStock = products.reduce((acc, p) => acc + (p.stock || 0), 0);

    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    let outOfStockWebCount = 0;
    for (const p of products) {
      if (isProductInWeb(p) && (p.stock || 0) <= 0) {
        outOfStockWebCount++;
      }
      const risk = getProductRisk({
        stock: p.stock || 0,
        salesVelocity7d: (p as any).salesVelocity7d || 0,
        maxBatchSize: (p as any).maxBatchSize || 1,
        daysSinceCreated: (p as any).createdAt
          ? Math.floor((Date.now() - new Date((p as any).createdAt).getTime()) / 86400000)
          : 999,
        price: Number(p.precio_venta_1 || (p as any).price || (p as any).PRICE || 0),
      });
      if (risk.level === 'verde') greenCount++;
      else if (risk.level === 'amarillo') yellowCount++;
      else if (risk.level === 'rojo') redCount++;
    }

    return { total, published, review, pending, totalStock, greenCount, yellowCount, redCount, outOfStockWebCount };
  }, [products, isProductInWeb]);

  // Filtrado reactivo de productos
  const filteredProducts = useMemo(() => {
    let result = products;

    // Filtro por estado en web
    if (statusFilter === 'pending') {
      result = result.filter((p) => !isProductInWeb(p) && !p.web_publish_pending);
    } else if (statusFilter === 'published') {
      result = result.filter((p) => isProductInWeb(p));
    }

    // Filtro por categoría
    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category === selectedCategory);
    }

    // Filtro por stock
    if (stockFilter === 'in_stock') {
      result = result.filter((p) => (p.stock || 0) > 0);
    } else if (stockFilter === 'out_of_stock') {
      result = result.filter((p) => (p.stock || 0) <= 0);
    }

    // Filtro por origen (tienda vs appwrite)
    if (sourceFilter === 'tienda') {
      result = result.filter((p) => !isAppwriteProduct(p));
    } else if (sourceFilter === 'appwrite') {
      result = result.filter((p) => isAppwriteProduct(p));
    }

    if (onlyWithoutImage) {
      result = result.filter((p) => !p.imageUrl);
    }
    if (onlyWithoutCategory) {
      result = result.filter((p) => !p.category || p.category === 'General');
    }

    // Filtro: Solo productos con stock verde (llenos y seguros para web)
    if (onlyGreenFilter) {
      result = result.filter((p) => {
        const risk = getProductRisk({
          stock: p.stock || 0,
          salesVelocity7d: (p as any).salesVelocity7d || 0,
          maxBatchSize: (p as any).maxBatchSize || 1,
          daysSinceCreated: (p as any).createdAt
            ? Math.floor((Date.now() - new Date((p as any).createdAt).getTime()) / 86400000)
            : 999,
          price: Number(p.precio_venta_1 || (p as any).price || (p as any).PRICE || 0),
        });
        return risk.level === 'verde';
      });
    }

    // Búsqueda por texto (Nombre, SKU, Código de barra)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          (p.nombre || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.codigo_barra || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.supplier || '').toLowerCase().includes(q)
      );
    }

    // Ordenamiento: Primero Rojo si está activo
    if (sortRedFirst) {
      return [...result].sort((a, b) => {
        const riskA = getProductRisk({
          stock: a.stock || 0,
          salesVelocity7d: (a as any).salesVelocity7d || 0,
          maxBatchSize: (a as any).maxBatchSize || 1,
          daysSinceCreated: (a as any).createdAt
            ? Math.floor((Date.now() - new Date((a as any).createdAt).getTime()) / 86400000)
            : 999,
          price: Number(a.precio_venta_1 || (a as any).price || (a as any).PRICE || 0),
        });
        const riskB = getProductRisk({
          stock: b.stock || 0,
          salesVelocity7d: (b as any).salesVelocity7d || 0,
          maxBatchSize: (b as any).maxBatchSize || 1,
          daysSinceCreated: (b as any).createdAt
            ? Math.floor((Date.now() - new Date((b as any).createdAt).getTime()) / 86400000)
            : 999,
          price: Number(b.precio_venta_1 || (b as any).price || (b as any).PRICE || 0),
        });

        const levelWeight = (lvl: string) => (lvl === 'rojo' ? 0 : lvl === 'amarillo' ? 1 : 2);
        const diff = levelWeight(riskA.level) - levelWeight(riskB.level);
        if (diff !== 0) return diff;

        // Si están en el mismo nivel, los de menor porcentaje (más vacíos) van primero
        if (riskA.pct !== riskB.pct) return riskA.pct - riskB.pct;

        const newestFirst = getProductCreatedTime(b) - getProductCreatedTime(a);
        return newestFirst || (a.nombre || '').localeCompare(b.nombre || '', 'es');
      });
    }

    // En el paso 1, priorizar lo recién agregado para encontrar y enviar primero
    // los productos nuevos a revisión web. El orden de críticos sigue disponible
    // mediante el filtro explícito sortRedFirst.
    return [...result].sort((a, b) => {
      const newestFirst = getProductCreatedTime(b) - getProductCreatedTime(a);
      return newestFirst || (a.nombre || '').localeCompare(b.nombre || '', 'es');
    });
  }, [
    products,
    statusFilter,
    selectedCategory,
    stockFilter,
    sourceFilter,
    onlyWithoutImage,
    onlyWithoutCategory,
    onlyGreenFilter,
    sortRedFirst,
    search,
    isProductInWeb,
  ]);

  // Paginación de resultados
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  // Cambiar página reset si cambian filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    statusFilter,
    selectedCategory,
    stockFilter,
    sourceFilter,
    onlyWithoutImage,
    onlyWithoutCategory,
    onlyGreenFilter,
    sortRedFirst,
  ]);

  const handleToggleWebStatus = async (product: FirebaseErpProduct) => {
    const currentWeb = isProductInWeb(product);
    const targetId = product.$id || product.sku;
    const suggestedWebPrice = Math.max(product.precio_venta_1 || 0, product.precio_venta_2 || 0);
    const changes = currentWeb
      ? { show_in_web: false, web_publish_pending: false }
      : { web_price: suggestedWebPrice, web_publish_pending: true };
    setUpdatingId(targetId);

    try {
      const ok = await updateFirebaseErpProduct(targetId, changes);
      if (!ok) throw new Error('No se pudo actualizar el producto.');
      setProducts((prev) => prev.map((p) => p.$id === product.$id ? {
        ...p,
        ...(currentWeb ? { show_in_web: false, web_publish_pending: false } : { web_price: suggestedWebPrice, web_publish_pending: true }),
      } : p));
      purgeServerProductsCache();
      showToast(currentWeb
        ? `"${product.nombre}" fue quitado de la web.`
        : `"${product.nombre}" fue enviado a Revisión web.`
      );
    } catch (e: any) {
      showToast(`Error: ${e?.message || e}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Selección individual en checkbox
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Seleccionar / Deseleccionar todos los visibles de la página
  const toggleSelectAllVisible = () => {
    const visibleIds = paginatedProducts.map((p) => p.$id || p.sku);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Análisis detallado de selección masiva
  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.$id || p.sku));
  }, [products, selectedIds]);

  const selectedPendingCount = useMemo(() => {
    return selectedProducts.filter((p) => !isProductInWeb(p) && !p.web_publish_pending).length;
  }, [selectedProducts, isProductInWeb]);

  const selectedPublishedCount = useMemo(() => {
    return selectedProducts.filter((p) => isProductInWeb(p)).length;
  }, [selectedProducts, isProductInWeb]);

  const handleBulkUpdate = async (sendToReview: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);

    const targetList = products.filter((p) =>
      selectedIds.has(p.$id || p.sku) && (sendToReview
        ? !isProductInWeb(p) && !p.web_publish_pending
        : isProductInWeb(p))
    );

    try {
      for (const item of targetList) {
        const changes = sendToReview
          ? {
              web_price: Math.max(item.precio_venta_1 || 0, item.precio_venta_2 || 0),
              web_publish_pending: true,
            }
          : { show_in_web: false, web_publish_pending: false };
        const ok = await updateFirebaseErpProduct(item.$id || item.sku, changes);
        if (!ok) throw new Error(`No se pudo actualizar ${item.nombre}.`);
      }
      purgeServerProductsCache();
      showToast(sendToReview
        ? `${targetList.length} productos enviados a Revisión web.`
        : `${targetList.length} productos quitados de la web.`
      );
      setSelectedIds(new Set());
      await loadData(true);
    } catch (err: any) {
      showToast(`Error al procesar lote: ${err?.message || err}`, 'error');
      loadData(true);
    } finally {
      setBulkProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 font-sans antialiased">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER Y NAVEGACIÓN SUPERIOR (LIGHT MODE PREMIUM)
      ───────────────────────────────────────────────────────────── */}
      {/* Barra de Flujo Móvil Sticky (1. Tienda / 2. Revisión / 3. Web / 4. Espera Stock) */}
      <div className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 shadow-2xs">
        {/* Sticky Mobile Step Navigator */}
        <ProductFlowNav
          currentStep={1}
          reviewCount={stats.review}
          webCount={stats.published}
          storeCount={stats.total}
          outOfStockCount={stats.outOfStockWebCount}
          onRefresh={() => loadData(true)}
          refreshing={refreshing || loading}
        />

        {/* Header Desktop (Oculto en móvil para eliminar exceso de padding) */}
        <div className="hidden sm:block px-3 sm:px-6 lg:px-8 py-2.5 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
            {/* Título & Migas */}
            <div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-semibold mb-1">
                <Link href="/admin/products" className="hover:text-indigo-600 transition-colors">
                  Productos
                </Link>
                <ChevronRight size={12} />
                <span className="text-slate-700">Tienda Física</span>
              </div>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700">
                  <Store className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h1 className="text-base sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-1.5 sm:gap-2">
                    Catálogo Tienda Física
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                      ERP / POS
                    </span>
                  </h1>
                  <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                    Selecciona productos de la tienda física y envíalos a Revisión web antes de publicarlos.
                  </p>
                </div>
              </div>
            </div>

            {/* Acciones del Header */}
            <div className="hidden sm:flex items-center gap-2.5 self-start sm:self-auto">
              <button
                onClick={() => loadData(true)}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs font-bold text-slate-700 transition-all cursor-pointer disabled:opacity-50"
                title="Refrescar catálogo desde Firebase"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
                <span>Actualizar Datos</span>
              </button>

              <Link
                href="/admin/store-catalog/revision-web"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>Revisión web ({stats.review})</span>
              </Link>

              <Link
                href="/admin/products"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
              >
                <ShoppingBag size={14} />
                <span>Ver Productos Web</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── BARRA MÓVIL COMPACTA (Sticky arriba, idéntica a Fase 3) ── */}
        <div className="sm:hidden px-2.5 pt-1 pb-2 space-y-1.5 border-t border-slate-100 bg-white">
          {/* Buscador compacto */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o código..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Chips con scroll horizontal: Barra de Estado de Seguridad (idéntica a Fase 3) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:none]">
            <button
              onClick={() => {
                setSortRedFirst((prev) => !prev);
                setOnlyGreenFilter(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap transition active:scale-95 shrink-0 ${
                sortRedFirst
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
              title="Mostrar primero los productos con stock crítico o vacíos"
            >
              <span>🔴 Críticos</span>
              <span className={`text-[10px] font-black px-1 rounded-full ${sortRedFirst ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'}`}>
                {stats.redCount}
              </span>
            </button>

            <button
              onClick={() => {
                // Notificación o toggle
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200 shrink-0 select-none"
            >
              <span>🟡 Precaución</span>
              <span className="text-[10px] font-black px-1 rounded-full bg-amber-100 text-amber-700">
                {stats.yellowCount}
              </span>
            </button>

            <button
              onClick={() => {
                setOnlyGreenFilter((prev) => !prev);
                setSortRedFirst(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition active:scale-95 shrink-0 ${
                onlyGreenFilter
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
              title="Filtrar solo productos en verde con stock seguro"
            >
              <span>🟢 Seguros</span>
              <span className={`text-[10px] font-black px-1 rounded-full ${onlyGreenFilter ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                {stats.greenCount}
              </span>
            </button>

            <span className="w-px h-3.5 bg-slate-200 shrink-0 mx-0.5" />

            {/* Filtros de estado / origen */}
            <button
              onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap border shrink-0 transition ${
                statusFilter === 'pending'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-indigo-50/70 text-indigo-700 border-indigo-200/70'
              }`}
            >
              Solo Tienda ({stats.pending})
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'published' ? 'all' : 'published')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap border shrink-0 transition ${
                statusFilter === 'published'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50/70 text-emerald-700 border-emerald-200/70'
              }`}
            >
              Ya en Web ({stats.published})
            </button>

            <button
              onClick={() => setOnlyWithoutImage((prev) => !prev)}
              className={`px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap border shrink-0 transition ${
                onlyWithoutImage
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Sin foto
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. TOAST NOTIFICACIÓN FLOTANTE
      ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
                : 'bg-rose-50/95 border-rose-200 text-rose-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. CONTENIDO PRINCIPAL: METRIC BENTO + FILTROS + TABLA
      ───────────────────────────────────────────────────────────── */}
      <div className="px-3 sm:px-6 lg:px-8 pt-2 sm:pt-6 space-y-3 sm:space-y-6">
        {/* ── BENTO METRICS CARDS (Ocultas en móvil para evitar scroll vertical excesivo) ── */}
        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Tienda */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Total Catálogo Físico
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats.total.toLocaleString()}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">SKUs en base de datos ERP</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
              <Boxes size={20} />
            </div>
          </div>

          {/* Card 2: Incorporados a Web */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                En Tienda Web
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats.published.toLocaleString()}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0}% del catálogo visible online
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Globe size={20} />
            </div>
          </div>

          {/* Card 3: Solo Tienda Física */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                Solo Tienda Física
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats.pending.toLocaleString()}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">No publicados en la web</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Store size={20} />
            </div>
          </div>

          {/* Card 4: Revisión web */}
          <Link href="/admin/store-catalog/revision-web" className="p-4 sm:p-5 rounded-2xl bg-white border border-amber-200 shadow-2xs flex items-center justify-between hover:bg-amber-50/40 transition-colors">
            <div>
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                Revisión web
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats.review.toLocaleString()}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Seleccionados antes de publicar</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <CheckCircle2 size={20} />
            </div>
          </Link>
        </div>

        {/* ── BARRA DE BÚSQUEDA Y FILTRADO DESKTOP ── */}
        <div className="hidden sm:block p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Input de Búsqueda */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por Nombre, SKU, Código de barras o Marca..."
                className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-900 bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200/80 focus:border-indigo-500 rounded-xl outline-hidden transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Selectores de Categoría y Stock */}
            <div className="flex items-center gap-2">
              {/* Categorías */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700 outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Todas las Categorías</option>
                {categories.map((c) => (
                  <option key={c.$id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Stock */}
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700 outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Todos los stocks</option>
                <option value="in_stock">Con Stock (&gt; 0)</option>
                <option value="out_of_stock">Agotados (= 0)</option>
              </select>

              {/* Origen */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700 outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Todos los orígenes</option>
                <option value="tienda">Tienda física</option>
                <option value="appwrite">Appwrite</option>
              </select>

              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={onlyWithoutImage} onChange={(e) => setOnlyWithoutImage(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Sin imagen
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={onlyWithoutCategory} onChange={(e) => setOnlyWithoutCategory(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Sin categoría
              </label>
            </div>
          </div>

          {/* Pestañas de Estado (Segmented Pills) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Todos los Productos ({products.length})
            </button>

            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100/80'
              }`}
            >
              <Store size={13} />
              <span>Solo Tienda Física ({stats.pending})</span>
            </button>

            <button
              onClick={() => setStatusFilter('published')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'published'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80'
              }`}
            >
              <Globe size={13} />
              <span>Ya en Web ({stats.published})</span>
            </button>

            {/* Separador sutil */}
            <span className="w-px h-5 bg-slate-200 my-auto mx-1 hidden sm:inline-block" />

            {/* Botón: Filtrar por Verde (Llenos / Seguros) */}
            <button
              onClick={() => setOnlyGreenFilter((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                onlyGreenFilter
                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/50'
                  : 'bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80'
              }`}
              title={
                onlyGreenFilter
                  ? 'Desactivar filtro verde (mostrando todos)'
                  : 'Filtrar para ver solo productos en VERDE (stock lleno y seguro para publicar)'
              }
            >
              <span className="text-[11px] leading-none">🟢</span>
              <span>Solo Verde / Llenos ({stats.greenCount})</span>
              {onlyGreenFilter && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>

            {/* Botón: Mostrar primero lo Rojo (Críticos / Vacíos) */}
            <button
              onClick={() => setSortRedFirst((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                sortRedFirst
                  ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400/50'
                  : 'bg-rose-50/80 text-rose-800 hover:bg-rose-100 border border-rose-200/80'
              }`}
              title={
                sortRedFirst
                  ? 'Desactivar orden rojo (volver a orden normal)'
                  : 'Ordenar la tabla para mostrar primero los productos en ROJO (vacíos, críticos o agotados)'
              }
            >
              <ArrowUpDown size={12} className={sortRedFirst ? 'text-white' : 'text-rose-600'} />
              <span className="text-[11px] leading-none">🔴</span>
              <span>Primero Rojos / Vacíos ({stats.redCount})</span>
              {sortRedFirst && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* ── TABLA DE PRODUCTOS DE TIENDA ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Header de resultados */}
          <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={
                  paginatedProducts.length > 0 &&
                  paginatedProducts.every((p) => selectedIds.has(p.$id || p.sku))
                }
                onChange={toggleSelectAllVisible}
                className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                title="Seleccionar todos los de esta página"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  Mostrando {filteredProducts.length} productos coincidentes
                </span>
                {onlyGreenFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-extrabold border border-emerald-200">
                    🟢 Filtro: Solo Verdes
                    <button
                      onClick={() => setOnlyGreenFilter(false)}
                      className="hover:text-emerald-950 cursor-pointer ml-0.5"
                      title="Quitar filtro verde"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
                {sortRedFirst && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-extrabold border border-rose-200">
                    🔴 Orden: Críticos primero
                    <button
                      onClick={() => setSortRedFirst(false)}
                      className="hover:text-rose-950 cursor-pointer ml-0.5"
                      title="Volver a orden normal"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
              </div>
            </div>

            {selectedIds.size > 0 && (
              <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                {selectedIds.size} seleccionados
              </span>
            )}
          </div>

          {/* Tabla Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-xs font-black border-b border-slate-200">
                <tr>
                  <th className="p-4 w-10 text-center"></th>
                  <th className="p-4 w-16">Foto</th>
                  <th className="p-4">Producto / SKU</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4 text-center">Stock Tienda</th>
                  <th className="p-4 text-right">Precio web</th>
                  <th className="p-4 text-center">Estado Web</th>
                  <th className="p-4 text-center w-72">Acciones</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                      <p className="font-bold text-xs">Cargando catálogo de tienda...</p>
                    </td>
                  </tr>
                ) : paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400">
                      <Package size={28} className="mx-auto mb-2 opacity-50" />
                      <p className="font-bold text-xs text-slate-600">No se encontraron artículos</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Prueba ajustando los filtros o el término de búsqueda.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((p) => {
                    const id = p.$id || p.sku;
                    const isSelected = selectedIds.has(id);
                    const isUpdating = updatingId === id;
                    const isPublished = isProductInWeb(p);
                    const isAppwrite = isAppwriteProduct(p);

                    return (
                      <tr
                        key={id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(id)}
                            className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Thumbnail */}
                        <td className="p-4">
                          <button
                            onClick={() => p.imageUrl && setZoomImage(p.imageUrl)}
                            className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200/80 overflow-hidden flex items-center justify-center shrink-0 hover:ring-2 hover:ring-indigo-400 transition cursor-zoom-in"
                          >
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.nombre}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <Package size={20} className="text-slate-400" />
                            )}
                          </button>
                        </td>

                        {/* Nombre & SKU */}
                        <td className="p-4">
                          <div className="min-w-[240px]">
                            <p className="font-black text-slate-900 line-clamp-1 text-sm">{p.nombre}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                SKU: {p.sku}
                              </span>
                              {isAppwrite && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded">
                                  <Globe size={11} />
                                  Appwrite
                                </span>
                              )}
                              {p.codigo_barra && (
                                <span className="font-mono text-xs text-slate-400 flex items-center gap-1">
                                  <Barcode size={11} />
                                  {p.codigo_barra}
                                </span>
                              )}
                              {isPublished && (
                                <Link
                                  href={`/productos/${p.$id || p.sku}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/60 px-2 py-0.5 rounded"
                                  title="Ver ficha pública del producto en la tienda online"
                                >
                                  <span>Ver en tienda</span>
                                  <ExternalLink size={11} />
                                </Link>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Categoría */}
                        <td className="p-4 text-slate-600 font-medium">
                          <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200/60 text-xs font-bold">
                            {p.category || 'General'}
                          </span>
                        </td>

                        {/* Stock Físico */}
                        <td className="p-4 text-center">
                          <span
                            className={`inline-block px-3 py-1.5 rounded-full text-xs font-black ${
                              (p.stock || 0) <= 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : (p.stock || 0) <= 5
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {(p.stock || 0) <= 0 ? '0 (Agotado)' : `${p.stock} un.`}
                          </span>
                          {/* Badge de riesgo de stock */}
                          <div className="mt-1.5 flex justify-center">
                            <StockRiskBadge
                              input={{
                                stock: p.stock || 0,
                                salesVelocity7d: (p as any).salesVelocity7d || 0,
                                maxBatchSize: (p as any).maxBatchSize || 1,
                                daysSinceCreated: (p as any).createdAt
                                  ? Math.floor((Date.now() - new Date((p as any).createdAt).getTime()) / 86400000)
                                  : 999,
                              }}
                              compact
                            />
                          </div>
                        </td>

                        {/* Precio web: usa el mayor de tienda mientras no se personalice */}
                        <td className="p-4 text-right font-bold text-slate-900 text-base">
                          ${(p.web_price || Math.max(p.precio_venta_1 || 0, p.precio_venta_2 || 0)).toLocaleString('es-CL')}
                        </td>

                        {/* Estado Web */}
                        <td className="p-4 text-center">
                          {isPublished ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">
                              <Globe size={13} />
                              <span>En Tienda Web</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold">
                              <Store size={13} />
                              <span>Solo Tienda Física</span>
                            </span>
                          )}
                        </td>

                        {/* Botones de acción */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* Botón: Editar ficha con partículas perladas */}
                            <button
                              onClick={() => setEditingProduct(p)}
                              title="Editar imágenes y ficha compartida"
                              className="group relative inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50 to-slate-100/90 px-3.5 py-2 text-xs font-black text-slate-700 shadow-xs hover:border-indigo-300/80 hover:text-indigo-900 hover:shadow-[0_4px_12px_rgba(99,102,241,0.12)] active:scale-[0.98] transition-all overflow-hidden cursor-pointer"
                            >
                              {/* Partículas perladas flotantes (hover reactivo) */}
                              <span className="pointer-events-none absolute left-2.5 top-1.5 h-1 w-1 rounded-full bg-indigo-400/60 opacity-0 group-hover:opacity-100 group-hover:animate-particleFloat1 transition-opacity duration-300" />
                              <span className="pointer-events-none absolute right-3 bottom-1.5 h-1.5 w-1.5 rounded-full bg-sky-400/50 opacity-0 group-hover:opacity-100 group-hover:animate-particleFloat2 transition-opacity duration-300" />
                              <span className="pointer-events-none absolute left-1/2 bottom-1 h-1 w-1 rounded-full bg-violet-400/50 opacity-0 group-hover:opacity-100 group-hover:animate-particleFloat3 transition-opacity duration-300" />
                              
                              {/* Haz de luz reflejada suave */}
                              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent group-hover:translate-x-full transition-transform duration-700 ease-out" />

                              <Pencil size={13} className="text-slate-500 group-hover:text-indigo-600 group-hover:-rotate-12 transition-transform duration-200" />
                              <span className="relative z-10">Editar ficha</span>
                            </button>

                            {/* Botón: Revisar para web con partículas cuánticas y aura cósmica */}
                            <button
                              onClick={() => handleToggleWebStatus(p)}
                              disabled={isUpdating || bulkProcessing}
                              title={
                                isPublished
                                  ? 'Hacer exclusivo de tienda física (quitar de la web)'
                                  : 'Enviar a Revisión web antes de publicar'
                              }
                              className={`group relative inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50 overflow-hidden active:scale-[0.98] ${
                                isPublished
                                  ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200'
                                  : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:via-purple-500 hover:to-violet-600 text-white border border-indigo-400/40 shadow-[0_2px_10px_rgba(99,102,241,0.28)] hover:shadow-[0_4px_18px_rgba(129,140,248,0.48)]'
                              }`}
                            >
                              {!isPublished && !isUpdating && (
                                <>
                                  {/* Partículas cuánticas estelares continuas */}
                                  <span className="pointer-events-none absolute left-2 top-1.5 h-1 w-1 rounded-full bg-white/90 shadow-[0_0_3px_#fff] animate-particleFloat1" />
                                  <span className="pointer-events-none absolute right-3 top-2 h-1.5 w-1.5 rounded-full bg-indigo-200/90 shadow-[0_0_4px_#a5b4fc] animate-particleFloat2" />
                                  <span className="pointer-events-none absolute left-1/2 bottom-1.5 h-1 w-1 rounded-full bg-purple-200/90 shadow-[0_0_3px_#d8b4fe] animate-particleFloat3" />
                                  <span className="pointer-events-none absolute right-8 bottom-1 h-1 w-1 rounded-full bg-white/80 shadow-[0_0_3px_#fff] animate-particleFloat1" style={{ animationDelay: '1.2s' }} />

                                  {/* Barrido continuo de brillo sedoso */}
                                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-btnShimmer" />
                                </>
                              )}

                              {isUpdating ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : isPublished ? (
                                <>
                                  <EyeOff size={13} />
                                  <span>Quitar de Web</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={13} className="group-hover:rotate-90 group-hover:scale-110 transition-transform duration-300" />
                                  <span className="relative z-10">Revisar para web</span>
                                </>
                              )}
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

          {/* ── TARJETAS MÓVILES RESPONSIVAS (md:hidden, Fase 1: Tienda) ── */}
          <div className="md:hidden p-3 space-y-2.5">
            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 p-3 flex gap-3 items-center animate-pulse">
                    <div className="w-16 h-16 rounded-xl bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : paginatedProducts.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 p-6 shadow-2xs">
                <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Package className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-700">No se encontraron artículos</p>
                <p className="text-xs text-slate-400 mt-1">Prueba con otro filtro o busca por otro término.</p>
              </div>
            ) : (
              paginatedProducts.map((p) => {
                const id = p.$id || p.sku;
                const isSelected = selectedIds.has(id);
                const isUpdating = updatingId === id;
                const isPublished = isProductInWeb(p);
                const isReviewPending = p.web_publish_pending && !isPublished;
                const pRisk = getProductRisk({
                  stock: p.stock || 0,
                  salesVelocity7d: (p as any).salesVelocity7d || 0,
                  maxBatchSize: (p as any).maxBatchSize || 1,
                  daysSinceCreated: (p as any).createdAt
                    ? Math.floor((Date.now() - new Date((p as any).createdAt).getTime()) / 86400000)
                    : 999,
                  price: Number(p.precio_venta_1 || (p as any).price || (p as any).PRICE || 0),
                });
                const isRedRisk = pRisk.level === 'rojo';

                return (
                  <div
                    key={id}
                    className={`w-full rounded-2xl border transition shadow-2xs p-3 space-y-2.5 ${
                      isSelected
                        ? 'border-indigo-400 ring-1 ring-indigo-300 bg-indigo-50/20'
                        : isRedRisk && isPublished
                        ? 'border-rose-300 ring-1 ring-rose-400/60 bg-rose-50/15'
                        : 'border-slate-200/80 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Checkbox táctil */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(id)}
                        className="mt-1 w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />

                      {/* Foto / Thumbnail */}
                      <div
                        onClick={() => p.imageUrl && setZoomImage(resolveStorageImageUrl(p.imageUrl))}
                        className="relative w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        {p.imageUrl ? (
                          <img
                            src={resolveStorageImageUrl(p.imageUrl)}
                            alt={p.nombre}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Package size={20} className="text-slate-300" />
                        )}
                        {isPublished ? (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded bg-purple-600 text-white shadow-xs">
                            WEB
                          </span>
                        ) : isReviewPending ? (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded bg-amber-500 text-white shadow-xs">
                            REV
                          </span>
                        ) : (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded bg-slate-700 text-slate-200 shadow-xs">
                            POS
                          </span>
                        )}
                      </div>

                      {/* Información central */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                          {p.nombre}
                        </p>

                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[9px] font-mono font-semibold text-slate-400">
                            {p.sku}
                          </span>
                          {(p.supplier || (p as any).proveedor) && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded-md">
                              {p.supplier || (p as any).proveedor}
                            </span>
                          )}
                          {(p.packageQty || (p as any).cantidad_embalaje) && (
                            <span className="text-[9px] font-medium px-1.5 py-0.2 bg-amber-50 text-amber-800 rounded-md">
                              Emb: {p.packageQty || (p as any).cantidad_embalaje}
                            </span>
                          )}
                        </div>

                        {/* Precios y Stock (Separación estricta de precio web vs tienda) */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] text-slate-400 font-bold">Tienda:</span>
                            <span className="text-xs sm:text-sm font-black text-slate-900">
                              ${(p.precio_venta_1 || 0).toLocaleString('es-CL')}
                            </span>
                          </div>
                          {Boolean(Number(p.web_price || 0) > 0 && p.web_price !== p.precio_venta_1) && (
                            <span className="text-[10px] font-black text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded-md">
                              Web: ${Number(p.web_price || 0).toLocaleString('es-CL')}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                              (p.stock || 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {(p.stock || 0) <= 0 ? '0 un. (Agotado)' : `${p.stock} un.`}
                          </span>
                        </div>
                      </div>

                      {/* Botones de acción laterales */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-xl hover:bg-slate-100 transition border border-slate-200 text-slate-600"
                          title="Editar ficha"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleWebStatus(p)}
                          disabled={isUpdating || bulkProcessing}
                          className={`w-8 h-8 flex items-center justify-center rounded-xl transition border text-xs font-bold disabled:opacity-50 ${
                            isPublished
                              ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                              : isReviewPending
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-indigo-600 text-white border-indigo-600 shadow-xs hover:bg-indigo-700'
                          }`}
                          title={
                            isPublished
                              ? 'Quitar de web'
                              : isReviewPending
                              ? 'Quitar de revisión'
                              : 'Enviar a Revisión Web (Paso 2)'
                          }
                        >
                          {isUpdating ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : isPublished ? (
                            <EyeOff size={13} />
                          ) : (
                            <ArrowRight size={13} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Barra animada de estado de seguridad (debajo de la tarjeta, idéntica a Fase 3) */}
                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <StockRiskBadge risk={pRisk} compact />
                      {isReviewPending ? (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          En Revisión (Paso 2)
                        </span>
                      ) : isPublished ? (
                        <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          Publicado en Web
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggleWebStatus(p)}
                          className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-0.5"
                        >
                          <span>Enviar a Revisión</span>
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Paginación */}
          <div className="px-5 py-4 border-t border-slate-200/80 bg-slate-50/50">
            <EpicPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => setCurrentPage(page)}
              pageSize={PAGE_SIZE}
              totalItems={filteredProducts.length}
            />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. BARRA FLOTANTE DE ACCIONES INTELIGENTE (BULK BAR)
      ───────────────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="backdrop-blur-2xl bg-white/95 border border-slate-200/90 shadow-2xl shadow-indigo-950/15 rounded-2xl p-3 px-5 flex flex-wrap items-center justify-between sm:justify-center gap-3">
            {/* Resumen dinámico del estado de la selección */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800">
                {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
              </span>
              {selectedPendingCount > 0 && selectedPublishedCount > 0 ? (
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  <span className="text-emerald-700 font-extrabold">{selectedPublishedCount} en Web</span> ·{' '}
                  <span className="text-slate-700 font-extrabold">{selectedPendingCount} solo Tienda</span>
                </span>
              ) : selectedPendingCount === 0 ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Check size={12} />
                  <span>Ya publicado{selectedPublishedCount > 1 ? 's' : ''} en Web</span>
                </span>
              ) : (
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Store size={12} />
                  <span>Seleccionado{selectedPendingCount > 1 ? 's' : ''} para revisar</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Si hay pendientes de incorporar a la web */}
              {selectedPendingCount > 0 && (
                <button
                  onClick={() => handleBulkUpdate(true)}
                  disabled={bulkProcessing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {bulkProcessing ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Globe size={13} />
                  )}
                  <span>
                    {selectedPendingCount === selectedIds.size
                      ? 'Enviar a Revisión web'
                      : `Enviar ${selectedPendingCount} a Revisión web`}
                  </span>
                </button>
              )}

              {/* Si hay artículos seleccionados que ya están en la web */}
              {selectedPublishedCount > 0 && (
                <button
                  onClick={() => handleBulkUpdate(false)}
                  disabled={bulkProcessing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/90 text-xs font-black transition-all cursor-pointer disabled:opacity-50"
                >
                  {bulkProcessing ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <EyeOff size={13} />
                  )}
                  <span>
                    {selectedPublishedCount === selectedIds.size
                      ? 'Quitar de Tienda Web'
                      : `Quitar ${selectedPublishedCount} de Web`}
                  </span>
                </button>
              )}

              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProduct && (
        <SharedProductEditor
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => loadData(true)}
        />
      )}

      {/* Modal de zoom de imagen */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 cursor-zoom-out"
        >
          <img
            src={zoomImage}
            alt="Vista ampliada"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl"
          />
          <button
            onClick={() => setZoomImage(null)}
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transition"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Animaciones de micro-partículas y barrido de luz para botones (GPU-aceleradas) */}
      <style jsx global>{`
        @keyframes particleFloat1 {
          0%, 100% {
            transform: translateY(0) scale(0.7);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-5px) scale(1.25);
            opacity: 0.95;
          }
        }
        @keyframes particleFloat2 {
          0%, 100% {
            transform: translateY(0) scale(0.6);
            opacity: 0.4;
          }
          50% {
            transform: translateY(-6px) scale(1.3);
            opacity: 1;
          }
        }
        @keyframes particleFloat3 {
          0%, 100% {
            transform: translateY(0) scale(0.8);
            opacity: 0.25;
          }
          50% {
            transform: translateY(-4px) scale(1.15);
            opacity: 0.85;
          }
        }
        @keyframes btnShimmer {
          0% {
            transform: translateX(-100%);
          }
          30%, 100% {
            transform: translateX(200%);
          }
        }
        .animate-particleFloat1 {
          animation: particleFloat1 2.2s ease-in-out infinite;
        }
        .animate-particleFloat2 {
          animation: particleFloat2 2.9s ease-in-out infinite 0.6s;
        }
        .animate-particleFloat3 {
          animation: particleFloat3 2.5s ease-in-out infinite 1.2s;
        }
        .animate-btnShimmer {
          animation: btnShimmer 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
