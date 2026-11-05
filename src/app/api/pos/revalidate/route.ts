import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments } from '@/lib/db-server';
import { getCachedPosWebReservations } from '@/lib/pos-web-reservations';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pos/revalidate
 *
 * Revalidación BATCH de stock/precios para el cobro del POS.
 *
 * ANTES (cliente): 1 getDocument + posible 1 listDocuments POR ÍTEM del carrito,
 * y encima pasaba por el proxy con caché de 24h → datos potencialmente stale
 * (riesgo de vender sin stock real o a precio antiguo).
 *
 * AHORA (servidor): máximo 2 queries a Appwrite POR COBRO completo:
 *   1) equal('$id', [...ids])    → resuelve la mayoría en 1 sola lectura
 *   2) equal('SKU', [...skus])   → fallback solo para los no resueltos
 * El stock y precio de producto siempre se consultan frescos. Las reservas web
 * usan una caché compartida que se invalida solo al cambiar stock reservado.
 *
 * Además, detecta si algún producto tiene STOCK RESERVADO por PEDIDOS WEB CONFIRMADOS
 * (STOCKDEDUCTED: true, STATUS in ['paid', 'payment_expired', 'processing', 'payment_confirmed', 'confirmed', 'shipped']).
 *
 * Body: { items: Array<{ id?: string; sku?: string }> }
 * Resp: { ok: true, docs: (ProductDoc & { hasWebReservation: boolean, webReservedQty: number, webOrderCodes: string[] })[], serverTime: number }
 */

const COLLECTION = 'products';

// Solo los campos que el POS necesita → payload mínimo
const SELECT_FIELDS = [
  '$id', 'SKU', 'NAME', 'BARCODE', 'IMAGEURL',
  'PRICE', 'CURRENTPRICE', 'WHOLESALEPRICE', 'EMPRENDEDORPRICE',
  'COST', 'STOCK',
];

const q = (method: string, attribute: string | null, values: unknown[]) =>
  JSON.stringify(attribute
    ? { method, attribute, values }
    : { method, values });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawItems: Array<{ id?: string; sku?: string }> = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ ok: true, docs: [], serverTime: Date.now() });
    }

    // Sanitizar y acotar (un carrito nunca supera 100 líneas distintas)
    const items = rawItems.slice(0, 100);
    const ids = [...new Set(items.map(i => (i.id || '').trim()).filter(v => v.length > 0 && v.length <= 64))];
    const skus = [...new Set(items.map(i => (i.sku || '').trim()).filter(v => v.length > 0 && v.length <= 64))];

    const byId = new Map<string, Record<string, unknown>>();
    const bySku = new Map<string, Record<string, unknown>>();

    // ── Query 1: batch por $id (1 sola lectura para todo el carrito) ──
    if (ids.length > 0) {
      try {
        const res = await serverListDocuments(COLLECTION, [
          q('equal', '$id', ids),
          q('select', null, SELECT_FIELDS),
          q('limit', null, [100]),
        ]);
        for (const doc of res.documents) {
          const d = doc as Record<string, unknown>;
          byId.set(String(d.$id), d);
          const sku = String(d.SKU ?? '').trim();
          if (sku) bySku.set(sku, d);
        }
      } catch (e) {
        console.warn('[pos/revalidate] batch por $id falló:', e);
      }
    }

    // ── Query 2: fallback por SKU solo para los NO resueltos por $id ──
    const unresolvedSkus = skus.filter(s => !bySku.has(s));
    if (unresolvedSkus.length > 0) {
      try {
        const res = await serverListDocuments(COLLECTION, [
          q('equal', 'SKU', unresolvedSkus),
          q('select', null, SELECT_FIELDS),
          q('limit', null, [100]),
        ]);
        for (const doc of res.documents) {
          const d = doc as Record<string, unknown>;
          byId.set(String(d.$id), d);
          const sku = String(d.SKU ?? '').trim();
          if (sku && !bySku.has(sku)) bySku.set(sku, d);
        }
      } catch (e) {
        console.warn('[pos/revalidate] batch por SKU falló:', e);
      }
    }

    // ── Query 3: Obtener reservas web activas con stock confirmado ──
    let webReservationsBySku: Record<string, { qty: number; orderCodes: string[] }> = {};
    let webReservationsById: Record<string, { qty: number; orderCodes: string[] }> = {};
    try {
      const reservations = await getCachedPosWebReservations();
      webReservationsBySku = reservations.bySku;
      webReservationsById = reservations.byId;
    } catch (webErr) {
      console.warn('[pos/revalidate] Error consultando reservas web:', webErr);
    }

    // Devolver un doc por ítem solicitado (mismo orden), con información de reserva web
    const docs = items.map(i => {
      const id = (i.id || '').trim();
      const sku = (i.sku || '').trim();
      const rawDoc = (id && byId.get(id)) || (sku && bySku.get(sku)) || null;
      if (!rawDoc) return null;

      const docSku = String(rawDoc.SKU ?? sku ?? '').trim().toUpperCase();
      const docId = String(rawDoc.$id ?? id ?? '').trim();
      const res = (docSku ? webReservationsBySku[docSku] : null) || (docId ? webReservationsById[docId] : null);

      return {
        ...rawDoc,
        hasWebReservation: Boolean(res && res.qty > 0),
        webReservedQty: res ? res.qty : 0,
        webOrderCodes: res ? res.orderCodes : [],
      };
    });

    return NextResponse.json(
      { ok: true, docs, serverTime: Date.now() },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (error: any) {
    console.error('[pos/revalidate] Error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'revalidate failed' }, { status: 500 });
  }
}
