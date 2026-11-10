'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Camera, CheckCircle2, Loader2, PackageCheck, RefreshCw } from 'lucide-react';
import { auth, authReady } from '@/lib/firebase';
import type { Html5Qrcode } from 'html5-qrcode';

type OrderPreview = { id: string; code: string; customer: string; status: string; agency: string };
const labels: Record<string, string> = { payment_confirmed: 'Pago confirmado', shipped: 'Embalado', delivered: 'Entregado', cancelled: 'Cancelado', paid: 'Stock confirmado · falta verificar pago', payment_review: 'Revisando pago', payment_expired: 'Pago vencido' };

function readOrderId(value: string): string | null {
  try {
    const url = new URL(value);
    const allowed = new Set([window.location.hostname]);
    if (!allowed.has(url.hostname) || !['https:', 'http:'].includes(url.protocol)) return null;
    const match = url.pathname.match(/^\/pedido\/([A-Za-z0-9_-]{1,128})\/?$/);
    if (match) return match[1];
    if (/^\/admin\/orders\/comprobacion\/?$/.test(url.pathname)) {
      const id = url.searchParams.get('pedido') || '';
      return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
    }
    return null;
  } catch { return null; }
}

export default function ComprobacionPedidos() {
  const cameraQueue = useRef<Promise<void>>(Promise.resolve());
  const busyRef = useRef(false);
  const lastRef = useRef('');
  const pendingRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<string[]>([]);
  const [boxCount, setBoxCount] = useState(0);
  const [boxSizes, setBoxSizes] = useState<string[]>([]);
  const boxesReady = boxCount > 0 && boxSizes.length === boxCount && boxSizes.every(size => ['S', 'M', 'L'].includes(size));

  const token = async () => { await authReady; if (!auth.currentUser) throw new Error('Inicia sesión para comprobar pedidos.'); return auth.currentUser.getIdToken(); };
  const onDecoded = useCallback(async (decoded: string) => {
    if (!busyRef.current && !pendingRef.current) {
      try {
        const url = new URL(decoded);
        const allowed = new Set([window.location.hostname]);
        const shortageId = url.searchParams.get('pedido') || '';
        if (allowed.has(url.hostname) && ['https:', 'http:'].includes(url.protocol) && /^\/admin\/orders\/faltantes\/?$/.test(url.pathname) && /^[A-Za-z0-9_-]{1,128}$/.test(shortageId)) {
          busyRef.current = true;
          window.location.assign(`/admin/orders/faltantes?pedido=${encodeURIComponent(shortageId)}`);
          return;
        }
      } catch { /* El QR no contiene una URL válida. */ }
    }
    const id = readOrderId(decoded);
    if (!id || id === lastRef.current || busyRef.current || pendingRef.current) return;
    lastRef.current = id;
    busyRef.current = true;
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/scan?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el pedido.');
      pendingRef.current = true;
      setBoxCount(0);
      setBoxSizes([]);
      setPreview(data.order);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(80);
    } catch (e: any) { setError(e?.message || 'No se pudo consultar el pedido.'); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  // Mantener bloqueado el último pedido hasta escanear otro o pedir una relectura.
  const onScanMiss = useCallback(() => {}, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('pedido');
    if (id && /^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      void onDecoded(`${window.location.origin}/admin/orders/comprobacion?pedido=${encodeURIComponent(id)}`);
    }
  }, [onDecoded]);

  useEffect(() => {
    let disposed = false;
    let instance: Html5Qrcode | null = null;
    let started = false;
    const start = async () => {
      await cameraQueue.current;
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('La cámara requiere HTTPS o localhost. Abre la página desde una conexión segura HTTPS.');
        }
        const { Html5Qrcode: Reader, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (disposed) return;
        instance = new Reader('order-camera-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
        try {
          // Preferir la trasera sin exigir una restricción que algunos teléfonos no informan.
          await instance.start({ facingMode: 'environment' }, { fps: 10 }, onDecoded, onScanMiss);
        } catch {
          // Algunos equipos solo identifican la cámara por su ID.
          const devices = await Reader.getCameras();
          const external = devices.find(device =>
            /rear|back|trasera|environment|usb|external|externa|webcam|camera 0|cámara 0/i.test(device.label)
            && !/front|frontal|delantera|user/i.test(device.label),
          );
          if (!external || disposed) throw new Error('No se encontró una cámara exterior.');
          await instance.start(external.id, { fps: 10 }, onDecoded, onScanMiss);
        }
        started = true;
        if (!disposed) { setRunning(true); setCameraError(''); }
      } catch (cameraFailure: unknown) {
        if (!disposed) {
          const detail = cameraFailure instanceof Error ? cameraFailure.message : String(cameraFailure || '');
          setCameraError(detail.includes('HTTPS') ? detail : 'No se pudo iniciar la cámara. Permite el acceso en el navegador, cierra otras aplicaciones que la usen y vuelve a intentar.');
        }
      }
    };
    const starting = start();
    return () => {
      disposed = true;
      setRunning(false);
      cameraQueue.current = starting.then(async () => {
        if (instance && started) { await instance.stop().catch(() => {}); instance.clear(); }
      }).catch(() => {});
    };
  }, [onDecoded, onScanMiss, cameraAttempt]);

  const dismiss = () => { setPreview(null); setBoxCount(0); setBoxSizes([]); pendingRef.current = false; };
  const confirm = async () => {
    if (!preview || busyRef.current || !boxesReady) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/orders/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ id: preview.id, boxSizes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el pedido.');
      setMessage(data.alreadyPacked ? 'Este pedido ya estaba embalado.' : 'Pedido marcado como embalado. Puedes escanear el siguiente.');
      if (!data.alreadyPacked) setCompleted(previous => [preview.code || preview.id, ...previous].slice(0, 12));
      dismiss();
    } catch (e: any) { setError(e?.message || 'No se pudo actualizar el pedido.'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    {preview && typeof document !== 'undefined' && createPortal(<div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-slate-950/65 px-4 py-6" style={{ zIndex: 2147483000, paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} role="dialog" aria-modal="true" aria-labelledby="scan-result-title">
      <div className="my-auto w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-emerald-700"><PackageCheck size={22}/><h2 id="scan-result-title" className="text-lg font-extrabold">Pedido encontrado</h2></div>
        <p className="mt-3 text-2xl font-extrabold text-slate-950">{preview.code || preview.id}</p>
        <p className="mt-1 text-sm font-bold text-slate-700">{preview.customer || 'Cliente sin nombre'}</p>
        <p className="mt-1 text-sm text-slate-500">{preview.agency || 'Envío por definir'}</p>
        <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-700">Estado: {labels[preview.status] || preview.status}</p>
        {preview.status === 'payment_confirmed' ? <><p className="mt-4 text-sm font-bold text-slate-800">¿El pedido ya está embalado?</p>
          <label className="mt-3 block text-sm font-bold text-slate-700">¿Cuántas cajas son?
            <select value={boxCount} onChange={event => { const count = Number(event.target.value); setBoxCount(count); setBoxSizes(previous => Array.from({ length: count }, (_, index) => previous[index] || '')); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-semibold text-slate-900">
              <option value={0}>Selecciona la cantidad</option>{Array.from({ length: 10 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} {count === 1 ? 'caja' : 'cajas'}</option>)}
            </select>
          </label>
          {boxCount > 0 && <div className="mt-3 max-h-48 space-y-2 overflow-y-auto"><p className="text-sm font-bold text-slate-700">Talla de cada caja</p>{boxSizes.map((size, index) => <fieldset key={index} className="flex items-center gap-2"><legend className="sr-only">Talla de caja {index + 1}</legend><span className="w-16 shrink-0 text-sm font-semibold text-slate-600">Caja {index + 1}</span>{['S', 'M', 'L'].map(option => <button type="button" key={option} aria-pressed={size === option} onClick={() => setBoxSizes(previous => previous.map((value, position) => position === index ? option : value))} className={`flex-1 rounded-lg border px-3 py-2 font-bold ${size === option ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{option}</button>)}</fieldset>)}</div>}
          <div className="mt-4 flex gap-2"><button type="button" disabled={busy || !boxesReady} onClick={() => void confirm()} className="flex-1 rounded-xl bg-emerald-600 px-4 py-4 text-base font-extrabold text-white disabled:opacity-40">{busy ? 'Guardando…' : 'Sí, embalado'}</button><button type="button" disabled={busy} onClick={dismiss} className="rounded-xl border border-slate-300 px-6 py-4 text-base font-bold text-slate-700">No</button></div>{boxCount > 0 && !boxesReady && <p className="mt-2 text-xs text-slate-500">Selecciona la talla de todas las cajas para confirmar.</p>}</> : <button type="button" onClick={dismiss} className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-4 font-bold text-white">Continuar escaneando</button>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </div>, document.body)}
    <Link href="/admin/orders" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Volver a pedidos</Link>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-slate-950">Comprobación de pedidos</h1><p className="mt-1 text-sm text-slate-500">Escanea cada hoja y confirma cuando el pedido esté embalado.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{completed.length} confirmados en esta sesión</span></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold text-slate-800"><Camera size={18}/> Cámara</h2></div><div id="order-camera-reader" className="min-h-56 overflow-hidden rounded-xl bg-slate-900"/><p className="mt-3 text-sm text-slate-500">{running ? 'Cámara activa. Acerca el QR del pedido.' : 'Permite el acceso a la cámara exterior.'}</p>{cameraError && <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><p>{cameraError}</p><button type="button" onClick={() => { setCameraError(''); setCameraAttempt(attempt => attempt + 1); }} className="mt-2 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white">Reintentar cámara</button></div>}<button type="button" onClick={() => { lastRef.current = ''; setError(''); setMessage('Listo para volver a leer el mismo pedido.'); }} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><RefreshCw size={15}/> Volver a leer el mismo código</button></section>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">{busy && !preview ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18}/> Buscando pedido…</p> : preview ? <><div className="flex items-center gap-2 text-emerald-700"><PackageCheck size={20}/><h2 className="font-bold">Pedido encontrado</h2></div><p className="mt-4 text-xl font-extrabold text-slate-950">{preview.code || preview.id}</p><p className="mt-2 text-sm font-semibold text-slate-700">{preview.customer || 'Cliente sin nombre'}</p><p className="mt-1 text-sm text-slate-500">{preview.agency || 'Envío por definir'}</p><p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-700">Estado: {labels[preview.status] || preview.status}</p>{preview.status === 'payment_confirmed' ? <><p className="mt-4 text-sm text-slate-700">¿El pedido ya está embalado?</p><div className="mt-3 flex gap-2"><button disabled={busy || !boxesReady} onClick={() => void confirm()} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Sí, confirmar'}</button><button disabled={busy} onClick={dismiss} className="rounded-xl border border-slate-200 px-4 py-3 font-bold text-slate-700">No</button></div></> : <button onClick={dismiss} className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white">Continuar escaneando</button>}</> : <div className="py-8 text-center text-slate-500"><Camera className="mx-auto mb-3" size={28}/><p className="text-sm">El pedido aparecerá aquí al escanearlo.</p></div>}{error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}{message && <p className="mt-4 flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><CheckCircle2 size={18} className="shrink-0"/>{message}</p>}{completed.length > 0 && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-bold text-slate-700">Últimos pedidos embalados</h3><p className="mt-2 text-sm text-slate-500">{completed.join(' · ')}</p></div>}</section>
    </div>
  </main>;
}
