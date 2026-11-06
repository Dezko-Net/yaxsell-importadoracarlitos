'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { CHILE_REGIONES } from '@/types';
import { AgencyLogo } from '@/components/catalogo/AgencyLogos';
import { getOrderAutoCancelDeadline } from '@/lib/order-expiration';

const BANK_DETAILS = {
  holder: 'Importadora Carlitos',
  rut: '78267426-9',
  bank: 'Banco de Chile',
  type: 'Cuenta Corriente',
  number: '4081220201',
  email: 'contacto@yaxsell.cl',
};

interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
  total: number;
  image: string;
  id: string;
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function PaymentCountdown({ expiresAt, overdue = false }: { expiresAt: number; overdue?: boolean }) {
  const [remaining, setRemaining] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setExpired(true); setRemaining('Expirado'); return; }
      setUrgent(diff < 120000);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) {
        setRemaining(`${h}h ${m < 10 ? '0' + m : m}m ${s < 10 ? '0' + s : s}s`);
      } else {
        setRemaining(`${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (expired) {
    return (
      <div className="rounded-2xl bg-red-50 border-2 border-red-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <span className="text-xl">⏰</span>
        <div>
          <p className="text-sm font-black text-red-700">{overdue ? 'La cancelación está en proceso' : 'El plazo de pago ha vencido'}</p>
          <p className="text-xs text-red-500">{overdue ? 'El pedido se cancelará y el stock reservado se devolverá en breve.' : 'El pedido conserva su reserva hasta cumplir 24 horas desde su creación.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border-2 px-4 py-3 flex items-center gap-3 shadow-sm transition-colors ${urgent ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
      <span className="text-xl animate-pulse">⏱️</span>
      <div className="flex-1">
        <p className={`text-sm font-black ${urgent ? 'text-red-700' : 'text-amber-800'}`}>
          {overdue ? 'El pedido se cancela en:' : 'Tiempo restante para pagar:'} <span className="font-mono">{remaining}</span>
        </p>
        <p className={`text-xs ${urgent ? 'text-red-500' : 'text-amber-600'}`}>
          {overdue ? 'Tu pago inicial venció; sube el comprobante antes de que se cancele.' : urgent ? '¡Queda poco tiempo! Transfiere ahora.' : 'Realiza la transferencia antes de que se acabe el tiempo.'}
        </p>
      </div>
    </div>
  );
}

function ConfirmarPedidoContent() {
  const params = useSearchParams();
  const code = params.get('code');
  const orderId = params.get('id');
  const [order, setOrder] = useState<any>(null);
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerRut, setCustomerRut] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [region, setRegion] = useState('');
  const [comuna, setComuna] = useState('');
  const [address, setAddress] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [agency, setAgency] = useState('');
  const [agencies, setAgencies] = useState<any[]>([]);
  const [storeBank, setStoreBank] = useState<any>(null);

  const comunas = region ? CHILE_REGIONES[region] || [] : [];

  useEffect(() => {
    if (!order) return;
    const vendorId = order.VENDOR_ID || '';
    const query = vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : '';
    fetch(`/api/agencies${query}`)
      .then(r => r.json())
      .then(d => setAgencies(d.agencies || []))
      .catch(() => setAgencies([]));
  }, [order?.$id, order?.VENDOR_ID]);

  // Cargar datos bancarios desde Firestore (store_settings)
  useEffect(() => {
    fetch('/api/store-settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data && (data.bankAccountNumber || data.bankEmail || data.bankAccountHolder)) {
          setStoreBank({
            holder: data.bankAccountHolder || BANK_DETAILS.holder,
            rut: data.bankRut || BANK_DETAILS.rut,
            bank: data.bankName || BANK_DETAILS.bank,
            type: data.bankAccountType || BANK_DETAILS.type,
            number: data.bankAccountNumber || BANK_DETAILS.number,
            email: data.bankEmail || BANK_DETAILS.email,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!orderId && !code) {
      setError('Falta el enlace o número del pedido');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const orderQuery = orderId
          ? `id=${encodeURIComponent(orderId)}`
          : `code=${encodeURIComponent(code || '')}`;
        const res = await fetch(`/api/catalogo/order?${orderQuery}`, { cache: 'no-store' });
        let data = await res.json();
        if ((!res.ok || data.error) && res.status === 404 && !orderId && code) {
          const vendorRes = await fetch(`/api/vendor/public-order?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
          res = vendorRes;
          data = await res.json();
        }
        if (!res.ok || data.error) { setError(data.error || 'Pedido no encontrado'); return; }
        setOrder(data.order);
        setVendorInfo(data.vendor || null);
        if (data.bankDetails) setStoreBank(data.bankDetails);
        setCustomerName(data.order.CUSTOMERNAME || '');
        setCustomerRut(data.order.CUSTOMERRUT || '');
        setCustomerEmail(data.order.CUSTOMEREMAIL || '');
        if (data.order.STATUS === 'shipped' || data.order.STATUS === 'delivered') {
          setSuccess(true);
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(data.order.ITEMS || '[]');
        const mapped: OrderItem[] = parsed.map((i: any) => ({
          sku: i.sku || '',
          name: i.name || '',
          qty: i.qty || 1,
          price: i.price || 0,
          total: (i.qty || 1) * (i.price || 0),
          image: i.image || i.img || i.IMAGEURL || '',
          id: i.id || '',
        }));
        setItems(mapped);
        if (data.order.REGION) setRegion(data.order.REGION);
        if (data.order.COMUNA) setComuna(data.order.COMUNA);
        if (data.order.ADDRESS) setAddress(data.order.ADDRESS);
        if (data.order.ADDITIONALINFO) setAdditionalInfo(data.order.ADDITIONALINFO);
        if (data.order.SHIPPINGAGENCY) setAgency(data.order.SHIPPINGAGENCY);

        // Enriquecer imágenes faltantes desde el catálogo principal (por id o nombre)
        if (mapped.some(m => !m.image)) {
          try {
            const pr = await fetch('/api/public-data/products?limit=1000', { cache: 'no-store' });
            const pd = await pr.json();
            const arr: any[] = Array.isArray(pd) ? pd : (pd.products || pd.documents || []);
            const byId = new Map<string, string>();
            const byName = new Map<string, string>();
            for (const p of arr) {
              const img = p.IMAGEURL || p.IMAGEURL2 || p.IMAGEURL3 || p.image || p.img || '';
              if (!img) continue;
              const pid = String(p.$id || p.id || '');
              if (pid) byId.set(pid, img);
              const nm = norm(p.NAME || p.name || '');
              if (nm) byName.set(nm, img);
            }
            setItems(prev => prev.map(it => {
              if (it.image) return it;
              const img = (it.id && byId.get(it.id)) || byName.get(norm(it.name)) || '';
              return img ? { ...it, image: img } : it;
            }));
          } catch { /* enriquecimiento best-effort */ }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [code, orderId]);

  const total = items.reduce((s, i) => s + i.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!region || !comuna || !address) { setError('Completa región, comuna y dirección'); return; }
    setSaving(true);
    setError('');
    try {
      const shipRes = await fetch('/api/catalogo/shipping-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.$id,
          orderCode: code,
          customerName: customerName.trim(),
          customerRut: customerRut.trim(),
          customerEmail: customerEmail.trim(),
          region,
          comuna,
          address,
          additionalInfo,
          shippingAgency: agency
        }),
      });
      const shipData = await shipRes.json();
      if (shipData.error) { setError(shipData.error); return; }

      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-[3px] border-indigo-200 border-t-indigo-600 animate-spin" />
          <div className="text-gray-400 text-sm">Cargando tu pedido…</div>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          </div>
          <div className="text-gray-800 text-lg font-bold mb-1">No pudimos abrir el pedido</div>
          <div className="text-gray-500 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_10px_40px_rgba(79,70,229,0.12)] border border-indigo-100 p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 to-blue-500" />
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">¡Datos recibidos con éxito!</h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-2">
            Tus datos de envío para el pedido <span className="font-mono font-bold text-indigo-600">{code}</span> fueron guardados correctamente.
          </p>
          <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">
            El número de soporte se comunicará para informarte el estado de tu pedido ni bien salga. También puedes revisar el estado desde tu cuenta en cualquier momento:
          </p>
          <div className="mt-6 flex flex-col gap-3 justify-center">
            <Link
              href="/cuenta?pedidos=1"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition active:scale-95"
            >
              <span>📦 Ver mis pedidos en mi cuenta</span>
            </Link>
            <Link
              href={`/pedido/${order?.$id || code}`}
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition"
            >
              Ver detalle del pedido #{code}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header compacto de la tienda */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-blue-600 text-white px-4 pt-4 pb-5 sm:pt-5 sm:pb-6 sticky top-0 z-20 shadow-xl shadow-indigo-900/15">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-black leading-tight">Completa tus datos de envío</h1>
            <p className="text-indigo-100 text-xs mt-0.5">Código <span className="font-mono font-bold text-white">{code}</span></p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Tienda */}
        <div className="rounded-3xl border p-4 sm:p-5 flex items-center gap-3 shadow-sm shadow-slate-200/70" style={{ background: `linear-gradient(135deg, #fff, ${vendorInfo?.brandColor || '#4f46e5'}0d)`, borderColor: `${vendorInfo?.brandColor || '#4f46e5'}33` }}>
          {vendorInfo?.logoUrl ? <img src={vendorInfo.logoUrl} alt={vendorInfo.name || 'Tienda'} className="w-12 h-12 rounded-2xl object-contain bg-white border border-white shadow-sm" /> : <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-xl shadow-sm">🏪</div>}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Estás comprando en</span>
            <h2 className="font-black text-gray-900 truncate">{vendorInfo?.name || 'Importadora Carlitos'}</h2>
          </div>
          <span className="ml-auto shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/80 text-gray-500">Pedido {code}</span>
        </div>

        {/* Cronómetro de pago */}
        {order?.EXPIRESAT && order?.STATUS === 'paid' && !order?.PAYMENTPROOFURL && (
          <PaymentCountdown expiresAt={Number(order.EXPIRESAT)} />
        )}
        {order?.STATUS === 'payment_expired' && getOrderAutoCancelDeadline(order) > 0 && !order?.PAYMENTPROOFURL && (
          <PaymentCountdown expiresAt={getOrderAutoCancelDeadline(order)} overdue />
        )}

        {/* Cliente */}
        {order?.CUSTOMERNAME && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-white rounded-2xl px-4 py-3 border border-slate-200 shadow-sm">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="font-semibold text-gray-700">{order.CUSTOMERNAME}</span>
            {order.CUSTOMERPHONE && <><span>·</span><span>{order.CUSTOMERPHONE}</span></>}
          </div>
        )}
        {/* Progreso */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 text-[11px] font-bold">
          <span className="flex items-center gap-1.5 text-emerald-600 whitespace-nowrap"><span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] shadow-sm">✓</span>Stock confirmado</span>
          <span className="flex-1 h-1 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-400" />
          <span className="flex items-center gap-1.5 text-emerald-600 whitespace-nowrap"><span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] shadow-sm">✓</span>Comprobante recibido</span>
          <span className="flex-1 h-1 rounded-full bg-gradient-to-r from-emerald-400 to-indigo-400" />
          <span className="flex items-center gap-1.5 text-indigo-600 whitespace-nowrap"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] shadow-sm">3</span>Datos de envío</span>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,.95fr)] lg:items-start lg:gap-5">
          <div className="space-y-4">
        {/* Productos confirmados */}
        <div className="bg-white rounded-3xl shadow-[0_8px_24px_rgba(15,23,42,0.05)] border border-slate-200/80 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            <h2 className="font-bold text-gray-900">Tu pedido ({items.length})</h2>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <ProductThumb src={item.image} alt={item.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-snug">{item.name}</p>
                  {item.sku && <span className="inline-block mt-1 text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">SKU {item.sku}</span>}
                  <p className="text-xs text-gray-500 mt-1">{item.qty} × ${item.price.toLocaleString('es-CL')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-bold text-gray-900">${item.total.toLocaleString('es-CL')}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-dashed border-gray-200">
            <span className="font-bold text-gray-700">Total</span>
            <span className="text-2xl font-black text-indigo-600">${total.toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* Estado comprobante */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">✓</div>
          <div>
            <h3 className="font-bold text-emerald-900 text-sm">Comprobante registrado por WhatsApp</h3>
            <p className="text-xs text-emerald-700 mt-0.5">Tu pago fue recibido y está en revisión. Por favor completa tus datos de entrega para programar tu despacho.</p>
          </div>
        </div>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Datos del cliente */}
          <div className="bg-white rounded-3xl shadow-[0_8px_24px_rgba(15,23,42,0.05)] border border-slate-200/80 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm7-2h6m-3-3v6" /></svg>
              <h2 className="font-bold text-gray-900">Tus datos</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">Opcional: complétalos para que la tienda pueda identificarte y contactarte correctamente.</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 block">Nombre completo <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombres y apellidos" autoComplete="name" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 block">RUT <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input type="text" value={customerRut} onChange={e => setCustomerRut(e.target.value)} placeholder="Ej: 12.345.678-9" autoComplete="off" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 block">Correo electrónico <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="tu@correo.com" autoComplete="email" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm" />
              </div>
            </div>
          </div>

          {/* Datos de envío */}
          <div className="bg-white rounded-3xl shadow-[0_8px_24px_rgba(15,23,42,0.05)] border border-slate-200/80 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h11v8H5zM16 10h3l2 2v4h-5M7 18a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              <h2 className="font-bold text-gray-900">Datos de envío</h2>
            </div>

            {/* Agencia */}
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Elige tu transporte</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
              {agencies.map(ag => {
                const sel = agency === ag.name;
                return (
                  <button
                    type="button"
                    key={ag.name}
                    onClick={() => {
                      setAgency(ag.name);
                      if (ag.name === 'RETIRO EN TIENDA') {
                        setRegion('Región Metropolitana');
                        setComuna('Estación Central');
                        setAddress('Chacabuco 08, Estación Central, Chile');
                        setAdditionalInfo('Referencia: Al lado de Carnicería El Carnicero (https://maps.app.goo.gl/XYFewki3NjcTRoGr7)');
                      }
                    }}
                    className="relative flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition"
                    style={{ border: `2px solid ${sel ? ag.color : '#eef0f4'}`, background: sel ? ag.bg : '#fff' }}
                  >
                    {sel && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px]" style={{ background: ag.color }}>✓</span>
                    )}
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: sel ? '#fff' : ag.bg }}>
                      {ag.logo ? (
                        <img src={ag.logo} alt={ag.name} className="w-full h-full object-contain" />
                      ) : (
                        <AgencyLogo name={ag.name} color={ag.color} />
                      )}
                    </span>
                    <span className="text-[11px] font-extrabold leading-tight" style={{ color: sel ? ag.color : '#374151' }}>{ag.name}</span>
                    <span className="text-[9px] text-gray-400 leading-tight">{ag.desc}</span>
                  </button>
                );
              })}
            </div>

            {agency === 'RETIRO EN TIENDA' && (
              <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                  📍 Retiro en Tienda: Chacabuco 08, Estación Central, Chile
                </div>
                <div className="text-emerald-700">
                  <strong>Referencia:</strong> Al lado de Carnicería El Carnicero
                </div>
                <div>
                  <a
                    href="https://maps.app.goo.gl/XYFewki3NjcTRoGr7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline font-bold hover:text-blue-800 inline-flex items-center gap-1 mt-0.5"
                  >
                    🗺️ Ver en Google Maps (Cómo llegar)
                  </a>
                </div>
              </div>
            )}

            {/* Región */}
            <div className="mb-3">
              <label className="text-sm font-bold text-gray-700 mb-1 block">Región</label>
              <select value={region} onChange={e => { setRegion(e.target.value); setComuna(''); }}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm bg-white">
                <option value="">Selecciona región</option>
                {Object.keys(CHILE_REGIONES).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Comuna */}
            <div className="mb-3">
              <label className="text-sm font-bold text-gray-700 mb-1 block">Comuna</label>
              <select value={comuna} onChange={e => setComuna(e.target.value)} disabled={!region}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm disabled:opacity-50 bg-white">
                <option value="">Selecciona comuna</option>
                {comunas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Dirección */}
            <div className="mb-3">
              <label className="text-sm font-bold text-gray-700 mb-1 block">Dirección</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="Calle, número, depto/block"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm" />
            </div>

            {/* Info adicional */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1 block">Información adicional <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea value={additionalInfo} onChange={e => setAdditionalInfo(e.target.value)}
                placeholder="Referencias, horarios, etc." rows={2}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-sm resize-none" />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9 16H3l9-16z" /></svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(640px,calc(100vw-2rem))] bg-white/95 backdrop-blur-xl border border-slate-200 p-2 sm:p-3 rounded-2xl sm:rounded-3xl shadow-[0_12px_40px_rgba(15,23,42,0.18)] z-20">
            <div className="max-w-5xl mx-auto flex items-center gap-2.5 sm:gap-3">
              <div className="flex flex-col leading-none pl-1 sm:pl-3 min-w-[72px] sm:min-w-[82px]">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-extrabold">Total</span>
                <span className="text-base sm:text-xl font-black text-indigo-600">${total.toLocaleString('es-CL')}</span>
              </div>
              <button type="submit" disabled={saving}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-extrabold py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl hover:from-indigo-700 hover:to-blue-700 active:scale-[0.99] transition disabled:opacity-50 shadow-lg shadow-indigo-600/25 text-sm sm:text-base">
                {saving ? 'Guardando…' : 'Confirmar datos'}
              </button>
            </div>
          </div>
        </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductThumb({ src, alt }: { src: string; alt: string }) {
  const [ok, setOk] = useState(true);
  if (src && ok) {
    return (
      <img src={src} alt={alt} onError={() => setOk(false)}
        className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-100 bg-gray-50" />
    );
  }
  return (
    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center flex-shrink-0 border border-indigo-100">
      <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    </div>
  );
}

export default function ConfirmarPedidoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white"><div className="text-gray-400">Cargando…</div></div>}>
      <ConfirmarPedidoContent />
    </Suspense>
  );
}
