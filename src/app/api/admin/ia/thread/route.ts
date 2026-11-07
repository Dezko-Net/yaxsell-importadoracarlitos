import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { ADMIN_CHAT_COLLECTION_ID } from '@/lib/db';
import { serverListDocuments, serverUpdateDocument } from '@/lib/db-server';
import { getKeniaConfig, getKeniaUsage, normalizePhone } from '@/lib/kenia-runtime';

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
  // WhatsApp history is shared by the BOT and IA plans; either one can open the inbox.
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const phone = normalizePhone(req.nextUrl.searchParams.get('phone') || '');
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Falta el teléfono' }, { status: 400 });
    }

    const qUser = JSON.stringify({ method: 'equal', attribute: 'userId', values: [`whatsapp:${phone}`] });
    const qLimit = JSON.stringify({ method: 'limit', values: [200] });
    // Older WhatsApp history has no `createdAt` field; include it and sort in memory.
    const res = await serverListDocuments(ADMIN_CHAT_COLLECTION_ID, [qUser, qLimit]);
    const chatDocs = [...(res.documents || [])].sort((a: any, b: any) =>
      String(a.$createdAt || a.createdAt || '').localeCompare(String(b.$createdAt || b.createdAt || ''))
    );

    const unread = chatDocs.filter((doc: any) => doc.senderRole === 'user' && !doc.readByAdmin);
    await Promise.all(
      unread.map((doc: any) =>
        serverUpdateDocument(ADMIN_CHAT_COLLECTION_ID, doc.$id, { readByAdmin: true }).catch(() => null)
      )
    );

    const config = await getKeniaConfig();
    const usage = await getKeniaUsage(phone, config.blockedPhones);
    const messages = (chatDocs as ChatDoc[]).map((doc) => ({
      id: doc.$id,
      role: doc.senderRole === 'admin' ? 'assistant' : 'user',
      text: String(doc.message || ''),
      createdAt: String(doc.$createdAt || doc.createdAt || ''),
      readByAdmin: !!doc.readByAdmin,
      readByUser: !!doc.readByUser,
    }));

    return NextResponse.json({
      success: true,
      thread: {
        phone,
        messages,
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
