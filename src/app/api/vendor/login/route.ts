import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { VENDORS_COLLECTION_ID } from '@/lib/db';
import { signVendorToken, verifyPassword, VENDOR_COOKIE_NAME } from '@/lib/vendor-auth';
import { Query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Falta email o contraseña' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const res = await serverListDocuments(VENDORS_COLLECTION_ID, [
      Query.equal('EMAIL', normalizedEmail),
      Query.limit(1),
    ]);
    const vendor = res.documents?.[0] as any;

    // Mismo mensaje de error para email inexistente y contraseña incorrecta
    // (evita filtrar qué emails existen en el sistema).
    if (!vendor || !vendor.ACTIVE || !verifyPassword(password, vendor.PASSWORD_HASH)) {
      return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 });
    }

    const token = signVendorToken({ vendorId: vendor.$id, email: normalizedEmail, name: vendor.NAME || '' });

    const response = NextResponse.json({ ok: true, name: vendor.NAME });
    response.cookies.set(VENDOR_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (err: any) {
    console.error('[vendor/login]', err);
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 });
  }
}
