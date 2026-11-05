import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, PRODUCTS_COLLECTION_ID, isAuthError } from '@/lib/db-server';
import { db as clientDb } from '@/lib/firebase';
import {
  collection as clientCollection,
  doc as clientDoc,
  getDoc as clientGetDoc,
  addDoc as clientAddDoc,
  updateDoc as clientUpdateDoc,
} from 'firebase/firestore';

import { revalidateTag } from 'next/cache';
import { clearCatalogMemoryCache, resolveProductFromCatalogCache } from '@/lib/catalog-cache';

export const dynamic = 'force-dynamic';

function invalidateCatalogCaches(): void {
  try {
    clearCatalogMemoryCache(); // Soft invalidation -> Delta Sync de 1 lectura
    revalidateTag('catalog');
    revalidateTag('home');
  } catch {}
}

const STOCK_MOVEMENTS_COLLECTION = 'stock_movements';
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE";
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "importadora-carlitos";
const FIREBASE_DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "(default)";

interface StockMovement {
  id: string;
  productId: string;
  sku: string;
  nombre: string;
  tipo: 'set' | 'add' | 'resta' | 'venta' | 'ajuste' | 'edicion' | 'venta_web' | 'cancelacion_web' | 'expiracion_web' | 'ingreso_daniel' | 'anulacion' | 'devolucion';
  stockAnterior: number;
  cantidad: number; // + o -
  stockNuevo: number;
  fecha: string;
  fechaTs: number;
  fechaHora?: string;
  createdAt?: unknown;
  usuario: string;
  nota?: string;
}

function timestampValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === 'function') {
      const timestamp = toMillis.call(value);
      return Number.isFinite(timestamp) ? timestamp : 0;
    }
  }
  return 0;
}

function getMovementTimestamp(movement: StockMovement): number {
  return (
    timestampValue(movement.fechaTs) ||
    timestampValue(movement.fecha) ||
    timestampValue(movement.createdAt) ||
    timestampValue(movement.fechaHora)
  );
}

function getOpeningStock(movements: StockMovement[]) {
  if (movements.length === 0) return 0;
  const first = [...movements].sort((a, b) => {
    return getMovementTimestamp(a) - getMovementTimestamp(b);
  })[0];
  return Math.max(0, Number(first.stockAnterior) || 0);
}

function getTrackedIncome(movements: StockMovement[]) {
  return movements
    .filter(m => ['add', 'ingreso_daniel'].includes(m.tipo) && Number(m.cantidad ?? 0) > 0)
    .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);
}

function decodeFirestoreValue(v: any): any {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return Boolean(v.booleanValue);
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if (v.mapValue !== undefined) {
    const obj: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      obj[k] = decodeFirestoreValue(val);
    }
    return obj;
  }
  return undefined;
}

function decodeFirestoreDoc(doc: any): Record<string, unknown> {
  const docId = doc.name ? doc.name.split('/').pop() : '';
  const obj: Record<string, any> = { id: docId, $id: docId };
  if (doc.fields) {
    for (const [k, val] of Object.entries(doc.fields)) {
      obj[k] = decodeFirestoreValue(val);
    }
  }
  return obj;
}

async function restRunQuery(field: string, val: string, limit = 500): Promise<StockMovement[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents:runQuery?key=${FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: STOCK_MOVEMENTS_COLLECTION }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: { stringValue: val }
        }
      },
      limit
    }
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return [];
    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items
      .filter((it: any) => it.document && it.document.fields)
      .map((it: any) => decodeFirestoreDoc(it.document) as unknown as StockMovement);
  } catch (err) {
    console.warn('[restRunQuery error]', err);
    return [];
  }
}

async function restGetRecentMovements(limit = 200): Promise<StockMovement[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/${STOCK_MOVEMENTS_COLLECTION}?key=${FIREBASE_API_KEY}&pageSize=${Math.min(limit, 300)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.documents) return [];
    return data.documents.map((d: any) => decodeFirestoreDoc(d) as unknown as StockMovement);
  } catch (err) {
    console.warn('[restGetRecentMovements error]', err);
    return [];
  }
}

async function restGetProduct(productId: string): Promise<Record<string, any> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/${PRODUCTS_COLLECTION_ID}/${productId}?key=${FIREBASE_API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return decodeFirestoreDoc(data);
  } catch {
    return null;
  }
}

async function restFindProductBySku(skuVal: string): Promise<{ id: string; data: Record<string, any> } | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents:runQuery?key=${FIREBASE_API_KEY}`;
  for (const field of ['SKU', 'sku']) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: PRODUCTS_COLLECTION_ID }],
            where: {
              fieldFilter: {
                field: { fieldPath: field },
                op: 'EQUAL',
                value: { stringValue: skuVal }
              }
            },
            limit: 1
          }
        })
      });
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items) && items[0]?.document?.fields) {
          const doc = decodeFirestoreDoc(items[0].document);
          return { id: doc.id as string, data: doc };
        }
      }
    } catch {}
  }
  return null;
}

async function getMovementsViaRest(productId: string | null, sku: string | null, limit: number): Promise<{ movements: StockMovement[]; summary?: any }> {
  let movements: StockMovement[] = [];
  let summary: any = undefined;
  if (productId || sku) {
    const targetSkus = new Set<string>();
    const targetProductIds = new Set<string>();

    if (sku) {
      targetSkus.add(sku);
      if (sku.startsWith('IDB')) targetSkus.add(sku.replace('IDB', ''));
      if (!sku.startsWith('IDB') && !sku.startsWith('DB')) targetSkus.add('IDB' + sku);
    }
    if (productId) targetProductIds.add(productId);

    if (productId) {
      const prodData = await restGetProduct(productId);
      if (prodData) {
        if (prodData.SKU) targetSkus.add(String(prodData.SKU));
        if (prodData.sku) targetSkus.add(String(prodData.sku));
      }
    }
    if (sku) {
      const found = await restFindProductBySku(sku);
      if (found) {
        targetProductIds.add(found.id);
        if (found.data.SKU) targetSkus.add(String(found.data.SKU));
        if (found.data.sku) targetSkus.add(String(found.data.sku));
      }
    }

    const queries: Promise<StockMovement[]>[] = [];
    for (const s of targetSkus) {
      queries.push(restRunQuery('sku', s, limit));
    }
    for (const pid of targetProductIds) {
      queries.push(restRunQuery('productId', pid, limit));
      queries.push(restRunQuery('sku', pid, limit));
    }

    const results = await Promise.all(queries);
    const docsMap = new Map<string, StockMovement>();
    for (const resList of results) {
      for (const m of resList) {
        if (!docsMap.has(m.id)) {
          docsMap.set(m.id, m);
        }
      }
    }
    const allMovements = Array.from(docsMap.values());
    const totalVentasCaja = allMovements
      .filter(m => m.tipo === 'venta' || (m.tipo === 'resta' && !m.usuario?.includes('Web')))
      .reduce((acc, m) => acc + Math.abs(Number(m.cantidad ?? 0)), 0);

    const totalAnulacionesCaja = allMovements
      .filter(m => m.tipo === 'anulacion' || (Number(m.cantidad ?? 0) > 0 && m.nota?.toLowerCase().includes('restitución stock pos')))
      .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);

    const totalVentasWeb = allMovements
      .filter(m => m.tipo === 'venta_web')
      .reduce((acc, m) => acc + Math.abs(Number(m.cantidad ?? 0)), 0);

    const totalDevolucionesWeb = allMovements
      .filter(m => ['cancelacion_web', 'expiracion_web'].includes(m.tipo))
      .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);

    const totalStockInicial = getOpeningStock(allMovements);
    const totalIngresos = getTrackedIncome(allMovements) + totalStockInicial;

    summary = {
      totalIngresos,
      totalStockInicial,
      totalVentasCaja,
      totalAnulacionesCaja,
      totalVentasWeb,
      totalDevolucionesWeb,
      totalMovimientos: allMovements.length,
    };

    movements = allMovements;
  } else {
    movements = await restGetRecentMovements(limit);
  }

  const getTs = (m: any) => getMovementTimestamp(m);

  movements.sort((a: any, b: any) => getTs(b) - getTs(a));
  return { movements: movements.slice(0, limit), summary };
}

/**
 * GET /api/erp/stock-movements?productId=xxx&limit=100
 * Devuelve el historial de movimientos de stock.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  const sku = searchParams.get('sku');
  const isSingleProduct = Boolean(productId || sku);
  const limitParam = searchParams.get('limit');
  const limit = isSingleProduct
    ? (limitParam ? Math.min(Number(limitParam), 5000) : 2000)
    : Math.min(Number(limitParam || 200), 500);

  try {
    const adminDb = getAdminDb();
    const col = adminDb.collection(STOCK_MOVEMENTS_COLLECTION);

    let movements: StockMovement[] = [];
    let summary: any = undefined;

    if (productId || sku) {
      const targetSkus = new Set<string>();
      const targetProductIds = new Set<string>();

      if (sku) {
        targetSkus.add(sku);
        if (sku.startsWith('IDB')) targetSkus.add(sku.replace('IDB', ''));
        if (!sku.startsWith('IDB') && !sku.startsWith('DB')) targetSkus.add('IDB' + sku);
      }
      if (productId) targetProductIds.add(productId);

      // Descubrir contrapartes primero desde caché en memoria (0 lecturas a Firestore)
      const cachedMatch = resolveProductFromCatalogCache({
        id: productId || undefined,
        sku: sku || undefined,
      });
      if (cachedMatch) {
        if (cachedMatch.id) targetProductIds.add(cachedMatch.id);
        if (cachedMatch.sku) targetSkus.add(cachedMatch.sku);
      } else {
        // Fallback a la colección `products` solo si no está en caché
        try {
          const prodCol = adminDb.collection(PRODUCTS_COLLECTION_ID);
          if (productId) {
            const docSnap = await prodCol.doc(productId).get();
            if (docSnap.exists) {
              const d = docSnap.data() || {};
              if (d.SKU) targetSkus.add(String(d.SKU));
              if (d.sku) targetSkus.add(String(d.sku));
            }
          }
          if (sku) {
            let snapP = await prodCol.where('SKU', '==', sku).limit(1).get();
            if (snapP.empty) snapP = await prodCol.where('sku', '==', sku).limit(1).get();
            if (snapP.empty && sku.startsWith('IDB')) snapP = await prodCol.where('SKU', '==', sku.replace('IDB', '')).limit(1).get();
            if (snapP.empty && !sku.startsWith('IDB')) snapP = await prodCol.where('SKU', '==', 'IDB' + sku).limit(1).get();
            
            if (!snapP.empty) {
              const pDoc = snapP.docs[0];
              targetProductIds.add(pDoc.id);
              const d = pDoc.data() || {};
              if (d.SKU) targetSkus.add(String(d.SKU));
              if (d.sku) targetSkus.add(String(d.sku));
            }
          }
        } catch (errP) {
          console.warn('[API /api/erp/stock-movements GET] Error resolviendo alias de producto con Admin SDK:', errP);
        }
      }

      // Ejecutar búsquedas en paralelo para capturar todos los formatos de registro
      const queries: Promise<any>[] = [];
      for (const s of targetSkus) {
        queries.push(col.where('sku', '==', s).limit(limit).get());
      }
      for (const pid of targetProductIds) {
        queries.push(col.where('productId', '==', pid).limit(limit).get());
        queries.push(col.where('sku', '==', pid).limit(limit).get());
      }

      const snaps = await Promise.all(queries);
      const docsMap = new Map<string, StockMovement>();

      for (const s of snaps) {
        for (const doc of s.docs) {
          if (!docsMap.has(doc.id)) {
            docsMap.set(doc.id, { id: doc.id, ...doc.data() } as StockMovement);
          }
        }
      }

      const allMovements = Array.from(docsMap.values());
      const totalVentasCaja = allMovements
        .filter(m => m.tipo === 'venta' || (m.tipo === 'resta' && !m.usuario?.includes('Web')))
        .reduce((acc, m) => acc + Math.abs(Number(m.cantidad ?? 0)), 0);

      const totalAnulacionesCaja = allMovements
        .filter(m => m.tipo === 'anulacion' || (Number(m.cantidad ?? 0) > 0 && m.nota?.toLowerCase().includes('restitución stock pos')))
        .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);

      const totalVentasWeb = allMovements
        .filter(m => m.tipo === 'venta_web')
        .reduce((acc, m) => acc + Math.abs(Number(m.cantidad ?? 0)), 0);

      const totalDevolucionesWeb = allMovements
        .filter(m => ['cancelacion_web', 'expiracion_web'].includes(m.tipo))
        .reduce((acc, m) => acc + Number(m.cantidad ?? 0), 0);

      const totalStockInicial = getOpeningStock(allMovements);
      const totalIngresos = getTrackedIncome(allMovements) + totalStockInicial;

      summary = {
        totalIngresos,
        totalStockInicial,
        totalVentasCaja,
        totalAnulacionesCaja,
        totalVentasWeb,
        totalDevolucionesWeb,
        totalMovimientos: allMovements.length,
      };

      movements = allMovements;
    } else {
      // Global list: orderBy fechaTs is fine without composite index
      const snap = await col.orderBy('fechaTs', 'desc').limit(limit).get();
      movements = snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      })) as StockMovement[];
    }

    const getTs = (m: any) =>
      Number(m.fechaTs) ||
      (m.fecha && !isNaN(Number(m.fecha)) ? Number(m.fecha) : 0) ||
      (m.createdAt ? new Date(m.createdAt).getTime() : 0) ||
      0;

    // Sort in memory by timestamp desc when filtering by sku/productId
    if (productId || sku) {
      movements.sort((a: any, b: any) => getTs(b) - getTs(a));
      movements = movements.slice(0, limit);
    }

    return NextResponse.json({ ok: true, movements, total: movements.length, summary });
  } catch (error: any) {
    if (isAuthError(error) || String(error?.message || '').includes('UNAUTHENTICATED')) {
      console.warn('[API /api/erp/stock-movements GET] Fallback a REST Firestore debido a credenciales Admin SDK...');
      try {
        const { movements, summary } = await getMovementsViaRest(productId, sku, limit);
        return NextResponse.json({ ok: true, movements, total: movements.length, summary });
      } catch (restErr: any) {
        console.error('[API /api/erp/stock-movements GET] Error en fallback REST:', restErr);
        return NextResponse.json({ ok: false, error: restErr?.message || 'Error cargando movimientos vía REST' }, { status: 500 });
      }
    }

    console.error('[API /api/erp/stock-movements GET] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error cargando movimientos' },
      { status: 500 }
    );
  }
}

async function postMovementViaClient(body: any) {
  const { productId, sku, nombre, tipo, cantidad, usuario, nota, updates } = body || {};
  const qty = Math.max(0, Math.round(Number(cantidad) || 0));

  const prodRef = clientDoc(clientDb, PRODUCTS_COLLECTION_ID, productId);
  const prodDoc = await clientGetDoc(prodRef);
  if (!prodDoc.exists()) {
    return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
  }
  const prodData = prodDoc.data() || {};
  const stockAnterior = Number(prodData.STOCK ?? prodData.stock ?? 0);
  const productSku = sku || prodData.SKU || prodData.sku || '';

  if (tipo === 'precio_emergencia') {
    const now = Date.now();
    const precioEmergencia = Math.max(0, Math.round(Number(body.precioEmergencia ?? updates?.precioEmergencia ?? 0)));
    const precioOriginal = Math.max(0, Math.round(Number(body.precioOriginal ?? prodData.PRICE ?? 0)));
    const costoUnitario = Math.max(0, Math.round(Number(body.costoUnitario ?? prodData.COST ?? 0)));
    const movRef = await clientAddDoc(clientCollection(clientDb, STOCK_MOVEMENTS_COLLECTION), {
      productId,
      sku: productSku,
      nombre: String(nombre || prodData.NAME || prodData.name || productSku).trim(),
      tipo: 'precio_emergencia',
      subtipo: 'precio_emergencia',
      stockAnterior,
      cantidad: Math.max(1, qty || 1),
      stockNuevo: stockAnterior,
      pendienteDescontado: 0,
      precioOriginal,
      precioEmergencia,
      costoUnitario,
      boletaNumero: body.boletaNumero ?? null,
      ventaId: body.ventaId ?? null,
      sede: String(body.sede || 'donbalato-central'),
      rolUsuario: String(body.rolUsuario || 'Nivel Alto'),
      cambios: Array.isArray(body.cambios) ? body.cambios : [
        {
          campo: 'Precio Emergencia (Solo esta venta)',
          antes: `$${precioOriginal.toLocaleString('es-CL')}`,
          despues: `$${precioEmergencia.toLocaleString('es-CL')}`,
        },
      ],
      fecha: new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0],
      fechaTs: now,
      fechaHora: new Date(now - 3 * 60 * 60 * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      usuario: usuario || 'POS',
      nota: nota || `Precio personalizado de emergencia en venta: $${precioEmergencia.toLocaleString('es-CL')}`,
    });
    return NextResponse.json({
      ok: true,
      movementId: movRef.id,
      stockAnterior,
      stockNuevo: stockAnterior,
    });
  }

  if (tipo === 'edicion') {
    const now = Date.now();
    const nextSku = String(updates?.sku ?? productSku).trim().toUpperCase();
    const nextNombre = String(updates?.nombre ?? prodData.NAME ?? prodData.name ?? '').trim();
    const nextBarcode = updates?.codigo_barra !== undefined
      ? String(updates.codigo_barra || '').trim()
      : String(prodData.BARCODE ?? prodData.barcode ?? prodData.codigo_barra ?? '').trim();
    const nextPackageQty = updates?.packageQty !== undefined
      ? String(updates.packageQty || '').trim()
      : String(prodData.PACKAGE_QTY ?? prodData.QUANTITY ?? prodData.packageQty ?? prodData.cantidad_embalaje ?? prodData.EMBALAJEQTY ?? '').trim();
    const productUpdate: any = {
      SKU: nextSku,
      jumpseller_id: nextSku,
      NAME: nextNombre,
      CATEGORYID: String(updates?.category ?? prodData.CATEGORYID ?? ''),
      PRICE: Math.max(0, Math.round(Number(updates?.precio_venta_1 ?? prodData.PRICE ?? 0))),
      CURRENTPRICE: Math.max(0, Math.round(Number(updates?.precio_venta_1 ?? prodData.CURRENTPRICE ?? prodData.PRICE ?? 0))),
      WHOLESALEPRICE: Math.max(0, Math.round(Number(updates?.precio_venta_2 ?? prodData.WHOLESALEPRICE ?? 0))),
      EMPRENDEDORPRICE: Math.max(0, Math.round(Number(updates?.precio_venta_3 ?? prodData.EMPRENDEDORPRICE ?? 0))),
      COST: Math.max(0, Math.round(Number(updates?.costo_uni ?? prodData.COST ?? 0))),
      IMAGEURL: String(updates?.imageUrl ?? prodData.IMAGEURL ?? prodData.imageUrl ?? ''),
      BARCODE: nextBarcode,
      barcode: nextBarcode,
      codigo_barra: nextBarcode,
      PACKAGE_QTY: nextPackageQty,
      QUANTITY: nextPackageQty,
      packageQty: nextPackageQty,
      cantidad_embalaje: nextPackageQty,
      EMBALAJEQTY: nextPackageQty,
      updatedAt: now,
    };
    await clientUpdateDoc(prodRef, productUpdate);
    const movRef = await clientAddDoc(clientCollection(clientDb, STOCK_MOVEMENTS_COLLECTION), {
      productId,
      sku: nextSku,
      skuAnterior: productSku !== nextSku ? productSku : null,
      nombre: nextNombre,
      tipo: 'edicion',
      subtipo: String(updates?.subtipo || 'edicion_catalogo'),
      stockAnterior,
      cantidad: 0,
      stockNuevo: stockAnterior,
      pendienteDescontado: 0,
      sede: String(body.sede || 'donbalato-central'),
      rolUsuario: String(body.rolUsuario || 'Nivel Alto'),
      cambios: Array.isArray(body.cambios) ? body.cambios : [],
      codigo_barra: nextBarcode,
      packageQty: nextPackageQty,
      fecha: new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0],
      fechaTs: now,
      fechaHora: new Date(now - 3 * 60 * 60 * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      usuario: usuario || 'POS',
      nota: nota || 'Edición básica desde POS (sin alterar stock)',
    });
    invalidateCatalogCaches();
    return NextResponse.json({
      ok: true,
      movementId: movRef.id,
      stockAnterior,
      stockNuevo: stockAnterior,
      pendienteDescontado: 0,
      product: {
        id: productId,
        sku: nextSku,
        nombre: nextNombre,
        category: productUpdate.CATEGORYID,
        precio_venta_1: productUpdate.PRICE,
        precio_venta_2: productUpdate.WHOLESALEPRICE,
        precio_venta_3: productUpdate.EMPRENDEDORPRICE,
        costo_uni: productUpdate.COST,
        imageUrl: productUpdate.IMAGEURL,
        codigo_barra: nextBarcode,
        packageQty: nextPackageQty,
        stock: stockAnterior,
      },
    });
  }

  let pendienteDescontado = 0;
  let pendienteRestante = 0;
  if (tipo === 'set' || tipo === 'add') {
    try {
      const pendingRef = clientDoc(clientDb, 'stock_pending', productSku);
      const pendingDoc = await clientGetDoc(pendingRef);
      if (pendingDoc.exists()) {
        const pendingData = pendingDoc.data() || {};
        const pendiente = Number(pendingData.pendiente || 0);
        if (pendiente > 0) {
          pendienteDescontado = Math.min(pendiente, qty);
          pendienteRestante = Math.max(0, pendiente - pendienteDescontado);
          await clientUpdateDoc(pendingRef, {
            pendiente: pendienteRestante,
            limpiadoEnTs: Date.now(),
            ultimaCompensacionTs: Date.now(),
            ultimaCompensacionQty: qty,
            nota: pendienteRestante === 0
              ? 'Deuda saldada completamente con reposición'
              : `Abono de ${qty} uds a la deuda pendiente`,
          });
        }
      }
    } catch (pendingErr) {
      console.warn('[stock-movements client fallback] Error pendiente:', pendingErr);
    }
  }

  let stockNuevo: number;
  if (tipo === 'set') {
    stockNuevo = qty - pendienteDescontado;
  } else if (tipo === 'add') {
    if (pendienteDescontado > 0) {
      if (pendienteRestante > 0) {
        stockNuevo = -pendienteRestante;
      } else {
        const stockBase = Math.max(0, stockAnterior);
        const sobrante = Math.max(0, qty - pendienteDescontado);
        stockNuevo = stockBase + sobrante;
      }
    } else {
      stockNuevo = stockAnterior + qty;
    }
  } else if (tipo === 'resta') {
    stockNuevo = Math.max(0, stockAnterior - qty);
  } else {
    return NextResponse.json({ ok: false, error: 'Tipo no válido' }, { status: 400 });
  }

  const now = Date.now();
  await clientUpdateDoc(prodRef, {
    STOCK: stockNuevo,
    stock: stockNuevo,
    updatedAt: now,
  });

  const movementData = {
    productId,
    sku: productSku,
    nombre: nombre || prodData.NAME || prodData.name || sku || '',
    tipo,
    stockAnterior,
    cantidad: tipo === 'set' ? stockNuevo - stockAnterior : qty,
    stockNuevo,
    pendienteDescontado,
    fecha: new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0],
    fechaTs: now,
    fechaHora: new Date(now - 3 * 60 * 60 * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
    usuario: usuario || 'Sistema',
    nota: nota || (pendienteDescontado > 0
      ? `Ingreso de ${qty} uds con compensación de deuda (${pendienteDescontado} uds saldadas${pendienteRestante > 0 ? `, restan ${pendienteRestante} pendientes` : ', deuda a 0'}). Stock disponible: ${stockNuevo}.`
      : ''),
  };

  const movRef = await clientAddDoc(clientCollection(clientDb, STOCK_MOVEMENTS_COLLECTION), movementData);
  invalidateCatalogCaches();

  return NextResponse.json({
    ok: true,
    movementId: movRef.id,
    stockAnterior,
    stockNuevo,
    pendienteDescontado,
    pendienteRestante,
  });
}

/**
 * POST /api/erp/stock-movements
 * body: { productId, sku, nombre, tipo, cantidad, usuario, nota? }
 *
 * Registra un movimiento de stock y actualiza el stock del producto.
 * - tipo 'set': stockNuevo = cantidad
 * - tipo 'add': stockNuevo = stockAnterior + cantidad
 * - tipo 'resta': stockNuevo = stockAnterior - cantidad
 */
export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json().catch(() => null);
    const { productId, sku, nombre, tipo, cantidad, usuario, nota, updates } = body || {};

    if (!productId || !tipo) {
      return NextResponse.json({ ok: false, error: 'Faltan productId o tipo' }, { status: 400 });
    }

    const qty = Math.max(0, Math.round(Number(cantidad) || 0));
    if (tipo !== 'set' && tipo !== 'edicion' && tipo !== 'precio_emergencia' && qty <= 0) {
      return NextResponse.json({ ok: false, error: 'Cantidad debe ser mayor a 0' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);
    const movementsCol = adminDb.collection(STOCK_MOVEMENTS_COLLECTION);

    // Leer stock actual
    const prodDoc = await productsCol.doc(productId).get();
    if (!prodDoc.exists) {
      return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    }
    const prodData = prodDoc.data() || {};
    const stockAnterior = Number(prodData.STOCK ?? prodData.stock ?? 0);
    const productSku = sku || prodData.SKU || prodData.sku || '';

    if (tipo === 'precio_emergencia') {
      const now = Date.now();
      const movementRef = movementsCol.doc();
      const precioEmergencia = Math.max(0, Math.round(Number(body.precioEmergencia ?? updates?.precioEmergencia ?? 0)));
      const precioOriginal = Math.max(0, Math.round(Number(body.precioOriginal ?? prodData.PRICE ?? 0)));
      const costoUnitario = Math.max(0, Math.round(Number(body.costoUnitario ?? prodData.COST ?? 0)));
      await movementRef.set({
        productId,
        sku: productSku,
        nombre: String(nombre || prodData.NAME || prodData.name || productSku).trim(),
        tipo: 'precio_emergencia',
        subtipo: 'precio_emergencia',
        stockAnterior,
        cantidad: Math.max(1, qty || 1),
        stockNuevo: stockAnterior,
        pendienteDescontado: 0,
        precioOriginal,
        precioEmergencia,
        costoUnitario,
        boletaNumero: body.boletaNumero ?? null,
        ventaId: body.ventaId ?? null,
        sede: String(body.sede || 'donbalato-central'),
        rolUsuario: String(body.rolUsuario || 'Nivel Alto'),
        cambios: Array.isArray(body.cambios) ? body.cambios : [
          {
            campo: 'Precio Emergencia (Solo esta venta)',
            antes: `$${precioOriginal.toLocaleString('es-CL')}`,
            despues: `$${precioEmergencia.toLocaleString('es-CL')}`,
          },
        ],
        fecha: new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0],
        fechaTs: now,
        fechaHora: new Date(now - 3 * 60 * 60 * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
        usuario: usuario || 'POS',
        nota: nota || `Precio personalizado de emergencia en venta: $${precioEmergencia.toLocaleString('es-CL')} (Catálogo: $${precioOriginal.toLocaleString('es-CL')})`,
      });
      return NextResponse.json({
        ok: true,
        movementId: movementRef.id,
        stockAnterior,
        stockNuevo: stockAnterior,
      });
    }

    if (tipo === 'edicion') {
      const nextSku = String(updates?.sku ?? productSku).trim().toUpperCase();
      const nextNombre = String(updates?.nombre ?? prodData.NAME ?? prodData.name ?? '').trim();
      if (!nextSku || !nextNombre) {
        return NextResponse.json({ ok: false, error: 'SKU y nombre son obligatorios' }, { status: 400 });
      }

      if (nextSku !== productSku) {
        const duplicate = await productsCol.where('SKU', '==', nextSku).limit(1).get();
        if (duplicate.docs.some((doc: any) => doc.id !== productId)) {
          return NextResponse.json({ ok: false, error: `El SKU ${nextSku} ya existe` }, { status: 409 });
        }
      }

      const oldPendingRef = adminDb.collection('stock_pending').doc(productSku);
      const oldPendingSnap = await oldPendingRef.get();
      const oldPendingData = oldPendingSnap.exists ? oldPendingSnap.data() || {} : {};
      const pendingBefore = Number(oldPendingData.pendiente || 0);
      // BLINDAJE DE STOCK EN EDICIÓN: Editar un producto jamás modifica el stock físico en vivo.
      // El stock solo puede modificarse al crear el producto o mediante movimientos explícitos ('add' / 'set' / 'resta').
      const stockNuevo = stockAnterior;
      const pendingRemaining = pendingBefore;
      const pendingDiscount = 0;
      const now = Date.now();
      const nextBarcode = updates?.codigo_barra !== undefined
        ? String(updates.codigo_barra || '').trim()
        : String(prodData.BARCODE ?? prodData.barcode ?? prodData.codigo_barra ?? '').trim();
      const nextPackageQty = updates?.packageQty !== undefined
        ? String(updates.packageQty || '').trim()
        : String(prodData.PACKAGE_QTY ?? prodData.QUANTITY ?? prodData.packageQty ?? prodData.cantidad_embalaje ?? prodData.EMBALAJEQTY ?? '').trim();

      const productUpdate: any = {
        SKU: nextSku,
        jumpseller_id: nextSku,
        NAME: nextNombre,
        CATEGORYID: String(updates?.category ?? prodData.CATEGORYID ?? ''),
        PRICE: Math.max(0, Math.round(Number(updates?.precio_venta_1 ?? prodData.PRICE ?? 0))),
        CURRENTPRICE: Math.max(0, Math.round(Number(updates?.precio_venta_1 ?? prodData.CURRENTPRICE ?? prodData.PRICE ?? 0))),
        WHOLESALEPRICE: Math.max(0, Math.round(Number(updates?.precio_venta_2 ?? prodData.WHOLESALEPRICE ?? 0))),
        EMPRENDEDORPRICE: Math.max(0, Math.round(Number(updates?.precio_venta_3 ?? prodData.EMPRENDEDORPRICE ?? 0))),
        COST: Math.max(0, Math.round(Number(updates?.costo_uni ?? prodData.COST ?? 0))),
        IMAGEURL: String(updates?.imageUrl ?? prodData.IMAGEURL ?? prodData.imageUrl ?? ''),
        BARCODE: nextBarcode,
        barcode: nextBarcode,
        codigo_barra: nextBarcode,
        PACKAGE_QTY: nextPackageQty,
        QUANTITY: nextPackageQty,
        packageQty: nextPackageQty,
        cantidad_embalaje: nextPackageQty,
        EMBALAJEQTY: nextPackageQty,
        updatedAt: now,
      };

      const batch = adminDb.batch();
      batch.update(productsCol.doc(productId), productUpdate);

      if (oldPendingSnap.exists) {
        if (nextSku !== productSku) {
          const newPendingRef = adminDb.collection('stock_pending').doc(nextSku);
          const newPendingSnap = await newPendingRef.get();
          const newPendingData = newPendingSnap.exists ? newPendingSnap.data() || {} : {};
          batch.set(newPendingRef, {
            ...oldPendingData,
            ...newPendingData,
            sku: nextSku,
            nombre: nextNombre,
            productId,
            pendiente: Number(newPendingData.pendiente || 0) + pendingRemaining,
            historico: [...(Array.isArray(newPendingData.historico) ? newPendingData.historico : []), ...(Array.isArray(oldPendingData.historico) ? oldPendingData.historico : [])],
            actualizadoEnTs: now,
          }, { merge: true });
          batch.delete(oldPendingRef);
        } else if (String(oldPendingData.nombre || '') !== nextNombre) {
          batch.update(oldPendingRef, { nombre: nextNombre, productId, actualizadoEnTs: now });
        }
      }

      const movementRef = movementsCol.doc();
      batch.set(movementRef, {
        productId,
        sku: nextSku,
        skuAnterior: productSku !== nextSku ? productSku : null,
        nombre: nextNombre,
        tipo: 'edicion',
        subtipo: String(updates?.subtipo || 'edicion_catalogo'),
        stockAnterior,
        cantidad: 0,
        stockNuevo: stockAnterior,
        pendienteDescontado: 0,
        sede: String(body.sede || 'donbalato-central'),
        rolUsuario: String(body.rolUsuario || 'Nivel Alto'),
        cambios: Array.isArray(body.cambios) ? body.cambios : [],
        codigo_barra: nextBarcode,
        packageQty: nextPackageQty,
        fecha: new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0],
        fechaTs: now,
        fechaHora: new Date(now - 3 * 60 * 60 * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
        usuario: usuario || 'POS',
        nota: nota || 'Edición básica desde POS (sin alterar stock)',
      });
      await batch.commit();
      invalidateCatalogCaches();

      return NextResponse.json({
        ok: true,
        movementId: movementRef.id,
        stockAnterior,
        stockNuevo: stockAnterior,
        pendienteDescontado: 0,
        product: {
          id: productId,
          sku: nextSku,
          nombre: nextNombre,
          category: productUpdate.CATEGORYID,
          precio_venta_1: productUpdate.PRICE,
          precio_venta_2: productUpdate.WHOLESALEPRICE,
          precio_venta_3: productUpdate.EMPRENDEDORPRICE,
          costo_uni: productUpdate.COST,
          imageUrl: productUpdate.IMAGEURL,
          codigo_barra: nextBarcode,
          packageQty: nextPackageQty,
          stock: stockAnterior,
        },
      });
    }

    // Verificar stock pendiente (ventas sin stock que se deben descontar al ingresar mercadería con 'add',
    // o reconciliar la deuda si se hace un conteo físico directo con 'set').
    let pendienteDescontado = 0;
    let pendienteRestante = 0;
    let stockNuevo: number;

    if (tipo === 'set') {
      // Conteo físico / ajuste directo: el usuario establece el stock real exacto en estantería
      stockNuevo = Math.round(qty);
      try {
        const pendingRef = adminDb.collection('stock_pending').doc(productSku);
        const pendingDoc = await pendingRef.get();
        if (pendingDoc.exists) {
          const pendingData = pendingDoc.data() || {};
          const pendiente = Number(pendingData.pendiente || 0);
          pendienteRestante = Math.max(0, -stockNuevo);
          pendienteDescontado = Math.max(0, pendiente - pendienteRestante);
          if (pendiente !== pendienteRestante) {
            await pendingRef.update({
              pendiente: pendienteRestante,
              limpiadoEnTs: Date.now(),
              ultimaCompensacionTs: Date.now(),
              ultimaCompensacionQty: pendienteDescontado,
              nota: pendienteRestante === 0
                ? `Deuda saldada por ajuste de inventario físico (Stock fijado en ${stockNuevo})`
                : `Ajuste de inventario físico (Deuda actualizada a ${pendienteRestante})`,
            });
          }
        }
      } catch (pendingErr) {
        console.warn('[stock-movements] Error reconciliando pendiente en set:', pendingErr);
      }
    } else if (tipo === 'add') {
      // Ingreso de mercadería nueva (Daniel / Proveedor): compensa deuda pendiente automáticamente
      try {
        const pendingRef = adminDb.collection('stock_pending').doc(productSku);
        const pendingDoc = await pendingRef.get();
        const pendienteDocVal = pendingDoc.exists ? Number((pendingDoc.data() || {}).pendiente || 0) : 0;
        const deudaReal = Math.max(pendienteDocVal, stockAnterior < 0 ? Math.abs(stockAnterior) : 0);

        if (deudaReal > 0) {
          pendienteDescontado = Math.min(deudaReal, qty);
          pendienteRestante = Math.max(0, deudaReal - pendienteDescontado);
          if (pendingDoc.exists) {
            await pendingRef.update({
              pendiente: pendienteRestante,
              limpiadoEnTs: Date.now(),
              ultimaCompensacionTs: Date.now(),
              ultimaCompensacionQty: qty,
              nota: pendienteRestante === 0
                ? 'Deuda saldada completamente con reposición'
                : `Abono de ${qty} uds a la deuda pendiente`,
            });
          }
        }
      } catch (pendingErr) {
        console.warn('[stock-movements] Error consultando pendiente en add:', pendingErr);
      }

      if (pendienteDescontado > 0) {
        if (pendienteRestante > 0) {
          stockNuevo = -pendienteRestante;
        } else {
          const stockBase = Math.max(0, stockAnterior);
          const sobrante = Math.max(0, qty - pendienteDescontado);
          stockNuevo = stockBase + sobrante;
        }
      } else {
        stockNuevo = stockAnterior + qty;
      }
    } else if (tipo === 'resta') {
      stockNuevo = stockAnterior - qty;
    } else {
      return NextResponse.json({ ok: false, error: 'Tipo no válido' }, { status: 400 });
    }

    // Actualizar stock del producto
    const now = Date.now();
    await productsCol.doc(productId).update({
      STOCK: stockNuevo,
      stock: stockNuevo,
      updatedAt: now,
    });

    // Registrar movimiento
    const movementData = {
      productId,
      sku: productSku,
      nombre: nombre || prodData.NAME || prodData.name || sku || '',
      tipo,
      stockAnterior,
      cantidad: tipo === 'set' ? stockNuevo - stockAnterior : qty,
      stockNuevo,
      pendienteDescontado,
      fecha: new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0],
      fechaTs: now,
      fechaHora: new Date(now - 3 * 60 * 60 * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      sede: String(body.sede || 'donbalato-central'),
      usuario: usuario || 'Sistema',
      nota: nota || (pendienteDescontado > 0
        ? `Ingreso de ${qty} uds con compensación de deuda (${pendienteDescontado} uds saldadas${pendienteRestante > 0 ? `, restan ${pendienteRestante} pendientes` : ', deuda a 0'}). Stock disponible: ${stockNuevo}.`
        : ''),
    };

    const movRef = await movementsCol.add(movementData);
    invalidateCatalogCaches();

    return NextResponse.json({
      ok: true,
      movementId: movRef.id,
      stockAnterior,
      stockNuevo,
      pendienteDescontado,
      pendienteRestante,
    });
  } catch (error: any) {
    if (isAuthError(error) || String(error?.message || '').includes('UNAUTHENTICATED')) {
      console.warn('[API /api/erp/stock-movements POST] Fallback a client SDK por error de autenticación Admin SDK...');
      try {
        return await postMovementViaClient(body);
      } catch (clientErr: any) {
        console.error('[API /api/erp/stock-movements POST] Error en fallback client SDK:', clientErr);
        return NextResponse.json({ ok: false, error: clientErr?.message || 'Error en fallback client SDK' }, { status: 500 });
      }
    }

    console.error('[API /api/erp/stock-movements POST] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error registrando movimiento' },
      { status: 500 }
    );
  }
}
