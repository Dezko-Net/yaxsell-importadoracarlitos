'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const msg = error?.message || '';
    // Silenciar errores conocidos del theme.js (RoarTheme/Pebble/Shopify)
    // que ocurren en páginas sin header (ej. /login, /admin)
    if (msg.includes("classList") || msg.includes("Cannot read properties of null")) {
      // No rompe la página — solo es un script del theme sin su elemento DOM
      return;
    }
    if (
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk')
    ) {
      const key = 'yaxsel_chunk_reload_ts';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - parseInt(last) > 10_000) {
        sessionStorage.setItem(key, now.toString());
        window.location.reload();
        return;
      }
    }
    console.error('Global error:', error);
  }, [error]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#333', marginBottom: '0.5rem' }}>
        Algo salió mal
      </h2>
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
        Se produjo un error inesperado. Intenta recargar la página.
      </p>
      <button
        onClick={reset}
        style={{ padding: '0.75rem 2rem', background: '#db2777', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  );
}
