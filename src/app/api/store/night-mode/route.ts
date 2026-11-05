import { NextResponse } from 'next/server';
import { getPaymentDeadline } from '@/lib/payment-deadline';

export const dynamic = 'force-dynamic';

/**
 * Compatibilidad temporal para pestañas con bundles antiguos en caché.
 * El modo nocturno ya no existe: siempre devuelve la política estándar.
 */
export async function GET() {
  return NextResponse.json(
    { night: false, paymentExpiresAt: getPaymentDeadline() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
