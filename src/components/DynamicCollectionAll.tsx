'use client';
import { useTemplate } from '@/context/TemplateContext';
import CollectionAllDefault from '@/components/catalog/CollectionAllDefault';
import { Suspense } from 'react';
import { ProductosInner } from '@/app/productos/ProductosInner';

export default function DynamicCollectionAll({ catalogMode, initialBrand }: { catalogMode?: 'retail' | 'paquetes' | 'embalajes'; initialBrand?: string } = {}) {
  const { isLoading } = useTemplate();
  
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #f3f4f6', borderTopColor: '#eab308', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  
  if (initialBrand) {
    return (
      <Suspense fallback={<div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 40, height: 40, border: '3px solid #f3f4f6', borderTopColor: '#eab308', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}>
        <ProductosInner lockBrand={initialBrand} />
      </Suspense>
    );
  }

  return <CollectionAllDefault catalogMode={catalogMode} />;
}
