'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

function toProxyUrl(originalSrc: string): string {
  // If it's already a proxy URL, return as-is
  if (originalSrc.startsWith('/api/image?url=')) return originalSrc;
  // If it's an external URL, route through proxy
  if (originalSrc.startsWith('http://') || originalSrc.startsWith('https://')) {
    return `/api/image?url=${encodeURIComponent(originalSrc)}`;
  }
  return originalSrc;
}

export default function ImageZoomModal({ src, alt, onClose }: Props) {
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [triedFallback, setTriedFallback] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  const handleError = useCallback(() => {
    // If direct URL fails, try the proxy as fallback
    if (!triedFallback && src && (src.startsWith('http://') || src.startsWith('https://')) && !src.includes('/api/image')) {
      console.warn('[ImageZoomModal] Direct URL failed, trying proxy:', src);
      setTriedFallback(true);
      setCurrentSrc(toProxyUrl(src));
      setLoading(true);
    } else {
      console.error('[ImageZoomModal] Image failed to load:', currentSrc);
      setImgError(true);
    }
  }, [src, currentSrc, triedFallback]);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.92)',
        cursor: 'zoom-out',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {!imgError && (
        <img
          className="iz-zoom-img"
          src={currentSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={handleError}
          onClick={close}
          style={{ opacity: loading ? 0 : 1 }}
        />
      )}

      {loading && !imgError && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'rgba(255,255,255,0.8)', borderRadius: '50%', animation: 'iz-spin 0.8s linear infinite' }} />
          <style>{`@keyframes iz-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {imgError && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px' }}>🖼️</p>
          <p style={{ margin: 0, fontWeight: 600 }}>No se pudo cargar la imagen</p>
          <p style={{ margin: '8px 0 0', fontSize: 11, opacity: 0.5, wordBreak: 'break-all', maxWidth: '80vw' }}>{currentSrc}</p>
        </div>
      )}

      <button
        onClick={e => { e.stopPropagation(); close(); }}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 44, height: 44, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 22,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        ✕
      </button>

      <style>{`
        .iz-zoom-img {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          max-width: 90vw;
          max-height: 80vh;
          object-fit: contain;
          border-radius: 12px;
          transition: opacity 0.2s ease;
        }
        @media (max-width: 480px) {
          .iz-zoom-img {
            max-height: 75vh !important;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
