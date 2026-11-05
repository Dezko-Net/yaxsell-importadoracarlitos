import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, PRODUCTS_COLLECTION_ID } from '@/lib/db-server';
import { db as clientDb } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  increment,
  arrayUnion,
} from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const STOCK_PENDING_COLLECTION = 'stock_pending';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "importadora-carlitos";
const DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "(default)";

function decodeValue(v: any): any {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return Boolean(v.booleanValue);
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue !== undefined) {
    const obj: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      obj[k] = decodeValue(val);
    }
    return obj;
  }
  return undefined;
}

function decodeDoc(doc: any) {
  const id = doc.name ? doc.name.split('/').pop() : '';
  const obj: Record<string, any> = { id };
  if (doc.fields) {
    for (const [k, val] of Object.entries(doc.fields)) {
      obj[k] = decodeValue(val);
    }
  }
  return obj;
}

// Caché en memoria de 60s para evitar lecturas repetidas cuando se abre Base de Datos en ERP
let _stockPendingCache: { ts: number; payload: { ok: boolean; items: any[]; total: number } } | null = null;
const STOCK_PENDING_CACHE_TTL_MS = 60 * 1000;

function invalidateStockPendingCache() {
  _stockPendingCache = null;
}

/**
 * GET /api/erp/stock-pending
 * Devuelve todos los productos con stock pendiente > 0 en tiempo real,
 * reconciliando automáticamente con el stock físico de la colección products
 * usando consultas filtradas (solo productos con STOCK < 0 o con deuda activa),
 * reduciendo de ~405 lecturas por llamada a ~2-10 lecturas.
 */
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === '1';
    if (!force && _stockPendingCache && Date.now() - _stockPendingCache.ts < STOCK_PENDING_CACHE_TTL_MS) {
      return NextResponse.json(_stockPendingCache.payload);
    }

    // 1. Intentar vía Firebase Admin SDK con reconciliación filtrada (sin escanear los 400+ productos)
    try {
      const adminDb = getAdminDb();
      const [spSnap, negStockUpperSnap, negStockLowerSnap] = await Promise.all([
        adminDb.collection(STOCK_PENDING_COLLECTION).get(),
        adminDb.collection(PRODUCTS_COLLECTION_ID).where('STOCK', '<', 0).get().catch(() => ({ forEach: () => {} } as any)),
        adminDb.collection(PRODUCTS_COLLECTION_ID).where('stock', '<', 0).get().catch(() => ({ forEach: () => {} } as any)),
      ]);

      const prodMap = new Map<string, any>();
      const registerProdDoc = (d: any) => {
        const data = d.data();
        if (!data) return;
        const st = Number(data.STOCK ?? data.stock ?? 0);
        const sku = String(data.SKU || data.sku || d.id).trim();
        prodMap.set(sku, {
          docId: d.id,
          sku,
          nombre: data.NAME || data.name || sku,
          stock: st,
          categoria: data.CATEGORYID || data.category || '',
          imageUrl: data.IMAGEURL || data.imageUrl || null,
        });
      };

      negStockUpperSnap.forEach(registerProdDoc);
      negStockLowerSnap.forEach(registerProdDoc);

      const spMap = new Map<string, any>();
      const pendingSkusToVerify: { sku: string; productId?: string }[] = [];
      spSnap.forEach((d: any) => {
        const data = d.data() || {};
        spMap.set(d.id, { ref: d.ref, data });
        if (Number(data.pendiente || 0) > 0 && !prodMap.has(d.id)) {
          pendingSkusToVerify.push({ sku: d.id, productId: data.productId });
        }
      });

      // Para los documentos que están en stock_pending con pendiente > 0 pero no salieron en STOCK < 0,
      // verificar puntualmente su documento en products (máximo un puñado de lecturas puntuales)
      if (pendingSkusToVerify.length > 0) {
        await Promise.all(
          pendingSkusToVerify.map(async ({ sku, productId }) => {
            try {
              if (productId) {
                const pDoc = await adminDb.collection(PRODUCTS_COLLECTION_ID).doc(productId).get();
                if (pDoc.exists) {
                  registerProdDoc(pDoc);
                  return;
                }
              }
              const byId = await adminDb.collection(PRODUCTS_COLLECTION_ID).doc(sku).get();
              if (byId.exists) {
                registerProdDoc(byId);
                return;
              }
              const bySku = await adminDb.collection(PRODUCTS_COLLECTION_ID).where('SKU', '==', sku).limit(1).get();
              if (!bySku.empty) {
                registerProdDoc(bySku.docs[0]);
              }
            } catch {}
          })
        );
      }

      const allItems: any[] = [];
      const batch = adminDb.batch();
      let hasBatchOps = false;
      const now = Date.now();
      const fechaHoy = new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Reconciliar productos con stock negativo (< 0)
      for (const [sku, p] of prodMap.entries()) {
        if (p.stock < 0) {
          const realDebt = Math.abs(p.stock);
          const spEntry = spMap.get(sku);
          const spData = spEntry?.data || {};

          allItems.push({
            id: sku,
            sku,
            productId: p.docId,
            nombre: p.nombre,
            pendiente: realDebt,
            stockActual: p.stock,
            ultimaVentaFecha: spData.ultimaVentaFecha || fechaHoy,
            ultimaVentaTs: spData.ultimaVentaTs || now,
            categoria: p.categoria,
            imageUrl: p.imageUrl,
          });

          // Si en stock_pending la deuda es diferente o no existe, auto-corregir
          if (!spEntry || Number(spData.pendiente || 0) !== realDebt) {
            batch.set(
              adminDb.collection(STOCK_PENDING_COLLECTION).doc(sku),
              {
                sku,
                productId: p.docId,
                nombre: p.nombre,
                pendiente: realDebt,
                ultimaVentaFecha: spData.ultimaVentaFecha || fechaHoy,
                ultimaVentaTs: spData.ultimaVentaTs || now,
                actualizadoEnTs: now,
              },
              { merge: true }
            );
            hasBatchOps = true;
          }
        }
      }

      // Limpiar documentos en stock_pending cuyo stock en products ya es >= 0
      for (const [sku, spEntry] of spMap.entries()) {
        const p = prodMap.get(sku);
        const curPend = Number(spEntry.data.pendiente || 0);
        if (curPend > 0 && (!p || p.stock >= 0)) {
          batch.update(spEntry.ref, {
            pendiente: 0,
            limpiadoEnTs: now,
            nota: 'Deuda saldada automáticamente: stock >= 0 en catálogo oficial',
          });
          hasBatchOps = true;
        }
      }

      if (hasBatchOps) {
        batch.commit().catch((err: any) => console.warn('[stock-pending auto-reconcile batch error]', err));
      }

      allItems.sort((a, b) => (Number(b.pendiente) || 0) - (Number(a.pendiente) || 0));
      const payload = { ok: true, items: allItems, total: allItems.length };
      _stockPendingCache = { ts: Date.now(), payload };
      return NextResponse.json(payload);
    } catch (adminErr: any) {
      console.warn('[stock-pending GET] AdminDb falló, intentando REST fallback:', adminErr?.message || adminErr);
    }

    // 2. Fallback vía Firestore REST API
    let url: string | null = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${STOCK_PENDING_COLLECTION}?key=${API_KEY}&pageSize=300`;
    const allItems: any[] = [];

    while (url) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) break;
      const data: any = await res.json();
      if (data.documents) {
        for (const d of data.documents) {
          const item = decodeDoc(d);
          if (Number(item.pendiente || 0) > 0) {
            allItems.push(item);
          }
        }
      }
      url = data.nextPageToken
        ? `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${STOCK_PENDING_COLLECTION}?key=${API_KEY}&pageSize=300&pageToken=${data.nextPageToken}`
        : null;
    }

    allItems.sort((a, b) => (Number(b.pendiente) || 0) - (Number(a.pendiente) || 0));
    const payload = { ok: true, items: allItems, total: allItems.length };
    _stockPendingCache = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[API /api/erp/stock-pending GET] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error cargando stock pendiente' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/erp/stock-pending
 * body: { sku, nombre, cantidad, ventaId? }
 *
 * Incrementa el stock pendiente de un producto (llamado desde el POS
 * cuando se vende un producto sin stock).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { sku, nombre, cantidad, ventaId } = body || {};

    if (!sku) {
      return NextResponse.json({ ok: false, error: 'Falta SKU' }, { status: 400 });
    }

    const qty = Math.max(1, Math.round(Number(cantidad) || 0));
    if (qty <= 0) {
      return NextResponse.json({ ok: false, error: 'Cantidad debe ser mayor a 0' }, { status: 400 });
    }

    const docRef = doc(clientDb, STOCK_PENDING_COLLECTION, sku);
    const now = Date.now();
    const fecha = new Date(now - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

    await setDoc(docRef, {
      sku,
      nombre: nombre || sku,
      pendiente: increment(qty),
      ultimaVentaTs: now,
      ultimaVentaFecha: fecha,
      historico: arrayUnion({
        cantidad: qty,
        fecha,
        ventaId: ventaId || '',
        ts: now,
      }),
    }, { merge: true });

    _stockPendingCache = null;
    return NextResponse.json({ ok: true, sku, pendienteIncrementado: qty });
  } catch (error: any) {
    console.error('[API /api/erp/stock-pending POST] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error registrando stock pendiente' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/erp/stock-pending?sku=XXX
 * Limpia el stock pendiente de un SKU (llamado al agregar stock real).
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku');

    if (!sku) {
      return NextResponse.json({ ok: false, error: 'Falta SKU' }, { status: 400 });
    }

    const docRef = doc(clientDb, STOCK_PENDING_COLLECTION, sku);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ ok: true, pendiente: 0, message: 'No había pendiente' });
    }

    const data = docSnap.data() || {};
    const pendiente = Number(data.pendiente || 0);

    // Limpiar pendiente a 0 (conservar historico)
    await updateDoc(docRef, { pendiente: 0, limpiadoEnTs: Date.now() });

    _stockPendingCache = null;
    return NextResponse.json({ ok: true, pendienteLimpio: pendiente });
  } catch (error: any) {
    console.error('[API /api/erp/stock-pending DELETE] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error limpiando stock pendiente' },
      { status: 500 }
    );
  }
}

