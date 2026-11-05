'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, FileImage, Loader2, Printer, X, XCircle } from 'lucide-react';
import { parsePaymentProofs } from '@/lib/payment-proofs';

export type BulkPaymentReviewOrder = {
  $id: string;
  USERID: string;
  ORDERCODE: string;
  CUSTOMERNAME: string;
  CUSTOMERRUT: string;
  CUSTOMERPHONE: string;
  CUSTOMEREMAIL: string;
  PAYMENTMETHOD: string;
  CREATEDAT: number;
  SUBTOTAL: number;
  SHIPPINGCOST: number;
  DISCOUNTAMOUNT: number;
  TOTAL: number;
  ITEMS: Array<{ id: string; name: string; sku: string; qty: number; price: number; total: number; img: string }>;
  PAYMENTPROOFURL: string;
  PURCHASEDFROMLIVE: boolean;
  REGION: string;
  IS_VENDOR_ORDER: boolean;
  VENDOR_ID: string;
  VENDOR_NAME: string;
  STATUS: string;
};

export type ReviewDecision = 'yes' | 'no';

type Props = {
  orders: BulkPaymentReviewOrder[];
  decisions: Record<string, ReviewDecision>;
  truncated: boolean;
  loading: boolean;
  confirming: boolean;
  error: string;
  onDecision: (orderId: string, decision: ReviewDecision) => void;
  onClose: () => void;
  onConfirm: () => void;
};

const money = (value: unknown) => new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
}).format(Number(value) || 0);

const dateLabel = (value: number) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(value)
  : 'Fecha no disponible';

function OrderProof({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const isPdf = /\.pdf(?:\?|$)/i.test(url);
  if (failed) return <div className="flex h-full min-h-0 items-center justify-center bg-slate-100 text-sm text-slate-500">No se pudo cargar este comprobante.</div>;
  if (isPdf) {
    return <iframe title={`Comprobante ${index + 1}`} src={url} className="h-full min-h-0 w-full bg-white" onError={() => setFailed(true)} />;
  }
  return <img src={url} alt={`Comprobante de pago ${index + 1}`} className="h-full min-h-0 w-full object-contain" onError={() => setFailed(true)} />;
}

export default function BulkPaymentReviewModal({
  orders, decisions, truncated, loading, confirming, error, onDecision, onClose, onConfirm,
}: Props) {
  const [activeId, setActiveId] = useState('');
  const [proofIndex, setProofIndex] = useState(0);
  const activeOrder = orders.find(order => order.$id === activeId) || orders[0] || null;
  const activeProofs = useMemo(() => activeOrder ? parsePaymentProofs(activeOrder.PAYMENTPROOFURL) : [], [activeOrder]);
  const yesCount = Object.values(decisions).filter(value => value === 'yes').length;
  const decidedCount = Object.keys(decisions).length;
  const pendingCount = Math.max(0, orders.length - decidedCount);
  const canConfirm = !loading && !confirming && !truncated && yesCount > 0 && yesCount <= 100 && pendingCount === 0;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirming) onClose();
      if (event.key === 'ArrowRight' && activeOrder && activeProofs.length > proofIndex + 1) setProofIndex(index => index + 1);
      if (event.key === 'ArrowLeft' && proofIndex > 0) setProofIndex(index => index - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeOrder, activeProofs.length, confirming, onClose, proofIndex]);

  const decideAndAdvance = (decision: ReviewDecision) => {
    if (!activeOrder) return;
    onDecision(activeOrder.$id, decision);
    const nextUndecided = orders.find(order => order.$id !== activeOrder.$id && !decisions[order.$id]);
    const next = nextUndecided || orders.find(order => order.$id !== activeOrder.$id);
    if (next) {
      setActiveId(next.$id);
      setProofIndex(0);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-3" role="dialog" aria-modal="true" aria-labelledby="bulk-payment-review-title">
      <section className="mx-auto flex h-[calc(100dvh-1rem)] max-h-[900px] w-[calc(100vw-1rem)] max-w-[1440px] min-h-0 flex-col overflow-hidden bg-white shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:w-[calc(100vw-1.5rem)] sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 sm:h-10 sm:w-10"><FileImage size={19} /></span>
            <div className="min-w-0">
              <h2 id="bulk-payment-review-title" className="truncate text-base font-bold text-slate-950 sm:text-lg">Revisión masiva de pagos</h2>
              <p className="hidden text-xs text-slate-500 sm:block">Revisa el comprobante y los datos del pedido. La dirección de envío no se muestra.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{decidedCount} de {orders.length} revisados</p>
              <p className="text-xs text-emerald-700">{yesCount} se confirmarán</p>
            </div>
            <button onClick={onClose} disabled={confirming} aria-label="Cerrar revisión" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 sm:h-10 sm:w-10"><X size={20} /></button>
          </div>
        </header>

        {error && <div className="flex shrink-0 items-start gap-2 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:px-6" role="alert"><CircleAlert size={18} className="mt-0.5 shrink-0" />{error}</div>}
        {truncated && <div className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span>Hay más de 250 pedidos en este rango. No se puede confirmar una lista incompleta; cierra esta ventana y acota el filtro de fecha.</span></div>}
        {yesCount > 100 && <div className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span>Confirma hasta 100 pagos por lote. Deja algunos como pendientes para generar el siguiente lote.</span></div>}

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_132px] md:grid-rows-[minmax(0,1fr)_148px] xl:grid-cols-[280px_minmax(0,1fr)] xl:grid-rows-1">
          <aside className="order-2 flex min-h-0 flex-col border-t border-slate-200 bg-slate-50 xl:order-1 xl:border-r xl:border-t-0">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3">
              <h3 className="text-sm font-bold text-slate-800">Pedidos para revisar</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{orders.length}</span>
            </div>
            <nav tabIndex={0} className="flex min-h-0 gap-2 overflow-x-auto overscroll-contain p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 xl:block xl:space-y-1 xl:overflow-y-auto xl:overflow-x-hidden" aria-label="Cola de revisión">
              {loading ? (
                <div className="flex min-w-48 items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="animate-spin" size={17} />Cargando comprobantes…</div>
              ) : orders.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No hay pedidos pendientes con este filtro.</p>
              ) : orders.map((order, index) => {
                const decision = decisions[order.$id];
                const active = activeOrder?.$id === order.$id;
                return (
                  <button key={order.$id} onClick={() => { setActiveId(order.$id); setProofIndex(0); }} className={`min-w-52 shrink-0 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 xl:w-full xl:min-w-0 ${active ? 'border-blue-400 bg-white shadow-sm' : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white'} ${decision === 'yes' ? 'ring-1 ring-emerald-200' : decision === 'no' ? 'ring-1 ring-rose-200' : ''}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">{order.ORDERCODE || `Pedido ${index + 1}`}</span>
                      {decision === 'yes' ? <Check size={16} className="shrink-0 text-emerald-700" /> : decision === 'no' ? <XCircle size={16} className="shrink-0 text-rose-700" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-600">{order.CUSTOMERNAME || 'Cliente sin nombre'}</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-700">{money(order.TOTAL)}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main tabIndex={0} className="order-1 min-h-0 min-w-0 touch-pan-y overflow-y-auto overscroll-y-contain bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 lg:order-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            {loading ? (
              <div className="flex h-full min-h-80 items-center justify-center gap-3 text-slate-500"><Loader2 size={22} className="animate-spin" />Preparando la revisión…</div>
            ) : !activeOrder ? (
              <div className="flex h-full min-h-80 items-center justify-center p-8 text-center text-sm text-slate-500">Cuando haya pedidos en revisión aparecerán aquí.</div>
            ) : (
              <div className="mx-auto max-w-6xl p-3 sm:p-4 xl:p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-700">{activeOrder.IS_VENDOR_ORDER ? `Tienda aliada${activeOrder.VENDOR_NAME ? ` · ${activeOrder.VENDOR_NAME}` : ''}` : 'Importadora Carlitos'}</p>
                    <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{activeOrder.ORDERCODE || 'Pedido'}</h3>
                    <p className="mt-1 text-sm text-slate-500">{dateLabel(activeOrder.CREATEDAT)}</p>
                  </div>
                  <span className="rounded-xl bg-slate-100 px-3 py-2 text-lg font-extrabold text-slate-900">{money(activeOrder.TOTAL)}</span>
                </div>

                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:gap-5">
                  <div className="min-w-0 space-y-4">
                    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2" aria-label="Datos del cliente">
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cliente</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{activeOrder.CUSTOMERNAME || 'Sin nombre registrado'}</p>
                      </div>
                      <Info label="RUT" value={activeOrder.CUSTOMERRUT} />
                      <Info label="Teléfono" value={activeOrder.CUSTOMERPHONE} />
                      <Info label="Correo" value={activeOrder.CUSTOMEREMAIL} />
                      <Info label="Medio de pago" value={activeOrder.PAYMENTMETHOD} />
                    </section>

                    <section aria-label="Detalle del pedido">
                      <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">Detalle del pedido</h4><span className="text-xs text-slate-500">{activeOrder.ITEMS.length} productos</span></div>
                      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                        {activeOrder.ITEMS.length === 0 ? <p className="p-4 text-sm text-slate-500">El pedido no contiene detalle de productos.</p> : activeOrder.ITEMS.map((item, index) => (
                          <div key={`${item.id}-${index}`} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                              {item.img ? <img src={item.img} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><FileImage size={17} /></div>}
                            </div>
                            <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.qty} × {money(item.price)}{item.sku ? ` · ${item.sku}` : ''}</p></div>
                            <p className="shrink-0 text-sm font-bold text-slate-800">{money(item.total || item.qty * item.price)}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="grid grid-cols-2 gap-3 xl:sticky xl:bottom-0 xl:bg-white xl:py-2">
                      <button onClick={() => decideAndAdvance('no')} disabled={confirming} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 disabled:opacity-50 ${decisions[activeOrder.$id] === 'no' ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-800'}`}><XCircle size={19} />No está</button>
                      <button onClick={() => decideAndAdvance('yes')} disabled={confirming || activeProofs.length === 0} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50 ${decisions[activeOrder.$id] === 'yes' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700'}`}><CheckCheck size={19} />Sí, recibido</button>
                    </div>
                  </div>

                  <section className="min-w-0 xl:sticky xl:top-0" aria-label="Comprobantes de pago">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Comprobante de pago</h4>
                        <p className="text-xs text-slate-500">{activeProofs.length ? `${proofIndex + 1} de ${activeProofs.length}` : 'No adjuntado'}</p>
                      </div>
                      {activeProofs.length > 1 && <div className="flex gap-1.5">
                        <button onClick={() => setProofIndex(index => Math.max(0, index - 1))} disabled={proofIndex === 0} aria-label="Comprobante anterior" className="rounded-lg border border-slate-200 p-2 text-slate-700 disabled:opacity-40"><ChevronLeft size={17} /></button>
                        <button onClick={() => setProofIndex(index => Math.min(activeProofs.length - 1, index + 1))} disabled={proofIndex >= activeProofs.length - 1} aria-label="Comprobante siguiente" className="rounded-lg border border-slate-200 p-2 text-slate-700 disabled:opacity-40"><ChevronRight size={17} /></button>
                      </div>}
                    </div>
                    <div className="flex h-[clamp(12rem,36dvh,28rem)] min-h-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-2 xl:h-[clamp(12rem,42dvh,34rem)]">
                      {activeProofs[proofIndex]
                        ? <OrderProof url={activeProofs[proofIndex]} index={proofIndex} />
                        : <p className="px-5 text-center text-sm font-medium text-rose-700">Este pedido no tiene una imagen de comprobante. No se puede marcar como recibido.</p>}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </main>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
          <div className="text-xs text-slate-600 sm:text-sm">
            <span className="font-bold text-emerald-700">{yesCount} Sí</span><span className="mx-2 text-slate-300">·</span><span className="font-bold text-rose-700">{Object.values(decisions).filter(value => value === 'no').length} No</span>
            {pendingCount > 0 && <span className="ml-2 text-amber-700">· {pendingCount} sin revisar</span>}
            <p className="mt-1 text-[10px] text-slate-500 sm:text-[11px]">Solo cambia el estado y prepara el PDF; no envía WhatsApp.</p>
          </div>
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <button onClick={onClose} disabled={confirming} className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none sm:px-4 sm:py-3">Cerrar</button>
            <button onClick={onConfirm} disabled={!canConfirm} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-4 sm:py-3">
              {confirming ? <><Loader2 size={17} className="animate-spin" />Confirmando…</> : <><Printer size={17} />Confirmar {yesCount} pago{yesCount === 1 ? '' : 's'} e imprimir PDF</>}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 break-words text-sm font-medium text-slate-800">{value || 'No registrado'}</p></div>;
}
