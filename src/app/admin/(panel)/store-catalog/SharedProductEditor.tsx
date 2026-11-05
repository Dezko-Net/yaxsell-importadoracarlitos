'use client';

import { useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, Save, X } from 'lucide-react';
import ProductPhotoUploader, { uploadPendingFiles } from '@/components/admin/ProductPhotoUploader';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import {
  FirebaseErpProduct,
  getFirebaseErpCategories,
  getFirebaseErpSubcategories,
  purgeServerProductsCache,
  updateFirebaseErpProduct,
} from '@/lib/firebaseErpService';

type Category = { $id: string; name: string };
type Subcategory = { $id: string; name: string; categoryId: string };

export default function SharedProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product: FirebaseErpProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { inventoryMode } = useStoreSettings();
  const [name, setName] = useState(product.nombre);
  const [description, setDescription] = useState(product.description || '');
  const [category, setCategory] = useState(product.category || '');
  const [subcategory, setSubcategory] = useState(product.subcategory || '');
  const [imageUrls, setImageUrls] = useState([product.imageUrl || '', product.imageUrl2 || '', product.imageUrl3 || ''].filter(Boolean));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const rawProduct = product.rawDocument || product;
  const originalStock = inventoryMode === 'web_independent'
    ? Number(rawProduct.WEB_STOCK ?? rawProduct.web_stock ?? product.stock ?? 0)
    : Number(rawProduct.STOCK ?? rawProduct.stock ?? product.stock ?? 0);
  const isOriginallyUnlimited = inventoryMode === 'web_independent'
    ? originalStock >= 99999
    : Boolean(product.ilimitado || originalStock >= 99999);
  const [stock, setStock] = useState<string>(String(originalStock));
  const [unlimited, setUnlimited] = useState<boolean>(isOriginallyUnlimited);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setStock(String(originalStock));
    setUnlimited(isOriginallyUnlimited);
  }, [product.$id, inventoryMode, originalStock, isOriginallyUnlimited]);

  useEffect(() => {
    Promise.all([getFirebaseErpCategories(), getFirebaseErpSubcategories()]).then(([cats, subs]) => {
      setCategories(cats);
      setSubcategories(subs);
      const currentCategory = cats.find((item) => item.$id === product.category || item.name === product.category);
      const currentSubcategory = subs.find((item) => item.$id === product.subcategory || item.name === product.subcategory);
      if (currentCategory) setCategory(currentCategory.$id);
      if (currentSubcategory) setSubcategory(currentSubcategory.$id);
    });
  }, []);

  const visibleSubcategories = useMemo(() => {
    if (!category) return subcategories;
    return subcategories.filter((item) => item.categoryId === category || item.categoryId === categories.find((cat) => cat.name === category)?.$id);
  }, [categories, category, subcategories]);

  const save = async () => {
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const uploaded = pendingFiles.length ? await uploadPendingFiles(pendingFiles) : [];
      const allImages = [...imageUrls, ...uploaded].filter(Boolean).slice(0, 3);
      const newStock = unlimited ? 999999 : Math.max(0, parseInt(stock, 10) || 0);
      const stockChanged = unlimited !== isOriginallyUnlimited || (!unlimited && newStock !== originalStock);
      const inventoryPayload = inventoryMode === 'web_independent'
        ? (stockChanged ? { web_stock: unlimited ? 999999 : newStock } : {})
        : {
            ...(unlimited !== isOriginallyUnlimited && { ilimitado: unlimited }),
            ...(unlimited && { stock: 999999 }),
          };

      const ok = await updateFirebaseErpProduct(product.$id || product.sku, {
        nombre: name.trim(),
        description: description.trim(),
        category,
        subcategory,
        imageUrl: allImages[0] || '',
        imageUrl2: allImages[1] || '',
        imageUrl3: allImages[2] || '',
        ...inventoryPayload,
      });
      if (!ok) throw new Error('No se pudo guardar la ficha.');

      if (inventoryMode !== 'web_independent' && stockChanged && !unlimited) {
        await fetch('/api/erp/stock-movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product.$id || product.sku,
            sku: product.sku,
            nombre: name.trim() || product.nombre,
            tipo: 'set',
            cantidad: newStock,
            usuario: 'Admin / Catálogo Web',
            nota: 'Ajuste de stock desde edición de ficha de producto',
          }),
        }).catch((e) => console.warn('Error registrando movimiento de stock:', e));
      }

      purgeServerProductsCache();
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la ficha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">Editar ficha compartida</h2>
            <p className="text-xs text-slate-500">{inventoryMode === 'web_independent' ? 'Los cambios se aplican a la web. El inventario del ERP queda separado.' : 'Los cambios se verán en la web y en el POS. Los precios no se modifican aquí.'}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-100"><X size={19} /></button>
        </div>

        <div className="space-y-5 p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2"><Package size={18} className="text-indigo-600" /><span className="font-black">Imágenes del producto</span></div>
            <ProductPhotoUploader imageUrls={imageUrls} onChange={setImageUrls} pendingFiles={pendingFiles} onPendingFilesChange={setPendingFiles} compact />
            <p className="mt-2 text-xs text-slate-500">Hasta tres imágenes. La primera será la imagen principal compartida con el POS.</p>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Nombre</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Descripción web</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Categoría</span>
              <select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory(''); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500">
                <option value="">Sin categoría</option>
                {categories.map((item) => <option key={item.$id} value={item.$id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Subcategoría</span>
              <select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500">
                <option value="">Sin subcategoría</option>
                {visibleSubcategories.map((item) => <option key={item.$id} value={item.$id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <span className="block text-xs font-bold text-slate-400">SKU</span>
              <span className="font-mono font-black text-slate-800 text-sm">{product.sku}</span>
            </div>
            <div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-600">{inventoryMode === 'web_independent' ? 'Stock web disponible' : 'Stock disponible'}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={unlimited}
                    value={unlimited ? 'Ilimitado' : stock}
                    onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <span className="text-xs font-bold text-slate-500 shrink-0">un.</span>
                </div>
              </label>
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => setUnlimited(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-xs font-semibold text-slate-600">Vender sin stock (ilimitado)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar ficha
          </button>
        </div>
      </div>
    </div>
  );
}
