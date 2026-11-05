import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 60;
import { notifyOrderStatusChange } from '@/services/notificationService';
import type { Order } from '@/types/admin';

export async function POST(req: NextRequest) {
  try {
    const events = req.headers.get('x-appwrite-webhook-events') || '';
    const body = await req.json() as Order;

    console.log('[Webhook Orders] Event:', events, '| Order ID:', body.$id);

    // Identificar tipo de evento
    const isCreate = events.includes('.create');
    const isUpdate = events.includes('.update');

    if (isCreate || isUpdate) {
      // 1. Notificar al Cliente
      // 'existsByRefKey' adentro de la función previene envíos duplicados para el mismo estado
      await notifyOrderStatusChange(body, undefined, body.STATUS);

      // 2. Notificar al Admin — SOLO cuando se sube comprobante (payment_review),
      //    no en cada pedido nuevo (evita spam). notifyPaymentUploaded se maneja
      //    en /api/catalogo/upload-proof y /api/whatsapp/webhook.
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Webhook Orders] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
