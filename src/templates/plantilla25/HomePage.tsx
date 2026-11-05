'use client';
/* ════════════════════════════════════════════════════════════════════
   PLANTILLA 25 — Shopify Theme Capturado por FOLLA v2
   ──────────────────────────────────────────────────────────────────
   ⚠️  BOILERPLATE: Requiere revisión manual antes de usar.
   ──────────────────────────────────────────────────────────────────
   Estrategia:
   - Render del HTML body limpio via containerRef.innerHTML
   - Carga dinámica de CSS via <link> tags en <head>
   - Carga dinámica de JS via <script> tags secuenciales
   - Scripts inline de animación están en body-clean.html (se ejecutan al inyectar)
   - Scripts de Shopify problemáticos excluidos
   - .in-view forzado en .animation-element tras carga
   ════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/context/CartContext';
import {
  enhanceConceptHeader,
  enhanceConceptCombos,
  wireComboSectionEarly,
  syncConceptCartCount,
  type EnhCategory,
  type EnhSubcategory,
  type EnhFeaturedProduct,
  type ComboRealHydrationData,
} from './enhanceConceptHeader';
import { fixCloneBehaviour } from './fixCloneBehaviour';

const STORE_LOGO = '/images/optimized/logo-carlitos.svg';
const STORE_NAME = 'Importadora Carlitos';

type HomeMarketingConfig = {
  heroSlides?: { enabled?: boolean; desktopUrl?: string; mobileUrl?: string }[];
  newsBanner?: { enabled?: boolean; desktopUrl?: string; mobileUrl?: string };
};

function applyHomeMarketingToHtml(html: string, config?: HomeMarketingConfig): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const currentStoreDescription = 'Importadora Carlitos ofrece perfumes, ropa y una selección de productos para distintos gustos. Explora el catálogo y encuentra tus favoritos.';
  doc.querySelectorAll('p').forEach(paragraph => {
    if (/home products store|products for (?:your|the) home|kitchenware|home decor|audio equipment|art[ií]culos? (?:para|de)(?: el)? hogar|productos para el hogar|cosm[eé]tica|maquillaje|skincare/i.test(paragraph.textContent || '')) {
      paragraph.textContent = currentStoreDescription;
    }
  });
  if (!config) return doc.body.innerHTML;
  const slideshow = doc.querySelector('slideshow-element#Slider-template--27619508257049__slideshow');
  const configuredSlides = config.heroSlides || [];

  if (slideshow && configuredSlides.length > 0) {
    const banners = Array.from(slideshow.querySelectorAll<HTMLElement>(':scope > .banner'));
    const enabledIndexes = configuredSlides
      .map((slide, index) => slide.enabled !== false && (slide.desktopUrl || slide.mobileUrl) ? index : -1)
      .filter(index => index >= 0);
    const visibleIndexes = enabledIndexes.length > 0 ? enabledIndexes : [0];

    banners.forEach((banner, index) => {
      const slide = configuredSlides[index];
      if (!slide) return;
      const source = banner.querySelector<HTMLSourceElement>('picture source');
      const image = banner.querySelector<HTMLImageElement>('picture img');
      if (source && slide.mobileUrl) source.setAttribute('srcset', slide.mobileUrl);
      if (image && slide.desktopUrl) {
        image.setAttribute('src', slide.desktopUrl);
        image.removeAttribute('srcset');
      }
    });

    banners.forEach((banner, index) => {
      if (!visibleIndexes.includes(index)) banner.remove();
    });

    const words = Array.from(doc.querySelectorAll<HTMLElement>('.slideshow-words > .slideshow-word'));
    const dots = Array.from(doc.querySelectorAll<HTMLElement>('slider-dots .flickity-page-dot'));
    words.forEach((word, index) => {
      if (!visibleIndexes.includes(index)) word.remove();
      else word.dataset.index = String(visibleIndexes.indexOf(index));
    });
    dots.forEach((dot, index) => {
      if (!visibleIndexes.includes(index)) dot.remove();
      else dot.dataset.index = String(visibleIndexes.indexOf(index));
    });

    const firstSlide = configuredSlides[visibleIndexes[0]];
    const preloadMobile = doc.querySelector<HTMLLinkElement>('link[rel="preload"][media="(max-width: 767px)"]');
    const preloadDesktop = doc.querySelector<HTMLLinkElement>('link[rel="preload"][media="(min-width: 768px)"]');
    if (preloadMobile && firstSlide?.mobileUrl) preloadMobile.href = firstSlide.mobileUrl;
    if (preloadDesktop && firstSlide?.desktopUrl) preloadDesktop.href = firstSlide.desktopUrl;
  }

  const news = config.newsBanner;
  const newsBlock = doc.querySelector<HTMLElement>('.dbi-block');
  const newsBanner = newsBlock?.querySelector<HTMLElement>('.dbi-banner');
  const newsActions = newsBlock?.querySelector<HTMLElement>('.dbi-actions');
  if (newsBanner && news) {
    if (news.enabled === false) {
      newsBanner.style.display = 'none';
      if (newsActions) newsActions.style.display = 'none';
    } else {
      const source = newsBanner.querySelector<HTMLSourceElement>('picture source');
      const image = newsBanner.querySelector<HTMLImageElement>('picture img');
      if (source && news.desktopUrl) source.setAttribute('srcset', news.desktopUrl);
      if (image && news.mobileUrl) image.setAttribute('src', news.mobileUrl);
    }
  }

  return doc.body.innerHTML;
}

const SHOPIFY_BASE = '/shopify/plantilla25/assets';

/* ── Clases reales del <body> del theme original (capturadas por FOLLA) ── */
const CAPTURED_BODY_CLASS = 'template-index loaded';

/* ── CSS files: ORDEN CRÍTICO — inline primero, luego core, luego secciones ── */
const CSS_FILES = [
  `/shopify/plantilla25/assets/css/inline/index-inline-1.css`,
  `/shopify/plantilla25/assets/css/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/theme.css`,
  `/shopify/plantilla25/assets/css/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/apps.css`,
  `/shopify/plantilla25/assets/css/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/newsletter-popup.css`,
  `/shopify/plantilla25/assets/css/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/mobile-dock.css`,
  `/shopify/plantilla25/assets/css/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/pickup-availability.css`,
  `/shopify/plantilla25/assets/css/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/blog.css`,
  `/shopify/plantilla25/clone-fixes.css`,
  `/shopify/plantilla25/tailwind-patch.css`
];

/* ── JS files: solo los críticos del tema ── */
type JsFile = { src: string; module?: boolean };
const JS_FILES: JsFile[] = [
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/vendor.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/theme.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/tab-attention.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/cart.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/gift-wrapping.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/search.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/mobile-dock.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/pickup-availability.js` },
  { src: `/shopify/plantilla25/assets/js/concept-theme-tech.myshopify.com/cdn/shop/t/191/assets/instant-page.js`, module: true },
  { src: `/shopify/plantilla25/assets/js/cdn.shopify.com/storefront/standard-actions.js`, module: true },
  { src: `/shopify/plantilla25/assets/js/flickity-touch-fix.js` }
];

/* ── Font faces ── */
const FONT_FACE_CSS = `
@font-face {
  font-family: Inter;
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_n4.b2a3f24c19b4de56e8871f609e73ca7f6d2e2bb9.woff2") format("woff2"),
       url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_n4.af8052d517e0c9ffac7b814872cecc27ae1fa132.woff") format("woff");
}
@font-face {
  font-family: Inter;
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_n5.d7101d5e168594dd06f56f290dd759fba5431d97.woff2") format("woff2"),
       url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_n5.5332a76bbd27da00474c136abb1ca3cbbf259068.woff") format("woff");
}
@font-face {
  font-family: Inter;
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_n7.02711e6b374660cfc7915d1afc1c204e633421e4.woff2") format("woff2"),
       url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_n7.6dab87426f6b8813070abd79972ceaf2f8d3b012.woff") format("woff");
}
@font-face {
  font-family: Inter;
  font-weight: 400;
  font-style: italic;
  font-display: swap;
  src: url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_i4.feae1981dda792ab80d117249d9c7e0f1017e5b3.woff2") format("woff2"),
       url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_i4.62773b7113d5e5f02c71486623cf828884c85c6e.woff") format("woff");
}
@font-face {
  font-family: Inter;
  font-weight: 700;
  font-style: italic;
  font-display: swap;
  src: url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_i7.b377bcd4cc0f160622a22d638ae7e2cd9b86ea4c.woff2") format("woff2"),
       url("/shopify/plantilla25/assets/fonts/concept-theme-tech.myshopify.com/cdn/fonts/inter/inter_i7.7c69a6a34e3bb44fcf6f975857e13b9a9b25beb4.woff") format("woff");
}
`;

export default function HomePage25() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { totalItems, addItem } = useCart();

  const [cats, setCats] = useState<EnhCategory[]>([]);
  const [subs, setSubs] = useState<EnhSubcategory[]>([]);
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [featuredProd, setFeaturedProd] = useState<EnhFeaturedProduct | null>(null);
  const [combos, setCombos] = useState<ComboRealHydrationData[]>([]);

  /* ── Fetch combos / packs configuration ── */
  useEffect(() => {
    fetch('/api/public-data/combos')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.combos) && d.combos.length > 0) {
          setCombos(d.combos);
          const feat = d.combos[0].featuredProduct || d.combos[0].mainProduct;
          if (feat) {
            setFeaturedProd(feat as EnhFeaturedProduct);
          }
        }
      })
      .catch(() => {});
  }, []);

  /* ── Mark template attribute on document for CSS scoping ── */
  useEffect(() => {
    document.documentElement.dataset.template = '25';
    document.documentElement.classList.add('js');
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    document.documentElement.classList.add(isTouch ? 'touch' : 'no-touch');
    document.body.setAttribute('data-title-animation', '');
    // Drag-to-scroll with pointer events
    let isDragging = false;
    let startY = 0;
    let startScrollY = 0;
    let hasMoved = false;
    let activePointerId: number | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, textarea, select, [role="button"], .pointer-events-auto, details, summary')) return;
      isDragging = true;
      hasMoved = false;
      activePointerId = e.pointerId;
      startY = e.clientY;
      startScrollY = window.scrollY;
      document.body.style.userSelect = 'none';
      document.documentElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || e.pointerId !== activePointerId) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 3) hasMoved = true;
      window.scrollTo({ top: startScrollY - dy, behavior: 'auto' });
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging || e.pointerId !== activePointerId) return;
      isDragging = false;
      activePointerId = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    const onClickBlock = (e: MouseEvent) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        hasMoved = false;
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('click', onClickBlock, true);

    const isMobileViewport = window.innerWidth <= 1023;
    if (isMobileViewport) {
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';
      document.body.style.maxWidth = '100vw';
    }

    return () => {
      delete document.documentElement.dataset.template;
      document.documentElement.classList.remove('js', 'touch', 'no-touch');
      document.body.removeAttribute('data-title-animation');
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('click', onClickBlock, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.documentElement.style.overflowX = '';
      document.body.style.overflowX = '';
      document.body.style.maxWidth = '';
    };
  }, []);

  /* ── Aplicar clases del <body> original mientras la plantilla está montada (fidelidad) ── */
  useEffect(() => {
    if (!CAPTURED_BODY_CLASS) return;
    const added = CAPTURED_BODY_CLASS.split(/\s+/).filter(c => c && !document.body.classList.contains(c));
    added.forEach(c => document.body.classList.add(c));
    // Atributos data-* del theme original (necesarios para bordes redondeados, etc.)
    const dataAttrs: Record<string, string> = {
      'data-rounded-button': 'round',
      'data-rounded-input': 'round-slight',
      'data-rounded-block': 'round',
      'data-rounded-card': 'round',
      'data-button-hover': 'standard',
      'data-title-animation': '',
      'data-lazy-image': '',
      'data-page-transition': '',
      'data-modal-swipe-only': '',
      'data-page-rendering': '',
    };
    for (const [k, v] of Object.entries(dataAttrs)) {
      if (!document.body.hasAttribute(k)) document.body.setAttribute(k, v);
    }
    return () => {
      added.forEach(c => document.body.classList.remove(c));
      for (const k of Object.keys(dataAttrs)) {
        if (document.body.getAttribute(k) === dataAttrs[k]) document.body.removeAttribute(k);
      }
    };
  }, []);

  /* ── Host guard: el CSS global del theme pone el wrapper de YAXSEL (TemplateContext monta
        <body> > <div class="contents">) en display:none. Solo el inline !important le gana,
        pero React re-renderiza y lo borra → re-aplicar con MutationObserver + red de seguridad. ── */
  useEffect(() => {
    const apply = () => {
      const wrap = document.querySelector('body > .contents') as HTMLElement | null;
      if (wrap && wrap.style.getPropertyValue('display') !== 'contents') {
        wrap.style.setProperty('display', 'contents', 'important');
      }
    };
    apply();
    // El wrapper lo re-renderiza React (TemplateContext) y el theme lo re-oculta (regla nivel-ID
    // !important; solo el inline le gana) → re-aplicar. Observer acotado a <body> (no al subtree
    // del theme, que con GSAP mutaría sin parar) + interval barato como red de seguridad.
    const obs = new MutationObserver(apply);
    obs.observe(document.body, { childList: true });
    const wrap0 = document.querySelector('body > .contents');
    if (wrap0) obs.observe(wrap0, { attributes: true, attributeFilter: ['style', 'class'] });
    const iv = window.setInterval(apply, 400);
    // No removemos el display en cleanup: 'contents' es el valor natural del wrapper de YAXSEL.
    return () => { obs.disconnect(); window.clearInterval(iv); };
  }, []);

  /* ── Load font faces ── */
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'tpl25-fontfaces';
    styleEl.textContent = FONT_FACE_CSS;
    document.head.appendChild(styleEl);
    return () => { styleEl.remove(); };
  }, []);

  /* ── Load CSS files dynamically (SIN cache-bust: el navegador las cachea) ── */
  useEffect(() => {
    CSS_FILES.forEach(href => {
      const existing = document.querySelector(`link[data-tpl25="${href}"]`);
      if (existing) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-tpl25', href);
      document.head.appendChild(link);
    });

    return () => {
      // Remover CSS del theme de Shopify al salir del home para no contaminar otras páginas (/cuenta, /productos, etc.)
      document.querySelectorAll('link[data-tpl25]').forEach(el => el.remove());
      const preEnhance = document.getElementById('yaxsell-pre-enhance-hide');
      if (preEnhance) preEnhance.remove();
    };
  }, []);

  /* ── Preload de los JS del theme APENAS monta el componente: así se descargan
        en paralelo MIENTRAS llega body-clean.html, en vez de esperar al innerHTML ── */
  useEffect(() => {
    JS_FILES.forEach(file => {
      if (document.querySelector(`link[data-tpl25-preload="${file.src}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'preload';
      l.as = 'script';
      l.href = file.src;
      l.crossOrigin = 'anonymous';
      l.setAttribute('data-tpl25-preload', file.src);
      document.head.appendChild(l);
    });
  }, []);

  /* ── Fetch the cleaned HTML body content ── */
  useEffect(() => {
    let aborted = false;
    Promise.all([
      fetch('/shopify/plantilla25/body-clean.html').then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      }),
      fetch('/api/store-settings').then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([html, settings]) => {
        if (aborted) return;
        setBodyHtml(applyHomeMarketingToHtml(html, settings?.homeMarketing));
      })
      .catch(err => {
        if (aborted) return;
        console.error('[Plantilla25] Error loading body-clean.html', err);
        setLoadError(err.message || 'Error de carga');
      });
    return () => { aborted = true; };
  }, []);

  /* ── Set innerHTML ONCE via ref ── */
  useEffect(() => {
    if (!bodyHtml || !containerRef.current) return;
    if (containerRef.current.dataset.htmlSet) return;
    const route = window.location.pathname.replace(/\/$/, '') || '/';
    document.documentElement.classList.toggle('keep-mobile-dock', route === '/carrito' || route === '/cuenta');
    containerRef.current.innerHTML = bodyHtml;
    containerRef.current.dataset.htmlSet = '1';

    // ⚡ Conectar DE INMEDIATO los controles del Pack Emprendedor ("Ver detalle"
    //    y toggle de la cortina negra) mediante delegación en capture. Así
    //    responden al instante, antes de que llegue el fetch de combos y antes
    //    de que theme.js despierte sus custom elements (camino lento).
    wireComboSectionEarly(containerRef.current);

    // Hide demo content sections until Appwrite data replaces them
    const root = containerRef.current;
    const preEnhanceStyle = document.createElement('style');
    preEnhanceStyle.id = 'yaxsell-pre-enhance-hide';
    preEnhanceStyle.textContent = `
      .yaxsell-pre-enhance .card-grid.media-card,
      .yaxsell-pre-enhance motion-list.card-grid,
      .yaxsell-pre-enhance .product-bundle-wrapper,
      .yaxsell-pre-enhance .shopify-section:has(.media-card),
      .yaxsell-pre-enhance .shopify-section:has(.product-bundle),
      .yaxsell-pre-enhance .shopify-section:has(.featured-product),
      .yaxsell-pre-enhance #featured-product-section,
      .yaxsell-pre-enhance .search__recommendation {
        visibility: hidden !important;
      }
    `;
    if (!document.getElementById('yaxsell-pre-enhance-hide')) {
      document.head.appendChild(preEnhanceStyle);
    }
    root.classList.add('yaxsell-pre-enhance');

    // Remove leftover Shopify elements
    root.querySelectorAll('.fusion-overlay-custom, .fusion-scroll-top, .quickView-popup').forEach(el => el.remove());
    root.querySelectorAll('.mobile-dock-section, #shopify-section-sections--27201778909465__mobile-dock, nav.mobile-dock').forEach(el => el.remove());

    // Fix: Remove white space below footer on mobile by setting body background to dark and padding footer
    // (html stays light so the mobile browser address bar remains white)
    const footerMobileFixId = 'footer-mobile-dock-fix';
    let footerFixStyle = document.getElementById(footerMobileFixId);
    if (!footerFixStyle) {
      footerFixStyle = document.createElement('style');
      footerFixStyle.id = footerMobileFixId;
      document.head.appendChild(footerFixStyle);
    }
    footerFixStyle.textContent = `
      @media (max-width: 1023px) {
        html {
          background-color: #FFFFFF !important;
        }
        body {
          background-color: #FFFFFF !important;
          padding-bottom: 0 !important;
          margin-bottom: 0 !important;
        }
        footer.footer-group,
        .shopify-section-group-footer-group,
        [id*="__footer-copyright"],
        .footer-copyright {
          background-color: #171717 !important;
        }
        [id*="__footer-copyright"],
        .shopify-section-group-footer-group:last-of-type {
          padding-bottom: 95px !important;
        }
      }
    `;

    // Sticky bundle sidebar on mobile: aparece fijo al llegar a "Arma tu combo"
    // y se oculta al salir de la sección. Respeta el fondo oscuro + blur del theme.
    const bundleSidebar = root.querySelector('.product-bundle__sidebar') as HTMLElement | null;
    const bundleSection = root.querySelector('#shopify-section-template--27619508257049__product-bundle, .shopify-section:has(.product-bundle)') as HTMLElement | null;
    if (bundleSidebar && bundleSection) {
      const styleId = 'bundle-sidebar-mobile-sticky';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          @media (max-width: 1023px) {
            .product-bundle__sidebar.yaxsell-sticky {
              position: fixed !important;
              top: auto !important;
              bottom: 56px !important;
              left: 0 !important;
              right: 0 !important;
              z-index: 65 !important;
              max-height: 50vh !important;
              overflow-y: auto !important;
              transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease !important;
              transform: translateY(0) !important;
              opacity: 1 !important;
            }
            .product-bundle__sidebar.yaxsell-sticky.yaxsell-mobile-hidden {
              transform: translateY(120%) !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          }
        `;
        document.head.appendChild(style);
      }

      bundleSidebar.classList.add('yaxsell-sticky', 'yaxsell-mobile-hidden');

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            bundleSidebar.classList.remove('yaxsell-mobile-hidden');
          } else {
            bundleSidebar.classList.add('yaxsell-mobile-hidden');
          }
        });
      }, { threshold: 0.05, rootMargin: '0px 0px -100px 0px' });
      observer.observe(bundleSection);
    }
    
    // Desvincular aria-controls de todos los botones de cerrar para evitar que theme.js ModalElement les asocie onButtonClick
    root.querySelectorAll('.drawer__close, button.close, [aria-label="Close"], [aria-label="Cerrar"], [data-close]').forEach(btn => {
      const ctrl = btn.getAttribute('aria-controls');
      if (ctrl) {
        btn.setAttribute('data-close-target', ctrl);
        btn.removeAttribute('aria-controls');
      }
    });

    // Eliminar completamente el popup automático de newsletter para que nunca se abra solo
    const newsletterModal = root.querySelector<HTMLElement>('#NewsletterModal');
    if (newsletterModal) newsletterModal.remove();

    const closeAnyModalOrDrawer = (drawerEl: HTMLElement | null) => {
      if (!drawerEl) return;
      const native = drawerEl as any;
      if (typeof native.hide === 'function') {
        try { native.hide(); } catch {}
      }
      drawerEl.removeAttribute('open');
      drawerEl.removeAttribute('active');
      drawerEl.setAttribute('hidden', '');
      drawerEl.classList.remove('is-open', 'active');
      drawerEl.classList.add('pointer-events-none');
      drawerEl.querySelectorAll<HTMLElement>('.overlay, overlay-element').forEach(overlay => {
        overlay.classList.remove('opacity-100', 'visible', 'pointer-events-auto');
        overlay.classList.add('opacity-0', 'invisible', 'pointer-events-none');
        overlay.setAttribute('aria-expanded', 'false');
      });
      document.body.classList.remove('has-modal-opening', 'has-modal-open', 'drawer-open');
      document.body.style.overflow = '';
      if (drawerEl.id) {
        document.querySelectorAll<HTMLElement>(`[aria-controls="${drawerEl.id}"]`).forEach(btn => {
          btn.setAttribute('aria-expanded', 'false');
        });
      }
    };

    // Escuchar clics en botones de cerrar de cualquier drawer
    root.querySelectorAll<HTMLElement>('.drawer__close, [data-close-drawer], [data-close]').forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const drawer = button.closest<HTMLElement>('.drawer, menu-drawer, search-drawer, cart-drawer, .modal')
          || (button.dataset.closeDrawer ? document.getElementById(button.dataset.closeDrawer) : null)
          || (button.dataset.closeTarget ? document.getElementById(button.dataset.closeTarget) : null);
        closeAnyModalOrDrawer(drawer);
      };
      button.ontouchend = event => {
        event.preventDefault();
        event.stopPropagation();
        const drawer = button.closest<HTMLElement>('.drawer, menu-drawer, search-drawer, cart-drawer, .modal')
          || (button.dataset.closeDrawer ? document.getElementById(button.dataset.closeDrawer) : null)
          || (button.dataset.closeTarget ? document.getElementById(button.dataset.closeTarget) : null);
        closeAnyModalOrDrawer(drawer);
      };
    });

    // ⚠️ innerHTML NO ejecuta los <script> inline. Re-crearlos para que corran
    //    (necesario para configs del theme como window.filepaths = { async_css: ... }).
    root.querySelectorAll('script:not([src])').forEach(old => {
      const s = document.createElement('script');
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });


    const handleCartTrigger = (event: Event) => {
        const target = event.target as Element | null;
        const trigger = target?.closest<HTMLElement>('[data-cart-drawer-trigger="true"], a[href="/cart"], a[href="/carrito"], .cart-drawer-button, [aria-controls="CartDrawer"]');
        if (!trigger) return;
        if (trigger.closest('.mobile-dock, .dock__item, .global-mobile-nav')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('yaxsel:open-cart'));
      };

    document.addEventListener('pointerdown', handleCartTrigger, true);
    document.addEventListener('click', handleCartTrigger, true);

    root.querySelectorAll<HTMLAnchorElement>('a[href="/cart"], a[href="/carrito"], .cart-drawer-button').forEach(trigger => {
      if (trigger.closest('.mobile-dock, .dock__item, .global-mobile-nav')) {
        trigger.setAttribute('href', '/carrito');
        trigger.removeAttribute('aria-controls');
        trigger.removeAttribute('data-no-instant');
        return;
      }
      trigger.setAttribute('data-cart-drawer-trigger', 'true');
      trigger.removeAttribute('href');
      trigger.setAttribute('role', 'button');
    });

    return () => {
      document.removeEventListener('pointerdown', handleCartTrigger, true);
      document.removeEventListener('click', handleCartTrigger, true);
    };
  }, [bodyHtml]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root?.dataset.htmlSet || !window.matchMedia('(max-width: 767px)').matches) return;

    const slider = Array.from(root.querySelectorAll<HTMLElement>('slider-element'))
      .find(element => element.querySelector('motion-list.card-grid .card.media-card'));
    if (!slider) return;

    // ── FIX SCROLL LATERAL CATEGORÍAS (móvil) ──
    // El <slider-element> del tema es display:grid (clase "grid") y sólo actúa
    // como slider en desktop/tablet. En móvil, su hijo (el card-grid) queda
    // encajado en la celda del grid: el ancho de las tarjetas se vuelve "ink
    // overflow" NO scrollable, por eso sólo scrolleaba "un poquititio".
    // Solución: convertir el slider en un contenedor de scroll block normal y
    // el card-grid en un flex horizontal con tarjetas de ancho fijo → overflow
    // real scrollable + swipe táctil nativo + snap a cada categoría.
    slider.style.setProperty('display', 'block', 'important');
    slider.style.setProperty('overflow-x', 'auto', 'important');
    slider.style.setProperty('overflow-y', 'hidden', 'important');
    slider.style.setProperty('overscroll-behavior-x', 'contain', 'important');
    slider.style.setProperty('touch-action', 'pan-x pan-y', 'important');
    slider.style.setProperty('-webkit-overflow-scrolling', 'touch');
    slider.style.setProperty('scroll-snap-type', 'x mandatory', 'important');

    const grid = slider.querySelector<HTMLElement>('motion-list.card-grid');
    if (grid) {
      grid.style.setProperty('display', 'flex', 'important');
      grid.style.setProperty('flex-wrap', 'nowrap', 'important');
      grid.style.setProperty('width', 'max-content', 'important');
      grid.style.setProperty('max-width', 'none', 'important');
      grid.style.setProperty('align-items', 'stretch', 'important');
      grid.style.setProperty('gap', '12px', 'important');
    }
    slider.querySelectorAll<HTMLElement>('.card.media-card').forEach(card => {
      // ~85vw deja asomar la siguiente categoría (indica que se puede deslizar)
      card.style.setProperty('flex', '0 0 85vw', 'important');
      card.style.setProperty('width', '85vw', 'important');
      card.style.setProperty('max-width', '85vw', 'important');
      card.style.setProperty('scroll-snap-align', 'start', 'important');
    });
  }, [bodyHtml]);

  /* ── Inject window.Shopify + window.theme stubs BEFORE loading JS ── */
  useEffect(() => {
    const w = window as any;
    if (!w.Shopify) {
      w.Shopify = {
        shop: 'concept-theme-tech.myshopify.com',
        country: 'US',
        currency: 'USD',
        locale: 'es',
        theme: { name: 'Captured Theme', id: '191' },
        routes: { root_url: '/', cart_url: '/cart', search_url: '/search' },
        customerAccountsEnabled: false,
      };
    }
    if (!w.theme) {
      w.theme = {
        routes: {
          root_url: '/', cart_url: '/carrito', cart_add_url: '/cart/add',
          cart_change_url: '/cart/change', cart_update_url: '/cart/update',
          search_url: '/productos', predictive_search_url: '/search/suggest',
        },
        settings: { moneyFormat: '${{amount}}', cartType: 'drawer', themeName: 'Concept', themeVersion: '5.3.3' },
        strings: {}, variantStrings: {}, cartStrings: {}, dateStrings: {},
      };
      w.themeVariables = w.theme;
    }
    if (!w.countdown) {
      w.countdown = {
        long: { day: 'día', hour: 'hora', second: 'segundo', one: { day: 'día', hour: 'hora', second: 'segundo' }, other: { day: 'días', hour: 'horas', second: 'segundos' } },
        short: { day: 'd', hour: 'h', second: 's', one: { day: 'd', hour: 'h', second: 's' }, other: { day: 'd', hour: 'h', second: 's' } },
      };
    }

    // Intercept fetch to prevent 404s on Shopify routes (/products/*, /variants/*, /cart/*)
    // but DO NOT block Appwrite calls — those are from the app itself
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.startsWith('/products/') || (url.includes('/products/') && !url.includes('/shopify/'))) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.startsWith('/variants/') || url.includes('/variants/')) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.startsWith('/cart/') || url.startsWith('/cart/add') || url.startsWith('/cart/change') || url.startsWith('/cart/update')) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return origFetch(input, init);
    };
  }, []);

  /* ── Load JS scripts (descarga paralela, ejecución ordenada) after HTML is rendered ── */
  useEffect(() => {
    if (!bodyHtml) return;
    if ((window as any).__tpl25ScriptsLoaded) return;
    (window as any).__tpl25ScriptsLoaded = true;

    // ⚡ Descargar TODOS los scripts EN PARALELO y ejecutarlos EN ORDEN:
    //    los <script> dinámicos con async=false se ejecutan en orden de inserción,
    //    pero el navegador los descarga concurrentemente (y ya vienen precargados
    //    por el <link rel="preload"> del mount). Antes se cargaban en serie con
    //    await → ~4s hasta que theme.js definía los custom elements y los botones
    //    del theme (menú, drawers, etc.) "despertaban".
    const loadOne = (file: JsFile) => new Promise<void>((resolve) => {
      if (document.querySelector(`script[data-tpl25="${file.src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = file.src;
      if (file.module) s.type = 'module';
      else s.async = false;
      s.crossOrigin = 'anonymous';
      s.setAttribute('data-tpl25', file.src);
      s.onload = () => resolve();
      s.onerror = () => {
        console.warn('[Plantilla25] Failed to load:', file.src);
        resolve();
      };
      document.body.appendChild(s);
    });

    const forceInView = () => {
      // Forzar .in-view en todos los .animation-element para activar animaciones
      document.querySelectorAll('.animation-element, .animation-wrapper').forEach(el => {
        el.classList.add('in-view');
      });

      // Forzar autoplay en videos del split hero
      document.querySelectorAll('split-hero video, .split-hero video').forEach(el => {
        const video = el as HTMLVideoElement;
        video.muted = true;
        video.play().catch(() => {});
      });
      // Forzar is-collapsed en split-hero para activar morph mask
      document.querySelectorAll('.split-hero-column__media').forEach(el => {
        if (!el.classList.contains('is-collapsed')) {
          el.classList.add('is-collapsed');
        }
      });
      // Re-inicializar split-hero si existe
      document.querySelectorAll('split-hero').forEach(el => {
        try { (el as any).initParallaxScrollAnimation(); } catch(e) {}
      });
    };

    // El post-init corre cuando termine el ÚLTIMO script clásico (flickity-touch-fix.js),
    // que con async=false garantiza que vendor.js/theme.js ya ejecutaron antes.
    const runPostInit = () => {
      // Forzar .in-view después de un breve delay para que los scripts se ejecuten
      setTimeout(() => {
        forceInView();

        // ── FLICKITY TOUCH FIX: parchar Flickity para permitir scroll vertical en móvil ──
        if (window.matchMedia('(max-width: 767px)').matches && (window as any).Flickity) {
          const proto = (window as any).Flickity.prototype;
          if (proto && !proto._touchFixedInline) {
            proto._touchFixedInline = true;
            // Cambiar touchActionValue de 'none' a 'pan-y'
            proto.touchActionValue = 'pan-y';
            // Parchar bindHandles para usar pan-y
            if (proto.bindHandles) {
              const origBind = proto.bindHandles;
              proto.bindHandles = function() {
                this.touchActionValue = 'pan-y';
                return origBind.call(this);
              };
            }
            // Parchar handleDragMove para ignorar movimientos verticales
            if (proto.handleDragMove) {
              const origDrag = proto.handleDragMove;
              proto.handleDragMove = function(event: any, pointer: any, moveVector: any) {
                if (!this.isDraggable) return;
                if (!moveVector) return origDrag.call(this, event, pointer, moveVector);
                const dx = Math.abs(moveVector.x);
                const dy = Math.abs(moveVector.y);
                if (dy > dx) {
                  if (this.isDragging) this.isDragging = false;
                  return;
                }
                return origDrag.call(this, event, pointer, moveVector);
              };
            }
            // Re-aplicar touch-action a todas las instancias existentes
            document.querySelectorAll('slideshow-element, .slideshow, .flickity-slider').forEach((el: any) => {
              el.style.touchAction = 'pan-y';
              el.style.webkitOverflowScrolling = 'auto';
            });
          }
        }

        // ── SLIDER-ELEMENT TOUCH FIX: permitir swipe horizontal nativo en todos
        //    los sliders móviles, incluido el de categorías (antes bloqueado en pan-y). ──
        if (window.matchMedia('(max-width: 767px)').matches) {
          document.querySelectorAll<HTMLElement>('slider-element, .slider, .card-grid, .media-card, .media-card__link, .media-card .media').forEach(el => {
            el.style.setProperty('touch-action', 'pan-x pan-y', 'important');
          });
        }

        try {
          document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: false }));
          window.dispatchEvent(new Event('load'));
        } catch (e) {
          console.warn('[Plantilla25] dispatch DOMContentLoaded/load failed:', e);
        }

        // ── BTN-FILL MOBILE: theme.js desactiva HoverButton en táctil.
        //    Disparamos la misma animación nativa (translate3d(0,0,0) al tocar,
        //    translate3d(0,-76%,0) al soltar = valor original del theme). ──
        //    Deferred via requestIdleCallback para no bloquear el main thread
        const wireBtnFill = () => {
          document.querySelectorAll<HTMLElement>('.button').forEach(btn => {
            if (btn.dataset.fillWired) return;
            btn.dataset.fillWired = '1';
            const fill = btn.querySelector<HTMLElement>('[data-fill]');
            if (!fill) return;

            btn.addEventListener('touchstart', () => {
              fill.style.transition = 'transform 0.3s cubic-bezier(0.165,0.84,0.44,1)';
              fill.style.transform = 'translate3d(0,0,0)';
            }, { passive: true });

            btn.addEventListener('touchend', () => {
              setTimeout(() => {
                fill.style.transition = 'transform 0.45s cubic-bezier(0.165,0.84,0.44,1)';
                fill.style.transform = 'translate3d(0,-76%,0)';
              }, 350);
            }, { passive: true });

            btn.addEventListener('touchcancel', () => {
              fill.style.transform = 'translate3d(0,-76%,0)';
            }, { passive: true });
          });
        };
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(wireBtnFill, { timeout: 2000 });
        } else {
          setTimeout(wireBtnFill, 100);
        }
      }, 500);
    };

    void (async () => {
      for (const file of JS_FILES) {
        await loadOne(file);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      runPostInit();
    })();

    return () => { (window as any).__tpl25ScriptsLoaded = false; };
  }, [bodyHtml]);

  /* ── Fetch categories + product counts from API ── */
  useEffect(() => {
    let active = true;
    // Sin cache:'no-store': eso anulaba el ClientFetchCache (ver bypassCache en
    // ClientFetchCache.tsx) y forzaba red en cada carga del home.
    const getJSON = async (url: string, isValid?: (d: any) => boolean, tries = 3): Promise<any | null> => {
      let last: any = null;
      for (let i = 0; i < tries; i++) {
        try {
          const r = await fetch(url);
          if (r.ok) { const d = await r.json(); last = d; if (!isValid || isValid(d)) return d; }
        } catch { /* retry */ }
        await new Promise(res => setTimeout(res, 300));
      }
      return last;
    };
    (async () => {
      // Una sola petición a products: antes se pedía la MISMA url dos veces en
      // paralelo (una para los conteos, otra para el destacado) con validadores
      // distintos. Ahora un validador combinado cubre ambos usos.
      const [catData, prodData] = await Promise.all([
        getJSON('/api/public-data/catalog', d => (d?.categories?.length || 0) > 0),
        getJSON('/api/public-data/products?limit=1',
          d => Object.keys(d?.categoryCounts || {}).length > 0 && (d?.products?.length || 0) > 0),
      ]);
      if (!active) return;
      if (catData) { setCats((catData.categories || []) as EnhCategory[]); setSubs((catData.subcategories || []) as EnhSubcategory[]); }
      if (prodData) { setCatCounts(prodData.categoryCounts || {}); setSubCounts(prodData.subcategoryCounts || {}); }
      if (prodData?.products?.[0]) { setFeaturedProd(prodData.products[0] as EnhFeaturedProduct); }
    })();
    return () => { active = false; };
  }, []);

  /* ── Enhance header with real data + fix clone behaviour ── */
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !root.dataset.htmlSet) return;
    if (cats.length === 0) return; // esperar a que las categorías carguen

    const run = () => {
      const r = containerRef.current;
      if (!r || !r.dataset.htmlSet) return;
      enhanceConceptHeader(r, {
        categories: cats, subcategories: subs, catCounts, subCounts,
        logoUrl: STORE_LOGO, storeName: STORE_NAME,
        featuredProduct: featuredProd || undefined,
        onFeaturedAddToCart: (product) => {
          addItem({
            ...product,
            STOCK: (product as any).STOCK ?? 99999,
          } as any, 1);
        },
      });
      syncConceptCartCount(r, totalItems);
      fixCloneBehaviour(r);

      // Demo content has been replaced — show sections again
      r.classList.remove('yaxsell-pre-enhance');
    };
    // Usar requestIdleCallback para no bloquear el main thread
    // (enhanceConceptHeader hace reemplzos masivos de innerHTML que pueden
    // bloquear clicks durante varios segundos si se ejecuta síncrono)
    const ric = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        return (window as any).requestIdleCallback(cb, { timeout: 1500 });
      }
      return setTimeout(cb, 16);
    };
    const id = ric(run);
    return () => {
      if ('cancelIdleCallback' in window && typeof id === 'number') {
        (window as any).cancelIdleCallback(id);
      } else {
        clearTimeout(id as any);
      }
    };
  }, [bodyHtml, cats, subs, catCounts, subCounts, totalItems, featuredProd, addItem]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root?.dataset.htmlSet) return;

    if (combos.length === 0) {
      enhanceConceptCombos(root, null);
      return;
    }

    enhanceConceptCombos(root, combos[0], (selectedItems) => {
      selectedItems.forEach(item => {
        addItem({
          $id: item.id,
          NAME: item.name,
          PRICE: item.price,
          IMAGEURL: item.image,
          STOCK: 99,
        } as any);
      });
    });
  }, [bodyHtml, combos, addItem]);

  /* ── Sync cart badge reactively ── */
  useEffect(() => {
    const root = containerRef.current;
    if (root?.dataset.htmlSet) syncConceptCartCount(root, totalItems);
  }, [totalItems, bodyHtml]);

  /* ── Loading/error states ── */
  if (loadError) {
    return (
      <div style={{ padding: 32, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ color: '#dc2626', marginBottom: 8 }}>Error cargando la plantilla</h2>
        <p style={{ color: '#666' }}>No se pudo cargar <code>/shopify/plantilla25/body-clean.html</code>.</p>
        <p style={{ color: '#999', fontSize: 13, marginTop: 12 }}>Detalle: {loadError}</p>
      </div>
    );
  }

  if (!bodyHtml) {
    return (
      <div
        aria-label="Cargando"
        role="status"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            border: '3px solid #e5e7eb',
            borderTopColor: '#111827',
            borderRadius: '50%',
            animation: 'template25-spin .7s linear infinite',
          }}
        />
        <style>{'@keyframes template25-spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="tpl25-shopify-root template-index"
      style={{
        maxWidth: '100vw',
        overflowX: 'clip',
        width: '100%',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    />
  );
}
