'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ProductosInner } from '@/app/productos/ProductosInner';

function CategoriaContent() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  if (!id) return null;
  return <ProductosInner lockCategoryId={id} />;
}

export default function CategoriaPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e396bf', fontWeight: 700 }}>
        Cargando categoría...
      </div>
    }>
      <CategoriaContent />
    </Suspense>
  );
}
