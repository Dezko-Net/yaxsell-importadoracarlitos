'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Sparkles, Zap, X } from 'lucide-react';

interface LinktreeAssistantSelectorProps {
  onClose: () => void;
}

export default function LinktreeAssistantSelector({ onClose }: LinktreeAssistantSelectorProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [asisVideoLoaded, setAsisVideoLoaded] = useState(false);
  const [toraVideoLoaded, setToraVideoLoaded] = useState(false);

  // Pink particles — left panel (Fernanda)
  const pinkParticles = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 6 + 1.5,
        dur: Math.random() * 8 + 3,
        delay: Math.random() * 6,
        op: Math.random() * 0.5 + 0.15,
        kind: Math.random() > 0.75 ? 'heart' : Math.random() > 0.5 ? 'dot' : 'sparkle',
        drift: (Math.random() - 0.5) * 20,
      })),
    []
  );

  // Blue particles — right panel (Lissy)
  const blueParticles = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 6 + 1.5,
        dur: Math.random() * 8 + 3,
        delay: Math.random() * 6,
        op: Math.random() * 0.5 + 0.15,
        kind: Math.random() > 0.75 ? 'snow' : Math.random() > 0.5 ? 'dot' : 'sparkle',
        drift: (Math.random() - 0.5) * 20,
      })),
    []
  );

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setClosing(true);
    setTimeout(() => onClose(), 400);
  };

  const handleSelectFernanda = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://wa.me/56967294975?text=${encodeURIComponent('Hola Fernanda! 🌸 Te escribo desde la tienda, quiero hacer una consulta ✨')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSelectTora = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://wa.me/56962293893?text=${encodeURIComponent('Hola Lissy! ⚡ Te escribo desde la tienda, quiero hacer una consulta 🚀')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] h-dvh w-screen flex flex-row overflow-hidden select-none font-sans" style={{ animation: closing ? 'selectorClose 0.4s ease-in forwards' : 'selectorOpen 0.5s ease-out forwards' }}>
      <style>{`
        @keyframes pFloatPink { 0%,100%{transform:translateY(0) translateX(0) scale(1);opacity:var(--po,0.2)} 25%{transform:translateY(-15px) translateX(4px) scale(1.3);opacity:calc(var(--po,0.2)*1.8)} 50%{transform:translateY(-30px) translateX(-3px) scale(0.8);opacity:calc(var(--po,0.2)*1.3)} 75%{transform:translateY(-15px) translateX(5px) scale(1.1);opacity:calc(var(--po,0.2)*1.5)} }
        @keyframes pFloatBlue { 0%,100%{transform:translateY(0) translateX(0) scale(1);opacity:var(--po,0.2)} 25%{transform:translateY(-12px) translateX(-5px) scale(1.3);opacity:calc(var(--po,0.2)*1.8)} 50%{transform:translateY(-28px) translateX(4px) scale(0.8);opacity:calc(var(--po,0.2)*1.3)} 75%{transform:translateY(-14px) translateX(-4px) scale(1.1);opacity:calc(var(--po,0.2)*1.5)} }
        @keyframes sparklePulse { 0%,100%{transform:scale(0) rotate(0deg);opacity:0} 50%{transform:scale(1.4) rotate(180deg);opacity:calc(var(--po,0.3)*1.5)} }
        @keyframes borderSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes btnShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes cardUp { 0%{opacity:0;transform:translateY(30px) scale(.96)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes fadeDown { 0%{opacity:0;transform:translateY(-15px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp { 0%{opacity:0;transform:translateY(15px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes sepGlow { 0%,100%{opacity:.25} 50%{opacity:.6} }
        @keyframes skelShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes heartBeat { 0%,100%{transform:scale(1)} 15%{transform:scale(1.25)} 30%{transform:scale(1)} 45%{transform:scale(1.15)} 60%{transform:scale(1)} }
        @keyframes snowFall { 0%{transform:translateY(0) rotate(0deg);opacity:var(--po,0.3)} 50%{transform:translateY(-15px) rotate(180deg);opacity:calc(var(--po,0.3)*1.5)} 100%{transform:translateY(0) rotate(360deg);opacity:var(--po,0.3)} }
        @keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1);opacity:0.15} 50%{transform:translate(10px,-15px) scale(1.3);opacity:0.3} }
        @keyframes tagSlide { 0%{opacity:0;transform:translateX(-10px)} 100%{opacity:1;transform:translateX(0)} }
        @keyframes selectorOpen { 0%{opacity:0;transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
        @keyframes selectorClose { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(1.1)} }
        @keyframes panelSlideInLeft { 0%{opacity:0;transform:translateX(-100%)} 100%{opacity:1;transform:translateX(0)} }
        @keyframes panelSlideInRight { 0%{opacity:0;transform:translateX(100%)} 100%{opacity:1;transform:translateX(0)} }
        @keyframes panelSlideOutLeft { 0%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-100%)} }
        @keyframes panelSlideOutRight { 0%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(100%)} }
      `}</style>

      {/* Floating Close Button */}
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-4 right-4 z-50 p-2.5 rounded-full bg-blue-900/60 backdrop-blur-md shadow-2xl border border-blue-300/30 text-white hover:bg-blue-800 hover:scale-110 active:scale-95 transition-all"
        aria-label="Cerrar"
      >
        <X size={20} />
      </button>

      {/* ═══ FERNANDA Panel (Left 50%) ═══ */}
      <button
        type="button"
        onClick={handleSelectFernanda}
        className="flex-1 relative overflow-hidden flex flex-col items-center justify-center gap-3 group active:scale-[0.98] transition-transform duration-200 cursor-pointer"
        style={{ background: 'linear-gradient(160deg, #fff1f2 0%, #fecdd3 20%, #fda4af 45%, #fb7185 70%, #e11d48 90%, #9f1239 100%)', animation: closing ? 'panelSlideOutLeft 0.4s ease-in forwards' : 'panelSlideInLeft 0.5s ease-out forwards' }}
      >
        {/* Gradient mesh orbs */}
        <div className="absolute top-[8%] left-[15%] w-24 h-24 rounded-full bg-pink-300/20 blur-2xl" style={{ animation: 'orbFloat 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[12%] right-[10%] w-20 h-20 rounded-full bg-rose-400/15 blur-2xl" style={{ animation: 'orbFloat 10s 2s ease-in-out infinite' }} />
        <div className="absolute top-[55%] left-[60%] w-16 h-16 rounded-full bg-fuchsia-300/15 blur-xl" style={{ animation: 'orbFloat 7s 4s ease-in-out infinite' }} />

        {/* Particles — pink/hearts/sparkles */}
        {pinkParticles.map(p => (
          p.kind === 'heart' ? (
            <div key={p.id} className="absolute text-white/60 pointer-events-none" style={{
              left: `${p.x}%`, top: `${p.y}%`, fontSize: `${p.size + 4}px`,
              '--po': p.op, animation: `heartBeat ${p.dur * 0.6}s ${p.delay}s ease-in-out infinite`,
            } as React.CSSProperties}>♥</div>
          ) : p.kind === 'sparkle' ? (
            <div key={p.id} className="absolute pointer-events-none" style={{
              left: `${p.x}%`, top: `${p.y}%`, width: `${p.size + 2}px`, height: `${p.size + 2}px`,
              '--po': p.op,
              background: 'radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(251,207,232,.4) 50%, transparent 70%)',
              borderRadius: '50%',
              boxShadow: '0 0 8px rgba(251,113,133,.5)',
              animation: `sparklePulse ${p.dur}s ${p.delay}s ease-in-out infinite`,
            } as React.CSSProperties} />
          ) : (
            <div key={p.id} className="absolute rounded-full bg-pink-200/70" style={{
              left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size,
              '--po': p.op, animation: `pFloatPink ${p.dur}s ${p.delay}s ease-in-out infinite`,
              boxShadow: '0 0 6px rgba(251,113,133,.3)',
            } as React.CSSProperties} />
          )
        ))}

        {/* ── Top area: decorative header ── */}
        <div className="absolute top-[12%] sm:top-[15%] inset-x-0 z-10 flex flex-col items-center pointer-events-none"
          style={{ animation: entered ? 'fadeDown 0.8s 0.1s ease-out both' : 'none' }}>
          <div className="flex items-center gap-2">
            <div className="h-[1px] w-10 bg-gradient-to-r from-transparent to-white/60" />
            <span className="text-[11px] font-bold text-white/70 tracking-[0.2em] uppercase">Atención Directa</span>
            <div className="h-[1px] w-10 bg-gradient-to-l from-transparent to-white/60" />
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-2">
            {['Ventas', 'Consultas', 'Catálogo'].map((t, i) => (
              <span key={t} className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/20 text-[9px] font-semibold text-white/80 border border-white/15 backdrop-blur-sm"
                style={{ animation: entered ? `tagSlide 0.4s ${0.3 + i * 0.1}s ease-out both` : 'none' }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Video card with skeleton */}
        <div className="relative z-10" style={{ animation: entered ? 'cardUp 0.7s ease-out both' : 'none' }}>
          <div className="absolute -inset-[3px] rounded-2xl overflow-hidden">
            <div className="absolute inset-[-60%] w-[220%] h-[220%] opacity-60 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'conic-gradient(from 0deg, #ec4899, #f43f5e, #fb923c, #a855f7, #ec4899)', animation: 'borderSpin 3.5s linear infinite' }} />
          </div>
          <div className="relative rounded-2xl overflow-hidden bg-pink-100 shadow-2xl w-[125px] h-[175px] sm:w-[155px] sm:h-[215px] flex items-center justify-center">
            <span className="text-7xl sm:text-8xl font-black text-white drop-shadow-lg" style={{ textShadow: '0 4px 12px rgba(225,29,72,.4)' }}>F</span>
          </div>
        </div>

        {/* Name + button */}
        <div className="relative z-10 text-center" style={{ animation: entered ? 'cardUp 0.7s 0.15s ease-out both' : 'none' }}>
          <h2 className="text-2xl sm:text-3xl font-black text-white drop-shadow-lg tracking-tight flex items-center justify-center gap-1.5">
            <Heart size={18} className="text-pink-200 drop-shadow-md" style={{ animation: 'heartBeat 1.5s ease-in-out infinite' }} />
            FERNANDA
          </h2>
          <p className="text-[10px] sm:text-[11px] text-white/80 font-medium mt-0.5 tracking-wide">Cariñosa · Paciente · Atenta</p>
          <div className="mt-2.5 px-6 py-2 rounded-full text-[11px] sm:text-xs font-bold text-white relative overflow-hidden shadow-xl inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ backgroundSize: '200% 100%', animation: 'btnShimmer 2s linear infinite' }} />
            <span className="relative flex items-center gap-1.5"><Sparkles size={12} /> ELEGIR</span>
          </div>
        </div>

        {/* ── Bottom area: stats/decorations ── */}
        <div className="absolute bottom-[8%] sm:bottom-[10%] inset-x-0 z-10 flex flex-col items-center pointer-events-none"
          style={{ animation: entered ? 'fadeUp 0.8s 0.3s ease-out both' : 'none' }}>
          <div className="flex gap-2 mb-2">
            {[
              { emoji: '💕', label: 'Cariño' },
              { emoji: '🌸', label: 'Amabilidad' },
              { emoji: '✨', label: 'Detalles' },
            ].map((b, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-white/15 backdrop-blur-sm border border-white/15">
                <span className="text-sm">{b.emoji}</span>
                <span className="text-[7px] font-bold text-white/70 uppercase tracking-wider">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </button>

      {/* ═══ Separator — thin elegant line ═══ */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-gradient-to-b from-pink-300/40 via-white/80 to-blue-300/40">
          <div className="absolute inset-0 w-[6px] -ml-[2.25px] bg-gradient-to-b from-pink-400/20 via-white/40 to-blue-400/20 blur-sm" style={{ animation: 'sepGlow 4s ease-in-out infinite' }} />
        </div>
      </div>

      {/* ═══ LISSY Panel (Right 50%) ═══ */}
      <button
        type="button"
        onClick={handleSelectTora}
        className="flex-1 relative overflow-hidden flex flex-col items-center justify-center gap-3 group active:scale-[0.98] transition-transform duration-200 cursor-pointer"
        style={{ background: 'linear-gradient(200deg, #eff6ff 0%, #bfdbfe 20%, #93c5fd 45%, #60a5fa 70%, #2563eb 90%, #1e40af 100%)', animation: closing ? 'panelSlideOutRight 0.4s ease-in forwards' : 'panelSlideInRight 0.5s ease-out forwards' }}
      >
        {/* Gradient mesh orbs */}
        <div className="absolute top-[10%] right-[15%] w-24 h-24 rounded-full bg-blue-300/20 blur-2xl" style={{ animation: 'orbFloat 9s 1s ease-in-out infinite' }} />
        <div className="absolute bottom-[15%] left-[10%] w-20 h-20 rounded-full bg-cyan-400/15 blur-2xl" style={{ animation: 'orbFloat 11s 3s ease-in-out infinite' }} />
        <div className="absolute top-[50%] right-[55%] w-16 h-16 rounded-full bg-indigo-300/15 blur-xl" style={{ animation: 'orbFloat 7s 5s ease-in-out infinite' }} />

        {/* Particles — blue/snow/sparkles */}
        {blueParticles.map(p => (
          p.kind === 'snow' ? (
            <div key={p.id} className="absolute text-white/50 pointer-events-none" style={{
              left: `${p.x}%`, top: `${p.y}%`, fontSize: `${p.size + 3}px`,
              '--po': p.op, animation: `snowFall ${p.dur}s ${p.delay}s ease-in-out infinite`,
            } as React.CSSProperties}>❄</div>
          ) : p.kind === 'sparkle' ? (
            <div key={p.id} className="absolute pointer-events-none" style={{
              left: `${p.x}%`, top: `${p.y}%`, width: `${p.size + 2}px`, height: `${p.size + 2}px`,
              '--po': p.op,
              background: 'radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(191,219,254,.4) 50%, transparent 70%)',
              borderRadius: '50%',
              boxShadow: '0 0 8px rgba(96,165,250,.5)',
              animation: `sparklePulse ${p.dur}s ${p.delay}s ease-in-out infinite`,
            } as React.CSSProperties} />
          ) : (
            <div key={p.id} className="absolute rounded-full bg-blue-200/60" style={{
              left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size,
              '--po': p.op, animation: `pFloatBlue ${p.dur}s ${p.delay}s ease-in-out infinite`,
              boxShadow: '0 0 6px rgba(96,165,250,.3)',
            } as React.CSSProperties} />
          )
        ))}

        {/* ── Top area: decorative header ── */}
        <div className="absolute top-[12%] sm:top-[15%] inset-x-0 z-10 flex flex-col items-center pointer-events-none"
          style={{ animation: entered ? 'fadeDown 0.8s 0.15s ease-out both' : 'none' }}>
          <div className="flex items-center gap-2">
            <div className="h-[1px] w-10 bg-gradient-to-r from-transparent to-white/60" />
            <span className="text-[11px] font-bold text-white/70 tracking-[0.2em] uppercase">Atención Directa</span>
            <div className="h-[1px] w-10 bg-gradient-to-l from-transparent to-white/60" />
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-2">
            {['Ventas', 'Consultas', 'Catálogo'].map((t, i) => (
              <span key={t} className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/20 text-[9px] font-semibold text-white/80 border border-white/15 backdrop-blur-sm"
                style={{ animation: entered ? `tagSlide 0.4s ${0.35 + i * 0.1}s ease-out both` : 'none' }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10" style={{ animation: entered ? 'cardUp 0.7s 0.1s ease-out both' : 'none' }}>
          <div className="absolute -inset-[3px] rounded-2xl overflow-hidden">
            <div className="absolute inset-[-60%] w-[220%] h-[220%] opacity-60 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #8b5cf6, #3b82f6)', animation: 'borderSpin 3.5s linear infinite reverse' }} />
          </div>
          <div className="relative rounded-2xl overflow-hidden bg-blue-100 shadow-2xl w-[125px] h-[175px] sm:w-[155px] sm:h-[215px] flex items-center justify-center">
            <span className="text-7xl sm:text-8xl font-black text-white drop-shadow-lg" style={{ textShadow: '0 4px 12px rgba(37,99,235,.4)' }}>L</span>
          </div>
        </div>

        <div className="relative z-10 text-center" style={{ animation: entered ? 'cardUp 0.7s 0.25s ease-out both' : 'none' }}>
          <h2 className="text-2xl sm:text-3xl font-black text-white drop-shadow-lg tracking-tight flex items-center justify-center gap-1.5">
            <Zap size={18} className="text-cyan-200 drop-shadow-md" />
            LISSY
          </h2>
          <p className="text-[10px] sm:text-[11px] text-white/80 font-medium mt-0.5 tracking-wide">Ágil · Directa · Resolutiva</p>
          <div className="mt-2.5 px-6 py-2 rounded-full text-[11px] sm:text-xs font-bold text-white relative overflow-hidden shadow-xl inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ backgroundSize: '200% 100%', animation: 'btnShimmer 2s linear infinite' }} />
            <span className="relative flex items-center gap-1.5"><Zap size={12} /> ELEGIR</span>
          </div>
        </div>

        {/* ── Bottom area: stats/decorations ── */}
        <div className="absolute bottom-[8%] sm:bottom-[10%] inset-x-0 z-10 flex flex-col items-center pointer-events-none"
          style={{ animation: entered ? 'fadeUp 0.8s 0.35s ease-out both' : 'none' }}>
          <div className="flex gap-2 mb-2">
            {[
              { emoji: '⚡', label: 'Rapidez' },
              { emoji: '🎯', label: 'Precisión' },
              { emoji: '💬', label: 'Claridad' },
            ].map((b, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-white/15 backdrop-blur-sm border border-white/15">
                <span className="text-sm">{b.emoji}</span>
                <span className="text-[7px] font-bold text-white/70 uppercase tracking-wider">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </button>
    </div>,
    document.body
  );
}
