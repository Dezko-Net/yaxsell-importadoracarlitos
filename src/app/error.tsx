'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const msg = error?.message || '';
    // Silenciar errores conocidos del theme.js (RoarTheme/Pebble/Shopify)
    // que ocurren en páginas sin header del theme (ej. /login, /admin)
    if (msg.includes("classList") || msg.includes("Cannot read properties of null")) {
      // No es un error real — solo un script del theme sin su elemento DOM
      // Intentar recuperar automáticamente
      reset();
      return;
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('[App error details]', {
        type: Object.prototype.toString.call(error),
        name: error?.name || null,
        message: error?.message || '(sin mensaje)',
        digest: error?.digest || null,
        stack: error?.stack || '(sin stack)',
        properties: error && typeof error === 'object' ? Object.keys(error) : [],
      }, error);
    } else {
      console.error('App error:', error);
    }
  }, [error, reset]);

  // Si es error de classList, no mostrar nada (se auto-recupera)
  if (error?.message?.includes("classList") || error?.message?.includes("Cannot read properties of null")) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', padding: '2rem', background: '#0a0a0a' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            Algo sali&oacute; mal
          </h2>
          <p style={{ color: '#888', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
            Se produjo un error inesperado. Intenta recargar la p&aacute;gina.
          </p>
        </div>
        <button
          onClick={reset}
          style={{ padding: '0.75rem 2.5rem', background: '#fff', color: '#000', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', transition: 'opacity 0.2s' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
