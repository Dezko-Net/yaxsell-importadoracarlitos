'use client';
import DynamicCollectionAll from '@/components/DynamicCollectionAll';

export default function ProductosClient({ catalogMode, initialBrand }: { catalogMode?: 'retail' | 'paquetes' | 'embalajes'; initialBrand?: string } = {}) {
  return <DynamicCollectionAll catalogMode={catalogMode} initialBrand={initialBrand} />;
}
