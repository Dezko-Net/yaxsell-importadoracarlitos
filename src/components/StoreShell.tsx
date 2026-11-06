'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import DynamicNavbar from '@/components/DynamicNavbar';
import NewsletterSignup from '@/components/NewsletterSignup';
import AnnouncementBar from '@/components/AnnouncementBar';
import MaintenanceGuard from '@/components/MaintenanceGuard';
import PageTransition from '@/components/PageTransition';
import { useTemplate } from '@/context/TemplateContext';

const FOOTER_LINKS = [
  { title: 'Tienda', items: [
    { label: 'Productos', href: '/productos' },
    { label: 'Mis Pedidos', href: '/cuenta/pedidos' },
    { label: 'Clips', href: '/clips' },
  ]},
  { title: 'Mi cuenta', items: [
    { label: 'Mis pedidos', href: '/cuenta/pedidos' },
    { label: 'Favoritos', href: '/favoritos' },
    { label: 'Direcciones', href: '/cuenta/direcciones' },
    { label: 'Notificaciones', href: '/cuenta/notificaciones' },
  ]},
  { title: 'Ayuda', items: [
    { label: 'Soporte', href: '/cuenta/tickets' },
    { label: 'Comparar', href: '/comparar' },
  ]},
];

import GlobalCanjeBanner from '@/components/GlobalCanjeBanner';
import PopupBanner from '@/components/PopupBanner';

export default function StoreShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { getSectionTemplate } = useTemplate();
  const isAdmin =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/vendor') ||
    pathname.startsWith('/pos-admin') ||
    pathname.startsWith('/pos') ||
    pathname.startsWith('/erp') ||
    pathname.startsWith('/cuadres') ||
    pathname.startsWith('/base-datos') ||
    pathname.startsWith('/inventario') ||
    pathname.startsWith('/control-datos') ||
    pathname.startsWith('/admin-supreme');
  const isAuth        = pathname.startsWith('/login');
  const isCatalogo    = pathname === '/' || pathname.startsWith('/catalogo') || pathname.startsWith('/productos') || pathname.startsWith('/favoritos') || pathname.startsWith('/cuenta');
  // Flujo de checkout y post-checkout: páginas dedicadas sin navbar ni footer.
  const isCheckoutFlow =
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/confirmar-pedido') ||
    pathname.startsWith('/verificar-stock') ||
    pathname.startsWith('/pedido') ||
    pathname.startsWith('/comprobante') ||
    pathname.startsWith('/datos-envio');
  // Link in bio: página autónoma a pantalla completa, sin navbar ni footer.
  const isLinktree     = pathname.startsWith('/linktree');
  // La política debe responder públicamente incluso si la tienda está en mantenimiento.
  const isPrivacyPage = pathname === '/privacidad';
  if (isAdmin || isAuth || isPrivacyPage) {
    return <>{children}</>;
  }

  /* Templates 1 (Shopify-Venice), 4 (Chinamart) y 5 (Pebble Little) tienen su propio footer en el HTML migrado */
  const hideNativeFooter = true; // Hidden for all templates because we use the injected HTML footer

  if (isCatalogo || isCheckoutFlow || isLinktree) {
    return <>{children}</>;
  }

  // Plantilla 25 (Concept Theme) trae su propio navbar/header completo.
  // Ocultar el navbar nativo y overlays cuando esté activa en la home.
  const landingTpl = getSectionTemplate('landing');
  const isFullTemplateHome = pathname === '/' && landingTpl === 25;
  if (isFullTemplateHome) {
    return (
      <MaintenanceGuard>
        <main style={{ opacity: 1, paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>{children}</main>
      </MaintenanceGuard>
    );
  }

  return (
    <MaintenanceGuard>
    <>
      <GlobalCanjeBanner />
      {pathname === '/' && <PopupBanner />}
      <DynamicNavbar />
      <PageTransition><main style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>{children}</main></PageTransition>
      {!hideNativeFooter && (
      <footer className="store-footer" style={{ background: '#f9f9f9', color: '#374151', borderTop: '1px solid #e5e7eb', marginTop: 40 }}>
        <div className="store-footer-grid" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 5% 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
          {FOOTER_LINKS.map(group => (
            <div key={group.title} className="store-footer-col">
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#111827' }}>{group.title}</h4>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {group.items.map(item => (
                  <li key={item.label} style={{ marginBottom: 6 }}>
                    <Link href={item.href} style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', transition: 'color .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#111827')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="store-footer-newsletter">
            <NewsletterSignup />
          </div>
        </div>
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '16px 5%', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
            © {new Date().getFullYear()} Tienda Online · Todos los derechos reservados
          </p>
        </div>
      </footer>
      )}
    </>
    </MaintenanceGuard>
  );
}
