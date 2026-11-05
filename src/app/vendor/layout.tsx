'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { VendorContext, VendorInfo } from '@/hooks/useVendor';
import { LogOut, Menu, X, ChevronDown } from 'lucide-react';
import gsap from 'gsap';

/* ─────────────────────────── custom SVG icons ─────────────────────────── */
const Ico = {
  Pedidos:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  Productos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 2 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>,
  Configuracion: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.46 15a1.7 1.7 0 0 0-1.56-1.03H6v-2.4h.9A1.7 1.7 0 0 0 8.46 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-1.7.06.06A1.7 1.7 0 0 0 11.7 6.1V5h2.4v.9a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 18.4 10a1.7 1.7 0 0 0 1.56 1.03h.9v2.4h-.9A1.7 1.7 0 0 0 19.4 15z"/></svg>,
  Agencias: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>,
};

/* ─────────────────────────── nav structure ─────────────────────────── */
interface NavItem { href: string; label: string; icon: React.ReactNode; }

const NAV_ITEMS: NavItem[] = [
  { href: '/vendor/products', label: 'Productos', icon: Ico.Productos },
  { href: '/vendor/orders',   label: 'Pedidos',   icon: Ico.Pedidos },
  { href: '/vendor/settings', label: 'Mi tienda',  icon: Ico.Configuracion },
  { href: '/vendor/agencies', label: 'Agencias',  icon: Ico.Agencias },
];

/* ═══════════════════════════════ LAYOUT ═══════════════════════════════ */
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuClosing, setUserMenuClosing] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === '/vendor/login';
  const isDarkShell = !isLoginRoute;
  const isOrdersSection = pathname === '/vendor/orders' || pathname.startsWith('/vendor/orders/');

  const contentRef = useRef<HTMLDivElement>(null);
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(pathname);

  /* ── Auth: fetch vendor session ── */
  useEffect(() => {
    if (isLoginRoute) { setIsLoading(false); return; }
    fetch('/api/vendor/me')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setVendor(data))
      .catch(() => router.replace('/vendor/login'))
      .finally(() => setIsLoading(false));
  }, [isLoginRoute, router]);

  /* ── GSAP page transition on route change ── */
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

  /* ── Close user menu on outside click ── */
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.vendor-user-menu-wrap')) {
        closeUserMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const closeUserMenu = () => {
    if (!userMenuOpen) return;
    setUserMenuClosing(true);
    setTimeout(() => { setUserMenuOpen(false); setUserMenuClosing(false); }, 240);
  };

  const handleLogout = async () => {
    await fetch('/api/vendor/logout', { method: 'POST' }).catch(() => {});
    router.replace('/vendor/login');
  };

  if (isLoginRoute) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!vendor) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  /* ── render a single nav item ── */
  const renderItem = (item: NavItem, index: number) => {
    const active = isActive(item.href);
    const delay = `${(index * 0.065).toFixed(3)}s`;
    const anim = `sf-curtain-drop 0.55s cubic-bezier(0.16,1,0.3,1) ${delay} both`;
    return (
      <Link key={item.href} href={item.href} prefetch={false}
        onClick={() => setSidebarOpen(false)}
        className="sf-nav-item"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', borderRadius: 8, textDecoration: 'none',
          background: active ? (isDarkShell ? 'rgba(255,255,255,0.1)' : `${vendor.brandColor || '#7c3aed'}14`) : 'transparent',
          color: active ? (isDarkShell ? '#f4a8d8' : (vendor.brandColor || '#7c3aed')) : (isDarkShell ? '#b8b8b8' : '#566273'),
          fontSize: 14, fontWeight: active ? 600 : 400,
          transition: 'all .15s',
          animation: anim,
        }}>
        <span style={{ width: 20, height: 20, flexShrink: 0 }}>{item.icon}</span>
        <span style={{ flex: 1 }}>{item.label}</span>
      </Link>
    );
  };

  /* ── sidebar JSX ── */
  const sidebarJsx = (
    <aside className={`admin-sidebar fixed inset-y-0 left-0 top-[64px] z-30 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} lg:!static lg:!transform-none`} style={{
      width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: isDarkShell ? '#1a1a1a' : '#fff',
      borderRight: isDarkShell ? 'none' : '1px solid #e8edf3',
      boxShadow: isDarkShell ? 'inset -1px 0 0 rgba(255,255,255,0.04)' : '8px 0 28px rgba(31,45,61,0.025)',
      transition: 'transform .3s', overflow: 'hidden',
    }}>
      <style>{`
        .sf-nav-item:hover { background: ${isDarkShell ? 'rgba(255,255,255,0.08)' : '#f5f7fa'} !important; color: ${isDarkShell ? '#fff' : '#243247'} !important; }
        .sf-sidebar-scroll::-webkit-scrollbar { display: none; }
        .sf-sidebar-scroll { scrollbar-width: none; }
        @keyframes sf-curtain-drop {
          0%   { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateY(-8px); }
          40%  { opacity: 1; }
          100% { opacity: 1; clip-path: inset(0 0 0% 0); transform: translateY(0); }
        }
      `}</style>

      {/* Botón Ver mi página */}
      <div style={{ padding: '12px 8px 8px' }}>
        <a
          href={`/productos?vendorId=${encodeURIComponent(vendor.vendorId)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 8,
            background: vendor.brandColor || '#6d5ce8',
            color: isDarkShell ? '#171317' : '#fff', fontSize: 14, fontWeight: 600,
            textDecoration: 'none', transition: 'all .2s',
            boxShadow: `0 5px 14px ${vendor.brandColor || '#6d5ce8'}30`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Ver mi página
        </a>
      </div>

      {/* Nav */}
      <nav className="sf-sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV_ITEMS.map((item, i) => renderItem(item, i))}
        </div>
      </nav>
    </aside>
  );

  /* CSS global */
  const topbarShineCss = `
    @keyframes gs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .admin-topbar { height: 64px; }
    .admin-body-wrap { height: calc(100dvh - 64px); min-height: 0; }
    .admin-content-wrap { min-height: 0; overflow: hidden; }
    .admin-main-scroll { min-height: 0 !important; height: 100% !important; overflow-y: auto !important; overflow-x: hidden !important; -webkit-overflow-scrolling: touch; }
    .vendor-orders-theme .admin-content-wrap { background: #fff !important; }
    .vendor-orders-theme .admin-main-content { background: #fff !important; padding: 24px clamp(16px, 2.5vw, 36px) 40px !important; }
    @media (min-width: 1024px) {
      .vendor-orders-theme .admin-content-wrap { border: 3px solid #000 !important; border-radius: 24px !important; height: 100% !important; display: flex !important; flex-direction: column !important; }
      .vendor-orders-theme .admin-main-content { padding: 24px 24px 40px !important; border-radius: 24px !important; }
    }
    @media (max-width: 1023px) {
      .vendor-orders-theme .admin-main-content { padding: 16px 12px 28px !important; }
    }
    body.vendor-order-detail-open .admin-body-wrap { min-height: 0 !important; }
    body.vendor-order-detail-open .admin-content-wrap { min-height: 0 !important; }
    body.vendor-order-detail-open .admin-main-scroll { min-height: 0 !important; height: 100% !important; overflow-y: auto !important; overflow-x: hidden !important; }
    @media (max-width: 1023px) {
      .admin-topbar { height: 60px !important; padding: 0 8px !important; gap: 6px !important; }
      .admin-sidebar { box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important; top: 60px !important; }
      .admin-body-wrap { height: calc(100% - 60px) !important; min-height: 0 !important; }
      body.vendor-order-detail-open .admin-topbar { display: none !important; }
      body.vendor-order-detail-open .admin-body-wrap { height: 100% !important; min-height: 0 !important; }
      body.vendor-order-detail-open .admin-content-wrap { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
      body.vendor-order-detail-open .admin-main-scroll { height: 100% !important; min-height: 0 !important; overflow-y: auto !important; overflow-x: hidden !important; -webkit-overflow-scrolling: touch !important; }
    }
    @media print {
      .admin-topbar, .admin-sidebar { display: none !important; }
      .admin-body-wrap { overflow: visible !important; height: auto !important; display: block !important; }
      .admin-content-wrap { border: none !important; border-radius: 0 !important; background: #fff !important; overflow: visible !important; position: static !important; }
      .admin-main-scroll { height: auto !important; overflow: visible !important; padding: 0 !important; }
      .admin-main-content { padding: 0 !important; border-radius: 0 !important; background: #fff !important; height: auto !important; overflow: visible !important; position: static !important; }
      body, html { background: #fff !important; height: auto !important; overflow: visible !important; }
    }
    @media (max-width: 768px) {
      .admin-main-content h1 { font-size: 20px !important; }
      .admin-main-content h2 { font-size: 15px !important; }
      .admin-main-content h3 { font-size: 14px !important; }
      .admin-main-content [style*="grid-template-columns: repeat(auto-fit"] { grid-template-columns: 1fr !important; }
      .admin-main-content table { font-size: 12px !important; }
      .admin-main-content button { min-height: 36px; }
      .admin-main-content input[type="text"], .admin-main-content input[type="email"], .admin-main-content input[type="number"], .admin-main-content input[type="search"], .admin-main-content textarea, .admin-main-content select { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
    }
    @keyframes sf-logo-wipe { 0% { clip-path: inset(0 100% 0 0); opacity: 0; } 15% { opacity: 1; } 100% { clip-path: inset(0 0% 0 0); opacity: 1; } }
    .sf-logo-animate { animation: sf-logo-wipe 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
    @keyframes um-curtain-open  { 0%{clip-path:inset(0 0 100% 0);opacity:0;transform:translateY(-4px);}  100%{clip-path:inset(0 0 0% 0);opacity:1;transform:translateY(0);} }
    @keyframes um-curtain-close { 0%{clip-path:inset(0 0 0% 0);opacity:1;transform:translateY(0);}  100%{clip-path:inset(0 0 100% 0);opacity:0;transform:translateY(-6px);} }
    @keyframes um-item-drop  { 0%{opacity:0;transform:translateY(-5px);}  100%{opacity:1;transform:translateY(0);} }
    .um-dropdown         { animation: um-curtain-open  0.28s cubic-bezier(0.16,1,0.3,1) both; }
    .um-dropdown-closing { animation: um-curtain-close 0.24s cubic-bezier(0.4,0,0.8,0) both !important; }
    .um-item { animation: um-item-drop 0.28s cubic-bezier(0.16,1,0.3,1) both; }
    .um-item:hover { background: rgba(255,255,255,0.06) !important; }
    @media (max-width: 640px) {
      .um-dropdown { position: fixed !important; top: auto !important; bottom: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important; border-radius: 16px 16px 0 0 !important; }
    }
  `;

  return (
    <VendorContext.Provider value={vendor}>
      {/* Hide global mobile nav from the storefront */}
      <style>{`
        .global-mobile-nav, .tpl1-bottom-nav, .fusion-mobile-bottom-nav, [data-bottom-nav], nav[class*='bottom'], .bottom-nav { display: none !important; }
        body { padding-bottom: 0 !important; }
      `}</style>
      <style>{topbarShineCss}</style>
      <div className={isOrdersSection ? 'vendor-orders-theme' : undefined} style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: isDarkShell ? '#1a1a1a' : '#f5f7fa', overflow: 'hidden' }}>
        {/* ═══ Top bar ═══ */}
        <header style={{
          height: 64,
          background: isDarkShell ? '#1a1a1a' : '#fff',
          borderBottom: isDarkShell ? 'none' : '1px solid #e8edf3',
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 12, flexShrink: 0, zIndex: 40,
          position: 'relative',
        }}
        className="admin-topbar"
        >
          <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden" style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: isDarkShell ? '#fff' : '#475569' }}>
            {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>

          <div className="flex items-center gap-3 min-w-0">
            {vendor.logoUrl ? (
              <img src={vendor.logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover border border-gray-100" />
            ) : (
              <span style={{ width: 36, height: 36, borderRadius: 12, background: vendor.brandColor || '#6d5ce8', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>
                {(vendor.name || 'T').trim().slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className={`m-0 text-sm font-bold truncate ${isDarkShell ? 'text-white' : 'text-slate-800'}`}>{vendor.name || 'Mi tienda'}</p>
              <p className={`m-0 text-[11px] ${isDarkShell ? 'text-gray-400' : 'text-slate-500'}`}>Panel de tienda aliada</p>
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* User menu */}
          <div className="vendor-user-menu-wrap" style={{ position: 'relative' }}>
            <button onClick={() => userMenuOpen ? closeUserMenu() : setUserMenuOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px 4px 4px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: userMenuOpen ? (isDarkShell ? '#292929' : '#f3f5f8') : 'transparent',
              transition: 'background .15s',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: vendor.brandColor || '#6d5ce8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 10, flexShrink: 0,
                boxShadow: `0 0 0 2px ${vendor.brandColor || '#6d5ce8'}25`,
              }}>
                {vendor.name?.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() || 'VE'}
              </div>
              <span className="hidden sm:inline" style={{ color: isDarkShell ? '#f3f4f6' : '#334155', fontSize: 13, fontWeight: 600, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {vendor.name || 'Vendedor'}
              </span>
              <ChevronDown size={13} className="hidden sm:inline" style={{ color: isDarkShell ? '#b8b8b8' : '#94a3b8', transition: 'transform .2s', transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {(userMenuOpen || userMenuClosing) && (
              <div className={userMenuClosing ? 'um-dropdown um-dropdown-closing' : 'um-dropdown'} style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: 240, background: '#fff', borderRadius: 14,
                border: '1px solid #e8edf3',
                boxShadow: '0 14px 36px rgba(31,45,61,0.14)', zIndex: 200,
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div className="um-item" style={{ padding: '12px 14px', borderBottom: '1px solid #edf0f4' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: vendor.brandColor || '#6d5ce8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
                      {vendor.name?.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() || 'VE'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, color: '#1e293b', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.name || 'Vendedor'}</p>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.email || ''}</p>
                    </div>
                  </div>
                </div>
                {/* Options */}
                <Link href="/vendor/products" onClick={() => closeUserMenu()} className="um-item" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  color: '#475569', fontSize: 13, textDecoration: 'none',
                  transition: 'background .1s',
                }}>
                  <span style={{ fontSize: 15 }}>📦</span>Mis productos
                </Link>
                <Link href="/vendor/orders" onClick={() => closeUserMenu()} className="um-item" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  color: '#475569', fontSize: 13, textDecoration: 'none',
                  transition: 'background .1s',
                }}>
                  <span style={{ fontSize: 15 }}>{'>'}</span>Mis pedidos
                </Link>
                <a href={`/productos?vendorId=${encodeURIComponent(vendor.vendorId)}`} target="_blank" rel="noopener noreferrer" onClick={() => closeUserMenu()} className="um-item" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  color: '#475569', fontSize: 13, textDecoration: 'none',
                  transition: 'background .1s',
                }}>
                  <span style={{ fontSize: 15 }}>🛍</span>Ver tienda
                </a>
                <div style={{ borderTop: '1px solid #edf0f4', margin: '2px 0' }} />
                <button onClick={() => { closeUserMenu(); setTimeout(() => handleLogout(), 280); }} className="um-item" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#f87171', fontSize: 13, transition: 'background .1s',
                }}>
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ═══ Body: sidebar + content ═══ */}
        <div className="admin-body-wrap" ref={bodyWrapRef} style={{ display: 'flex', height: 'calc(100dvh - 64px)', overflow: 'hidden', minHeight: 0, background: isDarkShell ? '#1a1a1a' : '#f5f7fa' }}>
          {sidebarOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }} className="lg:hidden" onClick={() => setSidebarOpen(false)} />}
          {sidebarJsx}
          {/* Main content area */}
          <div className="admin-content-wrap" ref={contentWrapRef} style={{
            flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, height: '100%', background: isOrdersSection ? '#fff' : '#f5f7fa',
            display: 'flex', flexDirection: 'column',
          }}>
            <main ref={contentRef} className="admin-main-content admin-main-scroll" style={{
              position: 'relative', zIndex: 1, flex: 1, height: '100%',
              overflowY: 'auto', overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              padding: '24px clamp(16px, 2.5vw, 36px) 36px', background: isOrdersSection ? '#fff' : '#f5f7fa',
              margin: 0,
            }}>
              {children}
            </main>
          </div>
        </div>
      </div>
    </VendorContext.Provider>
  );
}
