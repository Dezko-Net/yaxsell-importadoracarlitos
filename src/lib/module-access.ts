/** Modules included in the Importadora Carlitos e-commerce plan. */
export const MODULE_ACCESS = {
  ecommerce: true,
  pos: true,
  erp: true,
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

export const POS_PATHS = [
  '/pos',
  '/pos-admin',
  '/pos-acceso',
  '/pos-visualizer',
  '/api/pos',
  '/api/pos-admin',
  '/admin/pos',
  '/admin/pos-admin',
] as const;

export const ERP_PATHS = [
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

export type ServiceModule = 'web' | 'erp' | 'pos';
export type ServiceModules = Record<ServiceModule, boolean>;
export const DEFAULT_SERVICE_MODULES: ServiceModules = { web: true, erp: true, pos: true };

const WEB_PATHS = [
  '/productos', '/checkout', '/carrito', '/cuenta', '/favoritos', '/comparar',
  '/pedido', '/confirmar-pedido', '/datos-envio', '/ofertas', '/admin', '/shopify/catalogo-original',
] as const;

function matchesPath(path: string, prefixes: readonly string[]) {
  return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export function moduleForPath(path: string): ServiceModule | null {
  if (path === '/admin/login' || path.startsWith('/admin/login/')) return null;
  if (matchesPath(path, POS_PATHS)) return 'pos';
  if (matchesPath(path, ERP_PATHS)) return 'erp';
  if (path === '/' || matchesPath(path, WEB_PATHS)) return 'web';
  return null;
}

export function normalizeServiceModules(value: unknown): ServiceModules {
  const data = value && typeof value === 'object' ? value as Partial<ServiceModules> : {};
  return {
    web: typeof data.web === 'boolean' ? data.web : true,
    erp: typeof data.erp === 'boolean' ? data.erp : true,
    pos: typeof data.pos === 'boolean' ? data.pos : true,
  };
}

export function changeServiceModule(current: ServiceModules, source: ServiceModule, target: ServiceModule, enabled: boolean): ServiceModules {
  if (!current[source]) throw new Error('MODULE_DISABLED');
  if (source === target && !enabled) throw new Error('CANNOT_DISABLE_CURRENT');
  return { ...current, [target]: enabled };
}

// Bandeja del bot, habilitada aparte de la gestión general de WhatsApp.
const WHATSAPP_INBOX_PATHS = [
  '/admin/ia/whatsapp',
  '/api/admin/ia/config',
  '/api/admin/ia/threads',
  '/api/admin/ia/thread',
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

// Herramientas generales de WhatsApp asociadas a pedidos y operaciones.
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
