import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { ADMIN_CHAT_COLLECTION_ID, ORDERS_COLLECTION_ID } from '@/lib/db';
import { serverListDocuments } from '@/lib/db-server';
import { getKeniaRuntimeSnapshot, normalizePhone } from '@/lib/kenia-runtime';

type ChatDoc = {
  $id: string;
  $createdAt?: string;
  createdAt?: string;
  userId?: string;
  senderRole?: string;
  message?: string;
  readByAdmin?: boolean;
};

export async function GET(req: NextRequest) {
  // WhatsApp history is shared by the BOT and IA plans; either one can open the inbox.
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const search = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() || '';
    const qLimit = JSON.stringify({ method: 'limit', values: [1000] });
    // Do not order in Firestore by `createdAt`: legacy chat docs lack that field.
    // Read them too, then use the document's real Firestore creation time below.
    const res = await serverListDocuments(ADMIN_CHAT_COLLECTION_ID, [qLimit]);
    const runtime = await getKeniaRuntimeSnapshot();
    const adminPhones = new Set(
      String(process.env.ADMIN_WHATSAPP_NUMBER || '')
        .split(',')
        .map((value) => normalizePhone(value))
        .filter(Boolean)
    );

    const map = new Map<string, any>();
    for (const raw of (res.documents || []) as ChatDoc[]) {
      const userId = String(raw.userId || '');
      if (!userId.startsWith('whatsapp:')) continue;
      const phone = normalizePhone(userId.replace('whatsapp:', ''));
      const text = String(raw.message || '').trim();
      const thread = map.get(phone) || {
        phone,
        displayName: `+${phone}`,
        preview: '',
        lastAt: '',
        totalMessages: 0,
        unreadCount: 0,
        customerMessages: 0,
        adminMessages: 0,
        segment: adminPhones.has(phone) ? 'admin' : 'customer',
      };

      thread.totalMessages += 1;
      if (raw.senderRole === 'user') {
        thread.customerMessages += 1;
        if (!raw.readByAdmin) thread.unreadCount += 1;
      } else {
        thread.adminMessages += 1;
      }
      const messageAt = String(raw.$createdAt || raw.createdAt || '');
      if (!thread.lastAt || messageAt >= thread.lastAt) {
        thread.lastAt = messageAt;
        thread.preview = text;
      }
      map.set(phone, thread);
    }

    // Build a map of phone -> customerName from orders (fallback when kenia_config doesn't exist)
    const phoneToName = new Map<string, string>();
    try {
      const qOrderDesc = JSON.stringify({ method: 'orderDesc', attribute: '$createdAt' });
      const qLimit200 = JSON.stringify({ method: 'limit', values: [200] });
      const ordersRes = await serverListDocuments(ORDERS_COLLECTION_ID, [qOrderDesc, qLimit200]);
      for (const o of (ordersRes.documents || []) as any[]) {
        const phone = normalizePhone(String(o.CUSTOMERPHONE || ''));
        const name = String(o.CUSTOMERNAME || '').trim();
        if (phone && name && name.length >= 2 && !phoneToName.has(phone)) {
          phoneToName.set(phone, name);
        }
      }
    } catch (e) {
      console.warn('[threads] Could not fetch orders for name lookup:', e);
    }

    const threads = Array.from(map.values())
      .map((thread) => {
        const usage = runtime.usage[thread.phone] || null;
        const tokenLimit = runtime.config.tokenLimitPerCustomer;
        const totalTokens = usage?.totalTokens || 0;
        const nameFromOrders = phoneToName.get(thread.phone) || '';
        return {
          ...thread,
          displayName: usage?.customerName || nameFromOrders || thread.displayName,
          blocked: usage?.blocked || false,
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
      })
      .filter((thread) => {
        if (!search) return true;
        return (
          thread.phone.includes(search) ||
          thread.displayName.toLowerCase().includes(search) ||
          thread.preview.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));

    const stats = {
      totalThreads: threads.length,
      customerThreads: threads.filter((thread) => thread.segment === 'customer').length,
      unreadThreads: threads.filter((thread) => thread.unreadCount > 0).length,
      blockedThreads: threads.filter((thread) => thread.blocked).length,
      overLimitThreads: threads.filter((thread) => thread.overLimit).length,
      totalTokens: threads.reduce((sum, thread) => sum + thread.totalTokens, 0),
    };

    return NextResponse.json({ success: true, threads, stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudieron cargar las conversaciones de Yaxbot' }, { status: 500 });
  }
}
