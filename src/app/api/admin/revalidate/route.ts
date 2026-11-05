import { revalidateTag, revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';

export async function POST(req: NextRequest) {
  try {
    // Limpiar caché en memoria de Node
    clearCatalogMemoryCache();

    // Revalidar las etiquetas globales
    revalidateTag('products');
    revalidateTag('offers');
    revalidateTag('catalog');
    revalidateTag('categories');
    revalidateTag('subcategories');
    revalidateTag('home');     // el home cachea productos/categorías propios
    revalidateTag('settings');
    // Reseñas/preguntas y demás colecciones públicas leídas vía /api/appwrite-proxy
    revalidateTag('appwrite-proxy');

    // Revalidar rutas clave
    try {
      revalidatePath('/productos');
      revalidatePath('/');
    } catch {}

    return NextResponse.json({ revalidated: true, now: Date.now() });
  } catch (err: any) {
    return NextResponse.json({ revalidated: false, message: err.message }, { status: 500 });
  }
}
