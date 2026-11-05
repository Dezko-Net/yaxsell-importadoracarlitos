'use client';

import { useState, useRef, useCallback } from 'react';

interface Props {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export default function ImageZoom({ src, alt, width = 480, height = 480 }: Props) {
  const [zooming, setZooming] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [errored, setErrored] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    setPos({ x, y });
  }, []);

  function handleMove(e: React.MouseEvent) {
    updatePos(e.clientX, e.clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    setZooming(true);
    const t = e.touches[0];
    if (t) updatePos(t.clientX, t.clientY);
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const t = e.touches[0];
    if (t) updatePos(t.clientX, t.clientY);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    setZooming(false);
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setZooming(true)}
      onMouseLeave={() => setZooming(false)}
      onMouseMove={handleMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        cursor: zooming ? 'zoom-in' : 'default',
        background: '#f9f9f9',
        borderRadius: 4,
        touchAction: 'none',
      }}
    >
      {errored ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>💄</div>
      ) : (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: 16,
            boxSizing: 'border-box',
            transform: zooming ? 'scale(2.2)' : 'scale(1)',
            transformOrigin: `${pos.x}% ${pos.y}%`,
            transition: zooming ? 'none' : 'transform 0.3s ease',
          }}
        />
      )}
    </div>
  );
}
