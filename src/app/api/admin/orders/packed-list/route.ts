import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { isAdminEmail } from '@/lib/admin-access';
import { ORDERS_COLLECTION_ID } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function authorized(request: NextRequest): Promise<boolean> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email) return false;
    if (isAdminEmail(email)) return true;
    const user = await getAdminDb().collection('erp_users').doc(email.replace(/[^a-z0-9_-]/g, '_')).get();
    const modules = user.data()?.modules;
    return Array.isArray(modules) && (modules.includes('web') || modules.includes('admin_supreme'));
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ error: 'Acceso al módulo web requerido.' }, { status: 403 });
  try {
    const db = getAdminDb();
    const orders: Array<{ id: string; code: string; customer: string; rut: string; phone: string; agency: string; address: string; comuna: string; region: string; tracking: string; boxSizes: string[]; boxCount: number }> = [];
    let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let query: FirebaseFirestore.Query = db.collection(ORDERS_COLLECTION_ID)
        .where('STATUS', '==', 'shipped').orderBy(FieldPath.documentId()).limit(200);
      if (last) query = query.startAfter(last);
      const page = await query.get();
      for (const doc of page.docs) {
        const o = doc.data();
        const boxSizes = Array.isArray(o.BOXSIZES) ? o.BOXSIZES.filter((size: unknown) => size === 'S' || size === 'M' || size === 'L') : [];
        const boxCount = Number(o.BULTOCOUNT);
        orders.push({ id: doc.id, code: String(o.ORDERCODE || doc.id), customer: String(o.CUSTOMERNAME || ''), rut: String(o.CUSTOMERRUT || ''), phone: String(o.CUSTOMERPHONE || ''), agency: String(o.SHIPPINGAGENCY || ''), address: String(o.ADDRESS || ''), comuna: String(o.COMUNA || ''), region: String(o.REGION || ''), tracking: String(o.TRACKINGNUMBER || ''), boxSizes, boxCount: Number.isInteger(boxCount) && boxCount > 0 ? boxCount : 0 });
      }
      if (orders.length > 5000) return NextResponse.json({ error: 'Hay más de 5.000 pedidos embalados. Acota la lista antes de imprimir.' }, { status: 413 });
      if (page.size < 200) break;
      last = page.docs[page.docs.length - 1];
    }
    orders.sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
    return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[packed-list] Error:', error);
    return NextResponse.json({ error: 'No se pudieron obtener todos los pedidos embalados.' }, { status: 500 });
  }
}
