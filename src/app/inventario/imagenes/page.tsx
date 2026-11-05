'use client';

import { useState, useCallback, useEffect } from 'react';
import { Query } from '@/lib/db';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import * as XLSX from 'xlsx';
import { getServices, getFirebaseConfig, INVENTORY_PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { invalidateProductCache } from '@/lib/cache';
import { isAdminEmail } from '@/lib/admin-access';
import { Product } from '@/types/admin';
import {
  Upload, ArrowLeft, Package, CheckCircle2, XCircle, ImageIcon,
  RefreshCw, FileSpreadsheet, AlertTriangle,
} from 'lucide-react';

interface ImageRow {
  sku: string;
  imageUrl: string;
  productId: string | null;
  productName: string | null;
  currentImage: string | null;
  status: 'pending' | 'found' | 'not_found' | 'already_has_image' | 'updated' | 'error';
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

export default function InventarioImagenesPage() {
  const router = useRouter();
  const { user, isLoggedIn, isLoading: authLoading, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveResults, setSaveResults] = useState<{ updated: number; skipped: number; errors: number } | null>(null);

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

      const parsed: ImageRow[] = rawRows.map(row => {
        const sku = String(row['sku'] || row['SKU'] || row['Sku'] || row['Codigo'] || row['Codigo'] || row['codigo'] || row['Código'] || row['Code'] || row['code'] || row['Item'] || row['item'] || row['Artículo'] || row['articulo'] || '').trim();
        const imageUrl = String(row['imagen'] || row['Imagen' ] || row['IMAGE'] || row['image'] || row['Image'] || row['IMAGEURL'] || row['imageUrl'] || row['url'] || row['Imagen URL'] || row['Image URL'] || '').trim();
        return { sku, imageUrl, productId: null, productName: null, currentImage: null, status: 'pending' as const };
      }).filter(r => r.sku && r.imageUrl);

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
          try {
            const r = await databases.listDocuments(databaseId, collectionId, [
              Query.equal('barcode', chunk),
              Query.limit(100)
            ]);
            results.push(...r.documents);
          } catch (e2) {}
        }
        const seen = new Set();
        return results.filter(d => {
          if (seen.has(d.$id)) return false;
          seen.add(d.$id);
          return true;
        });
      };

      const allDocs = await fetchProductsBySkus(uniqueSkus, INVENTORY_PRODUCTS_COLLECTION_ID);
      setProducts(allDocs as unknown as Product[]);
      setLoadingProducts(false);

      // Debug: log Excel columns
      if (rawRows.length > 0) {
        console.log('[imagenes] Excel columns:', Object.keys(rawRows[0]));
        console.log('[imagenes] First 3 raw rows:', rawRows.slice(0, 3));
        console.log('[imagenes] Parsed SKUs sample:', parsed.slice(0, 5).map(r => r.sku));
      }

      // Build SKU index for fast lookup
      const skuIndex = new Map<string, Product>();
      allDocs.forEach(p => {
        const pSku = getSkuFromProduct(p);
        if (pSku) skuIndex.set(pSku.toLowerCase(), p);
        if (p.barcode) skuIndex.set(p.barcode.toLowerCase(), p);
        if ((p as any).jumpseller_id) skuIndex.set(String((p as any).jumpseller_id).toLowerCase(), p);
        skuIndex.set(p.$id, p);
        const tagsArray = Array.isArray(p.TAGS)
          ? p.TAGS
          : (typeof p.TAGS === 'string' ? p.TAGS.split(',').map((t: string) => t.trim()) : []);
        tagsArray.map((t: string) => t.toLowerCase()).filter(Boolean).forEach((t: string) => {
          if (!skuIndex.has(t)) skuIndex.set(t, p);
        });
      });

      // Match against inventory — try multiple strategies
      const matched = parsed.map(row => {
        const skuLower = row.sku.toLowerCase().replace(/\s+/g, '');
        // 1) Exact match from index
        let product = skuIndex.get(skuLower);
        // 2) Try with original casing (no space removal)
        if (!product) product = skuIndex.get(row.sku.toLowerCase());
        // 3) Name contains
        if (!product) product = allDocs.find(p => p.NAME && p.NAME.toLowerCase().replace(/\s+/g, '').includes(skuLower));
        // 4) SKU is contained in product SKU (reverse)
        if (!product) product = allDocs.find(p => {
          const pSku = getSkuFromProduct(p);
          return pSku && skuLower.includes(pSku.toLowerCase().replace(/\s+/g, '')) && pSku.length >= 4;
        });

        if (product) {
          const hasImage = !!(product.IMAGEURL && product.IMAGEURL.trim());
          return {
            ...row,
            productId: product.$id,
            productName: product.NAME,
            currentImage: product.IMAGEURL || null,
            status: hasImage ? 'already_has_image' : 'found',
          } as ImageRow;
        }
        return { ...row, status: 'not_found' } as ImageRow;
      });

      // Verify if images are broken for "already_has_image"
      const checkImageValid = (url: string): Promise<boolean> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
      };

      const finalMatched = await Promise.all(
        matched.map(async (row) => {
          if (row.status === 'already_has_image' && row.currentImage) {
            const isValid = await checkImageValid(row.currentImage);
            if (!isValid) {
              return { ...row, status: 'found' as const };
            }
          }
          return row;
        })
      );

      setRows(finalMatched);
    } catch (err: any) {
      alert('Error al leer archivo: ' + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const foundRows = rows.filter(r => r.status === 'found');
  const notFoundRows = rows.filter(r => r.status === 'not_found');
  const alreadyHasImageRows = rows.filter(r => r.status === 'already_has_image');
  const updatedRows = rows.filter(r => r.status === 'updated');
  const errorRows = rows.filter(r => r.status === 'error');

  const handleSave = async () => {
    const toUpdate = rows.filter(r => r.status === 'found');
    if (toUpdate.length === 0) return;
    setIsSaving(true);
    setSaveProgress(0);
    let updated = 0, skipped = 0, errors = 0;

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    for (let i = 0; i < toUpdate.length; i++) {
      const row = toUpdate[i];
      try {
        await databases.updateDocument(databaseId, INVENTORY_PRODUCTS_COLLECTION_ID, row.productId!, { IMAGEURL: row.imageUrl });
        setRows(prev => prev.map(r => r.productId === row.productId ? { ...r, status: 'updated' } : r));
        updated++;
      } catch (e: any) {
        console.error('Error updating IMAGEURL for', row.sku, e?.message || e);
        setRows(prev => prev.map(r => r.productId === row.productId ? { ...r, status: 'error' } : r));
        errors++;
      }
      setSaveProgress(Math.round(((i + 1) / toUpdate.length) * 100));
      await new Promise(r => setTimeout(r, 80));
    }

    setSaveResults({ updated, skipped, errors: errors });
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
            <h1 className="text-lg font-bold text-gray-900 truncate">Subir Imágenes por SKU</h1>
            <p className="text-xs text-gray-500">Sube un Excel con columna "sku" y "imagen" (URLs)</p>
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
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Cargar Excel de Imágenes</h2>
              <p className="text-xs text-gray-500">Columna 1: <code className="bg-gray-100 px-1 rounded">sku</code> · Columna 2: <code className="bg-gray-100 px-1 rounded">imagen</code> (URLs de imagen)</p>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-amber-300 transition-colors">
            <label className="cursor-pointer inline-flex flex-col items-center gap-2">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" disabled={isProcessing || loadingProducts} />
              {isProcessing ? (
                <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
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
            <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
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
                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Sin imagen (Actualizar)</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-blue-600">{alreadyHasImageRows.length}</div>
                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Ya tienen imagen</div>
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
            {foundRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                <button onClick={handleSave} disabled={isSaving}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Guardando... {saveProgress}%
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Actualizar {foundRows.length} imágenes
                    </>
                  )}
                </button>
                {isSaving && (
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${saveProgress}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Save results */}
            {saveResults && (
              <div className={`rounded-xl p-4 flex items-center gap-3 ${saveResults.errors > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                <CheckCircle2 className={`w-5 h-5 ${saveResults.errors > 0 ? 'text-amber-500' : 'text-green-500'}`} />
                <div className="text-sm">
                  <span className="font-bold text-green-700">{saveResults.updated} actualizadas</span>
                  {saveResults.errors > 0 && <span className="text-amber-700"> · {saveResults.errors} errores</span>}
                </div>
              </div>
            )}

            {/* Found - to update */}
            {foundRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-emerald-700">Sin imagen — Se actualizarán ({foundRows.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {foundRows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                        <img src={r.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName}</p>
                        <p className="text-xs text-gray-500">SKU: {r.sku}</p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Nuevo</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Already has image */}
            {alreadyHasImageRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-blue-700">Ya tienen imagen ({alreadyHasImageRows.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {alreadyHasImageRows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <div className="flex gap-1">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                          {r.currentImage && <img src={r.currentImage} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-dashed border-blue-200">
                          <img src={r.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName}</p>
                        <p className="text-xs text-gray-500">SKU: {r.sku}</p>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">Existente</span>
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
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-green-200">
                        <img src={r.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.productName}</p>
                        <p className="text-xs text-gray-500">SKU: {r.sku}</p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
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
            <div className="w-20 h-20 bg-amber-50 text-amber-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-10 h-10" />
            </div>
            <p className="text-base font-semibold text-gray-400">Sube un Excel con SKUs e imágenes</p>
            <p className="text-sm text-gray-300 mt-1">Los productos sin imagen serán actualizados</p>
          </div>
        )}
      </main>
    </div>
  );
}
