'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useCuentaBg } from '../CuentaBgContext';

export default function NotificacionesPage() {
  useCuentaBg(''); // clear bg just in case
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth > 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {!isDesktop && (
          <Link href="/cuenta" style={{ color: '#333' }}>
            <ArrowLeft size={24} />
          </Link>
        )}
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>Notificaciones</h1>
      </div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
        <MessageCircle size={48} color="#ccc" style={{ marginBottom: 16 }} />
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#333' }}>No hay notificaciones</h2>
        <p style={{ margin: 0, fontSize: 15, color: '#666', maxWidth: 320, lineHeight: 1.5 }}>
          Te avisaremos por WhatsApp si hay novedades sobre tus pedidos.
        </p>
      </div>
    </div>
  );
}
