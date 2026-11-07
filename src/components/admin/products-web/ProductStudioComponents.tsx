'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Image as ImageIcon,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Wand2,
} from 'lucide-react';

export function triggerHaptic(type: 'light' | 'medium' | 'success' = 'light') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    if (type === 'light') navigator.vibrate(8);
    else if (type === 'medium') navigator.vibrate(16);
    else navigator.vibrate([12, 40, 18]);
  } catch {
    // Ignore on unsupported devices
  }
}

export const COLOR_SWATCHES: Array<{ name: string; hex: string; ring: string; light?: boolean }> = [
  { name: 'Negro', hex: '#0f172a', ring: '#334155' },
  { name: 'Blanco', hex: '#ffffff', ring: '#cbd5e1', light: true },
  { name: 'Dorado', hex: 'linear-gradient(135deg, #fde68a 0%, #d97706 100%)', ring: '#f59e0b' },
  { name: 'Plateado', hex: 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)', ring: '#94a3b8', light: true },
  { name: 'Ámbar', hex: 'linear-gradient(135deg, #fbbf24 0%, #92400e 100%)', ring: '#d97706' },
  { name: 'Azul', hex: '#2563eb', ring: '#60a5fa' },
  { name: 'Rojo', hex: '#dc2626', ring: '#f87171' },
  { name: 'Rosa', hex: '#ec4899', ring: '#f472b6' },
  { name: 'Verde', hex: '#059669', ring: '#34d399' },
  { name: 'Beige', hex: '#e7d8c9', ring: '#d6bfa9', light: true },
];

export const DESCRIPTION_BLUEPRINTS: Array<{ id: string; label: string; snippet: string }> = [
  {
    id: 'perfume',
    label: '✨ Perfume / Aroma',
    snippet: '• Notas de salida: \n• Notas de corazón: \n• Notas de fondo: \n• Fijación y proyección de larga duración.',
  },
  {
    id: 'ropa',
    label: '👕 Prenda / Calce',
    snippet: '• Material: Algodón / Poliéster premium\n• Calce: Regular fit cómodo\n• Cuidados: Lavado suave en agua fría.',
  },
  {
    id: 'general',
    label: '📦 Ficha Express',
    snippet: '• Calidad garantizada por Importadora Carlitos\n• Incluye empaque original sellado\n• Envío rápido a todo Chile.',
  },
];

/* ─────────────────────────── SVG Readiness Ring ─────────────────────────── */
export function ReadinessRing({
  score,
  size = 40,
}: {
  score: number;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = 3.5;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    clamped >= 100 ? '#10b981' : clamped >= 65 ? '#4f46e5' : clamped >= 35 ? '#d97706' : '#94a3b8';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0 select-none"
      style={{ width: size, height: size }}
      title={`Nivel de completitud comercial: ${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.55s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.35s ease' }}
        />
      </svg>
      <span className="absolute text-[10px] font-black tabular-nums text-slate-700">
        {clamped === 100 ? (
          <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" />
        ) : (
          `${clamped}%`
        )}
      </span>
    </div>
  );
}

/* ─────────────────────── Interactive 3D Storefront Card ─────────────────────── */
export function Interactive3DStoreCard({
  name,
  category,
  brand,
  price,
  images,
  size,
  color,
  content,
  unlimitedStock,
  stock,
  visible,
  formatCurrency,
}: {
  name: string;
  category: string;
  brand: string;
  price: number;
  images: string[];
  size: string;
  color: string;
  content: string;
  unlimitedStock: boolean;
  stock: number;
  visible: boolean;
  formatCurrency: (val: number) => string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 30, active: false });
  const [activeSlide, setActiveSlide] = useState(0);

  const validImages = images.filter(Boolean);
  const currentImg = validImages[activeSlide] || validImages[0] || '';

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const ry = (x - 0.5) * 16;
    const rx = (0.5 - y) * 14;
    setTilt({
      rx,
      ry,
      gx: Math.round(x * 100),
      gy: Math.round(y * 100),
      active: true,
    });
  };

  const resetTilt = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 30, active: false });
  };

  return (
    <div className="py-2 flex flex-col items-center">
      <div className="w-full max-w-[268px]" style={{ perspective: '950px' }}>
        <div
          ref={cardRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={resetTilt}
          onPointerUp={resetTilt}
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.active ? 1.015 : 1})`,
            transition: tilt.active
              ? 'transform 0.08s linear'
              : 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
            transformStyle: 'preserve-3d',
          }}
          className="relative rounded-[22px] bg-white text-slate-900 overflow-hidden shadow-[0_12px_28px_-10px_rgba(15,23,42,0.12)] border border-slate-200/90 select-none touch-none"
        >
          {/* Specular Glare Overlay */}
          <div
            className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
            style={{
              opacity: tilt.active ? 0.4 : 0.1,
              background: `radial-gradient(260px circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.6), transparent 65%)`,
            }}
          />

          {/* Image Stage */}
          <div className="relative aspect-[4/3.6] bg-slate-100 overflow-hidden">
            {currentImg ? (
              <img
                src={currentImg}
                alt={name || 'Vista previa'}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5">
                <div className="w-11 h-11 rounded-2xl bg-white/90 border border-slate-200/70 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-slate-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Sube tu portada HD
                </span>
              </div>
            )}

            {/* Top Floating Store Badges */}
            <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 z-10">
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border ${
                  visible
                    ? 'bg-white/90 text-emerald-800 border-slate-200/80'
                    : 'bg-white/90 text-slate-600 border-slate-200/80'
                }`}
              >
                {visible ? '● En Tienda' : 'Borrador'}
              </span>

              {brand && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-white/90 text-slate-700 border border-slate-200/80 backdrop-blur-md truncate max-w-[110px]">
                  {brand}
                </span>
              )}
            </div>

            {/* Multi-photo Interactive Dots */}
            {validImages.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md">
                {validImages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSlide(idx);
                    }}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      activeSlide === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/45'
                    }`}
                    aria-label={`Ver foto ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Storefront Card Details */}
          <div className="p-3.5 space-y-2 bg-white relative z-10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 truncate">
                {category || 'Colección General'}
              </span>
              <span className="text-[9px] font-bold text-slate-400 shrink-0">
                {unlimitedStock ? '∞ Disponible' : stock > 0 ? `${stock} disp.` : 'Agotado'}
              </span>
            </div>

            <p className="text-[13px] font-extrabold text-slate-900 leading-snug line-clamp-2 min-h-[18px]">
              {name || 'Nombre comercial de tu producto'}
            </p>

            {(size || color || content) && (
              <div className="flex items-center gap-1 flex-wrap">
                {content && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {content}
                  </span>
                )}
                {size && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    Talla {size}
                  </span>
                )}
                {color && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {color}
                  </span>
                )}
              </div>
            )}

            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-base font-black text-slate-900 tabular-nums tracking-tight">
                {formatCurrency(price)}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-[10px] font-extrabold">
                Agregar +
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 font-medium flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-slate-400" />
        Desliza tu dedo sobre la tarjeta para inclinarla en 3D
      </p>
    </div>
  );
}

/* ─────────────────────── Profit & Psychological Pricer ─────────────────────── */
export function ProfitEngineWidget({
  price,
  cost,
  onChangePrice,
  onChangeCost,
  onApplyMarkup,
  formatCurrency,
}: {
  price: number;
  cost: number;
  onChangePrice: (nextPrice: string) => void;
  onChangeCost?: (nextCost: string) => void;
  onApplyMarkup: (pct: number) => void;
  formatCurrency: (val: number) => string;
}) {
  const hasCost = cost > 0;
  const hasPrice = price > 0;
  const profit = price - cost;
  const marginPct = hasPrice && hasCost ? Math.round((profit / price) * 100) : null;
  const markupPct = hasCost && hasPrice ? Math.max(0, Math.min(250, Math.round(((price - cost) / cost) * 100))) : 50;

  // Psychological .990 rounder for Chilean retail ($9.990, $14.990, $19.990, etc.)
  const roundTo990 = () => {
    triggerHaptic('medium');
    const base = price > 0 ? price : cost > 0 ? Math.round(cost * 1.5) : 9990;
    if (base < 1990) {
      onChangePrice('1990');
      return;
    }
    const thousands = Math.max(1, Math.round(base / 1000));
    const candidate = thousands * 1000 - 10;
    onChangePrice(String(candidate));
  };

  const bumpPrice = (delta: number) => {
    triggerHaptic('light');
    const next = Math.max(0, (price || 0) + delta);
    onChangePrice(String(next));
  };

  const costShare = hasPrice && hasCost ? Math.max(8, Math.min(92, Math.round((cost / price) * 100))) : 55;
  const isLoss = hasPrice && hasCost && profit < 0;

  return (
    <div className="space-y-3">
      {/* Quick Price Tactile Chips (.990 + bumps with subtle color & emojis) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <button
          type="button"
          onClick={roundTo990}
          className="wpw-cta-shimmer shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-extrabold shadow-xs active:scale-95 transition cursor-pointer"
          title="Ajustar al precio psicológico chileno terminado en .990"
        >
          <Wand2 className="w-3 h-3" />
          <span>🪄 Precio .990</span>
        </button>

        <button
          type="button"
          onClick={() => bumpPrice(1000)}
          className="shrink-0 px-2.5 py-1.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-[11px] font-extrabold tabular-nums active:scale-95 transition cursor-pointer"
        >
          ⬆️ +$1.000
        </button>

        <button
          type="button"
          onClick={() => bumpPrice(5000)}
          className="shrink-0 px-2.5 py-1.5 rounded-xl bg-indigo-50/90 hover:bg-indigo-100 text-indigo-800 border border-indigo-200/80 text-[11px] font-extrabold tabular-nums active:scale-95 transition cursor-pointer"
        >
          🚀 +$5.000
        </button>

        <button
          type="button"
          onClick={() => bumpPrice(-1000)}
          className="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-50/90 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-[11px] font-extrabold tabular-nums active:scale-95 transition cursor-pointer"
        >
          ⬇️ -$1.000
        </button>
      </div>

      {/* Live Profit Split Bar & Scrubber when Cost > 0 */}
      {hasCost ? (
        <div
          className={`rounded-2xl p-3.5 border transition-colors ${
            isLoss
              ? 'bg-rose-50/75 border-rose-200'
              : 'bg-gradient-to-br from-emerald-50/65 via-white to-indigo-50/35 border-emerald-200/80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {isLoss ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span className="text-xs font-extrabold text-slate-800 truncate">
                {hasPrice ? (
                  isLoss ? (
                    <span className="text-rose-700">⚠️ Pérdida: {formatCurrency(profit)} / ud.</span>
                  ) : (
                    <>
                      💰 Ganancia libre:{' '}
                      <span className="text-emerald-700">+{formatCurrency(profit)}</span>
                    </>
                  )
                ) : (
                  '🎯 Toca un multiplicador para fijar tu precio'
                )}
              </span>
            </div>

            {marginPct !== null && (
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full tabular-nums shrink-0 ${
                  isLoss
                    ? 'bg-rose-600 text-white'
                    : marginPct >= 45
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 text-white'
                }`}
              >
                {isLoss ? '⚠️ ' : marginPct >= 45 ? '🔥 ' : '📈 '}
                {marginPct > 0 ? `+${marginPct}%` : `${marginPct}%`}
              </span>
            )}
          </div>

          {/* Visual Cost vs Profit Split Bar */}
          {hasPrice && !isLoss && (
            <div className="mb-3 space-y-1">
              <div className="h-2.5 w-full rounded-full bg-slate-200/75 overflow-hidden flex p-0.5 gap-0.5">
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  style={{ width: `${costShare}%` }}
                  className="h-full rounded-full bg-amber-400"
                  title={`Costo: ${costShare}%`}
                />
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  style={{ width: `${Math.max(6, 100 - costShare)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  title={`Ganancia: ${100 - costShare}%`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-amber-700">📦 Costo {costShare}%</span>
                <span className="text-emerald-700">💵 Tu ganancia {100 - costShare}%</span>
              </div>
            </div>
          )}

          {/* Tactile Markup Scrubber Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span>🎚️ Recargo sobre costo (+{markupPct}%)</span>
              <span className="text-indigo-600 font-extrabold">Desliza para calibrar</span>
            </div>
            <input
              type="range"
              min={10}
              max={250}
              step={5}
              value={markupPct}
              onChange={(e) => {
                const pct = Number(e.target.value);
                const suggested = Math.round((cost * (1 + pct / 100)) / 10) * 10;
                onChangePrice(String(suggested));
              }}
              className="wpw-range w-full accent-indigo-600 cursor-pointer"
              aria-label="Calibrador de recargo sobre costo"
            />

            <div className="grid grid-cols-5 gap-1.5 pt-0.5">
              {[
                { pct: 30, label: '+30%' },
                { pct: 50, label: '+50%' },
                { pct: 80, label: '+80%' },
                { pct: 100, label: '🔥 x2' },
                { pct: 150, label: '💎 x2.5' },
              ].map((m) => {
                const active = Math.abs(markupPct - m.pct) <= 4 && hasPrice;
                return (
                  <button
                    key={m.pct}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onApplyMarkup(m.pct);
                    }}
                    className={`py-1.5 rounded-xl text-[11px] font-extrabold border transition active:scale-95 cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200/90 hover:border-indigo-300'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-50/55 border border-amber-200/75 p-3 space-y-2">
          <p className="text-[11px] text-amber-900 font-bold flex items-center gap-1.5">
            <span>💡</span>
            <span>Ingresa tu <strong>Costo Base</strong> o elige una referencia rápida:</span>
          </p>
          {onChangeCost && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[3000, 5000, 10000, 15000, 25000].map((presetCost) => (
                <button
                  key={presetCost}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeCost(String(presetCost));
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-xl bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-200/90 text-[11px] font-extrabold tabular-nums active:scale-95 transition cursor-pointer"
                >
                  📦 {formatCurrency(presetCost)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Global Scoped Studio Styles ─────────────────────── */
export const STUDIO_SCOPED_CSS = `
  @keyframes wpwShimmerSweep {
    0% { transform: translateX(-130%) skewX(-18deg); }
    55%, 100% { transform: translateX(220%) skewX(-18deg); }
  }

  .admin-main-content:has(.wpw-app),
  .admin-content-wrap:has(.wpw-app) {
    background: #eef2f6 !important;
  }

  .wpw-island-border {
    position: relative;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-top: 3px solid #6366f1;
    box-shadow: 0 4px 14px -4px rgba(15, 23, 42, 0.09), 0 1px 2px rgba(15, 23, 42, 0.05);
  }

  .wpw-bento-frame {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    box-shadow: 0 4px 14px -4px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .wpw-cta-shimmer {
    position: relative;
    overflow: hidden;
  }
  .wpw-cta-shimmer::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 42%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
    animation: wpwShimmerSweep 3.8s ease-in-out infinite;
    pointer-events: none;
  }

  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

  /* Shield compact controls inside .admin-main-content on mobile */
  @media (max-width: 768px) {
    .wpw-app button.wpw-micro-btn {
      min-height: 0 !important;
    }
    .wpw-app input.wpw-checkbox {
      width: 18px !important;
      max-width: 18px !important;
      min-width: 18px !important;
      height: 18px !important;
    }
  }

  .wpw-range {
    height: 6px;
    border-radius: 999px;
  }
`;
