import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { normalizePhone, setKeniaBlocked } from '@/lib/kenia-runtime';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';

export async function POST(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone || '');
    const blocked = Boolean(body.blocked);
    const reason = body.reason; // 'admin_takeover' | 'spam' | 'manual'
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Falta el teléfono' }, { status: 400 });
    }
    const usage = await setKeniaBlocked(phone, blocked, reason);
    return NextResponse.json({ success: true, usage });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo actualizar el bloqueo del cliente' }, { status: 500 });
  }
}
