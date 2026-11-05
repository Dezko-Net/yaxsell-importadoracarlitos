'use client';
import dynamic from 'next/dynamic';
import { useTemplate } from '@/context/TemplateContext';

// Spinner reutilizable mientras carga la plantilla activa.
function Loader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #f3f4f6', borderTopColor: '#eab308', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ⚡ Lazy-load: cada plantilla queda en su propio chunk y SOLO se descarga la que
// esté activa (antes se importaban las 17 de golpe y todas pesaban en el bundle).
const TEMPLATES: Record<number, React.ComponentType> = {
  25: dynamic(() => import('@/templates/plantilla25/HomePage'), { loading: Loader, ssr: false }),
  3: dynamic(() => import('@/templates/plantilla3/HomePage'), { loading: Loader, ssr: false }),
};

// Plantilla por defecto para la home (Plantilla 25 - Shopify Concept).
const DEFAULT_LANDING_TEMPLATE = 25;

export default function DynamicHomePage({ children }: { children: React.ReactNode }) {
  const { isLoading, getSectionTemplate } = useTemplate();
  if (isLoading) return <Loader />;

  const template = getSectionTemplate('landing') as number;
  const Tpl = TEMPLATES[template] || TEMPLATES[DEFAULT_LANDING_TEMPLATE];
  if (Tpl) return <Tpl />;
  return <>{children}</>;
}
