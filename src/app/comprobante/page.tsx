'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { parsePaymentProofs, serializePaymentProofs, MAX_PAYMENT_PROOFS } from '@/lib/payment-proofs';

const ACCESS_PASSWORD = 'redes123';

function ComprobanteContent() {
  const params = useSearchParams();
  const code = params.get('code') || '';
  const orderId = params.get('id') || '';
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    if (!orderId && !code) { setLoading(false); return; }
    (async () => {
      try {
        const query = orderId ? `id=${encodeURIComponent(orderId)}` : `code=${encodeURIComponent(code)}`;
        const res = await fetch(`/api/catalogo/order?${query}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.error) { setError(data.error); return; }
        setOrder(data.order);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [code, orderId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    const current = parsePaymentProofs(order.PAYMENTPROOFURL);
    if (current.length >= MAX_PAYMENT_PROOFS) { setError('Solo se permiten hasta 3 comprobantes'); return; }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('orderId', order.$id);
      formData.append('orderCode', order.ORDERCODE || code);
      formData.append('file', file);
      const res = await fetch('/api/catalogo/upload-proof', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setUploading(false); return; }
      setOrder((prev: any) => prev ? { ...prev, PAYMENTPROOFURL: serializePaymentProofs([...current, data.proofUrl]) } : prev);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-lg">Cargando...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Acceso restringido</h1>
          <p className="text-sm text-gray-500 mb-4">Esta página es solo para uso interno. Ingresa la contraseña.</p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && passwordInput === ACCESS_PASSWORD) setAuthed(true); }}
            placeholder="Contraseña"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-300 focus:outline-none text-center font-semibold mb-3"
          />
          <button
            onClick={() => { if (passwordInput === ACCESS_PASSWORD) setAuthed(true); else setError('Contraseña incorrecta'); }}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition">
            Ingresar
          </button>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-500 text-xl font-bold mb-2">Error</div>
          <div className="text-gray-500">{error}</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">¡Comprobante subido!</h1>
          <p className="text-gray-500">El pedido {order?.ORDERCODE || code} quedó en estado "por verificar". El administrador revisará el pago pronto.</p>
        </div>
      </div>
    );
  }

  const items = (() => { try { return JSON.parse(order?.ITEMS || '[]'); } catch { return []; } })();

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-800">Subir Comprobante</h1>
          <p className="text-sm text-gray-500">Pedido <span className="font-mono font-bold text-indigo-600">{order?.ORDERCODE || code}</span></p>
          <p className="text-sm text-gray-500">Cliente: <span className="font-semibold">{order?.CUSTOMERNAME}</span> · {order?.CUSTOMERPHONE}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Order summary */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Resumen del pedido</h2>
          {items.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              {item.image && <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />}
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">{item.name}</div>
                <div className="text-xs text-gray-400">{item.qty} x ${item.price?.toLocaleString('es-CL')}</div>
              </div>
              <div className="text-sm font-bold text-gray-700">${item.total?.toLocaleString('es-CL')}</div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200">
            <span className="font-bold text-gray-800">Total</span>
            <span className="text-xl font-bold text-gray-800">${order?.TOTAL?.toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* Upload area */}
        {(() => {
          const proofs = parsePaymentProofs(order?.PAYMENTPROOFURL);
          const canAdd = proofs.length < MAX_PAYMENT_PROOFS;
          return (
            <div className="bg-white rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="font-bold text-gray-800 mb-1">Comprobante(s) de pago</h2>
                <p className="text-sm text-gray-500">Sube la foto o PDF del comprobante. Máximo 3.</p>
              </div>
              {proofs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {proofs.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-3 p-3 border border-emerald-200 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-emerald-700 truncate">Comprobante {i + 1}</p>
                        <p className="text-[10px] text-emerald-500">Ver archivo</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
              {error && <div className="text-red-500 text-sm">{error}</div>}
              {success && <div className="text-emerald-600 text-sm font-semibold">Comprobante subido correctamente.</div>}
              {canAdd ? (
                <label className={`block ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input type="file" accept="image/*,.pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
                  <div className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-blue-50/10 transition">
                    {uploading ? (
                      <div className="text-blue-500 font-semibold">Subiendo...</div>
                    ) : (
                      <>
                        <svg className="w-10 h-10 text-blue-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <div className="text-blue-600 font-semibold">Toca para subir comprobante {proofs.length + 1} de {MAX_PAYMENT_PROOFS}</div>
                        <div className="text-xs text-gray-400 mt-1">JPG, PNG o PDF</div>
                      </>
                    )}
                  </div>
                </label>
              ) : (
                <div className="p-4 text-center text-sm text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
                  Ya se subieron los {MAX_PAYMENT_PROOFS} comprobantes permitidos.
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function ComprobantePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Cargando...</div></div>}>
      <ComprobanteContent />
    </Suspense>
  );
}
