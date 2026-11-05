'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Plus, Save, Trash2, CheckCircle, Edit2, X, GripVertical, RefreshCw, Box, AlertTriangle, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isAdminEmail } from '@/lib/admin-access';

interface Agency {
  id: string;
  name: string;
  color: string;
  bg: string;
  desc: string;
  logo: string;
  active: boolean;
}

const DEFAULTS: Agency[] = [
  { id: 'default-0', name: 'RETIRO EN TIENDA',  color: '#e65c00', bg: '#fff3e0', desc: 'Retiro en Chacabuco 08, Estación Central (Al lado de Carnicería El Carnicero)',  logo: '', active: true },
  { id: 'default-1', name: 'STARKEN',          color: '#1a7f37', bg: '#e6f4ea', desc: 'Tarifa económica - Cobertura Nacional',   logo: 'https://www.starken.cl/static/media/logo-q100.bac31f50de7b41338e6c.webp', active: true },
  { id: 'default-2', name: 'PULLMAN CARGO',    color: '#002855', bg: '#e6f0fa', desc: 'Tarifa económica - Ideal para cajas grandes', logo: '', active: true },
  { id: 'default-3', name: 'VARMONTT',         color: '#c62828', bg: '#fce8e6', desc: 'Tarifa económica - Especialistas al Sur de Chile', logo: 'https://varmontt.cl/wp-content/uploads/2020/03/logo_varmontt-trans.png', active: true },
  { id: 'default-4', name: 'CORREOS DE CHILE', color: '#da291c', bg: '#fce8e6', desc: 'Tarifa media - Excelente cobertura rural', logo: '', active: true },
  { id: 'default-5', name: 'BLUEXPRESS',       color: '#1558b0', bg: '#e8f0fe', desc: 'Tarifa media/alta - Entrega express',    logo: '', active: true },
  { id: 'default-6', name: 'CHILEXPRESS',      color: '#ffc600', bg: '#fffde6', desc: 'Tarifa alta - La más rápida del mercado', logo: '', active: true },
];

const EMPTY_AGENCY: Omit<Agency, 'id'> = {
  name: '', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: '', active: true,
};

export default function AgenciasPage() {
  const router = useRouter();
  const { user, isLoggedIn, isLoading: authLoading, logout } = useAuth();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<Omit<Agency, 'id'> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { router.replace('/admin/login'); return; }
    if (!isAdminEmail(user?.email)) { logout().finally(() => router.replace('/admin/login')); }
  }, [authLoading, isLoggedIn, user?.email, router, logout]);

  const loadAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agencies');
      const data = await res.json();
      if (data.agencies && data.agencies.length > 0) {
        setAgencies(data.agencies);
      } else {
        setAgencies(DEFAULTS);
      }
    } catch {
      setAgencies(DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/agencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencies }),
      });
      const data = await res.json();
      if (data.success && data.agencies) {
        setAgencies(data.agencies);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Error al guardar: ' + (e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  function toggleActive(id: string) {
    setAgencies(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  }

  function deleteAgency(id: string) {
    if (!confirm('¿Eliminar esta agencia?')) return;
    setAgencies(prev => prev.filter(a => a.id !== id));
  }

  function updateField(id: string, key: keyof Agency, val: string | boolean) {
    setAgencies(prev => prev.map(a => a.id === id ? { ...a, [key]: val } : a));
  }

  function addAgency() {
    if (!newForm?.name.trim()) return;
    const agency: Agency = { ...newForm, id: Date.now().toString(), name: newForm.name.trim().toUpperCase() };
    setAgencies(prev => [...prev, agency]);
    setNewForm(null);
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide';

  if (authLoading) return null;

  return (
    <div className="max-w-[900px] mx-auto space-y-6 pb-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Agencias de Envío</h1>
            <p className="text-sm text-gray-400">Configura los transportistas disponibles en checkout</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={() => {
              if (confirm('¿Estás seguro de querer sobreescribir las agencias actuales con las de por defecto? Tendrás que presionar Guardar después.')) {
                setAgencies(DEFAULTS);
              }
            }} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition disabled:opacity-50">
              <RefreshCw className="w-4 h-4" />
              Cargar por Defecto
            </button>
            <button onClick={loadAgencies} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </button>
            <button onClick={handleSave} disabled={saving}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition shadow-sm ${saved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:opacity-60`}>
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</>
            ) : saved ? (
              <><CheckCircle className="w-4 h-4" />Guardado</>
            ) : (
              <><Save className="w-4 h-4" />Guardar Cambios</>
            )}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Cargando agencias...</p>
        </div>
      )}

      {/* Agency list */}
      {!loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-gray-400" />
              <p className="font-semibold text-gray-900 text-sm">Transportistas Activos</p>
            </div>
          </div>
          
          <div className="divide-y divide-gray-50">
            {agencies.map(agency => (
              <div key={agency.id || agency.name} className="group transition-colors hover:bg-gray-50/50">
                {editing === agency.id ? (
                  /* ── Edit mode ── */
                  <div className="p-6 space-y-4 bg-indigo-50/30 border-l-4 border-indigo-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={lbl}>Nombre</label>
                        <input value={agency.name} onChange={e => updateField(agency.id, 'name', e.target.value.toUpperCase())}
                          className={inp} placeholder="NOMBRE AGENCIA" />
                      </div>
                      <div>
                        <label className={lbl}>Descripción</label>
                        <input value={agency.desc} onChange={e => updateField(agency.id, 'desc', e.target.value)}
                          className={inp} placeholder="Breve descripción" />
                      </div>
                      <div className="md:col-span-2">
                        <label className={lbl}>Logo de la agencia</label>
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                            {agency.logo
                              ? <img src={agency.logo} alt="preview" className="w-full h-full object-contain" />
                              : <Truck className="w-6 h-6 text-gray-300" />}
                          </div>
                          <input value={agency.logo} onChange={e => updateField(agency.id, 'logo', e.target.value)}
                            className={`${inp} flex-1`} placeholder="Pega URL o sube archivo..." />
                          <label className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold cursor-pointer transition">
                            <Upload className="w-3.5 h-3.5" />
                            Subir
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => updateField(agency.id, 'logo', reader.result as string);
                              reader.readAsDataURL(file);
                            }} />
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 md:col-span-2">
                        <div>
                          <label className={lbl}>Color texto</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={agency.color} onChange={e => updateField(agency.id, 'color', e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 shadow-sm" />
                            <input value={agency.color} onChange={e => updateField(agency.id, 'color', e.target.value)}
                              className={`${inp} flex-1`} placeholder="#000000" />
                          </div>
                        </div>
                        <div>
                          <label className={lbl}>Color fondo</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={agency.bg} onChange={e => updateField(agency.id, 'bg', e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 shadow-sm" />
                            <input value={agency.bg} onChange={e => updateField(agency.id, 'bg', e.target.value)}
                              className={`${inp} flex-1`} placeholder="#ffffff" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setEditing(null)}
                        className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white text-gray-600 font-medium transition shadow-sm">
                        Cancelar
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition shadow-sm">
                        Listo
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <div className="flex items-center gap-4 p-5">
                    <GripVertical className="w-5 h-5 text-gray-300 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition" />
                    <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm bg-white">
                      {agency.logo
                        ? <img src={agency.logo} alt={agency.name} className="w-9 h-9 object-contain mix-blend-multiply" />
                        : <Truck className="w-6 h-6" style={{ color: agency.color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-bold text-gray-900 tracking-tight">{agency.name}</span>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider" style={{ background: agency.bg, color: agency.color }}>
                          Badge Demo
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{agency.desc || '—'}</p>
                    </div>
                    <button onClick={() => toggleActive(agency.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${agency.active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {agency.active ? 'Activo' : 'Inactivo'}
                    </button>
                    <div className="flex items-center gap-1 border-l border-gray-100 pl-4 ml-2">
                      <button onClick={() => setEditing(agency.id)}
                        className="p-2 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteAgency(agency.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* ── New agency form ── */}
            {newForm !== null ? (
              <div className="p-6 bg-emerald-50/30 border-t border-emerald-100 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-bold text-gray-900">Agregar Nueva Agencia</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Nombre *</label>
                    <input value={newForm.name} onChange={e => setNewForm(f => f && ({ ...f, name: e.target.value.toUpperCase() }))}
                      className={inp} placeholder="NOMBRE AGENCIA" autoFocus />
                  </div>
                  <div>
                    <label className={lbl}>Descripción</label>
                    <input value={newForm.desc} onChange={e => setNewForm(f => f && ({ ...f, desc: e.target.value }))}
                      className={inp} placeholder="Breve descripción" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={lbl}>Logo de la agencia</label>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                        {newForm.logo
                          ? <img src={newForm.logo} alt="preview" className="w-full h-full object-contain" />
                          : <Truck className="w-6 h-6 text-gray-300" />}
                      </div>
                      <input value={newForm.logo} onChange={e => setNewForm(f => f && ({ ...f, logo: e.target.value }))}
                        className={`${inp} flex-1`} placeholder="Pega URL o sube archivo..." />
                      <label className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl text-xs font-bold cursor-pointer transition">
                        <Upload className="w-3.5 h-3.5" />
                        Subir
                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setNewForm(f => f && ({ ...f, logo: reader.result as string }));
                          reader.readAsDataURL(file);
                        }} />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <div>
                      <label className={lbl}>Color texto</label>
                      <div className="flex gap-2">
                        <input type="color" value={newForm.color} onChange={e => setNewForm(f => f && ({ ...f, color: e.target.value }))}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 shrink-0 shadow-sm" />
                        <input value={newForm.color} onChange={e => setNewForm(f => f && ({ ...f, color: e.target.value }))}
                          className={`${inp} flex-1`} />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>Color fondo</label>
                      <div className="flex gap-2">
                        <input type="color" value={newForm.bg} onChange={e => setNewForm(f => f && ({ ...f, bg: e.target.value }))}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 shrink-0 shadow-sm" />
                        <input value={newForm.bg} onChange={e => setNewForm(f => f && ({ ...f, bg: e.target.value }))}
                          className={`${inp} flex-1`} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setNewForm(null)}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white text-gray-600 font-medium transition shadow-sm">
                    Cancelar
                  </button>
                  <button onClick={addAgency}
                    className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold transition shadow-sm">
                    Agregar Agencia
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setNewForm({ ...EMPTY_AGENCY })}
                className="w-full flex items-center justify-center gap-2 p-5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-dashed border-gray-200">
                <Plus className="w-5 h-5" />
                Añadir Transportista
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-4 flex items-start gap-3">
        <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm text-amber-800 font-semibold mb-0.5">Recuerda guardar los cambios</p>
          <p className="text-xs text-amber-700/80 leading-relaxed">
            Cualquier modificación que hagas a los transportistas (editar, eliminar o cambiar estado) no será visible en el checkout hasta que presiones el botón de <strong>Guardar Cambios</strong> en la parte superior.
          </p>
        </div>
      </div>
    </div>
  );
}
