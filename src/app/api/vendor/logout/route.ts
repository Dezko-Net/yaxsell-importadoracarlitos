import { NextResponse } from 'next/server';
import { VENDOR_COOKIE_NAME } from '@/lib/vendor-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(VENDOR_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
