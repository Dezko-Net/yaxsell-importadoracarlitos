/**
 * Feature Flags — Control de funcionalidades premium.
 *
 * Cambar estos flags a `true` para habilitar las funcionalidades
 * cuando un cliente las contrate como add-on.
 *
 * Por defecto todo está DESACTIVADO para el demo base.
 */

// ─── IA (Inteligencia Artificial) ──────────────────────────────
// Incluye: AI Sidekick, auto-categorizar productos, generación de imágenes,
// Gemini y ChatBot cliente. Las respuestas IA de WhatsApp tienen su propio flag.
export const AI_ENABLED = false;

// ─── WhatsApp Bot (Yaxbot) ─────────────────────────────────────
// El bot de WhatsApp que responde automáticamente a clientes.
export const WHATSAPP_BOT_ENABLED = true;

// Respuestas de IA a clientes por WhatsApp. El bot conserva solo sus flujos
// deterministas de pedidos y comprobantes hasta que el soporte con IA esté listo.
export const WHATSAPP_CUSTOMER_AI_ENABLED = false;

// ─── AI Sidekick (Asistente admin) ─────────────────────────────
// Panel flotante de IA en el admin para sugerencias.
export const AI_SIDEKICK_ENABLED = false;

// ─── Auto-categorización de productos ──────────────────────────
// Botón "Categorizar con IA" en el panel de productos.
export const AI_CATEGORIZE_ENABLED = false;

// ─── Generación de imágenes ────────────────────────────────────
// Generar imágenes de productos con IA.
export const AI_IMAGE_GEN_ENABLED = false;

// ─── ChatBot cliente (frontend) ────────────────────────────────
// Widget de chat flotante para clientes en la tienda.
export const CHATBOT_ENABLED = false;

// ─── Notificaciones inteligentes ───────────────────────────────
// Notificaciones automáticas con IA cuando cambia estado de pedido.
export const SMART_NOTIFICATIONS_ENABLED = false;

// ─── Negociación automática (cron) ─────────────────────────────
// Cron job que negocia con clientes vía WhatsApp automáticamente.
export const AUTO_NEGOTIATION_ENABLED = false;

// ─── Alertas de Stock Crítico (WhatsApp) ───────────────────────
// Envío de WhatsApp a bodeguero/admin cuando un producto cae en rojo.
// Desactivado temporalmente a petición del usuario.
export const STOCK_CRITICAL_ALERTS_ENABLED = false;

// ─── Helper ────────────────────────────────────────────────────
export function isFeatureEnabled(feature: string): boolean {
  const flags: Record<string, boolean> = {
    ai: AI_ENABLED,
    whatsapp_bot: WHATSAPP_BOT_ENABLED,
    whatsapp_customer_ai: WHATSAPP_CUSTOMER_AI_ENABLED,
    ai_sidekick: AI_SIDEKICK_ENABLED,
    ai_categorize: AI_CATEGORIZE_ENABLED,
    ai_image_gen: AI_IMAGE_GEN_ENABLED,
    chatbot: CHATBOT_ENABLED,
    smart_notifications: SMART_NOTIFICATIONS_ENABLED,
    auto_negotiation: AUTO_NEGOTIATION_ENABLED,
    stock_critical_alerts: STOCK_CRITICAL_ALERTS_ENABLED,
  };
  return flags[feature] ?? false;
}
