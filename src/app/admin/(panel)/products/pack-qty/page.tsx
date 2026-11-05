'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Query } from '@/lib/db';
import * as XLSX from 'xlsx';
import { ArrowLeft, Upload, Search, Package, Save, CheckCircle2, XCircle, Loader2, FileSpreadsheet, Filter, SkipForward } from 'lucide-react';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { Product } from '@/types/admin';

function getSku(p: Product): string {
  const featMatch = (typeof p.FEATURES === 'string') ? p.FEATURES.match(/SKU:\s*(.+)/i) : null;
  if (featMatch) return featMatch[1].trim();
  const tagParts = Array.isArray(p.TAGS)
    ? p.TAGS
    : (typeof p.TAGS === 'string' ? p.TAGS.split(',').map(t => t.trim()) : []);
  if (tagParts.length >= 1) return tagParts[0];
  return '';
}

type FilterMode = 'all' | 'without' | 'with';

export default function PackQtyPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('without');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; notFound: number; errors: number; skipped: number } | null>(null);

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
      setProducts(all);
    } catch (e) {
      console.error('Error loading products:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = products.filter(p => {
    // Filter
    if (filter === 'without' && p.PACKQTY && p.PACKQTY > 0) return false;
    if (filter === 'with' && (!p.PACKQTY || p.PACKQTY <= 0)) return false;
    // Search
    if (!search) return true;
    const q = search.toLowerCase();
    const sku = getSku(p).toLowerCase();
    const name = (p.NAME || '').toLowerCase();
    return sku.includes(q) || name.includes(q);
  });

  const withoutCount = products.filter(p => !p.PACKQTY || p.PACKQTY <= 0).length;
  const withCount = products.filter(p => p.PACKQTY && p.PACKQTY > 0).length;

  const savePackQty = async (productId: string) => {
    const val = edits[productId];
    if (!val || parseInt(val, 10) <= 0) return;
    setSavingId(productId);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, productId, {
        PACKQTY: parseInt(val, 10),
      });
      setProducts(prev => prev.map(p => p.$id === productId ? { ...p, PACKQTY: parseInt(val, 10) } : p));
      setEdits(prev => { const next = { ...prev }; delete next[productId]; return next; });
    } catch (e) {
      console.error('Error saving PACKQTY:', e);
      alert('Error al guardar');
    } finally {
      setSavingId(null);
    }
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      console.log('Excel rows:', rows.length);
      console.log('First row:', rows[0]);

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      let updated = 0;
      let notFound = 0;
      let errors = 0;
      let skipped = 0;

      for (const row of rows) {
        const sku = String(row['SKU'] || row['sku'] || '').trim();
        const qty = parseInt(String(row['Cantidad por paquete'] || row['Cantidad'] || row['cantidad'] || row['QTY'] || row['qty'] || row['PackQty'] || row['PACKQTY'] || '0'), 10);
        if (!sku || qty <= 0) continue;

        // Find product by SKU
        const product = products.find(p => {
          const pSku = getSku(p);
          return pSku && pSku.toLowerCase() === sku.toLowerCase();
        });

        if (!product) { notFound++; continue; }

        // Skip if already has PACKQTY assigned (any value)
        if (product.PACKQTY && product.PACKQTY > 0) { skipped++; continue; }

        try {
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, product.$id, { PACKQTY: qty });
          setProducts(prev => prev.map(p => p.$id === product.$id ? { ...p, PACKQTY: qty } : p));
          updated++;
          // Delay to avoid rate limit
          await delay(150);
        } catch (err) {
          console.error('Error updating:', sku, err);
          errors++;
        }
      }

      console.log('Final result:', { updated, notFound, errors, skipped });
      setImportResult({ updated, notFound, errors, skipped });
    } catch (e) {
      console.error('Error importing:', e);
      alert('Error al importar Excel: ' + (e as Error).message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/products" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cantidad por Paquete</h1>
          <p className="text-sm text-gray-500">Asigna cuántas unidades vienen por paquete/embalaje a cada producto</p>
        </div>
      </div>

      {/* Filters + Search + Import */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Filter tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 shrink-0">
            <button onClick={() => setFilter('without')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${filter === 'without' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Sin cantidad ({withoutCount})
            </button>
            <button onClick={() => setFilter('with')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${filter === 'with' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Con cantidad ({withCount})
            </button>
            <button onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Todos ({products.length})
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Excel import */}
          <label className="shrink-0 cursor-pointer">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} className="hidden" disabled={importing} />
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar Excel
            </div>
          </label>
        </div>

        {/* Import result */}
        {importResult && (
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm">
            {importResult.updated > 0 && (
              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" />{importResult.updated} actualizados</span>
            )}
            {importResult.notFound > 0 && (
              <span className="flex items-center gap-1 text-amber-600"><XCircle className="w-4 h-4" />{importResult.notFound} no encontrados</span>
            )}
            {importResult.skipped > 0 && (
              <span className="flex items-center gap-1 text-gray-500"><SkipForward className="w-4 h-4" />{importResult.skipped} sin cambios</span>
            )}
            {importResult.errors > 0 && (
              <span className="flex items-center gap-1 text-red-600"><XCircle className="w-4 h-4" />{importResult.errors} errores</span>
            )}
            <button onClick={() => setImportResult(null)} className="ml-auto text-gray-400 hover:text-gray-600">&times;</button>
          </div>
        )}

        {/* Excel template hint */}
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Excel: columna &quot;SKU&quot; + columna &quot;Cantidad por paquete&quot;
        </div>
      </div>

      {/* Product list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Cargando productos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            {search ? 'No hay productos que coincidan con la búsqueda.' : filter === 'without' ? '¡Todos los productos tienen cantidad asignada!' : 'No hay productos.'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2.5 w-14">Img</th>
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5 w-32">SKU</th>
                  <th className="px-4 py-2.5 w-24">Precio</th>
                  <th className="px-4 py-2.5 w-20">Stock</th>
                  <th className="px-4 py-2.5 w-20">Actual</th>
                  <th className="px-4 py-2.5 w-48">Asignar cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.slice(0, 300).map(p => {
                  const sku = getSku(p);
                  const editing = edits[p.$id] ?? '';
                  const saving = savingId === p.$id;
                  return (
                    <tr key={p.$id} className="hover:bg-gray-50">
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
                      </td>
                      <td className="px-4 py-2 text-xs font-mono text-gray-600">{sku || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">${(p.PRICE || 0).toLocaleString('es-CL')}</td>
                      <td className="px-4 py-2 text-gray-700">{p.STOCK ?? 0}</td>
                      <td className="px-4 py-2">
                        {p.PACKQTY && p.PACKQTY > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">{p.PACKQTY} uds</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={editing}
                            onChange={ev => setEdits(prev => ({ ...prev, [p.$id]: ev.target.value }))}
                            onKeyDown={ev => { if (ev.key === 'Enter') savePackQty(p.$id); }}
                            placeholder={p.PACKQTY ? String(p.PACKQTY) : '0'}
                            className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            onClick={() => savePackQty(p.$id)}
                            disabled={saving || !editing || parseInt(editing, 10) <= 0}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-medium rounded transition">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Guardar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.slice(0, 300).map(p => {
                const sku = getSku(p);
                const editing = edits[p.$id] ?? '';
                const saving = savingId === p.$id;
                return (
                  <div key={p.$id} className="p-4 flex gap-3">
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
                      <div className="text-xs text-gray-500 mt-0.5">
                        {sku && <span className="font-mono mr-2">SKU: {sku}</span>}
                        <span>${(p.PRICE || 0).toLocaleString('es-CL')}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Stock: {p.STOCK ?? 0}
                        {p.PACKQTY && p.PACKQTY > 0 ? (
                          <span className="ml-2 text-emerald-600 font-medium">Paquete: {p.PACKQTY} uds</span>
                        ) : (
                          <span className="ml-2 text-gray-400">Sin paquete</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          min={1}
                          value={editing}
                          onChange={ev => setEdits(prev => ({ ...prev, [p.$id]: ev.target.value }))}
                          onKeyDown={ev => { if (ev.key === 'Enter') savePackQty(p.$id); }}
                          placeholder="Cant."
                          className="w-24 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => savePackQty(p.$id)}
                          disabled={saving || !editing || parseInt(editing, 10) <= 0}
                          className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition">
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Guardar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length > 300 && (
              <div className="p-3 text-center text-xs text-gray-500 border-t border-gray-100">
                Mostrando primeros 300 de {filtered.length}. Refina la búsqueda.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

