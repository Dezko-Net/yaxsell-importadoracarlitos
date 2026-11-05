import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { expireUnpaidOrder, getOrderAutoCancelAt, isOrderPaymentWindowExpired, isVendorOrder, markOrderPaymentExpired, PAYMENT_PENDING_STATUSES } from '@/lib/order-stock-service';
import { revalidateTag } from 'next/cache';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';

export const dynamic = 'force-dynamic';

// POST: Cancelar un pedido pendiente (sin nombre/teléfono) y restaurar stock
export async function POST(req: NextRequest) {
  try {
    const { orderCode, orderId } = await req.json();

    if (!orderCode && !orderId) {
      return NextResponse.json({ error: 'Falta orderCode u orderId' }, { status: 400 });
    }

    const lookup = orderId
      ? await resolveOrderById(orderId, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') return NextResponse.json({ error: 'El número corresponde a más de un pedido; envía el ID del pedido.' }, { status: 409 });
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const { order, collectionId } = lookup.match as any;

    const now = Date.now();
    if (order.PAYMENTPROOFURL) {
      return NextResponse.json({
        error: 'El pedido ya tiene un comprobante de pago',
        status: order.STATUS,
      }, { status: 400 });
    }

    if (isVendorOrder(order)) {
      const autoCancelAt = getOrderAutoCancelAt(order);
      if (autoCancelAt > 0 && autoCancelAt <= now) {
        const cancelled = await expireUnpaidOrder(order.$id, now);
        if (!cancelled) return NextResponse.json({ error: 'No se pudo liberar el stock del pedido' }, { status: 409 });
        try { revalidateTag('orders'); } catch {}
        return NextResponse.json({ success: true, status: 'cancelled', orderId: order.$id, collection: collectionId });
      }

      // Este endpoint también lo llama el catálogo al limpiar pedidos web
      // antiguos; en una tienda aliada eso nunca debe vencer la reserva antes
      // de las 24 h desde CREATEDAT.
      return NextResponse.json({
        success: true,
        status: order.STATUS === 'payment_expired' ? 'paid' : order.STATUS,
        autoCancelAt: autoCancelAt || null,
        orderId: order.$id,
      });
    }

    if (PAYMENT_PENDING_STATUSES.includes(order.STATUS) && isOrderPaymentWindowExpired(order, now)) {
      await markOrderPaymentExpired(order.$id, now);
      const updatedOrder = await serverGetDocument(collectionId, order.$id) as any;
      if (updatedOrder) {
        if (updatedOrder.STATUS !== 'payment_expired') {
          return NextResponse.json({ error: 'El pedido ya cambió de estado', status: updatedOrder.STATUS }, { status: 409 });
        }
        const autoCancelAt = getOrderAutoCancelAt(updatedOrder);
        if (autoCancelAt <= now) {
          const expired = await expireUnpaidOrder(updatedOrder.$id, now);
          if (!expired) return NextResponse.json({ error: 'No se pudo finalizar la expiración' }, { status: 409 });
          return NextResponse.json({ success: true, status: 'cancelled', orderId: updatedOrder.$id });
        }
        return NextResponse.json({ success: true, status: 'payment_expired', autoCancelAt, orderId: updatedOrder.$id });
      }
    }

    if (order.STATUS === 'payment_expired') {
      const autoCancelAt = getOrderAutoCancelAt(order);
      if (autoCancelAt > now) {
        return NextResponse.json({ success: true, status: 'payment_expired', autoCancelAt, orderId: order.$id });
      }
    } else if (!PAYMENT_PENDING_STATUSES.includes(order.STATUS)) {
      return NextResponse.json({ error: 'El pedido ya no está pendiente de pago', status: order.STATUS }, { status: 400 });
    }

    const expired = await expireUnpaidOrder(order.$id, now);
    if (!expired) {
      return NextResponse.json({ error: 'El pedido ya cambió de estado o no pudo liberarse' }, { status: 409 });
    }

    try { revalidateTag('orders'); } catch {}

    return NextResponse.json({ success: true, orderId: order.$id, collection: collectionId });
  } catch (error: any) {
    console.error('[API cancel-pending] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
