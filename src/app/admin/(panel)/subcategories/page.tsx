'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, SUBCATEGORIES_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from '@/lib/db';
import { Subcategory, Category } from '@/types/admin';
import { Plus, Pencil, Trash2, X, RefreshCw, AlertTriangle, ChevronUp, ChevronDown, Search, FolderOpen } from 'lucide-react';
import ImageUploadField from '@/components/admin/ImageUploadField';

const SUBCATEGORIES_BUCKET_ID = '67f41e05000d0adb6f12';

export default function SubcategoriesPage() {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; data: Partial<Subcategory> & { categoryId?: string } } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filtered = search
    ? subcategories.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : filterCat
      ? subcategories.filter(s => s.categoryId === filterCat)
      : subcategories;

  const toggleSelect = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const bulkDelete = async () => {
    if (selected.size === 0 || !confirm(`¿Eliminar ${selected.size} subcategoría(s)?`)) return;
    setBulkDeleting(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all([...selected].map(id => databases.deleteDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, id)));
      setSubcategories(prev => prev.filter(s => !selected.has(s.$id)));
      setSelected(new Set());
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBulkDeleting(false); }
  };

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const [subRes, catRes, prodRes] = await Promise.all([
        databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION_ID, [Query.orderAsc('$createdAt'), Query.limit(100)]),
        databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.orderAsc('$createdAt'), Query.limit(50)]),
        fetch('/api/public-data/products?limit=5000&includeOutOfStock=true&includeVendorProducts=true').then(r => r.ok ? r.json() : { products: [] }),
      ]);
      setSubcategories(subRes.documents as unknown as Subcategory[]);
      setCategories(catRes.documents as unknown as Category[]);
      const counts: Record<string, number> = {};
      for (const p of (prodRes.products || [])) {
        const subId = (p as any).SUBCATEGORYID;
        if (subId) counts[subId] = (counts[subId] || 0) + 1;
      }
      setProductCounts(counts);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getCategoryName = (catId: string) => categories.find(c => c.$id === catId)?.name || 'Sin categoría';

  const openAdd = (categoryId?: string) => setModal({ mode: 'add', data: { name: '', categoryId: categoryId || '', parentSubcategoryId: '', order: subcategories.length } });
  const openEdit = (s: Subcategory) => setModal({ mode: 'edit', data: { ...s, categoryId: s.categoryId, parentSubcategoryId: s.parentSubcategoryId || '' } });

  const save = async () => {
    if (!modal) return;
    const d = modal.data as any;
    const nameVal = (d.name || d.NAME || '').trim();
    if (!nameVal) { alert('El nombre es requerido'); return; }
    if (!d.categoryId) { alert('Selecciona una categoría padre'); return; }
    setIsSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const payload: Record<string, any> = { 
        name: nameVal, 
        categoryId: d.categoryId, 
        parentSubcategoryId: d.parentSubcategoryId || null,
      };
      if (d.ICON_URL) payload.ICON_URL = d.ICON_URL;
      if (d.BACKGROUND_IMAGE_URL) payload.BACKGROUND_IMAGE_URL = d.BACKGROUND_IMAGE_URL;
      
      if (modal.mode === 'add') {
        const doc = await databases.createDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, ID.unique(), payload);
        setSubcategories(prev => [...prev, doc as unknown as Subcategory]);
      } else {
        const doc = await databases.updateDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, d.$id, payload);
        setSubcategories(prev => prev.map(s => s.$id === d.$id ? doc as unknown as Subcategory : s));
      }
      setModal(null);
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setIsSaving(false); }
  };

  const [reordering, setReordering] = useState<string | null>(null);

  const moveSubcategory = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= filtered.length) return;
    const updated = [...filtered];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    const reassigned = updated.map((s, i) => ({ ...s, order: i }));
    setSubcategories(prev => prev.map(s => reassigned.find(r => r.$id === s.$id) || s));
    const a = reassigned[idx], b = reassigned[next];
    setReordering(a.$id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all([
        databases.updateDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, a.$id, { name: a.name, categoryId: a.categoryId }),
        databases.updateDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, b.$id, { name: b.name, categoryId: b.categoryId }),
      ]);
    } catch (e: any) { alert('Error al reordenar: ' + e.message); load(); }
    finally { setReordering(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta subcategoría?')) return;
    setDeleteId(id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.deleteDocument(databaseId, SUBCATEGORIES_COLLECTION_ID, id);
      setSubcategories(prev => prev.filter(s => s.$id !== id));
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setDeleteId(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Subcategorías</h1>
          <p className="text-sm text-gray-500">{filtered.length} de {subcategories.length} subcategorías</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={isLoading} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition text-gray-600">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => openAdd()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar subcategoría..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-sm font-medium text-red-700">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
          <button onClick={bulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition disabled:opacity-60">
            <Trash2 className="w-3.5 h-3.5" />{bulkDeleting ? 'Eliminando...' : 'Eliminar seleccionadas'}
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-red-500 hover:text-red-700">Cancelar</button>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : subcategories.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay subcategorías. Agrega la primera.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((s, idx) => (
              <div key={s.$id} className={`flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors ${selected.has(s.$id) ? 'bg-indigo-50/60' : ''}`}>
                <input type="checkbox" checked={selected.has(s.$id)} onChange={() => toggleSelect(s.$id)}
                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer shrink-0" />
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveSubcategory(idx, -1)} disabled={idx === 0 || reordering === s.$id}
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveSubcategory(idx, 1)} disabled={idx === filtered.length - 1 || reordering === s.$id}
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="w-10 h-10 shrink-0 flex items-center justify-center text-2xl">
                  {(s as any).icon || '🏷️'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">
                    {s.parentSubcategoryId ? <span className="text-indigo-400 mr-1">└─</span> : null}
                    {s.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {getCategoryName(s.categoryId)}
                    {s.parentSubcategoryId ? ` / ${subcategories.find(sub => sub.$id === s.parentSubcategoryId)?.name}` : ''}
                  </p>
                </div>
                <span className="text-xs bg-purple-50 text-purple-600 font-medium px-2 py-0.5 rounded-full shrink-0">
                  {productCounts[s.$id] ?? 0} prods
                </span>
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">#{idx + 1}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(s.$id)} disabled={deleteId === s.$id} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{modal.mode === 'add' ? 'Nueva Subcategoría' : 'Editar Subcategoría'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input type="text" value={modal.data.name || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, name: e.target.value } } : m)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoría padre *</label>
                <select value={modal.data.categoryId || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, categoryId: e.target.value, parentSubcategoryId: '' } } : m)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Seleccionar categoría</option>
                  {categories.map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subcategoría padre (Nivel 2) - Opcional</label>
                <select value={modal.data.parentSubcategoryId || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, parentSubcategoryId: e.target.value } } : m)}
                  disabled={!modal.data.categoryId}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:opacity-60">
                  <option value="">Ninguna (Nivel 2 Principal)</option>
                  {subcategories.filter(s => s.categoryId === modal.data.categoryId && s.$id !== (modal.data as any).$id && !s.parentSubcategoryId).map(s => (
                    <option key={s.$id} value={s.$id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <ImageUploadField
                label="Icono (48×48px)" 
                bucketId={SUBCATEGORIES_BUCKET_ID}
                value={modal.data.ICON_URL || ''}
                onChange={v => setModal(m => m ? { ...m, data: { ...m.data, ICON_URL: v } } : m)}
                placeholder="Icono pequeño para esquina de tarjeta"
              />
              <ImageUploadField 
                label="Imagen de Fondo Principal" 
                bucketId={SUBCATEGORIES_BUCKET_ID}
                value={modal.data.BACKGROUND_IMAGE_URL || ''}
                onChange={v => setModal(m => m ? { ...m, data: { ...m.data, BACKGROUND_IMAGE_URL: v } } : m)}
                placeholder="Imagen principal de la tarjeta"
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Orden</label>
                <input type="number" value={modal.data.order ?? 0} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, order: Number(e.target.value) } } : m)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={save} disabled={isSaving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60 flex items-center gap-2">
                {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
