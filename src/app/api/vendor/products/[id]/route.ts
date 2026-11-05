import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendorSession } from '@/lib/vendor-auth';
import { serverGetDocument, serverUpdateDocument, serverDeleteDocument } from '@/lib/firebase-server-compat';
import { PRODUCTS_COLLECTION_ID } from '@/lib/firebase-admin-compat';
import { revalidateTag } from 'next/cache';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';
import { clearPublicProductDetailCache } from '@/lib/public-product-detail-cache';

export const dynamic = 'force-dynamic';

async function assertOwnership(vendorId: string, productId: string) {
  const product = await serverGetDocument(PRODUCTS_COLLECTION_ID, productId) as any;
  const ownerId = String(product?.VENDOR_ID || product?.vendorId || product?.SELLERID || product?.sellerId || '');
  if (!product || ownerId !== vendorId) return null;
  return product;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;

  try {
    const existing = await assertOwnership(session.vendorId, id);
    if (!existing) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const { name, description, price, stock, category, subcategory, showInWeb,
      imageUrl, imageUrl2, imageUrl3, tags, sku, barcode,
      wholesalePrice, wholesaleMinQuantity, packMinPacks, packDiscountPct,
      details, usage, ingredients } = await req.json();
    if (showInWeb !== undefined && typeof showInWeb !== 'boolean') {
      return NextResponse.json({ error: 'La visibilidad debe ser verdadera o falsa' }, { status: 400 });
    }
    const currentVisibility = existing.SHOW_IN_WEB ?? existing.show_in_web;
    const isVisibleInWeb = typeof showInWeb === 'boolean'
      ? showInWeb
      : currentVisibility === undefined || currentVisibility === null
        ? true
        : currentVisibility === true || currentVisibility === 'true' || currentVisibility === 1;
    const updateData: Record<string, unknown> = {
      VENDOR_ID: session.vendorId,
      SHOW_IN_WEB: isVisibleInWeb,
      show_in_web: isVisibleInWeb,
      isVendorProduct: true,
      IS_VENDOR_PRODUCT: true,
      UPDATEDAT: Date.now(),
      updatedAt: Date.now(),
    };
    if (name !== undefined) {
      if (!String(name).trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
      const cleanName = String(name).trim();
      updateData.NAME = cleanName;
      updateData.name = cleanName;
    }
    if (description !== undefined) {
      updateData.DESCRIPTION = description;
      updateData.description = description;
    }
    if (price !== undefined) {
      const p = Number(price);
      if (!Number.isFinite(p) || p <= 0) return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
      updateData.PRICE = p;
      updateData.price = p;
      updateData.CURRENTPRICE = p;
      updateData.currentPrice = p;
    }
    if (stock !== undefined) {
      const s = (stock === '' || stock === null) ? 99999 : Number(stock);
      if (!Number.isFinite(s) || s < 0) return NextResponse.json({ error: 'El stock debe ser un número igual o mayor a 0' }, { status: 400 });
      updateData.STOCK = s;
      updateData.stock = s;
      updateData.ISACTIVE = s > 0;
      updateData.isActive = s > 0;
    }
    if (category !== undefined) updateData.CATEGORYID = category;
    if (subcategory !== undefined) updateData.SUBCATEGORYID = subcategory;
    if (imageUrl !== undefined) updateData.IMAGEURL = imageUrl;
    if (imageUrl2 !== undefined) updateData.IMAGEURL2 = imageUrl2;
    if (imageUrl3 !== undefined) updateData.IMAGEURL3 = imageUrl3;
    // Precio por volumen
    if (wholesalePrice !== undefined) updateData.WHOLESALEPRICE = Math.round(Number(wholesalePrice)) || 0;
    if (wholesaleMinQuantity !== undefined) updateData.WHOLESALEMINQUANTITY = Math.round(Number(wholesaleMinQuantity)) || 0;
    if (packMinPacks !== undefined) updateData.PACK_MIN_PACKS = Math.round(Number(packMinPacks)) || 0;
    if (packDiscountPct !== undefined) updateData.PACK_DISCOUNT_PCT = Math.round(Number(packDiscountPct)) || 0;
    if (tags !== undefined) {
      updateData.TAGS = typeof tags === 'string'
        ? tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : (Array.isArray(tags) ? tags : []);
    }
    if (sku !== undefined || barcode !== undefined || details !== undefined || usage !== undefined || ingredients !== undefined) {
      // Reconstruir FEATURES preservando las existentes
      const existingFeatures: string[] = Array.isArray(existing.FEATURES)
        ? existing.FEATURES : (typeof existing.FEATURES === 'string' ? existing.FEATURES.split('\n').filter(Boolean) : []);
      const filtered = existingFeatures.filter(f =>
        !f.startsWith('SKU:') && !f.startsWith('BARCODE:') && !f.startsWith('CUSTOM_TABS:')
      );
      if (sku) filtered.push(`SKU: ${sku}`);
      if (barcode) filtered.push(`BARCODE: ${barcode}`);
      if (details !== undefined || usage !== undefined || ingredients !== undefined) {
        filtered.push(`CUSTOM_TABS: ${JSON.stringify({ details: details || '', usage: usage || '', ingredients: ingredients || '' })}`);
      }
      updateData.FEATURES = filtered;
    }

    const result = await serverUpdateDocument(PRODUCTS_COLLECTION_ID, id, updateData);
    revalidateTag('products');
    revalidateTag('catalog');
    revalidateTag('home');
    clearCatalogMemoryCache();
    clearPublicProductDetailCache();
    return NextResponse.json({ ok: true, product: result });
  } catch (err: any) {
    console.error('[vendor/products PATCH]', err);
    return NextResponse.json({ error: err.message || 'Error al actualizar el producto' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;

  try {
    const existing = await assertOwnership(session.vendorId, id);
    if (!existing) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    await serverDeleteDocument(PRODUCTS_COLLECTION_ID, id);
    revalidateTag('products');
    revalidateTag('catalog');
    revalidateTag('home');
    clearCatalogMemoryCache();
    clearPublicProductDetailCache();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[vendor/products DELETE]', err);
    return NextResponse.json({ error: err.message || 'Error al eliminar el producto' }, { status: 500 });
  }
}
