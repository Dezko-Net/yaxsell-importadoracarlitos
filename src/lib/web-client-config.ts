export interface WebClientConfig {
  storeName: string;
  logoUrl: string;
  heroImageUrl: string;
  supportPhone: string;
  botPhone: string;
  address: string;
  siteUrl: string;
  announcementText: string;
  shippingText: string;
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
}

const isCarlitosProject = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos') === 'importadora-carlitos';
export const DEFAULT_WEB_CLIENT_CONFIG: WebClientConfig = isCarlitosProject ? {
  storeName: 'Importadora Carlitos', logoUrl: '/images/importadora-carlitos-logo-nuevo.png', heroImageUrl: '/images/carlitos-hero-boutique-v1.webp',
  supportPhone: '56985520703', botPhone: '56954592656', address: "Av. Libertador Bernardo O'Higgins #2960", siteUrl: 'https://www.importadoracarlitos.cl',
  announcementText: 'Ropa · perfumes · accesorios', shippingText: 'Envíos a todo Chile', heroKicker: 'Proveedor directo · Chile',
  heroTitle: 'Ropa que va contigo. Perfumes para cada momento.',
  heroDescription: 'Descubre ropa, perfumes y más. Te atendemos por WhatsApp y enviamos a todo Chile.',
} : {
  storeName: 'Mi tienda', logoUrl: '', heroImageUrl: '', supportPhone: '', botPhone: '', address: '', siteUrl: '',
  announcementText: 'Bienvenido a nuestra tienda', shippingText: 'Consulta por nuestros envíos', heroKicker: 'Tu tienda',
  heroTitle: 'Descubre nuestros productos', heroDescription: 'Explora nuestro catálogo y encuentra tus favoritos.',
};

export function normalizeWebClientConfig(value: unknown): WebClientConfig {
  const data = value && typeof value === 'object' ? value as Partial<WebClientConfig> : {};
  const field = (key: keyof WebClientConfig) => typeof data[key] === 'string' ? data[key]!.trim() : DEFAULT_WEB_CLIENT_CONFIG[key];
  return {
    storeName: field('storeName'), logoUrl: field('logoUrl'), heroImageUrl: field('heroImageUrl'),
    supportPhone: field('supportPhone'), botPhone: field('botPhone'), address: field('address'), siteUrl: field('siteUrl').replace(/\/+$/, ''),
    announcementText: field('announcementText'), shippingText: field('shippingText'), heroKicker: field('heroKicker'),
    heroTitle: field('heroTitle'), heroDescription: field('heroDescription'),
  };
}

export function validateWebClientConfig(config: WebClientConfig, metaPhoneNumberId: string): string | null {
  if (!config.storeName || config.storeName.length > 100) return 'Escribe un nombre de tienda de hasta 100 caracteres.';
  if (config.logoUrl && (config.logoUrl.length > 2048 || !(/^(https?:\/\/|\/)/i.test(config.logoUrl)) || config.logoUrl.startsWith('//'))) return 'Usa una URL http/https o una imagen de la tienda para el logo.';
  if (config.heroImageUrl && (config.heroImageUrl.length > 2048 || !(/^(https?:\/\/|\/)/i.test(config.heroImageUrl)) || config.heroImageUrl.startsWith('//'))) return 'Usa una URL http/https o una imagen de la tienda para la portada.';
  if (![config.supportPhone, config.botPhone].every(phone => !phone || /^\d{8,15}$/.test(phone))) return 'Los teléfonos deben incluir el código de país y entre 8 y 15 dígitos.';
  if (config.siteUrl) {
    try {
      const url = new URL(config.siteUrl);
      if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    } catch { return 'Escribe la URL principal de la tienda, por ejemplo https://mitienda.cl.'; }
  }
  if (config.address.length > 200 || config.announcementText.length > 100 || config.shippingText.length > 70 || config.heroKicker.length > 70 || config.heroTitle.length > 160 || config.heroDescription.length > 300) return 'La dirección o uno de los textos de la tienda es demasiado largo.';
  if (metaPhoneNumberId && !/^\d{5,30}$/.test(metaPhoneNumberId)) return 'El identificador de número de Meta debe contener solo dígitos.';
  return null;
}
