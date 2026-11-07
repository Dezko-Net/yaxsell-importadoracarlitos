import { NextResponse } from 'next/server';
import { FIREBASE_PUBLIC_CONFIG, hasFirebasePublicConfig } from '@/lib/firebase-public-config';

export const dynamic = 'force-dynamic';
export function GET() {
  const project = FIREBASE_PUBLIC_CONFIG.projectId;
  const configuredId = process.env.NEXT_PUBLIC_CATALOG_CLIENT_ID || (project === 'importadora-carlitos' ? 'carlitos' : project);
  const clientId = configuredId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clientId || !hasFirebasePublicConfig()) return new NextResponse('/* Configuración del catálogo no disponible */', { status: 503 });
  const payload = JSON.stringify({ firebase: FIREBASE_PUBLIC_CONFIG, clientId });
  return new NextResponse(`window.__CATALOG_CONFIG__ = ${payload};`, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
