'use client';

import { useState } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from '@/lib/db';
import { Sparkles, AlertTriangle, CheckCircle2, ArrowLeft, Upload } from 'lucide-react';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { purgeServerProductsCache } from '@/lib/firebaseErpService';
import Link from 'next/link';

interface BulkEditRow {
  sku: string;
  stock: number;
  name: string;
  price: number;
  category: string;
}

export default function BulkEditPage() {
  const { inventoryMode } = useStoreSettings();
  const [dataText, setDataText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ updated: number; notFound: string[]; errors: string[]; categoryErrors: string[] } | null>(null);
  const [preview, setPreview] = useState<BulkEditRow[]>([]);

  const parseData = (text: string): BulkEditRow[] => {
    const lines = text.split('\n').filter(l => l.trim());
    const rows: BulkEditRow[] = [];

    for (const line of lines) {
      // Try tab-separated first, then space-separated
      const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\t/);
      
      if (parts.length >= 5) {
        rows.push({
          sku: parts[0].trim(),
          stock: parseInt(parts[1].trim()) || 0,
          name: parts[2].trim(),
          price: parseFloat(parts[3].trim()) || 0,
          category: parts[4].trim(),
        });
      }
    }

    return rows;
  };

  const handlePreview = () => {
    const parsed = parseData(dataText);
    setPreview(parsed);
    setResults(null);
  };

  const handleEdit = async () => {
    if (!dataText.trim()) {
      alert('Pega los datos primero');
      return;
    }

    const rows = parseData(dataText);
    if (rows.length === 0) {
      alert('No se encontraron datos válidos. Formato: SKU\tStock\tNombre\tPrecio\tCategoría');
      return;
    }

    if (!confirm(`¿Actualizar ${rows.length} producto(s)?`)) {
      return;
    }

    setIsProcessing(true);
    setResults(null);

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Get all products and categories
      const [allProducts, allCategories] = await Promise.all([
        databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [Query.limit(1000)]),
        databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(100)]),
      ]);

      let updated = 0;
      const notFound: string[] = [];
      const errors: string[] = [];
      const categoryErrors: string[] = [];

      for (const row of rows) {
        try {
          // Find product by SKU
          const product = allProducts.documents.find((p: any) => {
            const features = p.FEATURES || '';
            const tags = p.TAGS || '';
            const jumpId = p.jumpseller_id || '';
            
            const featMatch = features.match(/SKU:\s*(.+)/i);
            if (featMatch && featMatch[1].trim() === row.sku) return true;
            
            const tagParts = tags.split(',').map((t: string) => t.trim());
            if (tagParts.includes(row.sku)) return true;
            
            if (jumpId === row.sku) return true;
            if (p.SKU === row.sku) return true;
            
            return false;
          });

          if (!product) {
            notFound.push(row.sku);
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          // Find category ID by name
          const category = allCategories.documents.find((c: any) => 
            c.name?.toLowerCase() === row.category.toLowerCase()
          );

          if (!category) {
            categoryErrors.push(`${row.sku}: Categoría "${row.category}" no encontrada`);
          }

          const updatePayload: any = {
            NAME: row.name || product.NAME,
            PRICE: row.price,
          };
          if (inventoryMode === 'web_independent') {
            updatePayload.WEB_STOCK = row.stock;
            updatePayload.web_stock = row.stock;
          } else {
            updatePayload.STOCK = row.stock;
            updatePayload.stock = row.stock;
          }

          if (category) {
            updatePayload.CATEGORYID = category.$id;
          }

          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, product.$id, updatePayload);
          updated++;
          
          // Add delay to avoid rate limit
          await new Promise(r => setTimeout(r, 200));
        } catch (e: any) {
          errors.push(`${row.sku}: ${e.message}`);
          await new Promise(r => setTimeout(r, 200));
        }
      }

      setResults({ updated, notFound, errors, categoryErrors });
      if (updated > 0) {
        purgeServerProductsCache();
        alert(`✅ ${updated} producto(s) actualizado(s)`);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <Link href="/admin/products" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} />
          Volver a Productos
        </Link>
      </div>

      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <Link href="/admin/products/bulk-edit" className="border-b-2 border-indigo-600 pb-3 px-1 text-sm font-semibold text-indigo-600">
          Editar Masivamente
        </Link>
        <Link href="/admin/products/bulk-add" className="border-b-2 border-transparent pb-3 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
          Agregar Masivamente
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Editar Masivamente</h1>
        <p className="text-gray-600 mb-6">
          Pega datos tab-separated (SKU, Stock, Nombre, Precio, Categoría) para actualizar productos en masa.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Datos (formato: SKU\tStock\tNombre\tPrecio\tCategoría)
          </label>
          <textarea
            value={dataText}
            onChange={(e) => setDataText(e.target.value)}
            placeholder="SD92700&#9;1&#9;Mascarilla reafirmante multiefecto antiedad SADOER 30 unidades&#9;18000&#9;Cuidado Facial&#10;SD88758&#9;4&#9;Crema contorno SADOER 20 g&#9;10000&#9;Cuidado Facial&#10;SD87522&#9;11&#9;Set de cremas de manos SADOER&#9;18000&#9;Cuidado Corporal&#10;SD86402&#9;4&#9;Set de cremas de manos hidratantes y regeneradoras florales SADOER...&#9;18000&#9;Cuidado Corporal"
            className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
            disabled={isProcessing}
          />
          <p className="text-xs text-gray-500 mt-1">
            Usa tabulador o múltiples espacios como separador
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!dataText.trim()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={20} />
            Previsualizar
          </button>

          <button
            onClick={handleEdit}
            disabled={isProcessing || !dataText.trim()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Actualizar Productos
              </>
            )}
          </button>
        </div>

        {preview.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Previsualización ({preview.length} productos)</h3>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">SKU</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Stock</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Nombre</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Precio</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-4 py-2 font-mono">{row.sku}</td>
                      <td className="px-4 py-2">{row.stock}</td>
                      <td className="px-4 py-2">{row.name.substring(0, 50)}{row.name.length > 50 ? '...' : ''}</td>
                      <td className="px-4 py-2">${row.price.toLocaleString()}</td>
                      <td className="px-4 py-2">{row.category}</td>
                    </tr>
                  ))}
                  {preview.length > 10 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-center text-gray-500">
                        ... y {preview.length - 10} más
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {results && (
          <div className="mt-6 space-y-4">
            {results.updated > 0 && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-900">Actualizados exitosamente</p>
                  <p className="text-sm text-green-700">{results.updated} producto(s)</p>
                </div>
              </div>
            )}

            {results.notFound.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-900">SKUs no encontrados</p>
                  <p className="text-sm text-yellow-700">{results.notFound.length} SKU(s) no existen</p>
                  <details className="mt-2">
                    <summary className="text-xs text-yellow-800 cursor-pointer hover:underline">Ver lista</summary>
                    <pre className="text-xs mt-2 bg-yellow-100 p-2 rounded overflow-auto max-h-32">{results.notFound.join('\n')}</pre>
                  </details>
                </div>
              </div>
            )}

            {results.categoryErrors.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-orange-900">Categorías no encontradas</p>
                  <p className="text-sm text-orange-700">{results.categoryErrors.length} producto(s) sin categoría válida (se actualizarán sin cambiar categoría)</p>
                  <details className="mt-2">
                    <summary className="text-xs text-orange-800 cursor-pointer hover:underline">Ver lista</summary>
                    <pre className="text-xs mt-2 bg-orange-100 p-2 rounded overflow-auto max-h-32">{results.categoryErrors.join('\n')}</pre>
                  </details>
                </div>
              </div>
            )}

            {results.errors.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-900">Errores</p>
                  <p className="text-sm text-red-700">{results.errors.length} SKU(s) fallaron al actualizar</p>
                  <details className="mt-2">
                    <summary className="text-xs text-red-800 cursor-pointer hover:underline">Ver errores</summary>
                    <pre className="text-xs mt-2 bg-red-100 p-2 rounded overflow-auto max-h-32">{results.errors.join('\n')}</pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
