import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest, NextResponse } from 'next/server';
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
function parseItems(order: any) {
  let raw = order.ITEMS;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) throw new Error('El pedido no tiene una lista de productos válida.');
  return raw.map((item: any, index: number) => {
    const qty = Number(item.qty ?? item.quantity ?? item.CANTIDAD);
    const price = Number(item.price ?? item.PRICE ?? 0);
    const total = Number(item.total ?? item.TOTAL ?? (price * qty));
    if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(total) || total < 0) throw new Error('Uno de los productos tiene cantidades o precios inválidos.');
    return { index, name: String(item.name || item.NAME || item.productName || item.nombre || 'Producto'), sku: String(item.sku || item.SKU || ''), qty, total };
  });
}
function version(order: any) {
  return createHash('sha256').update(JSON.stringify([order.ITEMS, order.SUBTOTAL, order.TOTAL, order.SHIPPINGCOST, order.STATUS, order.WAREHOUSE_SHORTAGE_PENDING, order.WAREHOUSE_SHORTAGE])).digest('hex');
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return NextResponse.json({ error: 'Acceso al módulo web requerido.' }, { status: 403 });
  const id = request.nextUrl.searchParams.get('id');
  if (!validId(id)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  try {
    const snap = await getAdminDb().collection(ORDERS_COLLECTION_ID).doc(id!).get();
    if (!snap.exists) return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    const order = snap.data() || {};
    const items = parseItems(order);
    return NextResponse.json({ order: { id: snap.id, code: String(order.ORDERCODE || ''), customer: String(order.CUSTOMERNAME || ''), status: String(order.STATUS || ''), items, version: version(order), pending: order.WAREHOUSE_SHORTAGE_PENDING === true } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) { return NextResponse.json({ error: error.message || 'No se pudo consultar el pedido.' }, { status: 409 }); }
}

export async function POST(request: NextRequest) {
  const actor = await authorize(request);
  if (!actor) return NextResponse.json({ error: 'Acceso al módulo web requerido.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validId(body?.id) || typeof body?.version !== 'string' || !Array.isArray(body?.available)) return NextResponse.json({ error: 'Datos de revisión inválidos.' }, { status: 400 });
  try {
    const db = getAdminDb();
    const ref = db.collection(ORDERS_COLLECTION_ID).doc(body.id);
    const result = await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('El pedido ya no existe.');
      const order = snap.data() || {};
      if (version(order) !== body.version) throw new Error('El pedido cambió mientras lo revisabas. Recarga la página y verifica de nuevo.');
      if (order.STATUS !== 'payment_confirmed') throw new Error('Solo se pueden registrar faltantes de pedidos con pago confirmado.');
      const items = parseItems(order);
      if (body.available.length !== items.length || !body.available.every((qty: unknown, i: number) => Number.isInteger(qty) && Number(qty) >= 0 && Number(qty) <= items[i].qty)) throw new Error('Revisa las cantidades: deben estar entre cero y la cantidad solicitada.');
      const missing = items.map((item: any, i: number) => ({ ...item, available: body.available[i], missing: item.qty - body.available[i] })).filter((item: any) => item.missing > 0);
      const originalTotal = Number(order.TOTAL);
      if (!Number.isFinite(originalTotal) || originalTotal < 0) throw new Error('El total del pedido no es válido.');
      const itemTotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
      const shipping = Math.max(0, Number(order.SHIPPINGCOST) || 0);
      const productPaid = Math.max(0, originalTotal - shipping);
      const ratio = itemTotal > 0 ? Math.min(1, productPaid / itemTotal) : 0;
      const missingValue = missing.reduce((sum: number, item: any) => sum + item.total * item.missing / item.qty, 0);
      const estimatedTotal = Math.max(0, Math.round(originalTotal - missingValue * ratio));
      const mirrorRef = order.IS_VENDOR_ORDER || order.VENDOR_ID ? db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(body.id) : null;
      const mirror = mirrorRef ? await transaction.get(mirrorRef) : null;
      if (mirror?.exists && version(mirror.data() || {}) !== version(order)) throw new Error('El pedido de la tienda aliada cambió. Recarga antes de guardar.');
      const report = { items: missing, originalTotal, estimatedTotal, reportedAt: Date.now(), reportedBy: actor };
      const update = { WAREHOUSE_SHORTAGE_PENDING: missing.length > 0, WAREHOUSE_SHORTAGE: report, UPDATEDAT: Date.now() };
      transaction.update(ref, update);
      if (mirrorRef && mirror?.exists) transaction.update(mirrorRef, update);
      return { missingCount: missing.length, originalTotal, estimatedTotal };
    });
    revalidateTag('orders');
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'No se pudo guardar la revisión.' }, { status: 409 }); }
}
