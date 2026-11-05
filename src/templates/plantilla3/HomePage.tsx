'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION } from '@/lib/firebase-compat';
import { Query } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { usePrimaryAddress } from '@/hooks/usePrimaryAddress';
import { useCart } from '@/context/CartContext';

function getSubcategoryEmoji(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('labial') || n.includes('labio') || n.includes('lip') || n.includes('gloss') || n.includes('tinta')) return '💄';
  if (n.includes('ojo') || n.includes('sombra') || n.includes('pestaña') || n.includes('mascara') || n.includes('eyeliner') || n.includes('ceja') || n.includes('rimel')) return '👁️';
  if (n.includes('facial') || n.includes('rostro') || n.includes('cara') || n.includes('piel') || n.includes('skincare')) return '🧴';
  if (n.includes('serum') || n.includes('sérum') || n.includes('acido') || n.includes('ácido') || n.includes('gotas') || n.includes('concentrado')) return '✨';
  if (n.includes('crema') || n.includes('hidrat') || n.includes('locion') || n.includes('loción') || n.includes('balsamo')) return '💧';
  if (n.includes('uñas') || n.includes('uña') || n.includes('esmalte') || n.includes('nail')) return '💅';
  if (n.includes('perfume') || n.includes('fragancia') || n.includes('colonia') || n.includes('aroma') || n.includes('body splash')) return '🌸';
  if (n.includes('limpie') || n.includes('jabon') || n.includes('jabón') || n.includes('espuma') || n.includes('micelar') || n.includes('tonico') || n.includes('tónico')) return '🧼';
  if (n.includes('mascar') || n.includes('mask') || n.includes('parche')) return '🧖';
  if (n.includes('cabello') || n.includes('pelo') || n.includes('capilar') || n.includes('shampoo') || n.includes('acondicionador') || n.includes('aceite')) return '💆';
  if (n.includes('brocha') || n.includes('pincel') || n.includes('esponja') || n.includes('accesorio') || n.includes('beauty blender')) return '🖌️';
  if (n.includes('solar') || n.includes('protector') || n.includes('bloqueador') || n.includes('fps')) return '☀️';
  if (n.includes('pack') || n.includes('set') || n.includes('kit') || n.includes('combo') || n.includes('caja') || n.includes('regalo')) return '🎁';
  if (n.includes('hombre') || n.includes('barba') || n.includes('men')) return '🧔';
  if (n.includes('corporal') || n.includes('cuerpo') || n.includes('exfolian')) return '🫧';
  if (n.includes('oferta') || n.includes('promo') || n.includes('descuento') || n.includes('liquid') || n.includes('outlet')) return '🔥';
  return '✨';
}

export default function HomePage3() {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { primaryAddress } = usePrimaryAddress();
  const { user, isLoggedIn } = useAuth();
  const { totalItems } = useCart();

  // Estados para datos dinámicos del menú
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);

  // 1. Cargar categorías de la base de datos (con caché local de 24h y API CDN para 0 lecturas)
  useEffect(() => {
    const MENU_CACHE_KEY = 'yaxsell_p3_menu_cats_v2';
    const MENU_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

    // Intento 1: Leer desde localStorage
    try {
      const cached = localStorage.getItem(MENU_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.timestamp && (Date.now() - parsed.timestamp < MENU_CACHE_TTL) && Array.isArray(parsed.categories)) {
          setCategories(parsed.categories);
          setSubcategories(parsed.subcategories || []);
          return;
        }
      }
    } catch {}

    const fetchMenuData = async () => {
      try {
        // Intento 2: Usar endpoint CDN cacheado en memoria del servidor (0 lecturas)
        const res = await fetch('/api/public-data/home');
        if (res.ok) {
          const homeData = await res.json();
          if (Array.isArray(homeData?.categories) && homeData.categories.length > 0) {
            setCategories(homeData.categories);
            setSubcategories(homeData.subcategories || []);
            try {
              localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                categories: homeData.categories,
                subcategories: homeData.subcategories || [],
              }));
            } catch {}
            return;
          }
        }

        // Intento 3: Fallback si la API falla
        const { databases } = getServices();
        const cfg = getFirebaseConfig();

        const [catRes, subRes] = await Promise.all([
          databases.listDocuments(cfg.databaseId, CATEGORIES_COLLECTION, [Query.limit(50)]),
          databases.listDocuments(cfg.databaseId, SUBCATEGORIES_COLLECTION, [Query.limit(200)]),
        ]);

        const cats = catRes.documents || [];
        const subs = subRes.documents || [];
        setCategories(cats);
        setSubcategories(subs);

        try {
          localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            categories: cats,
            subcategories: subs,
          }));
        } catch {}
      } catch (err) {
        console.warn('[Plantilla 3] Error cargando datos de menú:', err);
      }
    };
    fetchMenuData();
  }, []);

  // 2. Inyectar stubs Shopify mínimos, clases y estilos requeridos
  useEffect(() => {
    document.documentElement.dataset.template = 'index';
    document.documentElement.classList.add('js');
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    document.documentElement.classList.add(isTouch ? 'touch' : 'no-touch');

    document.body.classList.add('template-index');
    document.body.setAttribute('data-rounded-button', 'round');
    document.body.setAttribute('data-rounded-input', 'round-slight');
    document.body.setAttribute('data-rounded-block', 'round');
    document.body.setAttribute('data-rounded-card', 'round');

    const idStubs = 'tpl3-stubs-head';
    if (!document.getElementById(idStubs)) {
      const script = document.createElement('script');
      script.id = idStubs;
      script.textContent = `
        window.theme = window.theme || {};
        window.theme.strings = {
          addToCart: "Add to cart",
          soldOut: "Sold out",
          unavailable: "Unavailable",
        };
        window.theme.moneyFormat = '$' + '{{amount}}';
        var theme = window.theme;
        
        window.jdgmSettings = window.jdgmSettings || {};
        var jdgmSettings = window.jdgmSettings;
        
        window.__sections__ = window.__sections__ || {
          "featured-products": true,
          "footer": true,
          "main-product": true,
          "promotional-bar": true,
          "text-with-icon": true,
          "video": true
        };
      `;
      document.head.appendChild(script);
    }

    const idSectionsScript = 'sections-script';
    if (!document.getElementById(idSectionsScript)) {
      const script = document.createElement('script');
      script.id = idSectionsScript;
      script.setAttribute('data-sections', 'promotional-bar,text-with-icon,countdown,footer');
      script.defer = true;
      document.head.appendChild(script);
    }

    // Estilos forzados para NAVBAR 100% BLANCO Y NEGRO SÓLIDO SIN TRANSPARENCIAS NI CORTINAS
    const idCustomStyles = 'tpl3-custom-styles';
    if (!document.getElementById(idCustomStyles)) {
      const style = document.createElement('style');
      style.id = idCustomStyles;
      style.textContent = `
        /* ─── NAVBAR ALWAYS SOLID WHITE & BLACK ─── */
        .section-header,
        header#shopify-section-sections--18996101087480__header,
        .header,
        sticky-on-scroll.header,
        .header.desktop-transparent,
        .header.mobile-transparent,
        .header.is-sticky {
          background-color: #ffffff !important;
          background: #ffffff !important;
          color: #000000 !important;
          position: sticky !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          z-index: 99999 !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08) !important;
          border-bottom: 1px solid #e5e7eb !important;
          opacity: 1 !important;
          transform: none !important;
        }

        .header::before {
          display: none !important;
          content: none !important;
        }

        .header--wrapper {
          background: #ffffff !important;
          min-height: 65px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
        }

        .header--menu-link,
        .header--menu-link:visited,
        .header--logo-text,
        .header--icon-link-text {
          color: #000000 !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          letter-spacing: 0.01em !important;
          transition: color 0.15s ease !important;
        }

        .header:not(.is-sticky).desktop-transparent:not(:hover) .header--menu-link,
        .header:not(.is-sticky).desktop-transparent:not(:hover) .header--logo-text,
        .header:not(.is-sticky).desktop-transparent:not(:hover) .header--icon-link-text,
        .header:not(.is-sticky).mobile-transparent:not(:hover) .header--menu-link {
          color: #000000 !important;
        }

        .header:not(.is-sticky).desktop-transparent:not(:hover) .header--logo-img,
        .header:not(.is-sticky).mobile-transparent:not(:hover) .header--logo-img,
        .header--logo-img {
          opacity: 1 !important;
          display: inline-block !important;
          filter: none !important;
        }

        .header:not(.is-sticky).desktop-transparent:not(:hover) .transparent-logo-img,
        .header:not(.is-sticky).mobile-transparent:not(:hover) .transparent-logo-img,
        .transparent-logo-img {
          display: none !important;
        }

        .header--menu-link:hover,
        .header--icon-link-text:hover {
          color: #f96302 !important;
        }

        .hamburger--toggler-icon .line {
          background: #000000 !important;
        }

        .location-pill {
          background: #f3f4f6 !important;
          color: #111827 !important;
          border: 1px solid #e5e7eb !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .location-pill:hover {
          background: rgba(249, 99, 2, 0.08) !important;
          border-color: #f96302 !important;
          color: #f96302 !important;
        }

        .header--icon-item.favorites a svg {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .header--icon-item.favorites a:hover svg {
          color: #e11d48 !important;
          fill: #e11d48 !important;
        }

        /* ─── ELIMINACIÓN DE CORTINA BLANCA: DRAWERS Y MEGAMENÚS OCULTOS ─── */
        .side-drawer:not(.show),
        account-drawer:not(.show),
        cart-drawer:not(.show),
        search-drawer:not(.show),
        mobile-menu:not(.show),
        .header--wrapper .side-drawer:not(.show),
        .header--menu-megamenu,
        .megamenu-container {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
        }

        .side-drawer.show,
        account-drawer.show,
        cart-drawer.show,
        search-drawer.show,
        mobile-menu.show {
          display: flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: all !important;
          z-index: 1000000 !important;
        }

        /* Dropdowns limpios para Categorías y Colección */
        .header--menu-item.dropdown {
          position: relative !important;
        }

        .header--menu-item.dropdown .header--menu-submenu {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          position: absolute !important;
          top: 100% !important;
          left: 0 !important;
          min-width: 240px !important;
          max-height: 400px !important;
          overflow-y: auto !important;
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12) !important;
          padding: 8px !important;
          z-index: 999999 !important;
          pointer-events: none !important;
          transition: opacity 0.15s ease, transform 0.15s ease !important;
          transform: translateY(6px) !important;
        }

        .header--menu-item.dropdown:hover .header--menu-submenu {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: all !important;
          transform: translateY(0) !important;
        }

        .header--menu-submenu-list {
          list-style: none !important;
          margin: 0 !important;
          padding: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 2px !important;
        }

        .header--menu-submenu-link {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          padding: 8px 12px !important;
          border-radius: 8px !important;
          color: #1f2937 !important;
          font-size: 13.5px !important;
          font-weight: 500 !important;
          text-decoration: none !important;
          transition: all 0.15s ease !important;
          white-space: nowrap !important;
        }

        .header--menu-submenu-link:hover {
          background: #fff7ed !important;
          color: #f96302 !important;
          transform: translateX(4px) !important;
        }

        /* Sin espacio extra sobre el hero */
        body:after {
          display: none !important;
        }
        main#MainContent {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        .section-slideshow {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }

    if (!(window as any).Shopify) {
      (window as any).Shopify = {
        shop: 'theking-castle.myshopify.com',
        country: 'US',
        currency: 'USD',
        locale: 'es',
        theme: { name: 'The King Castle Captured', id: '3' },
        routes: { root_url: '/', cart_url: '/carrito', search_url: '/productos' },
      };
    }

    const origFetch = window.fetch.bind(window);
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const isShopify = url.includes('/products/') || url.includes('/cart') || url.includes('/search') || url.includes('/recommendations/');
      if (isShopify && !url.includes('/shopify/')) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return origFetch(input, init);
    };

    return () => {
      delete document.documentElement.dataset.template;
      document.documentElement.classList.remove('js', 'touch', 'no-touch');
      document.body.classList.remove('template-index');
      window.fetch = origFetch;
      document.getElementById(idStubs)?.remove();
      document.getElementById(idSectionsScript)?.remove();
      document.getElementById(idCustomStyles)?.remove();
    };
  }, []);

  // 3. Cargar y procesar body-clean.html y manifest.json
  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setLoadError(null);

    const htmlPath = `/shopify/plantilla3/body-clean.html?v=${Date.now()}`;
    const manifestPath = `/shopify/plantilla3/manifest.json?v=${Date.now()}`;

    Promise.all([
      fetch(htmlPath, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`HTML ${r.status}`);
        return r.text();
      }),
      fetch(manifestPath, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`Manifest ${r.status}`);
        return r.json();
      })
    ])
    .then(([htmlText, manifest]) => {
      if (aborted) return;

      let processedHtml = htmlText;

      const stubsJs = `
        <script id="tpl3-stubs-critical">
          window.theme = window.theme || {};
          window.theme.strings = {
            addToCart: "Add to cart",
            soldOut: "Sold out",
            unavailable: "Unavailable",
          };
          window.theme.moneyFormat = '$' + '{{amount}}';
          var theme = window.theme;
          
          window.jdgmSettings = window.jdgmSettings || {};
          var jdgmSettings = window.jdgmSettings;
        </script>
      `;
      processedHtml = stubsJs + processedHtml;

      setBodyHtml(processedHtml);

      // Cargar scripts JS secuencialmente
      const jsFiles = manifest.js || [];
      const folderPath = '/shopify/plantilla3';
      const jsUrls = jsFiles
        .filter((f: string) => f && !f.includes('cart-drawer.js'))
        .map((f: string) => (f.startsWith('/') ? f : `${folderPath}/${f}`));

      const loadJsSequentially = async () => {
        for (const src of jsUrls) {
          if (document.querySelector(`script[src^="${src}"]`)) continue;
          await new Promise<void>((resolve) => {
            const script = document.createElement('script');
            script.src = `${src}?v=${Date.now()}`;
            if (src.includes('localization-form') || src.includes('cart-drawer')) {
              script.type = 'module';
            } else {
              script.async = false;
            }
            script.onload = () => resolve();
            script.onerror = () => resolve();
            document.body.appendChild(script);
          });
        }

        setTimeout(() => {
          try {
            document.querySelectorAll('.animation-element, .animation-wrapper, .reveal-element, [data-animate-delay]').forEach(el => {
              el.classList.add('in-view');
            });
            document.querySelectorAll('video').forEach(video => {
              video.muted = true;
              video.play().catch(() => {});
            });
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new Event('scroll'));
          } catch (e) {}
        }, 500);
      };

      loadJsSequentially();
      setLoading(false);
    })
    .catch(err => {
      if (aborted) return;
      console.error('[Plantilla 3] Error cargando portada:', err);
      setLoadError(err.message || 'Error al cargar plantilla');
      setLoading(false);
    });

    return () => {
      aborted = true;
    };
  }, []);

  // 4. Inyectar Menú Dinámico: Catálogo, Categorías, Colección (Subcategorías con Emojis), Catálogo Web, Catálogo de WhatsApp
  useEffect(() => {
    if (!bodyHtml || categories.length === 0 || !containerRef.current) return;

    const navList = containerRef.current.querySelector('ul.header--navigation-list');
    if (navList) {
      const categoriesItems = categories.map(cat => {
        const catId = cat.$id || cat.id;
        const catName = cat.name || cat.NAME;
        return `
          <li class="header--menu-submenu-item">
            <a href="/collections/${catId}" class="header--menu-submenu-link">
              <span>${catName}</span>
            </a>
          </li>
        `;
      }).join('');

      const subcategoriesItems = subcategories.length > 0
        ? subcategories.map(sub => {
            const subName = sub.name || sub.NAME || '';
            const emoji = getSubcategoryEmoji(subName);
            const catId = sub.categoryId || sub.CATEGORYID || 'all';
            const subId = sub.$id || sub.id;
            return `
              <li class="header--menu-submenu-item">
                <a href="/collections/${catId}?sub=${subId}" class="header--menu-submenu-link">
                  <span>${emoji} ${subName}</span>
                </a>
              </li>
            `;
          }).join('')
        : categories.map(cat => {
            const catId = cat.$id || cat.id;
            const catName = cat.name || cat.NAME;
            return `
              <li class="header--menu-submenu-item">
                <a href="/collections/${catId}" class="header--menu-submenu-link">
                  <span>✨ ${catName}</span>
                </a>
              </li>
            `;
          }).join('');

      const menuHtml = `
        <!-- Item 1: Catálogo -->
        <li class="header--menu-item">
          <a class="header--menu-link heading-font text" href="/collections/all">Catálogo</a>
        </li>
        
        <!-- Item 2: Categorías (Dropdown) -->
        <li class="header--menu-item has-children dropdown">
          <a href="/collections" class="header--menu-link heading-font text">
            Categorías
            <svg width="8" height="6" viewBox="0 0 8 6"><path d="m1 1.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"></path></svg>
          </a>
          <div class="header--menu-submenu">
            <ul class="header--menu-submenu-list">
              ${categoriesItems}
            </ul>
          </div>
        </li>

        <!-- Item 3: Colección (Subcategorías con Emojis) -->
        <li class="header--menu-item has-children dropdown">
          <a href="/collections/all" class="header--menu-link heading-font text">
            Colección
            <svg width="8" height="6" viewBox="0 0 8 6"><path d="m1 1.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"></path></svg>
          </a>
          <div class="header--menu-submenu">
            <ul class="header--menu-submenu-list">
              ${subcategoriesItems}
            </ul>
          </div>
        </li>

        <!-- Item 4: Catálogo Web -->
        <li class="header--menu-item">
          <a class="header--menu-link heading-font text" href="/productos">Catálogo Web</a>
        </li>

        <!-- Item 5: Catálogo de WhatsApp -->
        <li class="header--menu-item">
          <a 
            class="header--menu-link heading-font text" 
            href="https://wa.me/56900000000?text=Hola%2C%20quisiera%20ver%20el%20cat%C3%A1logo%20de%20productos%20por%20WhatsApp" 
            target="_blank" 
            rel="noopener noreferrer"
            style="color: #25D366 !important; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"
          >
            <span>📱</span> Catálogo de WhatsApp
          </a>
        </li>
      `;

      navList.innerHTML = menuHtml;
    }
  }, [bodyHtml, categories, subcategories]);

  // 5. Inyectar Iconos del Header (Búsqueda, Ubicación, Favoritos, Cuenta, Carrito)
  useEffect(() => {
    if (!bodyHtml || !containerRef.current) return;

    const iconsList = containerRef.current.querySelector('ul.header--icons-list');
    if (iconsList) {
      iconsList.innerHTML = `
        <li class="header--icon-item search">
          <list-set
            class="header--icon-link"
            data-header-view="logo-left-menu-center"
            data-behaviour="drawer"
            data-source="search-drawer"
            is="hover-icons"
          >
            <a href="/productos" class="header--icon-link-text cursor-pointer" title="Buscar">
              <svg width="18" height="19" viewBox="0 0 18 19" fill="none">
                <path d="M7.96875 15.6875C11.9556 15.6875 15.1875 12.4556 15.1875 8.4688C15.1875 4.48194 11.9556 1.25 7.96875 1.25C3.98194 1.25 0.75 4.48194 0.75 8.4688C0.75 12.4556 3.98194 15.6875 7.96875 15.6875Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M13.0732 13.5742L17.2497 17.7508" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </a>
          </list-set>
        </li>

        <li class="header--icon-item location d-none d-lg-flex">
          <a href="/cuenta" class="location-pill" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:9999px; font-size:12px; font-weight:500; text-decoration:none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #f96302;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>${primaryAddress || 'Seleccionar Comuna'}</span>
          </a>
        </li>

        <li class="header--icon-item favorites d-none d-md-flex">
          <a href="/cuenta?tab=favoritos" class="header--icon-link-text cursor-pointer" title="Favoritos">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </a>
        </li>

        <li class="header--icon-item account">
          <list-set
            class="header--icon-link"
            data-header-view="logo-left-menu-center"
            data-behaviour="drawer"
            data-source="account-drawer"
            is="hover-icons"
          >
            <a href="${isLoggedIn ? '/cuenta' : '/cuenta'}" class="header--icon-link-text cursor-pointer" title="Cuenta">
              <svg width="17" height="18" viewBox="0 0 17 18" fill="none">
                <path d="M8.5 9.15625C10.7954 9.15625 12.6563 7.29543 12.6563 5C12.6563 2.70457 10.7954 0.84375 8.5 0.84375C6.20457 0.84375 4.34375 2.70457 4.34375 5C4.34375 7.29543 6.20457 9.15625 8.5 9.15625Z" stroke="currentColor" stroke-width="1.5" />
                <path d="M15.5 16.375C15.5 12.509 12.366 9.375 8.5 9.375C4.634 9.375 1.5 12.509 1.5 16.375" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </a>
          </list-set>
        </li>

        <li class="header--icon-item cart">
          <list-set
            class="header--icon-link"
            data-header-view="logo-left-menu-center"
            data-behaviour="drawer"
            id="cart-count-icon"
            data-source="cart-drawer"
            is="hover-icons"
          >
            <a href="/carrito" class="header--icon-link-text cursor-pointer" aria-label="Cart with ${totalItems} items">
              <svg width="17" height="19" viewBox="0 0 17 19" fill="none" class="cart--icon">
                <path d="M13.8624 5.125H3.13686C2.21555 5.125 1.45202 5.83932 1.39074 6.75859L0.749072 16.3836C0.681732 17.3936 1.48288 18.25 2.49519 18.25H14.5041C15.5164 18.25 16.3176 17.3936 16.2502 16.3836L15.6086 6.75859C15.5472 5.83932 14.7837 5.125 13.8624 5.125Z" stroke="currentColor" stroke-width="1.5" />
                <path d="M12 7.75V4.25C12 2.317 10.433 0.75 8.5 0.75C6.567 0.75 5 2.317 5 4.25V7.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
              </svg>
              <span class="cart--count ${totalItems > 0 ? '' : 'hidden'}" data-cart-count="">${totalItems}</span>
            </a>
          </list-set>
        </li>
      `;
    }
  }, [bodyHtml, primaryAddress, isLoggedIn, totalItems]);

  // 6. Interceptar navegación para enlaces locales
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bodyHtml) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      // Si es un enlace externo (como WhatsApp), dejar que el navegador lo abra
      if (href.startsWith('http') || href.startsWith('https://wa.me')) {
        return;
      }

      if (target.closest('[data-behaviour="drawer"]') || target.closest('list-set') || target.closest('[data-drawer-trigger]')) {
        return;
      }

      if (href.startsWith('/') && !href.startsWith('/#')) {
        e.preventDefault();
        router.push(href);
      }
    };

    container.addEventListener('click', handleLinkClick);
    return () => {
      container.removeEventListener('click', handleLinkClick);
    };
  }, [bodyHtml, router]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        color: '#111827',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{
          width: 44,
          height: 44,
          border: '3px solid rgba(0,0,0,0.08)',
          borderTopColor: '#f96302',
          borderRadius: '50%',
          animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          marginBottom: 16
        }} />
        <p style={{ fontSize: 13, color: '#6b7280', letterSpacing: '0.05em', fontWeight: 500 }}>Cargando tienda...</p>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 32, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ color: '#dc2626', marginBottom: 8 }}>Error al cargar la tienda</h2>
        <p style={{ color: '#666' }}>No se pudo cargar el catálogo principal.</p>
        <p style={{ color: '#999', fontSize: 13, marginTop: 12 }}>Detalle: {loadError}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <div data-show-accordion="false" style={{ display: 'none' }} />
      <div 
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: bodyHtml || '' }}
      />
    </div>
  );
}
