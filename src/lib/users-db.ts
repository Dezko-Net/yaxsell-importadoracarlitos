import { ID, Query } from '@/lib/db';
import { getServices, getFirebaseConfig, USERS_COLLECTION_ID } from '@/lib/db';

export interface UserProfileDoc {
  $id: string;
  userId?: string;
  email?: string;
  name?: string;
  phone?: string;
  region?: string;
  comuna?: string;
  address?: string;
  isWholesale?: boolean;
  isBanned?: boolean;
  adminNotes?: string;
  $createdAt: string;
}

export function normalizeUserEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

/** Clave estable para deduplicar (mismo Auth user o mismo email). */
export function userDocKey(doc: UserProfileDoc): string {
  const uid = doc.userId?.trim();
  if (uid) return `uid:${uid}`;
  const email = normalizeUserEmail(doc.email);
  if (email) return `email:${email}`;
  return `doc:${doc.$id}`;
}

/** Un registro por persona; prioriza documento con userId de Appwrite Auth. */
export function dedupeUserDocuments(docs: UserProfileDoc[]): UserProfileDoc[] {
  const byKey = new Map<string, UserProfileDoc>();
  for (const doc of docs) {
    const key = userDocKey(doc);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, doc);
      continue;
    }
    const score = (d: UserProfileDoc) =>
      (d.userId?.trim() ? 4 : 0) + (normalizeUserEmail(d.email).includes('@') ? 2 : 0);
    const prevScore = score(prev);
    const docScore = score(doc);
    if (docScore > prevScore) {
      byKey.set(key, doc);
      continue;
    }
    if (docScore === prevScore) {
      const prevT = new Date(prev.$createdAt || 0).getTime();
      const docT = new Date(doc.$createdAt || 0).getTime();
      if (docT >= prevT) byKey.set(key, doc);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime(),
  );
}

/** Cliente con email válido (colección users o sincronizado desde Auth). */
export function isRegisteredUserProfile(doc: UserProfileDoc): boolean {
  const email = normalizeUserEmail(doc.email);
  return !!email && email.includes('@');
}

let _userProfilesCache: { data: UserProfileDoc[]; ts: number; limit: number } | null = null;
const USER_PROFILES_CACHE_TTL = 5 * 60 * 1000;
const _upsertedSessionCache = new Map<string, { id: string; hash: string }>();

export async function listAllUserProfiles(limit = 500): Promise<UserProfileDoc[]> {
  const now = Date.now();
  if (_userProfilesCache && _userProfilesCache.limit >= limit && now - _userProfilesCache.ts < USER_PROFILES_CACHE_TTL) {
    return _userProfilesCache.data.slice(0, limit);
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('yaxsell_user_profiles_cache_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data && parsed.limit >= limit && now - Number(parsed.ts || 0) < USER_PROFILES_CACHE_TTL) {
          _userProfilesCache = parsed;
          return (parsed.data as UserProfileDoc[]).slice(0, limit);
        }
      }
    } catch {}
  }

  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();
  const pageSize = Math.min(limit, 500);
  const queries: string[] = [Query.orderDesc('$createdAt'), Query.limit(pageSize)];
  const resp = await databases.listDocuments(databaseId, USERS_COLLECTION_ID, queries);
  const docs = (resp.documents as unknown as UserProfileDoc[]).slice(0, limit);

  _userProfilesCache = { data: docs, ts: now, limit: pageSize };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('yaxsell_user_profiles_cache_v1', JSON.stringify(_userProfilesCache));
    } catch {}
  }

  return docs;
}

export function mergeAuthUsersWithProfiles(
  profiles: UserProfileDoc[],
  authUsers: { $id: string; email?: string; name?: string; $createdAt?: string }[],
): UserProfileDoc[] {
  const byEmail = new Map<string, UserProfileDoc>();
  const byUid = new Map<string, UserProfileDoc>();

  for (const p of profiles) {
    const email = normalizeUserEmail(p.email);
    if (email) byEmail.set(email, p);
    if (p.userId?.trim()) byUid.set(p.userId.trim(), p);
  }

  const merged = [...profiles];

  for (const au of authUsers) {
    const email = normalizeUserEmail(au.email);
    if (!email || !email.includes('@')) continue;
    if (byUid.has(au.$id) || byEmail.has(email)) continue;

    merged.push({
      $id: `auth:${au.$id}`,
      userId: au.$id,
      email,
      name: au.name || email.split('@')[0],
      $createdAt: au.$createdAt || new Date().toISOString(),
    });
  }

  return dedupeUserDocuments(merged);
}

export async function upsertUserProfile(input: {
  userId: string;
  email: string;
  name?: string;
  phone?: string;
}): Promise<void> {
  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();
  const email = normalizeUserEmail(input.email);
  if (!email) return;

  const payload: Record<string, string> = {
    userId: input.userId,
    email,
    name: (input.name || 'Usuario').trim(),
    phone: input.phone || '',
  };

  const cacheKey = input.userId || email;
  const payloadHash = `${payload.userId}|${payload.email}|${payload.name}|${payload.phone}`;
  const cached = _upsertedSessionCache.get(cacheKey);
  if (cached && cached.hash === payloadHash) {
    return;
  }

  let existingId: string | null = cached?.id || null;

  if (!existingId && input.userId) {
    const byUid = await databases.listDocuments(databaseId, USERS_COLLECTION_ID, [
      Query.equal('userId', input.userId),
      Query.limit(1),
    ]);
    if (byUid.documents[0]) existingId = byUid.documents[0].$id;
  }

  if (!existingId) {
    const byEmail = await databases.listDocuments(databaseId, USERS_COLLECTION_ID, [
      Query.equal('email', email),
      Query.limit(1),
    ]);
    if (byEmail.documents[0]) existingId = byEmail.documents[0].$id;
  }

  if (existingId) {
    await databases.updateDocument(databaseId, USERS_COLLECTION_ID, existingId, payload);
    _upsertedSessionCache.set(cacheKey, { id: existingId, hash: payloadHash });
  } else {
    const created = await databases.createDocument(databaseId, USERS_COLLECTION_ID, ID.unique(), {
      ...payload,
      createdAt: new Date().toISOString(),
    });
    _upsertedSessionCache.set(cacheKey, { id: created.$id, hash: payloadHash });
  }
}
