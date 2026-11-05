import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb, serverUploadFile, getPublicFileUrl } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, MEDIA_PREFIXES } from '@/lib/db';
import { parsePaymentProofs, serializePaymentProofs, MAX_PAYMENT_PROOFS } from '@/lib/payment-proofs';
import { compressImageKeepFormat } from '@/lib/image-compression';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';

export const dynamic = 'force-dynamic';

// Ruta base para comprobantes de la tienda principal
const COMPROBANTES_PATH = MEDIA_PREFIXES.comprobantes.replace(/\/$/, '');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const orderId = String(formData.get('orderId') || '').trim();
    const orderCode = String(formData.get('orderCode') || '');
    const file = formData.get('file') as File | null;
    if ((!orderId && !orderCode) || !file) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

    const lookup = orderId
      ? await resolveOrderById(orderId, [VENDOR_ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode, [VENDOR_ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') {
      return NextResponse.json({ error: 'El número corresponde a más de un pedido. Abre el enlace original del pedido para subir el comprobante.' }, { status: 409 });
    }
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    const order = lookup.match.order as any;

    const existing = parsePaymentProofs(order.PAYMENTPROOFURL);
    if (existing.length >= MAX_PAYMENT_PROOFS) return NextResponse.json({ error: 'Solo se permiten hasta 3 comprobantes de pago' }, { status: 400 });

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer);
    const originalName = file.name || 'proof.jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.${format}`;
    const uploaded = await serverUploadFile(COMPROBANTES_PATH, compressedBuffer, fileName);
    const fileUrl = getPublicFileUrl(COMPROBANTES_PATH, String((uploaded as any).$id));
    const db = getAdminDb();
    const vendorOrderRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(order.$id);
    const mainOrderRef = db.collection(ORDERS_COLLECTION_ID).doc(order.$id);
    await db.runTransaction(async transaction => {
      const [vendorSnap, mainSnap] = await Promise.all([
        transaction.get(vendorOrderRef),
        transaction.get(mainOrderRef),
      ]);
      if (!vendorSnap.exists) throw Object.assign(new Error('Pedido no encontrado'), { statusCode: 404 });

      const vendorOrder = vendorSnap.data() || {};
      const mainOrder = mainSnap.exists ? mainSnap.data() || {} : null;
      const copies = [vendorOrder, mainOrder].filter(Boolean) as Record<string, any>[];
      const statuses = copies.map(copy => String(copy.STATUS || '').toLowerCase());
      const uploadableStatuses = ['pending', 'pending_stock', 'processing', 'paid', 'payment_expired', 'payment_review'];
      if (statuses.some(status => !uploadableStatuses.includes(status))) {
        throw Object.assign(new Error('El pago ya fue confirmado o el pedido avanzó; no se puede reemplazar su comprobante.'), { statusCode: 409 });
      }

      const latestProofs = [...new Set(copies.flatMap(copy => parsePaymentProofs(copy.PAYMENTPROOFURL)))];
      if (latestProofs.length >= MAX_PAYMENT_PROOFS) {
        throw Object.assign(new Error('Solo se permiten hasta 3 comprobantes de pago'), { statusCode: 400 });
      }

      const updates = {
        PAYMENTPROOFURL: serializePaymentProofs([...latestProofs, fileUrl]),
        STATUS: 'payment_review',
        UPDATEDAT: Date.now(),
      };
      transaction.update(vendorOrderRef, updates);
      if (mainSnap.exists) transaction.update(mainOrderRef, updates);
    });
    try { revalidateTag('orders'); } catch {}
    return NextResponse.json({ success: true, proofUrl: fileUrl }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error: any) {
    console.error('[API vendor/public-upload-proof]', error);
    return NextResponse.json({ error: error.message || 'Error al subir comprobante' }, { status: Number(error.statusCode) || 500 });
  }
}
