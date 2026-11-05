import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { LoyaltyService } from '@/services/loyaltyService';

export const POINTS_STORE_COLLECTION = 'points_store_items';

export type PointsStoreItemType = 'product' | 'coupon' | 'offer' | 'gift' | 'shipping';

export interface PointsStoreItem {
  $id: string;
  TITLE: string;
  DESCRIPTION?: string;
  TYPE: PointsStoreItemType;
  POINTSCOST: number;
  IMAGEURL?: string;
  LINK?: string;
  COUPONCODE?: string;
  PRODUCTID?: string;
  ISACTIVE: boolean;
  SORTORDER?: number;
  STOCK?: number;
}

export interface UserPointsBalance {
  earned: number;
  redeemed: number;
  available: number;
}

export class PointsStoreService {
  static async listActiveItems(): Promise<PointsStoreItem[]> {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, POINTS_STORE_COLLECTION, [
        Query.equal('ISACTIVE', true),
        Query.orderAsc('$createdAt'),
        Query.limit(100),
      ]);
      return res.documents as unknown as PointsStoreItem[];
    } catch {
      return getDefaultItems();
    }
  }

  static async getUserPoints(userId: string): Promise<UserPointsBalance> {
    const loyalty = await LoyaltyService.getLoyaltyData(userId);
    let redeemed = 0;
    try {
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
      redeemed = Number(prefs.pointsRedeemed || 0);
    } catch { /* ignore */ }
    const earned = loyalty.points;
    return { earned, redeemed, available: Math.max(0, earned - redeemed) };
  }

  static async redeemItem(userId: string, item: PointsStoreItem): Promise<{ success: boolean; error?: string; code?: string }> {
    const balance = await this.getUserPoints(userId);
    if (balance.available < item.POINTSCOST) {
      return { success: false, error: 'No tienes suficientes puntos' };
    }

    try {
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
      const redeemed = Number(prefs.pointsRedeemed || 0) + item.POINTSCOST;
      const redemptions = Array.isArray(prefs.pointsRedemptions) ? [...(prefs.pointsRedemptions as object[])] : [];
      redemptions.push({
        itemId: item.$id,
        title: item.TITLE,
        type: item.TYPE,
        cost: item.POINTSCOST,
        at: Date.now(),
        code: item.COUPONCODE || undefined,
      });

      const updates: Record<string, unknown> = {
        ...prefs,
        pointsRedeemed: redeemed,
        pointsRedemptions: redemptions,
      };

      if (item.TYPE === 'coupon' && item.COUPONCODE) {
        updates.autoApplyCoupon = item.COUPONCODE;
        updates.welcomeCouponCode = item.COUPONCODE;
      }

      await account.updatePrefs(updates);
      return { success: true, code: item.COUPONCODE || undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al canjear';
      return { success: false, error: msg };
    }
  }
}

/** Fallback si la colección aún no existe en Appwrite. */
function getDefaultItems(): PointsStoreItem[] {
  return [
    {
      $id: 'default-1',
      TITLE: 'Cupón 5% extra',
      DESCRIPTION: 'Descuento en tu próxima compra mayor a $30.000',
      TYPE: 'coupon',
      POINTSCOST: 500,
      COUPONCODE: 'PUNTOS5',
      ISACTIVE: true,
      SORTORDER: 1,
    },
    {
      $id: 'default-2',
      TITLE: 'Envío con descuento',
      DESCRIPTION: '50% de descuento en el costo de envío',
      TYPE: 'shipping',
      POINTSCOST: 800,
      ISACTIVE: true,
      SORTORDER: 2,
    },
    {
      $id: 'default-3',
      TITLE: 'Regalo sorpresa',
      DESCRIPTION: 'Muestra aleatoria en pedidos elegibles',
      TYPE: 'gift',
      POINTSCOST: 1200,
      ISACTIVE: true,
      SORTORDER: 3,
    },
  ];
}
