import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument } from '@/lib/db-server';
import { VENDORS_COLLECTION_ID } from '@/lib/db';
import { signVendorToken, VENDOR_COOKIE_NAME } from '@/lib/vendor-auth';
import { isSupremeAdminRequest } from '@/lib/admin-api-auth';

export const dynamic = 'force-dynamic';

/**
 * Admin impersonation: permite al admin entrar al panel del vendor
 * sin saber su contraseña. Solo para uso del admin.
 */
export async function POST(req: NextRequest) {
  if (!await isSupremeAdminRequest(req)) return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 401 });
  try {
    const { vendorId } = await req.json();
    if (!vendorId) {
      return NextResponse.json({ error: 'Falta vendorId' }, { status: 400 });
    }

    const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, vendorId) as any;
    if (!vendor || vendor.ACTIVE !== true) {
      return NextResponse.json({ error: 'Vendedor no encontrado' }, { status: 404 });
    }

    const email = (vendor.EMAIL || '').toLowerCase();
    const name = vendor.NAME || '';

    const token = signVendorToken({ vendorId: vendor.$id, email, name });

    const response = NextResponse.json({ ok: true, vendorId: vendor.$id, name });
    response.cookies.set(VENDOR_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (err: any) {
    console.error('[vendor/impersonate]', err);
    return NextResponse.json({ error: 'Error al impersonar vendedor' }, { status: 500 });
  }
}
