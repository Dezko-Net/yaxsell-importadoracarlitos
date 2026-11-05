import { AI_ENABLED } from '@/lib/feature-flags';

import { NextRequest, NextResponse } from 'next/server';
import { getKeniaConfig, saveKeniaConfig } from '@/lib/kenia-runtime';
import { revalidateTag } from 'next/cache';

export async function GET() {
  try {
    const config = await getKeniaConfig();
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo cargar la configuración de Yaxbot' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const config = await saveKeniaConfig({
      adminPrompt: typeof body.adminPrompt === 'string' ? body.adminPrompt : undefined,
      customerPrompt: typeof body.customerPrompt === 'string' ? body.customerPrompt : undefined,
      adminAlertPhone: typeof body.adminAlertPhone === 'string' ? body.adminAlertPhone : undefined,
      tokenLimitPerCustomer: typeof body.tokenLimitPerCustomer === 'number' ? body.tokenLimitPerCustomer : undefined,
      smartNotifications: typeof body.smartNotifications === 'boolean' ? body.smartNotifications : undefined,
      messageThresholdForPause: typeof body.messageThresholdForPause === 'number' ? body.messageThresholdForPause : undefined,
      isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : undefined,
    });
    revalidateTag('kenia-status');
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo guardar la configuración de Yaxbot' }, { status: 500 });
  }
}
