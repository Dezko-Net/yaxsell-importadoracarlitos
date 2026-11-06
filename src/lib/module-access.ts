/** Modules included in the Importadora Carlitos e-commerce plan. */
export const MODULE_ACCESS = {
  ecommerce: true,
  pos: false,
  erp: false,
  whatsappManagement: false,
  whatsappInbox: true,
} as const;

const INTEGRATED_PRODUCT_STEPS = new Set([
  '/admin/store-catalog',
  '/admin/store-catalog/revision-web',
  '/admin/products',
]);

export function isProductNavigationVisible(href: string, inventoryMode: unknown): boolean {
  return inventoryMode === 'erp_integrated' || !INTEGRATED_PRODUCT_STEPS.has(href);
}

const POS_PATHS = [
  '/pos',
  '/pos-admin',
  '/pos-acceso',
  '/pos-visualizer',
  '/api/pos',
  '/api/pos-admin',
  '/admin/pos',
  '/admin/pos-admin',
] as const;

const ERP_PATHS = [
  '/erp',
  '/erp-dashboard',
  '/cuadres',
  '/inventario',
  '/gastos',
  '/gastos-externos',
  '/sucursales',
  '/ventas-tiempo-real',
  '/planilla-unificada',
  '/base-datos',
  '/alertas',
  '/api/erp',
  '/api/cuadres',
  '/api/admin-supreme',
  '/api/admin/sync-firebase-products',
  '/admin/erp',
  '/admin/inventario-erp',
  '/admin/products/stock-editor',
  '/admin-supreme',
] as const;

// Bandeja de atención del bot: se puede ofrecer aunque no se contrate la gestión
// general de WhatsApp integrada con pedidos, configuración y herramientas del ERP.
const WHATSAPP_INBOX_PATHS = [
  '/admin/ia/whatsapp',
  '/api/admin/ia/config',
  '/api/admin/ia/threads',
  '/api/admin/ia/thread',
  '/api/admin/ia/threads/backfill',
  '/api/admin/ia/send',
  '/api/admin/ia/send-template',
  '/api/admin/ia/customer-lookup',
  '/api/admin/ia/link-phone',
  '/api/admin/ia/clear-history',
  '/api/admin/ia/delete-thread',
  '/api/admin/ia/block',
  '/api/admin/ia/debug',
  '/api/admin/ia/interact',
] as const;

// Funciones generales de WhatsApp ligadas a pedidos y ajustes comerciales.
const WHATSAPP_MANAGEMENT_PATHS = [
  '/api/admin/whatsapp-send',
  '/api/admin/orders/notify-shipping-data',
] as const;

export const DISABLED_MODULE_PATHS = [
  ...(!MODULE_ACCESS.pos ? POS_PATHS : []),
  ...(!MODULE_ACCESS.erp ? ERP_PATHS : []),
  ...(!MODULE_ACCESS.whatsappInbox ? WHATSAPP_INBOX_PATHS : []),
  ...(!MODULE_ACCESS.whatsappManagement ? WHATSAPP_MANAGEMENT_PATHS : []),
] as const;
