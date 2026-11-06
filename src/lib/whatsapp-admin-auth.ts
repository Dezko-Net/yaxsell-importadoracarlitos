import { NextRequest, NextResponse } from 'next/server';
import { hasWebAdminAccess } from '@/lib/admin-api-auth';

/** Protege la bandeja y sus acciones con la sesión Firebase del panel web. */
export async function requireWhatsAppAdmin(req: NextRequest): Promise<NextResponse | null> {
  if (await hasWebAdminAccess(req)) return null;
  return NextResponse.json(
    { success: false, error: 'Necesitas iniciar sesión con acceso al panel web.' },
    { status: 401 }
  );
}
