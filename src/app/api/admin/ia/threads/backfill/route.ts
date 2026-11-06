import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED, WHATSAPP_BOT_ENABLED } from '@/lib/feature-flags';
import { ADMIN_CHAT_COLLECTION_ID } from '@/lib/db';
import { getAdminDb } from '@/lib/db-server';
import { normalizePhone } from '@/lib/kenia-runtime';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';
import { WHATSAPP_THREAD_SUMMARIES_COLLECTION } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const META_COLLECTION = 'whatsapp_admin_metadata';
const INDEX_STATE_ID = 'thread_index';
const PAGE_SIZE = 100;

function asIso(value: unknown, fallback: string) {
  if (value && typeof (value as any).toDate === 'function') return (value as any).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = value ? new Date(String(value)) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

export async function POST(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!AI_ENABLED && !WHATSAPP_BOT_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const requestedCursor = typeof body.cursor === 'string' && body.cursor ? body.cursor : null;
    const db = getAdminDb();
    if (typeof (db as any).runTransaction !== 'function') {
      return NextResponse.json({ success: false, error: 'La optimización inicial requiere Firebase Admin en este servidor.' }, { status: 503 });
    }

    const chats = db.collection(ADMIN_CHAT_COLLECTION_ID);
    const summaries = db.collection(WHATSAPP_THREAD_SUMMARIES_COLLECTION);
    const stateRef = db.collection(META_COLLECTION).doc(INDEX_STATE_ID);
    const result = await db.runTransaction(async (tx: any) => {
      const stateSnap = await tx.get(stateRef);
      const state = stateSnap.exists ? stateSnap.data() || {} : {};
      const currentCursor = typeof state.lastDocId === 'string' && state.lastDocId ? state.lastDocId : null;
      if (state.complete) return { stale: false, complete: true, cursor: currentCursor, processed: Number(state.processed || 0), messagesIndexed: 0 };
      if (currentCursor !== requestedCursor) return { stale: true, complete: false, cursor: currentCursor, processed: Number(state.processed || 0), messagesIndexed: 0 };

      let query = chats.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
      if (currentCursor) query = query.startAfter(chats.doc(currentCursor));
      const page = await tx.get(query);
      const docs = page.docs as FirebaseFirestore.QueryDocumentSnapshot[];
      const indexedDocs = docs.filter((doc) => {
        const data = doc.data() as any;
        const rawPhone = String(data.userId || '').startsWith('whatsapp:') ? String(data.userId).slice('whatsapp:'.length) : '';
        return data.summaryIndexed !== true && !!normalizePhone(rawPhone);
      });

      const byPhone = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
      for (const doc of indexedDocs) {
        const data = doc.data() as any;
        const phone = normalizePhone(String(data.userId).slice('whatsapp:'.length));
        const group = byPhone.get(phone) || [];
        group.push(doc);
        byPhone.set(phone, group);
      }

      const phoneList = Array.from(byPhone.keys());
      const summaryRefs = phoneList.map((phone) => summaries.doc(phone));
      const summarySnaps = summaryRefs.length ? await tx.getAll(...summaryRefs) : [];
      const summaryByPhone = new Map(phoneList.map((phone, index) => [phone, summarySnaps[index]?.data() || {}]));
      const now = new Date().toISOString();

      // Toda lectura ocurre antes de que la transacción empiece a escribir.
      for (const doc of indexedDocs) tx.update(doc.ref, { summaryIndexed: true });

      let messagesIndexed = 0;
      for (const [phone, group] of byPhone) {
        const prior = summaryByPhone.get(phone) || {};
        const lastReadAt = prior.lastReadAt ? asIso(prior.lastReadAt, '') : '';
        let newestAt = asIso(prior.lastAt, '');
        let newestText = String(prior.preview || '');
        let customerMessages = 0;
        let adminMessages = 0;
        let unreadCount = 0;
        for (const doc of group) {
          const data = doc.data() as any;
          const at = doc.createTime.toDate().toISOString();
          const text = String(data.message || '').trim();
          if (data.senderRole === 'user') {
            customerMessages += 1;
            if (!data.readByAdmin && (!lastReadAt || at > lastReadAt)) unreadCount += 1;
          } else adminMessages += 1;
          if (!newestAt || at >= newestAt) {
            newestAt = at;
            newestText = text.slice(0, 500);
          }
          messagesIndexed += 1;
        }
        tx.set(summaries.doc(phone), {
          phone,
          preview: newestText,
          lastAt: newestAt,
          totalMessages: FieldValue.increment(group.length),
          customerMessages: FieldValue.increment(customerMessages),
          adminMessages: FieldValue.increment(adminMessages),
          unreadCount: FieldValue.increment(unreadCount),
          updatedAt: now,
        }, { merge: true });
      }

      const cursor = docs.length ? docs[docs.length - 1].id : currentCursor;
      const complete = docs.length < PAGE_SIZE;
      const processed = Number(state.processed || 0) + docs.length;
      tx.set(stateRef, { lastDocId: cursor || '', processed, complete, updatedAt: now }, { merge: true });
      return { stale: false, complete, cursor, processed, messagesIndexed };
    });

    const migration = {
      required: !result.complete,
      complete: result.complete,
      cursor: result.cursor,
      processed: result.processed,
      messagesIndexed: result.messagesIndexed,
    };
    if (result.stale) return NextResponse.json({ success: false, retry: true, migration, error: 'El índice avanzó desde otra sesión.' }, { status: 409 });
    return NextResponse.json({ success: true, migration });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo optimizar el historial de WhatsApp' }, { status: 500 });
  }
}
