'use client';

import { useEffect, useRef } from 'react';

interface LottieFavoriteProps {
  size?: number;
  className?: string;
}

export default function LottieFavorite({ size = 80, className = '' }: LottieFavoriteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    Promise.all([
      import('lottie-web'),
      fetch('/favorite.json').then(r => r.json())
    ]).then(([lottieModule, data]) => {
      if (destroyed || !containerRef.current) return;

      // Patch all fill colors to pink
      (function patch(obj: any) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) { obj.forEach(patch); return; }
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (k === 'c' && v?.k && Array.isArray(v.k) && v.k.length === 4) {
            v.k = [1, 0.714, 0.757, 1]; // soft pink #ffb6c1
          }
          patch(v);
        }
      })(data);

      // Remove background layers
      if (data.layers) {
        data.layers = data.layers.filter((layer: any) => {
          if (layer.nm && layer.nm.toLowerCase().includes('circle')) return false;
          if (layer.nm && layer.nm.toLowerCase().includes('bg')) return false;
          return true;
        });
        data.layers.forEach((layer: any) => {
          if (layer.hasMask) { delete layer.hasMask; delete layer.masksProperties; }
        });
      }

      const anim = lottieModule.default.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: data,
      });

      anim.setSpeed(0.7);
      animRef.current = anim;
    }).catch(() => {});

    return () => {
      destroyed = true;
      if (animRef.current) { animRef.current.destroy(); animRef.current = null; }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    />
  );
}
