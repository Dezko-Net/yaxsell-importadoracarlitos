'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  collection as fsCollection,
  getCountFromServer,
  getDocs as fsGetDocs,
  limit as fsLimit,
  orderBy,
  query as fsQuery,
  startAfter,
  where as fsWhere,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, authReady, db } from '@/lib/firebase';
import { MODULE_ACCESS } from '@/lib/module-access';
import { trackRead, trackReadsBatch } from '@/lib/firebase-read-tracker';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { Order, OrderStatus } from '@/types/admin';
import { Search, RefreshCw, ChevronDown, Eye, AlertTriangle, X, Download, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Calendar, Package, Copy, Image as ImageIcon, FileImage, Loader2, Printer, ZoomIn, Maximize2, Send, Clock } from 'lucide-react';
import { getWarehouseLocationFromFeatures, getSkuFromFeatures } from '@/lib/product-features';
import { generateOrderPdf } from '@/lib/generateOrderPdf';
import Link from 'next/link';
import StockRiskBadge from '@/components/admin/StockRiskBadge';
import { getProductRisk, calculateOrderStockRisk, type OrderStockRisk } from '@/lib/stock-risk';
import { ShippingNotificationModal } from '@/components/admin/ShippingNotificationModal';
import OrdersCloudMascot from '@/components/admin/OrdersCloudMascot';
import { hasShippingData } from '@/lib/order-rules';
import { evaluateOrderWindow } from '@/lib/store-schedule';
import BulkPaymentReviewModal, { type BulkPaymentReviewOrder, type ReviewDecision } from '@/components/admin/BulkPaymentReviewModal';
import { buildBulkPaymentReviewPrintHtml } from '@/lib/bulkPaymentReviewPrint';

const STATUS_FLOW = ['payment_expired', 'paid', 'payment_review', 'payment_confirmed', 'shipped', 'delivered'];
const STOCK_CONFIRMED_STATUSES = ['paid', 'pending', 'pending_stock', 'processing'];
const FLOW_STATUS_KEYS = [...new Set([...STATUS_FLOW, 'pending', 'pending_stock', 'processing', 'negotiation', 'cancelled'])];

// Barra de Caducidad y Relojero en tiempo real para pedidos según Horario de Tienda Importadora Carlitos
function OrderExpirationBar({
  order,
  compact = false,
}: {
  order: Order;
  risk?: OrderStockRisk;
  compact?: boolean;
}) {
  const [state, setState] = useState(() => evaluateOrderWindow(order));

  useEffect(() => {
    const tick = () => {
      setState(evaluateOrderWindow(order));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order]);

  const { isPaused, isExpired, level, remainingPct, badgeText } = state;

  const badgeCls = isPaused
    ? 'bg-slate-100 text-slate-700 border-slate-300'
    : isExpired || level === 'rojo'
    ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
    : level === 'amarillo'
    ? 'bg-amber-50 text-amber-800 border-amber-300'
    : 'bg-emerald-50 text-emerald-800 border-emerald-300';

  const barGradient = isPaused
    ? 'from-slate-300 to-indigo-300'
    : isExpired || level === 'rojo'
    ? 'from-rose-500 via-red-500 to-rose-600'
    : level === 'amarillo'
    ? 'from-amber-400 via-orange-400 to-amber-500'
    : 'from-emerald-400 via-teal-400 to-emerald-500';

  return (
    <div
      className={`flex flex-col gap-1 w-full ${compact ? 'max-w-[140px]' : 'min-w-[140px] max-w-[175px]'}`}
      title={isPaused ? 'Tienda cerrada (fuera de horario). Los 20 min inician al abrir.' : `Vida útil de reserva: ${badgeText} (${remainingPct}%)`}
    >
      <div className="flex items-center justify-between gap-1 text-[10px] font-black">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${badgeCls}`}>
          {badgeText}
        </span>
        {!isPaused && (
          <span className="text-[9px] font-bold text-gray-400 font-mono">{remainingPct}%</span>
        )}
      </div>
      <div className="h-1.5 w-full bg-slate-200/90 rounded-full overflow-hidden border border-slate-300/40">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500 ${!isPaused && (isExpired || level === 'rojo') ? 'animate-pulse' : ''}`}
          style={{ width: `${remainingPct}%` }}
        />
      </div>
    </div>
  );
}

// Compatibilidad con invocaciones inline heredadas
function OrderTimer({ expiresAt }: { expiresAt: number }) {
  return <OrderExpirationBar order={{ EXPIRESAT: expiresAt, STATUS: 'paid' } as any} />;
}

// BluExpress no requiere paso extra (etiqueta se imprime antes); retiro en tienda termina antes.
const isBluexpress = (agency?: string) => !!agency && agency.toUpperCase().replace(/\s/g, '').includes('BLUEXPRESS');
const isPickup = (agency?: string) => !!agency && agency.toUpperCase() === 'RETIRO EN TIENDA';
const isVendorOrderDocument = (order: any) => order?.IS_VENDOR_ORDER === true || Boolean(order?.VENDOR_ID || order?.VENDOR_NAME);
// Pedido de agencia (no BluExpress, no retiro) ya despachado pero sin N° de seguimiento ni voucher.
const needsTracking = (o: Order) =>
  ['shipped', 'delivered'].includes(o.STATUS) &&
  !!o.SHIPPINGAGENCY && !isPickup(o.SHIPPINGAGENCY) && !isBluexpress(o.SHIPPINGAGENCY) &&
  !(o.TRACKINGNUMBER && o.TRACKINGNUMBER.trim()) && !(o.SHIPPINGPROOFURL && o.SHIPPINGPROOFURL.trim());

const STATUS_SVG: Record<string, React.ReactNode> = {
  pending:            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>,
  pending_stock:      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>,
  processing:         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6"/></svg>,
  paid:               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9 11.5l2 2 4-4"/></svg>,
  payment_expired:    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M5.6 5.6l1.8 1.8"/></svg>,
  payment_confirmed:  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>,
  payment_review:     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h4"/></svg>,
  negotiation:        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H8l-4 3V5a2 2 0 012-2h13a2 2 0 012 2z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01"/></svg>,
  shipped:            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>,
  delivered:          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M3 21h18"/><path d="M9 21v-7h6v7"/></svg>,
  cancelled:          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending:            { color: '#eab308', bg: '#fefce8' },
  pending_stock:      { color: '#eab308', bg: '#fefce8' },
  processing:         { color: '#eab308', bg: '#fefce8' },
  paid:               { color: '#eab308', bg: '#fefce8' },
  payment_expired:    { color: '#f97316', bg: '#fff7ed' },
  payment_review:     { color: '#60a5fa', bg: '#f5f9ff' },
  payment_confirmed:  { color: '#34d399', bg: '#f0fdf4' },
  negotiation:        { color: '#f472b6', bg: '#fefcfd' },
  shipped:            { color: '#a78bfa', bg: '#f3effe' },
  delivered:          { color: '#4ade80', bg: '#f7fef9' },
  cancelled:          { color: '#f87171', bg: '#feebeb' },
};

const PAGE_SIZE = 30;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  all:                { label: 'Todos',                     bg: 'bg-gray-100',    text: 'text-gray-700' },
  paid_group:         { label: 'Confirmados',               bg: 'bg-green-100',   text: 'text-green-700' },
  pending:            { label: 'Stock Confirmado',        bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  pending_stock:      { label: 'Stock Confirmado',        bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  cancelled:          { label: 'Cancelado',                 bg: 'bg-red-100',     text: 'text-red-700' },
  processing:         { label: 'Stock Confirmado',      bg: 'bg-yellow-100',    text: 'text-yellow-700' },
  paid:               { label: 'Stock Confirmado',        bg: 'bg-yellow-100',     text: 'text-yellow-700' },
  payment_expired:    { label: 'Pago vencido',             bg: 'bg-orange-100',    text: 'text-orange-700' },
  payment_review:     { label: 'Revisando Pago',          bg: 'bg-blue-100',    text: 'text-blue-700' },
  payment_confirmed:  { label: 'Pago Confirmado',         bg: 'bg-green-100',   text: 'text-green-700' },
  negotiation:        { label: 'Negociando',                bg: 'bg-pink-100',    text: 'text-pink-700' },
  shipped:            { label: 'Embalado',                   bg: 'bg-violet-100',  text: 'text-violet-700' },
  delivered:          { label: 'Entregado a Agencia',      bg: 'bg-green-100',   text: 'text-green-700' },
};

// Etiquetas cortas para los badges (evita el bug de label.split(' ')[0] que mostraba "Pago" en ambos)
const SHORT_LABEL: Record<string, string> = {
  pending:            'Stock Conf.',
  pending_stock:      'Stock Conf.',
  processing:         'Stock Conf.',
  paid:               'Stock Conf.',
  payment_expired:    'Pago vencido',
  payment_review:     'Rev. Pago',
  payment_confirmed:  'Pago Conf.',
  negotiation:        'Negociando',
  shipped:            'Embalado',
  delivered:          'Entregado',
  cancelled:          'Cancelado',
};

const STATUS_KEYS = Object.keys(STATUS_CONFIG);

const CASHIERS = [
  { name: 'Importadora Carlitos', phone: '56954592656' },
];

type DateFilter = 'all' | 'today' | 'yesterday' | 'day_before' | 'custom';
const DATE_FILTER_LABELS: Record<DateFilter, string> = { all: 'Todos', today: 'Hoy', yesterday: 'Ayer', day_before: 'Anteayer', custom: 'Rango' };

function chileDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function chileStartOfDay(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utcNoon));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  const chileOffset = localAsUtc - utcNoon;
  return Date.UTC(year, month - 1, day) - chileOffset;
}

function getOrdersDateBounds(
  filter: DateFilter,
  customStart: string,
  customEnd: string,
): { start?: number; end?: number } {
  if (filter === 'all') return {};
  const today = chileDateKey(new Date());
  let startDate: string;
  let endDate: string | undefined;
  if (filter === 'custom') {
    if (!customStart) return {};
    startDate = customStart;
    endDate = customEnd || undefined;
  } else {
    const daysAgo = filter === 'today' ? 0 : filter === 'yesterday' ? 1 : 2;
    startDate = shiftDateKey(today, -daysAgo);
    endDate = startDate;
  }
  return {
    start: chileStartOfDay(startDate),
    end: endDate ? chileStartOfDay(shiftDateKey(endDate, 1)) : undefined,
  };
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [searchResults, setSearchResults] = useState<Order[] | null>(null);

  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 2) {
      setSearchResults(null);
      setIsSearchingServer(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingServer(true);
      try {
        const res = await fetch(`/api/admin/orders/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          setSearchResults(data.orders as Order[]);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Error buscando pedidos en servidor:', err);
      } finally {
        setIsSearchingServer(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const [activeFilter, setActiveFilter] = useState(() => {
    const initialStatus = searchParams.get('status') || 'all';
    return STOCK_CONFIRMED_STATUSES.includes(initialStatus) ? 'paid' : initialStatus;
  });
  const [expiredOrdersReady, setExpiredOrdersReady] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [flowStatusCounts, setFlowStatusCounts] = useState<Record<string, number> | null>(null);
  const [flowCountsLoading, setFlowCountsLoading] = useState(false);
  const [customRangeStats, setCustomRangeStats] = useState<{ total: number; count: number; totalPaid: number; countPaid: number; topCustomer: { name: string; total: number } | null } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [registeredVendors, setRegisteredVendors] = useState<Array<{ id: string; name: string }>>([]);
  const storeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target as Node)) {
        setShowStoreDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    fetch('/api/admin/vendors?basic=true')
      .then(r => r.json())
      .then(d => {
        if (d?.vendors && Array.isArray(d.vendors)) {
          setRegisteredVendors(d.vendors.map((v: any) => ({ id: String(v.$id || v.id || ''), name: String(v.NAME || v.name || '') })));
        }
      })
      .catch(() => {});
  }, []);
  const [liveOnly, setLiveOnly] = useState(false);
  const [trackingPending, setTrackingPending] = useState(false);
  const [pickupReady, setPickupReady] = useState(false);
  const filterUserId = searchParams.get('userId') || '';
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [cashierPickerOrderId, setCashierPickerOrderId] = useState<string | null>(null);
  const [shippingProofOrderId, setShippingProofOrderId] = useState<string | null>(null);
  const [shippingProofMode, setShippingProofMode] = useState<'photo' | 'tracking' | null>(null);
  const [shippingProofFile, setShippingProofFile] = useState<File | null>(null);
  const [shippingProofTracking, setShippingProofTracking] = useState('');
  const [shippingProofUploading, setShippingProofUploading] = useState(false);
  const [cashierPickerMode, setCashierPickerMode] = useState<'stock' | 'shipping'>('stock');
  const [waShortcutOrderId, setWaShortcutOrderId] = useState<string | null>(null);
  const [shippingModalOrder, setShippingModalOrder] = useState<Order | null>(null);
  const [shippingModalData, setShippingModalData] = useState<{ message?: string; waLink?: string; autoSent?: boolean; autoSendError?: string | null } | null>(null);
  const [notifyingShippingOrderId, setNotifyingShippingOrderId] = useState<string | null>(null);
  const [confirmingStockId, setConfirmingStockId] = useState<string | null>(null);
  const [stockErrorData, setStockErrorData] = useState<{ orderCode: string; items: any[]; customerPhone: string } | null>(null);
  const [stockPreview, setStockPreview] = useState<{ orderId: string; orderCode: string; items: any[]; customerName: string; customerPhone: string; total: number } | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<{ url: string; title: string; sku?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [removedItems, setRemovedItems] = useState<Set<number>>(new Set());
  const [ordersStockMap, setOrdersStockMap] = useState<Record<string, { stock: number; pending: number }>>({});
  const [agenciesList, setAgenciesList] = useState<any[]>([]);
  const [bankDetails, setBankDetails] = useState({
    holder: 'Importadora Carlitos',
    rut: '78267426-9',
    bank: 'Banco de Chile',
    type: 'Cuenta Corriente',
    account: '4081220201',
    email: 'contacto@yaxsell.cl',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageStarts, setPageStarts] = useState<Array<QueryDocumentSnapshot | null>>([null]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [bulkReviewLoading, setBulkReviewLoading] = useState(false);
  const [bulkReviewConfirming, setBulkReviewConfirming] = useState(false);
  const [bulkReviewOrders, setBulkReviewOrders] = useState<BulkPaymentReviewOrder[]>([]);
  const [bulkReviewDecisions, setBulkReviewDecisions] = useState<Record<string, ReviewDecision>>({});
  const [bulkReviewTruncated, setBulkReviewTruncated] = useState(false);
  const [bulkReviewError, setBulkReviewError] = useState('');
  const [bulkReviewNotice, setBulkReviewNotice] = useState('');
  const [exportDateStart, setExportDateStart] = useState('');
  const [exportDateEnd, setExportDateEnd] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  // Stats cache — persists until manual refresh
  const [statsCache, setStatsCache] = useState<{ totalToday: number; countToday: number; countTodayWhatsapp?: number; countTodayWeb?: number; paymentReviewToday: number; reviewOrders?: any[]; topCustomer: { name: string; total: number } | null; avgTicket: number; totalPaid: number; countPaid: number; totalYesterday: number; countYesterday: number; } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Load stats — cacheado en sessionStorage 3 min (≈92 lecturas por refresco;
  // sin el cache, cada visita/navegación al panel repetía todas las consultas)
  const STATS_CACHE_KEY = 'yaxsel_admin_orders_stats_v3';
  const STATS_CACHE_TTL = 3 * 60 * 1000;
  const loadStats = useCallback(async (force = false) => {
    if (!force) {
      try {
        const raw = sessionStorage.getItem(STATS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.ts < STATS_CACHE_TTL && parsed.data) {
            setStatsCache(parsed.data);
            return;
          }
        }
      } catch {}
    }
    setStatsLoading(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const nowCLT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const startToday = new Date(nowCLT.getFullYear(), nowCLT.getMonth(), nowCLT.getDate(), 0, 0, 0, 0).getTime();
      const startYesterday = startToday - 86400000;
      const startDayBefore = startToday - 2 * 86400000;

      // Fetch only the last 3 days of orders for the day-bucketed stats.
      // CREATEDAT is a numeric (ms) timestamp and is indexed — Query.orderDesc /
      // greaterThanEqual on CREATEDAT are already used for the orders table — so
      // this filters server-side instead of downloading the whole collection.
      const recentResp = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
        Query.greaterThanEqual('CREATEDAT', startDayBefore),
        Query.orderDesc('CREATEDAT'),
        Query.limit(80),
      ]);
      const allOrders: any[] = recentResp.documents;

      const todayOrders = allOrders.filter((o: any) => (o.CREATEDAT || new Date(o.$createdAt).getTime()) >= startToday);
      const yesterdayOrders = allOrders.filter((o: any) => { const ts = o.CREATEDAT || new Date(o.$createdAt).getTime(); return ts >= startYesterday && ts < startToday; });
      const paidStatuses = ['processing', 'paid', 'negotiation', 'shipped', 'delivered'];
      const paidOrdersToday = todayOrders.filter((o: any) => paidStatuses.includes(o.STATUS));

      // Top customer
      const byCustomer: Record<string, { name: string; total: number }> = {};
      for (const o of todayOrders) {
        const key = o.CUSTOMERRUT || o.CUSTOMERNAME || 'anon';
        if (!byCustomer[key]) byCustomer[key] = { name: o.CUSTOMERNAME || key, total: 0 };
        byCustomer[key].total += o.TOTAL || 0;
      }
      const topEntries = Object.values(byCustomer).sort((a, b) => b.total - a.total);

      const statsData = {
        totalToday: todayOrders.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0),
        countToday: todayOrders.length,
        countTodayWhatsapp: todayOrders.filter((o: any) => o.PAYMENTMETHOD === 'WhatsApp').length,
        countTodayWeb: todayOrders.filter((o: any) => o.PAYMENTMETHOD !== 'WhatsApp').length,
        paymentReviewToday: todayOrders.filter((o: any) => String(o.STATUS || '').toLowerCase() === 'payment_review').length,
        reviewOrders: allOrders.filter((o: any) => String(o.STATUS || '').toLowerCase() === 'payment_review' || (o.STATUS === 'paid' && Boolean(o.PAYMENTPROOFURL))),
        totalYesterday: yesterdayOrders.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0),
        countYesterday: yesterdayOrders.length,
        topCustomer: topEntries[0] || null,
        avgTicket: paidOrdersToday.length > 0 ? Math.round(paidOrdersToday.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0) / paidOrdersToday.length) : 0,
        totalPaid: paidOrdersToday.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0),
        countPaid: paidOrdersToday.length,
      };
      setStatsCache(statsData);
      try { sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: statsData })); } catch {}
    } catch (e: any) { console.error('Stats error:', e); }
    finally { setStatsLoading(false); }
  }, []);

  const FLOW_COUNTS_TTL = 2 * 60 * 1000;
  const loadFlowStatusCounts = useCallback(async (force = false) => {
    const cacheKey = `yaxsel_flow_counts_v1_${dateFilter}_${customDateStart || ''}_${customDateEnd || ''}`;
    if (!force && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.counts && Date.now() - Number(parsed.ts || 0) < FLOW_COUNTS_TTL) {
            setFlowStatusCounts(parsed.counts);
            return;
          }
        }
      } catch {}
    }
    setFlowCountsLoading(true);
    try {
      const bounds = getOrdersDateBounds(dateFilter, customDateStart, customDateEnd);
      const counts = await Promise.all(FLOW_STATUS_KEYS.map(async status => {
        const constraints: any[] = [fsWhere('STATUS', '==', status)];
        if (bounds.start !== undefined) constraints.push(fsWhere('CREATEDAT', '>=', bounds.start));
        if (bounds.end !== undefined) constraints.push(fsWhere('CREATEDAT', '<', bounds.end));
        const result = await getCountFromServer(fsQuery(fsCollection(db, ORDERS_COLLECTION_ID), ...constraints));
        return [status, result.data().count] as const;
      }));
      trackReadsBatch('list', ORDERS_COLLECTION_ID, FLOW_STATUS_KEYS.length, 'flow status counts batch', new Error().stack || '');
      const countsObj = Object.fromEntries(counts);
      setFlowStatusCounts(countsObj);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), counts: countsObj }));
        } catch {}
      }
    } catch (err) {
      console.error('[orders] Error sincronizando conteos del flujo:', err);
      setFlowStatusCounts(null);
    } finally {
      setFlowCountsLoading(false);
    }
  }, [dateFilter, customDateStart, customDateEnd]);

  const reconcileExpiredOrders = useCallback(async () => {
    await authReady;
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;

    const response = await fetch('/api/admin/orders/reconcile-expired', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`No se pudieron sincronizar pedidos vencidos (${response.status})`);
    }
    return response.json();
  }, []);

  // Custom date-range stats: fetched on demand via API route (usa Firestore directo)
  useEffect(() => {
    if (dateFilter !== 'custom' || !customDateStart) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ start: customDateStart });
        if (customDateEnd) params.set('end', customDateEnd);
        const res = await fetch(`/api/admin/orders/range-stats?${params}`);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (cancelled) return;
        setCustomRangeStats({
          total: data.total || 0,
          count: data.count || 0,
          totalPaid: data.totalPaid || 0,
          countPaid: data.countPaid || 0,
          topCustomer: data.topCustomer || null,
        });
      } catch (e) {
        console.error('[orders] Error fetching custom range stats:', e);
        if (!cancelled) {
          setCustomRangeStats({ total: 0, count: 0, totalPaid: 0, countPaid: 0, topCustomer: null });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dateFilter, customDateStart, customDateEnd]);

  // Load agencies list
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agencies');
        const data = await res.json();
        if (data.agencies) setAgenciesList(data.agencies);
      } catch {}
    })();

    // Cargar datos bancarios desde Firestore para los shortcuts de WhatsApp
    (async () => {
      try {
        const res = await fetch('/api/store-settings', { cache: 'no-store' });
        const data = await res.json();
        if (data) {
          setBankDetails({
            holder: data.bankAccountHolder || 'Importadora Carlitos',
            rut: data.bankRut || '78267426-9',
            bank: data.bankName || 'Banco de Chile',
            type: data.bankAccountType || 'Cuenta Corriente',
            account: data.bankAccountNumber || '4081220201',
            email: data.bankEmail || 'contacto@yaxsell.cl',
          });
        }
      } catch {}
    })();
  }, []);

  const getAgencyDetails = (name: string) => {
    if (!name) return null;
    const found = agenciesList.find(a => a.name.toUpperCase() === name.toUpperCase());
    return {
      name: found?.name || name,
      color: found?.color || '#6d28d9',
      bg: found?.bg || '#f5f3ff',
      logo: found?.logo || ''
    };
  };

  const toggleSort = (col: 'date' | 'total') => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };
  const load = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError('');
    try {
      const isVendorMode = vendorFilter === 'vendors' || (vendorFilter !== 'all' && vendorFilter !== 'main');

      // ── MODO TIENDAS ALIADAS: consultar directamente pedidos de vendors para no fragmentar por páginas ──
      if (isVendorMode) {
        const snap = await fsGetDocs(fsQuery(
          fsCollection(db, ORDERS_COLLECTION_ID),
          fsWhere('IS_VENDOR_ORDER', '==', true),
          fsLimit(150)
        ));

        trackReadsBatch('list', ORDERS_COLLECTION_ID, snap.docs.length, `vendor docs (${snap.docs.length})`, new Error().stack || '');

        const bounds = getOrdersDateBounds(dateFilter, customDateStart, customDateEnd);

        let vendorDocs = snap.docs.map(orderDoc => {
          const data = orderDoc.data();
          const vendorStatus = isVendorOrderDocument(data) && data.STATUS === 'payment_expired'
            ? (data.PAYMENTPROOFURL ? 'payment_review' : 'paid')
            : data.STATUS;
          return {
            $id: orderDoc.id,
            $createdAt: data.$createdAt || (orderDoc as any).createTime?.toMillis?.()?.toString() || '',
            $updatedAt: data.$updatedAt || (orderDoc as any).updateTime?.toMillis?.()?.toString() || '',
            ...data,
            ...(vendorStatus ? { STATUS: vendorStatus } : {}),
          };
        }).filter(Boolean) as unknown as Order[];

        // Filtrar por tienda específica si no es 'vendors' (todas las tiendas)
        if (vendorFilter !== 'vendors') {
          const target = vendorFilter.toLowerCase().trim();
          vendorDocs = vendorDocs.filter(o => {
            const vName = String((o as any).VENDOR_NAME || '').toLowerCase().trim();
            const vId = String((o as any).VENDOR_ID || '').toLowerCase().trim();
            return vName === target || vId === target || vName.includes(target);
          });
        }

        // Filtrar por estado activo
        if (activeFilter === 'paid_group') {
          const allowed = new Set([...STOCK_CONFIRMED_STATUSES, 'payment_review', 'negotiation', 'shipped', 'delivered']);
          vendorDocs = vendorDocs.filter(o => allowed.has(o.STATUS));
        } else if (STOCK_CONFIRMED_STATUSES.includes(activeFilter)) {
          const allowed = new Set(STOCK_CONFIRMED_STATUSES);
          vendorDocs = vendorDocs.filter(o => allowed.has(o.STATUS));
        } else if (activeFilter !== 'all') {
          vendorDocs = vendorDocs.filter(o => o.STATUS === activeFilter);
        }

        // Filtrar por rango de fechas
        if (bounds.start !== undefined) vendorDocs = vendorDocs.filter(o => Number(o.CREATEDAT || 0) >= bounds.start!);
        if (bounds.end !== undefined) vendorDocs = vendorDocs.filter(o => Number(o.CREATEDAT || 0) < bounds.end!);

        // Ordenar por fecha descendente
        vendorDocs.sort((a, b) => {
          const ta = Number(a.CREATEDAT || 0) || new Date(a.$createdAt).getTime() || 0;
          const tb = Number(b.CREATEDAT || 0) || new Date(b.$createdAt).getTime() || 0;
          return tb - ta;
        });

        setOrders(vendorDocs);
        setHasNextPage(false);
        setCurrentPage(1);
        setPageStarts([null]);
        return;
      }

      // ── MODO ESTÁNDAR / CENTRAL / TODAS ──
      const cursor = page === 1 ? null : pageStarts[page - 1];
      if (page > 1 && !cursor) return;

      const constraints: any[] = [orderBy('CREATEDAT', 'desc')];
      const bounds = getOrdersDateBounds(dateFilter, customDateStart, customDateEnd);
      if (activeFilter === 'paid_group') {
        constraints.push(fsWhere('STATUS', 'in', [...STOCK_CONFIRMED_STATUSES, 'payment_review', 'negotiation', 'shipped', 'delivered']));
      } else if (STOCK_CONFIRMED_STATUSES.includes(activeFilter)) {
        constraints.push(fsWhere('STATUS', 'in', STOCK_CONFIRMED_STATUSES));
      } else if (activeFilter !== 'all') {
        constraints.push(fsWhere('STATUS', '==', activeFilter));
      }
      if (bounds.start !== undefined) constraints.push(fsWhere('CREATEDAT', '>=', bounds.start));
      if (bounds.end !== undefined) constraints.push(fsWhere('CREATEDAT', '<', bounds.end));
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(fsLimit(PAGE_SIZE));

      const snap = await fsGetDocs(fsQuery(fsCollection(db, ORDERS_COLLECTION_ID), ...constraints));
      trackReadsBatch('list', ORDERS_COLLECTION_ID, snap.docs.length, `orders page ${page} (${snap.docs.length})`, new Error().stack || '');
      // Si la última página tuvo menos pedidos que PAGE_SIZE, confirmamos fin
      if (snap.empty && page > 1) {
        setHasNextPage(false);
        setPageStarts(previous => previous.slice(0, page));
        return;
      }
      const visibleDocs = snap.docs;
      const hasMore = visibleDocs.length === PAGE_SIZE;
      const newOrders = visibleDocs.map(orderDoc => {
        const data = orderDoc.data();
        if (activeFilter === 'payment_expired' && isVendorOrderDocument(data)) return null;
        const vendorStatus = isVendorOrderDocument(data) && data.STATUS === 'payment_expired'
          ? (data.PAYMENTPROOFURL ? 'payment_review' : 'paid')
          : data.STATUS;
        return {
          $id: orderDoc.id,
          $createdAt: data.$createdAt || (orderDoc as any).createTime?.toMillis?.()?.toString() || '',
          $updatedAt: data.$updatedAt || (orderDoc as any).updateTime?.toMillis?.()?.toString() || '',
          ...data,
          ...(vendorStatus ? { STATUS: vendorStatus } : {}),
        };
      }).filter(Boolean) as unknown as Order[];
      setOrders(newOrders);
      setHasNextPage(hasMore);
      setCurrentPage(page);
      setPageStarts(previous => {
        const next = page === 1 ? [null] : previous.slice(0, page);
        next[page] = hasMore ? visibleDocs[visibleDocs.length - 1] : null;
        return next;
      });
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, [activeFilter, dateFilter, customDateStart, customDateEnd, vendorFilter, pageStarts]);

  const autoDeliverShippedOrders = useCallback(async () => {
    try {
      const lastCheck = localStorage.getItem('yaxsel-last-auto-delivery-check');
      const now = Date.now();
      if (lastCheck && now - parseInt(lastCheck) < 4 * 60 * 60 * 1000) {
        return;
      }
      
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
      
      const resp = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
        Query.equal('STATUS', 'shipped'),
        Query.lessThan('UPDATEDAT', twoDaysAgo),
        Query.limit(20)
      ]);
      
      localStorage.setItem('yaxsel-last-auto-delivery-check', now.toString());
      
      if (resp.documents.length === 0) return;

      // Notificaciones movidas a API route para evitar importar firebase-admin en el cliente
      for (const doc of resp.documents) {
        const orderId = doc.$id;
        await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
          STATUS: 'delivered',
          UPDATEDAT: now
        });
        // Notificar via API route (server-side)
        fetch('/api/admin/notify-order-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: doc, prevStatus: 'shipped', newStatus: 'delivered' }),
        }).catch(() => {});
      }

      await load(1);
    } catch (err) {
      console.error('Error auto-delivering orders:', err);
    }
  }, [load, loadFlowStatusCounts]);

  // Re-fetch the same period and status shown by the flow, restarting pagination.
  useEffect(() => {
    if (!expiredOrdersReady) return;
    setCurrentPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, dateFilter, customDateStart, customDateEnd, vendorFilter, expiredOrdersReady]);

  // Cargar stock físico consolidado para los productos de los pedidos visibles
  useEffect(() => {
    if (!orders || orders.length === 0) return;

    // 1. Hidratar de inmediato desde catálogo local en sessionStorage si existe
    try {
      const localProds = sessionStorage.getItem('carlitos_admin_products_all_v1');
      if (localProds) {
        const parsed = JSON.parse(localProds);
        if (Array.isArray(parsed?.products)) {
          const seedMap: Record<string, { stock: number; pending: number }> = {};
          for (const p of parsed.products) {
            const s = Number(p.STOCK ?? p.stock ?? 0);
            if (p.$id) seedMap[p.$id] = { stock: s, pending: 0 };
            if (p.SKU || p.sku) seedMap[String(p.SKU || p.sku)] = { stock: s, pending: 0 };
            if (p.NAME || p.name) seedMap[String(p.NAME || p.name)] = { stock: s, pending: 0 };
          }
          setOrdersStockMap(prev => ({ ...seedMap, ...prev }));
        }
      }
    } catch {}

    // 2. Extraer todos los ítems únicos de los pedidos visibles y en revisión de pago
    const itemsToQuery: Array<{ id?: string; sku?: string; name?: string }> = [];
    const ordersToCheck = [...orders, ...(statsCache?.reviewOrders || [])];
    for (const order of ordersToCheck) {
      try {
        const parsedItems = typeof order.ITEMS === 'string' ? JSON.parse(order.ITEMS || '[]') : (order.ITEMS || []);
        for (const it of parsedItems) {
          itemsToQuery.push({
            id: it.id || it.pid || it.productId,
            sku: it.sku || it.SKU,
            name: it.name || it.NAME,
          });
        }
      } catch {}
    }

    if (itemsToQuery.length === 0) return;

    // 3. Consultar stock fresco en lote al endpoint optimizado
    let cancelled = false;
    fetch('/api/admin/orders/batch-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemsToQuery }),
    })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data?.stockMap) {
          setOrdersStockMap(prev => ({ ...prev, ...data.stockMap }));
        }
      })
      .catch(err => {
        console.warn('Error obteniendo stock batch para pedidos:', err);
      });

    return () => { cancelled = true; };
  }, [orders, statsCache?.reviewOrders]);

  const getOrderRisk = useCallback((order: Order): OrderStockRisk => {
    let rawItems: any[] = [];
    try { rawItems = typeof order.ITEMS === 'string' ? JSON.parse(order.ITEMS || '[]') : (order.ITEMS || []); } catch {}
    const isOrderStockDeducted = (order as any).STOCKDEDUCTED === true || ['paid', 'payment_review', 'payment_confirmed', 'processing', 'negotiation', 'shipped', 'delivered'].includes(String(order.STATUS || '').toLowerCase());
    return calculateOrderStockRisk(
      rawItems.map((it: any) => {
        const key = it.id || it.sku || it.name;
        const entry = key ? ordersStockMap[key] || (it.sku ? ordersStockMap[it.sku] : undefined) || (it.id ? ordersStockMap[it.id] : undefined) : undefined;
        let stockVal = entry?.stock !== undefined ? entry.stock : (it.currentStock !== undefined ? it.currentStock : null);
        const itemQty = Number(it.qty || it.quantity || 1);
        if (isOrderStockDeducted && stockVal !== null) {
          stockVal += itemQty;
        }
        return {
          qty: itemQty,
          stock: stockVal,
          name: it.name,
          sku: it.sku,
          price: Number(it.price || it.CURRENTPRICE || it.PRICE || 0),
        };
      })
    );
  }, [ordersStockMap]);

  const handleOpenStockPreview = useCallback(async (order: Order) => {
    setConfirmingStockId(order.$id);
    setPreviewLoading(true);
    try {
      const previewResp = await fetch(`/api/catalogo/confirm-stock?orderId=${encodeURIComponent(order.$id)}`);
      const previewData = await previewResp.json();
      if (previewData.error) {
        alert(previewData.error);
        return;
      }
      setRemovedItems(new Set());
      setStockPreview({
        orderId: order.$id,
        orderCode: order.ORDERCODE,
        items: previewData.items || [],
        customerName: previewData.customerName || '',
        customerPhone: previewData.customerPhone || '',
        total: previewData.total || 0,
      });
      setTimelineOrderId(null);
    } catch (err) {
      console.error('Error cargando previsualización de stock:', err);
      alert('Error al cargar previsualización de stock');
    } finally {
      setConfirmingStockId(null);
      setPreviewLoading(false);
    }
  }, []);

  // Sincroniza los vencimientos antes de consultar pedidos y conteos.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await reconcileExpiredOrders();
      } catch (err) {
        console.error('[orders] No se pudieron reconciliar pedidos vencidos:', err);
      } finally {
        if (active) setExpiredOrdersReady(true);
      }
    })();
    return () => { active = false; };
  }, [reconcileExpiredOrders]);

  // Stats y auto-entrega: solo al montar (no dependen del filtro activo).
  // Antes se repetían las ~92 lecturas de stats en cada cambio de pestaña.
  useEffect(() => {
    if (!expiredOrdersReady) return;
    autoDeliverShippedOrders();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredOrdersReady]);

  useEffect(() => {
    if (!expiredOrdersReady) return;
    loadFlowStatusCounts();
    // Los conteos solo se actualizan al entrar o al pulsar Actualizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredOrdersReady]);


  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(o => o.$id)));

  const bulkDeleteOrders = async () => {
    if (selected.size === 0) return;
    if (!confirm(`¿Estás seguro de que quieres eliminar PERMANENTEMENTE ${selected.size} pedido(s)? Esta acción no se puede deshacer y liberará el stock reservado si los pedidos estaban activos.`)) return;
    setBulkUpdating(true);
    try {
      const selectedIds = Array.from(selected);
      const res = await fetch('/api/admin/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al eliminar pedidos');
      }

      try { await fetch('/api/revalidate?tag=orders'); } catch {}
      try { await fetch('/api/revalidate?tag=products'); } catch {}

      alert(`${data.deletedCount || selectedIds.length} pedido(s) eliminado(s)${data.stockRestoredCount ? ` (${data.stockRestoredCount} pedido(s) restituyeron su stock)` : ''}`);
      setSelected(new Set());
      load(1);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar pedidos');
    } finally {
      setBulkUpdating(false);
    }
  };

  const bulkUpdateStatus = async (newStatus: string) => {
    if (selected.size === 0) return;
    setBulkUpdating(true);
    try {
      const selectedOrders = orders.filter(o => selected.has(o.$id));
      await Promise.all(selectedOrders.map(o =>
        fetch('/api/admin/orders/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: o.$id, newStatus }),
        })
      ));

      // Notificar via API route (server-side)
      await Promise.all(
        selectedOrders.map(o =>
          fetch('/api/admin/notify-order-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: o, prevStatus: o.STATUS, newStatus }),
          }).catch(() => {})
        )
      );
      setOrders(prev => prev.map(o => selected.has(o.$id) ? { ...o, STATUS: newStatus as OrderStatus } : o));
      setSelected(new Set());
      try { await fetch('/api/revalidate?tag=orders'); } catch {}
      await load(1);
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBulkUpdating(false); }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    // Client-side validation: cannot set to "delivered" without shipping proof or tracking
    if (newStatus === 'delivered') {
      const orderBefore = orders.find(o => o.$id === orderId);
      const hasShippingProof = !!(orderBefore as any)?.SHIPPINGPROOFURL;
      const hasTrackingNumber = !!(orderBefore as any)?.TRACKINGNUMBER;
      if (!hasShippingProof && !hasTrackingNumber) {
        setShippingProofOrderId(orderId);
        return;
      }
    }
    setUpdatingId(orderId);
    const orderBefore = orders.find(o => o.$id === orderId);
    const prevStatus = orderBefore?.STATUS;
    setOrders(prev => prev.map(o => o.$id === orderId ? { ...o, STATUS: newStatus as OrderStatus } : o));
    try {
      const res = await fetch('/api/admin/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al actualizar estado del pedido');
      }

      // Actualizar conteos en memoria y sessionStorage sin relanzar 25+ lecturas
      setFlowStatusCounts(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        if (prevStatus && next[prevStatus] !== undefined) next[prevStatus] = Math.max(0, next[prevStatus] - 1);
        if (next[newStatus] !== undefined) next[newStatus] = (next[newStatus] || 0) + 1;
        try {
          const cacheKey = `yaxsel_flow_counts_v1_${dateFilter}_${customDateStart || ''}_${customDateEnd || ''}`;
          sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), counts: next }));
        } catch {}
        return next;
      });
      if (orderBefore) {
        // Notificar via API route (server-side)
        await fetch('/api/admin/notify-order-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: orderBefore, prevStatus, newStatus }),
        }).catch(() => {});
      }
    } catch (e: any) {
      if (prevStatus) setOrders(prev => prev.map(o => o.$id === orderId ? { ...o, STATUS: prevStatus as OrderStatus } : o));
      alert('Error: ' + e.message);
    }
    finally { setUpdatingId(null); }
  };

  const handleNotifyShippingData = async (order: Order) => {
    if (!order.CUSTOMERPHONE) {
      alert('Este pedido no tiene un número de teléfono registrado del cliente.');
      return;
    }
    setNotifyingShippingOrderId(order.$id);
    try {
      const res = await fetch('/api/admin/orders/notify-shipping-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.$id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al procesar notificación');
      }
      setShippingModalOrder(order);
      setShippingModalData(data);
    } catch (err: any) {
      alert('Error al solicitar datos de envío: ' + err.message);
    } finally {
      setNotifyingShippingOrderId(null);
    }
  };

  const submitShippingProof = async () => {
    if (!shippingProofOrderId) return;
    if (shippingProofMode === 'photo' && !shippingProofFile) { alert('Selecciona una foto'); return; }
    if (shippingProofMode === 'tracking' && !shippingProofTracking.trim()) { alert('Ingresa el número de seguimiento'); return; }
    setShippingProofUploading(true);
    try {
      const formData = new FormData();
      formData.append('orderId', shippingProofOrderId);
      if (shippingProofMode === 'photo' && shippingProofFile) {
        formData.append('file', shippingProofFile);
      }
      if (shippingProofMode === 'tracking' && shippingProofTracking.trim()) {
        formData.append('trackingNumber', shippingProofTracking.trim());
      }
      const res = await fetch('/api/admin/orders/shipping-proof', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al guardar');
      // Update local state
      setOrders(prev => prev.map(o => o.$id === shippingProofOrderId ? {
        ...o,
        SHIPPINGPROOFURL: data.shippingProofUrl || (o as any).SHIPPINGPROOFURL,
        TRACKINGNUMBER: data.trackingNumber || (o as any).TRACKINGNUMBER,
      } as any : o));
      // Close modal and proceed to delivered
      const orderId = shippingProofOrderId;
      closeShippingProofModal();
      // Now change status to delivered
      updateStatus(orderId, 'delivered');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setShippingProofUploading(false);
    }
  };

  const closeShippingProofModal = () => {
    setShippingProofOrderId(null);
    setShippingProofMode(null);
    setShippingProofFile(null);
    setShippingProofTracking('');
    setShippingProofUploading(false);
  };

  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const getBulkReviewToken = async () => {
    await authReady;
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Tu sesión no está activa. Inicia sesión nuevamente.');
    return currentUser.getIdToken();
  };

  const openBulkPaymentReview = async () => {
    setBulkReviewOpen(true);
    setBulkReviewLoading(true);
    setBulkReviewError('');
    setBulkReviewNotice('');
    setBulkReviewOrders([]);
    setBulkReviewDecisions({});
    setBulkReviewTruncated(false);

    try {
      const token = await getBulkReviewToken();
      const bounds = getOrdersDateBounds(dateFilter, customDateStart, customDateEnd);
      const params = new URLSearchParams();
      if (bounds.start !== undefined) params.set('start', String(bounds.start));
      if (bounds.end !== undefined) params.set('end', String(bounds.end));
      const queryString = params.toString();
      const response = await fetch(`/api/admin/orders/payment-review${queryString ? `?${queryString}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los pedidos.');

      const searchTerm = search.trim().toLowerCase();
      const filteredReviewOrders = (Array.isArray(data.orders) ? data.orders : []).filter((order: BulkPaymentReviewOrder) => {
        if (filterUserId && (order as any).USERID !== filterUserId) return false;
        if (searchTerm && ![
          order.ORDERCODE,
          order.CUSTOMERNAME,
          order.CUSTOMERRUT,
          order.CUSTOMERPHONE,
          order.CUSTOMEREMAIL,
          order.VENDOR_NAME,
        ].some(value => String(value || '').toLowerCase().includes(searchTerm))) return false;
        if (paymentFilter !== 'all' && (order.PAYMENTMETHOD || 'Sin método') !== paymentFilter) return false;
        if (sourceFilter === 'whatsapp' && order.PAYMENTMETHOD !== 'WhatsApp') return false;
        if (sourceFilter === 'web' && order.PAYMENTMETHOD === 'WhatsApp') return false;
        if (regionFilter !== 'all' && order.REGION !== regionFilter) return false;
        if (vendorFilter === 'vendors' && !order.IS_VENDOR_ORDER) return false;
        if (vendorFilter === 'main' && order.IS_VENDOR_ORDER) return false;
        if (vendorFilter !== 'all' && vendorFilter !== 'vendors' && vendorFilter !== 'main') {
          const target = vendorFilter.toLowerCase();
          if (String(order.VENDOR_NAME || '').toLowerCase() !== target && String(order.VENDOR_ID || '').toLowerCase() !== target) return false;
        }
        if (liveOnly && !order.PURCHASEDFROMLIVE) return false;
        if (trackingPending || pickupReady) return false;
        return true;
      });

      setBulkReviewOrders(filteredReviewOrders);
      setBulkReviewTruncated(Boolean(data.truncated));
    } catch (error: any) {
      setBulkReviewError(error?.message || 'No se pudieron cargar los pedidos para revisar.');
    } finally {
      setBulkReviewLoading(false);
    }
  };

  const confirmBulkPaymentReview = async () => {
    const selectedOrders = bulkReviewOrders.filter(order => bulkReviewDecisions[order.$id] === 'yes');
    if (!selectedOrders.length || bulkReviewTruncated || bulkReviewLoading) return;

    // Open synchronously from the user click so the browser does not block printing after the API call.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setBulkReviewError('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo nuevamente.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write('<!doctype html><title>Preparando revisión de pagos…</title><body style="font:16px Arial;padding:32px;color:#334155">Confirmando pagos y preparando el PDF…</body>');
    printWindow.document.close();

    setBulkReviewConfirming(true);
    setBulkReviewError('');
    try {
      const token = await getBulkReviewToken();
      const response = await fetch('/api/admin/orders/payment-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds: selectedOrders.map(order => order.$id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron confirmar los pagos.');

      const confirmedIds = new Set<string>(Array.isArray(data.confirmedIds) ? data.confirmedIds : []);
      const confirmedOrders = selectedOrders.filter(order => confirmedIds.has(order.$id));
      if (confirmedOrders.length === 0) throw new Error('No se confirmó ningún pedido. Actualiza la lista e inténtalo nuevamente.');

      setOrders(current => current.map(order => confirmedIds.has(order.$id) ? { ...order, STATUS: 'payment_confirmed' } : order));
      setSelected(current => new Set([...current].filter(id => !confirmedIds.has(id))));
      setBulkReviewOpen(false);
      setBulkReviewNotice(`${confirmedOrders.length} pago${confirmedOrders.length === 1 ? '' : 's'} confirmado${confirmedOrders.length === 1 ? '' : 's'} e incluido${confirmedOrders.length === 1 ? '' : 's'} en el PDF.`);
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setBulkReviewNotice(current => `${current} Hubo ${data.errors.length} aviso${data.errors.length === 1 ? '' : 's'} con reservas de stock; revísalos en la lista actualizada.`);
      }

      const html = buildBulkPaymentReviewPrintHtml(confirmedOrders);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      const imageLoads = Array.from(printWindow.document.images).map(image => new Promise<void>(resolve => {
        if (image.complete) return resolve();
        image.onload = () => resolve();
        image.onerror = () => resolve();
      }));
      await Promise.race([Promise.all(imageLoads), new Promise<void>(resolve => setTimeout(resolve, 7000))]);
      if (!printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
      await load(1);
    } catch (error: any) {
      if (!printWindow.closed) printWindow.close();
      setBulkReviewError(error?.message || 'No se pudo terminar la confirmación masiva.');
    } finally {
      setBulkReviewConfirming(false);
    }
  };

  const EXPORT_EXCLUDED_STATUSES = ['negotiation', 'pending', 'cancelled'];

  const exportOrdersImage = async () => {
    setExportLoading(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Determine date range with 6pm cutoff logic
      // If today is 30-06 and user selects 29→30, range = 28-06 18:00 to 30-06 18:00
      // Default: yesterday to today
      const nowCLT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const todayStr = nowCLT.toISOString().slice(0, 10);
      const yesterday = new Date(nowCLT.getTime() - 86400000);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const startDateStr = exportDateStart || yesterdayStr;
      const endDateStr = exportDateEnd || todayStr;

      // start = (startDate - 1 day) at 18:00 CLT (UTC-3)
      const startDateObj = new Date(startDateStr + 'T00:00:00-03:00');
      startDateObj.setDate(startDateObj.getDate() - 1);
      startDateObj.setHours(18, 0, 0, 0);
      const startTs = startDateObj.getTime();

      // end = endDate at 18:00 CLT
      const endDateObj = new Date(endDateStr + 'T00:00:00-03:00');
      endDateObj.setHours(18, 0, 0, 0);
      const endTs = endDateObj.getTime();

      // Fetch orders in range, excluding negotiation/pending/cancelled
      const allFetched: any[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const queries: any[] = [
          Query.greaterThanEqual('CREATEDAT', startTs),
          Query.lessThan('CREATEDAT', endTs),
          Query.orderDesc('CREATEDAT'),
          Query.limit(100),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const resp = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, queries);
        allFetched.push(...resp.documents);
        if (resp.documents.length < 100) break;
        cursor = resp.documents[resp.documents.length - 1].$id;
      }

      const exportOrders = allFetched.filter((o: any) => !EXPORT_EXCLUDED_STATUSES.includes(o.STATUS));

      if (exportOrders.length === 0) {
        alert('No hay pedidos para exportar en el rango seleccionado.');
        return;
      }

      // Generate image with Canvas
      const W = 800;
      const rowH = 40;
      const headerH = 120;
      const footerH = 60;
      const tableHeaderH = 36;
      const H = headerH + tableHeaderH + exportOrders.length * rowH + footerH;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Header gradient
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, headerH);

      // Header text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Resumen de Pedidos', 24, 40);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const rangeLabel = `${new Date(startTs).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${new Date(endTs).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
      ctx.fillText(rangeLabel, 24, 64);

      const totalSum = exportOrders.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${exportOrders.length} pedidos · Total: ${fmt(totalSum)}`, 24, 92);

      // Table header
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, headerH, W, tableHeaderH);
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 12px sans-serif';
      const cols = [
        { label: 'Código', x: 24, w: 120 },
        { label: 'Cliente', x: 154, w: 200 },
        { label: 'Estado', x: 364, w: 140 },
        { label: 'Método', x: 514, w: 100 },
        { label: 'Total', x: 624, w: 150 },
      ];
      cols.forEach(c => { ctx.fillText(c.label, c.x, headerH + 23); });

      // Separator line
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(0, headerH + tableHeaderH);
      ctx.lineTo(W, headerH + tableHeaderH);
      ctx.stroke();

      // Rows
      ctx.font = '12px sans-serif';
      exportOrders.forEach((o: any, i: number) => {
        const y = headerH + tableHeaderH + i * rowH;
        if (i % 2 === 0) {
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(0, y, W, rowH);
        }
        ctx.fillStyle = '#111827';
        ctx.fillText((o.ORDERCODE || '').slice(0, 14), cols[0].x, y + 25);
        ctx.fillText((o.CUSTOMERNAME || '').slice(0, 28), cols[1].x, y + 25);

        const stCfg = STATUS_CONFIG[o.STATUS] || { label: o.STATUS };
        ctx.fillStyle = STATUS_COLORS[o.STATUS]?.color || '#6b7280';
        ctx.fillText(stCfg.label.slice(0, 18), cols[2].x, y + 25);

        ctx.fillStyle = '#374151';
        ctx.fillText((o.PAYMENTMETHOD || '-').slice(0, 14), cols[3].x, y + 25);

        ctx.fillStyle = '#059669';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(fmt(o.TOTAL || 0), cols[4].x, y + 25);
        ctx.font = '12px sans-serif';

        // Row separator
        ctx.strokeStyle = '#f3f4f6';
        ctx.beginPath();
        ctx.moveTo(0, y + rowH);
        ctx.lineTo(W, y + rowH);
        ctx.stroke();
      });

      // Footer
      const footerY = headerH + tableHeaderH + exportOrders.length * rowH;
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, footerY, W, footerH);
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Generado el ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`, 24, footerY + 35);
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Total: ${fmt(totalSum)}`, W - 24, footerY + 35);
      ctx.textAlign = 'left';

      // Download
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `pedidos_${startDateStr}_a_${endDateStr}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setShowExportModal(false);
    } catch (e: any) {
      console.error('Export image error:', e);
      alert('Error al generar la imagen: ' + e.message);
    } finally {
      setExportLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Código', 'Cliente', 'RUT', 'Teléfono', 'Región', 'Comuna', 'Total', 'Estado', 'Método Pago', 'Cupón', 'Items', 'Notas Admin', 'Fecha'];
    const rows = filtered.map(o => {
      let itemCount = 0;
      try { itemCount = JSON.parse(o.ITEMS || '[]').length; } catch {}
      return [
        o.ORDERCODE || '',
        o.CUSTOMERNAME || '',
        o.CUSTOMERRUT || '',
        o.CUSTOMERPHONE || '',
        o.REGION || '',
        o.COMUNA || '',
        o.TOTAL,
        (STATUS_CONFIG[o.STATUS]?.label || o.STATUS),
        o.PAYMENTMETHOD || '',
        (o as any).COUPONCODE || '',
        itemCount,
        (o as any).adminNotes || '',
        o.CREATEDAT ? new Date(o.CREATEDAT).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : new Date(o.$createdAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `pedidos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const sourceOrders = searchResults !== null ? searchResults : orders;

  // Pedidos para confirmar pago con stock crítico (≤ 20% o 0% en caja)
  const activeReviewOrders = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) {
      if (isVendorOrderDocument(o)) continue;
      if (String(o.STATUS || '').toLowerCase() === 'payment_review' || (o.STATUS === 'paid' && Boolean(o.PAYMENTPROOFURL))) {
        map.set(o.$id, o);
      }
    }
    if (statsCache?.reviewOrders) {
      for (const o of statsCache.reviewOrders) {
        if (isVendorOrderDocument(o)) continue;
        if (!map.has(o.$id)) {
          map.set(o.$id, o as Order);
        }
      }
    }
    return Array.from(map.values());
  }, [orders, statsCache?.reviewOrders]);

  const criticalReviewOrders = useMemo(() => {
    return activeReviewOrders.filter(o => {
      const r = getOrderRisk(o);
      return r.pct <= 20 || r.level === 'rojo' || r.hasRed;
    });
  }, [activeReviewOrders, getOrderRisk]);

  const soldOutReviewCount = useMemo(() => {
    return criticalReviewOrders.filter(o => getOrderRisk(o).pct === 0).length;
  }, [criticalReviewOrders, getOrderRisk]);

  const sortedFiltered = [...sourceOrders].sort((a, b) => {
    // Cuando se filtra por 'revisando pago', mostrar primero los que menor porcentaje tengan (0%, 10%, 15%, 20%)
    if (activeFilter === 'payment_review') {
      const vendorA = isVendorOrderDocument(a);
      const vendorB = isVendorOrderDocument(b);
      if (vendorA !== vendorB) return vendorA ? 1 : -1;
      if (vendorA && vendorB) {
        const ta = a.CREATEDAT || new Date(a.$createdAt).getTime();
        const tb = b.CREATEDAT || new Date(b.$createdAt).getTime();
        return ta - tb;
      }
      const riskA = getOrderRisk(a);
      const riskB = getOrderRisk(b);
      if (riskA.pct !== riskB.pct) {
        return riskA.pct - riskB.pct; // Menor porcentaje primero
      }
      const ta = a.CREATEDAT || new Date(a.$createdAt).getTime();
      const tb = b.CREATEDAT || new Date(b.$createdAt).getTime();
      return ta - tb;
    }

    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'total') return (a.TOTAL - b.TOTAL) * mul;
    const ta = a.CREATEDAT || new Date(a.$createdAt).getTime();
    const tb = b.CREATEDAT || new Date(b.$createdAt).getTime();
    return (ta - tb) * mul;
  });

  const paymentMethods = ['all', ...Array.from(new Set(sourceOrders.map(o => o.PAYMENTMETHOD || 'Sin método').filter(Boolean)))];
  const regions = ['all', ...Array.from(new Set(sourceOrders.map(o => (o as any).REGION || '').filter(Boolean))).sort()];

  const centralOrdersCount = useMemo(() => {
    return sourceOrders.filter(o => !Boolean((o as any).IS_VENDOR_ORDER || (o as any).VENDOR_NAME)).length;
  }, [sourceOrders]);

  const vendorStoresWithOrders = useMemo(() => {
    const countsMap = new Map<string, { name: string; count: number }>();
    for (const v of registeredVendors) {
      if (v.name) {
        countsMap.set(v.name.toLowerCase().trim(), { name: v.name.trim(), count: 0 });
      }
    }
    for (const o of (sourceOrders.length > 0 ? sourceOrders : orders)) {
      const vName = String((o as any).VENDOR_NAME || '').trim();
      if (vName) {
        const key = vName.toLowerCase();
        const existing = countsMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          countsMap.set(key, { name: vName, count: 1 });
        }
      }
    }
    return Array.from(countsMap.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [sourceOrders, orders, registeredVendors]);



  const filtered = sortedFiltered.filter(o => {
    if (filterUserId && o.USERID !== filterUserId) return false;
    // Si no estamos usando búsqueda global en servidor pero hay término local, filtramos
    if (!searchResults && search) {
      const q = search.toLowerCase();
      if (!(
        o.ORDERCODE?.toLowerCase().includes(q) ||
        o.CUSTOMERNAME?.toLowerCase().includes(q) ||
        o.CUSTOMERRUT?.toLowerCase().includes(q) ||
        o.CUSTOMERPHONE?.includes(q) ||
        o.CUSTOMEREMAIL?.toLowerCase().includes(q) ||
        (o as any).VENDOR_NAME?.toLowerCase().includes(q) ||
        o.adminNotes?.toLowerCase().includes(q)
      )) return false;
    }
    if (paymentFilter !== 'all') {
      const pm = o.PAYMENTMETHOD || 'Sin método';
      if (pm !== paymentFilter) return false;
    }
    if (sourceFilter !== 'all') {
      const isWa = o.PAYMENTMETHOD === 'WhatsApp';
      if (sourceFilter === 'whatsapp' && !isWa) return false;
      if (sourceFilter === 'web' && isWa) return false;
    }
    if (regionFilter !== 'all') {
      const r = (o as any).REGION || '';
      if (r !== regionFilter) return false;
    }
    if (vendorFilter === 'vendors') {
      const isVendor = Boolean((o as any).IS_VENDOR_ORDER || (o as any).VENDOR_NAME || (o as any).VENDOR_ID);
      if (!isVendor) return false;
    } else if (vendorFilter === 'main') {
      const isVendor = Boolean((o as any).IS_VENDOR_ORDER || (o as any).VENDOR_NAME || (o as any).VENDOR_ID);
      if (isVendor) return false;
    } else if (vendorFilter !== 'all') {
      const vName = String((o as any).VENDOR_NAME || '').toLowerCase();
      const vId = String((o as any).VENDOR_ID || '').toLowerCase();
      const target = vendorFilter.toLowerCase();
      if (vName !== target && vId !== target) return false;
    }
    if (liveOnly && !(o as any).PURCHASEDFROMLIVE) return false;
    if (trackingPending && !needsTracking(o)) return false;
    if (pickupReady && !(o.STATUS === 'shipped' && isPickup(o.SHIPPINGAGENCY))) return false;
    return true;
  });

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base sm:text-xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            {(() => { const items = filtered.reduce((s, o) => { try { return s + (JSON.parse(o.ITEMS || '[]') as any[]).reduce((a: number, i: any) => a + (i.quantity || 1), 0); } catch { return s; } }, 0); return items > 0 ? <span className="ml-2 text-xs text-gray-400">{items} artículos</span> : null; })()}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Date range selector */}
          <button onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 transition">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">{dateFilter === 'custom' && customDateStart ? `${customDateStart}${customDateEnd ? ' → ' + customDateEnd : ''}` : DATE_FILTER_LABELS[dateFilter]}</span>
          </button>
          <button onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-emerald-700 transition">
            <ImageIcon className="w-4 h-4" /><span className="hidden sm:inline">Descargar imagen</span>
          </button>
          <button onClick={async () => { try { await reconcileExpiredOrders(); } catch (err) { console.error('[orders] No se pudieron reconciliar pedidos vencidos:', err); } await load(1); loadStats(true); loadFlowStatusCounts(); }} disabled={isLoading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Export Image Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => !exportLoading && setShowExportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-800">Descargar imagen de pedidos</h3>
              </div>
              <button onClick={() => !exportLoading && setShowExportModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-emerald-700 font-medium">
                Se excluirán los pedidos en estado: <b>Negociando</b> y <b>Cancelado</b>.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700 font-medium">
                El rango usa corte a las <b>6 PM</b>. Ej: si seleccionas 29 al 30, se toman pedidos desde el 28 a las 18:00 hasta el 30 a las 18:00.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Fecha inicio (opcional)</label>
                <input type="date" value={exportDateStart} onChange={e => setExportDateStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Fecha fin (opcional)</label>
                <input type="date" value={exportDateEnd} onChange={e => setExportDateEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <p className="text-[11px] text-gray-400">
                Si no seleccionas fechas, se usará por defecto: ayer → hoy (con corte 6 PM).
              </p>
              <button onClick={exportOrdersImage} disabled={exportLoading}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
                {exportLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generando imagen...</>
                ) : (
                  <><Download className="w-4 h-4" /> Descargar PNG</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowDatePicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">Seleccionar fecha</h3>
              <button onClick={() => setShowDatePicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>
            <div className="space-y-2 mb-4">
            {(['today', 'yesterday', 'day_before'] as DateFilter[]).map(d => (
              <button key={d} onClick={() => { setDateFilter(d); setShowDatePicker(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${dateFilter === d ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                <Calendar className="w-4 h-4" />
                {DATE_FILTER_LABELS[d]}
              </button>
            ))}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Rango personalizado</p>
              <div className="flex flex-col gap-2">
                <input type="date" value={customDateStart} onChange={e => setCustomDateStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Desde" />
                <input type="date" value={customDateEnd} onChange={e => setCustomDateEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Hasta" />
                <button onClick={() => { if (customDateStart) { setDateFilter('custom'); setShowDatePicker(false); } }}
                  disabled={!customDateStart}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-40">
                  Aplicar rango
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Dashboard */}
      {statsCache && (() => {
        // Valores activos segun el filtro de fecha
        const isCustom = dateFilter === 'custom' && !!customDateStart;
        const crs = customRangeStats;
        const isYesterday = dateFilter === 'yesterday';
        const isDayBefore = dateFilter === 'day_before';
        const activeTotal = isCustom ? (crs?.total ?? 0) : isYesterday ? statsCache.totalYesterday : isDayBefore ? 0 : statsCache.totalToday;
        const activeCount = isCustom ? (crs?.count ?? 0) : isYesterday ? statsCache.countYesterday : isDayBefore ? 0 : statsCache.countToday;
        const activeTotalPaid = isCustom ? (crs?.totalPaid ?? 0) : statsCache.totalPaid;
        const activeCountPaid = isCustom ? (crs?.countPaid ?? 0) : statsCache.countPaid;
        const activeTopCustomer = isCustom ? (crs?.topCustomer ?? null) : statsCache.topCustomer;
        const activeLabel = isCustom ? 'Rango' : isYesterday ? 'Ayer' : isDayBefore ? 'Anteayer' : 'Hoy';
        const paymentsToConfirm = flowStatusCounts?.payment_review ?? statsCache.paymentReviewToday;
        return (
        <div className="space-y-3">
        {activeLabel === 'Hoy' && (
          <section className="relative flex min-h-[112px] items-center overflow-hidden rounded-3xl border border-sky-100 px-3 py-2 shadow-sm sm:min-h-[132px] sm:px-5"
            style={{ background: 'linear-gradient(110deg, #f1f8ff 0%, #f8f7ff 58%, #fff9ed 100%)' }}
            aria-label="Resumen de pedidos de hoy">
            <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-sky-100/50 blur-2xl" />
            <OrdersCloudMascot />
            <div className="relative min-w-0 flex-1 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700 sm:text-xs">Resumen de hoy</p>
              <h2 className="mt-1 text-base font-extrabold tracking-tight text-slate-900 sm:text-xl">
                {statsCache.countToday > 0 ? '¡Felicidades! Buen trabajo 🎉' : '¡Vamos con todo!'}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                Hoy llevas <strong className="text-slate-900">{statsCache.countToday} {statsCache.countToday === 1 ? 'pedido' : 'pedidos'}</strong>
                {paymentsToConfirm > 0 ? (
                  <> y tienes <strong className="text-amber-700">{paymentsToConfirm} {paymentsToConfirm === 1 ? 'pago por confirmar' : 'pagos por confirmar'}</strong>.</>
                ) : ' y no tienes pagos pendientes de confirmar.'}
              </p>

              {/* Alerta prioritaria para Cajera Web: pedidos por confirmar con stock crítico o agotado en caja */}
              {criticalReviewOrders.length > 0 && (
                <div
                  onClick={() => { setActiveFilter('payment_review'); }}
                  className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white text-xs font-bold shadow-md shadow-rose-600/25 cursor-pointer hover:brightness-105 transition animate-pulse"
                  title="Clic para ver y separar pedidos con quiebre de stock">
                  <span className="text-base shrink-0">🚨</span>
                  <span>
                    <strong>¡Atención Cajera Web!</strong> Hay {criticalReviewOrders.length} {criticalReviewOrders.length === 1 ? 'pedido por confirmar' : 'pedidos por confirmar'} con <strong>barra bajo 20%{soldOutReviewCount > 0 ? ` (${soldOutReviewCount} en 0% agotado en caja)` : ''}</strong>: ¡separar productos urgente antes de que se vendan en tienda!
                  </span>
                  <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-lg text-[10px] uppercase font-black shrink-0">
                    Ver urgente →
                  </span>
                </div>
              )}
            </div>
            <div className="relative ml-2 hidden shrink-0 flex-col gap-2 pr-1 sm:flex">
              <div className="rounded-2xl border border-white/90 bg-white/75 px-3 py-2 text-right shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pedidos</p>
                <p className="text-lg font-black leading-tight text-slate-900">{statsCache.countToday}</p>
              </div>
              <div
                onClick={() => setActiveFilter('payment_review')}
                className={`rounded-2xl border px-3 py-2 text-right shadow-sm cursor-pointer transition ${
                  criticalReviewOrders.length > 0
                    ? 'border-rose-300 bg-rose-50/90 hover:bg-rose-100 animate-pulse'
                    : 'border-amber-100 bg-amber-50/85 hover:bg-amber-100'
                }`}
                title="Clic para filtrar por Revisando Pago">
                <p className={`text-[10px] font-bold uppercase tracking-wide ${criticalReviewOrders.length > 0 ? 'text-rose-700 font-black' : 'text-amber-700'}`}>
                  {criticalReviewOrders.length > 0 ? '⚠️ Separar en caja' : 'Por confirmar'}
                </p>
                <p className={`text-lg font-black leading-tight ${criticalReviewOrders.length > 0 ? 'text-rose-800' : 'text-amber-800'}`}>
                  {criticalReviewOrders.length > 0 ? `${criticalReviewOrders.length} / ${paymentsToConfirm}` : paymentsToConfirm}
                </p>
              </div>
            </div>
          </section>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Total */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(238,242,255,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(79,70,229,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #6366f1, #4f46e5)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(99,102,241,0.12), rgba(79,70,229,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Total {activeLabel}</p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">{fmt(activeTotal)}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-[10px] text-gray-400 font-medium">{activeCount} pedidos {activeLabel.toLowerCase()}</p>
            </div>
          </div>
          {/* Ventas Confirmadas */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(236,253,245,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(5,150,105,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #10b981, #059669)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Ventas Confirmadas</p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">{fmt(activeTotalPaid)}</p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">{activeCountPaid} confirmados {activeLabel.toLowerCase()}</p>
          </div>
          {/* Cliente Top */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(255,251,235,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(217,119,6,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(245,158,11,0.12), rgba(217,119,6,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Top Cliente {activeLabel}</p>
            </div>
            {activeTopCustomer ? (
              <>
                <p className="text-sm sm:text-base font-extrabold text-gray-900 truncate tracking-tight">{activeTopCustomer.name.split(' ').slice(0, 2).join(' ')}</p>
                <p className="text-[10px] text-amber-600 mt-0.5 font-bold">{fmt(activeTopCustomer.total)} {activeLabel.toLowerCase()}</p>
              </>
            ) : <p className="text-sm text-gray-400 mt-1">Sin datos</p>}
          </div>
          {/* Ticket Promedio */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(240,253,244,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(22,163,74,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #22c55e, #16a34a)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(34,197,94,0.12), rgba(22,163,74,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Ticket Prom.</p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">{fmt(activeCountPaid > 0 ? Math.round(activeTotalPaid / activeCountPaid) : 0)}</p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">por pedido pagado</p>
          </div>
        </div>
        </div>
        );
      })()}

      {/* Process Timeline */}
      {(() => {
        const goFilter = (status: string, isActive: boolean) => {
          setSearch('');
          setSearchResults(null);
          setActiveFilter(isActive ? 'all' : status);
          setVendorFilter('all');
        };
        const statusCounts = flowStatusCounts || {};
        const counts = STATUS_FLOW.map(st => st === 'paid'
          ? STOCK_CONFIRMED_STATUSES.reduce((sum, key) => sum + (statusCounts[key] || 0), 0)
          : statusCounts[st] || 0);
        let furthestIdx = -1;
        // Pago vencido es una salida hacia atrás, no un paso completado antes del inicio.
        counts.forEach((c, i) => { if (c > 0 && STATUS_FLOW[i] !== 'payment_expired') furthestIdx = i; });
        const flowTotal = counts.reduce((s, c) => s + c, 0);

        // Nodo del flujo principal — glossy + anillo activo + badge
        const renderNode = (status: string, idx: number) => {
          const sc = STATUS_COLORS[status] || { color: '#6b7280', bg: '#f3f4f6' };
          const cfg = STATUS_CONFIG[status] || { label: status };
          const count = counts[idx];
          const isActive = activeFilter === status;
          const dim = count === 0;
          return (
            <button
              key={status}
              onClick={() => goFilter(status, isActive)}
              title={`${cfg.label}${count ? ` · ${count} pedido${count !== 1 ? 's' : ''}` : ''}`}
              className="group flex flex-col items-center gap-1.5 sm:gap-2 flex-shrink-0 relative z-10"
              style={{ width: 64 }}>
              <div className="relative" style={{ animation: isActive ? 'kcFloat 2.6s ease-in-out infinite' : undefined }}>
                {/* Anillo de pulso (solo activo) */}
                {isActive && (
                  <span className="absolute inset-0 rounded-[12px] sm:rounded-[14px]" style={{ ['--kc' as any]: `${sc.color}66`, animation: 'kcPulseRing 1.9s ease-out infinite' }} />
                )}
                <div
                  className="relative flex items-center justify-center rounded-[12px] sm:rounded-[14px] transition-all duration-300 group-hover:-translate-y-0.5"
                  style={{
                    width: isActive ? 42 : 36,
                    height: isActive ? 42 : 36,
                    background: dim
                      ? 'linear-gradient(160deg,#ffffff,#eef2f7)'
                      : `linear-gradient(160deg, rgba(255,255,255,0.28), rgba(0,0,0,0.16)), ${sc.color}`,
                    border: dim ? `1.5px dashed ${sc.color}4d` : '1px solid rgba(255,255,255,0.35)',
                    boxShadow: isActive
                      ? `0 0 0 3px ${sc.color}18, 0 6px 14px -6px ${sc.color}66, inset 0 1px 1px rgba(255,255,255,0.5)`
                      : dim ? 'none' : `0 4px 10px -4px ${sc.color}55, inset 0 1px 1px rgba(255,255,255,0.4)`,
                  }}>
                  {STATUS_SVG[status] && React.cloneElement(STATUS_SVG[status] as any, {
                    width: isActive ? 18 : 15,
                    height: isActive ? 18 : 15,
                    style: { color: dim ? sc.color : '#fff', opacity: dim ? 0.55 : 1, filter: dim ? 'none' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' },
                  })}
                  {/* Brillo superior */}
                  {!dim && <span className="absolute inset-x-1 top-1 h-1/3 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }} />}
                  {count > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[18px] h-[18px] sm:min-w-[21px] sm:h-[21px] flex items-center justify-center text-[9px] sm:text-[10px] font-extrabold rounded-full px-1 border-2 sm:border-[2.5px]"
                      style={{ background: isActive ? '#fff' : `linear-gradient(135deg, ${sc.color}, ${sc.color}cc)`, color: isActive ? sc.color : '#fff', borderColor: isActive ? sc.color : '#fff', boxShadow: `0 2px 5px -1px ${sc.color}55`, animation: 'kcBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="text-[8px] sm:text-[10px] font-bold leading-tight text-center transition"
                style={{ color: isActive ? sc.color : dim ? '#c2cbd6' : '#475569' }}>
                {cfg.label}
              </span>
            </button>
          );
        };

        // Nodo lateral (Negociación / Cancelado) — mismo diseño glossy que renderNode
        const renderSideNode = (status: string) => {
          const sc = STATUS_COLORS[status] || { color: '#6b7280', bg: '#f3f4f6' };
          const cfg = STATUS_CONFIG[status] || { label: status };
          const count = statusCounts[status] || 0;
          const isActive = activeFilter === status;
          const dim = count === 0;
          return (
            <button
              key={status}
              onClick={() => goFilter(status, isActive)}
              title={`${cfg.label}${count ? ` · ${count} pedido${count !== 1 ? 's' : ''}` : ''}`}
              className="group flex flex-col items-center gap-1.5 sm:gap-2 flex-shrink-0 relative z-10"
              style={{ width: 64 }}>
              <div className="relative" style={{ animation: isActive ? 'kcFloat 2.6s ease-in-out infinite' : undefined }}>
                {isActive && (
                  <span className="absolute inset-0 rounded-[12px] sm:rounded-[14px]" style={{ ['--kc' as any]: `${sc.color}66`, animation: 'kcPulseRing 1.9s ease-out infinite' }} />
                )}
                <div
                  className="relative flex items-center justify-center rounded-[12px] sm:rounded-[14px] transition-all duration-300 group-hover:-translate-y-0.5"
                  style={{
                    width: isActive ? 42 : 36,
                    height: isActive ? 42 : 36,
                    background: dim
                      ? 'linear-gradient(160deg,#ffffff,#eef2f7)'
                      : `linear-gradient(160deg, rgba(255,255,255,0.28), rgba(0,0,0,0.16)), ${sc.color}`,
                    border: dim ? `1.5px dashed ${sc.color}4d` : '1px solid rgba(255,255,255,0.35)',
                    boxShadow: isActive
                      ? `0 0 0 3px ${sc.color}18, 0 6px 14px -6px ${sc.color}66, inset 0 1px 1px rgba(255,255,255,0.5)`
                      : dim ? 'none' : `0 4px 10px -4px ${sc.color}55, inset 0 1px 1px rgba(255,255,255,0.4)`,
                  }}>
                  {STATUS_SVG[status] ? React.cloneElement(STATUS_SVG[status] as any, {
                    width: isActive ? 18 : 15,
                    height: isActive ? 18 : 15,
                    style: { color: dim ? sc.color : '#fff', opacity: dim ? 0.55 : 1, filter: dim ? 'none' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' },
                  }) : status === 'cancelled' && (
                    <svg width={isActive ? 18 : 15} height={isActive ? 18 : 15} viewBox="0 0 24 24" fill="none" stroke={dim ? sc.color : '#fff'} strokeWidth="2" style={{ opacity: dim ? 0.55 : 1, filter: dim ? 'none' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  )}
                  {!dim && <span className="absolute inset-x-1 top-1 h-1/3 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }} />}
                  {count > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[18px] h-[18px] sm:min-w-[21px] sm:h-[21px] flex items-center justify-center text-[9px] sm:text-[10px] font-extrabold rounded-full px-1 border-2 sm:border-[2.5px]"
                      style={{ background: isActive ? '#fff' : `linear-gradient(135deg, ${sc.color}, ${sc.color}cc)`, color: isActive ? sc.color : '#fff', borderColor: isActive ? sc.color : '#fff', boxShadow: `0 2px 5px -1px ${sc.color}55`, animation: 'kcBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="text-[8px] sm:text-[10px] font-bold leading-tight text-center transition"
                style={{ color: isActive ? sc.color : dim ? '#c2cbd6' : '#475569' }}>
                {cfg.label}
              </span>
            </button>
          );
        };

        // Separador punteado para estados laterales
        const renderDashedSep = (key: string) => (
          <div key={key} className="flex items-center self-start mt-[18px] sm:mt-[25px] flex-shrink-0">
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
              <div className="w-1 h-0.5 bg-gray-300 rounded-full" />
              <div className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
            </div>
          </div>
        );

        return (
          <div className="relative rounded-[20px] overflow-hidden border border-white/70 shadow-[0_6px_24px_-12px_rgba(79,70,229,0.12)]"
            style={{ background: 'linear-gradient(135deg, rgba(238,242,255,0.85), rgba(255,255,255,0.92) 45%, rgba(248,250,252,0.9))', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            {/* Ambient blobs */}
            <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.05), transparent 70%)' }} />
            <div className="absolute -bottom-20 right-10 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.03), transparent 70%)' }} />
            {/* Sheen animado superior */}
            <div className="absolute top-0 left-0 right-0 h-px overflow-hidden pointer-events-none">
              <div className="h-px w-1/3" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)', animation: 'kcSheen 4.5s linear infinite' }} />
            </div>

            {/* Header */}
            <div className="relative flex items-start sm:items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-1 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(145deg,#6366f1,#4f46e5)', boxShadow: '0 4px 10px -4px rgba(79,70,229,0.4), inset 0 1px 1px rgba(255,255,255,0.4)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                </span>
                <div>
                  <p className="text-sm font-extrabold text-gray-900 leading-tight tracking-tight">Flujo del Pedido</p>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 leading-tight font-medium">
                    {flowStatusCounts ? `${flowTotal} en proceso · toca un estado para filtrar` : flowCountsLoading ? 'Sincronizando estados…' : 'No se pudieron sincronizar los estados'}
                  </p>
                </div>
              </div>
              {/* Ver todos */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {activeFilter !== 'all' && (
                  <button onClick={() => goFilter('all', false)}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition flex-shrink-0 shadow-sm">
                    Ver todos
                  </button>
                )}
              </div>
            </div>

            {/* Track */}
            <div className="relative px-4 sm:px-5 pb-5 pt-3 overflow-x-auto">
              <div className="flex items-start gap-0 min-w-max relative">
                {/* Flujo principal */}
                {STATUS_FLOW.map((status, idx) => {
                  const a = STATUS_COLORS[status]?.color || '#6b7280';
                  const b = STATUS_COLORS[STATUS_FLOW[idx + 1]]?.color || a;
                  const filled = idx > 0 && idx < furthestIdx;
                  return (
                    <React.Fragment key={status}>
                      {renderNode(status, idx)}
                      {idx < STATUS_FLOW.length - 1 && (
                        <div className="relative self-start mt-[18px] sm:mt-[25px] flex-shrink-0 -mx-1 sm:-mx-1.5 rounded-full overflow-hidden"
                          style={{ height: 3, width: 20, background: filled ? `linear-gradient(90deg, ${a}, ${b})` : '#e5e7eb' }}>
                          {filled && (
                            <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', animation: `kcShimmer 2.4s linear ${idx * 0.18}s infinite` }} />
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                {/* Estados desconectados (extremo derecho) */}
                <div className="flex-1 min-w-[24px]" />
                {renderSideNode('negotiation')}
                {renderDashedSep('sep-cancel')}
                {renderSideNode('cancelled')}
              </div>
            </div>

            <style>{`
              @keyframes kcShimmer { 0% { transform: translateX(-110%); } 100% { transform: translateX(220%); } }
              @keyframes kcSheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
              @keyframes kcPulseRing { 0% { box-shadow: 0 0 0 0 var(--kc); } 70% { box-shadow: 0 0 0 11px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
              @keyframes kcFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
              @keyframes kcBadgePop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
          </div>
        );
      })()}

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 overflow-x-auto -mx-1 px-1 pb-1 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        {/* Todos — black bg white text */}
        <button onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${activeFilter === 'all' ? 'bg-gray-900 text-white shadow-md ring-2 ring-gray-900 ring-inset' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
          Todos
        </button>
        {/* Pagados — soft green */}
        <button onClick={() => setActiveFilter('paid_group')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-green-100 text-green-700 border border-green-200 ${activeFilter === 'paid_group' ? 'ring-2 ring-green-500 ring-inset shadow-sm' : 'hover:opacity-80'}`}>
          Confirmados
        </button>
        {/* Cancelado — soft red */}
        <button onClick={() => setActiveFilter('cancelled')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-red-100 text-red-700 border border-red-200 ${activeFilter === 'cancelled' ? 'ring-2 ring-red-500 ring-inset shadow-sm' : 'hover:opacity-80'}`}>
          Cancelado
        </button>
        {/* More states — opens modal */}
        <button onClick={() => setShowStatusModal(true)}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 ${['paid','payment_expired','negotiation','shipped','delivered'].includes(activeFilter) ? 'ring-2 ring-indigo-500 ring-inset shadow-sm' : ''}`}>
          Más estados ▾
        </button>
        {activeFilter === 'payment_review' && (
          <button
            type="button"
            onClick={openBulkPaymentReview}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-wait disabled:opacity-60"
            title="Revisar comprobantes y confirmar varios pagos en una sola sesión"
          >
            <FileImage className="h-4 w-4" /> Revisión masiva
          </button>
        )}
        {/* Filtro: Tiendas (Selector de tiendas con pedidos) */}
        <div className="relative inline-block" ref={storeDropdownRef}>
          <button
            type="button"
            onClick={() => setShowStoreDropdown(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition border cursor-pointer ${
              vendorFilter !== 'all'
                ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-500/40 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
            title="Filtrar por tienda con pedidos"
          >
            <span>🏪 Tiendas</span>
            {vendorFilter !== 'all' && (
              <span className="text-xs font-bold text-amber-800 truncate max-w-[140px]">
                : {vendorFilter === 'main' ? 'Importadora Carlitos' : vendorFilter}
              </span>
            )}
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${showStoreDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showStoreDropdown && (
            <div className="absolute left-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-40 animate-in fade-in-50 slide-in-from-top-2 duration-150">
              <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                Tiendas con pedidos
              </div>
              <button
                type="button"
                onClick={() => { setVendorFilter('all'); setShowStoreDropdown(false); }}
                className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-gray-50 transition cursor-pointer ${
                  vendorFilter === 'all' ? 'text-indigo-600 bg-indigo-50/60 font-bold' : 'text-gray-700'
                }`}
              >
                <span>🌐 Todas las tiendas</span>
                <span className="text-[10px] text-gray-400 font-mono">{sourceOrders.length}</span>
              </button>
              {centralOrdersCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setVendorFilter('main'); setShowStoreDropdown(false); }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-gray-50 transition cursor-pointer ${
                    vendorFilter === 'main' ? 'text-indigo-600 bg-indigo-50/60 font-bold' : 'text-gray-700'
                  }`}
                >
                  <span>🏠 Importadora Carlitos (Central)</span>
                  <span className="text-[10px] text-gray-400 font-mono">{centralOrdersCount}</span>
                </button>
              )}
              {vendorStoresWithOrders.map(({ name, count }) => {
                const isSelected = vendorFilter.toLowerCase() === name.toLowerCase();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setVendorFilter(name); setShowStoreDropdown(false); }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-amber-50/60 transition cursor-pointer ${
                      isSelected ? 'text-amber-800 bg-amber-50 font-bold' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate pr-2">🏪 {name}</span>
                    <span className="text-[10px] text-amber-700 font-bold font-mono">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {orders.some(o => (o as any).PURCHASEDFROMLIVE) && (
          <button onClick={() => setLiveOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition border ${liveOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            🔴 Solo Live
          </button>
        )}
        {(() => { const n = orders.filter(o => o.STATUS === 'shipped' && isPickup(o.SHIPPINGAGENCY)).length; return n > 0 ? (
          <button onClick={() => setPickupReady(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition border ${pickupReady ? 'bg-teal-500 text-white border-teal-500' : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'}`}>
            🏪 Listo para retirar <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pickupReady ? 'bg-white/25' : 'bg-teal-200 text-teal-800'}`}>{n}</span>
          </button>
        ) : null; })()}
        {(() => { const n = orders.filter(needsTracking).length; return n > 0 ? (
          <button onClick={() => setTrackingPending(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition border ${trackingPending ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
            📍 Seguimiento pendiente <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${trackingPending ? 'bg-white/25' : 'bg-amber-200 text-amber-800'}`}>{n}</span>
          </button>
        ) : null; })()}
        {/* Quick date buttons */}
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden sm:ml-auto">
          {(['all', 'today', 'yesterday', 'day_before'] as DateFilter[]).map(d => (
            <button key={d} onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 text-xs font-medium transition ${dateFilter === d ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {DATE_FILTER_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Status Modal — floating cards with blurred backdrop */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowStatusModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-sm font-bold text-gray-800">Seleccionar estado</h3>
              <button onClick={() => setShowStatusModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {(['payment_expired', 'paid', 'payment_review', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'] as const).map(key => {
                const color = STATUS_COLORS[key]?.color || '#6b7280';
                const bg = STATUS_COLORS[key]?.bg || '#f3f4f6';
                return (
                  <button key={key} onClick={() => { setActiveFilter(key); setShowStatusModal(false); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition ${activeFilter === key ? 'ring-2 ring-offset-1 shadow-sm' : 'hover:shadow-md'} hover:scale-105`}
                    style={{ background: bg, borderColor: color + '33', color }}>
                    <div style={{ color }}>{STATUS_SVG[key] && React.cloneElement(STATUS_SVG[key] as any, { width: 32, height: 32 })}</div>
                    <span className="text-xs font-semibold text-center" style={{ color }}>{STATUS_CONFIG[key]?.label || key}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Previsualización de stock antes de confirmar */}
      {stockPreview && (() => {
        const customerPhone = (stockPreview.customerPhone || '').replace(/\D/g, '');
        const waPhone = customerPhone ? (customerPhone.length === 9 ? '56' + customerPhone : customerPhone) : '';
        // Items finales despues de quitar
        const finalItems = stockPreview.items.filter((_: any, idx: number) => !removedItems.has(idx));
        const allAvailable = finalItems.every((it: any) => it.hasStock);
        const someMissing = finalItems.some((it: any) => !it.found);
        const unavailableCount = finalItems.filter((it: any) => !it.hasStock).length;
        const hasRemoved = removedItems.size > 0;
        const totalPendingDebt = finalItems.reduce((s: number, i: any) => s + (Number(i.stockPendiente) || 0), 0);
        const pendingItemsCount = finalItems.filter((i: any) => (Number(i.stockPendiente) || 0) > 0).length;

        // Cálculos financieros: subtotal inicial, quitado y final
        const initialSubtotal = stockPreview.items.reduce(
          (s: number, i: any) => s + (Number(i.qty || 1) * Number(i.price || 0)),
          0
        );
        const removedSubtotal = stockPreview.items
          .filter((_: any, idx: number) => removedItems.has(idx))
          .reduce((s: number, i: any) => s + (Number(i.qty || 1) * Number(i.price || 0)), 0);
        const finalSubtotal = finalItems.reduce(
          (s: number, i: any) => s + (Number(i.qty || 1) * Number(i.price || 0)),
          0
        );
        const initialItemsCount = stockPreview.items.reduce(
          (s: number, i: any) => s + Number(i.qty || 1),
          0
        );
        const removedUnitsCount = stockPreview.items
          .filter((_: any, idx: number) => removedItems.has(idx))
          .reduce((s: number, i: any) => s + Number(i.qty || 1), 0);
        const finalUnitsCount = finalItems.reduce(
          (s: number, i: any) => s + Number(i.qty || 1),
          0
        );

        // Salud de stock consolidada del pedido antes de confirmar
        const modalOrderRisk = calculateOrderStockRisk(
          finalItems.map((i: any) => ({
            qty: Number(i.qty || 1),
            stock: i.currentStock !== null ? Math.max(0, Number(i.currentStock)) : null,
            sku: i.sku,
            name: i.name,
            price: Number(i.price || 0),
          }))
        );

        const currentPreviewOrder = orders.find(o => o.$id === stockPreview.orderId);
        const isPaidOrder = currentPreviewOrder?.STATUS === 'paid';

        // Generar mensaje de cotizacion para WhatsApp (sin emojis para evitar errores de codificación ? en wa.me)
        const newTotal = finalSubtotal;
        const cotMsg = hasRemoved
          ? `Hola${stockPreview.customerName ? ' ' + stockPreview.customerName.split(' ')[0] : ''}, sobre tu pedido #${stockPreview.orderCode}, ajustamos tu cotizacion con los productos disponibles:\n\n`
          : `Hola${stockPreview.customerName ? ' ' + stockPreview.customerName.split(' ')[0] : ''}, confirmamos el stock de tu pedido #${stockPreview.orderCode}. Todo esta disponible:\n\n`;
        let itemsText = '';
        finalItems.forEach((i: any) => {
          itemsText += `- ${i.name}\n  ${i.qty} x $${Number(i.price || 0).toLocaleString('es-CL')} = $${((Number(i.qty) || 1) * (Number(i.price) || 0)).toLocaleString('es-CL')}\n`;
        });
        if (hasRemoved) {
          itemsText += `\n------------------------\n`;
          itemsText += `Subtotal original: $${initialSubtotal.toLocaleString('es-CL')}\n`;
          itemsText += `Productos quitados: -$${removedSubtotal.toLocaleString('es-CL')}\n`;
          itemsText += `Total final a pagar: $${finalSubtotal.toLocaleString('es-CL')}\n------------------------\n\n`;
        } else {
          itemsText += `\nTotal a pagar: $${finalSubtotal.toLocaleString('es-CL')}\n\n`;
        }
        itemsText += `Importante:\nEl plazo exacto para pagar aparece en el enlace del pedido. Si necesitas mas tiempo, respondenos por este medio para revisar tu pedido.\n\n`;
        itemsText += `Completa tus datos aqui:\n${typeof window !== 'undefined' ? window.location.origin : 'https://www.yaxsell.cl'}/pedido/${stockPreview.orderId}\n\nGracias por tu compra.`;
        const fullMsg = cotMsg + itemsText;
        const cotWaUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(fullMsg)}` : null;

        const doConfirm = async () => {
          setConfirmingStockId(stockPreview.orderId);
          try {
            const order = orders.find(o => o.$id === stockPreview.orderId);
            if (!order) { alert('Pedido no encontrado'); return; }

            // Si hay items removidos, actualizar el pedido primero
            if (hasRemoved) {
              let parsedItems: any[] = [];
              try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
              const keptItems = parsedItems.filter((_: any, idx: number) => !removedItems.has(idx));
              const newTotalUpdate = keptItems.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.qty || 1)), 0);

              const updateResp = await fetch('/api/admin/orders/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: order.$id,
                  ITEMS: JSON.stringify(keptItems),
                  TOTAL: newTotalUpdate,
                  SUBTOTAL: newTotalUpdate,
                }),
              });
              if (!updateResp.ok) {
                const ud = await updateResp.json().catch(() => ({}));
                alert(ud.error || 'Error al actualizar pedido');
                return;
              }
            }

            // Confirmar stock con los items finales
            let parsedItems: any[] = [];
            try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
            const itemsForConfirm = hasRemoved
              ? parsedItems.filter((_: any, idx: number) => !removedItems.has(idx))
              : parsedItems;
            const itemsPayload = itemsForConfirm.map((it: any) => ({
              id: it.id || it.pid || it.productId || '',
              sku: it.sku || it.SKU || '',
              name: it.name || it.NAME || 'Producto',
              qty: it.qty || it.quantity || 1,
              price: it.price || it.PRICE || 0,
              img: it.img || it.image || it.IMAGEURL || '',
              available: true,
              stock: it.currentStock !== null ? Math.max(0, Number(it.currentStock)) : null,
            }));
            const resp = await fetch('/api/catalogo/confirm-stock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: stockPreview.orderId, orderCode: stockPreview.orderCode, items: itemsPayload, allowRequote: true }),
            });
            const data = await resp.json();
            if (data.success) {
              setStockPreview(null);
              setRemovedItems(new Set());
              if (MODULE_ACCESS.whatsappManagement && (data.waLink || cotWaUrl)) {
                const targetLink = hasRemoved && cotWaUrl ? cotWaUrl : (data.waLink || cotWaUrl);
                window.open(targetLink, '_blank');
                alert(isPaidOrder ? `Stock verificado y pedido reactivado (20 min para pagar). Se abrió WhatsApp para enviar la cotización.` : `Stock confirmado y cotización actualizada. Se abrió WhatsApp para enviar el mensaje.`);
              } else {
                alert(isPaidOrder ? `Stock verificado y pedido reactivado con éxito (20 min para pagar).` : `Stock confirmado y cotización generada con éxito.`);
              }
              fetch('/api/revalidate?tag=orders').catch(() => {});
              window.location.reload();
            } else if (data.stockError) {
              setStockPreview(null);
              setRemovedItems(new Set());
              setStockErrorData({
                orderCode: stockPreview.orderCode,
                items: data.itemsWithStock || [],
                customerPhone: stockPreview.customerPhone.replace(/\D/g, ''),
              });
            } else {
              alert(data.error || 'Error al confirmar stock');
            }
          } catch (err) {
            console.error('Error confirmando stock:', err);
            alert('Error al confirmar stock');
          } finally {
            setConfirmingStockId(null);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => !confirmingStockId && (setStockPreview(null), setRemovedItems(new Set()))}>
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Modal Top Bar */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                      Verificar stock del pedido
                    </h3>
                    <p className="text-[11px] text-slate-400">Revisa la disponibilidad física en tienda</p>
                  </div>
                </div>
                <button
                  onClick={() => !confirmingStockId && (setStockPreview(null), setRemovedItems(new Set()))}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition text-xl leading-none">
                  ×
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Ficha del Cliente y Código de Pedido */}
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-sm shadow-indigo-600/20">
                      {stockPreview.customerName
                        ? stockPreview.customerName.split(' ').filter(Boolean).slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
                        : 'CL'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente</span>
                        {waPhone && (
                          <span className="text-[11px] text-slate-500 font-mono">+{waPhone}</span>
                        )}
                      </div>
                      <p className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                        {stockPreview.customerName || 'Cliente sin nombre'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pedido</span>
                    <span className="font-mono font-black text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 rounded-lg text-xs inline-block">
                      #{stockPreview.orderCode}
                    </span>
                  </div>
                </div>

                {/* Salud General del Pedido y Plazo Estimado de Pago */}
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Salud general:</span>
                    <StockRiskBadge risk={{ pct: modalOrderRisk.pct, level: modalOrderRisk.level, label: modalOrderRisk.label } as any} compact />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border ${
                      modalOrderRisk.level === 'verde'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : modalOrderRisk.level === 'amarillo'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse'
                    }`}>
                      ⏱️ Plazo sugerido: {modalOrderRisk.deadlineText}
                    </span>
                    {modalOrderRisk.hasRed && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-black animate-pulse">
                        ⚠️ Quiebre inminente
                      </span>
                    )}
                  </div>
                </div>

                {/* Resumen Financiero Dinámico */}
                {hasRemoved ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {/* 1. Subtotal Inicial */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex flex-col justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subtotal inicial</span>
                        <span className="text-sm sm:text-base font-bold font-mono text-slate-700 mt-0.5">${initialSubtotal.toLocaleString('es-CL')}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">{stockPreview.items.length} prod. · {initialItemsCount} un.</span>
                      </div>

                      {/* 2. Quitado / Descuento */}
                      <div className="bg-rose-50/80 rounded-xl p-2.5 border border-rose-100 flex flex-col justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Quitados</span>
                        <span className="text-sm sm:text-base font-bold font-mono text-rose-600 mt-0.5">-${removedSubtotal.toLocaleString('es-CL')}</span>
                        <span className="text-[10px] text-rose-500 mt-0.5">-{removedItems.size} prod. · -{removedUnitsCount} un.</span>
                      </div>

                      {/* 3. Subtotal Final a Cobrar */}
                      <div className="bg-emerald-50/80 rounded-xl p-2.5 border border-emerald-200 flex flex-col justify-center shadow-sm">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Total a cobrar</span>
                        <span className="text-base sm:text-lg font-black font-mono text-emerald-600 mt-0.5">${finalSubtotal.toLocaleString('es-CL')}</span>
                        <span className="text-[10px] font-bold text-emerald-700 mt-0.5">{finalItems.length} prod. confirmados</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">Total a cobrar del pedido</span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black font-mono text-emerald-700 tracking-tight">${initialSubtotal.toLocaleString('es-CL')}</span>
                        <span className="text-xs text-slate-500 font-medium">({stockPreview.items.length} productos · {initialItemsCount} unidades)</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {allAvailable ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          100% disponible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold border border-rose-300">
                          <svg className="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          Falta stock ({unavailableCount})
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Alerta de disponibilidad de stock */}
                <div className={`rounded-xl p-3 border flex items-center gap-2.5 text-xs font-bold ${allAvailable ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                  {allAvailable ? (
                    <>
                      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      <span>Todos los productos tienen stock físico suficiente en tienda.</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <span>{unavailableCount} producto(s) sin stock suficiente en tienda física. Quítalos del pedido si no están disponibles.</span>
                    </>
                  )}
                </div>

                {/* Resumen de Deuda de Stock Pendiente si existe */}
                {totalPendingDebt > 0 && (
                  <div className="rounded-xl p-3 border-2 bg-amber-50 border-amber-300 flex items-start gap-2.5 shadow-sm">
                    <span className="text-xl shrink-0">⏳</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-amber-900 leading-snug">
                        Deuda de stock pendiente: {totalPendingDebt} {totalPendingDebt === 1 ? 'unidad' : 'unidades'} ({pendingItemsCount} {pendingItemsCount === 1 ? 'producto' : 'productos'})
                      </p>
                      <p className="text-[11px] text-amber-700 mt-0.5 leading-normal">
                        Hay ventas previas de estos productos registradas sin stock en el POS que están a la espera de reposición.
                      </p>
                    </div>
                  </div>
                )}

                {/* Lista de productos */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Productos del pedido ({stockPreview.items.length})
                    </p>
                    <span className="text-[11px] text-slate-400">Indicador de barra de stock en tiempo real</span>
                  </div>

                  {stockPreview.items.map((it: any, idx: number) => {
                    const remaining = it.remainingStock;
                    const ok = it.hasStock;
                    const notFound = !it.found;
                    const pendiente = Number(it.stockPendiente) || 0;
                    const isRemoved = removedItems.has(idx);
                    const itemQty = Number(it.qty || 1);
                    const itemPrice = Number(it.price || 0);
                    const itemSubtotal = itemQty * itemPrice;
                    const stockVal = it.currentStock !== null ? Math.max(0, Number(it.currentStock)) : 0;

                    // Cálculo del riesgo / barra de stock
                    const pRisk = getProductRisk({
                      stock: stockVal,
                      salesVelocity7d: 0,
                      maxBatchSize: itemQty,
                      price: itemPrice,
                    });

                    return (
                      <div key={idx} className={`p-3.5 rounded-2xl border transition ${
                        isRemoved
                          ? 'bg-rose-50/20 border-dashed border-rose-300 opacity-75'
                          : notFound
                          ? 'bg-slate-50 border-slate-200'
                          : ok
                          ? 'bg-white border-slate-200 shadow-sm'
                          : 'bg-red-50/70 border-red-200'
                      }`}>
                        <div className="flex items-start gap-3">
                          {/* Foto del producto con zoom */}
                          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 group">
                            {it.imageUrl ? (
                              <>
                                <img
                                  src={it.imageUrl}
                                  alt={it.name}
                                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition duration-200"
                                  onClick={() => setZoomImageUrl({ url: it.imageUrl, title: it.name, sku: it.sku })}
                                  loading="lazy"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setZoomImageUrl({ url: it.imageUrl, title: it.name, sku: it.sku });
                                  }}
                                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                                  title="Ampliar imagen"
                                >
                                  <ZoomIn size={18} className="drop-shadow" />
                                </button>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                <ImageIcon size={20} className="opacity-40" />
                                <span className="text-[9px] mt-0.5 opacity-60 font-medium">Sin foto</span>
                              </div>
                            )}
                          </div>

                          {/* Info principal */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold leading-snug line-clamp-2 ${isRemoved ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  {it.name}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {it.sku && <span className="text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">SKU: {it.sku}</span>}
                                  {itemPrice > 0 && <span className="text-xs font-semibold text-slate-500">${itemPrice.toLocaleString('es-CL')} c/u</span>}
                                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-lg ${
                                    isRemoved
                                      ? 'bg-rose-100 text-rose-700 line-through'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                                  }`}>
                                    Subtotal: ${itemSubtotal.toLocaleString('es-CL')}
                                  </span>
                                </div>
                              </div>
                              <div className={`text-right flex-shrink-0 border rounded-xl px-2.5 py-1 ${isRemoved ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-indigo-50 border-indigo-100'}`}>
                                <p className="text-[10px] uppercase font-bold text-indigo-500">Pedido</p>
                                <p className="text-sm font-black text-indigo-700 leading-none mt-0.5">{itemQty} un.</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Barra de estado / Salud de stock animada */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salud stock:</span>
                            <StockRiskBadge risk={pRisk} compact />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            {notFound ? (
                              <span className="text-slate-400 text-[11px] bg-slate-100 px-2 py-0.5 rounded">No en BD</span>
                            ) : stockVal <= 0 ? (
                              <span className="text-rose-700 bg-rose-100/90 text-[11px] font-bold px-2 py-0.5 rounded border border-rose-200">
                                0 un. en tienda (Agotado)
                              </span>
                            ) : !ok ? (
                              <span className="text-amber-800 bg-amber-100 text-[11px] font-bold px-2 py-0.5 rounded border border-amber-200">
                                Hay {stockVal} de {itemQty} un. (Faltan {itemQty - stockVal})
                              </span>
                            ) : it.isReserved ? (
                              <span className="text-emerald-800 bg-emerald-50 text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-200/60 flex items-center gap-1">
                                <span>✓</span>
                                <span>{itemQty} reservadas {it.rawCurrentStock > 0 ? `+ ${it.rawCurrentStock} libres en tienda` : '(Stock exacto)'}</span>
                              </span>
                            ) : (
                              <span className="text-emerald-800 bg-emerald-50 text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-200/60">
                                {stockVal} en tienda (Quedarán {remaining})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Deuda de Stock Pendiente si existe */}
                        {pendiente > 0 ? (
                          <div className="mt-2 py-1.5 px-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span>⚠️</span>
                              <span>Deuda stock pendiente:</span>
                            </div>
                            <span className="font-black bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-lg text-xs">
                              {pendiente} {pendiente === 1 ? 'unidad' : 'unidades'}
                            </span>
                          </div>
                        ) : null}

                        {/* Estado y botones de acción para quitar / restaurar producto */}
                        {isRemoved ? (
                          <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-rose-600">Quitado del pedido</span>
                              <span className="text-xs font-bold font-mono text-rose-700">(-${itemSubtotal.toLocaleString('es-CL')})</span>
                            </div>
                            <button
                              onClick={() => { const next = new Set(removedItems); next.delete(idx); setRemovedItems(next); }}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition shadow-sm">
                              ← Restaurar
                            </button>
                          </div>
                        ) : (!notFound && !ok) || notFound ? (
                          <div className="mt-2.5 space-y-2">
                            {(!notFound && !ok) && (
                              <p className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 p-2 rounded-lg border border-red-200">
                                <span>Faltan {it.qty - (it.currentStock || 0)} unidades para completar este ítem</span>
                              </p>
                            )}
                            <button
                              onClick={() => { const next = new Set(removedItems); next.add(idx); setRemovedItems(next); }}
                              className="w-full p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm shadow-red-500/20">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              Quitar del pedido (-${itemSubtotal.toLocaleString('es-CL')})
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2.5 flex justify-end">
                            <button
                              onClick={() => { const next = new Set(removedItems); next.add(idx); setRemovedItems(next); }}
                              className="text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1 transition flex items-center gap-1"
                              title="Quitar este producto si no está en tienda">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              Quitar de tienda
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Resumen Final Inferior */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                  {hasRemoved ? (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Subtotal original ({stockPreview.items.length} productos):</span>
                        <span className="font-semibold font-mono text-slate-700">${initialSubtotal.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-rose-600 font-medium">
                        <span>Descuento ({removedItems.size} {removedItems.size === 1 ? 'producto quitado' : 'productos quitados'}, {removedUnitsCount} un.):</span>
                        <span className="font-bold font-mono">-${removedSubtotal.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                        <div>
                          <span className="block text-slate-900 font-black">Subtotal final a cobrar:</span>
                          <span className="text-[11px] font-normal text-slate-500">{finalItems.length} productos ({finalUnitsCount} unidades confirmadas)</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
                          ${finalSubtotal.toLocaleString('es-CL')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                      <div>
                        <span className="block text-slate-900 font-black">Total a cobrar:</span>
                        <span className="text-[11px] font-normal text-slate-500">{finalItems.length} productos ({finalUnitsCount} unidades confirmadas)</span>
                      </div>
                      <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
                        ${finalSubtotal.toLocaleString('es-CL')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Botones de acción */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={doConfirm}
                    disabled={confirmingStockId !== null || (!allAvailable && !hasRemoved) || finalItems.length === 0}
                    className="w-full p-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                    {confirmingStockId ? (
                      <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Confirmando...</>
                    ) : (
                      <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> {
                        hasRemoved
                          ? `Enviar nueva cotización ($${finalSubtotal.toLocaleString('es-CL')})`
                          : isPaidOrder
                          ? `Confirmar stock y reactivar pedido ($${finalSubtotal.toLocaleString('es-CL')})`
                          : `Confirmar stock y enviar cotización ($${finalSubtotal.toLocaleString('es-CL')})`
                      }</>
                    )}
                  </button>
                  {MODULE_ACCESS.whatsappManagement && cotWaUrl && (
                    <a href={cotWaUrl} target="_blank" rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-green-100 hover:bg-green-200 text-green-700 font-bold text-sm transition cursor-pointer">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
                      {hasRemoved ? `Enviar nueva cotización por WhatsApp ($${finalSubtotal.toLocaleString('es-CL')})` : `Enviar cotización por WhatsApp ($${finalSubtotal.toLocaleString('es-CL')})`}
                    </a>
                  )}
                  <button
                    onClick={() => { setStockPreview(null); setRemovedItems(new Set()); }}
                    disabled={confirmingStockId !== null}
                    className="w-full p-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition disabled:opacity-50">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Stock insuficiente al confirmar stock */}
      {stockErrorData && (() => {
        const customerPhone = stockErrorData.customerPhone;
        const waPhone = customerPhone ? (customerPhone.length === 9 ? '56' + customerPhone : customerPhone) : '';
        const itemsList = stockErrorData.items.map((it: any) =>
          `- ${it.name || 'Producto'} -- Pedidos: ${it.qty} | Stock actual: ${it.currentStock ?? '?'}`
        ).join('\n');
        const notifyMsg = `Hola, sobre tu pedido #${stockErrorData.orderCode}, estuvimos revisando el stock y lamentablemente algunos productos no estan disponibles en la cantidad solicitada:\n\n${itemsList}\n\n¿Quieres que ajustemos tu pedido con lo que tenemos disponible, o prefieres elegir otros productos? Cuentanos y te ayudamos.`;
        const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(notifyMsg)}` : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => setStockErrorData(null)}>
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  Stock insuficiente
                </h3>
                <button onClick={() => setStockErrorData(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-600">
                  El pedido <span className="font-mono font-bold text-indigo-600">#{stockErrorData.orderCode}</span> no tiene stock suficiente para algunos productos.
                </p>
                <div className="space-y-2">
                  {stockErrorData.items.map((it: any, idx: number) => (
                    <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${Number(it.currentStock) < Number(it.qty) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{it.name || 'Producto'}</p>
                        <p className="text-xs text-gray-500">SKU: {it.sku || '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500">Pedido: <span className="font-bold text-gray-800">{it.qty}</span></p>
                        <p className="text-xs">Stock actual: <span className={`font-black ${Number(it.currentStock) < Number(it.qty) ? 'text-red-600' : 'text-green-600'}`}>{it.currentStock ?? '?'}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
                {MODULE_ACCESS.whatsappManagement && waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" onClick={() => setStockErrorData(null)}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition cursor-pointer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
                    Notificar al cliente por WhatsApp
                  </a>
                )}
                <button onClick={() => setStockErrorData(null)}
                  className="w-full p-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* WhatsApp Shortcuts Modal — send pre-written messages to customer */}
      {MODULE_ACCESS.whatsappManagement && waShortcutOrderId && (() => {
        const sOrder = orders.find(o => o.$id === waShortcutOrderId);
        if (!sOrder) return null;
        const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.yaxsell.cl';
        const customerPhone = (sOrder.CUSTOMERPHONE || '').replace(/[^0-9]/g, '');
        const confirmarLink = `${siteUrl}/confirmar-pedido?id=${encodeURIComponent(sOrder.$id)}`;
        const customerName = sOrder.CUSTOMERNAME?.split(' ')[0] || '';
        const orderCode = sOrder.ORDERCODE || '';

        // Parse items para construir el listado
        let parsedItems: any[] = [];
        try { parsedItems = JSON.parse(sOrder.ITEMS || '[]'); } catch {}
        const itemsList = parsedItems
          .filter((it: any) => !it.missing)
          .map((it: any) => `* ${it.name || it.NAME || ''}\n  ${it.qty || it.quantity || 1} x $${(it.price || it.PRICE || 0).toLocaleString('es-CL')} = $${((it.qty || it.quantity || 1) * (it.price || it.PRICE || 0)).toLocaleString('es-CL')}`)
          .join('\n\n');
        const total = sOrder.TOTAL || parsedItems.reduce((s: number, it: any) => s + (it.qty || it.quantity || 1) * (it.price || it.PRICE || 0), 0);

        // Calcular horas/días desde que se confirmó stock
        const createdAt = sOrder.$createdAt ? new Date(sOrder.$createdAt).getTime() : Date.now();
        const hoursSince = Math.floor((Date.now() - createdAt) / 3600000);
        const daysSince = Math.floor(hoursSince / 24);

        const bankDetailsText = `Datos para transferir:
Titular: ${bankDetails.holder}
RUT: ${bankDetails.rut}
Banco: ${bankDetails.bank}
Tipo: ${bankDetails.type}
N°: ${bankDetails.account}
Email: ${bankDetails.email}`;

        const shortcuts = [
          {
            label: 'Notificar stock confirmado',
            desc: 'Envía datos de transferencia + recordatorio de tiempo',
            icon: '✅',
            msg: (() => {
              const exp = Number(sOrder.EXPIRESAT || 0);
              let timeMsg = '';
              if (!exp) {
                timeMsg = '⏰ *Importante:* Tu stock está retenido. Tienes tiempo para pagar sin que se libere.';
              } else {
                const diff = exp - Date.now();
                const expDate = new Date(exp);
                const expTimeStr = expDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                const expDateStr = expDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
                const mins = Math.floor(diff / 60000);
                const hours = Math.floor(mins / 60);
                if (hours > 0) {
                  timeMsg = `⏰ *Importante:* Tienes hasta las *${expTimeStr} del ${expDateStr}* para transferir.\nSi necesitas más tiempo, háblanos para revisar tu pedido.`;
                } else if (mins > 0) {
                  timeMsg = `⏰ *Importante:* Tienes *${mins} minutos* (hasta las ${expTimeStr}) para transferir.\nSi necesitas más tiempo, háblanos para reactivar tu pedido.`;
                } else {
                  timeMsg = `⏰ *Importante:* El plazo está por vencer. Transfiere lo antes posible o háblanos para reactivar.`;
                }
              }
              return `¡Hola ${customerName}! 🐾 ¡Buenas noticias! Confirmamos el stock de tu pedido *#${orderCode}*. Todo está disponible.\n\n${bankDetailsText}\n\n${timeMsg}\n\n🔗 Completa tus datos aquí:\n${siteUrl}/pedido/${sOrder.$id}`;
            })(),
          },
          {
            label: 'Recordar pago — Pasivo',
            desc: `Recordatorio suave${hoursSince > 0 ? ` (${daysSince}d ${hoursSince % 24}h sin pagar)` : ''}`,
            icon: '🔔',
            msg: `¡Hola ${customerName}! Te recordamos amablemente que tu pedido ${orderCode} esta listo y esperando tu pago.\n\nCuando puedas, sube tu comprobante aqui:\n${confirmarLink}\n\n¡Quedamos atentos!`,
          },
          {
            label: 'Recordar pago — Normal',
            desc: `Recordatorio directo${hoursSince > 0 ? ` (${daysSince}d ${hoursSince % 24}h sin pagar)` : ''}`,
            icon: '⏰',
            msg: `¡Hola ${customerName}! Tu pedido ${orderCode} sigue esperando tu pago. Tenemos el stock reservado pero se liberara pronto si no se confirma.\n\nSube tu comprobante aqui:\n${confirmarLink}\n\n${bankDetailsText}\n\n¡Avisanos si tienes algun problema!`,
          },
          {
            label: 'Recordar pago — Agresivo',
            desc: `Último aviso${hoursSince > 0 ? ` (${daysSince}d ${hoursSince % 24}h sin pagar)` : ''} · stock se devolverá`,
            icon: '⚠️',
            msg: `¡Hola ${customerName}! Tu pedido ${orderCode} lleva ${daysSince > 0 ? daysSince + ' dias' : hoursSince + ' horas'} sin pago.\n\nEl stock reservado sera devuelto al catalogo hoy si no recibimos tu comprobante. Si aun quieres tu pedido, sube el pago ahora:\n${confirmarLink}\n\n${bankDetailsText}\n\nSi ya pagaste, envianos el comprobante por aqui. ¡No queremos perder tu pedido!`,
          },
        ];
        const buildWaUrl = (msg: string) => {
          if (!customerPhone) return null;
          return `https://wa.me/56${customerPhone.replace(/^56/, '')}?text=${encodeURIComponent(msg)}`;
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => setWaShortcutOrderId(null)}>
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Atajos WhatsApp
                </h3>
                <button onClick={() => setWaShortcutOrderId(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-500 mb-2">
                  Pedido <span className="font-mono font-bold text-indigo-600">{sOrder.ORDERCODE}</span> · {sOrder.CUSTOMERNAME}
                </p>
                {!customerPhone && (
                  <p className="text-xs text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">Este pedido no tiene teléfono registrado</p>
                )}
                {shortcuts.map((sc, i) => {
                  const url = buildWaUrl(sc.msg);
                  return (
                    <a
                      key={i}
                      href={url || '#'}
                      target={url ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      onClick={(e) => { if (!url) e.preventDefault(); setWaShortcutOrderId(null); }}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-gray-100 hover:border-green-300 hover:bg-green-50 transition cursor-pointer ${!url ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-xl">
                        {sc.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-gray-800 text-sm">{sc.label}</p>
                        <p className="text-xs text-gray-400">{sc.desc}</p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Timeline Modal — vertical timeline to change order status */}
      {timelineOrderId && (() => {
        const tOrder = orders.find(o => o.$id === timelineOrderId);
        if (!tOrder) return null;
        const effStatus = STOCK_CONFIRMED_STATUSES.includes(tOrder.STATUS) ? 'paid' : tOrder.STATUS;
        const currentIdx = STATUS_FLOW.indexOf(effStatus);
        const actionFlow = STATUS_FLOW.filter(status => status !== 'payment_expired');
        const actionCurrentStatus = effStatus === 'payment_expired' ? 'paid' : effStatus;
        const actionIdx = actionFlow.indexOf(actionCurrentStatus);
        const isCancelled = tOrder.STATUS === 'cancelled';
        const tIsPickup = isPickup(tOrder.SHIPPINGAGENCY);
        const STATUS_DESC: Record<string, string> = {
          paid: 'Stock confirmado, esperando pago del cliente.',
          payment_expired: 'El plazo de pago terminó. Se puede subir el comprobante hasta que el pedido cumpla 24 horas desde su creación; entonces se cancelará automáticamente.',
          processing: 'Se recibió el comprobante de pago, hay que verificarlo.',
          payment_confirmed: 'El pago fue confirmado y verificado correctamente.',
          negotiation: 'Faltan productos, se está negociando con el cliente.',
          shipped: tIsPickup ? 'El pedido salió de la tienda.' : 'El pedido salió de la tienda con la agencia.',
          delivered: tIsPickup ? 'El cliente retiró su pedido.' : 'El pedido fue entregado a la agencia de transporte.',
          cancelled: 'El pedido fue cancelado y el stock fue devuelto.',
        };
        // Etiquetas dependientes de retiro/agencia para el timeline
        const labelFor = (status: string) => {
          if (status === 'delivered' && tIsPickup) return 'Entregado';
          return STATUS_CONFIG[status]?.label || status;
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => setTimelineOrderId(null)}>
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header with gradient */}
              <div className="px-4 py-3 sm:px-6 sm:py-4" style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center rounded-2xl" style={{ width: 40, height: 40, background: isCancelled ? STATUS_COLORS.cancelled.bg : STATUS_COLORS[tOrder.STATUS]?.bg || '#f3f4f6' }}>
                      <div style={{ color: isCancelled ? STATUS_COLORS.cancelled.color : STATUS_COLORS[tOrder.STATUS]?.color || '#6b7280' }}>
                        {STATUS_SVG[tOrder.STATUS] || STATUS_SVG.cancelled}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-800">Línea de tiempo del pedido</h3>
                      <p className="text-xs text-gray-400 font-mono">{tOrder.ORDERCODE || '#' + tOrder.$id.slice(-6)}</p>
                    </div>
                  </div>
                  <button onClick={() => setTimelineOrderId(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition text-xl leading-none">×</button>
                </div>
              </div>

              {/* Timeline */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 max-h-[50vh] overflow-y-auto">
                <div className="relative">
                  {STATUS_FLOW.map((status, idx) => {
                    const isPast = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const isFuture = idx > currentIdx;
                    const sc = STATUS_COLORS[status];
                    const isClickable = !isCancelled && status !== tOrder.STATUS && status !== 'payment_expired' && !(status === 'payment_review' && !tOrder.PAYMENTPROOFURL);
                    return (
                      <div key={status} className="flex items-start gap-3 relative pb-1" style={{ minHeight: 60 }}>
                        {/* Vertical connector line */}
                        {idx < STATUS_FLOW.length - 1 && (
                          <div className="absolute left-[15px] top-9 bottom-0 w-[2px] rounded-full" style={{ background: isPast ? sc.color : '#e5e7eb', opacity: isPast ? 0.4 : 1 }} />
                        )}
                        {/* Node — clickable */}
                        <button
                          onClick={() => { if (isClickable) { updateStatus(tOrder.$id, status); } }}
                          disabled={!isClickable}
                          className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0 transition-all"
                          style={{
                            width: 32, height: 32,
                            background: isCurrent ? sc.color : (isPast ? sc.bg : '#fff'),
                            border: `2.5px solid ${isCurrent ? sc.color : (isPast ? sc.color + '88' : '#e5e7eb')}`,
                            cursor: isClickable ? 'pointer' : 'default',
                            opacity: isFuture && !isClickable ? 0.5 : 1,
                          }}>
                          <div style={{ color: isCurrent ? '#fff' : (isPast ? sc.color : '#cbd5e1'), display: 'flex' }}>
                            {STATUS_SVG[status] && React.cloneElement(STATUS_SVG[status] as any, { width: 15, height: 15 })}
                          </div>
                          {isCurrent && (
                            <div className="absolute -right-0.5 -top-0.5 w-3.5 h-3.5 rounded-full animate-ping" style={{ background: sc.color + '40' }} />
                          )}
                        </button>
                        {/* Label + description */}
                        <div className={`pt-1.5 pb-2 flex-1 ${isClickable ? 'cursor-pointer' : ''}`}
                          onClick={() => { if (isClickable) updateStatus(tOrder.$id, status); }}>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold transition" style={{ color: isCurrent ? sc.color : (isPast ? '#374151' : '#9ca3af') }}>
                              {labelFor(status)}
                            </p>
                            {isCurrent && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: sc.color }}>ACTUAL</span>
                            )}
                            {isPast && !isCurrent && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sc.color} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{STATUS_DESC[status]}</p>
                        </div>
                      </div>
                    );
                  })}
                  {/* Negotiation branch node */}
                  {(() => {
                    const isNeg = tOrder.STATUS === 'negotiation';
                    const ncol = STATUS_COLORS.negotiation;
                    return (
                      <div className="flex items-start gap-3 relative pt-2 mt-2 border-t border-dashed border-gray-200">
                        <button
                          onClick={() => { if (!isNeg && !isCancelled) updateStatus(tOrder.$id, 'negotiation'); }}
                          disabled={isNeg || isCancelled}
                          className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0 transition-all"
                          style={{ width: 32, height: 32, background: isNeg ? ncol.color : ncol.bg, border: `2.5px solid ${ncol.color}`, cursor: (isNeg || isCancelled) ? 'default' : 'pointer', opacity: isCancelled ? 0.4 : (isNeg ? 1 : 0.7) }}>
                          <div style={{ color: isNeg ? '#fff' : ncol.color, display: 'flex' }}>
                            {STATUS_SVG.negotiation && React.cloneElement(STATUS_SVG.negotiation as any, { width: 15, height: 15 })}
                          </div>
                        </button>
                        <div className={`pt-1.5 pb-2 flex-1 ${(isNeg || isCancelled) ? '' : 'cursor-pointer'}`}
                          onClick={() => { if (!isNeg && !isCancelled) updateStatus(tOrder.$id, 'negotiation'); }}>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold" style={{ color: isNeg ? ncol.color : '#9ca3af' }}>Negociación</p>
                            {isNeg && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: ncol.color }}>ACTUAL</span>}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{STATUS_DESC.negotiation}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Cancelled node */}
                  <div className="flex items-start gap-3 relative pt-2 mt-2 border-t border-dashed border-gray-200">
                    <button
                      onClick={() => { if (tOrder.STATUS !== 'cancelled') { updateStatus(tOrder.$id, 'cancelled'); setTimelineOrderId(null); } }}
                      disabled={isCancelled}
                      className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0 transition-all"
                      style={{
                        width: 32, height: 32,
                        background: isCancelled ? STATUS_COLORS.cancelled.color : STATUS_COLORS.cancelled.bg,
                        border: `2.5px solid ${STATUS_COLORS.cancelled.color}`,
                        cursor: isCancelled ? 'default' : 'pointer',
                        opacity: isCancelled ? 1 : 0.6,
                      }}>
                      <div style={{ color: isCancelled ? '#fff' : STATUS_COLORS.cancelled.color, display: 'flex' }}>
                        {STATUS_SVG.cancelled}
                      </div>
                    </button>
                    <div className="pt-1.5 pb-2 flex-1"
                      onClick={() => { if (!isCancelled) { updateStatus(tOrder.$id, 'cancelled'); setTimelineOrderId(null); } }}>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold" style={{ color: isCancelled ? STATUS_COLORS.cancelled.color : '#9ca3af' }}>Cancelado</p>
                        {isCancelled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: STATUS_COLORS.cancelled.color }}>ACTUAL</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{STATUS_DESC.cancelled}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer — navigation buttons */}
              {!isCancelled && (
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => { if (actionIdx > 0) updateStatus(tOrder.$id, actionFlow[actionIdx - 1]); }}
                    disabled={actionIdx <= 0 || updatingId === tOrder.$id}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 transition disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    Anterior
                  </button>
                  <button
                    onClick={() => { if (actionIdx >= 0 && actionIdx < actionFlow.length - 1) updateStatus(tOrder.$id, actionFlow[actionIdx + 1]); }}
                    disabled={actionIdx < 0 || actionIdx >= actionFlow.length - 1 || updatingId === tOrder.$id || (effStatus === 'payment_expired' && !tOrder.PAYMENTPROOFURL)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-white rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: STATUS_COLORS[tOrder.STATUS]?.color || '#4f46e5' }}>
                    Siguiente
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              )}
              {isCancelled && (
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100">
                  <button
                    onClick={() => { handleOpenStockPreview(tOrder); }}
                    disabled={confirmingStockId === tOrder.$id}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold transition disabled:opacity-40">
                    <RefreshCw className={`w-4 h-4 ${confirmingStockId === tOrder.$id ? 'animate-spin' : ''}`} />
                    Reactivar y Verificar Stock
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Quick Drawer (Cortina lateral) */}
      {drawerOrderId && (() => {
        // La búsqueda global trae pedidos fuera de la página cargada en `orders`.
        // El drawer debe resolver desde la misma fuente que renderiza las tarjetas.
        const order = sourceOrders.find(o => o.$id === drawerOrderId) || orders.find(o => o.$id === drawerOrderId);
        if (!order) return null;
        
        const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
        const ageMs = Date.now() - date.getTime();
        const ageH = Math.floor(ageMs / 3600000);
        const ageD = Math.floor(ageH / 24);
        const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
        const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
        const ageStr = `${ageStrRel} (${exactTime})`;
        
        const isRetiro = order.STATUS === 'shipped' && order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
        const statusColor = isRetiro ? '#c026d3' : (STATUS_COLORS[order.STATUS]?.color || '#6b7280');
        const statusBg = isRetiro ? '#fdf4ff' : (STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6');
        const statusLabel = isRetiro ? 'Listo para Retirar' : (STATUS_CONFIG[order.STATUS]?.label || order.STATUS);
        
        const phoneClean = order.CUSTOMERPHONE ? order.CUSTOMERPHONE.replace(/\D/g, '') : '';
        const waPhone = phoneClean.length === 9 ? '56' + phoneClean : phoneClean;
        
        let items: any[] = [];
        try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
        const missingItems = items.filter((it: any) => !!it.missing);
        const hasMissing = missingItems.length > 0;
        const missingNames = missingItems.map((it: any) => `${it.name || ''} (x${it.qty || 1})`).join(', ');
        const orderLink = typeof window !== 'undefined' ? `${window.location.origin}/pedido/${order.$id}` : '';
        const firstMissingImg = missingItems[0]?.img || '';

        let msg4 = `Hola ${order.CUSTOMERNAME || ''}, te escribimos de Importadora Carlitos por tu pedido ${order.ORDERCODE || ''}. Lamentablemente tuvimos un problema de stock con los siguientes productos:\n\n${missingNames || 'Algunos productos'}\n\nHemos cargado el valor de esos productos a tu cuenta como *Credito de Canje*.\n\n*BENEFICIOS DE CANJE:*\n- Todo el catalogo disponible a un *20% de descuento* extra.\n- Usa tu saldo a favor para elegir nuevos productos. Si no te gastas todo el credito, te guardamos el vuelto automaticamente como un cupon para tu proxima compra.\n\n*COMO FUNCIONA:*\n1. Ingresa a tu pedido: ${orderLink}\n2. Haz clic en el boton fucsia "Canjear aqui"\n3. Agrega los productos que mas te gusten y presiona "Confirmar Canje".\n\nQuedamos atentos a tu eleccion para poder despachar tu paquete lo antes posible.`;
        
        const missingWithImgs = missingItems.filter((it: any) => !!it.img);
        if (missingWithImgs.length > 0) {
          msg4 += `\n\nFotos de referencia:\n` + missingWithImgs.map((it: any) => `- ${it.name || ''}: ${it.img}`).join('\n');
        }

        const waUrl4 = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg4)}`;
        const showNegotiationBtn = hasMissing || order.STATUS === 'negotiation';
        
        const agencyDetails = order.SHIPPINGAGENCY ? getAgencyDetails(order.SHIPPINGAGENCY) : null;

        const copyToClipboard = (key: string, text: string) => {
          navigator.clipboard.writeText(text);
          setCopiedField(key);
          setTimeout(() => setCopiedField(null), 1500);
        };

        const copyAllShipping = () => {
          const text = `Destinatario: ${order.CUSTOMERNAME || ''}\nRUT: ${order.CUSTOMERRUT || ''}\nTeléfono: ${order.CUSTOMERPHONE || ''}\nEmail: ${order.CUSTOMEREMAIL || ''}\nDirección: ${order.ADDRESS || ''}\nComuna: ${order.COMUNA || ''}\nRegión: ${order.REGION || ''}\nAgencia: ${order.SHIPPINGAGENCY || ''}`;
          copyToClipboard('all_shipping', text);
        };
        
        return createPortal(
          <div className="fixed inset-0 z-[100] flex justify-end" style={{ background: 'rgba(0,0,0,0.3)', animation: 'kcFadeIn 0.2s ease-out' }} onClick={() => setDrawerOrderId(null)}>
            <div className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col relative border-l border-gray-200"
              style={{ animation: 'kcSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
              onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                    Pedido <span className="font-mono text-indigo-600 font-extrabold">{order.ORDERCODE || '—'}</span>
                    {((order as any).IS_VENDOR_ORDER || (order as any).VENDOR_NAME) && (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-white shadow-sm inline-flex items-center gap-1 uppercase tracking-wider">
                        🏪 {(order as any).VENDOR_NAME || 'Tienda Aliada'}
                      </span>
                    )}
                    {order.PAYMENTMETHOD === 'WhatsApp' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 inline-flex items-center gap-1">
                        💬 WhatsApp{order.ASSIGNEDCASHIER ? ` · ${order.ASSIGNEDCASHIER}` : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                        🌐 Web
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Creado hace {ageStr} ({date.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })})</p>
                </div>
                <button onClick={() => setDrawerOrderId(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl font-bold leading-none transition">×</button>
              </div>
              
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
                {((order as any).IS_VENDOR_ORDER || (order as any).VENDOR_NAME) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900 text-sm">
                      <span>🏪 Pedido de Tienda Aliada:</span>
                      <span className="text-amber-800 font-extrabold underline">{(order as any).VENDOR_NAME}</span>
                    </div>
                    {((order as any).VENDOR_BANK_HOLDER || (order as any).BANK_DETAILS?.holder) && (
                      <div className="text-amber-800 text-[11px] mt-1 pt-1.5 border-t border-amber-200">
                        <span className="font-bold">Cuenta bancaria de transferencia:</span> {(order as any).VENDOR_BANK_NAME || (order as any).BANK_DETAILS?.bank} · {(order as any).VENDOR_BANK_TYPE || (order as any).BANK_DETAILS?.type} Nº {(order as any).VENDOR_BANK_ACCOUNT || (order as any).BANK_DETAILS?.number} ({(order as any).VENDOR_BANK_HOLDER || (order as any).BANK_DETAILS?.holder} - RUT {(order as any).VENDOR_BANK_RUT || (order as any).BANK_DETAILS?.rut})
                      </div>
                    )}
                  </div>
                )}
                {/* Total & Current Status card */}
                <div className="bg-indigo-50/40 rounded-2xl p-4 border border-indigo-100/40 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block">Monto Total</span>
                    <span className="text-2xl font-black text-gray-900">{fmt(order.TOTAL)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block mb-1">Estado Actual</span>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-xs font-bold px-3 py-1 rounded-full inline-block shadow-sm" style={{ background: statusBg, color: statusColor }}>
                        {statusLabel}
                      </span>
                      {(() => { try { const it = JSON.parse(order.ITEMS || '[]'); const cc = (order as any).CANJE_COUNT || 0; const hasCanje = it.some((i: any) => i.isCanjeReplacement); return (cc > 0 || hasCanje); } catch { return false; } })() && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
                          🎁 Canje aplicado
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Productos Faltantes (Negociación) */}
                {hasMissing && (
                  <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertTriangle size={18} className="shrink-0" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wider">Productos Faltantes</h4>
                      </div>
                      <span className="text-[10px] font-bold text-red-700 bg-red-100/80 px-2 py-0.5 rounded-full border border-red-200">Negociación</span>
                    </div>
                    <div className="space-y-2">
                      {missingItems.map((it: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-red-100/60 shadow-sm animate-fade-in">
                          {it.img ? (
                            <img src={it.img} alt="" className="w-10 h-10 object-contain rounded-lg border border-gray-100 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100 shrink-0">
                              <Package className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-800 truncate">{it.name || ''}</p>
                            <p className="text-[10px] text-gray-400">Cantidad faltante: {it.qty || 1}</p>
                          </div>
                          {it.img && (
                            <button
                              onClick={() => copyToClipboard(`img-${idx}`, it.img)}
                              className={`p-1.5 rounded-lg border transition text-gray-400 hover:text-indigo-600 hover:bg-gray-50 shrink-0 ${copiedField === `img-${idx}` ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}
                              title="Copiar URL de la foto"
                            >
                              {copiedField === `img-${idx}` ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* WhatsApp Messages section */}
                {MODULE_ACCESS.whatsappManagement && (
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#10b981" className="shrink-0">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.528 1.977 14.07 .953 11.996.953c-5.44 0-9.866 4.372-9.87 9.802-.001 1.77.463 3.5 1.34 5.016l-.995 3.633 3.731-.977zm11.367-7.79c-.273-.136-1.62-.8-1.87-.89-.25-.09-.432-.136-.613.136-.18.272-.7.89-.858 1.072-.158.18-.317.2-.59.064-1.286-.64-2.138-1.053-2.996-2.525-.227-.39.227-.362.649-1.201.07-.14.035-.262-.017-.37-.053-.107-.432-1.04-.593-1.43-.157-.38-.344-.326-.473-.326-.122 0-.262-.01-.403-.01-.14 0-.37.052-.563.262-.193.21-.738.722-.738 1.762s.755 2.04 1.884 2.19c1.129.15 2.2 1.59 3.56 2.09.4.15.78.16 1.07.12.33-.05 1.02-.42 1.16-.83.14-.41.14-.77.1-.84-.04-.07-.16-.11-.43-.24z"/>
                    </svg>
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Mensajes de WhatsApp (Importadora Carlitos)</h4>
                  </div>
                  <div className="flex flex-col gap-2">
                    {showNegotiationBtn && (
                      <a href={waUrl4} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between px-3 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-extrabold transition shadow-sm hover:scale-[1.01] active:scale-95 text-left leading-normal border border-pink-500">
                        <span>🤝 4. Aviso Falta de Stock / Negociación</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 ml-2"><polyline points="9 18 15 12 9 6"/></svg>
                      </a>
                    )}
                  </div>
                </div>
                )}
                
                {/* Shipping Details card (Bluexpress/Starken) */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Datos para Despacho</h4>
                    <button
                      onClick={copyAllShipping}
                      className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${copiedField === 'all_shipping' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      <Copy size={11} />
                      {copiedField === 'all_shipping' ? '✓ Todo Copiado' : 'Copiar todo'}
                    </button>
                  </div>
                  
                  <div className="space-y-2.5">
                    {/* Destinatario */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Nombre Destinatario</span>
                        <span className="font-bold text-gray-800 truncate block">{order.CUSTOMERNAME || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('name', order.CUSTOMERNAME || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'name' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar nombre">
                        {copiedField === 'name' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* RUT */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">RUT</span>
                        <span className="font-bold text-gray-800 block">{order.CUSTOMERRUT || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('rut', order.CUSTOMERRUT || '')}
                        disabled={!order.CUSTOMERRUT}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'rut' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar RUT">
                        {copiedField === 'rut' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Telefono */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Teléfono</span>
                        <span className="font-bold text-indigo-600 font-mono block">{order.CUSTOMERPHONE || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('phone', order.CUSTOMERPHONE || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'phone' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar teléfono">
                        {copiedField === 'phone' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Email */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Email</span>
                        <span className="font-bold text-gray-700 block truncate max-w-[220px]" title={order.CUSTOMEREMAIL}>{order.CUSTOMEREMAIL || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('email', order.CUSTOMEREMAIL || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'email' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar email">
                        {copiedField === 'email' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Direccion */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Dirección de despacho</span>
                        <span className="text-xs text-gray-700 leading-normal font-bold block">{order.ADDRESS || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('address', order.ADDRESS || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'address' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar dirección">
                        {copiedField === 'address' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Comuna */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Comuna</span>
                        <span className="font-bold text-gray-800 block">{order.COMUNA || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('comune', order.COMUNA || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'comune' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar comuna">
                        {copiedField === 'comune' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Region */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Región</span>
                        <span className="font-bold text-gray-800 block">{order.REGION || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('region', order.REGION || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'region' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar región">
                        {copiedField === 'region' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Agencia y Metodo de Pago */}
                    <div className="flex items-start justify-between text-xs gap-3 border-t border-gray-200/50 pt-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Agencia y Pago</span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {agencyDetails && (
                            <span style={{ color: agencyDetails.color, backgroundColor: agencyDetails.bg, borderColor: agencyDetails.color + '20' }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1">
                              {agencyDetails.logo && <img src={agencyDetails.logo} alt="" className="w-6 h-6 shrink-0 object-contain rounded-md bg-white p-0.5" />}
                              {agencyDetails.name}
                            </span>
                          )}
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg border border-gray-200">{order.PAYMENTMETHOD || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Notes */}
                {(order as any).CUSTOMERNOTE && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notas del Cliente</h4>
                    <div className="bg-amber-50/50 border border-amber-100 text-amber-900 rounded-xl p-3 text-xs leading-relaxed font-medium">
                      {(order as any).CUSTOMERNOTE}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer action button */}
              <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-center gap-3">
                <button
                  onClick={async () => {
                    try {
                      // Open window IMMEDIATELY on click to avoid popup blocker
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write('<html><head><title>Cargando PDF...</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p style="color:#999;font-size:16px;">Generando PDF...</p></body></html>');
                        printWindow.document.close();
                      }
                      const items = JSON.parse(order.ITEMS || '[]');
                      const ids = items.map((i: any) => i.id).filter(Boolean) as string[];
                      const extraInfo: Record<string, { sku?: string; location?: any }> = {};
                      if (ids.length > 0) {
                        const { databases } = getServices();
                        const { databaseId } = getFirebaseConfig();
                        for (const pid of ids) {
                          if (extraInfo[pid]) continue;
                          try {
                            const doc: any = await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, pid);
                            const sku = getSkuFromFeatures(doc.FEATURES, doc.TAGS, doc.JUMPSSELLERID, doc.SKU);
                            const wh = getWarehouseLocationFromFeatures(doc.FEATURES);
                            extraInfo[pid] = { sku: sku || undefined, location: wh };
                          } catch {}
                        }
                      }
                      generateOrderPdf(order as any, items as any, Object.keys(extraInfo).length > 0 ? extraInfo : undefined, printWindow);
                    } catch (e) {
                      console.error('Error generating PDF', e);
                    }
                  }}
                  className="flex-1 py-3.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <Printer size={16} />
                  PDF
                </button>
                <button
                  onClick={() => window.location.href = `/admin/orders/${order.$id}`}
                  className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/10 hover:scale-[1.01] active:scale-95"
                >
                  <Eye size={16} />
                  Ver Detalle Completo
                </button>
              </div>
            </div>
            
            <style>{`
              @keyframes kcSlideIn {
                0% { transform: translateX(100%); }
                100% { transform: translateX(0); }
              }
              @keyframes kcFadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
              }
            `}</style>
          </div>,
          document.body
        );
      })()}

      {/* Search */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por código (ej: WA-36626974), nombre, RUT o teléfono..."
              className="w-full pl-9 pr-14 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {isSearchingServer && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
              {search && (
                <button
                  onClick={() => { setSearch(''); setSearchResults(null); }}
                  className="text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Banner de Búsqueda Global en Servidor */}
        {searchResults !== null && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50/90 border border-indigo-200 rounded-xl text-xs text-indigo-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-indigo-700">🔍 Búsqueda global:</span>
              <span>
                {searchResults.length === 0
                  ? `No se encontraron pedidos con "${search}" en la base de datos.`
                  : `Se encontraron ${searchResults.length} pedido${searchResults.length !== 1 ? 's' : ''} en toda la base de datos para "${search}".`}
              </span>
            </div>
            <button
              onClick={() => { setSearch(''); setSearchResults(null); }}
              className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer ml-3 shrink-0"
            >
              Cerrar y volver a lista
            </button>
          </div>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      {bulkReviewNotice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><span>{bulkReviewNotice}</span><button type="button" onClick={() => setBulkReviewNotice('')} aria-label="Cerrar aviso" className="shrink-0 text-emerald-700 hover:text-emerald-950">×</button></div>}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 bg-indigo-50 border border-indigo-200 rounded-xl overflow-x-auto">
          <span className="text-sm font-medium text-indigo-700">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          <span className="text-indigo-300">|</span>
          <span className="text-xs text-indigo-600">Cambiar a:</span>
          {(['pending', 'processing', 'paid', 'negotiation', 'shipped', 'delivered', 'cancelled'] as const).map(s => (
            <button key={s} onClick={() => bulkUpdateStatus(s)} disabled={bulkUpdating}
              className={`px-3 py-1 rounded-xl text-xs font-medium transition disabled:opacity-60 ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} hover:opacity-80`}>
              {STATUS_CONFIG[s].label}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700">Limpiar</button>
          <button onClick={bulkDeleteOrders} disabled={bulkUpdating}
            className="px-3 py-1 rounded-xl text-xs font-bold transition disabled:opacity-60 bg-red-100 text-red-700 hover:bg-red-200 border border-red-200">
            Eliminar {selected.size}
          </button>
        </div>
      )}

      {activeFilter === 'payment_review' && criticalReviewOrders.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">🚨</span>
            <span>
              Mostrando primero los {criticalReviewOrders.length} {criticalReviewOrders.length === 1 ? 'pedido con barra baja de stock (0% a 20%)' : 'pedidos con barra baja de stock (0% a 20%)'}. La cajera web debe separar estos productos de inmediato de las estanterías de la tienda.
            </span>
          </div>
        </div>
      )}

      {/* Mobile Card List & Desktop Table view */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Mobile View: Modern Cards */}
        <div className="block sm:hidden p-2 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
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
              const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
              const ageMs = Date.now() - date.getTime();
              const isOverdue = !isVendorOrderDocument(order) && order.STATUS === 'payment_expired';
              let items: any[] = [];
              try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
              const hasMissing = items.some((it: any) => it.missing === true);
              const isWarning = hasMissing && ['pending', 'processing'].includes(order.STATUS);
              const agency = order.SHIPPINGAGENCY || '';
              const scfg = STATUS_CONFIG[order.STATUS];
              const isRetiro = order.STATUS === 'shipped' && order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
              const statusColor = isRetiro ? '#c026d3' : (STATUS_COLORS[order.STATUS]?.color || '#6b7280');
              const ageH = Math.floor(ageMs / 3600000);
              const ageD = Math.floor(ageH / 24);
              const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
              const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
              const ageStr = `${ageStrRel} (${exactTime})`;
              const totalItems = items.reduce((s: number, it: any) => s + (it.qty || 1), 0);
              const isWaitingPayment = (order.STATUS === 'paid' || order.STATUS === 'pending' || order.STATUS === 'pending_stock' || order.STATUS === 'processing') && !order.PAYMENTPROOFURL;
              const oRisk = getOrderRisk(order);

              return (
                <div key={order.$id}
                  className={`relative p-4 hover:brightness-95 transition-all cursor-pointer ${selected.has(order.$id) ? 'ring-2 ring-indigo-400' : ''}`}
                  style={{ background: isRetiro ? '#fdf4ff' : (STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6') }}
                  onClick={() => setDrawerOrderId(order.$id)}>
                  {/* Status left border indicator */}
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-r" style={{ background: statusColor }} />

                  {/* Row 1: Code + Time + Status */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(order.$id)}
                        onChange={() => toggleSelect(order.$id)}
                        className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                      <span className="font-mono text-xs text-indigo-600 font-bold">{order.ORDERCODE || '—'}</span>
                      {((order as any).IS_VENDOR_ORDER || (order as any).VENDOR_NAME) && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-sm flex items-center gap-1 uppercase tracking-wider shrink-0">
                          🏪 {(order as any).VENDOR_NAME || 'Tienda Aliada'}
                        </span>
                      )}
                      {order.PAYMENTMETHOD === 'WhatsApp' ? (
                        <>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WhatsApp
                          </span>
                          {order.ASSIGNEDCASHIER && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                              {order.ASSIGNEDCASHIER}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          🌐 Web
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600 font-bold">{date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' })}</span>
                      <span className={`text-xs font-bold ${ageH < 3 ? 'text-indigo-500' : 'text-gray-500'}`}>{ageStr}</span>
                      {(() => { try { const it = JSON.parse(order.ITEMS || '[]'); const cc = (order as any).CANJE_COUNT || 0; const hasCanje = it.some((i: any) => i.isCanjeReplacement); return (cc > 0 || hasCanje); } catch { return false; } })() && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
                          🎁 Canje
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Customer + Total */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                        {order.CUSTOMERNAME}
                        {MODULE_ACCESS.whatsappManagement && order.CUSTOMERPHONE && (() => { const pc = order.CUSTOMERPHONE!.replace(/\D/g, ''); const wa = pc.length === 9 ? '56' + pc : pc; return (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 hover:bg-green-600 text-white transition shrink-0 text-sm" title="WhatsApp">
                            💬
                          </a>
                        ); })()}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{order.CUSTOMERPHONE || ''} · {order.COMUNA || '—'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-gray-900">{fmt(order.TOTAL)}</p>
                      <p className="text-[10px] text-gray-400">{totalItems} uds · {items.length} art.</p>
                    </div>
                  </div>

                  {/* Row 2.2: Barra de Salud de Stock y Plazo Dinámico para Pagar */}
                  {(() => {
                    const isConfirmed = ['payment_confirmed', 'preparing', 'shipped', 'delivered'].includes(order.STATUS);
                    const isCancelled = order.STATUS === 'cancelled';
                    const isNegotiation = order.STATUS === 'negotiation';

                    if (isCancelled) return null;

                    if (isVendorOrderDocument(order)) {
                      return (
                        <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/80 border border-emerald-200/90 shadow-xs" onClick={e => e.stopPropagation()}>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">📦 Stock confirmado</span>
                          <span className="text-[10px] text-emerald-700 font-semibold">Reserva de tienda aliada</span>
                        </div>
                      );
                    }

                    if (isConfirmed) {
                      return (
                        <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/80 border border-emerald-200/90 shadow-xs" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 min-w-0" title="La cajera web separa el stock físicamente al confirmar el pago">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                              📦 Stock apartado
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-semibold">
                            Separado en bodega
                          </span>
                        </div>
                      );
                    }

                    if (isNegotiation) {
                      return (
                        <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1.5 rounded-xl bg-amber-50/80 border border-amber-200/90 shadow-xs" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 min-w-0" title="Pedido en negociación de productos">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                              💬 En negociación
                            </span>
                          </div>
                          <span className="text-[10px] text-amber-700 font-semibold">
                            Reemplazo de stock
                          </span>
                        </div>
                      );
                    }

                    const oRisk = getOrderRisk(order);
                    const isWaitingPayment = (order.STATUS === 'paid' || order.STATUS === 'pending' || order.STATUS === 'pending_stock' || order.STATUS === 'processing') && !order.PAYMENTPROOFURL;
                    const showPaymentExpiration = !isVendorOrderDocument(order) && (isWaitingPayment || isOverdue) && !order.PAYMENTPROOFURL;
                    return (
                      <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1.5 rounded-xl bg-white/85 border border-slate-200/80 shadow-xs" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 min-w-0" title={oRisk.label}>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Stock:</span>
                          <StockRiskBadge risk={{ pct: oRisk.pct, level: oRisk.level, label: oRisk.label } as any} compact />
                          {(order.STATUS === 'payment_review' || (order.STATUS === 'paid' && Boolean(order.PAYMENTPROOFURL))) && (oRisk.pct <= 20 || oRisk.hasRed) && (
                            <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse flex items-center gap-1 shadow-xs shrink-0"
                              title="Stock crítico en tienda física — separar urgente">
                              🚨 {oRisk.pct === 0 ? 'AGOTADO EN CAJA (0%)' : `SEPARAR URGENTE (${oRisk.pct}%)`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {showPaymentExpiration && (
                            <OrderExpirationBar order={order} risk={oRisk} compact />
                          )}
                          {oRisk.hasRed && !isWaitingPayment && (
                            <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black animate-pulse" title="Peligro de quiebre en tienda física">
                              ⚠️ Quiebre
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Row 2.5: Status & Acciones de Stock — centered */}
                  <div className="flex flex-col items-center justify-center mb-2 gap-1.5">
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setTimelineOrderId(order.$id); }} className="text-sm font-bold px-5 py-1.5 rounded-full whitespace-nowrap cursor-pointer hover:opacity-90 transition text-white" style={{ background: statusColor }} title="Cambiar estado">
                        {isRetiro ? 'Retirar' : (scfg?.label || order.STATUS)}
                      </button>
                    </div>

                    {/* Botón único Reactivar Pedido para pedidos en espera de pago o cancelados */}
                    {!isVendorOrderDocument(order) && ((isWaitingPayment && order.STATUS !== 'pending') || order.STATUS === 'cancelled') && (
                      <div className="flex items-center gap-1.5 flex-wrap justify-center mt-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenStockPreview(order);
                          }}
                          disabled={confirmingStockId === order.$id}
                          className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="Reactivar pedido, verificar stock fresco en tienda y enviar cotización">
                          <RefreshCw className={`w-3.5 h-3.5 ${confirmingStockId === order.$id ? 'animate-spin' : ''}`} />
                          <span>Reactivar pedido</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Row 2.7: Pedir datos de envío por WhatsApp (pago verificado y sin datos de envío) */}
                  {MODULE_ACCESS.whatsappManagement && order.STATUS === 'payment_confirmed' && !hasShippingData(order) && (
                    <div className="flex items-center justify-center mb-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotifyShippingData(order);
                        }}
                        disabled={notifyingShippingOrderId === order.$id}
                        className="w-full text-xs font-bold px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700 transition flex items-center justify-center gap-2 shadow-sm shadow-teal-500/25 cursor-pointer disabled:opacity-50"
                        title="Pedir datos de envío al cliente por WhatsApp">
                        {notifyingShippingOrderId === order.$id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{notifyingShippingOrderId === order.$id ? 'Cargando...' : '📦 Pedir datos de envío por WhatsApp'}</span>
                      </button>
                    </div>
                  )}

                  {/* Row 3: Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isWarning && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200 animate-pulse">⚠️ FALTAN PROD.</span>}
                    {needsTracking(order) && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500 text-white rounded animate-pulse">📍 FALTA SEGUIMIENTO</span>}
                    {isOverdue && <span className="text-[9px] font-bold px-1 py-0.5 bg-red-500 text-white rounded">VENCIDO</span>}
                    {(order as any).PURCHASEDFROMLIVE && <span className="text-[9px] font-bold px-1 py-0.5 bg-red-600 text-white rounded">LIVE</span>}
                    {(order as any).ISGIFT && <span className="text-[9px] font-bold px-1 py-0.5 bg-pink-100 text-pink-700 rounded">🎁</span>}
                    {order.COUPONCODE && <span className="text-[9px] font-mono font-bold px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded">{order.COUPONCODE}</span>}
                    {agency && (() => {
                      const details = getAgencyDetails(agency);
                      return (
                        <span style={{ color: details?.color, backgroundColor: details?.bg, borderColor: details?.color + '20' }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1">
                          {details?.logo && <img src={details.logo} alt="" className="w-6 h-6 shrink-0 object-contain rounded-md bg-white p-0.5" />}
                          {details?.name}
                        </span>
                      );
                    })()}
                    {/* Status change button */}
                    <button onClick={(e) => { e.stopPropagation(); setTimelineOrderId(order.$id); }}
                      className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                      Estado
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Modern Table */}
        <div className="hidden sm:block">
          {/* Toolbar: seleccionar todo + orden */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/70">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
              <span className="text-xs font-semibold text-gray-500">{selected.size > 0 ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}` : 'Seleccionar todo'}</span>
            </label>
            {/* Filtros de origen interactivos: WhatsApp y Web */}
            <div className="hidden md:flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
              <button
                type="button"
                onClick={() => setSourceFilter(prev => prev === 'whatsapp' ? 'all' : 'whatsapp')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  sourceFilter === 'whatsapp'
                    ? 'bg-green-100 text-green-800 border-green-300 ring-2 ring-green-500/20 shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title="Filtrar por pedidos WhatsApp"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'linear-gradient(155deg,#25d366,#12924a)' }} />
                <span>WhatsApp</span>
                <span className={`text-[11px] font-extrabold px-1.5 py-0.2 rounded-full ${
                  sourceFilter === 'whatsapp' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'
                }`}>
                  {orders.filter(o => o.PAYMENTMETHOD === 'WhatsApp').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSourceFilter(prev => prev === 'web' ? 'all' : 'web')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  sourceFilter === 'web'
                    ? 'bg-sky-100 text-sky-800 border-sky-300 ring-2 ring-sky-500/20 shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title="Filtrar por pedidos Web"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'linear-gradient(155deg,#38bdf8,#0369a1)' }} />
                <span>Web</span>
                <span className={`text-[11px] font-extrabold px-1.5 py-0.2 rounded-full ${
                  sourceFilter === 'web' ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800'
                }`}>
                  {orders.filter(o => o.PAYMENTMETHOD !== 'WhatsApp').length}
                </span>
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-0.5">Ordenar</span>
              <button onClick={() => toggleSort('date')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${sortBy === 'date' ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                Fecha {sortBy === 'date' ? (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
              </button>
              <button onClick={() => toggleSort('total')}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${sortBy === 'total' ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                Total {sortBy === 'total' ? (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
              </button>
            </div>
          </div>

          {/* Lista de tarjetas horizontales */}
          <div className="p-3 space-y-2.5">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
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
              <div className="p-12 text-center text-gray-400 text-sm">No se encontraron pedidos</div>
            ) : (
                filtered.map(order => {
                  const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
                  const isUpdating = updatingId === order.$id;
                  const ageMs = Date.now() - date.getTime();
                  const isOverdue = !isVendorOrderDocument(order) && order.STATUS === 'payment_expired';
                  const ageH = Math.floor(ageMs / 3600000);
                  const ageD = Math.floor(ageH / 24);
                  const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
                  const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
                  const ageStr = `${ageStrRel} (${exactTime})`;
                  
                  let items: any[] = [];
                  try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
                  const hasMissing = items.some((it: any) => it.missing === true);
                  const isWarning = hasMissing && ['pending', 'processing'].includes(order.STATUS);
                  const totalItems = items.reduce((s: number, it: any) => s + (it.qty || 1), 0);
                  const isWaitingPayment = (order.STATUS === 'paid' || order.STATUS === 'pending' || order.STATUS === 'pending_stock' || order.STATUS === 'processing') && !order.PAYMENTPROOFURL;
                  const showPaymentExpiration = !isVendorOrderDocument(order) && (isWaitingPayment || isOverdue) && !order.PAYMENTPROOFURL;
                  const oRisk = getOrderRisk(order);
                  const isRetiro = order.STATUS === 'shipped' && order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
                  const statusColor = isRetiro ? '#c026d3' : (STATUS_COLORS[order.STATUS]?.color || '#6b7280');
                  // Estilo de tarjeta horizontal (solo PC)
                  const isWa = order.PAYMENTMETHOD === 'WhatsApp';
                  const isSel = selected.has(order.$id);
                  const railGrad = isSel ? '#eef2ff' : isRetiro ? '#fdf4ff' : (STATUS_COLORS[order.STATUS]?.bg || '#f9fafb');
                  const cardBorder = isSel ? '#6366f1' : isWarning ? '#f59e0b' : isOverdue ? '#ef4444' : '#e5e7eb';
                  const cardBg = isSel ? '#eef2ff' : isRetiro ? '#fdf4ff' : (STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6');
                  const statusBg = isRetiro ? '#fdf4ff' : (STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6');
                  const statusLabel = isRetiro ? 'Retirar' : (STATUS_CONFIG[order.STATUS]?.label || order.STATUS);
                  const hasCanje = (() => { try { const it = JSON.parse(order.ITEMS || '[]'); const cc = (order as any).CANJE_COUNT || 0; return cc > 0 || it.some((i: any) => i.isCanjeReplacement); } catch { return false; } })();

                  return (
                    <React.Fragment key={order.$id}>
                    <div
                      className={`group flex flex-col rounded-2xl border transition-all cursor-pointer p-3.5 sm:p-4 gap-2.5 shadow-2xs hover:shadow-md ${isSel ? 'ring-2 ring-indigo-500 border-indigo-400' : 'border-gray-200/90'}`}
                      style={{ background: cardBg }}
                      onClick={() => setDrawerOrderId(order.$id)}>

                      {/* FILA 1: Origen + Checkbox + Código + Cliente + Total + Estado */}
                      <div className="flex items-center justify-between gap-3 flex-wrap lg:flex-nowrap">
                        {/* Bloque Izquierdo: Origen, Checkbox, Código, Items, Cajera, Cliente */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap flex-1">
                          {/* Checkbox y Origen */}
                          <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isSel}
                              onChange={() => toggleSelect(order.$id)}
                              className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                            {isWa ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shrink-0" title="Pedido WhatsApp">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/3840px-WhatsApp.svg.png" alt="WA" className="w-3.5 h-3.5 object-contain" />
                                <span>WA</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold shrink-0" title="Pedido Web">
                                <img src="https://cdn3d.iconscout.com/3d/premium/thumb/e-commerce-3d-icon-png-download-8762567.png" alt="Web" className="w-3.5 h-3.5 object-contain" />
                                <span>Web</span>
                              </span>
                            )}
                          </div>

                          {/* Código y Contador */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <div className="w-1.5 h-4 rounded-full" style={{ background: statusColor }} />
                            <p className="font-mono text-xs sm:text-sm text-indigo-600 font-extrabold">{order.ORDERCODE || '—'}</p>
                            {((order as any).IS_VENDOR_ORDER || (order as any).VENDOR_NAME) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black shadow-sm shrink-0 uppercase tracking-wider">
                                🏪 {(order as any).VENDOR_NAME || 'Tienda Aliada'}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 font-semibold hidden sm:inline">
                              ({totalItems} uds · {items.length} art.)
                            </span>
                            {isWa && order.ASSIGNEDCASHIER && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">{order.ASSIGNEDCASHIER}</span>
                            )}
                          </div>

                          {/* Separador */}
                          <span className="text-gray-300 hidden md:inline">·</span>

                          {/* Nombre del Cliente y Teléfono */}
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                            <p className="font-extrabold text-gray-900 text-xs sm:text-sm truncate max-w-[220px]" title={order.CUSTOMERNAME}>
                              {order.CUSTOMERNAME || 'Cliente'}
                            </p>
                            {order.CUSTOMERPHONE && (
                              <span className="text-[11px] text-gray-500 font-medium font-mono hidden md:inline">{order.CUSTOMERPHONE}</span>
                            )}
                            {MODULE_ACCESS.whatsappManagement && order.CUSTOMERPHONE && (() => { const pc = order.CUSTOMERPHONE.replace(/\D/g, ''); const wa = pc.length === 9 ? '56' + pc : pc; return (
                              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 hover:bg-green-600 text-white transition shrink-0 text-[10px]" title="WhatsApp">
                                💬
                              </a>
                            ); })()}
                            {order.COMUNA && (
                              <span className="text-[10px] text-gray-400 truncate max-w-[120px] hidden xl:inline">📍 {order.COMUNA}</span>
                            )}
                            {/* Badges especiales */}
                            {isWarning && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200 animate-pulse">⚠️ FALTAN</span>}
                            {order.STATUS === 'negotiation' && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded border border-orange-200 animate-pulse">🤝 EN CANJE</span>}
                            {isOverdue && <span className="text-[9px] font-bold px-1 py-0.5 bg-red-500 text-white rounded">VENCIDO</span>}
                            {needsTracking(order) && <span className="text-[9px] font-bold px-1 py-0.5 bg-amber-500 text-white rounded animate-pulse">📍 SEGUIMIENTO</span>}
                            {(order as any).PURCHASEDFROMLIVE && <span className="text-[9px] font-bold px-1 py-0.5 bg-red-600 text-white rounded">LIVE</span>}
                            {(order as any).ISGIFT && <span className="text-[9px] font-bold px-1 py-0.5 bg-pink-100 text-pink-700 rounded">🎁</span>}
                            {(order as any).CUSTOMERNOTE && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title={(order as any).CUSTOMERNOTE} />}
                            {order.adminNotes && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="Tiene notas internas" />}
                          </div>
                        </div>

                        {/* Bloque Derecho: Total + Fecha + Botón de Estado */}
                        <div className="flex items-center gap-3 shrink-0 ml-auto">
                          {/* Total y Fecha */}
                          <div className="text-right">
                            <p className="font-extrabold text-gray-900 text-sm sm:text-base leading-tight">{fmt(order.TOTAL)}</p>
                            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                              {date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} · <span className={ageH < 3 ? 'text-indigo-500 font-bold' : ''}>{ageStrRel}</span>
                            </p>
                          </div>

                          {/* Botón de Estado */}
                          <button
                            onClick={e => { e.stopPropagation(); setTimelineOrderId(order.$id); }}
                            className="text-xs sm:text-sm font-bold px-4 py-1.5 sm:py-2 rounded-full text-center whitespace-nowrap cursor-pointer hover:opacity-90 transition text-white shadow-2xs"
                            style={{ background: statusColor }}
                            title="Cambiar estado"
                          >
                            {statusLabel}
                          </button>
                        </div>
                      </div>

                      {/* FILA 2: Operativa de Stock + Barra de Tiempo + Botones de Acción */}
                      <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-gray-200/50 flex-wrap sm:flex-nowrap">
                        {/* Izquierda: Semáforo de stock y timer de caducidad */}
                        <div className="flex items-center gap-2 flex-wrap min-w-0" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const isConfirmed = ['payment_confirmed', 'preparing', 'shipped', 'delivered'].includes(order.STATUS);
                            const isCancelled = order.STATUS === 'cancelled';
                            const isNegotiation = order.STATUS === 'negotiation';

                            if (isCancelled) {
                              return <span className="text-[10px] font-bold text-gray-400">Pedido cancelado</span>;
                            }

                            if (isVendorOrderDocument(order)) {
                              return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">📦 Stock confirmado</span>;
                            }

                            if (isConfirmed) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200" title="La cajera web separa el stock físicamente al confirmar el pago">
                                  📦 Stock apartado
                                </span>
                              );
                            }

                            if (isNegotiation) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title="En proceso de negociación con el cliente">
                                  💬 En negociación
                                </span>
                              );
                            }

                            return (
                              <>
                                <div className="flex items-center gap-1" title={oRisk.label}>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stock:</span>
                                  <StockRiskBadge risk={{ pct: oRisk.pct, level: oRisk.level, label: oRisk.label } as any} compact />
                                  {(order.STATUS === 'payment_review' || (order.STATUS === 'paid' && Boolean(order.PAYMENTPROOFURL))) && (oRisk.pct <= 20 || oRisk.hasRed) && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse flex items-center gap-1 shadow-xs shrink-0"
                                      title="Stock crítico en tienda física — separar urgente">
                                      🚨 {oRisk.pct === 0 ? 'AGOTADO EN CAJA (0%)' : `SEPARAR URGENTE (${oRisk.pct}%)`}
                                    </span>
                                  )}
                                </div>
                                {showPaymentExpiration && (
                                  <OrderExpirationBar order={order} risk={oRisk} compact />
                                )}
                                {oRisk.hasRed && !isWaitingPayment && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black animate-pulse" title="Peligro de quiebre en tienda física">
                                    ⚠️ Quiebre
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Derecha: Botones de Acción directos */}
                        <div className="flex items-center gap-1.5 flex-wrap shrink-0 ml-auto" onClick={e => e.stopPropagation()}>
                          {/* Botón único Reactivar Pedido para pedidos en espera de pago o cancelados */}
                          {!isVendorOrderDocument(order) && ((isWaitingPayment && order.STATUS !== 'pending') || order.STATUS === 'cancelled') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenStockPreview(order);
                              }}
                              disabled={confirmingStockId === order.$id}
                              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                              title="Reactivar pedido, verificar stock fresco en tienda y enviar cotización">
                              <RefreshCw className={`w-3 h-3 ${confirmingStockId === order.$id ? 'animate-spin' : ''}`} />
                              <span>Reactivar pedido</span>
                            </button>
                          )}

                          {MODULE_ACCESS.whatsappManagement && order.STATUS === 'payment_confirmed' && !hasShippingData(order) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotifyShippingData(order);
                              }}
                              disabled={notifyingShippingOrderId === order.$id}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700 transition flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                              title="Enviar mensaje de WhatsApp al cliente solicitando sus datos de envío">
                              {notifyingShippingOrderId === order.$id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              <span>{notifyingShippingOrderId === order.$id ? 'Cargando...' : 'Pedir datos de envío'}</span>
                            </button>
                          )}

                          {hasCanje && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 whitespace-nowrap">
                              🎁 Canje
                            </span>
                          )}

                          {order.SHIPPINGAGENCY && (() => {
                            const details = getAgencyDetails(order.SHIPPINGAGENCY);
                            return (
                              <span
                                style={{
                                  color: details?.color,
                                  backgroundColor: details?.bg,
                                  borderColor: (details?.color || '') + '20'
                                }}
                                className="px-2 py-0.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1"
                              >
                                {details?.logo && (
                                  <img src={details.logo} alt="" className="w-6 h-6 shrink-0 object-contain rounded-md bg-white p-0.5" />
                                )}
                                {details?.name}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })
              )}
          </div>
          {/* Barra resumen (PC) */}
          {filtered.length > 0 && !isLoading && (() => {
            const totalSum = filtered.reduce((s, o) => s + o.TOTAL, 0);
            const subtotalSum = filtered.reduce((s, o) => s + (o.SUBTOTAL || o.TOTAL), 0);
            const shippingSum = filtered.reduce((s, o) => s + (o.SHIPPINGCOST || 0), 0);
            const paidOrders = filtered.filter(o => ['paid','processing','shipped','delivered'].includes(o.STATUS));
            const avgTicket = paidOrders.length > 0 ? Math.round(paidOrders.reduce((s,o)=>s+o.TOTAL,0)/paidOrders.length) : 0;
            const couponDiscount = filtered.reduce((s, o) => s + (o.DISCOUNTAMOUNT || 0), 0);
            const byCustomer: Record<string, { name: string; total: number }> = {};
            for (const o of filtered) {
              const key = o.CUSTOMERRUT || o.CUSTOMERNAME || 'anon';
              if (!byCustomer[key]) byCustomer[key] = { name: o.CUSTOMERNAME || key, total: 0 };
              byCustomer[key].total += o.TOTAL;
            }
            const top = Object.values(byCustomer).sort((a, b) => b.total - a.total)[0];
            const totalItems = filtered.reduce((s, o) => { try { return s + (JSON.parse(o.ITEMS || '[]') as any[]).reduce((a: number, i: any) => a + (i.quantity || 1), 0); } catch { return s; } }, 0);
            const avgItems = filtered.length > 0 ? (totalItems / filtered.length).toFixed(1) : null;
            return (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 border-t-2 border-gray-200 bg-gray-50">
                <div>
                  <p className="text-sm font-bold text-gray-700">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</p>
                  {top && Object.keys(byCustomer).length > 1 && (
                    <p className="text-[10px] text-gray-400 mt-0.5 font-normal truncate max-w-[160px]">Top: {top.name.split(' ')[0]} {fmt(top.total)}</p>
                  )}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-right">
                  {avgTicket > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ticket ∅</p>
                      <p className="text-sm font-semibold text-gray-600">{fmt(avgTicket)}</p>
                    </div>
                  )}
                  {avgItems && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Art./pedido</p>
                      <p className="text-sm font-semibold text-gray-600">∅ {avgItems}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pagados</p>
                    <p className="text-sm font-semibold text-gray-600">{fmt(paidOrders.reduce((s, o) => s + o.TOTAL, 0))}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total</p>
                    <p className="text-base font-extrabold text-gray-900">{fmt(totalSum)}</p>
                    {shippingSum > 0 && <p className="text-[10px] text-gray-400">{fmt(subtotalSum)} + {fmt(shippingSum)} env.</p>}
                    {couponDiscount > 0 && <p className="text-[10px] text-emerald-600">-{fmt(couponDiscount)} cupones</p>}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        
        {searchResults !== null ? (
          <div className="p-3.5 text-center text-xs font-semibold text-gray-500 bg-gray-50/80 border-t border-gray-100 flex items-center justify-center gap-2">
            <span>Mostrando {filtered.length} pedido{filtered.length !== 1 ? 's' : ''} de búsqueda global</span>
            <span>·</span>
            <button
              onClick={() => { setSearch(''); setSearchResults(null); }}
              className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
            >
              Volver a lista paginada
            </button>
          </div>
        ) : (
          (currentPage > 1 || hasNextPage) && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-white px-4 py-3 sm:px-6">
              <span className="text-sm text-gray-500">
                Página <strong className="text-gray-800">{currentPage}</strong>
                <span className="mx-1.5 text-gray-300">·</span>
                {orders.length} pedidos
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => load(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  onClick={() => load(currentPage + 1)}
                  disabled={!hasNextPage || isLoading}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* Shipping proof modal — shown when trying to set "delivered" without proof/tracking */}
      {shippingProofOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeShippingProofModal}></div>
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-800">Entregar a Agencia</h3>
              <button onClick={closeShippingProofModal} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-5">Necesitas una de estas dos opciones para marcar el pedido como entregado a agencia:</p>

            {!shippingProofMode && (
              <div className="space-y-3">
                <button onClick={() => setShippingProofMode('photo')}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition text-left">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">📷</div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-800 text-sm">Subir foto del comprobante de envío</div>
                    <div className="text-xs text-gray-400">Foto del comprobante de la agencia</div>
                  </div>
                </button>
                <button onClick={() => setShippingProofMode('tracking')}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-green-100 hover:border-green-400 hover:bg-green-50 transition text-left">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">📋</div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-800 text-sm">Ingresar número de seguimiento</div>
                    <div className="text-xs text-gray-400">Código de tracking de la agencia</div>
                  </div>
                </button>
                <button onClick={() => { window.open(`/admin/orders/${shippingProofOrderId}`, '_self'); closeShippingProofModal(); }}
                  className="w-full text-center py-3 rounded-2xl text-gray-400 font-semibold text-sm hover:bg-gray-50 transition">
                  Ir al detalle del pedido →
                </button>
              </div>
            )}

            {shippingProofMode === 'photo' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Foto del comprobante de envío</label>
                  <input type="file" accept="image/*" onChange={(e) => setShippingProofFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-50 file:text-blue-700 file:font-bold hover:file:bg-blue-100" />
                  {shippingProofFile && (
                    <p className="text-xs text-green-600 mt-2 font-semibold">✓ {shippingProofFile.name}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShippingProofMode(null)} className="flex-1 py-3 rounded-2xl text-gray-500 font-semibold text-sm hover:bg-gray-50 border border-gray-200">Atrás</button>
                  <button onClick={submitShippingProof} disabled={shippingProofUploading || !shippingProofFile}
                    className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                    {shippingProofUploading ? 'Subiendo...' : 'Subir y entregar'}
                  </button>
                </div>
              </div>
            )}

            {shippingProofMode === 'tracking' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Número de seguimiento</label>
                  <input type="text" value={shippingProofTracking} onChange={(e) => setShippingProofTracking(e.target.value)}
                    placeholder="Ej: 1234567890" autoFocus
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-green-400 focus:outline-none font-semibold" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShippingProofMode(null)} className="flex-1 py-3 rounded-2xl text-gray-500 font-semibold text-sm hover:bg-gray-50 border border-gray-200">Atrás</button>
                  <button onClick={submitShippingProof} disabled={shippingProofUploading || !shippingProofTracking.trim()}
                    className="flex-1 py-3 rounded-2xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-50">
                    {shippingProofUploading ? 'Guardando...' : 'Guardar y entregar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox / Zoom Modal para imagen de producto */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/90">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-sm font-black text-gray-900 truncate">{zoomImageUrl.title}</p>
                {zoomImageUrl.sku && <p className="text-xs font-mono font-semibold text-gray-500 mt-0.5">SKU: {zoomImageUrl.sku}</p>}
              </div>
              <button
                onClick={() => setZoomImageUrl(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition text-sm font-bold"
                title="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-900 flex items-center justify-center min-h-[280px] max-h-[75vh]">
              <img
                src={zoomImageUrl.url}
                alt={zoomImageUrl.title}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal para solicitar datos de envío por WhatsApp */}
      <ShippingNotificationModal
        isOpen={Boolean(shippingModalOrder)}
        onClose={() => {
          setShippingModalOrder(null);
          setShippingModalData(null);
        }}
        order={shippingModalOrder}
        initialData={shippingModalData}
      />
      {bulkReviewOpen && (
        <BulkPaymentReviewModal
          orders={bulkReviewOrders}
          decisions={bulkReviewDecisions}
          truncated={bulkReviewTruncated}
          loading={bulkReviewLoading}
          confirming={bulkReviewConfirming}
          error={bulkReviewError}
          onDecision={(orderId, decision) => setBulkReviewDecisions(current => ({ ...current, [orderId]: decision }))}
          onClose={() => !bulkReviewConfirming && setBulkReviewOpen(false)}
          onConfirm={confirmBulkPaymentReview}
        />
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 bg-gray-100 rounded-xl" /><div className="h-64 bg-gray-100 rounded-2xl" /></div>}>
      <OrdersContent />
    </Suspense>
  );
}
