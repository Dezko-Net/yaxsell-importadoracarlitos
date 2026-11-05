import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument, serverListDocuments, serverUpdateDocument } from '@/lib/firebase-server-compat';
import { VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/firebase-admin-compat';
import { expireUnpaidOrder, getOrderAutoCancelAt, PAYMENT_EXPIRATION_STATUSES } from '@/lib/order-stock-service';

export const dynamic = 'force-dynamic';
const SHIPPING_AGENCIES_COLLECTION_ID = 'shipping_agencies';

async function getOwnedOrder(request: NextRequest, id: string) {
  const order = await serverGetDocument(VENDOR_ORDERS_COLLECTION_ID, id) as any;
  if (!order) return null;
  const userId = request.nextUrl.searchParams.get('userId') || '';
  const email = request.nextUrl.searchParams.get('email') || '';
  const hasOwnerQuery = Boolean(userId || email);
  const ownsOrder = (userId && userId !== 'guest' && order.USERID === userId) || (email && String(order.CUSTOMEREMAIL || '').trim().toLowerCase() === email.trim().toLowerCase());
  if (!hasOwnerQuery || !ownsOrder) return null;
  return order;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let order = await getOwnedOrder(request, id);
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const autoCancelAt = getOrderAutoCancelAt(order);
    if (PAYMENT_EXPIRATION_STATUSES.includes(order.STATUS) && !order.PAYMENTPROOFURL && autoCancelAt > 0 && autoCancelAt <= Date.now()) {
      await expireUnpaidOrder(id);
      order = await getOwnedOrder(request, id);
      if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    const displayOrder = order.STATUS === 'payment_expired'
      ? { ...order, STATUS: order.PAYMENTPROOFURL ? 'payment_review' : 'paid' }
      : order;

    let branding: any = null;
    try {
      const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, order.VENDOR_ID) as any;
      branding = { name: vendor.NAME || 'Tienda asociada', color: vendor.BRAND_COLOR || '#f97316', secondaryColor: vendor.BRAND_SECONDARY_COLOR || '#fb923c', logoUrl: vendor.LOGO_URL || '', address: vendor.STORE_ADDRESS || '', phone: vendor.STORE_PHONE || '', email: vendor.STORE_EMAIL || vendor.EMAIL || '', website: vendor.STORE_WEBSITE || '', bankAccountHolder: vendor.BANK_ACCOUNT_HOLDER || '', bankRut: vendor.BANK_RUT || '', bankName: vendor.BANK_NAME || '', bankAccountType: vendor.BANK_ACCOUNT_TYPE || '', bankAccountNumber: vendor.BANK_ACCOUNT_NUMBER || '', bankEmail: vendor.BANK_EMAIL || '' };
    } catch {}
    return NextResponse.json({ order: displayOrder, branding });
  } catch (error: any) {
    console.error('[API public-data/vendor-order]', error);
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await getOwnedOrder(request, id);
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const editableStatuses = ['pending', 'pending_stock', 'processing', 'paid', 'payment_expired'];
    if (!editableStatuses.includes(String(order.STATUS))) {
      return NextResponse.json({ error: 'Los datos ya no se pueden editar después de enviar el comprobante.' }, { status: 400 });
    }

    const body = await request.json();
    const allowedFields = ['CUSTOMERRUT', 'CUSTOMEREMAIL', 'ADDRESS', 'COMUNA', 'REGION', 'ADDITIONALINFO', 'SHIPPINGAGENCY'];
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = String(body[field] || '').trim();
    }

    if (updateData.SHIPPINGAGENCY) {
      const agenciesRes = await serverListDocuments(SHIPPING_AGENCIES_COLLECTION_ID, [JSON.stringify({ method: 'limit', values: [100] })]);
      const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, order.VENDOR_ID) as any;
      const visible = vendor.VISIBLE_AGENCIES;
      let visibleIds: string[] | null = null;
      if (visible !== undefined && visible !== null && visible !== '') {
        try { visibleIds = Array.isArray(visible) ? visible : JSON.parse(visible); } catch { visibleIds = []; }
      }
      const allowedNames = (agenciesRes.documents || [])
        .filter((agency: any) => agency.active !== false && (!visibleIds || visibleIds.includes(agency.$id)))
        .map((agency: any) => String(agency.name || '').trim().toLowerCase());
      if (!allowedNames.includes(updateData.SHIPPINGAGENCY.toLowerCase())) {
        return NextResponse.json({ error: 'La agencia seleccionada no está habilitada para esta tienda.' }, { status: 400 });
      }
      updateData.AGENCYCHANGED = true;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No hay datos para actualizar.' }, { status: 400 });
    }
    updateData.UPDATEDAT = Date.now();
    await serverUpdateDocument(VENDOR_ORDERS_COLLECTION_ID, id, updateData);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[API public-data/vendor-order PATCH]', error);
    return NextResponse.json({ error: error?.message || 'No se pudieron actualizar los datos del pedido' }, { status: 500 });
  }
}
