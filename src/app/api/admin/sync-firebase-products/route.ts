import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, ID, Query } from '@/lib/db';
import { setSkuInFeatures, getSkuFromFeatures } from '@/lib/product-features';

interface FirebaseProduct {
  sku: string;
  name: string;
  priceA: number;
  priceB?: number;
  stock: number;
  category: string;
  subcategory?: string;
  image: string;
  image2?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const products: FirebaseProduct[] = body.products;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ success: false, error: 'No products provided' }, { status: 400, headers: corsHeaders });
    }

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    // ═══ STEP 1: Get existing categories from Appwrite ═══
    const catRes = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION, [
      Query.limit(500),
    ]);
    const existingCategories = new Map<string, string>();
    for (const doc of catRes.documents) {
      const name = (doc.name || doc.NAME || '').toString();
      if (name) existingCategories.set(name.toLowerCase().trim(), doc.$id);
    }
    console.log(`[sync-firebase] Found ${existingCategories.size} existing categories in Appwrite`);

    // ═══ STEP 2: Get all existing products from Appwrite with their doc IDs ═══
    const appwriteProducts = new Map<string, string>(); // sku -> docId
    let offset = 0;
    while (true) {
      const prodRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
        Query.limit(500),
        Query.offset(offset),
      ]);
      if (prodRes.documents.length === 0) break;
      for (const doc of prodRes.documents) {
        const sku = getSkuFromFeatures(doc.FEATURES, doc.TAGS, doc.$id);
        if (sku) appwriteProducts.set(sku.trim(), doc.$id);
      }
      offset += prodRes.documents.length;
      if (prodRes.documents.length < 500) break;
    }
    console.log(`[sync-firebase] Found ${appwriteProducts.size} existing products in Appwrite`);

    // Build set of Firebase SKUs
    const firebaseSkus = new Set(products.map(p => String(p.sku).trim()));

    // ═══ STEP 3: Create missing categories ═══
    const newCategoryNames = new Set<string>();
    for (const p of products) {
      const catName = (p.category || 'Hogar y Cocina').trim();
      if (!existingCategories.has(catName.toLowerCase().trim())) {
        newCategoryNames.add(catName);
      }
    }
    for (const catName of newCategoryNames) {
      try {
        const slug = catName.toLowerCase().replace(/\s+/g, '-');
        const doc = await databases.createDocument(databaseId, CATEGORIES_COLLECTION, ID.unique(), {
          name: catName,
          slug: slug,
        });
        existingCategories.set(catName.toLowerCase().trim(), doc.$id);
        console.log(`[sync-firebase] Created category: ${catName} -> ${doc.$id}`);
      } catch (e: any) {
        console.error(`[sync-firebase] Error creating category ${catName}:`, e.message);
      }
    }

    // ═══ STEP 4: Import new products + update prices of existing ones ═══
    let importedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        const sku = String(p.sku).trim();
        const catName = (p.category || 'Hogar y Cocina').trim();
        const categoryId = existingCategories.get(catName.toLowerCase().trim()) || '';
        const price = Math.round(p.priceA || 0);

        const existingDocId = appwriteProducts.get(sku);

        if (existingDocId) {
          // Update price only (don't touch image)
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, existingDocId, {
            PRICE: price,
            WHOLESALEPRICE: price,
          });
          updatedCount++;
        } else {
          // New product - create it
          let features = setSkuInFeatures('', sku);

          const payload: Record<string, any> = {
            NAME: p.name,
            DESCRIPTION: p.name,
            PRICE: price,
            STOCK: p.stock || 999,
            COST: 0,
            CURRENTPRICE: null,
            WHOLESALEPRICE: price,
            WHOLESALEMINQUANTITY: 0,
            PACKQTY: 0,
            IMAGEURL: p.image || '',
            IMAGEURL2: p.image2 || '',
            CATEGORYID: categoryId,
            SUBCATEGORYID: '',
            FEATURES: features.split('\n').filter(Boolean),
            TAGS: [catName.toLowerCase().replace(/\s+/g, '-')],
          };

          await databases.createDocument(databaseId, PRODUCTS_COLLECTION, ID.unique(), payload);
          importedCount++;
        }

        if ((i + 1) % 10 === 0) {
          console.log(`[sync-firebase] Progress: ${i + 1}/${products.length} (imported: ${importedCount}, updated: ${updatedCount}, errors: ${errorCount})`);
        }
      } catch (err: any) {
        errorCount++;
        errors.push(`Error syncing ${p.sku} (${p.name}): ${err.message}`);
        console.error(`[sync-firebase] Error syncing ${p.sku}:`, err.message);
      }
    }

    // ═══ STEP 5: Set stock=0 for products in Appwrite but NOT in Firebase catalog ═══
    let disabledCount = 0;
    for (const [sku, docId] of appwriteProducts) {
      if (!firebaseSkus.has(sku)) {
        try {
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, docId, {
            STOCK: 0,
          });
          disabledCount++;
        } catch (err: any) {
          console.error(`[sync-firebase] Error disabling ${sku}:`, err.message);
        }
      }
    }
    console.log(`[sync-firebase] Disabled ${disabledCount} products not in Firebase catalog`);

    console.log(`[sync-firebase] DONE: ${importedCount} imported, ${updatedCount} updated, ${disabledCount} disabled, ${errorCount} errors`);

    // Invalidate cache
    try {
      revalidateTag('products');
      revalidateTag('home');
      revalidateTag('catalog');
      revalidateTag('offers');
    } catch (e: any) {
      console.error('[sync-firebase] Error revalidating cache:', e?.message);
    }

    return NextResponse.json({
      success: true,
      importedCount,
      updatedCount,
      disabledCount,
      errorCount,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      message: `Sincronizacion completa: ${importedCount} nuevos, ${updatedCount} precios actualizados, ${disabledCount} deshabilitados (stock 0), ${errorCount} errores.`
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[sync-firebase] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Error en sincronizacion'
    }, { status: 500, headers: corsHeaders });
  }
}
