'use client';

import { useState, useCallback, useEffect } from 'react';
import { Query } from '@/lib/db';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import * as XLSX from 'xlsx';
import { getServices, getFirebaseConfig, INVENTORY_PRODUCTS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { invalidateProductCache } from '@/lib/cache';
import { isAdminEmail } from '@/lib/admin-access';
import { Product } from '@/types/admin';
import {
  Upload, ArrowLeft, CheckCircle2, XCircle,
  RefreshCw, FileSpreadsheet, CalendarClock,
} from 'lucide-react';

interface DateRow {
  sku: string;
  date: string;
  productId: string | null;
  productCollection: string | null;
  productName: string | null;
  currentDate: string | null;
  status: 'pending' | 'found' | 'not_found' | 'already_has_date' | 'updated' | 'error';
  error?: string;
}

function getSkuFromProduct(p: Product): string {
  const directSku = (p as any).sku;
  if (directSku && String(directSku).trim()) return String(directSku).trim();
  const features = typeof p.FEATURES === 'string' ? p.FEATURES : (p.FEATURES ? JSON.stringify(p.FEATURES) : '');
  const featMatch = features.match(/SKU:\s*(.+)/i);
  if (featMatch) return featMatch[1].trim().split('\n')[0];
  const tagParts = Array.isArray(p.TAGS)
    ? p.TAGS
    : (typeof p.TAGS === 'string' ? (p.TAGS as string).split(',').map(t => t.trim()) : []);
  const skuTag = tagParts.find(t => /^[A-Z0-9]{4,}$/i.test(t));
  return (p as any).jumpseller_id || skuTag || '';
}

export default function InventarioFechaPage() {
  const router = useRouter();
  const { user, isLoggedIn, isLoading: authLoading, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryIds, setInventoryIds] = useState<Set<string>>(new Set());
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [rows, setRows] = useState<DateRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveResults, setSaveResults] = useState<{ updated: number; errors: number } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { router.replace('/admin/login'); return; }
    if (!isAdminEmail(user?.email)) { logout().finally(() => router.replace('/admin/login')); }
  }, [authLoading, isLoggedIn, user?.email, router, logout]);

  const loadProducts = useCallback(async () => {
    // No-op to avoid downloading the entire database on mount.
    // Products are loaded dynamically when the Excel is uploaded.
    setLoadingProducts(false);
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsProcessing(true);
    setSaveResults(null);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      const parsed: DateRow[] = rawRows.map(row => {
        const sku = String(row['sku'] || row['SKU'] || row['Sku'] || row['Codigo'] || row['Codigo'] || row['codigo'] || row['Código'] || row['Code'] || row['code'] || row['Item'] || row['item'] || row['Artículo'] || row['articulo'] || '').trim();
        const date = String(row['fecha'] || row['Fecha'] || row['FECHA'] || row['date'] || row['DATE'] || row['Date'] || row['fecha_ingreso'] || row['Fecha Ingreso'] || row['Fecha de Ingreso'] || '').trim();
        return { sku, date, productId: null, productCollection: null, productName: null, currentDate: null, status: 'pending' as const };
      }).filter(r => r.sku && r.date);

      // Fetch only the needed products to avoid downloading the entire database on mount!
      const uniqueSkus = Array.from(new Set(parsed.map(r => r.sku.trim().toLowerCase())));
      
      setLoadingProducts(true);
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      
      const fetchProductsBySkus = async (skus: string[], collectionId: string) => {
        if (skus.length === 0) return [];
        const results: any[] = [];
        const chunkSize = 100;
        for (let i = 0; i < skus.length; i += chunkSize) {
          const chunk = skus.slice(i, i + chunkSize);
          try {
            const r = await databases.listDocuments(databaseId, collectionId, [
              Query.equal('sku', chunk),
              Query.limit(100)
            ]);
            results.push(...r.documents);
          } catch (e) {
            console.warn(`Query by sku failed in ${collectionId}:`, e);
          }
          if (collectionId === PRODUCTS_COLLECTION_ID) {
            try {
              const r = await databases.listDocuments(databaseId, collectionId, [
                Query.equal('barcode', chunk),
                Query.limit(100)
              ]);
              results.push(...r.documents);
            } catch (e2) {}
            try {
              const r = await databases.listDocuments(databaseId, collectionId, [
                Query.equal('jumpseller_id', chunk),
                Query.limit(100)
              ]);
              results.push(...r.documents);
            } catch (e3) {}
          }
        }
        const seen = new Set();
        return results.filter(d => {
          if (seen.has(d.$id)) return false;
          seen.add(d.$id);
          return true;
        });
      };

      const [allDocs, pubDocs] = await Promise.all([
        fetchProductsBySkus(uniqueSkus, INVENTORY_PRODUCTS_COLLECTION_ID),
        fetchProductsBySkus(uniqueSkus, PRODUCTS_COLLECTION_ID)
      ]);

      const localProducts = [...allDocs, ...pubDocs.filter((d: any) => !allDocs.some((a: any) => a.$id === d.$id))];
      const localInventoryIds = new Set(allDocs.map((d: any) => d.$id));

      setProducts(localProducts as unknown as Product[]);
      setInventoryIds(localInventoryIds);
      setLoadingProducts(false);

      // Debug: log first 5 raw Excel columns and first 5 product SKUs
      if (rawRows.length > 0) {
        console.log('[fecha] Excel columns:', Object.keys(rawRows[0]));
        console.log('[fecha] First 3 raw rows:', rawRows.slice(0, 3));
        console.log('[fecha] Parsed SKUs sample:', parsed.slice(0, 5).map(r => r.sku));
        console.log('[fecha] Product SKUs sample:', localProducts.slice(0, 5).map(p => `${p.NAME} => sku=${(p as any).sku} barcode=${p.barcode}`));
      }

      // Build SKU index for fast lookup (track which collection each product belongs to)
      const skuIndex = new Map<string, { product: Product; collection: string }>();
      localProducts.forEach(p => {
        const col = localInventoryIds.has(p.$id) ? INVENTORY_PRODUCTS_COLLECTION_ID : PRODUCTS_COLLECTION_ID;
        const pSku = getSkuFromProduct(p);
        if (pSku) skuIndex.set(pSku.toLowerCase(), { product: p, collection: col });
        if (p.barcode) skuIndex.set(p.barcode.toLowerCase(), { product: p, collection: col });
        if ((p as any).jumpseller_id) skuIndex.set(String((p as any).jumpseller_id).toLowerCase(), { product: p, collection: col });
        skuIndex.set(p.$id, { product: p, collection: col });
        const tagsArray = Array.isArray(p.TAGS)
          ? p.TAGS
          : (typeof p.TAGS === 'string' ? p.TAGS.split(',').map((t: string) => t.trim()) : []);
        tagsArray.map((t: string) => t.toLowerCase()).filter(Boolean).forEach((t: string) => {
          if (!skuIndex.has(t)) skuIndex.set(t, { product: p, collection: col });
        });
      });

      // Match against inventory — try multiple strategies
      const matched = parsed.map(row => {
        const skuLower = row.sku.toLowerCase().replace(/\s+/g, '');
        // 1) Exact match from index
        let found = skuIndex.get(skuLower);
        let product = found?.product || null;
        let collection = found?.collection || null;
        // 2) Try with original casing (no space removal)
        if (!product) { found = skuIndex.get(row.sku.toLowerCase()); product = found?.product || null; collection = found?.collection || null; }
        // 3) Name contains
        if (!product) { const f = localProducts.find(p => p.NAME && p.NAME.toLowerCase().replace(/\s+/g, '').includes(skuLower)); if (f) { product = f; collection = localInventoryIds.has(f.$id) ? INVENTORY_PRODUCTS_COLLECTION_ID : PRODUCTS_COLLECTION_ID; } }
        // 4) SKU is contained in product SKU (reverse)
        if (!product) { const f = localProducts.find(p => {
          const pSku = getSkuFromProduct(p);
          return pSku && skuLower.includes(pSku.toLowerCase().replace(/\s+/g, '')) && pSku.length >= 4;
        }); if (f) { product = f; collection = localInventoryIds.has(f.$id) ? INVENTORY_PRODUCTS_COLLECTION_ID : PRODUCTS_COLLECTION_ID; } }
        if (product && !collection) collection = localInventoryIds.has(product.$id) ? INVENTORY_PRODUCTS_COLLECTION_ID : PRODUCTS_COLLECTION_ID;

        if (product) {
          const hasDate = !!((product as any).DATE_ADDED && String((product as any).DATE_ADDED).trim());
          return {
            ...row,
            productId: product.$id,
            productCollection: collection,
            productName: product.NAME,
            currentDate: (product as any).DATE_ADDED || null,
            status: hasDate ? 'already_has_date' : 'found',
          } as DateRow;
        }
        return { ...row, productCollection: null, status: 'not_found' } as DateRow;
      });

      setRows(matched);
    } catch (err: any) {
      alert('Error al leer archivo: ' + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const foundRows = rows.filter(r => r.status === 'found');
  const notFoundRows = rows.filter(r => r.status === 'not_found');
  const alreadyHasDateRows = rows.filter(r => r.status === 'already_has_date');
  const updatedRows = rows.filter(r => r.status === 'updated');
  const errorRows = rows.filter(r => r.status === 'error');

  const handleSave = async () => {
    // Only update rows that have NO date yet — skip already_has_date
    const toUpdate = rows.filter(r => r.status === 'found');
    if (toUpdate.length === 0) return;
    setIsSaving(true);
    setSaveProgress(0);
    let updated = 0, errors = 0;

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    for (let i = 0; i < toUpdate.length; i++) {
      const row = toUpdate[i];
      try {
        const colId = row.productCollection || INVENTORY_PRODUCTS_COLLECTION_ID;
        await databases.updateDocument(databaseId, colId, row.productId!, { DATE_ADDED: row.date });
        setRows(prev => prev.map(r => r.productId === row.productId ? { ...r, status: 'updated' as const } : r));
        updated++;
      } catch (e: any) {
        const msg = e?.message || '';
        if (msg.includes('Unknown attribute') || msg.includes('DATE_ADDED')) {
          console.error(`⚠️ Attribute "DATE_ADDED" does not exist in collection "${row.productCollection || INVENTORY_PRODUCTS_COLLECTION_ID}". Create it in Appwrite Console first.`);
          setRows(prev => prev.map(r => r.productId === row.productId ? { ...r, status: 'error' as const, error: 'Atributo DATE_ADDED no existe en la colección. Créalo en Appwrite Console.' } : r));
        } else {
          console.error('Error updating DATE_ADDED for', row.sku, msg);
          setRows(prev => prev.map(r => r.productId === row.productId ? { ...r, status: 'error' as const } : r));
        }
        errors++;
      }
      setSaveProgress(Math.round(((i + 1) / toUpdate.length) * 100));
      await new Promise(r => setTimeout(r, 80));
    }

    setSaveResults({ updated, errors });
    setIsSaving(false);
    invalidateProductCache();
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/inventario" className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">Subir Fecha por SKU</h1>
            <p className="text-xs text-gray-500">Sube un Excel con columna "sku" y "fecha" (formato: 2026-05-13 16:34:45)</p>
          </div>
          <button onClick={loadProducts} disabled={loadingProducts}
            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loadingProducts ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Upload section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Cargar Excel de Fechas</h2>
              <p className="text-xs text-gray-500">Columna 1: <code className="bg-gray-100 px-1 rounded">sku</code> · Columna 2: <code className="bg-gray-100 px-1 rounded">fecha</code> (ej: 2026-05-13 16:34:45)</p>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors">
            <label className="cursor-pointer inline-flex flex-col items-center gap-2">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" disabled={isProcessing || loadingProducts} />
              {isProcessing ? (
                <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
              )}
              <span className="text-sm font-semibold text-gray-700">
                {isProcessing ? 'Procesando...' : 'Seleccionar archivo Excel'}
              </span>
              <span className="text-xs text-gray-400">.xlsx, .xls, .csv</span>
            </label>
          </div>

          {loadingProducts && (
            <p className="mt-3 text-xs text-indigo-600 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Cargando inventario...
            </p>
          )}
        </div>

        {/* Results */}
        {rows.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-emerald-600">{foundRows.length}</div>
                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Sin fecha</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-blue-600">{alreadyHasDateRows.length}</div>
                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Ya tienen fecha</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-red-600">{notFoundRows.length}</div>
                <div className="text-[10px] font-bold text-red-500 uppercase tracking-wide">No encontrados</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-green-600">{updatedRows.length}</div>
                <div className="text-[10px] font-bold text-green-500 uppercase tracking-wide">Actualizados</div>
              </div>
            </div>

            {/* Save button */}
            {(foundRows.length > 0 || alreadyHasDateRows.length > 0) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                <button onClick={handleSave} disabled={isSaving}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Guardando... {saveProgress}%
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Actualizar {foundRows.length + alreadyHasDateRows.length} fechas
                    </>
                  )}
                </button>
                {isSaving && (
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${saveProgress}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Save results */}
            {saveResults && (
              <div className={`rounded-xl p-4 flex items-center gap-3 ${saveResults.errors > 0 ? 'bg-indigo-50 border border-indigo-200' : 'bg-green-50 border border-green-200'}`}>
                <CheckCircle2 className={`w-5 h-5 ${saveResults.errors > 0 ? 'text-indigo-500' : 'text-green-500'}`} />
                <div className="text-sm">
                  <span className="font-bold text-green-700">{saveResults.updated} actualizadas</span>
                  {saveResults.errors > 0 && <span className="text-indigo-700"> · {saveResults.errors} errores</span>}
                </div>
              </div>
            )}

            {/* Found - to update */}
            {foundRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-emerald-700">Sin fecha — Se actualizarán ({foundRows.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {foundRows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center flex-shrink-0">
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName}</p>
                        <p className="text-xs text-gray-500">SKU: {r.sku}</p>
                      </div>
                      <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{r.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Already has date */}
            {alreadyHasDateRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-blue-700">Ya tienen fecha — Se sobreescribirán ({alreadyHasDateRows.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {alreadyHasDateRows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName}</p>
                        <p className="text-xs text-gray-500">SKU: {r.sku}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-mono text-gray-400 line-through">{r.currentDate}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-mono text-indigo-600">{r.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not found */}
            {notFoundRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-bold text-red-700">No encontrados en inventario ({notFoundRows.length})</h3>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {notFoundRows.map((r, i) => (
                    <span key={i} className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                      {r.sku}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Updated */}
            {updatedRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-green-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <h3 className="text-sm font-bold text-green-700">Actualizados ({updatedRows.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {updatedRows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-50 text-green-500 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName}</p>
                        <p className="text-xs text-gray-500">SKU: {r.sku}</p>
                      </div>
                      <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-1 rounded-lg">{r.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {errorRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-bold text-red-700">Errores ({errorRows.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {errorRows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
                        <XCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName || r.sku}</p>
                        <p className="text-xs text-red-500">{r.error || 'Error desconocido'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {rows.length === 0 && !isProcessing && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CalendarClock className="w-10 h-10" />
            </div>
            <p className="text-base font-semibold text-gray-400">Sube un Excel con SKUs y fechas</p>
            <p className="text-sm text-gray-300 mt-1">Los productos serán actualizados con la fecha de ingreso</p>
          </div>
        )}
      </main>
    </div>
  );
}
