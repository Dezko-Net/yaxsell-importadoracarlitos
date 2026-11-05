'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from '@/lib/db';
import { Order, Product, Category } from '@/types/admin';
import { TrendingUp, ShoppingCart, DollarSign, Package, RefreshCw, AlertTriangle, Download, Users, Copy, Check } from 'lucide-react';
import { getSkuFromFeatures } from '@/lib/product-features';

type Period = '7d' | '30d' | '90d' | '365d';
const PERIOD_LABELS: Record<Period, string> = { '7d': '7 días', '30d': '30 días', '90d': '90 días', '365d': '1 año' };

interface DailyStats { date: string; orders: number; revenue: number; }
interface CategorySales { name: string; revenue: number; count: number; }

export default function AnalyticsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('30d');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  const copySku = (sku: string) => {
    if (!sku) return;
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 1500);
  };

  const load = useCallback(async (force = false) => {
    setIsLoading(true); setError('');
    try {
      if (!force) {
        const cached = typeof window !== 'undefined' ? sessionStorage.getItem('admin_analytics_raw_data') : null;
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const isFresh = !parsed.timestamp || (Date.now() - Number(parsed.timestamp) < 10 * 60 * 1000);
            if (isFresh && Array.isArray(parsed.orders) && Array.isArray(parsed.products)) {
              setRawOrders(parsed.orders);
              setProducts(parsed.products);
              setCategories(parsed.categories || []);
              setIsLoading(false);
              return;
            }
          } catch {}
        }
      }

      // Check if products/categories already exist in localStorage/sessionStorage
      let prods: Product[] = [];
      let cats: Category[] = [];
      try {
        const prodCache = typeof window !== 'undefined'
          ? (localStorage.getItem('carlitos_admin_products_cache_v1') || sessionStorage.getItem('carlitos_admin_products_all_v1'))
          : null;
        if (prodCache) {
          const pParsed = JSON.parse(prodCache);
          if (Array.isArray(pParsed.products) && pParsed.products.length > 0) {
            prods = pParsed.products;
            cats = pParsed.categories || [];
          }
        }
      } catch {}

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const promises: Promise<any>[] = [
        databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [Query.orderDesc('CREATEDAT'), Query.limit(500)])
      ];
      if (prods.length === 0) {
        // 0 lecturas de Firestore usando el catálogo en RAM del servidor
        promises.push(
          fetch('/api/public-data/products?limit=5000&includeOutOfStock=true&includeVendorProducts=true')
            .then(r => r.ok ? r.json() : { products: [] })
        );
        promises.push(databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(100)]));
      }

      const results = await Promise.all(promises);
      const allOrders = results[0].documents as unknown as Order[];
      if (prods.length === 0) {
        prods = (results[1]?.products || []) as unknown as Product[];
        cats = (results[2]?.documents || []) as unknown as Category[];
      }

      setRawOrders(allOrders);
      setProducts(prods);
      setCategories(cats);

      try {
        sessionStorage.setItem('admin_analytics_raw_data', JSON.stringify({
          orders: allOrders,
          products: prods,
          categories: cats,
          timestamp: Date.now(),
        }));
      } catch {}
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  // Filter orders in-memory when period or rawOrders change (ZERO database queries)
  useEffect(() => {
    const days = parseInt(period);
    const cutoff = Date.now() - days * 86400000;
    setOrders(rawOrders.filter(o => (o.CREATEDAT || new Date(o.$createdAt).getTime()) >= cutoff));
  }, [period, rawOrders]);

  useEffect(() => { load(false); }, [load]);

  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  const fmtN = (n: number) => new Intl.NumberFormat('es-CL').format(n);

  // KPIs
  const revenueStatuses = ['paid', 'payment_confirmed', 'pending', 'pending_stock', 'processing', 'negotiation', 'shipped', 'delivered'];
  const paidOrders = orders.filter(o => revenueStatuses.includes(o.STATUS));
  const totalRevenue = paidOrders.reduce((s, o) => s + o.TOTAL, 0);
  const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
  const cancelledCount = orders.filter(o => o.STATUS === 'cancelled').length;
  const conversionRate = orders.length > 0 ? (paidOrders.length / orders.length) * 100 : 0;

  // Week-over-week — always computed from rawOrders (unfiltered) so prev week is never empty
  const now7Start = Date.now() - 7 * 86400000;
  const prev7Start = Date.now() - 14 * 86400000;
  const thisWeekOrders = rawOrders.filter(o => { const ts = o.CREATEDAT || new Date(o.$createdAt).getTime(); return ts >= now7Start; });
  const prevWeekOrders = rawOrders.filter(o => { const ts = o.CREATEDAT || new Date(o.$createdAt).getTime(); return ts >= prev7Start && ts < now7Start; });
  const thisWeekRev = thisWeekOrders.filter(o => revenueStatuses.includes(o.STATUS)).reduce((s,o) => s + o.TOTAL, 0);
  const prevWeekRev = prevWeekOrders.filter(o => revenueStatuses.includes(o.STATUS)).reduce((s,o) => s + o.TOTAL, 0);
  const wowRevPct = prevWeekRev > 0 ? Math.round(((thisWeekRev - prevWeekRev) / prevWeekRev) * 100) : null;
  const wowOrdersPct = prevWeekOrders.length > 0 ? Math.round(((thisWeekOrders.length - prevWeekOrders.length) / prevWeekOrders.length) * 100) : null;

  // Coupon impact
  const couponOrders = paidOrders.filter(o => o.COUPONCODE);
  const totalDiscount = couponOrders.reduce((s, o) => s + (o.DISCOUNTAMOUNT || 0), 0);
  const couponOrdersPct = paidOrders.length > 0 ? Math.round((couponOrders.length / paidOrders.length) * 100) : 0;

  // Daily breakdown
  const days = parseInt(period);
  const dailyStats: DailyStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayOrders = orders.filter(o => {
      const ts = o.CREATEDAT || new Date(o.$createdAt).getTime();
      return ts >= d.getTime() && ts < next.getTime();
    });
    const revenue = dayOrders.filter(o => revenueStatuses.includes(o.STATUS))
      .reduce((s, o) => s + o.TOTAL, 0);
    dailyStats.push({
      date: d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
      orders: dayOrders.length,
      revenue,
    });
  }
  const maxRevenue = Math.max(...dailyStats.map(d => d.revenue), 1);

  // Status breakdown
  const statusBreakdown = [
    { label: 'Stock Confirmado',           key: 'paid',               color: 'bg-emerald-400' },
    { label: 'Revisando Pago',             key: 'payment_review',     color: 'bg-blue-500' },
    { label: 'Pago Confirmado',            key: 'payment_confirmed',  color: 'bg-green-400' },
    { label: 'Negociando',                 key: 'negotiation',        color: 'bg-pink-400' },
    { label: 'Enviado',                    key: 'shipped',            color: 'bg-violet-400' },
    { label: 'Entregado',                  key: 'delivered',          color: 'bg-green-400' },
    { label: 'Cancelado',                  key: 'cancelled',          color: 'bg-red-400' },
  ].map(s => ({ ...s, count: orders.filter(o => o.STATUS === s.key || (s.key === 'paid' && ['pending', 'pending_stock', 'processing'].includes(o.STATUS))).length }));

  // Category revenue (from products SOLDQUANTITY × PRICE)
  const catRevMap: Record<string, { name: string; revenue: number; units: number }> = {};
  for (const p of products) {
    const catId = p.CATEGORYID || 'sin-cat';
    const catName = categories.find(c => c.$id === catId)?.name || 'Sin categoría';
    if (!catRevMap[catId]) catRevMap[catId] = { name: catName, revenue: 0, units: 0 };
    catRevMap[catId].revenue += (p.SOLDQUANTITY ?? 0) * (p.CURRENTPRICE ?? p.PRICE);
    catRevMap[catId].units += p.SOLDQUANTITY ?? 0;
  }
  const topCategories = Object.values(catRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const maxCatRev = Math.max(...topCategories.map(c => c.revenue), 1);

  // Top products by sold quantity
  const topProducts = [...products]
    .sort((a, b) => (b.SOLDQUANTITY ?? 0) - (a.SOLDQUANTITY ?? 0))
    .slice(0, 8);
  const maxSold = Math.max(...topProducts.map(p => p.SOLDQUANTITY ?? 0), 1);
  // Top products sold in the selected period from paid orders
  const periodSoldMap: Record<string, { id: string; name: string; sku: string; img: string; qty: number; totalRevenue: number; stock: number; hasDbProduct: boolean }> = {};
  for (const o of paidOrders) {
    try {
      const items = JSON.parse(o.ITEMS || '[]');
      for (const it of items) {
        const pid = it.id || it.productId || 'unknown';
        const dbProd = products.find(p => p.$id === pid);
        const sku = dbProd ? (dbProd.sku || getSkuFromFeatures(dbProd.FEATURES, dbProd.TAGS, dbProd.jumpseller_id, dbProd.sku)) : (it.sku || '');
        const img = dbProd ? dbProd.IMAGEURL : (it.img || it.imageUrl || '');
        const stock = dbProd ? (dbProd.STOCK ?? 0) : -1;
        const hasDbProduct = !!dbProd;
        const key = pid !== 'unknown' ? pid : it.name;
        if (!periodSoldMap[key]) {
          periodSoldMap[key] = {
            id: pid,
            name: it.name || '',
            sku: sku,
            img: img || '',
            qty: 0,
            totalRevenue: 0,
            stock,
            hasDbProduct,
          };
        }
        periodSoldMap[key].qty += (it.qty || 1);
        periodSoldMap[key].totalRevenue += (it.total || (it.price * (it.qty || 1)));
      }
    } catch {}
  }
  const topSoldProductsPeriod = Object.values(periodSoldMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 15);

  // Region breakdown
  const regionMap: Record<string, number> = {};
  for (const o of paidOrders) {
    const r = o.REGION || 'Sin región';
    regionMap[r] = (regionMap[r] || 0) + o.TOTAL;
  }
  const topRegions = Object.entries(regionMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxRegionRev = Math.max(...topRegions.map(r => r[1]), 1);

  // Top customers
  const customerMap: Record<string, { name: string; revenue: number; orders: number }> = {};
  for (const o of paidOrders) {
    const key = o.USERID || o.CUSTOMERNAME;
    if (!customerMap[key]) customerMap[key] = { name: o.CUSTOMERNAME, revenue: 0, orders: 0 };
    customerMap[key].revenue += o.TOTAL;
    customerMap[key].orders += 1;
  }
  const topCustomers = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const maxCustomerRev = Math.max(...topCustomers.map(c => c.revenue), 1);
  const repeatCustomers = Object.values(customerMap).filter(c => c.orders > 1).length;
  const repeatPct = Object.keys(customerMap).length > 0 ? Math.round((repeatCustomers / Object.keys(customerMap).length) * 100) : 0;

  // Hourly distribution (all orders in period)
  const hourlyOrders = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: orders.filter(o => new Date(o.CREATEDAT || o.$createdAt).getHours() === h).length,
  }));
  const maxHourlyCount = Math.max(...hourlyOrders.map(h => h.count), 1);

  // Day-of-week distribution
  const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dowOrders = Array.from({ length: 7 }, (_, d) => ({
    day: DOW_LABELS[d],
    count: orders.filter(o => new Date(o.CREATEDAT || o.$createdAt).getDay() === d).length,
  }));
  const maxDowCount = Math.max(...dowOrders.map(d => d.count), 1);

  // Order size distribution (buckets)
  const ORDER_BUCKETS = [
    { label: '<$5K',    min: 0,      max: 5000 },
    { label: '$5K-10K', min: 5000,   max: 10000 },
    { label: '$10K-25K',min: 10000,  max: 25000 },
    { label: '$25K-50K',min: 25000,  max: 50000 },
    { label: '>$50K',   min: 50000,  max: Infinity },
  ];
  const orderBuckets = ORDER_BUCKETS.map(b => ({
    ...b,
    count: paidOrders.filter(o => o.TOTAL >= b.min && o.TOTAL < b.max).length,
  }));
  const maxBucketCount = Math.max(...orderBuckets.map(b => b.count), 1);

  // Profitability (estimated from products cost data)
  const totalEstimatedCost = products.reduce((s, p) => s + (p.SOLDQUANTITY ?? 0) * (p.COST || 0), 0);
  const totalEstimatedRevenue = products.reduce((s, p) => s + (p.SOLDQUANTITY ?? 0) * (p.CURRENTPRICE ?? p.PRICE), 0);
  const estimatedMargin = totalEstimatedRevenue > 0 ? ((totalEstimatedRevenue - totalEstimatedCost) / totalEstimatedRevenue) * 100 : 0;
  const hasCostData = products.some(p => (p.COST || 0) > 0);

  const exportCSV = () => {
    const rows: (string | number)[][] = [
      ['=== RESUMEN ==='],
      ['Período', period, 'Ingresos', totalRevenue, 'Pedidos', orders.length, 'Ticket promedio', paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0],
      [],
      ['=== INGRESOS DIARIOS ==='],
      ['Fecha', 'Pedidos', 'Ingresos (CLP)'],
      ...dailyStats.map(d => [d.date, d.orders, d.revenue]),
      [],
      ['=== TOP PRODUCTOS ==='],
      ['Producto', 'Unidades Vendidas'],
      ...topProducts.map(p => [p.NAME || '', p.SOLDQUANTITY ?? 0]),
      [],
      ['=== TOP REGIONES ==='],
      ['Región', 'Ingresos (CLP)'],
      ...topRegions.map(([r, rev]) => [r, rev]),
    ];
    if (topCustomers.length > 0) {
      rows.push([], ['=== TOP CLIENTES ==='], ['Cliente', 'Ingresos (CLP)', 'Pedidos']);
      topCustomers.forEach(c => rows.push([c.name, c.revenue, c.orders]));
    }
    // Payment methods
    const pmMap: Record<string, number> = {};
    for (const o of paidOrders) { const pm = o.PAYMENTMETHOD || 'Sin método'; pmMap[pm] = (pmMap[pm] || 0) + o.TOTAL; }
    const pmEntries = Object.entries(pmMap).sort((a, b) => b[1] - a[1]);
    if (pmEntries.length > 0) {
      rows.push([], ['=== MÉTODOS DE PAGO ==='], ['Método', 'Ingresos (CLP)', '% del total']);
      pmEntries.forEach(([pm, rev]) => rows.push([pm, rev, totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) + '%' : '0%']));
    }
    // Order size buckets
    rows.push([], ['=== DISTRIBUCIÓN TAMAÑO PEDIDO ==='], ['Rango', 'Pedidos', '% del total']);
    orderBuckets.forEach(b => rows.push([b.label, b.count, paidOrders.length > 0 ? Math.round((b.count / paidOrders.length) * 100) + '%' : '0%']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `analytics_${period}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500">Métricas de ventas y rendimiento</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition ${period === p ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} disabled={isLoading || orders.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
            <Download className="w-4 h-4" />CSV
          </button>
          <button onClick={() => { sessionStorage.removeItem('admin_analytics_raw_data'); load(true); }} disabled={isLoading}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-60" title="Refrescar datos">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Ingresos', value: fmt(totalRevenue), icon: DollarSign, color: 'bg-emerald-500', sub: 'Pedidos pagados', wow: wowRevPct },
          { label: 'Pedidos', value: fmtN(orders.length), icon: ShoppingCart, color: 'bg-indigo-500', sub: `${paidOrders.length} pagados`, wow: wowOrdersPct },
          { label: 'Ticket Promedio', value: fmt(avgOrderValue), icon: TrendingUp, color: 'bg-violet-500', sub: 'Valor medio por pedido', wow: null },
          { label: 'Tasa Conversión', value: `${conversionRate.toFixed(1)}%`, icon: Package, color: 'bg-cyan-500', sub: `${cancelledCount} cancelados`, wow: null },
          { label: 'Clientes Únicos', value: fmtN(new Set(orders.map(o => o.CUSTOMERRUT || o.CUSTOMERNAME)).size), icon: Users, color: 'bg-teal-500', sub: `${orders.length > 0 ? (orders.length / Math.max(new Set(orders.map(o => o.CUSTOMERRUT || o.CUSTOMERNAME)).size, 1)).toFixed(1) : '0'} pedidos/cliente`, wow: null },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`w-9 h-9 rounded-xl ${kpi.color} flex items-center justify-center mb-4`}>
              <kpi.icon className="w-4.5 h-4.5 text-white w-5 h-5" />
            </div>
            <p className="text-xl font-bold text-gray-900">{isLoading ? '—' : kpi.value}</p>
            <p className="text-sm font-medium text-gray-600 mt-0.5">{kpi.label}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">{kpi.sub}</p>
              {kpi.wow !== null && kpi.wow !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${kpi.wow >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {kpi.wow >= 0 ? '▲' : '▼'} {Math.abs(kpi.wow)}% WoW
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Ingresos por Día</h2>
        <div className="flex items-end gap-0.5 h-40 overflow-x-auto pb-5">
          {dailyStats.map((d, i) => (
            <div key={i} className="flex-1 min-w-[18px] flex flex-col items-center gap-0.5 group relative">
              <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-gray-800 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">
                  {d.date} · {fmt(d.revenue)} · {d.orders} pedidos
                </div>
              </div>
              <div
                className={`w-full rounded-t-sm transition-all ${d.revenue === 0 ? 'bg-gray-100' : d.revenue === maxRevenue ? 'bg-amber-400 hover:bg-amber-500' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                style={{ height: `${Math.max((d.revenue / maxRevenue) * 100, d.revenue > 0 ? 4 : 2)}%`, minHeight: '3px' }}
              />
              {days <= 30 && <span className="text-[9px] text-gray-400 rotate-45 origin-left whitespace-nowrap mt-1">{d.date.slice(0, 5)}</span>}
            </div>
          ))}
        </div>
        {maxRevenue > 0 && (() => {
          const best = dailyStats.reduce((a, b) => b.revenue > a.revenue ? b : a);
          return (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block shrink-0" />
              Mejor día: <span className="font-semibold text-gray-600">{best.date}</span> — {fmt(best.revenue)} · {best.orders} pedidos
            </p>
          );
        })()}
      </div>

      {/* Week-over-week */}
      {(wowRevPct !== null || wowOrdersPct !== null) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Esta semana vs semana anterior</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Ingresos 7d</p>
              <p className="text-xl font-bold text-gray-900">{fmt(thisWeekRev)}</p>
              {wowRevPct !== null && (
                <p className={`text-xs font-semibold mt-0.5 ${wowRevPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {wowRevPct >= 0 ? '▲' : '▼'} {Math.abs(wowRevPct)}% vs sem. anterior ({fmt(prevWeekRev)})
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Pedidos 7d</p>
              <p className="text-xl font-bold text-gray-900">{thisWeekOrders.length}</p>
              {wowOrdersPct !== null && (
                <p className={`text-xs font-semibold mt-0.5 ${wowOrdersPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {wowOrdersPct >= 0 ? '▲' : '▼'} {Math.abs(wowOrdersPct)}% vs sem. anterior ({prevWeekOrders.length})
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coupon Impact */}
      {couponOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Impacto de Cupones <span className="text-xs font-normal text-gray-400">(período seleccionado)</span></h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl">
              <p className="text-2xl font-bold text-emerald-700">{couponOrders.length}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Pedidos con cupón</p>
            </div>
            <div className="p-3 bg-red-50 rounded-xl">
              <p className="text-2xl font-bold text-red-700">{totalDiscount > 0 ? fmt(totalDiscount) : '—'}</p>
              <p className="text-xs text-red-600 mt-0.5">Descuento total otorgado</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl">
              <p className="text-2xl font-bold text-indigo-700">{couponOrdersPct}%</p>
              <p className="text-xs text-indigo-600 mt-0.5">De pedidos pagados</p>
            </div>
          </div>
        </div>
      )}

      {/* Conversion funnel */}
      {orders.length > 0 && (() => {
        const stages = [
          { key: 'paid',               label: 'Stock Confirmado',           color: 'bg-emerald-400' },
          { key: 'payment_review',     label: 'Rev. Pago',                  color: 'bg-blue-500' },
          { key: 'payment_confirmed',  label: 'P. Confirmado',              color: 'bg-green-400' },
          { key: 'shipped',            label: 'Enviado',                    color: 'bg-violet-400' },
          { key: 'delivered',          label: 'Entregado',                  color: 'bg-emerald-500' },
        ];
        const total = orders.length;
        const cancelledCount = orders.filter(o => o.STATUS === 'cancelled').length;
        const conversionRate = total > 0 ? Math.round(((total - cancelledCount) / total) * 100) : 0;
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Embudo de Conversión</h2>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                {conversionRate}% conversión
              </span>
            </div>
            <div className="space-y-2">
              {stages.map((s, i) => {
                const cnt = orders.filter(o => o.STATUS === s.key).length;
                const pct = total > 0 ? (cnt / total) * 100 : 0;
                const prev = i === 0 ? total : orders.filter(o => o.STATUS === stages[i-1].key).length;
                const dropPct = prev > 0 && i > 0 ? Math.round(((prev - cnt) / prev) * 100) : 0;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">{s.label}</span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{cnt}</span>
                    <span className="text-xs text-gray-400 w-10 text-right shrink-0">{Math.round(pct)}%</span>
                    {i > 0 && dropPct > 0 && (
                      <span className="text-xs text-red-400 w-16 text-right shrink-0">-{dropPct}%</span>
                    )}
                  </div>
                );
              })}
              {cancelledCount > 0 && (
                <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-400 w-24 shrink-0">Cancelado</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-300 rounded-full" style={{ width: `${(cancelledCount / total) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-red-500 w-8 text-right shrink-0">{cancelledCount}</span>
                  <span className="text-xs text-gray-400 w-10 text-right shrink-0">{Math.round((cancelledCount/total)*100)}%</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución por Estado</h2>
          <div className="space-y-3">
            {statusBreakdown.map(s => {
              const pct = orders.length > 0 ? (s.count / orders.length) * 100 : 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24 shrink-0">{s.label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right shrink-0">{s.count}</span>
                  <span className="text-xs text-gray-400 w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Regions by Revenue */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top Regiones por Ingresos</h2>
          {topRegions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos de región</p>
          ) : (
            <div className="space-y-3">
              {topRegions.map(([region, rev]) => {
                const pct = (rev / maxRegionRev) * 100;
                const totalRev = topRegions.reduce((s, [, r]) => s + r, 0);
                const share = totalRev > 0 ? Math.round((rev / totalRev) * 100) : 0;
                const regionOrders = paidOrders.filter(o => (o as any).REGION === region).length;
                return (
                  <div key={region} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-600 truncate block">{region}</span>
                      {regionOrders > 0 && <span className="text-[10px] text-gray-400">{regionOrders} pedido{regionOrders !== 1 ? 's' : ''}</span>}
                    </div>
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-24 text-right shrink-0">{fmt(rev)}</span>
                    <span className="text-xs text-gray-400 w-8 text-right shrink-0">{share}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Products Period */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Productos más Vendidos (En el Periodo)</h2>
            <p className="text-xs text-gray-500">Calculado a partir de pedidos pagados en este rango de tiempo</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">
            {topSoldProductsPeriod.length} productos
          </span>
        </div>
        {topSoldProductsPeriod.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin ventas registradas en este periodo</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-4 py-2.5 text-left w-12">#</th>
                  <th className="px-4 py-2.5 text-left w-12">Imagen</th>
                  <th className="px-4 py-2.5 text-left">Producto</th>
                  <th className="px-4 py-2.5 text-left w-36">SKU</th>
                  <th className="px-4 py-2.5 text-center w-28">Cant. Vendida</th>
                  <th className="px-4 py-2.5 text-right w-32">Total Estimado</th>
                  <th className="px-4 py-2.5 text-center w-36">Stock Sistema</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topSoldProductsPeriod.map((p, i) => {
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-400 text-xs">#{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {p.img ? (
                            <img src={p.img} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-gray-300" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-950 max-w-[280px] truncate" title={p.name}>
                        {p.name}
                      </td>
                      <td className="px-4 py-3">
                        {p.sku ? (
                          <div className="flex items-center gap-1.5 group">
                            <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded font-semibold">{p.sku}</span>
                            <button
                              onClick={() => copySku(p.sku)}
                              className="text-gray-400 hover:text-indigo-600 p-0.5 rounded transition"
                              title="Copiar SKU"
                            >
                              {copiedSku === p.sku ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-gray-800 bg-indigo-50 px-2 py-0.5 rounded-full text-xs">
                          {p.qty} uds
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {fmt(p.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!p.hasDbProduct ? (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            ❌ Fuera de Catálogo / Bloqueado
                          </span>
                        ) : p.stock === 99999 ? (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            Ilimitado
                          </span>
                        ) : p.stock > 0 ? (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                            Stock: {p.stock}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                            Sin Stock (0)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Productos más Vendidos (histórico)</h2>
        {topProducts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin datos de ventas</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topProducts.map((p, i) => {
              const pct = ((p.SOLDQUANTITY ?? 0) / maxSold) * 100;
              return (
                <div key={p.$id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                  <div className="w-9 h-9 rounded-xl bg-gray-200 overflow-hidden shrink-0">
                    {p.IMAGEURL ? <img src={p.IMAGEURL} alt={p.NAME} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.NAME}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">{p.SOLDQUANTITY ?? 0} uds</span>
                    </div>
                    {p.PRICE && (p.SOLDQUANTITY ?? 0) > 0 && (
                      <p className="text-[10px] text-emerald-600 font-medium mt-0.5">{fmt((p.CURRENTPRICE || p.PRICE) * (p.SOLDQUANTITY ?? 0))} est.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Category Revenue */}
      {topCategories.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Ingresos por Categoría (ventas históricas)</h2>
          <div className="space-y-3">
            {(() => {
              const totalCatRev = topCategories.reduce((s, c) => s + c.revenue, 0);
              return topCategories.map(cat => {
                const pct = (cat.revenue / maxCatRev) * 100;
                const share = totalCatRev > 0 ? Math.round((cat.revenue / totalCatRev) * 100) : 0;
                return (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 flex-1 truncate">{cat.name}</span>
                    <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-28 text-right shrink-0">{fmt(cat.revenue)}</span>
                    <span className="text-xs text-gray-400 w-10 text-right shrink-0">{share}%</span>
                    <span className="text-xs text-gray-400 w-14 text-right shrink-0">{cat.units} uds</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Payment Methods */}
      {(() => {
        const pmMap: Record<string, { count: number; revenue: number }> = {};
        for (const o of paidOrders) {
          const pm = o.PAYMENTMETHOD || 'No especificado';
          if (!pmMap[pm]) pmMap[pm] = { count: 0, revenue: 0 };
          pmMap[pm].count++;
          pmMap[pm].revenue += o.TOTAL;
        }
        const entries = Object.entries(pmMap).sort((a, b) => b[1].revenue - a[1].revenue);
        if (entries.length === 0) return null;
        const totalPmRev = entries.reduce((s, [, d]) => s + d.revenue, 0);
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Métodos de Pago</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {entries.map(([pm, data]) => {
                const pct = totalPmRev > 0 ? Math.round((data.revenue / totalPmRev) * 100) : 0;
                return (
                  <div key={pm} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{pm}</p>
                      <span className="text-xs font-bold text-indigo-600 shrink-0 ml-1">{pct}%</span>
                    </div>
                    <p className="text-lg font-bold text-indigo-600">{fmt(data.revenue)}</p>
                    <p className="text-xs text-gray-400">{data.count} pedido{data.count !== 1 ? 's' : ''}</p>
                    <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Hourly Distribution */}
      {orders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución Horaria de Pedidos <span className="text-xs font-normal text-gray-400">(período seleccionado)</span></h2>
          <div className="flex items-end gap-0.5 h-20">
            {hourlyOrders.map(h => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="w-full rounded-t transition-all"
                  style={{ height: `${(h.count / maxHourlyCount) * 64}px`, backgroundColor: h.count === 0 ? '#f3f4f6' : h.count === maxHourlyCount ? '#f59e0b' : '#6366f1', minHeight: '2px' }} />
                <span className="text-[9px] text-gray-400">{h.hour}h</span>
                {h.count > 0 && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {h.count} pedido{h.count !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Pico: {hourlyOrders.reduce((a, b) => b.count > a.count ? b : a).hour}h ({hourlyOrders.reduce((a, b) => b.count > a.count ? b : a).count} pedidos) ·
            Promedio por hora: {hourlyOrders.length > 0 ? Math.round(hourlyOrders.reduce((s, h) => s + h.count, 0) / hourlyOrders.filter(h => h.count > 0).length) : 0} pedidos
          </p>
        </div>
      )}

      {/* Day of week */}
      {orders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Pedidos por Día de Semana <span className="text-xs font-normal text-gray-400">(período seleccionado)</span></h2>
            {(() => {
              const best = dowOrders.reduce((a, b) => b.count > a.count ? b : a);
              if (best.count === 0) return null;
              const bestRevenue = paidOrders.filter(o => new Date(o.$createdAt).getDay() === dowOrders.indexOf(best)).reduce((s, o) => s + o.TOTAL, 0);
              return (
                <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                  Mejor día: {best.day} ({best.count} pedidos{bestRevenue > 0 ? ` · ${fmt(bestRevenue)}` : ''})
                </span>
              );
            })()}
          </div>
          <div className="flex items-end gap-2 h-24">
            {dowOrders.map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                <span className="text-xs font-medium text-gray-700">{d.count > 0 ? d.count : ''}</span>
                <div className="w-full rounded-t transition-all"
                  style={{ height: `${(d.count / maxDowCount) * 56}px`, backgroundColor: d.count === maxDowCount ? '#6366f1' : '#e0e7ff', minHeight: '4px' }} />
                <span className="text-xs text-gray-500 font-medium">{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order size distribution */}
      {paidOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución por Tamaño de Pedido <span className="text-xs font-normal text-gray-400">(pedidos pagados)</span></h2>
          <div className="space-y-2">
            {orderBuckets.map(b => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0 font-medium">{b.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${(b.count / maxBucketCount) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-10 text-right shrink-0">{b.count}</span>
                <span className="text-xs text-gray-400 w-12 text-right shrink-0">
                  {paidOrders.length > 0 ? Math.round((b.count / paidOrders.length) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profitability */}
      {hasCostData && totalEstimatedRevenue > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Rentabilidad Estimada <span className="text-xs font-normal text-gray-400">(histórico, basado en datos de costo)</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-emerald-50 rounded-xl">
              <p className="text-xs text-emerald-600 font-medium">Ingresos estimados</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">{fmt(totalEstimatedRevenue)}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-xl">
              <p className="text-xs text-red-600 font-medium">Costo estimado</p>
              <p className="text-xl font-bold text-red-700 mt-1">{fmt(totalEstimatedCost)}</p>
            </div>
            <div className={`p-4 rounded-xl ${estimatedMargin >= 40 ? 'bg-emerald-50' : estimatedMargin >= 20 ? 'bg-amber-50' : 'bg-red-50'}`}>
              <p className={`text-xs font-medium ${estimatedMargin >= 40 ? 'text-emerald-600' : estimatedMargin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>Margen bruto</p>
              <p className={`text-xl font-bold mt-1 ${estimatedMargin >= 40 ? 'text-emerald-700' : estimatedMargin >= 20 ? 'text-amber-700' : 'text-red-700'}`}>{estimatedMargin.toFixed(1)}%</p>
            </div>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(estimatedMargin, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Ganancia estimada: {fmt(totalEstimatedRevenue - totalEstimatedCost)}</p>
        </div>
      )}

      {/* Top Customers */}
      {topCustomers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Top Clientes por Ingreso</h2>
            {repeatPct > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                {repeatPct}% clientes recurrentes
              </span>
            )}
          </div>
          <div className="space-y-3">
            {topCustomers.map((c, i) => {
              const pct = (c.revenue / maxCustomerRev) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-gray-400 font-bold shrink-0">{i + 1}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate font-medium">{c.name}</span>
                  <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-28 text-right shrink-0">{fmt(c.revenue)}</span>
                  <span className="text-xs text-gray-400 w-16 text-right shrink-0">{c.orders} pedido{c.orders !== 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
