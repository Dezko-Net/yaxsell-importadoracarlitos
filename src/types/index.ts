export type SedeSlug = 'donbalato-central' | 'don-balato-b' | (string & {});

export const SEDES: Record<string, string> = {
  'donbalato-central': 'Importadora Carlitos A',
  'don-balato-b': 'Importadora Carlitos B',
};

export const DEFAULT_SEDE: SedeSlug = 'donbalato-central';
export const SEDE_SLUGS: SedeSlug[] = ['donbalato-central', 'don-balato-b'];

export interface Product {
  $id: string;
  NAME: string;
  DESCRIPTION: string;
  PRICE: number;
  CURRENTPRICE?: number;
  CATEGORYID: string;
  SUBCATEGORYID?: string;
  SUBSUBCATEGORYID?: string; // Nivel 3
  SELLERID: string;
  /** Marketplace: si viene seteado, el producto es de un vendor externo (no propio) */
  VENDOR_ID?: string;
  VENDOR_NAME?: string;
  VENDOR_IS_MAIN?: boolean;
  STOCK: number;
  IMAGEURL: string;
  IMAGEURL2?: string;
  IMAGEURL3?: string;
  IMAGEURL4?: string;
  IMAGEURL5?: string;
  RATING?: number;
  NUMREVIEWS?: number;
  WHOLESALEPRICE?: number;
  WHOLESALEMINQUANTITY?: number;
  /** Precio intermedio (6-11 un. con packQty 12): puente entre detalle y mayor */
  INTERMEDIATEPRICE?: number;
  /** Precio por caja (2+ paquetes): el más bajo de todos */
  BOXPRICE?: number;
  /** Cantidad mínima para precio caja (si no se define, usa PACKQTY × 2) */
  BOXQTY?: number;
  PACKQTY?: number;
  PACK_MIN_PACKS?: number;
  PACK_DISCOUNT_PCT?: number;
  PACK_OFFER_PRICE?: number;
  PACK_OFFER_EXPIRES_AT?: number;
  PACK_OFFER_MIN_PACKS?: number;
  UNIT_OFFER_EXPIRES_AT?: number;
  PACK_STOCK?: number;
  BRAND?: string;
  QUANTITY?: string;
  EMBALAJEQTY?: number;
  SUPPLIER?: string;
  PACKAGE_QTY?: string;
  BOX_CODE?: string;
  TAGS?: string[];
  FEATURES?: string[];
  SOLDQUANTITY?: number;
  ISACTIVE?: boolean;
  SKU?: string;
  sku?: string;
  BARCODE?: string;
  barcode?: string;
  GROUPID?: string;
  COMING_SOON?: boolean;
  DATE_ADDED?: string;
  section?: number;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface Review {
  $id: string;
  PRODUCTID: string;
  USERID: string;
  USERNAME: string;
  USERPROFILEIMAGEURL?: string;
  RATING: number;
  COMMENT: string;
  CREATEDAT: number;
  REVIEWDATE: number;
  ISEDITED?: boolean;
}

export interface Category {
  $id: string;
  name: string;
  iconUrl?: string;
  order?: number;
}

export interface Subcategory {
  $id: string;
  name: string;
  categoryId: string;
  parentSubcategoryId?: string; // Nivel 3 (si está definido, es hija de otra subcategoría)
  order?: number;
  ICON_URL?: string;
  BACKGROUND_IMAGE_URL?: string;
  ZOOM_BACKGROUND_IMAGE_URL?: string;
  iconName?: string;
  ORDER?: number;
  COLOR?: string;
  description?: string;
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
  $createdAt: string;
  $updatedAt: string;
}

export interface Coupon {
  $id: string;
  code: string;
  type: 'percentage' | 'percent' | 'fixed';
  value: number;
  isActive: boolean;
  maxUses?: number;
  usedCount?: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  expiresAt?: number;
  description?: string;
}

export type OrderStatus = 'pending' | 'pending_stock' | 'processing' | 'paid' | 'payment_expired' | 'payment_review' | 'payment_confirmed' | 'negotiation' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  qty: number;
  img: string;
  total: number;
  wp?: number;
  wmq?: number;
  timedOfferPrice?: number;
  timedOfferExpiresAt?: string;
  sku?: string;
  missing?: boolean;
  replaced?: boolean;
  originalItem?: {
    id: string;
    name: string;
    price: number;
    img: string;
    sku: string;
  };
}

export interface Order {
  $id: string;
  USERID: string;
  ITEMS: string;
  SHIPPINGADDRESS: string;
  CUSTOMERNAME: string;
  CUSTOMERRUT: string;
  CUSTOMERPHONE: string;
  CUSTOMEREMAIL: string;
  REGION: string;
  COMUNA: string;
  ADDRESS: string;
  ADDITIONALINFO?: string;
  PAYMENTMETHOD: string;
  SHIPPINGAGENCY: string;
  SUBTOTAL: number;
  SHIPPINGCOST: number;
  TOTAL: number;
  ORDERCODE: string;
  ORDERINDEX: number;
  STATUS: OrderStatus;
  CREATEDAT: number;
  UPDATEDAT?: number;
  EXPIRESAT?: number;
  EXPIRESATBACKEND?: number;
  PAYMENTEXPIREDAT?: number;
  AUTOCANCELAT?: number;
  AUTOCANCELENABLED?: boolean;
  PAYMENTPROOFURL?: string;
  SHIPPINGPROOFURL?: string;
  PROOFURL?: string;
  ORDERTYPE?: string;
  EXTENSIONCOUNT?: number;
  DISCOUNT?: number;
  COUPONCODE?: string;
  AGENCYCHANGED?: boolean;
  /**
   * Cantidad de cambios hechos por el cliente (edición/cancelación) en /pedido/[id].
   * Se usa para limitar a máximo 2 cambios.
   */
  CUSTOMEREDITCOUNT?: number;
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
}

export interface Raffle {
  $id: string;
  TITLE: string;
  DESCRIPTION?: string;
  PRIZE: string;
  PRIZEIMAGEURL?: string;
  LIVESTREAMID?: string;
  STATUS: 'upcoming' | 'active' | 'drawing' | 'completed';
  PARTICIPANTS: string[];
  WINNERID?: string;
  WINNERNAME?: string;
  MAXPARTICIPANTS?: number;
  STARTSAT?: number;
  ENDSAT?: number;
  CREATEDAT: number;
}

export interface Clip {
  $id: string;
  TITLE: string;
  DESCRIPTION?: string;
  VIDEOURL: string;
  THUMBNAILURL?: string;
  PRODUCTID?: string;
  PRODUCTNAME?: string;
  PRODUCTPRICE?: number;
  PRODUCTIMAGEURL?: string;
  USERID?: string;
  USERNAME?: string;
  LIKES?: number;
  VIEWS?: number;
  ISACTIVE?: boolean;
  CREATEDAT: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  timedOfferPrice?: number;
  timedOfferExpiresAt?: number;
  wholesalePrice?: number;
  isPack?: boolean;
  bundlePackQty?: number;
  bundlePackPrice?: number;
  /** Identifica una línea que pertenece a un pack e-commerce. */
  bundleId?: string;
  /** Agrupa los componentes de una instancia concreta del pack en el carrito. */
  bundleInstanceId?: string;
  bundleTitle?: string;
  bundleUnitPrice?: number;
  bundleOriginalUnitPrice?: number;
}

export interface LiveStream {
  $id: string;
  $createdAt: string;
  title: string;
  description?: string;
  url: string;
  platform: 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'twitch' | string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled' | 'error';
  isActive: boolean;
  thumbnailUrl?: string;
  bannerUrl?: string;
  viewerCount?: number;
  // Scheduling
  scheduledAt?: string;
  startAt?: string;
  endAt?: string;
  // Player config
  autoplay?: boolean;
  muted?: boolean;
  showText?: boolean;
  allowFullscreen?: boolean;
  // Live Shopping
  productIds?: string[];
  pinnedProductId?: string;
  isRotationEnabled?: boolean;
  rotationInterval?: number;
  defaultDiscount?: number;
  // Error tracking
  errorMessage?: string;
  createdBy?: string;
}

export interface HotspotPanel {
  $id: string;
  IMAGEURL: string;
  TITLE?: string;
  LINKURL?: string;
  MOSAICGROUP: string;
  CELLINDEX: number;
  ISACTIVE: boolean;
  DISPLAYORDER: number;
}

export interface BannerOverlayPosition {
  $id: string;
  BANNERID: string;
  PRODUCTID: string;
  POSITIONX: number;
  POSITIONY: number;
  SCALE: number;
  CIRCLESCALE: number;
  DISPLAYTYPE: 'default' | 'custom_image' | 'circle_only';
  CUSTOMIMAGEURL?: string;
  CIRCLECOLOR?: string;
  ISACTIVE: boolean;
  DISPLAYORDER: number;
  CLICKS: number;
}

export interface HouseProductPosition {
  $id: string;
  PRODUCTID: string;
  CATEGORYID: string;
  POSITIONX: number;
  POSITIONY: number;
  ISACTIVE: boolean;
  DISPLAYORDER: number;
  SCALE: number;
  CIRCLESCALE: number;
  CUSTOMIMAGEURL?: string;
  DISPLAYTYPE: 'default' | 'custom_image' | 'circle_only';
  CIRCLECOLOR?: string;
  BACKGROUND: string;
}

export interface ProductVote {
  $id: string;
  PRODUCTTITLE: string;
  USERID?: string;
  USERNAME?: string;
  USEREMAIL?: string;
  CREATEDAT: number;
  IPADDRESS?: string;
}

export const CHILE_REGIONES: Record<string, string[]> = {
  'Arica y Parinacota': ['Arica', 'Camarones', 'Putre', 'General Lagos'],
  'Tarapacá': ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'],
  'Antofagasta': ['Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama', 'Ollagüe', 'San Pedro de Atacama', 'Tocopilla', 'María Elena'],
  'Atacama': ['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen', 'Freirina', 'Huasco'],
  'Coquimbo': ['La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paihuano', 'Vicuña', 'Illapel', 'Canela', 'Los Vilos', 'Salamanca', 'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado'],
  'Valparaíso': ['Algarrobo', 'Cabildo', 'Calle Larga', 'Cartagena', 'Casablanca', 'Catemu', 'Concón', 'El Quisco', 'El Tabo', 'Hijuelas', 'Isla de Pascua', 'Juan Fernández', 'La Calera', 'La Cruz', 'La Ligua', 'Limache', 'Llaillay', 'Los Andes', 'Nogales', 'Olmué', 'Panquehue', 'Papudo', 'Petorca', 'Puchuncaví', 'Putaendo', 'Quillota', 'Quilpué', 'Quintero', 'Rinconada', 'San Antonio', 'San Esteban', 'San Felipe', 'Santa María', 'Santo Domingo', 'Valparaíso', 'Villa Alemana', 'Viña del Mar', 'Zapallar'],
  'Metropolitana de Santiago': ['Alhué', 'Buin', 'Calera de Tango', 'Cerrillos', 'Cerro Navia', 'Colina', 'Conchalí', 'Curacaví', 'El Bosque', 'El Monte', 'Estación Central', 'Huechuraba', 'Independencia', 'Isla de Maipo', 'La Cisterna', 'La Florida', 'La Granja', 'Lampa', 'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'María Pinto', 'Melipilla', 'Ñuñoa', 'Padre Hurtado', 'Paine', 'Pedro Aguirre Cerda', 'Peñaflor', 'Peñalolén', 'Pirque', 'Providencia', 'Pudahuel', 'Puente Alto', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Bernardo', 'San Joaquín', 'San José de Maipo', 'San Miguel', 'San Pedro', 'San Ramón', 'Santiago', 'Talagante', 'Tiltil', 'Vitacura', 'Santiago Centro'],
  'Libertador Gral. B. O\'Higgins': ['Chépica', 'Chimbarongo', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'La Estrella', 'Las Cabras', 'Litueche', 'Lolol', 'Machalí', 'Malloa', 'Marchihue', 'Mostazal', 'Nancagua', 'Navidad', 'Olivar', 'Palmilla', 'Paredones', 'Peralillo', 'Peumo', 'Pichidegua', 'Pichilemu', 'Placilla', 'Pumanque', 'Quinta de Tilcoco', 'Rancagua', 'Rengo', 'Requínoa', 'San Fernando', 'Santa Cruz', 'San Vicente'],
  'Maule': ['Cauquenes', 'Chanco', 'Colbún', 'Constitución', 'Curepto', 'Curicó', 'Empedrado', 'Hualañé', 'Licantén', 'Linares', 'Longaví', 'Maule', 'Molina', 'Parral', 'Pelarco', 'Pelluhue', 'Pencahue', 'Rauco', 'Retiro', 'Río Claro', 'Romeral', 'Sagrada Familia', 'San Clemente', 'San Javier', 'San Rafael', 'Talca', 'Teno', 'Vichuquén', 'Villa Alegre', 'Yerbas Buenas'],
  'Ñuble': ['Bulnes', 'Chillán', 'Chillán Viejo', 'Cobquecura', 'Coelemu', 'Coihueco', 'El Carmen', 'Ninhue', 'Ñiquén', 'Pemuco', 'Pinto', 'Portezuelo', 'Quillón', 'Quirihue', 'Ránquil', 'San Carlos', 'San Fabián', 'San Ignacio', 'San Nicolás', 'Treguaco', 'Yungay'],
  'Biobío': ['Alto Biobío', 'Antuco', 'Arauco', 'Cabrero', 'Cañete', 'Chiguayante', 'Concepción', 'Contulmo', 'Coronel', 'Curanilahue', 'Florida', 'Hualpén', 'Hualqui', 'Laja', 'Lebu', 'Los Álamos', 'Los Ángeles', 'Lota', 'Mulchén', 'Nacimiento', 'Negrete', 'Penco', 'Quilaco', 'Quilleco', 'San Pedro de la Paz', 'San Rosendo', 'Santa Bárbara', 'Santa Juana', 'Talcahuano', 'Tirúa', 'Tomé', 'Tucapel', 'Yumbel'],
  'La Araucanía': ['Angol', 'Carahue', 'Cholchol', 'Collipulli', 'Cunco', 'Curacautín', 'Curarrehue', 'Ercilla', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche', 'Lonquimay', 'Los Sauces', 'Lumaco', 'Melipeuco', 'Nueva Imperial', 'Padre Las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Purén', 'Renaico', 'Saavedra', 'Temuco', 'Teodoro Schmidt', 'Toltén', 'Traiguén', 'Victoria', 'Vilcún', 'Villarrica'],
  'Los Ríos': ['Corral', 'Futrono', 'Lago Ranco', 'Lanco', 'La Unión', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli', 'Río Bueno', 'Valdivia'],
  'Los Lagos': ['Ancud', 'Calbuco', 'Castro', 'Chaitén', 'Chonchi', 'Cochamó', 'Curaco de Vélez', 'Dalcahue', 'Fresia', 'Frutillar', 'Futaleufú', 'Hualaihué', 'Llanquihue', 'Los Muermos', 'Maullín', 'Osorno', 'Palena', 'Puerto Montt', 'Puerto Octay', 'Puerto Varas', 'Puqueldón', 'Purranque', 'Puyehue', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao', 'Río Negro', 'San Juan de la Costa', 'San Pablo'],
  'Aysén': ['Aysén', 'Chile Chico', 'Cisnes', 'Cochrane', 'Coyhaique', 'Guaitecas', 'Lago Verde', 'O\'Higgins', 'Río Ibáñez', 'Tortel'],
  'Magallanes': ['Antártica', 'Cabo de Hornos', 'Laguna Blanca', 'Natales', 'Porvenir', 'Primavera', 'Punta Arenas', 'Río Verde', 'San Gregorio', 'Timaukel', 'Torres del Paine'],
};

export const SHIPPING_AGENCIES = [
  'Chilexpress',
  'Starken',
  'Correos de Chile',
  'Blue Express',
  'DHL',
  'Despacho a domicilio directo',
];
