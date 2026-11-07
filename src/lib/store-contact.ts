/** Contacto de la tienda (WhatsApp, soporte). */
import { DEFAULT_WEB_CLIENT_CONFIG } from '@/lib/web-client-config';
export const WHATSAPP_PHONE = DEFAULT_WEB_CLIENT_CONFIG.supportPhone;
export const WHATSAPP_DISPLAY = WHATSAPP_PHONE ? `+${WHATSAPP_PHONE}` : '';
export const WHATSAPP_E164 = WHATSAPP_PHONE ? `+${WHATSAPP_PHONE}` : '';
export const STORE_NAME = 'Importadora Carlitos';
export const SUPPORT_HOURS = 'Lunes a sábado, 9:00 – 19:00 hrs';

export const CHATBOT_OPEN_EVENT = 'yaxsel:chatbot-open';

export function getWhatsAppUrl(message = 'Hola, tengo una consulta sobre la tienda 🛒', phone = WHATSAPP_PHONE): string {
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
}

export function openChatbot(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHATBOT_OPEN_EVENT));
  }
}
