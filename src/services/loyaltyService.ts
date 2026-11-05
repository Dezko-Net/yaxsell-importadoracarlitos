import { getServices, getFirebaseConfig, ORDERS_COLLECTION, COUPONS_COLLECTION, formatPrice, ID } from '@/lib/db';
import { Query } from '@/lib/db';

const WHOLESALE_ORDERS_COLLECTION = 'wholesale_orders';

interface LoyaltyData {
  userId: string;
  currentLevel: string;
  paidOrdersCount: number;
  totalSpent: number;
  points: number;
  levelHistory: LevelUpgrade[];
}

interface LevelUpgrade {
  level: string;
  upgradedAt: number;
  couponGenerated: boolean;
  couponCode?: string;
}

const LEVELS = [
  { id: 'bronze', name: 'Bronce', requiredOrders: 0, pointsMultiplier: 1 },
  { id: 'silver', name: 'Plata', requiredOrders: 5, pointsMultiplier: 1.5 },
  { id: 'gold', name: 'Oro', requiredOrders: 10, pointsMultiplier: 2 },
  { id: 'diamond', name: 'Diamante', requiredOrders: 20, pointsMultiplier: 3 },
  { id: 'ruby', name: 'Ruby', requiredOrders: 30, pointsMultiplier: 5 },
];

const COUPON_CONFIG = {
  silver: { percent: 3, minOrder: 50000, stackable: true },
  gold: { percent: 5, minOrder: 100000, stackable: false },
  diamond: { percent: 10, minOrder: 80000, stackable: false },
  ruby: { percent: 10, minOrder: 100000, stackable: false, monthly: true },
};

export class LoyaltyService {
  // Obtener datos de lealtad del usuario
  static async getLoyaltyData(userId: string): Promise<LoyaltyData> {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Contar pedidos pagados (cualquier estado posterior a pendiente/verificación)
      const paidStatuses = ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'];
      const [ordersRes, wholesaleRes] = await Promise.all([
        databases.listDocuments(databaseId, ORDERS_COLLECTION, [
          Query.equal('USERID', userId),
          Query.equal('STATUS', paidStatuses),
          Query.limit(500),
        ]).catch(() => ({ total: 0, documents: [] })),
        databases.listDocuments(databaseId, WHOLESALE_ORDERS_COLLECTION, [
          Query.equal('USERID', userId),
          Query.equal('STATUS', paidStatuses),
          Query.limit(500),
        ]).catch(() => ({ total: 0, documents: [] })),
      ]);

      const paidOrdersCount = ordersRes.total + wholesaleRes.total;
      const totalSpent = [
        ...ordersRes.documents,
        ...wholesaleRes.documents,
      ].reduce((sum: number, order: any) => sum + (order.TOTAL || 0), 0);

      // Obtener nivel actual desde prefs
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as any).prefs || {};
      // Nivel solo por pedidos pagados (no se puede “elegir” medalla manualmente)
      let calculatedLevel = 'bronze';
      for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (paidOrdersCount >= LEVELS[i].requiredOrders) {
          calculatedLevel = LEVELS[i].id;
          break;
        }
      }

      const currentLevel = calculatedLevel;

      if (prefs.loyaltyLevel && prefs.loyaltyLevel !== calculatedLevel) {
        try {
          await account.updatePrefs({ ...prefs, loyaltyLevel: calculatedLevel });
        } catch {
          /* prefs sync opcional */
        }
      }

      // Calcular puntos
      const levelIndex = LEVELS.findIndex(l => l.id === currentLevel);
      const pointsMultiplier = LEVELS[levelIndex >= 0 ? levelIndex : 0].pointsMultiplier;
      const basePoints = Math.floor((totalSpent / 1000) * pointsMultiplier);
      const pointsAdjustment = Number(prefs.pointsAdjustment || 0);
      const points = Math.max(0, basePoints + pointsAdjustment);

      // Obtener historial de niveles
      const levelHistory: LevelUpgrade[] = prefs.levelHistory || [];

      return {
        userId,
        currentLevel,
        paidOrdersCount,
        totalSpent,
        points,
        levelHistory,
      };
    } catch (error) {
      console.error('Error getting loyalty data:', error);
      return {
        userId,
        currentLevel: 'bronze',
        paidOrdersCount: 0,
        totalSpent: 0,
        points: 0,
        levelHistory: [],
      };
    }
  }

  // Calcular puntos ganados en una compra
  static calculatePointsEarned(total: number, currentLevel: string): number {
    const level = LEVELS.find(l => l.id === currentLevel);
    const multiplier = level?.pointsMultiplier || 1;
    return Math.floor((total / 1000) * multiplier);
  }

  // Verificar si el usuario debe subir de nivel
  static async checkLevelUpgrade(userId: string, paidOrdersCount: number): Promise<{ shouldUpgrade: boolean; newLevel?: string }> {
    const loyaltyData = await this.getLoyaltyData(userId);
    const currentIndex = LEVELS.findIndex(l => l.id === loyaltyData.currentLevel);

    if (currentIndex >= LEVELS.length - 1) {
      return { shouldUpgrade: false };
    }

    const nextLevel = LEVELS[currentIndex + 1];
    if (paidOrdersCount >= nextLevel.requiredOrders && loyaltyData.currentLevel !== nextLevel.id) {
      return { shouldUpgrade: true, newLevel: nextLevel.id };
    }

    return { shouldUpgrade: false };
  }

  // Generar cupón de bienvenida (primer registro)
  static async generateWelcomeCoupon(userId: string, type: 'order_2' | 'product_5' | 'welcome_20'): Promise<{ success: boolean; couponCode?: string; error?: string }> {
    try {
      const { databases, account } = getServices();
      const { databaseId } = getFirebaseConfig();

      const percent = type === 'welcome_20' ? 20 : type === 'order_2' ? 2 : 5;
      const description = type === 'welcome_20' 
        ? 'Cupón de bienvenida: 20% de descuento por tiempo limitado'
        : type === 'order_2' 
        ? 'Cupón de bienvenida: 2% de descuento en tu primer pedido' 
        : 'Cupón de bienvenida: 5% de descuento en tu producto favorito';

      // Generar código único
      const couponCode = `WELCOME-${type === 'welcome_20' ? '20' : type.toUpperCase()}-${userId.slice(0, 4)}-${Date.now().toString(36).toUpperCase()}`;

      // Crear cupón
      await databases.createDocument(databaseId, COUPONS_COLLECTION, ID.unique(), {
        code: couponCode,
        type: 'percent',
        value: percent,
        minPurchase: 0,
        maxUses: 1,
        usedCount: 0,
        isActive: true,
        expiresAt: Math.floor((Date.now() + 15 * 24 * 60 * 60 * 1000) / 1000), // 15 días para usarlo
        userRestriction: userId,
        description,
      });

      // Guardar en prefs para marcar que ya recibió el regalo
      const acc = await account.get();
      const prefs = (acc as any).prefs || {};
      
      await account.updatePrefs({
        ...prefs,
        welcomeGiftClaimed: true,
        welcomeCouponCode: couponCode,
      });

      return { success: true, couponCode };
    } catch (error: any) {
      console.error('Error generating welcome coupon:', error);
      return { success: false, error: error.message || 'Error al generar cupón de bienvenida' };
    }
  }

  // Generar cupón al subir de nivel
  static async generateLevelUpCoupon(userId: string, newLevel: string): Promise<{ success: boolean; couponCode?: string; error?: string }> {
    try {
      const { databases, account } = getServices();
      const { databaseId } = getFirebaseConfig();

      const config = COUPON_CONFIG[newLevel as keyof typeof COUPON_CONFIG];
      if (!config) {
        return { success: false, error: 'Nivel no válido para cupón' };
      }

      // Generar código único
      const couponCode = `LEVEL-${newLevel.toUpperCase()}-${userId.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;

      // Crear cupón
      await databases.createDocument(databaseId, COUPONS_COLLECTION, ID.unique(), {
        code: couponCode,
        type: 'percent',
        value: config.percent,
        minPurchase: config.minOrder,
        maxUses: 1,
        usedCount: 0,
        isActive: true,
        expiresAt: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 días
        userRestriction: userId,
        description: `Cupón de bienvenida por subir a nivel ${newLevel.toUpperCase()}`,
      });

      // Guardar en prefs
      const acc = await account.get();
      const prefs = (acc as any).prefs || {};
      const levelHistory = prefs.levelHistory || [];
      
      await account.updatePrefs({
        ...prefs,
        [`coupon_${newLevel}`]: couponCode,
        loyaltyLevel: newLevel,
        levelHistory: [
          ...levelHistory,
          {
            level: newLevel,
            upgradedAt: Date.now(),
            couponGenerated: true,
            couponCode,
          },
        ],
      });

      return { success: true, couponCode };
    } catch (error: any) {
      console.error('Error generating coupon:', error);
      return { success: false, error: error.message || 'Error al generar cupón' };
    }
  }

  // Procesar compra y actualizar puntos/verificar nivel
  static async processOrder(orderId: string, userId: string, total: number): Promise<{ pointsEarned: number; levelUpgraded?: boolean; couponCode?: string }> {
    try {
      const loyaltyData = await this.getLoyaltyData(userId);
      const pointsEarned = this.calculatePointsEarned(total, loyaltyData.currentLevel);

      // Verificar si subió de nivel
      const { shouldUpgrade, newLevel } = await this.checkLevelUpgrade(userId, loyaltyData.paidOrdersCount + 1);

      let levelUpgraded = false;
      let couponCode;

      if (shouldUpgrade && newLevel) {
        const result = await this.generateLevelUpCoupon(userId, newLevel);
        if (result.success) {
          levelUpgraded = true;
          couponCode = result.couponCode;
        }
      }

      return { pointsEarned, levelUpgraded, couponCode };
    } catch (error) {
      console.error('Error processing order:', error);
      return { pointsEarned: 0 };
    }
  }

  // Canjear puntos por descuento
  static async redeemPoints(userId: string, pointsToRedeem: number): Promise<{ success: boolean; discount?: number; error?: string }> {
    try {
      const loyaltyData = await this.getLoyaltyData(userId);

      if (loyaltyData.points < pointsToRedeem) {
        return { success: false, error: 'Puntos insuficientes' };
      }

      // 100 puntos = $1.000 de descuento
      const discount = pointsToRedeem * 10;

      // Actualizar puntos en prefs
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as any).prefs || {};
      
      await account.updatePrefs({
        ...prefs,
        loyaltyPoints: loyaltyData.points - pointsToRedeem,
      });

      return { success: true, discount };
    } catch (error: any) {
      console.error('Error redeeming points:', error);
      return { success: false, error: error.message || 'Error al canjear puntos' };
    }
  }

  // Obtener historial de cupones generados por nivel
  static async getCouponHistory(userId: string): Promise<LevelUpgrade[]> {
    try {
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as any).prefs || {};
      return prefs.levelHistory || [];
    } catch (error) {
      return [];
    }
  }
}
