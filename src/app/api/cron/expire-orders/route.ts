import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { expireUnpaidOrder, getOrderAutoCancelAt, getOrderPaymentDeadline, isVendorOrder, markOrderPaymentExpired, PAYMENT_EXPIRATION_STATUSES, syncExpiredOrderAutoCancelAt } from '@/lib/order-stock-service';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || (process.env.NODE_ENV === 'development' ? 'expire_orders_secret_2026' : '');
const RECENT_ORDER_WINDOW_MS = 48 * 60 * 60 * 1000;

function isLegacySweep(now: number): boolean {
  const utc = new Date(now);
  // Un ciclo por hora recupera pedidos antiguos o sin CREATEDAT sin barrerlos cada 5 min.
  return utc.getUTCMinutes() < 5;
}

/**
 * Cron que cambia a "payment_expired" los pedidos cuyo plazo de pago venció,
 * conserva la reserva hasta que el pedido cumpla 24 horas desde CREATEDAT y
 * después cancela el pedido y devuelve el stock que había reservado.
 *
 * Es idempotente: ambas transiciones validan el estado y el comprobante dentro
 * de transacciones; sólo la cancelación final devuelve el stock.
 *
 * Llamar cada 1-5 minutos con:
 *   GET /api/cron/expire-orders?secret=CRON_SECRET
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');
    const authHeader = req.headers.get('authorization');
    if (!CRON_SECRET || (secret !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    const db = getAdminDb();
    let orders: any[];
    const fullSweep = isLegacySweep(now);
    try {
      // Consulta directa por el índice de un solo campo STATUS (evita el error
      // INVALID_ARGUMENT de Firestore por desigualdad en múltiples campos que ocurría cada 5 min).
      const readActiveExpirationStatuses = (collectionId: string, maxDocs = 250) =>
        db.collection(collectionId)
          .where('STATUS', 'in', [...PAYMENT_EXPIRATION_STATUSES])
          .limit(maxDocs)
          .get();

      const [mainSweep, vendorSweep] = await Promise.all([
        readActiveExpirationStatuses(ORDERS_COLLECTION_ID, fullSweep ? 500 : 200),
        readActiveExpirationStatuses(VENDOR_ORDERS_COLLECTION_ID, fullSweep ? 500 : 200),
      ]);
      const mainDocs = mainSweep.docs;
      const vendorDocs = vendorSweep.docs;

      orders = [
        ...mainDocs.map(order => ({ $id: order.id, ...order.data(), _COLLECTION: ORDERS_COLLECTION_ID })),
        ...vendorDocs.map(order => ({ $id: order.id, ...order.data(), _COLLECTION: VENDOR_ORDERS_COLLECTION_ID })),
      ];
    } catch (e) {
      console.error('[cron/expire-orders] Error listando pedidos:', e);
      return NextResponse.json({ error: 'Error listando pedidos' }, { status: 500 });
    }

    let expired = 0;
    let overdue = 0;
    let deadlinesUpdated = 0;
    let healedToReview = 0;
    let skipped = 0;
    for (const order of orders) {
      if (order.PAYMENTPROOFURL && String(order.PAYMENTPROOFURL).trim()) {
        // Auto-sanación: si el pedido ya tiene comprobante subido pero quedó
        // atrapado en 'paid'/'payment_expired', pasarlo a 'payment_review' para
        // que no vuelva a ser leído cada 5 minutos por este cron.
        try {
          await db.collection(order._COLLECTION || ORDERS_COLLECTION_ID).doc(order.$id).update({
            STATUS: 'payment_review',
            UPDATEDAT: now,
          });
          healedToReview++;
        } catch {
          skipped++;
        }
        continue;
      }
      try {
        if (isVendorOrder(order)) {
          // Los vendors no pasan por "Pago vencido": mantienen stock confirmado
          // y solo se cancelan cuando cumplen 24 h desde la creación.
          const autoCancelAt = getOrderAutoCancelAt(order);
          if (autoCancelAt > 0 && autoCancelAt <= now) {
            if (await expireUnpaidOrder(order.$id, now)) expired++;
            else skipped++;
          } else {
            skipped++;
          }
          continue;
        }

        if (order.STATUS === 'payment_expired') {
          const autoCancelAt = getOrderAutoCancelAt(order);
          if (Number(order.AUTOCANCELAT || 0) !== autoCancelAt) {
            if (await syncExpiredOrderAutoCancelAt(order.$id)) deadlinesUpdated++;
          }
          if (autoCancelAt > now) { skipped++; continue; }
          const cancelled = await expireUnpaidOrder(order.$id, now);
          if (cancelled) expired++;
          else skipped++;
          continue;
        }

        // Vence cuando termina el plazo de pago o el límite absoluto de 24 h
        // desde la creación, aunque el horario de la tienda esté pausado.
        const paymentDeadline = Number(order.EXPIRESAT || getOrderPaymentDeadline(order));
        const autoCancelAt = getOrderAutoCancelAt(order);
        if ((!paymentDeadline || paymentDeadline > now) && (!autoCancelAt || autoCancelAt > now)) {
          skipped++;
          continue;
        }

        const marked = await markOrderPaymentExpired(order.$id, now);
        if (!marked) { skipped++; continue; }
        overdue++;

        // Pedidos con más de 24 h desde su creación se cierran en este ciclo.
        if (getOrderAutoCancelAt({ ...order, STATUS: 'payment_expired' }) <= now) {
          const cancelled = await expireUnpaidOrder(order.$id, now);
          if (cancelled) expired++;
        }
      } catch (e) {
        console.error('[cron/expire-orders] Error expirando', order.$id, e);
        skipped++;
      }
    }

    if (expired > 0 || overdue > 0 || deadlinesUpdated > 0 || healedToReview > 0) {
      try { revalidateTag('orders'); } catch {}
    }

    console.info('[cron/expire-orders] resumen', { checked: orders.length, fullSweep, overdue, expired, deadlinesUpdated, healedToReview });
    return NextResponse.json({
      status: 'ok',
      checked: orders.length,
      overdue,
      deadlinesUpdated,
      healedToReview,
      expired,
      skipped,
      fullSweep,
      now,
    });
  } catch (error: any) {
    console.error('[cron/expire-orders] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
