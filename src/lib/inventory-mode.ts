import { getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';

export type InventoryConnectionMode = 'erp_integrated' | 'web_independent';
export type InventoryStockField = 'STOCK' | 'WEB_STOCK';

export const DEFAULT_INVENTORY_CONNECTION_MODE: InventoryConnectionMode = 'erp_integrated';

export function normalizeInventoryConnectionMode(value: unknown): InventoryConnectionMode {
  return value === 'web_independent' ? 'web_independent' : 'erp_integrated';
}

export async function getInventoryConnectionMode(): Promise<InventoryConnectionMode> {
  try {
    const collection = getAdminDb().collection(STORE_SETTINGS_COLLECTION);
    const main = await collection.doc('main').get();
    if (main.exists) return normalizeInventoryConnectionMode(main.data()?.inventoryMode);
    const config = await collection.doc('config').get();
    return normalizeInventoryConnectionMode(config.data()?.inventoryMode);
  } catch {
    return DEFAULT_INVENTORY_CONNECTION_MODE;
  }
}

export function getInventoryStockField(
  mode: InventoryConnectionMode,
  isMainStoreProduct = true,
): InventoryStockField {
  return mode === 'web_independent' && isMainStoreProduct ? 'WEB_STOCK' : 'STOCK';
}

export function getInventoryStock(
  product: Record<string, any> | null | undefined,
  mode: InventoryConnectionMode,
  isMainStoreProduct = true,
): number {
  const data = product || {};
  const raw = getInventoryStockField(mode, isMainStoreProduct) === 'WEB_STOCK'
    ? data.WEB_STOCK ?? data.web_stock ?? data.STOCK ?? data.stock ?? 0
    : data.STOCK ?? data.stock ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function inventoryStockUpdate(
  value: number,
  mode: InventoryConnectionMode,
  isMainStoreProduct = true,
): Record<string, number> {
  const stock = Math.max(0, Math.floor(Number(value) || 0));
  return getInventoryStockField(mode, isMainStoreProduct) === 'WEB_STOCK'
    ? { WEB_STOCK: stock, web_stock: stock }
    : { STOCK: stock, stock };
}

export async function getOrderInventoryConnectionMode(
  order?: Record<string, any> | null,
): Promise<InventoryConnectionMode> {
  const savedMode = order?.INVENTORYMODE ?? order?.inventoryMode;
  if (savedMode === 'web_independent' || savedMode === 'erp_integrated') {
    return savedMode;
  }
  if (order?.IS_VENDOR_ORDER === true || order?.VENDOR_ID) {
    return DEFAULT_INVENTORY_CONNECTION_MODE;
  }
  return getInventoryConnectionMode();
}
