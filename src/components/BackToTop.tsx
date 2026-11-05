'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronUp } from 'lucide-react';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setVisible(window.scrollY > 400));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchend', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchend', onScroll);
      window.removeEventListener('touchmove', onScroll);
    };
  }, [pathname]);

  // Ocultar en rutas admin, catalogo y linktree
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/catalogo') || pathname?.startsWith('/linktree')) return null;
  if (!visible) return null;

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Cancelar cualquier scroll en curso del theme JS
    try { (window as any).stopScroll?.(); } catch { /* noop */ }
    // Scroll suave — el cargador secuencial del theme evita bloquearlo en móviles
    // mientras se inicializan los componentes de la plantilla
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Doble seguridad: forzar de nuevo en el siguiente frame
    requestAnimationFrame(() => {
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  return (
    <button
      onClick={handleClick}
      onTouchEnd={handleClick}
      aria-label="Volver arriba"
      style={{
        position: 'fixed', bottom: 90, right: 20, zIndex: 70,
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,0.92)', border: '2px solid #ffffff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'opacity .2s, transform .2s',
        opacity: 1,
        transform: 'translateY(0)',
        backdropFilter: 'blur(12px)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      <ChevronUp size={22} color="#000000" />
    </button>
  );
}
