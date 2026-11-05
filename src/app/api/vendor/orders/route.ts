import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendorSession } from '@/lib/vendor-auth';
import { getAdminDb } from '@/lib/db-server';
import { VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { expireUnpaidOrder, getOrderAutoCancelAt, PAYMENT_EXPIRATION_STATUSES } from '@/lib/order-stock-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const db = getAdminDb();
    let q = db.collection(VENDOR_ORDERS_COLLECTION_ID)
      .where('VENDOR_ID', '==', session.vendorId)
      .limit(1000);

    if (status) {
      q = q.where('STATUS', '==', status);
    }

    const snap = await q.get();
    const orders = snap.docs.map(d => ({ $id: d.id, ...d.data() })) as any[];
    const now = Date.now();
    await Promise.all(orders.map(async order => {
      if (order.PAYMENTPROOFURL || !PAYMENT_EXPIRATION_STATUSES.includes(order.STATUS)) return;
      const autoCancelAt = getOrderAutoCancelAt(order);
      if (autoCancelAt > 0 && autoCancelAt <= now && await expireUnpaidOrder(order.$id, now)) {
        order.STATUS = 'cancelled';
        order.STOCKDEDUCTED = false;
      }
    }));
    // Ordenar en memoria por CREATEDAT descendente
    orders.sort((a, b) => (Number(b.CREATEDAT) || 0) - (Number(a.CREATEDAT) || 0));

    return NextResponse.json({ orders, total: orders.length });
  } catch (err: any) {
    console.error('[vendor/orders GET]', err);
    return NextResponse.json({ error: 'Error al listar pedidos' }, { status: 500 });
  }
}
