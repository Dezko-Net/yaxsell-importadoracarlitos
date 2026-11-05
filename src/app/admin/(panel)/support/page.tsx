'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, SUPPORT_TICKETS_COLLECTION_ID } from '@/lib/db';
import { SupportTicket } from '@/types/admin';
import { RefreshCw, AlertTriangle, HeadphonesIcon, MessageCircle, ChevronDown, Send, Search, X, Download, Clock, LifeBuoy, Plus, Edit2, Save } from 'lucide-react';

const STATUS_CFG = {
  open:        { label: 'Abierto',      bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  in_progress: { label: 'En proceso',   bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  closed:      { label: 'Cerrado',      bg: 'bg-gray-100',    text: 'text-gray-500',    border: 'border-gray-200' },
};

const PRIORITY_CFG = {
  low:    { label: 'Baja',   bg: 'bg-gray-100',    text: 'text-gray-600',  dot: 'bg-gray-400' },
  medium: { label: 'Media',  bg: 'bg-amber-100',   text: 'text-amber-700', dot: 'bg-amber-500' },
  high:   { label: 'Alta',   bg: 'bg-red-100',     text: 'text-red-700',   dot: 'bg-red-500' },
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [bulkClosing, setBulkClosing] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'priority' | 'status'>('date');

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const queries = [Query.orderDesc('$createdAt'), Query.limit(100)];
      if (filter !== 'all') queries.push(Query.equal('status', filter));
      const resp = await databases.listDocuments(databaseId, SUPPORT_TICKETS_COLLECTION_ID, queries);
      setTickets(resp.documents as unknown as SupportTicket[]);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const saveNote = async (id: string) => {
    if (!editingNote || editingNote.id !== id) return;
    setSavingNoteId(id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, SUPPORT_TICKETS_COLLECTION_ID, id, { adminNotes: editingNote.text });
      setTickets(prev => prev.map(t => t.$id === id ? { ...t, adminNotes: editingNote.text } as SupportTicket : t));
      setEditingNote(null);
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setSavingNoteId(null); }
  };

  const updatePriority = async (id: string, priority: string) => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, SUPPORT_TICKETS_COLLECTION_ID, id, { priority });
      setTickets(prev => prev.map(t => t.$id === id ? { ...t, priority: priority as SupportTicket['priority'] } : t));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const bulkCloseAll = async () => {
    const openTickets = filtered.filter(t => t.status !== 'closed');
    if (openTickets.length === 0 || !confirm(`¿Cerrar ${openTickets.length} ticket(s) abiertos?`)) return;
    setBulkClosing(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all(openTickets.map(t => databases.updateDocument(databaseId, SUPPORT_TICKETS_COLLECTION_ID, t.$id, { status: 'closed' })));
      setTickets(prev => prev.map(t => openTickets.some(o => o.$id === t.$id) ? { ...t, status: 'closed' } : t));
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBulkClosing(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, SUPPORT_TICKETS_COLLECTION_ID, id, { status });
      setTickets(prev => prev.map(t => t.$id === id ? { ...t, status: status as SupportTicket['status'] } : t));
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setUpdatingId(null); }
  };

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const filtered = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(t.subject?.toLowerCase().includes(q) || t.message?.toLowerCase().includes(q) || t.userId?.toLowerCase().includes(q) || t.adminNotes?.toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority || 'low'] ?? 2) - (PRIORITY_ORDER[b.priority || 'low'] ?? 2);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    return new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime();
  });

  const exportCSV = () => {
    const headers = ['Asunto', 'Usuario ID', 'Estado', 'Prioridad', 'Antigüedad (días)', 'Notas Admin', 'Fecha'];
    const rows = filtered.map(t => [
      t.subject || '',
      t.userId || '',
      STATUS_CFG[t.status]?.label || t.status,
      PRIORITY_CFG[t.priority as keyof typeof PRIORITY_CFG]?.label || t.priority || '',
      Math.floor((Date.now() - new Date(t.$createdAt).getTime()) / 86400000),
      t.adminNotes || '',
      new Date(t.$createdAt).toLocaleString('es-CL'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `soporte_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m`;
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-6 pb-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <LifeBuoy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Centro de Soporte</h1>
            <p className="text-sm text-gray-400">Gestiona y resuelve las consultas de tus clientes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={filtered.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition shadow-sm disabled:opacity-50">
            <Download className="w-4 h-4" />Exportar CSV
          </button>
          {filtered.some(t => t.status !== 'closed') && (
            <button onClick={bulkCloseAll} disabled={bulkClosing}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition shadow-sm disabled:opacity-60">
              {bulkClosing ? 'Cerrando...' : `Cerrar Abiertos (${filtered.filter(t => t.status !== 'closed').length})`}
            </button>
          )}
          <button onClick={load} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />Actualizar
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['open', 'in_progress', 'closed'] as const).map(s => {
          const cfg = STATUS_CFG[s];
          const count = tickets.filter(t => t.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`bg-white rounded-2xl border p-5 text-left shadow-sm hover:shadow-md transition-all relative overflow-hidden group ${filter === s ? 'border-indigo-400 ring-4 ring-indigo-50' : 'border-gray-100'}`}>
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${cfg.bg} opacity-20 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110`} />
              <p className="text-3xl font-black text-gray-900 mb-1">{count}</p>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${s === 'open' ? 'bg-emerald-500' : s === 'in_progress' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                <span className={`text-sm font-semibold text-gray-600`}>{cfg.label}</span>
              </div>
            </button>
          );
        })}
        {(() => {
          const closed = tickets.filter(t => t.status === 'closed' && t.$updatedAt && t.$createdAt);
          if (closed.length === 0) return null;
          const avgMs = closed.reduce((s, t) => s + (new Date(t.$updatedAt).getTime() - new Date(t.$createdAt).getTime()), 0) / closed.length;
          const avgH = Math.round(avgMs / 3600000);
          return (
            <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5 shadow-sm">
              <p className="text-3xl font-black text-indigo-900 mb-1">{avgH < 24 ? `${avgH}h` : `${Math.round(avgH / 24)}d`}</p>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-sm font-semibold text-indigo-700">Tiempo de Cierre</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Priority Bar */}
      {!isLoading && tickets.length > 0 && (() => {
        const high = tickets.filter(t => t.priority === 'high').length;
        const medium = tickets.filter(t => t.priority === 'medium').length;
        const low = tickets.filter(t => t.priority === 'low').length;
        const total = tickets.length;
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Distribución por Prioridad</p>
              <div className="flex gap-4">
                {[['Alta', high, 'text-red-600', 'bg-red-500'], ['Media', medium, 'text-amber-600', 'bg-amber-500'], ['Baja', low, 'text-gray-500', 'bg-gray-400']] .map(([l, c, cls, dot]) => (
                  <div key={l as string} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className={`text-xs font-bold ${cls}`}>{l} <span className="opacity-60 font-medium">({c})</span></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
              {high > 0 && <div className="bg-red-500 hover:opacity-80 transition-all" style={{ width: `${(high / total) * 100}%` }} title={`Alta: ${high}`} />}
              {medium > 0 && <div className="bg-amber-500 hover:opacity-80 transition-all" style={{ width: `${(medium / total) * 100}%` }} title={`Media: ${medium}`} />}
              {low > 0 && <div className="bg-gray-400 hover:opacity-80 transition-all" style={{ width: `${(low / total) * 100}%` }} title={`Baja: ${low}`} />}
            </div>
          </div>
        );
      })()}

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por asunto, mensaje o usuario..."
            className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1 shrink-0">Ordenar:</span>
          {([['date','Recientes'],['priority','Prioridad'],['status','Estado']] as const).map(([v,l]) => (
            <button key={v} onClick={() => setSortBy(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${sortBy === v ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium flex items-center gap-2"><AlertTriangle className="w-5 h-5 shrink-0" />{error}</div>}

      {/* Tickets List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-gray-50 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <HeadphonesIcon className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-900 font-bold mb-1">No hay tickets</p>
            <p className="text-gray-500 text-sm">No se encontraron conversaciones con los filtros actuales.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(t => {
              const stCfg = STATUS_CFG[t.status] || STATUS_CFG.open;
              const prCfg = PRIORITY_CFG[t.priority || 'low'];
              const isOpen = expanded === t.$id;
              
              return (
                <div key={t.$id} className={`transition-colors ${isOpen ? 'bg-indigo-50/30' : 'hover:bg-gray-50/50'}`}>
                  <button onClick={() => setExpanded(isOpen ? null : t.$id)}
                    className="w-full flex items-start gap-4 p-5 text-left relative">
                    
                    {/* Priority indicator line */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-transparent'}`} />
                    
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-1">
                      <MessageCircle className="w-5 h-5 text-indigo-400" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <p className="font-bold text-gray-900 text-base truncate pr-2">{t.subject}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${stCfg.bg} ${stCfg.text} ${stCfg.border}`}>{stCfg.label}</span>
                        <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-transparent ${prCfg.bg} ${prCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${prCfg.dot}`} />
                          {prCfg.label}
                        </div>
                        {t.status !== 'closed' && (Date.now() - new Date(t.$createdAt).getTime()) > 2 * 86400000 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-orange-500 text-white rounded-md shadow-sm animate-pulse">
                            {Math.floor((Date.now() - new Date(t.$createdAt).getTime()) / 86400000)}d esperando
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-1 mb-2">{t.message}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-400 font-medium">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />hace {timeAgo(t.$createdAt)}</span>
                        <span>·</span>
                        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">ID: {t.userId ? t.userId.slice(0, 8) : 'Anónimo'}</span>
                        {(t as any).adminReplies > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">
                              {(t as any).adminReplies} Respuestas
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="shrink-0 ml-4 mt-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                        <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isOpen && (
                    <div className="px-5 pb-6 pt-2 ml-14 border-t border-dashed border-indigo-100">
                      
                      {/* Message Content */}
                      <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 relative">
                        <div className="absolute -top-2.5 left-6 w-5 h-5 bg-white border-l border-t border-gray-200 rotate-45" />
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed relative z-10">{t.message}</p>
                      </div>
                      
                      {/* Action Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Status Change */}
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Actualizar Estado</p>
                          <div className="flex flex-wrap gap-2">
                            {(['open', 'in_progress', 'closed'] as const).map(s => {
                              const sCfg = STATUS_CFG[s];
                              const isActive = t.status === s;
                              return (
                                <button key={s} onClick={() => updateStatus(t.$id, s)} disabled={updatingId === t.$id || isActive}
                                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isActive ? `${sCfg.bg} ${sCfg.text} ring-2 ring-offset-1 ring-${sCfg.border.split('-')[1]}-300` : 'bg-white border border-gray-200 text-gray-600 hover:bg-white hover:shadow-sm'}`}>
                                  {sCfg.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Priority Change */}
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Cambiar Prioridad</p>
                          <div className="flex flex-wrap gap-2">
                            {(['low', 'medium', 'high'] as const).map(p => {
                              const pCfg = PRIORITY_CFG[p];
                              const isActive = (t.priority || 'low') === p;
                              return (
                                <button key={p} onClick={() => updatePriority(t.$id, p)} disabled={isActive}
                                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${isActive ? `${pCfg.bg} ${pCfg.text} ring-2 ring-offset-1 ring-gray-300` : 'bg-white border border-gray-200 text-gray-600 hover:bg-white hover:shadow-sm'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                                  {pCfg.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Internal Notes */}
                      <div className="bg-amber-50/50 rounded-xl p-5 border border-amber-100">
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Notas Internas Privadas</p>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">Solo Admin</span>
                        </div>
                        
                        {editingNote?.id === t.$id ? (
                          <div className="flex flex-col gap-3">
                            <textarea
                              value={editingNote.text}
                              onChange={e => setEditingNote({ id: t.$id, text: e.target.value })}
                              rows={3}
                              className="w-full px-4 py-3 border border-amber-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none bg-white shadow-inner"
                              placeholder="Escribe una nota visible solo para administradores..."
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingNote(null)} className="px-4 py-2 border border-amber-200 rounded-xl text-sm font-medium text-amber-700 hover:bg-amber-100 transition">Cancelar</button>
                              <button onClick={() => saveNote(t.$id)} disabled={savingNoteId === t.$id}
                                className="px-5 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition shadow-sm disabled:opacity-60 flex items-center gap-2">
                                {savingNoteId === t.$id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar Nota
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => setEditingNote({ id: t.$id, text: (t as any).adminNotes || '' })}
                            className="cursor-pointer px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm text-amber-900 hover:border-amber-400 hover:shadow-sm transition min-h-[60px] relative group">
                            {(t as any).adminNotes ? (
                              <p className="whitespace-pre-wrap">{t.adminNotes}</p>
                            ) : (
                              <p className="text-amber-500/70 italic flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Clic para agregar una nota interna sobre este ticket...
                              </p>
                            )}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                              <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
                                <Edit2 className="w-3.5 h-3.5" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
