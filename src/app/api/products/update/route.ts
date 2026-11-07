import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { serverUpdateDocument } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { getInventoryConnectionMode } from '@/lib/inventory-mode';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';

// Attributes that may not exist in all Appwrite schemas
const OPTIONAL_ATTRS = ['TAGS', 'FEATURES', 'sku', 'barcode', 'IMAGEURL2', 'IMAGEURL3'];

export async function PATCH(req: NextRequest) {
  try {
    const { productId, name, price, description, category, stock, imageUrl, imageUrl2, imageUrl3, tags, sku, barcode } = await req.json();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId es requerido' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    const inventoryMode = await getInventoryConnectionMode();
    if (name !== undefined) updates.NAME = name;
    if (price !== undefined) {
      updates.PRICE = parseFloat(price.toString());
      updates.CURRENTPRICE = parseFloat(price.toString());
    }
    if (description !== undefined) updates.DESCRIPTION = description;
    if (category !== undefined) updates.CATEGORYID = category;
    if (stock !== undefined) {
      const stockNum = parseInt(stock.toString()) || 0;
      if (inventoryMode === 'web_independent') {
        updates.WEB_STOCK = stockNum;
        updates.web_stock = stockNum;
      } else {
        updates.STOCK = stockNum;
        updates.stock = stockNum;
      }
    }
    if (imageUrl !== undefined) updates.IMAGEURL = imageUrl;
    if (imageUrl2 !== undefined) updates.IMAGEURL2 = imageUrl2;
    if (imageUrl3 !== undefined) updates.IMAGEURL3 = imageUrl3;
    if (tags !== undefined) updates.TAGS = tags;
    if (sku !== undefined) updates.sku = sku;
    if (barcode !== undefined) updates.barcode = barcode;
    // Build FEATURES from sku/barcode if provided
    if (sku || barcode) {
      let features = '';
      if (sku) features += `SKU: ${sku}\n`;
      if (barcode) features += `Barcode: ${barcode}\n`;
      updates.FEATURES = features;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se enviaron campos para actualizar' },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await serverUpdateDocument(PRODUCTS_COLLECTION_ID, productId, updates);
    } catch (attrErr: any) {
      if (attrErr?.message?.includes('Unknown attribute')) {
        console.warn('Retrying update without optional attrs:', attrErr.message);
        const safeUpdates = { ...updates };
        for (const attr of OPTIONAL_ATTRS) delete safeUpdates[attr];
        result = await serverUpdateDocument(PRODUCTS_COLLECTION_ID, productId, safeUpdates);
      } else {
        throw attrErr;
      }
    }

    try { revalidateTag('products'); } catch {}
    clearCatalogMemoryCache();

    const fieldsUpdated = Object.keys(updates).join(', ');
    return NextResponse.json({
      success: true,
      product: result,
      message: `Producto actualizado: ${fieldsUpdated}`,
    });
  } catch (error: any) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al actualizar el producto' },
      { status: 500 }
    );
  }
}
