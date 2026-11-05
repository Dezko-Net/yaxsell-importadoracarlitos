import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';

export const dynamic = 'force-dynamic';

/** Elimina welcomeCouponCode y autoApplyCoupon de prefs de todos los usuarios. */
export async function POST() {
  try {
    const db = getAdminDb();

    // Buscar todos los usuarios que tengan welcomeCouponCode o autoApplyCoupon en prefs
    const snap = await db.collection('users').limit(500).get();

    let removedCount = 0;
    let errors = 0;

    for (const doc of snap.docs) {
      try {
        const data = doc.data() as any;
        const prefs = data.prefs || {};
        if (!prefs.welcomeCouponCode && !prefs.autoApplyCoupon) continue;

        await doc.ref.update({
          prefs: {
            ...prefs,
            welcomeCouponCode: null,
            autoApplyCoupon: null,
          },
        });
        removedCount++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ ok: true, removedCount, totalUsers: snap.size, errors });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
