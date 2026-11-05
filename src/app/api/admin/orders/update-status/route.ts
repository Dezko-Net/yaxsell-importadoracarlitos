import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument, serverUpdateDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { deductStockForOrder, restoreStockForOrder } from '@/lib/order-stock-service';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { orderId, newStatus } = await req.json();

    if (!orderId || !newStatus) {
      return NextResponse.json({ error: 'orderId y newStatus son requeridos' }, { status: 400 });
    }

    const order = await serverGetDocument(ORDERS_COLLECTION_ID, orderId) as any;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const prevStatus = order.STATUS;

    // Validate: cannot set to "delivered" without shipping proof photo or tracking number
    if (newStatus === 'delivered') {
      const hasShippingProof = !!order.SHIPPINGPROOFURL;
      const hasTrackingNumber = !!(order as any).TRACKINGNUMBER;
      if (!hasShippingProof && !hasTrackingNumber) {
        return NextResponse.json({
          error: 'Para marcar como "Entregado a Agencia" necesitas subir una foto del comprobante de envío o ingresar el número de seguimiento.',
        }, { status: 400 });
      }
    }

    // Actualizar estado del pedido en Appwrite / Firestore (y en vendor_orders si es pedido de tienda aliada)
    const updatePayload: Record<string, any> = {
      STATUS: newStatus,
      UPDATEDAT: Date.now(),
    };
    await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, updatePayload);
    if (order.IS_VENDOR_ORDER || order.VENDOR_ID) {
      try {
        await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, orderId, updatePayload);
      } catch (vErr) {
        console.warn(`[update-status] No se pudo actualizar vendor_orders/${orderId}:`, vErr);
      }
    }

    let stockUpdated = false;

    // Caso A: Transición a estado confirmado (paid, payment_review, payment_confirmed, processing) desde un estado
    // que NO tenía stock descontado -> Descontar stock
    const STOCK_DEDUCT_TARGETS = ['paid', 'payment_review', 'payment_confirmed', 'processing'];
    if (STOCK_DEDUCT_TARGETS.includes(newStatus) && !order.STOCKDEDUCTED) {
      stockUpdated = await deductStockForOrder(orderId, order.ITEMS);
      if (stockUpdated) {
        await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, { STOCKDEDUCTED: true });
        if (order.IS_VENDOR_ORDER || order.VENDOR_ID) {
          try { await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, orderId, { STOCKDEDUCTED: true }); } catch {}
        }
      }
    }
    // Caso B: Transición de confirmado a cancelado (cancelled) -> Restituir stock
    else if (order.STOCKDEDUCTED && newStatus === 'cancelled') {
      stockUpdated = await restoreStockForOrder(orderId, order.ITEMS);
      if (stockUpdated) {
        await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, { STOCKDEDUCTED: false });
        if (order.IS_VENDOR_ORDER || order.VENDOR_ID) {
          try { await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, orderId, { STOCKDEDUCTED: false }); } catch {}
        }
      }
    }

    // Revalidate y notificación en background: no bloquear la respuesta
    if (prevStatus !== newStatus) {
      if (order.STOCKDEDUCTED === true && !order.IS_VENDOR_ORDER && !order.VENDOR_ID) {
        try { revalidateTag('pos-web-reservations'); } catch {}
      }
      (async () => {
        try {
          revalidateTag('orders');
        } catch {}
        try {
          const { notifyOrderStatusChange } = await import('@/services/notificationService');
          const updatedOrder = { ...order, ...updatePayload };
          await notifyOrderStatusChange(updatedOrder, prevStatus, newStatus);
        } catch (notifErr) {
          console.warn('[update-status] WhatsApp notification failed:', notifErr);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      orderId,
      prevStatus,
      newStatus,
      stockUpdated,
    });
  } catch (error: any) {
    console.error('[API admin/orders/update-status] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
