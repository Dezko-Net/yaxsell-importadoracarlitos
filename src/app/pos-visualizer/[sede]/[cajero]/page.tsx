'use client';

/**
 * /pos-visualizer/[sede]/[cajero] — Pantalla de Cliente (Customer Display)
 *
 * Segunda pantalla orientada al cliente: refleja EN VIVO el carrito que la
 * cajera está armando en /pos/[sede].
 *
 * Fuente de datos: Firestore `pos_cart_sync/{cajeroId}_{sede}` vía onSnapshot.
 *   → 0 lecturas Appwrite · 0 escrituras Appwrite · cuota Firebase gratuita.
 *
 * Estados:
 *  - IDLE:    sin carrito → pantalla de bienvenida con branding animado.
 *  - ACTIVE:  items en vivo, total gigante, descuentos visibles.
 *  - THANKS:  el carrito se vació tras tener items → "¡Gracias por su compra!".
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { db, authReady } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { SEDES, SedeSlug } from '@/types';
import { ShoppingBag, Sparkles, BadgePercent, HeartHandshake } from 'lucide-react';

interface CartItemSync {
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  subtotal: number;
  priceLabel?: string;
}

interface CartSyncDoc {
  cart: CartItemSync[];
  descuento: number;
  updatedAt?: any;
  sede?: string;
  deviceId?: string;
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0));

export default function PosVisualizerPage() {
  const { sede: sedeParam, cajero: cajeroParam } = useParams<{ sede: string; cajero: string }>();
  const sede = (sedeParam || '') as SedeSlug;
  const cajeroId = decodeURIComponent(cajeroParam || '');
  const sedeNombre = SEDES[sede] || sede;

  const [data, setData] = useState<CartSyncDoc | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState('');
  const [thanks, setThanks] = useState(false);
  const [totalPulse, setTotalPulse] = useState(0);
  const hadItemsRef = useRef(false);
  const thanksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reloj ──
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

  // ── Suscripción en vivo al carrito del cajero (Firestore, 0 Appwrite) ──
  useEffect(() => {
    if (!db || !sede || !cajeroId) return;
    let unsub = () => {};
    let active = true;
    (async () => {
      try {
        await authReady;
        if (!active) return;
        unsub = onSnapshot(
          doc(db!, 'pos_cart_sync', `${cajeroId}_${sede}`),
          (snap) => {
            setConnected(true);
            if (snap.exists()) {
              const d = snap.data() as any;
              setData({
                cart: Array.isArray(d.cart) ? d.cart : [],
                descuento: Number(d.descuento) || 0,
                updatedAt: d.updatedAt,
                sede: d.sede,
                deviceId: d.deviceId,
              });
            } else {
              setData(null);
            }
          },
          () => setConnected(false),
        );
      } catch {
        setConnected(false);
      }
    })();
    return () => { active = false; unsub(); };
  }, [sede, cajeroId]);

  const items = useMemo(() => (data?.cart || []).filter(i => i && i.cantidad > 0), [data]);
  const descuentoPct = data?.descuento || 0;

  const subtotal = useMemo(() => items.reduce((s, i) => s + (i.subtotal || 0), 0), [items]);
  const descuentoMonto = Math.round(subtotal * (descuentoPct / 100));
  const total = Math.max(0, subtotal - descuentoMonto);
  const totalUnidades = useMemo(() => items.reduce((s, i) => s + i.cantidad, 0), [items]);

  // ── Detectar "compra finalizada": carrito pasa de tener items a vacío ──
  useEffect(() => {
    if (items.length > 0) {
      hadItemsRef.current = true;
      setThanks(false);
      if (thanksTimerRef.current) { clearTimeout(thanksTimerRef.current); thanksTimerRef.current = null; }
    } else if (hadItemsRef.current) {
      hadItemsRef.current = false;
      setThanks(true);
      thanksTimerRef.current = setTimeout(() => setThanks(false), 9000);
    }
  }, [items.length]);

  // ── Pulso cuando cambia el total ──
  const prevTotalRef = useRef(total);
  useEffect(() => {
    if (prevTotalRef.current !== total) {
      prevTotalRef.current = total;
      setTotalPulse(p => p + 1);
    }
  }, [total]);

  const isIdle = items.length === 0 && !thanks;

  return (
    <div className="viz-root">
      <style>{`
        .viz-root {
          min-height: 100dvh; display: flex; flex-direction: column;
          background: radial-gradient(1200px 800px at 80% -10%, #312e81 0%, transparent 60%),
                      radial-gradient(1000px 700px at -10% 110%, #4c1d95 0%, transparent 55%),
                      #0b1120;
          color: #f1f5f9; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
        }
        @keyframes viz-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes viz-item-in { 0% { opacity: 0; transform: translateX(-18px) scale(.98); } 100% { opacity: 1; transform: translateX(0) scale(1); } }
        @keyframes viz-total-pulse { 0% { transform: scale(1); } 35% { transform: scale(1.045); } 100% { transform: scale(1); } }
        @keyframes viz-glow { 0%,100% { box-shadow: 0 0 40px rgba(99,102,241,.25); } 50% { box-shadow: 0 0 70px rgba(139,92,246,.45); } }
        @keyframes viz-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes viz-fade-up { 0% { opacity: 0; transform: translateY(24px); } 100% { opacity: 1; transform: translateY(0); } }
        .viz-item { animation: viz-item-in .35s cubic-bezier(.16,1,.3,1) both; }
        .viz-total-pulse { animation: viz-total-pulse .45s cubic-bezier(.16,1,.3,1); }
        .viz-thanks { animation: viz-fade-up .6s cubic-bezier(.16,1,.3,1) both; }
        .viz-scroll::-webkit-scrollbar { width: 8px; }
        .viz-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,.25); border-radius: 8px; }
        .viz-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* ══ Header ══ */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/40" style={{ animation: 'viz-glow 4s ease-in-out infinite' }}>
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">Yaxsell Mayorista</h1>
            <p className="text-indigo-300/80 text-xs sm:text-sm font-medium">{sedeNombre} · Venta en curso</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${connected ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30' : 'bg-rose-500/15 text-rose-300 border border-rose-400/30'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {connected ? 'En vivo' : 'Conectando'}
          </span>
          <span className="hidden sm:block text-2xl font-black text-slate-300 tabular-nums">{clock}</span>
        </div>
      </header>

      {/* ══ Cuerpo ══ */}
      {thanks ? (
        /* ── GRACIAS ── */
        <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center viz-thanks">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40" style={{ animation: 'viz-float 3s ease-in-out infinite' }}>
            <HeartHandshake className="w-14 h-14 text-white" />
          </div>
          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tight">¡Gracias por su compra!</h2>
          <p className="text-slate-400 text-lg sm:text-xl">Vuelva pronto · Yaxsell Mayorista {sedeNombre}</p>
        </main>
      ) : isIdle ? (
        /* ── BIENVENIDA ── */
        <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/40" style={{ animation: 'viz-float 3.5s ease-in-out infinite' }}>
            <Sparkles className="w-14 h-14 text-white" />
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">Bienvenido/a</span>
          </h2>
          <p className="text-slate-400 text-lg sm:text-xl max-w-xl">Su atención está por comenzar.<br className="hidden sm:block" /> Aquí verá el detalle de su compra en tiempo real.</p>
        </main>
      ) : (
        /* ── CARRITO EN VIVO ── */
        <main className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Lista de productos */}
          <section className="flex-1 min-h-0 flex flex-col px-4 sm:px-8 py-4">
            <div className="flex items-center justify-between px-2 pb-3">
              <p className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Detalle de su compra</p>
              <p className="text-slate-500 text-sm tabular-nums">{items.length} producto{items.length !== 1 ? 's' : ''} · {totalUnidades} unidad{totalUnidades !== 1 ? 'es' : ''}</p>
            </div>
            <div className="viz-scroll flex-1 overflow-y-auto space-y-2.5 pr-1 pb-4">
              {items.map((item, idx) => {
                const unitConDesc = Math.round(item.precioUnitario * (1 - (item.descuentoPct || 0) / 100));
                return (
                  <div key={`${item.sku}-${idx}`} className="viz-item flex items-center gap-4 bg-white/[.06] border border-white/10 rounded-2xl px-4 sm:px-5 py-3.5 backdrop-blur-sm" style={{ animationDelay: `${Math.min(idx * 0.05, 0.4)}s` }}>
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center shrink-0">
                      <span className="text-base font-black text-indigo-300">×{item.cantidad}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-base sm:text-lg truncate">{item.nombre}</p>
                      <p className="text-slate-400 text-xs sm:text-sm tabular-nums">
                        {fmtCLP(unitConDesc)} c/u
                        {item.descuentoPct > 0 && (
                          <span className="ml-2 text-emerald-300 font-semibold">-{item.descuentoPct}%</span>
                        )}
                      </p>
                    </div>
                    <p className="text-lg sm:text-2xl font-black text-white tabular-nums shrink-0">{fmtCLP(item.subtotal)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Panel total */}
          <aside className="lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[.04] backdrop-blur-md flex flex-col justify-center px-6 sm:px-10 py-6 lg:py-10 gap-4">
            {descuentoPct > 0 && (
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-400/25 rounded-2xl px-5 py-3.5">
                <span className="flex items-center gap-2.5 text-emerald-300 font-bold text-sm sm:text-base">
                  <BadgePercent className="w-5 h-5" /> Descuento {descuentoPct}%
                </span>
                <span className="text-emerald-300 font-black text-lg tabular-nums">-{fmtCLP(descuentoMonto)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-sm sm:text-base font-semibold uppercase tracking-widest">Subtotal</span>
              <span className="text-xl sm:text-2xl font-bold tabular-nums">{fmtCLP(subtotal)}</span>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="text-center py-2">
              <p className="text-slate-400 text-sm font-bold uppercase tracking-[.3em] mb-2">Total a pagar</p>
              <p key={totalPulse} className="viz-total-pulse text-5xl sm:text-7xl lg:text-6xl xl:text-7xl font-black tabular-nums bg-gradient-to-r from-indigo-300 via-violet-200 to-fuchsia-300 bg-clip-text text-transparent leading-none">
                {fmtCLP(total)}
              </p>
            </div>
            <p className="text-center text-slate-500 text-xs sm:text-sm">Precios incluyen impuestos · Medios de pago: efectivo y transferencia</p>
          </aside>
        </main>
      )}

      {/* ══ Footer ══ */}
      <footer className="px-6 sm:px-10 py-3.5 border-t border-white/5 flex items-center justify-between">
        <p className="text-slate-500 text-[11px] sm:text-xs font-medium tracking-wide">Yaxsel POS · Pantalla de cliente</p>
        <p className="text-slate-600 text-[11px] sm:text-xs">yaxsell.cl</p>
      </footer>
    </div>
  );
}
