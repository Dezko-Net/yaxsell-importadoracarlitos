'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ExternalLink, ImageOff, Loader2,
  Package, Plus, RefreshCw, Search, Save, ShoppingBag, Sparkles, X,
} from 'lucide-react';
import { auth, authReady } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/admin-access';
import { fetchAllFirebaseErpProducts, type FirebaseErpProduct } from '@/lib/firebaseErpService';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { isProductPublishedOnWeb } from '@/lib/product-publication';
import { MAX_COMBO_PRODUCTS, type ComboItemConfig } from '@/lib/combo-types';

type ProductOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
  image: string;
  sku: string;
  published: boolean;
};

const EMPTY_COMBO: ComboItemConfig = {
  id: 'combo-default-1',
  title: 'Arma tu Combo Pro',
  subtitle: 'Selecciona tus productos favoritos y obtén un descuento exclusivo en tu paquete.',
  discountPercent: 0,
  badge: 'PACK DESTACADO',
  isActive: false,
  mainProductId: '',
  bundleProductIds: [],
};

const formatPrice = (value: number) => '$' + Math.round(value || 0).toLocaleString('es-CL');

function toProductOption(product: FirebaseErpProduct): ProductOption {
  const raw = product.rawDocument || product;
  const price = Number(raw.WEBPRICE ?? raw.web_price ?? product.web_price ?? raw.CURRENTPRICE ?? raw.current_price ?? product.precio_venta_1 ?? 0);
  // Los packs solo pueden usar productos que están en el POS y publicados de verdad en la web.
  const published = !product.web_only && Number(product.stock ?? -1) >= 0 && isProductPublishedOnWeb({
    ...raw,
    SHOW_IN_WEB: raw.SHOW_IN_WEB ?? raw.show_in_web ?? product.show_in_web,
    IS_DRAFT: raw.IS_DRAFT ?? raw.is_draft ?? product.is_draft,
    WEB_PUBLISH_PENDING: raw.WEB_PUBLISH_PENDING ?? raw.web_publish_pending ?? product.web_publish_pending,
    STATUS: raw.STATUS ?? raw.status ?? product.status,
    PRICE: raw.PRICE ?? raw.price ?? product.precio_venta_1,
    WEBPRICE: raw.WEBPRICE ?? raw.web_price ?? product.web_price,
    STOCK: raw.STOCK ?? raw.stock ?? product.stock,
  });
  const image = String(raw.IMAGEURL ?? product.imageUrl ?? '');
  return {
    id: product.$id,
    name: product.nombre || 'Producto sin nombre',
    price,
    stock: Number(product.stock || 0),
    image: resolveStorageImageUrl(image) || '',
    sku: product.sku || '',
    published,
  };
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `combo-${Date.now()}`;
}

export default function PacksAdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [configs, setConfigs] = useState<ComboItemConfig[]>([]);
  const [config, setConfig] = useState<ComboItemConfig>(EMPTY_COMBO);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (refreshProducts = false) => {
    setError('');
    if (refreshProducts) setRefreshing(true);
    else setLoading(true);
    try {
      await authReady;
      const currentUser = auth.currentUser;
      if (!currentUser || !isAdminEmail(currentUser.email)) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      const token = await currentUser.getIdToken();
      const [comboResponse, productData] = await Promise.all([
        fetch('/api/admin/combos', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
        fetchAllFirebaseErpProducts(refreshProducts),
      ]);
      const comboData = await comboResponse.json().catch(() => null);
      if (!comboResponse.ok || comboData?.success !== true || !Array.isArray(comboData.configs)) {
        throw new Error(comboData?.error || 'No se pudo cargar la configuración del pack.');
      }
      const nextConfigs = comboData.configs as ComboItemConfig[];
      const first = nextConfigs[0] || { ...EMPTY_COMBO, id: makeId() };
      setConfigs(nextConfigs);
      setConfig({
        ...first,
        bundleProductIds: Array.isArray(first.bundleProductIds) ? first.bundleProductIds.slice(0, MAX_COMBO_PRODUCTS) : [],
      });
      setProducts(productData.map(toProductOption));
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar productos y packs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedProducts = useMemo(() => {
    const byId = new Map(products.map(product => [product.id, product]));
    return config.bundleProductIds.map(id => byId.get(id)).filter(Boolean) as ProductOption[];
  }, [config.bundleProductIds, products]);

  const unavailableIds = useMemo(() => {
    const eligibleIds = new Set(products.filter(product => product.published).map(product => product.id));
    return config.bundleProductIds.filter(id => !eligibleIds.has(id));
  }, [config.bundleProductIds, products]);

  const removeUnavailableProducts = () => {
    const unavailable = new Set(unavailableIds);
    setConfig(current => {
      const bundleProductIds = current.bundleProductIds.filter(id => !unavailable.has(id));
      return { ...current, bundleProductIds, mainProductId: unavailable.has(current.mainProductId) ? (bundleProductIds[0] || '') : current.mainProductId };
    });
    setError('');
    setNotice('Selección actualizada. Guarda los cambios para aplicar el pack.');
  };

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return products
      .filter(product => product.published && (!query || `${product.name} ${product.sku}`.toLocaleLowerCase('es').includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [products, search]);

  const publishedProducts = useMemo(() => products.filter(product => product.published), [products]);

  const originalTotal = selectedProducts.reduce((sum, product) => sum + product.price, 0);
  const discount = Math.min(90, Math.max(0, Number(config.discountPercent) || 0));
  const packTotal = config.pricingMode === 'fixed' ? Number(config.fixedPrice || 0) : Math.round(originalTotal * (1 - discount / 100));
  const displayedDiscount = originalTotal > 0 ? Math.round((1 - packTotal / originalTotal) * 1000) / 10 : 0;

  const toggleProduct = (product: ProductOption) => {
    setNotice('');
    setConfig(current => {
      const hasProduct = current.bundleProductIds.includes(product.id);
      if (hasProduct) {
        const bundleProductIds = current.bundleProductIds.filter(id => id !== product.id);
        return {
          ...current,
          bundleProductIds,
          mainProductId: current.mainProductId === product.id ? (bundleProductIds[0] || '') : current.mainProductId,
        };
      }
      if (!product.published) return current;
      if (current.bundleProductIds.length >= MAX_COMBO_PRODUCTS) {
        setNotice(`Este pack admite hasta ${MAX_COMBO_PRODUCTS} productos.`);
        return current;
      }
      return {
        ...current,
        bundleProductIds: [...current.bundleProductIds, product.id],
        mainProductId: current.mainProductId || product.id,
      };
    });
  };

  const save = async () => {
    setError('');
    setNotice('');
    if (config.isActive && config.bundleProductIds.length < 2) {
      setError('Para activar el pack selecciona al menos dos productos publicados.');
      return;
    }
    if (config.isActive && (selectedProducts.length !== config.bundleProductIds.length || selectedProducts.some(product => !product.published))) {
      setError('El pack activo solo puede incluir productos existentes y publicados en la web.');
      return;
    }
    if (config.bundleProductIds.length > MAX_COMBO_PRODUCTS) {
      setError(`El pack admite hasta ${MAX_COMBO_PRODUCTS} productos.`);
      return;
    }
    if (config.isActive && (!Number.isFinite(packTotal) || packTotal <= 0 || packTotal >= originalTotal)) {
      setError('El precio del pack debe ser mayor que cero y menor que la suma de sus productos.');
      return;
    }
    setSaving(true);
    try {
      await authReady;
      const currentUser = auth.currentUser;
      if (!currentUser || !isAdminEmail(currentUser.email)) throw new Error('Tu cuenta no tiene permiso para editar packs.');
      const token = await currentUser.getIdToken();
      const nextConfig = {
        ...config,
        title: config.title.trim(),
        subtitle: (config.subtitle || '').trim(),
        badge: (config.badge || '').trim(),
        discountPercent: config.pricingMode === 'fixed' ? displayedDiscount : discount,
        bundleProductIds: [...new Set(config.bundleProductIds)],
      };
      const nextConfigs = configs.length ? [nextConfig, ...configs.slice(1)] : [nextConfig];
      const response = await fetch('/api/admin/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ configs: nextConfigs }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) throw new Error(result?.error || 'No se pudo guardar el pack.');
      setConfig(nextConfig);
      setConfigs(nextConfigs);
      window.dispatchEvent(new Event('clear-client-cache'));
      setNotice('Pack guardado. El catálogo /productos ya tiene la configuración actualizada.');
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el pack.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-2" size={18} />Cargando packs…</div>;
  }

  if (!authorized) {
    return <div className="max-w-xl mx-auto mt-16 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"><AlertCircle className="mb-3" /><h1 className="text-lg font-bold">Acceso restringido</h1><p className="mt-1 text-sm">Solo el administrador principal puede editar los packs de la tienda.</p></div>;
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1400px] overflow-x-clip px-4 py-6 box-border sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/products" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Productos</Link>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><Package size={21} /></div>
            <div><h1 className="text-2xl font-bold tracking-tight text-slate-950">Packs</h1><p className="text-sm text-slate-500">Combina productos publicados para el catálogo principal /productos.</p></div>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Link href="/productos" target="_blank" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"><ExternalLink size={15} /> Ver catálogo</Link>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50 sm:w-auto"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Actualizar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto"><Save size={15} />{saving ? 'Guardando…' : 'Guardar pack'}</button>
        </div>
      </div>

      {(error || notice) && <div role="status" className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error ? <AlertCircle size={17} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" />}{error || notice}</div>}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 space-y-5">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="min-w-0 flex-1"><h2 className="font-bold text-slate-900">Configuración del pack destacado</h2><p className="mt-1 text-sm text-slate-500">Este pack se muestra en el catálogo principal /productos.</p></div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={config.isActive} onChange={event => setConfig(current => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-emerald-600" />
                {config.isActive ? 'Activo' : 'Pausado'}
              </label>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">Nombre del pack
                <input maxLength={100} value={config.title} onChange={event => setConfig(current => ({ ...current, title: event.target.value }))} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 font-medium outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Etiqueta
                <input maxLength={60} value={config.badge || ''} onChange={event => setConfig(current => ({ ...current, badge: event.target.value }))} placeholder="PACK DESTACADO" className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 font-medium outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" />
              </label>
              <label className="block text-sm font-semibold text-slate-700 md:col-span-2">Descripción
                <textarea maxLength={280} rows={2} value={config.subtitle || ''} onChange={event => setConfig(current => ({ ...current, subtitle: event.target.value }))} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-medium outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" />
              </label>
              <div className="block text-sm font-semibold text-slate-700">Precio del pack
                <select value={config.pricingMode || 'percent'} onChange={event => setConfig(current => ({ ...current, pricingMode: event.target.value as 'percent' | 'fixed' }))} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3">
                  <option value="percent">Descuento por porcentaje</option><option value="fixed">Precio final fijo</option>
                </select>
                {config.pricingMode === 'fixed' ? <input type="number" min={1} step={1} value={config.fixedPrice ?? ''} onChange={event => setConfig(current => ({ ...current, fixedPrice: Number(event.target.value) }))} placeholder="Precio final del pack" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3" /> : <input type="number" min={0} max={90} value={config.discountPercent ?? 0} onChange={event => setConfig(current => ({ ...current, discountPercent: Math.min(90, Math.max(0, Number(event.target.value) || 0)) }))} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3" />}
                <span className="mt-1 block text-xs font-normal text-slate-500">{config.pricingMode === 'fixed' ? `Descuento calculado: ${displayedDiscount}%` : 'Porcentaje de descuento sobre el total.'}</span>
              </div>
              <label className="block text-sm font-semibold text-slate-700">Producto destacado (opcional)
                <select value={config.mainProductId} onChange={event => setConfig(current => ({ ...current, mainProductId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-medium outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100">
                  <option value="">Elegir producto…</option>
              {publishedProducts.map(product => <option value={product.id} key={product.id}>{product.name}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div><h2 className="font-bold text-slate-900">Productos del pack <span className="ml-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{config.bundleProductIds.length}/{MAX_COMBO_PRODUCTS}</span></h2><p className="mt-1 text-sm text-slate-500">Solo productos del POS publicados en el paso 3 de la web. Máximo {MAX_COMBO_PRODUCTS}.</p></div>
              <div className="relative w-full sm:w-72"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar productos publicados" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-500" /></div>
            </div>
            {products.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No se cargaron productos. Actualiza para intentar nuevamente.</div>
            ) : (
              <div className="max-h-[610px] divide-y divide-slate-100 overflow-y-auto">
                {visibleProducts.map(product => {
                  const selected = config.bundleProductIds.includes(product.id);
                  const limitReached = !selected && config.bundleProductIds.length >= MAX_COMBO_PRODUCTS;
                  return <button type="button" key={product.id} onClick={() => toggleProduct(product)} disabled={limitReached} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'} ${limitReached ? 'cursor-not-allowed opacity-50' : ''}`}>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff size={18} className="text-slate-300" />}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">{product.name}</div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>{product.sku || 'Sin SKU'}</span><span>Stock: {product.stock.toLocaleString('es-CL')}</span></div></div>
                    <div className="shrink-0 text-right"><div className="text-sm font-bold text-slate-800">{formatPrice(product.price)}</div><div className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent'}`}>{selected ? <Check size={13} /> : <Plus size={13} />}</div></div>
                  </button>;
                })}
                {visibleProducts.length === 0 && <div className="p-8 text-center text-sm text-slate-500">{publishedProducts.length === 0 ? 'No hay productos publicados en la web que se puedan añadir.' : 'No hay productos publicados que coincidan con esa búsqueda.'}</div>}
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0 xl:sticky xl:top-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4"><div className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShoppingBag size={17} /> Vista previa del pack</div><p className="mt-1 text-xs text-slate-500">Así se calcula el total con la selección actual.</p></div>
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-amber-800">{config.badge || 'PACK DESTACADO'}</span><h2 className="mt-2 text-lg font-bold text-slate-950">{config.title || 'Nombre del pack'}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{config.subtitle || 'Descripción del pack'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${config.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{config.isActive ? 'Activo' : 'Pausado'}</span></div>
              {selectedProducts.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">{selectedProducts.map(product => <div key={product.id} className="flex items-center gap-3 py-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <ImageOff size={16} className="text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{product.name}</p><p className="text-xs text-slate-500">{formatPrice(product.price)}</p></div><button type="button" onClick={() => toggleProduct(product)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Quitar ${product.name}`}><X size={16} /></button></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Selecciona productos para armar la vista previa.</div>}
              {unavailableIds.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><p>El pack tiene {unavailableIds.length} {unavailableIds.length === 1 ? 'producto que no se encuentra o ya no está publicado' : 'productos que no se encuentran o ya no están publicados'}. Quítalos y selecciona productos publicados antes de activar el pack.</p><button type="button" onClick={removeUnavailableProducts} className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold text-amber-900 hover:bg-amber-100">Quitar productos no disponibles</button></div>}
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between text-slate-500"><span>Precio original</span><span>{formatPrice(originalTotal)}</span></div><div className="flex justify-between text-slate-500"><span>Descuento del pack</span><span>{displayedDiscount}%</span></div><div className="flex justify-between text-base font-extrabold text-slate-950"><span>Total del pack</span><span>{formatPrice(packTotal)}</span></div></div>
              {config.bundleProductIds.length < 2 && <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"><Sparkles size={15} className="mt-0.5 shrink-0" />El pack necesita por lo menos dos productos publicados para poder activarse.</div>}
            </div>
            <div className="border-t border-slate-100 p-4"><button type="button" onClick={() => void save()} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"><Save size={16} />{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">El cambio se refleja en /productos después de guardar.</p>
        </aside>
      </div>
    </main>
  );
}
