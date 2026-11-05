import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';
import { isSupremeAdminRequest } from '@/lib/admin-api-auth';
import {
  expireUnpaidOrder,
  getOrderAutoCancelAt,
  getOrderPaymentDeadline,
  isVendorOrder,
  markOrderPaymentExpired,
  PAYMENT_PENDING_STATUSES,
  syncExpiredOrderAutoCancelAt,
} from '@/lib/order-stock-service';

export const dynamic = 'force-dynamic';

const RECONCILE_COOLDOWN_MS = 2 * 60 * 1000;
const gReconcile = globalThis as unknown as {
  __yaxsellLastReconcileExpired?: { ts: number; result: any };
};

/**
 * Sincroniza el estado de pago de pedidos vencidos al abrir o actualizar
 * /admin/orders. El cron sigue siendo el proceso periódico de producción;
 * esta ruta evita que el panel dependa de él para mostrar el estado correcto.
 */
export async function POST(request: NextRequest) {
  if (!(await isSupremeAdminRequest(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const now = Date.now();
    const cached = gReconcile.__yaxsellLastReconcileExpired;
    if (!force && cached && now - cached.ts < RECONCILE_COOLDOWN_MS) {
      return NextResponse.json({ ...cached.result, cached: true });
    }

    const db = getAdminDb();
    const [activeSnapshot, expiredSnapshot] = await Promise.all([
      db.collection(ORDERS_COLLECTION_ID).where('STATUS', 'in', [...PAYMENT_PENDING_STATUSES]).get(),
      db.collection(ORDERS_COLLECTION_ID).where('STATUS', '==', 'payment_expired').get(),
    ]);

    let markedExpired = 0;
    let cancelled = 0;
    let deadlinesUpdated = 0;
    let skipped = 0;

    for (const doc of activeSnapshot.docs) {
      const order = doc.data();
      if (isVendorOrder(order)) {
        if (order.PAYMENTPROOFURL) {
          skipped++;
          continue;
        }
        const vendorAutoCancelAt = getOrderAutoCancelAt(order);
        if (vendorAutoCancelAt > 0 && vendorAutoCancelAt <= now) {
          if (await expireUnpaidOrder(doc.id, now)) cancelled++;
          else skipped++;
        } else {
          skipped++;
        }
        continue;
      }

      const deadline = Number(order.EXPIRESAT || getOrderPaymentDeadline(order));
      const autoCancelAt = getOrderAutoCancelAt(order);
      if (order.PAYMENTPROOFURL || ((!deadline || deadline > now) && (!autoCancelAt || autoCancelAt > now))) {
        skipped++;
        continue;
      }

      try {
        const marked = await markOrderPaymentExpired(doc.id, now);
        if (!marked) {
          skipped++;
          continue;
        }
        markedExpired++;

        // Si ya terminó el límite de 24 h desde CREATEDAT, cerrarlo en este ciclo.
        if (getOrderAutoCancelAt({ ...order, STATUS: 'payment_expired' }) <= now) {
          if (await expireUnpaidOrder(doc.id, now)) cancelled++;
        }
      } catch (error) {
        console.error('[admin/orders/reconcile-expired] Error con pedido vencido:', doc.id, error);
        skipped++;
      }
    }

    for (const doc of expiredSnapshot.docs) {
      const order = doc.data();
      if (isVendorOrder(order)) {
        if (order.PAYMENTPROOFURL) {
          skipped++;
          continue;
        }
        const vendorAutoCancelAt = getOrderAutoCancelAt(order);
        if (Number(order.AUTOCANCELAT || 0) !== vendorAutoCancelAt) {
          if (await syncExpiredOrderAutoCancelAt(doc.id)) deadlinesUpdated++;
        }
        if (vendorAutoCancelAt > 0 && vendorAutoCancelAt <= now) {
          if (await expireUnpaidOrder(doc.id, now)) cancelled++;
          else skipped++;
        } else {
          skipped++;
        }
        continue;
      }

      if (order.PAYMENTPROOFURL) {
        skipped++;
        continue;
      }

      try {
        if (Number(order.AUTOCANCELAT || 0) !== getOrderAutoCancelAt(order)) {
          if (await syncExpiredOrderAutoCancelAt(doc.id)) deadlinesUpdated++;
        }
        if (getOrderAutoCancelAt(order) > now) {
          skipped++;
          continue;
        }
        if (await expireUnpaidOrder(doc.id, now)) cancelled++;
        else skipped++;
      } catch (error) {
        console.error('[admin/orders/reconcile-expired] Error al cancelar pedido:', doc.id, error);
        skipped++;
      }
    }

    if (markedExpired > 0 || cancelled > 0 || deadlinesUpdated > 0) {
      try { revalidateTag('orders'); } catch {}
    }

    const result = {
      success: true,
      checked: activeSnapshot.size + expiredSnapshot.size,
      markedExpired,
      deadlinesUpdated,
      cancelled,
      skipped,
    };
    gReconcile.__yaxsellLastReconcileExpired = { ts: Date.now(), result };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[admin/orders/reconcile-expired] Error:', error);
    return NextResponse.json({ error: error?.message || 'No se pudieron sincronizar los pedidos vencidos.' }, { status: 500 });
  }
}
