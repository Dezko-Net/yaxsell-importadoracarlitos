import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { addToHistory, sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone, setKeniaBlocked } from '@/lib/kenia-runtime';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';

export async function POST(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
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
    // Al responder manualmente, toma el control el administrador y Yaxbot se pausa.
    await setKeniaBlocked(phone, true, 'admin_takeover');
    return NextResponse.json({ success: true, adminTakeover: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo enviar el mensaje de Yaxbot' }, { status: 500 });
  }
}
