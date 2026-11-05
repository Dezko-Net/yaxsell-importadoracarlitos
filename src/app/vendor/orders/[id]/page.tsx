'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, MapPin, Phone, Mail, Copy, Check, Truck, CreditCard, Clock, RefreshCw, ExternalLink, FileText } from 'lucide-react';
import { generateOrderPdf } from '@/lib/generateOrderPdf';

interface VendorOrder {
  $id: string;
  ORDERCODE: string;
  CUSTOMERNAME: string;
  CUSTOMERRUT?: string;
  CUSTOMERPHONE?: string;
  CUSTOMEREMAIL?: string;
  ADDRESS?: string;
  REGION?: string;
  COMUNA?: string;
  ADDITIONALINFO?: string;
  ITEMS: string;
  SUBTOTAL: number;
  TOTAL: number;
  STATUS: string;
  PAYMENTPROOFURL?: string;
  PAYMENTMETHOD?: string;
  SHIPPINGAGENCY?: string;
  CREATEDAT: number;
  UPDATEDAT?: number;
  PAYMENTEXPIREDAT?: number;
  AUTOCANCELAT?: number;
  EXPIRESAT?: number;
  $createdAt?: string;
}

const STATUS_OPTIONS = [
  ['paid', 'Stock Confirmado'], ['payment_review', 'Revisando Pago'], ['payment_confirmed', 'Pago Confirmado'],
  ['shipped', 'Embalado'], ['delivered', 'Entregado a Agencia'], ['negotiation', 'Negociando'],
] as const;

function normalizeVendorStatus(status: string, hasProof = false) {
  if (status === 'payment_expired') return hasProof ? 'payment_review' : 'paid';
  if (['pending', 'pending_stock', 'processing'].includes(status)) return 'paid';
  if (status === 'preparing') return 'shipped';
  return status;
}

const formatPrice = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const formatDate = (value?: number | string) => value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : '—';

export default function VendorOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<VendorOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<Record<string, any>>({});
  const [branding, setBranding] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendor/orders/${params.id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Pedido no encontrado');
      setOrder(data.order);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el pedido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.body.classList.add('vendor-order-detail-open');
    load();
    return () => document.body.classList.remove('vendor-order-detail-open');
  }, [params.id]);

  useEffect(() => {
    fetch('/api/vendor/profile').then(res => res.json()).then(data => setBranding(data.vendor || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!order) return;
    let parsed: any[] = [];
    try { parsed = JSON.parse(order.ITEMS || '[]'); } catch {}
    const ids = parsed.map(item => item.id || item.productId).filter(Boolean);
    if (!ids.length) return;
    fetch(`/api/public-data/products?ids=${encodeURIComponent(ids.join(','))}`)
      .then(res => res.json()).then(data => {
        const map: Record<string, any> = {};
        (data.products || []).forEach((product: any) => { map[product.$id] = product; });
        setCatalogProducts(map);
      }).catch(() => {});
  }, [order]);

  const updateStatus = async (status: string) => {
    if (!order || updating || status === order.STATUS) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/vendor/orders/${order.$id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar');
      setOrder(data.order);
    } catch (e: any) { setError(e?.message || 'No se pudo actualizar el estado'); }
    finally { setUpdating(false); }
  };

  const cancelOrder = async () => {
    if (!order || updating || order.STATUS === 'cancelled') return;
    if (!window.confirm('¿Cancelar este pedido? El stock de sus productos será restituido.')) return;
    await updateStatus('cancelled');
  };

  const copy = async (key: string, value: string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch {}
    setCopied(key);
    window.setTimeout(() => setCopied(k => k === key ? null : k), 1500);
  };

  if (loading) return <div className="max-w-5xl mx-auto py-10 text-center text-sm text-gray-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Cargando pedido…</div>;
  if (error || !order) return <div className="max-w-5xl mx-auto py-10"><button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 mb-5"><ArrowLeft className="w-4 h-4" /> Volver</button><div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">{error || 'Pedido no encontrado'}</div></div>;

  let items: any[] = [];
  try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
  const displayStatus = normalizeVendorStatus(order.STATUS, Boolean(order.PAYMENTPROOFURL));
  const address = [order.ADDRESS, order.COMUNA, order.REGION].filter(Boolean).join(', ');
  const mapQuery = encodeURIComponent(`${address || 'Chile'}, Chile`);
  const shippingText = [order.CUSTOMERNAME, order.CUSTOMERRUT, order.CUSTOMERPHONE, order.CUSTOMEREMAIL, address, order.SHIPPINGAGENCY].filter(Boolean).join('\n');
  const ageHours = Math.max(0, Math.floor((Date.now() - new Date(order.CREATEDAT || order.$createdAt || Date.now()).getTime()) / 3600000));
  const ageLabel = ageHours < 1 ? 'Ahora' : ageHours < 24 ? `${ageHours}h` : `${Math.floor(ageHours / 24)}d ${ageHours % 24}h`;

  return (
    <>
            <div className="max-w-6xl mx-auto pb-10 space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/vendor/orders" className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Volver a mis pedidos</Link>
        <div className="flex items-center gap-2">
          <button onClick={() => generateOrderPdf(order as any, items as any, undefined, undefined, branding)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition shadow-sm"><FileText className="w-3.5 h-3.5" /> PDF</button>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50"><RefreshCw className="w-3.5 h-3.5" /> Actualizar</button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-50 text-emerald-700">📦</span>
            <div>
              <p className="text-sm font-extrabold text-gray-900">Estado del pedido</p>
              <p className="text-[11px] text-gray-500">El stock de esta tienda queda reservado al recibir el pedido.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-2xl font-black text-gray-900">{formatPrice(order.TOTAL)}</span>
            {order.STATUS !== 'cancelled' && <button type="button" onClick={cancelOrder} disabled={updating} className="text-xs font-bold px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition disabled:opacity-50">Cancelar pedido</button>}
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="vendor-order-status" className="text-xs font-bold text-gray-500 shrink-0">Estado actual</label>
          {displayStatus === 'cancelled'
            ? <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">Cancelado</span>
            : <select id="vendor-order-status" value={displayStatus} onChange={event => updateStatus(event.target.value)} disabled={updating} className="w-full sm:w-auto min-w-56 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60">
              {STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>}
        </div>
      </section>
      {/* Comprobante de pago — acción prioritaria */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${order.PAYMENTPROOFURL ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3"><span className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${order.PAYMENTPROOFURL ? 'bg-emerald-100' : 'bg-amber-100'}`}>{order.PAYMENTPROOFURL ? '✓' : '!'}</span><div><p className={`text-sm font-extrabold ${order.PAYMENTPROOFURL ? 'text-emerald-900' : 'text-amber-900'}`}>{order.PAYMENTPROOFURL ? 'Comprobante de pago recibido' : 'Comprobante de pago pendiente'}</p><p className={`text-xs mt-0.5 ${order.PAYMENTPROOFURL ? 'text-emerald-700' : 'text-amber-700'}`}>{order.PAYMENTPROOFURL ? 'Revisa el comprobante para confirmar el pago.' : 'El cliente todavía no ha enviado un comprobante.'}</p></div></div>
          {order.PAYMENTPROOFURL ? <a href={order.PAYMENTPROOFURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition shadow-sm"><FileText className="w-4 h-4" /> Ver comprobante <ExternalLink className="w-3.5 h-3.5" /></a> : <span className="px-3 py-2 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold">Pendiente</span>}
        </div>
      </div>

      {/* Resumen superior — igual que el detalle admin */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: formatPrice(order.TOTAL), icon: '💰', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Items', value: `${items.reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0)} uds`, icon: '📦', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Estado', value: STATUS_OPTIONS.find(([key]) => key === displayStatus)?.[1] || (displayStatus === 'cancelled' ? 'Cancelado' : displayStatus), icon: '🕐', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Antigüedad', value: ageLabel, icon: '⏱', color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(card => <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 flex items-center gap-2.5"><span className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center text-base`}>{card.icon}</span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{card.label}</p><p className={`text-sm sm:text-base font-extrabold ${card.color} truncate`}>{card.value}</p></div></div>)}
      </div>

      {/* Notas y seguimiento — bloque visible como en admin */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-500" /><h2 className="text-sm font-bold text-gray-900">Notas y seguimiento</h2></div>
        <div className="p-4 sm:p-5"><p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Historial del pedido</p><div className="relative ml-2 border-l-2 border-gray-200 pl-4 space-y-3"><div className="relative"><span className="absolute -left-[22px] top-0.5 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white ring-1 ring-indigo-100" /><p className="text-sm font-semibold text-gray-800">Pedido creado</p><p className="text-xs text-gray-400">{formatDate(order.CREATEDAT || order.$createdAt)}</p></div>{order.UPDATEDAT && order.UPDATEDAT !== order.CREATEDAT && <div className="relative"><span className="absolute -left-[22px] top-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white ring-1 ring-emerald-100" /><p className="text-sm font-semibold text-gray-800">Pedido actualizado</p><p className="text-xs text-gray-400">{formatDate(order.UPDATEDAT)}</p></div>}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">
          {address && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"><div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2"><MapPin className="w-4 h-4 text-indigo-500" /><h2 className="text-sm font-bold text-gray-900">Ubicación de entrega</h2></div><div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"><p className="text-[10px] font-bold uppercase text-emerald-700 mb-1">Dirección ingresada</p><p className="text-xs font-semibold text-gray-800">{order.ADDRESS || '—'}</p><p className="text-[11px] text-gray-500">{[order.COMUNA, order.REGION].filter(Boolean).join(', ')}</p></div><div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"><p className="text-[10px] font-bold uppercase text-indigo-700 mb-1">Mapa de entrega</p><p className="text-xs text-gray-600">Verifica que la ubicación corresponda a la dirección indicada.</p></div></div><div className="aspect-[16/9] sm:aspect-[21/9] w-full"><iframe title="Mapa de entrega" width="100%" height="100%" style={{ border: 0 }} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${mapQuery}`} /></div></div>}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5"><div className="flex items-center justify-between mb-3"><h2 className="text-sm font-bold text-gray-900">Productos del pedido</h2><span className="text-xs text-gray-400">{items.length} producto{items.length !== 1 ? 's' : ''}</span></div><div className="space-y-2">{items.map((item, index) => { const qty = item.qty || item.quantity || 1; const price = item.price || item.unitPrice || 0; const catalog = catalogProducts[item.id || item.productId] || {}; const stock = catalog.STOCK; return <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"><div className="w-12 h-12 rounded-lg bg-white border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">{item.img || item.image ? <img src={item.img || item.image} alt="" className="w-full h-full object-contain" /> : <Package className="w-5 h-5 text-gray-300" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900 truncate">{item.name || item.title || 'Producto'}</p><p className="text-xs text-gray-500">{qty} × {formatPrice(price)}</p>{stock !== undefined && <p className="text-[10px] text-gray-400 mt-0.5">Stock: {stock === 99999 ? 'Ilimitado' : stock} disp</p>}</div><p className="text-sm font-bold text-gray-900">{formatPrice(item.total || qty * price)}</p></div>; })}</div></div>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5"><h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Cliente</h2><div className="space-y-2.5 text-sm"><p className="font-bold text-gray-900">{order.CUSTOMERNAME || '—'}</p>{[['Teléfono', order.CUSTOMERPHONE, Phone], ['Email', order.CUSTOMEREMAIL, Mail]].map(([label, value, Icon]: any) => value ? <div key={label} className="flex items-center gap-2 text-gray-600"><Icon className="w-4 h-4 text-gray-400" />{label === 'Teléfono' ? <a href={`tel:${String(value).replace(/\D/g, '')}`} className="hover:text-indigo-600">{value}</a> : <span className="truncate">{value}</span>}</div> : null)}</div></div>
          <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-4 sm:p-5"><div className="flex items-center justify-between mb-3"><h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Datos para despacho</h2><button onClick={() => copy('shipping', shippingText)} className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center gap-1">{copied === 'shipping' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Copiar</button></div><div className="space-y-2 text-xs"><p><span className="text-gray-400 block">RUT</span><b>{order.CUSTOMERRUT || '—'}</b></p><p><span className="text-gray-400 block">Dirección</span><b>{address || '—'}</b></p><p><span className="text-gray-400 block">Agencia</span><b>{order.SHIPPINGAGENCY || '—'}</b></p><p><span className="text-gray-400 block">Método de pago</span><b>{order.PAYMENTMETHOD || '—'}</b></p></div></div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5"><h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Resumen</h2><div className="space-y-2 text-sm"><div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPrice(order.SUBTOTAL)}</span></div><div className="flex justify-between pt-2 border-t border-gray-100 font-black text-gray-900"><span>Total</span><span>{formatPrice(order.TOTAL)}</span></div></div></div>
          {order.ADDITIONALINFO && <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4"><h2 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Información adicional</h2><p className="text-sm text-amber-900 whitespace-pre-wrap">{order.ADDITIONALINFO}</p></div>}
        </div>
      </div>
    </div>
    </>
  );
}
