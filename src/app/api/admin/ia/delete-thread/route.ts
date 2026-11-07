import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED } from '@/lib/feature-flags';
import { normalizePhone, deleteKeniaPhone } from '@/lib/kenia-runtime';
import { clearHistory } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone || '');
    if (!phone) return NextResponse.json({ success: false, error: 'Falta el teléfono' }, { status: 400 });

    await clearHistory(phone);
    await deleteKeniaPhone(phone);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Error' }, { status: 500 });
  }
}
