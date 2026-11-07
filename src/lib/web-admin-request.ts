import 'server-only';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { isAdminEmail } from '@/lib/admin-access';

export async function isWebAdminRequest(request: NextRequest): Promise<boolean> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email) return false;
    if (isAdminEmail(email)) return true;
    const snapshot = await getAdminDb().collection('erp_users').doc(email.replace(/[^a-z0-9_-]/g, '_')).get();
    const modules = snapshot.data()?.modules;
    return Array.isArray(modules) && (modules.includes('web') || modules.includes('admin_supreme'));
  } catch { return false; }
}
