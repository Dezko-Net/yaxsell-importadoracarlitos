'use client';

import { useState, useEffect, useRef } from 'react';
import { Ticket, Copy, Check, Sparkles, Zap, ChevronRight, Flame, Award, Scissors, Tag, Star } from 'lucide-react';
// Removed Appwrite imports to use cached API endpoint instead
import type { SectionSettings } from '@/lib/section-config';

const COUPONS_COLLECTION = 'discount_coupons';

interface Coupon {
  $id: string;
  code: string;
  type: 'percent' | 'fixed' | 'percentage';
  value: number;
  isActive?: boolean;
  maxUses?: number;
  usedCount?: number;
  minPurchase?: number;
  expiresAt?: number;
}

interface Props {
  settings?: SectionSettings;
}

export default function CouponBanner({ settings: s }: Props) {
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Section settings with defaults
  const layout = s?.couponLayout || 'classic';
  const bg = s?.bgColor || 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #e396bf 100%)';
  const tx = s?.textColor || '#ffffff';
  const ac = s?.accentColor || '#fbbf24';
  const r = s?.borderRadius ?? 16;
  const pd = s?.padding ?? 20;
  const hSize = s?.headingSize ?? 22;
  const tSize = s?.textSize ?? 13;
  const sh = s?.shadow || 'none';
  const ht = s?.height ?? 0;
  const titleText = s?.couponTitle || 'DESCUENTO';
  const subtitleWithCoupon = s?.couponSubtitle || 'Código exclusivo por tiempo limitado';
  const messageWithoutCoupon = s?.couponMessage || 'Oferta especial por tiempo limitado';
  const stampText = s?.couponStampText || 'EXCLUSIVO';
  const codeLabelText = s?.couponCodeLabel || 'Tu código';
  const copyText = s?.couponCopyText || 'Copiar';
  const copiedText = s?.couponCopiedText || '¡Copiado!';
  const couponId = s?.couponId || null;
  const copyBtnBg = s?.copyBtnColor || null;
  const copyBtnTx = s?.copyBtnTextColor || null;

  const shadowMap: Record<string, string> = {
    none: 'none',
    sm: '0 1px 3px rgba(0,0,0,0.04)',
    md: '0 2px 6px rgba(0,0,0,0.06)',
    lg: '0 3px 10px rgba(0,0,0,0.08)',
  };

  useEffect(() => {
    const url = couponId 
      ? `/api/public-data/coupons?id=${couponId}`
      : '/api/public-data/coupons';

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch coupons');
        return res.json();
      })
      .then(data => {
        if (couponId) {
          if (data) setCoupon(data as Coupon);
        } else {
          const list = data as Coupon[];
          const valid = list.find(c => {
            const expiresAt = c.expiresAt || null;
            if (expiresAt && new Date(expiresAt * 1000) < new Date()) return false;
            return true;
          });
          if (valid) setCoupon(valid);
        }
      })
      .catch(e => console.error(e));
  }, [couponId]);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIsVisible(true); obs.disconnect(); }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const code = coupon?.code || 'DESCUENTO10';
  const discountText = coupon
    ? (coupon.type === 'percent' || coupon.type === 'percentage'
      ? `${coupon.value}%`
      : `$${coupon.value?.toLocaleString() ?? ''}`)
    : '10%';
  const minAmount = coupon?.minPurchase;

  const commonProps = {
    bannerRef, isVisible, copied, code, discountText, minAmount,
    titleText, subtitleWithCoupon, messageWithoutCoupon, stampText,
    codeLabelText, copyText, copiedText, hasCoupon: !!coupon,
    onCopy: () => handleCopy(code),
    bg, tx, ac, r, pd, hSize, tSize, sh, ht, shadowMap, copyBtnBg, copyBtnTx,
  };

  // Render layout based on couponLayout
  switch (layout) {
    case 'yaxsell-split':  return <LayoutYaxsellSplit {...commonProps} />;
    case 'noir-premium':   return <LayoutNoirPremium {...commonProps} />;
    case 'mono-ticket':    return <LayoutMonoTicket {...commonProps} />;
    case 'mono-magazine':  return <LayoutMonoMagazine {...commonProps} />;
    case 'mono-stamp':     return <LayoutMonoStamp {...commonProps} />;
    case 'classic':
    default:               return <LayoutClassic {...commonProps} />;
  }
}

type LayoutProps = {
  bannerRef: React.RefObject<HTMLDivElement | null>;
  isVisible: boolean; copied: boolean;
  code: string; discountText: string; minAmount?: number;
  titleText: string; subtitleWithCoupon: string; messageWithoutCoupon: string;
  stampText: string; codeLabelText: string; copyText: string; copiedText: string;
  hasCoupon: boolean; onCopy: () => void;
  bg: string; tx: string; ac: string; r: number; pd: number;
  hSize: number; tSize: number; sh: string; ht: number;
  shadowMap: Record<string, string>;
  copyBtnBg?: string | null; copyBtnTx?: string | null;
};

/* ── Subtle CSS-only particles (zero JS, zero lag) ── */
function CouponParticles({ color = 'rgba(255,255,255,0.5)', count = 12 }: { color?: string; count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => {
    const size = 1.5 + Math.random() * 2.5;
    const x = 5 + Math.random() * 90;
    const y = 10 + Math.random() * 80;
    const dur = 7 + Math.random() * 10;
    const delay = Math.random() * -dur;
    const driftX = -15 + Math.random() * 30;
    const driftY = -(30 + Math.random() * 40);
    return { size, x, y, dur, delay, driftX, driftY, key: i };
  });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      <style>{`
        @keyframes cb-float-up {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          8% { opacity: 0.7; }
          85% { opacity: 0.5; }
          100% { transform: translateY(var(--dy)) translateX(var(--dx)); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.key} style={{
          position: 'absolute' as const,
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 ${p.size * 2.5}px ${color}`,
          animation: `cb-float-up ${p.dur}s ease-in-out ${p.delay}s infinite`,
          willChange: 'transform, opacity',
          ['--dx' as string]: `${p.driftX}px`,
          ['--dy' as string]: `${p.driftY}px`,
        }} />
      ))}
    </div>
  );
}

/* ── 3D Tilt handler (shared by all layouts) ── */
function handleTilt(e: React.MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5 left, +0.5 right
  const y = (e.clientY - rect.top) / rect.height - 0.5;  // -0.5 top, +0.5 bottom
  // Mouse right → tilt right (rotateY positive), mouse down → tilt back (rotateX negative)
  const ry = x * 14;   // más ángulo, dirección natural
  const rx = y * -10;  // dirección natural
  el.style.transition = 'transform 0.1s ease-out';
  el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px) scale(1.02)`;
}
function resetTilt(e: React.MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget as HTMLElement;
  el.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
  el.style.transform = '';
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT 1: CLASSIC (el original con cambios mínimos)
   ═══════════════════════════════════════════════════════════════ */
function LayoutClassic(p: LayoutProps) {
  const { bannerRef, isVisible, copied, code, discountText, minAmount, titleText, subtitleWithCoupon, messageWithoutCoupon, stampText, codeLabelText, copyText, copiedText, hasCoupon, onCopy, bg, tx, ac, r, pd, hSize, tSize, sh, ht, shadowMap, copyBtnBg, copyBtnTx } = p;
  const isBgGradient = bg.includes('gradient') || bg.includes(',');
  const bgStyle = isBgGradient ? { background: bg } : { backgroundColor: bg };
  const resolvedBtnBg = copyBtnBg || `linear-gradient(135deg, ${ac}, ${ac}dd)`;
  const resolvedBtnTx = copyBtnTx || (() => {
    const hex = ac.replace('#', '');
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.55 ? '#1a1a1a' : '#ffffff';
  })();
  return (
    <>
      <style>{`
        @keyframes cb-shimmer { 0% { transform: translateX(-120%) skewX(-20deg); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(240%) skewX(-20deg); opacity: 0; } }
        @keyframes cb-holo-shift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes cb-glow-ring { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.3); } 50% { box-shadow: 0 0 0 6px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.3); } }
        @keyframes cb-mesh-drift { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -20px) scale(1.15); } 66% { transform: translate(-20px, 15px) scale(0.92); } }
        @keyframes cb-percent-glow { 0%, 100% { filter: drop-shadow(0 2px 8px rgba(255,255,255,0.3)) drop-shadow(0 4px 16px rgba(255,255,255,0.15)); } 50% { filter: drop-shadow(0 2px 12px rgba(255,255,255,0.5)) drop-shadow(0 6px 24px rgba(255,255,255,0.25)); } }
        @keyframes cb-stamp-bob { 0%, 100% { transform: rotate(-15deg) scale(1); } 50% { transform: rotate(-13deg) scale(1.04); } }
        @keyframes cb-confetti-1 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(40px,-60px) rotate(180deg); opacity:0; } }
        @keyframes cb-confetti-2 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(-30px,-50px) rotate(-120deg); opacity:0; } }
        @keyframes cb-confetti-3 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(25px,-45px) rotate(90deg); opacity:0; } }
        @keyframes cb-spark { 0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); } 50% { opacity: 1; transform: scale(1) rotate(180deg); } }
        @keyframes cb-flame-flicker { 0%, 100% { transform: translateY(0) scale(1); filter: drop-shadow(0 0 6px #f97316aa); } 50% { transform: translateY(-2px) scale(1.08); filter: drop-shadow(0 0 10px #ef4444); } }
        @keyframes cb-code-glow { 0%, 100% { box-shadow: 0 4px 14px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1), 0 0 0 1px rgba(255,255,255,0.4); } 50% { box-shadow: 0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,1), 0 0 0 2px rgba(255,255,255,0.6); } }
        .cb-banner { transition: transform 0.4s cubic-bezier(0.2,1,0.3,1), box-shadow 0.3s; transform-style: preserve-3d; will-change: transform; }
        .cb-holo-layer { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, rgba(255,0,128,0) 0%, rgba(0,255,255,0.08) 25%, rgba(255,255,0,0.12) 50%, rgba(255,0,255,0.08) 75%, rgba(0,255,128,0) 100%); background-size: 300% 100%; animation: cb-holo-shift 8s ease-in-out infinite; mix-blend-mode: overlay; }
        .cb-copy-btn { transition: all 0.25s cubic-bezier(0.2,1,0.3,1); position: relative; }
        .cb-copy-btn::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%); transform: translateX(-120%) skewX(-20deg); transition: transform 0.6s cubic-bezier(0.2,1,0.3,1); pointer-events: none; }
        .cb-copy-btn:hover::before { transform: translateX(120%) skewX(-20deg); }
        .cb-copy-btn:hover { transform: translateY(-2px) scale(1.02); }
        .cb-copy-btn:active { transform: scale(0.96); }
        .cb-code-box { transition: all 0.3s cubic-bezier(0.2,1,0.3,1); animation: cb-code-glow 3s ease-in-out infinite; }
        .cb-code-box:hover { transform: scale(1.02) translateY(-1px); }
        .cb-ticket-icon { transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1); }
        .cb-banner:hover .cb-ticket-icon { transform: rotate(-12deg) scale(1.08); }
        .cb-stamp { animation: cb-stamp-bob 3s ease-in-out infinite; }
        .cb-hero-percent { background: linear-gradient(180deg, #fff 0%, #fff 55%, rgba(255,255,255,0.85) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: cb-percent-glow 2.5s ease-in-out infinite; }
        @media (max-width: 600px) {
          .cb-banner { padding: 20px 16px !important; border-radius: 20px !important; }
          .cb-banner > div[style*="zIndex: 4"] { flex-direction: column !important; gap: 16px !important; align-items: stretch !important; }
          .cb-banner .cb-stamp { display: none !important; }
          .cb-mobile-row { flex-direction: column !important; align-items: center !important; text-align: center !important; }
          .cb-divider { display: none !important; }
          .cb-code-section { align-items: center !important; width: 100% !important; }
          .cb-code-row { width: 100% !important; border-radius: 14px !important; overflow: hidden !important; }
          .cb-copy-btn { width: 100% !important; justify-content: center !important; padding: 14px !important; }
        }
      `}</style>
      <div ref={bannerRef} className="cb-banner"
        onMouseMove={handleTilt}
        onMouseLeave={resetTilt}
        style={{ ...bgStyle, borderRadius: r, padding: `${pd + 6}px ${pd + 20}px`, position: 'relative', boxShadow: shadowMap[sh] || '0 12px 40px rgba(0,0,0,0.15)', color: tx, ...(ht > 0 ? { minHeight: ht, display: 'flex', alignItems: 'center' } : {}), opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.6s, transform 0.6s', overflow: 'hidden' }}>
        <CouponParticles color="rgba(255,255,255,0.35)" count={10} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', top: '-40%', left: '-15%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 60%)', filter: 'blur(30px)', animation: 'cb-mesh-drift 14s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: '-50%', right: '-10%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 60%)', filter: 'blur(35px)', animation: 'cb-mesh-drift 17s ease-in-out infinite 3s' }} />
        </div>
        <div className="cb-holo-layer" />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: r, pointerEvents: 'none', zIndex: 2 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '45%', height: '100%', background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)', animation: 'cb-shimmer 5.5s ease-in-out infinite' }} />
        </div>
        <div style={{ position: 'absolute', top: '50%', left: 0, transform: 'translate(-50%, -50%)', width: 28, height: 28, borderRadius: '50%', background: '#fff', zIndex: 3, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', right: 0, transform: 'translate(50%, -50%)', width: 28, height: 28, borderRadius: '50%', background: '#fff', zIndex: 3, pointerEvents: 'none' }} />
        <div className="cb-mobile-row" style={{ position: 'relative', zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, position: 'relative' }}>
            <div style={{ position: 'relative', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.08))', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.35)', animation: 'cb-glow-ring 3s ease-in-out infinite' }} />
              <Ticket className="cb-ticket-icon" size={28} color={ac} strokeWidth={2.5} style={{ filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.25))`, position: 'relative' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
              <span className="cb-hero-percent" style={{ fontSize: hSize * 2, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.9 }}>{discountText}</span>
              <div style={{ fontSize: hSize * 0.4, fontWeight: 800, letterSpacing: '0.35em', marginTop: 2, opacity: 0.95 }}>{titleText}</div>
              <div style={{ fontSize: tSize - 1, fontWeight: 500, opacity: 0.82, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Flame size={tSize} color="#fbbf24" fill="#f97316" style={{ animation: 'cb-flame-flicker 1.2s ease-in-out infinite' }} />
                <span>{hasCoupon ? subtitleWithCoupon : messageWithoutCoupon}</span>
              </div>
            </div>
            <div className="cb-stamp" style={{ position: 'absolute', top: -10, right: -30, padding: '3px 8px', border: '2px solid rgba(255,255,255,0.85)', borderRadius: 4, fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Award size={10} />{stampText}
            </div>
          </div>
          <div className="cb-divider" style={{ width: 2, height: 60, background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.3) 0, rgba(255,255,255,0.3) 3px, transparent 3px, transparent 8px)' }} />
          <div className="cb-code-section" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', opacity: 0.75, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={10} color={ac} fill={ac} /><span>{codeLabelText}</span>
              {minAmount && minAmount > 0 && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.18)', fontSize: 9, fontWeight: 700 }}>MÍN. ${minAmount.toLocaleString()}</span>}
            </div>
            <div className="cb-code-row" style={{ display: 'flex', alignItems: 'stretch', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.15)' }}>
              <div className="cb-code-box" style={{ flex: 1, padding: '14px 24px', background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)', display: 'flex', alignItems: 'center', gap: 10, borderRight: '2px dashed rgba(0,0,0,0.12)' }}>
                <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2.5, fontFamily: '"SF Mono", monospace', background: 'linear-gradient(135deg, #0a0a0a 0%, #3a3a3a 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{code}</span>
              </div>
              <button className="cb-copy-btn" onClick={onCopy}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px', background: copied ? 'linear-gradient(135deg, #10b981, #059669)' : resolvedBtnBg, color: copied ? '#ffffff' : resolvedBtnTx, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase', minWidth: 110, justifyContent: 'center' }}>
                {copied ? <Check size={16} strokeWidth={3.5} /> : <Copy size={14} strokeWidth={2.8} />}
                <span>{copied ? copiedText : copyText}</span>
                {!copied && <ChevronRight size={13} strokeWidth={3} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT 2: YAXSELL SPLIT — Mitad blanco / mitad negro inteligente
   - Lado izq blanco con porcentaje GIGANTE en negro
   - Lado der negro con código en blanco
   - Tijera diagonal cortando la transición
   ═══════════════════════════════════════════════════════════════ */
function LayoutYaxsellSplit(p: LayoutProps) {
  const { bannerRef, isVisible, copied, code, discountText, minAmount, titleText, subtitleWithCoupon, messageWithoutCoupon, stampText, codeLabelText, copyText, copiedText, hasCoupon, onCopy, r, pd, hSize, tSize, sh, ht, shadowMap } = p;
  return (
    <>
      <style>{`
        @keyframes ys-shimmer-w { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        @keyframes ys-shimmer-b { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        @keyframes ys-stamp-rot { 0%, 100% { transform: rotate(-8deg) scale(1); } 50% { transform: rotate(-6deg) scale(1.03); } }
        @keyframes ys-scissor { 0%, 100% { transform: translateY(-50%) translateX(0); } 50% { transform: translateY(-50%) translateX(4px); } }
        @keyframes ys-pulse-dot { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
        .ys-banner { position: relative; display: flex; overflow: hidden; transition: box-shadow .3s; }
        .ys-banner:hover { box-shadow: 0 14px 40px rgba(0,0,0,0.18), 0 6px 16px rgba(0,0,0,0.1) !important; }
        .ys-copy-btn { transition: all .25s cubic-bezier(0.2,1,0.3,1); position: relative; overflow: hidden; }
        .ys-copy-btn::before { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%); transform: translateX(-120%) skewX(-20deg); transition: transform .6s; }
        .ys-copy-btn:hover::before { transform: translateX(120%) skewX(-20deg); }
        .ys-copy-btn:hover { transform: translateY(-2px); }
        .ys-copy-btn:active { transform: scale(0.96); }
      `}</style>
      <div ref={bannerRef} className="ys-banner"
        onMouseMove={handleTilt}
        onMouseLeave={resetTilt}
        style={{ borderRadius: r, ...(ht > 0 ? { minHeight: ht } : { minHeight: 160 }), boxShadow: shadowMap[sh] || '0 8px 28px rgba(0,0,0,0.12)', opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.7s, transform 0.7s, box-shadow 0.3s' }}>
        <CouponParticles color="rgba(0,0,0,0.15)" count={6} />
        {/* WHITE SIDE — porcentaje gigante */}
        <div style={{ flex: 1.1, background: '#ffffff', color: '#000', padding: `${pd + 10}px ${pd + 16}px`, position: 'relative', display: 'flex', alignItems: 'center', gap: 18, overflow: 'hidden', borderRight: '2px dashed #000' }}>
          {/* Subtle pattern */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '14px 14px', pointerEvents: 'none' }} />
          {/* Shimmer */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', background: 'linear-gradient(105deg, transparent 30%, rgba(0,0,0,0.04) 50%, transparent 70%)', animation: 'ys-shimmer-w 6s ease-in-out infinite', pointerEvents: 'none' }} />
          {/* Logo Y */}
          <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 11, fontWeight: 900, letterSpacing: '0.3em', color: '#000', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#000', animation: 'ys-pulse-dot 2s infinite' }} />
            YAXSELL
          </div>
          <div style={{ position: 'relative', zIndex: 1, marginTop: 14 }}>
            <div style={{ fontSize: hSize * 0.5, fontWeight: 900, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#000', opacity: 0.7, marginBottom: 4 }}>{titleText}</div>
            <div style={{ fontSize: hSize * 2.6, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.85, color: '#000', textShadow: '0 2px 0 rgba(0,0,0,0.05)' }}>{discountText}</div>
            <div style={{ fontSize: tSize, fontWeight: 600, color: '#444', marginTop: 8, maxWidth: 280, lineHeight: 1.4 }}>{hasCoupon ? subtitleWithCoupon : messageWithoutCoupon}</div>
          </div>
          {/* Stamp */}
          <div style={{ position: 'absolute', top: 14, right: 14, padding: '5px 10px', border: '2px solid #000', borderRadius: 4, fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', color: '#000', background: '#fff', animation: 'ys-stamp-rot 3s ease-in-out infinite', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Star size={10} fill="#000" /> {stampText}
          </div>
        </div>

        {/* SCISSOR ICON between sides */}
        <div style={{ position: 'absolute', top: '50%', left: 'calc(52.4% - 14px)', zIndex: 5, color: '#000', background: '#fff', borderRadius: '50%', padding: 6, border: '2px solid #000', animation: 'ys-scissor 2.5s ease-in-out infinite', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
          <Scissors size={14} strokeWidth={2.5} />
        </div>

        {/* BLACK SIDE — código */}
        <div style={{ flex: 1, background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)', color: '#fff', padding: `${pd + 10}px ${pd + 16}px`, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, overflow: 'hidden' }}>
          <CouponParticles color="rgba(255,255,255,0.2)" count={6} />
          {/* Subtle grain */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '14px 14px', pointerEvents: 'none' }} />
          {/* Shimmer */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)', animation: 'ys-shimmer-b 6s ease-in-out infinite 1s', pointerEvents: 'none' }} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#999', display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
            <Tag size={11} strokeWidth={2.5} />{codeLabelText}
            {minAmount && minAmount > 0 && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid #333', fontSize: 9, fontWeight: 700, color: '#fff' }}>MÍN. ${minAmount.toLocaleString()}</span>}
          </div>
          <div style={{ position: 'relative', zIndex: 1, padding: '14px 18px', border: '2px solid #fff', borderRadius: 8, background: 'rgba(255,255,255,0.03)', textAlign: 'center', fontSize: 22, fontWeight: 900, letterSpacing: 4, color: '#fff', fontFamily: '"SF Mono", monospace', boxShadow: 'inset 0 0 20px rgba(255,255,255,0.05)' }}>
            {code}
          </div>
          <button className="ys-copy-btn" onClick={onCopy}
            style={{ position: 'relative', zIndex: 1, padding: '12px 18px', background: copied ? '#10b981' : '#ffffff', color: copied ? '#fff' : '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {copied ? <Check size={15} strokeWidth={3.5} /> : <Copy size={13} strokeWidth={3} />}
            {copied ? copiedText : copyText}
            {!copied && <ChevronRight size={13} strokeWidth={3} />}
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT 3: NOIR PREMIUM — Negro total con detalles dorados
   ═══════════════════════════════════════════════════════════════ */
function LayoutNoirPremium(p: LayoutProps) {
  const { bannerRef, isVisible, copied, code, discountText, minAmount, titleText, subtitleWithCoupon, messageWithoutCoupon, stampText, codeLabelText, copyText, copiedText, hasCoupon, onCopy, r, pd, hSize, tSize, sh, ht, shadowMap, ac } = p;
  const accent = ac && ac !== '#ffffff' ? ac : '#d4a853';
  return (
    <>
      <style>{`
        @keyframes np-grad { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes np-glow { 0%, 100% { box-shadow: inset 0 0 20px rgba(255,255,255,0.04), 0 0 0 1px rgba(255,255,255,0.06); } 50% { box-shadow: inset 0 0 30px rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.12); } }
        @keyframes np-line { 0% { background-position: 0 0; } 100% { background-position: 30px 0; } }
        @keyframes np-bar { 0%, 100% { transform: scaleY(0.6); opacity: 0.5; } 50% { transform: scaleY(1); opacity: 1; } }
        .np-banner { position: relative; overflow: hidden; }
        .np-copy-btn { transition: all .25s; position: relative; overflow: hidden; }
        .np-copy-btn:hover { transform: translateY(-2px); }
        .np-copy-btn::after { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%); transform: translateX(-120%); transition: transform .6s; }
        .np-copy-btn:hover::after { transform: translateX(120%); }
      `}</style>
      <div ref={bannerRef} className="np-banner"
        onMouseMove={handleTilt}
        onMouseLeave={resetTilt}
        style={{ background: 'linear-gradient(135deg, #050505 0%, #1a1a1a 35%, #2a2a2a 50%, #1a1a1a 65%, #050505 100%)', backgroundSize: '300% 300%', animation: 'np-grad 12s ease-in-out infinite', borderRadius: r, padding: `${pd + 10}px ${pd + 16}px`, position: 'relative', boxShadow: shadowMap[sh] || '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)', color: '#fff', ...(ht > 0 ? { minHeight: ht, display: 'flex', alignItems: 'center' } : {}), opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.7s, transform 0.4s' }}>
        <CouponParticles color="rgba(212,168,83,0.25)" count={8} />
        {/* Gold border lines */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, height: 1, background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }} />
        <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, height: 1, background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }} />
        {/* Animated equalizer bars deco */}
        <div style={{ position: 'absolute', top: 18, right: 18, display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ width: 2, height: 12, background: accent, animation: `np-bar 1.${4 + i}s ease-in-out infinite ${i * 0.1}s`, transformOrigin: 'center' }} />
          ))}
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {/* Hero icon */}
            <div style={{ width: 64, height: 64, borderRadius: 14, border: `2px solid ${accent}`, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'np-glow 3s ease-in-out infinite', flexShrink: 0 }}>
              <Ticket size={30} color={accent} strokeWidth={2.2} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.4em', color: accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={11} fill={accent} color={accent} />{titleText}<Star size={11} fill={accent} color={accent} />
              </div>
              <div style={{ fontSize: hSize * 2.2, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 1, background: `linear-gradient(180deg, #fff 0%, #fff 50%, ${accent} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: `drop-shadow(0 0 12px ${accent}33)` }}>{discountText}</div>
              <div style={{ fontSize: tSize - 1, fontWeight: 500, color: '#aaa', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 1, background: accent }} />
                {hasCoupon ? subtitleWithCoupon : messageWithoutCoupon}
              </div>
            </div>
          </div>
          {/* Code section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Zap size={10} color={accent} fill={accent} />{codeLabelText}</span>
              {minAmount && minAmount > 0 && <span style={{ padding: '2px 8px', border: `1px solid ${accent}55`, borderRadius: 4, fontSize: 9, color: '#fff' }}>MÍN. ${minAmount.toLocaleString()}</span>}
            </div>
            <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: `1px solid ${accent}66` }}>
              <div style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.04)', textAlign: 'center', fontSize: 19, fontWeight: 900, letterSpacing: 3, color: accent, fontFamily: '"SF Mono", monospace', borderRight: `2px dashed ${accent}55`, textShadow: `0 0 12px ${accent}66` }}>
                {code}
              </div>
              <button className="np-copy-btn" onClick={onCopy}
                style={{ padding: '14px 18px', background: copied ? '#10b981' : `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`, color: '#000', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                {copied ? <Check size={14} strokeWidth={3.5} /> : <Copy size={13} strokeWidth={3} />}
                {copied ? copiedText : copyText}
              </button>
            </div>
            <div style={{ fontSize: 9, color: '#666', textAlign: 'center', letterSpacing: '0.15em', textTransform: 'uppercase' }}>· {stampText} ·</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT 4: MONO TICKET — Estilo ticket de cine en B/N
   ═══════════════════════════════════════════════════════════════ */
function LayoutMonoTicket(p: LayoutProps) {
  const { bannerRef, isVisible, copied, code, discountText, minAmount, titleText, subtitleWithCoupon, messageWithoutCoupon, stampText, codeLabelText, copyText, copiedText, hasCoupon, onCopy, r, pd, hSize, tSize, sh, ht, shadowMap } = p;
  return (
    <>
      <style>{`
        @keyframes mt-stamp { 0%, 100% { transform: rotate(-12deg) scale(1); } 50% { transform: rotate(-10deg) scale(1.05); } }
        @keyframes mt-perforation { 0% { background-position: 0 0; } 100% { background-position: 0 24px; } }
        .mt-banner { position: relative; }
        .mt-copy-btn { transition: all .25s; }
        .mt-copy-btn:hover { background: #000 !important; color: #fff !important; transform: scale(1.03); }
        .mt-copy-btn:active { transform: scale(0.96); }
      `}</style>
      <div ref={bannerRef} className="mt-banner"
        onMouseMove={handleTilt}
        onMouseLeave={resetTilt}
        style={{ display: 'flex', borderRadius: r, overflow: 'hidden', boxShadow: shadowMap[sh] || '0 20px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)', background: '#fff', ...(ht > 0 ? { minHeight: ht } : { minHeight: 150 }), opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.7s, transform 0.4s' }}>
        <CouponParticles color="rgba(0,0,0,0.12)" count={6} />
        {/* Stub LEFT (negro vertical) */}
        <div style={{ width: 90, background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 8px', position: 'relative', flexShrink: 0 }}>
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 900, letterSpacing: '0.4em', textTransform: 'uppercase', textAlign: 'center' }}>{titleText} · {stampText}</div>
          {/* Top + bottom dots */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
        </div>
        {/* Perforation */}
        <div style={{ width: 0, position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, background: 'repeating-linear-gradient(0deg, transparent, transparent 6px, #000 6px, #000 12px)', animation: 'mt-perforation 8s linear infinite' }} />
          {/* Notches */}
          <div style={{ position: 'absolute', top: -10, left: -10, width: 20, height: 20, borderRadius: '50%', background: '#fff', border: '1px solid rgba(0,0,0,0.1)' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -10, width: 20, height: 20, borderRadius: '50%', background: '#fff', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
        {/* Body BLANCO */}
        <div style={{ flex: 1, padding: `${pd + 10}px ${pd + 18}px`, position: 'relative', display: 'flex', alignItems: 'center', gap: 24, color: '#000', flexWrap: 'wrap' }}>
          {/* Watermark percentage */}
          <div style={{ position: 'absolute', top: 8, right: 14, fontSize: hSize * 3, fontWeight: 900, color: '#000', opacity: 0.04, lineHeight: 0.8, letterSpacing: '-0.06em', pointerEvents: 'none', userSelect: 'none' }}>{discountText}</div>
          {/* Left: percent */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: tSize, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>ADMIT ONE</div>
            <div style={{ fontSize: hSize * 2.2, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.85, color: '#000' }}>{discountText}</div>
            <div style={{ fontSize: tSize - 1, color: '#444', marginTop: 8, fontWeight: 500, maxWidth: 240, lineHeight: 1.4 }}>{hasCoupon ? subtitleWithCoupon : messageWithoutCoupon}</div>
          </div>
          {/* Right: code */}
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#666', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>{codeLabelText}</span>
              {minAmount && minAmount > 0 && <span>MÍN. ${minAmount.toLocaleString()}</span>}
            </div>
            <div style={{ padding: '14px 22px', background: '#000', color: '#fff', borderRadius: 6, fontSize: 22, fontWeight: 900, letterSpacing: 3.5, fontFamily: '"SF Mono", monospace', textAlign: 'center', boxShadow: 'inset 0 0 0 4px #000, inset 0 0 0 5px #fff, inset 0 0 0 6px #000' }}>{code}</div>
            <button className="mt-copy-btn" onClick={onCopy}
              style={{ padding: '10px 16px', background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#000', border: '2px solid #000', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {copied ? <Check size={14} strokeWidth={3.5} /> : <Copy size={13} strokeWidth={3} />}
              {copied ? copiedText : copyText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT 5: MONO MAGAZINE — Editorial gran tipografía
   ═══════════════════════════════════════════════════════════════ */
function LayoutMonoMagazine(p: LayoutProps) {
  const { bannerRef, isVisible, copied, code, discountText, minAmount, titleText, subtitleWithCoupon, messageWithoutCoupon, stampText, codeLabelText, copyText, copiedText, hasCoupon, onCopy, r, pd, hSize, tSize, sh, ht, shadowMap } = p;
  return (
    <>
      <style>{`
        @keyframes mm-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes mm-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .mm-banner { }
        .mm-copy-btn { transition: all .2s; position: relative; overflow: hidden; }
        .mm-copy-btn:hover { background: #fff !important; color: #000 !important; }
        .mm-copy-btn:active { transform: scale(0.97); }
      `}</style>
      <div ref={bannerRef} className="mm-banner"
        onMouseMove={handleTilt}
        onMouseLeave={resetTilt}
        style={{ background: '#fff', borderRadius: r, padding: 0, position: 'relative', boxShadow: shadowMap[sh] || '0 20px 50px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)', color: '#000', ...(ht > 0 ? { minHeight: ht } : {}), opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.7s, transform 0.4s', overflow: 'hidden' }}>
        <CouponParticles color="rgba(0,0,0,0.1)" count={6} />
        {/* Top marquee bar */}
        <div style={{ background: '#000', color: '#fff', padding: '7px 0', overflow: 'hidden', position: 'relative', borderBottom: '3px solid #000' }}>
          <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'mm-marquee 22s linear infinite', fontSize: 11, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            {Array(2).fill(0).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 18, paddingRight: 18 }}>
                {[titleText, '★', stampText, '★', 'YAXSELL', '★', titleText, '★', stampText, '★', 'YAXSELL', '★'].map((t, j) => (
                  <span key={j} style={{ flexShrink: 0 }}>{t}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* Body */}
        <div style={{ padding: `${pd + 12}px ${pd + 16}px`, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          {/* Issue # */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignSelf: 'stretch', borderRight: '2px solid #000', paddingRight: 24, minWidth: 90 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#666' }}>VOL. 01</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#000', letterSpacing: '-0.04em', lineHeight: 1 }}>№{hasCoupon ? '02' : '01'}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#888', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#000', animation: 'mm-blink 1.5s infinite' }} />
              ACTIVO
            </div>
          </div>
          {/* Hero */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: hSize * 0.55, fontWeight: 900, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#000', marginBottom: 6, fontFamily: 'serif' }}>— {titleText} —</div>
            <div style={{ fontSize: hSize * 2.4, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.85, color: '#000', fontFamily: 'serif', fontStyle: 'italic' }}>{discountText}</div>
            <div style={{ fontSize: tSize, fontWeight: 500, color: '#444', marginTop: 10, lineHeight: 1.5, maxWidth: 320, fontFamily: 'serif' }}>« {hasCoupon ? subtitleWithCoupon : messageWithoutCoupon} »</div>
          </div>
          {/* Code column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220, borderLeft: '2px solid #000', paddingLeft: 24, alignSelf: 'stretch', justifyContent: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#000', borderBottom: '1px solid #000', paddingBottom: 4 }}>{codeLabelText}</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, fontFamily: '"SF Mono", monospace', color: '#000', padding: '4px 0' }}>{code}</div>
            {minAmount && minAmount > 0 && <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Mín. compra ${minAmount.toLocaleString()}</div>}
            <button className="mm-copy-btn" onClick={onCopy}
              style={{ padding: '10px 14px', background: copied ? '#10b981' : '#000', color: '#fff', border: 'none', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span>{copied ? copiedText : copyText}</span>
              {copied ? <Check size={14} strokeWidth={3.5} /> : <ChevronRight size={14} strokeWidth={3} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT 6: MONO STAMP — Sello postal estilo timbre
   ═══════════════════════════════════════════════════════════════ */
function LayoutMonoStamp(p: LayoutProps) {
  const { bannerRef, isVisible, copied, code, discountText, minAmount, titleText, subtitleWithCoupon, messageWithoutCoupon, stampText, codeLabelText, copyText, copiedText, hasCoupon, onCopy, r, pd, hSize, tSize, sh, ht, shadowMap } = p;
  return (
    <>
      <style>{`
        @keyframes ms-stamp { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(-1deg); } }
        @keyframes ms-pulse-circle { 0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0.1); } 50% { box-shadow: 0 0 0 10px rgba(0,0,0,0); } }
        .ms-banner { }
        .ms-copy-btn { transition: all .2s; }
        .ms-copy-btn:hover { transform: scale(1.04); background: #000 !important; color: #fff !important; }
      `}</style>
      <div ref={bannerRef} className="ms-banner"
        onMouseMove={handleTilt}
        onMouseLeave={resetTilt}
        style={{ background: '#fff', border: '2px solid #000', borderRadius: r, padding: `${pd + 14}px ${pd + 18}px`, position: 'relative', boxShadow: shadowMap[sh] || '8px 8px 0 #000, 0 18px 40px rgba(0,0,0,0.1)', color: '#000', ...(ht > 0 ? { minHeight: ht, display: 'flex', alignItems: 'center' } : {}), opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.7s, transform 0.3s, box-shadow 0.3s' }}>
        <CouponParticles color="rgba(0,0,0,0.1)" count={6} />
        {/* Postage perforation border */}
        <div style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 4, background: 'repeating-linear-gradient(90deg, transparent, transparent 6px, #fff 6px, #fff 12px)', borderRadius: '4px 4px 0 0' }} />
        <div style={{ position: 'absolute', bottom: -2, left: 0, right: 0, height: 4, background: 'repeating-linear-gradient(90deg, transparent, transparent 6px, #fff 6px, #fff 12px)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', position: 'relative', width: '100%' }}>
          {/* Round stamp */}
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: '3px double #000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', animation: 'ms-stamp 4s ease-in-out infinite', background: 'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 9deg, rgba(0,0,0,0.04) 9deg, rgba(0,0,0,0.04) 10deg)' }}>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.15em', color: '#000' }}>YAXSELL</div>
            <div style={{ fontSize: hSize * 0.95, fontWeight: 900, letterSpacing: '-0.05em', color: '#000', lineHeight: 1 }}>{discountText}</div>
            <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.2em', color: '#000', marginTop: 2 }}>{stampText}</div>
          </div>
          {/* Center text */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>{titleText}</div>
            <div style={{ fontSize: hSize * 1.4, fontWeight: 900, letterSpacing: '-0.04em', color: '#000', lineHeight: 1, fontFamily: 'serif' }}>Cupón especial</div>
            <div style={{ fontSize: tSize, color: '#555', marginTop: 8, lineHeight: 1.4, maxWidth: 280 }}>{hasCoupon ? subtitleWithCoupon : messageWithoutCoupon}</div>
          </div>
          {/* Code box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#000', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{codeLabelText}</span>
              {minAmount && minAmount > 0 && <span style={{ color: '#888' }}>MÍN. ${minAmount.toLocaleString()}</span>}
            </div>
            <div style={{ padding: '12px 18px', border: '2px dashed #000', borderRadius: 6, fontSize: 20, fontWeight: 900, letterSpacing: 3, fontFamily: '"SF Mono", monospace', color: '#000', textAlign: 'center', minWidth: 180 }}>{code}</div>
            <button className="ms-copy-btn" onClick={onCopy}
              style={{ padding: '10px 14px', background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#000', border: '2px solid #000', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {copied ? <Check size={13} strokeWidth={3.5} /> : <Copy size={12} strokeWidth={3} />}
              {copied ? copiedText : copyText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
