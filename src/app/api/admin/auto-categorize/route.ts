import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, ID, Query } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Keyword → Category name mapping
const CATEGORY_RULES: { keywords: string[]; category: string }[] = [
  { keywords: ['audifono', 'audífono', 'parlante', 'microfono', 'micrófono', 'consola', 'reloj smart', 'smart watch', 'pila', 'duracell', 'lamina', 'laminadora', 'soporte tv', 'bandolera'], category: 'Electrónica y Tecnología' },
  { keywords: ['cepillo', 'limpiador', 'limpia', 'cinta selladora', 'removedor de callo', 'removedor de pelusa', 'depiladora', 'dispensador de jabón', 'esponja', 'difusor de aroma', 'difusor', 'jabon', 'jabón', 'toalla humeda', 'traperos', 'paño', 'pañales', 'servilleta', 'papel higenico', 'cotonitos', 'oximetro'], category: 'Aseo y Limpieza' },
  { keywords: ['gorro', 'calceta', 'pantufla', 'capa impermeable', 'corrector', 'faja', 'maquillaje', 'depilador', 'secador portatil', 'secador portátil'], category: 'Moda y Calzado' },
  { keywords: ['carpa', 'niño', 'niña', 'squishy', 'antiestres', 'antiestrés', 'llaveros', 'bear', 'cartuchera', 'set maleta de arte', 'pistola burbuja', 'kawaii'], category: 'Juguetes y Niños' },
  { keywords: ['mascota', 'pájaro', 'pajaro', 'comedero', 'baño sanitario', 'cepillo magico', 'gato'], category: 'Mascotas' },
  { keywords: ['mueble', 'organizador', 'revistero', 'set taper', 'set de cocina', 'cortina de baño', 'colgador', 'grifo solar', 'whiskero', 'mini selladora', 'picadora', 'licuadora', 'libro decorativo', 'medusa', 'masajeador', 'lampara', 'lámpara', 'comedor', 'set de cocina'], category: 'Hogar y Cocina' },
];

function guessCategory(productName: string): string {
  const name = productName.toLowerCase().trim();
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (name.includes(kw.toLowerCase())) {
        return rule.category;
      }
    }
  }
  return 'Hogar y Cocina'; // Default fallback
}

export async function POST(request: NextRequest) {
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    // ═══ STEP 1: Get all categories from Appwrite ═══
    const catRes = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION, [
      Query.limit(500),
    ]);
    const categoryMap = new Map<string, string>(); // name (lowercase) -> categoryId
    for (const doc of catRes.documents) {
      const name = (doc.name || doc.NAME || '').toString();
      if (name) categoryMap.set(name.toLowerCase().trim(), doc.$id);
    }
    console.log(`[auto-categorize] Found ${categoryMap.size} categories`);

    // ═══ STEP 2: Get all products ═══
    const productsToUpdate: { docId: string; name: string; sku: string }[] = [];
    let offset = 0;
    while (true) {
      const prodRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
        Query.limit(500),
        Query.offset(offset),
      ]);
      if (prodRes.documents.length === 0) break;
      for (const doc of prodRes.documents) {
        const catId = doc.CATEGORYID || '';
        const catName = (doc.CATEGORYNAME || '').toString();
        // Product needs categorization if CATEGORYID is empty or category name is "—" or empty
        if (!catId || catId === '—' || catName === '—' || catName === '' || catId === '') {
          const features = doc.FEATURES || '';
          const featuresStr = Array.isArray(features) ? features.join('\n') : String(features);
          const skuMatch = featuresStr.match(/SKU:\s*(.+)/i);
          const sku = skuMatch ? skuMatch[1].trim() : '';
          productsToUpdate.push({ docId: doc.$id, name: doc.NAME || '', sku });
        }
      }
      offset += prodRes.documents.length;
      if (prodRes.documents.length < 500) break;
    }
    console.log(`[auto-categorize] Found ${productsToUpdate.length} products without category`);

    // ═══ STEP 3: Assign categories ═══
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const newCategoriesNeeded = new Set<string>();

    // First, find which new categories we need
    for (const p of productsToUpdate) {
      const catName = guessCategory(p.name);
      if (!categoryMap.has(catName.toLowerCase().trim())) {
        newCategoriesNeeded.add(catName);
      }
    }

    // Create missing categories
    for (const catName of newCategoriesNeeded) {
      try {
        const slug = catName.toLowerCase().replace(/\s+/g, '-');
        const doc = await databases.createDocument(databaseId, CATEGORIES_COLLECTION, ID.unique(), {
          name: catName,
          slug: slug,
        });
        categoryMap.set(catName.toLowerCase().trim(), doc.$id);
        console.log(`[auto-categorize] Created category: ${catName} -> ${doc.$id}`);
      } catch (e: any) {
        console.error(`[auto-categorize] Error creating category ${catName}:`, e.message);
      }
    }

    // Update products
    for (const p of productsToUpdate) {
      try {
        const catName = guessCategory(p.name);
        const categoryId = categoryMap.get(catName.toLowerCase().trim()) || '';

        await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, p.docId, {
          CATEGORYID: categoryId,
        });
        updatedCount++;
        console.log(`[auto-categorize] ${p.sku || p.docId} -> ${catName}`);
      } catch (err: any) {
        errorCount++;
        errors.push(`Error updating ${p.sku || p.docId}: ${err.message}`);
      }
    }

    // Invalidate cache
    try {
      revalidateTag('products');
      revalidateTag('home');
      revalidateTag('catalog');
    } catch (e: any) {
      console.error('[auto-categorize] Error revalidating:', e?.message);
    }

    return NextResponse.json({
      success: true,
      foundWithoutCategory: productsToUpdate.length,
      updatedCount,
      errorCount,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      message: `Categorización automática: ${updatedCount} productos categorizados, ${errorCount} errores.`
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[auto-categorize] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Error en categorización'
    }, { status: 500, headers: corsHeaders });
  }
}
