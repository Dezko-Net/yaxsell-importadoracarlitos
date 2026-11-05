// Client-safe notification helpers.
//
// NotificationsOverlay (a 'use client' component) must NOT import from
// notificationService.ts: that module pulls in @/lib/google-auth (which is
// `import 'server-only'`) and @/lib/firebase-server-compat, tainting the client bundle
// and breaking `next build`. These three functions only touch the Appwrite
// browser SDK, so they live here and are imported by client components instead.

import { getServices, getFirebaseConfig, NOTIFICATIONS_COLLECTION } from '@/lib/db';

function parseDataField(data?: unknown): { link?: string; refKey?: string } {
  if (!data || typeof data !== 'string') return {};
  try {
    return JSON.parse(data) as { link?: string; refKey?: string };
  } catch {
    return {};
  }
}

function normalizeRead(doc: Record<string, unknown>): boolean {
  return !!(doc.isRead ?? doc.read ?? doc.READ);
}

export function getNotificationLink(doc: Record<string, unknown>): string | undefined {
  const direct = (doc.link || doc.LINK) as string | undefined;
  if (direct) return direct;
  return parseDataField(doc.data).link;
}

export function isNotificationUnread(doc: Record<string, unknown>): boolean {
  return !normalizeRead(doc);
}

export async function markNotificationRead(documentId: string) {
  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();
  await databases.updateDocument(databaseId, NOTIFICATIONS_COLLECTION, documentId, {
    isRead: true,
  });
}

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'promo'
  | 'order'
  | 'stock'
  | 'product'
  | 'gift';

export interface CreateNotificationInput {
  title: string;
  message: string;
  type: NotificationType;
  userId?: string;
  link?: string;
  refKey?: string;
  broadcast?: boolean;
}

function buildDataPayload(link?: string, refKey?: string): string | undefined {
  if (!link && !refKey) return undefined;
  const obj: Record<string, string> = {};
  if (link) obj.link = link;
  if (refKey) obj.refKey = refKey;
  return JSON.stringify(obj);
}

/** Crea notificación vía cliente (admin logueado). */
export async function createNotificationClient(input: CreateNotificationInput) {
  const { ID } = await import('@/lib/db');
  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();
  const payload: Record<string, unknown> = {
    title: input.title,
    message: input.message,
    type: input.type,
    isRead: false,
    userId: input.userId || (input.broadcast ? 'all' : ''),
  };
  const data = buildDataPayload(input.link, input.refKey);
  if (data) payload.data = data;
  return databases.createDocument(databaseId, NOTIFICATIONS_COLLECTION, ID.unique(), payload);
}

export async function resolveUserIdFromOrder(order: any): Promise<string | null> {
  if (order.USERID && order.USERID !== 'guest') return order.USERID;
  if (!order.CUSTOMEREMAIL) return null;
  try {
    const { Query, USERS_COLLECTION } = await import('@/lib/db');
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const res = await databases.listDocuments(databaseId, USERS_COLLECTION, [
      Query.equal('email', order.CUSTOMEREMAIL),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as { userId?: string } | undefined;
    return doc?.userId || null;
  } catch {
    return null;
  }
}
