'use client';

import { useEffect, useState } from 'react';
import { Save, Image as ImageIcon, Store, Upload } from 'lucide-react';
import { getServices, MEDIA_BUCKET_ID, ID } from '@/lib/db';
import { useVendor } from '@/hooks/useVendor';

type Profile = { name: string; email: string; brandColor: string; brandSecondaryColor: string; logoUrl: string; storeAddress: string; storePhone: string; storeEmail: string };
const EMPTY: Profile = { name: '', email: '', brandColor: '#f97316', brandSecondaryColor: '#fb923c', logoUrl: '', storeAddress: '', storePhone: '', storeEmail: '' };

export default function VendorSettingsPage() {
  const vendor = useVendor();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [uploadingLogo, setUploadingLogo] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    fetch('/api/vendor/profile')
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || 'No se pudo cargar el perfil.');
        setProfile({ ...EMPTY, ...(data.vendor || {}) });
      })
      .catch((err: any) => setMessage(err?.message || 'No se pudo cargar el perfil.'))
      .finally(() => setLoading(false));
  }, []);
  const set = (key: keyof Profile, value: string) => setProfile(p => ({ ...p, [key]: value }));
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage('Selecciona una imagen válida.'); return; }
    setUploadingLogo(true); setMessage('');
    try {
      const { storage } = getServices(); const fileId = `${vendor?.vendorId || 'vendor'}/branding/${ID.unique()}`;
      const uploaded = await storage.createFile(MEDIA_BUCKET_ID, fileId, file);
      set('logoUrl', uploaded.url);
      setMessage('Logo cargado. Guarda el perfil para confirmar.');
    } catch { setMessage('No se pudo subir el logo.'); }
    finally { setUploadingLogo(false); }
  };
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/vendor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
      const data = await res.json().catch(() => null);
      setMessage(res.ok ? 'Perfil guardado correctamente.' : (data?.error || 'No se pudo guardar.'));
    } catch { setMessage('Error de conexión al guardar el perfil.'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="py-10 text-center text-sm text-gray-500">Cargando perfil...</div>;
  return <div className="min-h-0 max-w-3xl mx-auto space-y-5 pb-8">
    <div><h1 className="text-xl font-bold text-gray-900">Identidad de mi tienda</h1><p className="text-sm text-gray-500 mt-1">Estos datos aparecerán en tus pedidos, etiquetas y documentos PDF.</p></div>
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: profile.brandColor }}><Store className="w-5 h-5 text-white" /></div><div><p className="font-bold text-gray-900">{profile.name || 'Mi tienda'}</p><p className="text-xs text-gray-400">{profile.email}</p></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-semibold text-gray-600">Color principal<div className="mt-1 aspect-square w-16 sm:w-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><input type="color" value={profile.brandColor} onChange={e => set('brandColor', e.target.value)} className="block h-full w-full cursor-pointer border-0 p-0" /></div><span className="mt-1 block font-mono text-[11px] text-gray-400">{profile.brandColor}</span></label>
        <label className="text-xs font-semibold text-gray-600">Color secundario<div className="mt-1 aspect-square w-16 sm:w-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><input type="color" value={profile.brandSecondaryColor} onChange={e => set('brandSecondaryColor', e.target.value)} className="block h-full w-full cursor-pointer border-0 p-0" /></div><span className="mt-1 block font-mono text-[11px] text-gray-400">{profile.brandSecondaryColor}</span></label>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">Logo de la tienda</p>
        <label className="min-h-28 w-full rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition flex flex-col items-center justify-center gap-2 cursor-pointer text-center px-4">
          <Upload className="w-6 h-6 text-gray-400" />
          <span className="text-sm font-bold text-gray-700">{uploadingLogo ? 'Subiendo logo...' : 'Seleccionar logo desde el dispositivo'}</span>
          <span className="text-[11px] text-gray-400">Compatible con celular · PNG, JPG o SVG</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" disabled={uploadingLogo} onChange={e => { void uploadLogo(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <label className="block text-[11px] font-medium text-gray-500">O pega una URL<input value={profile.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://..." className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" /></label>
      </div>
      {profile.logoUrl && <div className="h-24 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center"><img src={profile.logoUrl} alt="Logo" className="max-h-20 max-w-[240px] object-contain" /></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([['storeAddress', 'Dirección de la tienda'], ['storePhone', 'Teléfono público'], ['storeEmail', 'Email público']] as const).map(([key, label]) => <label key={key} className="text-xs font-semibold text-gray-600">{label}<input value={profile[key]} onChange={e => set(key, e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" /></label>)}
      </div>
      {message && <p role="status" className={`text-sm ${message.startsWith('Perfil') || message.startsWith('Logo cargado') ? 'text-emerald-600' : 'text-red-600'}`}>{message}</p>}
      <button onClick={save} disabled={saving} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60" style={{ background: profile.brandColor }}><Save className="w-4 h-4" />{saving ? 'Guardando...' : 'Guardar identidad'}</button>
    </div>
  </div>;
}
