'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, X, Package, ChevronDown, MapPin, Phone, Mail, Image as ImageIcon, ArrowUpDown, ArrowUp, ArrowDown, Copy, MessageCircle } from 'lucide-react';
import OrdersCloudMascot from '@/components/admin/OrdersCloudMascot';

interface VendorOrder {
  $id: string;
  ORDERCODE: string;
  CUSTOMERNAME: string;
  CUSTOMERPHONE?: string;
  CUSTOMEREMAIL?: string;
  ADDRESS?: string;
  REGION?: string;
  COMUNA?: string;
  ITEMS: string;
  SUBTOTAL: number;
  TOTAL: number;
  STATUS: string;
  PAYMENTPROOFURL?: string;
  PAYMENTMETHOD?: string;
  ORDER_SOURCE?: string;
  SHIPPINGAGENCY?: string;
  CREATEDAT: number;
  $createdAt?: string;
}

/* ─────────── Status config (mismas etiquetas y colores del admin) ─────────── */
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  all:               { label: 'Todos',                bg: 'bg-gray-100',    text: 'text-gray-700' },
  pending:           { label: 'Stock Confirmado',    bg: 'bg-emerald-100', text: 'text-emerald-700' },
  payment_review:    { label: 'Revisando Pago',       bg: 'bg-blue-100',    text: 'text-blue-700' },
  payment_confirmed: { label: 'Pago Confirmado',      bg: 'bg-green-100',   text: 'text-green-700' },
  shipped:           { label: 'Embalado',              bg: 'bg-violet-100',  text: 'text-violet-700' },
  delivered:         { label: 'Entregado a Agencia',  bg: 'bg-green-100',   text: 'text-green-700' },
  negotiation:       { label: 'Negociando',           bg: 'bg-pink-100',    text: 'text-pink-700' },
  cancelled:         { label: 'Cancelado',            bg: 'bg-red-100',     text: 'text-red-700' },
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending:           { color: '#34d399', bg: '#f0fdf4' },
  payment_review:    { color: '#60a5fa', bg: '#f5f9ff' },
  paid:              { color: '#34d399', bg: '#f0fdf4' },
  payment_confirmed: { color: '#34d399', bg: '#f0fdf4' },
  shipped:           { color: '#a78bfa', bg: '#f3effe' },
  delivered:         { color: '#4ade80', bg: '#f7fef9' },
  negotiation:       { color: '#f472b6', bg: '#fff0f8' },
  cancelled:         { color: '#f87171', bg: '#feebeb' },
};

const STATUS_OPTIONS = ['pending', 'payment_review', 'payment_confirmed', 'shipped', 'delivered', 'negotiation', 'cancelled'];
const CONFIRMED_STATUSES = ['pending', 'payment_confirmed', 'shipped', 'delivered'];

// Los estados de espera antiguos se muestran como Stock Confirmado: los vendors
// no usan el vencimiento corto de la tienda principal.
function normalizeVendorStatus(status: string, hasProof = false) {
  if (status === 'payment_expired') return hasProof ? 'payment_review' : 'pending';
  if (status === 'processing' || status === 'paid' || status === 'pending_stock') return 'pending';
  if (status === 'preparing') return 'shipped';
  return status;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n || 0);
}

function isWhatsAppOrder(order: VendorOrder) {
  return order.ORDER_SOURCE === 'whatsapp' || order.PAYMENTMETHOD === 'WhatsApp';
}

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [waShortcutOrderId, setWaShortcutOrderId] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vendor/orders');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Error al cargar pedidos');
      setOrders(data?.orders || []);
    } catch {
      setError('Error al cargar pedidos');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: string, status: string) => {
    const persistedStatus = status === 'pending' ? 'paid' : status;
    setUpdatingId(id);
    setOrders(prev => prev.map(o => o.$id === id ? { ...o, STATUS: persistedStatus } : o));
    try {
      const res = await fetch(`/api/vendor/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: persistedStatus }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar el estado');
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar el estado');
      await load();
    }
    setUpdatingId(null);
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter(order => {
    const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt || 0);
    return date >= todayStart;
  });
  const todayConfirmedOrders = todayOrders.filter(order => CONFIRMED_STATUSES.includes(normalizeVendorStatus(order.STATUS, Boolean(order.PAYMENTPROOFURL))));
  const todaySales = todayOrders.reduce((sum, order) => sum + (Number(order.TOTAL) || 0), 0);
  const todayConfirmedSales = todayConfirmedOrders.reduce((sum, order) => sum + (Number(order.TOTAL) || 0), 0);
  const todayReviewCount = todayOrders.filter(order => normalizeVendorStatus(order.STATUS, Boolean(order.PAYMENTPROOFURL)) === 'payment_review').length;

  const matchesActiveFilter = (order: VendorOrder) => {
    const status = normalizeVendorStatus(order.STATUS, Boolean(order.PAYMENTPROOFURL));
    if (activeFilter === 'all') return true;
    if (activeFilter === 'review') return status === 'payment_review';
    if (activeFilter === 'confirmed') return CONFIRMED_STATUSES.includes(status);
    return status === activeFilter;
  };

  /* ── filter + search + sort ── */
  const filtered = orders
    .filter(matchesActiveFilter)
    .filter(o => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (o.ORDERCODE || '').toLowerCase().includes(q)
        || (o.CUSTOMERNAME || '').toLowerCase().includes(q)
        || (o.CUSTOMERPHONE || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'total') return (a.TOTAL - b.TOTAL) * mul;
      const ta = a.CREATEDAT || new Date(a.$createdAt || 0).getTime();
      const tb = b.CREATEDAT || new Date(b.$createdAt || 0).getTime();
      return (ta - tb) * mul;
    });

  const toggleSort = (col: 'date' | 'total') => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const copyField = async (key: string, value: string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch {}
    setCopiedField(key);
    window.setTimeout(() => setCopiedField(current => current === key ? null : current), 1500);
  };

  const totalItems = filtered.reduce((s, o) => {
    try { return s + (JSON.parse(o.ITEMS || '[]') as any[]).reduce((a: number, i: any) => a + (i.qty || i.quantity || 1), 0); }
    catch { return s; }
  }, 0);

  const selectedOrder = selectedId ? orders.find(o => o.$id === selectedId) : null;
  const selectedDisplayStatus = selectedOrder ? normalizeVendorStatus(selectedOrder.STATUS, Boolean(selectedOrder.PAYMENTPROOFURL)) : '';

  useEffect(() => {
    document.body.classList.toggle('vendor-order-detail-open', !!selectedId);
    return () => document.body.classList.remove('vendor-order-detail-open');
  }, [selectedId]);

  return (
    <div className="space-y-3 sm:space-y-5">
            {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-gray-950">Pedidos</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            {totalItems > 0 && <span className="ml-2 text-xs text-gray-400">{totalItems} artículos</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={isLoading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-rose-600 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-rose-700 transition disabled:opacity-60 shadow-sm shadow-rose-600/20">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Resumen de hoy */}
      <section className="space-y-3" aria-label="Resumen de pedidos de hoy">
        <div className="relative flex min-h-[112px] items-center overflow-hidden rounded-3xl border border-rose-100 px-3 py-2 shadow-sm sm:min-h-[132px] sm:px-5"
          style={{ background: 'linear-gradient(110deg, #fff2f8 0%, #f8f7ff 58%, #fff9ed 100%)' }}>
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-rose-100/60 blur-2xl" />
          <OrdersCloudMascot />
          <div className="relative min-w-0 flex-1 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700 sm:text-xs">Resumen de hoy</p>
            <h2 className="mt-1 text-base font-extrabold tracking-tight text-slate-900 sm:text-xl">
              {todayOrders.length > 0 ? '¡Buen trabajo!' : '¡Vamos con todo!'}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
              Hoy llevas <strong className="text-slate-900">{todayOrders.length} pedido{todayOrders.length !== 1 ? 's' : ''}</strong>
              {todayReviewCount > 0 ? <> y tienes <strong className="text-amber-700">{todayReviewCount} pago{todayReviewCount !== 1 ? 's' : ''} por confirmar</strong>.</> : ' y hoy no tienes pagos pendientes de confirmar.'}
            </p>
          </div>
          <div className="relative ml-2 hidden shrink-0 flex-col gap-2 pr-1 sm:flex">
            <div className="rounded-2xl border border-white/90 bg-white/75 px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pedidos</p>
              <p className="text-lg font-black leading-tight text-slate-900">{todayOrders.length}</p>
            </div>
            <button onClick={() => setActiveFilter('review')}
              className={`rounded-2xl border px-3 py-2 text-right shadow-sm transition ${todayReviewCount > 0 ? 'border-amber-200 bg-amber-50/90 hover:bg-amber-100' : 'border-rose-100 bg-rose-50/70 hover:bg-rose-100'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wide ${todayReviewCount > 0 ? 'text-amber-700' : 'text-rose-700'}`}>Por confirmar</p>
              <p className={`text-lg font-black leading-tight ${todayReviewCount > 0 ? 'text-amber-800' : 'text-rose-800'}`}>{todayReviewCount}</p>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-2xl border border-gray-100/80 p-3 shadow-sm sm:p-4" style={{ background: 'linear-gradient(145deg, rgba(255,240,246,0.8), rgba(255,255,255,0.96))' }}>
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-rose-500" />
            <div className="mb-2 mt-0.5 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-100 text-rose-700">$</span><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">Total hoy</p></div>
            <p className="text-lg font-extrabold tracking-tight text-gray-900 sm:text-2xl">{formatPrice(todaySales)}</p>
            <p className="mt-1 text-[10px] font-medium text-gray-400">{todayOrders.length} pedidos hoy</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-gray-100/80 p-3 shadow-sm sm:p-4" style={{ background: 'linear-gradient(145deg, rgba(236,253,245,0.7), rgba(255,255,255,0.96))' }}>
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-emerald-500" />
            <div className="mb-2 mt-0.5 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-emerald-700">✓</span><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">Ventas confirmadas</p></div>
            <p className="text-lg font-extrabold tracking-tight text-gray-900 sm:text-2xl">{formatPrice(todayConfirmedSales)}</p>
            <p className="mt-1 text-[10px] font-medium text-gray-400">{todayConfirmedOrders.length} confirmados hoy</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-gray-100/80 p-3 shadow-sm sm:p-4" style={{ background: 'linear-gradient(145deg, rgba(255,251,235,0.75), rgba(255,255,255,0.96))' }}>
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-amber-500" />
            <div className="mb-2 mt-0.5 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-700">!</span><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">Por confirmar</p></div>
            <p className="text-lg font-extrabold tracking-tight text-gray-900 sm:text-2xl">{todayReviewCount}</p>
            <p className="mt-1 text-[10px] font-medium text-gray-400">Pago{todayReviewCount !== 1 ? 's' : ''} en revisión</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-gray-100/80 p-3 shadow-sm sm:p-4" style={{ background: 'linear-gradient(145deg, rgba(240,253,244,0.7), rgba(255,255,255,0.96))' }}>
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-green-500" />
            <div className="mb-2 mt-0.5 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-green-100 text-green-700">↗</span><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">Ticket prom.</p></div>
            <p className="text-lg font-extrabold tracking-tight text-gray-900 sm:text-2xl">{formatPrice(todayConfirmedOrders.length ? Math.round(todayConfirmedSales / todayConfirmedOrders.length) : 0)}</p>
            <p className="mt-1 text-[10px] font-medium text-gray-400">por pedido confirmado</p>
          </div>
        </div>
      </section>

      {/* Filtros compactos como admin/orders */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        <button onClick={() => setActiveFilter('all')}
          className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${activeFilter === 'all' ? 'border-gray-950 bg-gray-950 text-white shadow-md ring-2 ring-gray-950 ring-inset' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
          Todos
        </button>
        <button onClick={() => setActiveFilter('confirmed')}
          className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${activeFilter === 'confirmed' || CONFIRMED_STATUSES.includes(activeFilter) ? 'border-rose-300 bg-rose-100 text-rose-800 ring-2 ring-rose-400 ring-inset shadow-sm' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>
          Confirmados
        </button>
        <button onClick={() => setActiveFilter('cancelled')}
          className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${activeFilter === 'cancelled' ? 'border-red-300 bg-red-100 text-red-700 ring-2 ring-red-400 ring-inset shadow-sm' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}>
          Cancelado
        </button>
        <button onClick={() => setShowMoreFilters(value => !value)}
          className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm font-medium transition bg-white text-gray-600 border-gray-200 hover:bg-gray-50 ${['review', 'payment_review', 'negotiation'].includes(activeFilter) ? 'ring-2 ring-rose-400 ring-inset shadow-sm' : ''}`}>
          Más estados <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
        </button>
        {(showMoreFilters || ['review', 'payment_review', 'negotiation'].includes(activeFilter)) && (
          <div className="flex items-center gap-2">
            <button onClick={() => setActiveFilter('review')}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${['review', 'payment_review'].includes(activeFilter) ? 'border-amber-300 bg-amber-100 text-amber-800 ring-2 ring-amber-400 ring-inset' : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}>
              Revisando pago
            </button>
            <button onClick={() => setActiveFilter('negotiation')}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${activeFilter === 'negotiation' ? 'border-pink-300 bg-pink-100 text-pink-800 ring-2 ring-pink-400 ring-inset' : 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100'}`}>
              Negociando
            </button>
          </div>
        )}
      </div>

      {/* ═══ Search ═══ */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, nombre o teléfono..."
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

      {/* ═══ Orders list ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Toolbar: orden */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/70">
          <span className="text-xs font-semibold text-gray-500">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-0.5">Ordenar</span>
            <button onClick={() => toggleSort('date')}
              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${sortBy === 'date' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Fecha {sortBy === 'date' ? (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
            </button>
            <button onClick={() => toggleSort('total')}
              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${sortBy === 'total' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Total {sortBy === 'total' ? (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
            </button>
          </div>
        </div>

        {/* Mobile: cards */}
        <div className="block sm:hidden p-2 space-y-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3 animate-pulse">
                <div className="flex justify-between"><div className="h-4 w-24 bg-gray-100 rounded" /><div className="h-4 w-16 bg-gray-100 rounded" /></div>
                <div className="h-4 w-40 bg-gray-100 rounded" />
                <div className="h-4 w-32 bg-gray-100 rounded" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No se encontraron pedidos</div>
          ) : (
            filtered.map(order => {
              const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt || Date.now());
              const displayStatus = normalizeVendorStatus(order.STATUS, Boolean(order.PAYMENTPROOFURL));
              const sc = STATUS_COLORS[displayStatus] || { color: '#6b7280', bg: '#f3f4f6' };
              const cfg = STATUS_CONFIG[displayStatus] || { label: displayStatus };
              const ageMs = Date.now() - date.getTime();
              const ageH = Math.floor(ageMs / 3600000);
              const ageD = Math.floor(ageH / 24);
              const relativeAge = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
              const exactDate = date.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const ageStr = `${relativeAge} · ${exactDate}`;
              let items: any[] = [];
              try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
              const totalItemQty = items.reduce((s: number, it: any) => s + (it.qty || it.quantity || 1), 0);
              const isWa = isWhatsAppOrder(order);
              return (
                <div key={order.$id}
                  className="relative p-4 transition-all cursor-pointer hover:brightness-95"
                  style={{ background: sc.bg }}
                  onClick={() => router.push(`/vendor/orders/${order.$id}`)}>
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-r" style={{ background: sc.color }} />
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs text-gray-900 font-bold">{order.ORDERCODE || '—'}</span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${isWa ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{isWa ? 'WhatsApp' : 'Web'}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-bold text-right leading-tight">{ageStr}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{order.CUSTOMERNAME}</p>
                      <p className="text-xs text-gray-500">{totalItemQty} artículo{totalItemQty !== 1 ? 's' : ''} · {formatPrice(order.TOTAL)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: sc.color, background: '#fff' }}>{cfg.label}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setWaShortcutOrderId(order.$id); }} className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-200 transition" title="Atajos WhatsApp" aria-label="Atajos WhatsApp">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop: horizontal cards (igual al admin) */}
        <div className="hidden sm:block">
          <div className="p-3 space-y-2.5">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-stretch rounded-2xl border-2 border-gray-100 overflow-hidden animate-pulse">
                  <div className="w-[76px] bg-gray-100" />
                  <div className="flex-1 flex items-center gap-4 px-4 py-5">
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-40 bg-gray-100 rounded" />
                    <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No se encontraron pedidos</p>
              </div>
            ) : (
              filtered.map(order => {
                const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt || Date.now());
                const ageMs = Date.now() - date.getTime();
                const ageH = Math.floor(ageMs / 3600000);
                const ageD = Math.floor(ageH / 24);
                const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
                const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
                const ageStr = `${ageStrRel} (${exactTime})`;
                let items: any[] = [];
                try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
                const totalItemQty = items.reduce((s: number, it: any) => s + (it.qty || it.quantity || 1), 0);
                const displayStatus = normalizeVendorStatus(order.STATUS, Boolean(order.PAYMENTPROOFURL));
                const sc = STATUS_COLORS[displayStatus] || { color: '#6b7280', bg: '#f3f4f6' };
                const cfg = STATUS_CONFIG[displayStatus] || { label: displayStatus };
                const cardBg = sc.bg;
                const isWa = isWhatsAppOrder(order);

                return (
                  <div key={order.$id}
                    className="group flex items-stretch rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
                    style={{ background: cardBg }}
                    onClick={() => router.push(`/vendor/orders/${order.$id}`)}>

                    {/* Riel de origen */}
                    <div className="flex flex-col items-center justify-center gap-1.5 w-[76px] px-2 py-3 flex-shrink-0" style={{ background: cardBg }}>
                      <div className="flex items-center justify-center">
                        {isWa ? (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        ) : (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-gray-500">{isWa ? 'WhatsApp' : 'Web'}</span>
                    </div>

                    {/* Cuerpo */}
                    <div className="flex-1 min-w-0 flex items-stretch">
                      {/* Código + items */}
                      <div className="flex flex-col justify-center min-w-[122px] px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: sc.color }} />
                          <p className="font-mono text-xs text-gray-900 font-bold">{order.ORDERCODE || '—'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 pl-2.5">
                          <p className="text-xs text-gray-600">{totalItemQty} artículo{totalItemQty !== 1 ? 's' : ''}</p>
                        </div>
                      </div>

                      {/* Cliente */}
                      <div className="flex flex-col justify-center min-w-0 flex-1 px-4 py-3 border-l border-gray-200/50">
                        <p className="text-sm font-semibold text-gray-900 truncate">{order.CUSTOMERNAME}</p>
                        <p className="text-xs text-gray-500 truncate">{order.CUSTOMERPHONE || '—'}</p>
                      </div>

                      {/* Total */}
                      <div className="flex flex-col justify-center min-w-[100px] px-4 py-3 border-l border-gray-200/50">
                        <p className="text-sm font-bold text-gray-900">{formatPrice(order.TOTAL)}</p>
                        <p className="text-[10px] text-gray-400">{ageStr}</p>
                      </div>

                      {/* Status badge */}
                      <div className="flex flex-col justify-center min-w-[120px] px-4 py-3 border-l border-gray-200/50">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-center inline-flex items-center justify-center" style={{ color: sc.color, background: '#fff', border: `1px solid ${sc.color}33` }}>
                            {cfg.label}
                          </span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setWaShortcutOrderId(order.$id); }} className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-200 transition" title="Atajos WhatsApp" aria-label="Atajos WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══ Detail drawer ═══ */}
      {selectedOrder && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:max-w-md bg-white shadow-2xl overflow-y-auto" style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
            <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-bold text-gray-900">{selectedOrder.ORDERCODE}</h2>
                <p className="text-xs text-gray-400">{new Date(selectedOrder.CREATEDAT || selectedOrder.$createdAt || Date.now()).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setWaShortcutOrderId(selectedOrder.$id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-extrabold hover:bg-emerald-100 transition" title="Atajos de mensajes WhatsApp">
                  <MessageCircle className="w-4 h-4" /> Atajos
                </button>
                <button onClick={() => setSelectedId(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Resumen — mismo patrón del drawer admin */}
              <div className="flex items-center justify-between gap-2 px-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-full ${isWhatsAppOrder(selectedOrder) ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                  {isWhatsAppOrder(selectedOrder) ? '◉ Recibido por WhatsApp' : '▣ Recibido por Web'}
                </span>
                <span className="text-[10px] text-gray-400 font-medium">{selectedOrder.PAYMENTMETHOD || 'Transferencia bancaria'}</span>
              </div>
              <div className="bg-rose-50/70 rounded-2xl p-4 border border-rose-100 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider block">Monto total</span>
                  <span className="text-2xl font-black text-gray-900">{formatPrice(selectedOrder.TOTAL)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider block mb-1">Estado actual</span>
                  <span className="text-xs font-bold px-3 py-1 rounded-full inline-block" style={{
                    color: STATUS_COLORS[selectedDisplayStatus]?.color || '#6b7280',
                    background: STATUS_COLORS[selectedDisplayStatus]?.bg || '#f3f4f6',
                  }}>
                    {STATUS_CONFIG[selectedDisplayStatus]?.label || selectedDisplayStatus}
                  </span>
                </div>
              </div>

              {/* Cliente */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Cliente</h3>
                <p className="text-sm font-semibold text-gray-900">{selectedOrder.CUSTOMERNAME}</p>
                {selectedOrder.CUSTOMERPHONE && (
                  <a href={`tel:+${selectedOrder.CUSTOMERPHONE.replace(/\D/g, '')}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                    <Phone className="w-3.5 h-3.5 text-gray-400" /> {selectedOrder.CUSTOMERPHONE}
                  </a>
                )}
                {selectedOrder.CUSTOMEREMAIL && (
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" /> {selectedOrder.CUSTOMEREMAIL}
                  </p>
                )}
                {selectedOrder.ADDRESS && (
                  <p className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <span>{selectedOrder.ADDRESS}, {selectedOrder.COMUNA}, {selectedOrder.REGION}</span>
                  </p>
                )}
                {selectedOrder.SHIPPINGAGENCY && (
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Package className="w-3.5 h-3.5 text-gray-400" /> {selectedOrder.SHIPPINGAGENCY}
                  </p>
                )}
              </div>

              {/* Datos para despacho — equivalente al detalle admin */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Datos para despacho</h3>
                  <button type="button" onClick={() => copyField('shipping', [selectedOrder.CUSTOMERNAME, selectedOrder.CUSTOMERPHONE, selectedOrder.CUSTOMEREMAIL, selectedOrder.ADDRESS, selectedOrder.COMUNA, selectedOrder.REGION, selectedOrder.SHIPPINGAGENCY].filter(Boolean).join('\n'))}
                    className="text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border bg-white border-gray-200 text-gray-500 hover:bg-gray-50 transition flex items-center gap-1.5">
                    <Copy size={11} /> {copiedField === 'shipping' ? '✓ Copiado' : 'Copiar todo'}
                  </button>
                </div>
                <div className="space-y-2.5">
                  {([
                    ['Nombre', selectedOrder.CUSTOMERNAME], ['Teléfono', selectedOrder.CUSTOMERPHONE], ['Email', selectedOrder.CUSTOMEREMAIL],
                    ['Dirección', selectedOrder.ADDRESS], ['Comuna', selectedOrder.COMUNA], ['Región', selectedOrder.REGION], ['Agencia', selectedOrder.SHIPPINGAGENCY],
                  ] as [string, string | undefined][]).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">{label}</span>
                        <span className={`font-bold block ${label === 'Teléfono' ? 'text-rose-700 font-mono' : 'text-gray-800'} ${label === 'Email' || label === 'Dirección' ? 'break-words' : ''}`}>{value || '—'}</span>
                      </div>
                      {value && <button type="button" onClick={() => copyField(label, value)} className="p-1.5 rounded-md border bg-white border-gray-200 text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0" title={`Copiar ${label}`}>
                        {copiedField === label ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>}
                    </div>
                  ))}
                  {selectedOrder.PAYMENTMETHOD && <div className="border-t border-gray-200/60 pt-2.5 text-xs"><span className="text-[10px] text-gray-400 font-semibold block uppercase">Método de pago</span><span className="font-bold text-gray-800">{selectedOrder.PAYMENTMETHOD}</span></div>}
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Productos</h3>
                <div className="space-y-2">
                  {(() => {
                    let items: any[] = [];
                    try { items = JSON.parse(selectedOrder.ITEMS || '[]'); } catch {}
                    if (items.length === 0) return <p className="text-sm text-gray-400">Sin items</p>;
                    return items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {it.image && <img src={it.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{it.name || it.title || 'Producto'}</p>
                            <p className="text-xs text-gray-500">{it.qty || it.quantity || 1} × {formatPrice(it.price || it.unitPrice || 0)}</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-gray-900 shrink-0">{formatPrice(it.total || (it.qty || it.quantity || 1) * (it.price || it.unitPrice || 0))}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Totales */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatPrice(selectedOrder.SUBTOTAL)}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-200"><span>Total</span><span>{formatPrice(selectedOrder.TOTAL)}</span></div>
              </div>

              {/* Comprobante de pago */}
              {selectedOrder.PAYMENTPROOFURL && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Comprobante de pago</h3>
                  <a href={selectedOrder.PAYMENTPROOFURL} target="_blank" rel="noreferrer"
                    className="block bg-gray-50 rounded-2xl p-4 hover:bg-gray-100 transition cursor-pointer">
                    <div className="flex items-center gap-3">
                      <ImageIcon className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-700 font-medium">Ver comprobante</span>
                    </div>
                  </a>
                </div>
              )}

              {/* Cambiar estado */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Cambiar estado</h3>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map(s => {
                    const cfg = STATUS_CONFIG[s] || { label: s, bg: 'bg-gray-100', text: 'text-gray-700' };
                    const sc = STATUS_COLORS[s] || { color: '#6b7280', bg: '#f3f4f6' };
                    const isActive = selectedDisplayStatus === s;
                    return (
                      <button key={s} onClick={() => handleStatusChange(selectedOrder.$id, s)} disabled={updatingId === selectedOrder.$id}
                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 ${isActive ? 'ring-2 ring-offset-1' : ''}`}
                        style={{
                          background: isActive ? sc.bg : '#fff',
                          color: isActive ? sc.color : '#6b7280',
                          border: `1px solid ${isActive ? sc.color : '#e5e7eb'}`,
                          ['--tw-ring-color' as any]: sc.color,
                        }}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Atajos WhatsApp para el cliente del vendor */}
      {waShortcutOrderId && (() => {
        const order = orders.find(o => o.$id === waShortcutOrderId);
        if (!order) return null;
        const phone = (order.CUSTOMERPHONE || '').replace(/\D/g, '');
        const waPhone = phone.startsWith('56') ? phone : `56${phone.replace(/^0+/, '')}`;
        const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.yaxsell.cl';
        const confirmLink = `${siteUrl}/confirmar-pedido?id=${encodeURIComponent(order.$id)}`;
        const firstName = (order.CUSTOMERNAME || '').split(' ')[0] || 'cliente';
        let items: any[] = [];
        try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
        const itemsText = items.map((it: any) => `* ${it.name || it.NAME || ''} · ${it.qty || it.quantity || 1} x ${formatPrice(it.price || it.PRICE || 0)}`).join('\n');
        const code = order.ORDERCODE || '';
        const messages = [
          { label: 'Enviar link de pago y datos', icon: '📋', text: `Hola ${firstName}! Tu pedido ${code} está listo para completar.\n\nProductos:\n${itemsText}\n\nTotal: ${formatPrice(order.TOTAL)}\n\nEntra aquí para completar tus datos de envío, revisar los datos de transferencia y subir tu comprobante:\n${confirmLink}\n\nQuedamos atentos.`, },
          { label: 'Recordar comprobante', icon: '🔔', text: `Hola ${firstName}! Te recordamos que tu pedido ${code} está esperando el comprobante de pago.\n\nPuedes enviarlo y completar tus datos de despacho aquí:\n${confirmLink}\n\nGracias!`, },
          { label: 'Último aviso de pago', icon: '⚠️', text: `Hola ${firstName}! Último aviso para confirmar tu pedido ${code}. El stock reservado puede liberarse si no recibimos el pago.\n\nSube tu comprobante y completa tus datos aquí:\n${confirmLink}`, },
        ];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(8px)' }} onClick={() => setWaShortcutOrderId(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-emerald-500" /> Atajos WhatsApp</h3>
                <button onClick={() => setWaShortcutOrderId(null)} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 text-xl">×</button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-500">Pedido <span className="font-mono font-bold text-rose-700">{code}</span> · {order.CUSTOMERNAME}</p>
                {!phone && <p className="text-xs text-red-500 bg-red-50 p-3 rounded-xl">Este pedido no tiene teléfono registrado.</p>}
                {messages.map((message, index) => {
                  const href = phone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message.text)}` : '#';
                  return <a key={index} href={href} target={phone ? '_blank' : undefined} rel="noopener noreferrer" onClick={e => { if (!phone) e.preventDefault(); setWaShortcutOrderId(null); }} className={`flex items-center gap-3 p-4 rounded-2xl border-2 border-gray-100 hover:border-emerald-300 hover:bg-emerald-50 transition ${!phone ? 'opacity-40 pointer-events-none' : ''}`}>
                    <span className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center text-xl">{message.icon}</span>
                    <span className="flex-1"><span className="block font-bold text-gray-800 text-sm">{message.label}</span><span className="block text-xs text-gray-400">Abrir WhatsApp con mensaje preparado</span></span>
                    <span className="text-gray-400">›</span>
                  </a>;
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
