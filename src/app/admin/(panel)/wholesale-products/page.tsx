'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from '@/lib/db';
import { Product, Category } from '@/types/admin';
import { Search, Pencil, RefreshCw, Boxes, DollarSign, Package, X } from 'lucide-react';

export default function WholesaleProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editWholesalePrice, setEditWholesalePrice] = useState('');
  const [editMinQuantity, setEditMinQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      
      // Cargar categorías
      const catResp = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(100)]);
      setCategories(catResp.documents as unknown as Category[]);
      
      // Cargar todos los productos con precio mayorista y stock, ordenados por stock (descendente)
      const prodResp = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
        Query.orderDesc('STOCK'),
        Query.greaterThan('WHOLESALEPRICE', 0),
        Query.greaterThan('STOCK', 0),
        Query.limit(1000)
      ]);
      setProducts(prodResp.documents as unknown as Product[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.NAME.toLowerCase().includes(q) || (p.DESCRIPTION || '').toLowerCase().includes(q);
  }).filter(p => {
    if (!catFilter) return true;
    return p.CATEGORYID === catFilter;
  });

  const getCategoryName = (catId: string) => {
    const cat = categories.find(c => c.$id === catId);
    return cat?.name || 'Sin categoría';
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
  };

  const margin = (p: Product) => {
    if (!p.COST || p.COST === 0) return 0;
    const price = p.WHOLESALEPRICE || p.PRICE;
    return Math.round(((price - p.COST) / price) * 100);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditWholesalePrice(String(product.WHOLESALEPRICE || 0));
    setEditMinQuantity(String(product.WHOLESALEMINQUANTITY || 0));
  };

  const saveWholesaleSettings = async () => {
    if (!editingProduct) return;
    setIsSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      
      const wholesalePrice = Math.round(parseFloat(editWholesalePrice));
      const minQuantity = Math.round(parseInt(editMinQuantity, 10));
      
      if (isNaN(wholesalePrice) || wholesalePrice < 0) {
        alert('El precio mayorista debe ser un número válido');
        return;
      }
      if (isNaN(minQuantity) || minQuantity < 1) {
        alert('La cantidad mínima debe ser al menos 1');
        return;
      }
      
      await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, editingProduct.$id, {
        WHOLESALEPRICE: wholesalePrice,
        WHOLESALEMINQUANTITY: minQuantity
      });
      
      setProducts(prev => prev.map(p => 
        p.$id === editingProduct.$id 
          ? { ...p, WHOLESALEPRICE: wholesalePrice, WHOLESALEMINQUANTITY: minQuantity }
          : p
      ));
      
      setEditingProduct(null);
      setEditWholesalePrice('');
      setEditMinQuantity('');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-indigo-600" />
            Productos Mayoristas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {products.length} producto{products.length !== 1 ? 's' : ''} con precio mayorista y stock disponible
          </p>
        </div>
        <button onClick={load} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          <span className="text-xs text-gray-500">Total productos mayoristas con stock</span>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <p className="text-2xl font-bold text-green-600">
            {products.length}
          </p>
          <span className="text-xs text-gray-500">Con stock disponible</span>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <p className="text-2xl font-bold text-red-600">
            0
          </p>
          <span className="text-xs text-gray-500">Sin stock (filtrados)</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o descripción..."
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              ×
            </button>
          )}
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todas las categorías</option>
          {categories.map(cat => (
            <option key={cat.$id} value={cat.$id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No hay productos mayoristas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Producto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Precio Normal</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Precio Mayorista</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Cantidad / Monto Mínimo (pedido)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Stock</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => (
                  <tr key={p.$id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.IMAGEURL && (
                          <img src={p.IMAGEURL} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.NAME}</p>
                          <p className="text-xs text-gray-500">{p.$id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getCategoryName(p.CATEGORYID || '')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatPrice(p.PRICE)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatPrice(p.WHOLESALEPRICE || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm">
                          <div className="text-gray-900 font-medium">{p.WHOLESALEMINQUANTITY || 0}+ unidades</div>
                          <div className="text-gray-500 text-xs">{formatPrice((p.WHOLESALEPRICE || 0) * (p.WHOLESALEMINQUANTITY || 0))} total</div>
                        </div>
                        <button 
                          onClick={() => openEditModal(p)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition"
                          title="Editar cantidad/monto mínimo"
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        (p.STOCK || 0) > 10 ? 'bg-green-100 text-green-700' :
                        (p.STOCK || 0) > 0 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {p.STOCK || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{margin(p)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de edición */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Editar Configuración Mayorista</h3>
              <button 
                onClick={() => setEditingProduct(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Producto
                </label>
                <p className="text-sm text-gray-600">{editingProduct.NAME}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Mayorista ($)
                </label>
                <input
                  type="number"
                  value={editWholesalePrice}
                  onChange={(e) => setEditWholesalePrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad Mínima (unidades)
                </label>
                <input
                  type="number"
                  value={editMinQuantity}
                  onChange={(e) => setEditMinQuantity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="1"
                  min="1"
                />
              </div>

              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto Mínimo del Pedido
                </label>
                <p className="text-sm text-gray-600">
                  {formatPrice((parseFloat(editWholesalePrice) || 0) * (parseInt(editMinQuantity) || 0))}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={saveWholesaleSettings}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
