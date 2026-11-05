import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { getCachedPosWebReservations } from '@/lib/pos-web-reservations';
import { isAdminEmail } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

async function canReadPosReservations(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email) return false;
    if (isAdminEmail(email)) return true;
    const userId = email.replace(/[^a-z0-9_-]/g, '_');
    const account = await getAdminDb().collection('erp_users').doc(userId).get();
    const data = account.exists ? account.data() || {} : {};
    const modules: string[] = Array.isArray(data.modules) ? data.modules : [];
    return modules.some(module => ['pos', 'pos_admin', 'admin_supreme'].includes(module))
      || ['medio', 'alto'].includes(String(data.nivelAccesoPos || ''))
      || Boolean(data.role && data.role !== 'visitante');
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const canSeeOrderCodes = await canReadPosReservations(req);
  try {
    const reservations = await getCachedPosWebReservations();
    const visibleReservations = Object.fromEntries(
      Object.entries(reservations.byKey).map(([key, info]) => [key, {
        qty: info.qty,
        orderCount: info.orderCount,
        orderCodes: canSeeOrderCodes ? info.orderCodes : [],
      }]),
    );
    return NextResponse.json(
      { ok: true, reservations: visibleReservations, serverTime: Date.now() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error: any) {
    console.error('[api/pos/web-reservations] Error consultando reservas web:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error consultando reservas web', reservations: {} },
      { status: 500 }
    );
  }
}
