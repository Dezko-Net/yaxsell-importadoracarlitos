import { unstable_cache } from 'next/cache';
import { serverListDocuments } from '@/lib/db-server';
import { VENDORS_COLLECTION_ID } from '@/lib/db';

export type PublicVendor = {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  minPurchaseAmount: number;
};

type PublicVendorsState = {
  memoryVendors: PublicVendor[] | null;
  memoryVendorsAt: number;
  pendingVendors: Promise<PublicVendor[]> | null;
};

const gVendors = globalThis as unknown as {
  __yaxsellPublicVendorsState?: PublicVendorsState;
};

function getVendorsState(): PublicVendorsState {
  if (!gVendors.__yaxsellPublicVendorsState) {
    gVendors.__yaxsellPublicVendorsState = {
      memoryVendors: null,
      memoryVendorsAt: 0,
      pendingVendors: null,
    };
  }
  return gVendors.__yaxsellPublicVendorsState;
}

const MEMORY_TTL = 60 * 60 * 1000;

const getCachedVendors = unstable_cache(
  async (): Promise<PublicVendor[]> => {
    const result = await serverListDocuments(VENDORS_COLLECTION_ID, [
      JSON.stringify({ method: 'equal', attribute: 'ACTIVE', values: [true] }),
      JSON.stringify({ method: 'limit', values: [200] }),
    ]);

    return (result.documents as any[])
      .filter(v => v.$id !== '_init' && !v._seed && String(v.NAME || '').trim())
      .map(v => ({
        id: v.$id,
        name: v.NAME || 'Tienda asociada',
        color: v.BRAND_COLOR || '#f97316',
        secondaryColor: v.BRAND_SECONDARY_COLOR || '#fb923c',
        logoUrl: v.LOGO_URL || '',
        phone: v.STORE_PHONE || v.PUBLIC_PHONE || '',
        email: v.STORE_EMAIL || v.PUBLIC_EMAIL || '',
        address: v.STORE_ADDRESS || '',
        minPurchaseAmount: v.MIN_PURCHASE_AMOUNT || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  ['public-vendors-cache-v6'],
  { revalidate: 86400, tags: ['vendors'] }
);

/** Comparte la consulta pública de vendors entre catálogo y endpoint de vendors. */
export async function getPublicVendors(): Promise<PublicVendor[]> {
  const state = getVendorsState();
  if (state.memoryVendors && Date.now() - state.memoryVendorsAt < MEMORY_TTL) return state.memoryVendors;
  if (state.pendingVendors) return state.pendingVendors;

  state.pendingVendors = getCachedVendors()
    .then(vendors => {
      state.memoryVendors = vendors;
      state.memoryVendorsAt = Date.now();
      return vendors;
    })
    .catch(error => {
      // Conserva el último catálogo conocido si Firestore falla temporalmente.
      if (state.memoryVendors) return state.memoryVendors;
      throw error;
    })
    .finally(() => {
      state.pendingVendors = null;
    });

  return state.pendingVendors;
}
