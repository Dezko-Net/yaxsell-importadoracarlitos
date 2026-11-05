'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, CATEGORIES_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { Category } from '@/types/admin';
import { Plus, Pencil, Trash2, X, RefreshCw, AlertTriangle, Tag, ChevronUp, ChevronDown, Search, Download } from 'lucide-react';
import ImageUploadField from '@/components/admin/ImageUploadField';
import { invalidateCategoryCache } from '@/lib/cache';
import { MEDIA_BUCKET_ID } from '@/lib/db';

const CATEGORIES_BUCKET_ID = MEDIA_BUCKET_ID;

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; data: Partial<Category> } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [sortByProducts, setSortByProducts] = useState(false);

  const displayed = [...(search
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories
  )].sort((a, b) => sortByProducts ? (productCounts[b.$id] || 0) - (productCounts[a.$id] || 0) : 0);

  const toggleSelect = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const bulkDelete = async () => {
    if (selected.size === 0 || !confirm(`¿Eliminar ${selected.size} categoría(s)?`)) return;
    setBulkDeleting(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all([...selected].map(id => databases.deleteDocument(databaseId, CATEGORIES_COLLECTION_ID, id)));
      setCategories(prev => prev.filter(c => !selected.has(c.$id)));
      setSelected(new Set());
      invalidateCategoryCache();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBulkDeleting(false); }
  };

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const catsResp = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.orderAsc('$createdAt'), Query.limit(100)]);
      const prodsRes = await fetch('/api/public-data/products?limit=5000&includeOutOfStock=true&includeVendorProducts=true');
      const prodsData = prodsRes.ok ? await prodsRes.json() : { products: [] };
      
      setCategories(catsResp.documents as unknown as Category[]);
      const counts: Record<string, number> = {};
      for (const p of prodsData.products || []) {
        const catId = p.CATEGORYID || '__none__';
        counts[catId] = (counts[catId] || 0) + 1;
      }
      setProductCounts(counts);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener('yaxsel-data-change', handler);
    return () => window.removeEventListener('yaxsel-data-change', handler);
  }, [load]);

  const openAdd = () => setModal({ mode: 'add', data: { name: '', iconUrl: '', color: '', order: categories.length, BACKGROUND_IMAGE_URL: '' } });
  const openEdit = (c: Category) => setModal({ mode: 'edit', data: { ...c, name: c.name || (c as any).NAME || '' } });

  const save = async () => {
    if (!modal) return;
    const d = modal.data as any;
    const nameVal = (d.name || d.NAME || '').trim();
    if (!nameVal) { alert('El nombre es requerido'); return; }
    setIsSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const payload: Record<string, any> = {
        name: nameVal,
        iconUrl: d.iconUrl || '',
        color: d.color || '',
        order: Number(d.order) || 0,
        BACKGROUND_IMAGE_URL: d.BACKGROUND_IMAGE_URL || '',
      };
      if (modal.mode === 'add') {
        const doc = await databases.createDocument(databaseId, CATEGORIES_COLLECTION_ID, ID.unique(), payload);
        setCategories(prev => [...prev, doc as unknown as Category]);
      } else {
        const doc = await databases.updateDocument(databaseId, CATEGORIES_COLLECTION_ID, d.$id, payload);
        setCategories(prev => prev.map(c => c.$id === d.$id ? doc as unknown as Category : c));
      }
      setModal(null);
      invalidateCategoryCache();
      try { await fetch('/api/admin/revalidate', { method: 'POST' }); } catch {}
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setIsSaving(false); }
  };

  const [reordering, setReordering] = useState<string | null>(null);

  const moveCategory = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= categories.length) return;
    const updated = [...categories];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    const reassigned = updated.map((c, i) => ({ ...c, order: i }));
    setCategories(reassigned);
    const a = reassigned[idx], b = reassigned[next];
    setReordering(a.$id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all([
        databases.updateDocument(databaseId, CATEGORIES_COLLECTION_ID, a.$id, { order: a.order }),
        databases.updateDocument(databaseId, CATEGORIES_COLLECTION_ID, b.$id, { order: b.order }),
      ]);
    } catch (e: any) { alert('Error al reordenar: ' + e.message); load(); }
    finally { setReordering(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    setDeleteId(id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.deleteDocument(databaseId, CATEGORIES_COLLECTION_ID, id);
      setCategories(prev => prev.filter(c => c.$id !== id));
      invalidateCategoryCache();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setDeleteId(null); }
  };

  const exportCSV = () => {
    const headers = ['Nombre', 'Color', 'Orden', 'Productos', 'Fecha'];
    const rows = displayed.map(c => [
      c.name || '', c.color || '', c.order ?? '',
      productCounts[c.$id] || 0,
      new Date(c.$createdAt).toLocaleDateString('es-CL'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `categorias_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const F = (label: string, field: keyof Category, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={(modal?.data[field] as string) ?? ''}
        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, [field]: type === 'number' ? Number(e.target.value) : e.target.value } } : m)}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Categorías</h1>
          <p className="text-sm text-gray-500">{displayed.length} de {categories.length} categorías</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={categories.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
            <Download className="w-4 h-4" />CSV
          </button>
          <button onClick={load} disabled={isLoading} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition text-gray-600">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar categoría..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={() => setSortByProducts(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition border shrink-0 ${sortByProducts ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          # Productos
        </button>
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
        ) : categories.length === 0 ? (
          <div className="p-12 text-center">
            <Tag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay categorías. Agrega la primera.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayed.map((c, idx) => (
              <div key={c.$id} className={`flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors ${selected.has(c.$id) ? 'bg-indigo-50/60' : ''}`}>
                <input type="checkbox" checked={selected.has(c.$id)} onChange={() => toggleSelect(c.$id)}
                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer shrink-0" />
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0 || reordering === c.$id}
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveCategory(idx, 1)} disabled={idx === categories.length - 1 || reordering === c.$id}
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: c.color ? `${c.color}20` : undefined }}>
                  {c.iconUrl ? (
                    <img src={c.iconUrl} alt={c.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <Tag className="w-5 h-5 text-gray-400" style={{ color: c.color || undefined }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{c.name}</p>
                  {c.color && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: c.color }} />
                      <span className="text-xs text-gray-400">{c.color}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs bg-indigo-50 text-indigo-600 font-medium px-2 py-0.5 rounded-full shrink-0">
                  {productCounts[c.$id] ?? 0} prods
                </span>
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">#{idx + 1}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(c.$id)} disabled={deleteId === c.$id} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-3.5 h-3.5" /></button>
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
              <h2 className="font-bold text-gray-900">{modal.mode === 'add' ? 'Nueva Categoría' : 'Editar Categoría'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {F('Nombre *', 'name')}
              <ImageUploadField label="Ícono de categoría" bucketId={CATEGORIES_BUCKET_ID}
                value={modal.data.iconUrl || ''}
                onChange={v => setModal(m => m ? { ...m, data: { ...m.data, iconUrl: v } } : m)} />
              <ImageUploadField label="Imagen de fondo / portada" bucketId={CATEGORIES_BUCKET_ID}
                value={(modal.data as any).BACKGROUND_IMAGE_URL || ''}
                onChange={v => setModal(m => m ? { ...m, data: { ...m.data, BACKGROUND_IMAGE_URL: v } as any } : m)} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Color (hex)</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={modal.data.color || '#6366F1'}
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, color: e.target.value } } : m)}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                  <input type="text" value={modal.data.color || ''}
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, color: e.target.value } } : m)}
                    placeholder="#6366F1"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              {F('Orden', 'order', 'number')}
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
