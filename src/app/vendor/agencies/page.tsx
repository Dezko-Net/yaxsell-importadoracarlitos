'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Save, Search, Truck } from 'lucide-react';

type Agency = { id: string; name: string; color: string; bg: string; desc: string; logo: string };

export default function VendorAgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/vendor/agencies')
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cargar agencias');
        setAgencies(data.agencies || []);
        setSelectedIds(data.selectedIds || []);
      })
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => agencies.filter(a => a.name.toLowerCase().includes(query.toLowerCase())), [agencies, query]);
  const toggle = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/vendor/agencies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedIds }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      setSelectedIds(data.selectedIds || selectedIds);
      setMessage('Preferencias de agencias guardadas.');
    } catch (error: any) { setMessage(error.message || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-gray-500">Cargando agencias...</div>;

  return (
    <div className="min-h-0 max-w-3xl mx-auto space-y-5 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold text-gray-900">Agencias</h1><p className="text-sm text-gray-500 mt-1">Activa solo las agencias que quieres ofrecer a tus clientes.</p></div>
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold"><Truck className="w-4 h-4" /> {selectedIds.length} activas</div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar agencia..." className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" /></div>
        <div className="space-y-2">
          {visible.map(agency => {
            const active = selectedIds.includes(agency.id);
            return <button key={agency.id} type="button" onClick={() => toggle(agency.id)} className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition ${active ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shrink-0" style={{ background: agency.bg || '#f1f5f9' }}>{agency.logo ? <img src={agency.logo} alt="" className="w-full h-full object-contain" /> : <Truck className="w-5 h-5" style={{ color: agency.color }} />}</span>
              <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-gray-800">{agency.name}</span><span className="block text-xs text-gray-400 truncate">{agency.desc || 'Agencia de despacho'}</span></span>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-300'}`}>{active && <Check className="w-4 h-4" />}</span>
            </button>;
          })}
          {visible.length === 0 && <p className="py-8 text-center text-sm text-gray-400">No se encontraron agencias.</p>}
        </div>
      </div>
      {message && <p className={`text-sm ${message.includes('guardadas') ? 'text-emerald-600' : 'text-red-600'}`}>{message}</p>}
      <button onClick={save} disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Guardando...' : 'Guardar agencias'}</button>
    </div>
  );
}
