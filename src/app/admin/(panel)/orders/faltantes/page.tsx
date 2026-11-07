'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, PackageSearch } from 'lucide-react';
import { auth, authReady } from '@/lib/firebase';

type Item = { index: number; name: string; sku: string; qty: number; total: number };
type ReviewOrder = { id: string; code: string; customer: string; status: string; items: Item[]; version: string; pending: boolean };
const money = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

export default function RevisarFaltantes() {
  const [order, setOrder] = useState<ReviewOrder | null>(null);
  const [available, setAvailable] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ missingCount: number; originalTotal: number; estimatedTotal: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get('pedido') || '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) { setError('Escanea el QR rojo de una hoja de pedido para iniciar la revisión.'); setLoading(false); return; }
    (async () => {
      try {
        await authReady;
        if (!auth.currentUser) throw new Error('Inicia sesión para revisar este pedido.');
        const response = await fetch(`/api/admin/orders/shortages?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.order) throw new Error(data.error || 'No se pudo cargar el pedido.');
        if (active) { setOrder(data.order); setAvailable(data.order.items.map((item: Item) => item.qty)); setError(''); }
      } catch (e: any) { if (active) setError(e?.message || 'No se pudo cargar el pedido.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [attempt]);
  const send = async () => {
    if (!order || saving) return;
    setSaving(true); setError('');
    try {
      await authReady;
      if (!auth.currentUser) throw new Error('Inicia sesión para guardar la revisión.');
      const response = await fetch('/api/admin/orders/shortages', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify({ id: order.id, version: order.version, available }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la revisión.');
      try { for (const key of Object.keys(sessionStorage)) if (key.startsWith('yaxsel_flow_counts_v2_')) sessionStorage.removeItem(key); } catch {}
      setSaved(data);
    } catch (e: any) { setError(e?.message || 'No se pudo guardar la revisión.'); }
    finally { setSaving(false); }
  };
  return <main className="mx-auto max-w-3xl px-4 py-6 pb-28">
    <Link href="/admin/orders" className="text-sm font-semibold text-slate-500">← Volver a pedidos</Link>
    <div className="mt-4 flex items-center gap-3"><div className="rounded-xl bg-rose-100 p-3 text-rose-700"><PackageSearch size={22}/></div><div><h1 className="text-xl font-extrabold text-slate-950">Revisión de faltantes</h1><p className="text-sm text-slate-500">Indica cuántas unidades encontraste de cada producto.</p></div></div>
    {loading ? <p className="mt-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18}/> Cargando pedido…</p> : saved ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="text-emerald-700"/><h2 className="mt-2 font-bold text-emerald-900">Revisión guardada</h2><p className="mt-2 text-sm text-emerald-800">{saved.missingCount ? 'Los faltantes quedaron pendientes para que la cajera los revise y contacte al cliente.' : 'Todos los productos están disponibles. No se creó un aviso de faltantes.'}</p>{saved.missingCount > 0 && <p className="mt-2 text-sm text-emerald-900">Total original: {money(saved.originalTotal)} · Total estimado: {money(saved.estimatedTotal)}</p>}<Link href="/admin/orders" className="mt-4 inline-block font-bold text-emerald-800">Volver a pedidos</Link></div> : order && <><div className="mt-5 rounded-xl bg-slate-100 p-4"><strong className="text-slate-950">{order.code || order.id}</strong><p className="mt-1 text-sm text-slate-600">{order.customer || 'Cliente sin nombre'}</p>{order.pending && <p className="mt-2 text-sm font-bold text-rose-700">Ya hay una revisión pendiente. Al guardar se actualizará.</p>}{order.status !== 'payment_confirmed' && <p className="mt-2 text-sm font-bold text-rose-700">El pedido debe tener el pago confirmado para registrar faltantes.</p>}</div><div className="mt-4 space-y-3">{order.items.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-start gap-3"><input type="checkbox" checked={available[index] === item.qty} onChange={event => setAvailable(current => current.map((value, i) => i === index ? (event.target.checked ? item.qty : 0) : value))} aria-label={`Todo disponible: ${item.name}`} className="mt-1 h-5 w-5 accent-emerald-600"/><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.sku ? `${item.sku} · ` : ''}Solicitadas: {item.qty} · {money(item.total)}</p></div></div><label className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">Unidades encontradas <input type="number" min={0} max={item.qty} step={1} value={available[index] ?? 0} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= item.qty) setAvailable(current => current.map((old, i) => i === index ? value : old)); }} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-right text-base"/></label>{available[index] < item.qty && <p className="mt-2 text-sm font-bold text-rose-700">Faltan {item.qty - available[index]} unidades</p>}</div>)}</div><button type="button" onClick={() => void send()} disabled={saving || order.status !== 'payment_confirmed'} className="mt-5 w-full rounded-xl bg-rose-700 px-5 py-4 font-bold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Enviar revisión'}</button></>}
    {error && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800"><p className="flex items-start gap-2"><AlertTriangle size={18} className="shrink-0"/>{error}</p>{order && <button type="button" onClick={() => { setLoading(true); setSaved(null); setAttempt(value => value + 1); }} className="mt-2 font-bold underline">Recargar pedido</button>}</div>}
  </main>;
}
