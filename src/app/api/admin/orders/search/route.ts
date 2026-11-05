import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const qParam = request.nextUrl.searchParams.get('q');
    if (!qParam) {
      return NextResponse.json({ orders: [] });
    }

    const raw = qParam.trim();
    // Limpiar '#' si el usuario copió del WhatsApp (#WA-36626974)
    const clean = raw.replace(/^#/, '').trim();
    if (clean.length < 2) {
      return NextResponse.json({ orders: [] });
    }

    const db = getAdminDb();
    const col = db.collection(ORDERS_COLLECTION_ID);
    const resultsMap = new Map<string, any>();

    const addDoc = (docSnap: FirebaseFirestore.DocumentSnapshot) => {
      if (docSnap && docSnap.exists) {
        const data = docSnap.data();
        if (data && !data._seed) {
          resultsMap.set(docSnap.id, {
            $id: docSnap.id,
            $createdAt: data.$createdAt || docSnap.createTime?.toMillis?.()?.toString() || '',
            $updatedAt: data.$updatedAt || docSnap.updateTime?.toMillis?.()?.toString() || '',
            ...data,
          });
        }
      }
    };

    const addSnapshots = (snap: FirebaseFirestore.QuerySnapshot) => {
      if (snap && !snap.empty) {
        snap.forEach(docSnap => addDoc(docSnap));
      }
    };

    const cleanUpper = clean.toUpperCase();
    const cleanLower = clean.toLowerCase();
    const titleCase = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    // 1. Búsqueda directa por ID o ORDERCODE exacto
    const p1 = col.doc(clean).get().then(addDoc).catch(() => {});
    const p2 = col.where('ORDERCODE', '==', cleanUpper).limit(15).get().then(addSnapshots).catch(() => {});
    const p3 = col.where('ORDERCODE', '==', clean).limit(15).get().then(addSnapshots).catch(() => {});

    // 2. Búsqueda por Teléfono
    const digitsOnly = clean.replace(/\D/g, '');
    const phoneQueries = [
      col.where('CUSTOMERPHONE', '==', clean).limit(15).get().then(addSnapshots).catch(() => {}),
    ];
    if (digitsOnly.length >= 8) {
      phoneQueries.push(
        col.where('CUSTOMERPHONE', '==', `+${digitsOnly}`).limit(15).get().then(addSnapshots).catch(() => {}),
        col.where('CUSTOMERPHONE', '==', `+56${digitsOnly.slice(-9)}`).limit(15).get().then(addSnapshots).catch(() => {}),
        col.where('CUSTOMERPHONE', '==', digitsOnly).limit(15).get().then(addSnapshots).catch(() => {})
      );
    }

    // 3. Búsqueda por RUT
    const rutQueries = [
      col.where('CUSTOMERRUT', '==', cleanUpper).limit(15).get().then(addSnapshots).catch(() => {}),
    ];

    // 4. Búsqueda por prefijo de Nombre
    const nameQueries = [
      col.where('CUSTOMERNAME', '>=', cleanUpper).where('CUSTOMERNAME', '<=', cleanUpper + '\uf8ff').limit(25).get().then(addSnapshots).catch(() => {}),
      col.where('CUSTOMERNAME', '>=', titleCase).where('CUSTOMERNAME', '<=', titleCase + '\uf8ff').limit(25).get().then(addSnapshots).catch(() => {}),
      col.where('CUSTOMERNAME', '>=', clean).where('CUSTOMERNAME', '<=', clean + '\uf8ff').limit(25).get().then(addSnapshots).catch(() => {}),
    ];

    await Promise.all([p1, p2, p3, ...phoneQueries, ...rutQueries, ...nameQueries]);

    // 5. Fallback inteligente: Si hay pocos resultados (< 5) y se busca un texto de nombre o apellido
    // (ej: usuario buscó "Ojeda" o "Julio" o parte de la dirección),
    // escaneamos los 300 pedidos más recientes en memoria para buscar coincidencia parcial
    if (resultsMap.size < 5) {
      try {
        const recentSnap = await col.orderBy('CREATEDAT', 'desc').limit(300).get();
        recentSnap.forEach(d => {
          const data = d.data() as any;
          if (!data || data._seed) return;
          const name = (data.CUSTOMERNAME || '').toLowerCase();
          const phone = (data.CUSTOMERPHONE || '').toLowerCase();
          const rut = (data.CUSTOMERRUT || '').toLowerCase();
          const code = (data.ORDERCODE || '').toLowerCase();
          const address = (data.ADDRESS || '').toLowerCase();
          const comuna = (data.COMUNA || '').toLowerCase();
          const vendor = (data.VENDOR_NAME || '').toLowerCase();

          if (
            name.includes(cleanLower) ||
            code.includes(cleanLower) ||
            phone.includes(digitsOnly || cleanLower) ||
            rut.includes(cleanLower) ||
            address.includes(cleanLower) ||
            comuna.includes(cleanLower) ||
            vendor.includes(cleanLower)
          ) {
            addDoc(d);
          }
        });
      } catch (scanErr) {
        console.warn('[search/orders] Fallback scan error:', scanErr);
      }
    }

    const orders = Array.from(resultsMap.values()).sort((a, b) => {
      const ta = Number(a.CREATEDAT || 0);
      const tb = Number(b.CREATEDAT || 0);
      return tb - ta;
    });

    return NextResponse.json({
      success: true,
      query: clean,
      total: orders.length,
      orders,
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('[search/orders] Error searching orders:', error);
    return NextResponse.json({ error: error.message || 'Error en búsqueda' }, { status: 500 });
  }
}
