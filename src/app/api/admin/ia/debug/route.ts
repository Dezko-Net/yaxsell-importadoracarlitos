import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { getKeniaConfig, saveKeniaConfig, getKeniaUsage, resetKeniaUsage } from '@/lib/kenia-runtime';
import { clearHistory } from '@/lib/whatsapp';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';

const DEBUG_PHONE = '56985520703';

export async function GET(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const config = await getKeniaConfig();
    const usage = await getKeniaUsage(DEBUG_PHONE);
    return NextResponse.json({
      success: true,
      debugMode: config.debugMode || false,
      phone: DEBUG_PHONE,
      usage: {
        messageCount: usage.messageCount,
        totalTokens: usage.totalTokens,
        welcomeShown: usage.welcomeShown || false,
        registerPromptedAt: usage.registerPromptedAt || 0,
        testAsClient: usage.testAsClient || false,
        blocked: usage.blocked,
        escalated: usage.escalated || false,
        adminTakeover: usage.adminTakeover || false,
        spamBlocked: usage.spamBlocked || false,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === 'toggleDebug') {
      const config = await getKeniaConfig();
      const next = await saveKeniaConfig({ debugMode: !config.debugMode });
      return NextResponse.json({ success: true, debugMode: next.debugMode });
    }

    if (action === 'resetUser') {
      await resetKeniaUsage(DEBUG_PHONE);
      try { await clearHistory(DEBUG_PHONE); } catch {}
      return NextResponse.json({ success: true, message: 'Usuario reseteado correctamente' });
    }

    if (action === 'simulateRegisterClick') {
      const usage = await getKeniaUsage(DEBUG_PHONE);
      const config = await getKeniaConfig();
      const isRegistered = !!usage.messageCount || usage.welcomeShown;
      return NextResponse.json({
        success: true,
        isRegistered,
        debugMode: config.debugMode,
        message: isRegistered
          ? 'El cliente YA está registrado. Si envía un mensaje, Yaxbot lo saludará por nombre y mostrará el menú de bienvenida (si es primera interacción).'
          : 'El cliente NO está registrado. Si envía un mensaje, Yaxbot le pedirá que se registre en la página web.',
      });
    }

    return NextResponse.json({ success: false, error: 'Acción no reconocida' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Error' }, { status: 500 });
  }
}
