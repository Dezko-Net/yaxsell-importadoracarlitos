import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { serverUpdateDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/update
 *
 * Body: { orderId, ...fields }
 *
 * Actualiza campos de un pedido (items, total, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, ...fields } = body as { orderId: string; [key: string]: any };

    if (!orderId) {
      return NextResponse.json({ error: 'Falta orderId' }, { status: 400 });
    }

    // Filtrar campos validos
    const allowedFields: Record<string, any> = {};
    for (const key of ['ITEMS', 'TOTAL', 'SUBTOTAL', 'STATUS', 'EXPIRESAT', 'STOCKDEDUCTED', 'PAYMENTPROOFURL', 'CANCELREASON', 'UPDATEDAT']) {
      if (key in fields) {
        allowedFields[key] = fields[key];
      }
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    allowedFields.UPDATEDAT = Date.now();

    await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, allowedFields);

    try { revalidateTag('orders'); } catch {}
    if (['ITEMS', 'STATUS', 'STOCKDEDUCTED', 'PAYMENTPROOFURL', 'EXPIRESAT'].some(key => key in allowedFields)) {
      try { revalidateTag('pos-web-reservations'); } catch {}
    }

    return NextResponse.json({ success: true, message: 'Pedido actualizado' });
  } catch (error: any) {
    console.error('[API admin/orders/update] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
