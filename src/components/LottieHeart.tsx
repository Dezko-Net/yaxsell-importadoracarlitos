'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface LottieHeartProps {
  filled?: boolean;
  size?: number;
  loop?: boolean;
  className?: string;
}

export default function LottieHeart({ filled = false, size = 20, loop = false, className = '' }: LottieHeartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<any>(null);
  const prevFilled = useRef(filled);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    Promise.all([
      import('lottie-web'),
      fetch('/heart.json').then(r => r.json())
    ]).then(([lottieModule, data]) => {
      if (destroyed || !containerRef.current) return;

      (function patch(obj: any) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) { obj.forEach(patch); return; }
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (k === 'c' && v?.k && Array.isArray(v.k) && v.k.length === 4) {
            v.k = [1, 0.714, 0.757, 1];
          }
          patch(v);
        }
      })(data);

      const anim = lottieModule.default.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: loop,
        autoplay: loop,
        animationData: data,
      });

      animRef.current = anim;

      if (loop) {
        anim.setSpeed(0.8);
      } else {
        // Start at last frame so heart is visible when not looping
        anim.goToAndStop(anim.totalFrames - 1, true);
      }
      setReady(true);
    }).catch(() => {});

    return () => {
      destroyed = true;
      if (animRef.current) { animRef.current.destroy(); animRef.current = null; }
    };
  }, [loop]);

  // Animate on filled change (only when not looping)
  useEffect(() => {
    if (loop) return;
    const anim = animRef.current;
    if (!anim || !ready) return;

    if (filled && !prevFilled.current) {
      anim.goToAndPlay(0, true);
      anim.setSpeed(1.3);
    } else if (!filled && prevFilled.current) {
      anim.goToAndStop(anim.totalFrames - 1, true);
    }
    prevFilled.current = filled;
  }, [filled, ready, loop]);

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
        opacity: loop ? 1 : (filled ? 1 : 0.3),
        transition: loop ? 'none' : 'opacity 0.25s ease',
      }}
    />
  );
}
