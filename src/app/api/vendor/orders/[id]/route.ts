import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendorSession } from '@/lib/vendor-auth';
import { serverGetDocument, serverUpdateDocument } from '@/lib/firebase-server-compat';
import { VENDOR_ORDERS_COLLECTION_ID, ORDERS_COLLECTION_ID } from '@/lib/db';
import { expireUnpaidOrder, getOrderAutoCancelAt, PAYMENT_EXPIRATION_STATUSES, restoreStockForOrder } from '@/lib/order-stock-service';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['pending', 'pending_stock', 'processing', 'paid', 'payment_review', 'payment_confirmed', 'preparing', 'negotiation', 'shipped', 'delivered', 'cancelled'];

async function assertOwnership(vendorId: string, orderId: string) {
  const order = await serverGetDocument(VENDOR_ORDERS_COLLECTION_ID, orderId) as any;
  if (!order || order.VENDOR_ID !== vendorId) return null;
  return order;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;

  let order = await assertOwnership(session.vendorId, id);
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  const autoCancelAt = getOrderAutoCancelAt(order);
  if (!order.PAYMENTPROOFURL && PAYMENT_EXPIRATION_STATUSES.includes(order.STATUS) && autoCancelAt > 0 && autoCancelAt <= Date.now()) {
    await expireUnpaidOrder(id);
    order = await assertOwnership(session.vendorId, id);
  }
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;

  try {
    const existing = await assertOwnership(session.vendorId, id);
    if (!existing) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const { status, adminNotes } = await req.json();
    const updateData: Record<string, unknown> = { UPDATEDAT: Date.now() };
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
      }
      if (existing.STATUS === 'cancelled' && status !== 'cancelled') {
        return NextResponse.json({ error: 'Un pedido cancelado no puede reactivarse' }, { status: 400 });
      }
      updateData.STATUS = status;
    }
    if (adminNotes !== undefined) updateData.ADMINNOTES = adminNotes;

    let stockRestored = false;
    // Primero liberar el stock y solo después marcar como cancelado. Si falla
    // la restitución, el pedido se mantiene activo y no queda descuadrado.
    if (status === 'cancelled' && existing.STATUS !== 'cancelled' && existing.STOCKDEDUCTED === true) {
      stockRestored = await restoreStockForOrder(id, existing.ITEMS);
      if (!stockRestored) {
        return NextResponse.json({ error: 'No se pudo liberar el stock; el pedido sigue activo.' }, { status: 409 });
      }
      updateData.STOCKDEDUCTED = false;
    }

    const result = await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, id, updateData);
    try {
      await serverUpdateDocument(ORDERS_COLLECTION_ID, id, updateData);
    } catch {}

    if (status === 'cancelled' && existing.STATUS !== 'cancelled') {
      try { revalidateTag('products'); } catch {}
    }

    return NextResponse.json({ ok: true, order: result, stockRestored });
  } catch (err: any) {
    console.error('[vendor/orders PATCH]', err);
    return NextResponse.json({ error: err.message || 'Error al actualizar el pedido' }, { status: 500 });
  }
}
