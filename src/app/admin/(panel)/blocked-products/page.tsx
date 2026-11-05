'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { Package, Trash2, Search, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { useStoreSettings } from '@/hooks/useStoreSettings';

interface BlockedProduct {
  $id: string;
  sku: string;
  name: string;
  imageUrl?: string;
  $createdAt: string;
}

export default function BlockedProductsPage() {
  const { inventoryMode } = useStoreSettings();
  const [items, setItems] = useState<BlockedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, 'blocked_products', [
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ]);
      setItems(res.documents as unknown as BlockedProduct[]);
    } catch (e: any) {
      setError(e.message || 'Error al cargar los productos bloqueados');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecoverDeletedProducts = async () => {
    if (!confirm('¿Buscar y recuperar productos eliminados en órdenes con reemplazos?\n\nEsto escaneará todas las órdenes, buscará items reemplazados cuyo producto original fue eliminado, y los recreará en la base de datos.')) return;
    setRecovering(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const recovered: string[] = [];
      let offset = 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore && offset < 500) {
        const res = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
          Query.limit(pageSize),
          Query.offset(offset)
        ]);
        if (res.documents.length === 0) { hasMore = false; break; }

        for (const ord of res.documents) {
          try {
            const parsedItems = JSON.parse(String(ord.ITEMS || '[]'));
            for (const it of parsedItems) {
              if (it.replaced && it.originalItem && it.originalItem.id) {
                const origId = it.originalItem.id;
                // Check if product still exists
                let exists = false;
                try {
                  await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, origId);
                  exists = true;
                } catch {}
                if (!exists) {
                  // Recreate it
                  try {
                    await databases.createDocument(databaseId, PRODUCTS_COLLECTION_ID, origId, {
                      NAME: it.originalItem.name || 'Producto recuperado',
                      PRICE: it.originalItem.price || 0,
                      IMAGEURL: it.originalItem.img || '',
                      sku: it.originalItem.sku || '',
                      ...(inventoryMode === 'web_independent'
                        ? { WEB_STOCK: 1, web_stock: 1 }
                        : { STOCK: 1, stock: 1 }),
                    });
                    recovered.push(`${it.originalItem.name} (${it.originalItem.sku})`);
                  } catch (err) { console.error('Error recreating product:', origId, err); }
                }
              }
            }
          } catch {}
        }
        offset += pageSize;
      }

      if (recovered.length === 0) {
        alert('No se encontraron productos eliminados para recuperar. Todos los productos originales ya existen en la base de datos.');
      } else {
        alert(`Se recuperaron ${recovered.length} producto(s):\n\n${recovered.join('\n')}`);
        await load();
      }
    } catch (e: any) {
      alert('Error al recuperar: ' + e.message);
    } finally {
      setRecovering(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}" de productos bloqueados?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/blocked-products?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }
      setItems(prev => prev.filter(item => item.$id !== id));
    } catch (e: any) {
      alert('Error al eliminar: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestoreToOrder = async (item: BlockedProduct) => {
    if (!confirm(`¿Restaurar "${item.name}" (SKU: ${item.sku}) a su pedido original?\n\nEsto buscará el pedido donde fue reemplazado, revertirá el reemplazo y desbloqueará el producto.`)) return;
    setRestoringId(item.$id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // 1. Search orders for replaced items with originalItem.sku matching this blocked product's SKU
      // Try negotiation orders first, then all orders with pagination
      let foundOrder: any = null;
      let foundIndices: number[] = [];
      const skuLower = item.sku?.toLowerCase().trim();

      const searchInOrders = async (orders: any[]) => {
        for (const ord of orders) {
          try {
            const parsedItems = JSON.parse(String(ord.ITEMS || '[]'));
            const matchIndices: number[] = [];
            for (let i = 0; i < parsedItems.length; i++) {
              const it = parsedItems[i];
              if (it.replaced && it.originalItem) {
                const origSku = (it.originalItem.sku || '').toLowerCase().trim();
                if (origSku === skuLower) {
                  matchIndices.push(i);
                }
              }
            }
            if (matchIndices.length > 0) {
              foundOrder = ord;
              foundIndices = matchIndices;
              return true;
            }
          } catch {}
        }
        return false;
      };

      // Try negotiation status orders first
      let found = false;
      try {
        const negRes = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
          Query.equal('STATUS', 'negotiation'),
          Query.limit(100)
        ]);
        found = await searchInOrders(negRes.documents);
      } catch {}

      // Then try all orders with pagination (up to 500)
      if (!found) {
        try {
          let offset = 0;
          const pageSize = 100;
          while (offset < 500 && !foundOrder) {
            const res = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
              Query.limit(pageSize),
              Query.offset(offset)
            ]);
            if (res.documents.length === 0) break;
            found = await searchInOrders(res.documents);
            offset += pageSize;
          }
        } catch (e: any) {
          console.error('Error searching orders:', e);
        }
      }

      if (!foundOrder) {
        alert(`No se encontró ningún pedido con este producto reemplazado (SKU: ${item.sku}).\nEl producto sigue bloqueado. Es posible que el reemplazo ya haya sido revertido manualmente.`);
        return;
      }

      // 2. Revert the replacement in the found order
      const parsedItems = JSON.parse(foundOrder.ITEMS || '[]');
      const sortedIndices = [...foundIndices].sort((a, b) => b - a);
      const firstIdx = Math.min(...foundIndices);
      const replacedItem = parsedItems[firstIdx];
      const origItem = replacedItem.originalItem;

      // Remove all replacement items
      for (const idx of sortedIndices) {
        parsedItems.splice(idx, 1);
      }

      // Insert original item at the position of the first replacement
      const restoredItem: any = {
        id: origItem.id || '',
        name: origItem.name,
        price: origItem.price,
        img: origItem.img || '',
        sku: origItem.sku || '',
        qty: replacedItem.qty,
        total: (origItem.price || 0) * (replacedItem.qty || 1),
        missing: false,
        replaced: false,
      };
      parsedItems.splice(firstIdx, 0, restoredItem);

      const newSubtotal = parsedItems.reduce((s: number, it: any) => s + (it.price * it.qty), 0);
      const newTotal = newSubtotal + (foundOrder.SHIPPINGCOST || 0) - (foundOrder.DISCOUNTAMOUNT || 0);

      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, foundOrder.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal
      });

      // 3. Re-create the original product if it was deleted
      if (origItem.id) {
        try {
          await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, origItem.id);
        } catch {
          try {
            await databases.createDocument(databaseId, PRODUCTS_COLLECTION_ID, origItem.id, {
              NAME: origItem.name,
              PRICE: origItem.price,
              IMAGEURL: origItem.img || '',
              sku: origItem.sku || '',
              ...(inventoryMode === 'web_independent'
                ? { WEB_STOCK: 1, web_stock: 1 }
                : { STOCK: 1, stock: 1 }),
            });
          } catch (err) { console.error("Error recreating product:", err); }
        }
      }

      // 4. Delete the blocked record
      await databases.deleteDocument(databaseId, 'blocked_products', item.$id);
      setItems(prev => prev.filter(i => i.$id !== item.$id));

      alert(`Producto restaurado al pedido #${foundOrder.ORDERCODE || foundOrder.$id.slice(-6)} correctamente.`);
    } catch (e: any) {
      alert('Error al restaurar: ' + e.message);
    } finally {
      setRestoringId(null);
    }
  };

  const filtered = items.filter(item =>
    item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Productos Bloqueados</h1>
          <p className="text-sm text-gray-500">
            Productos que no existen o no hay stock, excluidos de la tienda y de importaciones masivas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRecoverDeletedProducts}
            disabled={recovering}
            className="bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition disabled:opacity-60 flex items-center gap-1.5 text-sm font-semibold px-3 py-2"
          >
            {recovering ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Recuperar eliminados
          </button>
          <button
            onClick={load}
            disabled={isLoading}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-60 flex items-center gap-1.5 text-sm font-semibold px-3 py-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o SKU..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-4 py-3 text-left w-16">Imagen</th>
                <th className="px-4 py-3 text-left w-48">SKU</th>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left w-40">Bloqueado el</th>
                <th className="px-4 py-3 text-center w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron productos bloqueados
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  const date = new Date(item.$createdAt).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  });
                  return (
                    <tr key={item.$id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-gray-300" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {item.sku}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-950 max-w-sm truncate" title={item.name}>
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{date}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleRestoreToOrder(item)}
                            disabled={restoringId === item.$id}
                            className="p-1.5 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition disabled:opacity-50 inline-flex"
                            title="Restaurar al pedido original"
                          >
                            {restoringId === item.$id ? (
                              <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(item.$id, item.name)}
                            disabled={deletingId === item.$id}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-50 inline-flex"
                            title="Solo desbloquear"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
