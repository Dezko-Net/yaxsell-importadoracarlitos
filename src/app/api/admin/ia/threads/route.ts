import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { serverGetDocument, serverListDocuments } from '@/lib/db-server';
import { getKeniaRuntimeSnapshot, normalizePhone } from '@/lib/kenia-runtime';
import { OWNER_WHATSAPP_PHONE } from '@/lib/store-contact';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';
import { WHATSAPP_THREAD_SUMMARIES_COLLECTION } from '@/lib/whatsapp';

const META_COLLECTION = 'whatsapp_admin_metadata';
const INDEX_STATE_ID = 'thread_index';

export async function GET(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const search = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() || '';
    const [summariesRes, runtime] = await Promise.all([
      // Una lectura por conversación sustituye el escaneo de 1.000 mensajes y pedidos.
      serverListDocuments(WHATSAPP_THREAD_SUMMARIES_COLLECTION, [
        JSON.stringify({ method: 'orderDesc', attribute: 'lastAt' }),
        JSON.stringify({ method: 'limit', values: [5000] }),
      ]),
      getKeniaRuntimeSnapshot(),
    ]);

    let indexState: Record<string, any> = {};
    try { indexState = await serverGetDocument(META_COLLECTION, INDEX_STATE_ID); } catch {}

    const blockedPhones = new Set((runtime.config.blockedPhones || []).map(normalizePhone));
    const adminPhones = new Set(OWNER_WHATSAPP_PHONE.split(',').map(normalizePhone).filter(Boolean));
    const threads = (summariesRes.documents || []).map((raw: any) => {
      const phone = normalizePhone(String(raw.phone || raw.$id || ''));
      if (!phone || Number(raw.totalMessages || 0) < 1) return null;
      const usage = runtime.usage[phone] || null;
      const tokenLimit = runtime.config.tokenLimitPerCustomer;
      const totalTokens = usage?.totalTokens || 0;
      return {
        phone,
        displayName: String(raw.customerName || usage?.customerName || `+${phone}`),
        preview: String(raw.preview || ''),
        lastAt: String(raw.lastAt || raw.$updatedAt || ''),
        totalMessages: Number(raw.totalMessages || 0),
        unreadCount: Number(raw.unreadCount || 0),
        customerMessages: Number(raw.customerMessages || 0),
        adminMessages: Number(raw.adminMessages || 0),
        segment: adminPhones.has(phone) ? 'admin' as const : 'customer' as const,
        blocked: blockedPhones.has(phone) || usage?.blocked || false,
        adminTakeover: usage?.adminTakeover || false,
        escalated: usage?.escalated || false,
        spamBlocked: usage?.spamBlocked || false,
        tokenLimit,
        totalTokens,
        promptTokens: usage?.promptTokens || 0,
        responseTokens: usage?.responseTokens || 0,
        overLimit: totalTokens >= tokenLimit,
        lastUsageAt: usage?.updatedAt || '',
      };
    }).filter((thread: any) => {
      if (!thread) return false;
      if (!search) return true;
      return thread.phone.includes(search) || thread.displayName.toLowerCase().includes(search) || thread.preview.toLowerCase().includes(search);
    }) as any[];

    const stats = {
      totalThreads: threads.length,
      customerThreads: threads.filter((thread) => thread.segment === 'customer').length,
      unreadThreads: threads.filter((thread) => thread.unreadCount > 0).length,
      blockedThreads: threads.filter((thread) => thread.blocked).length,
      overLimitThreads: threads.filter((thread) => thread.overLimit).length,
      totalTokens: threads.reduce((sum, thread) => sum + thread.totalTokens, 0),
    };
    const complete = indexState.complete === true;
    return NextResponse.json({
      success: true,
      threads,
      stats,
      migration: {
        required: !complete,
        complete,
        cursor: typeof indexState.lastDocId === 'string' && indexState.lastDocId ? indexState.lastDocId : null,
        processed: Number(indexState.processed || 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudieron cargar las conversaciones de Yaxbot' }, { status: 500 });
  }
}
