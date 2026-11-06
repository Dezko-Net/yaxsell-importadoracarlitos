import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { normalizePhone, resetKeniaUsage } from '@/lib/kenia-runtime';
import { clearHistory } from '@/lib/whatsapp';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';

export async function POST(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone || '');
    const deleteUsage = body.deleteUsage === true;
    if (!phone) return NextResponse.json({ success: false, error: 'Falta el teléfono' }, { status: 400 });

    await clearHistory(phone);
    if (deleteUsage) {
      await resetKeniaUsage(phone);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Error' }, { status: 500 });
  }
}
