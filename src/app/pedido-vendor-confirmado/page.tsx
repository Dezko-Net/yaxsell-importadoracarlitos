'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Check, Upload, CheckCircle2, User, Hash, Building2, CreditCard, Mail } from 'lucide-react';

const FF = '"DM Sans", system-ui, sans-serif';

interface VendorOrderData {
  $id: string;
  ORDERCODE: string;
  ITEMS: string;
  SUBTOTAL: number;
  TOTAL: number;
  STATUS: string;
  PAYMENTPROOFURL?: string;
  CUSTOMERNAME?: string;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n || 0);
}

function OrderBlock({ id, isPrimary, ownerQuery }: { id: string; isPrimary: boolean; ownerQuery: string }) {
  const [order, setOrder] = useState<VendorOrderData | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [bank, setBank] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public-data/vendor-order/${id}${ownerQuery}`);
      const data = await res.json();
      setOrder(data.order);
      setVendorName(data.vendorName || '');
      setBank(data.bank || {});
      setUploaded(!!data.order?.PAYMENTPROOFURL);
    } catch { /* noop */ }
  }, [id, ownerQuery]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/public-data/vendor-order/${id}/upload-proof`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setUploaded(true);
      else alert(data?.error || 'Error al subir el comprobante');
    } catch {
      alert('Error al subir el comprobante');
    }
    setUploading(false);
  };

  const bankRows = [
    { key: 'holder', label: 'Titular', value: bank.holder, icon: <User size={14} /> },
    { key: 'rut', label: 'RUT', value: bank.rut, icon: <Hash size={14} /> },
    { key: 'bank', label: 'Banco', value: bank.bank, icon: <Building2 size={14} /> },
    { key: 'type', label: 'Tipo de cuenta', value: bank.type, icon: <CreditCard size={14} /> },
    { key: 'number', label: 'N° de cuenta', value: bank.number, icon: <Hash size={14} /> },
    { key: 'email', label: 'Email', value: bank.email, icon: <Mail size={14} /> },
  ].filter(r => r.value);

  const copyField = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!order) return <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontFamily: FF }}>Cargando pedido...</div>;

  let items: any[] = [];
  try { items = JSON.parse(order.ITEMS || '[]'); } catch { /* noop */ }

  return (
    <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #dbeafe', padding: '24px 22px', marginBottom: 16, fontFamily: FF }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111' }}>
          Pedido {order.ORDERCODE} {vendorName && <span style={{ color: '#059669' }}>· {vendorName}</span>}
        </h2>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: 999 }}>
          {formatPrice(order.TOTAL)}
        </span>
      </div>

      <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4b5563' }}>
            <span>{it.qty}x {it.name}</span>
            <span style={{ fontWeight: 600 }}>{formatPrice(it.total)}</span>
          </div>
        ))}
      </div>

      {uploaded ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#f0fdf4', borderRadius: 14, border: '1.5px solid #bbf7d0', marginTop: 12 }}>
          <CheckCircle2 size={20} color="#16a34a" />
          <p style={{ margin: 0, fontSize: 13, color: '#166534' }}>Comprobante recibido. {vendorName || 'El vendedor'} confirmará tu pago pronto.</p>
        </div>
      ) : (
        <>
          {bankRows.length > 0 && (
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Datos para transferir a {vendorName || 'este vendedor'}:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bankRows.map(b => (
                  <button key={b.key} onClick={() => copyField(b.key, b.value)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: copied === b.key ? '#f0fdf4' : '#eff6ff', border: `1.5px solid ${copied === b.key ? '#bbf7d0' : '#dbeafe'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>{b.icon}{b.label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#111' }}>
                      {b.value}{copied === b.key ? <Check size={13} color="#16a34a" /> : <Copy size={13} color="#9ca3af" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: 'block', cursor: uploading ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            <input type="file" accept="image/*,.pdf" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
            <div style={{ border: '2px dashed #bfdbfe', borderRadius: 14, padding: '18px 12px', textAlign: 'center', background: '#eff6ff' }}>
              {uploading ? (
                <p style={{ margin: 0, fontSize: 13, color: '#2563eb', fontWeight: 700 }}>Subiendo comprobante...</p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#111', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Upload size={15} /> Subir comprobante de pago
                </p>
              )}
            </div>
          </label>
        </>
      )}
    </div>
  );
}

function VendorOrderConfirmedInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const extraIds = (searchParams.get('vendorOrders') || '').split(',').filter(Boolean);
  const userId = searchParams.get('userId') || '';
  const email = searchParams.get('email') || '';
  const ownerQuery = `?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`;
  const allIds = [id, ...extraIds].filter(Boolean);

  useEffect(() => {
    if (!id) return;
    // Esta ruta legacy no debe renderizar una segunda confirmación: abre directamente la original.
    window.location.replace(`/pedido-confirmado?id=${encodeURIComponent(id)}${ownerQuery.replace('?', '&')}`);
  }, [id, ownerQuery]);

  if (!id) return <div style={{ padding: 40, textAlign: 'center', fontFamily: FF }}>Pedido no encontrado.</div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: FF }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ width: 40, height: 40, margin: '0 auto 14px', border: '4px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 14, fontWeight: 700 }}>Abriendo la confirmación original...</p>
      </div>
    </div>
  );
}

export default function VendorOrderConfirmedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', fontFamily: FF }}>Cargando...</div>}>
      <VendorOrderConfirmedInner />
    </Suspense>
  );
}
