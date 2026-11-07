import { NextResponse } from 'next/server';
import { getWebClientConfig } from '@/lib/web-client-config-server';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ config: await getWebClientConfig() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la configuración de la tienda.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
