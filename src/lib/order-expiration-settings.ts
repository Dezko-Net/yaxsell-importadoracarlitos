import 'server-only';

import { getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';

export const DEFAULT_ORDER_EXPIRATION_MINUTES = 20;
export const MIN_ORDER_EXPIRATION_MINUTES = 1;
export const MAX_ORDER_EXPIRATION_MINUTES = 10080;
export const ORDER_EXPIRATION_SETTING_FIELD = 'ORDER_EXPIRATION_MINUTES';

export function normalizeOrderExpirationMinutes(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_ORDER_EXPIRATION_MINUTES || minutes > MAX_ORDER_EXPIRATION_MINUTES) return null;
  return minutes;
}

/** Returns null until an admin explicitly chooses a shared expiration duration. */
export async function getConfiguredOrderExpirationMinutes(): Promise<number | null> {
  try {
    const snapshot = await getAdminDb()
      .collection(STORE_SETTINGS_COLLECTION)
      .doc('main')
      .get();
    return normalizeOrderExpirationMinutes(snapshot.data()?.[ORDER_EXPIRATION_SETTING_FIELD]);
  } catch (error) {
    console.error('[order-expiration-settings] Error leyendo plazo configurado:', error);
    return null;
  }
}
