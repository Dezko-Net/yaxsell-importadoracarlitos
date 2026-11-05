import type { SectionSettings } from '@/lib/section-config';

/** Aplica color sólido y anula gradientes del tema que dejan el texto invisible. */
export function paintTpl1Text(el: HTMLElement | null, color: string): void {
  if (!el || !color) return;
  el.style.setProperty('color', color, 'important');
  el.style.setProperty('-webkit-text-fill-color', color, 'important');
  el.style.setProperty('background', 'none', 'important');
  el.style.setProperty('background-image', 'none', 'important');
  el.style.removeProperty('-webkit-background-clip');
  el.style.removeProperty('background-clip');
}

/** Colores y tipografía del editor → títulos de sección Shopify (.musk-sec-title). */
export function applyTpl1SectionColors(root: HTMLElement, settings: Partial<SectionSettings>): void {
  if (settings.bgColor) {
    root.style.setProperty('background-color', settings.bgColor, 'important');
  }

  const title = root.querySelector('.musk-h2-head') as HTMLElement | null;
  const sub = root.querySelector('.musk-fancy-sub-head') as HTMLElement | null;
  const para = root.querySelector('.musk-main-para') as HTMLElement | null;

  if (settings.headingColor) paintTpl1Text(title, settings.headingColor);
  if (settings.accentColor) paintTpl1Text(sub, settings.accentColor);
  else if (settings.textColor) paintTpl1Text(sub, settings.textColor);
  if (settings.textColor) paintTpl1Text(para, settings.textColor);

  if (settings.headingSize && title) title.style.fontSize = `${settings.headingSize}px`;
  if (settings.textSize && para) para.style.fontSize = `${settings.textSize}px`;
  if (settings.headingFontFamily && title) title.style.fontFamily = settings.headingFontFamily;
  if (settings.fontFamily) {
    if (para) para.style.fontFamily = settings.fontFamily;
    if (sub && !settings.headingFontFamily) sub.style.fontFamily = settings.fontFamily;
  }
  if (settings.fontWeight) {
    if (title) title.style.fontWeight = String(settings.fontWeight);
    if (sub) sub.style.fontWeight = String(settings.fontWeight);
  }
}
