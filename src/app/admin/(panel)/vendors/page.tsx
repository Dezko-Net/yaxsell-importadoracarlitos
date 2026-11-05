'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Copy, Check, Power, Store, KeyRound, ExternalLink, Upload, Loader2, Trash2 } from 'lucide-react';
import { auth, authReady } from '@/lib/firebase';

async function fetchVendorAdmin(input: RequestInfo | URL, init: RequestInit = {}) {
  await authReady;
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Inicia sesión como administrador para gestionar tiendas aliadas.');
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
}

interface VendorRow {
  $id: string;
  name: string;
  email: string;
  active: boolean;
  minPurchaseAmount: number;
  totalSold: number;
  orderCount: number;
  productCount: number;
  logoUrl?: string;
  brandColor?: string;
}

const emptyForm = {
  name: '', email: '', password: '', minPurchaseAmount: '',
  brandColor: '#f97316', brandSecondaryColor: '#fb923c', logoUrl: '', storeAddress: '', storePhone: '', storeEmail: '',
  bankAccountHolder: '', bankRut: '', bankName: '', bankAccountType: '', bankAccountNumber: '', bankEmail: '',
};

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n || 0);
}

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetTarget, setResetTarget] = useState<VendorRow | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetchVendorAdmin('/api/admin/vendors/upload-logo', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Error al subir el logo');
      }
      setForm(f => ({ ...f, logoUrl: data.imageUrl || data.url }));
    } catch (err: any) {
      setLogoError(err?.message || 'Error al subir la imagen');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchVendorAdmin('/api/admin/vendors');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar las tiendas aliadas.');
      setVendors(data.vendors || []);
    } catch (err: any) { setError(err?.message || 'No se pudieron cargar las tiendas aliadas.'); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError('Nombre y email son obligatorios'); return; }
    if (!form.password.trim() || form.password.trim().length < 4) { setError('La contraseña debe tener al menos 4 caracteres'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetchVendorAdmin('/api/admin/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setError(data?.error || 'Error al crear el vendedor'); setSaving(false); return; }
      setShowForm(false);
      setForm(emptyForm);
      setNewCredentials(data.credentials);
      await load();
    } catch {
      setError('Error de conexión');
    }
    setSaving(false);
  };

  const toggleActive = async (v: VendorRow) => {
    setVendors(prev => prev.map(x => x.$id === v.$id ? { ...x, active: !x.active } : x));
    try {
      const res = await fetchVendorAdmin(`/api/admin/vendors/${v.$id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !v.active }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar el estado de la tienda.');
    } catch (err: any) {
      setVendors(prev => prev.map(x => x.$id === v.$id ? { ...x, active: v.active } : x));
      alert(err?.message || 'No se pudo actualizar el estado.');
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (!resetPasswordValue.trim() || resetPasswordValue.trim().length < 4) {
      setResetError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    setResetSaving(true); setResetError('');
    try {
      const res = await fetchVendorAdmin(`/api/admin/vendors/${resetTarget.$id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: true, newPassword: resetPasswordValue.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setResetError(data?.error || 'Error al cambiar la contraseña');
        setResetSaving(false);
        return;
      }
      setNewCredentials({ email: resetTarget.email, password: resetPasswordValue.trim() });
      setResetTarget(null);
      setResetPasswordValue('');
    } catch {
      setResetError('Error de conexión');
    }
    setResetSaving(false);
  };

  const copyCreds = () => {
    if (!newCredentials) return;
    navigator.clipboard.writeText(`Email: ${newCredentials.email}\nContraseña: ${newCredentials.password}\nIngresa en: ${window.location.origin}/vendor/login`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const impersonate = async (v: VendorRow) => {
    try {
      const res = await fetchVendorAdmin('/api/vendor/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: v.$id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { alert(data?.error || 'Error al entrar al panel del vendedor'); return; }
      window.open('/vendor/products', '_blank');
    } catch {
      alert('Error de conexión');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Tiendas Aliadas</h1>
          <p className="text-xs sm:text-sm text-gray-500">Controla productos publicados, pedidos vendidos y total generado por cada vendor para liquidaciones.</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setError(''); setShowForm(true); }}
          className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm transition w-full sm:w-auto">
          <Plus className="w-4 h-4" /> Nuevo vendedor
        </button>
      </div>

      {!showForm && error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">Cargando...</div>
      ) : vendors.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-gray-100">
          <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aún no hay vendedores.</p>
        </div>
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs font-semibold">
                  <td className="px-4 py-3">Vendedor</td>
                  <td className="px-4 py-3">Productos</td>
                  <td className="px-4 py-3">Pedidos</td>
                  <td className="px-4 py-3">Total vendido</td>
                  <td className="px-4 py-3">Estado</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.$id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {v.logoUrl ? (
                          <img src={v.logoUrl} alt={v.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" style={{ border: `1.5px solid ${v.brandColor || '#e5e7eb'}` }} />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Store className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{v.name}</p>
                          <p className="text-xs text-gray-400 truncate">{v.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{v.productCount}</td>
                    <td className="px-4 py-3 text-gray-600">{v.orderCount}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatPrice(v.totalSold)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${v.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {v.active ? 'Activo' : 'Desactivado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => impersonate(v)} title="Ver panel del vendedor" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition"><ExternalLink className="w-4 h-4" /></button>
                        <button onClick={() => { setResetTarget(v); setResetPasswordValue(''); setResetError(''); }} title="Cambiar contraseña" className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => toggleActive(v)} title={v.active ? 'Desactivar' : 'Activar'} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"><Power className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {vendors.map(v => (
              <div key={v.$id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {v.logoUrl ? (
                      <img src={v.logoUrl} alt={v.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" style={{ border: `1.5px solid ${v.brandColor || '#e5e7eb'}` }} />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Store className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{v.name}</p>
                      <p className="text-xs text-gray-400 truncate">{v.email}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${v.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.active ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-xs text-gray-400">Productos</p>
                    <p className="text-sm font-semibold text-gray-900">{v.productCount}</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-xs text-gray-400">Pedidos</p>
                    <p className="text-sm font-semibold text-gray-900">{v.orderCount}</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-xs text-gray-400">Vendido</p>
                    <p className="text-sm font-semibold text-gray-900">{formatPrice(v.totalSold)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => impersonate(v)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold transition">
                    <ExternalLink className="w-3.5 h-3.5" /> Ver panel
                  </button>
                  <button onClick={() => { setResetTarget(v); setResetPasswordValue(''); setResetError(''); }} className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold transition">
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleActive(v)} className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${v.active ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mounted && showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 sm:p-6 max-h-[88vh] overflow-y-auto my-auto border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 sticky -top-5 sm:-top-6 bg-white pt-1 pb-3 z-10 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Nuevo vendedor</h2>
                <p className="text-xs text-gray-500">Registra una tienda aliada para que venda en la plataforma</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: IMPORTADORA CARLITOS"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email de acceso *</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="carlitos@gmail.com"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Contraseña *</label>
                <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Define la contraseña del vendedor"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Monto mínimo de compra (opcional)</label>
                <input type="number" value={form.minPurchaseAmount} onChange={e => setForm(f => ({ ...f, minPurchaseAmount: e.target.value }))}
                  placeholder="0 para sin mínimo"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* ── Identidad de la tienda con Upload de Logo ── */}
              <div className="pt-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">Identidad de la tienda</p>
                
                {/* Caja de subida de logo desde el PC */}
                <div className="bg-gray-50/80 border border-gray-200 rounded-2xl p-3.5 mb-3.5">
                  <div className="flex items-center gap-3.5">
                    {/* Previsualización del logo */}
                    <div
                      className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center bg-white shadow-xs overflow-hidden"
                      style={{ border: `2px solid ${form.brandColor || '#e5e7eb'}` }}
                    >
                      {form.logoUrl ? (
                        <img src={form.logoUrl} alt="Logo preview" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Store className="w-6 h-6 text-gray-300" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800">
                        {form.logoUrl ? 'Logo seleccionado' : 'Logo de la tienda'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Sube el logo desde tu computador (PNG, JPG o WebP)
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoUpload}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingLogo}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition active:scale-95 disabled:opacity-50"
                        >
                          {uploadingLogo ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Subiendo logo...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              <span>{form.logoUrl ? 'Cambiar logo desde PC' : 'Subir logo desde el PC'}</span>
                            </>
                          )}
                        </button>

                        {form.logoUrl && (
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, logoUrl: '' }))}
                            className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="Quitar logo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {logoError && (
                    <p className="text-xs text-red-600 mt-2 font-medium">{logoError}</p>
                  )}

                  {/* Input de URL directa opcional */}
                  <div className="mt-3 pt-2.5 border-t border-gray-200/60">
                    <input
                      placeholder="O escribe una URL directa de imagen (https://...)"
                      value={form.logoUrl}
                      onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 text-xs text-gray-600 bg-white">
                    Color principal <input type="color" value={form.brandColor} onChange={e => setForm(f => ({ ...f, brandColor: e.target.value }))} className="ml-auto w-8 h-8 border-0 cursor-pointer rounded" />
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 text-xs text-gray-600 bg-white">
                    Color secundario <input type="color" value={form.brandSecondaryColor} onChange={e => setForm(f => ({ ...f, brandSecondaryColor: e.target.value }))} className="ml-auto w-8 h-8 border-0 cursor-pointer rounded" />
                  </label>
                  <input placeholder="Dirección de la tienda" value={form.storeAddress} onChange={e => setForm(f => ({ ...f, storeAddress: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 sm:col-span-2" />
                  <input placeholder="Teléfono de la tienda" value={form.storePhone} onChange={e => setForm(f => ({ ...f, storePhone: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                  <input placeholder="Email público" value={form.storeEmail} onChange={e => setForm(f => ({ ...f, storeEmail: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                </div>
              </div>

              {/* ── Datos Bancarios ── */}
              <div className="pt-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">Datos bancarios (para que el cliente le transfiera a él)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input placeholder="Titular" value={form.bankAccountHolder} onChange={e => setForm(f => ({ ...f, bankAccountHolder: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                  <input placeholder="RUT" value={form.bankRut} onChange={e => setForm(f => ({ ...f, bankRut: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                  <input placeholder="Banco" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                  <input placeholder="Tipo de cuenta" value={form.bankAccountType} onChange={e => setForm(f => ({ ...f, bankAccountType: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                  <input placeholder="N° de cuenta" value={form.bankAccountNumber} onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                  <input placeholder="Email de aviso" value={form.bankEmail} onChange={e => setForm(f => ({ ...f, bankEmail: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400" />
                </div>
              </div>

              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
              
              <button onClick={handleCreate} disabled={saving}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md transition disabled:opacity-60 active:scale-[0.99]">
                {saving ? 'Creando vendedor...' : 'Crear vendedor'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mounted && newCredentials && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setNewCredentials(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 sm:p-6 my-auto border border-gray-100" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900 mb-1">Credenciales generadas</h2>
            <p className="text-xs text-gray-500 mb-4">Cópialas ahora — la contraseña no se puede volver a ver.</p>
            <div className="bg-gray-50 rounded-xl p-3.5 text-sm space-y-1.5 mb-4 border border-gray-200">
              <p><span className="text-gray-400">Email:</span> <span className="font-semibold text-gray-900">{newCredentials.email}</span></p>
              <p><span className="text-gray-400">Contraseña:</span> <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{newCredentials.password}</span></p>
              <p><span className="text-gray-400">Entrar en:</span> /vendor/login</p>
            </div>
            <button onClick={copyCreds} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm">
              {copied ? <><Check className="w-4 h-4" /> Copiado</> : <><Copy className="w-4 h-4" /> Copiar datos</>}
            </button>
          </div>
        </div>,
        document.body
      )}

      {mounted && resetTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setResetTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 sm:p-6 my-auto border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Cambiar contraseña</h2>
              <button onClick={() => setResetTarget(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Vendedor: <span className="font-semibold text-gray-700">{resetTarget.name}</span> ({resetTarget.email}). La contraseña anterior dejará de funcionar.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nueva contraseña *</label>
                <input type="text" value={resetPasswordValue} onChange={e => setResetPasswordValue(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {resetError && <p className="text-sm text-red-600">{resetError}</p>}
              <button onClick={resetPassword} disabled={resetSaving}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-60 shadow-sm">
                {resetSaving ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
