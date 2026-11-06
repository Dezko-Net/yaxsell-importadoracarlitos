import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { ADMIN_CHAT_COLLECTION_ID } from '@/lib/db';
import { getAdminDb, serverCreateDocument, serverGetDocument, serverListDocuments, serverUpdateDocument } from '@/lib/db-server';
import { getKeniaConfig, getKeniaUsage, normalizePhone } from '@/lib/kenia-runtime';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';
import { WHATSAPP_THREAD_SUMMARIES_COLLECTION } from '@/lib/whatsapp';

type ChatDoc = {
  $id: string;
  $createdAt?: string;
  createdAt?: string;
  senderRole?: string;
  message?: string;
  readByAdmin?: boolean;
  readByUser?: boolean;
};

export async function GET(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const openedAt = new Date().toISOString();
    const phone = normalizePhone(req.nextUrl.searchParams.get('phone') || '');
    if (!phone) return NextResponse.json({ success: false, error: 'Falta el teléfono' }, { status: 400 });

    const qUser = JSON.stringify({ method: 'equal', attribute: 'userId', values: [`whatsapp:${phone}`] });
    const qLimit = JSON.stringify({ method: 'limit', values: [200] });
    const res = await serverListDocuments(ADMIN_CHAT_COLLECTION_ID, [qUser, qLimit]);
    const chatDocs = [...(res.documents || [])].sort((a: any, b: any) =>
      String(a.$createdAt || a.createdAt || '').localeCompare(String(b.$createdAt || b.createdAt || ''))
    );
    const unreadSeenBeforeOpen = chatDocs.filter((doc: any) => {
      const at = String(doc.$createdAt || doc.createdAt || '');
      return doc.senderRole === 'user' && !doc.readByAdmin && at && at <= openedAt;
    });

    // Un marcador por conversación sustituye hasta 200 escrituras por apertura.
    const db = getAdminDb();
    const summaryRef = db.collection(WHATSAPP_THREAD_SUMMARIES_COLLECTION).doc(phone);
    let unreadCount: number | undefined;
    if (unreadSeenBeforeOpen.length > 0 && typeof (db as any).runTransaction === 'function') {
      unreadCount = await (db as any).runTransaction(async (tx: any) => {
        const summarySnap = await tx.get(summaryRef);
        const summary = summarySnap.exists ? summarySnap.data() || {} : {};
        const currentUnread = Math.max(0, Number(summary.unreadCount || 0));
        const latestAt = String(summary.lastAt || '');
        const noNewMessages = !latestAt || latestAt <= openedAt;
        const nextUnread = noNewMessages ? 0 : Math.max(0, currentUnread - unreadSeenBeforeOpen.length);
        tx.set(summaryRef, {
          phone,
          lastReadAt: openedAt,
          unreadCount: nextUnread,
          ...(!summarySnap.exists ? { totalMessages: 0, customerMessages: 0, adminMessages: 0 } : {}),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        return nextUnread;
      });
    } else if (unreadSeenBeforeOpen.length > 0) {
      let summary: any = {};
      try { summary = await serverGetDocument(WHATSAPP_THREAD_SUMMARIES_COLLECTION, phone); } catch {}
      const currentUnread = Math.max(0, Number(summary.unreadCount || 0));
      const latestAt = String(summary.lastAt || '');
      unreadCount = !latestAt || latestAt <= openedAt ? 0 : Math.max(0, currentUnread - unreadSeenBeforeOpen.length);
      const payload = {
        phone,
        lastReadAt: openedAt,
        unreadCount,
        ...(!summary.totalMessages ? { totalMessages: 0, customerMessages: 0, adminMessages: 0 } : {}),
        updatedAt: new Date().toISOString(),
      };
      try { await serverUpdateDocument(WHATSAPP_THREAD_SUMMARIES_COLLECTION, phone, payload); }
      catch { await serverCreateDocument(WHATSAPP_THREAD_SUMMARIES_COLLECTION, phone, payload); }
    }

    const config = await getKeniaConfig();
    const usage = await getKeniaUsage(phone, config.blockedPhones);
    const messages = (chatDocs as ChatDoc[]).map((doc) => ({
      id: doc.$id,
      role: doc.senderRole === 'admin' ? 'assistant' : 'user',
      text: String(doc.message || ''),
      createdAt: String(doc.$createdAt || doc.createdAt || ''),
      readByAdmin: !!doc.readByAdmin || (doc.senderRole === 'user' && String(doc.$createdAt || doc.createdAt || '') <= openedAt),
      readByUser: !!doc.readByUser,
    }));

    return NextResponse.json({
      success: true,
      thread: {
        phone,
        messages,
        ...(unreadCount !== undefined ? { unreadCount } : {}),
        usage: {
          ...usage,
          overLimit: usage.totalTokens >= config.tokenLimitPerCustomer,
          tokenLimit: config.tokenLimitPerCustomer,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo cargar la conversación' }, { status: 500 });
  }
}
