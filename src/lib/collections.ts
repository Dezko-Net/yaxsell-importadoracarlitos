// Constantes de colecciones — separadas de db.ts para evitar cargar el SDK cliente
// en código que solo necesita los nombres de las colecciones
export const PRODUCTS_COLLECTION                  = 'products';
export const INVENTORY_PRODUCTS_COLLECTION        = 'inventory_products';
export const CATALOG_PRODUCTS_COLLECTION          = 'catalog_products';
export const CATEGORIES_COLLECTION                = 'categories';
export const BANNERS_COLLECTION                   = 'banners';
export const TIMED_OFFERS_COLLECTION              = 'timed_offers';
export const LIVE_STREAMS_COLLECTION              = 'live_streams';
export const BANNER_OVERLAY_POSITIONS_COLLECTION  = 'banner_overlay_positions';
export const HOTSPOT_PANELS_COLLECTION            = 'hotspot_panels';
export const SUBCATEGORIES_COLLECTION             = 'subcategories';
export const REVIEWS_COLLECTION                   = 'reviews';
export const PRODUCT_QUESTIONS_COLLECTION         = 'product_questions';
export const CLIPS_COLLECTION                     = 'clips';
export const FAVORITES_COLLECTION                 = 'favorites';
export const RAFFLES_COLLECTION                   = 'live_raffles';
export const RAFFLE_PARTICIPANTS_COLLECTION       = 'raffle_participants';
export const STOCK_ALERTS_COLLECTION              = 'stock_alerts';
export const STOCK_REQUESTS_COLLECTION            = 'stock_requests';
export const NOTIFICATIONS_COLLECTION             = 'notifications';
export const THEME_CONFIG_COLLECTION              = 'theme_config';
export const APERTURA_SETTINGS_COLLECTION         = 'apertura_settings';
export const PRODUCT_VIEWS_COLLECTION             = 'product_views';
export const PRODUCT_VOTES_COLLECTION             = 'product_votes';
export const ORDERS_COLLECTION                    = 'orders';
export const WHOLESALE_ORDERS_COLLECTION          = 'wholesale_orders';
export const VENDOR_ORDERS_COLLECTION             = 'vendor_orders';
export const VENDORS_COLLECTION                   = 'vendors';
export const USERS_COLLECTION                     = 'users';
export const ADMIN_CHAT_COLLECTION                = 'admin_chat';
export const COUPONS_COLLECTION                   = 'coupons';
export const ADDRESSES_COLLECTION                 = 'addresses';
export const SEQUENCES_COLLECTION                 = 'sequences';
export const POINTS_STORE_COLLECTION              = 'points_store_items';
export const STORE_SETTINGS_COLLECTION            = 'store_settings';

export const PRODUCTS_COLLECTION_ID = PRODUCTS_COLLECTION;
export const CATEGORIES_COLLECTION_ID = CATEGORIES_COLLECTION;
export const SUBCATEGORIES_COLLECTION_ID = SUBCATEGORIES_COLLECTION;
export const ORDERS_COLLECTION_ID = ORDERS_COLLECTION;
export const VENDOR_ORDERS_COLLECTION_ID = VENDOR_ORDERS_COLLECTION;
export const APERTURA_SETTINGS_COLLECTION_ID = APERTURA_SETTINGS_COLLECTION;
export const STORE_SETTINGS_COLLECTION_ID = STORE_SETTINGS_COLLECTION;
export const COUPONS_COLLECTION_ID = COUPONS_COLLECTION;
export const VENDORS_COLLECTION_ID = VENDORS_COLLECTION;
export const POINTS_STORE_COLLECTION_ID = POINTS_STORE_COLLECTION;
export const WHOLESALE_ORDERS_COLLECTION_ID = WHOLESALE_ORDERS_COLLECTION;
export const DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)';

export const MEDIA_BUCKET_ID = 'media';
export const ORDER_BOX_PHOTOS_BUCKET_ID = 'order_box_photos';
export const MEDIA_PREFIXES = {
  products:     'carlitos/productos/',
  banners:      'carlitos/banners/',
  categories:   'carlitos/categorias/',
  comprobantes: 'comprobantes/carlitos/',
  thumbnails:   'carlitos/thumbnails/',
  chat:         'carlitos/chat/',
} as const;
export type MediaPrefix = keyof typeof MEDIA_PREFIXES;
