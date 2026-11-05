import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, formatWhatsAppPhone, addToHistory } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const { phone, message } = await req.json();
    if (!phone || !message) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos: phone o message' }, { status: 400 });
    }

    const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
    if (!WA_TOKEN) {
      return NextResponse.json({ error: 'Falta WHATSAPP_ACCESS_TOKEN env variable en el servidor' }, { status: 500 });
    }

    const formattedPhone = formatWhatsAppPhone(phone);
    await sendWhatsAppMessage(formattedPhone, message, WA_TOKEN);
    
    // Save to Appwrite history
    await addToHistory(formattedPhone, 'assistant', message);

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    console.error('[WhatsApp Send API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
