import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { restoreStockForOrder } from '@/lib/order-stock-service';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderIds: string[] = Array.isArray(body?.orderIds)
      ? body.orderIds
      : body?.orderId
      ? [body.orderId]
      : [];

    if (!orderIds.length) {
      return NextResponse.json({ error: 'orderIds es requerido' }, { status: 400 });
    }

    const db = getAdminDb();
    let deletedCount = 0;
    let stockRestoredCount = 0;

    for (const orderId of orderIds) {
      if (!orderId) continue;

      // 1. Obtener la orden de orders o vendor_orders
      let orderData: any = null;
      const orderRef = db.collection(ORDERS_COLLECTION_ID).doc(orderId);
      const orderSnap = await orderRef.get();

      if (orderSnap.exists) {
        orderData = orderSnap.data();
      } else {
        const vRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(orderId);
        const vSnap = await vRef.get();
        if (vSnap.exists) {
          orderData = vSnap.data();
        }
      }

      // 2. Si tenía stock descontado y NO estaba ya cancelado, restituir el stock primero
      if (orderData && orderData.STOCKDEDUCTED === true && orderData.STATUS !== 'cancelled') {
        try {
          const restored = await restoreStockForOrder(orderId, orderData.ITEMS, {
            orderCode: orderData.ORDERCODE,
            customerName: orderData.CUSTOMERNAME,
            orderIndex: orderData.ORDERINDEX,
          });
          if (restored) stockRestoredCount++;
        } catch (restErr) {
          console.warn(`[orders/delete] Error restituyendo stock al eliminar ${orderId}:`, restErr);
        }
      }

      // 3. Eliminar de ambas colecciones (orders y vendor_orders) para evitar huérfanos
      try {
        await Promise.all([
          db.collection(ORDERS_COLLECTION_ID).doc(orderId).delete().catch(() => {}),
          db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(orderId).delete().catch(() => {}),
        ]);
        deletedCount++;
      } catch (delErr) {
        console.error(`[orders/delete] Error eliminando ${orderId}:`, delErr);
      }
    }

    try { revalidateTag('orders'); } catch {}
    try { revalidateTag('pos-web-reservations'); } catch {}

    return NextResponse.json({
      success: true,
      deletedCount,
      stockRestoredCount,
    });
  } catch (error: any) {
    console.error('[API admin/orders/delete] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
