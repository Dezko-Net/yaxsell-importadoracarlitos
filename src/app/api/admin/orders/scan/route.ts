import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { isAdminEmail } from '@/lib/admin-access';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<string | null> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email) return null;
    if (isAdminEmail(email)) return email;
    const user = await getAdminDb().collection('erp_users').doc(email.replace(/[^a-z0-9_-]/g, '_')).get();
    const modules = user.data()?.modules;
    return Array.isArray(modules) && (modules.includes('web') || modules.includes('admin_supreme')) ? email : null;
  } catch { return null; }
}

const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return NextResponse.json({ error: 'Acceso al módulo web requerido.' }, { status: 403 });
  const id = request.nextUrl.searchParams.get('id');
  if (!validId(id)) return NextResponse.json({ error: 'Código de pedido inválido.' }, { status: 400 });
  try {
    const snap = await getAdminDb().collection(ORDERS_COLLECTION_ID).doc(id!).get();
    if (!snap.exists) return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    const order = snap.data() || {};
    return NextResponse.json({ order: { id: snap.id, code: String(order.ORDERCODE || ''), customer: String(order.CUSTOMERNAME || ''), status: String(order.STATUS || ''), agency: String(order.SHIPPINGAGENCY || '') } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'No se pudo consultar el pedido.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const email = await authorize(request);
  if (!email) return NextResponse.json({ error: 'Acceso al módulo web requerido.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validId(body?.id)) return NextResponse.json({ error: 'Código de pedido inválido.' }, { status: 400 });
  const sizes = body?.boxSizes;
  if (!Array.isArray(sizes) || sizes.length < 1 || sizes.length > 10 || !sizes.every((size: unknown) => size === 'S' || size === 'M' || size === 'L')) {
    return NextResponse.json({ error: 'Indica entre 1 y 10 cajas y selecciona la talla de cada una.' }, { status: 400 });
  }
  try {
    const db = getAdminDb();
    const ref = db.collection(ORDERS_COLLECTION_ID).doc(body.id);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error('Pedido no encontrado.');
      const order = snapshot.data() || {};
      if (order.STATUS === 'shipped') return { alreadyPacked: true, code: String(order.ORDERCODE || '') };
      if (order.WAREHOUSE_SHORTAGE_PENDING === true) throw new Error('Este pedido tiene faltantes pendientes de revisión con el cliente.');
      if (order.STATUS !== 'payment_confirmed') throw new Error('El pedido debe tener el pago confirmado antes de marcarlo como embalado.');
      const mirrorRef = order.IS_VENDOR_ORDER || order.VENDOR_ID ? db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(body.id) : null;
      const mirror = mirrorRef ? await transaction.get(mirrorRef) : null;
      if (mirror?.exists && mirror.data()?.STATUS !== 'payment_confirmed') throw new Error('El estado del pedido cambió. Actualiza y vuelve a intentarlo.');
      const update = { STATUS: 'shipped', UPDATEDAT: Date.now(), PACKEDAT: Date.now(), PACKEDBY: email, BULTOCOUNT: sizes.length, BOXSIZES: sizes };
      transaction.update(ref, update);
      if (mirrorRef && mirror?.exists) transaction.update(mirrorRef, update);
      return { alreadyPacked: false, code: String(order.ORDERCODE || '') };
    });
    revalidateTag('orders');
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'No se pudo actualizar el pedido.' }, { status: 409 }); }
}
