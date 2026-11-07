'use client';

import { useEffect } from 'react';

/** Mantiene la rueda para desplazarse sin alterar números enfocados. */
export default function NumberInputWheelGuard() {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'number' && document.activeElement === target) {
        target.blur();
      }
    };
    document.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    return () => document.removeEventListener('wheel', handleWheel, true);
  }, []);
  return null;
}
