'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, Save, Store } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import ServiceModuleSettings from '@/components/admin/ServiceModuleSettings';
import WebClientSettingsPanel from '@/components/admin/WebClientSettingsPanel';
import { invalidateStoreSettingsCache } from '@/hooks/useStoreSettings';
import { SUPREME_OWNER_UID, isSupremeOwner } from '@/lib/supreme-owner';

type InventoryMode = 'web_independent' | 'erp_integrated';

export default function SupremeWebPage() {
  const { user, isLoading } = useAuth();
  const allowed = isSupremeOwner(user?.id, user?.email);
  const [mode, setMode] = useState<InventoryMode>('web_independent');
  const [savedMode, setSavedMode] = useState<InventoryMode>('web_independent');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    fetch('/api/store-settings', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('No se pudo cargar la configuración.');
        return response.json();
      })
      .then(data => {
        if (!active) return;
        if (data.error) throw new Error('No se pudo cargar la configuración.');
        const value: InventoryMode = data.inventoryMode === 'erp_integrated' ? 'erp_integrated' : 'web_independent';
        setMode(value);
        setSavedMode(value);
        setReady(true);
      })
      .catch(error => { if (active) setMessage(error.message || 'No se pudo cargar la configuración.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed]);

  async function save() {
    if (!allowed || !auth.currentUser || auth.currentUser.uid !== SUPREME_OWNER_UID) return;
    setSaving(true);
    setMessage('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/store-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inventoryMode: mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la configuración.');
      setSavedMode(mode);
      invalidateStoreSettingsCache();
      setMessage('Configuración guardada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <main className="p-8 text-slate-500">Cargando configuración…</main>;
  if (!allowed) return <main className="p-8 text-slate-700"><LockKeyhole className="mb-3" /><h1 className="text-xl font-bold">Acceso restringido</h1><p className="mt-2">Este apartado está reservado para el administrador principal.</p></main>;

  return (
    <main className="min-h-full bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-700"><Store size={17} /> Mi Tienda</div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Supreme Web</h1>
          <p className="mt-2 text-sm text-slate-600">Configuración de la tienda web de esta instalación.</p>
        </header>

        <ServiceModuleSettings source="web" />

        <WebClientSettingsPanel />

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Conexión del inventario</h2>
          <p className="mt-1 text-sm text-slate-600">Elige si la tienda comparte existencias con el ERP.</p>
          <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Modo de inventario">
            {([
              ['web_independent', 'Web independiente', 'La web usa su propio stock.'],
              ['erp_integrated', 'Conjunto con ERP', 'La web y el ERP comparten stock.'],
            ] as const).map(([value, title, description]) => (
              <button type="button" key={value} role="radio" aria-checked={mode === value} onClick={() => setMode(value)} disabled={!ready || loading || saving} className={`rounded-xl border-2 p-4 text-left transition ${mode === value ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                <span className="block font-semibold">{title}</span><span className="mt-1 block text-sm text-slate-600">{description}</span>
              </button>
            ))}
          </div>
          {mode === 'web_independent' && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Si un producto aún no tiene stock web, se usa su stock existente como valor inicial.</p>}
          {message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}
          <button type="button" onClick={save} disabled={!ready || loading || saving || mode === savedMode} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} /> {saving ? 'Guardando…' : 'Guardar modo de inventario'}</button>
        </section>
      </div>
    </main>
  );
}
