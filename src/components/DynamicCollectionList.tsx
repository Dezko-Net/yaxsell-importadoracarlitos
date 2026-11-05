'use client';
import { useTemplate } from '@/context/TemplateContext';
import CollectionListDefault from '@/components/catalog/CollectionListDefault';

export default function DynamicCollectionList() {
  const { isLoading } = useTemplate();
  
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #f3f4f6', borderTopColor: '#eab308', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  
  return <CollectionListDefault />;
}
