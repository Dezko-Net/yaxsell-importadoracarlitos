import type { Metadata, Viewport } from 'next';
import './globals.css';
import './mobile-responsive.css';

import { CartProvider } from '@/context/CartContext';
import { TemplateProvider } from '@/context/TemplateContext';
import { AuthProvider } from '@/hooks/useAuth';
import { FavoritesProvider } from '@/context/FavoritesContext';
import StoreShell from '@/components/StoreShell';
import ChatBot from '@/components/ChatBot';
import BackToTop from '@/components/BackToTop';
import { ToastProvider } from '@/components/Toast';
import { NotificationProvider } from '@/context/NotificationContext';
import ScrollToTop from '@/components/ScrollToTop';
import HomeOnlyWidgets from '@/components/HomeOnlyWidgets';
import ClientFetchCache from '@/components/ClientFetchCache';
import GlobalMobileNav from '@/components/GlobalMobileNav';
import CartDrawerHost from '@/components/CartDrawerHost';
import ClientSideWidgets from '@/components/ClientSideWidgets';

export const metadata: Metadata = {
  metadataBase: new URL('https://yaxsell.cl'),
  title: {
    default: 'Importadora Carlitos',
    template: '%s | Importadora Carlitos',
  },
  description:
    'Importadora Carlitos: perfumes, ropa y más en un solo catálogo. Explora productos y compra online en Chile.',
  alternates: { canonical: 'https://yaxsell.cl/' },
  keywords: [
    'Importadora Carlitos', 'perfumes', 'ropa', 'catálogo online Chile',
  ],
  icons: {
    icon: '/images/optimized/logo-carlitos.svg',
    apple: '/images/optimized/logo-carlitos.svg',
    shortcut: '/images/optimized/logo-carlitos.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'Importadora Carlitos',
    title: 'Importadora Carlitos',
    description:
      'Perfumes, ropa y más en el catálogo de Importadora Carlitos. Compra online en Chile.',
    url: 'https://yaxsell.cl/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* Force one-time hard reload for all users after deploy to clear stale chunks */}
        {/* biome-ignore lint: intentional dangerouslySetInnerHTML for cache-busting */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var v='kc_force_reload_v2';var s=sessionStorage.getItem(v);if(!s){sessionStorage.setItem(v,'1');if(window.performance&&window.performance.navigation&&window.performance.navigation.type!==1){window.location.reload(true);}}}catch(e){}})();` }} />
        {/* Handler global: oculta imágenes rotas con placeholder de iniciales */}
        {/* biome-ignore lint: intentional dangerouslySetInnerHTML for global img error handler */}
        <script dangerouslySetInnerHTML={{ __html: `document.addEventListener('error',function(e){var el=e.target;if(el&&el.tagName==='IMG'&&!el.dataset.badImg){el.dataset.badImg='1';el.style.visibility='hidden';el.setAttribute('aria-hidden','true');}},true);` }} />
        {/* Silenciar errores de theme.js (RoarTheme/Pebble/Shopify) cuando el header no está presente (ej. /login, /admin) */}
        {/* biome-ignore lint: intentional dangerouslySetInnerHTML for error suppression */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(!document.querySelector('mouse-cursor')){var mc=document.createElement('mouse-cursor');mc.style.display='none';mc.setAttribute('aria-hidden','true');(document.body||document.documentElement).appendChild(mc);}}catch(e){}function suppressThemeError(e){var msg=e&&e.message||e&&e.reason&&e.reason.message||'';if(typeof msg==='string'&&(msg.indexOf("classList")!==-1||msg.indexOf("Cannot read properties of null")!==-1)){if(e.preventDefault){e.preventDefault();}if(e.stopPropagation){e.stopPropagation();}return true;}return false;}window.addEventListener('error',suppressThemeError,true);window.addEventListener('unhandledrejection',suppressThemeError,true);var origError=window.onerror;window.onerror=function(msg,src,line,col,err){if(typeof msg==='string'&&(msg.indexOf("classList")!==-1||msg.indexOf("Cannot read properties of null")!==-1)){return true;}if(origError){return origError.apply(this,arguments);}};var origDesc=Object.getOwnPropertyDescriptor(Element.prototype,'classList');if(origDesc&&origDesc.get){var origGet=origDesc.get;Object.defineProperty(Element.prototype,'classList',{get:function(){try{return origGet.call(this);}catch(e){return{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;},replace:function(){return false;}};}},set:origDesc.set,configurable:origDesc.configurable});}})();` }} />
      </head>
      <body>
        {/* Fallback mouse-cursor para scripts de Shopify Concept theme */}
        <div id="mouseCursorMount" style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: '<mouse-cursor style="display:none" aria-hidden="true"></mouse-cursor>' }} />
        <ClientFetchCache />
        <AuthProvider>
          <ToastProvider>
            <NotificationProvider>
              <FavoritesProvider>
                <CartProvider>
                  <TemplateProvider>
                    <StoreShell>{children}</StoreShell>
                    <GlobalMobileNav />
                    <CartDrawerHost />
                    <HomeOnlyWidgets />
                    <ClientSideWidgets />
                    <BackToTop />
                    <ScrollToTop />
                  </TemplateProvider>
                </CartProvider>
              </FavoritesProvider>
            </NotificationProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

