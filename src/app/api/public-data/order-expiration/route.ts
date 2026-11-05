import { NextResponse } from 'next/server';
import { getConfiguredOrderExpirationMinutes } from '@/lib/order-expiration-settings';

export const dynamic = 'force-dynamic';

// Publica únicamente un número de configuración sin exponer el resto de settings.
export async function GET() {
  const configuredMinutes = await getConfiguredOrderExpirationMinutes();
  return NextResponse.json({ minutes: configuredMinutes }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
