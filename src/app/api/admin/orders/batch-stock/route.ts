import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache';
import { getInventoryConnectionMode, getInventoryStock } from '@/lib/inventory-mode';

export const dynamic = 'force-dynamic';

interface CachedStock {
  stock: number | null;
  pending: number;
  sku: string;
  name: string;
  ts: number;
  inventoryMode: 'erp_integrated' | 'web_independent';
}

const gBatchStock = globalThis as unknown as {
  __yaxsellBatchStockCache?: Map<string, CachedStock>;
  __yaxsellStockPendingMap?: { map: Map<string, number>; ts: number };
};

function getMemoryStockCache(): Map<string, CachedStock> {
  if (!gBatchStock.__yaxsellBatchStockCache) {
    gBatchStock.__yaxsellBatchStockCache = new Map();
  }
  return gBatchStock.__yaxsellBatchStockCache;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const PENDING_MAP_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getStockPendingMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (gBatchStock.__yaxsellStockPendingMap && now - gBatchStock.__yaxsellStockPendingMap.ts < PENDING_MAP_TTL_MS) {
    return gBatchStock.__yaxsellStockPendingMap.map;
  }
  const map = new Map<string, number>();
  try {
    const db = getAdminDb();
    const snap = await db.collection('stock_pending').limit(500).get();
    for (const doc of snap.docs) {
      const val = Number(doc.data()?.pendiente || 0);
      if (val > 0) {
        map.set(doc.id, val);
        map.set(doc.id.toUpperCase(), val);
      }
    }
  } catch {}
  gBatchStock.__yaxsellStockPendingMap = { map, ts: now };
  return map;
}

/**
 * POST /api/admin/orders/batch-stock
 * Recibe lista de ítems de pedidos y devuelve su stock físico y deuda pendiente consolidada.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawItems: Array<{ id?: string; sku?: string; name?: string }> = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ stockMap: {} });
    }

    const now = Date.now();
    const inventoryMode = await getInventoryConnectionMode();
    const memoryStockCache = getMemoryStockCache();
    const resultStockMap: Record<string, { stock: number | null; pending: number; sku: string; name: string }> = {};
    const itemsToFetch: Array<{ id?: string; sku?: string; name?: string; lookupKey: string }> = [];

    // 1. Revisar qué ítems ya están en caché en memoria
    for (const item of rawItems) {
      const id = String(item.id || '').trim();
      const sku = String(item.sku || '').trim();
      const name = String(item.name || '').trim();
      const lookupKey = id || sku || name;

      if (!lookupKey) continue;

      const cached = memoryStockCache.get(lookupKey) || (sku ? memoryStockCache.get(sku) : undefined) || (id ? memoryStockCache.get(id) : undefined);
      if (cached && cached.inventoryMode === inventoryMode && (now - cached.ts < CACHE_TTL_MS)) {
        if (id) resultStockMap[id] = { stock: cached.stock, pending: cached.pending, sku: cached.sku, name: cached.name };
        if (sku) resultStockMap[sku] = { stock: cached.stock, pending: cached.pending, sku: cached.sku, name: cached.name };
        if (name) resultStockMap[name] = { stock: cached.stock, pending: cached.pending, sku: cached.sku, name: cached.name };
      } else {
        itemsToFetch.push({ id, sku, name, lookupKey });
      }
    }

    // 2. Si faltan ítems, resolver desde catálogo en RAM primero y solo caer a Firestore si no existe
    if (itemsToFetch.length > 0) {
      const db = getAdminDb();
      const productsCol = db.collection(PRODUCTS_COLLECTION_ID);
      const [ramCatalogRaw, pendingMap] = await Promise.all([
        getCachedAllProducts().catch(() => []),
        getStockPendingMap(),
      ]);
      const ramCatalog = ramCatalogRaw.filter(isMainStoreProduct);

      // Deduplicar por clave única
      const uniqueItemsMap = new Map<string, { id?: string; sku?: string; name?: string; lookupKey: string }>();
      for (const item of itemsToFetch) {
        if (!uniqueItemsMap.has(item.lookupKey)) {
          uniqueItemsMap.set(item.lookupKey, item);
        }
      }

      await Promise.all(Array.from(uniqueItemsMap.values()).map(async (item) => {
        let currentStock: number | null = null;
        let realSku = item.sku || '';
        let realName = item.name || '';
        let found = false;

        // Búsqueda 0: En catálogo en RAM (0 lecturas Firestore)
        if (ramCatalog.length > 0) {
          const ramMatch = ramCatalog.find((p: any) =>
            (item.id && (p.$id === item.id || p.id === item.id)) ||
            (item.sku && String(p.SKU || p.sku || '').toUpperCase() === item.sku.toUpperCase()) ||
            (item.name && String(p.NAME || p.name || '').toUpperCase() === item.name.toUpperCase())
          );
          if (ramMatch) {
            currentStock = getInventoryStock(ramMatch, inventoryMode, true);
            realSku = String(ramMatch.SKU || ramMatch.sku || realSku);
            realName = String(ramMatch.NAME || ramMatch.name || realName);
            found = true;
          }
        }

        // Búsqueda 1: por ID de documento en Firestore
        if (!found && item.id && item.id.length > 3) {
          try {
            const snap = await productsCol.doc(item.id).get();
            if (snap.exists) {
              const d = snap.data() as any;
              currentStock = getInventoryStock(d, inventoryMode, isMainStoreProduct(d));
              realSku = String(d.SKU || d.sku || realSku);
              realName = String(d.NAME || d.name || realName);
              found = true;
            }
          } catch {}
        }

        // Búsqueda 2: por SKU
        if (!found && item.sku && item.sku !== '-' && item.sku !== 'undefined') {
          try {
            let snap = await productsCol.where('SKU', '==', item.sku).limit(1).get();
            if (snap.empty) snap = await productsCol.where('sku', '==', item.sku).limit(1).get();
            if (!snap.empty) {
              const d = snap.docs[0].data() as any;
              currentStock = getInventoryStock(d, inventoryMode, isMainStoreProduct(d));
              realSku = String(d.SKU || d.sku || item.sku);
              realName = String(d.NAME || d.name || realName);
              found = true;
            }
          } catch {}
        }

        // Búsqueda 3: por nombre
        if (!found && item.name) {
          try {
            let snap = await productsCol.where('NAME', '==', item.name).limit(1).get();
            if (snap.empty) snap = await productsCol.where('name', '==', item.name).limit(1).get();
            if (!snap.empty) {
              const d = snap.docs[0].data() as any;
              currentStock = getInventoryStock(d, inventoryMode, isMainStoreProduct(d));
              realSku = String(d.SKU || d.sku || '');
              realName = String(d.NAME || d.name || item.name);
              found = true;
            }
          } catch {}
        }

        // Consultar deuda de stock pendiente desde el mapa cacheado en memoria (0 lecturas N+1)
        const targetSku = String(realSku || item.sku || '').trim();
        const pending = (targetSku && targetSku !== '-' && targetSku !== 'undefined')
          ? (pendingMap.get(targetSku) ?? pendingMap.get(targetSku.toUpperCase()) ?? 0)
          : 0;

        const finalStock = found ? (currentStock !== null ? currentStock : 0) : null;
        const entry: CachedStock = {
          stock: finalStock,
          pending,
          sku: realSku,
          name: realName,
          ts: now,
          inventoryMode,
        };

        // Guardar en caché y en mapa de respuesta
        if (item.id) {
          memoryStockCache.set(item.id, entry);
          resultStockMap[item.id] = { stock: finalStock, pending: entry.pending, sku: realSku, name: realName };
        }
        if (realSku) {
          memoryStockCache.set(realSku, entry);
          resultStockMap[realSku] = { stock: finalStock, pending: entry.pending, sku: realSku, name: realName };
        }
        if (item.sku && item.sku !== realSku) {
          memoryStockCache.set(item.sku, entry);
          resultStockMap[item.sku] = { stock: finalStock, pending: entry.pending, sku: realSku, name: realName };
        }
        if (item.name) {
          memoryStockCache.set(item.name, entry);
          resultStockMap[item.name] = { stock: finalStock, pending: entry.pending, sku: realSku, name: realName };
        }
      }));
    }

    return NextResponse.json({ stockMap: resultStockMap });
  } catch (error: any) {
    console.error('[POST /api/admin/orders/batch-stock] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener stock en lote' }, { status: 500 });
  }
}
