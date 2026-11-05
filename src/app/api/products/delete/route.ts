import { NextRequest, NextResponse } from 'next/server';
import { serverDeleteDocument, serverListDocuments } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { name, productId } = await req.json();

    let docId = productId;

    // If no productId, search by name using server API
    if (!docId && name) {
      const result = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
        JSON.stringify({ method: 'equal', attribute: 'NAME', values: [name] }),
      ]);
      if (!result.documents || result.documents.length === 0) {
        return NextResponse.json({ success: false, error: `Producto "${name}" no encontrado` }, { status: 404 });
      }
      docId = (result.documents[0] as any).$id;
    }

    if (!docId) {
      return NextResponse.json({ success: false, error: 'productId o name es requerido' }, { status: 400 });
    }

    await serverDeleteDocument(PRODUCTS_COLLECTION_ID, docId);

    return NextResponse.json({
      success: true,
      message: `Producto eliminado exitosamente`,
    });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al eliminar el producto' },
      { status: 500 }
    );
  }
}
