'use client';

import { Search, X, Plus, Package, ChevronRight, ChevronLeft, RefreshCw, ChevronDown, Sparkles, Loader2, Wrench, ImageOff, AlertTriangle, EyeOff, Globe, ArrowUpDown, DollarSign, Check } from 'lucide-react';
import { Product, Category } from '@/types/admin';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { useState } from 'react';
import ProductFlowNav from '@/components/admin/ProductFlowNav';
import StockRiskBadge from '@/components/admin/StockRiskBadge';
import { getProductRisk } from '@/lib/stock-risk';
import { updateFirebaseErpProduct, purgeServerProductsCache } from '@/lib/firebaseErpService';

type StockFilter = 'all' | 'instock' | 'low' | 'out';

interface Props {
  products: Product[];       // ya filtrados y ordenados (página actual)
  allProducts: Product[];    // para los contadores de los chips
  isLoading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
  categories: Category[];
  catFilter: string;
  onCatChange: (v: string) => void;
  stockFilter: StockFilter;
  onStockFilterChange: (v: StockFilter) => void;
  onEdit: (p: Product) => void;
  onEnhanceProduct: (p: Product) => void;
  onAdd: () => void;
  onDelete?: (id: string) => void;
  deleteId?: string | null;
  aiLoading?: boolean;
  globalTotal?: number;
  onRefresh: () => void;
  currentPage: number;
  hasMore: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  // Fotos rotas / sin imagen
  brokenImages?: Record<string, string[]>;
  brokenOnly?: boolean;
  onBrokenOnlyChange?: (v: boolean) => void;
  onSyncBrokenImages?: () => void;
  syncingImages?: boolean;
  syncProgress?: { checked: number; broken: number };
  noImageOnly?: boolean;
  onNoImageOnlyChange?: (v: boolean) => void;
  // Salud Web / Riesgo
  riskFilter?: 'all' | 'rojo' | 'amarillo' | 'verde';
  onRiskFilterChange?: (v: 'all' | 'rojo' | 'amarillo' | 'verde') => void;
  riskCounts?: { rojo: number; amarillo: number; verde: number; all: number };
  sortRiskDir?: 'asc' | 'desc' | null;
  onToggleSortRisk?: () => void;
  sortNewestDir?: 'asc' | 'desc' | null;
  onToggleSortNewest?: () => void;
  onToggleWebStatus?: (p: Product) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

function StockBadge({ stock }: { stock: number }) {
  if (stock === 99999)
    return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700">Ilimitado</span>;
  if (stock <= 0)
    return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-red-100 text-red-600">Agotado</span>;
  if (stock <= 10)
    return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700">{stock} un.</span>;
  return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700">{stock} un.</span>;
}

export default function MobileProductList({
  products, allProducts, isLoading,
  search, onSearchChange, onSearchSubmit, onSearchClear,
  categories, catFilter, onCatChange,
  stockFilter, onStockFilterChange,
  onEdit, onEnhanceProduct, onAdd, onDelete, deleteId, aiLoading, globalTotal, onRefresh,
  currentPage, hasMore, onNextPage, onPrevPage,
  brokenImages = {}, brokenOnly = false, onBrokenOnlyChange, onSyncBrokenImages, syncingImages = false, syncProgress,
  noImageOnly = false, onNoImageOnlyChange,
  riskFilter = 'all', onRiskFilterChange, riskCounts, sortRiskDir, onToggleSortRisk, sortNewestDir, onToggleSortNewest, onToggleWebStatus,
}: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [inlinePriceValue, setInlinePriceValue] = useState<string>('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);

  const brokenCount = Object.keys(brokenImages).length;
  const noImageCount = allProducts.filter(p => !p.IMAGEURL).length;
  const counts: Record<StockFilter, number> = {
    all: allProducts.length,
    instock: allProducts.filter(p => (p.STOCK ?? 0) > 0).length,
    low: allProducts.filter(p => (p.STOCK ?? 0) > 0 && (p.STOCK ?? 0) <= 10).length,
    out: allProducts.filter(p => (p.STOCK ?? 0) === 0).length,
  };
  const chips: [StockFilter, string][] = [['instock', 'En stock'], ['low', 'Stock bajo'], ['out', 'Agotados'], ['all', 'Todos']];

  // Activar / desactivar edición inline de precio web
  const handleToggleInlinePrice = (p: Product) => {
    if (editingPriceId === p.$id) {
      setEditingPriceId(null);
    } else {
      const storePrice = Number((p as any).STORE_PRICE ?? (p as any).precio_venta_1 ?? p.CURRENTPRICE ?? p.PRICE ?? 0);
      const currentWeb = Number((p as any).WEBPRICE ?? (p as any).web_price ?? storePrice);
      setInlinePriceValue(String(currentWeb || ''));
      setEditingPriceId(p.$id);
    }
  };

  // Guardar nuevo precio web en Firestore sin alterar precio de tienda física (POS)
  const handleSaveInlinePrice = async (p: Product) => {
    const cleanVal = parseInt(inlinePriceValue.replace(/\D/g, ''), 10);
    if (isNaN(cleanVal) || cleanVal <= 0) {
      alert('Ingresa un precio válido mayor a 0');
      return;
    }

    setSavingPriceId(p.$id);
    try {
      const ok = await updateFirebaseErpProduct(p.$id, {
        web_price: cleanVal,
      });
      if (!ok) throw new Error('No se pudo guardar el precio en base de datos');

      // Purgar caché de servidor para que la tienda web refleje el precio de inmediato
      purgeServerProductsCache();
      try { sessionStorage.removeItem('carlitos_admin_products_all_v1'); } catch {}

      // Actualizar producto en memoria para que el jefe lo vea al instante
      (p as any).web_price = cleanVal;
      (p as any).WEBPRICE = cleanVal;

      setEditingPriceId(null);
    } catch (err: any) {
      alert('Error guardando precio web: ' + (err?.message || err));
    } finally {
      setSavingPriceId(null);
    }
  };

  // Quitar de la web y regresar a Fase 1 (Solo tienda física)
  const handleRemoveFromWeb = async (p: Product) => {
    const confirmed = window.confirm(`¿Quitar “${p.NAME}” de la web y regresarlo a Fase 1 (Solo Tienda física)?`);
    if (!confirmed) return;

    setUnpublishingId(p.$id);
    try {
      const ok = await updateFirebaseErpProduct(p.$id, {
        show_in_web: false,
        web_publish_pending: false,
      });
      if (!ok) throw new Error('No se pudo actualizar en base de datos');

      purgeServerProductsCache();
      try { sessionStorage.removeItem('carlitos_admin_products_all_v1'); } catch {}

      if (onToggleWebStatus) {
        onToggleWebStatus(p);
      } else {
        onRefresh();
      }
    } catch (err: any) {
      alert('Error al quitar de web: ' + (err?.message || err));
    } finally {
      setUnpublishingId(null);
    }
  };

  return (
    <div className="md:hidden space-y-2 pb-24">
      {/* ═══ STICKY HEADER MÓVIL COMPACTO (Fijo arriba con padding mínimo) ═══ */}
      <div className="sticky top-0 z-30 -mx-2 -mt-3 px-2.5 pt-1 pb-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs space-y-1.5">
        {/* Fila 1: Step Navigator */}
        <ProductFlowNav
          currentStep={stockFilter === 'out' ? 4 : 3}
          webCount={globalTotal || allProducts.length}
          outOfStockCount={counts.out}
          onRefresh={onRefresh}
          refreshing={isLoading}
        />

        {/* Fila 2: Buscador compacto + Herramientas juntos */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSearchSubmit(); }}
              placeholder="Buscar por nombre, SKU o código..."
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-xl text-xs shadow-2xs focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium"
            />
            {search && (
              <button onClick={onSearchClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Herramientas (junto al buscador) */}
          <div className="relative">
            <button onClick={() => setToolsOpen(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold shadow-2xs active:scale-95 transition whitespace-nowrap">
              <Wrench className="w-3.5 h-3.5 text-gray-500" />
              <span>Herram.</span>
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
            </button>
            {toolsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setToolsOpen(false)} />
                <div className="absolute right-0 mt-1 z-30 w-52 bg-white border border-gray-100 rounded-2xl shadow-xl ring-1 ring-black/5 p-2 flex flex-col max-h-[70vh] overflow-y-auto">
                  <p className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Imágenes</p>
                  <button onClick={() => { setToolsOpen(false); onSyncBrokenImages?.(); }} disabled={syncingImages || allProducts.length === 0}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-100 transition text-left disabled:opacity-40">
                    <ImageOff className={`w-3.5 h-3.5 ${brokenCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                    {syncingImages ? 'Verificando…' : 'Verificar fotos'}
                    {brokenCount > 0 && !syncingImages && (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{brokenCount}</span>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Fila 3: Chips con scroll horizontal: Salud Web + Categoría + Sin imagen + Stock */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 items-center" style={{ scrollbarWidth: 'none' }}>
          {/* Salud Web chips */}
          {onRiskFilterChange && (
            <>
              <button
                onClick={() => onRiskFilterChange(riskFilter === 'rojo' ? 'all' : 'rojo')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap transition shrink-0 active:scale-95 ${
                  riskFilter === 'rojo' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
                title="Ver productos críticos o vacíos a sacar de web"
              >
                <span>🔴 Críticos</span>
                {riskCounts && (
                  <span className={`text-[10px] font-black px-1 rounded-full ${riskFilter === 'rojo' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'}`}>
                    {riskCounts.rojo}
                  </span>
                )}
              </button>
              <button
                onClick={() => onRiskFilterChange(riskFilter === 'amarillo' ? 'all' : 'amarillo')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition shrink-0 active:scale-95 ${
                  riskFilter === 'amarillo' ? 'bg-amber-500 text-white shadow-xs' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <span>🟡 Precaución</span>
                {riskCounts && (
                  <span className={`text-[10px] font-black px-1 rounded-full ${riskFilter === 'amarillo' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    {riskCounts.amarillo}
                  </span>
                )}
              </button>
              <button
                onClick={() => onRiskFilterChange(riskFilter === 'verde' ? 'all' : 'verde')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition shrink-0 active:scale-95 ${
                  riskFilter === 'verde' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                <span>🟢 Seguros</span>
                {riskCounts && (
                  <span className={`text-[10px] font-black px-1 rounded-full ${riskFilter === 'verde' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    {riskCounts.verde}
                  </span>
                )}
              </button>
              {onToggleSortNewest && (
                <button
                  onClick={onToggleSortNewest}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap transition shrink-0 active:scale-95 ${
                    sortNewestDir ? 'bg-sky-100 text-sky-800 border border-sky-300' : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                  title="Ordenar por fecha de publicación"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{sortNewestDir === 'asc' ? 'Antiguos 1°' : 'Nuevos 1°'}</span>
                </button>
              )}
              {onToggleSortRisk && (
                <button
                  onClick={onToggleSortRisk}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap transition shrink-0 active:scale-95 ${
                    sortRiskDir === 'asc' ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : sortRiskDir === 'desc' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                  title="Alternar orden"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{sortRiskDir === 'asc' ? '🔴 1°' : sortRiskDir === 'desc' ? '🟢 1°' : 'Salud'}</span>
                </button>
              )}
              <span className="w-px h-4 bg-gray-300 shrink-0 mx-0.5" />
            </>
          )}

          {/* Selector de categoría compacto tipo chip */}
          <div className="relative shrink-0">
            <select
              value={catFilter}
              onChange={e => onCatChange(e.target.value)}
              className="appearance-none pl-2.5 pr-6 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-700 shadow-2xs focus:outline-none"
            >
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>

          {/* Chip Sin imagen */}
          {noImageCount > 0 && onNoImageOnlyChange && (
            <button
              onClick={() => onNoImageOnlyChange(!noImageOnly)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 active:scale-95 ${
                noImageOnly ? 'bg-gray-800 text-white shadow-xs' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              <span>Sin imagen</span>
              <span className={`text-[10px] font-bold px-1 rounded-full ${noImageOnly ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>{noImageCount}</span>
            </button>
          )}

          <span className="w-px h-4 bg-gray-300 shrink-0 mx-0.5" />

          {/* Chips de stock */}
          {chips.map(([k, label]) => (
            <button key={k} onClick={() => onStockFilterChange(k)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 active:scale-95 ${
                stockFilter === k ? 'bg-gray-900 text-white shadow-xs' : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              {label}
              <span className={`text-[10px] font-bold px-1 rounded-full ${
                stockFilter === k ? 'bg-white/20 text-white'
                : k === 'out' ? 'bg-red-100 text-red-600'
                : k === 'low' ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
              }`}>{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Progreso de verificación */}
      {syncingImages && syncProgress && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Verificando fotos {syncProgress.checked}/{allProducts.flatMap(p => [p.IMAGEURL, p.IMAGEURL2, p.IMAGEURL3].filter(Boolean)).length} · {syncProgress.broken} rotas
        </div>
      )}

      {/* Lista de tarjetas móviles */}
      {isLoading && products.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-2.5 flex gap-3 items-center animate-pulse">
              <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 p-6 shadow-2xs">
          <div className="w-14 h-14 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Package className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-700">No hay productos aquí</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Prueba con otro filtro o agrega uno nuevo</p>
          <button onClick={onAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition">
            <Plus className="w-4 h-4" /> Agregar producto
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(p => {
            const pRisk = getProductRisk({
              stock: p.STOCK ?? 0,
              salesVelocity7d: (p as any).salesVelocity7d || 0,
              maxBatchSize: (p as any).maxBatchSize || 1,
              daysSinceCreated: p.$createdAt
                ? Math.floor((Date.now() - new Date(p.$createdAt).getTime()) / 86400000)
                : 999,
              price: Number(p.CURRENTPRICE ?? p.PRICE ?? 0),
            });
            const isRedRisk = pRisk.level === 'rojo';
            const isWeb = Boolean((p as any).SHOW_IN_WEB ?? (p as any).show_in_web);

            // Precios oficiales
            const storePrice = Number((p as any).STORE_PRICE ?? (p as any).precio_venta_1 ?? p.CURRENTPRICE ?? p.PRICE ?? 0);
            const currentWebPrice = Number((p as any).WEBPRICE ?? (p as any).web_price ?? storePrice);
            const hasCustomWebPrice = Boolean(storePrice > 0 && currentWebPrice > 0 && currentWebPrice !== storePrice);

            return (
              <div key={p.$id}
                className={`w-full rounded-2xl border transition shadow-2xs p-2.5 sm:p-3 space-y-2 ${
                  isRedRisk && isWeb
                    ? 'border-rose-300 ring-1 ring-rose-400/60 bg-rose-50/15'
                    : 'border-gray-100 bg-white'
                }`}>
                <div className="flex gap-2.5 items-center text-left">
                  <button onClick={() => onEdit(p)} className="flex-1 flex gap-2.5 items-center text-left min-w-0">
                    <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {p.IMAGEURL ? (
                        <img src={resolveStorageImageUrl(p.IMAGEURL)} alt={p.NAME} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="w-6 h-6 text-gray-300" />
                      )}
                      {(brokenImages[p.$id]?.length ?? 0) > 0 && (
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center" title={`${brokenImages[p.$id].length} imagen(es) rota(s)`}>
                          <ImageOff className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      {isWeb ? (
                        isRedRisk ? (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded bg-rose-600 text-white shadow-sm animate-pulse">
                            🔴 WEB
                          </span>
                        ) : (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded bg-purple-600 text-white shadow-sm">
                            WEB
                          </span>
                        )
                      ) : (
                        <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 rounded bg-slate-700 text-slate-200 shadow-sm">
                          POS
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-gray-900 leading-snug line-clamp-2">
                        {p.NAME}
                      </p>
                      {((p.BRAND || p.SUPPLIER) || (p.QUANTITY || p.PACKAGE_QTY || p.EMBALAJEQTY) || p.BOX_CODE) && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {(p.BRAND || p.SUPPLIER) && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded-md">
                              {p.BRAND || p.SUPPLIER}
                            </span>
                          )}
                          {(p.QUANTITY || p.PACKAGE_QTY || p.EMBALAJEQTY) && (
                            <span className="text-[9px] font-medium px-1.5 py-0.2 bg-amber-50 text-amber-800 rounded-md">
                              Emb: {p.QUANTITY || p.PACKAGE_QTY || `${p.EMBALAJEQTY} un.`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Precios: Solo mostrar tachado + morado si hay un precio exclusivo para web */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {hasCustomWebPrice ? (
                          <>
                            <span className="text-[11px] text-gray-400 line-through font-semibold" title="Precio original en Tienda física">
                              {fmt(storePrice)}
                            </span>
                            <span
                              className="text-xs sm:text-sm font-black px-1.5 py-0.2 rounded-md text-purple-700 bg-purple-100/90 border border-purple-300"
                              title="Precio exclusivo Web"
                            >
                              Web: {fmt(currentWebPrice)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs sm:text-sm font-black text-gray-900">
                            {fmt(storePrice || currentWebPrice || 0)}
                          </span>
                        )}
                        <StockBadge stock={p.STOCK ?? 0} />
                      </div>
                    </div>
                  </button>

                  {/* Columna de Acciones Móvil: 1. Ficha completa, 2. Quitar de web (Vuelve a Fase 1: Tienda), 3. Editar precio web inline */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {/* Botón 1: Ver / Editar Ficha Completa */}
                    <button
                      onClick={() => onEdit(p)}
                      className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-xl hover:bg-gray-100 transition border border-gray-200 text-gray-700 active:scale-95"
                      title="Editar ficha completa"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>

                    {/* Botón 2: Quitar de la Web (Regresa a Fase 1: Tienda) — Reemplaza la papelera de eliminar */}
                    <button
                      onClick={() => handleRemoveFromWeb(p)}
                      disabled={unpublishingId === p.$id}
                      className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-xl hover:bg-amber-100 transition border border-amber-200 text-amber-700 disabled:opacity-50 active:scale-95"
                      title="Quitar de la web (regresar a Fase 1: Solo Tienda)"
                    >
                      {unpublishingId === p.$id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    {/* Botón 3: Editar Precio Web Directo (DEBAJO de Quitar de Web) */}
                    <button
                      onClick={() => handleToggleInlinePrice(p)}
                      className={`w-8 h-8 flex items-center justify-center rounded-xl transition border active:scale-95 ${
                        editingPriceId === p.$id
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700'
                      }`}
                      title="Editar precio web directamente"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ── Editor inline de precio web directamente en la tarjeta ── */}
                {editingPriceId === p.$id && (
                  <div
                    className="pt-2 mt-1 border-t border-purple-200 bg-purple-50/70 p-2.5 rounded-xl space-y-1.5 shadow-2xs"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500 font-medium">
                        Tienda: <span className={`font-bold ${hasCustomWebPrice ? 'line-through text-gray-400' : 'text-gray-700'}`}>{fmt(storePrice)}</span>
                      </span>
                      <span className="text-purple-800 font-bold">Cambiar Precio Web</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-700 font-black text-xs">$</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={inlinePriceValue}
                          onChange={e => setInlinePriceValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveInlinePrice(p);
                            if (e.key === 'Escape') setEditingPriceId(null);
                          }}
                          autoFocus
                          placeholder={String(currentWebPrice)}
                          className="w-full pl-6 pr-2 py-1.5 bg-white border border-purple-300 rounded-lg text-xs font-black text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveInlinePrice(p)}
                        disabled={savingPriceId === p.$id}
                        className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg text-xs font-black flex items-center gap-1 shadow-2xs disabled:opacity-50 active:scale-95 transition"
                        title="Guardar nuevo precio web"
                      >
                        {savingPriceId === p.$id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Guardar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPriceId(null)}
                        className="p-1.5 bg-white hover:bg-gray-100 text-gray-500 rounded-lg border border-gray-200 text-xs active:scale-95 transition"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Barra animada de salud de stock */}
                <div className="pt-1 border-t border-gray-100 flex items-center justify-between gap-2">
                  <StockRiskBadge risk={pRisk} compact />
                  {isRedRisk && isWeb && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-black border border-rose-200 animate-pulse shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                      Peligro Quiebre
                    </span>
                  )}
                </div>

                {/* Botón directo "Quitar de Web" para los críticos en rojo */}
                {isRedRisk && isWeb && (
                  <div className="pt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromWeb(p);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-black shadow-xs active:scale-98 transition animate-pulse"
                      title="Quitar este producto crítico de la web para proteger inventario en tienda física"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-rose-100" />
                      <span>Quitar de Web ahora</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paginación simple */}
      {(currentPage > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button onClick={onPrevPage} disabled={currentPage <= 1 || isLoading}
            className="flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-40 active:scale-95 transition">
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="text-xs font-semibold text-gray-500">Página {currentPage}</span>
          <button onClick={onNextPage} disabled={!hasMore || isLoading}
            className="flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition">
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* FAB Agregar */}
      <div className="fixed bottom-6 right-5 z-40">
        <button onClick={onAdd} aria-label="Agregar producto"
          className="w-14 h-14 rounded-full bg-gray-900 text-white shadow-xl shadow-gray-900/30 flex items-center justify-center active:scale-90 transition">
          <Plus className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
