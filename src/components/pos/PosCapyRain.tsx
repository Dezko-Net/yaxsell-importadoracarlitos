'use client';

import { useEffect, useState } from 'react';
import styles from './pos-capy-rain.module.css';

interface CapyRainDrop {
  id: number;
  kind: 'capy' | 'leaf' | 'yuzu' | 'lotus';
  left: number;
  size: number;
  delay: number;
  fallDuration: number;
  swayDuration: number;
  spinDuration: number;
  swayAmp: number;
  tiltStart: number;
  tiltEnd: number;
  opacity: number;
}

const CAPY_RAIN_DROPS: CapyRainDrop[] = Array.from({ length: 36 }, (_, i) => {
  const kinds: Array<CapyRainDrop['kind']> = ['capy', 'leaf', 'yuzu', 'lotus'];
  const kind = kinds[i % kinds.length];
  const baseLeft = ((i * 97 + 13) % 96) + 2;
  const size =
    kind === 'capy'
      ? 26 + (i % 4) * 3
      : kind === 'yuzu'
      ? 21 + (i % 3) * 3
      : 22 + (i % 4) * 2.5;
  const delay = ((i * 17) % 28) * 0.055;
  const fallDuration = 2.7 + (i % 6) * 0.26;
  const swayDuration = 1.65 + (i % 5) * 0.22;
  const spinDuration = 2.1 + (i % 4) * 0.28;
  const dir = i % 2 === 0 ? 1 : -1;
  const swayAmp = dir * (18 + (i % 4) * 7);
  const tiltStart = dir * (-16 - (i % 3) * 5);
  const tiltEnd = dir * (18 + (i % 4) * 5);
  const opacity = 0.88 + (i % 3) * 0.04;

  return {
    id: i + 1,
    kind,
    left: baseLeft,
    size,
    delay,
    fallDuration,
    swayDuration,
    spinDuration,
    swayAmp,
    tiltStart,
    tiltEnd,
    opacity,
  };
});

function FallingCapyHeadSvg({ id }: { id: number }) {
  const gradId = `rainCapy_${id}`;
  return (
    <svg viewBox="0 0 44 44" className={styles.dropSvg}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dfa974" />
          <stop offset="55%" stopColor="#c48852" />
          <stop offset="100%" stopColor="#9e6636" />
        </linearGradient>
      </defs>
      {/* Yuzu on head */}
      <circle cx="22" cy="9.5" r="5.5" fill="#fb923c" stroke="#7c2d12" strokeWidth="1" />
      <ellipse cx="20.2" cy="7.8" rx="1.8" ry="1.1" fill="#ffedd5" opacity="0.85" />
      <path d="M22 4 C24.5 1.8, 28 2.4, 27.2 5 C25.4 5.8, 23.4 5.2, 22 4 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.8" />
      {/* Ears */}
      <ellipse cx="11.5" cy="16.5" rx="3.8" ry="2.8" transform="rotate(-25 11.5 16.5)" fill="#854d27" stroke="#5c3418" strokeWidth="1" />
      <ellipse cx="32.5" cy="16.5" rx="3.8" ry="2.8" transform="rotate(25 32.5 16.5)" fill="#854d27" stroke="#5c3418" strokeWidth="1" />
      {/* Chubby Capybara Head */}
      <rect x="8" y="13.5" width="28" height="22.5" rx="11" fill={`url(#${gradId})`} stroke="#5c3418" strokeWidth="1.2" />
      {/* Snout patch */}
      <rect x="15.5" y="20" width="13" height="12" rx="6" fill="#935b2e" opacity="0.88" />
      {/* Serene closed eyes */}
      <path d="M11.5 21.5 Q13.2 20.2 15 21.5" fill="none" stroke="#3b1f0b" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M29 21.5 Q30.8 20.2 32.5 21.5" fill="none" stroke="#3b1f0b" strokeWidth="1.5" strokeLinecap="round" />
      {/* Rosy cheeks */}
      <ellipse cx="11.5" cy="25" rx="2.3" ry="1.3" fill="#fb7185" opacity="0.65" />
      <ellipse cx="32.5" cy="25" rx="2.3" ry="1.3" fill="#fb7185" opacity="0.65" />
      {/* Nostrils & mouth */}
      <circle cx="19.6" cy="23.6" r="1.1" fill="#3b1f0b" />
      <circle cx="24.4" cy="23.6" r="1.1" fill="#3b1f0b" />
      <path d="M22 24.8 L22 28 M19.8 28.5 Q22 30.2 24.2 28.5" fill="none" stroke="#3b1f0b" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function FallingMatchaLeafSvg({ id }: { id: number }) {
  const gradId = `rainMatchaLeaf_${id}`;
  return (
    <svg viewBox="0 0 36 36" className={styles.dropSvg}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d9f99d" />
          <stop offset="50%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <path
        d="M6 30 C6 15, 16 6, 30 6 C30 20, 20 30, 6 30 Z"
        fill={`url(#${gradId})`}
        stroke="#166534"
        strokeWidth="1.1"
      />
      <path d="M6 30 Q17 19 28 8" fill="none" stroke="#14532d" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <path d="M13 23 L13 17 M19 17 L19 12 M22 20 L16 20" fill="none" stroke="#14532d" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function FallingYuzuSvg({ id }: { id: number }) {
  const gradId = `rainYuzu_${id}`;
  return (
    <svg viewBox="0 0 36 36" className={styles.dropSvg}>
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </radialGradient>
      </defs>
      <ellipse cx="18" cy="20" rx="12" ry="10.5" fill={`url(#${gradId})`} stroke="#9a3412" strokeWidth="1.1" />
      <ellipse cx="14" cy="16" rx="3.5" ry="2" transform="rotate(-20 14 16)" fill="#ffffff" opacity="0.55" />
      <path d="M18 9.5 C21.5 5, 27 6, 26 10 C23 11.2, 20.2 10.6, 18 9.5 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.9" />
    </svg>
  );
}

function FallingTeaFlowerSvg() {
  return (
    <svg viewBox="0 0 36 36" className={styles.dropSvg}>
      <g stroke="#4d7c5b" strokeWidth="0.9">
        <circle cx="18" cy="10" r="6" fill="#ffffff" />
        <circle cx="25.5" cy="15.5" r="6" fill="#f7fee7" />
        <circle cx="22.8" cy="24.5" r="6" fill="#ffffff" />
        <circle cx="13.2" cy="24.5" r="6" fill="#f7fee7" />
        <circle cx="10.5" cy="15.5" r="6" fill="#ffffff" />
      </g>
      <circle cx="18" cy="18" r="4.2" fill="#facc15" />
      <circle cx="16.8" cy="16.8" r="1.3" fill="#fef9c3" />
    </svg>
  );
}

export default function PosCapyRain({ trigger }: { trigger: number }) {
  const [burstKey, setBurstKey] = useState<number | null>(null);

  useEffect(() => {
    if (!trigger) return;
    setBurstKey(trigger);
    const timer = window.setTimeout(() => {
      setBurstKey(prev => (prev === trigger ? null : prev));
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [trigger]);

  if (burstKey === null) return null;

  return (
    <div key={burstKey} className={styles.rainOverlay} aria-hidden="true">
      {CAPY_RAIN_DROPS.map(drop => (
        <div
          key={drop.id}
          className={styles.fallTrack}
          style={
            {
              left: `${drop.left}%`,
              width: `${drop.size}px`,
              height: `${drop.size}px`,
              animationDelay: `${drop.delay}s`,
              animationDuration: `${drop.fallDuration}s`,
              '--capy-drop-opacity': drop.opacity,
            } as React.CSSProperties
          }
        >
          <div
            className={styles.swayTrack}
            style={
              {
                animationDelay: `${drop.delay}s`,
                animationDuration: `${drop.swayDuration}s`,
                '--capy-sway-amp': `${drop.swayAmp}px`,
              } as React.CSSProperties
            }
          >
            <div
              className={styles.spinTrack}
              style={
                {
                  animationDelay: `${drop.delay}s`,
                  animationDuration: `${drop.spinDuration}s`,
                  '--capy-tilt-start': `${drop.tiltStart}deg`,
                  '--capy-tilt-end': `${drop.tiltEnd}deg`,
                } as React.CSSProperties
              }
            >
              {drop.kind === 'capy' && <FallingCapyHeadSvg id={drop.id} />}
              {drop.kind === 'leaf' && <FallingMatchaLeafSvg id={drop.id} />}
              {drop.kind === 'yuzu' && <FallingYuzuSvg id={drop.id} />}
              {drop.kind === 'lotus' && <FallingTeaFlowerSvg />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
