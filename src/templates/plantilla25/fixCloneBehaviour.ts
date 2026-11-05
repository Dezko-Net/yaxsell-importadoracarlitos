/* ══════════════════════════════════════════════════════════════════
   fixCloneBehaviour — arregla comportamientos rotos del clon del tema
   Concept (plantilla 25) que dependían del backend de Shopify.
   ──────────────────────────────────────────────────────────────────
   • CAMBIO DE COLOR (swatches): en el tema real, al elegir un color el
     <variant-picker> pide a Shopify el HTML de la variante
     (/products/x?variant=y&section_id=…). En el clon ese endpoint no
     existe (está interceptado), así que el radio se marcaba pero la
     FOTO NUNCA CAMBIABA → "no me deja cambiar el color".
     Aquí lo resolvemos en local: cada swatch ya trae su propia imagen
     en la variable CSS --swatch-background-image, así que al elegir un
     color cambiamos la imagen principal de esa tarjeta/producto.
   ══════════════════════════════════════════════════════════════════ */

/** Extrae la URL de la imagen que el swatch lleva en su style inline. */
function swatchImageUrl(label: HTMLElement): string | null {
  const raw =
    label.style.getPropertyValue('--swatch-background-image') ||
    getComputedStyle(label).getPropertyValue('--swatch-background-image');
  if (!raw) return null;
  const m = raw.match(/url\((['"]?)(.*?)\1\)/);
  if (!m || !m[2]) return null;
  let url = m[2].trim();
  if (url.startsWith('//')) url = window.location.protocol + url;
  return url || null;
}

/* Selector de la FOTO principal (galería de producto o media de la tarjeta).
   Ojo: <product-info> es solo el panel de info y NO contiene la galería, así
   que hay que subir hasta el contenedor que sí tiene la media principal. */
const MAIN_MEDIA_SEL =
  '.product__media img, .product-card__media img, .card__media img, .media-card__link img, .media img';

/** ¿Es una foto de producto de verdad (y no un icono/miniatura de swatch)? */
function isRealProductImage(img: HTMLImageElement): boolean {
  if (img.closest('.color-swatch') || img.closest('.swatches')) return false;
  // Iconos: SVG o rutas de iconos del tema
  const src = img.currentSrc || img.src || '';
  if (/\.svg(\?|$)/i.test(src) || /\/icon[-_]/i.test(src)) return false;
  if (img.closest('.icon, .icon-box, .icon-with-text, .service-icons')) return false;
  // Demasiado pequeña para ser la foto principal
  const w = img.getBoundingClientRect().width || img.naturalWidth || 0;
  if (w > 0 && w < 80) return false;
  return true;
}

/** Primera imagen principal (nunca un swatch ni un icono). */
function findMainImage(scope: HTMLElement): HTMLImageElement | null {
  const imgs = scope.querySelectorAll<HTMLImageElement>(MAIN_MEDIA_SEL);
  for (const img of Array.from(imgs)) {
    if (isRealProductImage(img)) return img;
  }
  return null;
}

/**
 * Sube por los ancestros hasta encontrar un contenedor que realmente tenga la
 * foto principal del producto (la galería suele ser HERMANA del panel de info).
 */
function findScopeWithMedia(label: HTMLElement): { scope: HTMLElement; img: HTMLImageElement } | null {
  let n: HTMLElement | null = label.parentElement;
  let steps = 0;
  while (n && steps < 12) {
    // Solo consideramos contenedores "de producto" razonables
    const img = findMainImage(n);
    if (img) return { scope: n, img };
    n = n.parentElement;
    steps++;
  }
  return null;
}

/** Cambia la imagen principal del producto/tarjeta a la del color elegido. */
function applySwatchImage(label: HTMLElement) {
  const url = swatchImageUrl(label);
  if (!url) return;
  const hit = findScopeWithMedia(label);
  if (!hit) return;
  const img = hit.img;

  img.removeAttribute('srcset');
  img.removeAttribute('data-srcset');
  img.removeAttribute('sizes');
  img.src = url;
  img.setAttribute('data-clone-variant-img', '1');

  // Si la galería tiene <source> (picture), también hay que actualizarlos
  const pic = img.closest('picture');
  if (pic) pic.querySelectorAll('source').forEach(s => { s.srcset = url; });
}

/**
 * Activa el cambio de color en todo el árbol dado. Idempotente: se puede
 * llamar varias veces (usa delegación en un único listener por raíz).
 */
export function fixCloneBehaviour(root: HTMLElement | Document): void {
  const host = (root as HTMLElement);
  if (host.dataset && host.dataset.cloneFixed) return;
  if (host.dataset) host.dataset.cloneFixed = '1';

  // Delegación: cubre swatches que aparezcan después (carruseles, lazy…)
  const onPick = (ev: Event) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    // click sobre el <label class="color-swatch"> o cambio del radio
    const label =
      t.closest<HTMLElement>('label.color-swatch') ||
      (t instanceof HTMLInputElement && t.id
        ? root.querySelector<HTMLElement>(`label[for="${CSS.escape(t.id)}"]`)
        : null);
    if (!label) return;
    // Dejar que el tema marque el radio primero
    setTimeout(() => applySwatchImage(label), 0);
  };

  root.addEventListener('click', onPick, true);
  root.addEventListener('change', onPick, true);

  // Handler global para links #footer → scroll al final de la página
  if (!document.querySelector('[data-footer-scroll-handler]')) {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-footer-scroll-handler', '1');
    sentinel.style.display = 'none';
    document.body.appendChild(sentinel);
    document.addEventListener('click', (ev: Event) => {
      const t = ev.target as HTMLElement;
      const link = t?.closest?.('a[href="#footer"]') as HTMLAnchorElement | null;
      if (link) {
        ev.preventDefault();
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    });
  }
}
