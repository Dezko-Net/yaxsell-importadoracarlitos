import type { Metadata } from 'next';
import CatalogoClient from './CatalogoClient';
import { getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache';

// ISR: Cacheado en CDN Edge durante 1 hora. Evita ejecuciones SSR de lambdas
// y llamadas a Firestore en cada visita de usuarios o bots/crawlers.
export const revalidate = 3600;

const BASE = 'https://yaxsell.cl';

export const metadata: Metadata = {
  title: 'Catálogo de Productos | Perfumes, Ropa y Más',
  description:
    'Explora el catálogo de Importadora Carlitos: perfumes, ropa y productos para todos los gustos. Compra online en Chile.',
  alternates: { canonical: `${BASE}/productos` },
  openGraph: {
    title: 'Catálogo de Productos | Importadora Carlitos',
    description:
      'Descubre perfumes, ropa y más en el catálogo de Importadora Carlitos.',
    url: `${BASE}/productos`,
    type: 'website',
  },
};

export default async function ProductosPage() {
  let products: any[] = [];
  try {
    const all = (await getCachedAllProducts()) as any[];
    products = all.filter(isMainStoreProduct).slice(0, 24);
  } catch {
    // Si no hay catalogo, igual mostramos la pagina
  }

  return (
    <>
      {/* Contenido estatico para SEO - visible para crawlers y usuarios sin JS */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        <h1>Catálogo de Productos - Importadora Carlitos</h1>
        <p>
          Tienda online de perfumes, ropa y productos para todos los gustos en Chile. Explora el
          catálogo de Importadora Carlitos y encuentra tus favoritos.
        </p>
        <ul>
          {products.map(p => (
            <li key={p.$id}>
              <a href={`${BASE}/productos/${p.$id}`}>{p.NAME}</a>
              {p.BRAND && ` - ${p.BRAND}`}
            </li>
          ))}
        </ul>
      </div>

      {/* Componente interactivo del lado del cliente */}
      <CatalogoClient />
    </>
  );
}

