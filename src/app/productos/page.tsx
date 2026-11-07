import type { Metadata } from 'next';
import CatalogoClient from './CatalogoClient';
import { getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache';
import { getWebClientConfig } from '@/lib/web-client-config-server';
import { DEFAULT_WEB_CLIENT_CONFIG } from '@/lib/web-client-config';
import { Suspense } from 'react';

// ISR: Cacheado en CDN Edge durante 1 hora. Evita ejecuciones SSR de lambdas
// y llamadas a Firestore en cada visita de usuarios o bots/crawlers.
export const revalidate = 3600;

async function webConfig() { try { return await getWebClientConfig(); } catch { return DEFAULT_WEB_CLIENT_CONFIG; } }

export async function generateMetadata(): Promise<Metadata> {
  const config = await webConfig();
  const title = `Catálogo de productos | ${config.storeName}`;
  const description = config.heroDescription || `Explora el catálogo de ${config.storeName}.`;
  const url = config.siteUrl ? `${config.siteUrl}/productos` : undefined;
  return { title: { absolute: title }, description, alternates: url ? { canonical: url } : undefined,
    icons: config.logoUrl ? { icon: config.logoUrl, apple: config.logoUrl } : undefined,
    openGraph: { title, description, siteName: config.storeName, url, type: 'website' } };
}

async function CatalogSeo() {
  let products: any[] = [];
  const config = await webConfig();
  try {
    const all = (await getCachedAllProducts()) as any[];
    products = all.filter(isMainStoreProduct).slice(0, 24);
  } catch {
    // Si no hay catalogo, igual mostramos la pagina
  }

  return (
      <div style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        <h1>Catálogo de Productos - {config.storeName}</h1>
        <p>
          {config.heroDescription || `Explora el catálogo de ${config.storeName} y encuentra tus favoritos.`}
        </p>
        <ul>
          {products.map(p => (
            <li key={p.$id}>
              <a href={`/productos/${p.$id}`}>{p.NAME}</a>
              {p.BRAND && ` - ${p.BRAND}`}
            </li>
          ))}
        </ul>
      </div>

  );
}

export default function ProductosPage() {
  return <>
    <Suspense fallback={null}><CatalogSeo /></Suspense>
    <CatalogoClient />
  </>;
}

