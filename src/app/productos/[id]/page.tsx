import type { Metadata } from 'next';
import { getCachedAllProducts } from '@/lib/catalog-cache';
import { resolveStorageImageUrl } from '@/lib/product-images';
import ProductDetailClient from './ProductDetailClient';
import { getWebClientConfig } from '@/lib/web-client-config-server';
import { DEFAULT_WEB_CLIENT_CONFIG } from '@/lib/web-client-config';

// 🔍 SEO por producto SIN lecturas extra a Appwrite: el título, la
// descripción, el OG y el JSON-LD salen del catálogo cacheado 24h
// (la misma entrada que usa /api/public-data/products).

async function webConfig() { try { return await getWebClientConfig(); } catch { return DEFAULT_WEB_CLIENT_CONFIG; } }

async function findProduct(id: string): Promise<any | null> {
  try {
    const all = (await getCachedAllProducts()) as any[];
    return all.find(p => p.$id === id) || null;
  } catch {
    return null;
  }
}

function plainText(html: string): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const [p, config] = await Promise.all([findProduct(id), webConfig()]);
  if (!p) {
    return { title: 'Producto', robots: { index: false } };
  }

  const desc = plainText(p.DESCRIPTION || '').slice(0, 160) ||
    `Compra ${p.NAME} en ${config.storeName}.`;
  const img = p.IMAGEURL ? resolveStorageImageUrl(p.IMAGEURL) : undefined;
  const url = config.siteUrl ? `${config.siteUrl}/productos/${encodeURIComponent(p.$id)}` : undefined;

  return {
    title: { absolute: `${p.NAME} | ${config.storeName}` },
    description: desc,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      type: 'website',
      title: p.NAME,
      description: desc,
      url,
      siteName: config.storeName,
      images: img ? [{ url: img }] : undefined,
    },
  };
}

export default async function ProductDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [p, config] = await Promise.all([findProduct(id), webConfig()]);

  // JSON-LD Product para resultados enriquecidos de Google
  const jsonLd = p ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.NAME,
    description: plainText(p.DESCRIPTION || '').slice(0, 300) || p.NAME,
    image: p.IMAGEURL ? [resolveStorageImageUrl(p.IMAGEURL)] : undefined,
    sku: p.SKU || undefined,
    brand: { '@type': 'Brand', name: p.BRAND || config.storeName },
    offers: {
      '@type': 'Offer',
      url: config.siteUrl ? `${config.siteUrl}/productos/${encodeURIComponent(p.$id)}` : undefined,
      priceCurrency: 'CLP',
      price: p.PRICE || 0,
      availability: (p.STOCK == null || p.STOCK > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  } : null;

  return (
    <>
      {jsonLd && (
        // biome-ignore lint: JSON-LD requiere script inline
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductDetailClient />
    </>
  );
}
