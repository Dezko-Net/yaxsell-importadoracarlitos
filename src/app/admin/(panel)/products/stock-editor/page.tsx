'use client';

import { useState, useCallback, useEffect } from 'react';
import { Query } from '@/lib/db';
import Link from 'next/link';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { purgeServerProductsCache } from '@/lib/firebaseErpService';
import { Product } from '@/types/admin';
import {
  ArrowLeft, Search, Package, Save, Loader2, CheckCircle2, XCircle,
  Filter, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';

function getSku(p: Product): string {
  const feat = p.FEATURES as any;
  const featStr = typeof feat === 'string' ? feat : (Array.isArray(feat) ? feat.join(' ') : (feat ? String(feat) : ''));
  const featMatch = featStr ? featStr.match(/SKU:\s*(.+)/i) : null;
  if (featMatch) return featMatch[1].trim();
  const tagParts = Array.isArray(p.TAGS)
    ? p.TAGS
    : (typeof p.TAGS === 'string' ? p.TAGS.split(',').map(t => t.trim()) : []);
  if (tagParts.length >= 1) return tagParts[0];
  return '';
}

type StockFilter = 'all' | 'instock' | 'nostock' | 'low';

const PAGE_SIZE = 50;

export default function StockEditorPage() {
  const { inventoryMode } = useStoreSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('instock');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const all: Product[] = [];
      let cursor: string | undefined;
      while (true) {
        const queries: string[] = [Query.limit(20)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, queries);
        all.push(...(res.documents as unknown as Product[]));
        if (res.documents.length < 200) break;
        cursor = res.documents[res.documents.length - 1].$id;
      }
      setProducts(all.map(product => {
        const raw = product as Product & { WEB_STOCK?: number; web_stock?: number; ERP_STOCK?: number };
        const erpStock = Number(raw.ERP_STOCK ?? raw.STOCK ?? (raw as any).stock ?? 0) || 0;
        const webStock = Number(raw.WEB_STOCK ?? raw.web_stock ?? erpStock) || 0;
        return { ...raw, ERP_STOCK: erpStock, STOCK: inventoryMode === 'web_independent' ? webStock : erpStock } as Product;
      }));
    } catch (e) {
      console.error('Error loading products:', e);
    } finally {
      setLoading(false);
    }
  }, [inventoryMode]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = products.filter(p => {
    const stock = p.STOCK || 0;
    if (filter === 'instock' && stock <= 0) return false;
    if (filter === 'nostock' && stock > 0) return false;
    if (filter === 'low' && stock > 5) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const sku = getSku(p).toLowerCase();
    const name = (p.NAME || '').toLowerCase();
    return sku.includes(q) || name.includes(q);
  });

  const inStockCount = products.filter(p => (p.STOCK || 0) > 0).length;
  const noStockCount = products.filter(p => (p.STOCK || 0) <= 0).length;
  const lowStockCount = products.filter(p => { const s = p.STOCK || 0; return s > 0 && s < 3; }).length;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const saveStock = async (productId: string) => {
    const raw = edits[productId];
    const value = parseInt(raw, 10);
    if (isNaN(value) || value < 0) return;
    setSavingIds(prev => new Set(prev).add(productId));
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const stockUpdate = inventoryMode === 'web_independent'
        ? { WEB_STOCK: value, web_stock: value }
        : { STOCK: value, stock: value };
      await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, productId, {
        ...stockUpdate,
        ISACTIVE: value > 0,
      });
      setProducts(prev => prev.map(p => p.$id === productId ? {
        ...p,
        STOCK: value,
        ...(inventoryMode === 'web_independent' ? { WEB_STOCK: value, web_stock: value } : { ERP_STOCK: value }),
        ISACTIVE: value > 0,
      } : p));
      purgeServerProductsCache();
      setEdits(prev => { const n = { ...prev }; delete n[productId]; return n; });
      setSavedCount(prev => prev + 1);
    } catch (e) {
      console.error('Error saving stock:', e);
      alert('Error al guardar');
    } finally {
      setSavingIds(prev => { const n = new Set(prev); n.delete(productId); return n; });
    }
  };

  const saveAll = async () => {
    const pending = Object.entries(edits).filter(([, v]) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n >= 0;
    });
    if (pending.length === 0) return;
    if (!confirm(`¿Guardar stock de ${pending.length} producto(s)?`)) return;

    setSavingIds(new Set(pending.map(([id]) => id)));
    let ok = 0;
    for (const [productId, raw] of pending) {
      const value = parseInt(raw, 10);
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const stockUpdate = inventoryMode === 'web_independent'
          ? { WEB_STOCK: value, web_stock: value }
          : { STOCK: value, stock: value };
        await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, productId, {
          ...stockUpdate,
          ISACTIVE: value > 0,
        });
        setProducts(prev => prev.map(p => p.$id === productId ? {
          ...p,
          STOCK: value,
          ...(inventoryMode === 'web_independent' ? { WEB_STOCK: value, web_stock: value } : { ERP_STOCK: value }),
          ISACTIVE: value > 0,
        } : p));
        ok++;
        await new Promise(r => setTimeout(r, 150));
      } catch (e) {
        console.error('Error saving:', productId, e);
      }
    }
    setEdits({});
    setSavingIds(new Set());
    setSavedCount(ok);
    if (ok > 0) purgeServerProductsCache();
    alert(`${ok} producto(s) actualizados`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/products" className="text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Editor de Stock</h1>
          <p className="text-xs text-gray-500">Edita el stock de todos los productos inline</p>
        </div>
        <button onClick={loadProducts} disabled={loading}
          className="ml-auto p-2 text-gray-400 hover:text-gray-600 transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: 'instock', label: 'Con stock', count: inStockCount },
            { key: 'all', label: 'Todos', count: products.length },
            { key: 'nostock', label: 'Sin stock', count: noStockCount },
            { key: 'low', label: 'Bajo (≤5)', count: lowStockCount },
          ] as const).map(f => (
            <button key={f.key} onClick={() => { setFilter(f.key); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                filter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar por nombre o SKU..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Save all bar */}
      {Object.keys(edits).length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg">
          <span className="text-sm text-indigo-700 font-medium">
            {Object.keys(edits).length} cambio(s) pendiente(s)
          </span>
          <button onClick={saveAll}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
            <Save className="w-4 h-4" />
            Guardar todo
          </button>
          <button onClick={() => setEdits({})}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
            Descartar
          </button>
        </div>
      )}

      {/* Saved feedback */}
      {savedCount > 0 && Object.keys(edits).length === 0 && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          {savedCount} producto(s) guardado(s)
          <button onClick={() => setSavedCount(0)} className="ml-auto text-emerald-500 hover:text-emerald-700">&times;</button>
        </div>
      )}

      {/* Product list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Cargando productos...
          </div>
        ) : paged.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No hay productos que coincidan.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-12"></th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Producto</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-32">SKU</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-24">Precio</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-24">Stock actual</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-40">Nuevo stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map(p => {
                    const sku = getSku(p);
                    const stock = p.STOCK || 0;
                    const editVal = edits[p.$id] ?? '';
                    const saving = savingIds.has(p.$id);
                    const hasEdit = p.$id in edits;
                    return (
                      <tr key={p.$id} className={`hover:bg-gray-50 ${hasEdit ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-2">
                          {p.IMAGEURL ? (
                            <img src={p.IMAGEURL} alt="" className="w-9 h-9 object-cover rounded" />
                          ) : (
                            <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center">
                              <Package className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 line-clamp-1">{p.NAME || '—'}</div>
                          {p.PACKQTY && p.PACKQTY > 0 && (
                            <span className="inline-flex items-center gap-0.5 mt-0.5 text-[10px] text-indigo-600">
                              <Package className="w-2.5 h-2.5" />{p.PACKQTY} u/pkg
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-600">{sku || '—'}</td>
                        <td className="px-4 py-2 text-gray-700">${(p.PRICE || 0).toLocaleString('es-CL')}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            stock <= 0 ? 'bg-red-100 text-red-700' : stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {stock}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={editVal}
                              onChange={e => setEdits(prev => ({ ...prev, [p.$id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') saveStock(p.$id); }}
                              placeholder={String(stock)}
                              className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-500"
                            />
                            {hasEdit && (
                              <button onClick={() => saveStock(p.$id)} disabled={saving}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition disabled:opacity-50">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {paged.map(p => {
                const sku = getSku(p);
                const stock = p.STOCK || 0;
                const editVal = edits[p.$id] ?? '';
                const saving = savingIds.has(p.$id);
                const hasEdit = p.$id in edits;
                return (
                  <div key={p.$id} className={`p-3 flex gap-3 ${hasEdit ? 'bg-amber-50/50' : ''}`}>
                    <div className="shrink-0">
                      {p.IMAGEURL ? (
                        <img src={p.IMAGEURL} alt="" className="w-12 h-12 object-cover rounded-lg" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm line-clamp-1">{p.NAME || '—'}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sku && <span className="text-xs font-mono text-gray-500">{sku}</span>}
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          stock <= 0 ? 'bg-red-100 text-red-700' : stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          stock: {stock}
                        </span>
                        {p.PACKQTY && p.PACKQTY > 0 && (
                          <span className="text-[10px] text-indigo-600">{p.PACKQTY}u/pkg</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          min={0}
                          value={editVal}
                          onChange={e => setEdits(prev => ({ ...prev, [p.$id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') saveStock(p.$id); }}
                          placeholder={`Stock: ${stock}`}
                          className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                        />
                        {hasEdit && (
                          <button onClick={() => saveStock(p.$id)} disabled={saving}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-500">
                  {filtered.length} productos · Página {page + 1}/{totalPages}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

