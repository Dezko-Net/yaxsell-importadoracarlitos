import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';
import { PRODUCTS_COLLECTION } from '@/lib/collections';
import { revalidateTag } from 'next/cache';

export async function POST() {
  try {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection(PRODUCTS_COLLECTION).get();

    const toDelete: FirebaseFirestore.DocumentReference[] = [];
    snapshot.docs.forEach((doc) => {
      const docId = doc.id;
      const data = doc.data();

      // Salvaguarda estricta: jamás tocar productos nativos de donbalato
      if (docId.startsWith('donbalato_')) return;

      const isAppwrite =
        docId.startsWith('aw_') ||
        data.origen === 'appwrite' ||
        data.source === 'appwrite' ||
        data.is_temporary === true ||
        (Array.isArray(data.TAGS) && data.TAGS.includes('Appwrite'));

      if (isAppwrite) {
        toDelete.push(doc.ref);
      }
    });

    if (toDelete.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No hay productos temporales de Appwrite.' });
    }

    let batch = adminDb.batch();
    let opCount = 0;
    let deletedCount = 0;

    for (const ref of toDelete) {
      batch.delete(ref);
      opCount++;
      deletedCount++;

      if (opCount >= 450) {
        await batch.commit();
        batch = adminDb.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    try {
      revalidateTag('products');
    } catch {}

    return NextResponse.json({
      success: true,
      count: deletedCount,
      message: `Se eliminaron ${deletedCount} productos temporales de Appwrite con éxito.`,
    });
  } catch (error: any) {
    console.error('Error al purgar productos de Appwrite:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
