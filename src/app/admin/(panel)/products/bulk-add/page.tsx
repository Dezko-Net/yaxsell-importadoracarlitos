'use client';

import { useState } from 'react';
import { Query, ID } from '@/lib/db';
import { 
  getServices, 
  getFirebaseConfig, 
  PRODUCTS_COLLECTION_ID,
  INVENTORY_PRODUCTS_COLLECTION_ID, 
  CATEGORIES_COLLECTION_ID, 
  SUBCATEGORIES_COLLECTION_ID 
} from '@/lib/db';
import { Sparkles, AlertTriangle, CheckCircle2, ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { purgeServerProductsCache } from '@/lib/firebaseErpService';

interface BulkAddRow {
  sku: string;
  barcode: string;
  name: string;
  wholesalePrice: number;
  packagePrice: number;
  category: string;
  subcategory: string;
  imageUrl: string;
}

export default function BulkAddPage() {
  const { unlimitedStock, inventoryMode } = useStoreSettings();
  const [sendToLive, setSendToLive] = useState(true);
  const [dataText, setDataText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ 
    created: number; 
    updated: number; 
    duplicates: string[];
    errors: string[]; 
  } | null>(null);
  const [preview, setPreview] = useState<BulkAddRow[]>([]);

  const parseData = (text: string): BulkAddRow[] => {
    const lines = text.split('\n').filter(l => l.trim());
    const rows: BulkAddRow[] = [];

    for (const line of lines) {
      // Split by tab (tab-separated values from copy button)
      const parts = line.split('\t');
      
      if (parts.length >= 3) {
        rows.push({
          sku: parts[0]?.trim() || '',
          barcode: parts[1]?.trim() || '',
          name: parts[2]?.trim() || '',
          wholesalePrice: parts[3] ? parseFloat(parts[3].trim()) || 0 : 0,
          packagePrice: parts[4] ? parseFloat(parts[4].trim()) || 0 : 0,
          category: parts[5]?.trim() || 'Varios',
          subcategory: parts[6]?.trim() || 'Varios',
          imageUrl: parts[7]?.trim() || '',
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

  const handleAdd = async () => {
    if (!dataText.trim()) {
      alert('Pega los datos primero');
      return;
    }

    const rows = parseData(dataText);
    if (rows.length === 0) {
      alert('No se encontraron datos válidos. Copia un producto del Depurador e inténtalo de nuevo.');
      return;
    }

    if (!confirm(`¿Deseas agregar/actualizar ${rows.length} producto(s) en la colección de Inventario?`)) {
      return;
    }

    setIsProcessing(true);
    setResults(null);

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Load all existing categories and subcategories first to minimize API calls
      const [categoriesResp, subcategoriesResp] = await Promise.all([
        databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(100)]),
        databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION_ID, [Query.limit(100)]),
      ]);

      const categoriesCache = [...categoriesResp.documents];
      const subcategoriesCache = [...subcategoriesResp.documents];

      let created = 0;
      let updated = 0;
      const duplicates: string[] = [];
      const errors: string[] = [];

      for (const row of rows) {
        try {
          if (!row.name) {
            errors.push(`Fila con SKU ${row.sku || 'N/A'}: El nombre del producto es requerido.`);
            continue;
          }

          // 1. Get or Create Category
          let categoryId = '';
          const categoryName = row.category || 'Varios';
          let category = categoriesCache.find((c: any) => c.name?.toLowerCase() === categoryName.toLowerCase());
          
          if (!category) {
            console.log(`Creating category: ${categoryName}`);
            const newCat = await databases.createDocument(
              databaseId, 
              CATEGORIES_COLLECTION_ID, 
              ID.unique(), 
              { 
                name: categoryName, 
                iconUrl: '', 
                order: categoriesCache.length 
              }
            );
            categoriesCache.push(newCat);
            category = newCat;
          }
          categoryId = category.$id;

          // 2. Get or Create Subcategory
          let subcategoryId = '';
          const subcategoryName = row.subcategory || 'Varios';
          let subcategory = subcategoriesCache.find((s: any) => 
            s.name?.toLowerCase() === subcategoryName.toLowerCase() && s.categoryId === categoryId
          );

          if (!subcategory) {
            console.log(`Creating subcategory: ${subcategoryName}`);
            const newSub = await databases.createDocument(
              databaseId, 
              SUBCATEGORIES_COLLECTION_ID, 
              ID.unique(), 
              { 
                name: subcategoryName, 
                categoryId: categoryId,
                parentSubcategoryId: null
              }
            );
            subcategoriesCache.push(newSub);
            subcategory = newSub;
          }
          subcategoryId = subcategory.$id;

          // 3. Search if product SKU already exists in products collection
          let product: any = null;
          if (row.sku) {
            const cleanSku = row.sku.trim();
            try {
              const resp = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
                Query.equal('sku', cleanSku),
                Query.limit(1)
              ]);
              if (resp.documents.length > 0) {
                product = resp.documents[0];
              }
            } catch (err: any) {
              console.error('Error checking SKU:', err);
            }
          }

          const productPayload: any = {
            sku: row.sku || null,
            barcode: row.barcode || null,
            NAME: row.name,
            DESCRIPTION: row.name,
            WHOLESALEPRICE: row.packagePrice,
            PRICE: row.wholesalePrice, // wholesalePrice (1800) maps to main PRICE, packagePrice (1500) maps to WHOLESALEPRICE
            CATEGORYID: categoryId,
            SUBCATEGORYID: subcategoryId,
            IMAGEURL: row.imageUrl || null,
            ISACTIVE: true
          };

          if (product) {
            // Product already exists: do NOT create/add a new document.
            if (sendToLive) {
              // Update $createdAt so it goes to today's Live Shopping, and ensure it has stock >= 1
              const currentStock = inventoryMode === 'web_independent'
                ? Number(product.WEB_STOCK ?? product.web_stock ?? product.STOCK ?? product.stock ?? 0)
                : Number(product.STOCK ?? product.stock ?? 0);
              const newStock = currentStock > 0 ? currentStock : 1;
              const updatePayload: any = {
                $createdAt: new Date().toISOString(),
                ISACTIVE: true
              };
              if (inventoryMode === 'web_independent') {
                updatePayload.WEB_STOCK = newStock;
                updatePayload.web_stock = newStock;
              } else {
                updatePayload.STOCK = newStock;
                updatePayload.stock = newStock;
              }
              // If the found document doesn't have the sku field filled but we have it, fill it to clean the data
              if (!product.sku && row.sku) {
                updatePayload.sku = row.sku;
              }
              await databases.updateDocument(
                databaseId, 
                PRODUCTS_COLLECTION_ID, 
                product.$id, 
                updatePayload
              );
              duplicates.push(`[SKU: ${row.sku}] ${row.name} (Ya existía, se actualizó para Live con stock ${newStock})`);
            } else {
              // Just update details without sending to Live Shopping
              const updatePayload: any = {
                NAME: row.name,
                PRICE: row.wholesalePrice,
                WHOLESALEPRICE: row.packagePrice,
                CATEGORYID: categoryId,
                SUBCATEGORYID: subcategoryId,
                IMAGEURL: row.imageUrl || product.IMAGEURL || null,
                ISACTIVE: true
              };
              if (!product.sku && row.sku) {
                updatePayload.sku = row.sku;
              }
              await databases.updateDocument(
                databaseId, 
                PRODUCTS_COLLECTION_ID, 
                product.$id, 
                updatePayload
              );
              updated++;
            }
          } else {
            // Create new product
            const initialStock = unlimitedStock ? 99999 : 0;
            if (inventoryMode === 'web_independent') {
              productPayload.WEB_STOCK = initialStock;
              productPayload.web_stock = initialStock;
            } else {
              productPayload.STOCK = initialStock;
              productPayload.stock = initialStock;
            }
            if (sendToLive) {
              if (inventoryMode === 'web_independent') {
                productPayload.WEB_STOCK = 1;
                productPayload.web_stock = 1;
              } else {
                productPayload.STOCK = 1;
                productPayload.stock = 1;
              }
              productPayload.$createdAt = new Date().toISOString();
            }
            await databases.createDocument(
              databaseId, 
              PRODUCTS_COLLECTION_ID, 
              ID.unique(), 
              productPayload
            );
            created++;
          }

          // Small delay to prevent hitting Appwrite rate limits
          await new Promise(r => setTimeout(r, 200));
        } catch (e: any) {
          errors.push(`${row.sku || 'Sin SKU'}: ${e.message}`);
          await new Promise(r => setTimeout(r, 200));
        }
      }

      setResults({ created, updated, duplicates, errors });
      if (created > 0 || updated > 0) purgeServerProductsCache();
      if (sendToLive) {
        alert(`✅ Carga masiva completada: ${created} creado(s) nuevos, ${duplicates.length} existente(s) marcados para Live`);
      } else {
        alert(`✅ Carga masiva completada: ${created} creado(s) nuevos, ${updated} existente(s) actualizado(s) en inventario`);
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
        <Link href="/admin/products/bulk-edit" className="border-b-2 border-transparent pb-3 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
          Editar Masivamente
        </Link>
        <Link href="/admin/products/bulk-add" className="border-b-2 border-indigo-600 pb-3 px-1 text-sm font-semibold text-indigo-600">
          Agregar Masivamente
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Agregar Masivamente</h1>
        <p className="text-gray-600 mb-6">
          Pega los datos de los productos copiados desde el Depurador de Productos para agregarlos o actualizarlos en el inventario.
        </p>

        <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-indigo-950">Modalidad de Carga</h3>
            <p className="text-sm text-indigo-700">
              {sendToLive 
                ? 'Los productos se agregarán/reactivarán y se enviarán directamente a Live Shopping hoy.' 
                : 'Solo se cargarán/actualizarán los productos en el inventario general sin mandarlos a Live Shopping.'
              }
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSendToLive(!sendToLive)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              sendToLive ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                sendToLive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Datos a Pegar (Copiados desde el Depurador)
          </label>
          <textarea
            value={dataText}
            onChange={(e) => setDataText(e.target.value)}
            placeholder="Pega aquí los productos copiados (SKU, Código de Barra, Nombre, Precio Mayor, Precio Embalaje, Categoría, Subcategoría, Enlace de imagen)..."
            className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
            disabled={isProcessing}
          />
          <p className="text-xs text-gray-500 mt-1">
            Cada línea corresponde a un producto con valores separados por tabuladores.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!dataText.trim()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={20} />
            Previsualizar
          </button>

          <button
            onClick={handleAdd}
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
                Guardar en Inventario
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
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Imagen</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">SKU</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Código Barra</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Nombre</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">P. Mayor</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">P. Embalaje</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Categoría</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Subcategoría</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-4 py-2">
                        {row.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.imageUrl} alt={row.name} className="w-10 h-10 object-contain rounded border bg-gray-50" />
                        ) : (
                          <span className="text-gray-400 text-xs">Sin img</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono">{row.sku}</td>
                      <td className="px-4 py-2 font-mono text-gray-500">{row.barcode}</td>
                      <td className="px-4 py-2 font-medium">{row.name.substring(0, 40)}{row.name.length > 40 ? '...' : ''}</td>
                      <td className="px-4 py-2">${row.wholesalePrice.toLocaleString()}</td>
                      <td className="px-4 py-2">${row.packagePrice.toLocaleString()}</td>
                      <td className="px-4 py-2">{row.category}</td>
                      <td className="px-4 py-2">{row.subcategory}</td>
                    </tr>
                  ))}
                  {preview.length > 10 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-2 text-center text-gray-500">
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
            {results.created > 0 && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-900">Productos nuevos creados</p>
                  <p className="text-sm text-green-700">
                    {sendToLive 
                      ? `Se crearon ${results.created} productos nuevos con stock inicial de 1 y se agregaron a Live Shopping.`
                      : `Se crearon ${results.created} productos nuevos con stock inicial de ${unlimitedStock ? '99999 (Ilimitado)' : '0'} en el inventario.`
                    }
                  </p>
                </div>
              </div>
            )}

            {results.updated > 0 && (
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-900">Productos actualizados ({results.updated})</p>
                  <p className="text-sm text-blue-700">
                    Se actualizaron los detalles (precios, nombre, categoría, imagen) de {results.updated} productos existentes en el inventario general.
                  </p>
                </div>
              </div>
            )}

            {sendToLive && results.duplicates.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-900">Productos existentes marcados para Live ({results.duplicates.length})</p>
                  <p className="text-xs text-red-700 mb-2">
                    Estos productos ya existían en la base de datos. Se reactivaron y agregaron a Live Shopping con stock mínimo.
                  </p>
                  <details className="mt-2">
                    <summary className="text-xs text-red-800 cursor-pointer hover:underline">Ver productos existentes</summary>
                    <pre className="text-xs mt-2 bg-red-100 p-2 rounded overflow-auto max-h-32 font-mono">{results.duplicates.join('\n')}</pre>
                  </details>
                </div>
              </div>
            )}

            {results.errors.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-900">Errores ({results.errors.length})</p>
                  <details className="mt-2">
                    <summary className="text-xs text-red-800 cursor-pointer hover:underline">Ver errores de API</summary>
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
