import { NextRequest, NextResponse } from 'next/server';
import { serverGetDocument, serverUploadFile } from '@/lib/firebase-server-compat';
import { VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/db';
import { getAdminDb } from '@/lib/db-server';
import { compressImageKeepFormat } from '@/lib/image-compression';
import { expireUnpaidOrder, getOrderAutoCancelAt, PAYMENT_EXPIRATION_STATUSES } from '@/lib/order-stock-service';
import { notifyPaymentUploaded } from '@/lib/notify-admin';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Público: el cliente sube su comprobante de transferencia para el pedido del vendor.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await serverGetDocument(VENDOR_ORDERS_COLLECTION_ID, id) as any;
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const userId = req.nextUrl.searchParams.get('userId') || '';
    const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase();
    const ownsOrder = (userId && userId !== 'guest' && order.USERID === userId) || (email && String(order.CUSTOMEREMAIL || '').trim().toLowerCase() === email);
    if (!ownsOrder) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    if (PAYMENT_EXPIRATION_STATUSES.includes(order.STATUS) && !order.PAYMENTPROOFURL && getOrderAutoCancelAt(order) > 0 && getOrderAutoCancelAt(order) <= Date.now()) {
      await expireUnpaidOrder(id);
      return NextResponse.json({ error: 'Vencieron las 24 horas desde la creación del pedido y fue cancelado' }, { status: 410 });
    }
    if (!PAYMENT_EXPIRATION_STATUSES.includes(order.STATUS)) return NextResponse.json({ error: 'El pedido ya no está pendiente de pago' }, { status: 410 });
    if (order.PAYMENTPROOFURL) return NextResponse.json({ error: 'Ya se recibió un comprobante para este pedido' }, { status: 409 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
    if (file.size <= 0) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'El archivo supera los 10MB' }, { status: 400 });

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    let compressedBuffer: Buffer<ArrayBufferLike> = originalBuffer;
    let format = 'pdf';
    if (isPdf) {
      if (originalBuffer.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ error: 'El PDF no es válido' }, { status: 400 });
    } else {
      if (file.type && !file.type.startsWith('image/')) return NextResponse.json({ error: 'Sube una imagen o un PDF' }, { status: 400 });
      const compressed = await compressImageKeepFormat(originalBuffer);
      compressedBuffer = compressed.buffer;
      format = compressed.format === 'gif' ? 'png' : compressed.format;
    }
    const originalName = file.name || 'proof.jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.${format}`;
    const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, String(order.VENDOR_ID || '')) as any;
    const vendorFolder = String(vendor?.STORAGE_PREFIX || order.VENDOR_ID || 'vendor').replace(/[^a-zA-Z0-9_-]/g, '_');
    const comprobantesPath = `comprobantes/${vendorFolder}`;
    const proofContentType = format === 'pdf'
      ? 'application/pdf'
      : format === 'jpg' || format === 'jpeg'
        ? 'image/jpeg'
        : `image/${format}`;
    const uploaded = await serverUploadFile(comprobantesPath, compressedBuffer, fileName, proofContentType);
    const proofUrl = uploaded.url;

    try {
      const db = getAdminDb();
      const orderRef = db.collection(VENDOR_ORDERS_COLLECTION_ID).doc(id);
      await db.runTransaction(async transaction => {
        const freshSnap = await transaction.get(orderRef);
        if (!freshSnap.exists) throw new Error('Pedido no encontrado');
        const fresh = freshSnap.data() || {};
        const userMatches = userId && userId !== 'guest' && fresh.USERID === userId;
        const emailMatches = email && String(fresh.CUSTOMEREMAIL || '').trim().toLowerCase() === email;
        if (!userMatches && !emailMatches) throw new Error('Pedido no encontrado');
        if (!PAYMENT_EXPIRATION_STATUSES.includes(fresh.STATUS)) throw new Error('El pedido ya no está pendiente de pago');
        if (fresh.PAYMENTPROOFURL) throw new Error('Ya se recibió un comprobante para este pedido');
        if (getOrderAutoCancelAt(fresh) <= Date.now()) throw new Error('Vencieron las 24 horas desde la creación del pedido');
        transaction.update(orderRef, {
          PAYMENTPROOFURL: proofUrl,
          STATUS: 'payment_review',
          UPDATEDAT: Date.now(),
        });
      });
    } catch (error: any) {
      const message = String(error?.message || 'No se pudo guardar el comprobante');
      const status = message.includes('24 horas') || message.includes('venció') || message.includes('Vencieron') ? 410 : message.includes('encontrado') ? 404 : 409;
      return NextResponse.json({ error: message }, { status });
    }

    try { revalidateTag('orders'); } catch {}

    await notifyPaymentUploaded(
      String(order.ORDERCODE || id),
      String(order.CUSTOMERNAME || 'Cliente'),
      proofUrl,
      id,
    ).catch(error => console.warn('[vendor-order upload-proof] Payment alert failed:', error));

    return NextResponse.json({ ok: true, proofUrl });
  } catch (err: any) {
    console.error('[vendor-order upload-proof]', err);
    return NextResponse.json({ error: err.message || 'Error al subir el comprobante' }, { status: 500 });
  }
}
