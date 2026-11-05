import dynamic from 'next/dynamic';

const ProductosPage = dynamic(() => import('../productos/ProductosClient'));

export default function CategoriasPage() {
  return <ProductosPage />;
}
