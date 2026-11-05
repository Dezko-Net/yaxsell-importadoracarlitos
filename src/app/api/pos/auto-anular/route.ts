import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb, PRODUCTS_COLLECTION_ID } from '@/lib/db-server';
import { FieldValue, Filter } from 'firebase-admin/firestore';
import { restoreCatalogMemoryCacheStock } from '@/lib/catalog-cache';

export const dynamic = 'force-dynamic';

const VENTAS_POS_COLLECTION = 'ventas_pos';
const DEFAULT_TIMEOUT_MIN = 15;

/**
 * POST /api/pos/auto-anular
 *
 * Auto-anula pre-ventas que superaron el timeout sin que el jefe confirme el pago.
 * Devuelve el stock reservado al inventario de forma atómica.
 *
 * Body:
 *   { "timeoutMin": 15 }  // opcional, default 15 min
 *
 * Se llama desde el cliente POS cada 3 minutos mientras hay pre-ventas.
 * No existe un cron de Vercel configurado para esta ruta.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const timeoutMin = Math.max(1, Math.min(120, Number(body?.timeoutMin) || DEFAULT_TIMEOUT_MIN));
    const timeoutMs = timeoutMin * 60 * 1000;
    const now = Date.now();
    const cutoff = now - timeoutMs;

    const adminDb = getAdminDb();
    const ventasCol = adminDb.collection(VENTAS_POS_COLLECTION);
    const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);

    // Consultar solo pre-ventas que ya vencieron; antes se leían hasta 100
    // pendientes cada 3 minutos y se filtraban aquí en memoria.
    let snapshot: any
    let usedFallback = false
    try {
      snapshot = await ventasCol
        .where('estado', '==', 'pre_venta')
        .where(Filter.or(
          Filter.where('fechaTs', '<=', cutoff),
          Filter.where('createdAtTs', '<=', cutoff),
        ))
        .limit(100)
        .get()
    } catch (indexError) {
      usedFallback = true
      console.warn('[pos/auto-anular] Consulta vencida sin índice; se usa barrido acotado:', indexError)
      snapshot = await ventasCol
        .where('estado', '==', 'pre_venta')
        .limit(100)
        .get()
    }

    const expired: any[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const fechaTs = Number(data.fechaTs ?? data.createdAtTs ?? 0);
      if (fechaTs > 0 && fechaTs < cutoff) {
        expired.push({ id: docSnap.id, ...data });
      }
    });
    console.info('[pos/auto-anular] revisión', { candidatosConsultados: snapshot.size, vencidas: expired.length, usedFallback });

    if (expired.length === 0) {
      return NextResponse.json({ ok: true, anuladas: 0, candidatosConsultados: snapshot.size, usedFallback, message: 'No hay pre-ventas expiradas' });
    }

    let anuladasCount = 0;
    const errors: string[] = [];
    const allRestoredItems: { id: string; cantidad: number }[] = [];

    for (const venta of expired) {
      try {
        // 1. Marcar la venta como anulada (atómico, solo si sigue en pre_venta)
        const ventaRef = ventasCol.doc(venta.id);
        await adminDb.runTransaction(async (transaction) => {
          const snap = await transaction.get(ventaRef);
          if (!snap.exists) return;
          const data = snap.data() || {};
          if (data.estado !== 'pre_venta') return; // Ya fue cobrada o anulada
          transaction.update(ventaRef, {
            estado: 'anulada',
            anuladaEn: now,
            anuladaPor: 'auto_timeout',
            anuladaMotivo: `timeout_${timeoutMin}min`,
          });
        });

        // 2. Devolver stock al inventario
        const items = Array.isArray(venta.items) ? venta.items : [];
        const itemsToRestore = items.filter((it: any) => Number(it.cantidad) > 0);
        if (itemsToRestore.length > 0) {
          // Resolver IDs de productos por SKU si no tienen id
          for (const it of itemsToRestore) {
            if (!it.id && it.sku) {
              try {
                const snapSku = await productsCol.where('SKU', '==', it.sku).limit(1).get();
                if (!snapSku.empty) {
                  it.id = snapSku.docs[0].id;
                } else {
                  const snapSku2 = await productsCol.where('sku', '==', it.sku).limit(1).get();
                  if (!snapSku2.empty) it.id = snapSku2.docs[0].id;
                }
              } catch {}
            }
          }

          const validItems = itemsToRestore.filter((it: any) => it.id);
          if (validItems.length > 0) {
            const docRefs = validItems.map((it: any) => productsCol.doc(it.id));
            await adminDb.runTransaction(async (transaction) => {
              const snaps = await Promise.all(docRefs.map((ref: any) => transaction.get(ref)));
              for (let i = 0; i < validItems.length; i++) {
                const it = validItems[i];
                const snap = snaps[i];
                if (!snap.exists) continue;
                const data = snap.data() || {};
                const currentStock = Number(data.STOCK ?? data.stock ?? 0);
                if (currentStock === 99999) continue; // Stock ilimitado
                const newStock = currentStock + Number(it.cantidad);
                transaction.update(snap.ref, {
                  STOCK: newStock,
                  stock: newStock,
                  soldQuantity: FieldValue.increment(-Number(it.cantidad)),
                  updatedAt: now,
                });
              }
            });
            validItems.forEach((vi: any) => allRestoredItems.push({ id: vi.id, cantidad: Number(vi.cantidad) }));
          }
        }

        anuladasCount++;
      } catch (err: any) {
        errors.push(`Venta ${venta.id}: ${err?.message || String(err)}`);
      }
    }

    // Parchear caché de la Web en memoria (0 lecturas de Firestore)
    if (allRestoredItems.length > 0) {
      try { restoreCatalogMemoryCacheStock(allRestoredItems); } catch {}
    }
    try { revalidateTag('orders'); } catch {}
    try { revalidateTag('appwrite-proxy'); } catch {}

    return NextResponse.json({
      ok: true,
      anuladas: anuladasCount,
      totalExpiradas: expired.length,
      candidatosConsultados: snapshot.size,
      usedFallback,
      errors: errors.length > 0 ? errors : undefined,
      serverTime: now,
    });
  } catch (error: any) {
    console.error('[API /api/pos/auto-anular] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error en auto-anulación' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pos/auto-anular
 * Versión para cron de Vercel (sin body). Usa timeout default.
 */
export async function GET() {
  return POST(new Request('https://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeoutMin: DEFAULT_TIMEOUT_MIN }),
  }));
}
