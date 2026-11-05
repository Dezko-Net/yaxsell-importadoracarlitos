import { revalidateTag, revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';
import { clearHomeMemoryCache } from '@/lib/home-cache';
import { clearCatalogDataCache } from '@/lib/catalog-data-cache';
import { clearSubcategoriesMemoryCache } from '@/lib/subcategories-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get('tag');
  const path = request.nextUrl.searchParams.get('path');
  
  try {
    if (path) {
      revalidatePath(path, 'layout');
    }
    if (tag) {
      revalidateTag(tag);
      // Invalidación selectiva por dominio para no purgar categorías/subcategorías/ofertas innecesariamente
      if (tag === 'products' || tag === 'catalog') {
        clearCatalogMemoryCache(); // Soft invalidation -> activa Server-Side Delta Sync
        clearCatalogDataCache();
        revalidateTag('home');
        revalidateTag('catalog');
        try {
          revalidatePath('/productos');
          revalidatePath('/');
        } catch {}
      } else if (tag === 'home' || tag === 'offers') {
        clearHomeMemoryCache();
        revalidateTag('home');
        try {
          revalidatePath('/');
        } catch {}
      } else if (tag === 'categories' || tag === 'subcategories') {
        clearCatalogDataCache();
        clearSubcategoriesMemoryCache();
        clearHomeMemoryCache();
        revalidateTag('categories');
        revalidateTag('subcategories');
        revalidateTag('catalog');
        revalidateTag('home');
      }
    }
    return NextResponse.json({ revalidated: true, path, tag, now: Date.now() });
  } catch (err) {
    return NextResponse.json({ message: 'Error revalidating' }, { status: 500 });
  }
}
