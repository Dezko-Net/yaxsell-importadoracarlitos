import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb, PRODUCTS_COLLECTION_ID } from '@/lib/db-server';
import { FieldValue } from 'firebase-admin/firestore';
import { patchCatalogMemoryCacheStock, restoreCatalogMemoryCacheStock } from '@/lib/catalog-cache';

export const dynamic = 'force-dynamic';

const UNLIMITED_STOCK = 99999;

interface PosStockItem {
  id?: string;
  sku: string;
  cantidad: number;
  nombre?: string;
  priceField?: string;
  precioUnitario?: number;
}

/**
 * POST /api/pos/stock
 *
 * Servicio Atómico de Stock para POS:
 * 1) mode: 'validate'  -> Consulta stock fresco y precios en vivo sin tocar la BD
 * 2) mode: 'decrement' -> Transacción ACID Firestore (runTransaction):
 *                         Verifica stock y descuenta atómicamente. Si el stock fue
 *                         comprado en la web, la transacción aborta limpiamente.
 * 3) mode: 'restore'   -> Transacción ACID Firestore para restituir stock tras anulación.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const mode = body?.mode || 'validate';
    const rawItems: PosStockItem[] = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ ok: true, message: 'No items provided' });
    }

    const adminDb = getAdminDb();
    const productsCol = adminDb.collection(PRODUCTS_COLLECTION_ID);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Resolver los Document References de todos los items (por ID o por SKU)
    // ──────────────────────────────────────────────────────────────────────────
    const items = rawItems.slice(0, 100).map(it => ({
      ...it,
      id: (it.id || '').trim(),
      sku: (it.sku || '').trim(),
      cantidad: Math.max(0, Number(it.cantidad) || 0),
    }));

    // Pre-buscar IDs para los items que solo traigan SKU
    for (const it of items) {
      if (!it.id && it.sku) {
        try {
          const snap = await productsCol.where('SKU', '==', it.sku).limit(1).get();
          if (!snap.empty) {
            it.id = snap.docs[0].id;
          } else {
            const snap2 = await productsCol.where('sku', '==', it.sku).limit(1).get();
            if (!snap2.empty) it.id = snap2.docs[0].id;
          }
        } catch {}
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // MODO 1: VALIDATE (Pre-Cobro: solo lectura de datos frescos)
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === 'validate') {
      const validDocRefs = items.filter(i => i.id).map(i => productsCol.doc(i.id!));
      const docSnaps = validDocRefs.length > 0 ? await adminDb.getAll(...validDocRefs) : [];
      const docsById = new Map<string, any>();
      for (const ds of docSnaps) {
        if (ds.exists) docsById.set(ds.id, { $id: ds.id, ...ds.data() });
      }

      const issues: any[] = [];
      const freshDocs: any[] = [];

      for (const it of items) {
        const docData = it.id ? docsById.get(it.id) : null;
        if (!docData) {
          issues.push({
            sku: it.sku,
            nombre: it.nombre || it.sku,
            error: 'not_found',
            message: `El producto "${it.nombre || it.sku}" no fue encontrado en la base de datos.`,
            realStock: 0,
            requestedQty: it.cantidad,
          });
          freshDocs.push(null);
          continue;
        }

        const currentStock = Number(docData.STOCK ?? docData.stock ?? 0);
        const isUnlimited = currentStock === UNLIMITED_STOCK;
        const hasStockIssue = !isUnlimited && currentStock < it.cantidad;

        const liveDetailPrice = Number(docData.PRICE ?? docData.CURRENTPRICE ?? 0);
        const liveWholesalePrice = Number(docData.WHOLESALEPRICE ?? liveDetailPrice);
        const liveThirdPrice = Number(docData.EMPRENDEDORPRICE ?? liveDetailPrice);
        const liveCost = Number(docData.COST ?? 0);

        let livePrice = liveDetailPrice;
        if (it.priceField === 'precio_mayorista' && liveWholesalePrice > 0) livePrice = liveWholesalePrice;
        else if (it.priceField === 'precio_segundo' && liveThirdPrice > 0) livePrice = liveThirdPrice;

        const hasPriceChange = it.precioUnitario !== undefined && livePrice > 0 && livePrice !== it.precioUnitario;

        if (hasStockIssue || hasPriceChange) {
          issues.push({
            id: docData.$id,
            sku: it.sku,
            nombre: docData.NAME || it.nombre,
            imageUrl: docData.IMAGEURL || '',
            hasStockIssue,
            hasPriceChange,
            realStock: currentStock,
            requestedQty: it.cantidad,
            oldPrice: it.precioUnitario,
            newPrice: livePrice,
            actionTaken: currentStock <= 0 ? 'removed' : (currentStock < it.cantidad ? 'adjusted_qty' : 'price_updated'),
          });
        }

        freshDocs.push({
          ...docData,
          livePrice,
          liveCost,
          currentStock,
        });
      }

      return NextResponse.json({
        ok: true,
        hasStockIssue: issues.some(i => i.hasStockIssue),
        hasPriceChange: issues.some(i => i.hasPriceChange),
        issues,
        docs: freshDocs,
        serverTime: Date.now(),
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // MODO 2: DECREMENT (Venta confirmada: Transacción ACID Firestore)
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === 'decrement') {
      const rawItemsToDeduct = items.filter(it => it.id && it.cantidad > 0);
      if (rawItemsToDeduct.length === 0) {
        return NextResponse.json({ ok: true, updated: 0 });
      }

      // Consolidar líneas duplicadas del mismo producto (ej. P1 Efectivo + P2 Embalaje en el mismo carrito)
      // para evitar que dos transaction.update sobre el mismo docRef se pisen entre sí.
      const mergedDeductMap = new Map<string, PosStockItem>();
      for (const it of rawItemsToDeduct) {
        const key = String(it.id).trim();
        const prev = mergedDeductMap.get(key);
        if (prev) {
          prev.cantidad += Number(it.cantidad) || 0;
        } else {
          mergedDeductMap.set(key, { ...it, id: key, cantidad: Number(it.cantidad) || 0 });
        }
      }
      const itemsToDeduct = Array.from(mergedDeductMap.values());
      const docRefs = itemsToDeduct.map(it => productsCol.doc(it.id!));

      // Ejecutar transacción atómica en Firestore
      const pendingItems: { productId: string; sku: string; nombre: string; cantidad: number }[] = [];
      const movementsToRecord: { productId: string; sku: string; nombre: string; prevStock: number; postStock: number; cantidad: number }[] = [];

      await adminDb.runTransaction(async (transaction) => {
        // 1. Leer todos los documentos dentro de la transacción
        const snaps = await Promise.all(docRefs.map(ref => transaction.get(ref)));

        // 2. Validar stock. Productos sin stock se permiten (quedan en negativo)
        //    y se registra el pendiente para descuento automático al agregar stock real.
        for (let i = 0; i < itemsToDeduct.length; i++) {
          const it = itemsToDeduct[i];
          const snap = snaps[i];

          if (!snap.exists) {
            throw new Error(`Producto no encontrado en inventario (ID: ${it.id}).`);
          }

          const data = snap.data() || {};
          const currentStock = Number(data.STOCK ?? data.stock ?? 0);

          if (currentStock === UNLIMITED_STOCK) continue; // Stock ilimitado

          if (currentStock < it.cantidad) {
            // Stock insuficiente: permitir la venta pero registrar pendiente con SKU canónico
            const canonicalSku = String(data.SKU || data.sku || it.sku || snap.id).trim();
            const prodName = data.NAME || it.nombre || canonicalSku;
            const pendienteQty = it.cantidad - Math.max(0, currentStock);
            pendingItems.push({
              productId: docRefs[i].id,
              sku: canonicalSku,
              nombre: prodName,
              cantidad: pendienteQty,
            });
            // No lanzar error, continuar con la venta
          }
        }

        // 3. Descontar stock (permitir negativo) y registrar pendientes
        const now = Date.now();
        for (let i = 0; i < itemsToDeduct.length; i++) {
          const it = itemsToDeduct[i];
          const snap = snaps[i];
          const data = snap.data() || {};
          const currentStock = Number(data.STOCK ?? data.stock ?? 0);

          if (currentStock === UNLIMITED_STOCK) continue;

          const newStock = currentStock - it.cantidad; // puede quedar negativo
          const canonicalSku = String(data.SKU || data.sku || it.sku || snap.id).trim();

          transaction.update(snap.ref, {
            STOCK: newStock,
            stock: newStock,
            soldQuantity: FieldValue.increment(it.cantidad),
            updatedAt: now,
          });

          movementsToRecord.push({
            productId: snap.id,
            sku: canonicalSku,
            nombre: it.nombre || data.NAME || 'Producto',
            prevStock: currentStock,
            postStock: newStock,
            cantidad: it.cantidad,
          });
        }
      });

      // 3.5. Registrar movimientos de auditoría en stock_movements con hora chilena
      try {
        const movementsCol = adminDb.collection('stock_movements');
        const nowMs = Date.now();
        const fechaStr = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
        const horaChile = new Intl.DateTimeFormat('es-CL', {
          timeZone: 'America/Santiago',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(new Date(nowMs));

        const cajeroStr = body?.cajeroNombre || body?.usuario || 'Cajera POS';
        const rawFolio = body?.boletaNumero && String(body.boletaNumero) !== '0' ? body.boletaNumero : body?.ventaId;
        const folioStr = rawFolio ? (String(rawFolio).startsWith('#') ? rawFolio : `#${rawFolio}`) : '#POS';
        const clienteStr = body?.clienteNombre ? ` · Cliente: ${body.clienteNombre}` : '';
        const movSede = String(body?.sede || 'donbalato-central');

        for (const mov of movementsToRecord) {
          await movementsCol.add({
            productId: mov.productId,
            sku: mov.sku,
            nombre: mov.nombre,
            tipo: 'venta',
            stockAnterior: mov.prevStock,
            cantidad: -mov.cantidad,
            stockNuevo: mov.postStock,
            pendienteDescontado: 0,
            sede: movSede,
            fecha: fechaStr,
            fechaTs: nowMs,
            fechaHora: horaChile,
            usuario: cajeroStr,
            nota: `Venta POS Boleta ${folioStr}${clienteStr}`,
          });
        }
      } catch (movErr) {
        console.warn('[API /api/pos/stock] Error registrando stock_movements:', movErr);
      }

      // 4. Registrar stock pendiente fuera de la transacción
      if (pendingItems.length > 0) {
        try {
          const pendingCol = adminDb.collection('stock_pending');
          const now2 = Date.now();
          const fecha = new Date(now2 - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
          for (const pi of pendingItems) {
            if (!pi.sku) continue;
            const docRef = pendingCol.doc(pi.sku);
            await docRef.set({
              productId: pi.productId,
              sku: pi.sku,
              nombre: pi.nombre,
              pendiente: FieldValue.increment(pi.cantidad),
              ultimaVentaTs: now2,
              ultimaVentaFecha: fecha,
              historico: FieldValue.arrayUnion({
                cantidad: pi.cantidad,
                fecha,
                ventaId: body?.ventaId || '',
                ts: now2,
              }),
            }, { merge: true });
          }
        } catch (pendingErr) {
          console.warn('[API /api/pos/stock] Error registrando stock pendiente:', pendingErr);
        }
      }

      // 5. Parchear caché de la Web en memoria (0 lecturas de Firestore, sin invalidar cachés de Next.js)
      try { patchCatalogMemoryCacheStock(itemsToDeduct); } catch {}

      return NextResponse.json({
        ok: true,
        success: true,
        deductedCount: itemsToDeduct.length,
        pendingItems: pendingItems.length,
        serverTime: Date.now(),
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // MODO 3: RESTORE (Anulación de venta: Transacción ACID Firestore)
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === 'restore') {
      const rawItemsToRestore = items.filter(it => it.id && it.cantidad > 0);
      if (rawItemsToRestore.length === 0) {
        return NextResponse.json({ ok: true, restored: 0 });
      }

      // Consolidar líneas duplicadas del mismo producto (ej. P1 + P2 en la misma venta anulada)
      const mergedRestoreMap = new Map<string, PosStockItem>();
      for (const it of rawItemsToRestore) {
        const key = String(it.id).trim();
        const prev = mergedRestoreMap.get(key);
        if (prev) {
          prev.cantidad += Number(it.cantidad) || 0;
        } else {
          mergedRestoreMap.set(key, { ...it, id: key, cantidad: Number(it.cantidad) || 0 });
        }
      }
      const itemsToRestore = Array.from(mergedRestoreMap.values());

      const docRefs = itemsToRestore.map(it => productsCol.doc(it.id!));
      const restoredMovements: any[] = [];

      await adminDb.runTransaction(async (transaction) => {
        const snaps = await Promise.all(docRefs.map(ref => transaction.get(ref)));
        const now = Date.now();

        for (let i = 0; i < itemsToRestore.length; i++) {
          const it = itemsToRestore[i];
          const snap = snaps[i];
          if (!snap.exists) continue;

          const data = snap.data() || {};
          const currentStock = Number(data.STOCK ?? data.stock ?? 0);
          if (currentStock === UNLIMITED_STOCK) continue;

          const newStock = currentStock + it.cantidad;
          const canonicalSku = String(data.SKU || data.sku || it.sku || snap.id).trim();

          transaction.update(snap.ref, {
            STOCK: newStock,
            stock: newStock,
            soldQuantity: FieldValue.increment(-it.cantidad),
            updatedAt: now,
          });

          restoredMovements.push({
            productId: snap.id,
            sku: canonicalSku,
            nombre: it.nombre || data.NAME || 'Producto',
            prevStock: currentStock,
            postStock: newStock,
            cantidad: it.cantidad,
          });
        }
      });

      // Registrar auditoría de restitución en stock_movements
      try {
        const movementsCol = adminDb.collection('stock_movements');
        const nowMs = Date.now();
        const fechaStr = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
        const horaChile = new Intl.DateTimeFormat('es-CL', {
          timeZone: 'America/Santiago',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true,
        }).format(new Date(nowMs));

        const cajeroStr = body?.cajeroNombre || body?.usuario || 'Sistema POS';
        const rawFolio = body?.boletaNumero && String(body.boletaNumero) !== '0' ? body.boletaNumero : body?.ventaId;
        const folioStr = rawFolio ? (String(rawFolio).startsWith('#') ? rawFolio : `#${rawFolio}`) : '#POS';
        const clienteStr = body?.clienteNombre ? ` · Cliente: ${body.clienteNombre}` : '';
        const movSede = String(body?.sede || 'donbalato-central');
        const motivoStr = body?.motivo ? ` · Motivo: ${body.motivo}` : '';

        for (const mov of restoredMovements) {
          await movementsCol.add({
            productId: mov.productId,
            sku: mov.sku,
            nombre: mov.nombre,
            tipo: 'anulacion',
            stockAnterior: mov.prevStock,
            cantidad: mov.cantidad,
            stockNuevo: mov.postStock,
            pendienteDescontado: 0,
            sede: movSede,
            fecha: fechaStr,
            fechaTs: nowMs,
            fechaHora: horaChile,
            usuario: cajeroStr,
            nota: `Restitución Stock POS Boleta ${folioStr}${clienteStr}${motivoStr}`,
          });
        }
      } catch (movErr) {
        console.warn('[API /api/pos/stock] Error registrando restitución en stock_movements:', movErr);
      }

      // Reducir deuda en stock_pending si correspondía a un déficit
      try {
        const pendingCol = adminDb.collection('stock_pending');
        for (const mov of restoredMovements) {
          if (!mov.sku) continue;
          const pDocRef = pendingCol.doc(mov.sku);
          const pSnap = await pDocRef.get();
          if (pSnap.exists) {
            const pData = pSnap.data() || {};
            const curPendiente = Number(pData.pendiente || 0);
            if (curPendiente > 0) {
              const targetPending = Math.max(0, -mov.postStock);
              const nextPendiente = Math.min(curPendiente, targetPending, Math.max(0, curPendiente - mov.cantidad));
              await pDocRef.update({
                pendiente: nextPendiente,
                limpiadoEnTs: Date.now(),
                nota: `Restitución POS: compensación de ${curPendiente - nextPendiente} uds de deuda por anulación/reversión.`,
              });
            }
          }
        }
      } catch (pendErr) {
        console.warn('[API /api/pos/stock] Error actualizando stock_pending en restore:', pendErr);
      }

      try { restoreCatalogMemoryCacheStock(itemsToRestore); } catch {}

      return NextResponse.json({
        ok: true,
        success: true,
        restoredCount: itemsToRestore.length,
        serverTime: Date.now(),
      });
    }

    return NextResponse.json({ ok: false, error: 'Modo no soportado' }, { status: 400 });
  } catch (error: any) {
    console.error('[API /api/pos/stock] Error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error procesando stock en POS' },
      { status: 500 }
    );
  }
}
