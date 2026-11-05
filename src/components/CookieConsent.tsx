'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'cookie_consent';

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Auto-accept cookies — never show the banner
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div role="region" className="andes-snackbar-fixed-element" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10000,
      background: '#fff', borderTop: '1px solid #e0e0e0',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      animation: 'slideUp .3s ease',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#333', lineHeight: 1.5 }}>
            Usamos cookies para mejorar tu experiencia. Consultar más en nuestro{' '}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#3483fa', textDecoration: 'underline', cursor: 'pointer' }}>
              Centro de Privacidad.
            </a>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={accept}
            style={{
              padding: '8px 14px', background: '#3483fa', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2968c8'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#3483fa'}
          >
            Aceptar cookies
          </button>
          <button onClick={() => setShow(false)}
            style={{
              padding: '8px 14px', background: 'transparent', color: '#333',
              border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13,
              fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            Configurar cookies
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
