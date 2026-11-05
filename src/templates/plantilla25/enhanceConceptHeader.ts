/* ══════════════════════════════════════════════════════════════════
   enhanceConceptHeader — hace FUNCIONAL el header ORIGINAL del tema
   Shopify "Concept" (plantilla 25) SIN cambiar su diseño ni sus efectos.
   ──────────────────────────────────────────────────────────────────
   El home de la plantilla 25 inyecta el header capturado tal cual (con su
   forma que se "parte por abajo", sus íconos, su drawer de búsqueda, su
   dock móvil…). Este módulo lo deja intacto visualmente y solo:
     • Cambia el logo demo por el de la tienda.
     • Reemplaza el menú demo (Shop/Collections/Explore…) por las
       CATEGORÍAS reales de la base de datos (con subcategorías en
       dropdown nativo del tema).
     • Conecta el buscador  → /productos?q=
     • Conecta la cuenta    → /cuenta
     • Conecta el carrito   → /carrito  (+ badge reactivo, ver syncConceptCartCount)
   Todo con la MISMA marcación/clases del tema para que se vea idéntico.
   ══════════════════════════════════════════════════════════════════ */

import { resolveStorageImageUrl } from '@/lib/product-images';

export type EnhCategory = { $id: string; name: string; order?: number; BACKGROUND_IMAGE_URL?: string; iconUrl?: string; IMAGEURL?: string; imageUrl?: string };
export type EnhSubcategory = { $id: string; name: string; categoryId?: string; parentSubcategoryId?: string; order?: number };

export interface EnhFeaturedProduct {
  $id: string;
  NAME: string;
  PRICE: number;
  IMAGEURL?: string;
  IMAGEURL2?: string;
  IMAGEURL3?: string;
  IMAGEURL4?: string;
  IMAGEURL5?: string;
  DESCRIPTION?: string;
  CATEGORYID?: string;
}

export interface EnhanceData {
  categories: EnhCategory[];
  subcategories: EnhSubcategory[];
  catCounts: Record<string, number>;
  subCounts: Record<string, number>;
  logoUrl: string;
  storeName: string;
  featuredProduct?: EnhFeaturedProduct;
  onFeaturedAddToCart?: (product: EnhFeaturedProduct) => void;
}

const EMOJI: Record<string, string> = {
  'Skincare': '🧴', 'Skincare Facial': '🧴', 'Maquillaje': '💄', 'Capilar': '💇‍♀️',
  'Manicure': '💅', 'Herramientas': '🔧', 'Otros': '📦', 'Aromaterapia y Difusores': '🕯️',
  'Empaques y Regalos': '🎁', 'Fragancias': '🌸', 'Cabello': '💇‍♀️', 'Cuerpo': '🧼', 'Ofertas': '🏷️',
};

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const catHref = (name: string) => `/productos?categoria=${encodeURIComponent(name)}`;
const subHref = (name: string, subId: string) => `${catHref(name)}&subcat=${encodeURIComponent(subId)}`;
const order = (x: { order?: number; ORDER?: number }) => (typeof x.order === 'number' ? x.order : typeof (x as any).ORDER === 'number' ? (x as any).ORDER : 9999);
const label = (name: string) => `${EMOJI[name] ? EMOJI[name] + ' ' : ''}${name}`;

/* ── Esquinas cóncavas del dropdown (SVG original del tema con 2 paths) ── */
const CORNER = (side: 'left' | 'right') =>
  `<span class="dropdown__corner corner ${side} top flex absolute pointer-events-none"><svg class="w-full h-auto" viewBox="0 0 101 101" stroke="none" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="presentation"><path fill-rule="evenodd" clip-rule="evenodd" d="M101 0H0V101H1C1 45.7715 45.7715 1 101 1V0Z"></path><path d="M1 101C1 45.7715 45.7715 1 101 1" fill="none"></path></svg></span>`;

/* ── Item simple del menú desktop (mismas clases que el tema) ── */
const deskLink = (href: string, label: string) =>
  `<li><a href="${esc(href)}" class="menu__item text-sm-lg flex items-center font-medium z-2 relative cursor-pointer" is="magnet-link" data-magnet="0" aria-label="${esc(label)}"><span class="btn-text" data-text="">${esc(label)}</span><span class="btn-text btn-duplicate">${esc(label)}</span></a></li>`;

/* ── Item con dropdown (categoría con subcategorías) — usa details-dropdown del tema ── */
const deskDropdown = (label: string, parentHref: string, subs: { href: string; name: string }[]) => {
  const items = subs
    .map(s => `<li><p><a href="${esc(s.href)}" class="reversed-link text-sm-base">${esc(s.name)}</a></p></li>`)
    .join('');
  return `<li><details class="details-dropdown-clone" trigger="hover" level="top"><summary data-link="${esc(parentHref)}" class="z-2 relative rounded-full" aria-haspopup="true" aria-expanded="false" aria-label="${esc(label)}"><magnet-element class="menu__item text-sm-lg flex items-center font-medium z-2 relative cursor-pointer" data-magnet="0"><span class="btn-text" data-text="">${esc(label)}</span><span class="btn-text btn-duplicate">${esc(label)}</span></magnet-element></summary><div class="dropdown opacity-0 invisible absolute top-0 max-w-full pointer-events-none"><div class="dropdown__container relative">${CORNER('left')}${CORNER('right')}<ul class="dropdown__nav dropdown__nav--2cols flex flex-col gap-1d5 xl:gap-2" role="list">${items}</ul></div></div></details></li>`;
};

/* ── Item del drawer móvil (link simple con las clases del tema) ── */
const drawerLink = (href: string, label: string) =>
  `<li class="drawer__menu-group"><a class="drawer__menu-item block heading text-2xl leading-none tracking-tight" href="${esc(href)}">${esc(label)}</a></li>`;

const CHEVRON_RIGHT =
  `<svg class="icon icon-chevron-right icon-lg" viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6L16 12L10 18"></path></svg>`;
// OJO: el botón de volver NO lleva flecha propia — el tema ya le dibuja una
// con CSS (.drawer__submenu>button:before). Si añadimos un <svg> salen DOS.

/* ── Item de Subcategoría (con soporte recursivo para hijas si las hay) ── */
const renderDrawerSubItem = (
  sub: EnhSubcategory,
  catName: string,
  catId: string,
  allSubs: EnhSubcategory[],
  subCounts: Record<string, number>,
  hasCounts: boolean
): string => {
  const childSubs = allSubs
    .filter(s => s.parentSubcategoryId === sub.$id)
    .sort((a, b) => order(a) - order(b));

  if (childSubs.length === 0) {
    const count = hasCounts ? subCounts[sub.$id] : undefined;
    return `<li class="drawer__menu-group py-1.5 border-b border-neutral-100">
      <a class="drawer__menu-item flex items-center justify-between text-base font-semibold leading-tight text-neutral-800 hover:text-black py-1" href="${esc(subHref(catName, sub.$id))}">
        <span>${esc(sub.name)}</span>
        ${typeof count === 'number' ? `<span class="text-xs font-normal text-neutral-400">(${count})</span>` : ''}
      </a>
    </li>`;
  }

  // Tiene sub-hijas (Nivel 3 / y así sucesivamente)
  const childItemsHtml = childSubs
    .map(cs => renderDrawerSubItem(cs, catName, catId, allSubs, subCounts, hasCounts))
    .join('');

  return `<li class="drawer__menu-group py-1">
    <details class="w-full">
      <summary class="drawer__menu-item flex items-center justify-between w-full cursor-pointer relative py-2 text-base font-bold text-neutral-900 border-b border-neutral-100" aria-expanded="false">
        <span>${esc(sub.name)}</span>
        ${CHEVRON_RIGHT}
      </summary>
      <div class="drawer__submenu z-50 absolute inset-0 flex flex-col w-full h-full bg-white text-neutral-900 p-6 overflow-y-auto" data-parent
           data-cat-id="${esc(catId)}" data-sub-id="${esc(sub.$id)}" data-cat-name="${esc(sub.name)}">
        <button type="button" class="drawer__close-submenu flex items-center gap-2.5 w-full pb-3 mb-4 border-b border-neutral-200 text-neutral-900 font-bold text-lg cursor-pointer bg-transparent border-0" data-close-submenu>
          <svg class="icon icon-chevron-left icon-sm text-neutral-900 shrink-0" viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation" style="width:20px;height:20px">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path>
          </svg>
          <span>${esc(sub.name)}</span>
        </button>
        <div class="drawer__scrollable flex flex-col grow">
          <ul class="w-full flex flex-col gap-1" role="list">
            ${childItemsHtml}
            <li class="drawer__menu-group pt-3">
              <a class="drawer__menu-item block text-sm font-extrabold text-neutral-900 underline" href="${esc(subHref(catName, sub.$id))}">
                Ver todo en ${esc(sub.name)}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </details>
  </li>`;
};

/* ── Item de Categoría dentro del panel maestro "Categorías" ── */
const renderDrawerCategoryItem = (
  cat: EnhCategory,
  allSubs: EnhSubcategory[],
  catCounts: Record<string, number>,
  subCounts: Record<string, number>,
  hasCounts: boolean
): string => {
  const directSubs = allSubs
    .filter(s => s.categoryId === cat.$id && !s.parentSubcategoryId)
    .sort((a, b) => order(a) - order(b));

  const catLabel = label(cat.name);
  const parentHref = catHref(cat.name);
  const count = hasCounts ? catCounts[cat.$id] : undefined;

  if (directSubs.length === 0) {
    return `<li class="drawer__menu-group py-1.5 border-b border-neutral-100">
      <a class="drawer__menu-item flex items-center justify-between text-base font-bold leading-tight text-neutral-800 hover:text-black py-1" href="${esc(parentHref)}">
        <span>${esc(catLabel)}</span>
        ${typeof count === 'number' ? `<span class="text-xs font-normal text-neutral-400">(${count})</span>` : ''}
      </a>
    </li>`;
  }

  const subItemsHtml = directSubs
    .map(s => renderDrawerSubItem(s, cat.name, cat.$id, allSubs, subCounts, hasCounts))
    .join('');

  return `<li class="drawer__menu-group py-1">
    <details class="w-full">
      <summary class="drawer__menu-item flex items-center justify-between w-full cursor-pointer relative py-2.5 text-base font-bold text-neutral-900 border-b border-neutral-100" aria-expanded="false">
        <span>${esc(catLabel)}</span>
        ${CHEVRON_RIGHT}
      </summary>
      <div class="drawer__submenu z-50 absolute inset-0 flex flex-col w-full h-full bg-white text-neutral-900 p-6 overflow-y-auto" data-parent
           data-cat-id="${esc(cat.$id)}" data-cat-name="${esc(cat.name)}">
        <button type="button" class="drawer__close-submenu flex items-center gap-2.5 w-full pb-3 mb-4 border-b border-neutral-200 text-neutral-900 font-bold text-lg cursor-pointer bg-transparent border-0" data-close-submenu>
          <svg class="icon icon-chevron-left icon-sm text-neutral-900 shrink-0" viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation" style="width:20px;height:20px">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path>
          </svg>
          <span>${esc(catLabel)}</span>
        </button>
        <div class="drawer__scrollable flex flex-col grow">
          <ul class="w-full flex flex-col gap-1" role="list">
            ${subItemsHtml}
            <li class="drawer__menu-group pt-3">
              <a class="drawer__menu-item block text-base font-extrabold text-neutral-900 underline" href="${esc(parentHref)}">
                Ver todo en ${esc(catLabel)}${typeof count === 'number' ? ` (${count})` : ''}
              </a>
            </li>
          </ul>
          <!-- Vitrina de productos de la categoría (se llena al abrir) -->
          <div class="drawer__preview mt-6 pt-4 border-t border-neutral-200" data-preview></div>
        </div>
      </div>
    </details>
  </li>`;
};

/* ── Item Maestro "Categorías" que reemplaza a "Ofertas" en el menú lateral ── */
const renderDrawerCategoriesRoot = (
  navCats: EnhCategory[],
  allSubs: EnhSubcategory[],
  catCounts: Record<string, number>,
  subCounts: Record<string, number>,
  hasCounts: boolean
): string => {
  const categoryItemsHtml = navCats
    .map(c => renderDrawerCategoryItem(c, allSubs, catCounts, subCounts, hasCounts))
    .join('');

  return `<li class="drawer__menu-group">
    <details class="w-full">
      <summary class="drawer__menu-item flex items-center justify-between w-full cursor-pointer relative py-2" aria-expanded="false">
        <span class="heading text-2xl leading-none tracking-tight font-bold text-neutral-900">🗂️ Categorías</span>
        ${CHEVRON_RIGHT}
      </summary>
      <div class="drawer__submenu z-50 absolute inset-0 flex flex-col w-full h-full bg-white text-neutral-900 p-6 overflow-y-auto" data-parent
           data-menu-root="categories">
        <button type="button" class="drawer__close-submenu flex items-center gap-2.5 w-full pb-3 mb-4 border-b border-neutral-200 text-neutral-900 font-bold text-lg cursor-pointer bg-transparent border-0" data-close-submenu>
          <svg class="icon icon-chevron-left icon-sm text-neutral-900 shrink-0" viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation" style="width:20px;height:20px">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path>
          </svg>
          <span>Categorías</span>
        </button>
        <div class="drawer__scrollable flex flex-col grow">
          <ul class="w-full flex flex-col gap-1" role="list">
            ${categoryItemsHtml}
            <li class="drawer__menu-group pt-3">
              <a class="drawer__menu-item block text-base font-extrabold text-neutral-900 underline" href="/productos">
                Ver todo el catálogo
              </a>
            </li>
          </ul>
        </div>
      </div>
    </details>
  </li>`;
};

/* ── Precio en CLP, igual que el resto de la tienda ── */
function money(n: number): string {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);
  } catch { return `$${Math.round(n)}`; }
}

/** Precio a mostrar (oferta si la hay). */
function priceOf(p: any): number {
  const cur = Number(p?.CURRENTPRICE) || 0;
  const base = Number(p?.PRICE) || 0;
  return cur > 0 && (base === 0 || cur < base) ? cur : (base || cur);
}

/** Reemplazar iconos demo (driver, bluetooth, etc) por iconos genéricos de tienda */
function replaceDemoIcons(root: HTMLElement): void {
  const iconContainers = root.querySelectorAll<HTMLElement>('.product-card__icons[is="icons-carousel"]');
  const genericIcons = [
    {
      label: 'Calidad garantizada', sub: 'Producto premium',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>',
    },
    {
      label: 'Envío rápido', sub: 'Despacho inmediato',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    },
    {
      label: 'Mejor precio', sub: 'Oferta exclusiva',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    },
    {
      label: 'Soporte 24/7', sub: 'Atención al cliente',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    },
  ];
  iconContainers.forEach(container => {
    container.innerHTML = genericIcons.map(ic => `
      <div class="product-card__icon shrink-0">
        <div class="flex flex-col items-center md:flex-row md:items-start gap-2">
          <figure class="shrink-0 media media--transparent relative inline-block">${ic.svg}</figure>
          <div class="flex flex-col items-center md:items-start gap-1 text-center md:text-left text-sm font-medium leading-none">
            ${esc(ic.label)}
            <p class="text-opacity font-normal text-xs leading-tight">${esc(ic.sub)}</p>
          </div>
        </div>
      </div>
    `).join('');
  });
}

/**
 * Búsqueda EN VIVO dentro del drawer del tema, contra el catálogo real.
 * Sustituye al predictive-search de Shopify (que aquí no tiene backend).
 */
function wireLiveBuscar(form: HTMLFormElement): void {
  if (form.dataset.liveBuscar) return;
  form.dataset.liveBuscar = '1';

  const input = form.querySelector<HTMLInputElement>('input[name="q"], input.search__input');
  const results = form.querySelector<HTMLElement>('.search__results');
  const recommendation = form.querySelector<HTMLElement>('.search__recommendation');
  if (!input || !results) return;

  // El tema anima un texto de ejemplo sobre el input; estorba al escribir.
  form.querySelectorAll('.typed, search-typed').forEach(el => el.remove());

  const setBusy = (msg: string) => {
    results.innerHTML = `<p class="text-sm opacity-60">${esc(msg)}</p>`;
  };

  const render = (items: any[], term: string) => {
    if (!items.length) {
      results.innerHTML = `<p class="text-sm opacity-60">Sin resultados para “${esc(term)}”.</p>`;
      return;
    }
    const cards = items.map(p => {
      const img = resolveStorageImageUrl(p.IMAGEURL) || resolveStorageImageUrl(p.IMAGEURL2) || '';
      const price = priceOf(p);
      return `<li>
        <a href="/productos/${esc(p.$id)}" class="flex items-center gap-4 w-full">
          ${img
            ? `<img src="${esc(img)}" alt="${esc(p.NAME || '')}" width="56" height="56" loading="lazy"
                 style="width:56px;height:56px;object-fit:cover;border-radius:10px;flex:0 0 auto;background:#f3f3f3">`
            : `<span style="width:56px;height:56px;border-radius:10px;background:#f3f3f3;flex:0 0 auto;display:block"></span>`}
          <span class="flex flex-col gap-1" style="min-width:0">
            <span class="text-sm font-medium" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.NAME || '')}</span>
            ${price > 0 ? `<span class="text-sm font-bold">${esc(money(price))}</span>` : ''}
          </span>
        </a>
      </li>`;
    }).join('');

    results.innerHTML = `
      <p class="search__heading block text-xs uppercase leading-tight tracking-widest">Productos</p>
      <ul class="grid gap-4 w-full" role="list">${cards}</ul>
      <a href="/productos?q=${encodeURIComponent(term)}" class="reversed-link text-base font-medium">
        Ver todos los resultados de “${esc(term)}”
      </a>`;
  };

  let timer: any = null;
  let seq = 0;

  const onType = () => {
    const term = input.value.trim();
    clearTimeout(timer);
    // Con el campo vacío volvemos a mostrar las categorías sugeridas
    if (term.length < 2) {
      results.innerHTML = '';
      if (recommendation) recommendation.style.removeProperty('display');
      return;
    }
    if (recommendation) recommendation.style.display = 'none';
    setBusy('Buscando…');
    const mine = ++seq;
    timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public-data/products?search=${encodeURIComponent(term)}&limit=8`);
        const d = await r.json();
        if (mine !== seq) return; // llegó una búsqueda más nueva
        render(Array.isArray(d.products) ? d.products : [], term);
      } catch {
        if (mine === seq) results.innerHTML = `<p class="text-sm opacity-60">No se pudo buscar. Intenta de nuevo.</p>`;
      }
    }, 250);
  };

  input.addEventListener('input', onType);
  input.addEventListener('search', onType);
  // El botón "Limpiar" (type=reset) del tema
  form.addEventListener('reset', () => {
    setTimeout(() => { results.innerHTML = ''; if (recommendation) recommendation.style.removeProperty('display'); }, 0);
  });
}

/* ── Caché en Memoria del Catálogo para la Vitrina del Drawer ── */
let _productsCache: any[] | null = null;
let _productsCachePromise: Promise<any[]> | null = null;

async function getCachedCatalogProducts(): Promise<any[]> {
  if (_productsCache && _productsCache.length > 0) return _productsCache;
  if (_productsCachePromise) return _productsCachePromise;

  _productsCachePromise = (async () => {
    try {
      const r = await fetch('/api/public-data/products?limit=80');
      const d = await r.json();
      const items = Array.isArray(d.products) ? d.products : [];
      _productsCache = items;
      return items;
    } catch {
      return [];
    } finally {
      _productsCachePromise = null;
    }
  })();
  return _productsCachePromise;
}

/**
 * Vitrina de productos dentro del submenú de una categoría.
 * Carga productos cacheados en memoria para respuesta instantánea (0ms)
 * y máximo ahorro de peticiones a la API / Appwrite.
 */
async function loadCategoryPreview(
  submenu: HTMLElement,
  subNameById: Record<string, string>,
  max = 24,
): Promise<void> {
  const box = submenu.querySelector<HTMLElement>('[data-preview]');
  const catId = submenu.dataset.catId;
  const catName = submenu.dataset.catName;
  if (!box) return;
  if (box.dataset.loaded === '1') return;
  box.dataset.loaded = '1';

  try {
    const allProducts = await getCachedCatalogProducts();
    
    // Filtrar por categoría (ID o nombre)
    let all = allProducts.filter(p => 
      (catId && (p.CATEGORYID === catId || p.categoryId === catId)) ||
      (catName && p.CATEGORYNAME && p.CATEGORYNAME.toLowerCase().trim().includes(catName.toLowerCase().trim())) ||
      (catName && p.CATEGORYID && catId && p.CATEGORYID === catId)
    );

    // Fallback: si no hay productos filtrados exactos, mostrar productos con imagen del catálogo
    if (!all.length) {
      all = allProducts.filter(p => p.IMAGEURL || p.IMAGEURL2);
    }
    if (!all.length) { box.innerHTML = ''; return; }

    const elegidos = all.slice(0, max);

    const cards = elegidos.map(p => {
      const img = resolveStorageImageUrl(p.IMAGEURL) || resolveStorageImageUrl(p.IMAGEURL2) || '';
      const price = priceOf(p);
      const tag = subNameById[p.SUBCATEGORYID || p.subcategoryId] || '';
      return `<a class="drawer__preview-card group flex flex-col gap-2 p-2.5 bg-white rounded-2xl border border-neutral-200/80 text-neutral-900 no-underline shadow-sm hover:shadow-md transition-all duration-300" href="/productos/${esc(p.$id)}">
        <span class="drawer__preview-img relative w-full aspect-square rounded-xl overflow-hidden bg-neutral-100 block">
          ${img ? `<img src="${esc(img)}" alt="${esc(p.NAME || '')}" loading="lazy" class="w-full h-full object-cover block group-hover:scale-105 transition-transform duration-500 ease-out" style="width:100%;height:100%;object-fit:cover;display:block">` : '<span class="block w-full h-full bg-neutral-200"></span>'}
          ${tag ? `<span class="drawer__preview-tag absolute bottom-1.5 left-1.5 bg-slate-900/85 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">${esc(tag)}</span>` : ''}
        </span>
        <span class="drawer__preview-name text-xs font-bold leading-tight text-neutral-900 line-clamp-2 group-hover:text-black transition-colors" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.NAME || '')}</span>
        ${price > 0 ? `<span class="drawer__preview-price text-sm font-extrabold text-amber-600">${esc(money(price))}</span>` : ''}
      </a>`;
    }).join('');

    box.innerHTML = `<div class="flex items-center justify-between pt-3 pb-2.5 border-t border-neutral-200/80 mb-3">
        <p class="drawer__preview-title text-xs font-extrabold uppercase tracking-wider text-neutral-900 m-0">Productos destacados</p>
        <span class="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">${elegidos.length} productos</span>
      </div>
      <div class="drawer__preview-grid grid grid-cols-2 gap-3 pb-8">${cards}</div>`;
  } catch (err) {
    console.error('Error cargando productos:', err);
    box.innerHTML = '';
  }
}

export function enhanceConceptHeader(root: HTMLElement | Document, data: EnhanceData): void {
  // Parche para evitar errores en el script del tema OverlayElement mouse handlers
  try {
    if (typeof window !== 'undefined' && (window as any).OverlayElement?.prototype) {
      const proto = (window as any).OverlayElement.prototype;
      (['onMouseMove', 'onMouseLeave', 'onMouseDown', 'onMouseUp'] as const).forEach(fn => {
        const orig = proto[fn];
        if (orig && !orig._patched) {
          const patched = function (this: any, e: MouseEvent) {
            try {
              if (this && this.classList) return orig.call(this, e);
            } catch { /* noop */ }
          };
          (patched as any)._patched = true;
          proto[fn] = patched;
        }
      });
    }
  } catch { /* noop */ }

  // Reemplazar iconos demo (driver, bluetooth, etc) por iconos genéricos
  try { replaceDemoIcons(root as HTMLElement); } catch { /* noop */ }

  const { categories, subcategories, catCounts, subCounts, logoUrl, storeName, featuredProduct, onFeaturedAddToCart } = data;

  const headerEl = (root as HTMLElement).querySelector?.('.header') || (root as HTMLElement).querySelector?.('header');
  if (headerEl) {
    const h = headerEl.getBoundingClientRect().height;
    if (h > 0 && (root as HTMLElement).style) {
      (root as HTMLElement).style.setProperty('--header-height', `${h}px`);
    }
    /* ── Remover header-transparent para garantizar navbar blanca ── */
    headerEl.classList.remove('header-transparent');
    headerEl.parentElement?.classList.remove('header-transparent');
    headerEl.closest('.header-section')?.classList.remove('header-transparent');

    /* ── Esquinas SVG cóncavas: amarillas (#facc15) en inicio para fundirse con la barra de anuncio, blancas en otras páginas ── */
    const isHome = typeof window !== 'undefined' && window.location.pathname === '/';
    const cornerColor = '#ffffff';
    /* Aplicar color a TODOS los corners (top y bottom) del header */
    headerEl.querySelectorAll<HTMLElement>('.header__corner').forEach(corner => {
      corner.style.setProperty('color', cornerColor, 'important');
      corner.querySelectorAll<SVGPathElement>('svg path').forEach(p => {
        if (p.getAttribute('fill') !== 'none') {
          p.style.setProperty('fill', cornerColor, 'important');
        }
      });
    });
    /* Añadir corners SUPERIORES si no existen */
    if (!headerEl.querySelector('.header__corner.top')) {
      const cornerTopLeft = document.createElement('span');
      cornerTopLeft.className = 'header__corner corner left top flex absolute pointer-events-none';
      cornerTopLeft.style.setProperty('color', cornerColor, 'important');
      cornerTopLeft.innerHTML = `<svg class="w-full h-auto" viewBox="0 0 101 101" stroke="none" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="presentation"><path fill-rule="evenodd" clip-rule="evenodd" d="M101 0H0V101H1C1 45.7715 45.7715 1 101 1V0Z"></path><path d="M1 101C1 45.7715 45.7715 1 101 1" fill="none"></path></svg>`;
      const cornerTopRight = document.createElement('span');
      cornerTopRight.className = 'header__corner corner right top flex absolute pointer-events-none';
      cornerTopRight.style.setProperty('color', cornerColor, 'important');
      cornerTopRight.innerHTML = `<svg class="w-full h-auto" viewBox="0 0 101 101" stroke="none" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="presentation"><path fill-rule="evenodd" clip-rule="evenodd" d="M101 0H0V101H1C1 45.7715 45.7715 1 101 1V0Z"></path><path d="M1 101C1 45.7715 45.7715 1 101 1" fill="none"></path></svg>`;
      headerEl.appendChild(cornerTopLeft);
      headerEl.appendChild(cornerTopRight);
    }
    /* Re-aplicar fill a los paths recién creados */
    headerEl.querySelectorAll<HTMLElement>('.header__corner.top').forEach(corner => {
      corner.querySelectorAll<SVGPathElement>('svg path').forEach(p => {
        if (p.getAttribute('fill') !== 'none') {
          p.style.setProperty('fill', cornerColor, 'important');
        }
      });
    });
    /* Observer: el theme JS puede re-renderizar los corners; re-aplicar color */
    const headerHtmlEl = headerEl as HTMLElement;
    if (!headerHtmlEl.dataset.cornerObserverWired) {
      headerHtmlEl.dataset.cornerObserverWired = '1';
      const observer = new MutationObserver(() => {
        const isH = typeof window !== 'undefined' && window.location.pathname === '/';
        const cc = '#ffffff';
        headerEl.querySelectorAll<HTMLElement>('.header__corner').forEach(corner => {
          corner.style.setProperty('color', cc, 'important');
          corner.querySelectorAll<SVGPathElement>('svg path').forEach(p => {
            if (p.getAttribute('fill') !== 'none') {
              p.style.setProperty('fill', cc, 'important');
            }
          });
        });
      });
      observer.observe(headerEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }
  }

  const order = (x: { order?: number }) => (typeof x.order === 'number' ? x.order : 9999);
  const subsForAll = (catId: string) =>
    subcategories.filter(s => s.categoryId === catId && !s.parentSubcategoryId);

  // ¿Tenemos conteos de productos por categoría? En producción sí → filtramos
  // como el navbar original (solo categorías con productos, ordenadas por
  // cantidad). Si la DB aún no está categorizada (conteos vacíos), caemos a la
  // ESTRUCTURA del catálogo: categorías que tengan subcategorías, por 'order'.
  //
  // IMPORTANTE: verificamos que al menos un key de catCounts coincida con los
  // IDs reales de las categorías. Si los counts vienen con IDs antiguos
  // (migración de Appwrite) que no coinciden con el catálogo nuevo, tratamos
  // hasCounts como false y caemos al orden de 'order' para mostrar todas las
  // categorías reales.
  const categoryIds = new Set(categories.map(c => c.$id));
  const hasCounts =
    Object.keys(catCounts).length > 0 &&
    Object.keys(catCounts).some(k => categoryIds.has(k));

  const navCats = hasCounts
    ? categories
        .filter(c => (catCounts[c.$id] || 0) > 0)
        .sort((a, b) => (catCounts[b.$id] || 0) - (catCounts[a.$id] || 0))
    : categories
        .filter(c => subsForAll(c.$id).length > 0)
        .sort((a, b) => order(a) - order(b));

  const subsFor = (catId: string) =>
    hasCounts
      ? subcategories
          .filter(s => s.categoryId === catId && !s.parentSubcategoryId && (subCounts[s.$id] || 0) > 0)
          .sort((a, b) => (subCounts[b.$id] || 0) - (subCounts[a.$id] || 0))
      : subsForAll(catId).sort((a, b) => order(a) - order(b));

  const label = (name: string) => `${EMOJI[name] ? EMOJI[name] + ' ' : ''}${name}`;

  /* ── 1. LOGO ── */
  try {
    root.querySelectorAll<HTMLImageElement>('.header__logo img, .header__logo-link img').forEach(img => {
      img.src = logoUrl;
      img.removeAttribute('srcset');
      img.alt = storeName;
    });
    root.querySelectorAll('.header__logo .sr-only').forEach(el => { el.textContent = storeName; });
  } catch { /* noop */ }

  /* ── 2. MENÚ DESKTOP ── */
  try {
    const ul = root.querySelector('.header__menu ul.list-menu') || root.querySelector('.header__menu ul');
    if (ul) {
      const parts: string[] = [];
      parts.push(deskLink('/', 'Inicio'));
      parts.push(deskLink('/productos', 'Catálogo'));
      for (const cat of navCats) {
        const cSubs = subsFor(cat.$id);
        if (cSubs.length === 0) {
          parts.push(deskLink(catHref(cat.name), label(cat.name)));
        } else {
          parts.push(deskDropdown(
            label(cat.name),
            catHref(cat.name),
            cSubs.map(s => ({ href: subHref(cat.name, s.$id), name: s.name })),
          ));
        }
      }
      ul.innerHTML = parts.join('');

      // Hover manual para dropdowns de subcategorías con animación escalonada JS
      const wireDropdownHover = (det: HTMLDetailsElement) => {
        const dropdown = det.querySelector<HTMLElement>('.dropdown');
        if (!dropdown) return;
        const lis = dropdown.querySelectorAll<HTMLElement>('.dropdown__nav > li');

        det.addEventListener('mouseenter', () => {
          det.setAttribute('open', '');
          det.classList.add('is-open');
          dropdown.setAttribute('open', '');
          dropdown.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
          dropdown.classList.add('opacity-100', 'visible', 'pointer-events-auto');
          document.body.classList.add('has-dropdown-menu');

          lis.forEach((li, i) => {
            li.style.transition = 'transform 0.5s cubic-bezier(0.075, 0.82, 0.165, 1), opacity 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
            li.style.opacity = '1';
            li.style.transform = 'translateX(0)';
          });
        });

        det.addEventListener('mouseleave', () => {
          det.removeAttribute('open');
          det.classList.remove('is-open');
          document.body.classList.remove('has-dropdown-menu');
          dropdown.removeAttribute('open');
          dropdown.classList.add('invisible', 'opacity-0', 'pointer-events-none');
          dropdown.classList.remove('opacity-100', 'visible', 'pointer-events-auto');
        });
      };
      ul.querySelectorAll<HTMLDetailsElement>('details.details-dropdown-clone').forEach(wireDropdownHover);

      const killCornerStrokes = () => {
        ul.querySelectorAll<SVGPathElement>('.dropdown__corner svg path:last-child').forEach(p => {
          if (p.getAttribute('fill') === 'none') p.remove();
        });
      };
      killCornerStrokes();
      setTimeout(killCornerStrokes, 500);
      setTimeout(killCornerStrokes, 1500);
    }
  } catch { /* noop */ }

  /* ── 3. MENÚ DRAWER MÓVIL (Conectado a Firebase) ── */
  try {
    const dul = root.querySelector('.menu-drawer .drawer__menu') || root.querySelector('ul.drawer__menu');
    if (dul) {
      const parts: string[] = [];
      parts.push(drawerLink('/', '🏠 Inicio'));
      parts.push(drawerLink('/productos', '🛍️ Todo el Catálogo'));

      // 🗂️ Categorías en reemplazo de "Ofertas"
      parts.push(renderDrawerCategoriesRoot(navCats, subcategories, catCounts, subCounts, hasCounts));

      // 👤 Mi Cuenta
      parts.push(drawerLink('/cuenta', '👤 Mi Cuenta'));

      dul.innerHTML = parts.join('');

      // Mapa subcategoría → nombre, para etiquetar cada producto de la vitrina
      const subNameById: Record<string, string> = {};
      for (const s of subcategories) subNameById[s.$id] = s.name;

      // Al abrir una categoría o subcategoría, manejamos la animación en cascada
      dul.querySelectorAll<HTMLDetailsElement>('details').forEach(details => {
        const submenu = details.querySelector<HTMLElement>(':scope > .drawer__submenu');
        const summary = details.querySelector(':scope > summary');
        const closeSubmenuBtn = submenu?.querySelector<HTMLElement>(':scope > [data-close-submenu], :scope > .drawer__close-submenu');

        const onOpen = () => {
          details.classList.add('is-open');
          if (submenu) {
            submenu.classList.add('is-open', 'active');
            if (submenu.dataset.catId && !submenu.dataset.subId) {
              loadCategoryPreview(submenu, subNameById);
            }
          }
        };

        const onClose = (e?: Event) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          details.removeAttribute('open');
          details.classList.remove('is-open');
          if (submenu) submenu.classList.remove('is-open', 'active');
        };

        // Escuchar evento toggle nativo de <details>
        details.addEventListener('toggle', () => {
          if (details.open) {
            onOpen();
          } else {
            onClose();
          }
        });

        if (summary) {
          summary.addEventListener('click', () => {
            if (submenu && submenu.dataset.catId && !submenu.dataset.subId) {
              loadCategoryPreview(submenu, subNameById);
            }
          });
        }

        if (closeSubmenuBtn) {
          closeSubmenuBtn.addEventListener('click', onClose);
        }
      });
    }

    // Asegurar que el botón de cerrar (X) y el overlay del MenuDrawer funcionen
    const menuDrawer = root.querySelector<HTMLElement>('#MenuDrawer');
    if (menuDrawer) {
      const closeDrawer = () => {
        const nativeDrawer = menuDrawer as any;
        if (typeof nativeDrawer.hide === 'function') {
          try { nativeDrawer.hide(); } catch {}
        }
        menuDrawer.removeAttribute('open');
        menuDrawer.removeAttribute('active');
        menuDrawer.setAttribute('hidden', '');
        menuDrawer.classList.remove('is-open', 'active');
        menuDrawer.classList.add('pointer-events-none');
        menuDrawer.querySelectorAll<HTMLElement>('.overlay, overlay-element').forEach(overlay => {
          overlay.classList.remove('opacity-100', 'visible', 'pointer-events-auto');
          overlay.classList.add('opacity-0', 'invisible', 'pointer-events-none');
          overlay.setAttribute('aria-expanded', 'false');
        });
        document.body.classList.remove('has-modal-opening', 'has-modal-open', 'drawer-open');
        document.body.style.overflow = '';
        root.querySelectorAll<HTMLElement>('[aria-controls="MenuDrawer"]').forEach(btn => {
          btn.setAttribute('aria-expanded', 'false');
        });
      };

      menuDrawer.querySelectorAll<HTMLElement>('.drawer__close, [data-close]').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeDrawer();
        };
      });

      menuDrawer.querySelectorAll<HTMLElement>('.overlay, overlay-element').forEach(overlay => {
        overlay.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeDrawer();
        };
      });
    }
  } catch { /* noop */ }

  /* ── 4. BUSCADOR → /productos?q= ── */
  try {
    root.querySelectorAll<HTMLFormElement>('form.search__form').forEach(form => {
      form.setAttribute('action', '/productos');
      if (form.dataset.qwired) return; // no duplicar el listener en re-runs
      form.dataset.qwired = '1';
      // Interceptar submit para navegar limpio a /productos?q= (evita el
      // predictive-search de Shopify que aquí no tiene datos).
      form.addEventListener('submit', (e) => {
        const input = form.querySelector<HTMLInputElement>('input[name="q"], input.search__input');
        const q = (input?.value || '').trim();
        e.preventDefault();
        e.stopPropagation();
        window.location.href = q ? `/productos?q=${encodeURIComponent(q)}` : '/productos';
      }, true);

      // ── BÚSQUEDA EN VIVO contra la base de datos ──
      // El predictive-search del tema pide /search/suggest a Shopify (no existe
      // aquí → "Failed to fetch"). Lo sustituimos por una búsqueda real contra
      // /api/public-data/products, pintando los resultados en el mismo sitio.
      wireLiveBuscar(form);
    });
    // Reemplazar "categorías populares" demo por categorías reales del DB
    root.querySelectorAll('.search__recommendation').forEach(rec => {
      const firstUl = rec.querySelector('li .grid, li ul');
      const listUl = rec.querySelector('li > ul') as HTMLElement | null;
      const targetUl = (listUl || firstUl) as HTMLElement | null;
      if (targetUl) {
        targetUl.innerHTML = navCats.slice(0, 6)
          .map(c => `<li><a class="reversed-link text-base md:text-lg leading-tight font-medium" href="${esc(catHref(c.name))}">${esc(label(c.name))}</a></li>`)
          .join('');
      }
    });
  } catch { /* noop */ }

  /* ── 5. CUENTA → /cuenta ── */
  try {
    root.querySelectorAll('shopify-account').forEach(acc => {
      const a = document.createElement('a');
      a.href = '/cuenta';
      a.className = acc.className;
      a.setAttribute('aria-label', 'Mi cuenta');
      a.innerHTML = acc.innerHTML; // conserva el ícono del tema
      acc.replaceWith(a);
    });
  } catch { /* noop */ }

  /* ── 6. CARRITO Y NAVEGACIÓN DE DOCK ── */
  try {
    root.querySelectorAll<HTMLAnchorElement>('a[href="/collections/all"], a[href="/collections"]').forEach(a => {
      a.setAttribute('href', '/productos');
    });
    // Catch-all: cualquier link /collections/* restante → /productos
    root.querySelectorAll<HTMLAnchorElement>('a[href^="/collections/"]').forEach(a => {
      a.setAttribute('href', '/productos');
    });
  } catch { /* noop */ }

  /* ── 7. CORTINAS Y BÚSQUEDA MÓVIL / DESKTOP ── */
  wireGlobalDrawersAndBuscar(root);

  /* ── 8. REEMPLAZAR SECCIONES ESTÁTICAS CON CATEGORÍAS REALES ── */
  try {
    const ARROW_SVG = `<svg class="icon icon-arrow-right icon-xs transform shrink-0" viewBox="0 0 21 20" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10H18M18 10L12.1667 4.16675M18 10L12.1667 15.8334"></path></svg>`;
    const FALLBACK_IMGS = [
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-02.webp?v=1708422644&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-03.webp?v=1708443712&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-04.webp?v=1708422644&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-05.webp?v=1708443712&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-06.webp?v=1708422644&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-07.webp?v=1708422644&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-08.webp?v=1708422645&width=1200',
      '//concept-theme-tech.myshopify.com/cdn/shop/files/collection-01.webp?v=1708422644&width=1200',
    ];

    // ── 8a. MEDIA CARDS (grid de categorías) ──
    const cardGrid = root.querySelector<HTMLElement>('.card-grid.media-card, motion-list.card-grid');
    if (cardGrid && navCats.length > 0) {
      const cards = cardGrid.querySelectorAll<HTMLElement>('.card.media-card');
      cards.forEach((card, i) => {
        const link = card.querySelector<HTMLAnchorElement>('.media-card__link');
        if (!link) return;

        // Primera card = "Todos los productos" (la dejamos como está)
        if (i === 0 && link.getAttribute('href') === '/collections/all') {
          link.setAttribute('href', '/productos');
          const heading = card.querySelector('.heading.reversed-link');
          if (heading) heading.innerHTML = `Todos los productos`;
          const sub = card.querySelector('.media-card__text p.leading-none');
          if (sub) sub.textContent = 'Explora todos nuestros productos';
          return;
        }

        // Mapear a categorías reales (i-1 porque la primera es "Todos")
        const catIdx = i - 1;
        if (catIdx >= 0 && catIdx < navCats.length) {
          const cat = navCats[catIdx];
          const count = catCounts[cat.$id] || 0;
          link.setAttribute('href', catHref(cat.name));
          link.setAttribute('aria-label', cat.name);
          const heading = card.querySelector('.heading.reversed-link');
          if (heading) {
            heading.innerHTML = `${esc(cat.name)}<small class="count font-medium absolute text-xs tracking-none whitespace-nowrap">${count}</small>`;
          }
          const sub = card.querySelector('.media-card__text p.leading-none');
          if (sub) sub.textContent = `${cat.name} para tu hogar`;
          const categoryImage = cat.BACKGROUND_IMAGE_URL || cat.iconUrl || cat.IMAGEURL || cat.imageUrl;
          if (categoryImage) {
            const img = card.querySelector<HTMLImageElement>('img[is="lazy-image"], .media img');
            if (img) {
              img.src = resolveStorageImageUrl(categoryImage);
              img.removeAttribute('srcset');
              img.alt = cat.name;
              img.style.display = '';
            }
          }
        } else {
          // No hay más categorías → ocultar card sobrante
          card.style.display = 'none';
        }
      });
    }

    // ── 8b. SEARCH RECOMMENDATIONS ("Categorías populares") ──
    const searchRecs = root.querySelectorAll<HTMLElement>('.search__recommendation');
    searchRecs.forEach(rec => {
      const heading = rec.querySelector('.search__heading');
      if (heading && heading.textContent?.includes('Categor')) {
        const ul = rec.querySelector('ul');
        if (ul && navCats.length > 0) {
          const top4 = navCats.slice(0, 4);
          ul.innerHTML = top4.map(cat =>
            `<li><a class="reversed-link text-base md:text-lg leading-tight font-medium" href="${esc(catHref(cat.name))}">${esc(cat.name)}</a></li>`
          ).join('');
        }
      }
    });

    // ── 8c. CART EMPTY COLLECTIONS ──
    const cartEmpty = root.querySelector('.drawer__empty-collections');
    if (cartEmpty && navCats.length > 0) {
      const top3 = navCats.slice(0, 3);
      cartEmpty.innerHTML = top3.map(cat => {
        const count = catCounts[cat.$id] || 0;
        return `<li><a class="flex items-center justify-between" href="${esc(catHref(cat.name))}"><span>${esc(cat.name)}</span><span class="text-sm opacity-50">(${count})</span>${ARROW_SVG}</a></li>`;
      }).join('');
    }

    // ── 8d. SLIDESHOW (3 slides con links a categorías) ──
    const slideshowLinks = root.querySelectorAll<HTMLAnchorElement>('.slideshow-word a');
    const slideBtns = ['Ver Catálogo', 'Ver Producto', 'Ver Producto'];
    slideshowLinks.forEach((link, i) => {
      if (i === 1) {
        link.setAttribute('href', '/productos/6a630760001f918aadd8');
      } else if (i === 2) {
        link.setAttribute('href', '/productos/6a630779000d85719564');
      } else if (i < navCats.length) {
        link.setAttribute('href', catHref(navCats[i].name));
      } else {
        link.setAttribute('href', '/productos');
      }
      const btnText = link.querySelector('.btn-text');
      if (btnText) {
        const svg = btnText.querySelector('svg');
        btnText.textContent = slideBtns[i] || 'Ver más';
        if (svg) btnText.appendChild(svg);
      }
    });


  } catch { /* noop */ }

  /* ── 9. PRODUCTO DESTACADO (reemplazar "Flow Harmony" con producto real) ── */
  try {
    const fpSection = root.querySelector<HTMLElement>('#featured-product-section');
    if (featuredProduct && fpSection) {
      const fp = featuredProduct;
      const productUrl = `/productos/${fp.$id}`;
      const realPrice = (fp as any).CURRENTPRICE || fp.PRICE;
      const priceStr = realPrice != null ? `$${Number(realPrice).toLocaleString('es-CL')}` : '';

      // Título del producto destacado
      fpSection.querySelectorAll('.product__title .split-words, .product__title h2').forEach(el => {
        el.textContent = fp.NAME;
      });

      // Precio en la cabecera del producto
      fpSection.querySelectorAll('.product__price .price__regular, .product__price .price').forEach(el => {
        el.textContent = priceStr;
      });

      // PRECIO Y TEXTO EN EL BOTÓN "Añadir al carrito" (texto limpio unificado)
      fpSection.querySelectorAll<HTMLElement>('.product-form__submit').forEach(el => {
        el.setAttribute('aria-label', `Añadir ${fp.NAME} al carrito`);
        el.setAttribute('type', 'button');
        const btnText = el.querySelector<HTMLElement>('.btn-text');
        if (btnText) {
          btnText.textContent = `Añadir al carrito  •  ${priceStr}`;
        }
        if (!el.dataset.yaxselFeaturedCart) {
          el.dataset.yaxselFeaturedCart = '1';
          el.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            onFeaturedAddToCart?.(fp);
            window.dispatchEvent(new CustomEvent('yaxsel:open-cart'));
          }, true);
        }
      });

      // Indicador de Stock Real (soluciona el "¡Apresúrate, solo quedan 5 unidades en stock!")
      const inventoryEl = fpSection.querySelector<HTMLElement>('.product__inventory');
      if (inventoryEl) {
        const stockVal = (fp as any).STOCK;
        const textSpan = inventoryEl.querySelector('span');
        const progressBar = inventoryEl.querySelector('progress-bar');

        if (typeof stockVal === 'number') {
          if (stockVal > 0) {
            if (textSpan) textSpan.textContent = `¡Apresúrate, solo quedan ${stockVal} unidades en stock!`;
            if (progressBar) {
              progressBar.setAttribute('data-value', String(stockVal));
              progressBar.setAttribute('data-max', String(Math.max(15, stockVal)));
            }
            inventoryEl.style.display = '';
          } else {
            if (textSpan) textSpan.textContent = `Agotado - Sin stock disponible`;
            if (progressBar instanceof HTMLElement) progressBar.style.display = 'none';
            inventoryEl.style.display = '';
          }
        } else {
          // Si no tiene stock definido (o es ilimitado), ocultar la alerta de 5 unidades demo
          inventoryEl.style.display = 'none';
        }
      }

      // Vendedor → ocultar
      fpSection.querySelectorAll<HTMLElement>('.product__vendor').forEach(el => { el.style.display = 'none'; });

      // Rating del demo → ocultar
      fpSection.querySelectorAll<HTMLElement>('.product__rating').forEach(el => { el.style.display = 'none'; });

      // Variant picker (colores del demo) → ocultar
      fpSection.querySelectorAll<HTMLElement>('variant-picker').forEach(el => { el.style.display = 'none'; });

      // Bundle de accesorios del demo en la ficha → ocultar
      fpSection.querySelectorAll<HTMLElement>('#ProductBundle-template--27619508257049__5a2a4051-042d-48d7-955c-dc7a08cd5474-8678367428889, .product__accordion[is="product-bundle-details"]').forEach(el => { el.style.display = 'none'; });

      // Formulario de cuotas/installment del demo → ocultar
      fpSection.querySelectorAll<HTMLElement>('.installment, form[id*="ProductFormInstallment"]').forEach(el => { el.style.display = 'none'; });

      // Pickup availability del demo → ocultar
      fpSection.querySelectorAll<HTMLElement>('pickup-availability').forEach(el => { el.style.display = 'none'; });

      // Textos demo debajo de compartir → ocultar
      fpSection.querySelectorAll<HTMLElement>('.product__text').forEach(el => {
        const inner = el.querySelector('.product__text-inner');
        if (inner && !inner.querySelector('.rte')?.textContent?.trim()) return;
        const text = inner?.querySelector('.rte')?.textContent || '';
        if (text.includes('90') || text.includes('garantía') || text.includes('Garantía') || text.includes('envío') || text.includes('Envío') || text.includes('devoluciones')) {
          el.style.display = 'none';
        }
      });

      // "Ver detalles completos" del demo → ocultar
      fpSection.querySelectorAll<HTMLElement>('.product__more').forEach(el => { el.style.display = 'none'; });

      // Texto descriptivo real
      fpSection.querySelectorAll<HTMLElement>('.product__text .rte').forEach(el => {
        if (fp.DESCRIPTION) {
          el.textContent = fp.DESCRIPTION;
        } else {
          (el.closest('.product__text') as HTMLElement)?.style.setProperty('display', 'none');
        }
      });

      // Galería de imágenes del producto DESTACADO
      const rawImgs = [
        fp.IMAGEURL,
        (fp as any).IMAGEURL2,
        (fp as any).IMAGEURL3,
        (fp as any).IMAGEURL4,
        (fp as any).IMAGEURL5
      ].filter(Boolean) as string[];

      // Deduplicar imágenes de la galería
      const productImages = Array.from(new Set(rawImgs));

      // 1. Fotos grandes en el visor principal
      const mediaItems = Array.from(fpSection.querySelectorAll<HTMLElement>('.product__media-list .product__media'));
      mediaItems.forEach((media, i) => {
        if (i < productImages.length) {
          const img = media.querySelector<HTMLImageElement>('img');
          if (img) {
            img.src = productImages[i];
            img.removeAttribute('srcset');
            img.removeAttribute('data-srcset');
            img.alt = fp.NAME;
            img.classList.add('is-loaded');
            img.style.opacity = '1';
            img.style.visibility = 'visible';
          }
          media.style.display = '';
        } else {
          media.remove();
        }
      });

      // 2. Miniaturas cuadradas laterales de la galería
      const thumbItems = Array.from(fpSection.querySelectorAll<HTMLElement>('.product__thumbnails .product__thumbnail, .product__thumbnail'));
      
      const switchGalleryImage = (index: number) => {
        if (!productImages[index]) return;

        const currentThumbs = Array.from(fpSection.querySelectorAll<HTMLElement>('.product__thumbnails .product__thumbnail, .product__thumbnail'));
        const targetThumb = currentThumbs[index];
        const mediaId = targetThumb?.getAttribute('data-media-id');

        // 1. Actualizar estado activo en las miniaturas
        currentThumbs.forEach((t, idx) => {
          t.setAttribute('aria-current', idx === index ? 'true' : 'false');
          if (idx === index) {
            t.classList.add('is-active', 'active');
            t.style.borderColor = '#000000';
          } else {
            t.classList.remove('is-active', 'active');
            t.style.borderColor = '#e2e8f0';
          }
        });

        // 2. Métodos nativos del Web Component de Concept Theme (Plantilla 25)
        const mediaGallery = fpSection.querySelector<any>('media-gallery');
        const sliderGallery = fpSection.querySelector<any>('slider-element');

        if (mediaGallery && typeof mediaGallery.setActiveMedia === 'function' && mediaId) {
          try { mediaGallery.setActiveMedia(mediaId); } catch { /* noop */ }
        }

        if (sliderGallery) {
          if (typeof sliderGallery.selectFrame === 'function') {
            try { sliderGallery.selectFrame(index + 1); } catch { /* noop */ }
          } else if (typeof sliderGallery.scrollToIndex === 'function') {
            try { sliderGallery.scrollToIndex(index); } catch { /* noop */ }
          }
        }

        // 3. Fallback: Desplazar el visor principal suavemente
        const mediaList = fpSection.querySelector<HTMLElement>('.product__media-list');
        const mediaItems = Array.from(fpSection.querySelectorAll<HTMLElement>('.product__media-list .product__media'));
        const targetMedia = mediaItems[index] || mediaItems[0];

        if (targetMedia) {
          if (mediaList) {
            try { mediaList.scrollLeft = targetMedia.offsetLeft; } catch { /* noop */ }
          }
          try {
            targetMedia.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          } catch { /* noop */ }
        }

        // 4. Fallback directo: cambiar el src de la imagen visible del visor principal
        // (los web components del theme pueden no estar listos al inicio)
        const mainMedia = mediaItems[0];
        if (mainMedia) {
          const mainImg = mainMedia.querySelector<HTMLImageElement>('img');
          if (mainImg && mainImg.src !== productImages[index]) {
            mainImg.src = productImages[index];
            mainImg.removeAttribute('srcset');
            mainImg.alt = fp.NAME;
          }
        }
      };

      thumbItems.forEach((thumb, i) => {
        if (i < productImages.length) {
          const img = thumb.querySelector<HTMLImageElement>('img');
          if (img) {
            img.src = productImages[i];
            img.removeAttribute('srcset');
            img.removeAttribute('data-srcset');
            img.alt = fp.NAME;
            img.classList.add('is-loaded');
            img.style.opacity = '1';
            img.style.visibility = 'visible';
          }
          thumb.style.display = '';

          thumb.onclick = () => switchGalleryImage(i);
          thumb.ontouchend = () => switchGalleryImage(i);
        } else {
          thumb.remove();
        }
      });

      // Escuchar eventos en fase de captura sin congelar la propagación nativa del tema
      const handleThumbEvent = (e: Event) => {
        const target = e.target as HTMLElement;
        const thumb = target?.closest<HTMLElement>('.product__thumbnail');
        if (!thumb || !fpSection.contains(thumb)) return;

        const currentThumbs = Array.from(fpSection.querySelectorAll<HTMLElement>('.product__thumbnails .product__thumbnail, .product__thumbnail'));
        const index = currentThumbs.indexOf(thumb);
        if (index !== -1) {
          switchGalleryImage(index);
        }
      };

      if (!(fpSection as any)._thumbWired) {
        (fpSection as any)._thumbWired = true;
        fpSection.addEventListener('click', handleThumbEvent, true);
        fpSection.addEventListener('touchend', handleThumbEvent, true);
      }

      // Si solo hay 1 imagen o ninguna extra, ocultar las miniaturas
      const thumbContainer = fpSection.querySelector<HTMLElement>('.product__thumbnails');
      if (thumbContainer) {
        if (productImages.length <= 1) {
          thumbContainer.style.display = 'none';
        } else {
          thumbContainer.style.display = '';
        }
      }

      // ── Lightbox: botón "media-lightbox-button" para expandir imagen ──
      const lightboxButtons = fpSection.querySelectorAll<HTMLButtonElement>('button[is="media-lightbox-button"], .product__media button[aria-label*="Open media"]');
      lightboxButtons.forEach((btn, idx) => {
        btn.style.cursor = 'zoom-in';
        btn.onclick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const mediaEl = btn.closest<HTMLElement>('.product__media');
          const img = mediaEl?.querySelector<HTMLImageElement>('img');
          const imgSrc = img?.src || productImages[idx] || productImages[0];
          if (!imgSrc) return;

          const lightbox = document.createElement('div');
          lightbox.id = 'yaxsell-media-lightbox';
          lightbox.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.92); z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            cursor: zoom-out; opacity: 0; transition: opacity 0.3s ease;
            backdrop-filter: blur(8px);
          `;
          lightbox.innerHTML = `
            <img src="${imgSrc}" alt="${esc(fp.NAME)}" style="max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,0.5);" />
            <button style="position: absolute; top: 20px; right: 20px; width: 44px; height: 44px; border-radius: 50%; border: none; background: #0f172a; color: #fff; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center;">\u2715</button>
          `;
          document.body.appendChild(lightbox);
          requestAnimationFrame(() => { lightbox.style.opacity = '1'; });

          const closeLightbox = () => {
            lightbox.style.opacity = '0';
            setTimeout(() => lightbox.remove(), 300);
          };
          lightbox.onclick = (ev: MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            closeLightbox();
          };
          const lbEsc = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
              closeLightbox();
              document.removeEventListener('keydown', lbEsc);
            }
          };
          document.addEventListener('keydown', lbEsc);
        };
      });

      // Insignia circular giratoria "FEATURED • PRODUCT 👍" sobre la galería
      const galleryContainer = fpSection.querySelector<HTMLElement>('.product__gallery-container');
      if (galleryContainer && !galleryContainer.querySelector('.featured-badge-stamp')) {
        const stamp = document.createElement('div');
        stamp.className = 'featured-badge-stamp absolute -top-10 left-1/2 -translate-x-1/2 z-10 pointer-events-none hidden md:flex items-center justify-center';
        stamp.innerHTML = `
          <div style="position:relative;width:96px;height:96px;display:flex;align-items:center;justify-content:center;">
            <svg class="animate-spin-slow" viewBox="0 0 100 100" style="width:96px;height:96px;">
              <path id="circlePathFP" d="M 50, 50 m -37, 0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" fill="none" />
              <text font-size="9.5" font-weight="800" letter-spacing="2" fill="#1e293b">
                <textPath href="#circlePathFP" startOffset="0%">FEATURED • PRODUCT • </textPath>
              </text>
            </svg>
            <div style="position:absolute;font-size:18px;">👍</div>
          </div>
        `;
        galleryContainer.style.position = 'relative';
        galleryContainer.prepend(stamp);
      }

      // Ocultar características demo (driver 40mm, bluetooth, etc.)
      const highlightsSection = fpSection.querySelector<HTMLElement>('.product__highlights');
      if (highlightsSection) {
        const specContainer = highlightsSection.querySelector('.product-card__icons');
        if (specContainer) {
          if (fp.DESCRIPTION) {
            specContainer.innerHTML = `<div class="product-card__icon shrink-0"><div class="flex flex-col items-center md:flex-row md:items-start gap-2"><div class="flex flex-col items-center md:items-start gap-1 text-center md:text-left text-sm font-medium leading-none">${esc(fp.DESCRIPTION.slice(0, 120))}${fp.DESCRIPTION.length > 120 ? '...' : ''}</div></div></div>`;
          } else {
            highlightsSection.style.display = 'none';
          }
        }
      }

      fpSection.style.opacity = '1';
      fpSection.style.display = '';
    } else {
      if (fpSection) fpSection.style.display = 'none';
    }

    // Ocultar sección demo "Sound in Spectrum" (slider antes/después)
    root.querySelectorAll<HTMLElement>('#shopify-section-template--27619508257049__f2e92fa2-5b20-410e-8bf3-110086f3e646, image-comparison, .image-comparison').forEach(el => {
      el.style.display = 'none';
      const sec = el.closest('.shopify-section') as HTMLElement;
      if (sec) sec.style.display = 'none';
    });

    // Ocultar pestaña y sección "Vistos recientemente" / Historial
    root.querySelectorAll<HTMLElement>('button[aria-controls*="RecentlyViewed"], [id*="RecentlyViewed"], recently-viewed, .cart__recent').forEach(el => {
      el.style.display = 'none';
      const li = el.closest('li');
      if (li && li.parentElement?.classList.contains('drawer__tabs')) {
        li.style.display = 'none';
      }
    });

    // Ocultar sección demo "Últimas Historias" (Blog)
    root.querySelectorAll<HTMLElement>('#shopify-section-template--27619508257049__b961e2b0-2f28-45fb-9664-549114d9a961, .blog-grid, .blog-collage').forEach(el => {
      el.style.display = 'none';
      const sec = el.closest('.shopify-section') as HTMLElement;
      if (sec) sec.style.display = 'none';
    });

    // Marquesina con el logo del usuario (capa blanca en cinta amarilla, capa negra en cinta blanca)
    const brandLogoUrl = '/images/optimized/logo-carlitos.svg';
    root.querySelectorAll<HTMLElement>('#shopify-section-template--27619508257049__2b953df0-1be3-4463-ba29-1f87f345dcc9').forEach(el => {
      el.style.display = 'block';
      el.querySelectorAll<HTMLElement>('marquee-element, .scrolling-text').forEach(m => {
        m.removeAttribute('data-parallax');
      });

      // Duplicar elementos dentro de cada .marquee para movimiento ininterrumpido
      el.querySelectorAll<HTMLElement>('.marquee').forEach(marq => {
        if (marq.children.length > 0 && marq.children.length < 14) {
          marq.innerHTML = marq.innerHTML + marq.innerHTML;
        }
      });

      el.querySelectorAll<HTMLImageElement>('img').forEach(img => {
        img.src = brandLogoUrl;
        img.removeAttribute('srcset');
        img.removeAttribute('data-srcset');
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        img.style.display = 'block';
        img.classList.add('is-loaded');
      });
    });

    // ── 10. PIE DE PÁGINA (FOOTER) CON LA MARCA DE IMPORTADORA CARLITOS ──
    const footer = root.querySelector<HTMLElement>('footer, .footer, .shopify-section-group-footer-group');
    if (footer) {
      // Logo del Footer (Blanco puro en la imagen PNG, sin fondo blanco)
      footer.querySelectorAll<HTMLImageElement>('.footer__logo img, .footer img').forEach(img => {
        img.src = brandLogoUrl;
        img.removeAttribute('srcset');
        img.removeAttribute('data-srcset');
        img.style.maxHeight = '95px';
        img.style.maxWidth = '260px';
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        img.style.filter = 'brightness(0) invert(1)';

        const parentAnchor = img.closest('a');
        if (parentAnchor) {
          parentAnchor.style.display = 'inline-block';
          parentAnchor.style.backgroundColor = 'transparent';
          parentAnchor.style.padding = '0';
          parentAnchor.style.borderRadius = '0';
          parentAnchor.style.boxShadow = 'none';
          parentAnchor.style.border = 'none';
        }
      });

      // Colecciones en el Footer con Categorías Reales
      const collectionsCol = footer.querySelector('.footer__item--6b5e7956-d5ac-40aa-8422-6ec22b172b81 .details__content ul, details:first-of-type .details__content ul');
      if (collectionsCol && navCats.length > 0) {
        collectionsCol.innerHTML = navCats.slice(0, 6).map(cat => 
          `<li class="inline-flex"><a href="${esc(catHref(cat.name))}" class="block reversed-link text-sm-lg leading-tight">${esc(cat.name)}</a></li>`
        ).join('');
      }

      // Información en el Footer
      const infoCol = footer.querySelector('.footer__item--10ecab98-b3cd-4d06-b3b9-82ceaa6421ee .details__content ul, details:nth-of-type(2) .details__content ul');
      if (infoCol) {
        infoCol.innerHTML = `
          <li class="inline-flex"><a href="/" class="block reversed-link text-sm-lg leading-tight">Inicio</a></li>
          <li class="inline-flex"><a href="/productos" class="block reversed-link text-sm-lg leading-tight">Catálogo</a></li>
        `;
      }

      // Reemplaza el contenido demo por la marca de Importadora Carlitos.
      footer.querySelectorAll('.footer__contact').forEach(el => {
        el.innerHTML = `
          <p><span class="leading-tight text-left text-sm font-semibold text-gray-200">IMPORTADORA CARLITOS</span></p>
          <p><span class="leading-tight text-left text-xs text-gray-300">Tienda online en Chile</span></p>
        `;
      });

      // Copyright Real (reemplazar Concept Theme Tech / Shopify)
      const copyrightEl = root.querySelector('.footer-copyright .credits, .credits');
      if (copyrightEl) {
        copyrightEl.innerHTML = `&copy; ${new Date().getFullYear()} IMPORTADORA CARLITOS. Todos los derechos reservados.`;
      }
    }

    // ── 11. BARRA DE ANUNCIOS SUPERIOR (REGLAS DE NEGOCIO REALES) Y OCULTAR IDIOMA/MONEDA ──
    const annBar = root.querySelector<HTMLElement>('.announcement-bar, announcement-bar, #Slider-sections--27619502031129__announcement-bar');
    if (annBar) {
      const slides = annBar.querySelectorAll<HTMLElement>('.announcement__slide, .announcement__content');
      if (slides.length > 0) {
        if (slides[0]) {
          const p1 = slides[0].querySelector<HTMLElement>('.announcement-text, p');
          if (p1) p1.textContent = '✨ Perfumes, ropa y novedades para ti';
        }
        if (slides[1]) {
          const p2 = slides[1].querySelector<HTMLElement>('.announcement-text, p');
          if (p2) p2.textContent = '🚀 Explora el catálogo de Importadora Carlitos';
        }
      }
    }

    // Eliminar por completo los selectores de idioma y moneda en Navbar, Drawer Móvil y Footer
    root.querySelectorAll<HTMLElement>('.localization, dropdown-localization, [id*="Localization"], [id*="localization_language"], [id*="localization_country"], .drawer__footer-top').forEach(el => {
      el.remove();
    });
  } catch { /* noop */ }
}
let _globalDrawerWired = false;
let _justClosed = false;
let _closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

function wireGlobalDrawersAndBuscar(root: HTMLElement | Document): void {
  try {
    const ANIM_MS = 400;

    const closeAnyDrawer = (drawer: HTMLElement) => {
      // Cancelar timeout previo si existe
      if (_closeTimeoutId) { clearTimeout(_closeTimeoutId); _closeTimeoutId = null; }
      const nativeDrawer = drawer as any;
      if (typeof nativeDrawer.hide === 'function') {
        try { nativeDrawer.hide(); } catch {}
      }
      drawer.removeAttribute('active');
      drawer.removeAttribute('open');
      drawer.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('hidden', '');
      drawer.classList.remove('is-open', 'active');
      drawer.classList.add('pointer-events-none');
      drawer.classList.remove('pointer-events-auto');

      const overlay = drawer.querySelector('.overlay, overlay-element, .fixed-modal, .drawer__overlay');
      if (overlay) {
        overlay.classList.add('opacity-0', 'pointer-events-none', 'invisible');
        overlay.classList.remove('opacity-100', 'pointer-events-auto', 'visible');
      }
      drawer.querySelectorAll('.drawer__header, .drawer__content, .drawer__inner, .drawer__panel').forEach(el => {
        el.classList.add('opacity-0', 'invisible');
        el.classList.remove('opacity-100');
      });
      document.body.classList.remove('has-modal-opening', 'has-modal-open', 'drawer-open');
      document.body.style.overflow = '';
      if (drawer.id) {
        document.querySelectorAll(`[aria-controls="${drawer.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'false'));
      }
    };

    const openAnyDrawer = (drawer: HTMLElement) => {
      if (_closeTimeoutId) { clearTimeout(_closeTimeoutId); _closeTimeoutId = null; }
      const nativeDrawer = drawer as any;
      if (typeof nativeDrawer.show === 'function') {
        try { nativeDrawer.show(); } catch {}
      }
      drawer.removeAttribute('hidden');
      void drawer.offsetHeight;
      drawer.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('open', '');
      drawer.setAttribute('active', '');
      drawer.classList.add('is-open', 'active');
      drawer.classList.remove('pointer-events-none', 'invisible', 'opacity-0');
      drawer.classList.add('pointer-events-auto');

      const overlay = drawer.querySelector('.overlay, overlay-element, .fixed-modal, .drawer__overlay');
      if (overlay) {
        overlay.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100', 'pointer-events-auto', 'visible');
      }
      drawer.querySelectorAll('.drawer__header, .drawer__content, .drawer__inner, .drawer__panel').forEach(el => {
        el.classList.remove('invisible', 'opacity-0');
        el.classList.add('opacity-100');
      });
      document.body.classList.add('has-modal-opening', 'has-modal-open', 'drawer-open');
      document.body.style.overflow = 'hidden';
      if (drawer.id) {
        document.querySelectorAll(`[aria-controls="${drawer.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'true'));
      }
    };

    // Listener global SOLO una vez
    if (!_globalDrawerWired) {
      _globalDrawerWired = true;

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // No interceptar botones del slider/slideshow del tema
        if (target.closest('[is="next-button"], [is="previous-button"], .flickity-page-dot, .slider-button')) return;

        // ¿Es el botón de regresar del submenú de subcategorías?
        const subCloseBtn = target.closest('.drawer__close-submenu, [data-close-submenu]');
        if (subCloseBtn) {
          e.stopImmediatePropagation();
          e.preventDefault();
          const details = subCloseBtn.closest('details');
          if (details) {
            details.removeAttribute('open');
            details.classList.remove('is-open');
            const submenu = details.querySelector<HTMLElement>('.drawer__submenu');
            if (submenu) submenu.classList.remove('is-open', 'active');
          }
          return;
        }

        // ¿Es un botón de cerrar (X)?
        const closeBtn = target.closest('.drawer__close, [aria-label="Close"], [aria-label="Cerrar"], button.close, [data-close]:not([data-close-submenu]):not(.drawer__close-submenu)');
        if (closeBtn) {
          e.stopImmediatePropagation();
          e.preventDefault();
          const ctrl = closeBtn.getAttribute('aria-controls');
          let drawer = closeBtn.closest('.drawer, search-drawer, menu-drawer, cart-drawer, modal-element, drawer-element') as HTMLElement | null;
          if (!drawer && ctrl) drawer = document.getElementById(ctrl);
          if (drawer) {
            _justClosed = true;
            closeAnyDrawer(drawer);
            setTimeout(() => { _justClosed = false; }, ANIM_MS + 100);
          }
          return;
        }

        // ¿Es un trigger de búsqueda? (capturar ANTES que el tema)
        const searchTrigger = target.closest('a[href="/search"], .search-drawer-button, [aria-controls="SearchDrawer"], [aria-controls="BuscarDrawer"]');
        if (searchTrigger) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (_justClosed) return;
          const searchDrawer = document.getElementById('SearchDrawer') || document.getElementById('BuscarDrawer') || document.querySelector('search-drawer, #SearchDrawer');
          if (searchDrawer) {
            if (searchDrawer.hasAttribute('open') || searchDrawer.classList.contains('is-open') || searchDrawer.classList.contains('active')) {
              _justClosed = true;
              closeAnyDrawer(searchDrawer as HTMLElement);
              setTimeout(() => { _justClosed = false; }, ANIM_MS + 100);
              return;
            }
            openAnyDrawer(searchDrawer as HTMLElement);
            const input = searchDrawer.querySelector<HTMLInputElement>('input.search__input, input[name="q"]');
            if (input) setTimeout(() => input.focus(), 200);
          } else {
            window.location.href = '/productos';
          }
          return;
        }

        // ¿Es un trigger de menú (hamburguesa)? (capturar ANTES que el tema)
        const menuTrigger = target.closest('.menu-drawer-button, [aria-controls="MenuDrawer"]:not(.drawer__close):not(.close):not([data-close]):not([data-close-submenu])');
        if (menuTrigger) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (_justClosed) return;
          const menuDrawer = document.getElementById('MenuDrawer') || document.querySelector('menu-drawer, #MenuDrawer');
          if (menuDrawer) {
            if (menuDrawer.hasAttribute('open') || menuDrawer.classList.contains('is-open') || menuDrawer.classList.contains('active')) {
              _justClosed = true;
              closeAnyDrawer(menuDrawer as HTMLElement);
              setTimeout(() => { _justClosed = false; }, ANIM_MS + 100);
              return;
            }
            openAnyDrawer(menuDrawer as HTMLElement);
          }
          return;
        }

        // ¿Click fuera de un drawer abierto? (click en overlay o fuera)
        // OJO: solo drawers REALMENTE abiertos ([open]/[active], que es lo que
        // establecen openAnyDrawer y el theme). En el HTML capturado hay varios
        // .drawer/x-modal SIN atributo hidden aunque están ocultos por CSS;
        // con ':not([hidden])' este bloque tragaba TODOS los clicks de la página
        // (stopImmediatePropagation en capture) hasta que theme.js terminaba de
        // cargar → botones inertes durante 6-7s tras refrescar.
        const openDrawers = document.querySelectorAll('.drawer[open], .drawer[active], search-drawer[open], search-drawer[active], menu-drawer[open], menu-drawer[active], cart-drawer[open], cart-drawer[active]');
        openDrawers.forEach(d => {
          const drawer = d as HTMLElement;
          const inner = drawer.querySelector('.drawer__inner, .drawer__content, .drawer__panel');
          if (inner && inner.contains(target)) return;
          e.stopImmediatePropagation();
          _justClosed = true;
          closeAnyDrawer(drawer);
          setTimeout(() => { _justClosed = false; }, ANIM_MS + 100);
        });
      }, true); // capture: interceptar antes que el tema
    }

    // Click en overlay cierra el drawer
    root.querySelectorAll('overlay-element, .overlay, .fixed-modal').forEach(ov => {
      if ((ov as HTMLElement).dataset.wiredOverlay) return;
      (ov as HTMLElement).dataset.wiredOverlay = '1';
      ov.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        const ctrl = (ov as HTMLElement).getAttribute('aria-controls');
        const drawer = ctrl ? document.getElementById(ctrl) : ov.closest('.drawer, search-drawer, menu-drawer, cart-drawer');
        if (drawer) {
          _justClosed = true;
          closeAnyDrawer(drawer as HTMLElement);
          setTimeout(() => { _justClosed = false; }, ANIM_MS + 100);
        }
      });
    });

    // ── Botones de Carrito (Header + Dock móvil): Abrir el CartDrawer ("la cortina") ──
    const cartTriggers = root.querySelectorAll('a[href="/cart"], a[href="/carrito"], .cart-drawer-button, [aria-controls="CartDrawer"], #cart-icon-bubble');
    cartTriggers.forEach(trigger => {
      if ((trigger as HTMLElement).dataset.wiredCart) return;
      if (trigger.closest('.global-mobile-nav, .mobile-dock, .dock__item')) return;
      (trigger as HTMLElement).dataset.wiredCart = '1';

      const openCartDrawer = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('yaxsel:open-cart'));
      };

      trigger.addEventListener('click', openCartDrawer);
    });

    // ── BTN-FILL MOBILE FIX ──────────────────────────────────────────────────
    // theme.js HoverButton solo activa en (any-hover: hover) — en móvil no
    // corre. Aquí manejamos touchstart/touchend para animar [data-fill] vía
    // inline transform igual que lo hace Motion.animate en desktop.
    root.querySelectorAll<HTMLElement>('.button').forEach(btn => {
      if ((btn as HTMLElement).dataset.fillWired) return;
      (btn as HTMLElement).dataset.fillWired = '1';
      const fill = btn.querySelector<HTMLElement>('[data-fill]');
      if (!fill) return;

      btn.addEventListener('touchstart', () => {
        fill.style.transition = 'transform 0.35s cubic-bezier(0.165,0.84,0.44,1)';
        fill.style.transform = 'translate3d(0, 0, 0)';
      }, { passive: true });

      btn.addEventListener('touchend', () => {
        setTimeout(() => {
          fill.style.transition = 'transform 0.45s cubic-bezier(0.165,0.84,0.44,1)';
          fill.style.transform = 'translate3d(0, -76%, 0)';
        }, 300);
      }, { passive: true });

      btn.addEventListener('touchcancel', () => {
        fill.style.transform = 'translate3d(0, -76%, 0)';
      }, { passive: true });
    });

  } catch { /* noop */ }
}

/* ── Badge del carrito reactivo: refleja el carrito real (useCart) en los
   <cart-count> del tema (header + dock). ── */
export function syncConceptCartCount(root: HTMLElement | Document, total: number): void {
  try {
    const txt = total > 99 ? '99+' : String(total);
    root.querySelectorAll('cart-count').forEach(el => {
      el.textContent = txt;
      el.setAttribute('aria-label', `${total} items`);
      if (total > 0) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
  } catch { /* noop */ }
}

/* ── Hydrate Combos / Packs section con datos reales del Admin ── */
export interface ComboRealHydrationData {
  id: string;
  title: string;
  subtitle?: string;
  discountPercent?: number;
  badge?: string;
  mainProduct?: {
    $id: string;
    NAME: string;
    PRICE: number;
    CURRENTPRICE?: number;
    IMAGEURL?: string;
  };
  bundleProducts?: Array<{
    $id: string;
    NAME: string;
    PRICE: number;
    CURRENTPRICE?: number;
    IMAGEURL?: string;
    IMAGEURL2?: string;
    IMAGEURL3?: string;
    IMAGEURL4?: string;
    IMAGEURL5?: string;
    DESCRIPTION?: string;
    FEATURES?: string;
    TAGS?: string | string[];
    SKU?: string;
    BRAND?: string;
    STOCK?: number;
    PACKQTY?: number;
  }>;
}

/* ── DRAWER PERSONALIZADO: Detalle del producto del combo ── */
let activeProductDetailKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

function openProductDetailDrawer(prod: {
  $id: string;
  NAME: string;
  PRICE: number;
  CURRENTPRICE?: number;
  IMAGEURL?: string;
  IMAGEURL2?: string;
  IMAGEURL3?: string;
  IMAGEURL4?: string;
  IMAGEURL5?: string;
  DESCRIPTION?: string;
  FEATURES?: string;
  TAGS?: string | string[];
  SKU?: string;
  BRAND?: string;
  STOCK?: number;
  PACKQTY?: number;
}): void {
  if (activeProductDetailKeydownHandler) {
    document.removeEventListener('keydown', activeProductDetailKeydownHandler);
    activeProductDetailKeydownHandler = null;
  }
  document.getElementById('yaxsell-product-detail-drawer')?.remove();
  document.getElementById('yaxsell-product-detail-overlay')?.remove();

  const realPrice = prod.CURRENTPRICE || prod.PRICE;
  const hasDiscount = prod.CURRENTPRICE && prod.PRICE && prod.CURRENTPRICE < prod.PRICE;
  const discountPct = hasDiscount ? Math.round((1 - prod.CURRENTPRICE! / prod.PRICE) * 100) : 0;

  const images = [prod.IMAGEURL2, prod.IMAGEURL3]
    .filter(Boolean) as string[];
  const uniqueImages = Array.from(new Set(images));
  const hasMultipleImages = uniqueImages.length > 0;

  const featuresStr = Array.isArray(prod.FEATURES) ? prod.FEATURES.join('\n') : (prod.FEATURES || '');
  const tags = Array.isArray(prod.TAGS) ? prod.TAGS.join(', ') : (prod.TAGS || '');
  const inStock = prod.STOCK == null || prod.STOCK > 0;

  // Parsear CustomTabs desde FEATURES (formato: CustomTabs: {"details":"...","usage":"...","ingredients":"..."})
  let customTabs: { details?: string; usage?: string; ingredients?: string } | null = null;
  const ctMatch = featuresStr.match(/CustomTabs:\s*(\{.*\})/i);
  if (ctMatch) {
    try { customTabs = JSON.parse(ctMatch[1]); } catch { /* noop */ }
  }

  // Filtrar líneas de features que son metadata interna (SKU, Barcode, Section, LiveLogic, CustomTabs, etc.)
  const internalPrefixes = ['SKU:', 'Barcode:', 'Section:', 'LiveLogic:', 'CustomTabs:', 'ExactWholesale:', 'DisableDiscounts:'];
  const featureLines = featuresStr
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l && !internalPrefixes.some(p => l.startsWith(p)));

  const formatCLP = (n: number) => '$' + Number(n).toLocaleString('es-CL');

  const drawer = document.createElement('div');
  drawer.id = 'yaxsell-product-detail-drawer';
  drawer.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%; max-width: 100%; height: 85vh;
    background: #ffffff; z-index: 99990; overflow-y: auto;
    transform: translateY(100%); transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 -8px 40px rgba(0,0,0,0.15); will-change: transform;
    border-radius: 20px 20px 0 0;
  `;

  const overlay = document.createElement('div');
  overlay.id = 'yaxsell-product-detail-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.5); z-index: 99989; opacity: 0;
    transition: opacity 0.2s ease; backdrop-filter: blur(4px);
  `;

  // Construir secciones de ficha técnica
  const specsHTML: string[] = [];

  // Detalles técnicos desde CustomTabs
  if (customTabs?.details) {
    specsHTML.push(`
      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 4px; height: 16px; background: #0f172a; border-radius: 2px;"></span>
          Detalles Técnicos
        </h3>
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          ${customTabs.details.split('\n').filter((l: string) => l.trim()).map((line: string, i: number, arr: string[]) => {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const key = line.slice(0, colonIdx).trim();
              const val = line.slice(colonIdx + 1).trim();
              return `<div style="display: flex; padding: 10px 14px; border-bottom: ${i < arr.length - 1 ? '1px solid #f1f5f9' : 'none'}; background: ${i % 2 === 0 ? '#fafafa' : '#fff'};">
                <span style="font-size: 13px; font-weight: 600; color: #64748b; min-width: 130px; flex-shrink: 0;">${esc(key)}</span>
                <span style="font-size: 13px; color: #1e293b; flex: 1;">${esc(val)}</span>
              </div>`;
            }
            return `<div style="padding: 10px 14px; font-size: 13px; color: #475569; border-bottom: ${i < arr.length - 1 ? '1px solid #f1f5f9' : 'none'}; background: ${i % 2 === 0 ? '#fafafa' : '#fff'};">${esc(line)}</div>`;
          }).join('')}
        </div>
      </div>
    `);
  }

  // Modo de uso
  if (customTabs?.usage) {
    specsHTML.push(`
      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 4px; height: 16px; background: #0f172a; border-radius: 2px;"></span>
          Modo de Uso
        </h3>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0; padding: 12px 14px; background: #fafafa; border-radius: 12px; border: 1px solid #e2e8f0;">${esc(customTabs.usage)}</p>
      </div>
    `);
  }

  // Ingredientes
  if (customTabs?.ingredients) {
    specsHTML.push(`
      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 4px; height: 16px; background: #0f172a; border-radius: 2px;"></span>
          Ingredientes
        </h3>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0; padding: 12px 14px; background: #fafafa; border-radius: 12px; border: 1px solid #e2e8f0;">${esc(customTabs.ingredients)}</p>
      </div>
    `);
  }

  // Features adicionales (no internas)
  if (featureLines.length > 0) {
    specsHTML.push(`
      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 4px; height: 16px; background: #0f172a; border-radius: 2px;"></span>
          Especificaciones
        </h3>
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          ${featureLines.map((line: string, i: number) => {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const key = line.slice(0, colonIdx).trim();
              const val = line.slice(colonIdx + 1).trim();
              return `<div style="display: flex; padding: 10px 14px; border-bottom: ${i < featureLines.length - 1 ? '1px solid #f1f5f9' : 'none'}; background: ${i % 2 === 0 ? '#fafafa' : '#fff'};">
                <span style="font-size: 13px; font-weight: 600; color: #64748b; min-width: 130px; flex-shrink: 0;">${esc(key)}</span>
                <span style="font-size: 13px; color: #1e293b; flex: 1;">${esc(val)}</span>
              </div>`;
            }
            return `<div style="padding: 10px 14px; font-size: 13px; color: #475569; border-bottom: ${i < featureLines.length - 1 ? '1px solid #f1f5f9' : 'none'}; background: ${i % 2 === 0 ? '#fafafa' : '#fff'};">${esc(line)}</div>`;
          }).join('')}
        </div>
      </div>
    `);
  }

  // Construir HTML de las imágenes pequeñas (IMAGEURL2 y IMAGEURL3)
  const imagesColumnHTML = hasMultipleImages ? `
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      ${uniqueImages.map((img) => `
        <div class="yaxsell-drawer-img" data-img="${esc(img)}" style="width: 80px; height: 80px; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; cursor: pointer; flex-shrink: 0; transition: border-color 0.2s; background: #f8fafc;">
          <img src="${esc(img)}" alt="${esc(prod.NAME)}" style="width:100%;height:100%;object-fit:cover;" />
        </div>
      `).join('')}
    </div>
  ` : '';

  // HTML del detalle (columna izquierda o completa)
  const detailsHTML = `
    ${prod.BRAND ? `<p style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 6px;">${esc(prod.BRAND)}</p>` : ''}
    <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 12px; line-height: 1.25;">${esc(prod.NAME)}</h1>

    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px;">
      <span style="font-size: 28px; font-weight: 800; color: #0f172a;">${formatCLP(realPrice)}</span>
      ${hasDiscount ? `<span style="font-size: 16px; color: #94a3b8; text-decoration: line-through;">${formatCLP(prod.PRICE)}</span><span style="font-size: 12px; font-weight: 700; color: #ef4444; background: #fee2e2; padding: 2px 8px; border-radius: 12px;">-${discountPct}%</span>` : ''}
    </div>

    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px;
      background: ${inStock ? '#dcfce7' : '#fee2e2'}; color: ${inStock ? '#166534' : '#991b1b'};">
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${inStock ? '#22c55e' : '#ef4444'};"></span>
      ${inStock ? 'En stock' : 'Agotado'}
    </div>

    ${prod.SKU ? `<p style="font-size: 12px; color: #94a3b8; font-family: monospace; margin: 0 0 20px;">SKU: ${esc(prod.SKU)}</p>` : ''}

    ${prod.DESCRIPTION ? `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 8px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 4px; height: 16px; background: #0f172a; border-radius: 2px;"></span>
          Descripción
        </h3>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0;">${esc(prod.DESCRIPTION)}</p>
      </div>
    ` : ''}

    ${specsHTML.join('')}

    ${tags ? `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 8px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 4px; height: 16px; background: #0f172a; border-radius: 2px;"></span>
          Etiquetas
        </h3>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${tags.split(',').map((t: string) => `<span style="padding: 4px 12px; background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 500; border-radius: 20px;">${esc(t.trim())}</span>`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  drawer.innerHTML = `
    <div style="position: sticky; top: 0; z-index: 10; background: #fff; border-radius: 20px 20px 0 0; border-bottom: 1px solid #f1f5f9; padding: 10px 16px; display: flex; align-items: center; gap: 10px;">
      <div style="position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 36px; height: 3px; border-radius: 2px; background: #cbd5e1;"></div>
      <button id="yaxsell-drawer-close" style="width: 28px; height: 28px; border-radius: 50%; border: none; background: #0f172a; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #ffffff; transition: all 0.2s; flex-shrink: 0;">✕</button>
      <h3 style="font-size: 13px; font-weight: 600; color: #64748b; margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Detalle del Pack</h3>
    </div>

    <div style="padding: 16px 16px 80px;">
      ${hasMultipleImages ? `
        <div style="margin-bottom: 20px;">${imagesColumnHTML}</div>
      ` : ''}
      ${detailsHTML}

      <a href="/productos/${esc(prod.$id)}" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px 20px; background: #0f172a; color: #fff; font-size: 15px; font-weight: 700; border-radius: 14px; text-decoration: none; transition: background 0.2s; margin-top: 8px;">
        Ver página del producto →
      </a>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  // Animar entrada
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    drawer.style.transform = 'translateY(0)';
  });

  // Cerrar
  let isClosing = false;
  const close = () => {
    if (isClosing) return;
    isClosing = true;
    drawer.style.transform = 'translateY(100%)';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    if (activeProductDetailKeydownHandler) {
      document.removeEventListener('keydown', activeProductDetailKeydownHandler);
      activeProductDetailKeydownHandler = null;
    }
    // Limpiar clases que el theme.js pudo haber añadido al body
    document.body.classList.remove('modal-open', 'drawer-open', 'modal-open-active', 'has-modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('touch-action');
    setTimeout(() => {
      drawer.remove();
      overlay.remove();
    }, 300);
  };

  // Usar addEventListener con capture:true para interceptar ANTES que el theme.js
  const closeBtn = drawer.querySelector('#yaxsell-drawer-close');
  if (closeBtn) {
    (closeBtn as HTMLElement).addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      close();
    }, { capture: true });
  }
  overlay.addEventListener('click', (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    close();
  }, { capture: true });

  // Click en imágenes pequeñas → abrir lightbox fullscreen
  drawer.querySelectorAll<HTMLElement>('.yaxsell-drawer-img').forEach(imgEl => {
    imgEl.onclick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const imgSrc = imgEl.getAttribute('data-img');
      if (!imgSrc) return;

      const lightbox = document.createElement('div');
      lightbox.id = 'yaxsell-lightbox';
      lightbox.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.92); z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        cursor: zoom-out; opacity: 0; transition: opacity 0.3s ease;
        backdrop-filter: blur(8px);
      `;
      lightbox.innerHTML = `
        <img src="${esc(imgSrc)}" alt="${esc(prod.NAME)}" style="max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,0.5);" />
        <button style="position: absolute; top: 20px; right: 20px; width: 44px; height: 44px; border-radius: 50%; border: none; background: #0f172a; color: #fff; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
      `;
      document.body.appendChild(lightbox);
      requestAnimationFrame(() => { lightbox.style.opacity = '1'; });

      const closeLightbox = () => {
        lightbox.style.opacity = '0';
        setTimeout(() => lightbox.remove(), 300);
      };
      lightbox.onclick = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeLightbox();
      };
      const lbEsc = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          closeLightbox();
          document.removeEventListener('keydown', lbEsc);
        }
      };
      document.addEventListener('keydown', lbEsc);
    };
  });

  // ESC para cerrar
  activeProductDetailKeydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', activeProductDetailKeydownHandler);
}

type ComboBundleProduct = NonNullable<ComboRealHydrationData['bundleProducts']>[number];
const comboProductsBySection = new WeakMap<HTMLElement, Map<string, ComboBundleProduct>>();

/* ── Controles del Pack Emprendedor: delegación temprana en capture ──────────
   Estos listeners se registran APENAS se inyecta el HTML (wireComboSectionEarly),
   antes de que llegue el fetch de combos y antes de que theme.js despierte sus
   custom elements. Así "Ver detalle" y el toggle de la cortina responden al
   instante y stopImmediatePropagation() bloquea el camino lento del theme. ── */
const COMBO_SECTION_SEL = '#shopify-section-template--27619508257049__product-bundle';
const comboEarlyWiredRoots = new WeakSet<HTMLElement>();
const comboToggleActivateHandlers = new WeakMap<HTMLElement, () => void>();
let pendingComboDetail: { section: HTMLElement; index: number } | null = null;

function showComboDetailLoading(): void {
  if (document.getElementById('yaxsell-combo-detail-loading')) return;
  if (!document.getElementById('yaxsell-combo-detail-loading-style')) {
    const st = document.createElement('style');
    st.id = 'yaxsell-combo-detail-loading-style';
    st.textContent = '@keyframes yaxsell-combo-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'yaxsell-combo-detail-loading';
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:99999;background:rgba(15,23,42,.92);color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;display:flex;align-items:center;gap:8px;pointer-events:none;';
  el.innerHTML = '<span style="width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;display:inline-block;animation:yaxsell-combo-spin .7s linear infinite;"></span>Cargando detalle…';
  document.body.appendChild(el);
  // Red de seguridad: nunca dejar el aviso visible para siempre
  window.setTimeout(() => hideComboDetailLoading(), 10000);
}

function hideComboDetailLoading(): void {
  document.getElementById('yaxsell-combo-detail-loading')?.remove();
}

export function wireComboSectionEarly(root: HTMLElement): void {
  try {
    if (comboEarlyWiredRoots.has(root)) return;
    const section = root.querySelector<HTMLElement>(COMBO_SECTION_SEL);
    if (!section) return;
    comboEarlyWiredRoots.add(root);

    root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // (1) Botón "Ver detalle" de las tarjetas del Pack Emprendedor
      const detailBtn = target.closest<HTMLElement>('.product-card .product-form__submit');
      if (detailBtn && detailBtn.closest(COMBO_SECTION_SEL)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const card = detailBtn.closest<HTMLElement>('.product-card');
        const sectionEl = detailBtn.closest<HTMLElement>(COMBO_SECTION_SEL);
        if (!card || !sectionEl) return;

        const map = comboProductsBySection.get(sectionEl);
        // 1.a Buscar por id (cuando enhanceConceptCombos ya hidrató las tarjetas)
        const productId = card.dataset.comboProductId;
        const byId = productId && map ? map.get(productId) : undefined;
        if (byId) {
          openProductDetailDrawer(byId);
          return;
        }
        // 1.b Buscar por índice de tarjeta (el orden del Map conserva allProducts)
        const cards = Array.from(sectionEl.querySelectorAll<HTMLElement>('.product-card'));
        const idx = cards.indexOf(card);
        const byIdx = map && idx >= 0 ? Array.from(map.values())[idx] : undefined;
        if (byIdx) {
          openProductDetailDrawer(byIdx);
          return;
        }
        // 1.c Datos aún no disponibles: el click ya fue interceptado (el theme
        //     no hace su camino lento). Dejar pendiente y dar feedback visual.
        if (idx >= 0) {
          pendingComboDetail = { section: sectionEl, index: idx };
          showComboDetailLoading();
        }
        return;
      }

      // (2) Toggle de la cortina negra "Pack Emprendedor"
      const toggle = target.closest<HTMLElement>('product-bundle-toggle-button, .product-bundle__toggle');
      if (toggle && toggle.closest(COMBO_SECTION_SEL)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const bundle = toggle.closest<HTMLElement>('.product-bundle');
        if (!bundle) return;
        const isActive = bundle.classList.toggle('active');
        toggle.setAttribute('aria-expanded', String(isActive));
        // Al expandir: re-seleccionar todo y repintar (si los datos ya llegaron)
        if (isActive) comboToggleActivateHandlers.get(bundle)?.();
        const chevron = toggle.querySelector('svg') as SVGElement | null;
        if (chevron) {
          chevron.style.transform = isActive ? 'rotate(180deg)' : '';
          chevron.style.transition = 'transform 0.3s ease';
        }
      }
    }, { capture: true });
  } catch { /* noop */ }
}

export function enhanceConceptCombos(
  root: HTMLElement | Document,
  comboData: ComboRealHydrationData | null | undefined,
  onAddToCart?: (items: any[]) => void
): void {
  try {
    const section = root.querySelector<HTMLElement>('#shopify-section-template--27619508257049__product-bundle');
    if (!section) return;

    const bps = comboData?.bundleProducts || [];
    const discount = comboData?.discountPercent ?? 15;

    // Deduplicar productos del pack por ID
    const rawProducts = bps.filter(p => p && p.$id);
    const seenIds = new Set<string>();
    const allProducts = rawProducts.filter(p => {
      if (seenIds.has(p.$id)) return false;
      seenIds.add(p.$id);
      return true;
    });

    comboProductsBySection.set(section, new Map(allProducts.map(product => [product.$id, product])));

    // Si el usuario tocó "Ver detalle" antes de que llegaran los datos, abrir
    // ahora el drawer del producto que quedó pendiente (el click ya fue
    // interceptado por wireComboSectionEarly, no pasó por el camino lento).
    if (pendingComboDetail && pendingComboDetail.section === section) {
      const pendingProd = allProducts[pendingComboDetail.index];
      pendingComboDetail = null;
      hideComboDetailLoading();
      if (pendingProd) {
        openProductDetailDrawer(pendingProd);
      }
    }

    // Si no hay productos configurados para el pack (0 productos), ocultar sección completamente
    if (!comboData || allProducts.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    // Actualizar título y descripción del sidebar dinámicamente
    section.querySelectorAll<HTMLElement>('.product-bundle__sidebar .split-words').forEach(el => {
      el.textContent = 'Pack Emprendedor';
    });
    section.querySelectorAll<HTMLElement>('.product-bundle__sidebar .rte p').forEach(el => {
      el.textContent = '';
      (el as HTMLElement).style.display = 'none';
    });

    // 1. Inyectar productos en las tarjetas del grid izquierdo
    const cards = Array.from(section.querySelectorAll<HTMLElement>('.product-card'));
    
    // Mapa de productos del pack (todos seleccionados, el cliente compra el pack completo)
    const selectedItemsMap = new Map<string, any>();
    allProducts.forEach(p => selectedItemsMap.set(p.$id, p));

    cards.forEach((card, idx) => {
      const prod = allProducts[idx];
      if (!prod) {
        card.style.display = 'none';
        return;
      }
      card.style.display = '';
      card.dataset.comboProductId = prod.$id;

      const pPrice = prod.CURRENTPRICE || prod.PRICE;
      const formattedPrice = '$' + pPrice.toLocaleString('es-CL');

      // Título individual de cada tarjeta
      const titleEl = card.querySelector('.product-card__title');
      if (titleEl) {
        titleEl.textContent = prod.NAME;
      }

      // Insignia / Marca
      const vendorEl = card.querySelector('.product-card__top a, .caption');
      if (vendorEl) {
        vendorEl.textContent = comboData.badge || 'PACK DESTACADO';
      }

      // Precio individual
      const priceEl = card.querySelector('.price__regular');
      if (priceEl) {
        priceEl.textContent = formattedPrice;
      }

      // Imagen individual de cada tarjeta
      const resolvedImg = resolveStorageImageUrl(prod.IMAGEURL);
      if (resolvedImg) {
        card.querySelectorAll('img').forEach(img => {
          (img as HTMLImageElement).src = resolvedImg;
          (img as HTMLImageElement).removeAttribute('srcset');
          (img as HTMLImageElement).style.opacity = '1';
          (img as HTMLImageElement).style.visibility = 'visible';
          (img as HTMLImageElement).classList.add('is-loaded');
        });
      }

      // Ocultar variant pickers y swatches demo de color en la tarjeta
      card.querySelectorAll<HTMLElement>('variant-picker, .swatches, [data-option-slug="color"]').forEach(el => {
        el.style.display = 'none';
      });

      // Ocultar botón de quick-view (ojito) visualmente
      card.querySelectorAll<HTMLElement>('.quick-view__button').forEach(el => {
        el.style.display = 'none';
      });

      // Cambiar texto del botón "Añadir al paquete" → "Ver detalle"
      card.querySelectorAll<HTMLElement>('.product-form__submit .btn-text').forEach(btn => {
        btn.textContent = 'Ver detalle';
      });

      // Badge flotante
      const badgesEl = card.querySelector('.badges');
      if (badgesEl) {
        badgesEl.innerHTML = `<span class="badge rounded-full font-bold text-xs" style="background:#0f172a;color:#fff;padding:4px 10px;">${esc(comboData.badge || 'PACK DESTACADO')}</span>`;
      }

      // Botón "Ver detalle" — la sección lo maneja mediante delegación en capture
      card.querySelectorAll<HTMLButtonElement>('.product-form__submit').forEach(button => {
        button.type = 'button';
        button.dataset.action = 'view-combo-detail';
      });
    });

    // 2. Función de renderizado de la barra lateral ("Tu paquete")
    const renderSidebar = () => {
      const sidebarBody = section.querySelector('.product-bundle__body');
      const itemsList = Array.from(selectedItemsMap.values());

      if (sidebarBody) {
        sidebarBody.innerHTML = itemsList.map((item, idx) => {
          const itemPrice = item.CURRENTPRICE || item.PRICE;
          return `
            <div class="horizontal-product flex items-center gap-3" data-product-bundle-variant data-id="${item.$id}" available>
              <figure class="horizontal-product__media media media--square aspect-square relative overflow-hidden shrink-0" data-product-bundle-variant-media>
                <img src="${item.IMAGEURL || ''}" alt="${esc(item.NAME)}" style="width:100%;height:100%;object-fit:cover;opacity:1;visibility:visible;" />
              </figure>
              <div class="horizontal-product__details grow flex flex-col justify-start gap-2d5" data-product-bundle-variant-content>
                <p class="horizontal-product__title font-medium text-base leading-tight">${esc(item.NAME)}</p>
                <div class="price text-sm flex flex-wrap gap-1d5" data-product-bundle-variant-price>
                  <span class="price__regular">$${itemPrice.toLocaleString('es-CL')}</span>
                </div>
              </div>
              <div class="horizontal-product__quantity shrink-0 text-sm sm:block">
                <div class="grid gap-3">
                  <div class="text-xs text-right relative">
                    <product-bundle-remove-button class="link cursor-pointer" aria-controls="ProductBundle-template--27619508257049__product-bundle" data-id="${item.$id}">Eliminar</product-bundle-remove-button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');

        // Listener de eliminación
        sidebarBody.querySelectorAll('product-bundle-remove-button, .btn-remove, [data-id]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const row = (e.target as HTMLElement).closest('[data-id]');
            const id = row?.getAttribute('data-id');
            if (id) {
              selectedItemsMap.delete(id);
              renderSidebar();
            }
          });
        });
      }

      // Cálculo de Total con Descuento
      const rawTotal = itemsList.reduce((sum, item) => sum + (item.CURRENTPRICE || item.PRICE), 0);
      const discountedTotal = Math.round(rawTotal * (1 - (discount / 100)));
      const formattedTotal = '$' + discountedTotal.toLocaleString('es-CL');

      // Actualizar precios en pantalla
      section.querySelectorAll('[data-product-bundle-total-with-currency], [data-product-bundle-total], .btn-price').forEach(el => {
        el.textContent = formattedTotal;
      });

      // Habilitar botón de compra
      const submitBtn = section.querySelector<HTMLButtonElement>('[data-product-bundle-submit], .product-bundle__footer button');
      if (submitBtn) {
        submitBtn.removeAttribute('disabled');
        submitBtn.style.opacity = '1';
        submitBtn.style.pointerEvents = 'auto';
      }
    };

    // Render inicial
    renderSidebar();

    // 2.5 Toggle del bundle: la apertura/cierre la maneja el listener delegado
    //     registrado en wireComboSectionEarly() apenas se inyecta el HTML (ya no
    //     se reemplaza el custom element ni se usan retries con setTimeout).
    //     Aquí solo registramos qué hacer al expandir: re-seleccionar todo y
    //     repintar el sidebar con los datos reales.
    const bundleEl = section.querySelector<HTMLElement>('.product-bundle');
    if (bundleEl) {
      const toggleEl = bundleEl.querySelector<HTMLElement>('product-bundle-toggle-button, .product-bundle__toggle');
      if (toggleEl) toggleEl.style.cursor = 'pointer';
      comboToggleActivateHandlers.set(bundleEl, () => {
        selectedItemsMap.clear();
        allProducts.forEach(p => selectedItemsMap.set(p.$id, p));
        renderSidebar();
      });
    }

    // 3. Botón final "Añadir al carrito" en la barra lateral
    const finalSubmitBtn = section.querySelector<HTMLElement>('[data-product-bundle-submit], .product-bundle__footer button');
    if (finalSubmitBtn) {
      // Clonar para limpiar handlers del theme.js
      const newFinalBtn = finalSubmitBtn.cloneNode(true) as HTMLElement;
      finalSubmitBtn.parentNode?.replaceChild(newFinalBtn, finalSubmitBtn);
      newFinalBtn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const itemsToAdd = Array.from(selectedItemsMap.values()).map(item => ({
          id: item.$id,
          name: item.NAME,
          price: item.CURRENTPRICE || item.PRICE,
          image: item.IMAGEURL,
        }));

        if (onAddToCart && itemsToAdd.length > 0) {
          onAddToCart(itemsToAdd);
        }
      }, { capture: true });
    }
  } catch { /* noop */ }

  /* ── ANIMACIÓN DE HIGHLIGHTED-TEXT: solo cuando es visible ── */
  try {
    const highlights = root.querySelectorAll<HTMLElement>('em[is="highlighted-text"], .highlighted-text');
    if (highlights.length) {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('animated');
          } else {
            entry.target.classList.remove('animated');
          }
        }
      }, { threshold: 0.15 });

      highlights.forEach(el => observer.observe(el));
    }
  } catch { /* noop */ }

  /* ── SUAVE ENTRADA DE IMÁGENES DEL BANNER Y SLIDESHOW ── */
  try {
    const bannerImgs = root.querySelectorAll<HTMLImageElement>('.banner__image, .banner picture img, .video-hero img');
    bannerImgs.forEach(img => {
      if (img.complete) {
        img.classList.add('is-loaded');
      } else {
        img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      }
    });
  } catch { /* noop */ }
}
