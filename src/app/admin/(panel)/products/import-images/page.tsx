'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { invalidateProductCache } from '@/lib/cache';
import { AlertTriangle, CheckCircle2, ArrowLeft, Upload, Loader2, ImagePlus, Search, ClipboardPaste, X } from 'lucide-react';
import Link from 'next/link';

interface ImageRow {
  sku: string;
  imageUrl: string;
  imageUrl2: string;
  imageUrl3: string;
  imageUrl4: string;
  matched: boolean;
  productId: string | null;
  productName: string;
  status: 'pending' | 'updated' | 'error' | 'skipped';
}

export default function ImportImagesPage() {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [results, setResults] = useState<{ updated: number; skipped: number; errors: string[] } | null>(null);
  const [filterMode, setFilterMode] = useState<'pending' | 'matched' | 'all' | 'noimg'>('pending');
  const [noImageProducts, setNoImageProducts] = useState<ImageRow[]>([]);
  const [isLoadingNoImg, setIsLoadingNoImg] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsePastedText = (text: string): ImageRow[] => {
    const lines = text.split('\n').filter(l => l.trim());
    const parsed: ImageRow[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parts = trimmed.split('\t');
      if (parts.length === 1) parts = trimmed.split(',');
      if (parts.length === 1) {
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 0) {
          parts = [trimmed.substring(0, spaceIdx).trim(), trimmed.substring(spaceIdx + 1).trim()];
        }
      }

      const sku = parts[0]?.trim() || '';
      if (!sku || sku.toLowerCase() === 'sku') continue;

      const row: ImageRow = {
        sku,
        imageUrl: parts[1]?.trim() || '',
        imageUrl2: parts[2]?.trim() || '',
        imageUrl3: parts[3]?.trim() || '',
        imageUrl4: parts[4]?.trim() || '',
        matched: false,
        productId: null,
        productName: '',
        status: 'pending',
      };
      parsed.push(row);
    }

    return parsed;
  };

  const handlePaste = () => {
    const parsed = parsePastedText(pasteText);
    setRows(parsed);
    setResults(null);
    setShowPaste(false);
    setPasteText('');
  };

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    const parsed: ImageRow[] = [];
    for (const r of json) {
      const sku = String(r['SKU'] || r['sku'] || r['Sku'] || '').trim();
      if (!sku) continue;
      parsed.push({
        sku,
        imageUrl: String(r['IMAGEURL'] || r['imageUrl'] || r['Imagen 1'] || r['Imagen URL'] || r['URL'] || '').trim(),
        imageUrl2: String(r['IMAGEURL2'] || r['imageUrl2'] || r['Imagen 2'] || '').trim(),
        imageUrl3: String(r['IMAGEURL3'] || r['imageUrl3'] || r['Imagen 3'] || '').trim(),
        imageUrl4: String(r['IMAGEURL4'] || r['imageUrl4'] || r['Imagen 4'] || '').trim(),
        matched: false,
        productId: null,
        productName: '',
        status: 'pending',
      });
    }

    setRows(parsed);
    setResults(null);
  };

  const handleLoadNoImage = async () => {
    setIsLoadingNoImg(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const allProducts: any[] = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const queries: any[] = [Query.limit(2000)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, queries);
        allProducts.push(...res.documents);
        total = res.total;
        if (res.documents.length > 0) {
          cursor = res.documents[res.documents.length - 1].$id;
        } else {
          break;
        }
      } while (allProducts.length < total);

      const noImg = allProducts
        .filter(p => !p.IMAGEURL && !p.IMAGEURL2 && !p.IMAGEURL3 && !p.IMAGEURL4)
        .map(p => ({
          sku: String(p.sku || '').trim(),
          imageUrl: '',
          imageUrl2: '',
          imageUrl3: '',
          imageUrl4: '',
          matched: false,
          productId: p.$id,
          productName: p.NAME || '',
          status: 'pending' as const,
        }));

      setNoImageProducts(noImg);
      setFilterMode('noimg');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsLoadingNoImg(false);
    }
  };

  const handleMatch = async () => {
    if (rows.length === 0) return;
    setIsMatching(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const allProducts: any[] = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const queries: any[] = [Query.limit(2000)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, queries);
        allProducts.push(...res.documents);
        total = res.total;
        if (res.documents.length > 0) {
          cursor = res.documents[res.documents.length - 1].$id;
        } else {
          break;
        }
      } while (allProducts.length < total);

      const skuMap = new Map<string, any>();
      allProducts.forEach(p => {
        const sku = String(p.sku || '').trim();
        if (sku) skuMap.set(sku.toLowerCase(), p);
      });

      const matched = rows.map(r => {
        const product = skuMap.get(r.sku.toLowerCase());
        if (product) {
          const alreadyHasImage = !!(product.IMAGEURL || product.IMAGEURL2 || product.IMAGEURL3 || product.IMAGEURL4);
          return {
            ...r,
            matched: true,
            productId: product.$id,
            productName: product.NAME || '',
            status: alreadyHasImage ? 'skipped' as const : 'pending' as const,
          };
        }
        return r;
      });

      setRows(matched);
    } catch (e: any) {
      alert('Error al buscar productos: ' + e.message);
    } finally {
      setIsMatching(false);
    }
  };

  const handleImport = async () => {
    const toUpdate = rows.filter(r => r.matched && r.productId && r.status === 'pending' && (r.imageUrl || r.imageUrl2 || r.imageUrl3 || r.imageUrl4));
    if (toUpdate.length === 0) {
      alert('No hay productos para actualizar');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: toUpdate.length });
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    for (let i = 0; i < toUpdate.length; i++) {
      const r = toUpdate[i];
      const payload: Record<string, any> = {};
      if (r.imageUrl) payload.IMAGEURL = r.imageUrl;
      if (r.imageUrl2) payload.IMAGEURL2 = r.imageUrl2;
      if (r.imageUrl3) payload.IMAGEURL3 = r.imageUrl3;
      // IMAGEURL4 no existe en el schema — no enviarlo

      let success = false;
      let retries = 0;
      while (!success && retries < 5) {
        try {
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, r.productId!, payload);
          updated++;
          setRows(prev => prev.map(row => row.productId === r.productId ? { ...row, status: 'updated' } : row));
          success = true;
        } catch (e: any) {
          if (e?.message?.includes('Rate limit') && retries < 4) {
            retries++;
            const wait = 2000 * retries;
            setProgress({ current: i, total: toUpdate.length });
            await new Promise(res => setTimeout(res, wait));
          } else {
            errors.push(`${r.sku}: ${e.message}`);
            skipped++;
            setRows(prev => prev.map(row => row.productId === r.productId ? { ...row, status: 'error' } : row));
            break;
          }
        }
      }

      setProgress({ current: i + 1, total: toUpdate.length });
      await new Promise(res => setTimeout(res, 300));
    }

    setResults({ updated, skipped, errors });
    setProgress(null);
    invalidateProductCache();
    setIsProcessing(false);
  };

  const filteredRows = filterMode === 'noimg' ? noImageProducts : filterMode === 'all' ? rows : filterMode === 'matched' ? rows.filter(r => r.matched) : rows.filter(r => r.matched && r.status === 'pending');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/products" className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex items-center gap-2">
            <ImagePlus className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">Importar Imágenes por SKU</h1>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Pega texto</strong> en formato <code className="bg-blue-100 px-1 rounded">SKU URL</code> (tab o espacio).
            También múltiples columnas: <code className="bg-blue-100 px-1 rounded">SKU URL1 URL2 URL3 URL4</code>.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowPaste(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              <ClipboardPaste className="w-4 h-4" />
              Pegar datos
            </button>
            <span className="text-gray-300">o</span>
            <div
              className="flex-1 min-w-[200px] border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
              <p className="text-xs font-medium text-gray-600">Subir Excel/CSV</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          </div>

          {rows.length > 0 && (
            <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">{rows.length} filas</span>
                <span className="text-sm text-green-600 font-medium">{rows.filter(r => r.matched).length} match</span>
                <span className="text-sm text-blue-600 font-medium">{rows.filter(r => r.status === 'pending').length} pendientes</span>
                <span className="text-sm text-gray-400 font-medium">{rows.filter(r => r.status === 'skipped').length} ya tienen img</span>
                <span className="text-sm text-red-500 font-medium">{rows.filter(r => !r.matched).length} sin match</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFilterMode('pending')}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${filterMode === 'pending' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    Pendientes ({rows.filter(r => r.matched && r.status === 'pending').length})
                  </button>
                  <button
                    onClick={() => setFilterMode('matched')}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${filterMode === 'matched' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    Match ({rows.filter(r => r.matched).length})
                  </button>
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${filterMode === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    Todos ({rows.length})
                  </button>
                  <button
                    onClick={handleLoadNoImage}
                    disabled={isLoadingNoImg}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition ${filterMode === 'noimg' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 hover:bg-gray-50'} disabled:opacity-50`}
                  >
                    {isLoadingNoImg ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</> : <>Sin img ({noImageProducts.length || '...'})</>}
                  </button>
                </div>
                <button
                  onClick={handleMatch}
                  disabled={isMatching}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {isMatching ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</> : <><Search className="w-4 h-4" /> Buscar SKU</>}
                </button>
                <button
                  onClick={handleImport}
                  disabled={isProcessing || rows.filter(r => r.matched && (r.imageUrl || r.imageUrl2 || r.imageUrl3 || r.imageUrl4)).length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                >
                  {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Actualizando...</> : <><Upload className="w-4 h-4" /> Actualizar</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {progress && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Actualizando... {progress.current} / {progress.total}
              </span>
              <span className="text-sm font-bold text-indigo-600">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-green-500 transition-all duration-300 ease-out"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {showPaste && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPaste(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Pegar datos (SKU + URLs)</h2>
                <button onClick={() => setShowPaste(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-hidden flex flex-col">
                <p className="text-xs text-gray-500 mb-2">
                  Formato: <code className="bg-gray-100 px-1 rounded">SKU URL1 URL2 URL3 URL4</code> separado por tab, coma o espacio.
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  Ejemplo:<br />
                  <code className="bg-gray-100 px-1 rounded">JC30 https://yesbella.qianji.us./be/statics/resources/9628e0debc73bd1ed42dbeda3a810ba7.jpg</code>
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  className="flex-1 w-full border border-gray-200 rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="JC30	https://ejemplo.com/imagen1.jpg
JC31	https://ejemplo.com/imagen2.jpg	https://ejemplo.com/imagen2b.jpg
JC32	https://ejemplo.com/imagen3.jpg"
                  autoFocus
                />
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <button onClick={() => setShowPaste(false)} className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={handlePaste}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Cargar {pasteText.trim() ? `(${parsePastedText(pasteText).length})` : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {results && (
          <div className={`rounded-xl p-4 mb-6 ${results.errors.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-gray-900">
                {results.updated} actualizados, {results.skipped} con errores
              </span>
            </div>
            {results.errors.length > 0 && (
              <details className="mt-2">
                <summary className="text-sm text-amber-700 cursor-pointer">Ver errores ({results.errors.length})</summary>
                <ul className="mt-2 text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
                  {results.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {filteredRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">SKU</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Producto</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Img 1</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Img 2</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Img 3</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Img 4</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${r.matched ? 'bg-green-50/30' : 'bg-red-50/30'}`}>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.sku}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-[200px] truncate">{r.productName || '—'}</td>
                      <td className="px-4 py-2">
                        {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-8 h-8 object-cover rounded" /> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {r.imageUrl2 ? <img src={r.imageUrl2} alt="" className="w-8 h-8 object-cover rounded" /> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {r.imageUrl3 ? <img src={r.imageUrl3} alt="" className="w-8 h-8 object-cover rounded" /> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {r.imageUrl4 ? <img src={r.imageUrl4} alt="" className="w-8 h-8 object-cover rounded" /> : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.status === 'updated' && <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />}
                        {r.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-500 mx-auto" />}
                        {r.status === 'skipped' && <span className="text-xs text-gray-400 font-medium">Ya tiene img</span>}
                        {r.status === 'pending' && (
                          r.matched
                            ? <span className="text-xs text-green-600 font-medium">Match</span>
                            : <span className="text-xs text-red-400 font-medium">Sin match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
