import { NextRequest, NextResponse } from 'next/server';
import { serverUpdateDocument, serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { invalidatePosWebReservations } from '@/lib/pos-web-reservations';
import { isMainStoreProduct } from '@/lib/catalog-cache';
import {
  getInventoryStock,
  getOrderInventoryConnectionMode,
  inventoryStockUpdate,
} from '@/lib/inventory-mode';

const VENDOR_ORDERS_COLLECTION = 'vendor_orders';
const WHOLESALE_ORDERS_COLLECTION = 'wholesale_orders';

function computeSubtotal(list: any[]) {
  return list.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
}

function getCustomerEditCount(o: any): number {
  const v = o.CUSTOMEREDITCOUNT ?? o.customerEditCount ?? o.EDITCOUNT ?? o.editCount ?? 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, draftItems, isWholesale, isVendorOrder } = body as { orderId: string; draftItems: any[]; isWholesale?: boolean; isVendorOrder?: boolean };
    const targetCollection = isVendorOrder ? VENDOR_ORDERS_COLLECTION : isWholesale ? WHOLESALE_ORDERS_COLLECTION : ORDERS_COLLECTION_ID;

    if (!orderId || !Array.isArray(draftItems)) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos o formato incorrecto.' }, { status: 400 });
    }

    if (draftItems.length === 0) {
      return NextResponse.json({ error: 'El pedido debe tener al menos 1 producto.' }, { status: 400 });
    }

    // 1. Obtener pedido actual
    const latest = await serverGetDocument(targetCollection, orderId) as any;
    const inventoryMode = await getOrderInventoryConnectionMode(latest || (isVendorOrder ? { IS_VENDOR_ORDER: true } : null));

    // 2. Validar que el estado permita modificaciones
    const unmodifiableStatuses = ['payment_review', 'payment_confirmed', 'negotiation', 'shipped', 'delivered', 'cancelled'];
    if (unmodifiableStatuses.includes(latest.STATUS)) {
      return NextResponse.json({
        error: 'No puedes modificar el pedido si ya está verificado, en proceso de preparación o anulado.'
      }, { status: 400 });
    }

    const editCount = getCustomerEditCount(latest);

    let oldItems: any[] = [];
    try {
      oldItems = JSON.parse(String(latest.ITEMS || '[]'));
    } catch {}

    const oldQty = new Map<string, number>();
    for (const it of oldItems) {
      oldQty.set(it.id, Number(it.qty) || 0);
    }

    // Normalizar borrador
    const normalizedDraft = draftItems.map(it => {
      const qty = Math.max(1, Number(it.qty) || 1);
      const price = Number(it.price) || 0;
      return {
        id: it.id,
        name: it.name,
        price,
        qty,
        img: it.img || '',
        total: price * qty
      };
    });

    const ids = new Set<string>([...oldItems.map(i => i.id), ...normalizedDraft.map(i => i.id)]);

    // 3. Validar stock (sin modificar nada todavía)
    const validation: { pid: string; currentStock: number; prevQty: number; nextQty: number; delta: number; name: string; isMainStoreProduct: boolean }[] = [];

    for (const pid of ids) {
      const prevQty = oldQty.get(pid) || 0;
      const nextQty = normalizedDraft.find(x => x.id === pid)?.qty || 0;
      const delta = nextQty - prevQty;
      if (delta === 0) continue;

      const productDoc = await serverGetDocument(PRODUCTS_COLLECTION_ID, pid) as any;
      if (isVendorOrder && String(productDoc.VENDOR_ID || '') !== String(latest.VENDOR_ID || '')) {
        return NextResponse.json({
          error: `El producto "${String(productDoc.NAME || pid)}" no pertenece a la tienda de este pedido.`
        }, { status: 400 });
      }
      const currentStock = getInventoryStock(productDoc, inventoryMode, isMainStoreProduct(productDoc));
      const name = String(productDoc.NAME || pid);

      if (currentStock !== 99999 && delta > 0 && currentStock < delta) {
        return NextResponse.json({
          error: `Stock insuficiente para "${name}". Disponible: ${currentStock}, necesitas: ${delta}.`
        }, { status: 400 });
      }

      validation.push({ pid, currentStock, prevQty, nextQty, delta, name, isMainStoreProduct: !isVendorOrder && isMainStoreProduct(productDoc) });
    }

    // 4. Aplicar cambios en inventario (con rollback si falla alguno)
    const applied: { pid: string; prevStock: number; isMainStoreProduct: boolean }[] = [];
    try {
      for (const v of validation) {
        if (v.currentStock === 99999) continue;

        const newStock = v.currentStock - v.delta;
        applied.push({ pid: v.pid, prevStock: v.currentStock, isMainStoreProduct: v.isMainStoreProduct });

        await serverUpdateDocument(PRODUCTS_COLLECTION_ID, v.pid, inventoryStockUpdate(newStock, inventoryMode, v.isMainStoreProduct));
      }
    } catch (err: any) {
      for (const a of applied) {
        try {
          await serverUpdateDocument(PRODUCTS_COLLECTION_ID, a.pid, inventoryStockUpdate(a.prevStock, inventoryMode, a.isMainStoreProduct));
        } catch {}
      }
      return NextResponse.json({ error: `Error actualizando inventario: ${err.message}` }, { status: 500 });
    }

    // 5. Guardar pedido actualizado
    const newSubtotal = computeSubtotal(normalizedDraft);
    const discount = Number(latest.DISCOUNT ?? 0) || 0;
    const newTotal = Math.max(0, newSubtotal - discount);

    try {
      await serverUpdateDocument(targetCollection, orderId, {
        ITEMS: JSON.stringify(normalizedDraft),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal,
        UPDATEDAT: Date.now(),
        CUSTOMEREDITCOUNT: editCount + 1,
        INVENTORYMODE: inventoryMode,
      });
      if (targetCollection === ORDERS_COLLECTION_ID || targetCollection === WHOLESALE_ORDERS_COLLECTION) {
        invalidatePosWebReservations();
      }
    } catch (err: any) {
      for (const a of applied) {
        try {
          await serverUpdateDocument(PRODUCTS_COLLECTION_ID, a.pid, inventoryStockUpdate(a.prevStock, inventoryMode, a.isMainStoreProduct));
        } catch {}
      }
      return NextResponse.json({ error: `Error guardando pedido: ${err.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API edit-order] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
