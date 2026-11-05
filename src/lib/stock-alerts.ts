export interface StockAlert {
  $id: string;
  productId: string;
  productName: string;
  productImage: string;
  userId: string;
  userName: string;
  email: string;
  status: string;
  createdAt: number;
  notified: boolean;
  quantity: number;
  sku?: string;
  jumpsellerId?: string;
}

type RawStockAlert = Record<string, unknown>;

export function normalizeStockAlert(doc: RawStockAlert): StockAlert {
  return {
    $id: String(doc.$id ?? ''),
    productId: String(doc.productId ?? ''),
    productName: String(doc.productName ?? doc.PRODUCTNAME ?? ''),
    productImage: String(doc.productImage ?? doc.PRODUCTIMAGE ?? ''),
    userId: String(doc.userId ?? ''),
    userName: String(doc.userName ?? doc.USERNAME ?? ''),
    email: String(doc.email ?? doc.EMAIL ?? ''),
    status: String(doc.status ?? doc.STATUS ?? 'pending'),
    createdAt: Number(doc.createdAt ?? 0),
    notified: Boolean(doc.notified ?? doc.NOTIFIED ?? false),
    quantity: Number(doc.quantity ?? doc.QUANTITY ?? 1),
    sku: String(doc.sku ?? doc.SKU ?? ''),
    jumpsellerId: String(doc.jumpsellerId ?? doc.JUMPSELLERID ?? ''),
  };
}

export function buildStockAlertData(input: {
  productId: string;
  userId: string;
  productName?: string;
  productImage?: string;
  quantity?: number;
  sku?: string;
  jumpsellerId?: string;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    productId: input.productId,
    userId: input.userId,
    quantity: input.quantity ?? 1,
    createdAt: Date.now(),
  };
  if (input.productName) data.productName = input.productName;
  if (input.productImage) data.productImage = input.productImage;
  if (input.sku) data.sku = input.sku;
  if (input.jumpsellerId) data.jumpsellerId = input.jumpsellerId;
  return data;
}
