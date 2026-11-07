import { getOrderInventoryConnectionMode } from '@/lib/inventory-mode';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb, serverGetDocument, serverUploadFile } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, MEDIA_PREFIXES } from '@/lib/db';
import { parsePaymentProofs, serializePaymentProofs, MAX_PAYMENT_PROOFS } from '@/lib/payment-proofs';
import { compressImageKeepFormat } from '@/lib/image-compression';
import { expireUnpaidOrder, getOrderAutoCancelAt, isOrderPaymentWindowExpired, isVendorOrder, markOrderPaymentExpired, PAYMENT_PENDING_STATUSES } from '@/lib/order-stock-service';
import { notifyPaymentUploaded } from '@/lib/notify-admin';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';
import { invalidatePosWebReservations } from '@/lib/pos-web-reservations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ruta base para comprobantes de la tienda principal
const COMPROBANTES_PATH = MEDIA_PREFIXES.comprobantes.replace(/\/$/, '');
const PROOF_UPLOAD_STATUSES = new Set<string>([...PAYMENT_PENDING_STATUSES, 'payment_expired', 'payment_review']);

function canUploadProof(status: unknown): boolean {
  return PROOF_UPLOAD_STATUSES.has(String(status || '').toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const orderId = String(formData.get('orderId') || '').trim();
    const orderCode = String(formData.get('orderCode') || '').trim();
    const file = formData.get('file') as File;

    if ((!orderId && !orderCode) || !file) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    const lookup = orderId
      ? await resolveOrderById(orderId, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode, [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') {
      return NextResponse.json({ error: 'Ese número corresponde a más de un pedido. Abre el enlace directo de tu pedido y vuelve a intentarlo.', code: 'AMBIGUOUS_ORDER_CODE' }, { status: 409 });
    }
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    let { order } = lookup.match as any;
    const collectionId = lookup.match.collectionId;
    const vendorOrder = collectionId === VENDOR_ORDERS_COLLECTION_ID || isVendorOrder(order);
    const independentWeb = !vendorOrder && await getOrderInventoryConnectionMode(order) === 'web_independent';
    if (vendorOrder) {
      const autoCancelAt = getOrderAutoCancelAt(order);
      if ((PAYMENT_PENDING_STATUSES.includes(order.STATUS) || order.STATUS === 'payment_expired') && !order.PAYMENTPROOFURL && autoCancelAt > 0 && autoCancelAt <= Date.now()) {
        await expireUnpaidOrder(order.$id);
        return NextResponse.json({ error: 'Vencieron las 24 horas desde la creación del pedido y fue cancelado' }, { status: 410 });
      }
    } else if (!independentWeb) {
      // La tienda principal integrada conserva el temporizador de pago.
      if (PAYMENT_PENDING_STATUSES.includes(order.STATUS) && !order.PAYMENTPROOFURL && isOrderPaymentWindowExpired(order)) {
        await markOrderPaymentExpired(order.$id);
        order = await serverGetDocument(collectionId, order.$id) as any;
      }
      if (order.STATUS === 'payment_expired' && getOrderAutoCancelAt(order) <= Date.now()) {
        await expireUnpaidOrder(order.$id);
        return NextResponse.json({ error: 'Vencieron las 24 horas desde la creación del pedido y fue cancelado' }, { status: 410 });
      }
    }
    if (order.STATUS === 'cancelled') {
      return NextResponse.json({ error: 'El pedido está cancelado' }, { status: 410 });
    }
    if (!canUploadProof(order.STATUS)) {
      return NextResponse.json({ error: 'El pago ya fue confirmado o el pedido avanzó; no se puede reemplazar su comprobante.' }, { status: 409 });
    }

    // Append to existing proofs (max 3) before uploading to avoid orphan files.
    const existing = parsePaymentProofs(order.PAYMENTPROOFURL);
    if (existing.length >= MAX_PAYMENT_PROOFS) {
      return NextResponse.json({ error: 'Solo se permiten hasta 3 comprobantes de pago' }, { status: 400 });
    }

    // Upload file to storage (comprimido) — comprobantes/carlitos/
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format: originalFormat } = await compressImageKeepFormat(originalBuffer);
    const format = originalFormat === 'gif' ? 'png' : originalFormat;
    const originalName = file.name || 'proof.jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.${format}`;
    const proofContentType = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
    const uploaded = await serverUploadFile(COMPROBANTES_PATH, compressedBuffer, fileName, proofContentType);
    const fileUrl = uploaded.url;

    const db = getAdminDb();
    const orderRef = db.collection(collectionId).doc(order.$id);
    const mirrorCollection = collectionId === VENDOR_ORDERS_COLLECTION_ID ? ORDERS_COLLECTION_ID : VENDOR_ORDERS_COLLECTION_ID;
    const mirrorRef = vendorOrder ? db.collection(mirrorCollection).doc(order.$id) : null;
    let allProofs = '';
    try {
      await db.runTransaction(async transaction => {
        const freshSnap = await transaction.get(orderRef);
        const mirrorSnap = mirrorRef ? await transaction.get(mirrorRef) : null;
        if (!freshSnap.exists) throw Object.assign(new Error('Pedido no encontrado'), { statusCode: 404 });
        const fresh = freshSnap.data() || {};
        const mirror = mirrorSnap?.exists ? mirrorSnap.data() || {} : null;
        const statuses = [fresh.STATUS, mirror?.STATUS].filter(Boolean);
        if (statuses.some(status => !canUploadProof(status))) {
          throw Object.assign(new Error('El pago ya fue confirmado o el pedido avanzó; no se puede reemplazar su comprobante.'), { statusCode: 409 });
        }
        if (vendorOrder || isVendorOrder(fresh)) {
          const autoCancelAt = getOrderAutoCancelAt(fresh);
          if (autoCancelAt > 0 && autoCancelAt <= Date.now()) {
            throw Object.assign(new Error('Vencieron las 24 horas desde la creación del pedido.'), { statusCode: 410 });
          }
        } else if (!independentWeb && fresh.STATUS === 'payment_expired' && getOrderAutoCancelAt(fresh) <= Date.now()) {
          throw Object.assign(new Error('Vencieron las 24 horas desde la creación del pedido.'), { statusCode: 410 });
        }

        const latestProofs = [...new Set([
          ...parsePaymentProofs(fresh.PAYMENTPROOFURL),
          ...parsePaymentProofs(mirror?.PAYMENTPROOFURL),
        ])];
        if (latestProofs.length >= MAX_PAYMENT_PROOFS) {
          throw Object.assign(new Error('Solo se permiten hasta 3 comprobantes de pago'), { statusCode: 400 });
        }
        allProofs = serializePaymentProofs([...latestProofs, fileUrl]);
        const updates = { PAYMENTPROOFURL: allProofs, STATUS: 'payment_review', UPDATEDAT: Date.now() };
        transaction.update(orderRef, updates);
        if (mirrorRef && mirrorSnap?.exists) transaction.update(mirrorRef, updates);
      });
    } catch (error: any) {
      return NextResponse.json({ error: error.message || 'No se pudo guardar el comprobante' }, { status: Number(error.statusCode) || 409 });
    }

    await notifyPaymentUploaded(
      String(order.ORDERCODE || order.$id),
      String(order.CUSTOMERNAME || 'Cliente'),
      fileUrl,
      String(order.$id),
    ).catch(error => console.warn('[API catalogo/upload-proof] Payment alert failed:', error));

    // Invalidar la caché del badge "Pagar tu pedido" (my-orders-status).
    try { revalidateTag('orders'); } catch {}
    // Un comprobante después del vencimiento mantiene reservadas las unidades;
    // el agregador de reservas depende de PAYMENTPROOFURL para decidirlo.
    if (!vendorOrder && collectionId !== VENDOR_ORDERS_COLLECTION_ID) invalidatePosWebReservations();

    return NextResponse.json({
      success: true,
      proofUrl: fileUrl,
      orderId: order.$id,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API catalogo/upload-proof] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al subir comprobante' }, { status: 500 });
  }
}
