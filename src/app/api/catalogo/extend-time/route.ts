import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { serverUpdateDocument, getAdminDb, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { restoreStockForOrder, deductStockForOrder } from '@/lib/order-stock-service';
import { getInventoryStock, getOrderInventoryConnectionMode } from '@/lib/inventory-mode';
import { isMainStoreProduct } from '@/lib/catalog-cache';
import { getPaymentDeadline } from '@/lib/payment-deadline';
import { resolveOrderByCode, resolveOrderById } from '@/lib/order-identity';
import { invalidatePosWebReservations } from '@/lib/pos-web-reservations';

export const dynamic = 'force-dynamic';

/**
 * POST /api/catalogo/extend-time
 *
 * Body: { orderCode, action: 'retain' | 'release' | 'extend' }
 *
 * - retain:  Re-reserva el stock y quita el EXPIRESAT (modo "pagado momentaneo").
 * - release: Libera el stock y cancela el pedido.
 * - extend:  Reinicia el timer a 20 min, verificando stock antes.
 *            Si el stock fue liberado por expiracion, lo re-descuenta.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderCode, orderId, action } = body as { orderCode?: string; orderId?: string; action: 'retain' | 'release' | 'extend' };

    if ((!orderCode && !orderId) || !action || !['retain', 'release', 'extend'].includes(action)) {
      return NextResponse.json({ error: 'Faltan datos o acción inválida' }, { status: 400 });
    }

    const lookup = orderId
      ? await resolveOrderById(orderId, [ORDERS_COLLECTION_ID])
      : await resolveOrderByCode(orderCode || '', [ORDERS_COLLECTION_ID]);
    if (lookup.status === 'ambiguous') return NextResponse.json({ error: 'El número corresponde a más de un pedido; envía el ID del pedido.' }, { status: 409 });
    if (lookup.status !== 'found') return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const order = lookup.match.order as any;
    const inventoryMode = await getOrderInventoryConnectionMode(order);

    if (action === 'release') {
      // Liberar stock y cancelar pedido
      if (order.STOCKDEDUCTED) {
        let rawItems = order.ITEMS;
        if (typeof rawItems === 'string') {
          try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; }
        }
        await restoreStockForOrder(order.$id, rawItems).catch((e) => {
          console.error('[extend-time] Error liberando stock:', e);
        });
      }
      await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
        STATUS: 'cancelled',
        STOCKDEDUCTED: false,
        CANCELREASON: 'stock_released_by_admin',
        UPDATEDAT: Date.now(),
      });
      invalidatePosWebReservations();
      try { revalidateTag('orders'); } catch {}
      return NextResponse.json({ success: true, action: 'release', message: 'Stock liberado y pedido cancelado.' });
    }

    if (action === 'extend') {
      // Reiniciar timer a 20 min, verificando stock antes
      let rawItems = order.ITEMS;
      if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; }
      }

      // Si el stock fue liberado (expirado), re-descontar verificando
      if (!order.STOCKDEDUCTED) {
        const stockOk = await deductStockForOrder(order.$id, rawItems).catch((e) => {
          console.error('[extend-time] Error re-reservando stock:', e);
          return false;
        });
        if (!stockOk) {
          return NextResponse.json({
            error: 'No hay stock suficiente para extender. Algunos productos ya no están disponibles.',
            stockError: true,
          }, { status: 409 });
        }
      } else {
        // Stock ya descontado — verificar que siga disponible
        const db = getAdminDb();
        const productsCol = db.collection(PRODUCTS_COLLECTION_ID);
        let items: any[] = [];
        try {
          items = Array.isArray(rawItems) ? rawItems : JSON.parse(rawItems);
        } catch { items = []; }

        const checks = await Promise.all(items.map(async (item: any) => {
          const qty = Number(item.qty || item.quantity || 1);
          const name = String(item.name || item.NAME || '');
          const sku = String(item.sku || item.SKU || '');
          const id = String(item.id || item.pid || item.productId || '');

          let currentStock: number | null = null;
          if (id && id.length > 3) {
            try {
              const snap = await productsCol.doc(id).get();
              if (snap.exists) currentStock = getInventoryStock(snap.data() as any, inventoryMode, isMainStoreProduct(snap.data()));
            } catch {}
          }
          if (currentStock === null && sku && sku !== '-' && sku !== 'undefined') {
            try {
              let snap = await productsCol.where('SKU', '==', sku).limit(1).get();
              if (snap.empty) snap = await productsCol.where('sku', '==', sku).limit(1).get();
              if (!snap.empty) currentStock = getInventoryStock(snap.docs[0].data() as any, inventoryMode, isMainStoreProduct(snap.docs[0].data()));
            } catch {}
          }
          if (currentStock === null && name) {
            try {
              let snap = await productsCol.where('NAME', '==', name).limit(1).get();
              if (snap.empty) snap = await productsCol.where('name', '==', name).limit(1).get();
              if (!snap.empty) currentStock = getInventoryStock(snap.docs[0].data() as any, inventoryMode, isMainStoreProduct(snap.docs[0].data()));
            } catch {}
          }

          return { name, qty, currentStock, ok: currentStock === null || currentStock >= qty };
        }));

        const insufficient = checks.filter(c => !c.ok);
        if (insufficient.length > 0) {
          return NextResponse.json({
            error: 'No hay stock suficiente para extender.',
            stockError: true,
            unavailableItems: insufficient.map(c => ({ name: c.name, qty: c.qty, currentStock: c.currentStock })),
          }, { status: 409 });
        }
      }

      // Reiniciar timer a 20 min desde ahora
      const newExpiresAt = getPaymentDeadline(new Date());
      await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
        STATUS: 'paid',
        EXPIRESAT: newExpiresAt,
        STOCKDEDUCTED: true,
        UPDATEDAT: Date.now(),
      });
      invalidatePosWebReservations();

      try { revalidateTag('orders'); } catch {}

      return NextResponse.json({
        success: true,
        action: 'extend',
        expiresAt: newExpiresAt,
        message: 'Timer reiniciado a 20 minutos. Stock verificado.',
      });
    }

    // action === 'retain'
    // Re-reservar stock y quitar el timer (EXPIRESAT = null)
    if (!order.STOCKDEDUCTED) {
      // El stock ya fue liberado por expiracion — re-descontar
      let rawItems = order.ITEMS;
      if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; }
      }
      const stockOk = await deductStockForOrder(order.$id, rawItems).catch((e) => {
        console.error('[extend-time] Error re-reservando stock:', e);
        return false;
      });
      if (!stockOk) {
        return NextResponse.json({
          error: 'No hay stock suficiente para retener. Algunos productos ya no están disponibles.',
          stockError: true,
        }, { status: 409 });
      }
    }

    // Quitar EXPIRESAT y asegurar que el cron no lo expire
    await serverUpdateDocument(ORDERS_COLLECTION_ID, order.$id, {
      STATUS: 'paid',
      EXPIRESAT: null,
      STOCKDEDUCTED: true,
      UPDATEDAT: Date.now(),
    });
    invalidatePosWebReservations();

    try { revalidateTag('orders'); } catch {}

    return NextResponse.json({
      success: true,
      action: 'retain',
      message: 'Stock retenido. El pedido no expirará hasta que el cliente pague o se libere manualmente.',
    });
  } catch (error: any) {
    console.error('[API catalogo/extend-time] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al procesar' }, { status: 500 });
  }
}
