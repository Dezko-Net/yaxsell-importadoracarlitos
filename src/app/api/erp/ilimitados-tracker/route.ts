import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, PRODUCTS_COLLECTION_ID } from '@/lib/db-server';

export const dynamic = 'force-dynamic';

const UNLIMITED_STOCK = 99999;

/**
 * GET /api/erp/ilimitados-tracker
 *
 * Devuelve los productos marcados como ilimitado (stock = 99999) y
 * cuántas unidades de cada uno se vendieron hoy en el POS.
 *
 * Response:
 *   { ok: true, products: [{ id, sku, nombre, stockActual, vendidoHoy, imageUrl }], fecha }
 *
 * POST /api/erp/ilimitados-tracker
 *   body: { updates: [{ id, stock }] }
 *   Actualiza el stock real de los productos ilimitados al cierre del día.
 */
export async function GET() {
  try {
    const adminDb = getAdminDb();
    const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);

    // 1. Productos ilimitados (stock = 99999)
    const snap = await productsCol
      .where('STOCK', '==', UNLIMITED_STOCK)
      .get();

    const ilimitados: Array<{
      id: string;
      sku: string;
      nombre: string;
      stockActual: number;
      imageUrl: string;
      categoria: string;
    }> = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      const sku = d.SKU || d.sku || d.BARCODE || '';
      ilimitados.push({
        id: doc.id,
        sku,
        nombre: d.NAME || d.name || sku,
        stockActual: Number(d.STOCK ?? d.stock ?? 0),
        imageUrl: d.IMAGEURL || d.imageUrl || '',
        categoria: d.CATEGORY || d.category || '',
      });
    }

    // También buscar productos con stock en minúscula
    const snap2 = await productsCol
      .where('stock', '==', UNLIMITED_STOCK)
      .get();

    const idsYa = new Set(ilimitados.map(p => p.id));
    for (const doc of snap2.docs) {
      if (idsYa.has(doc.id)) continue;
      const d = doc.data();
      const sku = d.SKU || d.sku || d.BARCODE || '';
      ilimitados.push({
        id: doc.id,
        sku,
        nombre: d.NAME || d.name || sku,
        stockActual: Number(d.STOCK ?? d.stock ?? 0),
        imageUrl: d.IMAGEURL || d.imageUrl || '',
        categoria: d.CATEGORY || d.category || '',
      });
    }

    if (ilimitados.length === 0) {
      return NextResponse.json({ ok: true, products: [], fecha: getTodayStr(), totalVendido: 0 });
    }

    // 2. Ventas POS de hoy
    const todayStr = getTodayStr();
    const ventasCol = adminDb.collection('ventas_pos');
    const ventasSnap = await ventasCol.where('fechaStr', '==', todayStr).get();

    // Agregar cantidades vendidas por SKU
    const vendidoPorSku = new Map<string, number>();
    for (const vDoc of ventasSnap.docs) {
      const v = vDoc.data();
      if (v.estado === 'anulada') continue;
      let items: any[] = [];
      try {
        items = typeof v.itemsJson === 'string' ? JSON.parse(v.itemsJson) : (v.items || []);
      } catch {}
      for (const item of items) {
        const sku = item.sku || '';
        const qty = Number(item.cantidad) || 0;
        if (sku && qty > 0) {
          vendidoPorSku.set(sku, (vendidoPorSku.get(sku) || 0) + qty);
        }
      }
    }

    // 3. Combinar
    const products = ilimitados.map(p => ({
      ...p,
      vendidoHoy: vendidoPorSku.get(p.sku) || 0,
    }));

    // Ordenar: primero los que se vendieron hoy, luego por nombre
    products.sort((a, b) => {
      if (b.vendidoHoy !== a.vendidoHoy) return b.vendidoHoy - a.vendidoHoy;
      return a.nombre.localeCompare(b.nombre);
    });

    const totalVendido = products.reduce((s, p) => s + p.vendidoHoy, 0);

    return NextResponse.json({
      ok: true,
      products,
      fecha: todayStr,
      totalVendido,
      totalProductos: products.length,
    });
  } catch (error: any) {
    console.error('[API /api/erp/ilimitados-tracker] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error cargando ilimitados' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/erp/ilimitados-tracker
 * body: { updates: [{ id, stock }] }
 * Actualiza el stock real de los productos al cierre del día.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const updates: Array<{ id: string; stock: number }> = Array.isArray(body?.updates) ? body.updates : [];

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: 'No se enviaron actualizaciones' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);
    const now = Date.now();

    let updated = 0;
    for (const u of updates) {
      if (!u.id || u.stock == null) continue;
      const stock = Math.max(0, Math.round(Number(u.stock)));
      await productsCol.doc(u.id).update({
        STOCK: stock,
        stock: stock,
        updatedAt: now,
      });
      updated++;
    }

    return NextResponse.json({ ok: true, updated, serverTime: now });
  } catch (error: any) {
    console.error('[API /api/erp/ilimitados-tracker POST] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error actualizando stock' },
      { status: 500 }
    );
  }
}

function getTodayStr(): string {
  // Fecha de hoy en zona horaria de Chile (America/Santiago = UTC-3 / UTC-4)
  const now = new Date();
  const chile = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return chile.toISOString().split('T')[0];
}
