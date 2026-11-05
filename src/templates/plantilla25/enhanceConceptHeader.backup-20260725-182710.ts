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

export type EnhCategory = { $id: string; name: string; order?: number };
export type EnhSubcategory = { $id: string; name: string; categoryId?: string; parentSubcategoryId?: string; order?: number };

export interface EnhanceData {
  categories: EnhCategory[];
  subcategories: EnhSubcategory[];
  catCounts: Record<string, number>;
  subCounts: Record<string, number>;
  logoUrl: string;
  storeName: string;
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

/* ── Item del drawer CON submenú desplegable (como el tema original):
   al tocar la categoría entra un panel con sus subcategorías y "Ver todo". ── */
const drawerDropdown = (
  label: string,
  parentHref: string,
  subs: { href: string; name: string; count?: number }[],
  verTodoTxt: string,
  catId: string,
) => {
  const items = subs
    .map(
      s => `<li class="drawer__menu-group">
        <a class="drawer__menu-item block heading text-xl leading-none tracking-tight" href="${esc(s.href)}">
          ${esc(s.name)}${typeof s.count === 'number' ? ` <span class="text-sm opacity-50">(${s.count})</span>` : ''}
        </a>
      </li>`,
    )
    .join('');
  return `<li class="drawer__menu-group">
    <details is="menu-details">
      <summary class="drawer__menu-item block cursor-pointer relative" aria-expanded="false">
        <span class="heading text-2xl leading-none tracking-tight">${esc(label)}</span>${CHEVRON_RIGHT}
      </summary>
      <div class="drawer__submenu z-1 absolute top-0 left-0 flex flex-col w-full h-full" data-parent
           data-cat-id="${esc(catId)}" data-cat-name="${esc(label)}">
        <button type="button" class="tracking-tight heading text-base shrink-0 flex items-center gap-3 w-full" data-close>${esc(label)}</button>
        <div class="drawer__scrollable flex flex-col h-full">
          <ul class="w-full" role="list">
            ${items}
            <li class="drawer__menu-group">
              <a class="drawer__menu-item block heading text-xl leading-none tracking-tight" href="${esc(parentHref)}"
                 style="font-weight:800;text-decoration:underline">${esc(verTodoTxt)}</a>
            </li>
          </ul>
          <!-- Vitrina de productos de la categoría (se llena al abrir) -->
          <div class="drawer__preview" data-preview></div>
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
      const img = p.IMAGEURL || p.IMAGEURL2 || '';
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

/**
 * Vitrina de productos dentro del submenú de una categoría.
 * Trae productos de la categoría y elige uno de CADA subcategoría (dispersos),
 * cada uno etiquetado con su subcategoría. Carga perezosa: solo al abrir.
 */
async function loadCategoryPreview(
  submenu: HTMLElement,
  subNameById: Record<string, string>,
  max = 6,
): Promise<void> {
  const box = submenu.querySelector<HTMLElement>('[data-preview]');
  const catId = submenu.dataset.catId;
  if (!box || !catId || box.dataset.loaded) return;
  box.dataset.loaded = '1';
  box.innerHTML = `<p class="drawer__preview-title">Cargando…</p>`;

  try {
    const r = await fetch(`/api/public-data/products?categoryId=${encodeURIComponent(catId)}&limit=60`);
    const d = await r.json();
    const all: any[] = Array.isArray(d.products) ? d.products : [];
    if (!all.length) { box.innerHTML = ''; return; }

    // Agrupar por subcategoría y coger uno de cada una (rotando) → dispersos
    const grupos = new Map<string, any[]>();
    for (const p of all) {
      const k = p.SUBCATEGORYID || '_';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(p);
    }
    // Barajar cada grupo para que no salgan siempre los mismos
    for (const arr of grupos.values()) arr.sort(() => Math.random() - 0.5);

    const elegidos: any[] = [];
    let ronda = 0;
    while (elegidos.length < max) {
      let añadido = false;
      for (const arr of grupos.values()) {
        if (arr[ronda]) { elegidos.push(arr[ronda]); añadido = true; }
        if (elegidos.length >= max) break;
      }
      if (!añadido) break;
      ronda++;
    }
    if (!elegidos.length) { box.innerHTML = ''; return; }

    const cards = elegidos.map(p => {
      const img = p.IMAGEURL || p.IMAGEURL2 || '';
      const price = priceOf(p);
      const tag = subNameById[p.SUBCATEGORYID] || '';
      return `<a class="drawer__preview-card" href="/productos/${esc(p.$id)}">
        <span class="drawer__preview-img">
          ${img ? `<img src="${esc(img)}" alt="${esc(p.NAME || '')}" loading="lazy">` : ''}
          ${tag ? `<span class="drawer__preview-tag">${esc(tag)}</span>` : ''}
        </span>
        <span class="drawer__preview-name">${esc(p.NAME || '')}</span>
        ${price > 0 ? `<span class="drawer__preview-price">${esc(money(price))}</span>` : ''}
      </a>`;
    }).join('');

    box.innerHTML = `<p class="drawer__preview-title">Destacados de ${esc(submenu.dataset.catName || '')}</p>
      <div class="drawer__preview-grid">${cards}</div>`;
  } catch {
    box.innerHTML = '';
  }
}

export function enhanceConceptHeader(root: HTMLElement | Document, data: EnhanceData): void {
  const { categories, subcategories, catCounts, subCounts, logoUrl, storeName } = data;

  const headerEl = (root as HTMLElement).querySelector?.('.header') || (root as HTMLElement).querySelector?.('header');
  if (headerEl) {
    const h = headerEl.getBoundingClientRect().height;
    if (h > 0 && (root as HTMLElement).style) {
      (root as HTMLElement).style.setProperty('--header-height', `${h}px`);
    }
    /* ── Añadir esquinas SVG cóncavas SUPERIORES (amarillas, para conectar con la barra de anuncios) ── */
    if (!headerEl.querySelector('.header__corner.top')) {
      const cornerTopLeft = document.createElement('span');
      cornerTopLeft.className = 'header__corner corner left top flex absolute pointer-events-none';
      cornerTopLeft.innerHTML = `<svg class="w-full h-auto" viewBox="0 0 101 101" stroke="none" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="presentation"><path fill-rule="evenodd" clip-rule="evenodd" d="M101 0H0V101H1C1 45.7715 45.7715 1 101 1V0Z"></path><path d="M1 101C1 45.7715 45.7715 1 101 1" fill="none"></path></svg>`;
      const cornerTopRight = document.createElement('span');
      cornerTopRight.className = 'header__corner corner right top flex absolute pointer-events-none';
      cornerTopRight.innerHTML = `<svg class="w-full h-auto" viewBox="0 0 101 101" stroke="none" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="presentation"><path fill-rule="evenodd" clip-rule="evenodd" d="M101 0H0V101H1C1 45.7715 45.7715 1 101 1V0Z"></path><path d="M1 101C1 45.7715 45.7715 1 101 1" fill="none"></path></svg>`;
      headerEl.appendChild(cornerTopLeft);
      headerEl.appendChild(cornerTopRight);
    }
  }

  const order = (x: { order?: number }) => (typeof x.order === 'number' ? x.order : 9999);
  const subsForAll = (catId: string) =>
    subcategories.filter(s => s.categoryId === catId && !s.parentSubcategoryId);

  // ¿Tenemos conteos de productos por categoría? En producción sí → filtramos
  // como el navbar original (solo categorías con productos, ordenadas por
  // cantidad). Si la DB aún no está categorizada (conteos vacíos), caemos a la
  // ESTRUCTURA del catálogo: categorías que tengan subcategorías, por 'order'.
  const hasCounts = Object.keys(catCounts).length > 0;

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
      parts.push(deskLink('/productos', 'Tienda'));
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
      parts.push(deskLink('/productos', 'Catálogo'));
      ul.innerHTML = parts.join('');

      // Hover manual para dropdowns de subcategorías con animación escalonada JS
      const wireDropdownHover = (det: HTMLDetailsElement) => {
        const dropdown = det.querySelector<HTMLElement>('.dropdown');
        if (!dropdown) return;
        const lis = dropdown.querySelectorAll<HTMLElement>('.dropdown__nav > li');

        // Estado inicial: invisibles y desplazadas
        lis.forEach(li => {
          li.style.opacity = '0';
          li.style.transform = 'translateX(20%)';
          li.style.transition = 'transform 0.8s cubic-bezier(0.075, 0.82, 0.165, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1)';
        });

        det.addEventListener('mouseenter', () => {
          det.setAttribute('open', '');
          dropdown.setAttribute('open', '');
          dropdown.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
          dropdown.classList.add('opacity-100', 'visible', 'pointer-events-auto');
          document.body.classList.add('has-dropdown-menu');

          // Reset sin transición antes de animar
          lis.forEach(li => {
            li.style.transition = 'none';
            li.style.opacity = '0';
            li.style.transform = 'translateX(20%)';
          });

          // Forzar reflow para que el reset surta efecto
          void dropdown.offsetHeight;

          // Animación escalonada de entrada
          lis.forEach((li, i) => {
            li.style.transition = 'transform 0.8s cubic-bezier(0.075, 0.82, 0.165, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1)';
            li.style.transitionDelay = '0s';
            setTimeout(() => {
              li.style.opacity = '1';
              li.style.transform = 'translateX(0)';
            }, i * 100);
          });
        });

        det.addEventListener('mouseleave', () => {
          det.removeAttribute('open');
          document.body.classList.remove('has-dropdown-menu');

          // Animación de salida rápida
          lis.forEach(li => {
            li.style.transitionDelay = '0s';
            li.style.opacity = '0';
            li.style.transform = 'translateX(20%)';
          });

          setTimeout(() => {
            if (!det.hasAttribute('open')) {
              dropdown.removeAttribute('open');
              dropdown.classList.add('invisible', 'opacity-0', 'pointer-events-none');
              dropdown.classList.remove('opacity-100', 'visible', 'pointer-events-auto');
            }
          }, 200);
        });
      };
      ul.querySelectorAll<HTMLDetailsElement>('details.details-dropdown-clone').forEach(wireDropdownHover);

      // Eliminar el segundo path de los corner SVGs que genera 2 líneas tras un delay
      const killCornerStrokes = () => {
        ul.querySelectorAll<SVGPathElement>('.dropdown__corner svg path:last-child').forEach(p => {
          if (p.getAttribute('fill') === 'none') p.remove();
        });
      };
      killCornerStrokes();
      // Re-ejecutar tras un delay por si el theme JS re-renderiza los corners
      setTimeout(killCornerStrokes, 500);
      setTimeout(killCornerStrokes, 1500);

      // DEBUG: inspeccionar corners
      setTimeout(() => {
        const corners = ul.querySelectorAll<HTMLElement>('.dropdown__corner');
        console.log(`[DEBUG] Corners encontrados: ${corners.length}`);
        corners.forEach((c, i) => {
          if (i > 1) return; // solo primeros 2
          const cs = getComputedStyle(c);
          const svg = c.querySelector('svg');
          const paths = c.querySelectorAll('path');
          const pathData = Array.from(paths).map(p => p.getAttribute('d'));
          console.log(`[DEBUG] Corner ${i}: ` + JSON.stringify({
            cls: c.className,
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            width: cs.width,
            height: cs.height,
            color: cs.color,
            pos: cs.position,
            top: cs.top,
            bottom: cs.bottom,
            left: cs.left,
            right: cs.right,
            transform: cs.transform,
            parent: c.parentElement?.className,
            parentBg: c.parentElement ? getComputedStyle(c.parentElement).backgroundColor : 'N/A',
            parentBR: c.parentElement ? getComputedStyle(c.parentElement).borderRadius : 'N/A',
            svgViewBox: svg?.getAttribute('viewBox'),
            svgW: svg ? getComputedStyle(svg).width : 'N/A',
            svgH: svg ? getComputedStyle(svg).height : 'N/A',
            pathCount: paths.length,
            pathData,
          }));
        });
      }, 2000);
    }
  } catch { /* noop */ }

  /* ── 3. MENÚ DRAWER MÓVIL ── */
  try {
    const dul = root.querySelector('.menu-drawer .drawer__menu') || root.querySelector('ul.drawer__menu');
    if (dul) {
      const parts: string[] = [];
      parts.push(drawerLink('/', 'Inicio'));
      parts.push(drawerLink('/productos', 'Tienda'));
      for (const cat of navCats) {
        const cSubs = subsFor(cat.$id);
        if (cSubs.length === 0) {
          parts.push(drawerLink(catHref(cat.name), label(cat.name)));
        } else {
          // Con subcategorías → panel desplegable + "Ver todo" (como el original)
          parts.push(drawerDropdown(
            label(cat.name),
            catHref(cat.name),
            cSubs.map(s => ({
              href: subHref(cat.name, s.$id),
              name: s.name,
              count: hasCounts ? (subCounts[s.$id] || 0) : undefined,
            })),
            `Ver todo${hasCounts && catCounts[cat.$id] ? ` (${catCounts[cat.$id]})` : ''}`,
            cat.$id,
          ));
        }
      }
      parts.push(drawerLink('/productos', 'Catálogo'));
      dul.innerHTML = parts.join('');

      // Mapa subcategoría → nombre, para etiquetar cada producto de la vitrina
      const subNameById: Record<string, string> = {};
      for (const s of subcategories) subNameById[s.$id] = s.name;

      // Al abrir una categoría, cargamos su vitrina (una sola vez por categoría)
      dul.querySelectorAll<HTMLElement>('details[is="menu-details"] summary').forEach(sum => {
        sum.addEventListener('click', () => {
          const submenu = sum.parentElement?.querySelector<HTMLElement>('.drawer__submenu');
          if (submenu) setTimeout(() => loadCategoryPreview(submenu, subNameById), 80);
        });
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
  } catch { /* noop */ }

  /* ── 7. CORTINAS Y BÚSQUEDA MÓVIL / DESKTOP ── */
  wireGlobalDrawersAndBuscar(root);
}

/* ── Conexión de cortinas y buscador móvil ── */
function wireGlobalDrawersAndBuscar(root: HTMLElement | Document): void {
  try {
    const closeAnyDrawer = (drawer: HTMLElement) => {
      if (typeof (drawer as any).hide === 'function') {
        try { (drawer as any).hide(); return; } catch { /* fallback */ }
      }
      drawer.setAttribute('hidden', '');
      drawer.removeAttribute('open');
      drawer.setAttribute('aria-expanded', 'false');
      drawer.classList.add('pointer-events-none');
      drawer.classList.remove('pointer-events-auto');

      const overlay = drawer.querySelector('.overlay, overlay-element, .fixed-modal, .drawer__overlay');
      if (overlay) {
        overlay.classList.add('invisible', 'opacity-0', 'pointer-events-none');
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
      }
      document.body.style.overflow = '';
    };

    const openAnyDrawer = (drawer: HTMLElement) => {
      if (typeof (drawer as any).show === 'function') {
        try { (drawer as any).show(); return; } catch { /* fallback */ }
      }
      drawer.removeAttribute('hidden');
      drawer.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('open', '');
      drawer.classList.remove('pointer-events-none', 'invisible', 'opacity-0');
      drawer.classList.add('pointer-events-auto');

      const overlay = drawer.querySelector('.overlay, overlay-element, .fixed-modal, .drawer__overlay');
      if (overlay) {
        overlay.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100', 'pointer-events-auto');
      }
      drawer.querySelectorAll('.drawer__header, .drawer__content, .drawer__inner, .drawer__panel').forEach(el => {
        el.classList.remove('invisible', 'opacity-0');
      });
      document.body.style.overflow = 'hidden';
    };

    // Escuchar todos los botones de cerrar (X)
    root.querySelectorAll('.drawer__close, [aria-label="Close"], button.close, [data-close]').forEach(btn => {
      if ((btn as HTMLElement).dataset.wiredClose) return;
      (btn as HTMLElement).dataset.wiredClose = '1';
      btn.addEventListener('click', (e) => {
        const drawer = btn.closest('.drawer, search-drawer, menu-drawer, cart-drawer, modal-element, drawer-element') as HTMLElement;
        if (drawer) {
          closeAnyDrawer(drawer);
        } else {
          document.querySelectorAll('.drawer, search-drawer, menu-drawer, cart-drawer, drawer-element').forEach(d => closeAnyDrawer(d as HTMLElement));
        }
      });
    });

    // ── Botones de Búsqueda (Header + Dock móvil) ──
    root.querySelectorAll('a[href="/search"], .search-drawer-button, [aria-controls="SearchDrawer"], [aria-controls="BuscarDrawer"]').forEach(trigger => {
      if ((trigger as HTMLElement).dataset.wiredBuscar) return;
      (trigger as HTMLElement).dataset.wiredBuscar = '1';

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const searchDrawer = document.getElementById('SearchDrawer') || document.getElementById('BuscarDrawer') || document.querySelector('search-drawer, #SearchDrawer');
        if (searchDrawer) {
          openAnyDrawer(searchDrawer as HTMLElement);
          const input = searchDrawer.querySelector<HTMLInputElement>('input.search__input, input[name="q"]');
          if (input) setTimeout(() => input.focus(), 150);
        } else {
          window.location.href = '/productos';
        }
      });
    });

    // ── Botones de Carrito (Header + Dock móvil) ──
    root.querySelectorAll('a[href="/cart"], a[href="/carrito"], .cart-drawer-button, [aria-controls="CartDrawer"]').forEach(trigger => {
      if ((trigger as HTMLElement).dataset.wiredCart) return;
      (trigger as HTMLElement).dataset.wiredCart = '1';

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/carrito';
      });
    });

    // ── Botones de Menú Móvil (Hamburger) ──
    root.querySelectorAll('.menu-drawer-button, [aria-controls="MenuDrawer"]').forEach(trigger => {
      if ((trigger as HTMLElement).dataset.wiredMenu) return;
      (trigger as HTMLElement).dataset.wiredMenu = '1';

      trigger.addEventListener('click', (e) => {
        const menuDrawer = document.getElementById('MenuDrawer') || document.querySelector('menu-drawer, #MenuDrawer');
        if (menuDrawer) {
          e.preventDefault();
          openAnyDrawer(menuDrawer as HTMLElement);
        }
      });
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
