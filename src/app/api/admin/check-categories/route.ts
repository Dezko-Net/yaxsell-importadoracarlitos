import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from '@/lib/db';
import { isAdminEmail } from '@/lib/admin-access';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body?.email;
    if (!email || !isAdminEmail(email)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Fetch all categories to get names
    const catRes = await serverListDocuments(CATEGORIES_COLLECTION_ID, [
      JSON.stringify({ method: 'limit', values: [100] }),
    ]);
    const categories = catRes.documents as any[];
    const catMap = new Map(categories.map(c => [c.$id, c.name]));

    // Fetch ALL products in batches
    const allProducts: any[] = [];
    let offset = 0;
    while (true) {
      const batch = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
        JSON.stringify({ method: 'limit', values: [100] }),
        JSON.stringify({ method: 'offset', values: [offset] }),
        JSON.stringify({ method: 'orderDesc', attribute: '$createdAt' }),
      ]);
      allProducts.push(...batch.documents);
      if (batch.documents.length < 100) break;
      offset += 100;
      if (offset >= 2000) break;
    }

    const total = allProducts.length;
    const withCategory = allProducts.filter(p => p.CATEGORYID).length;
    const withoutCategory = allProducts.filter(p => !p.CATEGORYID);
    const withStock = allProducts.filter(p => p.STOCK == null || p.STOCK > 0).length;
    const withoutCategoryWithStock = withoutCategory.filter(p => p.STOCK == null || p.STOCK > 0);

    // Count by category
    const byCategory: Record<string, number> = {};
    allProducts.forEach(p => {
      const catName = p.CATEGORYID ? (catMap.get(p.CATEGORYID) || 'Unknown ID: ' + p.CATEGORYID) : 'Sin Categoria';
      byCategory[catName] = (byCategory[catName] || 0) + 1;
    });

    return NextResponse.json({
      total,
      withCategory,
      withoutCategory: withoutCategory.length,
      withoutCategoryNames: withoutCategory.map(p => ({ id: p.$id, name: p.NAME, stock: p.STOCK, createdAt: p.$createdAt })),
      withStock,
      withoutCategoryWithStock: withoutCategoryWithStock.length,
      byCategory,
    });
  } catch (err: any) {
    console.error('[check-categories] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
