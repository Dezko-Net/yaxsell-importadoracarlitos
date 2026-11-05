import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument } from '@/lib/db-server';
import { VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/db';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code = (request.nextUrl.searchParams.get('code') || '').trim();
    const id = (request.nextUrl.searchParams.get('id') || '').trim();
    if (!code && !id) return NextResponse.json({ error: 'Falta código o ID de pedido' }, { status: 400 });

    const lookup = id
      ? await resolveOrderById(id, [VENDOR_ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(code, [VENDOR_ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') {
      return NextResponse.json({ error: 'Ese número corresponde a más de un pedido. Usa el enlace directo para continuar.', code: 'AMBIGUOUS_ORDER_CODE' }, { status: 409 });
    }
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    const order = lookup.match.order as any;

    const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, String(order.VENDOR_ID)) as any;
    return NextResponse.json({
      order,
      vendor: vendor ? {
        name: vendor.NAME || 'Tienda asociada',
        logoUrl: vendor.LOGO_URL || '',
        brandColor: vendor.BRAND_COLOR || '#f97316',
        bankAccountHolder: vendor.BANK_ACCOUNT_HOLDER || '',
        bankRut: vendor.BANK_RUT || '',
        bankName: vendor.BANK_NAME || '',
        bankAccountType: vendor.BANK_ACCOUNT_TYPE || '',
        bankAccountNumber: vendor.BANK_ACCOUNT_NUMBER || '',
        bankEmail: vendor.BANK_EMAIL || '',
      } : null,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error: any) {
    console.error('[API vendor/public-order]', error);
    return NextResponse.json({ error: error.message || 'Error al obtener pedido' }, { status: 500 });
  }
}
