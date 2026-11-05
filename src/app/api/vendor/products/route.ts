import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendorSession } from '@/lib/vendor-auth';
import { serverCreateDocument } from '@/lib/db-server';
import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';

export const dynamic = 'force-dynamic';

// GET: lista SOLO los productos del vendor autenticado (usa Admin SDK directamente)
export async function GET(req: NextRequest) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const db = getAdminDb();
    const [snap1, snap2, snap3] = await Promise.all([
      db.collection(PRODUCTS_COLLECTION_ID).where('VENDOR_ID', '==', session.vendorId).limit(1000).get().catch(() => ({ docs: [] })),
      db.collection(PRODUCTS_COLLECTION_ID).where('vendorId', '==', session.vendorId).limit(1000).get().catch(() => ({ docs: [] })),
      db.collection(PRODUCTS_COLLECTION_ID).where('sellerId', '==', session.vendorId).limit(1000).get().catch(() => ({ docs: [] })),
    ]);

    const map = new Map<string, any>();
    [...snap1.docs, ...snap2.docs, ...snap3.docs].forEach(d => {
      if (d && d.id) {
        const raw = d.data() as any;
        const stockVal = Number(raw.STOCK ?? raw.stock ?? 99999);
        const nameVal = raw.NAME ?? raw.name ?? '';
        const priceVal = Number(raw.PRICE ?? raw.price ?? 0);
        const descVal = raw.DESCRIPTION ?? raw.description ?? '';
        map.set(d.id, {
          ...raw,
          $id: d.id,
          id: d.id,
          NAME: nameVal,
          name: nameVal,
          DESCRIPTION: descVal,
          description: descVal,
          PRICE: priceVal,
          price: priceVal,
          STOCK: stockVal,
          stock: stockVal,
          IMAGEURL: raw.IMAGEURL ?? raw.imageUrl ?? raw.imageURL ?? '',
          IMAGEURL2: raw.IMAGEURL2 ?? raw.imageUrl2 ?? '',
          IMAGEURL3: raw.IMAGEURL3 ?? raw.imageUrl3 ?? '',
          CATEGORYID: raw.CATEGORYID ?? raw.categoryId ?? raw.category ?? '',
          SUBCATEGORYID: raw.SUBCATEGORYID ?? raw.subcategoryId ?? raw.subcategory ?? '',
          VENDOR_ID: raw.VENDOR_ID ?? raw.vendorId ?? raw.SELLERID ?? raw.sellerId ?? session.vendorId,
        });
      }
    });

    const products = Array.from(map.values());
    // Ordenar en memoria por createdAt descendente
    products.sort((a, b) =>
      (Number(b.createdAt ?? b.CREATEDAT ?? b.$createdAt) || 0) -
      (Number(a.createdAt ?? a.CREATEDAT ?? a.$createdAt) || 0)
    );

    return NextResponse.json({ products, total: products.length }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err: any) {
    console.error('[vendor/products GET]', err);
    return NextResponse.json({ error: 'Error al listar productos' }, { status: 500 });
  }
}

// POST: crea un producto, forzando VENDOR_ID al del vendor autenticado
export async function POST(req: NextRequest) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const {
      name, description, price, stock, category, subcategory,
      imageUrl, imageUrl2, imageUrl3, tags, sku, barcode,
      wholesalePrice, wholesaleMinQuantity, packMinPacks, packDiscountPct,
      details, usage, ingredients,
    } = await req.json();

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.json({ error: 'El precio debe ser mayor a 0' }, { status: 400 });
    }

    const stockForSave = (stock === undefined || stock === null || stock === '') ? 99999 : Number(stock);
    if (!Number.isFinite(stockForSave) || stockForSave < 0) {
      return NextResponse.json({ error: 'El stock debe ser un número igual o mayor a 0' }, { status: 400 });
    }

    // Tags: string → array
    const tagsArray = typeof tags === 'string'
      ? tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (Array.isArray(tags) ? tags : []);

    // Features: guardar SKU, barcode y ficha técnica dentro de FEATURES (mismo patrón que admin)
    const features: string[] = [];
    if (sku) features.push(`SKU: ${sku}`);
    if (barcode) features.push(`BARCODE: ${barcode}`);
    if (details || usage || ingredients) {
      features.push(`CUSTOM_TABS: ${JSON.stringify({ details: details || '', usage: usage || '', ingredients: ingredients || '' })}`);
    }

    const cleanName = String(name).trim();
    const productData: Record<string, unknown> = {
      NAME: cleanName,
      name: cleanName,
      DESCRIPTION: description || '',
      description: description || '',
      PRICE: parsedPrice,
      price: parsedPrice,
      CURRENTPRICE: parsedPrice,
      currentPrice: parsedPrice,
      CATEGORYID: category || '',
      SUBCATEGORYID: subcategory || '',
      STOCK: stockForSave,
      stock: stockForSave,
      ISACTIVE: stockForSave > 0,
      isActive: stockForSave > 0,
      IMAGEURL: imageUrl || 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23f5f5f5%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22200%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23bbb%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E',
      IMAGEURL2: imageUrl2 || '',
      IMAGEURL3: imageUrl3 || '',
      PACKQTY: 0,
      // En modo porcentaje no hay precio fijo por volumen. Guardar PRICE aquí
      // activaba accidentalmente la tabla de volumen (detalle = mayor × 1,5)
      // y anulaba el descuento configurado por el vendor.
      WHOLESALEPRICE: Number(packDiscountPct) > 0 && !(Number(wholesalePrice) > 0)
        ? 0
        : (Math.round(Number(wholesalePrice)) || parsedPrice),
      WHOLESALEMINQUANTITY: Math.round(Number(wholesaleMinQuantity)) || 0,
      PACK_MIN_PACKS: Math.round(Number(packMinPacks)) || 0,
      PACK_DISCOUNT_PCT: Math.round(Number(packDiscountPct)) || 0,
      TAGS: tagsArray,
      FEATURES: features,
      RATING: 0,
      NUMREVIEWS: 0,
      SOLDQUANTITY: 0,
      VENDOR_ID: session.vendorId,
      SHOW_IN_WEB: true,
      show_in_web: true,
      isVendorProduct: true,
      IS_VENDOR_PRODUCT: true,
      createdAt: Date.now(),
    };

    const result = await serverCreateDocument(PRODUCTS_COLLECTION_ID, 'unique()', productData);
    revalidateTag('products');
    revalidateTag('catalog');
    revalidateTag('home');
    clearCatalogMemoryCache();
    return NextResponse.json({ ok: true, product: result });
  } catch (err: any) {
    console.error('[vendor/products POST]', err);
    return NextResponse.json({ error: err.message || 'Error al crear el producto' }, { status: 500 });
  }
}
