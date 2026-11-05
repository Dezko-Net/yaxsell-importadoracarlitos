import { LOYALTY_LEVELS, type LoyaltyLevelId } from '@/lib/loyalty-levels';

export interface OrderStats {
  total: number;
  pending: number;
  paid: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  revenuePaid: number;
  revenueAll: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
}

export interface AdminCustomerPrefs {
  loyaltyLevel?: string;
  welcomeGiftClaimed?: boolean;
  welcomeCouponCode?: string;
  rut?: string;
  phone?: string;
  region?: string;
  comuna?: string;
  address?: string;
  avatarFileId?: string;
  coverFileId?: string;
  [key: string]: unknown;
}

export interface AdminCustomerRow {
  $id: string;
  userId: string;
  email: string;
  name: string;
  phone?: string;
  region?: string;
  comuna?: string;
  address?: string;
  isWholesale?: boolean;
  isBanned?: boolean;
  adminNotes?: string;
  profileCreatedAt: string;
  authCreatedAt?: string;
  lastAccessAt?: string;
  registrationAt?: string;
  passwordUpdatedAt?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  authStatus?: string;
  authLabels?: string[];
  prefs: AdminCustomerPrefs;
  loyaltyStored: LoyaltyLevelId;
  loyaltyCalculated: LoyaltyLevelId;
  loyaltyName: string;
  pointsEstimate: number;
  orders: OrderStats;
  hasProfileDoc: boolean;
  isAuthOnly: boolean;
  registrationType: 'whatsapp' | 'web' | 'unknown';
}

const EMPTY_STATS: OrderStats = {
  total: 0,
  pending: 0,
  paid: 0,
  processing: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
  revenuePaid: 0,
  revenueAll: 0,
  lastOrderAt: null,
  firstOrderAt: null,
};

export function emptyOrderStats(): OrderStats {
  return { ...EMPTY_STATS };
}

export function calculateLoyaltyFromPaidOrders(paidCount: number): LoyaltyLevelId {
  let level: LoyaltyLevelId = 'bronze';
  for (const l of LOYALTY_LEVELS) {
    if (paidCount >= l.requiredOrders) level = l.id;
  }
  return level;
}

export function estimatePoints(totalSpent: number, levelId: LoyaltyLevelId): number {
  const meta = LOYALTY_LEVELS.find(l => l.id === levelId) || LOYALTY_LEVELS[0];
  return Math.floor((totalSpent / 1000) * meta.pointsMultiplier);
}

export function aggregateOrdersForUser(
  orders: { USERID?: string; STATUS?: string; TOTAL?: number; CREATEDAT?: number; $createdAt?: string }[],
  userId: string,
): OrderStats {
  const stats = emptyOrderStats();
  const mine = orders.filter(o => o.USERID === userId);
  stats.total = mine.length;

  let lastTs = 0;
  let firstTs = Infinity;

  for (const o of mine) {
    const status = (o.STATUS || 'pending').toLowerCase();
    const total = Number(o.TOTAL) || 0;
    stats.revenueAll += total;

    switch (status) {
      case 'pending':
      case 'verification_pending':
        stats.pending += 1;
        break;
      case 'paid':
      case 'payment_confirmed':
        stats.paid += 1;
        break;
      case 'processing':
      case 'negotiation':
        stats.processing += 1;
        break;
      case 'shipped':
        stats.shipped += 1;
        break;
      case 'delivered':
        stats.delivered += 1;
        break;
      case 'cancelled':
        stats.cancelled += 1;
        break;
      default:
        stats.pending += 1;
        break;
    }

    const isPaidStatus = ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'].includes(status);
    if (isPaidStatus) {
      stats.revenuePaid += total;
    }

    const ts = o.CREATEDAT || (o.$createdAt ? new Date(o.$createdAt).getTime() : 0);
    if (ts > 0) {
      if (ts > lastTs) lastTs = ts;
      if (ts < firstTs) firstTs = ts;
    }
  }

  if (lastTs > 0) stats.lastOrderAt = new Date(lastTs).toISOString();
  if (firstTs < Infinity) stats.firstOrderAt = new Date(firstTs).toISOString();

  return stats;
}

export function pickPrefs(raw: unknown): AdminCustomerPrefs {
  if (!raw || typeof raw !== 'object') return {};
  const p = raw as Record<string, unknown>;
  const out: AdminCustomerPrefs = {};
  const keys = [
    'loyaltyLevel', 'welcomeGiftClaimed', 'welcomeCouponCode', 'autoApplyCoupon',
    'rut', 'phone', 'region', 'comuna', 'address', 'avatarFileId', 'coverFileId',
    'levelHistory', 'pointsAdjustment',
  ];
  for (const k of keys) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== '') out[k] = p[k];
  }
  return out;
}
