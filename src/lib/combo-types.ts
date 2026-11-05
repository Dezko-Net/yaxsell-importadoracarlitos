export interface ComboItemConfig {
  id: string;
  title: string;
  subtitle?: string;
  discountPercent?: number;
  pricingMode?: 'percent' | 'fixed';
  fixedPrice?: number;
  badge?: string;
  isActive: boolean;
  mainProductId: string;
  bundleProductIds: string[];
}

export const MAX_COMBO_PRODUCTS = 10;

