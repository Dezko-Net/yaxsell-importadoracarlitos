'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, ImagePlus, Loader2, Save } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { uploadFile, withPrefix } from '@/lib/db';
import { compressProductImageClient } from '@/lib/compress-product-image-client';
import { DEFAULT_WEB_CLIENT_CONFIG, normalizeWebClientConfig, validateWebClientConfig, type WebClientConfig } from '@/lib/web-client-config';
import { useWebClientConfig } from '@/hooks/useWebClientConfig';
import { SUPREME_OWNER_UID } from '@/lib/supreme-owner';

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100 disabled:opacity-60';

export default function WebClientSettingsPanel() {
  const { refresh } = useWebClientConfig();
  const [config, setConfig] = useState<WebClientConfig>(DEFAULT_WEB_CLIENT_CONFIG);
  const [metaId, setMetaId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = auth.currentUser;
        if (!current || current.uid !== SUPREME_OWNER_UID) throw new Error('Inicia sesión con la cuenta administradora.');
        const response = await fetch('/api/admin/web-client-config', { headers: { Authorization: `Bearer ${await current.getIdToken()}` }, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar la configuración.');
        if (cancelled) return;
        setConfig(normalizeWebClientConfig(data.config));
        setMetaId(data.metaPhoneNumberId || '');
        setProjectId(data.firebaseProjectId || '');
        setTokenConfigured(Boolean(data.accessTokenConfigured));
        setReady(true);
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : 'No se pudo cargar la configuración.'); }
    })();
    return () => { cancelled = true; };
  }, []);

  function update<K extends keyof WebClientConfig>(key: K, value: WebClientConfig[K]) {
    setConfig(previous => ({ ...previous, [key]: value }));
  }

  async function uploadImage(file: File | undefined, field: 'logoUrl' | 'heroImageUrl') {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setMessage('Elige una imagen PNG, JPG o WebP de hasta 8 MB.'); return;
    }
    setUploading(true); setMessage('');
    try {
      const compressed = await compressProductImageClient(file);
      const extension = compressed.type === 'image/webp' ? 'webp' : compressed.type === 'image/png' ? 'png' : 'jpg';
      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await uploadFile(withPrefix('banners', `${field === 'logoUrl' ? 'logos' : 'portadas'}/${id}.${extension}`), compressed);
      update(field, result.url);
      setMessage('Imagen cargada. Guarda los cambios para publicarla.');
    } catch { setMessage('No se pudo subir la imagen. Revisa el acceso a Firebase Storage.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; if (heroFileRef.current) heroFileRef.current.value = ''; }
  }

  async function save() {
    const normalized = normalizeWebClientConfig({ ...config, supportPhone: config.supportPhone.replace(/\D/g, ''), botPhone: config.botPhone.replace(/\D/g, '') });
    const validation = validateWebClientConfig(normalized, metaId.trim());
    if (validation) { setMessage(validation); return; }
    if (!auth.currentUser || auth.currentUser.uid !== SUPREME_OWNER_UID) { setMessage('Inicia sesión con la cuenta administradora.'); return; }
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/web-client-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
        body: JSON.stringify({ config: normalized, metaPhoneNumberId: metaId.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
      setConfig(normalized);
      await refresh();
      setMessage('Configuración web guardada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Building2 size={20} /></span><div><h2 className="text-lg font-bold text-slate-900">Datos de la web</h2><p className="mt-1 text-sm text-slate-600">Identidad, contactos y portada de esta tienda.</p></div></div>
    <div className="mt-6 grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Nombre de la tienda<input className={inputClass} value={config.storeName} onChange={e => update('storeName', e.target.value)} disabled={!ready} maxLength={100} /></label>
      <label className="text-sm font-semibold text-slate-700">Dirección<input className={inputClass} value={config.address} onChange={e => update('address', e.target.value)} disabled={!ready} maxLength={200} /></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">URL pública de la tienda<input className={inputClass} value={config.siteUrl} onChange={e => update('siteUrl', e.target.value)} disabled={!ready} placeholder="https://mitienda.cl" type="url" /><span className="mt-1 block text-xs font-normal text-slate-500">Se usa en enlaces compartidos y es necesaria para procesar mensajes del bot.</span></label>
      <div className="sm:col-span-2"><label className="text-sm font-semibold text-slate-700">Logo de la tienda<input className={inputClass} value={config.logoUrl} onChange={e => update('logoUrl', e.target.value)} disabled={!ready} placeholder="URL de la imagen o súbela desde tu equipo" /></label><div className="mt-3 flex items-center gap-4">{config.logoUrl && <img src={config.logoUrl} alt="Vista previa del logo" className="h-16 w-16 rounded-xl border border-slate-200 object-contain" />}<button type="button" onClick={() => fileRef.current?.click()} disabled={!ready || uploading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />} {uploading ? 'Subiendo…' : 'Subir logo'}</button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void uploadImage(e.target.files?.[0], 'logoUrl')} /></div></div>
      <div className="sm:col-span-2"><label className="text-sm font-semibold text-slate-700">Imagen de portada<input className={inputClass} value={config.heroImageUrl} onChange={e => update('heroImageUrl', e.target.value)} disabled={!ready} placeholder="URL de la imagen o súbela desde tu equipo" /></label><div className="mt-3 flex items-center gap-4">{config.heroImageUrl && <img src={config.heroImageUrl} alt="Vista previa de la portada" className="h-16 w-28 rounded-xl border border-slate-200 object-cover" />}<button type="button" onClick={() => heroFileRef.current?.click()} disabled={!ready || uploading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><ImagePlus size={16} /> Subir portada</button><input ref={heroFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void uploadImage(e.target.files?.[0], 'heroImageUrl')} /></div></div>
      <label className="text-sm font-semibold text-slate-700">WhatsApp de atención<input className={inputClass} value={config.supportPhone} onChange={e => update('supportPhone', e.target.value)} disabled={!ready} placeholder="56985520703" inputMode="tel" /><span className="mt-1 block text-xs font-normal text-slate-500">Contacto para consultas; incluye código de país.</span></label>
      <label className="text-sm font-semibold text-slate-700">WhatsApp del bot<input className={inputClass} value={config.botPhone} onChange={e => update('botPhone', e.target.value)} disabled={!ready} placeholder="56954592656" inputMode="tel" /><span className="mt-1 block text-xs font-normal text-slate-500">Número al que se dirigen los pedidos por bot.</span></label>
      <label className="text-sm font-semibold text-slate-700">Texto de la franja superior<input className={inputClass} value={config.announcementText} onChange={e => update('announcementText', e.target.value)} disabled={!ready} maxLength={100} /></label>
      <label className="text-sm font-semibold text-slate-700">Texto de envíos<input className={inputClass} value={config.shippingText} onChange={e => update('shippingText', e.target.value)} disabled={!ready} maxLength={70} /></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Texto pequeño de portada<input className={inputClass} value={config.heroKicker} onChange={e => update('heroKicker', e.target.value)} disabled={!ready} maxLength={70} /></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Título de portada<input className={inputClass} value={config.heroTitle} onChange={e => update('heroTitle', e.target.value)} disabled={!ready} maxLength={160} /></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Descripción de portada<textarea className={inputClass} value={config.heroDescription} onChange={e => update('heroDescription', e.target.value)} disabled={!ready} maxLength={300} rows={2} /></label>
    </div>
    <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="font-bold text-slate-900">Conexión con Meta</h3><label className="mt-3 block text-sm font-semibold text-slate-700">Identificador del número de WhatsApp<input className={inputClass} value={metaId} onChange={e => setMetaId(e.target.value)} disabled={!ready} inputMode="numeric" placeholder="Identificador de número de teléfono" /></label><p className="mt-2 text-xs leading-5 text-slate-500">El token de acceso se configura en el servidor y debe corresponder a este número. Estado del token: {tokenConfigured ? 'configurado' : 'pendiente'}.</p></div>
    <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-900">Firebase de esta instalación:</strong> {projectId || 'Cargando…'}<p className="mt-1">Los productos y pedidos pertenecen a este proyecto. Para otro cliente se prepara otra copia y otro Firebase.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-semibold text-violet-700"><Link href="/admin/products-web">Gestionar catálogo →</Link><Link href="/admin/orders">Ver pedidos →</Link><Link href="/admin/pagos">Datos de pago →</Link></div></div>
    {message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}
    <button type="button" onClick={() => void save()} disabled={!ready || saving || uploading} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} /> {saving ? 'Guardando…' : 'Guardar datos web'}</button>
  </section>;
}
