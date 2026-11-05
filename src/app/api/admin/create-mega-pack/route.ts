import { NextRequest, NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, ID } from '@/lib/db';
import { getInventoryConnectionMode } from '@/lib/inventory-mode';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';
import { revalidateTag } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const inventoryMode = await getInventoryConnectionMode();

    // Datos del Mega Pack Favoritos
    const megaPackData = {
      NAME: 'Mega Pack Favoritos (10 Productos · 15 Unidades)',
      DESCRIPTION: 'Pack especial con 10 productos favoritos de Importadora Carlitos. Incluye base de maquillaje, iluminadores, polvo suelto, paleta de rubores, corrector, paleta de sombras, toallitas, brocha, brillos labiales y delineador. Total 15 unidades. ¡El mejor precio!',
      PRICE: 15990,
      ...(inventoryMode === 'web_independent'
        ? { WEB_STOCK: 50, web_stock: 50 }
        : { STOCK: 50, stock: 50 }),
      COST: 8000,
      CURRENTPRICE: null,
      WHOLESALEPRICE: 0,
      WHOLESALEMINQUANTITY: 0,
      PACKQTY: 0,
      IMAGEURL: '',
      IMAGEURL2: '',
      IMAGEURL3: '',
      CATEGORYID: '',
      SUBCATEGORYID: '',
      SUBSUBCATEGORYID: '',
      FEATURES: 'DisableDiscounts: true\nBundlePack: true\nBundleProducts: 10\nBundleUnits: 15',
      TAGS: ['mega-pack', 'favoritos', 'bundle'],
      sku: 'MEGA-PACK-FAV-10',
    };

    const result = await databases.createDocument(
      databaseId,
      PRODUCTS_COLLECTION,
      ID.unique(),
      megaPackData
    );
    clearCatalogMemoryCache();
    try { revalidateTag('products'); } catch {}

    return NextResponse.json({
      success: true,
      product: result,
      message: 'Mega Pack Favoritos creado exitosamente'
    });
  } catch (error: any) {
    console.error('Error creando Mega Pack:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Error al crear el producto'
    }, { status: 500 });
  }
}

