import { NextRequest, NextResponse } from 'next/server';
import { getVendorSession } from '@/lib/vendor-auth';
import { serverGetDocument } from '@/lib/db-server';
import { VENDORS_COLLECTION_ID } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, session.vendorId) as any;
    if (!vendor || !vendor.ACTIVE) {
      return NextResponse.json({ error: 'Cuenta desactivada' }, { status: 403 });
    }
    return NextResponse.json({
      vendorId: vendor.$id,
      name: vendor.NAME,
      email: vendor.EMAIL,
      minPurchaseAmount: vendor.MIN_PURCHASE_AMOUNT || 0,
      storeWebsite: vendor.STORE_WEBSITE || '',
      logoUrl: vendor.LOGO_URL || '',
      brandColor: vendor.BRAND_COLOR || '#f97316',
      branding: {
        color: vendor.BRAND_COLOR || '#f97316',
        secondaryColor: vendor.BRAND_SECONDARY_COLOR || '#fb923c',
        logoUrl: vendor.LOGO_URL || '',
        address: vendor.STORE_ADDRESS || '',
        phone: vendor.STORE_PHONE || '',
        email: vendor.STORE_EMAIL || vendor.EMAIL || '',
        website: vendor.STORE_WEBSITE || '',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
}
