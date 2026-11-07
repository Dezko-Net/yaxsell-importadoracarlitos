import { getInventoryConnectionMode } from '@/lib/inventory-mode';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/db-server';
import { getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { isAdminEmail } from '@/lib/admin-access';
import { parsePaymentProofs, serializePaymentProofs } from '@/lib/payment-proofs';
import { deductStockForOrder, isVendorOrder } from '@/lib/order-stock-service';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

const MAX_REVIEW_ORDERS = 250;
const MAX_CONFIRM_IDS = 100;

function isVendorRecord(order: Record<string, any>): boolean {
  return isVendorOrder(order) || Boolean(order.VENDOR_NAME);
}

async function hasOrdersAccess(request: NextRequest): Promise<boolean> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email) return false;
    if (isAdminEmail(email)) return true;

    const userId = email.replace(/[^a-z0-9_-]/g, '_');
    const userSnap = await getAdminDb().collection('erp_users').doc(userId).get();
    const modules = userSnap.exists && Array.isArray(userSnap.data()?.modules) ? userSnap.data()!.modules : [];
    return modules.includes('web') || modules.includes('admin_supreme');
  } catch {
    return false;
  }
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItems(value: unknown): Array<Record<string, unknown>> {
  let items = value;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return []; }
  }
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    id: String(item?.id || item?.productId || item?.pid || ''),
    name: String(item?.name || item?.productName || item?.NAME || item?.nombre || 'Producto'),
    sku: String(item?.sku || item?.SKU || ''),
    qty: Math.max(0, Number(item?.qty ?? item?.quantity ?? item?.CANTIDAD) || 0),
    price: Math.max(0, Number(item?.price ?? item?.PRICE ?? 0) || 0),
    total: Math.max(0, Number(item?.total ?? item?.TOTAL ?? 0) || 0),
    img: String(item?.img || item?.imageUrl || item?.IMAGEURL || ''),
  }));
}

/**
 * Delivers only the records needed by the review workspace. In particular,
 * shipping address fields are intentionally omitted from this response.
 */
export async function GET(request: NextRequest) {
  if (!(await hasOrdersAccess(request))) {
    return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 401 });
  }

  try {
    const startRaw = request.nextUrl.searchParams.get('start');
    const endRaw = request.nextUrl.searchParams.get('end');
    const start = startRaw === null ? null : Number(startRaw);
    const end = endRaw === null ? null : Number(endRaw);
    if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) || (start !== null && end !== null && end <= start)) {
      return NextResponse.json({ error: 'El rango de fechas no es válido' }, { status: 400 });
    }

    const independentWeb = await getInventoryConnectionMode() === 'web_independent';
    const makeQuery = (legacy: boolean) => {
      let query: FirebaseFirestore.Query = getAdminDb().collection(ORDERS_COLLECTION_ID)
        .where('STATUS', legacy ? 'in' : '==', legacy ? ['paid', 'pending', 'pending_stock', 'processing', 'payment_expired'] : 'payment_review');
      if (start !== null) query = query.where('CREATEDAT', '>=', start);
      if (end !== null) query = query.where('CREATEDAT', '<', end);
      return query.orderBy('CREATEDAT', 'desc').limit(MAX_REVIEW_ORDERS + 1).get();
    };
    const [snapshot, legacy] = await Promise.all([makeQuery(false), independentWeb ? makeQuery(true) : Promise.resolve(null)]);
    const documents = [...snapshot.docs, ...(legacy?.docs || [])]
      .filter(document => !independentWeb || parsePaymentProofs(document.data().PAYMENTPROOFURL).length > 0)
      .sort((a, b) => normalizeTimestamp(b.data().CREATEDAT) - normalizeTimestamp(a.data().CREATEDAT));
    const truncated = documents.length > MAX_REVIEW_ORDERS || Boolean(legacy && legacy.docs.length > MAX_REVIEW_ORDERS);
    const orders = documents.slice(0, MAX_REVIEW_ORDERS).map(document => {
      const order = document.data();
      return {
        $id: document.id,
        USERID: String(order.USERID || ''),
        ORDERCODE: String(order.ORDERCODE || document.id),
        CUSTOMERNAME: String(order.CUSTOMERNAME || ''),
        CUSTOMERRUT: String(order.CUSTOMERRUT || ''),
        CUSTOMERPHONE: String(order.CUSTOMERPHONE || ''),
        CUSTOMEREMAIL: String(order.CUSTOMEREMAIL || ''),
        PAYMENTMETHOD: String(order.PAYMENTMETHOD || ''),
        CREATEDAT: normalizeTimestamp(order.CREATEDAT || order.$createdAt),
        SUBTOTAL: Number(order.SUBTOTAL || 0),
        SHIPPINGCOST: Number(order.SHIPPINGCOST || 0),
        DISCOUNTAMOUNT: Number(order.DISCOUNTAMOUNT || 0),
        TOTAL: Number(order.TOTAL || 0),
        ITEMS: normalizeItems(order.ITEMS),
        PAYMENTPROOFURL: serializePaymentProofs(parsePaymentProofs(order.PAYMENTPROOFURL)),
        PURCHASEDFROMLIVE: order.PURCHASEDFROMLIVE === true,
        REGION: String(order.REGION || ''),
        PAYMENTMETHODSOURCE: String(order.PAYMENTMETHODSOURCE || ''),
        IS_VENDOR_ORDER: isVendorRecord(order),
        VENDOR_ID: String(order.VENDOR_ID || ''),
        VENDOR_NAME: String(order.VENDOR_NAME || ''),
        STATUS: String(order.STATUS || ''),
      };
    });

    return NextResponse.json({ orders, truncated, limit: MAX_REVIEW_ORDERS });
  } catch (error: any) {
    console.error('[admin/orders/payment-review GET]', error);
    return NextResponse.json({ error: error?.message || 'No se pudieron cargar los pedidos para revisar' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await hasOrdersAccess(request))) {
    return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.orderIds)
      ? [...new Set<string>(body.orderIds.map((id: unknown) => String(id || '').trim()).filter(Boolean))]
      : [];
    if (ids.length === 0 || ids.length > MAX_CONFIRM_IDS) {
      return NextResponse.json({ error: `Selecciona entre 1 y ${MAX_CONFIRM_IDS} pedidos` }, { status: 400 });
    }
    if (ids.some(id => id.length > 150 || id.includes('/'))) {
      return NextResponse.json({ error: 'La lista contiene un identificador de pedido inválido' }, { status: 400 });
    }

    const db = getAdminDb();
    const independentWeb = await getInventoryConnectionMode() === 'web_independent';
    const eligibleStatuses = independentWeb ? ['paid', 'pending', 'pending_stock', 'processing', 'payment_expired', 'payment_review', 'payment_confirmed'] : ['payment_review', 'payment_confirmed'];
    const refs = ids.map(id => db.collection(ORDERS_COLLECTION_ID).doc(id));
    // Validate the entire batch before changing any status.
    const initialSnapshots = await Promise.all(refs.map(ref => ref.get()));
    for (let index = 0; index < initialSnapshots.length; index++) {
      const snapshot = initialSnapshots[index];
      if (!snapshot.exists) {
        return NextResponse.json({ error: `El pedido ${ids[index]} ya no existe. No se cambió ningún estado.` }, { status: 409 });
      }
      const order = snapshot.data() || {};
      if (!eligibleStatuses.includes(String(order.STATUS || ''))) {
        return NextResponse.json({ error: `El pedido ${order.ORDERCODE || ids[index]} ya no está en revisión de pago. Actualiza la lista; no se cambió ningún estado.` }, { status: 409 });
      }
      if (parsePaymentProofs(order.PAYMENTPROOFURL).length === 0) {
        return NextResponse.json({ error: `El pedido ${order.ORDERCODE || ids[index]} no tiene un comprobante disponible. No se cambió ningún estado.` }, { status: 409 });
      }
    }

    const confirmedIds: string[] = [];
    const transitionedIds: string[] = [];
    const errors: Array<{ orderId: string; message: string }> = [];

    for (let index = 0; index < refs.length; index++) {
      const ref = refs[index];
      try {
        const result = await db.runTransaction(async transaction => {
          const freshSnapshot = await transaction.get(ref);
          if (!freshSnapshot.exists) throw new Error('El pedido fue eliminado durante la revisión.');
          const order = freshSnapshot.data() || {};
          if (String(order.STATUS) === 'payment_confirmed') {
            return { changed: false, order };
          }
          if (!eligibleStatuses.includes(String(order.STATUS)) || parsePaymentProofs(order.PAYMENTPROOFURL).length === 0) {
            throw new Error('El pedido cambió de estado o perdió su comprobante.');
          }

          const update = { STATUS: 'payment_confirmed', UPDATEDAT: Date.now() };
          let mirrorRef: FirebaseFirestore.DocumentReference | null = null;
          let mirrorSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
          if (isVendorRecord(order)) {
            mirrorRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(ref.id);
            mirrorSnapshot = await transaction.get(mirrorRef);
          }
          transaction.update(ref, update);
          if (mirrorRef && mirrorSnapshot?.exists) transaction.update(mirrorRef, update);
          return { changed: true, order: { ...order, ...update } };
        });

        if (result.changed) transitionedIds.push(ref.id);

        // Match the existing status flow: if a legacy review order lacks its
        // reservation marker, attempt the idempotent stock reservation once.
        if (result.changed && result.order.STOCKDEDUCTED !== true) {
          await deductStockForOrder(ref.id, result.order.ITEMS);
        }
        confirmedIds.push(ref.id);
      } catch (error: any) {
        // A stock issue can occur after the status transaction committed.
        // Re-read only that order so the print includes every order actually confirmed.
        const fresh = await ref.get().catch(() => null);
        if (fresh?.exists && fresh.data()?.STATUS === 'payment_confirmed' && parsePaymentProofs(fresh.data()?.PAYMENTPROOFURL).length > 0) {
          confirmedIds.push(ref.id);
          errors.push({ orderId: ref.id, message: `El pago quedó confirmado, pero la reserva de stock requiere revisión: ${error?.message || 'error no especificado'}` });
          continue;
        }
        errors.push({ orderId: ref.id, message: error?.message || 'No se pudo confirmar este pedido' });
      }
    }

    if (transitionedIds.length > 0) {
      try { revalidateTag('orders'); } catch {}
      try { revalidateTag('pos-web-reservations'); } catch {}
    }

    return NextResponse.json({ success: confirmedIds.length > 0, confirmedIds, transitionedIds, errors });
  } catch (error: any) {
    console.error('[admin/orders/payment-review POST]', error);
    return NextResponse.json({ error: error?.message || 'No se pudieron confirmar los pagos' }, { status: 500 });
  }
}
