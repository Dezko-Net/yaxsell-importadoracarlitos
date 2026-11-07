import { getOrderInventoryConnectionMode } from '@/lib/inventory-mode';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { ORDERS_COLLECTION_ID, WHOLESALE_ORDERS_COLLECTION_ID } from '@/lib/db';
import { serverCreateDocument, serverUpdateDocument, serverGetDocument, getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';
import { reserveOrderCode, resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';
import { deductStockForOrder, expireUnpaidOrder, getOrderAutoCancelAt, isOrderPaymentWindowExpired, isVendorOrder, markOrderPaymentExpired, PAYMENT_PENDING_STATUSES, restoreStockForOrder } from '@/lib/order-stock-service';
import { calculateOrderStockRisk } from '@/lib/stock-risk';
import { getConfiguredOrderExpirationMinutes } from '@/lib/order-expiration-settings';
import { calculatePaymentDeadline } from '@/lib/store-schedule';
import { PAYMENT_PROOF_GRACE_MS } from '@/lib/payment-deadline';

export const dynamic = 'force-dynamic';

async function getBankDetails() {
  const db = getAdminDb();
  const col = db.collection(STORE_SETTINGS_COLLECTION);
  const [mainSnap, configSnap] = await Promise.all([
    col.doc('main').get(),
    col.doc('config').get(),
  ]);
  const data = {
    ...(configSnap.exists ? configSnap.data() : {}),
    ...(mainSnap.exists ? mainSnap.data() : {}),
  } as any;
  return {
    holder: data.bankAccountHolder || data.BANKACCOUNTHOLDER || '',
    rut: data.bankRut || data.BANKRUT || '',
    bank: data.bankName || data.BANKNAME || '',
    type: data.bankAccountType || data.BANKACCOUNTTYPE || '',
    number: data.bankAccountNumber || data.BANKACCOUNTNUMBER || '',
    email: data.bankEmail || data.BANKEMAIL || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const code = (request.nextUrl.searchParams.get('code') || '').trim();
    const id = (request.nextUrl.searchParams.get('id') || '').trim();
    if (!id && !code) {
      return NextResponse.json({ error: 'Falta código o ID del pedido' }, { status: 400 });
    }

    const lookup = id
      ? await resolveOrderById(id)
      : await resolveOrderByCode(code);
    if (lookup.status === 'ambiguous') {
      return NextResponse.json({ error: 'Hay más de un pedido con ese número. Usa el enlace directo del pedido para continuar.', code: 'AMBIGUOUS_ORDER_CODE' }, { status: 409 });
    }
    if (lookup.status !== 'found') {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    const { order: resolvedOrder, collectionId } = lookup.match
    let order: any = resolvedOrder
    if (isVendorOrder(order)) {
      const autoCancelAt = getOrderAutoCancelAt(order);
      if ((PAYMENT_PENDING_STATUSES.includes(order.STATUS) || order.STATUS === 'payment_expired') && !order.PAYMENTPROOFURL && autoCancelAt > 0 && autoCancelAt <= Date.now()) {
        await expireUnpaidOrder(order.$id);
        order = await serverGetDocument(collectionId, order.$id);
      }
    } else if (collectionId !== WHOLESALE_ORDERS_COLLECTION_ID && await getOrderInventoryConnectionMode(order) !== 'web_independent') {
      if (PAYMENT_PENDING_STATUSES.includes(order.STATUS) && !order.PAYMENTPROOFURL && isOrderPaymentWindowExpired(order)) {
        await markOrderPaymentExpired(order.$id);
        order = await serverGetDocument(collectionId, order.$id);
      }
      if (order.STATUS === 'payment_expired' && getOrderAutoCancelAt(order) <= Date.now()) {
        await expireUnpaidOrder(order.$id);
        order = await serverGetDocument(collectionId, order.$id);
      }
    }

    let bankDetails = await getBankDetails();
    let vendorInfo: Record<string, any> | null = null;
    if (order.IS_VENDOR_ORDER || order.VENDOR_ID) {
      // Los datos de una tienda asociada nunca se completan con la cuenta principal.
      bankDetails = { holder: '', rut: '', bank: '', type: '', number: '', email: '' };
      if (order.VENDOR_ID) {
        try {
          const vSnap = await getAdminDb().collection('vendors').doc(String(order.VENDOR_ID)).get();
          if (vSnap.exists) {
            const vendor = vSnap.data() || {};
            vendorInfo = {
              name: vendor.NAME || 'Tienda asociada',
              logoUrl: vendor.LOGO_URL || '',
              brandColor: vendor.BRAND_COLOR || '#f97316',
            };
          }
        } catch {}
      }
      if (order.BANK_DETAILS && (order.BANK_DETAILS.holder || order.BANK_DETAILS.rut || order.BANK_DETAILS.number)) {
        bankDetails = {
          holder: order.BANK_DETAILS.holder || bankDetails.holder,
          rut: order.BANK_DETAILS.rut || bankDetails.rut,
          bank: order.BANK_DETAILS.bank || bankDetails.bank,
          type: order.BANK_DETAILS.type || bankDetails.type,
          number: order.BANK_DETAILS.number || bankDetails.number,
          email: order.BANK_DETAILS.email || bankDetails.email,
        };
      } else if (order.VENDOR_BANK_HOLDER || order.VENDOR_BANK_ACCOUNT) {
        bankDetails = {
          holder: order.VENDOR_BANK_HOLDER || bankDetails.holder,
          rut: order.VENDOR_BANK_RUT || bankDetails.rut,
          bank: order.VENDOR_BANK_NAME || bankDetails.bank,
          type: order.VENDOR_BANK_TYPE || bankDetails.type,
          number: order.VENDOR_BANK_ACCOUNT || bankDetails.number,
          email: order.VENDOR_BANK_EMAIL || bankDetails.email,
        };
      } else if (order.VENDOR_ID) {
        try {
          const vSnap = await getAdminDb().collection('vendors').doc(order.VENDOR_ID).get();
          if (vSnap.exists) {
            const v = vSnap.data() || {};
            bankDetails = {
              holder: v.BANK_ACCOUNT_HOLDER || v.NAME || bankDetails.holder,
              rut: v.BANK_RUT || bankDetails.rut,
              bank: v.BANK_NAME || bankDetails.bank,
              type: v.BANK_ACCOUNT_TYPE || bankDetails.type,
              number: v.BANK_ACCOUNT_NUMBER || bankDetails.number,
              email: v.BANK_EMAIL || v.STORE_EMAIL || v.EMAIL || bankDetails.email,
            };
          }
        } catch {}
      }
    }
    const displayOrder = isVendorOrder(order) && order.STATUS === 'payment_expired'
      ? { ...order, STATUS: order.PAYMENTPROOFURL ? 'payment_review' : 'paid' }
      : order;
    return NextResponse.json({ order: displayOrder, bankDetails, vendor: vendorInfo }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API catalogo/order GET] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener pedido' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerName, customerPhone, items, total, assignedCashier } = body as {
      customerName: string;
      customerPhone: string;
      items: Array<{ id?: string; sku: string; name: string; qty: number; price: number; image?: string }>;
      total: number;
      assignedCashier?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Faltan datos del pedido' }, { status: 400 });
    }

    const now = Date.now();
    const { orderIndex, orderCode: reqCode } = await reserveOrderCode('WA', 8);

    const itemsData = items.map(i => ({
      id: i.id || '',
      sku: i.sku || '',
      name: i.name,
      qty: i.qty,
      price: i.price,
      total: i.price * i.qty,
      img: i.image || '',
    }));

    const docId = `wa_${now}_${Math.random().toString(36).slice(2, 10)}`;

    // Calcular salud de stock del pedido para determinar el plazo estimado de pago
    const orderStockRisk = calculateOrderStockRisk(
      items.map(i => ({
        qty: Number(i.qty || 1),
        sku: i.sku || '',
        name: i.name || '',
        price: Number(i.price || 0),
      }))
    );

    const configuredWindowMinutes = await getConfiguredOrderExpirationMinutes();
    let expiresAt: number;
    if (configuredWindowMinutes !== null) {
      expiresAt = calculatePaymentDeadline(now, configuredWindowMinutes);
    } else if (orderStockRisk.level === 'verde') {
      expiresAt = now + 24 * 60 * 60 * 1000; // 24 horas para stock holgado
    } else if (orderStockRisk.level === 'amarillo') {
      expiresAt = now + Math.round(orderStockRisk.deadlineHours * 60 * 60 * 1000); // 3 a 4 horas
    } else {
      expiresAt = now + 20 * 60 * 1000; // 20 minutos urgente para stock crítico
    }

    // Descontar y reservar stock inmediatamente al crear el pedido
    try {
      await deductStockForOrder(docId, itemsData, { orderCode: reqCode, customerName, orderIndex });
      console.log(`[API catalogo/order] Stock reservado con éxito para pedido ${reqCode} (${docId})`);
    } catch (stockErr: any) {
      console.warn(`[API catalogo/order] Stock insuficiente para pedido ${reqCode}:`, stockErr?.message);
      return NextResponse.json({
        success: false,
        error: stockErr?.message || 'Stock insuficiente para uno o más productos de tu pedido.',
      }, { status: 409 });
    }

    let doc: any;
    try {
      doc = await serverCreateDocument(ORDERS_COLLECTION_ID, docId, {
        USERID: 'guest',
        ITEMS: JSON.stringify(itemsData),
        CUSTOMERNAME: customerName,
        CUSTOMERPHONE: customerPhone || '',
        CUSTOMEREMAIL: '',
        ORDERCODE: reqCode,
        ORDERINDEX: orderIndex,
        SUBTOTAL: total,
        TOTAL: total,
        STATUS: 'paid', // Stock reservado y confirmado
        EXPIRESAT: expiresAt,
        EXPIRESATBACKEND: expiresAt + PAYMENT_PROOF_GRACE_MS,
        EXPIRATIONWINDOWMINUTES: configuredWindowMinutes ?? Math.max(1, Math.round((expiresAt - now) / 60000)),
        STATUSDEADLINE: expiresAt,
        STOCKDEDUCTED: true,
        CREATEDAT: now,
        PAYMENTMETHOD: 'WhatsApp',
        SHIPPINGAGENCY: '',
        REGION: '',
        COMUNA: '',
        ADDRESS: '',
        ...(assignedCashier ? { ASSIGNEDCASHIER: assignedCashier } : {}),
      });
    } catch (createErr) {
      // Revertir descuento de stock en caso de fallo al crear documento
      try { await restoreStockForOrder(docId, itemsData, { orderCode: reqCode, customerName, orderIndex }); } catch {}
      throw createErr;
    }

    try { revalidateTag('orders'); } catch {}
    // El stock ya se descontó y el nuevo pedido debe reflejarse en el POS.
    try { revalidateTag('pos-web-reservations'); } catch {}

    return NextResponse.json({
      success: true,
      orderId: (doc as Record<string, unknown>).$id as string,
      orderCode: reqCode,
      status: 'paid',
      expiresAt,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API catalogo/order] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al crear pedido' }, { status: 500 });
  }
}
