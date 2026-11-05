'use client';

import { useEffect, useRef, useState } from 'react';

interface LottieCartProps {
  size?: number;
  className?: string;
}

export default function LottieCart({ size = 120, className = '' }: LottieCartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    Promise.all([
      import('lottie-web'),
      fetch('/cart.json').then(r => r.json())
    ]).then(([lottieModule, data]) => {
      if (destroyed || !containerRef.current) return;

      // Patch colors to blue (#2563eb del tema → RGB 37,99,235 normalizado)
      (function patch(obj: any) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) { obj.forEach(patch); return; }
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (k === 'c' && v?.k && Array.isArray(v.k) && v.k.length === 4) {
            v.k = [0.145, 0.388, 0.922, 1];
          }
          patch(v);
        }
      })(data);

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
