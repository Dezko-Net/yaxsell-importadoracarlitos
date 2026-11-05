import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { ADDRESSES_COLLECTION_ID } from '@/lib/db';

export interface StoredAddress {
  id: string;
  alias: string;
  name: string;
  phone: string;
  fullAddress: string;
  commune: string;
  region: string;
  lat: number;
  lng: number;
}

export function loadAddressesLocal(userId: string): StoredAddress[] {
  try {
    return JSON.parse(localStorage.getItem(`addr_${userId}`) || '[]');
  } catch {
    return [];
  }
}

export function saveAddressesLocal(userId: string, list: StoredAddress[]) {
  localStorage.setItem(`addr_${userId}`, JSON.stringify(list));
}

// Track 404 to avoid hammering a non-existent collection on every page load
let addressesCollectionUnavailable = false;

export async function loadAddressesFromDB(userId: string): Promise<StoredAddress[]> {
  // If we already got a 404 for this collection, don't retry until next page load
  if (addressesCollectionUnavailable) return [];
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const res = await databases.listDocuments(databaseId, ADDRESSES_COLLECTION_ID, [
      Query.equal('userId', userId),
      Query.limit(100),
    ]);
    return res.documents.map((doc: Record<string, unknown>) => ({
      id: doc.$id as string,
      alias: (doc.alias as string) || 'Otro',
      name: (doc.name as string) || '',
      phone: (doc.phone as string) || '',
      fullAddress: (doc.address as string) || '',
      commune: (doc.city as string) || '',
      region: (doc.region as string) || '',
      lat: (doc.lat as number) || 0,
      lng: (doc.lng as number) || 0,
    }));
  } catch (err: any) {
    // 404 = collection not yet created in Appwrite — suppress further calls
    const code = err?.code ?? err?.status ?? (err?.response?.code);
    if (code === 404) {
      addressesCollectionUnavailable = true;
      console.warn('[addresses] Collection not found (404). Addresses will use localStorage only.');
    }
    return [];
  }
}

export async function syncAddressesForUser(userId: string): Promise<StoredAddress[]> {
  const fromDb = await loadAddressesFromDB(userId);
  if (fromDb.length > 0) {
    saveAddressesLocal(userId, fromDb);
    return fromDb;
  }
  return loadAddressesLocal(userId);
}

export function getPrimaryAddressLabel(addresses: StoredAddress[]): string | null {
  const primary = addresses[0];
  if (!primary) return null;
  return primary.commune || primary.fullAddress || null;
}

export const TPL1_ADDRESS_UPDATED = 'tpl1:address-updated';
export const TPL1_OPEN_NOTIFICATIONS = 'tpl1:open-notifications';
