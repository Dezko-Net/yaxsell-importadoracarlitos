import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { serverUpdateDocument, serverGetDocument, getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { deductStockForOrder, isVendorOrder, restoreStockForOrder } from '@/lib/order-stock-service';
import { sendWhatsAppMessage, addToHistory } from '@/lib/whatsapp';
import { recordKeniaUsage } from '@/lib/kenia-runtime';
import { calculateOrderStockRisk } from '@/lib/stock-risk';
import { calculatePaymentDeadline, getStoreSchedule } from '@/lib/store-schedule';
import { getConfiguredOrderExpirationMinutes } from '@/lib/order-expiration-settings';
import { PAYMENT_PROOF_GRACE_MS } from '@/lib/payment-deadline';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';
import { invalidatePosWebReservations } from '@/lib/pos-web-reservations';
import { getPublicSiteUrl } from '@/lib/public-site-url';
import { isMainStoreProduct } from '@/lib/catalog-cache';
import { getInventoryStock, getOrderInventoryConnectionMode } from '@/lib/inventory-mode';

export const dynamic = 'force-dynamic';

/**
 * GET /api/catalogo/confirm-stock?orderCode=WA-xxx
 * Previsualiza el stock actual de los items del pedido sin descontar nada.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderCode = searchParams.get('orderCode') || '';
    const orderId = searchParams.get('orderId') || '';
    if (!orderId && !orderCode) return NextResponse.json({ error: 'Falta orderId u orderCode' }, { status: 400 });

    const lookup = orderId
      ? await resolveOrderById(orderId, [ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode, [ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') return NextResponse.json({ error: 'El número corresponde a más de un pedido; selecciona el pedido por su ID.' }, { status: 409 });
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    const order = lookup.match.order as any;
    const inventoryMode = await getOrderInventoryConnectionMode(order);
    if (isVendorOrder(order)) {
      return NextResponse.json({ error: 'Los pedidos de tiendas aliadas ya reservan su propio stock al crearse.' }, { status: 409 });
    }
    const isOrderStockDeducted = order.STOCKDEDUCTED === true || ['paid', 'payment_expired', 'payment_review', 'payment_confirmed', 'processing', 'negotiation', 'shipped', 'delivered'].includes(String(order.STATUS || '').toLowerCase());

    let rawItems: any[] = [];
    try { rawItems = Array.isArray(order.ITEMS) ? order.ITEMS : JSON.parse(order.ITEMS || '[]'); } catch {}

    const db = getAdminDb();
    const productsCol = db.collection(PRODUCTS_COLLECTION_ID);
    const stockPendingCol = db.collection('stock_pending');

    // Buscar stock de cada item en paralelo
    const previewItems = await Promise.all(rawItems.map(async (item: any) => {
      const qty = Number(item.qty || item.quantity || 1);
      const name = String(item.name || item.NAME || 'Producto');
      const sku = String(item.sku || item.SKU || '');
      const id = String(item.id || item.pid || item.productId || '');
      const price = Number(item.price || item.PRICE || 0);

      let currentStock: number | null = null;
      let realSku = sku;
      let found = false;
      let imageUrl = String(item.img || item.image || item.IMAGEURL || item.imageUrl || '');

      // Por ID
      if (id && id.length > 3) {
        try {
          const snap = await productsCol.doc(id).get();
          if (snap.exists) {
            const d = snap.data() as any;
            currentStock = getInventoryStock(d, inventoryMode, isMainStoreProduct(d));
            realSku = String(d.SKU || d.sku || sku);
            imageUrl = d.IMAGEURL || d.imageUrl || d.IMG || d.image || imageUrl;
            found = true;
          }
        } catch {}
      }

      // Por SKU
      if (!found && sku && sku !== '-' && sku !== 'undefined') {
        try {
          let snap = await productsCol.where('SKU', '==', sku).limit(1).get();
          if (snap.empty) snap = await productsCol.where('sku', '==', sku).limit(1).get();
          if (!snap.empty) {
            const d = snap.docs[0].data() as any;
            currentStock = getInventoryStock(d, inventoryMode, isMainStoreProduct(d));
            realSku = String(d.SKU || d.sku || sku);
            imageUrl = d.IMAGEURL || d.imageUrl || d.IMG || d.image || imageUrl;
            found = true;
          }
        } catch {}
      }

      // Por nombre
      if (!found && name) {
        try {
          let snap = await productsCol.where('NAME', '==', name).limit(1).get();
          if (snap.empty) snap = await productsCol.where('name', '==', name).limit(1).get();
          if (!snap.empty) {
            const d = snap.docs[0].data() as any;
            currentStock = getInventoryStock(d, inventoryMode, isMainStoreProduct(d));
            realSku = String(d.SKU || d.sku || '');
            imageUrl = d.IMAGEURL || d.imageUrl || d.IMG || d.image || imageUrl;
            found = true;
          }
        } catch {}
      }

      // Consultar deuda de stock pendiente
      let stockPendiente = 0;
      const targetSku = realSku || sku;
      if (targetSku && targetSku !== '-' && targetSku !== 'undefined') {
        try {
          const pendingSnap = await stockPendingCol.doc(targetSku).get();
          if (pendingSnap.exists) {
            stockPendiente = Number(pendingSnap.data()?.pendiente || 0);
          }
        } catch {}
      }
      if (currentStock !== null && currentStock < 0) {
        stockPendiente = Math.max(stockPendiente, Math.abs(currentStock));
      }

      // Si el pedido ya tiene stock reservado/descontado (STOCKDEDUCTED: true),
      // currentStock en Firestore ya está neto de esta reserva.
      // Por ende, el stock físico disponible para cumplir ESTE pedido es: currentStock + qty.
      const stockTotalDisponible = currentStock !== null ? (isOrderStockDeducted ? currentStock + qty : currentStock) : null;
      const hasStock = stockTotalDisponible !== null ? stockTotalDisponible >= qty : false;
      const remainingStock = currentStock !== null ? (isOrderStockDeducted ? Math.max(0, currentStock) : Math.max(0, currentStock - qty)) : null;

      return {
        id,
        sku: realSku,
        name,
        qty,
        price,
        currentStock: isOrderStockDeducted && stockTotalDisponible !== null ? stockTotalDisponible : currentStock,
        rawCurrentStock: currentStock,
        remainingStock,
        hasStock,
        isReserved: isOrderStockDeducted,
        found,
        imageUrl,
        stockPendiente,
      };
    }));

    return NextResponse.json({
      orderCode: order.ORDERCODE || orderCode || order.$id,
      customerName: order.CUSTOMERNAME || '',
      customerPhone: order.CUSTOMERPHONE || '',
      items: previewItems,
      total: previewItems.reduce((s: number, i: any) => s + i.qty * i.price, 0),
    });
  } catch (error: any) {
    console.error('[API catalogo/confirm-stock GET] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

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
    holder: data.bankAccountHolder || data.BANKACCOUNTHOLDER || 'Importadora Carlitos',
    rut: data.bankRut || data.BANKRUT || '78267426-9',
    bank: data.bankName || data.BANKNAME || 'Banco de Chile',
    type: data.bankAccountType || data.BANKACCOUNTTYPE || 'Cuenta Corriente',
    number: data.bankAccountNumber || data.BANKACCOUNTNUMBER || '4081220201',
    email: data.bankEmail || data.BANKEMAIL || '',
  };
}

function buildBankMessage(bank: any, total: number): string {
  return `*Datos de transferencia:*

Banco: ${bank.bank}
Titular: ${bank.holder}
RUT: ${bank.rut}
Tipo: ${bank.type}
Cuenta: ${bank.number}
Email: ${bank.email}

*Total a transferir: $${total.toLocaleString('es-CL')}*

Realiza la transferencia y envianos el comprobante por este chat.`;
}

function buildDeadlineReminder(expiresAt: number, windowMinutes: number): string {
  const expDate = new Date(expiresAt);
  const expTimeStr = expDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
  const expDateStr = expDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
  const schedule = getStoreSchedule(new Date());

  let msg = '\n*Importante:*\n';
  if (schedule.isOpen) {
    msg += `- Tienes *${windowMinutes} minutos* para transferir (hasta las *${expTimeStr}*).\n`;
  } else {
    msg += `- Pedido registrado fuera de horario. Al abrir la tienda (${schedule.nextOpenStr}) tienes *${windowMinutes} minutos* para transferir (hasta las *${expTimeStr} del ${expDateStr}*).\n`;
  }
  msg += `- Si necesitas reactivar o consultar por stock, respondenos por este chat.\n`;
  msg += `- Una vez transferido, sube tu comprobante en el enlace abajo.`;
  return msg;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderCode, orderId, items, allowRequote, isUpdateStock } = body as {
      orderCode?: string;
      orderId?: string;
      items: Array<{ id?: string; sku: string; name: string; qty: number; price: number; img?: string; image?: string; IMAGEURL?: string; available: boolean }>;
      allowRequote?: boolean;
      isUpdateStock?: boolean;
    };

    if ((!orderId && !orderCode) || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    // Resolver folios sin escoger arbitrariamente cuando existen duplicados.
    const lookup = orderId
      ? await resolveOrderById(orderId, [ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode || '', [ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') return NextResponse.json({ error: 'El número corresponde a más de un pedido; selecciona el pedido por su ID.' }, { status: 409 });
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const order = lookup.match.order as any;
    const inventoryMode = await getOrderInventoryConnectionMode(order);
    const resolvedOrderCode = String(order.ORDERCODE || orderCode || order.$id);
    if (isVendorOrder(order)) {
      return NextResponse.json({ error: 'Los pedidos de tiendas aliadas ya reservan su propio stock al crearse.' }, { status: 409 });
    }

    const isRequote = allowRequote === true || isUpdateStock === true;

    // Solo se puede confirmar stock de pedidos en estado inicial o de revisión, o si es recotización/actualización explícita
    if (!['pending', 'pending_stock', 'processing', 'paid', 'payment_review', 'payment_confirmed'].includes(order.STATUS) && !isRequote) {
      return NextResponse.json({
        error: `El pedido ya está en estado "${order.STATUS}" y no se puede confirmar stock nuevamente.`,
        currentStatus: order.STATUS,
      }, { status: 409 });
    }

    // Si es una recotización/actualización y el pedido ya tenía stock descontado,
    // restauramos primero el stock anterior para evitar deducciones duplicadas.
    let originalItems: any[] = [];
    try {
      originalItems = Array.isArray(order.ITEMS) ? order.ITEMS : JSON.parse(order.ITEMS || '[]');
    } catch {}

    // Filter only available items and recalculate totals
    const availableItems = items.filter(i => i.available);
    const unavailableItems = items.filter(i => !i.available);
    const hasItemsChanged = unavailableItems.length > 0 || (availableItems.length !== originalItems.length);

    if (isRequote && order.STOCKDEDUCTED && hasItemsChanged) {
      await restoreStockForOrder(order.$id, originalItems, {
        orderCode: resolvedOrderCode,
        customerName: order.CUSTOMERNAME,
        orderIndex: order.ORDERINDEX,
      }).catch((err) => {
        console.error('[confirm-stock] Error restaurando stock previo para recotización:', err);
      });
    }

    const itemsData = availableItems.map(i => {
      const original = originalItems.find((item: any) =>
        (i.id && (item.id === i.id || item.pid === i.id || item.productId === i.id))
        || (i.sku && (item.sku === i.sku || item.SKU === i.sku))
        || (i.name && (item.name === i.name || item.NAME === i.name))
      ) || {};
      return {
        id: i.id || original.id || original.pid || original.productId || '',
        sku: i.sku || original.sku || original.SKU || '',
        name: i.name || original.name || original.NAME || 'Producto',
        qty: i.qty,
        price: i.price,
        total: i.price * i.qty,
        img: i.img || i.image || i.IMAGEURL || original.img || original.image || original.IMAGEURL || '',
      };
    });

    const subtotal = availableItems.reduce((sum, i) => sum + i.price * i.qty, 0);

    // If no items available, mark as cancelled
    if (availableItems.length === 0) {
      await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
        STATUS: 'cancelled',
        UPDATEDAT: Date.now(),
      });
      return NextResponse.json({ success: true, availableItems: [], subtotal: 0, cancelled: true });
    }

    // Reservar stock (como la validación al cobrar en POS)
    const isAlreadyDeducted = order.STOCKDEDUCTED === true || ['paid', 'payment_expired', 'payment_review', 'payment_confirmed', 'processing', 'shipped', 'delivered'].includes(String(order.STATUS || '').toLowerCase());
    let stockUpdated = true;

    // Si el pedido ya tenía su stock descontado y los ítems no cambiaron, el stock ya está reservado.
    if (!isAlreadyDeducted || hasItemsChanged) {
      stockUpdated = await deductStockForOrder(order.$id, itemsData, {
        orderCode: resolvedOrderCode,
        customerName: order.CUSTOMERNAME,
        orderIndex: order.ORDERINDEX,
      }).catch((err) => {
        console.error('[confirm-stock] Error al reservar stock:', err);
        return false;
      });
    }
    if (!stockUpdated) {
      // No hay stock suficiente — devolver error con stock actual de cada producto
      const { PRODUCTS_COLLECTION_ID } = await import('@/lib/db');
      const productMap: Record<string, { stock: number; sku: string; name: string }> = {};
      try {
        const db = getAdminDb();
        const productsCol = db.collection(PRODUCTS_COLLECTION_ID);

        // Buscar todos los productos en paralelo (por ID, SKU o nombre)
        const lookupResults = await Promise.all(itemsData.map(async (item) => {
          const key = item.id || item.sku || item.name || '';
          if (!key) return { key, info: null as any };

          // 2a. Por ID directo
          if (item.id && item.id.length > 3) {
            try {
              const snap = await productsCol.doc(item.id).get();
              if (snap.exists) {
                const data = snap.data() as any;
                return { key, info: {
                  stock: getInventoryStock(data, inventoryMode, isMainStoreProduct(data)),
                  sku: String(data.SKU || data.sku || ''),
                  name: String(data.NAME || data.name || ''),
                }};
              }
            } catch {}
          }

          // 2b. Por SKU
          const sku = String(item.sku || '').trim();
          if (sku && sku !== '-' && sku !== 'undefined') {
            try {
              let snap = await productsCol.where('SKU', '==', sku).limit(1).get();
              if (snap.empty) snap = await productsCol.where('sku', '==', sku).limit(1).get();
              if (!snap.empty) {
                const data = snap.docs[0].data() as any;
                return { key, info: {
                  stock: getInventoryStock(data, inventoryMode, isMainStoreProduct(data)),
                  sku: String(data.SKU || data.sku || sku),
                  name: String(data.NAME || data.name || item.name || ''),
                }};
              }
            } catch {}
          }

          // 2c. Por nombre
          const name = String(item.name || '').trim();
          if (name) {
            try {
              let snap = await productsCol.where('NAME', '==', name).limit(1).get();
              if (snap.empty) snap = await productsCol.where('name', '==', name).limit(1).get();
              if (!snap.empty) {
                const data = snap.docs[0].data() as any;
                return { key, info: {
                  stock: getInventoryStock(data, inventoryMode, isMainStoreProduct(data)),
                  sku: String(data.SKU || data.sku || ''),
                  name: String(data.NAME || data.name || name),
                }};
              }
            } catch {}
          }

          return { key, info: null };
        }));

        for (const { key, info } of lookupResults) {
          if (info) productMap[key] = info;
        }
      } catch (e) {
        console.error('[confirm-stock] Error obteniendo stock actual:', e);
      }

      const itemsWithStock = itemsData.map(i => {
        const key = i.id || i.sku || i.name || '';
        const info = productMap[key] || {};
        return {
          ...i,
          sku: info.sku || i.sku,
          name: info.name || i.name,
          currentStock: info.stock ?? null,
        };
      });

      return NextResponse.json({
        error: 'No hay stock suficiente para algunos productos.',
        stockError: true,
        unavailableItems,
        itemsWithStock,
      }, { status: 409 });
    }

    // Calcular salud de stock del pedido para determinar el plazo estimado de pago
    const orderStockRisk = calculateOrderStockRisk(
      availableItems.map((i: any) => ({
        qty: i.qty,
        stock: i.stock !== undefined && i.stock !== null ? Number(i.stock) : null,
        sku: i.sku,
        name: i.name,
        price: Number(i.price || 0),
      }))
    );

    // Stock reservado — iniciar la ventana configurable de pago + STOCKDEDUCTED.
    const now = Date.now();
    const configuredWindowMinutes = await getConfiguredOrderExpirationMinutes();
    const expirationMinutes = configuredWindowMinutes ?? 20;
    const expiresAt = calculatePaymentDeadline(now, expirationMinutes);

    const nextStatus = ['payment_review', 'payment_confirmed', 'processing', 'shipped'].includes(String(order.STATUS || '')) ? order.STATUS : 'paid';

    await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
      ITEMS: JSON.stringify(itemsData),
      SUBTOTAL: subtotal,
      TOTAL: subtotal,
      STATUS: nextStatus,
      EXPIRESAT: expiresAt,
      EXPIRESATBACKEND: expiresAt + PAYMENT_PROOF_GRACE_MS,
      EXPIRATIONWINDOWMINUTES: expirationMinutes,
      STOCKDEDUCTED: true,
      UPDATEDAT: now,
    });
    // La confirmación puede cambiar tanto los artículos como la reserva
    // efectiva de stock asociada al pedido.
    invalidatePosWebReservations();

    // ── Enviar mensaje al cliente con datos de pago + recordatorio ──
    const customerPhone = String(order.CUSTOMERPHONE || '').replace(/\D/g, '');
    const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const customerFirstName = String(order.CUSTOMERNAME || '').split(' ')[0] || 'amigo';
    const orderTotal = subtotal;
    const bank = await getBankDetails();

    const hasUnavailable = unavailableItems.length > 0;
    let customerMsg = hasUnavailable
      ? `Hola ${customerFirstName}, sobre tu pedido #${resolvedOrderCode}, ajustamos tu cotizacion con los productos disponibles:\n\n`
      : `Hola ${customerFirstName}, confirmamos el stock de tu pedido #${resolvedOrderCode}. Todo esta disponible:\n\n`;

    if (hasUnavailable) {
      itemsData.forEach((i: any) => {
        customerMsg += `- ${i.name}\n  ${i.qty} x $${Number(i.price || 0).toLocaleString('es-CL')} = $${((Number(i.qty) || 1) * (Number(i.price) || 0)).toLocaleString('es-CL')}\n`;
      });
      const initialTotal = Number(order.SUBTOTAL || order.TOTAL || 0);
      if (initialTotal > subtotal) {
        customerMsg += `\n------------------------\n`;
        customerMsg += `Subtotal original: $${initialTotal.toLocaleString('es-CL')}\n`;
        customerMsg += `Productos quitados: -$${(initialTotal - subtotal).toLocaleString('es-CL')}\n`;
        customerMsg += `Total final a pagar: $${subtotal.toLocaleString('es-CL')}\n------------------------\n\n`;
      } else {
        customerMsg += `\nTotal a pagar: $${subtotal.toLocaleString('es-CL')}\n\n`;
      }
    }

    customerMsg += buildBankMessage(bank, orderTotal);
    customerMsg += buildDeadlineReminder(expiresAt, expirationMinutes);
    customerMsg += `\n\nCompleta tus datos aquí: ${getPublicSiteUrl()}/pedido/${order.$id}`;

    let waSent = false;
    if (customerPhone && WA_TOKEN) {
      try {
        await sendWhatsAppMessage(customerPhone, customerMsg, WA_TOKEN);
        await addToHistory(`+${customerPhone}`, 'assistant', customerMsg, `stockok-${Date.now()}`);
        await recordKeniaUsage(`+${customerPhone}`, {
          balatinStep: 'awaiting_payment',
          balatinComprobanteReceived: false,
        });
        waSent = true;
      } catch (e) {
        console.error('[confirm-stock] Error enviando mensaje al cliente:', e);
      }
    }

    try { revalidateTag('orders'); } catch {}

    // Generar link wa.me para envío manual si no se pudo enviar automáticamente
    let waLink: string | null = null;
    if (!waSent && customerPhone) {
      const waPhone = customerPhone.length === 9 ? '56' + customerPhone : customerPhone;
      waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(customerMsg)}`;
    }

    return NextResponse.json({
      success: true,
      availableItems: itemsData,
      subtotal,
      expiresAt,
      bankDetails: bank,
      waSent,
      waLink,
      customerMsg,
      message: unavailableItems.length === 0
        ? (waSent ? 'Stock confirmado y mensaje enviado al cliente.' : 'Stock confirmado. Envía el mensaje al cliente manualmente.')
        : (waSent ? `Stock confirmado (sin ${unavailableItems.length} producto(s)). Mensaje enviado al cliente.` : `Stock confirmado (sin ${unavailableItems.length} producto(s)). Envía el mensaje al cliente manualmente.`),
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API catalogo/confirm-stock] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al confirmar stock' }, { status: 500 });
  }
}
