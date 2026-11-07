'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Save, Upload, Link2, Clipboard, Image as ImageIcon, Monitor, Smartphone, Megaphone, Plus, Trash2 } from 'lucide-react';
import { invalidateStoreSettingsCache } from '@/hooks/useStoreSettings';

type Banner = {
  enabled: boolean;
  desktopUrl: string;
  mobileUrl: string;
  linkType: 'none' | 'url' | 'category';
  linkUrl: string;
  category: string;
};

function emptyBanner(): Banner {
  return { enabled: true, desktopUrl: '', mobileUrl: '', linkType: 'none', linkUrl: '', category: '' };
}

function normalizeBanner(value: any): Banner {
  const mode = value?.linkType === 'url' || value?.linkType === 'category' ? value.linkType : 'none';
  return { ...emptyBanner(), enabled: value?.enabled !== false, desktopUrl: String(value?.desktopUrl || ''), mobileUrl: String(value?.mobileUrl || ''), linkType: mode, linkUrl: String(value?.linkUrl || ''), category: String(value?.category || '') };
}

function normalizeExternalLink(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function ImageField({ label, hint, value, onChange, onUpload }: { label: string; hint: string; value: string; onChange: (value: string) => void; onUpload: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<'url' | 'upload'>(value ? 'url' : 'upload');
  const [pasteHover, setPasteHover] = useState(false);

  const handleFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      await onUpload(file);
    } catch (e) {
      // el padre maneja el error
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleFile(file);
        return;
      }
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setPasteHover(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  };

  // Pegar desde el portapapeles con la API moderna (Clipboard API)
  const pasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `pegado-${Date.now()}.${type.split('/')[1] || 'png'}`, { type });
            await handleFile(file);
            return;
          }
        }
      }
      // Si no encontró imagen, intentar con readText (por si es una URL de imagen)
      const text = await navigator.clipboard.readText();
      if (text && /^https?:\/\//.test(text)) {
        onChange(text);
        setMode('url');
        return;
      }
      alert('No hay ninguna imagen en el portapapeles. Copia una imagen primero (click derecho → Copiar imagen, o toma una captura de pantalla).');
    } catch (err) {
      // Fallback: enfocar el div y mostrar instrucción de Ctrl+V
      if (pasteRef.current) {
        pasteRef.current.focus();
        alert('Tu navegador bloqueó el acceso al portapapeles. Haz click en el recuadro y presiona Ctrl+V (Cmd+V en Mac).');
      }
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      {/* Overlay de carga a pantalla completa */}
      {uploading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm font-bold text-gray-700">Subiendo imagen...</p>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-sm font-bold text-slate-900">{label}</span>
          <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
        <div role="tablist" aria-label={`Fuente de imagen: ${label}`} className="flex shrink-0 rounded-xl bg-slate-100 p-1">
          <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => setMode('upload')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Upload className="mr-1.5 inline h-3.5 w-3.5" />Subir
          </button>
          <button type="button" role="tab" aria-selected={mode === 'url'} onClick={() => setMode('url')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === 'url' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Link2 className="mr-1.5 inline h-3.5 w-3.5" />URL
          </button>
        </div>
      </div>
      {mode === 'url' ? (
        <input
          type="url"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="https://..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"
        />
      ) : (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onInputChange}
            className="hidden"
          />
          <div
            ref={pasteRef}
            tabIndex={0}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setPasteHover(true); }}
            onDragLeave={() => setPasteHover(false)}
            onClick={() => fileRef.current?.click()}
            className={`flex-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center text-xs transition cursor-pointer focus:outline-none focus:ring-4 focus:ring-amber-100 ${pasteHover ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/60'} ${uploading ? 'opacity-50' : ''}`}
          >
            {uploading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin text-indigo-500" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#FAD502] text-slate-900"><ImageIcon className="h-5 w-5" /></span>
                <span className="font-semibold text-slate-700">Elige o arrastra una imagen</span>
                <span className="text-[11px] text-slate-400">PNG, JPG o WEBP</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); pasteFromClipboard(); }}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100 disabled:opacity-50"
            title="Pegar imagen del portapapeles"
          >
            <Clipboard className="h-4 w-4" />
            Pegar
          </button>
        </div>
      )}
    </div>
  );
}

function Preview({ src, label, mobile = false }: { src: string; label: string; mobile?: boolean }) {
  const empty = <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><ImageIcon className="h-5 w-5" /></span><span>Agrega una imagen para ver la vista previa</span></div>;

  if (mobile) {
    return (
      <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-2xl bg-[#e9edf2] p-6">
        <div className="relative aspect-[9/16] w-[min(190px,70%)] overflow-hidden rounded-[30px] border-[7px] border-slate-800 bg-white shadow-[0_16px_36px_rgba(15,23,42,.2)]">
          <div className="absolute left-1/2 top-1.5 z-10 h-3 w-16 -translate-x-1/2 rounded-full bg-slate-800" />
          {src ? <img src={src} alt={label} className="absolute inset-0 h-full w-full object-contain" style={{ width: '100%', height: '100%' }} /> : empty}
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/7] min-h-[210px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {src ? <img src={src} alt={label} className="absolute inset-0 h-full w-full object-contain" style={{ width: '100%', height: '100%' }} /> : empty}
    </div>
  );
}

export default function HomeMarketingPage() {
  const [banners, setBanners] = useState<Banner[]>([emptyBanner()]);
  const [active, setActive] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    fetch('/api/store-settings', { cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => {
        if (data.error) throw new Error();
        const marketing = data.homeMarketing || {};
        const saved = Array.isArray(marketing.newsBanners) ? marketing.newsBanners.slice(0, 3) : [marketing.newsBanner || emptyBanner()];
        setBanners(saved.length ? saved.map(normalizeBanner) : [emptyBanner()]);
      })
      .catch(() => { setLoadFailed(true); setMessage('No se pudo cargar la configuración. Recarga la página antes de guardar.'); })
      .finally(() => setLoading(false));

    Promise.all([
      fetch('/api/public-data/catalog?categoriesOnly=true').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('/api/public-data/products?limit=1000').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]).then(([catalog, response]) => {
      const docs = Array.isArray(catalog.categories) ? catalog.categories : [];
      const products = Array.isArray(response.products) ? response.products : [];
      const names = new Map<string, string>();
      for (const doc of docs) {
        const name = String(doc.name || doc.NAME || '').trim();
        if (name) { names.set(name, name); if (doc.$id || doc.id) names.set(String(doc.$id || doc.id), name); }
      }
      const available = new Set<string>(names.values());
      for (const product of products) {
        const raw = String(product.CATEGORYID || product.categoryId || product.category || '').trim();
        const name = names.get(raw) || (product.category && product.category !== 'Sin Categoria' ? String(product.category).trim() : '');
        if (name) available.add(name);
      }
      setCategories([...available].sort((a, b) => a.localeCompare(b, 'es')));
    }).catch(() => setCategoriesError(true));
  }, []);

  const banner = banners[active] || banners[0];
  const updateBanner = (patch: Partial<Banner>) => setBanners(current => current.map((item, index) => index === active ? { ...item, ...patch } : item));
  const uploadImage = async (file: File, slot: string): Promise<string> => {
    const body = new FormData(); body.append('file', file); body.append('slot', slot);
    const response = await fetch('/api/admin/marketing/upload-image', { method: 'POST', body });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo subir la imagen.');
    return data.imageUrl;
  };
  const save = async () => {
    if (loadFailed) return;
    const normalized: Banner[] = [];
    for (let i = 0; i < banners.length; i++) {
      const item = banners[i];
      if (item.linkType === 'url') {
        const link = normalizeExternalLink(item.linkUrl);
        if (!link) { setActive(i); setMessage(`Escribe un enlace válido para el banner ${i + 1}.`); return; }
        normalized.push({ ...item, linkUrl: link });
      } else if (item.linkType === 'category' && !item.category.trim()) {
        setActive(i); setMessage(`Elige una categoría para el banner ${i + 1}.`); return;
      } else normalized.push(item);
    }
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/store-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeMarketing: { newsBanners: normalized, newsBanner: normalized[0] || { enabled: false, desktopUrl: '', mobileUrl: '' } } }),
      });
      if (!response.ok) throw new Error('No se pudieron guardar los banners.');
      setBanners(normalized); invalidateStoreSettingsCache();
      window.dispatchEvent(new Event('store-settings-updated'));
      setMessage('Banners actualizados.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>;
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#FAD502] text-slate-900"><Megaphone className="h-5 w-5" /></span>
          <div><p className="text-sm font-semibold text-slate-500">Contenido de la tienda</p><h1 className="text-2xl font-bold text-slate-950">Últimas novedades</h1><p className="mt-1 text-sm text-slate-600">Agrega hasta tres banners antes de las categorías.</p></div>
        </div>
        <button onClick={save} disabled={saving || loadFailed} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FAD502] px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </header>
      {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${message === 'Banners actualizados.' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message}</div>}
      <div className="flex flex-wrap items-center gap-2" aria-label="Seleccionar banner">
        {banners.map((item, index) => <button key={index} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className={`rounded-xl border px-4 py-2 text-sm font-bold ${active === index ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}>Banner {index + 1}{!item.enabled ? ' · oculto' : ''}</button>)}
        {banners.length < 3 && <button type="button" onClick={() => { setActive(banners.length); setBanners(current => [...current, emptyBanner()]); setMessage(''); }} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><Plus size={16} /> Agregar banner</button>}
      </div>
      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-lg font-bold text-slate-950">Banner {active + 1}</h2><p className="text-sm text-slate-500">Configura su imagen y dónde lleva al hacer clic.</p></div>
          <div className="flex items-center gap-2">
            <button type="button" role="switch" aria-checked={banner.enabled} onClick={() => updateBanner({ enabled: !banner.enabled })} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${banner.enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{banner.enabled ? <Eye size={16} /> : <EyeOff size={16} />}{banner.enabled ? 'Visible' : 'Oculto'}</button>
            {banners.length > 1 && <button type="button" onClick={() => { setBanners(current => current.filter((_, index) => index !== active)); setActive(Math.max(0, active - 1)); }} className="rounded-xl border border-rose-200 px-3 py-2 text-rose-700" aria-label={`Quitar banner ${active + 1}`}><Trash2 size={17} /></button>}
          </div>
        </div>
        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Vista previa</h3><div className="flex rounded-xl border bg-white p-1"><button type="button" onClick={() => setPreviewMode('desktop')} aria-pressed={previewMode === 'desktop'} className={`rounded-lg px-3 py-2 text-xs font-semibold ${previewMode === 'desktop' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Monitor className="mr-1 inline h-4 w-4" />PC</button><button type="button" onClick={() => setPreviewMode('mobile')} aria-pressed={previewMode === 'mobile'} className={`rounded-lg px-3 py-2 text-xs font-semibold ${previewMode === 'mobile' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Smartphone className="mr-1 inline h-4 w-4" />Móvil</button></div></div>
            <Preview src={previewMode === 'desktop' ? (banner.desktopUrl || banner.mobileUrl) : (banner.mobileUrl || banner.desktopUrl)} label={`Banner ${active + 1}`} mobile={previewMode === 'mobile'} />
            <p className="mt-3 text-xs text-slate-500">Si falta una versión, se usará la imagen del otro formato.</p>
          </div>
          <div className="space-y-4">
            <ImageField key={`desktop-${active}`} label="Imagen para escritorio" hint="Formato horizontal para computadores y tablets." value={banner.desktopUrl} onChange={desktopUrl => updateBanner({ desktopUrl })} onUpload={async file => { try { updateBanner({ desktopUrl: await uploadImage(file, `news-${active + 1}-desktop`) }); } catch (error) { setMessage(error instanceof Error ? error.message : 'Error al subir.'); } }} />
            <ImageField key={`mobile-${active}`} label="Imagen para móvil" hint="Puedes usar otra imagen para teléfonos." value={banner.mobileUrl} onChange={mobileUrl => updateBanner({ mobileUrl })} onUpload={async file => { try { updateBanner({ mobileUrl: await uploadImage(file, `news-${active + 1}-mobile`) }); } catch (error) { setMessage(error instanceof Error ? error.message : 'Error al subir.'); } }} />
            <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
              <label htmlFor="banner-link-type" className="block text-sm font-bold text-slate-900">Al hacer clic en la imagen</label>
              <select id="banner-link-type" value={banner.linkType} onChange={event => updateBanner({ linkType: event.target.value as Banner['linkType'] })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"><option value="none">Sin enlace</option><option value="url">Enlace externo</option><option value="category">Categoría de la tienda</option></select>
              {banner.linkType === 'url' && <label className="block text-sm font-medium text-slate-700">Dirección del enlace<input type="url" value={banner.linkUrl} onChange={event => updateBanner({ linkUrl: event.target.value })} placeholder="https://facebook.com/..." className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base" /><span className="mt-1 block text-xs text-slate-500">Se abrirá en otra pestaña.</span></label>}
              {banner.linkType === 'category' && <label className="block text-sm font-medium text-slate-700">Elige la categoría<select value={banner.category} onChange={event => updateBanner({ category: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base"><option value="">Selecciona una categoría</option>{banner.category && !categories.includes(banner.category) && <option value={banner.category}>{banner.category}</option>}{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>{categoriesError && <span className="mt-1 block text-xs text-rose-700">No se pudieron cargar las categorías. Recarga la página.</span>}</label>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
