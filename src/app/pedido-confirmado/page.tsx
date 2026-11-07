'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, Clock, Upload, Copy, Check, AlertTriangle, MapPin, Package,
  Truck, Shield, FileText, Sparkles, Building2, User, CreditCard, Mail,
  Hash, ChevronRight, PartyPopper, MessageCircle
} from 'lucide-react';
import { formatPrice } from '@/lib/db';
import { Order, OrderItem } from '@/types';
import { generateOrderPdf } from '@/lib/generateOrderPdf';
import { getOrderAutoCancelDeadline } from '@/lib/order-expiration';

const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';

interface BankField {
  key: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}

const BANK_DEFAULTS = {
  bankAccountHolder: 'Importadora Carlitos',
  bankRut: '78267426-9',
  bankName: 'Banco de Chile',
  bankAccountType: 'Cuenta Corriente',
  bankAccountNumber: '4081220201',
  bankEmail: 'contacto@yaxsell.cl',
};

function loadBankDetails(): BankField[] {
  try {
    const stored = localStorage.getItem('store_bank_details');
    const p = stored ? { ...BANK_DEFAULTS, ...JSON.parse(stored) } : BANK_DEFAULTS;
    return [
      { key: 'holder', label: 'Titular',         value: p.bankAccountHolder || 'No configurado', icon: <User size={14} /> },
      { key: 'rut',    label: 'RUT',             value: p.bankRut           || 'No configurado', icon: <Hash size={14} /> },
      { key: 'bank',   label: 'Banco',           value: p.bankName          || 'No configurado', icon: <Building2 size={14} /> },
      { key: 'type',   label: 'Tipo de cuenta',  value: p.bankAccountType   || 'Cuenta Vista',   icon: <CreditCard size={14} /> },
      { key: 'number', label: 'N° de cuenta',    value: p.bankAccountNumber || 'No configurado', icon: <Hash size={14} /> },
      { key: 'email',  label: 'Email',           value: p.bankEmail         || 'No configurado', icon: <Mail size={14} /> },
    ];
  } catch {
    return [
      { key: 'holder', label: 'Titular',        value: BANK_DEFAULTS.bankAccountHolder,  icon: <User size={14} /> },
      { key: 'rut',    label: 'RUT',            value: BANK_DEFAULTS.bankRut,   icon: <Hash size={14} /> },
      { key: 'bank',   label: 'Banco',          value: BANK_DEFAULTS.bankName,            icon: <Building2 size={14} /> },
      { key: 'type',   label: 'Tipo de cuenta', value: BANK_DEFAULTS.bankAccountType, icon: <CreditCard size={14} /> },
      { key: 'number', label: 'N° de cuenta',   value: BANK_DEFAULTS.bankAccountNumber,       icon: <Hash size={14} /> },
      { key: 'email',  label: 'Email',          value: BANK_DEFAULTS.bankEmail, icon: <Mail size={14} /> },
    ];
  }
}

function normalizeOrderResponse(input: any): { order: Order; items: OrderItem[] } {
  let raw = input;
  for (let depth = 0; depth < 3; depth += 1) {
    if (raw?.order && typeof raw.order === 'object') raw = raw.order;
    else if (raw?.data && typeof raw.data === 'object') raw = raw.data;
    else break;
  }
  const customer = raw?.customer || raw?.CUSTOMER || {};
  const shipping = raw?.shipping || raw?.delivery || raw?.shippingAddress || {};
  const totals = raw?.totals || raw?.pricing || {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw?.[key];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  };
  const toNumber = (value: unknown, fallback = 0) => {
    const parsed = typeof value === 'string'
      ? Number(value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
      : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  let rawItems = pick('ITEMS', 'items', 'orderItems', 'products');
  if (typeof rawItems === 'string') {
    try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; }
  }
  if (!Array.isArray(rawItems)) {
    rawItems = Array.isArray(rawItems?.items) ? rawItems.items
      : Array.isArray(rawItems?.documents) ? rawItems.documents
        : [];
  }

  const items: OrderItem[] = rawItems.map((item: any) => {
    const product = item?.product || item?.PRODUCT || {};
    const price = toNumber(item?.price ?? item?.PRICE ?? item?.unitPrice ?? product?.price ?? product?.PRICE);
    const qty = toNumber(item?.qty ?? item?.quantity ?? item?.QTY, 1);
    return {
      id: String(item?.id ?? item?.productId ?? item?.$id ?? product?.id ?? product?.$id ?? ''),
      name: String(item?.name ?? item?.NAME ?? item?.productName ?? item?.title ?? product?.name ?? product?.NAME ?? ''),
      price,
      originalPrice: item?.originalPrice == null ? undefined : toNumber(item.originalPrice),
      qty,
      img: String(item?.img ?? item?.image ?? item?.imageUrl ?? item?.IMAGEURL ?? product?.img ?? product?.image ?? product?.IMAGEURL ?? ''),
      total: toNumber(item?.total ?? item?.lineTotal ?? item?.subtotal, price * qty),
      sku: item?.sku == null ? undefined : String(item.sku),
    };
  }).filter(item => item.name.trim() && item.qty > 0);

  const id = String(pick('$id', 'id', '_id', 'orderId') || '');
  const code = String(pick('ORDERCODE', 'orderCode', 'order_code', 'code') || '');
  const subtotal = toNumber(pick('SUBTOTAL', 'subtotal', 'subTotal') ?? totals?.subtotal ?? totals?.SUBTOTAL, NaN);
  const total = toNumber(pick('TOTAL', 'total', 'grandTotal') ?? totals?.total ?? totals?.TOTAL, NaN);
  if (!id || !code || items.length === 0 || !Number.isFinite(subtotal) || !Number.isFinite(total)) {
    throw new Error('El pedido existe, pero sus datos llegaron incompletos. No vuelvas a comprar; intenta recargar o contacta soporte.');
  }

  const order = {
    ...raw,
    $id: id,
    USERID: String(pick('USERID', 'userId') || ''),
    ITEMS: JSON.stringify(items),
    ORDERCODE: code,
    CUSTOMERNAME: String(pick('CUSTOMERNAME', 'customerName', 'name') ?? customer?.name ?? customer?.fullName ?? ''),
    CUSTOMERRUT: String(pick('CUSTOMERRUT', 'customerRut', 'rut') ?? customer?.rut ?? ''),
    CUSTOMERPHONE: String(pick('CUSTOMERPHONE', 'customerPhone', 'phone') ?? customer?.phone ?? ''),
    CUSTOMEREMAIL: String(pick('CUSTOMEREMAIL', 'customerEmail', 'email') ?? customer?.email ?? ''),
    REGION: String(pick('REGION', 'region') ?? shipping?.region ?? ''),
    COMUNA: String(pick('COMUNA', 'comuna', 'city') ?? shipping?.comuna ?? shipping?.city ?? ''),
    ADDRESS: String(pick('ADDRESS', 'address', 'shippingAddress') ?? shipping?.address ?? ''),
    ADDITIONALINFO: String(pick('ADDITIONALINFO', 'additionalInfo') || ''),
    PAYMENTMETHOD: String(pick('PAYMENTMETHOD', 'paymentMethod') || ''),
    SHIPPINGAGENCY: String(pick('SHIPPINGAGENCY', 'shippingAgency') || ''),
    SUBTOTAL: subtotal,
    SHIPPINGCOST: toNumber(pick('SHIPPINGCOST', 'shippingCost')),
    TOTAL: total,
    STATUS: String(pick('STATUS', 'status') || 'pending_stock'),
    PAYMENTPROOFURL: String(pick('PAYMENTPROOFURL', 'paymentProofUrl') || ''),
  } as Order;

  return { order, items };
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:          { label: 'Stock confirmado', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  pending_stock:    { label: 'Stock confirmado', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  processing:       { label: 'Stock confirmado', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  paid:             { label: 'Stock confirmado', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  payment_expired:  { label: 'Pago vencido', color: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
  payment_review:   { label: 'Revisando Pago',   color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
  payment_confirmed:{ label: 'Pago confirmado',  color: '#1b5e20', bg: '#e8f5e9', border: '#a5d6a7' },
  negotiation:      { label: 'Negociando',       color: '#7b1fa2', bg: '#faf5ff', border: '#e9d5ff' },
  shipped:          { label: 'Embalado',         color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
  delivered:        { label: 'Entregado a agencia', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  cancelled:        { label: 'Cancelado',        color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function Countdown({ expiresAt, overdue = false }: { expiresAt: number; overdue?: boolean }) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setDisplay('Expirado'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(overdue || diff < 15 * 60000);
      setDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 22px', background: urgent ? '#fef2f2' : '#eff6ff', border: `2px solid ${urgent ? '#fecaca' : '#bfdbfe'}`, borderRadius: 16 }}>
      <Clock size={20} color={urgent ? '#dc2626' : '#2563eb'} />
      <div style={{ textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: urgent ? '#991b1b' : '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{overdue ? 'El pedido se cancela en' : 'Tiempo restante para pagar'}</p>
        <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 26, fontWeight: 800, color: urgent ? '#dc2626' : '#2563eb', letterSpacing: '0.05em' }}>{display}</p>
      </div>
    </div>
  );
}

function ConfirmadoInner() {
  const params = useSearchParams();
  const orderId = params.get('id') || '';
  const ownerUserId = params.get('userId') || '';
  const ownerEmail = params.get('email') || '';
  const ownerQuery = new URLSearchParams();
  if (ownerUserId) ownerQuery.set('userId', ownerUserId);
  if (ownerEmail) ownerQuery.set('email', ownerEmail);
  const ownerQueryString = ownerQuery.toString();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isVendorOrder, setIsVendorOrder] = useState(false);
  const [vendorBank, setVendorBank] = useState<any>(null);
  const [serverBank, setServerBank] = useState<BankField[] | null>(null);

  useEffect(() => {
    fetch('/api/store-settings')
      .then(r => r.json())
      .then(d => {
        if (d && (d.bankAccountHolder || d.bankName)) {
          setServerBank([
            { key: 'holder', label: 'Titular', value: d.bankAccountHolder || 'No configurado', icon: <User size={14} /> },
            { key: 'rut', label: 'RUT', value: d.bankRut || 'No configurado', icon: <Hash size={14} /> },
            { key: 'bank', label: 'Banco', value: d.bankName || 'No configurado', icon: <Building2 size={14} /> },
            { key: 'type', label: 'Tipo de cuenta', value: d.bankAccountType || 'Cuenta Vista', icon: <CreditCard size={14} /> },
            { key: 'number', label: 'N° de cuenta', value: d.bankAccountNumber || 'No configurado', icon: <Hash size={14} /> },
            { key: 'email', label: 'Email', value: d.bankEmail || d.email || 'No configurado', icon: <Mail size={14} /> },
          ]);
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!orderId) { setIsLoading(false); return; }
    try {
      let o: Order;
      const orderRes = await fetch(`/api/catalogo/order?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      const orderData = await orderRes.json().catch(() => null);
      if (orderRes.ok && orderData?.order) {
        const normalized = normalizeOrderResponse(orderData.order);
        o = normalized.order;
        setItems(normalized.items);
        if (o.IS_VENDOR_ORDER || (o as any).VENDOR_NAME || (o as any).VENDOR_ID) {
          setIsVendorOrder(true);
          const vBank = (o as any).VENDOR_BRANDING || (o as any).BANK_DETAILS || {
            name: (o as any).VENDOR_NAME,
            bankAccountHolder: (o as any).VENDOR_BANK_HOLDER,
            bankRut: (o as any).VENDOR_BANK_RUT,
            bankName: (o as any).VENDOR_BANK_NAME,
            bankAccountType: (o as any).VENDOR_BANK_TYPE,
            bankAccountNumber: (o as any).VENDOR_BANK_ACCOUNT,
            bankEmail: (o as any).VENDOR_BANK_EMAIL,
          };
          setVendorBank(vBank);
        }
        if (orderData.bankDetails) {
          const details = orderData.bankDetails;
          setServerBank([
            { key: 'holder', label: 'Titular', value: details.holder || 'No configurado', icon: <User size={14} /> },
            { key: 'rut', label: 'RUT', value: details.rut || 'No configurado', icon: <Hash size={14} /> },
            { key: 'bank', label: 'Banco', value: details.bank || 'No configurado', icon: <Building2 size={14} /> },
            { key: 'type', label: 'Tipo de cuenta', value: details.type || 'Cuenta Vista', icon: <CreditCard size={14} /> },
            { key: 'number', label: 'N° de cuenta', value: details.number || 'No configurado', icon: <Hash size={14} /> },
            { key: 'email', label: 'Email', value: details.email || 'No configurado', icon: <Mail size={14} /> },
          ]);
        }
      } else {
        const vendorRes = await fetch(`/api/public-data/vendor-order/${encodeURIComponent(orderId)}${ownerQueryString ? `?${ownerQueryString}` : ''}`);
        const vendorData = await vendorRes.json();
        if (!vendorRes.ok || !vendorData?.order) throw new Error(vendorData?.error || 'Pedido no encontrado');
        const normalized = normalizeOrderResponse(vendorData.order);
        o = normalized.order;
        setItems(normalized.items);
        setIsVendorOrder(true);
        setVendorBank(vendorData.branding || vendorData.vendor || null);
      }
      setOrder(o);
      setLoadError('');
      setUploaded(!!o.PAYMENTPROOFURL);
      if (o.STATUS === 'pending' || o.STATUS === 'pending_stock' || o.STATUS === 'processing' || o.STATUS === 'paid' || o.STATUS === 'negotiation') {
        setShowConfetti(true);
      }
    } catch (e) {
      console.error(e);
      setOrder(null);
      setItems([]);
      setLoadError(e instanceof Error ? e.message : 'No pudimos cargar los datos de tu pedido.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId, ownerQueryString]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!order || !['paid', 'payment_expired'].includes(String(order.STATUS)) || order.PAYMENTPROOFURL) return;
    const paymentDeadline = isVendorOrder
      ? getOrderAutoCancelDeadline(order)
      : Number(order.STATUS === 'payment_expired' ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT || order.EXPIRESATBACKEND || 0);
    if (!paymentDeadline) return;
    const delay = Math.max(0, paymentDeadline - Date.now());
    const timeout = setTimeout(async () => {
      if (isVendorOrder) {
        await fetch(`/api/public-data/vendor-order/${encodeURIComponent(order.$id)}${ownerQueryString ? `?${ownerQueryString}` : ''}`, { cache: 'no-store' }).catch(() => null);
      } else {
        await fetch('/api/catalogo/cancel-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.$id, orderCode: order.ORDERCODE }),
        }).catch(() => null);
      }
      await load();
    }, delay + 250);
    return () => clearTimeout(timeout);
  }, [order, load, isVendorOrder, ownerQueryString]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setUploading(true);
    try {
      if (isVendorOrder) {
        const formData = new FormData();
        formData.append('file', file);
        const vendorProof = await fetch(`/api/public-data/vendor-order/${encodeURIComponent(order.$id)}/upload-proof${ownerQueryString ? `?${ownerQueryString}` : ''}`, { method: 'POST', body: formData });
        const vendorData = await vendorProof.json().catch(() => null);
        if (!vendorProof.ok || !vendorData?.ok) throw new Error(vendorData?.error || 'No se pudo subir el comprobante');
        setUploaded(true);
        setOrder(prev => prev ? { ...prev, PAYMENTPROOFURL: vendorData.proofUrl, STATUS: 'payment_review' } : null);
        return;
      }
      const formData = new FormData();
      formData.append('orderId', order.$id);
      formData.append('orderCode', order.ORDERCODE);
      formData.append('file', file);
      const proofRes = await fetch('/api/catalogo/upload-proof', { method: 'POST', body: formData });
      const proofData = await proofRes.json().catch(() => null);
      if (!proofRes.ok || !proofData?.success) throw new Error(proofData?.error || 'No se pudo subir el comprobante');
      setUploaded(true);
      setOrder(prev => prev ? { ...prev, PAYMENTPROOFURL: proofData.proofUrl, STATUS: 'payment_review' } : null);
      fetch('/api/revalidate-orders', { method: 'POST' }).catch(() => {});
      window.dispatchEvent(new Event('orders-updated'));
    } catch (err) {
      console.error(err);
      alert('Error al subir el comprobante. Por favor intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const copyField = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2500);
  };

  const copyAll = (bank: BankField[]) => {
    const text = bank.map(b => `${b.label}: ${b.value}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(null), 2500);
  };

  useEffect(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.classList.remove('overflow-hidden', 'cart-drawer-open');
  }, []);

  if (isLoading) {
    return (
      <div style={{ fontFamily: FF, minHeight: '100vh', background: 'linear-gradient(180deg,#eff6ff 0%,#fff 280px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, border: '4px solid #dbeafe', borderTop: '4px solid #2563eb', borderRadius: '50%', animation: 'pkSpin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Cargando tu pedido...</p>
        </div>
        <style>{`@keyframes pkSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ fontFamily: FF, minHeight: '100vh', background: 'linear-gradient(180deg,#eff6ff 0%,#fff 280px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: '40px 32px', border: '1px solid #dbeafe', textAlign: 'center', maxWidth: 420, boxShadow: '0 10px 40px rgba(37,99,235,0.08)' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={36} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: '0 0 6px' }}>{loadError ? 'No pudimos cargar tu pedido' : 'Pedido no encontrado'}</h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>{loadError || 'No pudimos encontrar el pedido solicitado.'}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => { setIsLoading(true); load(); }} style={{ padding: '11px 24px', background: 'linear-gradient(135deg,#2563eb,#60a5fa)', color: '#fff', border: 0, borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 6px 20px rgba(37,99,235,0.25)' }}>
              Reintentar
            </button>
            <a href="https://wa.me/56962293893" style={{ display: 'inline-block', padding: '11px 24px', background: '#f3f4f6', color: '#111827', borderRadius: 12, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Contactar soporte
            </a>
          </div>
        </div>
      </div>
    );
  }

  const rawPageStatus = isVendorOrder
    ? (uploaded || order.PAYMENTPROOFURL ? 'payment_review' : order.STATUS === 'payment_expired' ? 'payment_expired' : 'paid')
    : order.STATUS;
  const pageStatus = ['pending', 'pending_stock', 'processing'].includes(rawPageStatus) ? 'paid' : rawPageStatus;
  const isStockConfirmed = pageStatus === 'paid' || pageStatus === 'payment_expired';
  const isSuccess = uploaded || (pageStatus !== 'pending' && pageStatus !== 'cancelled' && pageStatus !== 'pending_stock' && pageStatus !== 'processing' && pageStatus !== 'payment_review' && pageStatus !== 'negotiation');
  const BANK = vendorBank ? [
    { key: 'holder', label: 'Titular', value: vendorBank.bankAccountHolder || 'Consultar con la tienda', icon: <User size={14} /> },
    { key: 'rut', label: 'RUT', value: vendorBank.bankRut || '—', icon: <Hash size={14} /> },
    { key: 'bank', label: 'Banco', value: vendorBank.bankName || '—', icon: <Building2 size={14} /> },
    { key: 'type', label: 'Tipo de cuenta', value: vendorBank.bankAccountType || '—', icon: <CreditCard size={14} /> },
    { key: 'number', label: 'N° de cuenta', value: vendorBank.bankAccountNumber || '—', icon: <Hash size={14} /> },
    { key: 'email', label: 'Email', value: vendorBank.bankEmail || '—', icon: <Mail size={14} /> },
  ] : (serverBank || loadBankDetails());
  const status = STATUS_MAP[pageStatus] || { label: pageStatus, color: '#374151', bg: '#f3f4f6', border: '#e5e7eb' };
  const timerDeadline = isVendorOrder ? null : pageStatus === 'payment_expired' ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT;
  const showTimer = !isVendorOrder && isStockConfirmed && timerDeadline && !uploaded;

  return (
    <div style={{ fontFamily: FF, minHeight: '100vh', background: 'linear-gradient(180deg,#eef4ff 0%,#f6f9ff 46%,#f8fafc 100%)', position: 'relative' }}>
      <div className="pk-cc-aurora" aria-hidden="true" />
      {/* Confetti */}
      {showConfetti && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
          {Array.from({ length: 60 }).map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: '-20px',
              width: 8 + Math.random() * 6,
              height: 8 + Math.random() * 6,
              background: ['#3b82f6', '#60a5fa', '#bfdbfe', '#818cf8', '#60a5fa'][Math.floor(Math.random() * 5)],
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              animation: `pkConfetti ${2 + Math.random() * 2}s ${Math.random() * 0.5}s ease-out forwards`,
            }} />
          ))}
        </div>
      )}

      <div className="pk-confirm-container" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px calc(70px + env(safe-area-inset-bottom, 0px))' }}>
        {/* ── Hero celebratorio ── */}
        <div className="pk-cc-hero">
          <div className="pk-cc-hero-orb">
            {isSuccess ? <CheckCircle2 size={46} color="#2563eb" strokeWidth={2.6} /> : <PartyPopper size={44} color="#2563eb" strokeWidth={2.3} />}
          </div>
          <div className="pk-cc-hero-eyebrow">
            <Sparkles size={13} /> Pedido recibido
          </div>
          <h1 className="pk-cc-hero-title">
            {isSuccess ? '¡Pedido confirmado!' : '¡Gracias por tu compra!'}
          </h1>
          {order.CUSTOMERNAME && (
            <p className="pk-cc-hero-sub">
              Hola <strong>{order.CUSTOMERNAME}</strong>, te enviamos los detalles a tu correo.
            </p>
          )}
          <div className="pk-cc-chips">
            <span className="pk-cc-chip">Código <strong>{order.ORDERCODE}</strong></span>
            <span className="pk-cc-chip pk-cc-chip--status" style={{ color: status.color }}>{status.label}</span>
          </div>
        </div>

        {/* ── Timeline ── */}
        {pageStatus !== 'cancelled' && (() => {
          const allSteps = [
            { key: 'paid',       label: 'Stock Confirmado', icon: <CheckCircle2 size={14} /> },
            { key: 'payment_expired', label: 'Pago vencido', icon: <Clock size={14} /> },
            { key: 'payment_review', label: 'Revisando Pago', icon: <Upload size={14} /> },
            { key: 'payment_confirmed', label: 'Pago Confirmado', icon: <CheckCircle2 size={14} /> },
            { key: 'shipped',    label: 'Embalado',         icon: <Package size={14} /> },
            { key: 'delivered',  label: 'Entregado',        icon: <Truck size={14} /> },
          ];
          const steps = allSteps.filter(step => !isVendorOrder || step.key !== 'payment_expired');
          const statusOrder = steps.map(step => step.key);
          const effStatus = pageStatus;
          const currentIdx = statusOrder.indexOf(effStatus);
          return (
            <div className="pk-cc-card" style={{ borderRadius: 20, padding: '24px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 16, left: '10%', right: '10%', height: 3, background: '#dbeafe', zIndex: 0, borderRadius: 999 }} />
                <div style={{ position: 'absolute', top: 16, left: '10%', height: 3, background: 'linear-gradient(90deg,#2563eb,#60a5fa)', zIndex: 1, width: currentIdx >= 0 ? `${(currentIdx / (steps.length - 1)) * 80}%` : '0%', transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)', borderRadius: 999 }} />
                {steps.map((step, i) => {
                  const done = i <= currentIdx;
                  const active = i === currentIdx;
                  return (
                    <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2, flex: 1 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: done ? 'linear-gradient(135deg,#2563eb,#60a5fa)' : '#fff',
                        border: `2px solid ${done ? '#2563eb' : '#dbeafe'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: done ? '#fff' : '#bfdbfe',
                        transition: 'all 0.3s',
                        boxShadow: active ? '0 0 0 6px rgba(37,99,235,0.15)' : done ? '0 4px 12px rgba(37,99,235,0.25)' : 'none',
                      }}>
                        {step.icon}
                      </div>
                      <span style={{ marginTop: 8, fontSize: 11, fontWeight: active ? 800 : 600, color: done ? '#111' : '#9ca3af', textAlign: 'center', lineHeight: 1.2 }}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Timer ── */}
        {showTimer && (
          <div style={{ background: pageStatus === 'payment_expired' ? '#fff1f2' : '#fff', borderRadius: 20, padding: '20px', border: `1px solid ${pageStatus === 'payment_expired' ? '#fecdd3' : '#fde68a'}`, marginBottom: 16, textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: pageStatus === 'payment_expired' ? '#9f1239' : '#92400e', fontWeight: 600 }}>
              {pageStatus === 'payment_expired' ? 'Tu pago venció. El stock se devolverá cuando termine este plazo.' : 'Completa el pago antes de que termine el plazo de reserva'}
            </p>
            <Countdown expiresAt={Number(timerDeadline)} overdue={pageStatus === 'payment_expired'} />
            <p style={{ margin: '12px 0 0', fontSize: 12, color: pageStatus === 'payment_expired' ? '#be123c' : '#b45309' }}>
              {pageStatus === 'payment_expired' ? 'Todavía puedes subir tu comprobante antes de que se cancele.' : 'Después de transferir, sube el comprobante para confirmar tu pedido'}
            </p>
          </div>
        )}

        {/* ── Bank details ── */}
        {isStockConfirmed && !uploaded && (
          <div className="pk-cc-card" style={{ borderRadius: 20, padding: '24px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
                <CreditCard size={18} color="#2563eb" /> {isVendorOrder ? `Datos para transferir a ${vendorBank?.name || (order as any).VENDOR_NAME || 'la tienda'}` : 'Datos para transferir'}
              </h2>
              <button onClick={() => copyAll(BANK)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: copied === 'all' ? 'linear-gradient(135deg,#22c55e,#10b981)' : 'linear-gradient(135deg,#2563eb,#60a5fa)', color: '#fff', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(37,99,235,0.25)', transition: 'all 0.2s' }}>
                {copied === 'all' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar todo</>}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {BANK.map(b => (
                <button key={b.key} onClick={() => copyField(b.key, b.value)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: copied === b.key ? '#f0fdf4' : '#eff6ff', border: `1.5px solid ${copied === b.key ? '#bbf7d0' : '#dbeafe'}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontFamily: 'inherit' }}
                  onMouseEnter={e => { if (copied !== b.key) { (e.currentTarget as HTMLElement).style.background = '#dbeafe'; (e.currentTarget as HTMLElement).style.borderColor = '#bfdbfe'; } }}
                  onMouseLeave={e => { if (copied !== b.key) { (e.currentTarget as HTMLElement).style.background = '#eff6ff'; (e.currentTarget as HTMLElement).style.borderColor = '#dbeafe'; } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
                      {b.icon}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</p>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.value}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: copied === b.key ? '#16a34a' : '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                    {copied === b.key ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '14px 16px', background: 'linear-gradient(135deg,#fff8e1,#fef3c7)', border: '1.5px solid #fde68a', borderRadius: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
                ⚠️ Transfiere exactamente <strong style={{ fontSize: 16, color: '#92400e' }}>{formatPrice(order.TOTAL)}</strong> y sube el comprobante abajo para que confirmemos tu pedido.
              </p>
            </div>
          </div>
        )}

        {/* ── Upload proof ── */}
        {(isStockConfirmed || pageStatus === 'processing' || pageStatus === 'payment_review') && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '24px 22px', border: `1.5px solid ${uploaded ? '#bbf7d0' : '#dbeafe'}`, marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
              <Upload size={18} color={uploaded ? '#16a34a' : '#2563eb'} /> Comprobante de pago
            </h2>
            {uploaded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#f0fdf4', borderRadius: 14, border: '1.5px solid #bbf7d0' }}>
                <CheckCircle2 size={22} color="#16a34a" />
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#166534' }}>Comprobante recibido</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#22c55e' }}>Estamos revisando tu pago. Te avisaremos cuando esté confirmado.</p>
                </div>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280' }}>
                  Sube tu comprobante de transferencia para que confirmemos tu pedido
                </p>
                <label style={{ display: 'block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                  <input type="file" accept="image/*,.pdf" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
                  <div style={{ border: '2px dashed #bfdbfe', borderRadius: 16, padding: '32px 16px', textAlign: 'center', background: '#eff6ff', transition: 'all 0.2s' }}
                    onMouseEnter={e => { if (!uploading) { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLElement).style.background = '#dbeafe'; } }}
                    onMouseLeave={e => { if (!uploading) { (e.currentTarget as HTMLElement).style.borderColor = '#bfdbfe'; (e.currentTarget as HTMLElement).style.background = '#eff6ff'; } }}>
                    {uploading ? (
                      <>
                        <div style={{ width: 36, height: 36, border: '3px solid #dbeafe', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'pkSpin 1s linear infinite', margin: '0 auto 10px' }} />
                        <p style={{ margin: 0, fontSize: 14, color: '#2563eb', fontWeight: 700 }}>Subiendo comprobante...</p>
                      </>
                    ) : (
                      <>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 4px 14px rgba(37,99,235,0.15)' }}>
                          <Upload size={24} color="#2563eb" />
                        </div>
                        <p style={{ margin: '0 0 4px', fontSize: 15, color: '#111', fontWeight: 700 }}>Click para subir comprobante</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>JPG, PNG o PDF · Máx. 10MB</p>
                      </>
                    )}
                  </div>
                </label>
              </>
            )}
          </div>
        )}

        {/* ── WhatsApp Link Section ── (temporalmente oculto) */}
        {false && order && (
        <div className="pk-cc-card" style={{ borderRadius: 20, padding: '24px 22px', marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
            <MessageCircle size={18} color="#25D366" /> Notificaciones por WhatsApp
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            Recibe actualizaciones de tu pedido por WhatsApp. Verifica que tu número esté correcto para asegurar que te lleguen las notificaciones.
          </p>

          {/* Phone display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageCircle size={16} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Número registrado</p>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#111' }}>{order?.CUSTOMERPHONE || 'No registrado'}</p>
            </div>
          </div>

          {/* Verify button */}
          <a
            href={`https://wa.me/56962293893?text=Hola%20Yaxbot,%20quiero%20verificar%20mi%20número%20para%20el%20pedido%20${order?.$id}%20(${order?.ORDERCODE}).%20Mi%20número%20registrado%20es%20${order?.CUSTOMERPHONE}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#25D366', color: '#fff', borderRadius: 14, textDecoration: 'none', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 14px rgba(37,211,102,0.2)', transition: 'all 0.2s' }}
          >
            <MessageCircle size={18} /> Comprobar número
          </a>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.4 }}>
            Si tu número no coincide, Yaxbot te ayudará a vincularlo correctamente desde WhatsApp.
          </p>
        </div>
        )}

        {/* ── Order items ── */}
        <div className="pk-cc-card" style={{ borderRadius: 20, padding: '24px 22px', marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
            <Package size={18} color="#2563eb" /> Detalle del pedido
          </h2>
          {items.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No hay productos para mostrar
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < items.length - 1 ? 12 : 0, borderBottom: i < items.length - 1 ? '1px solid #dbeafe' : 'none', alignItems: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {item.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.img}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => {
                          const img = e.currentTarget;
                          img.style.display = 'none';
                          const parent = img.parentElement;
                          if (parent && !parent.querySelector('.pk-item-fallback')) {
                            const fb = document.createElement('div');
                            fb.className = 'pk-item-fallback';
                            fb.style.cssText = 'font-size:24px;color:#2563eb;font-weight:800;';
                            fb.textContent = (item.name?.[0] || '🛍').toUpperCase();
                            parent.appendChild(fb);
                          }
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 22, color: '#2563eb', fontWeight: 800 }}>{(item.name?.[0] || '🛍').toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 14, color: '#111', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>{item.name}</p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
                      <span style={{ padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: 999, fontWeight: 700 }}>x{item.qty}</span>
                      <span>{formatPrice(item.price)} c/u</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111', flexShrink: 0 }}>{formatPrice(item.total)}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: '1.5px solid #dbeafe', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
              <span>Subtotal</span><span style={{ fontWeight: 600 }}>{formatPrice(order.SUBTOTAL)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
              <span>Envío</span>
              <span style={{ color: order.SHIPPINGCOST > 0 ? '#111' : '#e65c00', fontWeight: 600 }}>
                {order.SHIPPINGCOST > 0 ? formatPrice(order.SHIPPINGCOST) : 'Pagar contraentrega'}
              </span>
            </div>
            {order.SHIPPINGCOST === 0 && order.SHIPPINGAGENCY !== 'RETIRO EN TIENDA' && (
              <div style={{ fontSize: 11, color: '#e65c00', background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: 8, padding: '6px 10px', marginTop: 4, fontWeight: 600 }}>
                ℹ️ El costo de envío se paga al recibir el pedido (contraentrega). No se cobra al momento de la compra.
              </div>
            )}
            {order.DISCOUNT && order.DISCOUNT > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#2563eb' }}>
                <span>Descuento {order.COUPONCODE ? `(${order.COUPONCODE})` : ''}</span>
                <span style={{ fontWeight: 700 }}>−{formatPrice(order.DISCOUNT)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 900, color: '#111', paddingTop: 10, borderTop: '1.5px solid #dbeafe', marginTop: 4, letterSpacing: '-0.02em' }}>
              <span>Total</span><span style={{ color: '#2563eb' }}>{formatPrice(order.TOTAL)}</span>
            </div>
          </div>
        </div>

        {/* ── Shipping info ── */}
        <div className="pk-cc-card" style={{ borderRadius: 20, padding: '24px 22px', marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
            <MapPin size={18} color="#2563eb" /> Datos de envío
          </h2>
          <div style={{ background: '#eff6ff', borderRadius: 14, padding: '14px 16px' }}>
            {order.CUSTOMERNAME && <p style={{ margin: 0, fontWeight: 800, color: '#111', fontSize: 15 }}>{order.CUSTOMERNAME}</p>}
            {(order.CUSTOMERPHONE || order.CUSTOMEREMAIL) && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                {order.CUSTOMERPHONE}
                {order.CUSTOMEREMAIL && <>{order.CUSTOMERPHONE ? ' · ' : ''}{order.CUSTOMEREMAIL}</>}
              </p>
            )}
            {order.ADDRESS && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#374151' }}>{order.ADDRESS}</p>}
            {(order.COMUNA || order.REGION) && (
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#374151' }}>
                {[order.COMUNA, order.REGION].filter(Boolean).join(', ')}
              </p>
            )}
            {order.SHIPPINGAGENCY && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '5px 12px', background: '#fff', borderRadius: 999, border: '1px solid #dbeafe' }}>
                <Truck size={13} color="#2563eb" />
                <span style={{ color: '#2563eb', fontWeight: 700, fontSize: 12 }}>{order.SHIPPINGAGENCY}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Trust ── */}
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderRadius: 20, padding: '18px 22px', border: '1px solid #bbf7d0', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={20} color="#16a34a" />
            </div>
            <div>
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: '#166534' }}>Compra Protegida</p>
              <p style={{ margin: 0, fontSize: 12, color: '#22c55e', lineHeight: 1.5 }}>
                Si tienes algún problema con tu pedido, te devolvemos el dinero.
              </p>
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <button onClick={() => generateOrderPdf(order, items, undefined, undefined, vendorBank ? {
          name: vendorBank.name || 'Tienda asociada', color: vendorBank.color || '#f97316', secondaryColor: vendorBank.secondaryColor || '#fb923c', logoUrl: vendorBank.logoUrl || '', address: vendorBank.address || '', phone: vendorBank.phone || '', email: vendorBank.email || ''
        } : undefined)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', background: '#fff', color: '#2563eb', border: '1.5px solid #dbeafe', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12, transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#dbeafe'; }}>
          <FileText size={16} /> Descargar comprobante PDF
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/productos" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 0', background: 'linear-gradient(135deg,#2563eb,#60a5fa)', color: '#fff', textAlign: 'center', borderRadius: 14, fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 6px 20px rgba(37,99,235,0.25)', transition: 'all 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 28px rgba(37,99,235,0.35)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(37,99,235,0.25)'; }}>
            Seguir comprando <ChevronRight size={16} />
          </Link>
          <Link href="/cuenta/pedidos" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px 0', background: '#fff', color: '#2563eb', textAlign: 'center', borderRadius: 14, fontSize: 14, fontWeight: 700, textDecoration: 'none', border: '1.5px solid #dbeafe', transition: 'all 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eff6ff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
            Ver mis pedidos
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes pkSpin { to { transform: rotate(360deg); } }
        @keyframes pkPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes pkConfetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }

        /* ══ REDISEÑO CONFIRMACIÓN — hero celebratorio + tarjetas premium ══ */
        .pk-cc-aurora { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .pk-cc-aurora::before, .pk-cc-aurora::after { content: ''; position: absolute; border-radius: 50%; filter: blur(80px); }
        .pk-cc-aurora::before { width: 66vw; height: 66vw; max-width: 600px; max-height: 600px; top: -20%; left: -16%; background: radial-gradient(circle, rgba(56,189,248,.22), transparent 68%); }
        .pk-cc-aurora::after  { width: 60vw; height: 60vw; max-width: 540px; max-height: 540px; top: -8%; right: -18%; background: radial-gradient(circle, rgba(59,130,246,.20), transparent 68%); }
        .pk-confirm-container { position: relative; z-index: 1; }

        /* Tarjeta premium con hairline de luz */
        .pk-cc-card {
          position: relative; overflow: hidden;
          background: linear-gradient(180deg,#fff,#fbfcff) !important;
          border: 1px solid rgba(37,99,235,.11) !important;
          border-radius: 20px !important;
          box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 16px 36px -24px rgba(37,99,235,.42) !important;
        }
        .pk-cc-card::before {
          content: ''; position: absolute; top: 0; left: 20px; right: 20px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(56,189,248,.6), rgba(59,130,246,.35), transparent);
          pointer-events: none;
        }

        /* ── HERO celebratorio ── */
        .pk-cc-hero {
          position: relative; overflow: hidden; text-align: center;
          border-radius: 26px; margin-bottom: 16px; padding: 40px 30px 34px;
          background: linear-gradient(150deg,#1d4ed8 0%,#2563eb 42%,#3b82f6 72%,#38bdf8 120%);
          box-shadow: 0 20px 48px -18px rgba(37,99,235,.60), inset 0 1px 0 rgba(255,255,255,.28);
        }
        .pk-cc-hero::before {
          content: ''; position: absolute; top: -40%; left: 50%; transform: translateX(-50%);
          width: 120%; height: 90%;
          background: radial-gradient(closest-side, rgba(255,255,255,.28), transparent 70%);
          pointer-events: none;
        }
        .pk-cc-hero > * { position: relative; z-index: 1; }
        .pk-cc-hero-orb {
          display: flex; align-items: center; justify-content: center;
          width: 92px; height: 92px; border-radius: 50%; margin: 0 auto 16px;
          background: radial-gradient(circle at 50% 35%, #fff, #eaf2ff);
          box-shadow: 0 12px 34px rgba(2,20,60,.30), 0 0 0 10px rgba(255,255,255,.14), inset 0 -6px 14px rgba(37,99,235,.14);
          animation: pkPulse 2.2s ease-in-out infinite;
        }
        .pk-cc-hero-eyebrow {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,.20); color: #fff;
          padding: 5px 14px; border-radius: 999px; font-size: 12px; font-weight: 800;
          letter-spacing: .02em; margin-bottom: 12px;
          border: 1px solid rgba(255,255,255,.30); backdrop-filter: blur(6px);
        }
        .pk-cc-hero-title { margin: 0 0 8px; font-size: 32px; font-weight: 900; color: #fff; letter-spacing: -.03em; line-height: 1.08; text-shadow: 0 2px 14px rgba(2,20,60,.28); }
        .pk-cc-hero-sub { margin: 0 0 18px; font-size: 15px; color: rgba(255,255,255,.9); }
        .pk-cc-hero-sub strong { color: #fff; }
        .pk-cc-chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center; }
        .pk-cc-chip {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 15px; border-radius: 999px; font-size: 13px; font-weight: 700;
          background: rgba(255,255,255,.16); color: #fff;
          border: 1px solid rgba(255,255,255,.28); backdrop-filter: blur(8px);
        }
        .pk-cc-chip strong { font-family: monospace; letter-spacing: .04em; }
        .pk-cc-chip--status { background: #fff; color: #1d4ed8; }
        /* Mobile compact styles for checkout confirmation */
        @media (max-width: 768px) {
          .pk-confirm-container {
            padding: 12px 12px calc(70px + env(safe-area-inset-bottom, 0px)) !important;
          }
          .pk-cc-hero {
            padding: 30px 20px 24px !important;
            border-radius: 22px !important;
            margin-bottom: 12px !important;
          }
          .pk-cc-hero-orb { width: 72px !important; height: 72px !important; margin-bottom: 12px !important; }
          .pk-cc-hero-orb svg { width: 36px !important; height: 36px !important; }
          .pk-cc-hero-title { font-size: 25px !important; }
          .pk-cc-hero-sub { font-size: 13px !important; margin-bottom: 14px !important; }
          /* Compactar tarjetas en móvil */
          .pk-cc-card {
            border-radius: 16px !important;
            padding: 16px 14px !important;
            margin-bottom: 10px !important;
          }
          /* Hide the bottom navbar on this page to prevent overlap */
          .tpl1-bottom-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function PedidoConfirmadoPage() {
  return (
    <Suspense fallback={
      <div style={{ fontFamily: FF, minHeight: '100vh', background: 'linear-gradient(180deg,#eff6ff 0%,#fff 280px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 60, height: 60, border: '4px solid #dbeafe', borderTop: '4px solid #2563eb', borderRadius: '50%', animation: 'pkSpin 1s linear infinite' }} />
        <style>{`@keyframes pkSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ConfirmadoInner />
    </Suspense>
  );
}
