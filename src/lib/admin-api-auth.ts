import 'server-only';

import { getAuth } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { getAdminApp } from '@/lib/db-server';
import { isAdminEmail } from '@/lib/admin-access';

const gAdminAuth = globalThis as unknown as {
  __yaxsellAdminTokenCache?: Map<string, { isAdmin: boolean; exp: number }>;
};

function getTokenCache() {
  if (!gAdminAuth.__yaxsellAdminTokenCache) {
    gAdminAuth.__yaxsellAdminTokenCache = new Map();
  }
  return gAdminAuth.__yaxsellAdminTokenCache;
}

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

/** True only for a valid Firebase session belonging to the supreme admin. */
export async function isSupremeAdminRequest(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const now = Date.now();
  const cache = getTokenCache();
  const cached = cache.get(token);
  if (cached && cached.exp > now) {
    return cached.isAdmin;
  }

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const isAdmin = isAdminEmail(decoded.email);
    if (cache.size > 200) cache.clear();
    const tokenExpMs = decoded.exp ? decoded.exp * 1000 : now + TOKEN_CACHE_TTL_MS;
    cache.set(token, { isAdmin, exp: Math.min(now + TOKEN_CACHE_TTL_MS, tokenExpMs) });
    return isAdmin;
  } catch {
    return false;
  }
}
