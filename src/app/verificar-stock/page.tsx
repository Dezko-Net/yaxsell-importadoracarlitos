'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  originalQty: number;
  price: number;
  total: number;
  image?: string;
  id?: string;
  available: boolean;
}

interface OrderData {
  $id: string;
  ORDERCODE: string;
  CUSTOMERNAME: string;
  CUSTOMERPHONE: string;
  ITEMS: string;
  TOTAL: number;
  STATUS: string;
  PAYMENTMETHOD?: string;
}

const BANK_DETAILS = {
  holder: 'Importadora Carlitos',
  rut: '78267426-9',
  bank: 'Banco de Chile',
  type: 'Cuenta Corriente',
  number: '4081220201',
  email: 'contacto@yaxsell.cl',
};

const ACCESS_PASSWORD = 'redes123';

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function ProductThumb({ src, alt }: { src?: string; alt: string }) {
  const [ok, setOk] = useState(true);
  if (src && ok) {
    return (
      <img src={src} alt={alt} onError={() => setOk(false)}
        className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100 bg-gray-50" />
    );
  }
  return (
    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center flex-shrink-0 border border-indigo-100">
      <svg className="w-7 h-7 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    </div>
  );
}

function VerificarStockContent() {
  const params = useSearchParams();
  const code = params.get('code') || '';
  const orderId = params.get('id') || '';
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [waLink, setWaLink] = useState('');
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [storeBank, setStoreBank] = useState<any>(null);
  const [initialSubtotal, setInitialSubtotal] = useState<number>(0);

  // Cargar datos bancarios desde Firestore
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
    if (!orderId && !code) { setLoading(false); return; }
    (async () => {
      try {
        const query = orderId ? `id=${encodeURIComponent(orderId)}` : `code=${encodeURIComponent(code)}`;
        const res = await fetch(`/api/catalogo/order?${query}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.error) { setError(data.error); return; }
        setOrder(data.order);
        if (data.order.STATUS === 'paid') {
          setConfirmed(true);
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(data.order.ITEMS || '[]');
        const mapped: OrderItem[] = parsed.map((i: any) => ({
          sku: i.sku || '',
          name: i.name || '',
          qty: i.qty || 1,
          originalQty: i.qty || 1,
          price: i.price || 0,
          total: (i.price || 0) * (i.qty || 1),
          image: i.image || i.img || i.IMAGEURL || '',
          id: i.id || '',
          available: true,
        }));
        setItems(mapped);
        const initialSum = mapped.reduce((s, it) => s + it.total, 0);
        setInitialSubtotal(Number(data.order.SUBTOTAL || data.order.TOTAL || initialSum));

        // Enriquecer imágenes faltantes desde el catálogo principal (por id o nombre)
        if (mapped.some(m => !m.image)) {
          try {
            const pr = await fetch('/api/public-data/products?limit=1000', { cache: 'no-store' });
            const pd = await pr.json();
            const arr: any[] = Array.isArray(pd) ? pd : (pd.products || pd.documents || []);
            const byId = new Map<string, string>();
            const byName = new Map<string, string>();
            for (const p of arr) {
              const img = p.IMAGEURL || p.image || '';
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
          } catch { /* best-effort */ }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [code, orderId]);

  const toggleAvailable = (idx: number) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, available: !it.available } : it));
  const updateQty = (idx: number, qty: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const q = Math.min(it.originalQty, Math.max(1, Math.floor(qty) || 1));
      return { ...it, qty: q, total: it.price * q };
    }));
  };
  const incrementQty = (idx: number) => setItems(prev => prev.map((it, i) => {
    if (i !== idx) return it;
    const q = Math.min(it.originalQty, it.qty + 1);
    return { ...it, qty: q, total: it.price * q };
  }));
  const decrementQty = (idx: number) => setItems(prev => prev.map((it, i) => {
    if (i !== idx) return it;
    const q = Math.max(1, it.qty - 1);
    return { ...it, qty: q, total: it.price * q };
  }));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const availableItems = items.filter(i => i.available);
  const newTotal = availableItems.reduce((sum, i) => sum + i.total, 0);

  const [stockErrorItems, setStockErrorItems] = useState<any[] | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    setStockErrorItems(null);
    try {
      const res = await fetch('/api/catalogo/confirm-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order?.$id || orderId || undefined, orderCode: order?.ORDERCODE || code, items }),
      });
      const data = await res.json();
      if (data.stockError) {
        // Mostrar lista de productos con stock insuficiente
        setStockErrorItems(data.itemsWithStock || []);
        setSaving(false);
        return;
      }
      if (data.error) { setError(data.error); return; }

      const phone = (order?.CUSTOMERPHONE || '').replace(/\D/g, '');
      const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.yaxsell.cl';
      const hasDiscount = initialSubtotal > newTotal;
      const diff = initialSubtotal - newTotal;

      let msg = `Hola, ya verificamos el stock de tu pedido ${code}.\n\n`;
      msg += hasDiscount
        ? `Hemos ajustado tu cotizacion con los productos disponibles:\n\n`
        : `Confirmamos el stock de tu pedido. Todo esta disponible:\n\n`;
      availableItems.forEach(i => {
        msg += `- ${i.name}\n`;
        msg += `  ${i.qty} x $${i.price.toLocaleString('es-CL')} = $${i.total.toLocaleString('es-CL')}\n`;
      });
      if (hasDiscount) {
        msg += `\n------------------------\n`;
        msg += `Subtotal original: $${initialSubtotal.toLocaleString('es-CL')}\n`;
        msg += `Productos quitados / diferencia: -$${diff.toLocaleString('es-CL')}\n`;
        msg += `Total final a transferir: $${newTotal.toLocaleString('es-CL')}\n------------------------\n\n`;
      } else {
        msg += `\nTotal a transferir: $${newTotal.toLocaleString('es-CL')}\n\n`;
      }
      const bd = data.bankDetails || storeBank || BANK_DETAILS;
      msg += `*Datos para transferir:*\n`;
      msg += `Titular: ${bd.holder}\n`;
      msg += `RUT: ${bd.rut}\n`;
      msg += `Banco: ${bd.bank}\n`;
      msg += `Tipo: ${bd.type}\n`;
      msg += `N: ${bd.number}\n`;
      msg += `Email: ${bd.email}\n\n`;
      msg += `Realiza la transferencia e ingresa a este enlace para subir tu comprobante y completar tus datos de envio:\n`;
      msg += `${siteUrl}/confirmar-pedido?id=${encodeURIComponent(String(order?.$id || orderId))}\n\n`;
      msg += `Gracias por tu compra.`;

      const link = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      setWaLink(link);
      setConfirmed(true);
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
          <div className="text-gray-400 text-sm">Cargando pedido…</div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-4">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-[0_10px_40px_rgba(79,70,229,0.12)] border border-indigo-100 p-8 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Acceso interno</h1>
          <p className="text-sm text-gray-500 mb-4">Ingresa la contraseña para verificar el stock.</p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { if (passwordInput === ACCESS_PASSWORD) { setAuthed(true); setError(''); } else setError('Contraseña incorrecta'); } }}
            placeholder="Contraseña"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none text-center font-semibold mb-3"
          />
          <button
            onClick={() => { if (passwordInput === ACCESS_PASSWORD) { setAuthed(true); setError(''); } else setError('Contraseña incorrecta'); }}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition">
            Ingresar
          </button>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  if (stockErrorItems) {
    const phone = (order?.CUSTOMERPHONE || '').replace(/\D/g, '');
    const waPhone = phone ? (phone.length === 9 ? '56' + phone : phone) : '';
    const itemsList = stockErrorItems.map((it: any) =>
      `• ${it.name || 'Producto'} — Pedidos: ${it.qty} | Stock actual: ${it.currentStock ?? '?'}`
    ).join('\n');
    const notifyMsg = `¡Hola! 🐾 Sobre tu pedido *#${code}*, estuvimos revisando el stock y lamentablemente algunos productos no están disponibles en la cantidad solicitada:\n\n${itemsList}\n\n¿Quieres que ajustemos tu pedido con lo que tenemos disponible, o prefieres elegir otros productos? Cuéntame y te ayudo. 🐾`;
    const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(notifyMsg)}` : null;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_10px_40px_rgba(239,68,68,0.14)] border border-red-100 p-6 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-400 to-rose-500" />
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center border border-red-100">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Stock insuficiente</h1>
              <p className="text-xs text-gray-500">Pedido <span className="font-mono font-bold text-indigo-600">#{code}</span></p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Estos productos no tienen stock suficiente para confirmar el pedido:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {stockErrorItems.map((it: any, idx: number) => (
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
          <div className="flex flex-col gap-2">
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Avisar al cliente por WhatsApp
              </a>
            )}
            <button
              onClick={() => setStockErrorItems(null)}
              className="w-full p-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition">
              Volver y ajustar productos
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="text-center">
          <div className="text-red-500 text-xl font-bold mb-2">Error</div>
          <div className="text-gray-500 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_10px_40px_rgba(16,185,129,0.14)] border border-green-100 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-green-400 to-emerald-500" />
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">¡Stock confirmado!</h1>
          <p className="text-gray-500 text-sm mb-6">El pedido <span className="font-mono font-bold text-indigo-600">{code}</span> ya fue confirmado. Este enlace es de un solo uso.</p>
          {waLink ? (
            <>
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="w-full bg-green-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-green-600 active:scale-[0.99] transition mb-3 shadow-lg shadow-green-500/25">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Enviar cotización al cliente
              </a>
              <p className="text-xs text-gray-400">Se abrirá WhatsApp con el mensaje listo para el cliente</p>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fc] pb-40">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
            <div>
              <h1 className="text-lg font-black text-gray-900 leading-tight">Verificar stock</h1>
              <p className="text-xs text-gray-500">Pedido <span className="font-mono font-bold text-indigo-600">{code}</span></p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="font-semibold text-gray-700">{order?.CUSTOMERNAME || 'Cliente'}</span>
            <span>·</span>
            <span>{order?.CUSTOMERPHONE}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        <p className="text-sm text-gray-500">Marca los productos disponibles y ajusta cantidades:</p>
        {items.map((item, idx) => (
          <div key={idx} className={`bg-white rounded-2xl p-4 border-2 transition ${item.available ? 'border-green-200' : 'border-red-200 bg-red-50/30'}`}>
            <div className="flex items-start gap-3">
              <div className={item.available ? '' : 'opacity-50'}>
                <ProductThumb src={item.image} alt={item.name} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm leading-tight ${item.available ? 'text-gray-800' : 'text-gray-500 line-through'}`}>{item.name}</div>
                {item.sku && <span className="inline-block mt-1 text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">SKU {item.sku}</span>}
                <div className="text-sm font-bold text-gray-700 mt-1">${item.price.toLocaleString('es-CL')} c/u</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Pedido: {item.originalQty} un.</div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleAvailable(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${item.available ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                  {item.available ? '✓ Disponible' : '✗ No hay'}
                </button>
                <button onClick={() => removeItem(idx)}
                  className="text-[11px] text-red-400 hover:text-red-600 font-semibold transition flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                  Eliminar
                </button>
              </div>
            </div>
            {item.available && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => decrementQty(idx)}
                  className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-200 transition flex-shrink-0">−</button>
                <input type="number" min="1" max={item.originalQty} value={item.qty}
                  onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                  onFocus={e => e.target.select()}
                  className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center font-bold" />
                <button onClick={() => incrementQty(idx)}
                  disabled={item.qty >= item.originalQty}
                  className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-200 transition flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                <span className="text-[10px] text-gray-400 ml-1">max {item.originalQty}</span>
                <span className="text-sm font-bold text-gray-900 ml-auto">= ${item.total.toLocaleString('es-CL')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 p-4 pb-6 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto space-y-2.5">
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200/80 flex items-center justify-between text-xs sm:text-sm">
            <div className="flex flex-col">
              <span className="text-gray-500 font-medium text-[11px]">Subtotal inicial:</span>
              <span className="font-semibold text-gray-800 font-mono text-xs sm:text-sm">${initialSubtotal.toLocaleString('es-CL')}</span>
            </div>
            {initialSubtotal > newTotal && (
              <div className="flex flex-col text-center">
                <span className="text-rose-600 font-medium text-[11px]">Diferencia / Quitado:</span>
                <span className="font-bold text-rose-600 font-mono text-xs sm:text-sm">-${(initialSubtotal - newTotal).toLocaleString('es-CL')}</span>
              </div>
            )}
            <div className="flex flex-col text-right">
              <span className="text-gray-500 font-medium text-[11px]">Subtotal final ({availableItems.length} disp.):</span>
              <span className="text-lg sm:text-xl font-black text-emerald-600 font-mono">${newTotal.toLocaleString('es-CL')}</span>
            </div>
          </div>
          <button onClick={handleConfirm} disabled={saving || availableItems.length === 0}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 active:scale-[0.99] transition disabled:opacity-50 shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2">
            {saving ? 'Confirmando…' : initialSubtotal > newTotal ? `Confirmar stock y generar cotización ($${newTotal.toLocaleString('es-CL')})` : `Confirmar stock ($${newTotal.toLocaleString('es-CL')})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerificarStockPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white"><div className="text-gray-400">Cargando…</div></div>}>
      <VerificarStockContent />
    </Suspense>
  );
}
