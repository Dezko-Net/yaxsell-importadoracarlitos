import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';

const CART_SNAPSHOTS_COLLECTION = 'cart_snapshots';
const STOCK_ALERTS_COLLECTION = 'stock_alerts';
const NOTIFICATIONS_COLLECTION = 'notifications';

export async function POST(req: NextRequest) {
  try {
    const db = getAdminDb();
    const body = await req.json();
    const { productId, productName, productImage, productPrice, singleUserId, singleQty, singleAlertId } = body;

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    console.log('[auto-cart] Request body:', { productId, productName, productPrice, singleUserId, singleQty, singleAlertId });

    // Single-user mode: delete specific alert and notify
    if (singleUserId && singleAlertId) {
      try {
        await db.collection(NOTIFICATIONS_COLLECTION).add({
          userId: singleUserId,
          type: 'stock',
          title: '¡Producto disponible!',
          message: `El producto "${productName || 'Producto'}" que esperabas ya tiene stock disponible. ¡Visita la tienda para comprarlo!`,
          isRead: false,
          createdAt: new Date().toISOString(),
        });

        await db.collection(STOCK_ALERTS_COLLECTION).doc(singleAlertId).update({ status: 'available' });

        return NextResponse.json({ success: true, autoAdded: 0, notified: 1 });
      } catch (e: any) {
        console.error('Single-user notify error:', e?.message || e);
        return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
      }
    }

    // Batch mode: find all pending stock alerts for this product
    const alertsSnap = await db.collection(STOCK_ALERTS_COLLECTION)
      .where('productId', '==', productId)
      .limit(500)
      .get();

    if (alertsSnap.empty) {
      return NextResponse.json({ message: 'No pending alerts for this product' });
    }

    let autoAdded = 0;
    let notified = 0;

    for (const alertDoc of alertsSnap.docs) {
      const alert = alertDoc.data() as any;
      const userId = alert.userId as string;

      try {
        await db.collection(NOTIFICATIONS_COLLECTION).add({
          userId,
          type: 'stock',
          title: '¡Producto disponible!',
          message: `El producto "${productName || 'Producto'}" que esperabas ya tiene stock disponible. ¡Visita la tienda para comprarlo!`,
          isRead: false,
          createdAt: new Date().toISOString(),
        });

        notified++;

        await alertDoc.ref.update({ status: 'available' });

      } catch (userErr) {
        console.error(`Error processing alert for user ${userId}:`, userErr);
      }
    }

    return NextResponse.json({
      success: true,
      autoAdded,
      notified,
      totalAlerts: alertsSnap.size,
    });
  } catch (e: any) {
    console.error('auto-cart error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
