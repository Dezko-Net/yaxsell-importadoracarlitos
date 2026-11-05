'use client';

import React, { useState } from 'react';
// linktree
import Link from 'next/link';
import {
  ArrowLeft, ShoppingBag, Tag, Clock, Film,
  MessageCircle, Instagram, ChevronRight, Truck, BadgeCheck,
  Sparkles, Heart, ShieldCheck, Zap, MapPin, Globe, BookOpen,
} from 'lucide-react';
import LinktreeCategories from './LinktreeCategories';
import LinktreeAssistantSelector from './LinktreeAssistantSelector';

const LOGO = '';
const HERO_IMG = '';

const LINKS = [
  { href: 'https://www.yaxsell.cl/',              icon: Globe,  label: 'Página Web',            sub: 'yaxsell.cl',      grad: 'blue', img: 'https://cdn-icons-png.flaticon.com/512/5339/5339181.png' },
  { href: 'https://www.yaxsell.cl/productos',     icon: BookOpen, label: 'Catálogo de WhatsApp', sub: 'Ver catálogo online',         grad: 'green', img: 'https://impulsabarinas.com/catalogos/assets/catalogo-1.png' },
];

const SOCIAL = [
  { href: 'https://web.facebook.com/Ivandonyaxsellchile/?_rdc=1&_rdr#', icon: Instagram, label: 'Facebook', color: '#1877F2', img: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png' },
];

const BENEFITS = [
  { icon: Truck,       title: 'Envío a todo Chile',     sub: '2 a 3 días',                    color: '#059669', bg: 'linear-gradient(135deg, #d1fae5, #6ee7b7)' },
  { icon: ShieldCheck, title: 'Compra segura',          sub: 'Pago protegido',                color: '#7c3aed', bg: 'linear-gradient(135deg, #ede9fe, #c4b5fd)' },
  { icon: Zap,         title: 'Mejores descuentos', sub: 'Precios más bajos',          color: '#e11d48', bg: 'linear-gradient(135deg, #ffe4e6, #fda4af)' },
];

export default function LinktreeClientContent() {
  const [showChatDrawer, setShowChatDrawer] = useState(false);

  return (
    <div className="lt-page">
      <div className="lt-phone">

        {/* ── Hero con letrero ─────────────────────────────── */}
        <header className="lt-hero">
          <img className="lt-hero-img" src={HERO_IMG} alt="" aria-hidden="true" />
          <Link href="/" className="lt-back" aria-label="Volver a la tienda">
            <ArrowLeft size={18} />
          </Link>

          <div className="lt-particles">
            {[...Array(8)].map((_, i) => (
              <span key={i} className="lt-particle" style={{
                left: `${8 + i * 12}%`,
                top: `${15 + (i * 11) % 55}%`,
                animationDelay: `${i * 0.4}s`,
                animationDuration: `${3.5 + i * 0.6}s`,
              }} />
            ))}
          </div>

          <div className="lt-sign">
            <img className="lt-title-img" src={LOGO} alt="Importadora Carlitos" />
          </div>

          <div className="lt-scroll-hint">
            <span className="lt-scroll-dot" />
          </div>
        </header>

        {/* ── Tarjeta principal (Cortina) ───────────────────────── */}
        <main className="lt-card">
          <div className="lt-card-handle" />
          <div className="lt-head">
            <div className="lt-thumb-wrap">
              <img className="lt-thumb" src="" alt="Importadora Carlitos" />
              <span className="lt-thumb-ring" />
            </div>
            <div className="lt-headtxt">
              <span className="lt-badge"><BadgeCheck size={13} /> Tienda oficial</span>
              <h1 className="lt-title">Importadora Carlitos</h1>
              <a className="lt-sub lt-sub-typing" href="https://maps.app.goo.gl/Fsd3vsE51UFJqWt4A" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={13} style={{ flexShrink: 0 }} />
                Estamos en Av. Demo 123 - Santiago Centro - Santiago
              </a>
            </div>
          </div>

          {/* ── Mapa de Google Maps ─────────────────────────────── */}
          <div className="lt-map-wrap" style={{ marginTop: '12px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(13,42,99,.10)', position: 'relative' }}>
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3328.9786600811253!2d-70.6780387!3d-33.4498625!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9662c5d2428c6333%3A0xdafe9e614f5b5f8f!2sDON%20YAXSELL%20IVAN!5e0!3m2!1ses-419!2scl!4v1785651227199!5m2!1ses-419!2scl"
              width="100%"
              height="200"
              style={{ border: 0, display: 'block', pointerEvents: 'none' }}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <a href="https://maps.app.goo.gl/Fsd3vsE51UFJqWt4A" target="_blank" rel="noopener noreferrer"
              style={{ position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', textDecoration: 'none', zIndex: 1 }}>
              <span style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '6px 12px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={12} /> Ver en Maps
              </span>
            </a>
          </div>
          <div className="lt-benefits">
            {BENEFITS.map(({ icon: Icon, title, sub, color, bg }) => (
              <div key={title} className="lt-benefit" style={{ '--b-color': color } as React.CSSProperties}>
                <span className="lt-benefit-ico" style={{ background: bg, color }}><Icon size={18} /></span>
                <span className="lt-benefit-title">{title}</span>
                <span className="lt-benefit-sub">{sub}</span>
              </div>
            ))}
          </div>

          {/* ── Atención por WhatsApp con Cortina de Chat IA ── */}
          <a
            href="https://wa.me/56962293893"
            onClick={(e) => {
              e.preventDefault();
              setShowChatDrawer(true);
            }}
            className="lt-stylist"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            <div className="lt-avatar-wrap">
              <span className="lt-avatar-ripple" />
              <img className="lt-avatar" src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/500px-WhatsApp.svg.png" alt="WhatsApp" />
            </div>
            <div>
              <p className="lt-stylist-name">Atención directa por WhatsApp</p>
              <p className="lt-stylist-sub">Atención por Fernanda & Lissy</p>
            </div>
            <span className="lt-stylist-dot" />
          </a>

          <div className="lt-divider" />

          <LinktreeCategories />

          {/* ── Links ──────────────────────────────────────────── */}
          <nav className="lt-links" aria-label="Enlaces">
            <Link href="/productos" className="lt-cta">
              <div className="lt-btn-particles" aria-hidden="true">
                {/* dots */}
                {[
                  { left: '8%',  top: '60%', delay: '0s',    dur: '2.0s', dx: '-5px', cls: 'dot-sm' },
                  { left: '18%', top: '40%', delay: '0.3s',  dur: '2.4s', dx: '3px',  cls: '' },
                  { left: '28%', top: '70%', delay: '0.6s',  dur: '1.9s', dx: '-3px', cls: 'dot-sm' },
                  { left: '38%', top: '30%', delay: '0.2s',  dur: '2.6s', dx: '6px',  cls: 'star' },
                  { left: '48%', top: '55%', delay: '0.8s',  dur: '2.1s', dx: '-4px', cls: '' },
                  { left: '58%', top: '20%', delay: '0.4s',  dur: '2.8s', dx: '5px',  cls: 'star' },
                  { left: '65%', top: '65%', delay: '1.0s',  dur: '2.3s', dx: '-6px', cls: 'dot-sm' },
                  { left: '72%', top: '35%', delay: '0.15s', dur: '2.5s', dx: '4px',  cls: '' },
                  { left: '80%', top: '50%', delay: '0.7s',  dur: '2.0s', dx: '-5px', cls: 'star' },
                  { left: '88%', top: '25%', delay: '0.5s',  dur: '2.2s', dx: '3px',  cls: 'dot-sm' },
                  { left: '13%', top: '80%', delay: '1.2s',  dur: '1.8s', dx: '6px',  cls: 'star' },
                  { left: '53%', top: '75%', delay: '0.9s',  dur: '2.6s', dx: '-3px', cls: '' },
                ].map((p, i) => (
                  <span
                    key={i}
                    className={`lt-btn-particle ${p.cls}`}
                    style={{
                      left: p.left,
                      top: p.top,
                      animationDelay: p.delay,
                      animationDuration: p.dur,
                      '--dx': p.dx,
                    } as React.CSSProperties}
                  />
                ))}
              </div>
              <ShoppingBag size={19} style={{ position: 'relative', zIndex: 2 }} />
              <span style={{ position: 'relative', zIndex: 2 }}>Ver catálogo web</span>
              <Sparkles size={15} className="lt-cta-spark" style={{ position: 'relative', zIndex: 2 }} />
            </Link>

            {LINKS.map(({ href, icon: Icon, label, sub, grad, img }, i) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="lt-link"
                style={{ animationDelay: `${0.15 + i * 0.08}s` }}
              >
                <span className={img ? 'lt-link-ico' : `lt-link-ico lt-grad-${grad}`} style={img ? { background: 'transparent', borderRadius: '12px', overflow: 'hidden', padding: 0 } : undefined}>
                  {img ? (
                    <img src={img} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Icon size={18} />
                  )}
                </span>
                <span className="lt-link-txt">
                  <span className="lt-link-label">{label}</span>
                  <span className="lt-link-sub">{sub}</span>
                </span>
                <ChevronRight size={17} className="lt-link-arrow" />
              </a>
            ))}
          </nav>

          <div className="lt-social">
            <a
              href="https://www.tiktok.com/@yaxsell"
              target="_blank"
              rel="noopener noreferrer"
              className="lt-soc"
              aria-label="TikTok 1"
              style={{ '--soc-color': '#000000', position: 'relative' } as React.CSSProperties}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#0f1f3d" style={{ filter: 'drop-shadow(rgb(0, 242, 254) 1px 1px 0px) drop-shadow(rgb(255, 0, 80) -1px -1px 0px)' }}>
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.38a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.64a6.34 6.34 0 0 0 10.82 4.47 6.29 6.29 0 0 0 1.93-4.52V8.34a8.16 8.16 0 0 0 4.84 1.8V6.69z" />
              </svg>
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ff0050', color: '#fff', fontSize: '10px', fontWeight: '800', width: '17px', height: '17px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(255,0,80,0.5)' }}>1</span>
            </a>
            {SOCIAL.map(({ href, icon: Icon, label, color, img }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="lt-soc"
                aria-label={label}
                style={{ '--soc-color': color } as React.CSSProperties}
              >
                {img ? <img src={img} alt={label} style={{ width: 20, height: 20, borderRadius: '50%' }} /> : <Icon size={20} />}
              </a>
            ))}
            <a
              href="https://www.tiktok.com/@yaxsell2"
              target="_blank"
              rel="noopener noreferrer"
              className="lt-soc"
              aria-label="TikTok 2"
              style={{ '--soc-color': '#000000', position: 'relative' } as React.CSSProperties}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#0f1f3d" style={{ filter: 'drop-shadow(rgb(0, 242, 254) 1px 1px 0px) drop-shadow(rgb(255, 0, 80) -1px -1px 0px)' }}>
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.38a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.64a6.34 6.34 0 0 0 10.82 4.47 6.29 6.29 0 0 0 1.93-4.52V8.34a8.16 8.16 0 0 0 4.84 1.8V6.69z" />
              </svg>
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ff0050', color: '#fff', fontSize: '10px', fontWeight: '800', width: '17px', height: '17px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(255,0,80,0.5)' }}>2</span>
            </a>
          </div>

          <footer className="lt-foot">
            <p>© {new Date().getFullYear()} Importadora Carlitos. Todos los derechos reservados.</p>
          </footer>
        </main>
      </div>

      {/* ── Selector de Atención: ASIS vs LISSY ────────────────────── */}
      {showChatDrawer && (
        <LinktreeAssistantSelector onClose={() => setShowChatDrawer(false)} />
      )}
    </div>
  );
}
