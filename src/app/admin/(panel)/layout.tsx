 'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { useAuth } from '@/hooks/useAuth';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { isAdminEmail } from '@/lib/admin-access';
import { getErpUserByEmail, getRedirectForModules } from '@/lib/erpUserService';
import { AI_ENABLED, AI_SIDEKICK_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { MODULE_ACCESS, isProductNavigationVisible } from '@/lib/module-access';
import { LogOut, Menu, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import GlobalSearch from '@/components/admin/GlobalSearch';
import AISidekick from '@/components/admin/AISidekick';
import gsap from 'gsap';

/* ─────────────────────────── custom SVG icons ─────────────────────────── */
const Ico = {
  Dashboard:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M3 17.5A3.5 3.5 0 0 0 6.5 21h0A3.5 3.5 0 0 0 10 17.5v0A3.5 3.5 0 0 0 6.5 14v0A3.5 3.5 0 0 0 3 17.5z"/></svg>,
  Pedidos:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  Analytics:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Cupones:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z"/><path d="M6 9.01V9"/><path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19"/></svg>,
  Ofertas:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Productos:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>,
  Inventario:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><path d="M9 20v-5h6v5"/></svg>,
  Categorias:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>,
  Subcategorias: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="5" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="13" width="4" height="4" rx="1"/><rect x="17" y="11" width="4" height="4" rx="1"/><rect x="11" y="19" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/></svg>,
  Segmentos:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>,
  EnVivo:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/></svg>,
  HeroCarousel:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 9 21 9"/><path d="m9 21 3-3 3 3"/></svg>,
  OfertasDia:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Collage:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="18" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>,
  SalaInterac: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2"/><path d="M7 19v-8"/><path d="M11 19v-8"/><path d="M15 19v-8"/></svg>,
  Recomendados:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  Destacados:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>,
  LiveShop:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>,
  Plantillas:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19.5" cy="10.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><circle cx="13.5" cy="17.5" r="2.5"/><path d="M16 6.5h-2.5a3 3 0 0 0-3 3v.5"/><path d="M9 12.5h8.5a3 3 0 0 1 3 3v.5"/></svg>,
  Usuarios:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Mayoristas:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Soporte:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3Z"/></svg>,
  Bot:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4V2.5"/><circle cx="12" cy="2.5" r=".5" fill="currentColor"/><rect x="4" y="7" width="16" height="14" rx="4"/><path d="M4 12H2.5M21.5 12H20"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><path d="M9 16h6"/></svg>,
  WhatsApp:    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25D366" d="M12.02 2a9.94 9.94 0 0 0-8.55 15.01L2.4 21.6l4.7-1.23A9.94 9.94 0 1 0 12.02 2Zm0 18.1a8.12 8.12 0 0 1-4.14-1.13l-.3-.18-2.79.73.74-2.72-.2-.31a8.14 8.14 0 1 1 6.69 3.61Z"/><path fill="#25D366" d="M8.4 7.17c-.22-.5-.46-.51-.68-.52h-.58c-.2 0-.53.08-.81.38-.28.3-1.06 1.04-1.06 2.54s1.08 2.95 1.23 3.15c.15.2 2.08 3.33 5.14 4.53 2.54 1 3.06.8 3.61.75.55-.05 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.58-.35l-2.04-1c-.27-.13-.47-.2-.67.1-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.28-.47-2.44-1.49-.9-.79-1.5-1.77-1.68-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53L8.4 7.17Z"/></svg>,
  Config:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Pagos:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  Agencias:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="1"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>,
  Clips:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><path d="M11 14l2-1.5v3z" fill="currentColor" stroke="none"/></svg>,
  Sorteos:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  OctagonX:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>,
  Sparkles:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>,
  Catalogo:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 8h16"/><path d="M8 4v16"/><path d="M4 12h4"/><path d="M4 16h4"/></svg>,
  Server:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  MiTienda:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  CatalogoWeb: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
};

/* Shopify-dark sidebar — no accent colors needed */

/* ─────────────────────────── nav structure ─────────────────────────── */
interface NavItem { href: string; label: string; icon: React.ReactNode; badge?: 'orders'; children?: NavItem[]; }
interface NavGroup { label: string; items: NavItem[]; defaultOpen?: boolean; }

const NAV_GROUPS: NavGroup[] = [
  ...(AI_ENABLED || WHATSAPP_BOT_ENABLED ? [{ label: 'Automatizaciones', defaultOpen: true, items: [
    ...(AI_ENABLED ? [{ href: '/admin/ia', label: 'IA', icon: Ico.Sparkles, children: [
      { href: '/admin/ia',          label: 'Centro de control', icon: Ico.Sparkles },
    ]}] : []),
    ...(WHATSAPP_BOT_ENABLED ? [{ href: MODULE_ACCESS.whatsappManagement ? '/admin/ia/whatsapp' : '/admin/ia/cotizacion', label: 'BOT', icon: Ico.Bot, children: [
      { href: '/admin/ia/cotizacion', label: 'Cotización', icon: Ico.Plantillas },
    ]}] : []),
    ...(MODULE_ACCESS.whatsappManagement && (AI_ENABLED || WHATSAPP_BOT_ENABLED) ? [{ href: '/admin/ia/whatsapp', label: 'WhatsApp', icon: Ico.WhatsApp }] : []),
  ]}] : []),
  { label: 'SERVER', defaultOpen: true, items: [
    { href: '/admin/ia/firebase', label: 'Backend', icon: Ico.Server },
  ]},
  { label: 'WEB', defaultOpen: true, items: [
    { href: '/admin/dashboard', label: 'Dashboard', icon: Ico.Dashboard },
    { href: '', label: 'Productos', icon: Ico.Productos, children: [
      { href: '/admin/products-web',              label: 'Productos Web',             icon: Ico.CatalogoWeb },
      { href: '/admin/store-catalog',              label: '1. Seleccionar de Tienda', icon: Ico.Inventario },
      { href: '/admin/store-catalog/revision-web', label: '2. Revisión Web',           icon: Ico.Categorias },
      { href: '/admin/products',                   label: '3. Productos Publicados',   icon: Ico.Productos },
      { href: '/admin/combos',                     label: 'Packs',                     icon: Ico.Productos },
      { href: '/admin/categories',                 label: 'Categorías',                icon: Ico.Categorias },
      { href: '/admin/subcategories',              label: 'Subcategorías',             icon: Ico.Subcategorias },
    ]},
    { href: '', label: 'Pedidos', icon: Ico.Pedidos, badge: 'orders', children: [
      { href: '/admin/orders',            label: 'Todos los Pedidos', icon: Ico.Pedidos, badge: 'orders' },
      ...(AI_ENABLED ? [{ href: '/admin/orders/negotiation', label: 'Negociación', icon: Ico.Pedidos }] : []),
    ]},
    { href: '/admin/users',     label: 'Clientes',   icon: Ico.Usuarios },
  ]},
  { label: 'General', defaultOpen: false, items: [
    { href: '/admin/analytics', label: 'Analytics',    icon: Ico.Analytics },
    { href: '/admin/vendors', label: 'Tiendas Aliadas', icon: Ico.Mayoristas },
    { href: '', label: 'Marketing', icon: Ico.OfertasDia, children: [
      { href: '/admin/marketing/home', label: 'Imágenes del inicio', icon: Ico.Plantillas },
      { href: '/admin/coupons',       label: 'Cupones',        icon: Ico.Cupones },
      { href: '/admin/points-store',  label: 'Tienda de puntos', icon: Ico.Sorteos },
    ]},
    { href: '/admin/engagement/plantillas', label: 'Plantillas',       icon: Ico.Plantillas },
    { href: '', label: 'Mi Tienda', icon: Ico.MiTienda, children: [
      { href: '/admin/settings',       label: 'Servidor',         icon: Ico.Server },
      { href: '/admin/store-settings', label: 'Información',      icon: Ico.Productos },
      { href: '/admin/pagos',          label: 'Pagos',            icon: Ico.Pagos },
      { href: '/admin/agencias',       label: 'Agencias de envío', icon: Ico.Agencias },
      { href: '/admin/support',        label: 'Soporte',          icon: Ico.Soporte },
    ]},
  ]},
];


/* ═══════════════════ IA Top Bar Button ═══════════════════ */
const IA_PHRASES = [
  '¿Necesitas ayuda?',
  'Habla con Importadora Carlitos',
  'Crear y editar productos',
  'Consultar pedidos',
  'Niveles de inventario',
  'Buscar clientes VIP',
  'Analizar ventas',
  'Crear descuentos',
  'Configurar envíos',
  'Generar imágenes con IA',
  'Estrategias de marketing',
  'Automatizaciones',
];

function IATopBarButton({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  const [phrase, setPhrase] = useState('');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = IA_PHRASES[phraseIdx % IA_PHRASES.length];
    if (!deleting) {
      if (charIdx < word.length) {
        const t = setTimeout(() => setCharIdx(c => c + 1), 40 + Math.random() * 30);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setDeleting(true), 2200);
        return () => clearTimeout(t);
      }
    } else {
      if (charIdx > 0) {
        const t = setTimeout(() => setCharIdx(c => c - 1), 20);
        return () => clearTimeout(t);
      } else {
        setDeleting(false);
        setPhraseIdx(p => (p + 1) % IA_PHRASES.length);
      }
    }
  }, [charIdx, deleting, phraseIdx]);

  useEffect(() => {
    const word = IA_PHRASES[phraseIdx % IA_PHRASES.length];
    setPhrase(word.slice(0, charIdx));
  }, [charIdx, phraseIdx]);

  return (
    <>
      <style>{`
        @keyframes ia-gradient { 0%{background-position:0% 50%;} 50%{background-position:100% 50%;} 100%{background-position:0% 50%;} }
        @keyframes ia-glow { 0%,100%{filter:drop-shadow(0 0 5px rgba(139,92,246,0.5));} 50%{filter:drop-shadow(0 0 12px rgba(99,102,241,0.9)) drop-shadow(0 0 22px rgba(139,92,246,0.5));} }
        .ia-text { background:linear-gradient(270deg,#818cf8,#a78bfa,#6366f1,#c4b5fd,#818cf8); background-size:400% 400%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:ia-gradient 2.5s ease infinite, ia-glow 2s ease-in-out infinite; font-weight:900; font-size:26px; letter-spacing:-1px; line-height:1; }
        .ia-cursor { display:inline-block; width:1.5px; height:11px; background:rgba(139,92,246,0.8); animation:ia-blink 0.6s step-end infinite; margin-left:1px; vertical-align:middle; border-radius:1px; }
        @keyframes ia-blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
      `}</style>
      <button onClick={onClick} title="Asistente IA" className="ia-topbar-btn" style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 4px 10px',
        borderRadius: 10, border: '1px solid rgba(139,92,246,0.20)', cursor: 'pointer',
        background: isOpen ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.06)',
        transition: 'all .2s', height: 38, flexShrink: 0,
      }}>
        <style>{`
          @media (max-width: 1023px) {
            .ia-topbar-btn { gap: 6px !important; padding: 4px 10px !important; }
            .ia-text { font-size: 20px !important; }
          }
        `}</style>
        {/* Typing phrase — visible on all screens */}
        <span className="ia-phrase-wrap" style={{
          width: 148, display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap',
          color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500,
          textAlign: 'right',
        }}>
          {phrase}<span className="ia-cursor" />
        </span>
        {/* Separator — hidden on mobile */}
        <span className="hidden lg:block ia-sep" style={{ width: 1, height: 18, background: 'rgba(139,92,246,0.25)', flexShrink: 0 }} />
        {/* IA text — grande y separado */}
        <span className="ia-text">IA</span>
      </button>
    </>
  );
}

/* ═══════════════════════════════ LAYOUT ═══════════════════════════════ */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const { unlimitedStock, settings: storeSettings } = useStoreSettings();
  const router   = useRouter();
  const pathname = usePathname();
  const isFullScreenIAWhatsApp = pathname === '/admin/ia/whatsapp';

  const filteredNavGroups = NAV_GROUPS.map(group => {
    if (group.label === 'WEB' && storeSettings?.inventoryMode !== 'erp_integrated') {
      return {
        ...group,
        items: group.items.map(item => item.label === 'Productos' && item.children
          ? { ...item, children: item.children.filter(child => isProductNavigationVisible(child.href, storeSettings?.inventoryMode)) }
          : item),
      };
    }
    if (group.label === 'General') {
      const items = group.items.map(item => {
        if (item.label === 'Productos' && item.children) {
          const children = item.children.map(subGroup => {
            if (subGroup.label === 'TIENDA') {
              return subGroup;
            }
            if (subGroup.label === 'INVENTARIO') {
              return unlimitedStock ? null : subGroup;
            }
            if (subGroup.href === '/admin/combos' && !isAdminEmail(user?.email)) {
              return null;
            }
            if (subGroup.label === 'CATÁLOGO') {
              return unlimitedStock ? null : subGroup;
            }
            return subGroup;
          }).filter(Boolean) as NavItem[];
          return { ...item, children };
        }
        return item;
      });
      return { ...group, items };
    }
    if (group.label === 'Configuración') {
      const items = group.items.filter(item => {
        if (unlimitedStock && item.label === 'BODEGAPP') return false;
        return true;
      });
      return { ...group, items };
    }
    return group;
  });

  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [userMenuOpen,    setUserMenuOpen]    = useState(false);
  const [userMenuClosing, setUserMenuClosing] = useState(false);
  const [sidekickOpen,    setSidekickOpen]    = useState(false);
  const userMenuRef      = useRef<HTMLDivElement>(null);
  const userMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingOrders,    setPendingOrders]    = useState(0);
  const [processingOrders, setProcessingOrders] = useState(0);
  const [logoError, setLogoError] = useState(false);



  const closeUserMenu = () => {
    setUserMenuClosing(true);
    if (userMenuTimerRef.current) clearTimeout(userMenuTimerRef.current);
    userMenuTimerRef.current = setTimeout(() => {
      setUserMenuOpen(false);
      setUserMenuClosing(false);
    }, 280);
  };

  // Multiple groups can be open at once - all start expanded
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        if (userMenuOpen) closeUserMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  // Si una revalidación coalescida quedó pendiente al cerrar la pestaña,
  // dispararla ahora para que la tienda no quede desactualizada.
  useEffect(() => {
    import('@/lib/cache').then(m => m.flushPendingRevalidate()).catch(() => {});
  }, []);

  const [openGroups,  setOpenGroups]  = useState<string[]>(NAV_GROUPS.filter(g => g.defaultOpen).map(g => g.label));
  const [openItems,   setOpenItems]   = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  const toggleItem = (label: string) => {
    const findSiblings = (lbl: string): string[] => {
      for (const group of NAV_GROUPS) {
        const topLevelLabels = group.items.map(i => i.label);
        if (topLevelLabels.includes(lbl)) return topLevelLabels;
        for (const item of group.items) {
          if (item.children) {
            const childLabels = item.children.map(i => i.label);
            if (childLabels.includes(lbl)) return childLabels;
            for (const child of item.children) {
              if (child.children) {
                const grandchildLabels = child.children.map(i => i.label);
                if (grandchildLabels.includes(lbl)) return grandchildLabels;
              }
            }
          }
        }
      }
      return [];
    };

    const siblings = findSiblings(label);
    setOpenItems(prev => {
      const next = { ...prev };
      siblings.forEach(sibling => {
        if (sibling !== label) {
          next[sibling] = false;
        }
      });
      next[label] = !(prev[label] ?? false);
      return next;
    });
  };

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/badges');
      if (res.ok) {
        const data = await res.json();
        setPendingOrders(data.pendingOrders);
        setProcessingOrders(data.processingOrders || 0);
      }
    } catch { /* silent */ }
  }, []);

  const [webAccess, setWebAccess] = useState<boolean | null>(null)
  const [userModules, setUserModules] = useState<string[]>([])
  const [userPhotoUrl, setUserPhotoUrl] = useState('')

  useEffect(() => {
    console.log('[admin-panel] useEffect fired. isLoading:', isLoading, 'isLoggedIn:', isLoggedIn, 'email:', user?.email)
    if (isLoading) return;
    if (!isLoggedIn) {
      console.log('[admin-panel] not logged in, redirecting to login')
      router.replace('/login?redirect=%2Fadmin');
      return;
    }
    // Admin supremo siempre tiene acceso
    if (isAdminEmail(user?.email)) {
      setWebAccess(true)
      setUserModules(['admin_supreme', 'web', 'pos', 'pos_admin', 'erp', 'erp_admin'])
      fetchBadges();
      return;
    }
    // Verificar módulo web en erp_users (usando caché local de 30m para evitar lecturas en cada navegación)
    ;(async () => {
      const info = await getErpUserByEmail(user?.email || '', false)
      console.log('[admin-panel] erpUser for', user?.email, ':', info)
      setUserModules(info?.modules || [])
      setUserPhotoUrl(info?.photoURL || '')
      if (info?.modules?.includes('web')) {
        console.log('[admin-panel] ✅ web access granted')
        setWebAccess(true)
        fetchBadges();
      } else {
        console.log('[admin-panel] ❌ no web access, redirecting')
        setWebAccess(false)
        // Redirigir al módulo correcto del usuario en vez de al login
        const dest = getRedirectForModules(info?.modules || [], false)
        router.replace(dest)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isLoggedIn, user?.email, fetchBadges, logout]);

  /* ── Fix overflow for multi-page printing ── */
  useEffect(() => {
    const mainEl = contentRef.current;
    const bodyWrap = bodyWrapRef.current;
    const contentWrap = contentWrapRef.current;

    // Save original styles
    const originalStyles = {
      main: mainEl ? { height: mainEl.style.height, overflow: mainEl.style.overflow, maxHeight: mainEl.style.maxHeight } : null,
      bodyWrap: bodyWrap ? { overflow: bodyWrap.style.overflow, height: bodyWrap.style.height } : null,
      contentWrap: contentWrap ? { overflow: contentWrap.style.overflow, height: contentWrap.style.height } : null,
      html: { height: document.documentElement.style.height, overflow: document.documentElement.style.overflow }
    };

    const beforePrint = () => {
      if (mainEl) { mainEl.style.height = 'auto'; mainEl.style.overflow = 'visible'; mainEl.style.maxHeight = 'none'; }
      if (bodyWrap) { bodyWrap.style.overflow = 'visible'; bodyWrap.style.height = 'auto'; }
      if (contentWrap) { contentWrap.style.overflow = 'visible'; contentWrap.style.height = 'auto'; }
      document.documentElement.style.height = 'auto';
      document.documentElement.style.overflow = 'visible';
    };
    const afterPrint = () => {
      // Restore original styles
      if (mainEl && originalStyles.main) { 
        mainEl.style.height = originalStyles.main.height; 
        mainEl.style.overflow = originalStyles.main.overflow; 
        mainEl.style.maxHeight = originalStyles.main.maxHeight; 
      }
      if (bodyWrap && originalStyles.bodyWrap) { 
        bodyWrap.style.overflow = originalStyles.bodyWrap.overflow; 
        bodyWrap.style.height = originalStyles.bodyWrap.height; 
      }
      if (contentWrap && originalStyles.contentWrap) { 
        contentWrap.style.overflow = originalStyles.contentWrap.overflow; 
        contentWrap.style.height = originalStyles.contentWrap.height; 
      }
      document.documentElement.style.height = originalStyles.html.height;
      document.documentElement.style.overflow = originalStyles.html.overflow;
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  /* ── GSAP page transition on route change ── */
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current === pathname || !contentRef.current) {
      prevPathRef.current = pathname;
      return;
    }
    prevPathRef.current = pathname;
    const el = contentRef.current;
    gsap.fromTo(el,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', clearProps: 'transform,opacity' }
    );
  }, [pathname]);

  if (isLoading || webAccess === null) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isLoggedIn || webAccess === false) return null;

  const handleLogout = async () => { await logout(); router.replace('/admin/login'); };

  const renderBadges = (item: NavItem) => {
    const badges: React.ReactNode[] = [];

    const pushBadge = (count: number, bgColor: string, textColor: string = '#fff') => {
      if (count <= 0) return;
      badges.push(
        <span key={`${bgColor}-${count}`} className="sf-badge" style={{
          background: bgColor, color: textColor, fontSize: 10, fontWeight: 700,
          padding: '1px 6px', borderRadius: 20, minWidth: 18, textAlign: 'center',
          display: 'inline-block', marginLeft: 4, animation: 'sf-badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)'
        }}>
          {count > 99 ? '99+' : count}
        </span>
      );
    };

    if (item.badge === 'orders') {
      pushBadge(processingOrders, '#4ade80', '#1a1a1a'); // Verde Claro (Procesando)
      pushBadge(pendingOrders, '#fed7aa', '#1a1a1a'); // Naranja pastel (Pendiente)
    }

    if (badges.length === 0) return null;
    return <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{badges}</div>;
  };

  const isActive = (href: string) => href && (pathname === href || (href.length > 10 && pathname.startsWith(href)));
  const anyChildActive = (ch: NavItem[]) => ch.some(c => isActive(c.href));

  /* ── render a single nav item with stagger animation ── */
  const renderItem = (item: NavItem, ctr: { i: number }, depth = 0) => {
    const active  = isActive(item.href);
    const expanded = openItems[item.label] ?? false;
    const childActive = item.children ? anyChildActive(item.children) : false;
    const delay = `${(ctr.i++ * 0.065).toFixed(3)}s`;
    const anim  = `sf-curtain-drop 0.55s cubic-bezier(0.16,1,0.3,1) ${delay} both`;

    if (item.children) {
      return (
        <div key={item.label}>
          <button onClick={() => toggleItem(item.label)}
            className="sf-nav-item"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: depth > 0 ? '6px 10px' : '7px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
              background: childActive || expanded ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: childActive ? '#fff' : 'rgba(255,255,255,0.7)',
              fontSize: depth > 0 ? 13 : 14, fontWeight: 500, transition: 'all .15s',
              animation: anim,
            }}>
            {depth === 0 && <span style={{ width: 20, height: 20, flexShrink: 0 }}>{item.icon}</span>}
            {depth > 0 && <span style={{ width: 4, height: 4, borderRadius: '50%', background: childActive ? '#fff' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />}
            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
            {renderBadges(item)}
            <ChevronRight size={16} style={{ opacity: 0.9, transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .25s cubic-bezier(0.16,1,0.3,1)' }} />
          </button>
          <div className={expanded ? 'sf-children sf-children-open' : 'sf-children'}>
            <div style={{ marginLeft: 20, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
              {item.children.map(c => renderItem(c, ctr, depth + 1))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link key={`${item.href}-${item.label}`} href={item.href} prefetch={false}
        onClick={() => setSidebarOpen(false)}
        className="sf-nav-item"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: depth > 0 ? '6px 10px' : '7px 12px',
          borderRadius: 8, textDecoration: 'none',
          background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: active ? '#fff' : 'rgba(255,255,255,0.7)',
          fontSize: depth > 0 ? 13 : 14, fontWeight: active ? 600 : 400,
          transition: 'all .15s',
          animation: anim,
        }}>
        {depth === 0 && <span style={{ width: 20, height: 20, flexShrink: 0 }}>{item.icon}</span>}
        {depth > 0 && <span style={{ width: 16, height: 16, flexShrink: 0, opacity: active ? 1 : 0.6 }}>{item.icon}</span>}
        <span style={{ flex: 1 }}>{item.label}</span>
        {renderBadges(item)}
      </Link>
    );
  };

  /* ── sidebar JSX — Shopify dark style ── */
  const sidebarJsx = (
    <aside className={`sf-sidebar-shine admin-sidebar fixed inset-y-0 left-0 top-[64px] z-30 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} lg:!static lg:!transform-none`} style={{
      width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: '#1a1a1a',
      boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04), inset 1px 0 0 rgba(255,255,255,0.02)',
      transition: 'transform .3s', overflow: 'hidden',
    }}
    >
      <style>{`
        .sf-nav-item:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }
        .sf-sidebar-scroll::-webkit-scrollbar { display: none; }
        .sf-sidebar-scroll { scrollbar-width: none; }

        @keyframes sf-curtain-drop {
          0%   { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateY(-8px); }
          40%  { opacity: 1; }
          100% { opacity: 1; clip-path: inset(0 0 0% 0); transform: translateY(0); }
        }
        
        .sf-sidebar-scroll > div:nth-child(1) .sf-nav-item:nth-child(1) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both; }
        .sf-sidebar-scroll > div:nth-child(1) .sf-nav-item:nth-child(2) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both; }
        .sf-sidebar-scroll > div:nth-child(1) .sf-nav-item:nth-child(3) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.19s both; }
        .sf-sidebar-scroll > div:nth-child(1) .sf-nav-item:nth-child(4) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.26s both; }
        .sf-sidebar-scroll > div:nth-child(1) .sf-nav-item:nth-child(5) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.33s both; }
        .sf-sidebar-scroll > div:nth-child(1) .sf-nav-item:nth-child(6) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.40s both; }
        
        .sf-sidebar-scroll > div:nth-child(2) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.47s both; }
        .sf-sidebar-scroll > div:nth-child(2) button { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.47s both; }
        .sf-sidebar-scroll > div:nth-child(3) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.54s both; }
        .sf-sidebar-scroll > div:nth-child(3) button { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.54s both; }
        .sf-sidebar-scroll > div:nth-child(4) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.61s both; }
        .sf-sidebar-scroll > div:nth-child(4) button { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.61s both; }
        .sf-sidebar-scroll > div:nth-child(5) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.68s both; }
        .sf-sidebar-scroll > div:nth-child(5) button { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.68s both; }
        .sf-sidebar-scroll > div:nth-child(6) { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.75s both; }
        .sf-sidebar-scroll > div:nth-child(6) button { animation: sf-curtain-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.75s both; }

        .sf-children {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.28s ease-out;
        }
        .sf-children > div {
          overflow: hidden;
          min-height: 0;
        }
        .sf-children-open {
          grid-template-rows: 1fr;
          transition: grid-template-rows 0.32s cubic-bezier(0.16,1,0.3,1);
        }
        .sf-children-open > div > *:nth-child(1) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.06s both; }
        .sf-children-open > div > *:nth-child(2) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.10s both; }
        .sf-children-open > div > *:nth-child(3) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.14s both; }
        .sf-children-open > div > *:nth-child(4) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
        .sf-children-open > div > *:nth-child(5) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.22s both; }
        .sf-children-open > div > *:nth-child(6) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.26s both; }
        .sf-children-open > div > *:nth-child(7) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.30s both; }
        .sf-children-open > div > *:nth-child(8) { animation: sf-sub-item 0.22s cubic-bezier(0.16,1,0.3,1) 0.34s both; }
        @keyframes sf-sub-item {
          0%   { opacity: 0; transform: translateX(-4px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        @keyframes sf-badge-pop {
          0%   { transform: scale(0.6); }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .sf-badge { animation: sf-badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* Botón ERP Dashboard - arriba de Ver mi página */}
      {MODULE_ACCESS.erp && (userModules.includes('erp') || userModules.includes('erp_admin') || userModules.includes('admin_supreme')) && (
      <div style={{ padding: '12px 8px 0' }}>
        <a
          href="/erp-dashboard"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #f87171 0%, #fca5a5 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all .2s',
            boxShadow: '0 2px 8px rgba(248,113,113,0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(248,113,113,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(248,113,113,0.3)';
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Ver ERP
        </a>
      </div>
      )}

      {MODULE_ACCESS.pos && (userModules.includes('pos') || userModules.includes('pos_admin') || userModules.includes('admin_supreme')) && (
      <div style={{ padding: '12px 8px 0' }}>
        <a
          href="/pos/donbalato-central"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            marginTop: 8,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #a855f7 0%, #c084fc 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all .2s',
            boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(168,85,247,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(168,85,247,0.3)';
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Ver POS
        </a>
      </div>
      )}

      {/* Botón Ver mi página - arriba de la navegación */}
      <div style={{ padding: '8px 8px 8px' }}>
        <a
          href={process.env.NEXT_PUBLIC_SITE_URL || '/'}
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all .2s',
            boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.3)';
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Ver pagina web
        </a>
      </div>

      {/* Nav — flat Shopify style with expandable groups */}
      <nav className="sf-sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 0' }}>
        {(() => {
          const ctr = { i: 0 };
          return filteredNavGroups.map(group => {
            const isOpen = openGroups.includes(group.label);
            const isMain = group.label === 'General';

            if (isMain) {
              return (
                <div key={group.label}>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.25)', margin: '10px 12px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 0 }}>
                    {group.items.map(item => renderItem(item, ctr))}
                  </div>
                </div>
              );
            }

            const headerDelay = `${(ctr.i++ * 0.065).toFixed(3)}s`;
            return (
              <div key={group.label} style={{ marginBottom: 0 }}>
                <button onClick={() => toggleGroup(group.label)} style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  padding: '6px 12px 2px', border: 'none', cursor: 'pointer',
                  background: 'transparent', transition: 'all .15s',
                  animation: `sf-curtain-drop 0.55s cubic-bezier(0.16,1,0.3,1) ${headerDelay} both`,
                }}>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
                    {group.label}
                  </span>
                  <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.9)', transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
                </button>

                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {group.items.map(item => renderItem(item, ctr))}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </nav>

    </aside>
  );

  /* CSS global para topbar shine + logo fade */
  const topbarShineCss = `
    @keyframes gs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .admin-content-wrap::before {
      content: '';
      position: absolute;
      inset: 0;
      background: #000;
      z-index: 0;
    }
    /* ── Responsive admin layout ── */
    @media (min-width: 1024px) {
      .admin-body-wrap {
        height: calc(100vh - 64px) !important;
        height: calc(100dvh - 64px) !important;
        min-height: 0 !important;
      }
      .admin-content-wrap {
        border-radius: 24px !important;
        border: 3px solid #000000 !important;
        height: 100% !important;
        min-height: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }
      .admin-main-content { padding: 24px 24px 40px !important; border-radius: 24px; }
      .admin-sidebar { position: relative !important; top: 0 !important; }
      .admin-main-scroll {
        flex: 1 !important;
        height: 100% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
    }
    @media (max-width: 1023px) {
      .admin-topbar { height: 56px !important; padding: 0 10px !important; gap: 8px !important; }
      .admin-sidebar { box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important; top: 56px !important; }
      .admin-search-wrap { display: none !important; }
      .admin-topbar-logo { width: 130px !important; height: 42px !important; margin-right: 4px !important; }
      .admin-body-wrap {
        height: calc(100% - 56px) !important;
        min-height: 0 !important;
      }
      .admin-content-wrap {
        min-height: 0 !important;
        height: 100% !important;
      }
      .admin-main-scroll {
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
    }
    @media (max-width: 480px) {
      .admin-topbar { height: 52px !important; padding: 0 6px !important; gap: 4px !important; }
      .admin-sidebar { top: 52px !important; }
      .admin-topbar-logo { width: 110px !important; height: 36px !important; margin-right: 2px !important; }
      .admin-body-wrap { height: calc(100% - 52px) !important; }
      .ia-phrase-wrap { width: 85px !important; font-size: 11px !important; }
    }
    /* ── Print: hide admin chrome, show only content ── */
    @media print {
      .admin-topbar, .admin-sidebar, .sf-topbar-shine, .sf-sidebar-shine,
      .admin-search-wrap { display: none !important; }
      .admin-body-wrap { overflow: visible !important; height: auto !important; display: block !important; }
      .admin-content-wrap { border: none !important; border-radius: 0 !important; background: #fff !important; overflow: visible !important; position: static !important; }
      .admin-content-wrap::before { display: none !important; }
      .admin-main-scroll { height: auto !important; overflow: visible !important; padding: 0 !important; }
      .admin-main-content { padding: 0 !important; border-radius: 0 !important; background: #fff !important; height: auto !important; overflow: visible !important; position: static !important; }
      body, html { background: #fff !important; height: auto !important; overflow: visible !important; }
      body > div, body > div > div { height: auto !important; overflow: visible !important; }
    }
    /* ── Global mobile fixes for all admin pages ── */
    @media (max-width: 768px) {
      /* Headings & titles */
      .admin-main-content h1 { font-size: 20px !important; }
      .admin-main-content h2 { font-size: 15px !important; }
      .admin-main-content h3 { font-size: 14px !important; }
      /* Force any auto-fit grid > 200px to fit smaller */
      .admin-main-content [style*="grid-template-columns: repeat(auto-fit"] {
        grid-template-columns: 1fr !important;
      }
      /* Tables wrap with horizontal scroll */
      .admin-main-content table { font-size: 12px !important; }
      .admin-main-content .overflow-x-auto { -webkit-overflow-scrolling: touch; }
      /* Reduce padding on big cards only */
      .admin-main-content .db-card { padding: 14px !important; }
      /* Buttons stay clickable */
      .admin-main-content button { min-height: 36px; }
      /* Inputs full width */
      .admin-main-content input[type="text"],
      .admin-main-content input[type="email"],
      .admin-main-content input[type="number"],
      .admin-main-content input[type="search"],
      .admin-main-content textarea,
      .admin-main-content select { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
      /* Force flex containers with explicit fixed widths to wrap */
      .admin-main-content > div > div[style*="justify-content: space-between"] { flex-wrap: wrap; gap: 8px !important; }
    }
    /* ── Dashboard responsive ── */
    @media (max-width: 640px) {
      .db-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
      .db-kpi-grid > div { border-right: none !important; border-bottom: 1px solid rgb(241,245,249); padding: 10px 8px !important; }
      .db-kpi-grid > div:nth-child(even) { border-right: none !important; }
      .db-kpi-grid > div:nth-last-child(-n+2) { border-bottom: none !important; }
      .db-kpi-value { font-size: 18px !important; }
      .db-greeting { font-size: 18px !important; }
      .db-range-group { flex-wrap: wrap; }
      .db-bar-chart { gap: 2px !important; }
      .db-bar-tip { display: none !important; }
      .db-map-grid { grid-template-columns: 1fr !important; }
      .db-map-canvas { min-height: 300px !important; }
      .db-quick-actions { grid-template-columns: repeat(2, 1fr) !important; }
      .db-quick-actions a span:last-child { font-size: 11px !important; }
      .db-quick-actions a div:first-child { width: 28px !important; height: 28px !important; }
      .db-order-row span:first-child { width: 48px !important; font-size: 10px !important; }
      .db-stats-panel { padding: 16px 12px !important; }
      .db-card { padding: 14px 12px !important; }
      .admin-main-content { padding: 12px 8px 24px !important; }
    }
    @media (min-width: 641px) and (max-width: 1023px) {
      .db-kpi-grid { grid-template-columns: repeat(3, 1fr) !important; }
      .db-kpi-grid > div:nth-child(3n) { border-right: none !important; }
      .db-map-grid { grid-template-columns: 1fr 1fr !important; }
      .db-quick-actions { grid-template-columns: repeat(2, 1fr) !important; }
      .db-revenue-grid { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 640px) {
      .db-revenue-grid { grid-template-columns: 1fr !important; }
      .sk-side-panel { position: fixed !important; inset: 0 !important; width: 100% !important; z-index: 50 !important; border-left: none !important; }
      .admin-2col-grid { grid-template-columns: 1fr !important; }
    }
    @keyframes sf-shine-first {
      0%   { left: 80px; opacity: 0; transform: skewX(-20deg) scaleX(0.4); filter: blur(6px); }
      15%  { opacity: 1; filter: blur(0); }
      25%  { transform: skewX(-20deg) scaleX(1); }
      55%  { opacity: 1; filter: blur(0); }
      70%  { opacity: 0.5; filter: blur(3px); }
      82%  { opacity: 0.15; filter: blur(8px); }
      92%  { opacity: 0; filter: blur(14px); }
      100% { left: calc(100% + 120px); opacity: 0; transform: skewX(-20deg) scaleX(1); filter: blur(20px); }
    }
    @keyframes sf-shine-loop {
      0%   { left: -25%; opacity: 0; transform: skewX(-20deg); filter: blur(8px); }
      5%   { opacity: 0.5; filter: blur(4px); }
      8%   { opacity: 1; filter: blur(0); }
      60%  { opacity: 1; filter: blur(0); }
      75%  { opacity: 0.45; filter: blur(7px); }
      90%  { opacity: 0.15; filter: blur(12px); }
      100% { left: calc(100% + 100px); opacity: 0; transform: skewX(-20deg); filter: blur(16px); }
    }
    @keyframes sf-logo-wipe {
      0%   { clip-path: inset(0 100% 0 0); opacity: 0; }
      15%  { opacity: 1; }
      100% { clip-path: inset(0 0% 0 0); opacity: 1; }
    }
    .sf-logo-animate {
      animation: sf-logo-wipe 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    /* Logo sin brillo - completamente visible */

  `;

  return (
    <>
      <style>{topbarShineCss}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: isFullScreenIAWhatsApp ? '#111b21' : '#1a1a1a', overflow: 'hidden' }}>
      {isFullScreenIAWhatsApp ? (
        <>
          <div className="admin-content-wrap" ref={contentWrapRef} style={{
            flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, height: '100%', background: '#111b21',
            display: 'flex', flexDirection: 'column',
          }}>
            <main ref={contentRef} className="admin-main-content" style={{
              position: 'relative', zIndex: 1, flex: 1, height: '100%',
              overflow: 'hidden',
              padding: 0, background: '#111b21',
              margin: 0,
            }}>
              {children}
            </main>
          </div>
          {AI_SIDEKICK_ENABLED && <AISidekick open={sidekickOpen} onClose={() => setSidekickOpen(false)} />}
        </>
      ) : (
      <>
      {/* ═══ Top bar — unified with sidebar ═══ */}
      <header style={{
        height: 64,
        background: '#1a1a1a',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12, flexShrink: 0, zIndex: 40,
        boxShadow: 'none',
        position: 'relative',
      }}
      className="sf-topbar-shine admin-topbar"
      >
        {/* Botón hamburguesa - primero en mobile */}
        <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden" style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>
          {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
        </button>

        {/* Logo - después del botón hamburguesa */}
        <div className="sf-logo-animate admin-topbar-logo" style={{ width: 180, height: 56, flexShrink: 0, position: 'relative', marginRight: 8 }}>
          <Link href="/admin/dashboard" style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center' }}>
            <img
              src="/yaxsell-logo.png"
              alt="Yaxsell"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </Link>
        </div>

        {/* Centered search bar */}
        <div className="admin-search-wrap" style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
          <GlobalSearch />
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>

          {/* IA Sidekick button with typing phrases — oculto cuando IA desactivada */}
          {AI_SIDEKICK_ENABLED && (
          <IATopBarButton isOpen={sidekickOpen} onClick={() => {
            setSidekickOpen(true);
            if (pathname !== '/admin/ia') router.push('/admin/ia');
          }} />
          )}

          {/* User menu */}
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => { if (userMenuOpen) closeUserMenu(); else setUserMenuOpen(true); }} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px 4px 4px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: userMenuOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              transition: 'background .15s',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 10, flexShrink: 0,
                boxShadow: '0 0 0 2px rgba(139,92,246,0.4)',
                overflow: 'hidden',
              }}>
                {userPhotoUrl
                  ? <img src={userPhotoUrl} alt={user?.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  : (user?.email?.toLowerCase() === 'dezkonet@gmail.com' ? 'DB' : (user?.name?.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() || 'JE'))
                }
              </div>
              <span className="hidden sm:inline" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email?.toLowerCase() === 'dezkonet@gmail.com' ? 'Importadora Carlitos' : (user?.name || 'Admin')}
              </span>
              <ChevronDown size={13} className="hidden sm:inline" style={{ color: 'rgba(255,255,255,0.4)', transition: 'transform .2s', transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {(userMenuOpen || userMenuClosing) && (
              <div className={userMenuClosing ? 'um-dropdown um-dropdown-closing' : 'um-dropdown'} style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: 220, background: '#232323', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 200,
                overflow: 'hidden',
              }}>
                <style>{`
                  @keyframes um-curtain-open  { 0%{clip-path:inset(0 0 100% 0);opacity:0;transform:translateY(-4px);}  100%{clip-path:inset(0 0 0% 0);opacity:1;transform:translateY(0);} }
                  @keyframes um-curtain-close { 0%{clip-path:inset(0 0 0% 0);opacity:1;transform:translateY(0);}  100%{clip-path:inset(0 0 100% 0);opacity:0;transform:translateY(-6px);} }
                  @keyframes um-item-drop  { 0%{opacity:0;transform:translateY(-5px);}  100%{opacity:1;transform:translateY(0);} }
                  @keyframes um-item-out   { 0%{opacity:1;transform:translateY(0);}  100%{opacity:0;transform:translateY(-4px);} }
                  .um-dropdown         { animation: um-curtain-open  0.28s cubic-bezier(0.16,1,0.3,1) both; }
                  .um-dropdown-closing { animation: um-curtain-close 0.24s cubic-bezier(0.4,0,0.8,0) both !important; }
                  .um-dropdown-closing .um-item { animation: um-item-out 0.18s cubic-bezier(0.4,0,0.8,0) both !important; }
                  .um-item { animation: um-item-drop 0.28s cubic-bezier(0.16,1,0.3,1) both; }
                  .um-item:nth-child(1){animation-delay:0.04s;} .um-item:nth-child(2){animation-delay:0.08s;}
                  .um-item:nth-child(3){animation-delay:0.12s;} .um-item:nth-child(4){animation-delay:0.16s;}
                  .um-item:nth-child(5){animation-delay:0.20s;} .um-item:nth-child(6){animation-delay:0.24s;}
                  .um-item:hover { background: rgba(255,255,255,0.06) !important; }
                  @media (max-width: 640px) {
                    .um-dropdown { position: fixed !important; top: auto !important; bottom: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important; border-radius: 16px 16px 0 0 !important; }
                  }
                `}</style>
                {/* Header */}
                <div className="um-item" style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0, boxShadow: '0 0 0 2px rgba(139,92,246,0.3)', overflow: 'hidden' }}>
                      {userPhotoUrl
                        ? <img src={userPhotoUrl} alt={user?.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        : (user?.email?.toLowerCase() === 'dezkonet@gmail.com' ? 'DB' : (user?.name?.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() || 'JE'))
                      }
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email?.toLowerCase() === 'dezkonet@gmail.com' ? 'Importadora Carlitos' : (user?.name || 'Admin')}</p>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || ''}</p>
                    </div>
                  </div>
                </div>
                {/* Options */}
                {[
                  { label: 'Ir al Dashboard', icon: '🏠', href: '/admin/dashboard' },
                  { label: 'Configuración', icon: '⚙️', href: '/admin/settings' },
                  { label: 'Ver Tiendas', icon: '🛍️', href: '/admin/vendors' },
                ].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => closeUserMenu()} className="um-item" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecoration: 'none',
                    transition: 'background .1s',
                  }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
                  </Link>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '2px 0' }} />
                <button onClick={() => { closeUserMenu(); setTimeout(() => logout(), 280); }} className="um-item" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#f87171', fontSize: 13, transition: 'background .1s',
                }}>
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ═══ Body: sidebar + content ═══ */}
      <div className="admin-body-wrap" ref={bodyWrapRef} style={{ display: 'flex', height: 'calc(100dvh - 64px)', overflow: 'hidden', minHeight: 0, background: '#1a1a1a' }}>
        {sidebarOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }} className="lg:hidden" onClick={() => setSidebarOpen(false)} />}
        {sidebarJsx}
        {/* Main content area — clean, centered */}
        <div className="admin-content-wrap" ref={contentWrapRef} style={{
          flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, minWidth: 0, height: '100%', background: '#ffffff',
          display: 'flex', flexDirection: 'column',
        }}>
          <main ref={contentRef} className="admin-main-content admin-main-scroll" style={{
            position: 'relative', zIndex: 1, flex: 1, minWidth: 0, width: '100%', boxSizing: 'border-box', height: '100%',
            overflowY: 'auto', overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: '16px 12px 32px', background: '#ffffff',
            margin: 0,
          }}>
            {children}
          </main>
        </div>
        {/* IA Sidekick panel */}
        <AISidekick open={sidekickOpen} onClose={() => setSidekickOpen(false)} />
      </div>
      </>
      )}
    </div>
    </>
  );
}
