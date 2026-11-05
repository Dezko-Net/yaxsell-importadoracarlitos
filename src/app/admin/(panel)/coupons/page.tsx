'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, COUPONS_COLLECTION_ID } from '@/lib/db';
import { Plus, Pencil, Trash2, X, RefreshCw, AlertTriangle, Ticket, Copy, ToggleLeft, ToggleRight, CopyPlus, Search, Download } from 'lucide-react';

interface Coupon {
  $id: string;
  CODE: string;
  TYPE: 'percent' | 'fixed';
  VALUE: number;
  MINORDERAMOUNT?: number;
  MAXDISCOUNT?: number;
  ACTIVE: boolean;
  USEDCOUNT?: number;
  STARTAT?: number;
  ENDAT?: number;
  $createdAt: string;
  // Aliases for UI
  code: string;
  discountType: 'percent' | 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  isActive: boolean;
  usedCount?: number;
  expiresAt?: string;
  maxUses?: number;
  userRestriction?: string;
  description?: string;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; data: Partial<Coupon> } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'expiry' | 'uses' | 'discount'>('code');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired' | 'exhausted'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const bulkDelete = async () => {
    if (selected.size === 0 || !confirm(`¿Eliminar ${selected.size} cupón(es)?`)) return;
    setBulkDeleting(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all([...selected].map(id => databases.deleteDocument(databaseId, COUPONS_COLLECTION_ID, id)));
      setCoupons(prev => prev.filter(c => !selected.has(c.$id)));
      setSelected(new Set());
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBulkDeleting(false); }
  };

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const resp = await databases.listDocuments(databaseId, COUPONS_COLLECTION_ID, [
        Query.orderDesc('$createdAt'), Query.limit(100),
      ]);
      // Normalize attributes to aliases for UI
      const normalized = resp.documents.map((doc: any) => ({
        ...doc,
        code: doc.code,
        discountType: doc.type || 'percent',
        discountValue: doc.value || 0,
        minOrderAmount: doc.minOrderAmount,
        maxDiscount: doc.maxDiscount,
        usedCount: doc.usedCount || 0,
        maxUses: doc.maxUses,
        isActive: doc.isActive !== undefined ? doc.isActive : true,
        expiresAt: doc.expiresAt ? new Date(doc.expiresAt * 1000).toISOString() : undefined,
        userRestriction: doc.userRestriction,
        description: doc.description,
      }));
      setCoupons(normalized as unknown as Coupon[]);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const openAdd = () => setModal({ mode: 'add', data: { code: generateCode(), discountType: 'percent', discountValue: 10, isActive: true } });
  const openEdit = (c: Coupon) => setModal({ mode: 'edit', data: { ...c, expiresAt: c.expiresAt ? (typeof c.expiresAt === 'number' ? new Date(c.expiresAt * 1000).toISOString() : c.expiresAt) : undefined } });

  const save = async () => {
    if (!modal) return;
    const d = modal.data;
    if (!d.code?.trim()) { alert('El código es requerido'); return; }
    if (!d.discountValue || d.discountValue <= 0) { alert('El valor de descuento debe ser mayor a 0'); return; }
    setIsSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const payload: Record<string, any> = {
        code: d.code.toUpperCase().trim(),
        type: d.discountType || 'percent',
        value: Number(d.discountValue),
        isActive: d.isActive ?? true,
        userRestriction: d.userRestriction?.trim() || null,
        description: d.description?.trim() || null,
        minPurchase: d.minOrderAmount ? Number(d.minOrderAmount) : null,
      };
      if (d.maxUses) payload.maxUses = Number(d.maxUses);
      if (d.expiresAt) payload.expiresAt = Math.floor(new Date(d.expiresAt).getTime() / 1000);
      if (modal.mode === 'add') {
        const doc = await databases.createDocument(databaseId, COUPONS_COLLECTION_ID, ID.unique(), payload);
        const normalized = { ...doc, code: doc.code, discountType: doc.type || 'percent', discountValue: doc.value || 0, minOrderAmount: doc.minPurchase, isActive: doc.isActive !== undefined ? doc.isActive : true, expiresAt: doc.expiresAt || undefined, userRestriction: doc.userRestriction, description: doc.description };
        setCoupons(prev => [normalized as unknown as Coupon, ...prev]);
      } else {
        const doc = await databases.updateDocument(databaseId, COUPONS_COLLECTION_ID, (d as Coupon).$id, payload);
        const normalized = { ...doc, code: doc.code, discountType: doc.type || 'percent', discountValue: doc.value || 0, minOrderAmount: doc.minPurchase, isActive: doc.isActive !== undefined ? doc.isActive : true, expiresAt: doc.expiresAt || undefined, userRestriction: doc.userRestriction, description: doc.description };
        setCoupons(prev => prev.map(c => c.$id === (d as Coupon).$id ? normalized as unknown as Coupon : c));
      }
      setModal(null);
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setIsSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este cupón?')) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.deleteDocument(databaseId, COUPONS_COLLECTION_ID, id);
      setCoupons(prev => prev.filter(c => c.$id !== id));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const toggle = async (coupon: Coupon) => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, COUPONS_COLLECTION_ID, coupon.$id, { isActive: !coupon.isActive });
      setCoupons(prev => prev.map(c => c.$id === coupon.$id ? { ...c, isActive: !c.isActive } : c));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const duplicateCoupon = async (c: Coupon) => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const newCode = generateCode();
      const payload: Record<string, any> = {
        code: newCode,
        type: c.discountType,
        value: c.discountValue,
        isActive: false,
      };
      if (c.minOrderAmount) payload.minPurchase = Number(c.minOrderAmount);
      if (c.maxUses) payload.maxUses = Number(c.maxUses);
      if (c.description) payload.description = c.description + ' (Copia)';
      if (c.userRestriction) payload.userRestriction = c.userRestriction;
      const doc = await databases.createDocument(databaseId, COUPONS_COLLECTION_ID, ID.unique(), payload);
      const normalized = { ...doc, code: doc.code, discountType: doc.type || 'percent', discountValue: doc.value || 0, minOrderAmount: doc.minPurchase, maxUses: doc.maxUses, usedCount: doc.usedCount || 0, isActive: doc.isActive !== undefined ? doc.isActive : true, expiresAt: doc.expiresAt || undefined, userRestriction: doc.userRestriction, description: doc.description };
      setCoupons(prev => [normalized as unknown as Coupon, ...prev]);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (c: Coupon) => c.expiresAt ? new Date(c.expiresAt) < new Date() : false;

  const expiryLabel = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff < 0) return { text: 'Expirado', cls: 'text-red-600' };
    const d = Math.floor(diff / 86400000);
    if (d === 0) { const h = Math.floor(diff / 3600000); return { text: `${h}h`, cls: 'text-orange-600 font-semibold' }; }
    if (d <= 3) return { text: `${d}d`, cls: 'text-orange-500 font-semibold' };
    if (d <= 7) return { text: `${d}d`, cls: 'text-amber-600' };
    return { text: new Date(expiresAt).toLocaleDateString('es-CL'), cls: 'text-gray-500' };
  };

  const fmt = (c: Coupon) => (c.discountType === 'percent' || c.discountType === 'percentage') ? `-${c.discountValue}%` : `-$${c.discountValue.toLocaleString('es-CL')}`;

  const exportCSV = () => {
    const headers = ['Código', 'Tipo', 'Descuento', 'Mín. Pedido', 'Estado', 'Vence'];
    const rows = filtered.map(c => [
      c.code, (c.discountType === 'percent' || c.discountType === 'percentage') ? 'Porcentaje' : 'Fijo',
      c.discountValue, c.minOrderAmount || '',
      !c.isActive ? 'Inactivo' : isExpired(c) ? 'Expirado' : 'Activo',
      c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('es-CL') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `cupones_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = [...coupons.filter(c => {
    if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'active') return c.isActive && !isExpired(c);
    if (statusFilter === 'inactive') return !c.isActive;
    if (statusFilter === 'expired') return isExpired(c);
    return true;
  })].sort((a, b) => {
      if (sortBy === 'expiry') {
        const ta = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
        const tb = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
        return ta - tb;
      }
      if (sortBy === 'discount') return (b.discountValue || 0) - (a.discountValue || 0);
      return a.code.localeCompare(b.code);
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cupones de Descuento</h1>
          <p className="text-sm text-gray-500">{coupons.filter(c => c.isActive).length} activos · {coupons.length} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={filtered.length === 0} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
            <Download className="w-4 h-4" />CSV
          </button>
          <button onClick={load} disabled={isLoading} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition text-gray-600">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" /> Nuevo Cupón
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {!isLoading && coupons.length > 0 && (() => {
        const now = Date.now();
        const active = coupons.filter(c => c.isActive && (!c.expiresAt || new Date(c.expiresAt).getTime() > now));
        const expired = coupons.filter(c => c.expiresAt && new Date(c.expiresAt).getTime() <= now);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Activos', value: String(active.length), color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
              { label: 'Expirados', value: String(expired.length), color: 'bg-red-50 text-red-700 border-red-100' },
              { label: 'Total', value: String(coupons.length), color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
              { label: 'Con mínimo', value: String(coupons.filter(c => c.minOrderAmount).length), color: 'bg-amber-50 text-amber-700 border-amber-100' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-medium mt-0.5 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código..."
          className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-4 h-4" /></button>}
      </div>

      <div className="flex flex-wrap gap-2">
        {([['all','Todos'],['active','Activos'],['inactive','Inactivos'],['expired','Expirados']] as const).map(([v,l]) => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${statusFilter === v ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <span className="text-xs text-gray-500 self-center">Ordenar por:</span>
        {([['code', 'Código'], ['expiry', 'Expiración'], ['discount', 'Mayor descuento']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)}
            className={`px-3 py-1 rounded-xl text-xs font-medium transition ${sortBy === k ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm">
          <span className="text-indigo-700 font-medium">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          <button onClick={bulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition disabled:opacity-60">
            {bulkDeleting ? 'Eliminando...' : 'Eliminar seleccionados'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-indigo-600 hover:text-indigo-800 ml-auto">Cancelar</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(c => selected.has(c.$id))}
                    onChange={() => setSelected(s => filtered.every(c => s.has(c.$id)) ? new Set() : new Set(filtered.map(c => c.$id)))}
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Código</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Descuento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Vence</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>
              )) : coupons.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <Ticket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No hay cupones creados</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-gray-400 text-sm">Sin resultados para «{search}»</p>
                </td></tr>
              ) : filtered.map(c => {
                const expired = isExpired(c);
                const used = !c.isActive && (c.usedCount || 0) > 0;
                const status = used ? 'used' : !c.isActive ? 'inactive' : expired ? 'expired' : 'active';
                const statusCfg = {
                  active:    { label: 'Activo',    bg: 'bg-emerald-100', text: 'text-emerald-700' },
                  inactive:  { label: 'Inactivo',  bg: 'bg-gray-100',    text: 'text-gray-500' },
                  expired:   { label: 'Expirado',  bg: 'bg-red-100',     text: 'text-red-700' },
                  used:      { label: 'Usado',     bg: 'bg-blue-100',    text: 'text-blue-700' },
                }[status];
                return (
                  <tr key={c.$id} className={`hover:bg-gray-50 transition-colors ${selected.has(c.$id) ? 'bg-indigo-50/60' : ''}`}>
                    <td className="px-4 py-3 w-8">
                      <input type="checkbox" checked={selected.has(c.$id)}
                        onChange={() => setSelected(s => { const n = new Set(s); n.has(c.$id) ? n.delete(c.$id) : n.add(c.$id); return n; })}
                        className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-sm font-bold tracking-wider">{c.code}</code>
                        <button onClick={() => copyCode(c.code)} className="text-gray-400 hover:text-indigo-600 transition" title="Copiar código">
                          {copied === c.code ? <span className="text-xs text-emerald-600">✓</span> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        {status === 'active' && c.expiresAt && (() => {
                          const daysLeft = Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000);
                          if (daysLeft <= 3 && daysLeft > 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-500 text-white rounded-full">{daysLeft}d</span>;
                          return null;
                        })()}
                      </div>
                      {c.minOrderAmount ? <p className="text-xs text-gray-400 mt-0.5">Mínimo ${c.minOrderAmount.toLocaleString('es-CL')}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-red-600">{fmt(c)}</td>
                    <td className="px-4 py-3 text-xs hidden md:table-cell">
                      {c.expiresAt ? (() => { const el = expiryLabel(c.expiresAt); return <span className={el.cls}>{el.text}</span>; })() : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>{statusCfg.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggle(c)} className="p-1.5 rounded-lg hover:bg-gray-100 transition" title={c.isActive ? 'Desactivar' : 'Activar'}>
                          {c.isActive ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                        </button>
                        <button onClick={() => duplicateCoupon(c)} className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-400 hover:text-violet-600 transition" title="Duplicar"><CopyPlus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remove(c.$id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (() => {
          const now = Date.now();
          const active = filtered.filter(c => c.isActive && (!c.expiresAt || new Date(c.expiresAt).getTime() > now)).length;
          const expired = filtered.filter(c => c.expiresAt && new Date(c.expiresAt).getTime() <= now).length;
          return (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
              <span><span className="font-semibold text-gray-700">{filtered.length}</span> cupones</span>
              {active > 0 && <span className="text-emerald-600 font-medium">{active} activos</span>}
              {expired > 0 && <span className="text-gray-400">{expired} expirados</span>}
            </div>
          );
        })()}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{modal.mode === 'add' ? 'Nuevo Cupón' : 'Editar Cupón'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
                <div className="flex gap-2">
                  <input type="text" value={modal.data.code || ''} placeholder="VERANO20"
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, code: e.target.value.toUpperCase() } } : m)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button type="button"
                    onClick={() => setModal(m => m ? { ...m, data: { ...m.data, code: generateCode() } } : m)}
                    className="px-3 py-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition shrink-0">
                    Generar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select value={modal.data.discountType || 'percent'}
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, discountType: e.target.value as 'percent' | 'fixed' } } : m)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="percent">Porcentaje (%)</option>
                    <option value="fixed">Monto fijo ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valor *</label>
                  <input type="number" min="0" value={modal.data.discountValue ?? ''}
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, discountValue: Number(e.target.value) } } : m)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mínimo de compra ($)</label>
                  <input type="number" min="0" value={modal.data.minOrderAmount ?? ''}
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, minOrderAmount: e.target.value ? Number(e.target.value) : undefined } } : m)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Máx Usos</label>
                  <input type="number" min="0" value={modal.data.maxUses ?? ''} placeholder="Ilimitado"
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, maxUses: e.target.value ? Number(e.target.value) : undefined } } : m)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de expiración</label>
                  <input type="date" value={modal.data.expiresAt?.slice(0, 10) || ''}
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, expiresAt: e.target.value } } : m)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Usuario (ID o email)</label>
                  <input type="text" value={modal.data.userRestriction || ''} placeholder="Opcional"
                    onChange={e => setModal(m => m ? { ...m, data: { ...m.data, userRestriction: e.target.value } } : m)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <input type="text" value={modal.data.description || ''} placeholder="Opcional"
                  onChange={e => setModal(m => m ? { ...m, data: { ...m.data, description: e.target.value } } : m)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="couponActive" checked={modal.data.isActive ?? true}
                  onChange={e => setModal(m => m ? { ...m, data: { ...m.data, isActive: e.target.checked } } : m)}
                  className="w-4 h-4 text-indigo-600 rounded" />
                <label htmlFor="couponActive" className="text-sm text-gray-700">Cupón activo</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={save} disabled={isSaving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60 flex items-center gap-2">
                {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
