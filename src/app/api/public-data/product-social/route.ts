import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { PRODUCT_QUESTIONS_COLLECTION, REVIEWS_COLLECTION } from '@/lib/db';
import { serverListDocuments } from '@/lib/db-server';

type SocialKind = 'reviews' | 'questions';

function serializeCreatedAt(value: any): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  if (value?.toDate) return value.toDate().toISOString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return '';
}

function getCachedProductSocial(kind: SocialKind, productId: string) {
  const collection = kind === 'reviews' ? REVIEWS_COLLECTION : PRODUCT_QUESTIONS_COLLECTION;
  const orderField = kind === 'reviews' ? 'CREATEDAT' : '$createdAt';

  return unstable_cache(
    async () => {
      const queries = [
        JSON.stringify({ method: 'equal', attribute: 'PRODUCTID', values: [productId] }),
        JSON.stringify({ method: 'limit', values: [50] }),
      ];
      // Las preguntas ordenaban por $createdAt, un campo de metadata que no
      // existe en Firestore. Conservamos su consulta sin orden; las reseñas sí
      // tienen CREATEDAT persistido y admiten orden descendente real.
      if (kind === 'reviews') queries.splice(1, 0, JSON.stringify({ method: 'orderDesc', attribute: orderField }));
      const result = await serverListDocuments(collection, queries);
      return (result.documents || []).map((document: any) => ({
        ...document,
        $createdAt: serializeCreatedAt(document.$createdAt || document.createdAt || document.CREATEDAT),
        $updatedAt: serializeCreatedAt(document.$updatedAt || document.updatedAt),
      }));
    },
    ['public-product-social-v1', kind, productId],
    { revalidate: 300, tags: [`product-social-${kind}-${productId}`] }
  )();
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get('kind');
  const productId = (params.get('productId') || '').trim();

  if ((kind !== 'reviews' && kind !== 'questions') || !productId || productId.length > 150) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  try {
    const documents = await getCachedProductSocial(kind, productId);
    return NextResponse.json({ documents }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error: any) {
    console.error('[API public-data/product-social] Error:', error);
    return NextResponse.json({ error: 'No se pudo cargar la información del producto' }, { status: 500 });
  }
}
