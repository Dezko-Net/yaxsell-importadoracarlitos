'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCircle2, Globe, Info, Package, Pencil, RefreshCw, Search, Tag, Trash2, Save, X } from 'lucide-react';
import {
  fetchAllFirebaseErpProducts,
  updateFirebaseErpProduct,
  purgeServerProductsCache,
  FirebaseErpProduct,
  isWebVisible,
} from '@/lib/firebaseErpService';
import SharedProductEditor from '../SharedProductEditor';
import StockRiskBadge from '@/components/admin/StockRiskBadge';
import ProductFlowNav from '@/components/admin/ProductFlowNav';
import { useStoreSettings } from '@/hooks/useStoreSettings';

function parsePrice(value: string | number): number {
  return Math.max(0, Math.round(Number(String(value).replace(/[^0-9]/g, '')) || 0));
}

function hasWebPriceLabel(label?: string): boolean {
  return String(label || '').toLowerCase().includes('web');
}

export default function RevisionWebPage() {
  const { inventoryMode } = useStoreSettings();
  const [products, setProducts] = useState<FirebaseErpProduct[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [message, setMessage] = useState('');
  const [editingProduct, setEditingProduct] = useState<FirebaseErpProduct | null>(null);
  const [p2ReviewOpen, setP2ReviewOpen] = useState(false);
  const [p2ReviewSearch, setP2ReviewSearch] = useState('');
  const [p2ReviewSelection, setP2ReviewSelection] = useState<Record<string, boolean>>({});
  const [p2Updating, setP2Updating] = useState(false);
  const [p2UpdateProgress, setP2UpdateProgress] = useState({ done: 0, total: 0 });

  const loadProducts = useCallback(async (force = false) => {
    setLoading(true);
    const all = await fetchAllFirebaseErpProducts(force);
    const inventoryProducts = all.map((product) => {
      const raw = product.rawDocument || product;
      const erpStock = Number(raw.STOCK ?? raw.stock ?? product.stock ?? 0) || 0;
      const webStock = Number(raw.WEB_STOCK ?? raw.web_stock ?? erpStock) || 0;
      return { ...product, stock: inventoryMode === 'web_independent' ? webStock : erpStock };
    });
    const pending = inventoryProducts
      .filter((p) => p.web_publish_pending && !isWebVisible(p))
      .sort((a, b) => {
        const stockDifference = Number((b.stock || 0) > 0) - Number((a.stock || 0) > 0);
        return stockDifference || (a.nombre || '').localeCompare(b.nombre || '', 'es');
      });
    setProducts(pending);
    setPrices(Object.fromEntries(pending.map((p) => [p.$id || p.sku, String(p.precio_venta_2 || 0)])));
    setLoading(false);
  }, [inventoryMode]);

  useEffect(() => { loadProducts(false); }, [loadProducts]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) =>
      p.nombre.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      p.codigo_barra?.toLowerCase().includes(query)
    );
  }, [products, search]);

  const visibleP2ReviewProducts = useMemo(() => {
    const query = p2ReviewSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) =>
      p.nombre.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      p.codigo_barra?.toLowerCase().includes(query) ||
      p.label_p2?.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query)
    );
  }, [products, p2ReviewSearch]);

  const openP2Review = () => {
    setP2ReviewSelection(Object.fromEntries(products.map((product) => {
      const id = product.$id || product.sku;
      return [id, hasWebPriceLabel(product.label_p2) && Number(product.precio_venta_2 || 0) > 0];
    })));
    setP2ReviewSearch('');
    setP2ReviewOpen(true);
  };

  const markWebLabeledProducts = () => {
    setP2ReviewSelection((current) => {
      const next = { ...current };
      for (const product of products) {
        if (hasWebPriceLabel(product.label_p2) && Number(product.precio_venta_2 || 0) > 0) {
          next[product.$id || product.sku] = true;
        }
      }
      return next;
    });
  };

  const selectedP2Products = products.filter((product) => {
    const id = product.$id || product.sku;
    const targetPrice = Number(product.precio_venta_2 || 0);
    const currentWebPrice = parsePrice(product.web_price ?? 0);
    return Boolean(p2ReviewSelection[id]) && targetPrice > 0 && currentWebPrice !== targetPrice;
  });

  const saveWebPrice = async (product: FirebaseErpProduct) => {
    const id = product.$id || product.sku;
    const webPrice = parsePrice(prices[id]);
    if (webPrice <= 0 || webPrice === product.web_price) return;
    const ok = await updateFirebaseErpProduct(id, { web_price: webPrice });
    if (ok) {
      setProducts((current) => current.map((item) => (item.$id || item.sku) === id ? { ...item, web_price: webPrice } : item));
      setMessage(`Precio web de “${product.nombre}” guardado.`);
    } else {
      setMessage(`No se pudo guardar el precio de “${product.nombre}”.`);
    }
  };

  const publishProduct = async (product: FirebaseErpProduct) => {
    const id = product.$id || product.sku;
    const webPrice = parsePrice(prices[id]);
    if (webPrice <= 0) {
      setMessage(`El precio web de “${product.nombre}” debe ser mayor a 0.`);
      return;
    }
    setProcessing(id);
    const ok = await updateFirebaseErpProduct(id, {
      web_price: webPrice,
      web_publish_pending: false,
      web_published_at: new Date().toISOString(),
      show_in_web: true,
    });
    if (ok) {
      purgeServerProductsCache();
      setProducts((current) => current.filter((item) => (item.$id || item.sku) !== id));
      setMessage(`“${product.nombre}” ya está publicado en la web.`);
    } else {
      setMessage(`No se pudo publicar “${product.nombre}”.`);
    }
    setProcessing(null);
  };

  const removeFromReview = async (product: FirebaseErpProduct) => {
    const id = product.$id || product.sku;
    setProcessing(id);
    const ok = await updateFirebaseErpProduct(id, { web_publish_pending: false });
    if (ok) {
      setProducts((current) => current.filter((item) => (item.$id || item.sku) !== id));
      setMessage(`“${product.nombre}” volvió a Solo tienda física.`);
    } else {
      setMessage(`No se pudo retirar “${product.nombre}”.`);
    }
    setProcessing(null);
  };

  const publishAll = async () => {
    if (!products.length || !confirm(`¿Publicar los ${products.length} productos de Revisión web?`)) return;
    setPublishingAll(true);
    try {
      for (const product of products) {
        const id = product.$id || product.sku;
        const webPrice = parsePrice(prices[id]);
        if (webPrice <= 0) throw new Error(`Precio inválido en “${product.nombre}”.`);
        const ok = await updateFirebaseErpProduct(id, {
          web_price: webPrice,
          web_publish_pending: false,
          web_published_at: new Date().toISOString(),
          show_in_web: true,
        });
        if (!ok) throw new Error(`No se pudo publicar “${product.nombre}”.`);
      }
      purgeServerProductsCache();
      setProducts([]);
      setMessage('Todos los productos fueron publicados correctamente.');
    } catch (error: any) {
      setMessage(error?.message || 'No se pudo completar la publicación.');
      await loadProducts();
    } finally {
      setPublishingAll(false);
    }
  };

  const updateWebPricesFromP2 = async () => {
    const selected = products.filter((product) => {
      const id = product.$id || product.sku;
      return Boolean(p2ReviewSelection[id]) && Number(product.precio_venta_2 || 0) > 0;
    });
    const toUpdate = selected.filter((product) => {
      return parsePrice(product.web_price ?? 0) !== Number(product.precio_venta_2 || 0);
    });
    if (!toUpdate.length) {
      setMessage('Los productos marcados ya tienen el precio web igual al P2.');
      return;
    }
    if (!confirm(`¿Copiar el segundo precio (P2) al precio web de ${toUpdate.length} productos? Solo se cambiará el precio web; no se publicarán.`)) return;

    setP2Updating(true);
    setP2UpdateProgress({ done: 0, total: toUpdate.length });
    const updated: Array<{ id: string; price: number }> = [];
    const failed: string[] = [];
    try {
      for (let index = 0; index < toUpdate.length; index += 1) {
        const product = toUpdate[index];
        const id = product.$id || product.sku;
        const price = Number(product.precio_venta_2 || 0);
        try {
          const ok = await updateFirebaseErpProduct(id, { web_price: price });
          if (ok) updated.push({ id, price });
          else failed.push(product.nombre);
        } catch {
          failed.push(product.nombre);
        }
        setP2UpdateProgress({ done: index + 1, total: toUpdate.length });
      }

      if (updated.length) {
        const updatedPrices = new Map(updated.map((item) => [item.id, item.price]));
        setProducts((current) => current.map((product) => {
          const id = product.$id || product.sku;
          return updatedPrices.has(id) ? { ...product, web_price: updatedPrices.get(id)! } : product;
        }));
        setPrices((current) => ({
          ...current,
          ...Object.fromEntries(updated.map((item) => [item.id, String(item.price)])),
        }));
      }

      if (failed.length) {
        setMessage(`Se actualizaron ${updated.length}; fallaron ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}.`);
      } else {
        setMessage(`Precio web actualizado desde P2 en ${updated.length} productos. Siguen pendientes de revisión y publicación.`);
        setP2ReviewOpen(false);
      }
    } finally {
      setP2Updating(false);
      setP2UpdateProgress({ done: 0, total: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-2xs">
        {/* Sticky Mobile Step Navigator */}
        <ProductFlowNav
          currentStep={2}
          reviewCount={products.length}
          onRefresh={() => loadProducts(true)}
          refreshing={loading}
        />

        <div className="px-3 sm:px-6 lg:px-8 py-2.5 sm:py-4 flex flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Link href="/admin/store-catalog" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 shrink-0">
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black truncate">2. Revisión web</h1>
              <p className="text-xs text-slate-500 hidden sm:block">Revisa el precio web antes de publicar. El stock seguirá compartido con la tienda física.</p>
            </div>
          </div>
          <button
            onClick={publishAll}
            disabled={!products.length || publishingAll || p2Updating}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-base disabled:opacity-50 shrink-0 shadow-sm transition active:scale-95"
          >
            {publishingAll ? <RefreshCw size={15} className="animate-spin" /> : <Globe size={15} />}
            <span>Publicar todos ({products.length})</span>
          </button>
        </div>
      </header>

      <main className="px-3 sm:px-6 lg:px-8 pt-3 sm:pt-6 space-y-3 sm:space-y-4">
        {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-bold text-indigo-800">{message}</div>}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><CheckCircle2 size={19} /></div>
            <div>
              <div className="text-lg sm:text-2xl font-black">{products.length}</div>
              <div className="text-[11px] sm:text-xs font-bold text-slate-500">productos esperando revisión</div>
            </div>
          </div>
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o SKU" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 sm:py-3 pl-9 pr-3 text-xs sm:text-sm font-semibold outline-none focus:border-indigo-500 focus:bg-white" />
          </div>
          <button
            type="button"
            onClick={openP2Review}
            disabled={!products.length || loading || publishingAll || p2Updating}
            className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs font-black text-violet-800 shadow-2xs transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Tag size={15} />
            Precio web desde P2
          </button>
        </div>

        {/* ═══ MOBILE CARDS VIEW (solo en móvil < md) ═══ */}
        <div className="md:hidden space-y-2.5">
          {loading ? (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="mx-auto mb-2 animate-spin text-slate-400" size={24} />
              <p className="text-xs font-bold">Cargando revisión…</p>
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              <Package className="mx-auto mb-2 text-slate-400" size={28} />
              <p className="text-xs font-bold">No hay productos esperando revisión.</p>
            </div>
          ) : (
            visibleProducts.map((product) => {
              const id = product.$id || product.sku;
              const busy = processing === id;
              return (
                <div key={id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="text-slate-400" size={22} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-xs sm:text-sm text-slate-900 leading-snug line-clamp-2">{product.nombre}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-400">SKU: {product.sku}</div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${(product.stock || 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {product.stock || 0} un.
                        </span>
                        <StockRiskBadge
                          input={{
                            stock: product.stock || 0,
                            salesVelocity7d: (product as any).salesVelocity7d || 0,
                            maxBatchSize: (product as any).maxBatchSize || 1,
                            daysSinceCreated: 999,
                          }}
                          compact
                        />
                      </div>
                    </div>
                  </div>

                  {/* Precios Tienda vs Web */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-xl p-2 text-xs">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">P1 · Efectivo tienda</span>
                      <span className="font-black text-slate-800 text-xs sm:text-sm">${(product.precio_venta_1 || 0).toLocaleString('es-CL')}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-violet-600 block">P2 · Embalaje / web</span>
                      <span className="font-black text-violet-900 text-xs sm:text-sm">${(product.precio_venta_2 || 0).toLocaleString('es-CL')}</span>
                      <span className={`mt-0.5 block text-[9px] font-bold ${hasWebPriceLabel(product.label_p2) ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {product.label_p2?.trim() || 'P2 sin etiqueta · revisar manualmente'}
                      </span>
                    </div>
                  </div>

                  {/* Input Precio Web con visualización de precio tienda y botón guardar */}
                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-950 flex items-center gap-1">
                        <Globe size={13} className="text-indigo-600" /> Precio web · sugerido P2:
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 inline-flex items-center rounded-xl border-2 border-indigo-300 bg-white px-2.5 py-1.5 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-200 shadow-2xs">
                        <span className="font-black text-indigo-700 text-sm mr-1">$</span>
                        <input
                          value={prices[id] ?? ''}
                          onChange={(e) => setPrices((current) => ({ ...current, [id]: e.target.value.replace(/[^0-9]/g, '') }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveWebPrice(product); }}
                          className="w-full bg-transparent text-right text-sm font-black text-indigo-950 outline-none"
                          inputMode="numeric"
                          placeholder="Precio web"
                        />
                      </div>
                      <button
                        onClick={() => saveWebPrice(product)}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition"
                        title="Guardar precio web"
                      >
                        <Save size={13} />
                        <span>Guardar</span>
                      </button>
                    </div>
                    <p className="text-[9px] text-indigo-700 font-medium">
                      🔒 Solo aplica en la web. No altera los precios físicos del POS.
                    </p>
                  </div>

                  {/* Acciones móviles */}
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100">
                    <button
                      onClick={() => setEditingProduct(product)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs active:bg-slate-100"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                    <button
                      onClick={() => publishProduct(product)}
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 disabled:opacity-50 active:scale-98 transition"
                    >
                      {busy ? <RefreshCw size={13} className="animate-spin" /> : <Globe size={13} />}
                      Publicar
                    </button>
                    <button
                      onClick={() => removeFromReview(product)}
                      disabled={busy}
                      className="p-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 disabled:opacity-50"
                      title="Quitar de revisión"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ═══ DESKTOP TABLE VIEW (solo en >= md) ═══ */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase text-slate-600">
              <tr>
                <th className="p-4">Producto</th>
                <th className="p-4 text-center">Stock</th>
                <th className="p-4 text-right">P1 · Efectivo tienda</th>
                <th className="p-4 text-right">P2 · Embalaje / web</th>
                <th className="p-4 text-right">Precio web · inicial P2</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-16 text-center text-slate-500"><RefreshCw className="mx-auto mb-3 animate-spin" />Cargando revisión…</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan={6} className="p-16 text-center text-slate-500"><Package className="mx-auto mb-3" />No hay productos esperando revisión.</td></tr>
              ) : visibleProducts.map((product) => {
                const id = product.$id || product.sku;
                const busy = processing === id;
                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <div className="flex items-center gap-4 min-w-[280px]">
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                          {product.imageUrl ? <img src={product.imageUrl} alt={product.nombre} className="w-full h-full object-cover" /> : <Package className="text-slate-400" />}
                        </div>
                        <div><div className="font-black text-base">{product.nombre}</div><div className="mt-1 font-mono text-xs text-slate-500">SKU: {product.sku}</div></div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-black ${(product.stock || 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{product.stock || 0} un.</span>
                      <div className="mt-1.5 flex justify-center">
                        <StockRiskBadge
                          input={{
                            stock: product.stock || 0,
                            salesVelocity7d: (product as any).salesVelocity7d || 0,
                            maxBatchSize: (product as any).maxBatchSize || 1,
                            daysSinceCreated: 999,
                          }}
                          compact
                        />
                      </div>
                    </td>
                    <td className="p-4 text-right font-bold">${(product.precio_venta_1 || 0).toLocaleString('es-CL')}</td>
                    <td className="bg-violet-50/40 p-4 text-right font-black text-violet-900">
                      <div>${(product.precio_venta_2 || 0).toLocaleString('es-CL')}</div>
                      <div className={`mt-1 text-[10px] font-bold ${hasWebPriceLabel(product.label_p2) ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {product.label_p2?.trim() || 'Sin etiqueta · revisión manual'}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <div className="inline-flex items-center rounded-xl border-2 border-indigo-200 bg-indigo-50 px-2.5 py-1.5 focus-within:border-indigo-500 focus-within:bg-white">
                          <span className="font-black text-indigo-700">$</span>
                          <input
                            value={prices[id] ?? ''}
                            onChange={(e) => setPrices((current) => ({ ...current, [id]: e.target.value.replace(/[^0-9]/g, '') }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveWebPrice(product); }}
                            className="w-24 bg-transparent text-right text-base font-black text-indigo-800 outline-none"
                            inputMode="numeric"
                          />
                        </div>
                        <button
                          onClick={() => saveWebPrice(product)}
                          className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 transition active:scale-95 cursor-pointer"
                          title="Guardar precio web"
                        >
                          <Save size={15} />
                        </button>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setEditingProduct(product)} title="Editar imágenes y ficha compartida" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 hover:bg-slate-100"><Pencil size={16} /></button>
                        <button onClick={() => publishProduct(product)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-black text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}Publicar</button>
                        <button onClick={() => removeFromReview(product)} disabled={busy} title="Quitar de revisión" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      {p2ReviewOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-2.5 backdrop-blur-sm sm:p-5"
          onClick={(event) => { if (event.target === event.currentTarget && !p2Updating) setP2ReviewOpen(false); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="p2-review-title"
            className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-cyan-50 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-200 bg-white text-violet-700 shadow-2xs"><Tag size={18} /></span>
                <div className="min-w-0">
                  <h2 id="p2-review-title" className="text-base font-black text-slate-900 sm:text-xl">Usar el segundo precio para la web</h2>
                  <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 sm:text-xs">
                    Se marcaron automáticamente los productos cuya etiqueta P2 menciona “web”. Los que no tienen esa etiqueta quedan para confirmar uno por uno.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setP2ReviewOpen(false)} disabled={p2Updating} aria-label="Cerrar revisión de P2" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50"><X size={17} /></button>
            </header>

            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-4 sm:px-6">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-lg font-black text-slate-900">{products.length}</div>
                <div className="text-[10px] font-bold text-slate-500">En esta revisión</div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-lg font-black text-emerald-800">{products.filter((product) => hasWebPriceLabel(product.label_p2) && Number(product.precio_venta_2 || 0) > 0).length}</div>
                <div className="text-[10px] font-bold text-emerald-700">Etiqueta P2 menciona web</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-lg font-black text-amber-800">{products.filter((product) => !hasWebPriceLabel(product.label_p2) && Number(product.precio_venta_2 || 0) > 0).length}</div>
                <div className="text-[10px] font-bold text-amber-700">Sin etiqueta web · manual</div>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
                <div className="text-lg font-black text-violet-800">{selectedP2Products.length}</div>
                <div className="text-[10px] font-bold text-violet-700">Precios que cambiarían</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={p2ReviewSearch} onChange={(event) => setP2ReviewSearch(event.target.value)} placeholder="Buscar nombre, SKU o etiqueta P2" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-violet-400 focus:bg-white" />
              </div>
              <button type="button" onClick={markWebLabeledProducts} disabled={p2Updating} className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">Marcar etiquetas con web</button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/70 p-3 sm:p-5">
              {visibleP2ReviewProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs font-bold text-slate-500">No hay productos que coincidan con esa búsqueda.</div>
              ) : visibleP2ReviewProducts.map((product) => {
                const id = product.$id || product.sku;
                const p2 = Number(product.precio_venta_2 || 0);
                const label = String(product.label_p2 || '').trim();
                const hasLabel = Boolean(label);
                const currentWeb = parsePrice(product.web_price ?? 0);
                const selected = Boolean(p2ReviewSelection[id]);
                const unchanged = p2 > 0 && currentWeb === p2;
                return (
                  <article key={id} className={`rounded-xl border bg-white p-3 shadow-2xs transition sm:rounded-2xl sm:p-4 ${selected ? 'border-violet-300 ring-1 ring-violet-100' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={p2Updating || p2 <= 0}
                        onChange={(event) => setP2ReviewSelection((current) => ({ ...current, [id]: event.currentTarget.checked }))}
                        aria-label={`Usar P2 para ${product.nombre}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-violet-700 disabled:opacity-40"
                      />
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-14 sm:w-14">
                        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package size={20} className="text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="min-w-0 flex-1 text-xs font-black text-slate-900 sm:text-sm">{product.nombre}</h3>
                          {unchanged && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">Ya coincide</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] font-medium text-slate-500 sm:text-[10px]">
                          <span className="font-mono">SKU {product.sku}</span>
                          {product.category && <span>{product.category}{product.subcategory ? ` · ${product.subcategory}` : ''}</span>}
                          {product.packageQty && <span>Embalaje {product.packageQty}</span>}
                          <span>Stock {product.stock || 0}</span>
                        </div>
                        <div className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black sm:text-[10px] ${hasWebPriceLabel(label) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : hasLabel ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-200 border-dashed bg-amber-50 text-amber-800'}`}>
                          <Tag size={11} className="shrink-0" />
                          <span className="truncate">P2: {label || 'sin etiqueta · confirmar manualmente'}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => { setP2ReviewOpen(false); setEditingProduct(product); }} disabled={p2Updating} title="Ver y editar ficha completa" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Pencil size={14} /></button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 pl-6 sm:gap-2 sm:pl-10">
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <div className="text-[8px] font-black uppercase tracking-wide text-slate-400 sm:text-[9px]">P1 tienda</div>
                        <div className="text-[10px] font-black text-slate-700 sm:text-xs">${Number(product.precio_venta_1 || 0).toLocaleString('es-CL')}</div>
                      </div>
                      <div className="rounded-lg bg-violet-50 px-2 py-1.5">
                        <div className="text-[8px] font-black uppercase tracking-wide text-violet-500 sm:text-[9px]">P2 a usar</div>
                        <div className="text-[10px] font-black text-violet-900 sm:text-xs">${p2.toLocaleString('es-CL')}</div>
                      </div>
                      <div className="rounded-lg bg-indigo-50 px-2 py-1.5">
                        <div className="text-[8px] font-black uppercase tracking-wide text-indigo-500 sm:text-[9px]">Web actual</div>
                        <div className="text-[10px] font-black text-indigo-900 sm:text-xs">${currentWeb.toLocaleString('es-CL')}</div>
                      </div>
                    </div>
                    {p2 <= 0 && <p className="mt-2 pl-6 text-[10px] font-bold text-rose-700 sm:pl-10">No se puede usar: P2 no tiene un precio válido.</p>}
                    {!hasWebPriceLabel(label) && p2 > 0 && <p className="mt-2 pl-6 text-[10px] font-semibold text-amber-800 sm:pl-10"><Info size={11} className="mr-1 inline -translate-y-px" />No se marca automáticamente; selecciónalo si confirmas que este P2 es para la web.</p>}
                  </article>
                );
              })}
            </div>

            {p2Updating && (
              <div className="border-t border-violet-100 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-800 sm:px-6">
                Actualizando precio web: {p2UpdateProgress.done} de {p2UpdateProgress.total}…
              </div>
            )}
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[10px] font-semibold text-slate-500">No cambia P1 ni P2 y no publica productos.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setP2ReviewOpen(false)} disabled={p2Updating} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none">Cancelar</button>
                <button type="button" onClick={updateWebPricesFromP2} disabled={p2Updating || selectedP2Products.length === 0} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">
                  {p2Updating ? <RefreshCw size={14} className="animate-spin" /> : <Check size={15} />}
                  {p2Updating ? 'Actualizando…' : `Actualizar ${selectedP2Products.length} precios web`}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {editingProduct && (
        <SharedProductEditor
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={loadProducts}
        />
      )}
    </div>
  );
}
