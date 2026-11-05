import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, ID, Query } from '@/lib/db';
import { setBarcodeInFeatures, setSkuInFeatures } from '@/lib/product-features';
import { getInventoryConnectionMode } from '@/lib/inventory-mode';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';

interface YolgoProduct {
  sku: string;
  name: string;
  price: string;
  imageUrl: string;
  packQty: string;
  barcode: string;
  artId: string;
  firebaseUrl: string;
  productType: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const products: YolgoProduct[] = body.products;
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ success: false, error: 'No products provided' }, { status: 400 });
    }

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const inventoryMode = await getInventoryConnectionMode();

    // ═══ STEP 1: Delete all existing categories ═══
    console.log('[bulk-import] Deleting all existing categories...');
    let deletedCategories = 0;
    while (true) {
      const catRes = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION, [
        Query.limit(500),
      ]);
      if (catRes.documents.length === 0) break;
      for (const doc of catRes.documents) {
        try {
          await databases.deleteDocument(databaseId, CATEGORIES_COLLECTION, doc.$id);
          deletedCategories++;
        } catch (e) { /* skip */ }
      }
    }

    // Delete all subcategories too
    let deletedSubcategories = 0;
    while (true) {
      const subRes = await databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION, [
        Query.limit(500),
      ]);
      if (subRes.documents.length === 0) break;
      for (const doc of subRes.documents) {
        try {
          await databases.deleteDocument(databaseId, SUBCATEGORIES_COLLECTION, doc.$id);
          deletedSubcategories++;
        } catch (e) { /* skip */ }
      }
    }
    console.log(`[bulk-import] Deleted ${deletedCategories} categories, ${deletedSubcategories} subcategories`);

    // ═══ STEP 2: Create new categories from productType ═══
    const uniqueCategories = [...new Set(products.map(p => p.productType))];
    const categoryMap = new Map<string, string>(); // productType -> categoryId

    for (const catName of uniqueCategories) {
      try {
        const doc = await databases.createDocument(databaseId, CATEGORIES_COLLECTION, ID.unique(), {
          name: catName,
          slug: catName.toLowerCase().replace(/\s+/g, '-'),
        });
        categoryMap.set(catName, doc.$id);
        console.log(`[bulk-import] Created category: ${catName} -> ${doc.$id}`);
      } catch (e: any) {
        console.error(`[bulk-import] Error creating category ${catName}:`, e.message);
      }
    }
    console.log(`[bulk-import] Created ${categoryMap.size} categories`);

    // ═══ STEP 3: Import products ═══
    let importedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        const originalPrice = Math.round(Number(p.price)) || 0;
        const wholesalePrice = originalPrice;
        const packQty = Math.round(Number(p.packQty)) || 0;
        const categoryId = categoryMap.get(p.productType) || '';

        // Build FEATURES with SKU and barcode
        let features = setSkuInFeatures('', p.sku);
        features = setBarcodeInFeatures(features, p.barcode);

        const payload: Record<string, any> = {
          NAME: p.name,
          DESCRIPTION: p.name,
          PRICE: originalPrice,
          ...(inventoryMode === 'web_independent'
            ? { WEB_STOCK: 96, web_stock: 96 }
            : { STOCK: 96, stock: 96 }),
          COST: 0,
          CURRENTPRICE: null,
          WHOLESALEPRICE: wholesalePrice,
          WHOLESALEMINQUANTITY: packQty,
          PACKQTY: packQty,
          IMAGEURL: p.firebaseUrl,
          IMAGEURL2: '',
          IMAGEURL3: '',
          CATEGORYID: categoryId,
          SUBCATEGORYID: '',
          SUBSUBCATEGORYID: '',
          FEATURES: features,
          TAGS: [p.productType.toLowerCase().replace(/\s+/g, '-')],
        };

        await databases.createDocument(databaseId, PRODUCTS_COLLECTION, ID.unique(), payload);
        importedCount++;

        if ((i + 1) % 50 === 0) {
          console.log(`[bulk-import] Progress: ${i + 1}/${products.length} (imported: ${importedCount}, errors: ${errorCount})`);
        }
      } catch (err: any) {
        errorCount++;
        errors.push(`Error importing ${p.sku} (${p.name}): ${err.message}`);
        console.error(`[bulk-import] Error importing ${p.sku}:`, err.message);
      }
    }

    console.log(`[bulk-import] DONE: ${importedCount} imported, ${errorCount} errors`);

    // 🔄 Invalidar el caché del catálogo (24h) para que los productos recién
    // importados aparezcan de inmediato en la tienda. Sin esto el servidor
    // seguiría sirviendo la foto vieja hasta que expire el revalidate de 24h.
    try {
      revalidateTag('products');
      revalidateTag('home');
      revalidateTag('catalog');
      revalidateTag('offers');
      console.log('[bulk-import] Cache tags revalidated (products, home, catalog, offers)');
      clearCatalogMemoryCache();
    } catch (e: any) {
      console.error('[bulk-import] Error revalidating cache tags:', e?.message);
    }

    return NextResponse.json({
      success: true,
      deletedCategories,
      deletedSubcategories,
      categoriesCreated: categoryMap.size,
      importedCount,
      errorCount,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      message: `Importación completa: ${importedCount} productos importados, ${categoryMap.size} categorías creadas.`
    });
  } catch (error: any) {
    console.error('[bulk-import] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Error en importación masiva'
    }, { status: 500 });
  }
}
