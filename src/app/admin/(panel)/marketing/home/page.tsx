'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Save, Upload, Link2, Clipboard, Image as ImageIcon, Monitor, Smartphone, Megaphone } from 'lucide-react';

type HomeMarketing = {
  newsBanner: { enabled: boolean; desktopUrl: string; mobileUrl: string };
};

const EMPTY_CONFIG: HomeMarketing = {
  newsBanner: { enabled: true, desktopUrl: '', mobileUrl: '' },
};

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
          {src ? <img src={src} alt={label} className="h-full w-full object-cover" /> : empty}
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-[16/7] min-h-[210px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {src ? <img src={src} alt={label} className="h-full w-full object-cover" /> : empty}
    </div>
  );
}

export default function HomeMarketingPage() {
  const [config, setConfig] = useState<HomeMarketing>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    fetch('/api/store-settings', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('No se pudo cargar la configuración.');
        return response.json();
      })
      .then(data => {
        if (data.error) throw new Error('No se pudo cargar la configuración.');
        setConfig({ newsBanner: { ...EMPTY_CONFIG.newsBanner, ...(data.homeMarketing?.newsBanner || {}) } });
      })
      .catch(() => { setLoadFailed(true); setMessage('No se pudo cargar la configuración. Recarga la página antes de guardar.'); })
      .finally(() => setLoading(false));
  }, []);

  const uploadImage = async (file: File, slot: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('slot', slot);
    const res = await fetch('/api/admin/marketing/upload-image', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Error al subir');
    return data.imageUrl;
  };

  const save = async () => {
    if (loadFailed) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/store-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeMarketing: { newsBanner: config.newsBanner } }),
      });
      if (!response.ok) throw new Error('No se pudo guardar');
      setMessage('Banner actualizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <span className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#FAD502] text-slate-900 shadow-[0_5px_14px_rgba(250,213,2,.23)]">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-500">Contenido de la tienda</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[30px]">Últimas novedades</h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Administra la imagen promocional que ven tus clientes al explorar el catálogo.</p>
          </div>
        </div>
        <button onClick={save} disabled={saving || loadFailed} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#FAD502] px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-[#f2ca00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60 sm:self-center">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </header>

      {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${message === 'Banner actualizado.' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message}</div>}

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,.055)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><ImageIcon className="h-5 w-5" /></span>
            <div>
              <h2 className="text-base font-bold text-slate-950">Banner de la tienda</h2>
              <p className="mt-1 text-sm text-slate-500">Se muestra antes de «Explora nuestras categorías».</p>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={config.newsBanner.enabled}
            onClick={() => setConfig(current => ({ ...current, newsBanner: { ...current.newsBanner, enabled: !current.newsBanner.enabled } }))}
            className="inline-flex min-h-11 items-center gap-3 self-start rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100 sm:self-center"
          >
            <span className={`relative h-6 w-11 rounded-full transition-colors ${config.newsBanner.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${config.newsBanner.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
            <span className="inline-flex items-center gap-1.5">{config.newsBanner.enabled ? <Eye className="h-4 w-4 text-emerald-700" /> : <EyeOff className="h-4 w-4 text-slate-400" />}{config.newsBanner.enabled ? 'Visible en la tienda' : 'Oculto en la tienda'}</span>
          </button>
        </div>

        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)] lg:gap-6 lg:p-7">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Vista previa</h3>
                <p className="mt-1 text-xs text-slate-500">Revisa cómo se adapta en cada pantalla.</p>
              </div>
              <div role="tablist" aria-label="Tamaño de vista previa" className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button type="button" role="tab" aria-selected={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${previewMode === 'desktop' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Monitor className="h-3.5 w-3.5" />Escritorio</button>
                <button type="button" role="tab" aria-selected={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${previewMode === 'mobile' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Smartphone className="h-3.5 w-3.5" />Móvil</button>
              </div>
            </div>
            <Preview
              src={previewMode === 'desktop' ? config.newsBanner.desktopUrl : config.newsBanner.mobileUrl}
              label={`Banner Últimas novedades, vista ${previewMode === 'desktop' ? 'de escritorio' : 'móvil'}`}
              mobile={previewMode === 'mobile'}
            />
            <p className="mt-3 text-xs leading-5 text-slate-500">{previewMode === 'desktop' ? 'Imagen para pantallas grandes.' : 'Imagen vertical para teléfonos.'} La vista previa es referencial.</p>
          </div>

          <div className="space-y-4">
            <ImageField
              label="Imagen para escritorio"
              hint="Formato horizontal para computadores y tablets."
              value={config.newsBanner.desktopUrl}
              onChange={desktopUrl => setConfig(current => ({ ...current, newsBanner: { ...current.newsBanner, desktopUrl } }))}
              onUpload={async file => { try { const url = await uploadImage(file, 'news-desktop'); setConfig(current => ({ ...current, newsBanner: { ...current.newsBanner, desktopUrl: url } })); } catch (e) { setMessage(e instanceof Error ? e.message : 'Error al subir la imagen.'); } }}
            />
            <ImageField
              label="Imagen para móvil"
              hint="Puedes usar otra composición vertical para teléfono."
              value={config.newsBanner.mobileUrl}
              onChange={mobileUrl => setConfig(current => ({ ...current, newsBanner: { ...current.newsBanner, mobileUrl } }))}
              onUpload={async file => { try { const url = await uploadImage(file, 'news-mobile'); setConfig(current => ({ ...current, newsBanner: { ...current.newsBanner, mobileUrl: url } })); } catch (e) { setMessage(e instanceof Error ? e.message : 'Error al subir la imagen.'); } }}
            />
            <p className="px-1 text-xs leading-5 text-slate-500">Si un formato queda vacío, la tienda conserva la imagen que ya trae la plantilla.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
