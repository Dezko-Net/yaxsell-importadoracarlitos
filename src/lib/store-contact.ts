/** Contacto de la tienda (WhatsApp, soporte). */
export const BOT_WHATSAPP_PHONE = '56954592656';
export const OWNER_WHATSAPP_PHONE = '56985520703';
export const WHATSAPP_PHONE = BOT_WHATSAPP_PHONE;
export const WHATSAPP_DISPLAY = '+56 9 5459 2656';
export const WHATSAPP_E164 = `+${BOT_WHATSAPP_PHONE}`;
export const STORE_NAME = 'Importadora Carlitos';
export const SUPPORT_HOURS = 'Lunes a sábado, 9:00 – 19:00 hrs';

export const CHATBOT_OPEN_EVENT = 'yaxsel:chatbot-open';

export function getWhatsAppUrl(message = 'Hola, tengo una consulta sobre la tienda 🛒'): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

export function openChatbot(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHATBOT_OPEN_EVENT));
  }
}
