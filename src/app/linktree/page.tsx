import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft, ShoppingBag, Tag, Clock, Film,
  MessageCircle, Instagram, ChevronRight, Truck, BadgeCheck,
  Sparkles, Heart, ShieldCheck, Zap,
} from 'lucide-react';
import LinktreeCategories from './LinktreeCategories';

const LOGO = '';
const HERO_IMG = '';

export const metadata: Metadata = {
  title: { absolute: 'Links | Importadora Carlitos' },
  description: 'Todos los links de Importadora Carlitos en un solo lugar: catálogo, ofertas, próximos ingresos y contacto directo.',
  alternates: { canonical: 'https://www.yaxsell.cl/linktree' },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'Importadora Carlitos',
    title: 'Links | Importadora Carlitos',
    description: 'Catálogo, ofertas, próximos ingresos y contacto directo.',
    url: 'https://www.yaxsell.cl/linktree',
    images: [{ url: LOGO, alt: 'Importadora Carlitos' }],
  },
  robots: { index: true, follow: true },
};

const LINKS = [
  { href: '/ofertas',       icon: Tag,   label: 'Ofertas de la semana', sub: 'Precios rebajados',          grad: 'rose' },
  { href: '/llegan-pronto', icon: Clock, label: 'Llegan pronto',        sub: 'Próximos ingresos',          grad: 'amber' },
  { href: '/clips',         icon: Film,  label: 'Clips',                sub: 'Mira los productos en video', grad: 'violet' },
];

const SOCIAL = [
  { href: 'https://wa.me/56936715405',            icon: MessageCircle, label: 'WhatsApp',  color: '#25D366' },
  { href: 'https://instagram.com/yaxsell',  icon: Instagram,     label: 'Instagram', color: '#E1306C' },
];
import LinktreeClientContent from './LinktreeClientContent';

export default function LinktreePage() {
  return (
    <>
      <LinktreeClientContent />
      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.lt-page {
  min-height: 100vh;
  background:
    radial-gradient(90% 55% at 50% 0%, #dbe9ff 0%, transparent 60%),
    radial-gradient(70% 50% at 80% 90%, rgba(221,214,254,.4) 0%, transparent 60%),
    linear-gradient(180deg, #eef4ff 0%, #e6eefb 50%, #f0ecfa 100%);
  padding: 0 14px 40px;
  display: flex;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #0f1f3d;
}
.lt-phone { width: 100%; max-width: 430px; }

/* ── Animaciones ───────────────────────────────────────────── */
@keyframes lt_fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes lt_float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
@keyframes lt_particle {
  0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
  40%      { opacity: 0.7; }
  60%      { opacity: 0.4; }
  80%      { opacity: 0; transform: translateY(-60px) scale(1.2); }
}
@keyframes lt_shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes lt_scroll {
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50%      { transform: translateY(8px); opacity: 1; }
}
@keyframes lt_pulse_ring {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.8); opacity: 0; }
}
@keyframes lt_signFloat {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-8px); }
}
@keyframes lt_textShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes lt_sparkleGlow {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.9; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
  50%      { transform: scale(1.25) rotate(15deg); opacity: 1; filter: drop-shadow(0 0 10px #ffffff); }
}

/* ── Hero ─────────────────────────────────────────────────── */
.lt-hero {
  position: sticky;
  top: 0;
  z-index: 1;
  height: auto;
  min-height: 200px;
  border-radius: 30px 30px 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: transparent;
  box-shadow: 0 18px 40px rgba(11,35,86,.30);
  animation: lt_fadeUp 0.6s ease-out;
}
.lt-hero-img {
  position: relative;
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
  z-index: 0;
}
.lt-hero::before {
  content: '';
  position: absolute; inset: 0;
  z-index: 1;
}

.lt-particles { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
.lt-particle {
  position: absolute;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,.9) 0%, transparent 70%);
  animation: lt_particle 5s ease-in-out infinite;
}

.lt-back {
  position: absolute; top: 16px; left: 16px; z-index: 3;
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.22);
  border: 1px solid rgba(255,255,255,.40);
  backdrop-filter: blur(8px);
  color: #fff;
  transition: background .18s, transform .18s;
}
.lt-back:hover { background: rgba(255,255,255,.35); transform: scale(1.06); }

.lt-sign {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  display: none;
}
.lt-title-img {
  height: 120px !important;
  width: auto !important;
  max-width: none !important;
  object-fit: contain;
  animation: lt_fadeUp 0.8s ease-out 0.15s both, lt_float 3s ease-in-out infinite 1s;
}
@media (max-width: 640px) {
  .lt-sign { display: block; }
}

.lt-scroll-hint {
  position: absolute; bottom: 42px; left: 50%; transform: translateX(-50%);
  z-index: 10;
  width: 22px; height: 34px;
  border: 2px solid rgba(255,255,255,.8);
  border-radius: 12px;
  display: flex; justify-content: center;
  padding-top: 6px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
}
.lt-scroll-dot {
  width: 4px; height: 8px;
  border-radius: 2px;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
  animation: lt_scroll 1.6s ease-in-out infinite;
}

/* ── Tarjeta Cortina ───────────────────────────────────────── */
@keyframes lt_curtainSlideUp {
  0%   { transform: translateY(45px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

.lt-card-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: #cbd5e1;
  margin: -6px auto 14px;
  transition: background 0.3s, width 0.3s;
}
.lt-card:hover .lt-card-handle {
  background: #94a3b8;
  width: 48px;
}

.lt-card {
  position: relative;
  z-index: 10;
  margin-top: -20px;
  padding: 18px 20px 24px;
  border-radius: 32px 32px 28px 28px;
  background: linear-gradient(180deg, #ffffff 0%, #f3f8ff 100%);
  border: 1px solid #dce8fb;
  box-shadow:
    0 -16px 40px rgba(13,42,99,.20),
    0 16px 34px rgba(13,42,99,.10);
  animation: lt_curtainSlideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
  transition: box-shadow 0.3s ease;
}

.lt-head { display: flex; gap: 14px; align-items: center; }
.lt-thumb-wrap { position: relative; flex: 0 0 auto; }
.lt-thumb {
  width: 76px; height: 76px;
  border-radius: 20px;
  object-fit: contain;
  background: transparent;
  padding: 0;
  border: none;
  box-shadow: none;
}
.lt-thumb-ring {
  position: absolute; inset: -3px;
  border-radius: 23px;
  border: 2px solid rgba(59,130,246,.25);
  animation: lt_pulse_ring 2.5s ease-out infinite;
}
.lt-headtxt { min-width: 0; }
.lt-badge {
  display: inline-flex; align-items: center; gap: 4px;
  background: #fff;
  color: #1d4ed8;
  border: 1px solid #cfe0fb;
  font-size: 11px; font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgba(13,42,99,.07);
}
.lt-title {
  margin: 8px 0 2px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -.3px;
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 40%, #60a5fa 70%, #ffffff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.lt-sub   { margin: 0; font-size: 13px; color: #5b7196; }
.lt-sub-typing {
  overflow: hidden;
  white-space: nowrap;
  border-right: 2px solid #3b82f6;
  animation: lt_typing 4s steps(55, end) 0.3s infinite, lt_blink_caret 0.6s step-end infinite;
  max-width: 100%;
}
@keyframes lt_typing {
  0% { width: 0; }
  70% { width: 100%; }
  85% { width: 100%; }
  100% { width: 0; }
}
@keyframes lt_blink_caret {
  0%, 100% { border-color: transparent; }
  50% { border-color: #3b82f6; }
}
@media (max-width: 380px) {
  .lt-sub-typing { font-size: 11px; animation: lt_typing 4s steps(55, end) 0.3s infinite, lt_blink_caret 0.6s step-end infinite; }
}
@media (max-width: 320px) {
  .lt-sub-typing { font-size: 10px; }
}

/* ── Beneficios ───────────────────────────────────────────── */
.lt-benefits {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.lt-benefit {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 4px;
  padding: 14px 8px;
  border-radius: 18px;
  background: linear-gradient(160deg, #ffffff 0%, #f8faff 100%);
  border: 1px solid #e2ecfb;
  transition: transform .18s, box-shadow .18s, border-color .18s;
  position: relative;
  overflow: hidden;
}
.lt-benefit::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: var(--b-color, #3b82f6);
  opacity: 0.7;
}
.lt-benefit:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(13,42,99,.10); border-color: var(--b-color, #bfdbfe); }
.lt-benefit-ico {
  width: 38px; height: 38px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
  box-shadow: 0 3px 8px rgba(0,0,0,.10);
}
.lt-benefit-title { font-size: 11px; font-weight: 800; color: #12305f; line-height: 1.25; }
.lt-benefit-sub   { font-size: 10px; color: #7089ad; line-height: 1.25; font-weight: 600; }
@media (max-width: 380px) {
  .lt-benefits { gap: 6px; }
  .lt-benefit { padding: 12px 6px; }
  .lt-benefit-ico { width: 32px; height: 32px; }
  .lt-benefit-title { font-size: 10px; }
  .lt-benefit-sub { font-size: 9px; }
}
@media (max-width: 320px) {
  .lt-benefit-title { font-size: 9px; }
  .lt-benefit-sub { font-size: 8px; }
}

/* ── Stylist ──────────────────────────────────────────────── */
.lt-stylist {
  margin-top: 16px;
  display: flex; align-items: center; gap: 11px;
  background: #fff;
  border: 1px solid #e4edfc;
  border-radius: 18px;
  padding: 10px 13px;
  position: relative;
}
@keyframes lt_wa_ripple {
  0%   { transform: scale(0.9); opacity: 0.5; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3); }
  70%  { transform: scale(1.2); opacity: 0; box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
  100% { transform: scale(0.9); opacity: 0; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

.lt-avatar-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lt-avatar-ripple {
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  border: 2px solid rgba(34, 197, 94, 0.35);
  animation: lt_wa_ripple 2s cubic-bezier(0.25, 1, 0.5, 1) infinite;
  pointer-events: none;
}

.lt-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: transparent;
  padding: 0;
  border: none;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 2px 5px rgba(34, 197, 94, 0.18));
}
.lt-stylist-name { margin: 0; font-size: 13.5px; font-weight: 700; color: #12305f; }
.lt-stylist-sub  { margin: 1px 0 0; font-size: 12px; color: #7089ad; }
.lt-stylist-dot {
  position: absolute; top: 12px; right: 13px;
  width: 8px; height: 8px; border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34,197,94,.20);
  animation: lt_float 2s ease-in-out infinite;
}

.lt-divider { height: 1px; background: linear-gradient(90deg, transparent, #e3ecfa 20%, #e3ecfa 80%, transparent); margin: 18px 0; }

.lt-meta { display: flex; gap: 14px; }
.lt-meta-col { flex: 1; min-width: 0; }
.lt-meta-label { margin: 0 0 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; color: #8b9dba; }
.lt-meta-value { margin: 0; display: flex; align-items: center; gap: 5px; font-size: 13.5px; font-weight: 700; color: #12305f; }
.lt-meta-hint  { margin: 3px 0 0; font-size: 11.5px; color: #7089ad; }
.lt-bubbles { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 8px; }
.lt-bubble {
  width: 48px; height: 48px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 16px;
  background: #ffffff;
  border: 2.5px solid #fff;
  box-shadow: 0 4px 10px rgba(13,42,99,.15);
  position: relative;
  overflow: hidden;
  transition: transform .2s ease, box-shadow .2s ease;
}
.lt-bubble:hover { transform: scale(1.12); z-index: 10; box-shadow: 0 6px 14px rgba(13,42,99,.22); }
.lt-cat-item {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  text-decoration: none; color: inherit;
  flex-shrink: 0;
}
.lt-cat-name {
  font-size: 8px; font-weight: 600; color: #5b7196;
  text-align: center; max-width: 64px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lt-more {
  margin-left: 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  padding: 6px 12px;
  border-radius: 999px;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.lt-more:hover {
  background: #dbeafe;
  transform: translateY(-1px);
}

/* ── Links ────────────────────────────────────────────────── */
.lt-links { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }

@keyframes lt_blueGlow {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.18); }
}
@keyframes lt_btn_particle_rise {
  0%   { opacity: 0; transform: translateY(8px) translateX(0px) scale(0.2); }
  20%  { opacity: 1; }
  80%  { opacity: 0.4; transform: translateY(-18px) translateX(var(--dx, 4px)) scale(1); }
  100% { opacity: 0; transform: translateY(-24px) translateX(var(--dx, 4px)) scale(0.3); }
}
@keyframes lt_btn_particle_pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50%       { transform: scale(1.6); opacity: 1; }
}
.lt-btn-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 999px;
  z-index: 1;
}
.lt-btn-particle {
  position: absolute;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(147,197,253,0.6) 100%);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.9), 0 0 3px rgba(96,165,250,0.7);
  animation: lt_btn_particle_rise 2.2s ease-out infinite;
}
.lt-btn-particle.star {
  width: 6px; height: 6px;
  border-radius: 0;
  clip-path: polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
  background: rgba(255,255,255,0.95);
  box-shadow: 0 0 10px rgba(255,255,255,0.8);
  animation: lt_btn_particle_rise 2.8s ease-out infinite, lt_btn_particle_pulse 1.4s ease-in-out infinite;
}
.lt-btn-particle.dot-sm {
  width: 3px; height: 3px;
  box-shadow: 0 0 4px rgba(255,255,255,0.9);
}

.lt-cta {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  padding: 16px;
  border-radius: 999px;
  font-size: 15.5px; font-weight: 700;
  color: #fff;
  text-decoration: none;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25), 0 0 0 1px rgba(255,255,255,.2) inset;
  transition: transform .18s, box-shadow .18s, filter .18s;
  animation: lt_blueGlow 4s ease-in-out infinite, lt_fadeUp 0.5s ease-out 0.4s both;
  position: relative;
  overflow: hidden;
}
.lt-cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.25) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: lt_shimmer 3s linear infinite;
  pointer-events: none;
}
.lt-cta:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35), 0 0 0 1px rgba(255,255,255,.3) inset; filter: brightness(1.08); }
.lt-cta:active { transform: translateY(0) scale(1); box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2); }
.lt-cta-spark { animation: lt_float 2s ease-in-out infinite; }

.lt-link {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 15px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e0eafb;
  text-decoration: none;
  color: #12305f;
  transition: transform .18s, box-shadow .18s, border-color .18s;
  animation: lt_fadeUp 0.5s ease-out both;
}
.lt-link:hover { transform: translateY(-2px); border-color: #bcd6fb; box-shadow: 0 8px 20px rgba(13,42,99,.10); }
.lt-link-ico {
  width: 38px; height: 38px; flex: 0 0 auto;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(140deg, #e8f1ff, #d3e4ff);
  color: #1d4ed8;
}
.lt-grad-rose    { background: linear-gradient(140deg, #fce7f3, #fbcfe8) !important; color: #e11d48 !important; }
.lt-grad-amber   { background: linear-gradient(140deg, #fef3c7, #fde68a) !important; color: #d97706 !important; }
.lt-grad-violet  { background: linear-gradient(140deg, #ede9fe, #ddd6fe) !important; color: #7c3aed !important; }
.lt-grad-blue    { background: linear-gradient(140deg, #dbeafe, #bfdbfe) !important; color: #1d4ed8 !important; }
.lt-grad-green   { background: linear-gradient(140deg, #d1fae5, #a7f3d0) !important; color: #059669 !important; }
.lt-link-txt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.lt-link-label { font-size: 14.5px; font-weight: 700; }
.lt-link-sub   { font-size: 11.5px; color: #7089ad; margin-top: 1px; }
.lt-link-arrow { color: #a8bcd8; flex: 0 0 auto; transition: transform .18s, color .18s; }
.lt-link:hover .lt-link-arrow { transform: translateX(3px); color: #6b8fc0; }

/* ── Social ───────────────────────────────────────────────── */
.lt-social { margin-top: 18px; display: flex; justify-content: center; gap: 12px; }
.lt-soc {
  flex: 1;
  max-width: 160px;
  height: 48px;
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #fff;
  border: 1px solid #dfeafb;
  color: var(--soc-color, #1d4ed8);
  text-decoration: none;
  font-size: 13px; font-weight: 700;
  transition: transform .18s, background .18s, color .18s, box-shadow .18s, border-color .18s;
}
.lt-soc:hover {
  transform: translateY(-3px);
  background: var(--soc-color, #1d4ed8);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 10px 20px rgba(37,99,235,.34);
}
.lt-soc-label { font-size: 13px; }

/* ── Footer ───────────────────────────────────────────────── */
.lt-footer { margin-top: 20px; text-align: center; }
.lt-footer-hearts {
  display: flex; justify-content: center; gap: 4px;
  color: #f0a0c0;
  margin-bottom: 10px;
  animation: lt_float 2s ease-in-out infinite;
}
.lt-foot {
  margin: 0;
  text-align: center;
  font-size: 11.5px;
  line-height: 1.55;
  color: #8b9dba;
}
.lt-copy {
  margin: 10px 0 0;
  font-size: 10.5px;
  font-weight: 600;
  color: #a8bcd8;
  letter-spacing: .3px;
}

/* ── Categorías Interactivas ──────────────────────────────── */
.lt-cat-box {
  margin: 16px 0;
  width: 100%;
}
.lt-cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.lt-cat-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lt-cat-label {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #8b9dba;
}
.lt-cat-toggle-btn {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #dbeafe;
  font-size: 11.5px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
  outline: none;
}
.lt-cat-toggle-btn:hover {
  background: #dbeafe;
  transform: translateY(-1px);
}
.lt-cat-pills-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lt-cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid #e0edff;
  font-size: 13px;
  font-weight: 700;
  color: #1e3a8a;
  text-decoration: none;
  box-shadow: 0 2px 6px rgba(13, 42, 99, 0.06);
  transition: all 0.2s ease;
}
.lt-cat-chip:hover {
  background: #2563eb;
  color: #ffffff !important;
  border-color: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.25);
}
.lt-cat-chip-emoji {
  font-size: 15px;
}
.lt-cat-chip-text {
  white-space: nowrap;
}

.lt-cat-expanded-panel {
  margin-top: 10px;
  background: #ffffff;
  border: 1px solid #e2ecfb;
  border-radius: 20px;
  padding: 12px;
  box-shadow: 0 6px 20px rgba(13, 42, 99, 0.07);
  animation: lt_fadeUp 0.3s ease-out;
}
.lt-cat-grid-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.lt-cat-grid-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  text-decoration: none;
  color: #0f172a;
  transition: all 0.2s ease;
}
.lt-cat-grid-card:hover {
  border-color: #93c5fd;
  background: #eff6ff;
  transform: translateY(-1px);
}
.lt-cat-card-icon-box {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e2ecfb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.lt-cat-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.lt-cat-card-name {
  font-size: 13px;
  font-weight: 700;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lt-cat-arrow {
  color: #cbd5e1;
  transition: transform 0.2s, color 0.2s;
  flex-shrink: 0;
}
.lt-cat-grid-card:hover .lt-cat-arrow {
  transform: translateX(3px);
  color: #2563eb;
}
.lt-cat-view-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: #2563eb;
  text-decoration: none;
  padding: 8px;
  border-radius: 10px;
  background: #eff6ff;
  transition: all 0.2s ease;
}
.lt-cat-view-all:hover {
  background: #dbeafe;
}

@media (max-width: 640px) {
  .lt-page {
    padding: 0 !important;
    background: transparent !important;
  }
  .lt-phone {
    max-width: 100% !important;
    width: 100% !important;
  }
  .lt-hero {
    border-radius: 0 !important;
    height: auto !important;
    min-height: 180px !important;
  }
  .lt-hero-img {
    object-fit: contain !important;
  }
  .lt-scroll-hint {
    bottom: 40px !important;
  }
  .lt-card {
    border-radius: 28px 28px 0 0 !important;
    margin-top: -20px !important;
  }
  .lt-drawer-content {
    max-width: 100% !important;
    border-radius: 0 !important;
  }
}

@media (max-width: 360px) {
  .lt-hero { height: 278px; }
  .lt-thumb { width: 64px; height: 64px; }
  .lt-meta { flex-direction: column; gap: 14px; }
  .lt-soc-label { display: none; }
  .lt-soc { max-width: 46px; }
}

/* ── Cortina Drawer Chat IA / WhatsApp ────────────────────── */
.lt-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 31, 61, 0.45);
  backdrop-filter: blur(4px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.lt-drawer-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.lt-drawer-content {
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  max-height: 100vh;
  background: #ffffff;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.lt-drawer-content.open {
  transform: translateY(0);
}

.lt-drawer-header {
  padding: 12px 18px;
  border-bottom: 1px solid #e2ecfb;
  background: #f8fafc;
}

.lt-drawer-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lt-drawer-float-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 99999;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s, background 0.2s;
}
.lt-drawer-float-close:hover {
  transform: scale(1.1);
  background: rgba(15, 23, 42, 0.85);
}

.lt-drawer-iframe-wrap {
  flex: 1;
  width: 100%;
  height: 100%;
  background: #fff;
}

.lt-drawer-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
`;
