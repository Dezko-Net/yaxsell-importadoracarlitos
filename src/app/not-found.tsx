'use client';

import Link from 'next/link';
import { Home, Search, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', fontFamily: '"Proxima Nova",-apple-system,BlinkMacSystemFont,Arial,sans-serif',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 100, fontWeight: 900, color: '#e5e7eb', lineHeight: 1, marginBottom: 8 }}>404</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#333', margin: '0 0 8px' }}>Página no encontrada</h1>
      <p style={{ fontSize: 15, color: '#888', maxWidth: 400, margin: '0 auto 32px', lineHeight: 1.6 }}>
        Lo sentimos, la página que buscas no existe o fue movida. Prueba volver al inicio o buscar lo que necesitas.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 24px', background: '#3483fa', color: '#fff',
          borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14,
          boxShadow: '0 2px 8px rgba(52,131,250,.3)',
        }}>
          <Home size={16} /> Ir al inicio
        </Link>
        <Link href="/productos" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 24px', background: '#fff', color: '#3483fa',
          borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14,
          border: '1.5px solid #3483fa',
        }}>
          <Search size={16} /> Ver productos
        </Link>
      </div>
    </div>
  );
}
