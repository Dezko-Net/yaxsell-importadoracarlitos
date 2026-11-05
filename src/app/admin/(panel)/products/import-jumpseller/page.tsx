'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ID, Query } from '@/lib/db';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { CATEGORIES_COLLECTION_ID, PRODUCTS_COLLECTION_ID, SUBCATEGORIES_COLLECTION_ID, getFirebaseConfig, getServices } from '@/lib/db';
import { Category } from '@/types/admin';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { purgeServerProductsCache } from '@/lib/firebaseErpService';

type CsvRow = Record<string, string>;

type PreviewProduct = {
  NAME: string;
  DESCRIPTION: string;
  PRICE: number;
  STOCK: number;
  COST: number;
  IMAGEURL: string;
  IMAGEURL2: string;
  IMAGEURL3: string;
  CATEGORYID: string;
  TAGS: string;
  FEATURES: string;
  ISFEATURED: boolean;
  jumpseller_id: string;
  sourceCategory: string;
  sku: string;
  barcode: string;
  status: string;
  rowNumber: number;
  errors: string[];
};

const REQUIRED_HEADERS = ['Permalink', 'Name', 'Description', 'Categories', 'Images', 'Featured', 'Status', 'SKU', 'Stock', 'Price'];

function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = clean.split('\n')[0]?.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!quoted && ch === '\n') {
      row.push(cell);
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

function parseCsv(text: string): CsvRow[] {
  const table = parseDelimited(text);
  if (table.length < 2) return [];
  const headers = table[0].map(h => h.trim());
  return table.slice(1).map(values => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });
    return row;
  });
}

function toNumber(value: string): number {
  const normalized = String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function splitImages(value: string): string[] {
  return String(value || '')
    .split(/[,|;]/)
    .map(v => v.trim())
    .filter(v => /^https?:\/\//i.test(v))
    .slice(0, 5);
}

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function categoryLeaf(value: string): string {
  const pieces = String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  const last = pieces[pieces.length - 1] || '';
  const nested = last.split('>').map(v => v.trim()).filter(Boolean);
  return nested[nested.length - 1] || last || '';
}

function mapRow(row: CsvRow, index: number, categories: Category[]): PreviewProduct {
  const images = splitImages(row.Images || '');
  const sourceCategory = row.Categories || '';
  const leaf = categoryLeaf(sourceCategory);
  const matchedCategory = categories.find(c => normalizeText(c.name) === normalizeText(leaf))
    || categories.find(c => normalizeText(leaf).includes(normalizeText(c.name)) || normalizeText(c.name).includes(normalizeText(leaf)));
  const name = row.Name || '';
  const price = Math.round(toNumber(row.Price || '0'));
  const stock = Math.max(0, Math.round(toNumber(row.Stock || '0')));
  const errors: string[] = [];

  if (!name) errors.push('Nombre vacío');
  if (!price) errors.push('Precio vacío o inválido');
  // Imagen opcional — no se marca como error

  return {
    NAME: name,
    DESCRIPTION: row.Description || row['Meta Description'] || '',
    PRICE: price,
    STOCK: stock,
    COST: Math.round(toNumber(row['Cost per item'] || '0')),
    IMAGEURL: images[0] || '',
    IMAGEURL2: images[1] || '',
    IMAGEURL3: images[2] || '',
    CATEGORYID: matchedCategory?.$id || '',
    TAGS: [row.Brand, leaf, row.SKU].filter(Boolean).join(', '),
    FEATURES: [row.Brand ? `Marca: ${row.Brand}` : '', row.Barcode ? `Código de barras: ${row.Barcode}` : '', row.SKU ? `SKU: ${row.SKU}` : ''].filter(Boolean).join('\n'),
    ISFEATURED: String(row.Featured || '').toUpperCase() === 'YES',
    jumpseller_id: row.Permalink || row.SKU || row.Barcode || '',
    sourceCategory,
    sku: row.SKU || '',
    barcode: row.Barcode || '',
    status: row.Status || '',
    rowNumber: index + 2,
    errors,
  };
}

export default function ImportJumpsellerPage() {
  const { inventoryMode } = useStoreSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; failed: number; messages: string[] } | null>(null);

  const products = useMemo(() => rows.map((row, index) => mapRow(row, index, categories)), [rows, categories]);
  const validProducts = products.filter(p => p.errors.length === 0);

  const loadCategories = async () => {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const res = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(500)]);
    setCategories(res.documents as unknown as Category[]);
  };

  const handleFile = async (file: File) => {
    setError('');
    setResult(null);
    setIsLoading(true);
    setFileName(file.name);
    try {
      await loadCategories();
      const text = await file.text();
      const parsed = parseCsv(text);
      const headers = Object.keys(parsed[0] || {});
      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setRows([]);
        setError(`La plantilla no coincide. Faltan columnas: ${missing.join(', ')}`);
        return;
      }
      setRows(parsed);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'No se pudo leer el archivo');
    } finally {
      setIsLoading(false);
    }
  };

  const importProducts = async () => {
    if (validProducts.length === 0) return;
    if (!window.confirm(`¿Importar ${validProducts.length} producto(s) desde Jumpseller?`)) return;
    setIsImporting(true);
    setResult(null);
    const messages: string[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const createdCats = new Map<string, string>();
      const createdSubs = new Map<string, string>();

      for (const product of validProducts) {
        try {
          let categoryId = product.CATEGORYID;
          let subcategoryId = '';

          if (!categoryId && product.sourceCategory) {
            const parts = product.sourceCategory.split(',').map(v => v.trim()).filter(Boolean);
            if (parts.length > 0) {
              const mainCat = parts[0];
              const subParts = (parts[1] || '').split('>').map(v => v.trim()).filter(Boolean);
              const catName = subParts[0] || mainCat;
              const subName = subParts[1] || '';

              const catKey = normalizeText(catName);
              if (createdCats.has(catKey)) {
                categoryId = createdCats.get(catKey)!;
              } else {
                const existingCat = categories.find(c => normalizeText(c.name) === catKey);
                if (existingCat) {
                  categoryId = existingCat.$id;
                  createdCats.set(catKey, categoryId);
                } else {
                  const newCat = await databases.createDocument(databaseId, CATEGORIES_COLLECTION_ID, ID.unique(), {
                    name: catName,
                  });
                  categoryId = newCat.$id;
                  createdCats.set(catKey, categoryId);
                  messages.push(`Categoría creada: ${catName}`);
                }
              }

              if (subName && categoryId) {
                const subKey = `${catKey}:${normalizeText(subName)}`;
                if (createdSubs.has(subKey)) {
                  subcategoryId = createdSubs.get(subKey)!;
                } else {
                  const existingSub = await databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION_ID, [
                    Query.equal('categoryId', categoryId),
                    Query.limit(100),
                  ]);
                  const foundSub = existingSub.documents.find((s: any) => normalizeText(s.name) === normalizeText(subName));
                  if (foundSub) {
                    subcategoryId = foundSub.$id;
                    createdSubs.set(subKey, subcategoryId);
                  } else {
                    const newSub = await databases.createDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, ID.unique(), {
                      name: subName,
                      categoryId,
                    });
                    subcategoryId = newSub.$id;
                    createdSubs.set(subKey, subcategoryId);
                    messages.push(`Subcategoría creada: ${catName} > ${subName}`);
                  }
                }
              }
            }
          }

          const stockFields = inventoryMode === 'web_independent'
            ? { WEB_STOCK: product.STOCK, web_stock: product.STOCK }
            : { STOCK: product.STOCK, stock: product.STOCK };
          await databases.createDocument(databaseId, PRODUCTS_COLLECTION_ID, ID.unique(), {
            NAME: product.NAME,
            DESCRIPTION: product.DESCRIPTION,
            PRICE: product.PRICE,
            ...stockFields,
            COST: product.COST,
            IMAGEURL: product.IMAGEURL,
            IMAGEURL2: product.IMAGEURL2,
            IMAGEURL3: product.IMAGEURL3,
            CATEGORYID: categoryId || '',
            SUBCATEGORYID: subcategoryId || '',
            TAGS: product.TAGS,
            FEATURES: product.FEATURES,
          });
          created += 1;
        } catch (e: any) {
          failed += 1;
          messages.push(`Fila ${product.rowNumber}: ${e?.message || 'error desconocido'}`);
        }
      }

      setResult({ created, skipped, failed, messages });
      if (created > 0) purgeServerProductsCache();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-2">
            <ArrowLeft className="w-4 h-4" /> Productos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Importar desde Jumpseller</h1>
          <p className="text-sm text-gray-500">Sube una plantilla CSV exactamente como la exportación de Jumpseller.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-2xl p-8 cursor-pointer hover:bg-indigo-50 transition">
          <FileSpreadsheet className="w-10 h-10 text-indigo-500" />
          <div className="text-center">
            <p className="font-semibold text-gray-900">Subir plantilla Jumpseller</p>
            <p className="text-xs text-gray-500 mt-1">Acepta .csv tabulado o separado por comas con las mismas columnas del archivo original.</p>
          </div>
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold">
            <Upload className="w-4 h-4" /> Elegir archivo
          </span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
        </label>
        {fileName && <p className="text-xs text-gray-500 mt-3">Archivo: <span className="font-medium text-gray-700">{fileName}</span></p>}
      </div>

      {isLoading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo plantilla...</div>}
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {products.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-xs text-gray-500">Filas leídas</p><p className="text-2xl font-bold text-gray-900">{products.length}</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-xs text-gray-500">Válidos</p><p className="text-2xl font-bold text-emerald-600">{validProducts.length}</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-xs text-gray-500">Con errores</p><p className="text-2xl font-bold text-red-600">{products.length - validProducts.length}</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-xs text-gray-500">Categorías detectadas</p><p className="text-2xl font-bold text-indigo-600">{products.filter(p => p.CATEGORYID).length}</p></div>
          </div>

          <div className="flex justify-end">
            <button onClick={importProducts} disabled={isImporting || validProducts.length === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isImporting ? 'Importando...' : `Importar ${validProducts.length} producto(s)`}
            </button>
          </div>

          {result && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="w-4 h-4" /> Importación terminada</div>
              <p className="mt-1">Creados: {result.created} · Omitidos por duplicado: {result.skipped} · Fallidos: {result.failed}</p>
              {result.messages.length > 0 && <pre className="mt-3 max-h-40 overflow-auto text-xs whitespace-pre-wrap">{result.messages.join('\n')}</pre>}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Precio</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Stock</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Imagen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.slice(0, 300).map(product => (
                    <tr key={product.rowNumber} className={product.errors.length ? 'bg-red-50/40' : ''}>
                      <td className="px-4 py-3">
                        {product.errors.length ? <XCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </td>
                      <td className="px-4 py-3 min-w-[260px]">
                        <p className="font-medium text-gray-900 line-clamp-1">{product.NAME || '—'}</p>
                        <p className="text-xs text-gray-400">Fila {product.rowNumber} · SKU {product.sku || '—'} · {product.barcode || 'sin barcode'}</p>
                        {product.errors.length > 0 && <p className="text-xs text-red-600 mt-1">{product.errors.join(', ')}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 min-w-[180px]">
                        <p>{categories.find(c => c.$id === product.CATEGORYID)?.name || 'Sin coincidencia'}</p>
                        <p className="text-xs text-gray-400 line-clamp-1">{product.sourceCategory}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">${product.PRICE.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-semibold">{product.STOCK}</span></td>
                      <td className="px-4 py-3">
                        {product.IMAGEURL ? <img src={product.IMAGEURL} alt={product.NAME} className="w-10 h-10 object-cover rounded-lg bg-gray-100" /> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {products.length > 300 && <div className="px-4 py-3 bg-gray-50 text-xs text-gray-500">Mostrando 300 de {products.length} filas para mantener fluida la vista previa.</div>}
          </div>
        </>
      )}
    </div>
  );
}
