import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';
import { sendWhatsAppMessage, formatWhatsAppPhone, addToHistory } from '@/lib/whatsapp';
import { getWebClientConfig } from '@/lib/web-client-config-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId es requerido' }, { status: 400 });
    }

    const order = await serverGetDocument(ORDERS_COLLECTION_ID, orderId) as any;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const rawPhone = order.CUSTOMERPHONE || '';
    if (!rawPhone) {
      return NextResponse.json({ error: 'El pedido no tiene teléfono registrado del cliente' }, { status: 400 });
    }

    const customerName = (order.CUSTOMERNAME || 'Cliente').split(' ')[0];
    const orderCode = order.ORDERCODE || '#' + order.$id.slice(-6);
    const webConfig = await getWebClientConfig();
    const siteUrl = webConfig.siteUrl;
    if (!siteUrl) return NextResponse.json({ error: 'Configura la URL pública en Admin Supreme Web.' }, { status: 503 });
    const shippingUrl = `${siteUrl}/datos-envio?id=${encodeURIComponent(order.$id)}`;

    const message = `¡Hola ${customerName}! 🐾✨ Te escribimos de ${webConfig.storeName}.\n\n` +
      `✅ Tu pago del pedido *#${orderCode}* fue verificado y confirmado con éxito, y tus productos ya están *100% apartados en bodega* 📦.\n\n` +
      `👉 Para poder armar tu paquete y despacharlo lo antes posible, por favor completa tu dirección y selecciona tu agencia de transporte en este enlace:\n` +
      `🔗 ${shippingUrl}\n\n` +
      `*(Solo te tomará 1 minuto; tu comprobante de transferencia ya está guardado en el sistema)*. ¡Muchas gracias por tu compra! 🙌`;

    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanDigits.startsWith('56') ? cleanDigits : '56' + cleanDigits;
    const formattedPhone = formatWhatsAppPhone(rawPhone);
    const waLink = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;

    // Intentar envío automático vía WhatsApp Cloud API
    const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
    let autoSent = false;
    let autoSendError: string | null = null;

    if (WA_TOKEN) {
      try {
        await sendWhatsAppMessage(formattedPhone, message, WA_TOKEN);
        await addToHistory(formattedPhone, 'assistant', message);
        autoSent = true;
      } catch (err: any) {
        console.warn('[notify-shipping-data] Envío automático WhatsApp falló, se provee waLink de respaldo:', err.message);
        autoSendError = err.message;
      }
    } else {
      autoSendError = 'Sin WHATSAPP_ACCESS_TOKEN configurado';
    }

    return NextResponse.json({
      success: true,
      autoSent,
      autoSendError,
      message,
      waLink,
      phone: formattedPhone,
      customerName,
      orderCode,
      shippingUrl,
    });
  } catch (error: any) {
    console.error('[notify-shipping-data] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al procesar notificación' }, { status: 500 });
  }
}
