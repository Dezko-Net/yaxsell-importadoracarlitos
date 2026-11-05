import type { MetadataRoute } from 'next';
import { getCachedAllProducts } from '@/lib/catalog-cache';

// 🔍 Sitemap para buscadores — CERO lecturas extra a Appwrite:
// reutiliza la MISMA entrada de caché de 24h del catálogo (tag 'products')
// que ya alimenta /api/public-data/products. El XML en sí también se
// regenera como mucho una vez al día.
export const revalidate = 86400;

const BASE = 'https://yaxsell.cl';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let products: any[] = [];
  try {
    const all = (await getCachedAllProducts()) as any[];
    // Solo productos visibles en la tienda (mismo criterio que el catálogo)
    products = all.filter(p => p.STOCK == null || p.STOCK > 0);
  } catch {
    // Sin catálogo disponible igual entregamos las URLs estáticas
  }

  const productUrls: MetadataRoute.Sitemap = products.map(p => ({
    url: `${BASE}/productos/${p.$id}`,
    lastModified: p.$updatedAt ? new Date(p.$updatedAt) : undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [
    { url: BASE, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/productos`, changeFrequency: 'daily', priority: 0.9 },
    ...productUrls,
  ];
}
