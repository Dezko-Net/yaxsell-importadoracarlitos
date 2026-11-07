'use client';
import { useState } from 'react';
import { Database, Globe, Monitor } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useServiceModules } from '@/hooks/useServiceModules';
import type { ServiceModule } from '@/lib/module-access';
import { SUPREME_OWNER_UID, isSupremeOwner } from '@/lib/supreme-owner';

const options = [
  { key: 'web', name: 'Tienda web', icon: Globe },
  { key: 'erp', name: 'ERP', icon: Database },
  { key: 'pos', name: 'POS', icon: Monitor },
] as const;

export default function ServiceModuleSettings({ source }: { source: ServiceModule }) {
  const { user } = useAuth();
  const { modules, ready, error, refresh } = useServiceModules();
  const [busy, setBusy] = useState<ServiceModule | null>(null);
  const [message, setMessage] = useState('');
  const allowed = isSupremeOwner(user?.id, user?.email);
  if (!allowed) return null;

  async function toggle(key: ServiceModule) {
    if (key === source || !ready || busy || auth.currentUser?.uid !== SUPREME_OWNER_UID) return;
    setBusy(key);
    setMessage('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/module-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source, target: key, enabled: !modules[key] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar.');
      await refresh();
      window.dispatchEvent(new Event('yaxsell:services-changed'));
      setMessage('Servicios actualizados.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-slate-900">
    <h2 className="text-lg font-bold">Servicios de la tienda</h2>
    <p className="mt-1 text-sm text-slate-600">Activa o desactiva los otros servicios. El módulo actual permanece activo.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {options.map(({ key, name, icon: Icon }) => <div key={key} className="rounded-xl border border-slate-200 p-4">
        <Icon className="mb-3 text-violet-700" size={21} /><div className="font-semibold">{name}</div>
        <div className="mt-1 text-sm text-slate-600">{ready ? (modules[key] ? 'Activo' : 'Desactivado') : 'Consultando…'}</div>
        <button type="button" role="switch" aria-checked={modules[key]} aria-label={`${name}: ${modules[key] ? 'activo' : 'desactivado'}`} disabled={!ready || !!busy || key === source} onClick={() => void toggle(key)} className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${modules[key] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
          {key === source ? 'Módulo actual' : busy === key ? 'Guardando…' : modules[key] ? 'Desactivar' : 'Activar'}
        </button>
      </div>)}
    </div>
    {(message || error) && <p role="status" className="mt-4 text-sm text-slate-600">{message || error}</p>}
  </section>;
}
