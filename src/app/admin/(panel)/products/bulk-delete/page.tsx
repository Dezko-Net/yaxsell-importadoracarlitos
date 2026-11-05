'use client';

import { useState } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { Trash2, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function BulkDeletePage() {
  const [skuList, setSkuList] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [results, setResults] = useState<{ deleted: number; notFound: string[]; errors: string[] } | null>(null);

  const handleDelete = async () => {
    if (!skuList.trim()) {
      alert('Pega la lista de SKUs primero');
      return;
    }

    const skus = skuList
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (skus.length === 0) {
      alert('No se encontraron SKUs válidos');
      return;
    }

    if (!confirm(`¿Eliminar ${skus.length} producto(s)? Esta acción no se puede deshacer.`)) {
      return;
    }

    setIsDeleting(true);
    setResults(null);

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      let deleted = 0;
      const notFound: string[] = [];
      const errors: string[] = [];

      // 1. Bulk find products using chunked queries by sku, jumpseller_id, and TAGS
      const foundProductsMap = new Map<string, any>();
      const chunkSize = 25; // Safe chunk size for Appwrite queries
      
      for (let i = 0; i < skus.length; i += chunkSize) {
        const chunk = skus.slice(i, i + chunkSize);
        const variations = Array.from(new Set([
          ...chunk,
          ...chunk.map(s => s.toLowerCase()),
          ...chunk.map(s => s.toUpperCase())
        ]));

        // Search by sku
        try {
          const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
            Query.equal('sku', variations),
            Query.limit(100)
          ]);
          res.documents.forEach(p => foundProductsMap.set(p.$id, p));
        } catch (e) {
          console.error('Error bulk querying sku:', e);
        }

        // Search by jumpseller_id
        try {
          const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
            Query.equal('jumpseller_id', variations),
            Query.limit(100)
          ]);
          res.documents.forEach(p => foundProductsMap.set(p.$id, p));
        } catch (e) {
          console.error('Error bulk querying jumpseller_id:', e);
        }

        // Search by TAGS
        try {
          const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
            Query.contains('TAGS', variations),
            Query.limit(100)
          ]);
          res.documents.forEach(p => foundProductsMap.set(p.$id, p));
        } catch (e) {
          console.error('Error bulk querying TAGS:', e);
        }
      }

      // Convert map to array for matching
      const resolvedProducts = Array.from(foundProductsMap.values());

      // 2. Process each SKU
      for (const sku of skus) {
        try {
          // A. Try to find it in our bulk-resolved products first
          let product = resolvedProducts.find((p: any) => {
            const jumpId = p.jumpseller_id || '';
            const skuVal = p.sku || p.SKU || ''; // check both just in case

            // Check SKU direct field
            if (skuVal.toLowerCase() === sku.toLowerCase()) return true;

            // Check jumpseller_id
            if (jumpId.toLowerCase() === sku.toLowerCase()) return true;

            // Check TAGS
            let tagParts: string[] = [];
            if (Array.isArray(p.TAGS)) {
              tagParts = p.TAGS.map((t: any) => String(t).trim().toLowerCase());
            } else if (typeof p.TAGS === 'string') {
              tagParts = p.TAGS.split(',').map((t: string) => t.trim().toLowerCase());
            }
            if (tagParts.includes(sku.toLowerCase())) return true;

            // Check FEATURES
            const features = p.FEATURES || '';
            const featMatch = typeof features === 'string' ? features.match(/SKU:\s*(.+)/i) : null;
            if (featMatch && featMatch[1].trim().toLowerCase() === sku.toLowerCase()) return true;

            return false;
          });

          // B. Fallback: If not found in bulk, do a targeted query for FEATURES contains
          if (!product) {
            try {
              const featRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
                Query.contains('FEATURES', sku),
                Query.limit(5)
              ]);
              product = featRes.documents.find((p: any) => {
                const features = p.FEATURES || '';
                const featMatch = typeof features === 'string' ? features.match(/SKU:\s*(.+)/i) : null;
                return featMatch && featMatch[1].trim().toLowerCase() === sku.toLowerCase();
              });
            } catch (e) {
              console.error(`Error querying FEATURES for sku ${sku}:`, e);
            }
          }

          // C. If still not found, add to notFound list
          if (!product) {
            notFound.push(sku);
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          // D. Delete the document
          await databases.deleteDocument(databaseId, PRODUCTS_COLLECTION_ID, product.$id);
          deleted++;
          
          // Remove from resolved list to avoid duplicate deletion matches
          const idx = resolvedProducts.findIndex(p => p.$id === product.$id);
          if (idx !== -1) resolvedProducts.splice(idx, 1);

          // Add delay to avoid rate limit
          await new Promise(r => setTimeout(r, 200));
        } catch (e: any) {
          errors.push(`${sku}: ${e.message}`);
          await new Promise(r => setTimeout(r, 200));
        }
      }

      setResults({ deleted, notFound, errors });
      if (deleted > 0) {
        alert(`✅ ${deleted} producto(s) eliminado(s)`);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/products" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} />
          Volver a Productos
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Eliminar Masivamente</h1>
        <p className="text-gray-600 mb-6">
          Pega una lista de SKUs (uno por línea) para eliminar productos en masa.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Lista de SKUs
          </label>
          <textarea
            value={skuList}
            onChange={(e) => setSkuList(e.target.value)}
            placeholder="SD88758&#10;SD87522&#10;SD86402&#10;SD86259&#10;SD86242&#10;SD86228&#10;SD85191&#10;SD85153&#10;SD84149&#10;SD84132&#10;SD84118"
            className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm resize-none"
            disabled={isDeleting}
          />
          <p className="text-xs text-gray-500 mt-1">
            {skuList.split('\n').filter(s => s.trim()).length} SKUs detectados
          </p>
        </div>

        <button
          onClick={handleDelete}
          disabled={isDeleting || !skuList.trim()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isDeleting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Eliminando...
            </>
          ) : (
            <>
              <Trash2 size={20} />
              Eliminar Productos
            </>
          )}
        </button>

        {results && (
          <div className="mt-6 space-y-4">
            {results.deleted > 0 && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-900">Eliminados exitosamente</p>
                  <p className="text-sm text-green-700">{results.deleted} producto(s)</p>
                </div>
              </div>
            )}

            {results.notFound.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-900">SKUs no encontrados</p>
                  <p className="text-sm text-yellow-700">{results.notFound.length} SKU(s) no existen en la base de datos</p>
                  <details className="mt-2">
                    <summary className="text-xs text-yellow-800 cursor-pointer hover:underline">Ver lista</summary>
                    <pre className="text-xs mt-2 bg-yellow-100 p-2 rounded overflow-auto max-h-32">{results.notFound.join('\n')}</pre>
                  </details>
                </div>
              </div>
            )}

            {results.errors.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-900">Errores</p>
                  <p className="text-sm text-red-700">{results.errors.length} SKU(s) fallaron al eliminar</p>
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
