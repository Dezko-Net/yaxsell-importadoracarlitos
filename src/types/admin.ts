export type OrderStatus = 'pending' | 'pending_stock' | 'processing' | 'paid' | 'payment_expired' | 'payment_review' | 'payment_confirmed' | 'negotiation' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  imageUrl?: string;
}

export interface Order {
  $id: string;
  USERID: string;
  ORDERCODE: string;
  CUSTOMERNAME: string;
  CUSTOMEREMAIL?: string;
  CUSTOMERRUT?: string;
  CUSTOMERPHONE?: string;
  REGION?: string;
  COMUNA?: string;
  ADDRESS?: string;
  ADDITIONALINFO?: string;
  ADDRESSPHOTOURL?: string;
  PAYMENTMETHOD?: string;
  SHIPPINGAGENCY?: string;
  SHIPPINGADDRESS?: string;
  SUBTOTAL: number;
  SHIPPINGCOST: number;
  TOTAL: number;
  STATUS: OrderStatus;
  ITEMS: string;
  CREATEDAT: number;
  UPDATEDAT?: number;
  EXPIRESAT?: number;
  EXPIRESATBACKEND?: number;
  PAYMENTEXPIREDAT?: number;
  AUTOCANCELAT?: number;
  EXPIRATIONWINDOWMINUTES?: number;
  STOCKDEDUCTED?: boolean;
  PAYMENTPROOFURL?: string;
  SHIPPINGPROOFURL?: string;
  ORDERTYPE?: string;
  PURCHASEDFROMLIVE?: boolean;
  COUPONCODE?: string;
  DISCOUNTAMOUNT?: number;
  AGENCYCHANGED?: boolean;
  TRACKINGNUMBER?: string;
  BOXPHOTOS?: string; // JSON array de URLs de fotos de las cajas antes de despachar
  adminNotes?: string;
  ASSIGNEDCASHIER?: string;
  IS_VENDOR_ORDER?: boolean;
  VENDOR_ID?: string;
  VENDOR_NAME?: string;
  VENDOR_ORDER_CODE?: string;
  BANK_DETAILS?: any;
  VENDOR_BANK_HOLDER?: string;
  VENDOR_BANK_RUT?: string;
  VENDOR_BANK_NAME?: string;
  VENDOR_BANK_ACCOUNT?: string;
  VENDOR_BANK_TYPE?: string;
  VENDOR_BANK_EMAIL?: string;
  VENDOR_BRANDING?: any;
  $createdAt: string;
  $updatedAt: string;
}

export interface Product {
  $id: string;
  NAME: string;
  DESCRIPTION?: string;
  PRICE: number;
  CURRENTPRICE?: number;
  COST?: number;
  PROMO_QTY?: number;
  PROMO_PRICE?: number;
  WHOLESALEPRICE?: number;
  CATALOGPRICE?: number;
  WHOLESALEMINQUANTITY?: number;
  INTERMEDIATEPRICE?: number;
  BOXPRICE?: number;
  BOXQTY?: number;
  PACKQTY?: number;
  EMBALAJEQTY?: number;
  PACKPRICE?: number;
  EMBALAJEPRICE?: number;
  PACK_MIN_PACKS?: number;
  PACK_DISCOUNT_PCT?: number;
  PACK_OFFER_PRICE?: number;
  PACK_OFFER_EXPIRES_AT?: number;
  PACK_OFFER_MIN_PACKS?: number;
  UNIT_OFFER_EXPIRES_AT?: number;
  PACK_STOCK?: number;
  STOCK: number;
  CATEGORYID?: string;
  SUBCATEGORYID?: string;
  SUBSUBCATEGORYID?: string;
  SELLERID?: string;
  IMAGEURL?: string;
  IMAGEURL2?: string;
  IMAGEURL3?: string;
  IMAGEURL4?: string;
  IMAGEURL5?: string;
  VIDEOURL?: string;
  PRODUCT_VIDEO_URL?: string;
  RATING?: number;
  NUMREVIEWS?: number;
  SOLDQUANTITY?: number;
  TAGS?: string;
  FEATURES?: string;
  BRAND?: string;
  QUANTITY?: string;
  SUPPLIER?: string;
  PACKAGE_QTY?: string;
  BOX_CODE?: string;
  ISFEATURED?: boolean;
  ISACTIVE?: boolean;
  GROUPID?: string;
  RESTOCKTHRESHOLD?: number;
  CUSTOM_PRIMARY_COLOR?: string;
  CUSTOM_SECONDARY_COLOR?: string;
  CUSTOM_USE_GRADIENT?: boolean;
  CUSTOM_COVER_URL?: string;
  jumpseller_id?: string;
  barcode?: string;
  BARCODE?: string;
  sku?: string;
  SKU?: string;
  COMING_SOON?: boolean;
  DATE_ADDED?: string;
  section?: number;
  DISABLE_DISCOUNTS?: boolean;
  $createdAt: string;
  $updatedAt: string;
}

export interface Category {
  $id: string;
  name: string;
  iconUrl?: string;
  order?: number;
  color?: string;
  BACKGROUND_IMAGE_URL?: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface Subcategory {
  $id: string;
  name: string;
  categoryId: string;
  parentSubcategoryId?: string;
  order?: number;
  ICON_URL?: string;
  BACKGROUND_IMAGE_URL?: string;
  ZOOM_BACKGROUND_IMAGE_URL?: string;
  COLOR?: string;
  description?: string;
  ORDER?: number;
  $createdAt: string;
  $updatedAt: string;
}

export interface Banner {
  $id: string;
  TITLE?: string;
  DESCRIPTION?: string;
  IMAGEURL: string;
  LINKURL?: string;
  DURATION?: number;
  ISACTIVE?: boolean;
  DISPLAYORDER?: number;
  CLICKS?: number;
  VIEWS?: number;
  $createdAt: string;
  $updatedAt: string;
}

export interface TimedOffer {
  $id: string;
  title: string;
  offerType: 'product' | 'category' | 'subcategory' | 'destacado_temporal';
  targetId: string;
  productName: string;
  originalPrice: number;
  discountPrice: number;
  discountPercentage: number;
  customImagePath: string;
  timeType: 'duration' | 'endDateTime';
  durationHours?: number;
  endDateTime?: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
  activatedAt?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface SupportTicket {
  $id: string;
  userId: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  priority?: 'low' | 'medium' | 'high';
  adminNotes?: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface StockMovement {
  $id: string;
  productId: string;
  productName?: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason?: string;
  $createdAt: string;
}

export interface DashboardStats {
  totalProducts: number;
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  lowStockCount: number;
  todayOrders: number;
  avgTicket: number;
  avgDailyRevenue: number;
}
