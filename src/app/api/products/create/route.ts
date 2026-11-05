import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { serverCreateDocument } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { getInventoryConnectionMode } from '@/lib/inventory-mode';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';

// Attributes that may not exist in all Appwrite schemas
const OPTIONAL_ATTRS = ['TAGS', 'FEATURES', 'sku', 'barcode', 'IMAGEURL2', 'IMAGEURL3', 'WHOLESALEPRICE', 'WHOLESALEMINQUANTITY', 'PACKQTY', 'INTERNALCODE', 'section'];

export async function POST(req: NextRequest) {
  try {
    const { name, price, description, category, stock = 0, imageUrl = '', imageUrl2 = '', imageUrl3 = '', tags = '', sku = '', barcode = '', wholesalePrice = 0, wholesaleMinQuantity = 0, packQty = 0, internalCode = '', section = 0, features = '' } = await req.json();

    if (!name || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: name, price' },
        { status: 400 }
      );
    }

    // Build FEATURES string from sku, barcode and AI features
    let featuresStr = features || '';
    if (sku) featuresStr += `${featuresStr ? '\n' : ''}SKU: ${sku}`;
    if (barcode) featuresStr += `${featuresStr ? '\n' : ''}Barcode: ${barcode}`;

    const inventoryMode = await getInventoryConnectionMode();
    const stockValue = parseInt(stock.toString()) || 0;
    const productData: Record<string, unknown> = {
      NAME: name,
      DESCRIPTION: description || '',
      PRICE: parseFloat(price.toString()),
      CURRENTPRICE: parseFloat(price.toString()),
      CATEGORYID: category || '',
      ...(inventoryMode === 'web_independent'
        ? { WEB_STOCK: stockValue, web_stock: stockValue }
        : { STOCK: stockValue, stock: stockValue }),
      IMAGEURL: imageUrl || 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23f5f5f5%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22200%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23bbb%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E',
      IMAGEURL2: imageUrl2 || '',
      IMAGEURL3: imageUrl3 || '',
      RATING: 0,
      NUMREVIEWS: 0,
      SOLDQUANTITY: 0,
    };
    // Optional fields
    if (tags) productData.TAGS = tags;
    if (featuresStr) productData.FEATURES = featuresStr;
    if (sku) productData.sku = sku;
    if (barcode) productData.barcode = barcode;
    if (wholesalePrice) productData.WHOLESALEPRICE = wholesalePrice;
    if (wholesaleMinQuantity) productData.WHOLESALEMINQUANTITY = wholesaleMinQuantity;
    if (packQty) productData.PACKQTY = packQty;
    if (internalCode) productData.INTERNALCODE = internalCode;
    if (section) productData.section = section;

    let result;
    try {
      result = await serverCreateDocument(PRODUCTS_COLLECTION_ID, 'unique()', productData);
    } catch (attrErr: any) {
      // If unknown attribute error, retry without optional fields
      if (attrErr?.message?.includes('Unknown attribute')) {
        console.warn('Retrying without optional attrs:', attrErr.message);
        const safeData = { ...productData };
        for (const attr of OPTIONAL_ATTRS) delete safeData[attr];
        result = await serverCreateDocument(PRODUCTS_COLLECTION_ID, 'unique()', safeData);
      } else {
        throw attrErr;
      }
    }

    try {
      const { notifyNewProduct } = await import('@/services/notificationService');
      await notifyNewProduct({ $id: (result as any).$id, NAME: name });
    } catch {
      /* notificación opcional */
    }

    try { revalidateTag('products'); } catch {}
    clearCatalogMemoryCache();

    return NextResponse.json({
      success: true,
      product: result,
      message: `Producto "${name}" creado exitosamente`,
    });
  } catch (error: any) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear el producto' },
      { status: 500 }
    );
  }
}
