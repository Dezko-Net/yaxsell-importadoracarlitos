'use client';

/* ══════════════════════════════════════════════════════════════════
   Navbar23  versión REUTILIZABLE del navbar del home (plantilla 23).
   Antes ese navbar solo existía inyectado dentro de plantilla23/HomePage
   (DOM manipulado sobre el HTML del tema). Aquí está como componente React
   para usarlo en product detail y demás páginas vía DynamicNavbar.
   - Mega-menú de categorías (mismo diseño que el home).
   - Badge del carrito REACTIVO (useCart)  arregla el "(0)" que no se movía.
   - Header + drawer móvil + barra inferior de accesos.
   ══════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ShoppingBag, User, Heart, Menu, X, Home, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useStockConfirmedOrders } from '@/hooks/useStockConfirmedOrders';
import type { Category, Subcategory } from '@/types';

const LOGO = '/images/optimized/logo-carlitos.svg';

const EMOJI: Record<string, string> = {
  'Perfumes': '🌸', 'Fragancias': '🌸', 'Ropa': '👕', 'Vestuario': '👕', 'Accesorios': '👜',
  'Otros': '📦', 'Ofertas': '🏷️',
};

export default function Navbar23() {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const { stockConfirmedCount, firstOrderId, firstOrderStatus, firstUpdatedAt, shippedCount, shippedOrderId, shippedStatus, shippedUpdatedAt } = useStockConfirmedOrders();
  const [dismissedConfirmed, setDismissedConfirmed] = useState(false);
  const [dismissedShipped, setDismissedShipped] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [inCategoriesView, setInCategoriesView] = useState(false);
  const [selectedDrawerCat, setSelectedDrawerCat] = useState<Category | null>(null);
  const [selectedDrawerSub, setSelectedDrawerSub] = useState<Subcategory | null>(null);

  useEffect(() => {
    if (firstOrderId && firstOrderStatus === 'payment_confirmed') {
      const dismissed = localStorage.getItem(`pay_confirmed_${firstOrderId}_${firstUpdatedAt}`);
      setDismissedConfirmed(dismissed === '1');
    } else {
      setDismissedConfirmed(false);
    }
    if (shippedOrderId && (shippedStatus === 'shipped' || shippedStatus === 'delivered')) {
      const dismissed = localStorage.getItem(`ship_notified_${shippedOrderId}_${shippedUpdatedAt}`);
      setDismissedShipped(dismissed === '1');
    } else {
      setDismissedShipped(false);
    }
  }, [firstOrderId, firstOrderStatus, firstUpdatedAt, shippedOrderId, shippedStatus, shippedUpdatedAt]);

  const handleConfirmedClick = () => {
    if (firstOrderId) {
      localStorage.setItem(`pay_confirmed_${firstOrderId}_${firstUpdatedAt}`, '1');
      setDismissedConfirmed(true);
    }
  };

  const handleShippedClick = () => {
    if (shippedOrderId) {
      localStorage.setItem(`ship_notified_${shippedOrderId}_${shippedUpdatedAt}`, '1');
      setDismissedShipped(true);
    }
  };

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/inventario')) {
    return null;
  }

  // Fetch categorias + conteos (misma fuente que el home)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          fetch('/api/public-data/catalog'),
          fetch('/api/public-data/products?limit=1'),
        ]);
        if (!catRes.ok || !prodRes.ok || !active) return;
        const catData = await catRes.json();
        const prodData = await prodRes.json();
        if (!active) return;
        setCats((catData.categories || []) as Category[]);
        setSubs((catData.subcategories || []) as Subcategory[]);
        setCatCounts(prodData.categoryCounts || {});
        setSubCounts(prodData.subcategoryCounts || {});
      } catch { /* silencioso */ }
    })();
    return () => { active = false; };
  }, []);

  const resetDrawer = () => {
    setDrawer(false);
    setInCategoriesView(false);
    setSelectedDrawerCat(null);
    setSelectedDrawerSub(null);
  };

  // Cerrar drawer y mega-menús al cambiar de página
  useEffect(() => { resetDrawer(); setOpenGroup(null); }, [pathname]);

  const navCats = useMemo(
    () => {
      const filtered = cats.filter(c => (catCounts[c.$id] || 0) > 0);
      if (filtered.length > 0) {
        return filtered.sort((a, b) => (catCounts[b.$id] || 0) - (catCounts[a.$id] || 0));
      }
      return [...cats].sort((a, b) => ((a as any).order ?? 999) - ((b as any).order ?? 999));
    },
    [cats, catCounts]
  );
  const subsFor = (catId: string) =>
    subs.filter(s => (s as any).categoryId === catId && !(s as any).parentSubcategoryId)
      .sort((a, b) => (subCounts[b.$id] || 0) - (subCounts[a.$id] || 0));
  const subSubsFor = (subId: string) => subs.filter(s => (s as any).parentSubcategoryId === subId);

  const badge = totalItems > 99 ? '99+' : String(totalItems);
  const openCartDrawer = () => window.dispatchEvent(new CustomEvent('yaxsel:open-cart'));

  if (
    pathname?.startsWith('/checkout') ||
    pathname?.startsWith('/confirmar-pedido') ||
    pathname?.startsWith('/verificar-stock') ||
    pathname?.startsWith('/pedido') ||
    pathname?.startsWith('/comprobante') ||
    pathname?.startsWith('/datos-envio')
  ) {
    return null;
  }

  return (
    <div className="nb23-root">
      {/* ── NAVBAR DESKTOP (mega-menú) ── */}
      <div className="nb23-pc">
        <div className="nb23-container">
          <Link href="/" className="nb23-logo">
            <img src={LOGO} alt="Importadora Carlitos" />
          </Link>

          <nav className="nb23-bottom" aria-label="Navegación principal">
            <Link href="/" className="nb23-link" style={{ fontWeight: 700, color: '#e0457b' }}>Inicio</Link>
            <Link href="/productos" className="nb23-link">Catálogo</Link>
            {navCats.map(cat => {
              const cSubs = subsFor(cat.$id);
              const emoji = EMOJI[cat.name] || '';
              const catLink = `/productos`;
              if (cSubs.length === 0) {
                return <Link key={cat.$id} href={catLink} className="nb23-link">{emoji ? `${emoji} ` : ''}{cat.name}</Link>;
              }
              const isOpen = openGroup === cat.$id;
              return (
                <div key={cat.$id} className={`nb23-group${isOpen ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="nb23-parent"
                    onClick={() => setOpenGroup(isOpen ? null : cat.$id)}
                  >
                    {emoji ? `${emoji} ` : ''}{cat.name}
                    <ChevronDown size={13} className="nb23-caret" />
                  </button>
                  <div className="nb23-mega">
                    {cSubs.map(sub => {
                      const ssubs = subSubsFor(sub.$id);
                      return (
                        <div key={sub.$id} className="nb23-mega-col">
                          <Link href={catLink} className="nb23-mega-title">{sub.name}</Link>
                          {ssubs.length > 0
                            ? ssubs.map(ss => (
                                <Link key={ss.$id} href={catLink}>{ss.name}</Link>
                              ))
                            : <Link href={catLink}>Ver todo ({subCounts[sub.$id] || 0})</Link>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="nb23-actions">
            <Link href="/productos" className="nb23-cat-link">Catálogo</Link>
            <Link href="/productos" aria-label="Buscar" className="nb23-icon"><Search size={21} /></Link>
            <button type="button" onClick={openCartDrawer} aria-label="Abrir carrito" className="nb23-icon nb23-cart">
              <ShoppingBag size={21} />
              {totalItems > 0 && <span className="nb23-badge">{badge}</span>}
            </button>
            <Link href="/cuenta" aria-label="Mi cuenta" className="nb23-icon nb23-account-icon">
              <User size={21} />
              {stockConfirmedCount > 0 && (
                <span className="nb23-stock-badge">
                  <span className="nb23-stock-pulse" />
                  <span className="nb23-stock-num">{stockConfirmedCount > 9 ? '9+' : stockConfirmedCount}</span>
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* ── HEADER MÓVIL ── */}
      <div className="nb23-mobile">
        <Link href="/" className="nb23-m-logo">
          <img src={LOGO} alt="Importadora Carlitos" />
        </Link>
      </div>

      {/* ── DRAWER MÓVIL JERÁRQUICO ── */}
      {drawer && (
        <>
          <div className="nb23-backdrop" onClick={resetDrawer} />
          <aside className="nb23-drawer">
            <div className="nb23-drawer-head">
              <img src={LOGO} alt="Importadora Carlitos" />
              <button type="button" aria-label="Cerrar" onClick={resetDrawer}><X size={22} /></button>
            </div>

            {/* VISTA 1: Nivel Raíz */}
            {!inCategoriesView && (
              <div className="nb23-drawer-view">
                <Link href="/" onClick={resetDrawer} className="nb23-d-link nb23-d-strong">
                  🏠 Inicio
                </Link>
                <Link href="/productos" onClick={resetDrawer} className="nb23-d-link nb23-d-strong">
                  🛍️ Catálogo
                </Link>
                <button
                  type="button"
                  className="nb23-d-btn nb23-d-strong"
                  onClick={() => setInCategoriesView(true)}
                >
                  <span>🗂️ Categorías</span>
                  <ChevronRight size={18} color="#9ca3af" />
                </button>
                <Link href="/cuenta" onClick={resetDrawer} className="nb23-d-link nb23-d-strong">
                  👤 Mi Cuenta
                </Link>
              </div>
            )}

            {/* VISTA 2: Listado de Categorías */}
            {inCategoriesView && !selectedDrawerCat && (
              <div className="nb23-drawer-view">
                <button
                  type="button"
                  className="nb23-d-back"
                  onClick={() => setInCategoriesView(false)}
                >
                  <ChevronLeft size={18} />
                  <span>Volver al menú</span>
                </button>
                <div className="nb23-d-sep">Categorías</div>
                {navCats.map(cat => {
                  const directSubs = subsFor(cat.$id);
                  const emoji = EMOJI[cat.name] || '';
                  const count = catCounts[cat.$id];
                  if (directSubs.length === 0) {
                    return (
                      <Link
                        key={cat.$id}
                        href={`/productos?categoria=${encodeURIComponent(cat.name)}`}
                        onClick={resetDrawer}
                        className="nb23-d-link"
                      >
                        <span>{emoji ? `${emoji} ` : ''}{cat.name}</span>
                        {typeof count === 'number' && <span className="nb23-d-count">{count}</span>}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={cat.$id}
                      type="button"
                      className="nb23-d-btn"
                      onClick={() => setSelectedDrawerCat(cat)}
                    >
                      <span>{emoji ? `${emoji} ` : ''}{cat.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {typeof count === 'number' && <span className="nb23-d-count">{count}</span>}
                        <ChevronRight size={16} color="#9ca3af" />
                      </div>
                    </button>
                  );
                })}
                <Link
                  href="/productos"
                  onClick={resetDrawer}
                  className="nb23-d-all"
                >
                  Ver todo el catálogo →
                </Link>
              </div>
            )}

            {/* VISTA 3: Subcategorías de la Categoría */}
            {inCategoriesView && selectedDrawerCat && !selectedDrawerSub && (
              <div className="nb23-drawer-view">
                <button
                  type="button"
                  className="nb23-d-back"
                  onClick={() => setSelectedDrawerCat(null)}
                >
                  <ChevronLeft size={18} />
                  <span>Volver a Categorías</span>
                </button>
                <div className="nb23-d-sep">
                  {EMOJI[selectedDrawerCat.name] ? `${EMOJI[selectedDrawerCat.name]} ` : ''}{selectedDrawerCat.name}
                </div>
                {subsFor(selectedDrawerCat.$id).map(sub => {
                  const ssubs = subSubsFor(sub.$id);
                  const count = subCounts[sub.$id];
                  const catParam = encodeURIComponent(selectedDrawerCat.name);
                  const subParam = encodeURIComponent(sub.$id);
                  if (ssubs.length === 0) {
                    return (
                      <Link
                        key={sub.$id}
                        href={`/productos?categoria=${catParam}&subcat=${subParam}`}
                        onClick={resetDrawer}
                        className="nb23-d-link"
                      >
                        <span>{sub.name}</span>
                        {typeof count === 'number' && <span className="nb23-d-count">{count}</span>}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={sub.$id}
                      type="button"
                      className="nb23-d-btn"
                      onClick={() => setSelectedDrawerSub(sub)}
                    >
                      <span>{sub.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {typeof count === 'number' && <span className="nb23-d-count">{count}</span>}
                        <ChevronRight size={16} color="#9ca3af" />
                      </div>
                    </button>
                  );
                })}
                <Link
                  href={`/productos?categoria=${encodeURIComponent(selectedDrawerCat.name)}`}
                  onClick={resetDrawer}
                  className="nb23-d-all"
                >
                  Ver todo en {selectedDrawerCat.name} ({catCounts[selectedDrawerCat.$id] || 0}) →
                </Link>
              </div>
            )}

            {/* VISTA 4: Sub-subcategorías (Nivel 3) */}
            {inCategoriesView && selectedDrawerCat && selectedDrawerSub && (
              <div className="nb23-drawer-view">
                <button
                  type="button"
                  className="nb23-d-back"
                  onClick={() => setSelectedDrawerSub(null)}
                >
                  <ChevronLeft size={18} />
                  <span>Volver a {selectedDrawerCat.name}</span>
                </button>
                <div className="nb23-d-sep">{selectedDrawerSub.name}</div>
                {subSubsFor(selectedDrawerSub.$id).map(ssub => {
                  const catParam = encodeURIComponent(selectedDrawerCat.name);
                  const subParam = encodeURIComponent(selectedDrawerSub.$id);
                  const ssubParam = encodeURIComponent(ssub.$id);
                  return (
                    <Link
                      key={ssub.$id}
                      href={`/productos?categoria=${catParam}&subcat=${subParam}&subSubcat=${ssubParam}`}
                      onClick={resetDrawer}
                      className="nb23-d-link"
                    >
                      <span>{ssub.name}</span>
                    </Link>
                  );
                })}
                <Link
                  href={`/productos?categoria=${encodeURIComponent(selectedDrawerCat.name)}&subcat=${encodeURIComponent(selectedDrawerSub.$id)}`}
                  onClick={resetDrawer}
                  className="nb23-d-all"
                >
                  Ver todo en {selectedDrawerSub.name} →
                </Link>
              </div>
            )}
          </aside>
        </>
      )}

      {/* 
      {/*  BARRA INFERIOR MÓVIL RIOR MÓVIL  */}
      <nav className="nb23-tabbar" aria-label="Accesos rápidos">
        <Link href="/" className={`nb23-tab${pathname === '/' ? ' active' : ''}`}><Home size={20} /><span>Inicio</span></Link>
        <Link href="/productos" className={`nb23-tab${pathname.startsWith('/productos') ? ' active' : ''}`}><Search size={20} /><span>Tienda</span></Link>
        <Link href="/favoritos" className={`nb23-tab${pathname === '/favoritos' ? ' active' : ''}`}><Heart size={20} /><span>Favoritos</span></Link>
        <button type="button" onClick={openCartDrawer} className="nb23-tab nb23-cart">
          <ShoppingBag size={20} />{totalItems > 0 && <span className="nb23-badge nb23-badge-tab">{badge}</span>}<span>Carrito</span>
        </button>
        {stockConfirmedCount > 0 && firstOrderId && !(firstOrderStatus === 'payment_confirmed' && dismissedConfirmed) ? (
          <Link 
            href={`/pedido/${firstOrderId}`} 
            className={`nb23-tab nb23-stock-tab${firstOrderStatus === 'payment_review' ? ' nb23-stock-tab--review' : ''}${firstOrderStatus === 'payment_confirmed' ? ' nb23-stock-tab--confirmed' : ''}`}
            onClick={firstOrderStatus === 'payment_confirmed' ? handleConfirmedClick : undefined}
          >
            <span className="nb23-stock-tab-particles">
              <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
              <span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" />
            </span>
            <span className="ck-shimmer-line" />
            <span className="nb23-stock-tab-inner">
              <span className="nb23-stock-tab-icon">
                {firstOrderStatus === 'payment_review' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                )}
              </span>
              <span className="nb23-stock-tab-text">{firstOrderStatus === 'payment_confirmed' ? 'Pago confirmado' : firstOrderStatus === 'payment_review' ? 'Revisando tu pago' : 'Pagar tu pedido'}</span>
            </span>
          </Link>
        ) : shippedCount > 0 && shippedOrderId && !dismissedShipped ? (
          <Link
            href={`/pedido/${shippedOrderId}`}
            className={`nb23-tab nb23-stock-tab nb23-stock-tab--shipped${shippedStatus === 'delivered' ? ' nb23-stock-tab--delivered' : ''}`}
            onClick={handleShippedClick}
          >
            <span className="nb23-stock-tab-particles">
              <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
              <span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" />
            </span>
            <span className="ck-shimmer-line" />
            <span className="nb23-stock-tab-inner">
              <span className="nb23-stock-tab-icon">
                {shippedStatus === 'delivered' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 17h4V5H2v12h3" /><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5" />
                    <circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                    <path d="M14 19a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2" />
                    <path d="M18 19V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2" />
                  </svg>
                )}
              </span>
              <span className="nb23-stock-tab-text">{shippedStatus === 'delivered' ? 'Entregado a agencia' : 'Pedido embalado'}</span>
            </span>
          </Link>
        ) : (
          <Link href="/cuenta" className={`nb23-tab${pathname.startsWith('/cuenta') ? ' active' : ''}`}>
            <span className="nb23-tab-icon-wrap">
              <User size={20} />
            </span>
            <span>Cuenta</span>
          </Link>
        )}
      </nav>

      <style>{`
        .nb23-root { font-family: 'Outfit','Inter',system-ui,sans-serif; }
        .nb23-badge {
          position: absolute; top: -5px; right: -7px; min-width: 18px; height: 18px; padding: 0 4px;
          display: flex; align-items: center; justify-content: center; box-sizing: border-box;
          background: #facc15; color: #17324d; border-radius: 999px; font-size: 10px; font-weight: 800;
          line-height: 1; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(15, 23, 42, .18);
        }
        .nb23-cart { position: relative; }

        /*    Stock confirmed badge (cuenta icon) en */
        .nb23-account-icon { position: relative; }
        .nb23-tab-icon-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
        .nb23-stock-badge {
          position: absolute; top: -6px; right: -8px; min-width: 18px; height: 18px; padding: 0 4px;
          display: flex; align-items: center; justify-content: center; box-sizing: border-box;
          background: #10b981; color: #fff; border-radius: 999px; font-size: 10px; font-weight: 800;
          line-height: 1; border: 2px solid #fff; z-index: 5;
          animation: nb23-stock-bounce 1.4s ease-in-out infinite;
        }
        .nb23-stock-badge-tab {
          position: absolute; top: -4px; right: -6px; min-width: 16px; height: 16px; padding: 0 3px;
          font-size: 9px; border-width: 1.5px;
        }
        .nb23-stock-pulse {
          position: absolute; inset: -3px; border-radius: 999px;
          background: #10b981; opacity: 0.4; z-index: -1;
          animation: nb23-stock-pulse 1.4s ease-out infinite;
        }
        @keyframes nb23-stock-pulse {
          0% { transform: scale(1); opacity: 0.5; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes nb23-stock-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }

        /*    Stock tab button (mobile tab bar) e  */
        .nb23-stock-tab {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 6px 4px; text-decoration: none; min-width: 0;
        }
        .nb23-stock-tab-inner {
          display: flex; align-items: center; gap: 6px; padding: 8px 14px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #f59e0b 100%);
          background-size: 300% 300% !important;
          border-radius: 999px; box-shadow: 0 4px 14px rgba(245,158,11,0.35);
          animation: nb23-stock-tab-pulse 1.8s ease-in-out infinite, ckBtnShift 3s ease infinite;
          white-space: nowrap; overflow: hidden;
        }
        .nb23-stock-tab-icon {
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; width: 24px; height: 24px;
          background: rgba(255,255,255,0.25); border-radius: 50%;
        }
        .nb23-stock-tab-text {
          font-size: 11px; font-weight: 800; color: #fff; letter-spacing: 0.3px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        @keyframes nb23-stock-tab-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(245,158,11,0.35); }
          50% { transform: scale(1.05); box-shadow: 0 6px 22px rgba(245,158,11,0.5); }
        }
        .nb23-stock-tab--review .nb23-stock-tab-inner {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #2563eb 100%);
          box-shadow: 0 4px 14px rgba(37,99,235,0.35);
          animation: nb23-stock-tab-pulse-review 1.8s ease-in-out infinite;
        }
        @keyframes nb23-stock-tab-pulse-review {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(37,99,235,0.35); }
          50% { transform: scale(1.05); box-shadow: 0 6px 22px rgba(37,99,235,0.5); }
        }
        .nb23-stock-tab--confirmed .nb23-stock-tab-inner {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%);
          box-shadow: 0 4px 14px rgba(22,163,74,0.35);
          animation: nb23-stock-tab-pulse-confirmed 1.8s ease-in-out infinite;
        }
        @keyframes nb23-stock-tab-pulse-confirmed {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(22,163,74,0.35); }
          50% { transform: scale(1.05); box-shadow: 0 6px 22px rgba(22,163,74,0.5); }
        }
        .nb23-stock-tab--shipped .nb23-stock-tab-inner {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #8b5cf6 100%);
          box-shadow: 0 4px 14px rgba(139,92,246,0.35);
          animation: nb23-stock-tab-pulse-shipped 1.8s ease-in-out infinite;
        }
        @keyframes nb23-stock-tab-pulse-shipped {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(139,92,246,0.35); }
          50% { transform: scale(1.05); box-shadow: 0 6px 22px rgba(139,92,246,0.5); }
        }
        .nb23-stock-tab--delivered .nb23-stock-tab-inner {
          background: linear-gradient(135deg, #0891b2 0%, #0e7490 50%, #0891b2 100%);
          box-shadow: 0 4px 14px rgba(8,145,178,0.35);
          animation: nb23-stock-tab-pulse-delivered 1.8s ease-in-out infinite;
        }
        @keyframes nb23-stock-tab-pulse-delivered {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(8,145,178,0.35); }
          50% { transform: scale(1.05); box-shadow: 0 6px 22px rgba(8,145,178,0.5); }
        }
        /*    Particles for stock tab  s */
        .nb23-stock-tab { position: relative; overflow: hidden; }
        .nb23-stock-tab-inner { position: relative; z-index: 2; }
        .nb23-stock-tab-particles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 1; }
        .nb23-stock-tab .ck-shimmer-line {
          position: absolute; top: 0; bottom: 0; width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: ckShimmer 2.5s ease-in-out infinite;
          pointer-events: none; z-index: 1;
        }
        .nb23-stock-tab .ck-orb {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.9), rgba(255,255,255,0.1));
          box-shadow: 0 0 6px rgba(255,255,255,0.5);
          animation: ckOrbFloat 2.8s ease-in-out infinite;
        }
        .nb23-stock-tab .ck-orb:nth-child(1) { width: 6px; height: 6px; left: 10%; bottom: 3px; animation-delay: 0s; }
        .nb23-stock-tab .ck-orb:nth-child(2) { width: 4px; height: 4px; left: 25%; bottom: 2px; animation-delay: 0.4s; }
        .nb23-stock-tab .ck-orb:nth-child(3) { width: 7px; height: 7px; left: 40%; bottom: 4px; animation-delay: 0.8s; }
        .nb23-stock-tab .ck-orb:nth-child(4) { width: 5px; height: 5px; left: 60%; bottom: 3px; animation-delay: 1.2s; }
        .nb23-stock-tab .ck-orb:nth-child(5) { width: 6px; height: 6px; left: 80%; bottom: 2px; animation-delay: 1.6s; }
        .nb23-stock-tab .ck-sparkle {
          position: absolute; width: 4px; height: 4px; background: white;
          clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
          animation: ckSparkle 2s ease-in-out infinite;
          filter: drop-shadow(0 0 3px rgba(255,255,255,0.8));
        }
        .nb23-stock-tab .ck-sparkle:nth-child(6) { left: 20%; top: 25%; animation-delay: 0s; }
        .nb23-stock-tab .ck-sparkle:nth-child(7) { left: 50%; top: 15%; animation-delay: 0.7s; width: 5px; height: 5px; }
        .nb23-stock-tab .ck-sparkle:nth-child(8) { left: 75%; top: 35%; animation-delay: 1.4s; }
        @keyframes ckBtnShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes ckOrbFloat { 0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; } 10% { opacity: 0.9; } 50% { transform: translateY(-18px) translateX(6px) scale(1.3); opacity: 1; } 90% { opacity: 0.6; } 100% { transform: translateY(-36px) translateX(-3px) scale(0.5); opacity: 0; } }
        @keyframes ckSparkle { 0% { transform: scale(0) rotate(0deg); opacity: 0; } 20% { transform: scale(1.2) rotate(90deg); opacity: 1; } 50% { transform: scale(0.8) rotate(180deg); opacity: 0.8; } 80% { transform: scale(1.1) rotate(270deg); opacity: 0.5; } 100% { transform: scale(0) rotate(360deg); opacity: 0; } }
        @keyframes ckShimmer { 0% { left: -40%; } 100% { left: 110%; } }

        /* ?? DESKTOP ?? */
        .nb23-pc { display: none; }
        @media (min-width: 993px) {
          .nb23-pc {
            display: flex; position: sticky; top: 0; z-index: 50; width: 100%;
            background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 8px 0;
          }
          .nb23-mobile, .nb23-tabbar { display: none !important; }
        }
        .nb23-container {
          width: 100%; max-width: 100%; padding: 0 6.5%;
          display: flex; flex-direction: row; align-items: center; gap: 24px;
        }
        .nb23-logo { display: flex; align-items: center; flex: 0 0 auto; line-height: 0; }
        .nb23-logo img { height: 30px; width: auto; max-width: 112px; object-fit: contain; }
        .nb23-bottom {
          display: flex; justify-content: center; align-items: center; flex: 1 1 auto;
          flex-wrap: nowrap; gap: 20px; margin: 0 auto; font-size: 12px; font-weight: 600; min-width: 0;
        }
        .nb23-link { color: #001b2e; text-decoration: none; white-space: nowrap; transition: opacity 0.2s; background: none; border: none; cursor: pointer; font: inherit; }
        .nb23-link:hover { opacity: 0.7; }
        .nb23-group { position: relative; display: flex; align-items: center; }
        .nb23-parent {
          display: inline-flex; align-items: center; gap: 3px; cursor: pointer;
          background: none; border: none; font: inherit; color: #001b2e; white-space: nowrap; padding: 0;
        }
        .nb23-caret { transition: transform 0.2s ease; }
        .nb23-group:hover .nb23-caret, .nb23-group.open .nb23-caret { transform: rotate(180deg); }
        .nb23-mega {
          display: none; position: absolute; top: calc(100% + 1px); left: 50%; transform: translateX(-50%);
          min-width: 600px; padding: 18px 28px 24px; background: #fff; border-radius: 0 0 14px 14px;
          box-shadow: 0 14px 35px rgba(0,0,0,.16); z-index: 100;
          grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 22px 34px; text-align: left;
        }
        .nb23-mega::before { content: ''; position: absolute; top: -18px; left: 0; right: 0; height: 18px; }
        .nb23-group:hover .nb23-mega, .nb23-group.open .nb23-mega { display: grid; }
        .nb23-mega-col { display: flex; flex-direction: column; gap: 7px; }
        .nb23-mega-title { margin-bottom: 4px; color: #333 !important; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; text-decoration: none; }
        .nb23-mega a { display: block; color: #666; font-size: 12px; font-weight: 500; text-decoration: none; }
        .nb23-mega a:hover { color: #d277a5; }
        .nb23-actions { display: flex; align-items: center; gap: 18px; flex: 0 0 auto; margin-left: 18px; }
        .nb23-cat-link { font-size: 12px; font-weight: 900; color: #e0457b; text-decoration: none; text-transform: uppercase; white-space: nowrap; }
        .nb23-cat-link:hover { opacity: 0.7; }
        .nb23-icon { color: #000; display: inline-flex; align-items: center; position: relative; text-decoration: none; border: 0; padding: 0; background: transparent; cursor: pointer; }
        .nb23-icon:hover { opacity: 0.7; }

        /*    MÓVIL: header superior (solo logo centrado y más pequeño)  */
        .nb23-mobile {
          display: flex; align-items: center; justify-content: center;
          padding: 8px 14px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          position: sticky; top: 0; z-index: 50;
        }
        .nb23-m-logo { display: flex; align-items: center; justify-content: center; text-decoration: none; }
        .nb23-m-logo img { height: 21px; max-height: 21px; width: auto; object-fit: contain; }

        /* ── DRAWER ── */
        .nb23-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); z-index: 9998; }
        .nb23-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: min(85vw, 350px); background: #fff; z-index: 9999;
          display: flex; flex-direction: column; padding: 14px 14px calc(14px + env(safe-area-inset-bottom,0px));
          box-shadow: 6px 0 30px rgba(0,0,0,0.18); overflow-y: auto; animation: nb23In .28s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes nb23In { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        .nb23-drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 14px; border-bottom: 1px solid #f3f4f6; margin-bottom: 8px; }
        .nb23-drawer-head img { height: 28px; width: auto; object-fit: contain; }
        .nb23-drawer-head button { background: #f3f4f6; border: none; width: 34px; height: 34px; border-radius: 50%; color: #111827; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .nb23-drawer-view { display: flex; flex-direction: column; width: 100%; }
        .nb23-d-back {
          display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px;
          background: #fdf2f8; border: none; border-radius: 10px; color: #db2777;
          font-size: 13px; font-weight: 800; cursor: pointer; margin-bottom: 8px; text-align: left;
        }
        .nb23-d-back:hover { background: #fce7f3; }
        .nb23-d-btn {
          display: flex; align-items: center; justify-content: space-between; width: 100%;
          padding: 12px 10px; border-radius: 10px; border: none; background: transparent;
          color: #1f2937; font-size: 15px; font-weight: 700; cursor: pointer; text-align: left;
        }
        .nb23-d-btn:hover { background: #f9fafb; }
        .nb23-d-link {
          display: flex; align-items: center; justify-content: space-between; padding: 12px 10px; border-radius: 10px;
          color: #1f2937; text-decoration: none; font-size: 15px; font-weight: 700;
        }
        .nb23-d-link:hover { background: #f9fafb; }
        .nb23-d-strong { font-weight: 800; color: #111827; }
        .nb23-d-count { font-size: 11px; font-weight: 800; color: #6b7280; background: #f3f4f6; border-radius: 999px; padding: 2px 8px; }
        .nb23-d-sep { padding: 10px 10px 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #db2777; }
        .nb23-d-all {
          display: block; margin-top: 12px; padding: 10px; color: #111827;
          font-size: 13px; font-weight: 800; text-decoration: underline;
        }

        /* === BARRA INFERIOR MÓVIL (Modern Floating Glass Dock) === */
        .nb23-tabbar {
          position: fixed !important; left: 12px !important; right: 12px !important; bottom: calc(env(safe-area-inset-bottom, 0px) + 8px) !important;
          z-index: 60 !important; display: flex !important; width: calc(100% - 24px) !important; max-width: 440px !important; margin: 0 auto !important; height: 62px !important;
          align-items: center !important; justify-content: center !important; gap: 2px !important; padding: 5px !important;
          border-radius: 999px !important; background: rgba(226, 226, 226, .82) !important;
          backdrop-filter: blur(24px) saturate(180%) !important; -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid rgba(255, 255, 255, .8) !important;
          box-shadow: 0 12px 32px rgba(15, 23, 42, .12), inset 0 1px 0 rgba(255, 255, 255, .85) !important;
          box-sizing: border-box !important;
        }
        .nb23-tab {
          flex: 1 1 0 !important; min-width: 0 !important; display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: center !important;
          gap: 0 !important; color: #737373 !important; text-decoration: none !important; font-size: 13px !important; font-weight: 600 !important;
          position: relative !important; height: 48px !important; padding: 0 8px !important; border-radius: 999px !important; transition: flex .28s cubic-bezier(.2,.8,.2,1), background .24s ease, color .2s ease, transform .2s ease !important;
          border: 0 !important; background: transparent !important; font-family: inherit !important; cursor: pointer !important;
        }
        .nb23-tab:active { transform: scale(0.92) !important; }
        .nb23-tab.active { flex: 0 0 auto !important; min-width: max-content !important; gap: 6px !important; padding: 0 12px !important; color: #111827 !important; font-weight: 800 !important; background: rgba(255, 255, 255, .97) !important; box-shadow: 0 1px 5px rgba(15, 23, 42, .05), inset 0 1px 0 #fff !important; animation: nb23-active-enter .28s cubic-bezier(.16,1,.3,1) both !important; }
        .nb23-tab > span:last-child { max-width: 0 !important; overflow: hidden !important; opacity: 0 !important; white-space: nowrap !important; transition: max-width .28s cubic-bezier(.2,.8,.3,1), opacity .18s ease !important; }
        .nb23-tab.active > span:last-child { max-width: none !important; opacity: 1 !important; }
        .nb23-stock-tab > span:last-child { max-width: none !important; opacity: 1 !important; }
        .nb23-tab.active svg { color: #111827 !important; transform: none !important; }
        @keyframes nb23-active-enter { from { transform: scale(.94); opacity: .72; } to { transform: scale(1); opacity: 1; } }
        @media (max-width: 380px) { .nb23-tab.active { flex-grow: 0 !important; padding-inline: 10px !important; gap: 5px !important; } .nb23-tab.active > span:last-child { font-size: 11px !important; }
        }
        .nb23-badge-tab {
          position: absolute !important; top: 0 !important; right: calc(50% - 22px) !important; min-width: 18px !important; height: 18px !important; padding: 0 4px !important;
          border-radius: 999px !important; background: #facc15 !important; color: #17324d !important; font-size: 10px !important; font-weight: 800 !important;
          display: flex !important; align-items: center !important; justify-content: center !important; border: 2px solid #ffffff !important;
          box-shadow: 0 1px 3px rgba(15, 23, 42, .18) !important;
        }
        @media (min-width: 993px) { .nb23-tabbar, .nb23-mobile { display: none; } }
      `}</style>
    </div>
  );
}

