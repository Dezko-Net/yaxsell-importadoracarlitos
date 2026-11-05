import { NextRequest, NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, Query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();

    let deletedCount = 0;
    let errors: string[] = [];
    let batch = 0;

    while (true) {
      batch++;
      const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
        Query.limit(500),
        Query.orderDesc('$createdAt'),
      ]);

      if (res.documents.length === 0) {
        break;
      }

      for (const doc of res.documents) {
        try {
          await databases.deleteDocument(databaseId, PRODUCTS_COLLECTION, doc.$id);
          deletedCount++;
        } catch (err: any) {
          errors.push(`Error borrando ${doc.$id}: ${err.message}`);
        }
      }

      console.log(`[delete-all] Batch ${batch}: ${res.documents.length} procesados, total borrados: ${deletedCount}`);
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      message: `Se borraron ${deletedCount} productos en ${batch} lote(s).`
    });
  } catch (error: any) {
    console.error('Error en borrado masivo:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Error al borrar productos'
    }, { status: 500 });
  }
}
