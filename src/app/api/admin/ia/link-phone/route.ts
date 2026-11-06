import { NextRequest, NextResponse } from 'next/server';
import { serverUpdateDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';

export async function POST(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  try {
    const { phone, orderIds } = await req.json();
    if (!phone || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = `+${cleanPhone}`;
    let linked = 0;

    for (const orderId of orderIds) {
      try {
        await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
          CUSTOMERPHONE: formattedPhone,
        });
        linked++;
      } catch (e) {
        console.warn(`[link-phone] Failed to update order ${orderId}:`, e);
      }
    }

    return NextResponse.json({ success: true, linked });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error' }, { status: 500 });
  }
}
