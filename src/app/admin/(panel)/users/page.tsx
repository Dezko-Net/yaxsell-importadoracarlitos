'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, USERS_COLLECTION_ID, FAVORITES_COLLECTION_ID, PRODUCTS_COLLECTION_ID, CART_ITEMS_COLLECTION_ID, ADMIN_CHAT_COLLECTION_ID, CART_SNAPSHOTS_COLLECTION_ID } from '@/lib/db';
import { formatPrice } from '@/lib/db';
import type { AdminCustomerRow } from '@/lib/admin-customers';
import { getLevelMeta } from '@/lib/loyalty-levels';
import {
  RefreshCw, AlertTriangle, Search, X, Users, Phone, Mail, Calendar,
  Download, ShoppingCart, MessageSquare, Send, Ban, CheckCircle, Eye,
  Trophy, DollarSign, Shield, Gift, KeyRound, MapPin, Clock, Hash,
  Heart, Image as ImageIcon, ClipboardList,
} from 'lucide-react';
import Link from 'next/link';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function getOnlineStatus(lastAccessAt?: string | null): { online: boolean; recent: boolean; label: string } {
  if (!lastAccessAt) return { online: false, recent: false, label: 'Nunca' };
  const now = Date.now();
  const last = new Date(lastAccessAt).getTime();
  const diffMin = (now - last) / 60000;
  if (diffMin < 5) return { online: true, recent: true, label: 'En línea' };
  if (diffMin < 60) return { online: false, recent: true, label: `Hace ${Math.floor(diffMin)} min` };
  if (diffMin < 1440) return { online: false, recent: false, label: `Hace ${Math.floor(diffMin / 60)} h` };
  return { online: false, recent: false, label: fmtDate(lastAccessAt) };
}

function UsersPageInner() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<AdminCustomerRow[]>(() => {
    if (typeof window !== 'undefined') {
      const cache = localStorage.getItem('admin_customers_cache');
      if (cache) {
        try { return JSON.parse(cache); } catch {}
      }
    }
    return [];
  });
  const [passwordNote, setPasswordNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(() => searchParams.get('rut') || searchParams.get('search') || '');
  const [showWholesaleOnly, setShowWholesaleOnly] = useState(false);
  const [showBannedOnly, setShowBannedOnly] = useState(false);
  const [regTypeFilter, setRegTypeFilter] = useState<'whatsapp' | 'web' | 'both'>('whatsapp');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'orders' | 'spent'>('date');
  const [chatModal, setChatModal] = useState<AdminCustomerRow | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [detailModal, setDetailModal] = useState<AdminCustomerRow | null>(null);
  const [togglingBanId, setTogglingBanId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos


  const resolveProfileDocId = async (u: AdminCustomerRow): Promise<string> => {
    if (u.hasProfileDoc && !u.$id.startsWith('auth:')) return u.$id;
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const byUid = await databases.listDocuments(databaseId, USERS_COLLECTION_ID, [
      Query.equal('userId', u.userId),
      Query.limit(1),
    ]);
    if (byUid.documents[0]) return byUid.documents[0].$id;
    const created = await databases.createDocument(databaseId, USERS_COLLECTION_ID, ID.unique(), {
      userId: u.userId,
      email: u.email,
      name: u.name,
      phone: u.phone || '',
      createdAt: new Date().toISOString(),
    });
    return created.$id;
  };

  const toggleBan = async (u: AdminCustomerRow) => {
    setTogglingBanId(u.$id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const docId = await resolveProfileDocId(u);
      await databases.updateDocument(databaseId, USERS_COLLECTION_ID, docId, { isBanned: !u.isBanned });
      setUsers(prev => prev.map(x => x.$id === u.$id ? { ...x, isBanned: !x.isBanned, hasProfileDoc: true, $id: docId } : x));
      if (detailModal?.$id === u.$id) setDetailModal({ ...u, isBanned: !u.isBanned, hasProfileDoc: true, $id: docId });
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'No se pudo actualizar'));
    } finally {
      setTogglingBanId(null);
    }
  };

  const sendChatMessage = async () => {
    if (!chatModal || !chatDraft.trim()) return;
    setSendingMsg(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const msg = await databases.createDocument(databaseId, ADMIN_CHAT_COLLECTION_ID, ID.unique(), {
        userId: chatModal.userId,
        senderRole: 'admin',
        message: chatDraft.trim(),
        readByUser: false,
        readByAdmin: true,
      });
      setChatMessages(prev => [...prev, msg]);
      // Guardar mensaje antes de limpiar
      const messageText = chatDraft.trim();
      setChatDraft('');
      // Crear notificación para el usuario vía API server-side
      try {
        const notifRes = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Nuevo mensaje',
            message: messageText.length > 50 ? messageText.slice(0, 50) + '…' : messageText,
            type: 'info',
            userId: chatModal.userId,
            link: '/cuenta/chat',
          }),
        });
        const notifData = await notifRes.json();
        console.log('[admin] Notificación creada:', notifData);
      } catch (e) {
        console.error('[admin] Error notificación:', e);
      }
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'No se pudo enviar'));
    } finally {
      setSendingMsg(false);
    }
  };

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    // Verificar cache con TTL
    if (!force && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('admin_customers_cache');
        const cachedTime = localStorage.getItem('admin_customers_cache_time');
        if (cached && cachedTime) {
          const age = Date.now() - parseInt(cachedTime, 10);
          if (age < CACHE_TTL) {
            setUsers(JSON.parse(cached));
            setIsLoading(false);
            return;
          }
        }
      } catch {}
    }
    setIsLoading(true);
    setError('');
    try {
      const customersResp = await fetch(force ? '/api/admin/customers?force=1' : '/api/admin/customers').then(r => r.json());
      if (customersResp?.error) setError(String(customersResp.error));
      if (customersResp?.passwordNote) setPasswordNote(String(customersResp.passwordNote));
      const newUsers = Array.isArray(customersResp?.users) ? customersResp.users : [];
      setUsers(newUsers);
      if (typeof window !== 'undefined') {
        localStorage.setItem('admin_customers_cache', JSON.stringify(newUsers));
        localStorage.setItem('admin_customers_cache_time', String(Date.now()));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = [...users.filter(u => {
    if (showWholesaleOnly && !u.isWholesale) return false;
    if (showBannedOnly && !u.isBanned) return false;
    if (regTypeFilter === 'whatsapp' && u.registrationType !== 'whatsapp') return false;
    if (regTypeFilter === 'web' && u.registrationType !== 'web') return false;
    if (regTypeFilter === 'both' && !(u as any).hasBothChannels) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      u.region?.toLowerCase().includes(q) ||
      u.userId?.includes(q) ||
      String(u.prefs?.rut || '').toLowerCase().includes(q)
    );
  })].sort((a, b) => {
    // Por defecto: mas dinero en pedidos pagados primero
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'orders') return b.orders.total - a.orders.total;
    if (sortBy === 'spent') return b.orders.revenuePaid - a.orders.revenuePaid;
    return b.orders.revenuePaid - a.orders.revenuePaid;
  });

  // Resetear página cuando cambian filtros
  useEffect(() => { setCurrentPage(1); }, [search, showWholesaleOnly, showBannedOnly, sortBy, regTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCSV = () => {
    const headers = [
      'Nombre', 'Email', 'Teléfono', 'RUT', 'User ID', 'Región', 'Comuna', 'Dirección',
      'Medalla', 'Puntos est.', 'Pedidos total', 'Pendientes', 'Pagados', 'Entregados', 'Cancelados',
      'Monto pagado', 'Regalo reclamado', 'Email verificado', 'Último acceso', 'Último pedido', 'Bloqueado', 'Notas',
    ];
    const rows = filtered.map(u => [
      u.name, u.email, u.phone || '', String(u.prefs.rut || ''), u.userId,
      u.region || '', u.comuna || '', u.address || '',
      u.loyaltyName, u.pointsEstimate,
      u.orders.total, u.orders.pending, u.orders.paid, u.orders.delivered, u.orders.cancelled,
      u.orders.revenuePaid,
      u.prefs.welcomeGiftClaimed ? 'Sí' : 'No',
      u.emailVerified ? 'Sí' : 'No',
      fmtDate(u.lastAccessAt),
      fmtDate(u.orders.lastOrderAt),
      u.isBanned ? 'Sí' : 'No',
      u.adminNotes || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    total: users.length,
    whatsapp: users.filter(u => u.registrationType === 'whatsapp'),
    web: users.filter(u => u.registrationType === 'web'),
    both: users.filter(u => (u as any).hasBothChannels),
    banned: users.filter(u => u.isBanned).length,
    revenue: users.reduce((s, u) => s + u.orders.revenuePaid, 0),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} {regTypeFilter === 'whatsapp' ? 'WhatsApp' : regTypeFilter === 'web' ? 'Web' : 'Ambos'} · ingresos pagados {formatPrice(stats.revenue)}
          </p>
          {passwordNote && (
            <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
              <KeyRound className="w-3 h-3" />{passwordNote}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setShowBannedOnly(v => !v)}
            className={`px-3 py-2 rounded-xl text-sm font-medium border ${showBannedOnly ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-700 border-gray-200'}`}>
            Bloqueados
          </button>
          <button type="button" onClick={exportCSV} disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm disabled:opacity-50">
            <Download className="w-4 h-4" />CSV
          </button>
          <button type="button" onClick={() => load({ force: true })} disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-60 hover:bg-indigo-700 transition">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />Cargar clientes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pagado WhatsApp', value: formatPrice(stats.whatsapp.reduce((s, u) => s + u.orders.revenuePaid, 0)), color: 'bg-emerald-500' },
          { label: 'Pagado Web', value: formatPrice(stats.web.reduce((s, u) => s + u.orders.revenuePaid, 0)), color: 'bg-blue-500' },
          { label: 'Pagado Ambos', value: formatPrice(stats.both.reduce((s, u) => s + u.orders.revenuePaid, 0)), color: 'bg-violet-500' },
          { label: 'Total pagado', value: formatPrice(stats.revenue), color: 'bg-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className={`w-7 h-7 rounded-xl ${s.color} flex items-center justify-center mb-2`}>
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs de tipo de registro */}
      <div className="flex items-center gap-2 flex-wrap">
        {([['whatsapp', 'WhatsApp', MessageSquare, 'bg-emerald-500 border-emerald-500'], ['web', 'Web (email)', Mail, 'bg-blue-500 border-blue-500'], ['both', 'Ambos', Users, 'border-violet-500']] as const).map(([val, label, Icon, activeColor]) => {
          const count = val === 'both'
            ? users.filter(u => (u as any).hasBothChannels).length
            : users.filter(u => u.registrationType === val).length;
          const isActive = regTypeFilter === val;
          const activeClass = val === 'both'
            ? 'text-white border-violet-500'
            : val === 'whatsapp'
              ? 'text-white bg-emerald-500 border-emerald-500'
              : 'text-white bg-blue-500 border-blue-500';
          return (
            <button key={val} type="button" onClick={() => setRegTypeFilter(val)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${isActive ? activeClass : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />{label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, email, teléfono, RUT, user ID..."
          className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Ordenar:</span>
        {([['date', 'Más gastado'], ['name', 'Nombre'], ['orders', 'Pedidos'], ['spent', 'Gasto']] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setSortBy(v)}
            className={`px-3 py-1 rounded-xl text-xs font-medium ${sortBy === v ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Medalla</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Pedidos</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Pagado</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Actividad</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : paginated.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No se encontraron clientes</td></tr>
              ) : paginated.map(u => {
                const level = getLevelMeta(u.loyaltyCalculated);
                return (
                  <tr key={u.$id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${getOnlineStatus(u.lastAccessAt).online ? 'bg-emerald-500 animate-pulse' : getOnlineStatus(u.lastAccessAt).recent ? 'bg-amber-400' : 'bg-gray-300'}`} title={getOnlineStatus(u.lastAccessAt).label} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-gray-900 truncate max-w-[200px]">{u.name}</p>
                            {(u as any).hasBothChannels ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'linear-gradient(90deg, #d1fae5, #dbeafe)', color: '#6366f1' }}>Ambos</span>
                            ) : u.registrationType === 'whatsapp' ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">WhatsApp</span>
                            ) : u.registrationType === 'web' ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Web</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{u.email || u.phone || ''}</p>
                          {u.isBanned && <span className="text-[10px] font-bold text-red-600">Bloqueado</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {u.registrationType === 'whatsapp' ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: level.color }}>
                            <Trophy className="w-3 h-3" />{u.loyaltyName}
                          </span>
                          <p className="text-[10px] text-gray-400">{u.pointsEstimate} pts</p>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-xs">
                      <span className="font-bold text-gray-900">{u.orders.total}</span>
                      <span className="text-gray-400 block">
                        {u.orders.paid} pag · {u.orders.pending} pend · {u.orders.cancelled} canc
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700 text-xs">
                      {formatPrice(u.orders.revenuePaid)}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 hidden lg:table-cell">
                      <span className={`inline-flex items-center gap-1 ${getOnlineStatus(u.lastAccessAt).online ? 'text-emerald-600 font-semibold' : ''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${getOnlineStatus(u.lastAccessAt).online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        {getOnlineStatus(u.lastAccessAt).label}
                      </span>
                      <span className="block text-gray-400">Pedido: {fmtDate(u.orders.lastOrderAt)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button type="button" onClick={() => setDetailModal(u)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600" title="Ver ficha">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <Link href={`/admin/orders?userId=${u.userId}`} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600" title="Pedidos">
                          <ClipboardList className="w-3.5 h-3.5" />
                        </Link>
                        <button type="button" onClick={async () => {
                          setChatModal(u);
                          setChatLoading(true);
                          setChatDraft('');
                          try {
                            const { databases } = getServices();
                            const { databaseId } = getFirebaseConfig();
                            const res = await databases.listDocuments(databaseId, ADMIN_CHAT_COLLECTION_ID, [
                              Query.equal('userId', u.userId),
                              Query.orderAsc('$createdAt'),
                              Query.limit(200),
                            ]);
                            setChatMessages(res.documents as any[]);
                            // Mark admin as read
                            const unread = res.documents.filter((d: any) => d.senderRole === 'user' && !d.readByAdmin);
                            for (const doc of unread) {
                              try { await databases.updateDocument(databaseId, ADMIN_CHAT_COLLECTION_ID, doc.$id, { readByAdmin: true }); } catch {}
                            }
                          } catch (e: unknown) { console.error(e); setChatMessages([]); }
                          finally { setChatLoading(false); }
                        }} className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-400 hover:text-violet-500" title="Chat">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => toggleBan(u)} disabled={togglingBanId === u.$id}
                          className={`p-1.5 rounded-lg ${u.isBanned ? 'text-red-500 bg-red-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}>
                          {u.isBanned ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-1">
          <p className="text-xs text-gray-500">
            Página {safePage} de {totalPages} · {filtered.length} clientes
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">
              Anterior
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - safePage) <= 2 || p === 1 || p === totalPages).map((p, idx, arr) => (
              <span key={p} className="flex items-center">
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-gray-300">…</span>}
                <button type="button" onClick={() => setCurrentPage(p)}
                  className={`min-w-[32px] px-2 py-1.5 rounded-lg text-sm font-medium ${p === safePage ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                  {p}
                </button>
              </span>
            ))}
            <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Chat modal */}
      {chatModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-violet-500" /> Chat</p>
                <p className="text-xs text-gray-500 mt-0.5">{chatModal.name || chatModal.email || 'Usuario'}</p>
              </div>
              <button type="button" onClick={() => { setChatModal(null); setChatMessages([]); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-4 flex-1 space-y-2 min-h-[200px]">
              {chatLoading ? (
                <div className="flex items-center justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Sin mensajes</p>
                </div>
              ) : (
                chatMessages.map((msg: any) => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div key={msg.$id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${isAdmin ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                        <p>{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${isAdmin ? 'text-indigo-200' : 'text-gray-400'}`}>{new Date(msg.$createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-2">
                <input value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }} placeholder="Escribe un mensaje..." className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button type="button" onClick={sendChatMessage} disabled={sendingMsg || !chatDraft.trim()} className="p-2 rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailModal && (
        <CustomerDetailModal user={detailModal} onClose={() => setDetailModal(null)} passwordNote={passwordNote} onRefresh={load} />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
      <Icon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 break-all">{value ?? '—'}</p>
      </div>
    </div>
  );
}

function CustomerDetailModal({
  user: u,
  onClose,
  passwordNote,
  onRefresh,
}: {
  user: AdminCustomerRow;
  onClose: () => void;
  passwordNote: string;
  onRefresh?: () => void;
}) {
  const level = getLevelMeta(u.loyaltyCalculated);
  const levelStored = getLevelMeta(u.loyaltyStored);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full shrink-0 ${getOnlineStatus(u.lastAccessAt).online ? 'bg-emerald-500 animate-pulse' : getOnlineStatus(u.lastAccessAt).recent ? 'bg-amber-400' : 'bg-gray-300'}`} />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{u.name}</h2>
              <p className="text-sm text-gray-500">{u.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="text-xs font-bold uppercase text-indigo-600 mb-2">Cuenta y contacto</h3>
            <InfoRow icon={Hash} label="User ID (Appwrite)" value={u.userId} />
            <InfoRow icon={Mail} label="Email" value={u.email} />
            <InfoRow icon={Phone} label="Teléfono" value={u.phone || u.prefs.phone as string} />
            <InfoRow icon={Shield} label="RUT" value={String(u.prefs.rut || '—')} />
            <InfoRow icon={MapPin} label="Dirección" value={[u.address, u.comuna, u.region].filter(Boolean).join(', ') || '—'} />
            <InfoRow icon={Shield} label="Email verificado" value={u.emailVerified ? 'Sí' : 'No'} />
            <InfoRow icon={Shield} label="Teléfono verificado" value={u.phoneVerified ? 'Sí' : 'No'} />
            <InfoRow icon={KeyRound} label="Contraseña" value={passwordNote || 'Hash en Appwrite (no visible)'} />
            <InfoRow icon={Clock} label="Último cambio contraseña" value={fmtDate(u.passwordUpdatedAt)} />
            <InfoRow icon={Calendar} label="Registro Auth" value={fmtDate(u.authCreatedAt || u.registrationAt)} />
            <InfoRow icon={Clock} label="Último acceso" value={
              <span className={`inline-flex items-center gap-1.5 ${getOnlineStatus(u.lastAccessAt).online ? 'text-emerald-600 font-semibold' : ''}`}>
                <span className={`w-2 h-2 rounded-full ${getOnlineStatus(u.lastAccessAt).online ? 'bg-emerald-500 animate-pulse' : getOnlineStatus(u.lastAccessAt).recent ? 'bg-amber-400' : 'bg-gray-300'}`} />
                {getOnlineStatus(u.lastAccessAt).label}
              </span>
            } />
            <InfoRow icon={Shield} label="Estado Auth" value={u.authStatus} />
            {u.authLabels?.length ? <InfoRow icon={Hash} label="Labels" value={u.authLabels.join(', ')} /> : null}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-pink-600 mb-2">Lealtad y regalos</h3>
            <InfoRow icon={Trophy} label="Medalla (calculada por pedidos)" value={
              <span style={{ color: level.color }}>{level.name} ({u.loyaltyCalculated})</span>
            } />
            {u.loyaltyStored !== u.loyaltyCalculated && (
              <InfoRow icon={Trophy} label="Medalla en prefs (antigua)" value={
                <span className="text-amber-600">{levelStored.name} — se corrige al iniciar sesión</span>
              } />
            )}
            <InfoRow icon={Gift} label="Puntos estimados" value={u.pointsEstimate} />
            <InfoRow icon={Gift} label="Ajuste manual de puntos" value={Number(u.prefs.pointsAdjustment || 0)} />
            <InfoRow icon={Gift} label="Regalo apertura reclamado" value={u.prefs.welcomeGiftClaimed ? 'Sí' : 'No'} />
            <InfoRow icon={Gift} label="Cupón bienvenida" value={String(u.prefs.welcomeCouponCode || '—')} />

            {/* Manual points adjustment control */}
            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-1.5">Establecer total de puntos manualmente</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Ej: 50"
                  id="pts-adj-input"
                  min="0"
                  className="w-24 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-800"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const el = document.getElementById('pts-adj-input') as HTMLInputElement;
                    const val = parseInt(el?.value || '0', 10);
                    if (isNaN(val) || val < 0) {
                      alert('Ingresa un número válido de puntos (0 o más)');
                      return;
                    }
                    if (!confirm(`¿Deseas establecer los puntos de este cliente en exactamente ${val} pts?`)) return;
                    try {
                      const res = await fetch('/api/admin/customers', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: u.userId || u.$id, targetPoints: val }),
                      }).then(r => r.json());
                      if (res.error) throw new Error(res.error);
                      alert('Puntos actualizados con éxito.');
                      if (el) el.value = '';
                      u.pointsEstimate = val;
                      if (onRefresh) onRefresh();
                      onClose();
                    } catch (err: any) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                >
                  Establecer
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-emerald-600 mb-2">Pedidos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                ['Total', u.orders.total],
                ['Pendientes', u.orders.pending],
                ['Pagados', u.orders.paid],
                ['Procesando', u.orders.processing],
                ['Enviados', u.orders.shipped],
                ['Entregados', u.orders.delivered],
                ['Cancelados', u.orders.cancelled],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-gray-900">{val}</p>
                  <p className="text-[10px] text-gray-500 uppercase">{label}</p>
                </div>
              ))}
            </div>
            <InfoRow icon={DollarSign} label="Monto pedidos pagados/entregados" value={formatPrice(u.orders.revenuePaid)} />
            <InfoRow icon={DollarSign} label="Monto todos los pedidos" value={formatPrice(u.orders.revenueAll)} />
            <InfoRow icon={Calendar} label="Primer pedido" value={fmtDate(u.orders.firstOrderAt)} />
            <InfoRow icon={Calendar} label="Último pedido" value={fmtDate(u.orders.lastOrderAt)} />
            <Link href={`/admin/orders?userId=${u.userId}`}
              className="inline-flex items-center gap-2 mt-2 text-sm font-semibold text-indigo-600 hover:underline">
              <ShoppingCart className="w-4 h-4" />Ver todos los pedidos
            </Link>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Tienda</h3>
            <InfoRow icon={Users} label="Tipo" value={u.isWholesale ? 'Mayorista' : 'Regular'} />
            <InfoRow icon={Ban} label="Bloqueado en tienda" value={u.isBanned ? 'Sí' : 'No'} />
            <InfoRow icon={MessageSquare} label="Notas admin" value={u.adminNotes || '—'} />
            <InfoRow icon={Calendar} label="Perfil creado" value={fmtDate(u.profileCreatedAt)} />
            <InfoRow icon={Hash} label="Solo Auth (sin doc users)" value={u.isAuthOnly ? 'Sí' : 'No'} />
          </section>
        </div>

        <div className="p-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-gray-100 rounded-2xl" />}>
      <UsersPageInner />
    </Suspense>
  );
}
