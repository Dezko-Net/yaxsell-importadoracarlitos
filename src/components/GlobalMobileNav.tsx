'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircle, ChevronRight, Clock, Package, Truck } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useStockConfirmedOrders } from '@/hooks/useStockConfirmedOrders';

type NavItemConfig = {
  id: string;
  label: string;
  href: string;
  isAction?: boolean;
  svg: (active: boolean) => React.ReactNode;
};

const navItems: NavItemConfig[] = [
  {
    id: 'home',
    label: 'Inicio',
    href: '/',
    svg: (active: boolean) => (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.15 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 10 9-7 9 7v10H3ZM9 20v-8h6v8" />
      </svg>
    ),
  },
  {
    id: 'categories',
    label: 'Explorar',
    href: '/productos',
    svg: (active: boolean) => (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.15 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </svg>
    ),
  },
  {
    id: 'cart',
    label: 'Mi pedido',
    href: '#cart',
    isAction: true,
    svg: (active: boolean) => (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.15 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7h14l1 14H4L5 7ZM8 7V5a4 4 0 0 1 8 0v2" />
      </svg>
    ),
  },
  {
    id: 'favorites',
    label: 'Favoritos',
    href: '/favoritos',
    svg: (active: boolean) => (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.15 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    ),
  },
  {
    id: 'account',
    label: 'Mi cuenta',
    href: '/cuenta',
    svg: (active: boolean) => (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.15 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-2a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v2" />
      </svg>
    ),
  },
];

function isItemActive(id: string, pathname: string): boolean {
  if (id === 'home') return pathname === '/';
  if (id === 'categories') return pathname.startsWith('/productos') || pathname.startsWith('/catalogo') || pathname.startsWith('/producto/');
  if (id === 'favorites') return pathname === '/favoritos' || pathname.startsWith('/cuenta/favoritos');
  if (id === 'account' || id === 'orders') return (pathname === '/cuenta' || pathname.startsWith('/cuenta/') || pathname.startsWith('/pedido/')) && pathname !== '/favoritos' && !pathname.startsWith('/cuenta/favoritos');
  if (id === 'cart') return pathname === '/carrito';
  return false;
}

export default function GlobalMobileNav() {
  const pathname = usePathname();
  const { totalItems, subtotal } = useCart();
  const { stockConfirmedCount, firstOrderId, firstOrderStatus, firstUpdatedAt, shippedCount, shippedOrderId, shippedStatus, shippedUpdatedAt } = useStockConfirmedOrders();
  const [dismissedConfirmed, setDismissedConfirmed] = useState(false);
  const [dismissedShipped, setDismissedShipped] = useState(false);

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

  const handleCartClick = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    window.dispatchEvent(new CustomEvent('yaxsel:open-cart'));
  };

  if (
    pathname === '/' ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/pos-admin') ||
    pathname?.startsWith('/pos') ||
    pathname?.startsWith('/erp') ||
    pathname?.startsWith('/cuadres') ||
    pathname?.startsWith('/inventario') ||
    pathname?.startsWith('/base-datos') ||
    pathname?.startsWith('/control-datos') ||
    pathname?.startsWith('/admin-supreme') ||
    pathname?.startsWith('/checkout') ||
    pathname?.startsWith('/catalogo') ||
    pathname?.startsWith('/productos') ||
    pathname?.startsWith('/favoritos') ||
    pathname?.startsWith('/cuenta') ||
    pathname?.startsWith('/confirmar-pedido') ||
    pathname?.startsWith('/verificar-stock') ||
    pathname?.startsWith('/pedido') ||
    pathname?.startsWith('/comprobante') ||
    pathname?.startsWith('/datos-envio') ||
    pathname?.startsWith('/linktree') ||
    pathname?.startsWith('/vendor')
  ) {
    return null;
  }

  // El aviso de pago aparece en cualquier pestaña MENOS en "Mi cuenta"
  const inAccount =
    pathname === '/cuenta' ||
    (!!pathname?.startsWith('/cuenta/') && !pathname?.startsWith('/cuenta/favoritos'));
  const showPay = stockConfirmedCount > 0 && !!firstOrderId && !inAccount;

  const isPaymentReview = firstOrderStatus === 'payment_review';
  const isPaymentConfirmed = firstOrderStatus === 'payment_confirmed';
  const showPayButton = stockConfirmedCount > 0 && !!firstOrderId && !inAccount && !(isPaymentConfirmed && dismissedConfirmed);

  const isShipped = shippedStatus === 'shipped';
  const isDelivered = shippedStatus === 'delivered';
  const showShippedButton = shippedCount > 0 && !!shippedOrderId && !inAccount && !dismissedShipped;

  return (
    <>
      {/* Cinta de pago — solo modo PC (arriba, encima del navbar) */}
      {showPayButton && (
        <Link 
          className={`global-pay-ribbon${isPaymentReview ? ' global-pay-ribbon--review' : ''}${isPaymentConfirmed ? ' global-pay-ribbon--confirmed' : ''}`}
          href={`/pedido/${firstOrderId}`}
          onClick={isPaymentConfirmed ? handleConfirmedClick : undefined}
        >
          <span className="global-pay-ribbon__particles">
            <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
            <span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" />
            <span className="ck-trail" /><span className="ck-trail" /><span className="ck-trail" />
          </span>
          <span className="ck-shimmer-line" />
          <span className="global-pay-ribbon__inner">
            {isPaymentConfirmed ? <CheckCircle aria-hidden="true" size={18} strokeWidth={2.4} /> : isPaymentReview ? <Clock aria-hidden="true" size={18} strokeWidth={2.4} /> : <CheckCircle aria-hidden="true" size={18} strokeWidth={2.4} />}
            <span><strong>{isPaymentConfirmed ? '¡Pago confirmado!' : isPaymentReview ? 'Revisando tu pago' : 'Pagar tu pedido'}</strong> {isPaymentConfirmed ? 'Tu pago fue verificado con éxito. Estamos preparando tu envío.' : isPaymentReview ? 'Hemos recibido tu comprobante, estamos verificando.' : 'Completa la transferencia para que preparemos tu envío.'}</span>
            {stockConfirmedCount > 1 && !isPaymentConfirmed && (
              <span className="global-pay-ribbon__count">{stockConfirmedCount}</span>
            )}
            <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} />
          </span>
        </Link>
      )}

      {/* Cinta de envío — solo modo PC (debajo de la cinta de pago) */}
      {showShippedButton && (
        <Link
          className={`global-pay-ribbon global-pay-ribbon--shipped${isDelivered ? ' global-pay-ribbon--delivered' : ''}`}
          href={`/pedido/${shippedOrderId}`}
          onClick={handleShippedClick}
          style={{ top: showPayButton ? '44px' : '0px' }}
        >
          <span className="global-pay-ribbon__particles">
            <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
            <span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" />
            <span className="ck-trail" /><span className="ck-trail" /><span className="ck-trail" />
          </span>
          <span className="ck-shimmer-line" />
          <span className="global-pay-ribbon__inner">
            {isDelivered ? <Truck aria-hidden="true" size={18} strokeWidth={2.4} /> : <Package aria-hidden="true" size={18} strokeWidth={2.4} />}
            <span><strong>{isDelivered ? '¡Entregado a la agencia!' : '¡Pedido embalado!'}</strong> {isDelivered ? 'Tu pedido fue entregado a la agencia de transporte.' : 'Tu pedido fue embalado y está listo para despacho.'}</span>
            <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} />
          </span>
        </Link>
      )}

      {/* Bottom navigation (Modern Floating Glass Dock) idéntica a /productos */}
      <nav id="bottomNav" className="nav-bottom global-mobile-nav" aria-label="Navegación del catálogo">
        {totalItems > 0 && (
          <button
            type="button"
            id="catalogOrderPeek"
            className="catalog-order-peek"
            onClick={handleCartClick}
            aria-label="Ver el pedido actual"
          >
            <div>
              <span id="catalogOrderCount">
                {totalItems} {totalItems === 1 ? 'unidad en tu pedido' : 'unidades en tu pedido'}
              </span>
            </div>
            <div>
              <strong id="catalogOrderTotal">
                ${new Intl.NumberFormat('es-CL').format(subtotal || 0)}
              </strong>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </div>
          </button>
        )}

        {navItems.map(({ id, label, href, isAction, svg }) => {
          if ((id === 'account' || id === 'orders') && showPayButton) {
            return (
              <Link 
                key="pay" 
                className={`nav-item global-mobile-nav__pay${isPaymentReview ? ' global-mobile-nav__pay--review' : ''}${isPaymentConfirmed ? ' global-mobile-nav__pay--confirmed' : ''}`}
                href={`/pedido/${firstOrderId}`}
                onClick={isPaymentConfirmed ? handleConfirmedClick : undefined}
              >
                <span className="global-mobile-nav__pay-particles">
                  <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
                  <span className="ck-sparkle" /><span className="ck-sparkle" />
                </span>
                <span className="ck-shimmer-line" />
                <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {isPaymentConfirmed ? <CheckCircle aria-hidden="true" size={16} strokeWidth={2.4} /> : isPaymentReview ? <Clock aria-hidden="true" size={16} strokeWidth={2.4} /> : <CheckCircle aria-hidden="true" size={16} strokeWidth={2.4} />}
                  <span>{isPaymentConfirmed ? 'Confirmado' : isPaymentReview ? 'Revisando' : 'Pagar'}</span>
                </span>
              </Link>
            );
          }
          if ((id === 'account' || id === 'orders') && showShippedButton) {
            return (
              <Link
                key="ship"
                className={`nav-item global-mobile-nav__pay global-mobile-nav__pay--shipped${isDelivered ? ' global-mobile-nav__pay--delivered' : ''}`}
                href={`/pedido/${shippedOrderId}`}
                onClick={handleShippedClick}
              >
                <span className="global-mobile-nav__pay-particles">
                  <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
                  <span className="ck-sparkle" /><span className="ck-sparkle" />
                </span>
                <span className="ck-shimmer-line" />
                <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {isDelivered ? <Truck aria-hidden="true" size={16} strokeWidth={2.4} /> : <Package aria-hidden="true" size={16} strokeWidth={2.4} />}
                  <span>{isDelivered ? 'En agencia' : 'Embalado'}</span>
                </span>
              </Link>
            );
          }

          const active = isItemActive(id, pathname || '/');

          if (isAction) {
            return (
              <button
                key={id}
                type="button"
                data-nav={id}
                onClick={handleCartClick}
                className={`nav-item global-mobile-nav__item ${active ? 'active is-active' : ''}`}
                aria-label={label}
              >
                <span className="nav-icon-wrap global-mobile-nav__icon-wrap">
                  {id === 'cart' && totalItems > 0 && (
                    <span id="navCartBadge" className="nav-badge global-mobile-nav__badge">
                      {totalItems > 99 ? '99+' : totalItems}
                    </span>
                  )}
                  {svg(active)}
                </span>
                <span>{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={id}
              href={href}
              data-nav={id}
              className={`nav-item global-mobile-nav__item ${active ? 'active is-active' : ''}`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="nav-icon-wrap global-mobile-nav__icon-wrap">
                {svg(active)}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* En PC, reservar espacio arriba para la(s) cinta(s) fija(s) */}
      {showPay && showShippedButton && <style>{`@media (min-width: 900px) { body { padding-top: 88px !important; } }`}</style>}
      {showPay && !showShippedButton && <style>{`@media (min-width: 900px) { body { padding-top: 44px !important; } }`}</style>}
      {!showPay && showShippedButton && <style>{`@media (min-width: 900px) { body { padding-top: 44px !important; } }`}</style>}

      <style>{`
        /* === Bottom nav (Idéntico a /productos catalog-design.css) === */
        #bottomNav.nav-bottom,
        .nav-bottom,
        .global-mobile-nav {
          position: fixed !important;
          left: 12px !important;
          right: 12px !important;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 10px) !important;
          z-index: 2147483000 !important;
          width: calc(100% - 24px) !important;
          max-width: 460px !important;
          margin: 0 auto !important;
          height: 76px !important;
          padding: 6px 8px !important;
          border-radius: 24px !important;
          gap: 4px !important;
          background: rgba(255, 255, 255, .97) !important;
          -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
          backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid #dce8f3 !important;
          box-shadow: 0 10px 40px #234b7824, inset 0 1px 0 #fff !important;
          box-sizing: border-box !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          overflow: visible !important;
          animation: navSlideUp .35s cubic-bezier(.16, 1, .3, 1) both !important;
        }

        #bottomNav.hidden,
        .nav-bottom.hidden,
        .global-mobile-nav.hidden {
          display: none !important;
        }

        @keyframes navSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        #bottomNav .nav-item,
        #bottomNav .nav-item.active,
        .nav-item,
        .nav-item.active,
        .global-mobile-nav__item,
        .global-mobile-nav__item.active,
        .global-mobile-nav__item.is-active {
          flex: 1 1 0 !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 0 !important;
          height: 60px !important;
          border-radius: 16px !important;
          gap: 5px !important;
          padding: 5px 2px !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #71869b !important;
          text-decoration: none !important;
          border: 0 !important;
          cursor: pointer !important;
          -webkit-tap-highlight-color: transparent !important;
          animation: none !important;
          transition: background .2s ease, color .2s ease, transform .15s ease !important;
        }

        #bottomNav .nav-item:active,
        .nav-item:active,
        .global-mobile-nav__item:active {
          transform: scale(0.92) !important;
        }

        #bottomNav .nav-item > span:last-child,
        .nav-item > span:last-child,
        .global-mobile-nav__item > span:last-child {
          display: block !important;
          max-width: none !important;
          min-width: 0 !important;
          opacity: 1 !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          letter-spacing: -0.01em !important;
          color: inherit !important;
          overflow: visible !important;
          text-align: center !important;
          white-space: nowrap !important;
        }

        #bottomNav .nav-item.active,
        .nav-item.active,
        .global-mobile-nav__item.active,
        .global-mobile-nav__item.is-active {
          color: #2a5d9e !important;
          background: #edf5fe !important;
        }

        #bottomNav .nav-item.active svg,
        .nav-item.active svg,
        .global-mobile-nav__item.active svg,
        .global-mobile-nav__item.is-active svg {
          color: inherit !important;
          stroke-width: 2.15px !important;
        }

        #bottomNav .nav-icon-wrap,
        .nav-icon-wrap,
        .global-mobile-nav__icon-wrap {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 27px !important;
          height: 27px !important;
          flex: 0 0 27px !important;
          transition: transform .2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        #bottomNav .nav-item svg,
        .nav-item svg,
        .global-mobile-nav__item svg {
          width: 22px !important;
          height: 22px !important;
          color: currentColor !important;
          display: block !important;
          transition: color .2s ease, transform .2s ease !important;
        }

        #bottomNav .nav-item[data-nav="cart"],
        .nav-item[data-nav="cart"],
        .global-mobile-nav__item[data-nav="cart"] {
          color: #234b78 !important;
        }

        #bottomNav .nav-item[data-nav="cart"] .nav-icon-wrap,
        .nav-item[data-nav="cart"] .nav-icon-wrap,
        .global-mobile-nav__item[data-nav="cart"] .nav-icon-wrap {
          width: 48px !important;
          height: 40px !important;
          flex: 0 0 40px !important;
          margin-top: -16px !important;
          background: #ffda68 !important;
          border: 4px solid #fff !important;
          box-sizing: content-box !important;
          border-radius: 17px !important;
          box-shadow: none !important;
          color: #234b78 !important;
        }

        #bottomNav .nav-item[data-nav="cart"] .nav-icon-wrap svg,
        .nav-item[data-nav="cart"] .nav-icon-wrap svg,
        .global-mobile-nav__item[data-nav="cart"] .nav-icon-wrap svg {
          color: #234b78 !important;
        }

        #bottomNav .nav-badge,
        .nav-badge,
        .global-mobile-nav__badge {
          position: absolute !important;
          top: -5px !important;
          right: -6px !important;
          min-width: 18px !important;
          height: 18px !important;
          padding: 0 4px !important;
          border-radius: 999px !important;
          background: #234b78 !important;
          color: #fff !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 2px solid #ffffff !important;
          box-shadow: 0 1px 3px rgba(15, 23, 42, .18) !important;
          animation: navBadgePop .22s ease-out !important;
        }

        @keyframes navBadgePop {
          0%   { transform: scale(.4); opacity: 0; }
          70%  { transform: scale(1.18); }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Order Peek bar (arriba del dock) */
        .catalog-order-peek {
          position: absolute !important;
          bottom: calc(100% + 9px) !important;
          left: 10px !important;
          right: 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 10px !important;
          text-align: left !important;
          padding: 11px 16px !important;
          background: #234b78 !important;
          border: 1px solid rgba(255, 255, 255, 0.23) !important;
          color: #fff !important;
          border-radius: 15px !important;
          box-shadow: 0 6px 18px rgba(35, 75, 120, 0.25) !important;
          cursor: pointer !important;
          -webkit-tap-highlight-color: transparent !important;
          animation: navSlideUp .3s cubic-bezier(.16, 1, .3, 1) both !important;
        }

        .catalog-order-peek[hidden] {
          display: none !important;
        }

        .catalog-order-peek span,
        .catalog-order-peek #catalogOrderCount {
          font-size: 11px !important;
          color: #d4e5f6 !important;
          font-weight: 600 !important;
        }

        .catalog-order-peek strong,
        .catalog-order-peek #catalogOrderTotal {
          font-size: 13px !important;
          font-weight: 800 !important;
          color: #fff !important;
        }

        .catalog-order-peek > div:last-child {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
        }

        .catalog-order-peek svg {
          width: 16px !important;
          height: 16px !important;
          color: #fff !important;
        }

        /* Botón de pago / status de pedido dentro del dock */
        .global-mobile-nav__pay {
          display: flex !important;
          flex: 1 1 0 !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 0 !important;
          height: 60px !important;
          border-radius: 16px !important;
          background: #d97706 !important;
          color: #ffffff !important;
          font-weight: 700 !important;
          font-size: 10px !important;
          gap: 4px !important;
          padding: 5px 2px !important;
          text-decoration: none !important;
          transition: transform .15s ease !important;
        }
        .global-mobile-nav__pay:active { transform: scale(0.92) !important; }
        .global-mobile-nav__pay--review { background: #2563eb !important; }
        .global-mobile-nav__pay--confirmed { background: #059669 !important; }
        .global-mobile-nav__pay--shipped { background: #7c3aed !important; }
        .global-mobile-nav__pay--delivered { background: #0e7490 !important; }
        .global-mobile-nav__pay svg { flex-shrink: 0 !important; width: 22px !important; height: 22px !important; }
        .global-mobile-nav__pay span { white-space: nowrap !important; font-size: 10px !important; font-weight: 700 !important; }
        .global-mobile-nav__pay-particles, .global-mobile-nav__pay .ck-shimmer-line { display: none !important; }

        /* Cinta de pago (PC) — oculta en móvil, visible >= 900px */
        .global-pay-ribbon {
          display: none !important; position: fixed !important; z-index: 2147483001 !important;
          top: 0 !important; left: 0 !important; right: 0 !important;
          width: 100vw !important; max-width: 100vw !important; height: 44px !important;
          align-items: center !important; justify-content: center !important; box-sizing: border-box !important;
          padding: 0 20px !important; text-decoration: none !important; color: #fff !important;
          background: linear-gradient(135deg,#f59e0b,#d97706,#f59e0b,#d97706,#f59e0b) !important;
          box-shadow: 0 2px 12px rgba(245,158,11,.35) !important;
        }
        .global-pay-ribbon:hover { filter: brightness(1.03) !important; }
        .global-pay-ribbon--review {
          background: linear-gradient(135deg,#2563eb,#1d4ed8,#2563eb,#1d4ed8,#2563eb) !important;
          box-shadow: 0 2px 12px rgba(37,99,235,.35) !important;
        }
        .global-pay-ribbon--confirmed {
          background: linear-gradient(135deg,#22c55e,#16a34a,#22c55e,#16a34a,#22c55e) !important;
          box-shadow: 0 2px 12px rgba(22,163,74,.35) !important;
        }
        .global-pay-ribbon--shipped {
          background: linear-gradient(135deg,#8b5cf6,#7c3aed,#8b5cf6,#7c3aed,#8b5cf6) !important;
          box-shadow: 0 2px 12px rgba(139,92,246,.35) !important;
        }
        .global-pay-ribbon--delivered {
          background: linear-gradient(135deg,#0891b2,#0e7490,#0891b2,#0e7490,#0891b2) !important;
          box-shadow: 0 2px 12px rgba(8,145,178,.35) !important;
        }
        .global-pay-ribbon__inner {
          display: inline-flex !important; align-items: center !important; gap: 10px !important;
          font-size: 14px !important; font-weight: 600 !important; line-height: 1 !important;
        }
        .global-pay-ribbon__inner strong { font-weight: 800 !important; }
        .global-pay-ribbon__count {
          display: inline-flex !important; align-items: center !important; justify-content: center !important;
          min-width: 20px !important; height: 20px !important; padding: 0 6px !important;
          border-radius: 999px !important; background: rgba(255,255,255,.25) !important;
          font-size: 12px !important; font-weight: 800 !important;
        }
        /* ── Particles (orbs, sparkles, trails, shimmer) ── */
        .global-pay-ribbon { overflow: hidden !important; background-size: 300% 300% !important; animation: ckBtnShift 3s ease infinite !important; }
        .global-pay-ribbon__particles { position: absolute !important; inset: 0 !important; overflow: hidden !important; pointer-events: none !important; }
        .ck-shimmer-line {
          position: absolute !important; top: 0 !important; bottom: 0 !important;
          width: 40% !important;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent) !important;
          animation: ckShimmer 2.5s ease-in-out infinite !important;
          pointer-events: none !important; z-index: 1 !important;
        }
        .ck-orb {
          position: absolute !important; border-radius: 50% !important;
          background: radial-gradient(circle, rgba(255,255,255,0.9), rgba(255,255,255,0.1)) !important;
          box-shadow: 0 0 6px rgba(255,255,255,0.5) !important;
          animation: ckOrbFloat 2.8s ease-in-out infinite !important;
        }
        .ck-orb:nth-child(1) { width: 8px !important; height: 8px !important; left: 8% !important; bottom: 4px !important; animation-delay: 0s !important; }
        .ck-orb:nth-child(2) { width: 5px !important; height: 5px !important; left: 22% !important; bottom: 2px !important; animation-delay: 0.4s !important; }
        .ck-orb:nth-child(3) { width: 10px !important; height: 10px !important; left: 38% !important; bottom: 6px !important; animation-delay: 0.8s !important; }
        .ck-orb:nth-child(4) { width: 6px !important; height: 6px !important; left: 52% !important; bottom: 3px !important; animation-delay: 1.2s !important; }
        .ck-orb:nth-child(5) { width: 7px !important; height: 7px !important; left: 68% !important; bottom: 5px !important; animation-delay: 1.6s !important; }
        .ck-orb:nth-child(6) { width: 4px !important; height: 4px !important; left: 82% !important; bottom: 2px !important; animation-delay: 2s !important; }
        .ck-orb:nth-child(7) { width: 9px !important; height: 9px !important; left: 92% !important; bottom: 4px !important; animation-delay: 2.4s !important; }
        .ck-sparkle {
          position: absolute !important; width: 4px !important; height: 4px !important;
          background: white !important;
          clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%) !important;
          animation: ckSparkle 2s ease-in-out infinite !important;
          filter: drop-shadow(0 0 3px rgba(255,255,255,0.8)) !important;
        }
        .ck-sparkle:nth-child(8) { left: 15% !important; top: 30% !important; animation-delay: 0s !important; }
        .ck-sparkle:nth-child(9) { left: 45% !important; top: 20% !important; animation-delay: 0.7s !important; width: 5px !important; height: 5px !important; }
        .ck-sparkle:nth-child(10) { left: 75% !important; top: 40% !important; animation-delay: 1.4s !important; }
        .ck-sparkle:nth-child(11) { left: 30% !important; top: 55% !important; animation-delay: 0.3s !important; width: 3px !important; height: 3px !important; }
        .ck-sparkle:nth-child(12) { left: 60% !important; top: 15% !important; animation-delay: 1s !important; }
        .ck-trail {
          position: absolute !important; height: 2px !important; width: 20px !important;
          border-radius: 2px !important;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent) !important;
          animation: ckTrail 2.5s ease-in-out infinite !important;
        }
        .ck-trail:nth-child(13) { left: 5% !important; top: 45% !important; animation-delay: 0s !important; }
        .ck-trail:nth-child(14) { left: 35% !important; top: 35% !important; animation-delay: 0.8s !important; }
        .ck-trail:nth-child(15) { left: 65% !important; top: 50% !important; animation-delay: 1.6s !important; }
        @keyframes ckBtnShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes ckOrbFloat { 0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; } 10% { opacity: 0.9; } 50% { transform: translateY(-22px) translateX(8px) scale(1.4); opacity: 1; } 90% { opacity: 0.7; } 100% { transform: translateY(-44px) translateX(-4px) scale(0.6); opacity: 0; } }
        @keyframes ckSparkle { 0% { transform: scale(0) rotate(0deg); opacity: 0; } 20% { transform: scale(1.2) rotate(90deg); opacity: 1; } 50% { transform: scale(0.8) rotate(180deg); opacity: 0.8; } 80% { transform: scale(1.1) rotate(270deg); opacity: 0.5; } 100% { transform: scale(0) rotate(360deg); opacity: 0; } }
        @keyframes ckTrail { 0% { transform: translateX(0) scaleX(1); opacity: 0.8; } 50% { transform: translateX(20px) scaleX(1.5); opacity: 0.4; } 100% { transform: translateX(40px) scaleX(0); opacity: 0; } }
        @keyframes ckShimmer { 0% { left: -40%; } 100% { left: 110%; } }
        @media (max-width: 899px) {
          body { padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; }
          footer-group, .footer-group, footer { padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; }
          .nb23-tabbar { display: none !important; }
        }
        @media (min-width: 900px) {
          .nav-bottom,
          .global-mobile-nav { display: none !important; }
          .global-pay-ribbon { display: flex !important; }
        }
      `}</style>
    </>
  );
}
