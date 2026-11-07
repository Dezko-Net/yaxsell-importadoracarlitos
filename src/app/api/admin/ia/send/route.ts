import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED } from '@/lib/feature-flags';
import { addToHistory, sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone, setKeniaBlocked } from '@/lib/kenia-runtime';

export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone || '');
    const text = String(body.text || '').trim();
    if (!phone || !text) {
      return NextResponse.json({ success: false, error: 'Faltan teléfono o mensaje' }, { status: 400 });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
    if (!token) {
      return NextResponse.json({ success: false, error: 'No está configurado WHATSAPP_ACCESS_TOKEN en el servidor' }, { status: 500 });
    }

    await sendWhatsAppMessage(phone, text, token);
    await addToHistory(phone, 'assistant', text);
    await setKeniaBlocked(phone, false);
    return NextResponse.json({ success: true, reactivated: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo enviar el mensaje de Yaxbot' }, { status: 500 });
  }
}
