/** Configuración compartida de niveles VIP (medallas, colores, beneficios). */

import { getWhatsAppUrl } from '@/lib/store-contact';

export type LoyaltyLevelId = 'bronze' | 'silver' | 'gold' | 'diamond' | 'ruby';

export interface LoyaltyLevelMeta {
  id: LoyaltyLevelId;
  name: string;
  color: string;
  badge: string;
  requiredOrders: number;
  pointsMultiplier: number;
}

export const LOYALTY_LEVELS: LoyaltyLevelMeta[] = [
  {
    id: 'bronze',
    name: 'Bronce',
    color: '#cd7f32',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907249364-pegada-1778907248432.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=UZgq9eKk4EDkubPxUsLcuOyhDwGUNUxTuFNQxue45QasYIo3%2F2vMtCU31qDrMbHwnqAYHb2ZWY%2FnLR%2FkVVQlxceKXZP1IS1aN4kErtTF4xTyhhIObTi0f6asQUXiMoVCsll9S3hH1RAo%2FS2Nph84uabU0wWlFnfvtMNvZ0TzRQyjIXfIC%2FqFUv%2BJ2Wz6wBAkUllDmuLiJeYUcsK7Jwmk6mtzhDC8m7EnCUO6RzWS3r10fLtX%2BufPfH3Y%2BKrmODsXffdhAYL7lL3D8eSNSJ%2Fkz4dzRXsdOko5%2BArkNBMdzHVOGbIvrlygMyNsiSuh%2BbCiqJK3r0wj6IyddiP%2Bwvo1Vw%3D%3D',
    requiredOrders: 0,
    pointsMultiplier: 1,
  },
  {
    id: 'silver',
    name: 'Plata',
    color: '#9ca3af',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907186962-pegada-1778907185830.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=f2tSbBlbVIfe2xa9YjBkd2dAcYKCTZNW%2FoleMZYIPn9R%2Fbh8fQI2Xtu1azuD%2BBr2E2gQXYOo7bbbxl4I9GP22DqQg0aYMd5I7MxQ4Z1DPt0xSIhW%2FMKtr39Be6uo%2B2o0Fg1XoSgngoqNRsdJmTSyOPBp3gk6nVKBu4A6Pvk3kwN8UAEzmvgTtFWVuWWltOKZsv6KNtX2X3GkopYLHIkN9DRpQAIh%2Foz3Ghjif%2FSQLsA7Be%2FUVL0TEMKyBu5xhDcJbNd3BFll8KTynlwI%2B5s%2Fi8uI9Iyg0q9DSU86JWYSZW89WDjKO4YukGuc%2BciL%2FchXuck9rzgoUqOR5gGGEMSSQQ%3D%3D',
    requiredOrders: 5,
    pointsMultiplier: 1.5,
  },
  {
    id: 'gold',
    name: 'Oro',
    color: '#fbbf24',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907447447-pegada-1778907446361.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=SVPkcC3LBY2KhtE8vmzKcW2q0HoKNLDT5gSLAB6UjGGkRaoD6IZuOuV7XpTsEG4oI5BhjmOmEyKxdcFA4pHMc8XxwX4D4S%2BnuSs%2FADrfQsHuRSxY0%2BVnbrUZ%2BtJK8%2Fo5lizEIxPcyHlgbLjKsAJMcWppgD5O%2FWpQ5DzVGTCtoCX1hWXwPrwlzwjv8%2BmsKBPk0U9g%2B53MeilokwG%2BCyDZsJfHK4fE9P3bMFcs04B%2BYoEY3zhLLDLiGjwvp5uYCJ9sckBg7ki1EWYXAu13sX%2Fp5S3GXwtNh4QqJrv9FuP2EN2iUoWJXjz7hk7efafpvhS1GbORq%2FpwZJbPi1HIfWNoZA%3D%3D',
    requiredOrders: 10,
    pointsMultiplier: 2,
  },
  {
    id: 'diamond',
    name: 'Diamante',
    color: '#60a5fa',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907790908-pegada-1778907790043.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=A%2FL9Y0VDAOZojqnk%2B2T%2Bz9QL7IH%2FaPi7YtOA4lAo3hsrrR29s91RDdWzwl9ZDCsXiW18zqqdYm7cS44ucw0sOD%2Fs7lE6JF%2B%2BtNKSLCxnuC18Xx7N0R%2FO5AvRVO4QwayS1hlwzfOgkGS9hSnXFIgC%2Filo9WnsHlAQBK1qJTxSKCaawiXUVVloTSHSqJGLLhAoiiiY1WpFLilBLnguj8l%2FqGF%2B9WTqyO%2Fq7YMr%2FJyVUU4t5llG0zVzh6HUmYGHC3HHMRqYBHVL6IAv%2FUge21gGoxg1wokBp9ph7Qf5ZEGLwdASua9Y67XqDQY6pu7%2BAu06A6eVyDFakG845%2FpSkAYjjA%3D%3D',
    requiredOrders: 20,
    pointsMultiplier: 3,
  },
  {
    id: 'ruby',
    name: 'Ruby',
    color: '#f43f5e',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778908226958-pegada-1778908225905.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=BqPLV4aHi9DTpG6dmp8HQD%2FPK%2BiL2gnkClQ3ZaSF1oyhQHyyTgBBu8l%2B43gHdJqACfsNv7SO0JJKxhRUNXbrUyu0hAZkGwlwLHgRfIOq%2BEEbE%2Brfrnz%2BJ5vBydNAFo3jdian%2Fd5Qx0G6pQ3cs45r%2BvI9ttjuz%2Fm%2FDhXoOWJqFk6APK43kC69by2GiW%2FVJ7SL%2BQ0Dj07MelRAdhiVWBT%2BIQhuhJ6w4TstSrUqHvkgBi4SqVN2gNQVQD1MHWQ4T0AJ8O8qXVvm96poxdusTPkzusKMZRGn7yglXGqNAn7ImNKKQ2CUNB6NEeoNSRquYckAVngc5ug8Xzza7JG6uhCDHQ%3D%3D',
    requiredOrders: 30,
    pointsMultiplier: 5,
  },
];

export function getLevelMeta(levelId: string): LoyaltyLevelMeta {
  return LOYALTY_LEVELS.find((l) => l.id === levelId) || LOYALTY_LEVELS[0];
}

/** Variables CSS para anillo animado del avatar según medalla. */
export function getAvatarRingStyle(levelId: string): Record<string, string> {
  const { color } = getLevelMeta(levelId);
  return {
    '--yaxsel-ring-color': color,
    '--yaxsel-ring-glow': `${color}99`,
  };
}

export type BenefitLink = { href: string; label: string };

/** Enlaces por beneficio (texto exacto o parcial). */
export function getBenefitLink(benefit: string): BenefitLink | null {
  const exact: Record<string, BenefitLink> = {
    'Acceso a catálogo completo': { href: '/productos', label: 'Ver catálogo' },
    'Seguimiento de pedidos': { href: '/cuenta/pedidos', label: 'Mis pedidos' },
    'Atención al cliente': { href: getWhatsAppUrl('Hola, necesito ayuda con mi cuenta VIP'), label: 'WhatsApp' },
    '1 punto por cada $1000 gastado': { href: '/cuenta/puntos', label: 'Canjear puntos' },
    'Sorteo mensual para nuevos usuarios': { href: '/cuenta/regalos', label: 'Ver regalos' },
  };
  if (exact[benefit]) return exact[benefit];

  const lower = benefit.toLowerCase();
  if (lower.includes('punto')) return { href: '/cuenta/puntos', label: 'Tienda de puntos' };
  if (lower.includes('pedido') || lower.includes('seguimiento')) return { href: '/cuenta/pedidos', label: 'Mis pedidos' };
  if (lower.includes('catálogo') || lower.includes('catalogo')) return { href: '/productos', label: 'Ver catálogo' };
  if (lower.includes('cupón') || lower.includes('cupon')) return { href: '/cuenta/cupones', label: 'Mis cupones' };
  if (lower.includes('envío') || lower.includes('envio')) return { href: '/cuenta/direcciones', label: 'Direcciones' };
  if (lower.includes('oferta') || lower.includes('preventa')) return { href: '/ofertas', label: 'Ver ofertas' };
  if (lower.includes('whatsapp') || lower.includes('soporte') || lower.includes('atención') || lower.includes('atencion') || lower.includes('cliente')) {
    return { href: getWhatsAppUrl('Hola, necesito ayuda con mi cuenta'), label: 'WhatsApp' };
  }
  if (lower.includes('cumpleaños') || lower.includes('cumpleanos') || lower.includes('regalo')) return { href: '/cuenta/regalos', label: 'Regalos' };
  return null;
}
