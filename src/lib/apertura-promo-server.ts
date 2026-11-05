import 'server-only';
import { APERTURA_SETTINGS_COLLECTION } from '@/lib/collections';
import { serverListDocuments } from '@/lib/db-server';
import type { AperturaSettings } from '@/lib/apertura-promo';

const DEFAULT_SETTINGS: AperturaSettings = {
  isActive: false,
  discountPercent: 0,
  minPurchase: 0,
};

export async function fetchAperturaSettings(): Promise<AperturaSettings> {
  try {
    const res = await serverListDocuments(APERTURA_SETTINGS_COLLECTION, [
      JSON.stringify({ method: 'limit', values: [1] }),
    ]);
    if (!res.documents.length) return DEFAULT_SETTINGS;
    const d = res.documents[0] as Record<string, unknown>;
    return {
      isActive: !!d.isActive,
      discountPercent: typeof d.discountPercent === 'number' ? d.discountPercent : 10,
      minPurchase: typeof d.minPurchase === 'number' ? d.minPurchase : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
