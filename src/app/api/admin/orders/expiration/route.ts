import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { isSupremeAdminRequest } from '@/lib/admin-api-auth';
import { PAYMENT_PROOF_GRACE_MS } from '@/lib/payment-deadline';
import {
  DEFAULT_ORDER_EXPIRATION_MINUTES,
  MAX_ORDER_EXPIRATION_MINUTES,
  MIN_ORDER_EXPIRATION_MINUTES,
  ORDER_EXPIRATION_SETTING_FIELD,
  normalizeOrderExpirationMinutes,
} from '@/lib/order-expiration-settings';
import { calculatePaymentDeadline } from '@/lib/store-schedule';
import { PAYMENT_PENDING_STATUSES } from '@/lib/order-stock-service';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 450;

function isAwaitingPayment(data: Record<string, any>): boolean {
  return PAYMENT_PENDING_STATUSES.includes(data.STATUS) && !data.PAYMENTPROOFURL;
}

export async function GET(request: NextRequest) {
  if (!(await isSupremeAdminRequest(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = getAdminDb();
  const snapshot = await db.collection(STORE_SETTINGS_COLLECTION).doc('main').get();
  const minutes = normalizeOrderExpirationMinutes(snapshot.data()?.[ORDER_EXPIRATION_SETTING_FIELD]) ?? DEFAULT_ORDER_EXPIRATION_MINUTES;
  return NextResponse.json({ minutes }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!(await isSupremeAdminRequest(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const minutes = normalizeOrderExpirationMinutes(body?.minutes);
    const applyToAll = body?.applyToAll === true;
    const orderId = String(body?.orderId || '').trim();

    if (minutes === null) {
      return NextResponse.json({ error: `El plazo debe ser un número entero entre ${MIN_ORDER_EXPIRATION_MINUTES} y ${MAX_ORDER_EXPIRATION_MINUTES} minutos.` }, { status: 400 });
    }
    if (!applyToAll && !orderId) {
      return NextResponse.json({ error: 'Falta el pedido al que se aplicará el plazo.' }, { status: 400 });
    }

    const db = getAdminDb();
    const now = Date.now();
    const expiresAt = calculatePaymentDeadline(now, minutes);
    const update = {
      EXPIRESAT: expiresAt,
      EXPIRESATBACKEND: expiresAt + PAYMENT_PROOF_GRACE_MS,
      EXPIRATIONWINDOWMINUTES: minutes,
      UPDATEDAT: now,
    };

    if (!applyToAll) {
      const ref = db.collection(ORDERS_COLLECTION_ID).doc(orderId);
      const snapshot = await ref.get();
      if (!snapshot.exists || !isAwaitingPayment(snapshot.data() || {})) {
        return NextResponse.json({ error: 'Este pedido ya no espera pago o no tiene stock reservado.' }, { status: 409 });
      }
      await ref.update(update);
      try { revalidateTag('orders'); } catch {}
      return NextResponse.json({ success: true, updatedCount: 1, minutes });
    }

    const snapshots = await Promise.all([
      db.collection(ORDERS_COLLECTION_ID).where('STATUS', 'in', [...PAYMENT_PENDING_STATUSES]).get(),
      db.collection(VENDOR_ORDERS_COLLECTION_ID).where('STATUS', 'in', [...PAYMENT_PENDING_STATUSES]).get(),
    ]);
    const eligibleDocs = snapshots.flatMap(snapshot => snapshot.docs).filter(doc => isAwaitingPayment(doc.data()));

    for (let start = 0; start < eligibleDocs.length; start += BATCH_SIZE) {
      const batch = db.batch();
      for (const doc of eligibleDocs.slice(start, start + BATCH_SIZE)) batch.update(doc.ref, update);
      await batch.commit();
    }

    await db.collection(STORE_SETTINGS_COLLECTION).doc('main').set({
      [ORDER_EXPIRATION_SETTING_FIELD]: minutes,
      updatedAt: now,
    }, { merge: true });

    try { revalidateTag('orders'); } catch {}
    return NextResponse.json({ success: true, updatedCount: eligibleDocs.length, minutes });
  } catch (error: any) {
    console.error('[API admin/orders/expiration] Error:', error);
    return NextResponse.json({ error: error?.message || 'No se pudo guardar el plazo de expiración.' }, { status: 500 });
  }
}
